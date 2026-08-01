import { describe, expect, it } from 'vitest';
import {
  MIN_GUARDIAN_ARTICLES,
  MIN_REDDIT_COMMENTS,
  bandForScore,
  normaliseToUnitRange,
  scoreBucketTexts,
  scoreOneText,
} from './sentiment-scorer.js';
import { MAX_ABS_WORD_SCORE, tokenize } from './sentiment-lexicon.js';

describe('tokenize', () => {
  it('lower-cases and splits on non-letter characters', () => {
    expect(tokenize('Brilliant, absolutely BRILLIANT!')).toEqual(['brilliant', 'absolutely', 'brilliant']);
  });

  it('keeps internal apostrophes but strips surrounding quote punctuation', () => {
    expect(tokenize("that's 'amazing'")).toEqual(["that's", 'amazing']);
  });
});

describe('scoreOneText', () => {
  it('returns null for text with no recognised sentiment word', () => {
    expect(scoreOneText('the match kicks off at three')).toBeNull();
  });

  it('averages matched word scores rather than summing them', () => {
    // "great" (3) and "good" (2) -> average 2.5, not the raw sum 5.
    expect(scoreOneText('a great and good performance')).toBeCloseTo(2.5, 5);
  });

  it('scores a clearly negative comment negative', () => {
    const score = scoreOneText('what a shambles, absolutely pathetic and woeful');
    expect(score).not.toBeNull();
    expect(score as number).toBeLessThan(0);
  });

  it('is case-insensitive', () => {
    const upper = scoreOneText('BRILLIANT');
    const lower = scoreOneText('brilliant');
    expect(upper).not.toBeNull();
    expect(upper).toBe(lower);
  });

  it('scores a known single word to its literal lexicon value (pinned, not derived from the lexicon import)', () => {
    // "brilliant" is documented in sentiment-lexicon.ts as 4 — if that value
    // ever silently changes, this literal-expectation test must fail, unlike
    // a test that re-imports the same constant to compare against itself.
    expect(scoreOneText('brilliant')).toBe(4);
  });
});

describe('normaliseToUnitRange', () => {
  it('clamps to [-1, 1]', () => {
    expect(normaliseToUnitRange(MAX_ABS_WORD_SCORE * 10)).toBe(1);
    expect(normaliseToUnitRange(-MAX_ABS_WORD_SCORE * 10)).toBe(-1);
  });

  it('divides by the lexicon max absolute word score', () => {
    expect(normaliseToUnitRange(MAX_ABS_WORD_SCORE)).toBe(1);
    expect(normaliseToUnitRange(MAX_ABS_WORD_SCORE / 2)).toBeCloseTo(0.5, 5);
  });

  it('MAX_ABS_WORD_SCORE is pinned to a literal value, not just internally consistent with itself', () => {
    // A mutation that scales MAX_ABS_WORD_SCORE (e.g. to 20) would leave every
    // *other* test in this file green, because they all re-derive their
    // expectation from the same imported constant — this is the one test that
    // would actually catch that mutation.
    expect(MAX_ABS_WORD_SCORE).toBe(4);
  });

  it('end-to-end: scoring a single maximally-positive word bands as Euphoric, using literal expected values', () => {
    // "brilliant" (4) is the lexicon's own maximum -> normalised score is
    // exactly 1, which must land in the Euphoric band. Every number here is a
    // literal, not computed from sentiment-lexicon.ts's exports.
    const score = scoreBucketTexts(['brilliant']);
    expect(score).toBe(1);
    expect(bandForScore(score as number)).toBe('Euphoric');
  });
});

describe('scoreBucketTexts', () => {
  it('returns null when nothing in the bucket carries a recognised word', () => {
    expect(scoreBucketTexts(['what time is it', 'anyone else watching'])).toBeNull();
  });

  it('averages per-text scores, not per-word — one very wordy comment cannot dominate a short one', () => {
    const wordy = 'great '.repeat(50).trim(); // still averages to the same per-text score as one "great"
    const short = 'terrible';
    const score = scoreBucketTexts([wordy, short]);
    // great=3 -> normalised 3/MAX, terrible=-3 -> normalised -3/MAX; average should be ~0, not skewed toward "wordy".
    expect(score).toBeCloseTo(0, 5);
  });

  it('ignores texts with no recognised word rather than treating them as neutral zeros that dilute the score', () => {
    const withNoise = scoreBucketTexts(['amazing performance', 'what time is kickoff', 'the weather was fine today']);
    const withoutNoise = scoreBucketTexts(['amazing performance']);
    expect(withoutNoise).not.toBeNull();
    expect(withNoise).toBe(withoutNoise);
  });
});

describe('bandForScore — PRD D2 five-label vocabulary boundaries', () => {
  it('Despair: [-1, -0.6)', () => {
    expect(bandForScore(-1)).toBe('Despair');
    expect(bandForScore(-0.99)).toBe('Despair');
  });

  it('Grumbling: [-0.6, -0.2) — -0.6 itself is Grumbling, not Despair', () => {
    expect(bandForScore(-0.6)).toBe('Grumbling');
    expect(bandForScore(-0.21)).toBe('Grumbling');
  });

  it('Mixed: [-0.2, 0.2] — inclusive both ends', () => {
    expect(bandForScore(-0.2)).toBe('Mixed');
    expect(bandForScore(0)).toBe('Mixed');
    expect(bandForScore(0.2)).toBe('Mixed');
  });

  it('Upbeat: (0.2, 0.6] — 0.6 itself is Upbeat, not Euphoric', () => {
    expect(bandForScore(0.21)).toBe('Upbeat');
    expect(bandForScore(0.6)).toBe('Upbeat');
  });

  it('Euphoric: (0.6, 1]', () => {
    expect(bandForScore(0.61)).toBe('Euphoric');
    expect(bandForScore(1)).toBe('Euphoric');
  });
});

describe('PRD D2 minimum-volume floor constants', () => {
  it('Reddit floor is 25 comments', () => {
    expect(MIN_REDDIT_COMMENTS).toBe(25);
  });

  it('Guardian floor is 5 articles', () => {
    expect(MIN_GUARDIAN_ARTICLES).toBe(5);
  });
});
