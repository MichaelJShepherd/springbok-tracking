// npm run ingest:fixtures
//
// PRD D9 ladder: API-Sports (primary, once API_SPORTS_KEY exists) with
// Wikipedia season-article fixtures as the documented, working-today
// fallback (task #79). fixtures_upstream stays licence-separated per D15
// (`source` column: 'wikipedia' rows carry their source article URL and
// CC BY-SA obligations; 'api-sports' rows carry D28's provenance note
// instead). Every nullable-completeness field feeds the same D25 ops
// guardrail the other ingest:* scripts use.

import { loadEnvFile } from '../lib/env.js';
loadEnvFile();

import { fetchCandidateSeasonArticles } from '../lib/wiki-season-discovery.js';
import { parseSeasonArticleFixtures, type ParsedFixture } from '../lib/wiki-fixtures-parser.js';
import { isApiSportsConfigured, fetchUpcomingFixtures, type ApiSportsFixture } from '../lib/api-sports-client.js';
import { getSupabaseClient } from '../lib/supabase-client.js';
import {
  evaluateGuardrail,
  getPreviousRun,
  writeIngestionRun,
  type CompletenessSnapshot,
} from '../lib/ingestion-guardrail.js';

const SOURCE = 'fixtures-sync';

interface FixtureRow {
  matchDate: string;
  opponentCanonicalName: string;
  kickoffTime: string | null;
  venue: string | null;
  competition: string | null;
  status: 'scheduled' | 'postponed' | 'tbd' | 'cancelled';
  source: 'wikipedia' | 'api-sports';
  sourceArticleUrl: string | null;
  apiSportsFixtureId: string | null;
}

function wikiFixtureToRow(f: ParsedFixture): FixtureRow {
  return {
    matchDate: f.matchDate,
    opponentCanonicalName: f.opponentName,
    kickoffTime: f.kickoffTime,
    venue: f.venue,
    competition: null, // absent_in_source equivalent: no field carries this in either source article (docs/field-map.md).
    status: f.status,
    source: 'wikipedia',
    sourceArticleUrl: f.sourceArticleUrl,
    apiSportsFixtureId: null,
  };
}

function apiFixtureToRow(f: ApiSportsFixture): FixtureRow {
  return {
    matchDate: f.matchDate,
    opponentCanonicalName: f.opponentName,
    kickoffTime: f.kickoffTime,
    venue: f.venue,
    competition: f.competition,
    status: f.status,
    source: 'api-sports',
    sourceArticleUrl: null,
    apiSportsFixtureId: f.apiSportsFixtureId,
  };
}

function computeCompleteness(rows: FixtureRow[]): CompletenessSnapshot {
  let totalFields = 0;
  let presentFields = 0;
  for (const row of rows) {
    totalFields += 2;
    if (row.kickoffTime) presentFields += 1;
    if (row.venue) presentFields += 1;
  }
  return { totalFields, presentFields };
}

