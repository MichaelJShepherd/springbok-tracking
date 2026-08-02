import { computeProgression, pointsFor, progressionFailureCopy } from './era-points';
import { MatchEventRow } from './match-detail-models';

function ev(overrides: Partial<MatchEventRow>): MatchEventRow {
  return {
    sequence_no: 1,
    event_type: 'penalty',
    team_side: 'springboks',
    description: null,
    description_provenance: 'present',
    minute: 10,
    minute_provenance: 'present',
    ...overrides,
  };
}

describe('pointsFor (docs/design.md §7.4 era table)', () => {
  it('returns null for any event before 1894 — the values moved three times and cannot be pinned', () => {
    expect(pointsFor('try', 1891)).toBeNull();
    expect(pointsFor('penalty', 1893)).toBeNull();
  });

  it('uses the 1992+ modern values (try=5) for a 1995 match', () => {
    expect(pointsFor('try', 1995)).toBe(5);
    expect(pointsFor('conversion', 1995)).toBe(2);
    expect(pointsFor('penalty', 1995)).toBe(3);
    expect(pointsFor('drop_goal', 1995)).toBe(3);
  });

  it('uses the 1894-1947 values (try=3, drop_goal=4)', () => {
    expect(pointsFor('try', 1920)).toBe(3);
    expect(pointsFor('drop_goal', 1920)).toBe(4);
  });
});

describe('computeProgression (the reconciliation gate, docs/design.md §7.4)', () => {
  it('reconciles the real 1995 World Cup final exactly, matching the design doc worked example', () => {
    // SA 3 penalties + 2 drop goals = 15; NZ 3 penalties + 1 drop goal = 12.
    const events: MatchEventRow[] = [
      ev({ sequence_no: 1, team_side: 'opponent', event_type: 'penalty', minute: 5 }),
      ev({ sequence_no: 2, team_side: 'springboks', event_type: 'penalty', minute: 10 }),
      ev({ sequence_no: 3, team_side: 'opponent', event_type: 'penalty', minute: 13 }),
      ev({ sequence_no: 4, team_side: 'springboks', event_type: 'penalty', minute: 22 }),
      ev({ sequence_no: 5, team_side: 'springboks', event_type: 'drop_goal', minute: 31 }),
      ev({ sequence_no: 6, team_side: 'opponent', event_type: 'drop_goal', minute: 55 }),
      ev({ sequence_no: 7, team_side: 'opponent', event_type: 'penalty', minute: 83 }),
      ev({ sequence_no: 8, team_side: 'springboks', event_type: 'penalty', minute: 90 }),
      ev({ sequence_no: 9, team_side: 'springboks', event_type: 'drop_goal', minute: 92 }),
    ];

    const result = computeProgression(events, 1995, 15, 12);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timedEventCount).toBe(9);
      expect(result.leadChanges).toBeGreaterThan(0);
      expect(result.points[result.points.length - 1]).toEqual({ m: 92, sa: 15, opp: 12 });
    }
  });

  it('fails the gate when any scoring event is untimed, and gives the untimed reason', () => {
    const events: MatchEventRow[] = [
      ev({ sequence_no: 1, team_side: 'springboks', event_type: 'try', minute: null, minute_provenance: 'absent_in_source' }),
    ];
    const result = computeProgression(events, 2015, 5, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('untimed');
      expect(progressionFailureCopy(result)).toContain("aren't recorded");
    }
  });

  it('fails the gate when the reconstruction does not equal the stored final score', () => {
    const events: MatchEventRow[] = [ev({ team_side: 'springboks', event_type: 'penalty', minute: 10 })];
    // Reconstructed SA total is 3 (one penalty), but the stored final score says 6.
    const result = computeProgression(events, 2015, 6, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('mismatch');
      expect(progressionFailureCopy(result)).toContain("don't add up");
    }
  });

  it('never charts a match before 1894, even if timed and reconciling by coincidence', () => {
    const events: MatchEventRow[] = [ev({ team_side: 'opponent', event_type: 'try', minute: 10 })];
    const result = computeProgression(events, 1891, 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('pre1894');
    }
  });

  it('fails with "none" when there are no scoring events at all', () => {
    const events: MatchEventRow[] = [ev({ event_type: 'yellow_card', team_side: 'springboks', minute: 5 })];
    const result = computeProgression(events, 2015, 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('none');
    }
  });

  it('counts a lead change only when a previous leader existed (taking the first lead is not a change)', () => {
    const events: MatchEventRow[] = [
      ev({ sequence_no: 1, team_side: 'springboks', event_type: 'try', minute: 5 }), // SA takes the lead 5-0: not a "change"
      ev({ sequence_no: 2, team_side: 'opponent', event_type: 'try', minute: 10 }), // NZ takes the lead: first real change
      ev({ sequence_no: 3, team_side: 'opponent', event_type: 'conversion', minute: 11 }),
    ];
    const result = computeProgression(events, 2015, 5, 7);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.leadChanges).toBe(1);
    }
  });
});
