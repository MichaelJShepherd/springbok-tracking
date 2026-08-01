// API-Sports Rugby client (PRD D9/D14/D28) — the higher-precedence future
// -fixtures source once its free-tier key exists. Cleanly OFF until then:
// `isApiSportsConfigured()` gates every call, and `ingest:fixtures` skips
// this source entirely (logging why) rather than erroring when
// API_SPORTS_KEY is unset (task #67's client action; no key has arrived at
// task #79 time).
//
// No live key has ever been available to test this against — implemented
// and unit-tested against a canned response fixture only (D27; AGENTS.md
// 1.4 forbids any live call this project isn't cleared for, and API-Sports
// access itself isn't cleared until a key exists). When a key does arrive,
// whoever first runs `ingest:fixtures` with it set must: (1) confirm
// SPRINGBOKS_TEAM_ID against the real API response (the value below is
// API-Sports' documented Rugby team id for South Africa at the time of
// writing — verify, don't assume), and (2) record the D9 trigger's
// pass/fail outcome on task #79 (every remaining current-year fixture
// present with date+kickoff → pass; on fail, Wikipedia stays primary and
// D14/D24 need restating).

import { USER_AGENT } from './ingestion-run.js';
import type { FixtureStatus } from './wiki-fixtures-parser.js';

const API_BASE = 'https://v1.rugby.api-sports.io';
const SPRINGBOKS_TEAM_ID = 502;

export interface ApiSportsFixture {
  apiSportsFixtureId: string;
  matchDate: string; // ISO yyyy-mm-dd
  kickoffTime: string | null; // ISO timestamp
  opponentName: string;
  venue: string | null;
  competition: string | null;
  status: FixtureStatus;
}

export interface ApiSportsGame {
  id: number;
  date: string;
  status: { short: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  venue?: { name?: string | null } | null;
  league?: { name?: string | null } | null;
}

// API-Sports' own status short-codes -> this project's D8/#75 vocabulary.
// Anything unrecognised defaults to 'scheduled' rather than blocking the
// row on an unmapped code (D16: an honest best-effort beats a hard error).
const STATUS_MAP: Record<string, FixtureStatus> = {
  NS: 'scheduled',
  TBD: 'tbd',
  PST: 'postponed',
  CANC: 'cancelled',
  ABD: 'cancelled',
};

function mapStatus(short: string): FixtureStatus {
  return STATUS_MAP[short.toUpperCase()] ?? 'scheduled';
}

export function isApiSportsConfigured(): boolean {
  return Boolean(process.env['API_SPORTS_KEY']);
}

/** Maps one raw API-Sports game record onto this project's fixture shape. */
export function mapApiSportsGame(game: ApiSportsGame): ApiSportsFixture {
  const isHome = game.teams.home.id === SPRINGBOKS_TEAM_ID;
  const opponent = isHome ? game.teams.away : game.teams.home;
  const parsedDate = new Date(game.date);
  return {
    apiSportsFixtureId: String(game.id),
    matchDate: game.date.slice(0, 10),
    kickoffTime: Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString(),
    opponentName: opponent.name,
    venue: game.venue?.name ?? null,
    competition: game.league?.name ?? null,
    status: mapStatus(game.status.short),
  };
}

/**
 * Fetches the Springboks' remaining fixtures for the current calendar year
 * from API-Sports. Throws if API_SPORTS_KEY isn't set — callers must check
 * isApiSportsConfigured() first, per this module's "cleanly OFF" contract.
 */
export async function fetchUpcomingFixtures(): Promise<ApiSportsFixture[]> {
  const key = process.env['API_SPORTS_KEY'];
  if (!key) {
    throw new Error('API_SPORTS_KEY is not set — call isApiSportsConfigured() before fetchUpcomingFixtures().');
  }
  const url = new URL(`${API_BASE}/games`);
  url.searchParams.set('team', String(SPRINGBOKS_TEAM_ID));
  url.searchParams.set('season', String(new Date().getUTCFullYear()));

  const response = await fetch(url, {
    headers: { 'x-apisports-key': key, 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`API-Sports returned HTTP ${response.status} for the Springboks games query`);
  }
  const body = (await response.json()) as { response?: ApiSportsGame[] };
  return (body.response ?? []).map(mapApiSportsGame);
}
