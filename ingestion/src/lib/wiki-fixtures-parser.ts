// Parser for Wikipedia's rugby-internationals "season" articles (PRD D9,
// docs/field-map.md's fixtures section) — the ones a real research pass on
// task #79 found actually carry the Springboks' *upcoming* fixtures right
// now: `{{2026 Nations Championship}}` (round-by-round tables, largely
// filled in with results already) and `{{2026 men's rugby union
// internationals}}` (the catch-all page, `{{rugbybox}}`/`{{Rugbybox}}`
// templates, one per month section). Both use the same field vocabulary as
// the list article's `{{#invoke:rugby box collapsible|main}}` templates
// (date/time/home/away/team1/team2/score/stadium/referee), so this module
// reuses wiki-list-parser's field-parsing and team-resolution helpers
// rather than re-implementing them (AGENTS.md 1.3).
//
// A block only becomes a *fixture* row (not a completed-match row, which is
// backfill/refresh's job) when its `score` field is not a parseable result —
// blank, or a placeholder like "Postponed"/"Cancelled". Anything with a
// clean `NN–NN` score is a played match and is silently excluded here (not
// an error — it just isn't this script's row to write).

import {
  parseTemplateFields,
  parseWikiDate,
  parseScore,
  resolveOpponentField,
} from './wiki-list-parser.js';
import { SOUTH_AFRICA } from './team-directory.js';

export type FixtureStatus = 'scheduled' | 'postponed' | 'tbd' | 'cancelled';

export interface ParsedFixture {
  matchDate: string; // ISO yyyy-mm-dd
  matchDateRaw: string;
  /** ISO timestamp anchored on the match date, same "treat the local kickoff clock as-is" convention wiki-list-parser already uses — null when no HH:MM could be read. */
  kickoffTime: string | null;
  opponentName: string;
  opponentUnresolved: boolean;
  venue: string | null;
  status: FixtureStatus;
  sourceArticleUrl: string;
  parseErrors: string[];
}

export interface FixtureParseResult {
  fixtures: ParsedFixture[];
  /** Blocks that were something other than an upcoming Springboks fixture (wrong team, already played, unparseable date) — not failures, just not this script's rows. */
  notApplicable: string[];
}

const TBC_RE = /\bTBC\b|\bTBD\b/i;

/**
 * Finds every `{{rugbybox|...}}` / `{{Rugbybox|...}}` block, brace-depth
 * aware (field values can nest their own `{{...}}` templates, same reason
 * wiki-list-parser's extractBalancedBlocks exists). The marker is matched
 * case-insensitively since the source article mixes `{{rugbybox` and
 * `{{Rugbybox` even within the same page.
 */
export function extractFixtureBlocks(wikitext: string): string[] {
  const blocks: string[] = [];
  const markerRe = /\{\{\s*rugbybox/gi;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(wikitext))) {
    const start = m.index;
    let depth = 1;
    let i = start + 2;
    while (i < wikitext.length && depth > 0) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
        depth += 1;
        i += 2;
      } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
        depth -= 1;
        i += 2;
      } else {
        i += 1;
      }
    }
    blocks.push(wikitext.slice(start, i));
    markerRe.lastIndex = i;
  }
  return blocks;
}

/** Strips `<ref>...</ref>` citation markup and wikilinks down to display text. */
function cleanDisplayText(raw: string): string {
  return raw
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2')
    .trim();
}

function determineStatus(scoreRaw: string, timeRaw: string, stadiumRaw: string): FixtureStatus {
  const score = scoreRaw.trim();
  if (/cancel/i.test(score)) return 'cancelled';
  if (/postpone/i.test(score)) return 'postponed';
  if (TBC_RE.test(timeRaw) || TBC_RE.test(stadiumRaw) || !cleanDisplayText(stadiumRaw)) return 'tbd';
  return 'scheduled';
}

/**
 * Parses one `{{rugbybox}}` block. Returns `undefined` (with a reason) for
 * every block that isn't an upcoming Springboks fixture — a non-SA fixture,
 * an already-played match, or a block missing the fields needed to identify
 * either side at all.
 */
export function parseFixtureBlock(
  block: string,
  sourceArticleUrl: string,
): { fixture: ParsedFixture | undefined; notApplicableReason: string | undefined } {
  const fields = parseTemplateFields(block);

  const matchDateRaw = fields['date'] ?? '';
  const matchDate = matchDateRaw ? parseWikiDate(matchDateRaw) : undefined;
  if (!matchDate) {
    return { fixture: undefined, notApplicableReason: `unparsed/missing date: "${matchDateRaw}"` };
  }

  const homeRaw = fields['home'] ?? fields['team1'];
  const awayRaw = fields['away'] ?? fields['team2'];
  if (!homeRaw || !awayRaw) {
    return { fixture: undefined, notApplicableReason: `${matchDateRaw}: missing home/away or team1/team2 fields` };
  }

  const home = resolveOpponentField(homeRaw);
  const away = resolveOpponentField(awayRaw);
  const homeIsSA = home.team.canonicalName === SOUTH_AFRICA.canonicalName;
  const awayIsSA = away.team.canonicalName === SOUTH_AFRICA.canonicalName;

  if (!homeIsSA && !awayIsSA) {
    // Not a Springboks fixture at all — the large majority of blocks on a
    // catch-all page like "20XX men's rugby union internationals". Not an
    // error, just not this script's row.
    return { fixture: undefined, notApplicableReason: undefined };
  }
  if (homeIsSA && awayIsSA) {
    return { fixture: undefined, notApplicableReason: `${matchDateRaw}: both sides resolved to South Africa` };
  }

  const opponent = homeIsSA ? away : home;
  const parseErrors: string[] = [];
  if (opponent.unresolved) {
    parseErrors.push(`unresolved opponent side: "${homeIsSA ? awayRaw : homeRaw}"`);
  }

  const scoreRaw = fields['score'] ?? '';
  const parsedScore = scoreRaw ? parseScore(scoreRaw) : undefined;
  if (parsedScore) {
    // Already played — belongs to ingest:backfill/refresh, not fixtures.
    return { fixture: undefined, notApplicableReason: `${matchDate}: already played (score "${scoreRaw}")` };
  }

  const timeRaw = fields['time'] ?? '';
  const stadiumRaw = fields['stadium'] ?? '';
  const status = determineStatus(scoreRaw, timeRaw, stadiumRaw);

  let kickoffTime: string | null = null;
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(timeRaw.trim());
  if (timeMatch) {
    kickoffTime = `${matchDate}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00Z`;
  }

  const venue = cleanDisplayText(stadiumRaw) || null;

  return {
    fixture: {
      matchDate,
      matchDateRaw,
      kickoffTime,
      opponentName: opponent.team.canonicalName,
      opponentUnresolved: opponent.unresolved,
      venue,
      status,
      sourceArticleUrl,
      parseErrors,
    },
    notApplicableReason: undefined,
  };
}

/** Parses every upcoming Springboks fixture out of one season/tour article's wikitext. */
export function parseSeasonArticleFixtures(wikitext: string, sourceArticleUrl: string): FixtureParseResult {
  const blocks = extractFixtureBlocks(wikitext);
  const fixtures: ParsedFixture[] = [];
  const notApplicable: string[] = [];
  for (const block of blocks) {
    const { fixture, notApplicableReason } = parseFixtureBlock(block, sourceArticleUrl);
    if (fixture) fixtures.push(fixture);
    else if (notApplicableReason) notApplicable.push(notApplicableReason);
  }
  return { fixtures, notApplicable };
}
