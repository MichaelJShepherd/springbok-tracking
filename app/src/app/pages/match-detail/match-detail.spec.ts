import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatchDetail } from './match-detail';
import { SupabaseService } from '../../core/supabase.service';
import {
  createSupabaseStub,
  createUnreachableSupabaseStub,
  QueryMatcher,
} from '../../shared/testing/supabase-stub';

const BASE_MATCH = {
  match_id: '1995-06-24-new-zealand-1',
  match_date: '1995-06-24',
  competition: 'Rugby World Cup Final',
  competition_provenance: 'present',
  venue: 'Ellis Park, Johannesburg',
  venue_provenance: 'present',
  kickoff_time: null,
  kickoff_time_provenance: 'not_yet_fetched',
  springboks_score: 15,
  springboks_score_provenance: 'present',
  opponent_score: 12,
  opponent_score_provenance: 'present',
  result: 'win',
  source_article_url: 'https://en.wikipedia.org/wiki/1995_Rugby_World_Cup_Final',
  teams: { canonical_name: 'New Zealand' },
};

function matchMatcher(row: unknown): QueryMatcher {
  // Distinguishes the main `.eq('match_id', ...)` lookup from the
  // head-to-head strip's separate `.eq('opponent_team_id', ...)` query
  // below — both hit the `matches` table.
  return {
    table: 'matches',
    match: (calls) => calls.some((c) => c.method === 'eq' && c.args[0] === 'match_id'),
    result: { data: row, error: null },
  };
}

function h2hMatcher(rows: unknown[]): QueryMatcher {
  return {
    table: 'matches',
    match: (calls) => calls.some((c) => c.method === 'eq' && c.args[0] === 'opponent_team_id'),
    result: { data: rows, error: null },
  };
}

function officialsMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'match_officials', match: () => true, result: { data: rows, error: null } };
}

function lineupsMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'match_lineups', match: () => true, result: { data: rows, error: null } };
}

function eventsMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'match_events', match: () => true, result: { data: rows, error: null } };
}

async function renderWith(
  matchers: QueryMatcher[],
  routeId = '1995-06-24-new-zealand-1',
): Promise<{ component: MatchDetail; fixture: ComponentFixture<MatchDetail>; html: HTMLElement }> {
  await TestBed.configureTestingModule({
    imports: [MatchDetail],
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: createSupabaseStub(matchers) },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: routeId }) } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(MatchDetail);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { component, fixture, html: fixture.nativeElement as HTMLElement };
}

