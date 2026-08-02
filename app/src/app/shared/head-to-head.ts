import { Provenance } from './provenance';

/** "1st" / "2nd" / "3rd" / "4th"... for "the Nth meeting" (docs/design.md §7.3). */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** One row of the opponent-history query behind the head-to-head strip (docs/design.md §7.3). */
export interface HeadToHeadRow {
  match_id: string;
  match_date: string;
  springboks_score: number | null;
  springboks_score_provenance: Provenance;
  opponent_score: number | null;
  opponent_score_provenance: Provenance;
  result: 'win' | 'loss' | 'draw' | null;
}

export interface HeadToHeadExtreme {
  matchId: string;
  matchDate: string;
  margin: number;
  scoreLabel: string;
  tied: boolean;
}

export interface HeadToHeadSummary {
  total: number;
  played: number;
  unrecorded: number;
  wins: number;
  losses: number;
  draws: number;
  winPercent: number | null;
  biggestWin: HeadToHeadExtreme | null;
  biggestDefeat: HeadToHeadExtreme | null;
  extremesCaption: string;
  meetingNumber: number;
  isFirstMeeting: boolean;
  matchFound: boolean;
  before: { wins: number; losses: number; draws: number } | null;
  previousMeetings: HeadToHeadRow[];
  countCaption: string;
}

/**
 * All arithmetic for the head-to-head strip (docs/design.md §7.3), computed
 * client-side over one indexed `anon` read of `matches` filtered by
 * opponent. `allRows` is every meeting against this opponent (any date,
 * ascending or descending — sorted internally), `currentMatchId` identifies
 * which meeting the fan is looking at.
 */
export function buildHeadToHead(allRows: HeadToHeadRow[], currentMatchId: string): HeadToHeadSummary {
  // D13: sort by (match_date, sequence) — same-day double-headers would
  // otherwise be ordered arbitrarily by date alone. `sequence` is derivable
  // from the trailing `-N` on `match_id` (e.g. `2020-01-01-fiji-2`).
  const sequenceOf = (row: HeadToHeadRow): number => {
    const match = /-(\d+)$/.exec(row.match_id);
    return match ? Number(match[1]) : 0;
  };
  const rows = [...allRows].sort((a, b) => {
    const byDate = a.match_date.localeCompare(b.match_date);
    return byDate !== 0 ? byDate : sequenceOf(a) - sequenceOf(b);
  });
  const total = rows.length;

  const wins = rows.filter((r) => r.result === 'win').length;
  const losses = rows.filter((r) => r.result === 'loss').length;
  const draws = rows.filter((r) => r.result === 'draw').length;
  const played = wins + losses + draws;
  const unrecorded = total - played;
  const winPercent = played > 0 ? Math.round((wins / played) * 100) : null;

  const scored = rows.filter(
    (r) => r.springboks_score_provenance === 'present' && r.opponent_score_provenance === 'present',
  );

  let biggestWin: HeadToHeadExtreme | null = null;
  let biggestDefeat: HeadToHeadExtreme | null = null;
  let winTies = 0;
  let defeatTies = 0;

  for (const r of scored) {
    const margin = (r.springboks_score ?? 0) - (r.opponent_score ?? 0);
    const scoreLabel = `${r.springboks_score}–${r.opponent_score}`;
    if (margin > 0) {
      if (!biggestWin || margin > biggestWin.margin) {
        biggestWin = { matchId: r.match_id, matchDate: r.match_date, margin, scoreLabel, tied: false };
        winTies = 0;
      } else if (margin === biggestWin.margin) {
        winTies++;
        biggestWin.tied = true;
      }
    } else if (margin < 0) {
      const absMargin = -margin;
      if (!biggestDefeat || absMargin > biggestDefeat.margin) {
        biggestDefeat = {
          matchId: r.match_id,
          matchDate: r.match_date,
          margin: absMargin,
          scoreLabel,
          tied: false,
        };
        defeatTies = 0;
      } else if (absMargin === biggestDefeat.margin) {
        defeatTies++;
        biggestDefeat.tied = true;
      }
    }
  }

  let extremesCaption: string;
  if (!biggestWin && !biggestDefeat) {
    extremesCaption = 'Not recorded for any meeting in this series.';
  } else {
    const parts: string[] = [];
    if (biggestWin) {
      parts.push(
        `Biggest win ${biggestWin.scoreLabel}${biggestWin.tied ? ' (equalled ' + (winTies + 1) + ' times)' : ''}`,
      );
    }
    if (biggestDefeat) {
      parts.push(
        `Biggest defeat ${biggestDefeat.scoreLabel}${biggestDefeat.tied ? ' (equalled ' + (defeatTies + 1) + ' times)' : ''}`,
      );
    }
    extremesCaption = parts.join(' · ');
  }

  const currentIndex = rows.findIndex((r) => r.match_id === currentMatchId);
  // If the current match isn't among `allRows` (a bad opponent_team_id, or a
  // race with the head-to-head query), there is no honest "Nth meeting" or
  // "before this match" to report — render nothing for those zones rather
  // than a fabricated meetingNumber = total / "W 0 · L 0 · D 0" (Gate 2).
  const matchFound = currentIndex >= 0;
  const meetingNumber = matchFound ? currentIndex + 1 : 0;
  const isFirstMeeting = matchFound && meetingNumber <= 1;

  const beforeRows = matchFound && currentIndex > 0 ? rows.slice(0, currentIndex) : [];
  const before =
    matchFound && !isFirstMeeting
      ? {
          wins: beforeRows.filter((r) => r.result === 'win').length,
          losses: beforeRows.filter((r) => r.result === 'loss').length,
          draws: beforeRows.filter((r) => r.result === 'draw').length,
        }
      : null;
  const previousMeetings = matchFound ? beforeRows.slice(-6) : [];

  // D33: state the win-% denominator and the excluded/unrecorded count,
  // mirroring the era-strip's treatment (docs/design.md §7.2).
  const recordedNote =
    unrecorded > 0
      ? `Win % of the ${played} of ${total} meeting${total === 1 ? '' : 's'} with a recorded result; ${unrecorded} not recorded.`
      : `From ${total} test${total === 1 ? '' : 's'} against this opponent.`;
  const marginsNote =
    scored.length < total ? ` Margins from the ${scored.length} with both scores recorded.` : '';
  const countCaption = `${recordedNote}${marginsNote}`;

  return {
    total,
    played,
    unrecorded,
    wins,
    losses,
    draws,
    winPercent,
    biggestWin,
    biggestDefeat,
    extremesCaption,
    meetingNumber,
    isFirstMeeting,
    matchFound,
    before,
    previousMeetings,
    countCaption,
  };
}
