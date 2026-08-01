import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatchTimeline } from './match-timeline';
import { SupabaseService } from '../../core/supabase.service';
import {
  createSupabaseStub,
  createUnreachableSupabaseStub,
  QueryMatcher,
} from '../../shared/testing/supabase-stub';

const BASE_MATCH = {
  match_id: '2024-09-07-argentina-1',
  match_date: '2024-09-07',
  competition: 'The Rugby Championship',
  competition_provenance: 'present',
  venue: 'Ellis Park, Johannesburg',
  venue_provenance: 'present',
  kickoff_time: null,
  kickoff_time_provenance: 'not_yet_fetched',
  springboks_score: 48,
  springboks_score_provenance: 'present',
  opponent_score: 7,
  opponent_score_provenance: 'present',
  result: 'win',
  source_article_url: 'https://en.wikipedia.org/wiki/2024_Rugby_Championship',
  teams: { canonical_name: 'Argentina' },
};

function matchMatcher(row: unknown = BASE_MATCH): QueryMatcher {
  return { table: 'matches', match: () => true, result: { data: row, error: null } };
}

function eventsMatcher(rows: unknown[]): QueryMatcher {
  return { table: 'match_events', match: () => true, result: { data: rows, error: null } };
}

function sentimentMatcher(rows: unknown[] | { error: unknown }): QueryMatcher {
  if (Array.isArray(rows)) {
    return { table: 'sentiment_scores', match: () => true, result: { data: rows, error: null } };
  }
  return { table: 'sentiment_scores', match: () => true, result: { data: null, error: rows.error } };
}

async function renderWith(
  matchers: QueryMatcher[],
): Promise<{ component: MatchTimeline; fixture: ComponentFixture<MatchTimeline>; html: HTMLElement }> {
  await TestBed.configureTestingModule({
    imports: [MatchTimeline],
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: createSupabaseStub(matchers) },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: BASE_MATCH.match_id }) } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(MatchTimeline);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { component, fixture, html: fixture.nativeElement as HTMLElement };
}

const TIMED_EVENT = {
  sequence_no: 1,
  event_type: 'try',
  team_side: 'springboks',
  description: 'Try, Arendse',
  description_provenance: 'present',
  minute: 6,
  minute_provenance: 'present',
};

const UNTIMED_EVENT = {
  sequence_no: 1,
  event_type: 'try',
  team_side: 'springboks',
  description: 'Try, scorer not recorded',
  description_provenance: 'present',
  minute: null,
  minute_provenance: 'absent_in_source',
};

