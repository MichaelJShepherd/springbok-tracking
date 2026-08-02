import { FixtureRow } from './match-models';

/**
 * Additive model for the pre-match fixture-detail page (docs/design.md §6.2,
 * PRD D37, #95). Extends `FixtureRow` (match-models.ts) rather than editing
 * it — same "extend alongside" lane convention `match-detail-models.ts`
 * already uses for the post-match detail page.
 */
export type FixtureStatus = 'scheduled' | 'postponed' | 'tbd' | 'cancelled';
export type FixtureSource = 'wikipedia' | 'api-sports';

export interface FixtureDetailRow extends FixtureRow {
  opponent_team_id: string;
  status: FixtureStatus;
  source: FixtureSource;
  source_article_url: string | null;
  fetched_at: string;
}

export const FIXTURE_DETAIL_SELECT =
  'id, match_date, kickoff_time, venue, competition, status, source, source_article_url, fetched_at, opponent_team_id, teams:opponent_team_id(canonical_name)';

/**
 * Formats a `fetched_at` timestamptz as a South Africa wall-clock date+time
 * for the D28-style provenance line (docs/design.md §6.2) — e.g. a
 * `fetched_at` of "2026-08-01T10:13:54Z" (UTC) renders as
 * "2026-08-01 12:13 SAST" (Africa/Johannesburg is UTC+2). Mirrors
 * `formatKickoffSAST` (match-models.ts) but includes the date, since a
 * fetch timestamp (unlike a kickoff) is not implicitly "today".
 */
export function formatFetchedAtSAST(fetchedAt: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(fetchedAt));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} SAST`;
}
