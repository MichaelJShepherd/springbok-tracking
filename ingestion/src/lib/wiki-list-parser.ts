// Parser for Wikipedia's "List of South Africa rugby union test matches"
// wikitext (PRD D12/D17, docs/field-map.md).
//
// The article represents every test as one `{{#invoke:rugby box
// collapsible|main ... }}` template, one per match, nested under `==YYYY==`
// year headings. Two template generations exist (docs/field-map.md has the
// full breakdown):
//   - older/legacy: `team1` / `team2` fields, home side always `team1`.
//   - current: `home` / `away` fields.
// Both carry the same score/scorer/officials fields otherwise.

import { resolveByCode, resolveByName, type TeamDirectoryEntry } from './team-directory.js';

export type Provenance = 'present' | 'absent_in_source' | 'not_yet_fetched' | 'fetch_failed';

export interface ParsedOpponent {
  team: TeamDirectoryEntry;
  /** True if this field's value could not be resolved to any team at all. */
  unresolved: boolean;
}

export interface ParsedMatch {
  /** Raw fields exactly as read off the template, before normalisation. */
  rawFields: Record<string, string>;
  year: string;
  matchDate: string | undefined; // ISO yyyy-mm-dd
  matchDateRaw: string;
  home: ParsedOpponent | undefined;
  away: ParsedOpponent | undefined;
  homeIsSouthAfrica: boolean | undefined;
  springboksScore: number | undefined;
  opponentScore: number | undefined;
  scoreProvenance: Provenance;
  venue: string | undefined;
  venueProvenance: Provenance;
  competition: undefined;
  competitionProvenance: 'absent_in_source';
  kickoffTime: string | undefined;
  kickoffProvenance: Provenance;
  refereeName: string | undefined;
  refereeProvenance: Provenance;
  /** Which template generation produced this record — feeds the field map. */
  templateShape: 'team1_team2' | 'home_away' | 'unknown';
  parseErrors: string[];
}

const INVOKE_MARKER = '{{#invoke:rugby box collapsible|main';

/**
 * Extracts every balanced `{{...}}` block starting with `marker` from
 * `text`. A plain regex can't do this: field values routinely contain their
 * own nested `{{...}}` templates (e.g. `{{ru-rt|RSA}}`), which would end a
 * naive non-greedy match early.
 */
export function extractBalancedBlocks(text: string, marker: string): string[] {
  const blocks: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const start = text.indexOf(marker, searchFrom);
    if (start === -1) break;
    let depth = 1;
    let i = start + 2; // past the opening "{{"
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
    blocks.push(text.slice(start, i));
    searchFrom = i;
  }
  return blocks;
}

/**
 * Splits the whole list-article wikitext into `{ year, body }` sections at
 * each `===YYYY===` (or `==YYYY==`) heading, so every match block can be
 * tagged with the year it fell under (used for match_id sequencing and for
 * the per-era counts pasted on the ticket).
 */
export function splitYearSections(wikitext: string): Array<{ year: string; body: string }> {
  const headingRe = /^={2,3}\s*(\d{4})\s*={2,3}\s*$/gm;
  const marks: Array<{ year: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(wikitext))) {
    marks.push({ year: m[1], index: m.index });
  }
  const sections: Array<{ year: string; body: string }> = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].index : wikitext.length;
    sections.push({ year: marks[i].year, body: wikitext.slice(marks[i].index, end) });
  }
  return sections;
}

