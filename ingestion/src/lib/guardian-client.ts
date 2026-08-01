// Guardian Content API client (PRD D2/D4 fallback sentiment source, used
// when no Reddit thread exists or a bucket falls under the volume floor) —
// the LIVE path is wired but DISABLED until an API key exists (no key at
// task #78 time). `isGuardianConfigured()` gates every call the same way
// `isRedditConfigured()` does in reddit-client.ts: `ingest:sentiment` never
// calls `fetchMatchArticles` when it returns false, and this task never
// sets GUARDIAN_API_KEY, so no live Guardian network call occurs (rule 1.4).
//
// D20 retention: this module returns headline/standfirst text to its
// caller purely so `sentiment-scorer.ts` can score it in memory (D2: "same
// lexicon over article headline+standfirst text processed in-memory
// (D20)"). Nothing in this file persists or logs that text — see
// `sentiment-retention.spec.ts` for the automated check.

import { USER_AGENT } from './ingestion-run.js';

const GUARDIAN_API_BASE = 'https://content.guardianapis.com/search';

export interface GuardianArticle {
  headline: string;
  standfirst: string | null;
  webUrl: string;
  webPublicationDate: string;
}

interface GuardianSearchResponse {
  response?: {
    results?: Array<{
      webTitle?: string;
      webUrl?: string;
      webPublicationDate?: string;
      fields?: { standfirst?: string };
    }>;
  };
}

export function isGuardianConfigured(): boolean {
  return Boolean(process.env['GUARDIAN_API_KEY']);
}

/** Maps one raw Guardian search response onto this project's shape. */
export function mapGuardianResponse(body: GuardianSearchResponse): GuardianArticle[] {
  return (body.response?.results ?? [])
    .filter((r): r is Required<Pick<typeof r, 'webTitle' | 'webUrl' | 'webPublicationDate'>> & typeof r =>
      Boolean(r.webTitle && r.webUrl && r.webPublicationDate),
    )
    .map((r) => ({
      headline: r.webTitle,
      standfirst: r.fields?.standfirst ?? null,
      webUrl: r.webUrl,
      webPublicationDate: r.webPublicationDate,
    }));
}

/**
 * Searches Guardian articles matching `query` published between `fromDate`
 * and `toDate` (both `yyyy-mm-dd`). Throws rather than silently skipping
 * when Guardian isn't configured — callers must check
 * `isGuardianConfigured()` first.
 */
export async function fetchMatchArticles(query: string, fromDate: string, toDate: string): Promise<GuardianArticle[]> {
  const key = process.env['GUARDIAN_API_KEY'];
  if (!key) {
    throw new Error('GUARDIAN_API_KEY is not set — call isGuardianConfigured() before fetchMatchArticles().');
  }
  const url = new URL(GUARDIAN_API_BASE);
  url.searchParams.set('api-key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('from-date', fromDate);
  url.searchParams.set('to-date', toDate);
  url.searchParams.set('show-fields', 'standfirst');

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Guardian API returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as GuardianSearchResponse;
  return mapGuardianResponse(body);
}
