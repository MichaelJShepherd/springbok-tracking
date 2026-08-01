// PRD D2 bucketing: "Buckets (pre-match / 1st half / 2nd half / post-match)
// apply only where a kickoff timestamp exists; otherwise one whole-match
// bucket." This module assigns one comment timestamp to one bucket given a
// match's kickoff time (or the absence of one).

export type SentimentBucket = 'pre_match' | 'first_half' | 'second_half' | 'post_match' | 'whole_match';

/** A standard rugby union half, in minutes (excludes stoppage time, which is absorbed into the tolerance below). */
const HALF_DURATION_MINUTES = 40;
/** Typical rugby halftime interval, in minutes. */
const HALFTIME_BREAK_MINUTES = 15;
/** Second-half boundary in minutes-from-kickoff: two halves + the break, with a little stoppage-time tolerance folded in. */
const SECOND_HALF_END_MINUTES = HALF_DURATION_MINUTES * 2 + HALFTIME_BREAK_MINUTES;

/**
 * Buckets a single comment timestamp relative to kickoff. When `kickoffTime`
 * is `null` (no kickoff timestamp exists for this match, per D16/D2), every
 * comment falls into the single `whole_match` bucket regardless of when it
 * was posted.
 *
 * This is a simple, documented heuristic (AGENTS.md 1.3) rather than a real
 * play-by-play clock: it does not know about extra time, and stoppage time
 * is absorbed into `SECOND_HALF_END_MINUTES`'s tolerance rather than
 * measured. Good enough for a coarse four-bucket mood curve; not a claim of
 * minute-perfect accuracy.
 */
export function bucketForTimestamp(commentTime: Date, kickoffTime: Date | null): SentimentBucket {
  if (!kickoffTime) return 'whole_match';
  const minutesFromKickoff = (commentTime.getTime() - kickoffTime.getTime()) / 60_000;
  if (minutesFromKickoff < 0) return 'pre_match';
  if (minutesFromKickoff < HALF_DURATION_MINUTES) return 'first_half';
  if (minutesFromKickoff < SECOND_HALF_END_MINUTES) return 'second_half';
  return 'post_match';
}

/** The four buckets that apply when a kickoff timestamp exists, in match order. */
export const TIMED_BUCKETS: readonly SentimentBucket[] = ['pre_match', 'first_half', 'second_half', 'post_match'];
/** The one bucket that applies when no kickoff timestamp exists. */
export const WHOLE_MATCH_BUCKETS: readonly SentimentBucket[] = ['whole_match'];
