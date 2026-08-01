import { describe, expect, it } from 'vitest';
import { candidateArticleTitles, isBeforeDetailSourceEra, HIGH_PROFILE_MATCH_ARTICLES } from './detail-source-resolver.js';

describe('candidateArticleTitles', () => {
  it('tries the dedicated final article first for a known RWC final match', () => {
    const titles = candidateArticleTitles('2023-10-28', 'New Zealand');
    expect(titles[0]).toBe('2023 Rugby World Cup final');
  });

  it('does not offer the RWC final title for a different opponent on the same date', () => {
    const titles = candidateArticleTitles('2023-10-28', 'Wales');
    expect(titles).not.toContain('2023 Rugby World Cup final');
  });

  it('offers mid-year season-article titles for a June/July match', () => {
    const titles = candidateArticleTitles('2022-07-02', 'Wales');
    expect(titles).toContain('2022 mid-year rugby union tests');
  });

  it('offers Rugby Championship titles for an August-October match', () => {
    const titles = candidateArticleTitles('2022-08-06', 'Argentina');
    expect(titles).toContain('2022 Rugby Championship');
  });

  it('offers end-of-year internationals titles for a November match', () => {
    const titles = candidateArticleTitles('2022-11-19', 'England');
    expect(titles).toContain('2022 end-of-year rugby union internationals');
  });

  it('returns no candidates at all for a match before season-article coverage begins', () => {
    expect(candidateArticleTitles('1896-09-05', 'British & Irish Lions')).toEqual([]);
  });

  it('never returns a duplicate title', () => {
    const titles = candidateArticleTitles('2022-07-02', 'Wales');
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('isBeforeDetailSourceEra', () => {
  it('is true for an 1890s match', () => {
    expect(isBeforeDetailSourceEra('1896-09-05')).toBe(true);
  });

  it('is false for a 2022 match', () => {
    expect(isBeforeDetailSourceEra('2022-07-02')).toBe(false);
  });
});

describe('HIGH_PROFILE_MATCH_ARTICLES', () => {
  it('every entry pairs a real ISO date with a non-empty page title', () => {
    for (const entry of HIGH_PROFILE_MATCH_ARTICLES) {
      expect(entry.matchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.pageTitle.length).toBeGreaterThan(0);
    }
  });
});
