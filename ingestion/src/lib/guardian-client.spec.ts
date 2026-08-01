import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchMatchArticles, isGuardianConfigured, mapGuardianResponse } from './guardian-client.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function loadRecordedResponse(): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, 'guardian-articles.json'), 'utf8'));
}

describe('isGuardianConfigured', () => {
  afterEach(() => {
    delete process.env['GUARDIAN_API_KEY'];
  });

  it('is false when GUARDIAN_API_KEY is unset — the "cleanly OFF" state (PRD D4, rule 1.4)', () => {
    delete process.env['GUARDIAN_API_KEY'];
    expect(isGuardianConfigured()).toBe(false);
  });

  it('is true once GUARDIAN_API_KEY is set', () => {
    process.env['GUARDIAN_API_KEY'] = 'test-key';
    expect(isGuardianConfigured()).toBe(true);
  });
});

describe('mapGuardianResponse — recorded fixture (D27)', () => {
  it('maps every result, carrying standfirst through when present', () => {
    const articles = mapGuardianResponse(loadRecordedResponse() as never);
    expect(articles).toHaveLength(3);
    expect(articles[0].headline).toContain('Springboks brilliant');
    expect(articles[0].standfirst).toContain('clinical');
  });

  it('records a null standfirst honestly rather than inventing one when the field is absent', () => {
    const articles = mapGuardianResponse(loadRecordedResponse() as never);
    expect(articles[2].standfirst).toBeNull();
  });

  it('drops a result missing a required field rather than writing a broken row', () => {
    const broken = { response: { results: [{ webUrl: 'https://example.test/x', webPublicationDate: '2026-01-01' }] } };
    expect(mapGuardianResponse(broken as never)).toEqual([]);
  });
});

describe('fetchMatchArticles', () => {
  afterEach(() => {
    delete process.env['GUARDIAN_API_KEY'];
    vi.unstubAllGlobals();
  });

  it('throws rather than silently skipping when unconfigured — callers must check isGuardianConfigured() first', async () => {
    delete process.env['GUARDIAN_API_KEY'];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMatchArticles('south africa rugby', '2026-01-01', '2026-01-02')).rejects.toThrow(
      'GUARDIAN_API_KEY is not set',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches against a recorded fixture once configured, never a live call (D27)', async () => {
    process.env['GUARDIAN_API_KEY'] = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => loadRecordedResponse() });
    vi.stubGlobal('fetch', fetchMock);

    const articles = await fetchMatchArticles('south africa rugby', '2026-01-01', '2026-01-02');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('content.guardianapis.com/search');
    expect(calledUrl).toContain('api-key=test-key');
    expect(articles).toHaveLength(3);
  });

  it('throws with the HTTP status on a non-ok response rather than returning an empty list silently', async () => {
    process.env['GUARDIAN_API_KEY'] = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    await expect(fetchMatchArticles('q', '2026-01-01', '2026-01-02')).rejects.toThrow('HTTP 429');
  });
});
