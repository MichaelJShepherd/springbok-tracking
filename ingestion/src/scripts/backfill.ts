import { printStubPlan } from '../lib/ingestion-run.js';

// npm run ingest:backfill
//
// Real version (future task): one-off parse of Wikipedia's "List of South
// Africa rugby union test matches" plus each linked match/season article's
// wikitext into `source_snapshots`, then a normalising parser writes
// `teams`/`matches`/`match_officials`/`match_lineups`/`match_events` rows
// (PRD D12, D17). ~650 fetches, serial at <=1 rps (PRD D24).
printStubPlan({
  source: 'wikipedia-backfill',
  description:
    'Would one-off backfill every South Africa test match from Wikipedia wikitext (PRD D12/D17/D24).',
  steps: [
    "Fetch 'List of South Africa rugby union test matches' and each season/match article, serially at <=1 rps.",
    'Store each raw wikitext page in source_snapshots for reproducibility.',
    'Parse each snapshot into teams/matches/match_officials/match_lineups/match_events rows.',
    'Write one ingestion_runs row recording pages_fetched, rows_written and failures (PRD D25).',
  ],
});
