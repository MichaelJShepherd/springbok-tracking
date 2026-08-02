import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';
import { SupabaseService } from '../../core/supabase.service';
import {
  createSupabaseStub,
  createUnreachableSupabaseStub,
  QueryMatcher,
} from '../../shared/testing/supabase-stub';

const NO_FIXTURES: QueryMatcher = {
  table: 'fixtures_upstream',
  match: () => true,
  result: { data: [], error: null },
};

const NO_LIVE_MATCH: QueryMatcher = {
  table: 'matches',
  match: (calls) => calls.some((c) => c.method === 'is'),
  result: { data: null, error: null },
};

function latestResultMatcher(row: unknown): QueryMatcher {
  return {
    table: 'matches',
    match: (calls) => calls.some((c) => c.method === 'not'),
    result: { data: row, error: null },
  };
}

function formGuideMatcher(rows: unknown[] = []): QueryMatcher {
  return {
    table: 'matches',
    match: (calls) => calls.some((c) => c.method === 'lte'),
    result: { data: rows, error: null },
  };
}

const FORM_GUIDE_ROW = (overrides: Record<string, unknown> = {}) => ({
  match_id: '2026-07-04-england-1',
  match_date: '2026-07-04',
  competition: 'Test Series',
  competition_provenance: 'present',
  venue: 'Twickenham',
  venue_provenance: 'present',
  kickoff_time: null,
  kickoff_time_provenance: 'not_yet_fetched',
  springboks_score: 45,
  springboks_score_provenance: 'present',
  opponent_score: 21,
  opponent_score_provenance: 'present',
  result: 'win',
  source_article_url: null,
  teams: { canonical_name: 'England' },
  ...overrides,
});

async function renderWith(matchers: QueryMatcher[]): Promise<{
  component: Home;
  fixture: ComponentFixture<Home>;
  html: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [Home],
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: createSupabaseStub(matchers) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Home);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { component, fixture, html: fixture.nativeElement as HTMLElement };
}

