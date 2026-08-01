import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchMatchThreadComments, isRedditConfigured, mapRedditListing } from './reddit-client.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function loadRecordedListing(): unknown[] {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, 'reddit-match-thread-comments.json'), 'utf8'));
}

describe('isRedditConfigured', () => {
  afterEach(() => {
    delete process.env['REDDIT_CLIENT_ID'];
    delete process.env['REDDIT_CLIENT_SECRET'];
  });

  it('is false when neither credential is set — the "cleanly OFF" state (PRD D4, rule 1.4)', () => {
    delete process.env['REDDIT_CLIENT_ID'];
    delete process.env['REDDIT_CLIENT_SECRET'];
    expect(isRedditConfigured()).toBe(false);
  });

  it('is false when only one of the two credentials is set', () => {
    process.env['REDDIT_CLIENT_ID'] = 'id';
    delete process.env['REDDIT_CLIENT_SECRET'];
    expect(isRedditConfigured()).toBe(false);
  });

  it('is true once both credentials are set', () => {
    process.env['REDDIT_CLIENT_ID'] = 'id';
    process.env['REDDIT_CLIENT_SECRET'] = 'secret';
    expect(isRedditConfigured()).toBe(true);
  });
});

describe('mapRedditListing — recorded fixture (D27)', () => {
  it('extracts only t1 (comment) children, skipping the thread post itself', () => {
    const comments = mapRedditListing(loadRecordedListing() as never);
    expect(comments).toHaveLength(5);
    expect(comments[0].body).toContain('excited for kickoff');
    expect(comments[0].createdUtc).toBe(1700000000);
  });

  it('skips a child missing body or created_utc rather than throwing', () => {
    const malformed = [{ data: { children: [{ kind: 't1', data: { body: 'no timestamp here' } }] } }];
    expect(mapRedditListing(malformed as never)).toEqual([]);
  });
});

describe('fetchMatchThreadComments', () => {
  afterEach(() => {
    delete process.env['REDDIT_CLIENT_ID'];
    delete process.env['REDDIT_CLIENT_SECRET'];
    vi.unstubAllGlobals();
  });

  it('throws rather than silently skipping when Reddit is unconfigured, and never fires a network call — callers must check isRedditConfigured() first', async () => {
    delete process.env['REDDIT_CLIENT_ID'];
    delete process.env['REDDIT_CLIENT_SECRET'];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMatchThreadComments('abc123')).rejects.toThrow('Reddit is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a token then the comments listing against a recorded fixture once configured (D27 — never a live call)', async () => {
    process.env['REDDIT_CLIENT_ID'] = 'id';
    process.env['REDDIT_CLIENT_SECRET'] = 'secret';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => loadRecordedListing() });
    vi.stubGlobal('fetch', fetchMock);

    const comments = await fetchMatchThreadComments('abc123');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('reddit.com/api/v1/access_token');
    expect(String(fetchMock.mock.calls[1][0])).toContain('oauth.reddit.com');
    expect(comments).toHaveLength(5);
  });

  it('throws with the HTTP status when the token request fails', async () => {
    process.env['REDDIT_CLIENT_ID'] = 'id';
    process.env['REDDIT_CLIENT_SECRET'] = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    await expect(fetchMatchThreadComments('abc123')).rejects.toThrow('HTTP 401');
  });

  it('throws when the token response is missing access_token rather than proceeding with an undefined token', async () => {
    process.env['REDDIT_CLIENT_ID'] = 'id';
    process.env['REDDIT_CLIENT_SECRET'] = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(fetchMatchThreadComments('abc123')).rejects.toThrow('missing access_token');
  });

  it('throws with the HTTP status when the comments-listing request itself fails (token succeeded)', async () => {
    process.env['REDDIT_CLIENT_ID'] = 'id';
    process.env['REDDIT_CLIENT_SECRET'] = 'secret';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMatchThreadComments('abc123')).rejects.toThrow('HTTP 503');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
