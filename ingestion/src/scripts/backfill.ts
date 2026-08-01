// npm run ingest:backfill
//
// One-off backfill of Wikipedia's "List of South Africa rugby union test
// matches" into Supabase (PRD D12, D17, D24, D25; docs/field-map.md).
//
// Fetches the list article's wikitext once (politely — a single page, well
// under the 1rps budget), stores the raw wikitext in `source_snapshots`,
// parses every test into `teams` + `matches` rows (D13 identity/normalisation,
// D16 provenance), and writes one `ingestion_runs` row. A run that writes
// zero rows, or whose field-completeness drops more than 20 points vs the
// previous run for this source, exits non-zero instead of landing silently
// thin data (D25).

import { loadEnvFile } from '../lib/env.js';
loadEnvFile();

import { fetchWikitext } from '../lib/wikipedia-client.js';
import { parseListArticle, type ParsedMatch, type Provenance } from '../lib/wiki-list-parser.js';
import { buildMatchRows, collectTeams, SOURCE_ARTICLE_URL, type MatchRow } from '../lib/match-normaliser.js';
import { getSupabaseClient } from '../lib/supabase-client.js';
import {
  evaluateGuardrail,
  getPreviousRun,
  writeIngestionRun,
  type CompletenessSnapshot,
} from '../lib/ingestion-guardrail.js';

const SOURCE = 'wikipedia-backfill';
const PAGE_TITLE = 'List of South Africa rugby union test matches';

function eraOf(matchDate: string): 'pre-1950' | '1950-95' | '1996-2010' | '2011+' {
  const year = Number(matchDate.slice(0, 4));
  if (year < 1950) return 'pre-1950';
  if (year <= 1995) return '1950-95';
  if (year <= 2010) return '1996-2010';
  return '2011+';
}

function computeCompleteness(rows: MatchRow[]): CompletenessSnapshot {
  const provenanceFields: (keyof MatchRow)[] = [
    'competitionProvenance',
    'venueProvenance',
    'kickoffTimeProvenance',
    'springboksScoreProvenance',
    'opponentScoreProvenance',
    'refereeProvenance',
  ];
  let totalFields = 0;
  let presentFields = 0;
  for (const row of rows) {
    for (const field of provenanceFields) {
      totalFields++;
      if ((row[field] as Provenance) === 'present') presentFields++;
    }
  }
  return { totalFields, presentFields };
}

