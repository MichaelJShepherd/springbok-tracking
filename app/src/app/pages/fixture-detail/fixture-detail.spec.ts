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

// A fixed, clearly-not-match-day clock — used as the default for every test
// that isn't specifically exercising the D8 match-day state, so those tests
// never depend on (or accidentally coincide with) whatever day they actually
// run on.
const FAR_FROM_MATCH_DAY = () => new Date('2000-01-01T00:00:00Z');

function fixtureMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'fixtures_upstream', match: () => true, result: { data: rows, error: null } };
}

function h2hMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'matches', match: () => true, result: { data: rows, error: null } };
}

async function renderWith(
  matchers: QueryMatcher[],
  routeId = '2026-08-22-new-zealand',
  clock: () => Date = FAR_FROM_MATCH_DAY,
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
  fixture.componentRef.setInput('clock', clock);
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

  describe('D8 match-day state (Gate 2 finding 1: gated on kickoff having passed, not just the date)', () => {
    it('pre-kickoff on match day: shows the ordinary kickoff time, and makes no under-way claim', async () => {
      // Same SAST calendar day as the fixture (2026-08-22), but hours
      // before the 19:05 kickoff — the page must still show the kickoff
      // fact, not silently swap it for a premature "under way" claim.
      const { html } = await renderWith(
        [fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])],
        '2026-08-22-new-zealand',
        () => new Date('2026-08-22T07:00:00Z'), // 09:00 SAST, 10h before kickoff
      );

      expect(html.querySelector('[data-testid="fixture-kickoff"]')?.textContent?.trim()).toBe(
        '19:05 SAST',
      );
      expect(html.querySelector('[data-testid="match-under-way"]')).toBeNull();
      expect(html.querySelector('[data-testid="match-under-way-eyebrow"]')).toBeNull();
    });

    it('post-kickoff on match day: shows the under-way note AND the MATCH UNDER WAY eyebrow', async () => {
      const { html } = await renderWith(
        [fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])],
        '2026-08-22-new-zealand',
        () => new Date('2026-08-22T18:00:00Z'), // 20:00 SAST, after the 19:05 kickoff
      );

      expect(html.querySelector('[data-testid="match-under-way"]')?.textContent).toContain(
        'Match under way',
      );
      expect(html.querySelector('[data-testid="match-under-way-eyebrow"]')?.textContent).toBe(
        'MATCH UNDER WAY',
      );
    });

    it('a fixture dated the SAST-previous day is NOT under way even though its UTC date and kickoff-passed check would both say yes (proves the day comparison is SAST, not UTC)', async () => {
      // fixture match_date = 2026-08-21, kickoff = 2026-08-21T21:00:00Z
      // (23:00 SAST on the 21st). clock = 2026-08-21T22:30:00Z, which is
      // already 2026-08-22 00:30 in Africa/Johannesburg (UTC+2).
      //
      // Correct SAST logic: today-in-SAST at the clock is 2026-08-22, which
      // does NOT equal the fixture's match_date (2026-08-21) — not match
      // day, so under-way must be false, full stop (never even reaches the
      // kickoff-passed check).
      //
      // A UTC-mutated version of the gate (e.g. comparing match_date against
      // clock.toISOString().slice(0,10) instead of the SAST-converted date)
      // would compute "today" as 2026-08-21 (the clock's UTC date), which
      // DOES equal match_date — and the kickoff (21:00Z) has already passed
      // the clock (22:30Z) — so the mutant reports under-way = true. This is
      // the case the previous version of this test failed to cover: its
      // clock/kickoff pair produced `false` under both the correct logic and
      // a UTC mutant, for different reasons, so the mutant went undetected.
      // This pair makes the two interpretations diverge in the observable
      // result, not just in internal reasoning.
      const yesterdayFixture = {
        ...BASE_FIXTURE,
        match_date: '2026-08-21',
        kickoff_time: '2026-08-21T21:00:00Z',
      };

      const { html, component } = await renderWith(
        [fixtureMatcher([yesterdayFixture]), h2hMatcher([])],
        '2026-08-21-new-zealand',
        () => new Date('2026-08-21T22:30:00Z'),
      );

      expect(component.isMatchUnderWay()).toBe(false);
      expect(html.querySelector('[data-testid="match-under-way"]')).toBeNull();
      expect(html.querySelector('[data-testid="match-under-way-eyebrow"]')).toBeNull();
    });

    it('mirror case: a fixture whose SAST match-day has begun but whose UTC calendar date has not IS under way (same divergence, opposite direction)', async () => {
      // fixture match_date = 2026-08-22, kickoff = 2026-08-21T22:10:00Z
      // (00:10 SAST on the 22nd — an early-morning SAST kickoff). clock =
      // 2026-08-21T23:00:00Z, which is 2026-08-22 01:00 in SAST.
      //
      // Correct SAST logic: today-in-SAST at the clock is 2026-08-22, which
      // equals match_date — match day — and the clock (23:00Z) is after the
      // kickoff instant (22:10Z), so under-way must be true.
      //
      // A UTC-mutated gate would compute "today" as the clock's UTC date,
      // 2026-08-21, which does NOT equal match_date (2026-08-22) — the
      // mutant short-circuits false, wrongly hiding a match that has, in
      // South African time, genuinely started.
      const earlyKickoffFixture = {
        ...BASE_FIXTURE,
        match_date: '2026-08-22',
        kickoff_time: '2026-08-21T22:10:00Z',
      };

      const { html, component } = await renderWith(
        [fixtureMatcher([earlyKickoffFixture]), h2hMatcher([])],
        '2026-08-22-new-zealand',
        () => new Date('2026-08-21T23:00:00Z'),
      );

      expect(component.isMatchUnderWay()).toBe(true);
      expect(html.querySelector('[data-testid="match-under-way"]')?.textContent).toContain(
        'Match under way',
      );
      expect(html.querySelector('[data-testid="match-under-way-eyebrow"]')?.textContent).toBe(
        'MATCH UNDER WAY',
      );
    });

    it('the same SAST calendar day, just past the kickoff instant, flips under-way true — proving the date half of the gate really resolved to the SAST day rather than silently never matching', async () => {
      const { component } = await renderWith(
        [fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])],
        '2026-08-22-new-zealand',
        () => new Date('2026-08-22T17:10:00Z'), // 19:10 SAST, 5 minutes after the 19:05 kickoff
      );
      expect(component.isMatchUnderWay()).toBe(true);
    });

    it('a null kickoff_time on match day never claims under-way, even after the calendar date matches', async () => {
      const noKickoff = { ...BASE_FIXTURE, kickoff_time: null };
      const { html } = await renderWith(
        [fixtureMatcher([noKickoff]), h2hMatcher([])],
        '2026-08-22-new-zealand',
        () => new Date('2026-08-22T20:00:00Z'), // well after any plausible kickoff
      );

      expect(html.querySelector('[data-testid="match-under-way"]')).toBeNull();
      expect(html.querySelector('[data-testid="match-under-way-eyebrow"]')).toBeNull();
      expect(html.querySelector('[data-testid="fixture-kickoff"]')?.textContent?.trim()).toBe(
        'Kickoff not yet confirmed',
      );
    });

    it('does not render the match-day state on a different day entirely', async () => {
      const { html } = await renderWith(
        [fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])],
        '2026-08-22-new-zealand',
        () => new Date('2026-08-10T10:00:00Z'),
      );

      expect(html.querySelector('[data-testid="match-under-way"]')).toBeNull();
      expect(html.querySelector('[data-testid="fixture-kickoff"]')?.textContent?.trim()).toBe(
        '19:05 SAST',
      );
    });
  });

  describe('provenance line (D26/D28, docs/design.md §5.5/§6.2)', () => {
    it('renders the Wikipedia-flavoured provenance line with the source article link, fetched timestamp, and the BY-SA "modified" clause', async () => {
      const { html } = await renderWith([fixtureMatcher([BASE_FIXTURE]), h2hMatcher([])]);

      const provenance = html.querySelector('[data-testid="fixture-provenance"]');
      expect(provenance?.textContent).toContain('Fixture via');
      expect(provenance?.textContent).toContain('CC BY-SA 4.0');
      expect(provenance?.textContent).toContain('2026-08-01 12:13 SAST');
      // BY-SA 4.0 §3(a)(1)(B) requires indicating modifications made.
      expect(provenance?.textContent).toContain('modified: parsed and normalised from wikitext');
      const link = provenance?.querySelector('a[href*="2026_men"]');
      expect(link).toBeTruthy();
    });

    it('renders "Wikipedia" unlinked (no dead anchor) when a wikipedia-sourced row has no source_article_url', async () => {
      const noUrl = { ...BASE_FIXTURE, source_article_url: null };
      const { html } = await renderWith([fixtureMatcher([noUrl]), h2hMatcher([])]);

      const provenance = html.querySelector('[data-testid="fixture-provenance"]');
      expect(provenance?.textContent).toContain('Fixture via');
      expect(provenance?.textContent).toContain('Wikipedia');
      expect(provenance?.querySelector('a[href=""]')).toBeNull();
      expect(provenance?.querySelectorAll('a').length).toBe(1); // only the CC BY-SA licence link
    });

    it('renders the plain D28 provenance note (no article link) for an api-sports-sourced fixture', async () => {
      const apiFixture = { ...BASE_FIXTURE, source: 'api-sports', source_article_url: null };
      const { html } = await renderWith([fixtureMatcher([apiFixture]), h2hMatcher([])]);

      const provenance = html.querySelector('[data-testid="fixture-provenance"]');
      expect(provenance?.textContent).toContain('Fixtures via API-Sports');
      expect(provenance?.textContent).toContain('2026-08-01 12:13 SAST');
      expect(provenance?.querySelector('a')).toBeNull();
    });
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
    // Not yet confirmed is a fact about the source's current state, not the
    // D16 absent_in_source provenance state — italic is reserved for that
    // one job (design.md §3.1). This copy must use the page's own
    // non-italic `.fixture-fact-absent` class, never FieldValue's
    // `.field-absent` (which fixture-detail.css does not style as italic,
    // but `.field-absent` itself, defined globally, is).
    const kickoffSpan = html.querySelector('[data-testid="fixture-kickoff"] span');
    const venueSpan = html.querySelector('[data-testid="fixture-venue"] span');
    expect(kickoffSpan?.classList.contains('fixture-fact-absent')).toBe(true);
    expect(kickoffSpan?.classList.contains('field-absent')).toBe(false);
    expect(venueSpan?.classList.contains('fixture-fact-absent')).toBe(true);
    expect(venueSpan?.classList.contains('field-absent')).toBe(false);
  });

  it('resolves the D14 api-sports-over-wikipedia precedence when both sources have a row for the same date+opponent', async () => {
    const wikipediaRow = { ...BASE_FIXTURE, source: 'wikipedia', venue: 'Wikipedia-sourced venue' };
    const apiSportsRow = { ...BASE_FIXTURE, source: 'api-sports', venue: 'API-Sports-sourced venue' };

    const { html } = await renderWith([fixtureMatcher([wikipediaRow, apiSportsRow]), h2hMatcher([])]);

    expect(html.querySelector('[data-testid="fixture-venue"]')?.textContent).toContain(
      'API-Sports-sourced venue',
    );
    expect(html.textContent).not.toContain('Wikipedia-sourced venue');
    expect(html.querySelector('[data-testid="fixture-provenance"]')?.textContent).toContain(
      'Fixtures via API-Sports',
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
