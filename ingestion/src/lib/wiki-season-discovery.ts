// Discovers which Wikipedia articles might carry the current year's
// remaining Springboks fixtures (PRD D9 — "discover via the list article's
// season links").
//
// In practice (checked live against the actual list article while building
// this slice, task #79), "List of South Africa rugby union test matches"
// carries no such links at all — every year section is just its match
// templates, no hatnote pointing at a season/tour article. Discovery
// instead tries a small, documented set of the Wikipedia rugby-union title
// patterns that do carry the current year's remaining fixtures (confirmed
// live: "<year> Nations Championship" and "<year> men's rugby union
// internationals" both exist and both list Springboks fixtures with a
// blank score for dates after today) and skips — never errors on — any
// candidate that doesn't exist. Same "state honestly, never invent" rule
// as everywhere else in this project (D16/D25): a 404 here just means that
// particular article isn't this year's source, not a run failure.

import { fetchWikitext, WikipediaFetchError } from './wikipedia-client.js';

export function candidateSeasonArticleTitles(year: number): string[] {
  return [
    `${year} Nations Championship`,
    `${year} Rugby Championship`,
    `${year} men's rugby union internationals`,
    `${year} end-of-year rugby union internationals`,
    `${year} mid-year rugby union internationals`,
  ];
}

export interface SeasonArticleFetch {
  title: string;
  wikitext: string | undefined;
  skippedReason: string | undefined;
}

/** Fetches every candidate season/tour article for `year`, skipping (not throwing on) any that don't exist. */
export async function fetchCandidateSeasonArticles(year: number): Promise<SeasonArticleFetch[]> {
  const results: SeasonArticleFetch[] = [];
  for (const title of candidateSeasonArticleTitles(year)) {
    try {
      const wikitext = await fetchWikitext(title);
      results.push({ title, wikitext, skippedReason: undefined });
    } catch (err) {
      const reason = err instanceof WikipediaFetchError ? err.message : String(err);
      results.push({ title, wikitext: undefined, skippedReason: reason });
    }
  }
  return results;
}
