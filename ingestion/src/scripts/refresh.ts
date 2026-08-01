// npm run ingest:refresh
//
// Match-detail ingestion (#76, PRD D11/D13/D16/D17): for matches already in
// the DB (from `ingest:backfill`'s list-article parse), resolves a richer
// per-match Wikipedia source (an individual match article for a high-profile
// Test, or the relevant season/tour article otherwise — docs/field-map.md),
// parses lineups (both sides where present), officials beyond the referee,
// and scoring/card events, and writes match_lineups/match_officials/
// match_events with honest D16 provenance. Every fetched page's wikitext is
// snapshotted once (D17). Finishes with one ingestion_runs row (D25).
//
// Scope control (this run is a slice, not the full crawl — see the ticket
// comment for the follow-up full-crawl task):
//   --since=YYYY-MM-DD   only matches on/after this date
//   --match=<match_id>   a single match only
//   --limit=N            cap the candidate match list to N (after --since/--stratified)
//   --stratified=N       pick an ~N-match sample spread evenly across the D29 era buckets

import { loadEnvFile } from '../lib/env.js';
loadEnvFile();

import { fetchWikitext, WikipediaFetchError } from '../lib/wikipedia-client.js';
import {
  findRugbyboxBlocks,
  blockMatchesTarget,
  parseLineups,
  parseAdditionalOfficials,
  parseScoringEvents,
  mergeEventRows,
  rugbyboxReferee,
  type RugbyboxBlock,
  type ResolvedSides,
} from '../lib/rugbybox-parser.js';
import { candidateArticleTitles, isBeforeDetailSourceEra } from '../lib/detail-source-resolver.js';
import { getSupabaseClient } from '../lib/supabase-client.js';
import {
  evaluateGuardrail,
  getPreviousRun,
  writeIngestionRun,
  type CompletenessSnapshot,
} from '../lib/ingestion-guardrail.js';

const SOURCE = 'wikipedia-refresh';

type Era = 'pre-1950' | '1950-95' | '1996-2010' | '2011+';
const ERAS: Era[] = ['pre-1950', '1950-95', '1996-2010', '2011+'];

function eraOf(matchDate: string): Era {
  const year = Number(matchDate.slice(0, 4));
  if (year < 1950) return 'pre-1950';
  if (year <= 1995) return '1950-95';
  if (year <= 2010) return '1996-2010';
  return '2011+';
}

interface Cli {
  since?: string;
  limit?: number;
  match?: string;
  stratified?: number;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {};
  for (const arg of argv) {
    const eq = arg.indexOf('=');
    const key = (eq === -1 ? arg : arg.slice(0, eq)).replace(/^--/, '');
    const value = eq === -1 ? undefined : arg.slice(eq + 1);
    if (key === 'since' && value) cli.since = value;
    else if (key === 'limit' && value) cli.limit = Number(value);
    else if (key === 'match' && value) cli.match = value;
    else if (key === 'stratified' && value) cli.stratified = Number(value);
  }
  return cli;
}

interface CandidateMatch {
  matchId: string;
  matchDate: string;
  opponentCanonicalName: string;
}

/** Picks an evenly-spaced sample of up to `count` matches per D29 era bucket, oldest-first within each. */
function pickStratifiedSample(rows: CandidateMatch[], count: number): CandidateMatch[] {
  const byEra = new Map<Era, CandidateMatch[]>();
  for (const era of ERAS) byEra.set(era, []);
  for (const row of rows) byEra.get(eraOf(row.matchDate))!.push(row);

  const perEra = Math.max(1, Math.floor(count / ERAS.length));
  const picked: CandidateMatch[] = [];
  for (const era of ERAS) {
    const eraRows = byEra.get(era)!;
    const take = Math.min(perEra, eraRows.length);
    for (let i = 0; i < take; i++) {
      const idx = eraRows.length <= take ? i : Math.floor((i * eraRows.length) / take);
      picked.push(eraRows[idx]);
    }
  }
  return picked.slice(0, count);
}

