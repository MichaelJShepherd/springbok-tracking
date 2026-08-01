// Decides which Wikipedia page(s) to try fetching for a match's *detail*
// (lineups/officials/events), per the ticket's own scope split: individual
// match articles for high-profile tests; season/tour article match
// sections otherwise (#68's coverage findings, PRD D11).
//
// Deliberately no live MediaWiki search here (AGENTS.md 1.3 — the simplest
// thing that works): Wikipedia's season/tour article titles follow a small,
// stable set of naming conventions from the ~1994 "mid-year tests / Rugby
// Championship / end-of-year internationals" window onward, so a
// deterministic title list is tried in order and the first page whose
// wikitext contains a matching {{Rugbybox}} block (rugbybox-parser.ts's
// blockMatchesTarget) wins. Older matches (pre-1994) are not attempted at
// all: D11 already documents that this era predates these source shapes
// (timed scoring sequences reach 100% only in the 2011+ bucket), so trying
// would just burn politeness budget on fetches known to come back empty.

export interface HighProfileMatchArticle {
  matchDate: string; // ISO yyyy-mm-dd
  opponentCanonicalName: string;
  pageTitle: string;
}

/**
 * Springboks Rugby World Cup finals — well-documented historical fact, not
 * proprietary information (AGENTS.md 1.1) — each has its own dedicated
 * Wikipedia article rather than living inside a season/tour page. Extend
 * this list as more high-profile individual-article matches are confirmed
 * (semi-finals, other famous one-off Tests).
 */
export const HIGH_PROFILE_MATCH_ARTICLES: HighProfileMatchArticle[] = [
  { matchDate: '1995-06-24', opponentCanonicalName: 'New Zealand', pageTitle: '1995 Rugby World Cup Final' },
  { matchDate: '2007-10-20', opponentCanonicalName: 'England', pageTitle: '2007 Rugby World Cup Final' },
  { matchDate: '2019-11-02', opponentCanonicalName: 'England', pageTitle: '2019 Rugby World Cup Final' },
  { matchDate: '2023-10-28', opponentCanonicalName: 'New Zealand', pageTitle: '2023 Rugby World Cup final' },
];

const EARLIEST_SEASON_ARTICLE_YEAR = 1994;

/**
 * Ordered candidate Wikipedia page titles for a match's detail source, most
 * specific (and most likely correct) first. Callers try each in turn and
 * stop at the first page containing a matching Rugbybox block.
 */
export function candidateArticleTitles(matchDate: string, opponentCanonicalName: string): string[] {
  const titles: string[] = [];

  const highProfile = HIGH_PROFILE_MATCH_ARTICLES.find(
    (e) => e.matchDate === matchDate && e.opponentCanonicalName === opponentCanonicalName,
  );
  if (highProfile) titles.push(highProfile.pageTitle);

  const year = Number(matchDate.slice(0, 4));
  const month = Number(matchDate.slice(5, 7));
  if (Number.isFinite(year) && year >= EARLIEST_SEASON_ARTICLE_YEAR) {
    if (month >= 6 && month <= 7) {
      titles.push(`${year} mid-year rugby union tests`, `${year} mid-year rugby union internationals`);
    }
    if (month >= 8 && month <= 10) {
      titles.push(`${year} Rugby Championship`, `${year} Tri Nations`);
    }
    if (month >= 10 && month <= 12) {
      titles.push(`${year} end-of-year rugby union internationals`);
    }
    if (month >= 1 && month <= 5) {
      // Rare Feb-May internationals (e.g. a one-off friendly) — same page family as mid-year.
      titles.push(`${year} mid-year rugby union tests`);
    }
  }

  return [...new Set(titles)];
}

/** True if this match's era is old enough that no detail source is expected to exist at all (D11's documented structural gap). */
export function isBeforeDetailSourceEra(matchDate: string): boolean {
  const year = Number(matchDate.slice(0, 4));
  return !Number.isFinite(year) || year < EARLIEST_SEASON_ARTICLE_YEAR;
}
