import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isApiSportsConfigured, mapApiSportsGame, fetchUpcomingFixtures, type ApiSportsGame } from './api-sports-client.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function loadRecordedResponse(): { response: ApiSportsGame[] } {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, 'api-sports-games.json'), 'utf8'));
}

describe('isApiSportsConfigured', () => {
  afterEach(() => {
    delete process.env['API_SPORTS_KEY'];
  });

  it('is false when API_SPORTS_KEY is unset — the "cleanly OFF" state (PRD D9)', () => {
    delete process.env['API_SPORTS_KEY'];
    expect(isApiSportsConfigured()).toBe(false);
  });

  it('is true once API_SPORTS_KEY is set', () => {
    process.env['API_SPORTS_KEY'] = 'test-key';
    expect(isApiSportsConfigured()).toBe(true);
  });
});

describe('mapApiSportsGame — recorded fixture (task #79, D27)', () => {
  const games = loadRecordedResponse().response;

  it('picks the opponent as whichever side is not the Springboks team id, kickoff away', () => {
    const fixture = mapApiSportsGame(games[0]);
    expect(fixture.opponentName).toBe('New Zealand');
    expect(fixture.matchDate).toBe('2026-08-22');
    expect(fixture.status).toBe('scheduled');
    expect(fixture.venue).toBe('Ellis Park Stadium');
  });

  it('picks the opponent correctly when South Africa is the away side', () => {
    const fixture = mapApiSportsGame(games[2]);
    expect(fixture.opponentName).toBe('Australia');
  });

  it('canonicalises an opponent name given as a known alias (Gate 2 finding, task #79) — D14 dedup depends on this matching Wikipedia\'s canonical name', () => {
    const aliasGame: ApiSportsGame = {
      ...games[0],
      teams: {
        home: { id: 502, name: 'South Africa' },
        away: { id: 611, name: 'All Blacks' },
      },
    };
    expect(mapApiSportsGame(aliasGame).opponentName).toBe('New Zealand');
  });

  it('maps API-Sports status short-codes onto this project\'s D8/#75 status vocabulary', () => {
    expect(mapApiSportsGame(games[0]).status).toBe('scheduled'); // NS
    expect(mapApiSportsGame(games[1]).status).toBe('postponed'); // PST
    expect(mapApiSportsGame(games[2]).status).toBe('cancelled'); // CANC
    expect(mapApiSportsGame(games[3]).status).toBe('tbd'); // TBD
  });

  it('maps the ABD (abandoned) short-code to cancelled too (Gate 3 coverage gap)', () => {
    const abandonedGame: ApiSportsGame = { ...games[0], status: { short: 'ABD' } };
    expect(mapApiSportsGame(abandonedGame).status).toBe('cancelled');
  });

  it('records a null venue honestly rather than inventing one when the API omits it', () => {
    expect(mapApiSportsGame(games[3]).venue).toBeNull();
  });

  it('defaults an unrecognised status short-code to scheduled rather than throwing', () => {
    const unknownStatusGame: ApiSportsGame = { ...games[0], status: { short: 'WEIRD' } };
    expect(mapApiSportsGame(unknownStatusGame).status).toBe('scheduled');
  });
});

describe('fetchUpcomingFixtures', () => {
  afterEach(() => {
    delete process.env['API_SPORTS_KEY'];
    vi.unstubAllGlobals();
  });

  it('throws rather than silently skipping when API_SPORTS_KEY is unset — callers must check isApiSportsConfigured() first', async () => {
    delete process.env['API_SPORTS_KEY'];
    await expect(fetchUpcomingFixtures()).rejects.toThrow('API_SPORTS_KEY is not set');
  });

  it('maps every game in a recorded response, never calling the live API (D27)', async () => {
    process.env['API_SPORTS_KEY'] = 'test-key';
    const recorded = loadRecordedResponse();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => recorded,
    });
    vi.stubGlobal('fetch', fetchMock);

    const fixtures = await fetchUpcomingFixtures();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('v1.rugby.api-sports.io');
    const calledHeaders = fetchMock.mock.calls[0][1].headers;
    expect(calledHeaders['x-apisports-key']).toBe('test-key');
    expect(fixtures).toHaveLength(4);
    expect(fixtures[0].opponentName).toBe('New Zealand');
  });

  it('throws with the HTTP status on a non-ok response rather than returning an empty list silently', async () => {
    process.env['API_SPORTS_KEY'] = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
    );
    await expect(fetchUpcomingFixtures()).rejects.toThrow('HTTP 503');
  });
});
