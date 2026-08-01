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

export function decadeOf(matchDate: string): string {
  const year = Number(matchDate.slice(0, 4));
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}