async function main(): Promise<void> {
  console.log(`[ingest:backfill] fetching "${PAGE_TITLE}" from Wikipedia (single page, polite fetch)...`);
  const wikitext = await fetchWikitext(PAGE_TITLE);
  console.log(`[ingest:backfill] fetched ${wikitext.length} chars of wikitext.`);

  const parsed: ParsedMatch[] = parseListArticle(wikitext);
  console.log(`[ingest:backfill] parsed ${parsed.length} match templates from the article.`);

  const { rows, skipped } = buildMatchRows(parsed);
  const teamRows = collectTeams(parsed);

  if (skipped.length > 0) {
    console.warn(
      `[ingest:backfill] ${skipped.length} template(s) could not be identified (missing date or opponent) and were skipped:`,
    );
    for (const s of skipped.slice(0, 10)) {
      console.warn(`  - year ${s.year}, date "${s.matchDateRaw}": ${s.parseErrors.join('; ') || 'unidentified'}`);
    }
  }

  const withParseErrors = rows.filter((r) => r.parseErrors.length > 0);
  if (withParseErrors.length > 0) {
    console.warn(`[ingest:backfill] ${withParseErrors.length} match row(s) have field-level parse errors (see per-field provenance).`);
  }

  const client = getSupabaseClient();

  // 1. Raw wikitext snapshot (D17) — stored before any parsing-dependent write,
  //    so a reproducible receipt exists even if downstream writes fail.
  const { error: snapshotError } = await client.from('source_snapshots').insert({
    source_page: PAGE_TITLE,
    match_id: null,
    wikitext,
  });
  if (snapshotError) throw new Error(`Failed to write source_snapshots row: ${snapshotError.message}`);
  console.log('[ingest:backfill] stored raw wikitext snapshot.');

  // 2. Upsert teams (D13), then map canonical_name -> id.
  let rowsWritten = 0;
  let failures = skipped.length;
  if (teamRows.length > 0) {
    const { error: teamsError } = await client
      .from('teams')
      .upsert(
        teamRows.map((t) => ({ canonical_name: t.canonicalName, aliases: t.aliases })),
        { onConflict: 'canonical_name' },
      );
    if (teamsError) throw new Error(`Failed to upsert teams: ${teamsError.message}`);
  }
  const { data: allTeams, error: teamsFetchError } = await client.from('teams').select('id, canonical_name');
  if (teamsFetchError) throw new Error(`Failed to read back teams: ${teamsFetchError.message}`);
  const teamIdByName = new Map<string, string>((allTeams ?? []).map((t) => [t.canonical_name, t.id]));
  rowsWritten += teamRows.length;

  // 3. Upsert matches (D16 provenance columns).
  interface MatchInsertRow {
    match_id: string;
    match_date: string;
    opponent_team_id: string;
    sequence: number;
    competition: string | null;
    competition_provenance: Provenance;
    venue: string | null;
    venue_provenance: Provenance;
    kickoff_time: string | null;
    kickoff_time_provenance: Provenance;
    home_away: 'home' | 'away' | null;
    springboks_score: number | null;
    springboks_score_provenance: Provenance;
    opponent_score: number | null;
    opponent_score_provenance: Provenance;
    result: 'win' | 'loss' | 'draw' | null;
    source_article_url: string;
  }
  const matchInsertRows: MatchInsertRow[] = [];
  for (const row of rows) {
    const opponentTeamId = teamIdByName.get(row.opponentCanonicalName);
    if (!opponentTeamId) {
      failures++;
      console.warn(`[ingest:backfill] no team id found for opponent "${row.opponentCanonicalName}", skipping match ${row.matchId}`);
      continue;
    }
    matchInsertRows.push({
      match_id: row.matchId,
      match_date: row.matchDate,
      opponent_team_id: opponentTeamId,
      sequence: row.sequence,
      competition: row.competition,
      competition_provenance: row.competitionProvenance,
      venue: row.venue,
      venue_provenance: row.venueProvenance,
      kickoff_time: row.kickoffTime,
      kickoff_time_provenance: row.kickoffTimeProvenance,
      home_away: row.homeAway,
      springboks_score: row.springboksScore,
      springboks_score_provenance: row.springboksScoreProvenance,
      opponent_score: row.opponentScore,
      opponent_score_provenance: row.opponentScoreProvenance,
      result: row.result,
      source_article_url: row.sourceArticleUrl,
    });
  }
  if (matchInsertRows.length > 0) {
    const { error: matchesError } = await client.from('matches').upsert(matchInsertRows, { onConflict: 'match_id' });
    if (matchesError) throw new Error(`Failed to upsert matches: ${matchesError.message}`);
  }
  rowsWritten += matchInsertRows.length;

  // 4. Referee -> match_officials (available straight off the same template).
  const writtenMatchIds = new Set(matchInsertRows.map((m) => m.match_id));
  const officialRows = rows
    .filter((r) => writtenMatchIds.has(r.matchId))
    .map((r) => ({
      match_id: r.matchId,
      role: 'referee' as const,
      name: r.refereeName,
      name_provenance: r.refereeProvenance,
    }));
  if (officialRows.length > 0) {
    // No natural unique key on match_officials beyond (match_id, role) in practice for
    // this dataset (one referee per match here). This backfill is a full rebuild of
    // referee data from this one source, so it clears *all* existing referee rows
    // first (not scoped with a big `.in(match_id, ...)` filter — with ~570 ids that
    // overflows PostgREST's URI length limit) and reinserts, in chunks to keep each
    // request body a sane size.
    const { error: deleteError } = await client.from('match_officials').delete().eq('role', 'referee');
    if (deleteError) throw new Error(`Failed to clear existing referee rows: ${deleteError.message}`);

    const CHUNK_SIZE = 200;
    for (let i = 0; i < officialRows.length; i += CHUNK_SIZE) {
      const chunk = officialRows.slice(i, i + CHUNK_SIZE);
      const { error: officialsError } = await client.from('match_officials').insert(chunk);
      if (officialsError) throw new Error(`Failed to insert match_officials rows: ${officialsError.message}`);
    }
  }
  rowsWritten += officialRows.length;

  // 5. D25 guardrail: compare field-completeness vs the previous backfill run.
  const completeness = computeCompleteness(rows);
  const previousRun = await getPreviousRun(client, SOURCE);
  let previousCompleteness: CompletenessSnapshot | undefined;
  if (previousRun?.notes) {
    try {
      const parsedNotes = JSON.parse(previousRun.notes);
      if (typeof parsedNotes.totalFields === 'number' && typeof parsedNotes.presentFields === 'number') {
        previousCompleteness = { totalFields: parsedNotes.totalFields, presentFields: parsedNotes.presentFields };
      }
    } catch {
      // Previous run's notes weren't JSON (e.g. pre-this-format) — treat as no baseline.
    }
  }
  const guardrail = evaluateGuardrail(rowsWritten, completeness, previousCompleteness);

  const eraCounts = new Map<string, number>();
  for (const row of rows) eraCounts.set(eraOf(row.matchDate), (eraCounts.get(eraOf(row.matchDate)) ?? 0) + 1);

  console.log('[ingest:backfill] --- run summary ---');
  console.log(`  source article: ${SOURCE_ARTICLE_URL}`);
  console.log(`  pages fetched: 1`);
  console.log(`  teams written: ${teamRows.length}`);
  console.log(`  matches written: ${matchInsertRows.length}`);
  console.log(`  match_officials written: ${officialRows.length}`);
  console.log(`  skipped/failed templates: ${failures}`);
  console.log('  matches by era:');
  for (const era of ['pre-1950', '1950-95', '1996-2010', '2011+']) {
    console.log(`    ${era}: ${eraCounts.get(era) ?? 0}`);
  }
  console.log(
    `  field completeness: ${completeness.presentFields}/${completeness.totalFields} ` +
      `(${(completeness.totalFields ? (completeness.presentFields / completeness.totalFields) * 100 : 0).toFixed(1)}%)`,
  );
  if (!guardrail.passed) {
    console.error(`  D25 guardrail FAILED: ${guardrail.reasons.join('; ')}`);
  } else {
    console.log('  D25 guardrail: passed');
  }

  await writeIngestionRun(client, {
    source: SOURCE,
    pagesFetched: 1,
    rowsWritten,
    failures,
    status: guardrail.passed ? 'success' : 'failed',
    notes: JSON.stringify({
      totalFields: completeness.totalFields,
      presentFields: completeness.presentFields,
      eraCounts: Object.fromEntries(eraCounts),
      guardrailReasons: guardrail.reasons,
    }),
  });

  if (!guardrail.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[ingest:backfill] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
