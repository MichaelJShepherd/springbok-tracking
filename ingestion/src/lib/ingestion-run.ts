// Shared helper for the ingest:* stub scripts.
//
// Real (non-stub) ingestion runs must write a row to `ingestion_runs`
// per PRD D25 (a run with zero rows written or a big completeness drop
// fails loudly instead of writing silently thin data). The stubs in this
// task print what a real run *would* do and exit 0 — no network calls, no
// Supabase writes — per AGENTS.md 1.4 (no live fetching in this task).
//
// AGENTS.md 1.4 also requires ingestion to identify itself honestly and
// fetch politely; the descriptive User-Agent every future real fetch must
// send is recorded here so it isn't reinvented per-script.
export const USER_AGENT = 'springbok-tracking (github.com/MichaelJShepherd/springbok-tracking)';

export interface StubPlan {
  source: string;
  description: string;
  steps: string[];
}

/**
 * Prints the plan a real run of this script would follow. Used by every
 * ingest:* stub so their console output has one consistent shape.
 */
export function printStubPlan(plan: StubPlan): void {
  console.log(`[ingestion stub] ${plan.source}`);
  console.log(plan.description);
  console.log(`User-Agent that a real run would send: ${USER_AGENT}`);
  for (const [i, step] of plan.steps.entries()) {
    console.log(`  ${i + 1}. ${step}`);
  }
  console.log('No network calls made, no rows written — stub only (task #73).');
}