/** Parses `| field = value` lines (one field per line) out of a template block. */
export function parseTemplateFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lineRe = /^[ \t]*\|[ \t]*([a-zA-Z0-9_]+)[ \t]*=[ \t]*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block))) {
    fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * Parses "5 September 1896" into "1896-09-05". Tolerates two wikitext
 * wrappers seen in the article: wikilinks (`[[Sep 5|5 September 1896]]`)
 * and external links used to cite a match report (`[https://example.com/x
 * 20 October 2019]` — the URL plus a space then the display date).
 */
export function parseWikiDate(raw: string): string | undefined {
  const unwikilinked = raw.replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').trim();
  const externalLinkMatch = /^\[\S+\s+([^\]]+)\]$/.exec(unwikilinked);
  const linkStripped = externalLinkMatch ? externalLinkMatch[1].trim() : unwikilinked;
  // Some entries (e.g. 1995/1999 World Cup finals) carry a trailing
  // footnote marker like " *" pointing at a note elsewhere on the page —
  // irrelevant to the date itself.
  const stripped = linkStripped.replace(/\s*\*+\s*$/, '').trim();
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(stripped);
  if (!match) return undefined;
  const day = match[1].padStart(2, '0');
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return undefined;
  return `${match[3]}-${month}-${day}`;
}

/** Parses a "43–0" / "43-0" score field into { left, right }. */
export function parseScore(raw: string): { left: number; right: number } | undefined {
  const cleaned = raw.replace(/\[\[[^\]]*\]\]/g, '').trim();
  const match = /^(\d+)\s*[–-]\s*(\d+)$/.exec(cleaned);
  if (!match) return undefined;
  return { left: Number(match[1]), right: Number(match[2]) };
}

