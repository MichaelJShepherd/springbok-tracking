import { formatKickoffSAST } from './match-models';

describe('formatKickoffSAST', () => {
  it('formats a UTC kickoff ISO string as SA wall-clock time (SAST is UTC+2, no DST)', () => {
    // 2026-08-08T16:00:00+00:00 -> 18:00 in Africa/Johannesburg (J1: "kickoff
    // in SA time" on the next-fixture card, not the raw stored UTC string).
    expect(formatKickoffSAST('2026-08-08T16:00:00+00:00')).toBe('18:00 SAST');
  });

  it('formats a kickoff that crosses midnight in SA time', () => {
    // 2026-08-08T22:30:00+00:00 -> 00:30 the following SA calendar day.
    expect(formatKickoffSAST('2026-08-08T22:30:00+00:00')).toBe('00:30 SAST');
  });

  it('returns null unchanged for a null kickoff so D16 honest states are untouched', () => {
    expect(formatKickoffSAST(null)).toBeNull();
  });
});
