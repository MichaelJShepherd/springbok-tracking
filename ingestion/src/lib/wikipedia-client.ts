// Polite MediaWiki API client (AGENTS.md 1.4, PRD D24): serial fetches,
// <=1 request/second, honest User-Agent. Wikipedia is the only domain this
// project is cleared to fetch (task #67), and only the pages a job needs.

import { USER_AGENT } from './ingestion-run.js';

const API_BASE = 'https://en.wikipedia.org/w/api.php';
const MIN_INTERVAL_MS = 1000;

let lastFetchAt = 0;

/** Sleeps out the remainder of the 1rps politeness window since the last fetch. */
async function waitForPoliteWindow(): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

export class WikipediaFetchError extends Error {
  constructor(
    message: string,
    public readonly pageTitle: string,
  ) {
    super(message);
    this.name = 'WikipediaFetchError';
  }
}

/**
 * Fetches the current wikitext of a page via `action=parse&prop=wikitext`.
 * Throws WikipediaFetchError on any non-2xx response or missing content —
 * callers must not silently proceed with an empty snapshot.
 */
export async function fetchWikitext(pageTitle: string): Promise<string> {
  await waitForPoliteWindow();

  const url = new URL(API_BASE);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', pageTitle);
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new WikipediaFetchError(
      `Wikipedia returned HTTP ${response.status} for "${pageTitle}"`,
      pageTitle,
    );
  }
  const body = (await response.json()) as {
    parse?: { wikitext?: string };
    error?: { info?: string };
  };
  if (body.error) {
    throw new WikipediaFetchError(
      `Wikipedia API error for "${pageTitle}": ${body.error.info ?? 'unknown error'}`,
      pageTitle,
    );
  }
  const wikitext = body.parse?.wikitext;
  if (!wikitext) {
    throw new WikipediaFetchError(`No wikitext returned for "${pageTitle}"`, pageTitle);
  }
  return wikitext;
}
