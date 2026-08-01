import { describe, expect, it } from 'vitest';
import { buildGuardianRow, buildRedditRows } from './sentiment-pipeline.js';
import type { RedditComment } from './reddit-client.js';
import type { GuardianArticle } from './guardian-client.js';

const KICKOFF = new Date('2026-07-04T15:00:00Z');

function comment(body: string, minutesAfterKickoff: number): RedditComment {
  return { body, createdUtc: Math.floor((KICKOFF.getTime() + minutesAfterKickoff * 60_000) / 1000) };
}

describe('buildRedditRows', () => {
  it('produces one row per timed bucket when a kickoff time is known (PRD D2)', () => {
    const comments = [comment('excited', -10), comment('brilliant', 10), comment('shambles', 60), comment('proud', 120)];
    const rows = buildRedditRows('m1', comments, KICKOFF, 'https://reddit.test/thread');
    expect(rows.map((r) => r.bucket)).toEqual(['pre_match', 'first_half', 'second_half', 'post_match']);
    expect(rows.every((r) => r.source === 'reddit')).toBe(true);
    expect(rows.every((r) => r.source_url === 'https://reddit.test/thread')).toBe(true);
    expect(rows.every((r) => r.match_id === 'm1')).toBe(true);
  });

  it('produces a single whole_match row when no kickoff time is known (PRD D2/D3)', () => {
    const comments = Array.from({ length: 3 }, (_, i) => comment('great stuff', i));
    const rows = buildRedditRows('m2', comments, null, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].bucket).toBe('whole_match');
  });

  it('applies the 25-comment minimum-volume floor per bucket independently', () => {
    // Only the pre_match bucket gets 25+ comments; the rest stay under the floor.
    const preMatch = Array.from({ length: 26 }, (_, i) => comment('brilliant', -60 + i));
    const firstHalf = [comment('brilliant', 5)]; // 1 comment, well under 25
    const rows = buildRedditRows('m3', [...preMatch, ...firstHalf], KICKOFF, null);

    const pre = rows.find((r) => r.bucket === 'pre_match')!;
    const first = rows.find((r) => r.bucket === 'first_half')!;

    expect(pre.too_few).toBe(false);
    expect(pre.bucket_source_count).toBe(26);
    expect(pre.score).not.toBeNull();

    expect(first.too_few).toBe(true);
    expect(first.bucket_source_count).toBe(1);
    expect(first.score).toBeNull();
    expect(first.label).toBeNull();
  });

  it('leaves an empty bucket as too_few with a null score rather than fabricating one', () => {
    const rows = buildRedditRows('m4', [comment('brilliant', -10)], KICKOFF, null);
    const secondHalf = rows.find((r) => r.bucket === 'second_half')!;
    expect(secondHalf.bucket_source_count).toBe(0);
    expect(secondHalf.too_few).toBe(true);
    expect(secondHalf.score).toBeNull();
  });
});

describe('buildGuardianRow', () => {
  const articles: GuardianArticle[] = [
    { headline: 'brilliant win', standfirst: 'a clinical display', webUrl: 'https://guardian.test/1', webPublicationDate: '2026-07-04' },
    { headline: 'proud moment', standfirst: null, webUrl: 'https://guardian.test/2', webPublicationDate: '2026-07-04' },
  ];

  it('always produces exactly one whole_match row, regardless of kickoff timing (PRD D2 — headlines have no match clock)', () => {
    const row = buildGuardianRow('m5', articles);
    expect(row.bucket).toBe('whole_match');
    expect(row.source).toBe('guardian');
  });

  it('applies the 5-article minimum-volume floor', () => {
    const row = buildGuardianRow('m6', articles); // only 2 articles
    expect(row.too_few).toBe(true);
    expect(row.score).toBeNull();
    expect(row.label).toBeNull();
    expect(row.bucket_source_count).toBe(2);
  });

  it('scores once the floor is met and uses the first article\'s URL as source_url', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ ...articles[0], webUrl: `https://guardian.test/${i}` }));
    const row = buildGuardianRow('m7', five);
    expect(row.too_few).toBe(false);
    expect(row.score).not.toBeNull();
    expect(row.source_url).toBe('https://guardian.test/0');
  });
});
