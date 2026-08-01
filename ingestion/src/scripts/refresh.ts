import { printStubPlan } from '../lib/ingestion-run.js';

// npm run ingest:refresh
//
// Real version (future task): re-fetch the small set of Wikipedia pages
// likely to have changed since the last backfill/refresh (recent matches,
// season-in-progress pages) and re-parse only those, per PRD D17.
printStubPlan({
  source: 'wikipedia-refresh',
  description:
    'Would re-fetch and re-parse recently-changed Wikipedia pages to pick up corrections/new matches.',
  steps: [
    'Determine which match/season pages are plausibly stale (recent matches, in-progress seasons).',
    'Fetch those pages only, serially at <=1 rps, storing fresh source_snapshots.',
    'Re-parse and upsert affected matches/officials/lineups/events rows.',
    'Write one ingestion_runs row (PRD D25); fail loudly on a big completeness drop vs the previous run.',
  ],
});
