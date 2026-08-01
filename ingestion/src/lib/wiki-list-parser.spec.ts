import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseListArticle, parseMatchBlock, parseWikiDate, parseScore, extractBalancedBlocks } from './wiki-list-parser.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

describe('parseWikiDate', () => {
  it('parses a plain "D Month YYYY" date into ISO form', () => {
    expect(parseWikiDate('5 September 1896')).toBe('1896-09-05');
  });

  it('returns undefined for unrecognised date text (no live behaviour to fall back on)', () => {
    expect(parseWikiDate('some day next week')).toBeUndefined();
  });

  it('parses a date wrapped in an external-link citation (2019 RWC era: "[https://... 20 October 2019]")', () => {
    expect(parseWikiDate('[https://www.rugbyworldcup.com/match/25333/ 20 October 2019]')).toBe('2019-10-20');
  });

  it('parses a date with a trailing footnote marker (1995/1999 World Cup finals: "24 June 1995 *")', () => {
    expect(parseWikiDate('24 June 1995 *')).toBe('1995-06-24');
  });
});

describe('parseScore', () => {
  it('parses a numeric en-dash score into left/right', () => {
    expect(parseScore('43–0')).toEqual({ left: 43, right: 0 });
  });

  it('returns undefined for a non-numeric score field', () => {
    expect(parseScore('twenty-six to twenty')).toBeUndefined();
  });
});

describe('extractBalancedBlocks', () => {
  it('extracts a template whose fields contain nested {{...}} templates without truncating early', () => {
    const text = '{{#invoke:x|main\n| team1 = {{ru-rt|RSA}}\n| team2 = {{ru|NZL}}\n}}\nTRAILING TEXT';
    const blocks = extractBalancedBlocks(text, '{{#invoke:x|main');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('team2 = {{ru|NZL}}');
    expect(blocks[0].endsWith('}}')).toBe(true);
    expect(blocks[0]).not.toContain('TRAILING TEXT');
  });
});

describe('parseListArticle — 1890s era (team1/team2, raw wikilink opponent)', () => {
  const matches = parseListArticle(loadFixture('1896-lions.wikitext'));

  it('finds both matches in source order', () => {
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.matchDate)).toEqual(['1896-09-05', '1896-08-29']);
  });

  it('resolves the coded South Africa side and the raw-wikilink Lions side, with correct home/away', () => {
    const first = matches[0];
    expect(first.templateShape).toBe('team1_team2');
    expect(first.homeIsSouthAfrica).toBe(true);
    expect(first.home?.team.canonicalName).toBe('South Africa');
    expect(first.away?.team.canonicalName).toBe('British & Irish Lions');
  });

  it('assigns springboks/opponent scores the right way round from the shared score field', () => {
    const first = matches[0];
    expect(first.springboksScore).toBe(5);
    expect(first.opponentScore).toBe(0);
    expect(first.scoreProvenance).toBe('present');
  });

  it('marks a genuinely blank referee field as absent_in_source, not fetch_failed', () => {
    const second = matches[1];
    expect(second.refereeName).toBeUndefined();
    expect(second.refereeProvenance).toBe('absent_in_source');
  });

  it('marks a present referee as present with a clean display name', () => {
    const first = matches[0];
    expect(first.refereeProvenance).toBe('present');
    expect(first.refereeName).toContain('Alf Richards');
  });

  it('marks the absent kickoff time field as absent_in_source', () => {
    expect(matches[0].kickoffProvenance).toBe('absent_in_source');
  });
});

describe('parseMatchBlock — unresolved opponent field (PRD D25 visibility)', () => {
  it('records a parse error (not a silent garbage team) when an opponent field has neither a coded template nor a wikilink', () => {
    const block = `{{#invoke:rugby box collapsible|main
| date = 1 January 2000
| team1 = {{ru-rt|RSA}}
| score = 10–5
| team2 = Some Unrecognised Text With No Markup At All
}}`;
    const parsed = parseMatchBlock(block, '2000');
    expect(parsed.away?.unresolved).toBe(true);
    expect(parsed.parseErrors.some((e) => e.includes('unresolved away side'))).toBe(true);
  });

  it('does not flag a normally-resolved opponent as unresolved', () => {
    const block = `{{#invoke:rugby box collapsible|main
| date = 1 January 2000
| team1 = {{ru-rt|RSA}}
| score = 10–5
| team2 = {{ru-rt|NZL}}
}}`;
    const parsed = parseMatchBlock(block, '2000');
    expect(parsed.away?.unresolved).toBe(false);
    expect(parsed.parseErrors.some((e) => e.includes('unresolved'))).toBe(false);
  });
});

describe('parseListArticle — 2005 era (team1/team2, coded opponent via #invoke:flag, drop goals)', () => {
  const matches = parseListArticle(loadFixture('2005-tri-nations.wikitext'));

  it('resolves an {{#invoke:flag|ru|CODE}} opponent template', () => {
    const home = matches[0];
    expect(home.away?.team.canonicalName).toBe('New Zealand');
  });

  it('flags an unparseable score field as fetch_failed rather than guessing', () => {
    const malformed = matches.find((m) => m.rawFields['score'] === 'twenty-six to twenty');
    expect(malformed).toBeDefined();
    expect(malformed?.scoreProvenance).toBe('fetch_failed');
    expect(malformed?.springboksScore).toBeUndefined();
    expect(malformed?.parseErrors.some((e) => e.includes('unparsed score'))).toBe(true);
  });
});

describe('parseListArticle — modern era (home/away fields, kickoff time present)', () => {
  const matches = parseListArticle(loadFixture('2026-current.wikitext'));

  it('uses the home/away template shape', () => {
    expect(matches[0].templateShape).toBe('home_away');
  });

  it('parses a populated kickoff time into an ISO timestamp anchored on the match date', () => {
    expect(matches[0].kickoffTime).toBe('2026-07-18T15:00:00Z');
    expect(matches[0].kickoffProvenance).toBe('present');
  });

  it('still records absent_in_source when the modern-era time field is blank', () => {
    expect(matches[1].kickoffProvenance).toBe('absent_in_source');
  });
});
