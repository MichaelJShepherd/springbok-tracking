import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { History } from './history';
import { SupabaseService } from '../../core/supabase.service';
import {
  createSupabaseStub,
  createUnreachableSupabaseStub,
  QueryMatcher,
} from '../../shared/testing/supabase-stub';
import { MatchRow } from '../../shared/match-models';

function match(overrides: Partial<MatchRow>): MatchRow {
  return {
    match_id: 'm-1',
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
    ...overrides,
  };
}

function matchesMatcher(rows: MatchRow[]): QueryMatcher {
  return { table: 'matches', match: () => true, result: { data: rows, error: null } };
}

async function renderWith(rows: MatchRow[]): Promise<{
  component: History;
  fixture: ComponentFixture<History>;
  html: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [History],
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: createSupabaseStub([matchesMatcher(rows)]) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(History);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { component, fixture, html: fixture.nativeElement as HTMLElement };
}

function clickChip(html: HTMLElement, label: string): void {
  const chip = Array.from(html.querySelectorAll<HTMLButtonElement>('.chip')).find(
    (el) => el.textContent?.trim() === label,
  );
  if (!chip) {
    throw new Error(`No chip found with label "${label}"`);
  }
  chip.click();
}

/** Era selection now renders as index tabs (docs/design.md §6.1), not outline chips. */
function clickEraTab(html: HTMLElement, label: string): void {
  const tab = Array.from(html.querySelectorAll<HTMLButtonElement>('.index-tab')).find(
    (el) => el.textContent?.trim() === label,
  );
  if (!tab) {
    throw new Error(`No era tab found with label "${label}"`);
  }
  tab.click();
}

