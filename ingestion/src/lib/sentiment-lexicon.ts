// PRD D2: "Producer = lexicon-based scoring (AFINN-style + small rugby
// lexicon); no LLM in v1." This file is a small, hand-written, original
// word list in the same spirit as the AFINN wordlist (single tokens mapped
// to an integer sentiment score) — it does NOT copy the real AFINN dataset.
// That keeps this project clear of AFINN's own licence/attribution terms
// (AGENTS.md 1.1: no third-party IP baked into this public repo) and keeps
// the whole scorer boringly simple (1.3): a plain object literal, no data
// file to fetch or parse, no dependency.
//
// Known, accepted limitation (documented rather than engineered around,
// 1.3): this is a bag-of-words scorer. It does not handle negation ("not
// good"), sarcasm, or word sense ("red card" vs "red rose" vs describing a
// losing side as "hammered"). PRD D2's accuracy bar (>=8/10 spot-checked
// matches directionally correct) is checked once, later, when live data
// flows — that check is explicitly out of scope for this task.

/** General-purpose sentiment words, AFINN-style (-5..+5, single lower-case tokens). */
export const GENERAL_LEXICON: Record<string, number> = {
  amazing: 4,
  awesome: 4,
  beautiful: 3,
  brilliant: 4,
  champion: 3,
  champions: 4,
  delight: 3,
  delighted: 3,
  excellent: 4,
  fantastic: 4,
  glorious: 4,
  glory: 3,
  good: 2,
  great: 3,
  happy: 3,
  hero: 3,
  impressive: 3,
  joy: 3,
  legend: 3,
  legendary: 4,
  love: 3,
  loved: 3,
  masterclass: 4,
  nice: 2,
  perfect: 4,
  pride: 2,
  proud: 3,
  relief: 2,
  solid: 2,
  strong: 2,
  superb: 4,
  win: 3,
  winning: 3,
  won: 3,

  angry: -2,
  annoyed: -2,
  awful: -4,
  bad: -2,
  disappointed: -2,
  disappointing: -2,
  disaster: -4,
  disgrace: -4,
  disgraceful: -4,
  embarrassing: -3,
  embarrassment: -3,
  fear: -2,
  furious: -3,
  garbage: -3,
  horrible: -3,
  hate: -3,
  hated: -3,
  humiliated: -4,
  humiliation: -4,
  lost: -2,
  losing: -2,
  loss: -2,
  pathetic: -3,
  poor: -2,
  rubbish: -3,
  sad: -2,
  scandal: -3,
  scandalous: -3,
  shambles: -4,
  terrible: -3,
  worried: -2,
  worst: -4,
};

/**
 * Small rugby-specific lexicon: match-thread/report vocabulary that isn't
 * covered by general-purpose sentiment word lists, but is common and
 * unambiguous enough to score directly. Deliberately excludes tokens whose
 * polarity flips with sentence context this bag-of-words scorer cannot see
 * (e.g. plain "red"/"tries"/"thrashed" — a losing side being "thrashed" and
 * a winning side "thrashing" someone read oppositely, so those are left out
 * rather than guessing).
 */
export const RUGBY_LEXICON: Record<string, number> = {
  bulldozed: 3,
  clinical: 3,
  dominance: 3,
  dominant: 3,
  gallant: 2,
  gritty: 2,
  heartbreak: -3,
  heartbreaking: -3,
  heroics: 3,
  outclassed: -3,
  rampant: 3,
  robbery: -3,
  spineless: -3,
  spirited: 2,
  steamrolled: 3,
  toothless: -3,
  valiant: 2,
  woeful: -4,
};

/** The combined lexicon `sentiment-scorer.ts` scores against by default. */
export const LEXICON: Record<string, number> = { ...GENERAL_LEXICON, ...RUGBY_LEXICON };

/** The largest absolute word score in `LEXICON` — used to normalise a raw average into [-1, 1]. */
export const MAX_ABS_WORD_SCORE = Math.max(...Object.values(LEXICON).map((v) => Math.abs(v)));

/** Splits free text into lower-case word tokens for lexicon lookup. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).map((t) => t.replace(/^'+|'+$/g, ''));
}
