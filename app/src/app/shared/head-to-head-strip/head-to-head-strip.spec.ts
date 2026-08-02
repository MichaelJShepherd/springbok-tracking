import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HeadToHeadStrip } from './head-to-head-strip';
import { HeadToHeadSummary } from '../head-to-head';

/**
 * Direct unit coverage for the shared component (docs/design.md §7.3/§6.2,
 * #95 Gate 3 finding: shared infrastructure needs its own test, not just
 * consumer-level coverage through match-detail.spec.ts/fixture-detail.spec.ts
 * — a future third consumer could regress this component in a way neither
 * existing consumer's fixtures happen to exercise).
 */
function summary(overrides: Partial<HeadToHeadSummary> = {}): HeadToHeadSummary {
  return {
    total: 4,
    played: 4,
    unrecorded: 0,
    wins: 2,
    losses: 1,
    draws: 1,
    winPercent: 50,
    biggestWin: { matchId: 'm-win', matchDate: '2012-01-01', margin: 24, scoreLabel: '27–3', tied: false },
    biggestDefeat: { matchId: 'm-loss', matchDate: '2010-01-01', margin: 5, scoreLabel: '10–15', tied: false },
    extremesCaption: '',
    meetingNumber: 4,
    isFirstMeeting: false,
    matchFound: true,
    before: { wins: 2, losses: 1, draws: 0 },
    previousMeetings: [
      { match_id: 'm1', match_date: '2010-01-01', springboks_score: 10, springboks_score_provenance: 'present', opponent_score: 15, opponent_score_provenance: 'present', result: 'loss' },
    ],
    countCaption: 'From 4 tests against this opponent.',
    ...overrides,
  };
}

async function render(
  opponentName: string,
  s: HeadToHeadSummary,
): Promise<{ fixture: ComponentFixture<HeadToHeadStrip>; html: HTMLElement }> {
  await TestBed.configureTestingModule({
    imports: [HeadToHeadStrip],
    providers: [provideRouter([])],
  }).compileComponents();

  const fixture = TestBed.createComponent(HeadToHeadStrip);
  fixture.componentRef.setInput('opponentName', opponentName);
  fixture.componentRef.setInput('summary', s);
  fixture.detectChanges();

  return { fixture, html: fixture.nativeElement as HTMLElement };
}

describe('HeadToHeadStrip (docs/design.md §7.3/§6.2, shared by match-detail and fixture-detail, #95)', () => {
  it('renders the eyebrow, the P/W/L/D record, win %, and the extremes', async () => {
    const { html } = await render('New Zealand', summary());

    expect(html.querySelector('[data-testid="head-to-head"]')).toBeTruthy();
    expect(html.querySelector('.eyebrow')?.textContent).toContain('SOUTH AFRICA V NEW ZEALAND');
    expect(html.querySelector('.eyebrow')?.textContent).toContain('ALL TIME');
    expect(html.textContent).toContain('50%');
    expect(html.textContent).toContain('P 4');
    expect(html.textContent).toContain('W 2');
    expect(html.textContent).toContain('L 1');
    expect(html.textContent).toContain('D 1');
    expect(html.textContent).toContain('Biggest win 27–3');
    expect(html.textContent).toContain('Biggest defeat 10–15');
  });

  it('renders zone 3 ("the Nth meeting" / "before this match" / mini form) when matchFound is true', async () => {
    const { html } = await render('New Zealand', summary({ matchFound: true, meetingNumber: 4 }));

    expect(html.textContent).toContain('4th meeting');
    const before = html.querySelector('[data-testid="h2h-before"]');
    expect(before?.textContent).toContain('Before this match');
    expect(before?.textContent).toContain('W 2');
  });

  it('renders no meeting-number/before-this-match zone when matchFound is false', async () => {
    const { html } = await render('New Zealand', summary({ matchFound: false }));
    expect(html.textContent).not.toContain('meeting');
    expect(html.querySelector('[data-testid="h2h-before"]')).toBeNull();
  });

  it('renders "The first meeting" and omits "before this match" when isFirstMeeting is true', async () => {
    const { html } = await render(
      'Fiji',
      summary({ matchFound: true, isFirstMeeting: true, meetingNumber: 1, before: null, previousMeetings: [] }),
    );

    expect(html.textContent).toContain('The first meeting');
    expect(html.querySelector('[data-testid="h2h-before"]')).toBeNull();
  });

  it('renders the D33 count caption', async () => {
    const { html } = await render('New Zealand', summary({ countCaption: 'From 105 tests against New Zealand.' }));
    expect(html.querySelector('[data-testid="h2h-count-caption"]')?.textContent).toContain(
      'From 105 tests against New Zealand.',
    );
  });

  it('renders the absent state, never P0/W0/L0/D0, when total is zero', async () => {
    const { html } = await render(
      'Portugal',
      summary({
        total: 0,
        played: 0,
        unrecorded: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winPercent: null,
        biggestWin: null,
        biggestDefeat: null,
        matchFound: false,
        before: null,
        previousMeetings: [],
      }),
    );

    expect(html.querySelector('[data-testid="h2h-absent"]')?.textContent).toContain(
      'No meetings recorded against this opponent yet',
    );
    expect(html.textContent).not.toContain('P 0');
    expect(html.querySelector('[data-testid="h2h-count-caption"]')).toBeNull();
  });

  it('renders "no recorded results" instead of a bare percentage when winPercent is null but meetings exist', async () => {
    const { html } = await render('New Zealand', summary({ total: 1, played: 0, winPercent: null }));
    expect(html.textContent).toContain('No recorded results');
    expect(html.querySelector('.h2h-pct--empty')).toBeTruthy();
  });

  it('falls back to the extremes caption when neither a biggest win nor a biggest defeat is recorded', async () => {
    const { html } = await render(
      'New Zealand',
      summary({ biggestWin: null, biggestDefeat: null, extremesCaption: 'Not recorded for any meeting in this series.' }),
    );
    expect(html.textContent).toContain('Not recorded for any meeting in this series.');
  });
});
