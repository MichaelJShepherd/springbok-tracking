import { fixtureRouteId, parseFixtureRouteId, slugifyOpponent, todayInSAST } from './fixture-id';

describe('fixtureRouteId / parseFixtureRouteId (docs/design.md §6.2, PRD D37)', () => {
  it('derives a route id mirroring the matches id convention, minus the sequence suffix', () => {
    const fixture = { match_date: '2026-08-22', teams: { canonical_name: 'New Zealand' } };
    expect(fixtureRouteId(fixture)).toBe('2026-08-22-new-zealand');
  });

  it('round-trips through parseFixtureRouteId', () => {
    const parsed = parseFixtureRouteId('2026-08-22-new-zealand');
    expect(parsed).toEqual({ matchDate: '2026-08-22', opponentSlug: 'new-zealand' });
  });

  it('returns null for an id that is not shaped like a fixture route id', () => {
    expect(parseFixtureRouteId('not-a-date')).toBeNull();
    expect(parseFixtureRouteId('2026-08-22')).toBeNull();
  });

  it('slugifies multi-word and diacritic opponent names the same shape ingestion produces (not enforced across the package boundary — see the comment)', () => {
    // The app and ingestion packages don't share this function, so nothing
    // guarantees byte-identical output across the boundary — this test only
    // pins this function's own, independently-reasonable slug shape (lowercase,
    // hyphenated, diacritics stripped), which happens to look like
    // ingestion's `match-normaliser.ts` slugify because both solve the same
    // small problem the same obvious way, not because one enforces the other.
    expect(slugifyOpponent('British & Irish Lions')).toBe('british-irish-lions');
    expect(slugifyOpponent('Côte d’Ivoire')).toBe('cote-d-ivoire');
  });

  it('falls back to a placeholder opponent slug when the team join is missing, rather than throwing', () => {
    const fixture = { match_date: '2026-08-22', teams: null };
    expect(fixtureRouteId(fixture)).toBe('2026-08-22-unknown-opponent');
  });
});

describe('todayInSAST (docs/design.md §6.2 — match-day D8 state)', () => {
  it('computes the SAST calendar date, not the machine local date, from an injected clock', () => {
    // UTC 2026-08-21T23:30:00Z is already 2026-08-22 01:30 in Africa/Johannesburg
    // (UTC+2) — a naive `.toISOString().slice(0,10)` on this instant would
    // wrongly report 2026-08-21. This is exactly the boundary case that
    // proves the function is timezone-aware rather than using the host's
    // local date or a bare UTC slice.
    const clock = () => new Date('2026-08-21T23:30:00Z');
    expect(todayInSAST(clock)).toBe('2026-08-22');
  });

  it('accepts an injected clock so the result never depends on the day the test happens to run', () => {
    const clock = () => new Date('2000-01-01T10:00:00Z');
    expect(todayInSAST(clock)).toBe('2000-01-01');
  });
});
