// Parser for per-match detail wikitext (PRD D11/D13/D16/D17, docs/field-map.md
// "#76" section) — the `{{Rugbybox ...}}` template Wikipedia uses on both
// individual match articles (e.g. "2023 Rugby World Cup final") and
// season/tour articles that embed one Rugbybox per fixture (e.g. "2022
// mid-year rugby union tests"). Confirmed against real fetched wikitext for
// both shapes (see the fixtures this module's spec loads) before writing
// this parser, per AGENTS.md 1.3 (no speculative parsing rules).
//
// A Rugbybox block is followed, in both page shapes, by:
//   1. two `{| cellspacing="0" cellpadding="0" ...}` sub-tables (starting
//      XV + replacements + coach), home side first then away side — this
//      ordering was observed consistently in both fetched samples;
//   2. a free-text info block carrying "'''Assistant referee(s):'''" /
//      "'''Television match official:'''" / "'''Reserve official:'''"
//      labels, each followed by one or more `<br />`-separated names.
// Cards (`{{yel|MIN}}`, `{{sin bin|MIN|...}}`, `{{sent off|...|MIN}}`) are
// read off the same lineup rows as the shirt numbers.

import { resolveOpponentField, parseWikiDate, parseScore, type ParsedOpponent } from './wiki-list-parser.js';

export type Provenance = 'present' | 'absent_in_source' | 'not_yet_fetched' | 'fetch_failed';
export type TeamSide = 'springboks' | 'opponent';
export type EventType = 'try' | 'conversion' | 'penalty' | 'drop_goal' | 'yellow_card' | 'red_card' | 'other';
export type OfficialRole = 'assistant_referee' | 'tmo' | 'other';

export interface RugbyboxBlock {
  fields: Record<string, string>;
  /** Wikitext from this block's `{{Rugbybox` up to the next one (or end of page) — the slice lineup/officials parsing scans. */
  detailText: string;
}

/** Walks brace depth from an already-located `{{` start to find the matching `}}`. */
function findBlockEnd(text: string, start: number): number {
  let depth = 1;
  let i = start + 2;
  while (i < text.length && depth > 0) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++;
      i += 2;
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--;
      i += 2;
    } else {
      i++;
    }
  }
  return i;
}

function parseFieldsFromBlock(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lineRe = /^[ \t]*\|[ \t]*([a-zA-Z0-9_]+)[ \t]*=[ \t]*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block))) {
    fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

/**
 * Finds every `{{Rugbybox ...}}` block in a page's wikitext (case-insensitive
 * template name — MediaWiki template names are case-insensitive on their
 * first letter), pairing each with the wikitext slice up to the next such
 * block (or end of page) for lineup/officials scanning.
 */
export function findRugbyboxBlocks(wikitext: string): RugbyboxBlock[] {
  const markerRe = /\{\{\s*[Rr]ugbybox/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(wikitext))) starts.push(m.index);

  const blocks: RugbyboxBlock[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const blockEnd = findBlockEnd(wikitext, start);
    const detailEnd = i + 1 < starts.length ? starts[i + 1] : wikitext.length;
    blocks.push({
      fields: parseFieldsFromBlock(wikitext.slice(start, blockEnd)),
      detailText: wikitext.slice(start, detailEnd),
    });
  }
  return blocks;
}

export interface MatchTarget {
  matchDate: string; // ISO yyyy-mm-dd
  opponentCanonicalName: string;
}

export interface ResolvedSides {
  home: ParsedOpponent;
  away: ParsedOpponent;
  homeIsSouthAfrica: boolean;
}

/**
 * Resolves which side is South Africa for a Rugbybox block, or undefined if
 * neither side's `home`/`away` field can be resolved to South Africa at all
 * (e.g. a block for an unrelated fixture on the same season page).
 */
export function resolveRugbyboxSides(fields: Record<string, string>): ResolvedSides | undefined {
  if (!fields['home'] || !fields['away']) return undefined;
  const home = resolveOpponentField(fields['home']);
  const away = resolveOpponentField(fields['away']);
  if (home.team.canonicalName === 'South Africa') return { home, away, homeIsSouthAfrica: true };
  if (away.team.canonicalName === 'South Africa') return { home, away, homeIsSouthAfrica: false };
  return undefined;
}

/**
 * True if this Rugbybox block is the one for `target` — same date, and the
 * non-South-Africa side's canonical name matches the opponent already
 * recorded on the `matches` row (from the list-article backfill, D13's join
 * key). A season page carries many blocks; this is how the right one is
 * picked out of dozens.
 */
export function blockMatchesTarget(block: RugbyboxBlock, target: MatchTarget): ResolvedSides | undefined {
  const dateRaw = block.fields['date'];
  if (!dateRaw) return undefined;
  const date = parseWikiDate(dateRaw);
  if (date !== target.matchDate) return undefined;
  const sides = resolveRugbyboxSides(block.fields);
  if (!sides) return undefined;
  const opponentSide = sides.homeIsSouthAfrica ? sides.away : sides.home;
  if (opponentSide.team.canonicalName !== target.opponentCanonicalName) return undefined;
  return sides;
}

/** Score present on the Rugbybox block itself (a cross-check, not written — the list article stays authoritative per D14). */
export function rugbyboxScore(fields: Record<string, string>): { home: number; away: number } | undefined {
  const raw = fields['score'];
  if (!raw) return undefined;
  const parsed = parseScore(raw);
  if (!parsed) return undefined;
  return { home: parsed.left, away: parsed.right };
}

const REFEREE_STRIP_RE = /\([^)]*\)\s*(?:<ref[^>]*\/?>.*)?$/;
function cleanRefereeLikeName(raw: string): string {
  const wikilink = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(raw);
  const namePart = wikilink ? (wikilink[2] ?? wikilink[1]) : raw;
  return namePart.replace(REFEREE_STRIP_RE, '').replace(/<ref[\s\S]*$/, '').trim();
}

