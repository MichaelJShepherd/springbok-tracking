import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FixtureDetail } from './fixture-detail';
import { SupabaseService } from '../../core/supabase.service';
import {
  createSupabaseStub,
  createUnreachableSupabaseStub,
  QueryMatcher,
} from '../../shared/testing/supabase-stub';
import { routes } from '../../app.routes';

const BASE_FIXTURE = {
  id: 'fx-nz',
  match_date: '2026-08-22',
  kickoff_time: '2026-08-22T17:05:00+00:00',
  venue: 'Ellis Park Stadium, Johannesburg',
  competition: null,
  status: 'scheduled',
  source: 'wikipedia',
  source_article_url: "https://en.wikipedia.org/wiki/2026_men's_rugby_union_internationals",
  fetched_at: '2026-08-01T10:13:54.293978+00:00',
  opponent_team_id: 'nzl-team-id',
  teams: { canonical_name: 'New Zealand' },
};

function fixtureMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'fixtures_upstream', match: () => true, result: { data: rows, error: null } };
}

function h2hMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'matches', match: () => true, result: { data: rows, error: null } };
}

async function renderWith(
  matchers: QueryMatcher[],
  routeId = '2026-08-22-new-zealand',
  clock?: () => Date,
): Promise<{ component: FixtureDetail; fixture: ComponentFixture<FixtureDetail>; html: HTMLElement }> {
  await TestBed.configureTestingModule({
    imports: [FixtureDetail],
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: createSupabaseStub(matchers) },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: routeId }) } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(FixtureDetail);
  if (clock) {
    fixture.componentRef.setInput('clock', clock);
  }
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { component, fixture, html: fixture.nativeElement as HTMLElement };
}

