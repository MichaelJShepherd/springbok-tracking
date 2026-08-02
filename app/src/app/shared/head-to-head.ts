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
  wins: number;
  losses: number;
  draws: number;
  winPercent: number | null;
  biggestWin: HeadToHeadExtreme | null;
  biggestDefeat: HeadToHeadExtreme | null;
  extremesCaption: string;
  meetingNumber: number;
  isFirstMeeting: boolean;
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
  const rows = [...allRows].sort((a, b) => a.match_date.localeCompare(b.match_date));
  const total = rows.length;

  const wins = rows.filter((r) => r.result === 'win').length;
  const losses = rows.filter((r) => r.result === 'loss').length;
  const draws = rows.filter((r) => r.result === 'draw').length;
  const played = wins + losses + draws;
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
  const meetingNumber = currentIndex >= 0 ? currentIndex + 1 : total;
  const isFirstMeeting = meetingNumber <= 1;

  const beforeRows = currentIndex > 0 ? rows.slice(0, currentIndex) : [];
  const before = isFirstMeeting
    ? null
    : {
        wins: beforeRows.filter((r) => r.result === 'win').length,
        losses: beforeRows.filter((r) => r.result === 'loss').length,
        draws: beforeRows.filter((r) => r.result === 'draw').length,
      };
  const previousMeetings = beforeRows.slice(-6);

  const countCaption =
    scored.length < total
      ? `From ${total} test${total === 1 ? '' : 's'} against this opponent; margins from the ${scored.length} with both scores recorded.`
      : `From ${total} test${total === 1 ? '' : 's'} against this opponent.`;

  return {
    total,
    wins,
    losses,
    draws,
    winPercent,
    biggestWin,
    biggestDefeat,
    extremesCaption,
    meetingNumber,
    isFirstMeeting,
    before,
    previousMeetings,
    countCaption,
  };
}