interface MatchDetailOutcome {
  matchId: string;
  era: Era;
  pageTitle: string | undefined;
  lineupsFound: boolean;
  officialsFound: boolean;
  eventsFound: boolean;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const client = getSupabaseClient();

  // 1. Resolve the candidate match list.
  let query = client
    .from('matches')
    .select('match_id, match_date, opponent_team_id')
    .order('match_date', { ascending: true });
  if (cli.match) query = query.eq('match_id', cli.match);
  if (cli.since) query = query.gte('match_date', cli.since);
  const { data: matchRows, error: matchesError } = await query;
  if (matchesError) throw new Error(`Failed to read matches: ${matchesError.message}`);

  const { data: teamRows, error: teamsError } = await client.from('teams').select('id, canonical_name');
  if (teamsError) throw new Error(`Failed to read teams: ${teamsError.message}`);
  const teamNameById = new Map<string, string>((teamRows ?? []).map((t) => [t.id, t.canonical_name]));

  let candidates: CandidateMatch[] = (matchRows ?? []).map((m) => ({
    matchId: m.match_id,
    matchDate: m.match_date,
    opponentCanonicalName: teamNameById.get(m.opponent_team_id) ?? 'Unknown',
  }));

  if (cli.stratified) candidates = pickStratifiedSample(candidates, cli.stratified);
  if (cli.limit) candidates = candidates.slice(0, cli.limit);

  console.log(`[ingest:refresh] ${candidates.length} candidate match(es) selected` + (cli.match ? ` (--match=${cli.match})` : cli.stratified ? ` (--stratified=${cli.stratified})` : cli.since ? ` (--since=${cli.since})` : ''));

  // 2. Fetch pages on demand, once each (a season/tour page covers many matches).
  const pageCache = new Map<string, string>();
  const snapshotted = new Set<string>();
  let pagesFetched = 0;
  let fetchFailures = 0;

  async function getPage(pageTitle: string): Promise<string | undefined> {
    if (pageCache.has(pageTitle)) return pageCache.get(pageTitle);
    try {
      const wikitext = await fetchWikitext(pageTitle);
      pageCache.set(pageTitle, wikitext);
      pagesFetched++;
      return wikitext;
    } catch (err) {
      if (err instanceof WikipediaFetchError) {
        console.warn(`[ingest:refresh] could not fetch "${pageTitle}": ${err.message}`);
        pageCache.set(pageTitle, '');
        fetchFailures++;
        return undefined;
      }
      throw err;
    }
  }

  async function snapshotPage(pageTitle: string, wikitext: string, matchId: string | null): Promise<void> {
    if (snapshotted.has(pageTitle)) return;
    snapshotted.add(pageTitle);
    const { error } = await client.from('source_snapshots').insert({ source_page: pageTitle, match_id: matchId, wikitext });
    if (error) throw new Error(`Failed to write source_snapshots row for "${pageTitle}": ${error.message}`);
  }

  // 3. Per match: find a matching Rugbybox block on the first candidate page that has one.
  let rowsWritten = 0;
  const outcomes: MatchDetailOutcome[] = [];

