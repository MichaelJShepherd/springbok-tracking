import { HeadToHeadRow, buildHeadToHead } from './head-to-head';

function row(overrides: Partial<HeadToHeadRow>): HeadToHeadRow {
  return {
    match_id: 'm',
    match_date: '2000-01-01',
    springboks_score: 20,
    springboks_score_provenance: 'present',
    opponent_score: 10,
    opponent_score_provenance: 'present',
    result: 'win',
    ...overrides,
  };
}

describe('buildHeadToHead (docs/design.md §7.3)', () => {
  it('computes the all-time record, extremes, and the record before this match', () => {
    const rows: HeadToHeadRow[] = [
      row({ match_id: 'm1', match_date: '2010-01-01', result: 'loss', springboks_score: 10, opponent_score: 15 }),
      row({ match_id: 'm2', match_date: '2012-01-01', result: 'win', springboks_score: 27, opponent_score: 3 }),
      row({ match_id: 'm3', match_date: '2015-01-01', result: 'win', springboks_score: 20, opponent_score: 18 }),
      row({ match_id: 'm4', match_date: '2018-01-01', result: 'draw', springboks_score: 10, opponent_score: 10 }),
    ];

    const h2h = buildHeadToHead(rows, 'm4');

    expect(h2h.total).toBe(4);
    expect(h2h.wins).toBe(2);
    expect(h2h.losses).toBe(1);
    expect(h2h.draws).toBe(1);
    expect(h2h.winPercent).toBe(50);
    expect(h2h.biggestWin?.scoreLabel).toBe('27–3');
    expect(h2h.biggestDefeat?.scoreLabel).toBe('10–15');
    expect(h2h.meetingNumber).toBe(4);
    expect(h2h.isFirstMeeting).toBe(false);
    expect(h2h.before).toEqual({ wins: 2, losses: 1, draws: 0 });
  });

  it('renders the first-meeting state as absent, not zeroes', () => {
    const rows: HeadToHeadRow[] = [row({ match_id: 'only', match_date: '2026-01-01', result: 'win' })];
    const h2h = buildHeadToHead(rows, 'only');

    expect(h2h.isFirstMeeting).toBe(true);
    expect(h2h.meetingNumber).toBe(1);
    expect(h2h.before).toBeNull();
    expect(h2h.previousMeetings).toEqual([]);
  });

  it('excludes rows without both scores present from the biggest-win/defeat search, and states the caption', () => {
    const rows: HeadToHeadRow[] = [
      row({
        match_id: 'm1',
        match_date: '1891-01-01',
        result: 'loss',
        springboks_score: null,
        springboks_score_provenance: 'absent_in_source',
        opponent_score: 4,
        opponent_score_provenance: 'present',
      }),
      row({ match_id: 'm2', match_date: '2020-01-01', result: 'win', springboks_score: 30, opponent_score: 10 }),
    ];

    const h2h = buildHeadToHead(rows, 'm2');
    expect(h2h.biggestWin?.matchId).toBe('m2');
    expect(h2h.countCaption).toContain('From 2 tests against this opponent; margins from the 1');
  });

  it('reports no qualifying meeting honestly when no meeting has both scores recorded', () => {
    const rows: HeadToHeadRow[] = [
      row({
        match_id: 'm1',
        springboks_score: null,
        springboks_score_provenance: 'absent_in_source',
        opponent_score: null,
        opponent_score_provenance: 'absent_in_source',
      }),
    ];
    const h2h = buildHeadToHead(rows, 'm1');
    expect(h2h.biggestWin).toBeNull();
    expect(h2h.biggestDefeat).toBeNull();
    expect(h2h.extremesCaption).toContain('Not recorded for any meeting');
  });
});
