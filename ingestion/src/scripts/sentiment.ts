// npm run ingest:sentiment
//
// PRD D2/D4: Reddit match-thread comments (primary) with Guardian headlines
// as the whole-match fallback, lexicon-scored in memory (D20) into
// `sentiment_scores`. Both live clients (lib/reddit-client.ts,
// lib/guardian-client.ts) are wired but stay cleanly OFF until their
// credentials exist (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET,
// GUARDIAN_API_KEY) — no key exists at task #78 time.
//
// Gate 2 finding (task #78): even once credentials exist, this script must
// NOT call either live client yet, because neither has a real way to build
// its request:
//   - Reddit needs a genuine match -> thread-id lookup. There is no such
//     lookup in this codebase; passing a Wikipedia-style match_id as a
//     Reddit thread id would fire a live OAuth token request plus a
//     garbage-id authenticated GET the moment REDDIT_* is set (rule 1.4 —
//     scraping/API access must never be a config-armed accident).
//   - Guardian needs a real query builder (opponent name + match date
//     window). Passing match_id as the search query with empty date bounds
//     would 400 or silently score unrelated articles as this match's mood.
// So both branches below explicitly refuse to run — logging why — rather
// than inventing request parameters. Wiring the real lookup/query builder,
// and then PRD D4's per-match Reddit-then-Guardian ladder on top of them,
// is follow-up work; implementing the ladder now (against two branches
// that both unconditionally refuse) would just be untested dead code
// (rule 1.3).
//
// D25 adaptation (same precedent as task #79's fixtures-sync): a run that
// cannot safely score anything — whether because no source is configured,
// or because a configured source still lacks its lookup/query builder — is
// not the "silent thin data" failure D25 exists to catch. It exits 0, logs
// exactly why, and writes a `success` ingestion_runs row with zero rows
// written instead of failing loudly.

import { loadEnvFile } from '../lib/env.js';
loadEnvFile();

import { getSupabaseClient } from '../lib/supabase-client.js';
import { isRedditConfigured } from '../lib/reddit-client.js';
import { isGuardianConfigured } from '../lib/guardian-client.js';
import { getPreviousRun, writeIngestionRun } from '../lib/ingestion-guardrail.js';

const SOURCE = 'sentiment-ingest';

async function main(): Promise<void> {
  const client = getSupabaseClient();
  const redditOn = isRedditConfigured();
  const guardianOn = isGuardianConfigured();

  if (!redditOn) {
    console.log(
      '[ingest:sentiment] REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET not set — Reddit OFF ' +
        "(PRD D4 primary source stays disabled until task #67 registers OAuth credentials).",
    );
  } else {
    console.log(
      '[ingest:sentiment] REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET are set, but the Reddit branch refuses to run: ' +
        'no real match->Reddit-thread lookup exists yet. fetchMatchThreadComments() needs a genuine thread id — ' +
        "inventing one from match_id would fire a live OAuth token request plus a garbage-id authenticated GET " +
        '(rule 1.4). Wiring a real lookup is follow-up work; this run does not invent one.',
    );
  }

  if (!guardianOn) {
    console.log(
      '[ingest:sentiment] GUARDIAN_API_KEY not set — Guardian OFF ' +
        '(PRD D4 fallback source stays disabled until a key exists).',
    );
  } else {
    console.log(
      '[ingest:sentiment] GUARDIAN_API_KEY is set, but the Guardian branch refuses to run: no real query builder ' +
        '(opponent name + match date window) exists yet. fetchMatchArticles() needs genuine search parameters — ' +
        "passing match_id as the query with empty date bounds would 400 or score unrelated articles as this " +
        "match's mood (rule 1.4). Wiring a real query builder is follow-up work; this run does not invent one.",
    );
  }

  // PRD D4's per-match ladder (Reddit primary; Guardian fallback when no thread
  // exists for a match or a bucket falls under the volume floor) is deliberately
  // NOT implemented here. Both live branches above refuse to run unconditionally
  // right now, so there is nothing yet for a ladder to choose between — see the
  // module comment above for why, and the follow-up work this leaves.
  console.log(
    '[ingest:sentiment] no sentiment source can safely run this build — nothing to score this run. ' +
      "Exiting cleanly (adapted D25 zero-rows check, same precedent as task #79's fixtures-sync).",
  );

  // Baseline continuity only: read the previous run's notes so a future run —
  // once the lookup/query builder and ladder exist — has something to diff
  // completeness against. This run always writes zero rows (see above), so
  // nothing here can fail the D25 guardrail either way.
  const previousRun = await getPreviousRun(client, SOURCE);
  if (previousRun?.notes) {
    try {
      JSON.parse(previousRun.notes);
    } catch {
      // This script only ever writes JSON.stringify'd notes, so a parse failure
      // here would mean a genuinely malformed row — not the ordinary case, which
      // is valid JSON that simply lacks a `totalFields`/`presentFields` pair
      // (e.g. this very run's own "reason" notes shape below).
    }
  }

  await writeIngestionRun(client, {
    source: SOURCE,
    pagesFetched: 0,
    rowsWritten: 0,
    failures: 0,
    status: 'success',
    notes: JSON.stringify({
      reason:
        redditOn || guardianOn
          ? 'source_configured_but_live_path_not_implemented'
          : 'no_source_configured',
      redditConfigured: redditOn,
      guardianConfigured: guardianOn,
    }),
  });
}

main().catch((err) => {
  console.error('[ingest:sentiment] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
