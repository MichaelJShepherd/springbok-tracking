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
  return { table: 'matches', match: () => true, result: { data: row, error: null } };
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
    // scoped to the competition's own meta-row span, not just anywhere on the page.
    const competitionCell = html.querySelector('.meta-row app-field-value');
    expect(competitionCell?.textContent?.trim()).toBe('not recorded');
    expect(html.querySelector('[data-testid="lineups-absent"]')).toBeTruthy();
    expect(html.querySelector('[data-testid="events-absent"]')).toBeTruthy();
    // Fallback attribution: no source_article_url -> the list article.
    const footerLink = html.querySelector('[data-testid="attribution-footer"] a') as HTMLAnchorElement;
    expect(footerLink.href).toContain('List_of_South_Africa_national_rugby_union_team_test_matches');
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
});
