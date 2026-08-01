/**
 * D16 provenance states (docs/prd.md D16, docs/design.md §1.2).
 *
 * Every nullable "fact" field in `matches` carries one of these four states
 * in a companion `<field>_provenance` column. The UI must render each state
 * distinctly rather than treating a missing value as an error:
 *   - present            — show the value normally.
 *   - absent_in_source   — the source genuinely never recorded this fact;
 *                          render a calm "not recorded" note, not an error.
 *   - not_yet_fetched     — backfill hasn't reached this row yet; render a
 *                          subtle loading shimmer, not a scary state.
 *   - fetch_failed        — the source was reachable but the fetch failed;
 *                          render an alarmed "temporarily unavailable" badge.
 */
export type Provenance = 'present' | 'absent_in_source' | 'not_yet_fetched' | 'fetch_failed';