/** The Rugbybox's own `referee` field, cleaned the same way as the list-article parser. */
export function rugbyboxReferee(fields: Record<string, string>): { name: string | undefined; provenance: Provenance } {
  const raw = fields['referee'];
  if (!raw) return { name: undefined, provenance: 'absent_in_source' };
  const name = cleanRefereeLikeName(raw);
  return { name: name || undefined, provenance: name ? 'present' : 'absent_in_source' };
}

// ---------------------------------------------------------------------
// Lineups + cards — both read off the same two lineup sub-tables.
// ---------------------------------------------------------------------

export interface LineupPlayer {
  shirtNumber: number;
  playerName: string;
}

export interface CardEvent {
  side: 'home' | 'away';
  eventType: 'yellow_card' | 'red_card';
  playerName: string;
  minute: number | undefined;
}

interface LineupTable {
  players: LineupPlayer[];
  cards: CardEvent[];
}

/** Extracts up to the first two `{| cellspacing="0" cellpadding="0" ...}` sub-tables following a Rugbybox block — home lineup first, away second. */
function extractLineupTableBodies(detailText: string): string[] {
  const bodies: string[] = [];
  const startRe = /\{\|\s*cellspacing="0"\s*cellpadding="0"[^\n]*\n/g;
  let m: RegExpExecArray | null;
  while (bodies.length < 2 && (m = startRe.exec(detailText))) {
    const start = m.index + m[0].length;
    const end = detailText.indexOf('\n|}', start);
    if (end === -1) break;
    bodies.push(detailText.slice(start, end));
    startRe.lastIndex = end;
  }
  return bodies;
}

const CARD_MINUTE_RE = /\{\{\s*(yel|sin bin|sent off)\s*\|([^}]*)\}\}/gi;

function cardsFromRow(row: string, side: 'home' | 'away'): CardEvent[] {
  const cards: CardEvent[] = [];
  const nameMatch = /'''\d{1,2}'''\s*\|\|\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(row);
  if (!nameMatch) return cards;
  const playerName = (nameMatch[2] ?? nameMatch[1]).replace(/\s*\([^)]*\)\s*$/, '').trim();

  let m: RegExpExecArray | null;
  CARD_MINUTE_RE.lastIndex = 0;
  while ((m = CARD_MINUTE_RE.exec(row))) {
    const template = m[1].toLowerCase();
    const params = m[2].split('|').map((p) => p.trim());
    const numeric = params.filter((p) => /^\d+$/.test(p)).map(Number);
    if (numeric.length === 0) continue;
    if (template === 'sent off') {
      cards.push({ side, eventType: 'red_card', playerName, minute: numeric[numeric.length - 1] });
    } else {
      // 'yel' and 'sin bin' (a temporary yellow-card sin-bin period) both read as a yellow card
      // at the first minute given (when the card was shown / the sin-bin period started).
      cards.push({ side, eventType: 'yellow_card', playerName, minute: numeric[0] });
    }
  }
  return cards;
}

