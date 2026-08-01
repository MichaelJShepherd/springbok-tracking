import { describe, expect, it, vi, afterEach } from 'vitest';
import { candidateSeasonArticleTitles, fetchCandidateSeasonArticles } from './wiki-season-discovery.js';
import { WikipediaFetchError } from './wikipedia-client.js';

vi.mock('./wikipedia-client.js', async () => {
  const actual = await vi.importActual<typeof import('./wikipedia-client.js')>('./wikipedia-client.js');
  return { ...actual, fetchWikitext: vi.fn() };
});

import { fetchWikitext } from './wikipedia-client.js';

describe('candidateSeasonArticleTitles', () => {
  it('builds the documented title-pattern ladder for a given year', () => {
    expect(candidateSeasonArticleTitles(2026)).toEqual([
      '2026 Nations Championship',
      '2026 Rugby Championship',
      "2026 men's rugby union internationals",
      '2026 end-of-year rugby union internationals',
      '2026 mid-year rugby union internationals',
    ]);
  });
});

describe('fetchCandidateSeasonArticles — no live calls in tests (D27)', () => {
  afterEach(() => {
    vi.mocked(fetchWikitext).mockReset();
  });

  it('skips (does not throw on) a candidate title that does not exist on Wikipedia', async () => {
    vi.mocked(fetchWikitext).mockRejectedValue(new WikipediaFetchError('missing page', 'nope'));
    const results = await fetchCandidateSeasonArticles(2026);
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.wikitext === undefined)).toBe(true);
    expect(results[0].skippedReason).toContain('missing page');
  });

  it('returns the wikitext for a candidate that does exist, alongside skipped ones', async () => {
    vi.mocked(fetchWikitext).mockImplementation(async (title: string) => {
      if (title === "2026 men's rugby union internationals") return 'FIXTURE WIKITEXT';
      throw new WikipediaFetchError('missing page', title);
    });
    const results = await fetchCandidateSeasonArticles(2026);
    const found = results.find((r) => r.title === "2026 men's rugby union internationals");
    expect(found?.wikitext).toBe('FIXTURE WIKITEXT');
    expect(found?.skippedReason).toBeUndefined();
    expect(results.filter((r) => r.wikitext === undefined)).toHaveLength(4);
  });
});
