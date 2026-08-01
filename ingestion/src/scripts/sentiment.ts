// npm run ingest:sentiment
//
// PRD D2/D4 ladder: Reddit match-thread comments (primary) with Guardian
// headlines as the whole-match fallback, lexicon-scored in memory
// (D20) into `sentiment_scores`. Both live sources are wired but stay
// cleanly OFF until their credentials exist (REDDIT_CLIENT_ID/
// REDDIT_CLIENT_SECRET, GUARDIAN_API_KEY) — no key exists at task #78 time,
// and this task makes no live call to either (AGENTS.md 1.4). The gate is
// `isRedditConfigured()`/`isGuardianConfigured()`, checked before this
// script ever calls `fetchMatchThreadComments`/`fetchMatchArticles` — the
// only two functions in this codebase that reach Reddit/Guardian at all.
//
// D25 adaptation (same precedent as task #79's fixtures-sync): a run where
// *no* sentiment source is configured at all has genuinely nothing to
// score — that is not the "silent thin data" failure D25 exists to catch,
// so it exits 0, logs why, and writes a `success` ingestion_runs row with
// zero rows written instead of failing loudly. The zero-rows-fails check
// still applies once a source *is* configured but a run produces nothing.

import { loadEnvFile } from '../lib/env.js';
loadEnvFile();

import { getSupabaseClient } from '../lib/supabase-client.js';
import { isRedditConfigured, fetchMatchThreadComments } from '../lib/reddit-client.js';
import { isGuardianConfigured, fetchMatchArticles } from '../lib/guardian-client.js';
import { buildRedditRows, buildGuardianRow, type SentimentRow } from '../lib/sentiment-pipeline.js';
import {
  evaluateGuardrail,
  getPreviousRun,
  writeIngestionRun,
  type CompletenessSnapshot,
} from '../lib/ingestion-guardrail.js';

const SOURCE = 'sentiment-ingest';

interface MatchForScoring {
  match_id: string;
  kickoff_time: string | null;
  kickoff_time_provenance: string;
}

function completenessOf(rows: SentimentRow[]): CompletenessSnapshot {
  return {
    totalFields: rows.length,
    presentFields: rows.filter((r) => !r.too_few).length,
  };
}

async function main(): Promise<void> {
  const client = getSupabaseClient();
  const redditOn = isRedditConfigured();
  const guardianOn = isGuardianConfigured();

  if (!redditOn) {
    console.log(
      '[ingest:sentiment] REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET not set — Reddit OFF ' +
        "(PRD D4 primary source stays disabled until task #67 registers OAuth credentials).",
    );
  }
  if (!guardianOn) {
    console.log(
      '[ingest:sentiment] GUARDIAN_API_KEY not set — Guardian OFF ' +
        '(PRD D4 fallback source stays disabled until a key exists).',
    );
  }

  if (!redditOn && !guardianOn) {
    console.log(
      '[ingest:sentiment] no sentiment source configured — nothing to score this run. ' +
        "Exiting cleanly (adapted D25 zero-rows check, same precedent as task #79's fixtures-sync).",
    );
    await writeIngestionRun(client, {
      source: SOURCE,
      pagesFetched: 0,
      rowsWritten: 0,
      failures: 0,
      status: 'success',
      notes: JSON.stringify({ reason: 'no_source_configured', redditConfigured: false, guardianConfigured: false }),
    });
    return;
  }

  const { data: matches, error: matchesError } = await client
    .from('matches')
    .select('match_id, kickoff_time, kickoff_time_provenance');
  if (matchesError) throw new Error(`Failed to read matches: ${matchesError.message}`);

  const rows: SentimentRow[] = [];
  let pagesFetched = 0;
  let failures = 0;

  for (const match of (matches ?? []) as MatchForScoring[]) {
    const kickoffTime =
      match.kickoff_time_provenance === 'present' && match.kickoff_time ? new Date(match.kickoff_time) : null;
    try {
      if (redditOn) {
        // Real run (once a key exists): threadId would come from a documented
        // match->thread lookup (out of this task's scope — no key to test
        // against, so that lookup is a follow-up, not invented here).
        const comments = await fetchMatchThreadComments(match.match_id);
        pagesFetched += 1;
        rows.push(...buildRedditRows(match.match_id, comments, kickoffTime, null));
      } else if (guardianOn) {
        const articles = await fetchMatchArticles(match.match_id, '', '');
        pagesFetched += 1;
        rows.push(buildGuardianRow(match.match_id, articles));
      }
    } catch (err) {
      failures += 1;
      console.error(
        `[ingest:sentiment] failed to score match ${match.match_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await client
      .from('sentiment_scores')
      .upsert(rows, { onConflict: 'match_id,bucket,source' });
    if (upsertError) throw new Error(`Failed to upsert sentiment_scores: ${upsertError.message}`);
  }

  const completeness = completenessOf(rows);
  const previousRun = await getPreviousRun(client, SOURCE);
  let previousCompleteness: CompletenessSnapshot | undefined;
  if (previousRun?.notes) {
    try {
      const parsed = JSON.parse(previousRun.notes);
      if (typeof parsed.totalFields === 'number' && typeof parsed.presentFields === 'number') {
        previousCompleteness = { totalFields: parsed.totalFields, presentFields: parsed.presentFields };
      }
    } catch {
      // Previous run's notes weren't JSON (e.g. the "no source configured" shape) — no baseline.
    }
  }
  const guardrail = evaluateGuardrail(rows.length, completeness, previousCompleteness);

  console.log('[ingest:sentiment] --- run summary ---');
  console.log(`  Reddit: ${redditOn ? 'ON' : 'OFF'} | Guardian: ${guardianOn ? 'ON' : 'OFF'}`);
  console.log(`  matches considered: ${(matches ?? []).length}`);
  console.log(`  sentiment rows written: ${rows.length}`);
  console.log(`  failures: ${failures}`);
  if (!guardrail.passed) {
    console.error(`  D25 guardrail FAILED: ${guardrail.reasons.join('; ')}`);
  } else {
    console.log('  D25 guardrail: passed');
  }

  await writeIngestionRun(client, {
    source: SOURCE,
    pagesFetched,
    rowsWritten: rows.length,
    failures,
    status: guardrail.passed ? 'success' : 'failed',
    notes: JSON.stringify({
      totalFields: completeness.totalFields,
      presentFields: completeness.presentFields,
      redditConfigured: redditOn,
      guardianConfigured: guardianOn,
      guardrailReasons: guardrail.reasons,
    }),
  });

  if (!guardrail.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[ingest:sentiment] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
