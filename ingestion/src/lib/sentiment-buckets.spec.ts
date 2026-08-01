import { describe, expect, it } from 'vitest';
import { TIMED_BUCKETS, WHOLE_MATCH_BUCKETS, bucketForTimestamp } from './sentiment-buckets.js';

const KICKOFF = new Date('2026-07-04T15:00:00Z');

function minutesAfterKickoff(minutes: number): Date {
  return new Date(KICKOFF.getTime() + minutes * 60_000);
}

describe('bucketForTimestamp', () => {
  it('returns whole_match for every timestamp when there is no kickoff time (PRD D2/D3)', () => {
    expect(bucketForTimestamp(new Date('1995-06-24T12:00:00Z'), null)).toBe('whole_match');
    expect(bucketForTimestamp(new Date('2026-07-04T16:00:00Z'), null)).toBe('whole_match');
  });

  it('buckets a comment before kickoff as pre_match', () => {
    expect(bucketForTimestamp(minutesAfterKickoff(-30), KICKOFF)).toBe('pre_match');
  });

  it('buckets a comment right at kickoff as first_half', () => {
    expect(bucketForTimestamp(minutesAfterKickoff(0), KICKOFF)).toBe('first_half');
  });

  it('buckets a comment mid first half as first_half', () => {
    expect(bucketForTimestamp(minutesAfterKickoff(20), KICKOFF)).toBe('first_half');
  });

  it('buckets a comment after the first-half boundary as second_half', () => {
    expect(bucketForTimestamp(minutesAfterKickoff(40), KICKOFF)).toBe('second_half');
    expect(bucketForTimestamp(minutesAfterKickoff(70), KICKOFF)).toBe('second_half');
  });

  it('buckets a comment well after full time as post_match', () => {
    expect(bucketForTimestamp(minutesAfterKickoff(95), KICKOFF)).toBe('post_match');
    expect(bucketForTimestamp(minutesAfterKickoff(300), KICKOFF)).toBe('post_match');
  });
});

describe('bucket lists', () => {
  it('TIMED_BUCKETS has the four kickoff-relative buckets in match order', () => {
    expect(TIMED_BUCKETS).toEqual(['pre_match', 'first_half', 'second_half', 'post_match']);
  });

  it('WHOLE_MATCH_BUCKETS is the single fallback bucket', () => {
    expect(WHOLE_MATCH_BUCKETS).toEqual(['whole_match']);
  });
});