describe('MatchDetail', () => {
  it('renders a sparse 1890s-style match with all-absent officials/lineups/events, never blanking or throwing', async () => {
    const sparseMatch = {
      ...BASE_MATCH,
      match_id: '1896-08-05-british-isles-1',
      match_date: '1896-08-05',
      competition: null,
      competition_provenance: 'absent_in_source',
      kickoff_time: null,
      kickoff_time_provenance: 'absent_in_source',
      source_article_url: null,
      teams: { canonical_name: 'British Isles' },
    };

    const { html } = await renderWith(
      [matchMatcher(sparseMatch), officialsMatcher([]), lineupsMatcher([]), eventsMatcher([])],
      sparseMatch.match_id,
    );

    expect(html.querySelector('[data-testid="match-detail"]')).toBeTruthy();
    // Absent competition renders the calm "not recorded" state, not a blank —
    // scoped to the competition's own eyebrow line, not just anywhere on the page.
    const competitionCell = html.querySelector('.detail-eyebrow app-field-value');
    expect(competitionCell?.textContent?.trim()).toBe('not recorded');

    // WCAG AA fix: `.field-absent` on the dark masthead must be reachable by
    // the `.detail-masthead .field-absent` override selector (--gold-300,
    // 11.91:1) rather than the shared --ink-3 (2.90:1 on this background).
    const mastheadAbsent = html.querySelector('.detail-masthead .field-absent');
    expect(mastheadAbsent).toBeTruthy();
    expect(mastheadAbsent?.textContent?.trim()).toBe('not recorded');
    expect(html.querySelector('[data-testid="lineups-absent"]')).toBeTruthy();
    expect(html.querySelector('[data-testid="events-absent"]')).toBeTruthy();
    // Fallback attribution: no source_article_url -> the list article.
    const footerLink = html.querySelector('[data-testid="attribution-footer"] a') as HTMLAnchorElement;
    expect(footerLink.href).toContain('List_of_South_Africa_national_rugby_union_team_test_matches');
  });

  it('renders a non-null kickoff as SA time, not the raw stored UTC string (#86)', async () => {
    const timedMatch = {
      ...BASE_MATCH,
      kickoff_time: '2026-08-08T16:00:00+00:00',
      kickoff_time_provenance: 'present',
    };

    const { html } = await renderWith([
      matchMatcher(timedMatch),
      officialsMatcher([]),
      lineupsMatcher([]),
      eventsMatcher([]),
    ]);

    const kickoff = html.querySelector('[data-testid="kickoff-value"]');
    expect(kickoff?.textContent?.trim()).toBe('18:00 SAST');
    expect(kickoff?.textContent).not.toContain('2026-08-08T16:00:00');
  });

  it('still renders "not recorded" for a null kickoff, unchanged by SAST formatting (#86)', async () => {
    // BASE_MATCH already carries kickoff_time: null / not_yet_fetched; assert
    // the D16 honest state renders exactly as before and is never blanked or
    // fed a formatted-but-empty string.
    const { html } = await renderWith([
      matchMatcher({ ...BASE_MATCH, kickoff_time_provenance: 'absent_in_source' }),
      officialsMatcher([]),
      lineupsMatcher([]),
      eventsMatcher([]),
    ]);

    const kickoff = html.querySelector('[data-testid="kickoff-value"]');
    expect(kickoff?.textContent?.trim()).toBe('not recorded');
  });

  it('shows a clock badge only for timed events, and none for untimed ones (D11)', async () => {
    const events = [
      {
        sequence_no: 1,
        event_type: 'try',
        team_side: 'springboks',
        description: 'Try, scorer not recorded',
        description_provenance: 'present',
        minute: null,
        minute_provenance: 'absent_in_source',
      },
      {
        sequence_no: 2,
        event_type: 'penalty',
        team_side: 'springboks',
        description: 'Penalty, Stransky',
        description_provenance: 'present',
        minute: 34,
        minute_provenance: 'present',
      },
    ];

    const { html } = await renderWith([
      matchMatcher(BASE_MATCH),
      officialsMatcher([]),
      lineupsMatcher([]),
      eventsMatcher(events),
    ]);

    const items = Array.from(html.querySelectorAll('[data-testid="events-list"] li'));
    expect(items.length).toBe(2);
    // First (untimed) event must NOT carry a clock badge.
    expect(items[0].querySelector('[data-testid="event-clock"]')).toBeNull();
    // Second (timed) event must carry exactly the recorded minute.
    expect(items[1].querySelector('[data-testid="event-clock"]')?.textContent).toContain("34'");
  });

  it('renders the referee prominently and other officials distinctly, with the fetch_failed state alarmed', async () => {
    const officials = [
      { role: 'referee', name: null, name_provenance: 'fetch_failed' },
      { role: 'tmo', name: 'J. Smith', name_provenance: 'present' },
    ];

    const { html } = await renderWith([
      matchMatcher(BASE_MATCH),
      officialsMatcher(officials),
      lineupsMatcher([]),
      eventsMatcher([]),
    ]);

    // The referee's own fetch_failed state renders under the Referee heading
    // specifically (not merely "somewhere on the page") and the referee must
    // never fall through into the generic other-officials list.
    expect(html.querySelector('[data-testid="referee-value"]')?.textContent).toContain(
      'temporarily unavailable',
    );
    const others = html.querySelector('[data-testid="other-officials"]');
    expect(others?.textContent).toContain('J. Smith');
    expect(others?.textContent).not.toContain('temporarily unavailable');
  });

  it('renders a "sources differ" badge on a field that carries a recorded disagreement (D14)', async () => {
    const disputedMatch = {
      ...BASE_MATCH,
      disagreements: [
        {
          field: 'kickoff_time',
          displayedValue: '15:00 SAST',
          displayedSource: 'Wikipedia',
          alternateValue: '14:30 SAST',
          alternateSource: 'Kaggle cross-check dataset',
        },
      ],
    };

    const { html } = await renderWith([
      matchMatcher(disputedMatch),
      officialsMatcher([]),
      lineupsMatcher([]),
      eventsMatcher([]),
    ]);

    const badge = html.querySelector('[data-testid="sources-differ-kickoff_time"]');
    expect(badge?.textContent).toContain('sources differ');
    expect(badge?.textContent).toContain('Wikipedia: 15:00 SAST');
    expect(badge?.textContent).toContain('Kaggle cross-check dataset: 14:30 SAST');

    // Exactly one badge must render for exactly the disputed field — proves
    // disagreementFor() is filtering by field, not just returning entry [0]
    // for every slot it's asked about.
    expect(html.querySelectorAll('[data-testid^="sources-differ-"]').length).toBe(1);

    // A field with no recorded disagreement must never show the badge.
    expect(html.querySelector('[data-testid="sources-differ-venue"]')).toBeNull();
  });

  it('links both disagreeing sources when their URLs are recorded, not just a tooltip (D14)', async () => {
    const disputedMatch = {
      ...BASE_MATCH,
      disagreements: [
        {
          field: 'kickoff_time',
          displayedValue: '15:00 SAST',
          displayedSource: 'Wikipedia',
          displayedSourceUrl: 'https://en.wikipedia.org/wiki/1995_Rugby_World_Cup_Final',
          alternateValue: '14:30 SAST',
          alternateSource: 'Kaggle cross-check dataset',
          alternateSourceUrl: 'https://example.com/kaggle-dataset',
        },
      ],
    };

    const { html } = await renderWith([
      matchMatcher(disputedMatch),
      officialsMatcher([]),
      lineupsMatcher([]),
      eventsMatcher([]),
    ]);

    const badge = html.querySelector('[data-testid="sources-differ-kickoff_time"]');
    const links = Array.from(badge?.querySelectorAll('a') ?? []) as HTMLAnchorElement[];
    expect(links.length).toBe(2);
    expect(links.some((a) => a.href.includes('1995_Rugby_World_Cup_Final'))).toBe(true);
    expect(links.some((a) => a.href.includes('kaggle-dataset'))).toBe(true);
  });

  it('renders an honest error state instead of throwing when a query fails', async () => {
    const failing: QueryMatcher = {
      table: 'match_officials',
      match: () => true,
      result: { data: null, error: { message: 'network error' } },
    };

    const { component, html } = await renderWith([
      matchMatcher(BASE_MATCH),
      failing,
      lineupsMatcher([]),
      eventsMatcher([]),
    ]);

    expect(component.state()).toBe('error');
    expect(html.querySelector('[data-testid="detail-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });

  it('renders an honest error state instead of crashing when Supabase is unreachable', async () => {
    await TestBed.configureTestingModule({
      imports: [MatchDetail],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createUnreachableSupabaseStub() },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'anything' }) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MatchDetail);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="detail-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });

  describe('head-to-head strip (docs/design.md §7.3, D34)', () => {
    it('renders the all-time record and "before this match" for a match with prior meetings', async () => {
      const match = { ...BASE_MATCH, opponent_team_id: 'nzl' };
      const rows = [
        { match_id: 'm1', match_date: '1990-01-01', springboks_score: 10, springboks_score_provenance: 'present', opponent_score: 20, opponent_score_provenance: 'present', result: 'loss' },
        { match_id: 'm2', match_date: '1992-01-01', springboks_score: 27, springboks_score_provenance: 'present', opponent_score: 3, opponent_score_provenance: 'present', result: 'win' },
        { ...match, springboks_score: 15, opponent_score: 12, result: 'win' },
      ];

      const { html } = await renderWith([
        matchMatcher(match),
        officialsMatcher([]),
        lineupsMatcher([]),
        eventsMatcher([]),
        h2hMatcher(rows),
      ]);

      const strip = html.querySelector('[data-testid="head-to-head"]');
      expect(strip).toBeTruthy();
      expect(strip?.textContent).toContain('3rd meeting');
      const before = html.querySelector('[data-testid="h2h-before"]');
      expect(before?.textContent).toContain('Before this match');
      // Scoped to the "before this match" line specifically — asserting
      // "W 1" against the whole strip's textContent would also pass off
      // unrelated "W 1" text elsewhere in the strip (e.g. a P/W/L/D count).
      expect(before?.textContent).toContain('W 1');
      expect(strip?.textContent).toContain('Biggest win 27–3');
      expect(strip?.textContent).toContain('Biggest defeat 10–20');
    });

    it('renders "the first meeting" and omits the before-this-match line for a first-ever meeting', async () => {
      const match = { ...BASE_MATCH, opponent_team_id: 'fiji' };

      const { html } = await renderWith([
        matchMatcher(match),
        officialsMatcher([]),
        lineupsMatcher([]),
        eventsMatcher([]),
        h2hMatcher([match]),
      ]);

      const strip = html.querySelector('[data-testid="head-to-head"]');
      expect(strip?.textContent).toContain('The first meeting');
      expect(strip?.querySelector('[data-testid="h2h-before"]')).toBeNull();
    });

    it('renders the count-caption stating its denominator (D33) — deleting it must fail this test', async () => {
      const match = { ...BASE_MATCH, opponent_team_id: 'nzl' };
      const rows = [
        { match_id: 'm1', match_date: '1990-01-01', springboks_score: 10, springboks_score_provenance: 'present', opponent_score: 20, opponent_score_provenance: 'present', result: 'loss' },
        { ...match, springboks_score: 15, opponent_score: 12, result: 'win' },
      ];

      const { html } = await renderWith([
        matchMatcher(match),
        officialsMatcher([]),
        lineupsMatcher([]),
        eventsMatcher([]),
        h2hMatcher(rows),
      ]);

      const caption = html.querySelector('[data-testid="h2h-count-caption"]');
      expect(caption).toBeTruthy();
      expect(caption?.textContent).toContain('2 tests against this opponent');
    });

    it('does not render the strip at all when the match has no opponent_team_id to query with', async () => {
      const { html } = await renderWith([
        matchMatcher(BASE_MATCH),
        officialsMatcher([]),
        lineupsMatcher([]),
        eventsMatcher([]),
      ]);

      expect(html.querySelector('[data-testid="head-to-head"]')).toBeNull();
    });
  });

  describe('score-progression figure (docs/design.md §7.4, D33(b), D34)', () => {
    it('renders the chart for the real 1995 final, which reconciles exactly', async () => {
      const match = { ...BASE_MATCH, match_date: '1995-06-24' };
      const timedEvents = [
        { sequence_no: 1, event_type: 'penalty', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 5, minute_provenance: 'present' },
        { sequence_no: 2, event_type: 'penalty', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 10, minute_provenance: 'present' },
        { sequence_no: 3, event_type: 'penalty', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 13, minute_provenance: 'present' },
        { sequence_no: 4, event_type: 'penalty', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 22, minute_provenance: 'present' },
        { sequence_no: 5, event_type: 'drop_goal', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 31, minute_provenance: 'present' },
        { sequence_no: 6, event_type: 'drop_goal', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 55, minute_provenance: 'present' },
        { sequence_no: 7, event_type: 'penalty', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 83, minute_provenance: 'present' },
        { sequence_no: 8, event_type: 'penalty', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 90, minute_provenance: 'present' },
        { sequence_no: 9, event_type: 'drop_goal', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 92, minute_provenance: 'present' },
      ];

      const { html } = await renderWith([
        matchMatcher(match),
        officialsMatcher([]),
        lineupsMatcher([]),
        eventsMatcher(timedEvents),
      ]);

      expect(html.querySelector('[data-testid="score-progression-chart"]')).toBeTruthy();
      expect(html.querySelector('[data-testid="score-progression-degraded"]')).toBeNull();
    });

    it('renders the figcaption stating the reconciled final score (D33) — deleting it must fail this test', async () => {
      const match = { ...BASE_MATCH, match_date: '1995-06-24' };
      const timedEvents = [
        { sequence_no: 1, event_type: 'penalty', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 5, minute_provenance: 'present' },
        { sequence_no: 2, event_type: 'penalty', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 10, minute_provenance: 'present' },
        { sequence_no: 3, event_type: 'penalty', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 13, minute_provenance: 'present' },
        { sequence_no: 4, event_type: 'penalty', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 22, minute_provenance: 'present' },
        { sequence_no: 5, event_type: 'drop_goal', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 31, minute_provenance: 'present' },
        { sequence_no: 6, event_type: 'drop_goal', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 55, minute_provenance: 'present' },
        { sequence_no: 7, event_type: 'penalty', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: 83, minute_provenance: 'present' },
        { sequence_no: 8, event_type: 'penalty', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 90, minute_provenance: 'present' },
        { sequence_no: 9, event_type: 'drop_goal', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 92, minute_provenance: 'present' },
      ];

      const { html } = await renderWith([
        matchMatcher(match),
        officialsMatcher([]),
        lineupsMatcher([]),
        eventsMatcher(timedEvents),
      ]);

      const caption = html.querySelector('[data-testid="score-progression-caption"]');
      expect(caption).toBeTruthy();
      expect(caption?.textContent).toContain('final score 15–12');
    });

    it('degrades to the stated reason, never a chart, when scoring events are untimed', async () => {
      const untimedEvents = [
        { sequence_no: 1, event_type: 'try', team_side: 'opponent', description: null, description_provenance: 'absent_in_source', minute: null, minute_provenance: 'absent_in_source' },
      ];

      const { html } = await renderWith([
        matchMatcher(BASE_MATCH),
        officialsMatcher([]),
        lineupsMatcher([]),
        eventsMatcher(untimedEvents),
      ]);

      expect(html.querySelector('[data-testid="score-progression-chart"]')).toBeNull();
      expect(html.querySelector('[data-testid="score-progression-degraded"]')?.textContent).toContain(
        "aren't recorded",
      );
    });

    it('never charts a pre-1894 match, and the events list below remains the accessible record', async () => {
      // Timed (not untimed) events whose points, under the era-0 table
      // (try=3), WOULD reconcile to the stored final score if the year
      // guard didn't apply — this isolates the pre-1894 guard specifically.
      // The previous version of this fixture used a single untimed event,
      // which meant the *untimed* branch already suppressed the chart, and
      // deleting the pre-1894 guard alone would not have turned this test
      // red.
      const sparseMatch = { ...BASE_MATCH, match_date: '1891-08-30', springboks_score: 3, opponent_score: 0 };
      const events = [
        { sequence_no: 1, event_type: 'try', team_side: 'springboks', description: null, description_provenance: 'absent_in_source', minute: 10, minute_provenance: 'present' },
      ];

      const { html } = await renderWith(
        [matchMatcher(sparseMatch), officialsMatcher([]), lineupsMatcher([]), eventsMatcher(events)],
        sparseMatch.match_id,
      );

      expect(html.querySelector('[data-testid="score-progression-chart"]')).toBeNull();
      expect(html.querySelector('[data-testid="score-progression-degraded"]')?.textContent).toContain(
        'before 1894',
      );
      expect(html.querySelector('[data-testid="events-list"]')).toBeTruthy();
    });
  });
});
