// PRD D25 ops guardrail: every ingestion run writes an `ingestion_runs`
// row, and a run that writes zero rows or shows a >20% field-completeness
// drop vs the previous run for the same source must fail loudly (non-zero
// exit + a red row) instead of silently persisting thin data.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompletenessSnapshot {
  /** Total number of provenance-bearing fields sampled across all written rows. */
  totalFields: number;
  /** How many of those fields landed as 'present'. */
  presentFields: number;
}

export function completenessRatio(snapshot: CompletenessSnapshot): number {
  if (snapshot.totalFields === 0) return 0;
  return snapshot.presentFields / snapshot.totalFields;
}

export interface GuardrailResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Applies D25: fail if zero rows were written, or if completeness dropped
 * by more than 20 percentage points of ratio vs the previous run's
 * completeness for this source (when a previous run exists).
 */
export function evaluateGuardrail(
  rowsWritten: number,
  current: CompletenessSnapshot,
  previous: CompletenessSnapshot | undefined,
): GuardrailResult {
  const reasons: string[] = [];

  if (rowsWritten === 0) {
    reasons.push('zero rows written');
  }

  if (previous && previous.totalFields > 0) {
    const previousRatio = completenessRatio(previous);
    const currentRatio = completenessRatio(current);
    const drop = previousRatio - currentRatio;
    if (drop > 0.2) {
      reasons.push(
        `field-completeness dropped from ${(previousRatio * 100).toFixed(1)}% to ` +
          `${(currentRatio * 100).toFixed(1)}% vs the previous run (>20 percentage points)`,
      );
    }
  }

  return { passed: reasons.length === 0, reasons };
}

export interface IngestionRunRecord {
  id: string;
  source: string;
  pagesFetched: number;
  rowsWritten: number;
  failures: number;
  status: 'success' | 'failed';
  notes: string | null;
}

/** Fetches the most recent completed run for a source, to compare completeness against (D25). */
export async function getPreviousRun(
  client: SupabaseClient,
  source: string,
): Promise<{ id: string; notes: string | null } | undefined> {
  const { data, error } = await client
    .from('ingestion_runs')
    .select('id, notes')
    .eq('source', source)
    .neq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed to read previous ingestion_runs row: ${error.message}`);
  return data?.[0];
}

/**
 * Writes the final ingestion_runs row. `notes` should include the
 * completeness ratio (as JSON) so the *next* run can read it back via
 * getPreviousRun for the D25 comparison.
 */
export async function writeIngestionRun(
  client: SupabaseClient,
  record: {
    source: string;
    pagesFetched: number;
    rowsWritten: number;
    failures: number;
    status: 'success' | 'failed';
    notes: string;
  },
): Promise<void> {
  const { error } = await client.from('ingestion_runs').insert({
    source: record.source,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    pages_fetched: record.pagesFetched,
    rows_written: record.rowsWritten,
    failures: record.failures,
    status: record.status,
    notes: record.notes,
  });
  if (error) throw new Error(`Failed to write ingestion_runs row: ${error.message}`);
}
