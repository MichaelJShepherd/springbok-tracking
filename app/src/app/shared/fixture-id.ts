import { TeamRef } from './match-models';

/**
 * Derives the `/fixture/:id` route id from a `fixtures_upstream` row
 * (docs/design.md §6.2, PRD D37). Mirrors the `matches` id convention
 * (`ingestion/src/lib/match-normaliser.ts`'s `${date}-${slugify(opponent)}-
 * ${sequence}`) minus the sequence suffix: `fixtures_upstream`'s unique key
 * is `(match_date, opponent_team_id, source)`, not the same-day
 * double-header case the `matches` sequence disambiguates, so there is
 * nothing honest to put in that slot.
 */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugifyOpponent(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function fixtureRouteId(fixture: { match_date: string; teams: TeamRef | null }): string {
  const opponent = fixture.teams?.canonical_name ?? 'unknown-opponent';
  return `${fixture.match_date}-${slugifyOpponent(opponent)}`;
}

/** Splits a route id back into its date and opponent-slug parts, or `null` if it isn't shaped like one. */
export function parseFixtureRouteId(id: string): { matchDate: string; opponentSlug: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(id);
  if (!match) {
    return null;
  }
  return { matchDate: match[1], opponentSlug: match[2] };
}

/**
 * Today's calendar date in South African wall-clock time (Africa/Johannesburg),
 * as `YYYY-MM-DD` — used for the D8 match-day state, which must agree with SA
 * time rather than the visiting fan's own timezone. `clock` is injectable so
 * tests can pin "today" without depending on the machine's real date
 * (AGENTS.md Gate 3: no test may only pass on certain days).
 */
export function todayInSAST(clock: () => Date = () => new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(clock());
}
