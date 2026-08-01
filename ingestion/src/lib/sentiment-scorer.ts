// PRD D2: lexicon scoring, five-label banding, and the minimum-volume floor.
//
// D20 note for anyone extending this file: every function here takes plain
// strings in and returns numbers/labels/counts out — never pass a raw
// comment/headline string through to a return value, a thrown Error
// message, or a console.* call. `sentiment-retention.spec.ts` enforces this
// with a fixture marker string and fails the suite if it ever leaks.

import { LEXICON, MAX_ABS_WORD_SCORE, tokenize } from './sentiment-lexicon.js';

export type SentimentLabel = 'Despair' | 'Grumbling' | 'Mixed' | 'Upbeat' | 'Euphoric';

/** PRD D2 minimum-volume floor: below this many comments, a Reddit bucket is "too little discussion to score". */
export const MIN_REDDIT_COMMENTS = 25;
/** PRD D2 minimum-volume floor: below this many articles, a Guardian whole-match bucket is "too little discussion to score". */
export const MIN_GUARDIAN_ARTICLES = 5;

/**
 * Scores one piece of text against the lexicon. Returns the average score of
 * its matched sentiment-bearing words (not the running raw sum — a long
 * comment with one sad word should not out-rank a short but genuinely
 * upset one), or `null` if no lexicon word appears in it at all (a neutral
 * comment carries no signal, it is not scored as exactly 0).
 */
export function scoreOneText(text: string, lexicon: Record<string, number> = LEXICON): number | null {
  const matched = tokenize(text)
    .filter((token) => token in lexicon)
    .map((token) => lexicon[token]);
  if (matched.length === 0) return null;
  return matched.reduce((sum, v) => sum + v, 0) / matched.length;
}

/** Clamps a raw lexicon average into PRD D2's [-1, 1] score range. */
export function normaliseToUnitRange(rawAverage: number): number {
  return Math.max(-1, Math.min(1, rawAverage / MAX_ABS_WORD_SCORE));
}

/**
 * Scores a whole bucket's worth of texts (comments in a Reddit bucket, or
 * headline+standfirst strings in a Guardian whole-match bucket): averages
 * every text's own score, then normalises into [-1, 1]. Returns `null` when
 * none of the texts carried any lexicon-recognised word at all (distinct
 * from the volume floor, which is a *count* check the caller applies
 * separately — see MIN_REDDIT_COMMENTS/MIN_GUARDIAN_ARTICLES).
 */
export function scoreBucketTexts(texts: string[], lexicon: Record<string, number> = LEXICON): number | null {
  const perText = texts.map((t) => scoreOneText(t, lexicon)).filter((s): s is number => s !== null);
  if (perText.length === 0) return null;
  const average = perText.reduce((sum, v) => sum + v, 0) / perText.length;
  return normaliseToUnitRange(average);
}

/**
 * PRD D2's closed five-label vocabulary, mapped from score bands:
 * Despair [-1,-0.6), Grumbling [-0.6,-0.2), Mixed [-0.2,0.2], Upbeat (0.2,0.6], Euphoric (0.6,1].
 */
export function bandForScore(score: number): SentimentLabel {
  if (score < -0.6) return 'Despair';
  if (score < -0.2) return 'Grumbling';
  if (score <= 0.2) return 'Mixed';
  if (score <= 0.6) return 'Upbeat';
  return 'Euphoric';
}
