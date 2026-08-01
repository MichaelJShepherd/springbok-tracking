// Reddit Data API client (PRD D2/D4 primary sentiment source) — the LIVE
// path is wired but DISABLED until OAuth app credentials exist (task #67's
// registration; no key exists at task #78 time). `isRedditConfigured()`
// gates every call: `ingest:sentiment` (scripts/sentiment.ts) must never
// call `fetchMatchThreadComments` when it returns false, and no other
// module in this codebase calls the Reddit API at all. That is the whole
// guarantee that this task makes zero live Reddit network calls — the gate
// is a plain env-var check, checked before this module's only network-
// touching functions run, and this task never sets REDDIT_CLIENT_ID/
// REDDIT_CLIENT_SECRET (rule 1.4 — no live call to a source this project
// isn't cleared to hit yet).
//
// D20 retention: this module returns comment bodies to its caller purely so
// `sentiment-scorer.ts` can score them in memory. Nothing in this file
// persists or logs a comment body — callers (scripts/sentiment.ts via
// lib/sentiment-pipeline.ts) must keep it that way; see
// `sentiment-retention.spec.ts` for the automated check.

import { USER_AGENT } from './ingestion-run.js';

const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';

export interface RedditComment {
  body: string;
  /** Seconds since epoch, per Reddit's own `created_utc` field. */
  createdUtc: number;
}

interface RedditCommentListing {
  data?: {
    children?: Array<{ kind: string; data?: { body?: string; created_utc?: number } }>;
  };
}

export function isRedditConfigured(): boolean {
  return Boolean(process.env['REDDIT_CLIENT_ID']) && Boolean(process.env['REDDIT_CLIENT_SECRET']);
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env['REDDIT_CLIENT_ID'];
  const clientSecret = process.env['REDDIT_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error(
      'REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET not set — call isRedditConfigured() before any Reddit fetch.',
    );
  }
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(REDDIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    throw new Error(`Reddit token request returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('Reddit token response missing access_token');
  }
  return body.access_token;
}

/** Maps one raw Reddit comment-listing response onto this project's shape. */
export function mapRedditListing(listing: RedditCommentListing[]): RedditComment[] {
  const comments: RedditComment[] = [];
  for (const page of listing) {
    for (const child of page.data?.children ?? []) {
      if (child.kind !== 't1') continue; // t1 = comment; the thread's own post ("t3") isn't a comment
      const body = child.data?.body;
      const createdUtc = child.data?.created_utc;
      if (typeof body === 'string' && typeof createdUtc === 'number') {
        comments.push({ body, createdUtc });
      }
    }
  }
  return comments;
}

/**
 * Fetches every top-level (and nested) comment on a match thread. Throws
 * rather than silently skipping when Reddit isn't configured — callers
 * must check `isRedditConfigured()` first (same contract as
 * `api-sports-client.ts`'s `fetchUpcomingFixtures`).
 */
export async function fetchMatchThreadComments(threadId: string): Promise<RedditComment[]> {
  if (!isRedditConfigured()) {
    throw new Error('Reddit is not configured — call isRedditConfigured() before fetchMatchThreadComments().');
  }
  const token = await getAccessToken();
  const url = new URL(`${REDDIT_API_BASE}/comments/${encodeURIComponent(threadId)}`);
  url.searchParams.set('limit', '500');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Reddit comments request returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as RedditCommentListing[];
  return mapRedditListing(body);
}
