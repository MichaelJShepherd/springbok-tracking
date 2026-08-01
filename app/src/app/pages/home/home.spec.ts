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

    const { html } = await renderWith([NO_FIXTURES, NO_LIVE_MATCH, latestResultMatcher(lastResult)]);

    const offSeason = html.querySelector('[data-testid="off-season"]');
    expect(offSeason?.textContent).toContain('No test scheduled');
    expect(offSeason?.textContent).toContain('Last result: South Africa 18–20 New Zealand');

    // The off-season card must never show a predictive "next window" note
    // (PRD D30) — there is no source for it.
    expect(html.textContent).not.toContain('next window');
    expect(html.querySelector('[data-testid="fixture-chips"]')).toBeNull();
    expect(html.querySelector('[data-testid="match-under-way"]')).toBeNull();
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
    ]);

    const chips = html.querySelectorAll('[data-testid="fixture-chips"] .chip');
    const labels = Array.from(chips).map((c) => c.textContent?.trim());
    expect(labels).toContain('Venue TBD');
    expect(labels).toContain('Kickoff TBD');
    expect(html.querySelector('[data-testid="off-season"]')).toBeNull();
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

    const { html } = await renderWith([NO_FIXTURES, liveMatchMatcher, latestResultMatcher(null)]);

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

    const { component, html } = await renderWith([failing, NO_LIVE_MATCH, latestResultMatcher(null)]);

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
});