describe('FixtureDetail (docs/design.md §6.2, PRD D37, #95)', () => {
  it('resolves the /fixture/:id route to this component', async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: SupabaseService, useValue: createSupabaseStub([fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])]) },
      ],
    }).compileComponents();

    const harness = await RouterTestingHarness.create('/fixture/2026-08-22-new-zealand');
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement?.querySelector('[data-testid="fixture-detail"]')).toBeTruthy();
  });

  it('renders the pre-match masthead (opponent, kickoff SAST, venue) with no score anywhere', async () => {
    const { html } = await renderWith([fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])]);

    expect(html.querySelector('[data-testid="fixture-detail"]')).toBeTruthy();
    expect(html.querySelector('[data-testid="fixture-title"]')?.textContent).toContain(
      'South Africa v New Zealand',
    );
    const kickoff = html.querySelector('[data-testid="fixture-kickoff"]');
    expect(kickoff?.textContent?.trim()).toBe('19:05 SAST');
    expect(html.querySelector('[data-testid="fixture-venue"]')?.textContent).toContain(
      'Ellis Park Stadium',
    );

    // The absolute non-negotiable: no score markup, never a 0–0.
    expect(html.querySelector('.score-hero')).toBeNull();
    expect(html.querySelector('[data-testid="score-hero"]')).toBeNull();
    expect(html.querySelector('.score')).toBeNull();
    expect(html.textContent).not.toContain('0–0');
    // The score hero (elsewhere in the app) always separates two scores
    // with an en dash ("15–12"); dates use plain hyphens ("2026-08-22"), so
    // this specifically catches an accidentally-rendered score pair without
    // false-positiving on the masthead's own date.
    expect(html.querySelector('[data-testid="fixture-masthead"]')?.textContent).not.toMatch(/\d+\s*–\s*\d+/);
  });

  it('renders the three honest pre-match sections, never an empty table', async () => {
    const { html } = await renderWith([fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])]);

    expect(html.querySelector('[data-testid="lineups-not-yet"]')?.textContent).toContain(
      'Lineups not yet announced',
    );
    expect(html.querySelector('[data-testid="officials-not-yet"]')?.textContent).toContain(
      'Officials not yet announced',
    );
    expect(html.querySelector('[data-testid="events-not-yet"]')?.textContent).toContain(
      'This match has not been played',
    );
  });

  it('renders the real head-to-head aggregate for a known opponent, with the D33 caption', async () => {
    const rows = [
      { match_id: 'm1', match_date: '1990-01-01', springboks_score: 27, springboks_score_provenance: 'present', opponent_score: 3, opponent_score_provenance: 'present', result: 'win' },
      { match_id: 'm2', match_date: '2000-01-01', springboks_score: 10, springboks_score_provenance: 'present', opponent_score: 20, opponent_score_provenance: 'present', result: 'loss' },
    ];

    const { html } = await renderWith([fixtureMatcher([BASE_FIXTURE]), h2hMatcher(rows)]);

    const strip = html.querySelector('[data-testid="head-to-head"]');
    expect(strip).toBeTruthy();
    expect(strip?.textContent).toContain('P 2');
    expect(strip?.textContent).toContain('W 1');
    expect(strip?.textContent).toContain('L 1');
    expect(strip?.textContent).toContain('Biggest win 27–3');
    expect(strip?.textContent).toContain('Biggest defeat 10–20');
    // Never the "before this match" / "Nth meeting" zone — the fixture
    // hasn't been played, so that framing would be premature/fabricated.
    expect(html.querySelector('[data-testid="h2h-before"]')).toBeNull();
    const caption = html.querySelector('[data-testid="h2h-count-caption"]');
    expect(caption?.textContent).toContain('From 2 tests against this opponent');
  });

  it('renders the absent state for a first-ever opponent, never a P0/W0/L0/D0 fabrication', async () => {
    const firstEverFixture = { ...BASE_FIXTURE, teams: { canonical_name: 'Portugal' } };
    const { html } = await renderWith(
      [fixtureMatcher([firstEverFixture]), h2hMatcher([])],
      '2026-08-22-portugal',
    );

    const strip = html.querySelector('[data-testid="head-to-head"]');
    expect(strip).toBeTruthy();
    expect(html.querySelector('[data-testid="h2h-absent"]')?.textContent).toContain(
      'No meetings recorded against this opponent yet',
    );
    // Deleting the total===0 guard would render "P 0 · W 0 · L 0 · D 0"
    // instead — assert that fabricated-zero text is genuinely absent.
    expect(strip?.textContent).not.toContain('P 0');
    expect(strip?.textContent).not.toMatch(/W\s*0\s*·\s*L\s*0\s*·\s*D\s*0/);
  });

  it('renders the match-day (D8) state when the fixture date is today in SAST, via an injected clock', async () => {
    const { html } = await renderWith(
      [fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])],
      '2026-08-22-new-zealand',
      () => new Date('2026-08-22T10:00:00Z'),
    );

    expect(html.querySelector('[data-testid="match-under-way"]')?.textContent).toContain(
      'Match under way',
    );
    expect(html.querySelector('[data-testid="fixture-kickoff"]')).toBeNull();
  });

  it('does not render the match-day state on a different day, via the same injected clock mechanism', async () => {
    const { html } = await renderWith(
      [fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])],
      '2026-08-22-new-zealand',
      () => new Date('2026-08-10T10:00:00Z'),
    );

    expect(html.querySelector('[data-testid="match-under-way"]')).toBeNull();
    expect(html.querySelector('[data-testid="fixture-kickoff"]')).toBeTruthy();
  });

  it('renders the Wikipedia-flavoured provenance line with the source article link and fetched timestamp', async () => {
    const { html } = await renderWith([fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])]);

    const provenance = html.querySelector('[data-testid="fixture-provenance"]');
    expect(provenance?.textContent).toContain('Fixture via');
    expect(provenance?.textContent).toContain('CC BY-SA 4.0');
    expect(provenance?.textContent).toContain('2026-08-01 12:13 SAST');
    const link = provenance?.querySelector('a[href*="2026_men"]');
    expect(link).toBeTruthy();
  });

  it('renders the plain D28 provenance note (no article link) for an api-sports-sourced fixture', async () => {
    const apiFixture = { ...BASE_FIXTURE, source: 'api-sports', source_article_url: null };
    const { html } = await renderWith([fixtureMatcher([apiFixture]), h2hMatcher([])]);

    const provenance = html.querySelector('[data-testid="fixture-provenance"]');
    expect(provenance?.textContent).toContain('Fixtures via API-Sports');
    expect(provenance?.textContent).toContain('2026-08-01 12:13 SAST');
    expect(provenance?.querySelector('a')).toBeNull();
  });

  it('renders a status chip for a non-scheduled fixture', async () => {
    const postponed = { ...BASE_FIXTURE, status: 'postponed' };
    const { html } = await renderWith([fixtureMatcher([postponed]), h2hMatcher([])]);
    expect(html.querySelector('[data-testid="fixture-status-chip"]')?.textContent?.trim()).toBe(
      'Postponed',
    );
  });

  it('renders no status chip for a scheduled fixture', async () => {
    const { html } = await renderWith([fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])]);
    expect(html.querySelector('[data-testid="fixture-status-chip"]')).toBeNull();
  });

  it('renders honest absent copy for an unconfirmed kickoff/venue rather than blanking or inventing one', async () => {
    const unconfirmed = { ...BASE_FIXTURE, kickoff_time: null, venue: null };
    const { html } = await renderWith([fixtureMatcher([unconfirmed]), h2hMatcher([])]);

    expect(html.querySelector('[data-testid="fixture-kickoff"]')?.textContent?.trim()).toBe(
      'Kickoff not yet confirmed',
    );
    expect(html.querySelector('[data-testid="fixture-venue"]')?.textContent?.trim()).toBe(
      'Venue not yet confirmed',
    );
  });

  it('renders a not-found state for an id that does not match any fixture row', async () => {
    const { html, component } = await renderWith(
      [fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])],
      '2026-08-22-fiji',
    );
    expect(component.state()).toBe('not_found');
    expect(html.querySelector('[data-testid="fixture-not-found"]')).toBeTruthy();
  });

  it('renders a not-found state for a malformed route id', async () => {
    const { html, component } = await renderWith([fixtureMatcher([BASE_FIXTURE])], 'not-a-fixture-id');
    expect(component.state()).toBe('not_found');
    expect(html.querySelector('[data-testid="fixture-not-found"]')).toBeTruthy();
  });

  it('renders an honest error state instead of throwing when a query fails', async () => {
    const failing: QueryMatcher = {
      table: 'fixtures_upstream',
      match: () => true,
      result: { data: null, error: { message: 'network error' } },
    };

    const { component, html } = await renderWith([failing]);

    expect(component.state()).toBe('error');
    expect(html.querySelector('[data-testid="fixture-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });

  it('renders an honest error state instead of crashing when Supabase is unreachable', async () => {
    await TestBed.configureTestingModule({
      imports: [FixtureDetail],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createUnreachableSupabaseStub() },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '2026-08-22-new-zealand' }) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FixtureDetail);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="fixture-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });
});
