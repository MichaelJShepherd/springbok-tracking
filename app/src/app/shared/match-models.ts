import { Provenance } from './provenance';

/** Shape returned by a `teams:opponent_team_id(canonical_name)` embed. */
export interface TeamRef {
  canonical_name: string;
}

/**
 * A row from `matches` (docs/prd.md §3 / supabase/migrations), joined to its
 * opponent team. Every nullable fact field carries its D16 provenance
 * sibling so the UI can render "not recorded" / loading / "unavailable"
 * instead of a blank cell.
 */
export interface MatchRow {
  match_id: string;
  match_date: string;
  competition: string | null;
  competition_provenance: Provenance;
  venue: string | null;
  venue_provenance: Provenance;
  kickoff_time: string | null;
  kickoff_time_provenance: Provenance;
  springboks_score: number | null;
  springboks_score_provenance: Provenance;
  opponent_score: number | null;
  opponent_score_provenance: Provenance;
  result: 'win' | 'loss' | 'draw' | null;
  source_article_url: string | null;
  teams: TeamRef | null;
}

/**
 * A row from `fixtures_upstream` (API-Sports-derived future fixtures, D14),
 * joined to its opponent team. This table carries no provenance columns —
 * a missing venue/kickoff simply means the source hasn't confirmed it yet.
 */
export interface FixtureRow {
  id: string;
  match_date: string;
  kickoff_time: string | null;
  venue: string | null;
  competition: string | null;
  teams: TeamRef | null;
}

export function opponentName(row: { teams: TeamRef | null }): string {
  return row.teams?.canonical_name ?? 'Unknown opponent';
}

/**
 * Formats a stored kickoff timestamp (UTC ISO, e.g.
 * "2026-08-08T16:00:00+00:00") as South Africa wall-clock time — J1 requires
 * "kickoff in SA time" on the next-fixture card (docs/journeys.md J1). A
 * null/absent kickoff passes through unchanged so callers keep their
 * existing D16 honest states (e.g. the "Kickoff TBD" chip, or field-value's
 * "not recorded") — this helper only ever touches a non-null value.
 */
export function formatKickoffSAST(kickoff: string | null): string | null {
  if (!kickoff) {
    return null;
  }
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(kickoff));
  return `${time} SAST`;
}

export function decadeOf(matchDate: string): string {
  const year = Number(matchDate.slice(0, 4));
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}