describe('History', () => {
  it('renders every D16 provenance state with its own distinct copy, never a blank cell', async () => {
    const rows = [
      match({
        match_id: 'present-row',
        match_date: '1995-06-24',
        venue: 'Ellis Park, Johannesburg',
        venue_provenance: 'present',
      }),
      match({
        match_id: 'absent-row',
        match_date: '2016-01-01',
        venue: null,
        venue_provenance: 'absent_in_source',
      }),
      match({
        match_id: 'loading-row',
        match_date: '2017-01-01',
        venue: null,
        venue_provenance: 'not_yet_fetched',
      }),
      match({
        match_id: 'failed-row',
        match_date: '2018-01-01',
        venue: null,
        venue_provenance: 'fetch_failed',
      }),
    ];

    const { html } = await renderWith(rows);

    const rowTextFor = (date: string) =>
      Array.from(html.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(date))
        ?.textContent ?? '';

    expect(rowTextFor('1995-06-24')).toContain('Ellis Park, Johannesburg');
    expect(rowTextFor('2016-01-01')).toContain('not recorded');
    expect(rowTextFor('2018-01-01')).toContain('temporarily unavailable');

    // not_yet_fetched renders a shimmer element with no literal copy — assert
    // the element exists rather than asserting on absent text.
    const loadingRow = Array.from(html.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('2017-01-01'),
    );
    expect(loadingRow?.querySelector('.field-loading')).toBeTruthy();
  });

  it('filters the table by opponent, competition, and era, combined with AND', async () => {
    const rows = [
      match({
        match_id: 'nz-1995',
        match_date: '1995-06-24',
        competition: 'Rugby World Cup Final',
        teams: { canonical_name: 'New Zealand' },
      }),
      match({
        match_id: 'eng-2007',
        match_date: '2007-10-20',
        competition: 'Rugby World Cup Final',
        teams: { canonical_name: 'England' },
      }),
      match({
        match_id: 'nz-2015',
        match_date: '2015-10-24',
        competition: 'Rugby World Cup Semi-Final',
        teams: { canonical_name: 'New Zealand' },
      }),
    ];

    const { component, fixture, html } = await renderWith(rows);
    const rowIds = () => Array.from(html.querySelectorAll('tbody tr')).map((tr) => tr.textContent);

    expect(component.filtered().length).toBe(3);

    clickChip(html, 'New Zealand');
    fixture.detectChanges();
    expect(component.filtered().map((m) => m.match_id).sort()).toEqual(['nz-1995', 'nz-2015']);
    expect(rowIds().length).toBe(2);

    clickChip(html, 'Rugby World Cup Final');
    fixture.detectChanges();
    expect(component.filtered().map((m) => m.match_id)).toEqual(['nz-1995']);

    // Toggling the same opponent chip again clears that filter, leaving only
    // the competition filter applied.
    clickChip(html, 'New Zealand');
    fixture.detectChanges();
    expect(component.filtered().map((m) => m.match_id).sort()).toEqual(['eng-2007', 'nz-1995']);
  });

  it('shows an honest empty state when the filters exclude every match', async () => {
    const rows = [
      match({
        match_id: 'nz-1995',
        match_date: '1995-06-24',
        teams: { canonical_name: 'New Zealand' },
      }),
      match({
        match_id: 'eng-2007',
        match_date: '2007-10-20',
        teams: { canonical_name: 'England' },
      }),
    ];

    const { fixture, html } = await renderWith(rows);

    expect(html.querySelector('[data-testid="history-empty"]')).toBeNull();

    // New Zealand only played in the 1950–1995 bucket row above, so
    // combining it with the 1996–2010 era tab must AND down to zero
    // matches, not silently OR them.
    clickChip(html, 'New Zealand');
    fixture.detectChanges();
    clickEraTab(html, '1996–2010');
    fixture.detectChanges();

    expect(html.querySelector('[data-testid="history-table"]')).toBeNull();
    expect(html.querySelector('[data-testid="history-empty"]')?.textContent).toContain(
      'No matches found',
    );
  });

  it('renders an honest error state instead of throwing when Supabase is unreachable', async () => {
    await TestBed.configureTestingModule({
      imports: [History],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createUnreachableSupabaseStub() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(History);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="history-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });

  describe('the record by era (docs/design.md §7.2, D34)', () => {
    it('excludes unrecorded results from the win-% denominator and states the caption', async () => {
      const rows = [
        match({ match_id: 'a', match_date: '1994-01-01', result: 'win' }),
        match({ match_id: 'b', match_date: '1994-06-01', result: 'win' }),
        match({ match_id: 'c', match_date: '1994-08-01', result: 'loss' }),
        match({ match_id: 'd', match_date: '1994-09-01', result: null }),
      ];

      const { html } = await renderWith(rows);
      const column = Array.from(html.querySelectorAll('[data-testid="era-column"]')).find((el) =>
        el.textContent?.includes('1950–1995'),
      );
      expect(column).toBeTruthy();
      // 2 of 3 tests with a recorded result were won -> 67%, not diluted by the unrecorded row.
      expect(column?.textContent).toContain('67%');
      expect(column?.textContent).toContain('P 3');
      expect(html.querySelector('[data-testid="era-caption"]')?.textContent).toContain(
        '1950–1995: 3 of 4 tests have a recorded result',
      );
    });

    it('renders "no tests recorded" in italic rather than 0% for an era with zero rows', async () => {
      const rows = [match({ match_id: 'a', match_date: '2015-10-24', result: 'loss' })];
      const { html } = await renderWith(rows);

      const column = Array.from(html.querySelectorAll('[data-testid="era-column"]')).find((el) =>
        el.textContent?.includes('Pre-1950'),
      );
      expect(column?.textContent).not.toContain('0%');
      expect(column?.querySelector('.era-empty')?.textContent).toContain('No tests recorded');
    });

    it('renders "No recorded results" (never a dishonest 0%) for an era with tests but no recorded result', async () => {
      const rows = [
        match({ match_id: 'a', match_date: '2000-01-01', result: null }),
        match({ match_id: 'b', match_date: '2005-01-01', result: null }),
      ];
      const { html } = await renderWith(rows);

      const column = Array.from(html.querySelectorAll('[data-testid="era-column"]')).find((el) =>
        el.textContent?.includes('1996–2010'),
      );
      expect(column?.querySelector('.era-empty')?.textContent).toContain('No recorded results');
      // Both rows are unrecorded, so a naive win% (dividing by max(played,1)
      // instead of excluding the unrecorded rows from the denominator)
      // would render "0%" here — that must never appear.
      expect(column?.textContent).not.toContain('0%');
    });

    it('applies the era filter when a column is clicked', async () => {
      const rows = [
        match({ match_id: 'old', match_date: '1930-01-01', result: 'win' }),
        match({ match_id: 'new', match_date: '2020-01-01', result: 'loss' }),
      ];
      const { component, fixture, html } = await renderWith(rows);

      const column = Array.from(
        html.querySelectorAll<HTMLButtonElement>('[data-testid="era-column"]'),
      ).find((el) => el.textContent?.includes('Pre-1950'));
      column?.click();
      fixture.detectChanges();

      expect(component.filtered().map((m) => m.match_id)).toEqual(['old']);
    });
  });
});