describe('MatchTimeline', () => {
  it('plots an axis marker for a timed event but renders untimed events as an ordered strip with no clock (D11)', async () => {
    const { html } = await renderWith([
      matchMatcher(),
      eventsMatcher([UNTIMED_EVENT]),
      sentimentMatcher([]),
    ]);

    expect(html.querySelector('[data-testid="events-axis"]')).toBeNull();
    const strip = html.querySelector('[data-testid="events-strip"]');
    expect(strip?.textContent).toContain('Try');
    expect(strip?.querySelector('[data-testid="event-clock"]')).toBeNull();
  });

  it('renders the axis and a clock badge when a timed event exists', async () => {
    const { html } = await renderWith([
      matchMatcher(),
      eventsMatcher([TIMED_EVENT]),
      sentimentMatcher([]),
    ]);

    expect(html.querySelector('[data-testid="events-axis"]')).toBeTruthy();
    expect(html.querySelector('[data-testid="event-clock"]')?.textContent).toContain("6'");
  });

  it('renders the mood curve with vocabulary labels for a multi-bucket reddit match', async () => {
    const rows = [
      { bucket: 'pre_match', score: 0.1, label: 'Mixed', bucket_source_count: 40, too_few: false, source: 'reddit', source_url: 'https://reddit.com/x' },
      { bucket: 'first_half', score: 0.2, label: 'Mixed', bucket_source_count: 40, too_few: false, source: 'reddit', source_url: 'https://reddit.com/x' },
      { bucket: 'second_half', score: -0.5, label: 'Grumbling', bucket_source_count: 40, too_few: false, source: 'reddit', source_url: 'https://reddit.com/x' },
      { bucket: 'post_match', score: -0.1, label: 'Mixed', bucket_source_count: 40, too_few: false, source: 'reddit', source_url: 'https://reddit.com/x' },
    ];

    const { html } = await renderWith([matchMatcher(), eventsMatcher([TIMED_EVENT]), sentimentMatcher(rows)]);

    const curve = html.querySelector('[data-testid="mood-curve"]');
    expect(curve).toBeTruthy();
    const labels = Array.from(html.querySelectorAll('[data-testid="mood-label"]')).map((l) =>
      l.textContent?.trim(),
    );
    // Exactly the four match-time buckets, in fixed order (PRD D2), each
    // paired with its own label — not the fixture merely echoed back.
    expect(labels).toEqual([
      'Pre-match: Mixed',
      '1st half: Mixed',
      '2nd half: Grumbling',
      'Post-match: Mixed',
    ]);
    // Only the closed five-label vocabulary may appear as a mood label.
    const vocab = ['Despair', 'Grumbling', 'Mixed', 'Upbeat', 'Euphoric'];
    for (const label of labels) {
      expect(vocab.some((v) => label?.includes(v))).toBe(true);
    }
    expect(html.textContent).toContain('r/rugbyunion match thread');
  });

  it('renders the single-point variant for a Guardian-fallback match', async () => {
    const rows = [
      { bucket: 'whole_match', score: 0.45, label: 'Upbeat', bucket_source_count: 8, too_few: false, source: 'guardian', source_url: 'https://guardian.com/x' },
    ];

    const { html } = await renderWith([matchMatcher(), eventsMatcher([TIMED_EVENT]), sentimentMatcher(rows)]);

    expect(html.querySelector('[data-testid="mood-single-point"]')?.textContent).toContain('Upbeat');
    expect(html.querySelector('[data-testid="mood-curve"]')).toBeNull();
    expect(html.textContent).toContain('news headlines');
  });

  it('renders "too little discussion to score" instead of a number when too_few is set (D2 floor)', async () => {
    const rows = [
      { bucket: 'whole_match', score: null, label: null, bucket_source_count: 11, too_few: true, source: 'reddit', source_url: null },
    ];

    const { html } = await renderWith([matchMatcher(), eventsMatcher([TIMED_EVENT]), sentimentMatcher(rows)]);

    const tooFew = html.querySelector('[data-testid="mood-too-few"]');
    expect(tooFew?.textContent).toContain('Too little discussion to score');
    expect(html.querySelector('[data-testid="mood-curve"]')).toBeNull();
    expect(html.querySelector('[data-testid="mood-single-point"]')).toBeNull();
  });

  it('renders the honest "no sentiment sources for this era" note when there are no rows, for an old match (D3)', async () => {
    const { html } = await renderWith([matchMatcher(), eventsMatcher([UNTIMED_EVENT]), sentimentMatcher([])]);

    expect(html.querySelector('[data-testid="mood-no-sources"]')?.textContent).toContain(
      'No sentiment sources for this era',
    );
    // Events must still be fully rendered alongside the era note.
    expect(html.querySelector('[data-testid="events-strip"]')?.textContent).toContain('Try');
  });

  it('still renders events in full when the sentiment query fails (§2.4: mood never blocks events)', async () => {
    const { component, fixture, html } = await renderWith([
      matchMatcher(),
      eventsMatcher([TIMED_EVENT]),
      sentimentMatcher({ error: { message: 'sentiment source down' } }),
    ]);

    // Events content must be present and correct regardless of the mood query's fate.
    expect(component.state()).toBe('loaded');
    expect(html.querySelector('[data-testid="events-strip"]')?.textContent).toContain('Try');
    expect(html.querySelector('[data-testid="event-clock"]')?.textContent).toContain("6'");

    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.sentimentState()).toBe('error');
    expect(html.querySelector('[data-testid="mood-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });

  it('renders an honest error state instead of crashing when Supabase is entirely unreachable', async () => {
    await TestBed.configureTestingModule({
      imports: [MatchTimeline],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createUnreachableSupabaseStub() },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: BASE_MATCH.match_id }) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MatchTimeline);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="timeline-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );
  });
});
