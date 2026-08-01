// Assembles `sentiment_scores` rows from raw comments/articles (PRD D2).
// Kept as small, pure functions separate from scripts/sentiment.ts so the
// D20 retention invariant — no comment/headline text ever leaves this
// module in the *returned rows* — has one narrow, directly-testable seam
// (see `sentiment-retention.spec.ts`). Nothing in this file calls
// console.* or Postgres; it only transforms arrays of text into the
// scores/counts/labels PRD D20 permits to be persisted.

import type { RedditComment } from './reddit-client.js';
import type { GuardianArticle } from './guardian-client.js';
import { bucketForTimestamp, TIMED_BUCKETS, WHOLE_MATCH_BUCKETS, type SentimentBucket } from './sentiment-buckets.js';
import { MIN_GUARDIAN_ARTICLES, MIN_REDDIT_COMMENTS, bandForScore, scoreBucketTexts } from './sentiment-scorer.js';
import type { SentimentLabel } from './sentiment-scorer.js';

/**
 * The only shape ever written to `sentiment_scores` (D20: "derived scores +
 * counts/labels only" — no field here can hold source text). Keep this
 * interface as the single source of truth for that column set; the
 * retention test asserts every row built by this module has exactly these
 * keys.
 */
export interface SentimentRow {
  match_id: string;
  bucket: SentimentBucket;
  score: number | null;
  label: SentimentLabel | null;
  bucket_source_count: number;
  too_few: boolean;
  source: 'reddit' | 'guardian';
  source_url: string | null;
}

function rowFor(
  matchId: string,
  bucket: SentimentBucket,
  texts: string[],
  minVolume: number,
  source: SentimentRow['source'],
  sourceUrl: string | null,
): SentimentRow {
  const tooFew = texts.length < minVolume;
  const score = tooFew ? null : scoreBucketTexts(texts);
  return {
    match_id: matchId,
    bucket,
    score,
    label: score === null ? null : bandForScore(score),
    bucket_source_count: texts.length,
    too_few: tooFew,
    source,
    source_url: sourceUrl,
  };
}

/**
 * Builds the Reddit `sentiment_scores` rows for one match: one row per
 * applicable bucket (four, if `kickoffTime` is known; one `whole_match` row
 * otherwise, per PRD D2/D3). Comment bodies are read only long enough to
 * bucket and score them — the returned rows never carry a body string.
 */
export function buildRedditRows(
  matchId: string,
  comments: RedditComment[],
  kickoffTime: Date | null,
  threadUrl: string | null,
): SentimentRow[] {
  const buckets = kickoffTime ? TIMED_BUCKETS : WHOLE_MATCH_BUCKETS;
  const textsByBucket = new Map<SentimentBucket, string[]>(buckets.map((b) => [b, []]));
  for (const comment of comments) {
    const bucket = bucketForTimestamp(new Date(comment.createdUtc * 1000), kickoffTime);
    textsByBucket.get(bucket)?.push(comment.body);
  }
  return buckets.map((bucket) =>
    rowFor(matchId, bucket, textsByBucket.get(bucket) ?? [], MIN_REDDIT_COMMENTS, 'reddit', threadUrl),
  );
}

/**
 * Builds the single Guardian `whole_match` row for one match (D2: "Guardian
 * path (fallback): one whole-match bucket only" — headlines have no match
 * clock, so no bucketing by kickoff time applies here).
 */
export function buildGuardianRow(matchId: string, articles: GuardianArticle[]): SentimentRow {
  const texts = articles.map((a) => (a.standfirst ? `${a.headline} ${a.standfirst}` : a.headline));
  return rowFor(matchId, 'whole_match', texts, MIN_GUARDIAN_ARTICLES, 'guardian', articles[0]?.webUrl ?? null);
}
