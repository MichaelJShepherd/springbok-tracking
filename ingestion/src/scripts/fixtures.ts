import { printStubPlan } from '../lib/ingestion-run.js';

// npm run ingest:fixtures
//
// Real version (future task): fetch upcoming Springbok fixtures from
// API-Sports (primary) with the Wikipedia season-article fixtures table as
// documented fallback (PRD D9/D14), writing to the licence-separated
// `fixtures_upstream` table (PRD D15).
printStubPlan({
  source: 'fixtures-sync',
  description:
    'Would fetch upcoming Springbok fixtures from API-Sports (fallback: Wikipedia season page) into fixtures_upstream.',
  steps: [
    'Call the API-Sports fixtures endpoint for the Springboks (free tier, cap 100/day per PRD D24).',
    "On outage, fall back to parsing the current season's Wikipedia fixtures table instead (PRD D9).",
    'Upsert rows into fixtures_upstream, keyed on the API-Sports fixture id where available.',
    'Write one ingestion_runs row (PRD D25).',
  ],
});