/** Extracts the country-code token out of a `{{ru-rt|RSA}}`-style value. */
function codeFromTemplate(raw: string): string | undefined {
  const match = /\{\{(?:ru-rt|Ru-rt|ru|Ru|#invoke:flag\|ru)\|([A-Za-z0-9]+)/i.exec(raw);
  return match?.[1];
}

/** Extracts the last wikilink display text as a name fallback (e.g. tour sides with no code template). */
function nameFromWikilink(raw: string): string | undefined {
  const links = [...raw.matchAll(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g)];
  if (links.length === 0) return undefined;
  return links[links.length - 1][2].trim();
}

/** Resolves a team1/team2/home/away field value to a directory entry. */
export function resolveOpponentField(raw: string): ParsedOpponent {
  const code = codeFromTemplate(raw);
  if (code) {
    const team = resolveByCode(code);
    if (team) return { team, unresolved: false };
    // Recognised template shape, unrecognised code: still not a hard failure —
    // fall back to the code itself as a display name rather than erroring.
    return { team: { canonicalName: code, aliases: [] }, unresolved: true };
  }
  const name = nameFromWikilink(raw);
  if (name) return { team: resolveByName(name), unresolved: false };
  return { team: { canonicalName: raw.trim() || 'Unknown', aliases: [] }, unresolved: true };
}

/** Parses one `{{#invoke:rugby box collapsible|main ...}}` block into a ParsedMatch. */
export function parseMatchBlock(block: string, year: string): ParsedMatch {
  const rawFields = parseTemplateFields(block);
  const parseErrors: string[] = [];

  const matchDateRaw = rawFields['date'] ?? '';
  const matchDate = matchDateRaw ? parseWikiDate(matchDateRaw) : undefined;
  if (matchDateRaw && !matchDate) parseErrors.push(`unparsed date: "${matchDateRaw}"`);

  const templateShape: ParsedMatch['templateShape'] =
    'home' in rawFields || 'away' in rawFields
      ? 'home_away'
      : 'team1' in rawFields || 'team2' in rawFields
        ? 'team1_team2'
        : 'unknown';

  let home: ParsedOpponent | undefined;
  let away: ParsedOpponent | undefined;
  if (templateShape === 'home_away') {
    home = rawFields['home'] ? resolveOpponentField(rawFields['home']) : undefined;
    away = rawFields['away'] ? resolveOpponentField(rawFields['away']) : undefined;
  } else if (templateShape === 'team1_team2') {
    home = rawFields['team1'] ? resolveOpponentField(rawFields['team1']) : undefined;
    away = rawFields['team2'] ? resolveOpponentField(rawFields['team2']) : undefined;
  } else {
    parseErrors.push('neither home/away nor team1/team2 fields present');
  }

  // A side that resolved to *something* but not via a recognised code/template or a
  // wikilink is a real data-quality signal (an unrecognised or restructured opponent
  // field) — record it so the run's failure count and D25 guardrail visibility catch
  // it, instead of it silently becoming a garbage team name (PRD D25's whole point).
  if (home?.unresolved) parseErrors.push(`unresolved home side: "${rawFields['home'] ?? rawFields['team1'] ?? ''}"`);
  if (away?.unresolved) parseErrors.push(`unresolved away side: "${rawFields['away'] ?? rawFields['team2'] ?? ''}"`);

  let homeIsSouthAfrica: boolean | undefined;
  if (home?.team.canonicalName === 'South Africa') homeIsSouthAfrica = true;
  else if (away?.team.canonicalName === 'South Africa') homeIsSouthAfrica = false;

  const scoreRaw = rawFields['score'];
  const parsedScore = scoreRaw ? parseScore(scoreRaw) : undefined;
  let springboksScore: number | undefined;
  let opponentScore: number | undefined;
  let scoreProvenance: Provenance = 'not_yet_fetched';
  if (!scoreRaw) {
    scoreProvenance = 'absent_in_source';
  } else if (!parsedScore) {
    scoreProvenance = 'fetch_failed';
    parseErrors.push(`unparsed score: "${scoreRaw}"`);
  } else if (homeIsSouthAfrica === true) {
    springboksScore = parsedScore.left;
    opponentScore = parsedScore.right;
    scoreProvenance = 'present';
  } else if (homeIsSouthAfrica === false) {
    springboksScore = parsedScore.right;
    opponentScore = parsedScore.left;
    scoreProvenance = 'present';
  } else {
    scoreProvenance = 'fetch_failed';
    parseErrors.push('could not determine which side is South Africa');
  }

  const venueRaw = rawFields['stadium'];
  const venue = venueRaw ? venueRaw.replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').trim() : undefined;
  const venueProvenance: Provenance = venue ? 'present' : 'absent_in_source';

  const kickoffRaw = rawFields['time'];
  let kickoffTime: string | undefined;
  let kickoffProvenance: Provenance;
  if (!kickoffRaw || !kickoffRaw.trim()) {
    kickoffProvenance = 'absent_in_source';
  } else if (matchDate) {
    const timeMatch = /^(\d{1,2}):(\d{2})/.exec(kickoffRaw.trim());
    if (timeMatch) {
      kickoffTime = `${matchDate}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00Z`;
      kickoffProvenance = 'present';
    } else {
      kickoffProvenance = 'fetch_failed';
      parseErrors.push(`unparsed kickoff time: "${kickoffRaw}"`);
    }
  } else {
    kickoffProvenance = 'fetch_failed';
  }

  const refereeRaw = rawFields['referee'];
  const refereeName = refereeRaw
    ? refereeRaw.replace(/\([^)]*\)\s*$/, '').replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').trim()
    : undefined;
  const refereeProvenance: Provenance = refereeName ? 'present' : 'absent_in_source';

  return {
    rawFields,
    year,
    matchDate,
    matchDateRaw,
    home,
    away,
    homeIsSouthAfrica,
    springboksScore,
    opponentScore,
    scoreProvenance,
    venue,
    venueProvenance,
    competition: undefined,
    competitionProvenance: 'absent_in_source',
    kickoffTime,
    kickoffProvenance,
    refereeName,
    refereeProvenance,
    templateShape,
    parseErrors,
  };
}

/** Parses the whole list-article wikitext into one ParsedMatch per test, in source order. */
export function parseListArticle(wikitext: string): ParsedMatch[] {
  const sections = splitYearSections(wikitext);
  const matches: ParsedMatch[] = [];
  for (const section of sections) {
    const blocks = extractBalancedBlocks(section.body, INVOKE_MARKER);
    for (const block of blocks) {
      matches.push(parseMatchBlock(block, section.year));
    }
  }
  return matches;
}
