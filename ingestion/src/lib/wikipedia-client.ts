// Polite MediaWiki API client (AGENTS.md 1.4, PRD D24): serial fetches,
// <=1 request/second, honest User-Agent. Wikipedia is the only domain this
// project is cleared to fetch (task #67), and only the pages a job needs.

import { USER_AGENT } from './ingestion-run.js';

const API_BASE = 'https://en.wikipedia.org/w/api.php';
// Comfortably under the AGENTS.md 1.4 ceiling of <=1rps: #76's live verification
// run observed Wikipedia returning HTTP 429 to this client at exactly 1rps once a
// run made enough requests (dozens of season-article title guesses across a
// stratified match sample), so the floor was slowed down further rather than
// argued with — a block is an answer, not an obstacle (AGENTS.md 1.4).
const MIN_INTERVAL_MS = 1500;
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 15000];

let lastFetchAt = 0;

/** Sleeps out the remainder of the politeness window since the last fetch. */
async function waitForPoliteWindow(): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const url = new URL(API_BASE);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', pageTitle);
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  let response: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    await waitForPoliteWindow();
    response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.status !== 429) break;
    if (attempt >= RATE_LIMIT_RETRY_DELAYS_MS.length) {
      throw new WikipediaFetchError(
        `Wikipedia returned HTTP 429 (rate limited) for "${pageTitle}" after ${attempt + 1} attempts — backing off, not retrying further`,
        pageTitle,
      );
    }
    const retryAfterHeader = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : RATE_LIMIT_RETRY_DELAYS_MS[attempt];
    console.warn(`[wikipedia-client] HTTP 429 for "${pageTitle}" — backing off ${delay}ms before retrying (attempt ${attempt + 1})`);
    await sleep(delay);
  }

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