async function main(): Promise<void> {
  const year = new Date().getUTCFullYear();
  const client = getSupabaseClient();

  let apiRows: FixtureRow[] = [];
  if (isApiSportsConfigured()) {
    console.log('[ingest:fixtures] API_SPORTS_KEY present — fetching from API-Sports (primary per D9)...');
    const apiFixtures = await fetchUpcomingFixtures();
    apiRows = apiFixtures.map(apiFixtureToRow);
    console.log(`[ingest:fixtures] API-Sports returned ${apiRows.length} Springboks fixture(s).`);
  } else {
    console.log(
      '[ingest:fixtures] API_SPORTS_KEY not set — API-Sports OFF, skipped. Falling back to Wikipedia season articles (PRD D9).',
    );
  }

  console.log(`[ingest:fixtures] discovering ${year} Wikipedia season/tour articles...`);
  const seasonArticles = await fetchCandidateSeasonArticles(year);

  const wikiRows: FixtureRow[] = [];
  let pagesFetched = 0;
  let notApplicableTotal = 0;
  let parseErrorTotal = 0;

  for (const article of seasonArticles) {
    if (!article.wikitext) {
      console.log(`  - "${article.title}": not found, skipped (${article.skippedReason})`);
      continue;
    }
    pagesFetched += 1;
    const sourceArticleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`;
    const { fixtures, notApplicable } = parseSeasonArticleFixtures(article.wikitext, sourceArticleUrl);
    console.log(
      `  - "${article.title}": ${fixtures.length} upcoming Springboks fixture(s) found (${notApplicable.length} other block(s) not applicable)`,
    );
    notApplicableTotal += notApplicable.length;
    for (const f of fixtures) {
      if (f.parseErrors.length > 0) parseErrorTotal += 1;
      wikiRows.push(wikiFixtureToRow(f));
    }

    // Snapshot per D17 (reproducible parses) — same discipline as
    // ingest:backfill, so a restructured season article is diffable too.
    const { error: snapshotError } = await client.from('source_snapshots').insert({
      source_page: article.title,
      match_id: null,
      wikitext: article.wikitext,
    });
    if (snapshotError) {
      throw new Error(`Failed to write source_snapshots row for "${article.title}": ${snapshotError.message}`);
    }
  }

  // API-Sports takes precedence over Wikipedia for the same (date, opponent)
  // pair per D14 — drop the Wikipedia row rather than writing both when both
  // exist for the same fixture.
  const apiKeys = new Set(apiRows.map((r) => `${r.matchDate}|${r.opponentCanonicalName}`));
  const dedupedWikiRows = wikiRows.filter((r) => !apiKeys.has(`${r.matchDate}|${r.opponentCanonicalName}`));
  const droppedForApiPrecedence = wikiRows.length - dedupedWikiRows.length;
  if (droppedForApiPrecedence > 0) {
    console.log(
      `[ingest:fixtures] ${droppedForApiPrecedence} Wikipedia row(s) dropped in favour of an API-Sports row for the same fixture (D14 precedence).`,
    );
  }

  const rows = [...apiRows, ...dedupedWikiRows];

  // Upsert the opponent teams first (fixtures can name an opponent the
  // backfill/refresh scripts haven't written yet, e.g. a brand-new tourist side).
  const opponentNames = [...new Set(rows.map((r) => r.opponentCanonicalName))];
  if (opponentNames.length > 0) {
    const { error: teamsError } = await client
      .from('teams')
      .upsert(
        opponentNames.map((canonical_name) => ({ canonical_name })),
        { onConflict: 'canonical_name', ignoreDuplicates: true },
      );
    if (teamsError) throw new Error(`Failed to upsert teams: ${teamsError.message}`);
  }
  const { data: allTeams, error: teamsFetchError } = await client.from('teams').select('id, canonical_name');
  if (teamsFetchError) throw new Error(`Failed to read back teams: ${teamsFetchError.message}`);
  const teamIdByName = new Map<string, string>((allTeams ?? []).map((t) => [t.canonical_name, t.id]));

  interface FixtureInsertRow {
    match_date: string;
    opponent_team_id: string;
    kickoff_time: string | null;
    venue: string | null;
    competition: string | null;
    status: FixtureRow['status'];
    source: FixtureRow['source'];
    source_article_url: string | null;
    api_sports_fixture_id: string | null;
  }
  const insertRows: FixtureInsertRow[] = [];
  let failures = parseErrorTotal;
  for (const row of rows) {
    const opponentTeamId = teamIdByName.get(row.opponentCanonicalName);
    if (!opponentTeamId) {
      failures += 1;
      console.warn(`[ingest:fixtures] no team id found for opponent "${row.opponentCanonicalName}", skipping`);
      continue;
    }
    insertRows.push({
      match_date: row.matchDate,
      opponent_team_id: opponentTeamId,
      kickoff_time: row.kickoffTime,
      venue: row.venue,
      competition: row.competition,
      status: row.status,
      source: row.source,
      source_article_url: row.sourceArticleUrl,
      api_sports_fixture_id: row.apiSportsFixtureId,
    });
  }

  if (insertRows.length > 0) {
    const { error: upsertError } = await client
      .from('fixtures_upstream')
      .upsert(insertRows, { onConflict: 'match_date,opponent_team_id,source' });
    if (upsertError) throw new Error(`Failed to upsert fixtures_upstream: ${upsertError.message}`);
  }

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
      // Previous run's notes weren't JSON — treat as no baseline.
    }
  }
  const guardrail = evaluateGuardrail(insertRows.length, completeness, previousCompleteness);

  console.log('[ingest:fixtures] --- run summary ---');
  console.log(`  API-Sports: ${isApiSportsConfigured() ? `ON, ${apiRows.length} fixture(s)` : 'OFF (no API_SPORTS_KEY)'}`);
  console.log(`  Wikipedia season articles fetched: ${pagesFetched}`);
  console.log(`  Wikipedia blocks not applicable (wrong team/already played/unparseable): ${notApplicableTotal}`);
  console.log(`  fixtures written: ${insertRows.length}`);
  for (const row of insertRows) {
    console.log(
      `    - ${row.match_date} vs opponent ${row.opponent_team_id} | kickoff=${row.kickoff_time ?? 'unknown'} | status=${row.status} | source=${row.source}`,
    );
  }
  console.log(`  failures: ${failures}`);
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
    pagesFetched,
    rowsWritten: insertRows.length,
    failures,
    status: guardrail.passed ? 'success' : 'failed',
    notes: JSON.stringify({
      totalFields: completeness.totalFields,
      presentFields: completeness.presentFields,
      apiSportsConfigured: isApiSportsConfigured(),
      guardrailReasons: guardrail.reasons,
    }),
  });

  if (!guardrail.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[ingest:fixtures] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