describe('Home', () => {
  it('off-season: shows the last result only, with no next-fixture or next-window text', async () => {
    const lastResult = {
      match_id: '2015-10-24-new-zealand-1',
      match_date: '2015-10-24',
      competition: 'Rugby World Cup Semi-Final',
      competition_provenance: 'present',
      venue: 'Twickenham Stadium, London',
      venue_provenance: 'present',
      kickoff_time: null,
      kickoff_time_provenance: 'not_yet_fetched',
      springboks_score: 18,
      springboks_score_provenance: 'present',
      opponent_score: 20,
      opponent_score_provenance: 'present',
      result: 'loss',
      source_article_url: null,
      teams: { canonical_name: 'New Zealand' },
    };

    const { html } = await renderWith([
      NO_FIXTURES,
      NO_LIVE_MATCH,
      latestResultMatcher(lastResult),
      formGuideMatcher(),
    ]);

    const offSeason = html.querySelector('[data-testid="off-season"]');
    expect(offSeason?.textContent).toContain('No test scheduled');
    expect(offSeason?.textContent).toContain('Last result: South Africa 18–20 New Zealand');

    // The off-season card must never show a predictive "next window" note
    // (PRD D30) — there is no source for it.
    expect(html.textContent).not.toContain('next window');
    expect(html.querySelector('[data-testid="fixture-chips"]')).toBeNull();
    expect(html.querySelector('[data-testid="match-under-way"]')).toBeNull();
  });

  it('renders the latest result score/competition per their own D16 provenance, never a blank dash', async () => {
    const lastResult = {
      match_id: '2026-05-01-wales-1',
      match_date: '2026-05-01',
      competition: null,
      competition_provenance: 'fetch_failed',
      venue: 'Principality Stadium, Cardiff',
      venue_provenance: 'present',
      kickoff_time: null,
      kickoff_time_provenance: 'not_yet_fetched',
      springboks_score: null,
      springboks_score_provenance: 'fetch_failed',
      opponent_score: 30,
      opponent_score_provenance: 'present',
      result: 'loss',
      source_article_url: null,
      teams: { canonical_name: 'Wales' },
    };

    const { html } = await renderWith([
      NO_FIXTURES,
      NO_LIVE_MATCH,
      latestResultMatcher(lastResult),
      formGuideMatcher(),
    ]);

    const resultCard = html.querySelector('[data-testid="latest-result-card"]');
    // A failed score fetch must render the D16 "temporarily unavailable"
    // badge, not a blank cell or a bare "–20" dash (the bug Gate 2 caught).
    expect(resultCard?.textContent).toContain('temporarily unavailable');
    expect(resultCard?.textContent).not.toMatch(/South Africa\s*–30/);
  });

  it('renders postponed/TBD chips for a fixture missing venue and kickoff time', async () => {
    const fixture = {
      id: 'fx-1',
      match_date: '2026-09-01',
      kickoff_time: null,
      venue: null,
      competition: 'Rugby Championship',
      teams: { canonical_name: 'Australia' },
    };

    const fixturesMatcher: QueryMatcher = {
      table: 'fixtures_upstream',
      match: () => true,
      result: { data: [fixture], error: null },
    };

    const { html } = await renderWith([
      fixturesMatcher,
      NO_LIVE_MATCH,
      latestResultMatcher(null),
      formGuideMatcher(),
    ]);

    const chips = html.querySelectorAll('[data-testid="fixture-chips"] .chip');
    const labels = Array.from(chips).map((c) => c.textContent?.trim());
    expect(labels).toContain('Venue TBD');
    expect(labels).toContain('Kickoff TBD');
    expect(html.querySelector('[data-testid="off-season"]')).toBeNull();
  });

  it('renders a non-null kickoff as SA time, not the raw stored UTC string (#86)', async () => {
    const fixture = {
      id: 'fx-arg',
      match_date: '2026-08-08',
      kickoff_time: '2026-08-08T16:00:00+00:00',
      venue: 'Loftus Versfeld, Pretoria',
      competition: 'Rugby Championship',
      teams: { canonical_name: 'Argentina' },
    };

    const fixturesMatcher: QueryMatcher = {
      table: 'fixtures_upstream',
      match: () => true,
      result: { data: [fixture], error: null },
    };

    const { html } = await renderWith([
      fixturesMatcher,
      NO_LIVE_MATCH,
      latestResultMatcher(null),
      formGuideMatcher(),
    ]);

    const kickoff = html.querySelector('[data-testid="next-fixture-kickoff"]');
    expect(kickoff?.textContent?.trim()).toBe('18:00 SAST');
    expect(kickoff?.textContent).not.toContain('2026-08-08T16:00:00');
    expect(html.querySelector('[data-testid="fixture-chips"]')).toBeNull();
  });

  it('shows the match-under-way note instead of a next fixture, without throwing', async () => {
    const liveMatchMatcher: QueryMatcher = {
      table: 'matches',
      match: (calls) => calls.some((c) => c.method === 'is'),
      result: {
        data: {
          match_id: '2026-08-01-australia-1',
          match_date: '2026-08-01',
          competition: 'Rugby Championship',
          competition_provenance: 'present',
          venue: null,
          venue_provenance: 'not_yet_fetched',
          kickoff_time: null,
          kickoff_time_provenance: 'not_yet_fetched',
          springboks_score: null,
          springboks_score_provenance: 'not_yet_fetched',
          opponent_score: null,
          opponent_score_provenance: 'not_yet_fetched',
          result: null,
          source_article_url: null,
          teams: { canonical_name: 'Australia' },
        },
        error: null,
      },
    };

    const { html } = await renderWith([
      NO_FIXTURES,
      liveMatchMatcher,
      latestResultMatcher(null),
      formGuideMatcher(),
    ]);

    expect(html.querySelector('[data-testid="match-under-way"]')?.textContent).toContain(
      'Match under way',
    );
    expect(html.querySelector('[data-testid="off-season"]')).toBeNull();
  });

  it('renders an honest error state instead of throwing when a query fails', async () => {
    const failing: QueryMatcher = {
      table: 'fixtures_upstream',
      match: () => true,
      result: { data: null, error: { message: 'network error' } },
    };

    const { component, html } = await renderWith([
      failing,
      NO_LIVE_MATCH,
      latestResultMatcher(null),
      formGuideMatcher(),
    ]);

    expect(component.state()).toBe('error');
    expect(html.querySelector('[data-testid="home-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });

  it('renders an honest error state instead of throwing when Supabase is unreachable', async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createUnreachableSupabaseStub() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Home);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="home-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });

  it('renders the site-level attribution footer with a working /method link (#87, PRD D31)', async () => {
    const { html } = await renderWith([
      NO_FIXTURES,
      NO_LIVE_MATCH,
      latestResultMatcher(null),
      formGuideMatcher(),
    ]);

    const footer = html.querySelector('[data-testid="home-footer"]');
    expect(footer).toBeTruthy();
    expect(footer?.textContent).toContain(
      'Match list adapted from',
    );
    expect(footer?.textContent).toContain(
      'Wikipedia — List of South Africa national rugby union test matches',
    );
    expect(footer?.textContent).toContain('CC BY-SA 4.0');
    expect(footer?.textContent).toContain('modified: parsed and normalised from wikitext');

    const methodLink = footer?.querySelector('a[href="/method"]');
    expect(methodLink).toBeTruthy();
    expect(methodLink?.textContent?.trim()).toBe('Method');
  });

  describe('form guide (docs/design.md §7.1, D34)', () => {
    it('renders five marks, oldest to newest, with the tally and points caption', async () => {
      const rows = [
        FORM_GUIDE_ROW({ match_id: 'm5', match_date: '2026-07-18', result: 'win', teams: { canonical_name: 'Wales' }, springboks_score: 43, opponent_score: 0 }),
        FORM_GUIDE_ROW({ match_id: 'm4', match_date: '2026-07-11', result: 'win', teams: { canonical_name: 'Scotland' }, springboks_score: 42, opponent_score: 28 }),
        FORM_GUIDE_ROW({ match_id: 'm3', match_date: '2026-07-04', result: 'win', teams: { canonical_name: 'England' }, springboks_score: 45, opponent_score: 21 }),
        FORM_GUIDE_ROW({ match_id: 'm2', match_date: '2026-06-20', result: 'loss', teams: { canonical_name: 'New Zealand' }, springboks_score: 11, opponent_score: 22 }),
        FORM_GUIDE_ROW({ match_id: 'm1', match_date: '2026-06-13', result: 'draw', teams: { canonical_name: 'Australia' }, springboks_score: 20, opponent_score: 20 }),
      ];
      // `rows` is already newest-first (m5 2026-07-18 ... m1 2026-06-13),
      // exactly as the real query returns it
      // (`.order('match_date', {ascending:false}).limit(5)`) — the mock
      // must feed it unreversed so the component's own reversal to
      // oldest-first is what this test actually exercises. Feeding an
      // already-reversed mock (the bug Gate 3 caught) would make the
      // assertions below pass for the wrong reason: the component's
      // reversal would cancel the mock's, leaving `marks` in "rows" order
      // by coincidence rather than because oldest-first display works.
      // The form guide sits inside the Latest Result plate (docs/design.md §6), so a
      // latest result must also be present for it to render at all.
      const { html } = await renderWith([
        NO_FIXTURES,
        NO_LIVE_MATCH,
        latestResultMatcher(rows[0]),
        formGuideMatcher(rows),
      ]);

      const strip = html.querySelector('[data-testid="form-guide"]');
      expect(strip).toBeTruthy();
      expect(strip?.textContent).toContain('FORM · LAST FIVE TESTS');
      const marks = html.querySelectorAll('[data-testid="form-mark"]');
      expect(marks.length).toBe(5);
      // Oldest (Australia draw, 2026-06-13) first, newest (Wales win, 2026-07-18) last.
      expect(marks[0].textContent).toContain('AUS');
      expect(marks[4].textContent).toContain('WAL');
      expect(html.querySelector('[data-testid="form-summary"]')?.textContent).toContain('3W');
      expect(html.querySelector('[data-testid="form-summary"]')?.textContent).toContain('1L');
      expect(html.querySelector('[data-testid="form-summary"]')?.textContent).toContain('1D');
      expect(html.querySelector('[data-testid="form-caption"]')?.textContent).toContain('Points 161–91 (+70)');
    });

    it('excludes not_yet_fetched/unrecorded results from the tally and relabels the eyebrow honestly', async () => {
      const rows = [
        FORM_GUIDE_ROW({ match_id: 'm2', match_date: '2026-07-18', result: 'win', springboks_score: 20, opponent_score: 10 }),
        FORM_GUIDE_ROW({
          match_id: 'm1',
          match_date: '2026-07-25',
          result: null,
          springboks_score: null,
          springboks_score_provenance: 'not_yet_fetched',
          opponent_score: null,
          opponent_score_provenance: 'not_yet_fetched',
        }),
      ];
      const { html } = await renderWith([
        NO_FIXTURES,
        NO_LIVE_MATCH,
        latestResultMatcher(rows[0]),
        formGuideMatcher([...rows].reverse()),
      ]);

      expect(html.querySelector('[data-testid="form-guide"]')?.textContent).toContain(
        'FORM · LAST TWO TESTS',
      );
      expect(html.querySelector('[data-testid="form-summary"]')?.textContent).toContain('1W');
      expect(html.querySelector('[data-testid="form-caption"]')?.textContent).toContain(
        '1 not recorded',
      );
      const marks = html.querySelectorAll('[data-testid="form-mark"]');
      expect(marks[1].querySelector('.mark--absent')).toBeTruthy();
    });

    it('does not render the strip at all when there are zero completed tests', async () => {
      // A latest result IS present here (so the parent plate itself
      // renders) but the form-guide rows come back empty — this must be
      // what suppresses the strip. Pairing an absent latest result with an
      // empty form-guide (as this test previously did) is always-true: the
      // whole parent plate is absent regardless of the empty-rows guard,
      // so the assertion below would still pass even if
      // `buildFormGuide`'s `rowsOldestFirst.length === 0` guard were
      // deleted.
      const lastResult = FORM_GUIDE_ROW({ match_id: 'only-result', match_date: '2026-07-04' });
      const { html } = await renderWith([
        NO_FIXTURES,
        NO_LIVE_MATCH,
        latestResultMatcher(lastResult),
        formGuideMatcher([]),
      ]);

      expect(html.querySelector('[data-testid="latest-result-card"]')?.textContent).toContain(
        'South Africa',
      );
      expect(html.querySelector('[data-testid="form-guide"]')).toBeNull();
    });

    it('excludes a row whose result is recorded but a score is fetch_failed/absent from the tally, and never counts it as a 0 in the points differential', async () => {
      const rows = [
        FORM_GUIDE_ROW({
          match_id: 'm2',
          match_date: '2026-07-18',
          result: 'win',
          springboks_score: 20,
          opponent_score: 10,
        }),
        FORM_GUIDE_ROW({
          match_id: 'm1',
          match_date: '2026-07-11',
          result: 'loss',
          springboks_score: null,
          springboks_score_provenance: 'fetch_failed',
          opponent_score: 15,
          opponent_score_provenance: 'present',
        }),
      ];

      const { html } = await renderWith([
        NO_FIXTURES,
        NO_LIVE_MATCH,
        latestResultMatcher(rows[0]),
        formGuideMatcher(rows),
      ]);

      // Only the fully-scored win counts into the tally and the points
      // caption — the fetch_failed row is excluded, not silently added in
      // as a 0-point loss (which would understate the points-against
      // total by 15, not by nothing).
      expect(html.querySelector('[data-testid="form-summary"]')?.textContent).toContain('1W');
      expect(html.querySelector('[data-testid="form-summary"]')?.textContent).not.toContain('1L');
      expect(html.querySelector('[data-testid="form-caption"]')?.textContent).toContain(
        'Points 20–10 (+10)',
      );
      expect(html.querySelector('[data-testid="form-caption"]')?.textContent).toContain(
        '1 not recorded',
      );
      const marks = html.querySelectorAll('[data-testid="form-mark"]');
      expect(marks[0].querySelector('.mark--absent')).toBeTruthy();
    });
  });
});