  for (const candidate of candidates) {
    const era = eraOf(candidate.matchDate);
    if (isBeforeDetailSourceEra(candidate.matchDate)) {
      outcomes.push({ matchId: candidate.matchId, era, pageTitle: undefined, lineupsFound: false, officialsFound: false, eventsFound: false });
      continue;
    }

    let found: { pageTitle: string; block: RugbyboxBlock; sides: ResolvedSides } | undefined;
    for (const pageTitle of candidateArticleTitles(candidate.matchDate, candidate.opponentCanonicalName)) {
      const wikitext = await getPage(pageTitle);
      if (!wikitext) continue;
      await snapshotPage(pageTitle, wikitext, null);
      for (const block of findRugbyboxBlocks(wikitext)) {
        const sides = blockMatchesTarget(block, {
          matchDate: candidate.matchDate,
          opponentCanonicalName: candidate.opponentCanonicalName,
        });
        if (sides) {
          found = { pageTitle, block, sides };
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      outcomes.push({ matchId: candidate.matchId, era, pageTitle: undefined, lineupsFound: false, officialsFound: false, eventsFound: false });
      continue;
    }

    const { pageTitle, block, sides } = found;
    const lineups = parseLineups(block.detailText, sides.homeIsSouthAfrica);
    const additionalOfficials = parseAdditionalOfficials(block.detailText);
    const scoringEvents = parseScoringEvents(block.fields, sides.homeIsSouthAfrica);
    const events = mergeEventRows(scoringEvents, lineups.cardEvents);

    // Lineups: full rebuild for this match (idempotent re-runs).
    await client.from('match_lineups').delete().eq('match_id', candidate.matchId);
    const lineupRows = [
      ...lineups.springboks.map((p) => ({ team_side: 'springboks' as const, ...p })),
      ...lineups.opponent.map((p) => ({ team_side: 'opponent' as const, ...p })),
    ].map((p) => ({
      match_id: candidate.matchId,
      team_side: p.team_side,
      shirt_number: p.shirtNumber,
      player_name: p.playerName,
      player_name_provenance: 'present' as const,
    }));
    if (lineupRows.length > 0) {
      const { error } = await client.from('match_lineups').insert(lineupRows);
      if (error) throw new Error(`Failed to insert match_lineups for ${candidate.matchId}: ${error.message}`);
    }
    rowsWritten += lineupRows.length;

    // Officials beyond the referee: full rebuild of those roles only (leave the existing referee row alone).
    await client.from('match_officials').delete().eq('match_id', candidate.matchId).neq('role', 'referee');
    const officialRows = additionalOfficials.map((o) => ({
      match_id: candidate.matchId,
      role: o.role,
      name: o.name,
      name_provenance: 'present' as const,
    }));
    if (officialRows.length > 0) {
      const { error } = await client.from('match_officials').insert(officialRows);
      if (error) throw new Error(`Failed to insert match_officials for ${candidate.matchId}: ${error.message}`);
    }
    rowsWritten += officialRows.length;

    // Referee: only fill in if the existing row from the list-article backfill was absent — never overwrite a present value.
    const detailReferee = rugbyboxReferee(block.fields);
    if (detailReferee.name) {
      const { data: existingReferee, error: refError } = await client
        .from('match_officials')
        .select('id, name_provenance')
        .eq('match_id', candidate.matchId)
        .eq('role', 'referee')
        .limit(1);
      if (refError) throw new Error(`Failed to read existing referee row for ${candidate.matchId}: ${refError.message}`);
      const existing = existingReferee?.[0];
      if (existing && existing.name_provenance !== 'present') {
        const { error: updateError } = await client
          .from('match_officials')
          .update({ name: detailReferee.name, name_provenance: 'present' })
          .eq('id', existing.id);
        if (updateError) throw new Error(`Failed to update referee for ${candidate.matchId}: ${updateError.message}`);
      }
    }

    // Events: full rebuild for this match.
    await client.from('match_events').delete().eq('match_id', candidate.matchId);
    const eventRows = events.map((e) => ({
      match_id: candidate.matchId,
      sequence_no: e.sequenceNo,
      event_type: e.eventType,
      team_side: e.teamSide,
      description: e.description,
      description_provenance: e.descriptionProvenance,
      minute: e.minute,
      minute_provenance: e.minuteProvenance,
    }));
    if (eventRows.length > 0) {
      const { error } = await client.from('match_events').insert(eventRows);
      if (error) throw new Error(`Failed to insert match_events for ${candidate.matchId}: ${error.message}`);
    }
    rowsWritten += eventRows.length;

    outcomes.push({
      matchId: candidate.matchId,
      era,
      pageTitle,
      lineupsFound: lineupRows.length > 0,
      officialsFound: officialRows.length > 0,
      eventsFound: eventRows.length > 0,
    });
  }

  // 4. D25 guardrail: "completeness" here = the fraction of attempted (era-eligible) matches
  // that yielded at least one lineup/officials/events row — the row-based analogue of the
  // column-provenance completeness ratio the backfill script uses.
  const matchDateById = new Map(candidates.map((c) => [c.matchId, c.matchDate]));
  const attempted = outcomes.filter((o) => !isBeforeDetailSourceEra(matchDateById.get(o.matchId)!));
  let totalFields = 0;
  let presentFields = 0;
  for (const o of attempted) {
    totalFields += 3;
    if (o.lineupsFound) presentFields++;
    if (o.officialsFound) presentFields++;
    if (o.eventsFound) presentFields++;
  }
  const completeness: CompletenessSnapshot = { totalFields, presentFields };

  const previousRun = await getPreviousRun(client, SOURCE);
  let previousCompleteness: CompletenessSnapshot | undefined;
  if (previousRun?.notes) {
    try {
      const parsed = JSON.parse(previousRun.notes);
      if (typeof parsed.totalFields === 'number' && typeof parsed.presentFields === 'number') {
        previousCompleteness = { totalFields: parsed.totalFields, presentFields: parsed.presentFields };
      }
    } catch {
      // pre-this-format notes — no baseline.
    }
  }
  const guardrail = evaluateGuardrail(rowsWritten, completeness, previousCompleteness);

  // 5. Per-era summary (pasted on the ticket per the verification requirement).
  console.log('[ingest:refresh] --- run summary ---');
  console.log(`  candidate matches: ${candidates.length}`);
  console.log(`  pages fetched: ${pagesFetched} (fetch failures: ${fetchFailures})`);
  console.log(`  rows written: ${rowsWritten}`);
  console.log('  per-era coverage (found / attempted):');
  for (const era of ERAS) {
    const eraOutcomes = outcomes.filter((o) => o.era === era);
    const eraAttempted = eraOutcomes.filter((o) => !isBeforeDetailSourceEra(matchDateById.get(o.matchId)!));
    const lineups = eraOutcomes.filter((o) => o.lineupsFound).length;
    const officials = eraOutcomes.filter((o) => o.officialsFound).length;
    const events = eraOutcomes.filter((o) => o.eventsFound).length;
    console.log(
      `    ${era}: ${eraOutcomes.length} matches (${eraAttempted.length} attempted) — lineups ${lineups}, officials ${officials}, events ${events}`,
    );
  }
  console.log(
    `  field completeness (row-presence basis): ${completeness.presentFields}/${completeness.totalFields} ` +
      `(${(completeness.totalFields ? (completeness.presentFields / completeness.totalFields) * 100 : 0).toFixed(1)}%)`,
  );
  if (!guardrail.passed) {
    console.error(`  D25 guardrail FAILED: ${guardrail.reasons.join('; ')}`);
  } else {
    console.log('  D25 guardrail: passed');
  }
  for (const o of outcomes) {
    console.log(
      `    ${o.matchId} [${o.era}]: source=${o.pageTitle ?? 'none found'} lineups=${o.lineupsFound} officials=${o.officialsFound} events=${o.eventsFound}`,
    );
  }

  await writeIngestionRun(client, {
    source: SOURCE,
    pagesFetched,
    rowsWritten,
    failures: fetchFailures,
    status: guardrail.passed ? 'success' : 'failed',
    notes: JSON.stringify({
      totalFields: completeness.totalFields,
      presentFields: completeness.presentFields,
      candidateCount: candidates.length,
      guardrailReasons: guardrail.reasons,
    }),
  });

  if (!guardrail.passed) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[ingest:refresh] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
