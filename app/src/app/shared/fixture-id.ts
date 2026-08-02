import { TeamRef } from './match-models';

/**
 * Derives the `/fixture/:id` route id from a `fixtures_upstream` row
 * (docs/design.md §6.2, PRD D37). Mirrors the `matches` id convention
 * (`ingestion/src/lib/match-normaliser.ts`'s `${date}-${slugify(opponent)}-
 * ${sequence}`) minus the sequence suffix — but honestly, not because a
 * (date, opponent) pair identifies one `fixtures_upstream` row the way it
 * would for `matches`. It does not: `fixtures_upstream`'s unique key is
 * `(match_date, opponent_team_id, source)`, so a Wikipedia row and an
 * API-Sports row for the *same* date/opponent can legitimately coexist
 * side by side (D14) until one source's fetch overtakes the other. The
 * route id therefore identifies a *fixture*, not a single row — the caller
 * (`FixtureDetail.load`) queries by date, filters the results down to the
 * matching opponent slug, and only then applies the D14 source
 * precedence tie-break (see `PREFERRED_FIXTURE_SOURCE` in
 * `pages/fixture-detail/fixture-detail.ts`) to pick which row displays.
 * No sequence suffix is added because there is no same-day double-header
 * case here to disambiguate the way `matches`' sequence does.
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
 *
 * Built from `formatToParts` rather than relying on the `en-CA` locale
 * happening to format as `YYYY-MM-DD` (a formatting convention, not a
 * contract) — the same technique `formatFetchedAtSAST` uses.
 */
export function todayInSAST(clock: () => Date = () => new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(clock());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