function parseLineupTable(tableBody: string, side: 'home' | 'away'): LineupTable {
  const rows = tableBody.split(/\n\|-\n?/);
  const players: LineupPlayer[] = [];
  const cards: CardEvent[] = [];
  for (const row of rows) {
    const rowMatch = /'''(\d{1,2})'''\s*\|\|\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(row);
    if (rowMatch) {
      const shirtNumber = Number(rowMatch[1]);
      const playerName = (rowMatch[3] ?? rowMatch[2]).replace(/\s*\([^)]*\)\s*$/, '').trim();
      players.push({ shirtNumber, playerName });
    }
    cards.push(...cardsFromRow(row, side));
  }
  return { players, cards };
}

export interface ParsedLineups {
  springboks: LineupPlayer[];
  opponent: LineupPlayer[];
  cardEvents: Array<CardEvent & { teamSide: TeamSide }>;
}

/** Parses both lineup tables out of a matched Rugbybox block's detail text (home table first, away second per the observed page layout). */
export function parseLineups(detailText: string, homeIsSouthAfrica: boolean): ParsedLineups {
  const bodies = extractLineupTableBodies(detailText);
  const home = bodies[0] ? parseLineupTable(bodies[0], 'home') : { players: [], cards: [] };
  const away = bodies[1] ? parseLineupTable(bodies[1], 'away') : { players: [], cards: [] };

  const cardEvents = [...home.cards, ...away.cards].map((c) => ({
    ...c,
    teamSide: (c.side === 'home') === homeIsSouthAfrica ? ('springboks' as TeamSide) : ('opponent' as TeamSide),
  }));

  return {
    springboks: homeIsSouthAfrica ? home.players : away.players,
    opponent: homeIsSouthAfrica ? away.players : home.players,
    cardEvents,
  };
}

// ---------------------------------------------------------------------
// Officials beyond the referee.
// ---------------------------------------------------------------------

export interface AdditionalOfficial {
  role: OfficialRole;
  name: string;
}

const ROLE_LABELS: Array<[RegExp, OfficialRole]> = [
  [/assistant referees?/i, 'assistant_referee'],
  [/television match official|tmo/i, 'tmo'],
  [/reserve/i, 'other'],
];

/** The free-text officials block right after the lineup tables, from the first recognised label to the closing `|}`. */
function extractOfficialsBlock(detailText: string): string | undefined {
  const startMatch = /'''(?:Assistant referees?|Television match official|TMO|Reserve[^']*):'''/i.exec(detailText);
  if (!startMatch) return undefined;
  const start = startMatch.index;
  const end = detailText.indexOf('\n|}', start);
  return detailText.slice(start, end === -1 ? undefined : end);
}

/** Parses officials beyond the referee (assistant referees, TMO, reserve official) out of a matched block's detail text. */
export function parseAdditionalOfficials(detailText: string): AdditionalOfficial[] {
  const block = extractOfficialsBlock(detailText);
  if (!block) return [];

  const officials: AdditionalOfficial[] = [];
  let currentRole: OfficialRole | undefined;
  for (const rawLine of block.split(/<br\s*\/?>/i)) {
    const line = rawLine.trim();
    if (!line) continue;

    const labelMatch = /^'''([^']+):'''/.exec(line);
    if (labelMatch) {
      const found = ROLE_LABELS.find(([re]) => re.test(labelMatch[1]));
      currentRole = found?.[1];
      continue;
    }
    if (!currentRole) continue;

    const parenIdx = line.indexOf('(');
    const namePart = (parenIdx === -1 ? line : line.slice(0, parenIdx)).trim();
    const wikilinkMatch = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(namePart);
    const name = (wikilinkMatch ? (wikilinkMatch[2] ?? wikilinkMatch[1]) : namePart)
      .replace(/<ref[\s\S]*$/, '')
      .trim();
    if (name) officials.push({ role: currentRole, name });
  }
  return officials;
}

// ---------------------------------------------------------------------
// Scoring events (try/conversion/penalty/drop goal) — PRD D11: timed where
// the source has minutes, ordered-only otherwise.
// ---------------------------------------------------------------------

export interface EventRow {
  sequenceNo: number;
  eventType: EventType;
  teamSide: TeamSide;
  description: string;
  descriptionProvenance: Provenance;
  minute: number | null;
  minuteProvenance: Provenance;
}

const EVENT_TYPE_BY_KEY: Record<'try' | 'con' | 'pen' | 'drop', EventType> = {
  try: 'try',
  con: 'conversion',
  pen: 'penalty',
  drop: 'drop_goal',
};

function parseMinuteTokens(segment: string): number[] {
  const minutes: number[] = [];
  const re = /(\d+)(?:\+(\d+))?'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    minutes.push(Number(m[1]) + (m[2] ? Number(m[2]) : 0));
  }
  return minutes;
}

function scorerName(segment: string): string | undefined {
  const trimmed = segment.trim();
  // Anchored at the start: a wikilink target can itself contain parentheses
  // (e.g. "[[Try (rugby)#Penalty try|Penalty try]]"), so the parenthetical
  // "(made/attempts)" count that *follows* the link must not be searched
  // for until after the link itself has been matched off.
  const wikilinkMatch = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(trimmed);
  if (wikilinkMatch) {
    const name = (wikilinkMatch[2] ?? wikilinkMatch[1]).trim();
    return name || undefined;
  }
  const parenIdx = trimmed.search(/\(/);
  const namePart = (parenIdx === -1 ? trimmed : trimmed.slice(0, parenIdx)).trim();
  return namePart || undefined;
}

interface RawEvent {
  eventType: EventType;
  side: 'home' | 'away';
  name: string;
  minute: number | undefined;
  sourceOrder: number;
}

function collectRawEvents(fields: Record<string, string>): RawEvent[] {
  const events: RawEvent[] = [];
  let order = 0;
  for (const keyBase of ['try', 'con', 'pen', 'drop'] as const) {
    for (const side of ['1', '2'] as const) {
      const raw = fields[`${keyBase}${side}`];
      if (!raw) continue;
      for (const rawSegment of raw.split(/<br\s*\/?>/i)) {
        const segment = rawSegment.trim();
        if (!segment) continue;
        const name = scorerName(segment);
        if (!name) continue;
        const minutes = parseMinuteTokens(segment);
        const eventType = EVENT_TYPE_BY_KEY[keyBase];
        const eventSide = side === '1' ? 'home' : 'away';
        if (minutes.length > 0) {
          for (const minute of minutes) {
            events.push({ eventType, side: eventSide, name, minute, sourceOrder: order++ });
          }
        } else {
          events.push({ eventType, side: eventSide, name, minute: undefined, sourceOrder: order++ });
        }
      }
    }
  }
  return events;
}

/**
 * Turns a Rugbybox block's scorer fields into ordered `match_events` rows.
 * Timed events (a minute was found) sort by minute first; any untimed
 * events found alongside them are appended afterwards in source order
 * (PRD D11 — an ordered sequence is the honest fallback, never a guess).
 */
export function parseScoringEvents(fields: Record<string, string>, homeIsSouthAfrica: boolean): EventRow[] {
  const raw = collectRawEvents(fields);
  const timed = raw
    .filter((e) => e.minute !== undefined)
    .sort((a, b) => a.minute! - b.minute! || a.sourceOrder - b.sourceOrder);
  const untimed = raw.filter((e) => e.minute === undefined).sort((a, b) => a.sourceOrder - b.sourceOrder);

  return [...timed, ...untimed].map((e, i) => ({
    sequenceNo: i + 1,
    eventType: e.eventType,
    teamSide: (e.side === 'home') === homeIsSouthAfrica ? ('springboks' as TeamSide) : ('opponent' as TeamSide),
    description: e.name,
    descriptionProvenance: 'present',
    minute: e.minute ?? null,
    minuteProvenance: e.minute !== undefined ? 'present' : 'absent_in_source',
  }));
}

/**
 * Merges scoring events (tries/conversions/penalties/drop goals) with card
 * events (yellow/red, read off the lineup tables) into one `match_events`
 * sequence, sorted the same way as `parseScoringEvents` (timed first by
 * minute, then any untimed events in source order), and renumbered.
 */
export function mergeEventRows(scoringEvents: EventRow[], cardEvents: ParsedLineups['cardEvents']): EventRow[] {
  const cardRows: EventRow[] = cardEvents.map((c) => ({
    sequenceNo: 0,
    eventType: c.eventType,
    teamSide: c.teamSide,
    description: c.playerName,
    descriptionProvenance: 'present',
    minute: c.minute ?? null,
    minuteProvenance: c.minute !== undefined ? 'present' : 'absent_in_source',
  }));

  const all = [...scoringEvents, ...cardRows];
  const timed = all.filter((e) => e.minute !== null).sort((a, b) => a.minute! - b.minute!);
  const untimed = all.filter((e) => e.minute === null);

  return [...timed, ...untimed].map((e, i) => ({ ...e, sequenceNo: i + 1 }));
}
