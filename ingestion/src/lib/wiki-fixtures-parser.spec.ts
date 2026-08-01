import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractFixtureBlocks, parseFixtureBlock, parseSeasonArticleFixtures } from './wiki-fixtures-parser.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

const SOURCE_URL = 'https://en.wikipedia.org/wiki/2026_men%27s_rugby_union_internationals';

describe('extractFixtureBlocks', () => {
  it('extracts every {{rugbybox}}/{{Rugbybox}} block regardless of marker case, brace-depth aware', () => {
    const text =
      '{{rugbybox\n|date = 1 January 2026\n|stadium = [[Some Ground]]\n}}\n----\n{{Rugbybox\n|date = 2 January 2026\n}}';
    const blocks = extractFixtureBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('Some Ground');
    expect(blocks[1]).toContain('2 January 2026');
  });

  it('does not truncate early on a field value containing its own nested {{...}} template', () => {
    const text = '{{rugbybox\n|team1 = {{ru-rt|RSA}}\n|team2 = {{ru|NZL}}\n}}\nTRAILING';
    const blocks = extractFixtureBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('team2 = {{ru|NZL}}');
    expect(blocks[0]).not.toContain('TRAILING');
  });
});

describe('parseSeasonArticleFixtures — 2026 men\'s rugby union internationals (recorded fixture, task #79)', () => {
  const { fixtures, notApplicable } = parseSeasonArticleFixtures(
    loadFixture('2026-mens-internationals.wikitext'),
    SOURCE_URL,
  );

  it('excludes an A-team fixture (ruA-rt code) — neither side resolves to the senior South Africa side', () => {
    expect(fixtures.some((f) => f.matchDate === '2026-06-20')).toBe(false);
  });

  it('excludes a fixture with neither side being South Africa (Namibia v Blue Bulls)', () => {
    expect(fixtures.some((f) => f.venue === 'Hage Geingob Rugby Stadium, Windhoek')).toBe(false);
  });

  it('excludes an already-played South Africa fixture (clean numeric score)', () => {
    expect(fixtures.some((f) => f.matchDate === '2026-07-18')).toBe(false);
    expect(notApplicable.some((r) => r.includes('already played'))).toBe(true);
  });

  it('includes a genuinely upcoming fixture with a resolvable opponent, kickoff and venue, status scheduled', () => {
    const fixture = fixtures.find((f) => f.matchDate === '2026-08-08');
    expect(fixture).toBeDefined();
    expect(fixture?.opponentName).toBe('Argentina');
    expect(fixture?.status).toBe('scheduled');
    expect(fixture?.kickoffTime).toBe('2026-08-08T16:00:00Z');
    expect(fixture?.venue).toBe('José Amalfitani Stadium, Buenos Aires');
  });

  it('marks a fixture with TBC time/venue as status tbd, with no kickoff time invented', () => {
    const fixture = fixtures.find((f) => f.matchDate === '2026-09-05');
    expect(fixture).toBeDefined();
    expect(fixture?.status).toBe('tbd');
    expect(fixture?.kickoffTime).toBeNull();
  });

  it('marks a "Postponed" score field as status postponed, not as an already-played match', () => {
    const fixture = fixtures.find((f) => f.matchDate === '2026-09-12');
    expect(fixture).toBeDefined();
    expect(fixture?.status).toBe('postponed');
  });

  it('marks a "Cancelled" score field as status cancelled', () => {
    const fixture = fixtures.find((f) => f.matchDate === '2026-09-27');
    expect(fixture).toBeDefined();
    expect(fixture?.status).toBe('cancelled');
  });

  it('still writes a row for an unresolved opponent, flagged rather than silently dropped (D25 visibility)', () => {
    const fixture = fixtures.find((f) => f.matchDate === '2026-10-03');
    expect(fixture).toBeDefined();
    expect(fixture?.opponentUnresolved).toBe(true);
    expect(fixture?.parseErrors.some((e) => e.includes('unresolved opponent'))).toBe(true);
  });

  it('excludes a fixture where neither side is South Africa at all (New Zealand v Australia)', () => {
    expect(fixtures.some((f) => f.matchDate === '2026-10-10')).toBe(false);
  });
});

describe('parseFixtureBlock — edge cases', () => {
  it('does not write a row when both sides resolve to South Africa', () => {
    const block = `{{rugbybox
|date = 1 January 2026
|team1 = {{ru-rt|RSA}}
|score =
|team2 = {{ru-rt|RSA}}
|stadium = [[Some Ground]]
}}`;
    const { fixture, notApplicableReason } = parseFixtureBlock(block, SOURCE_URL);
    expect(fixture).toBeUndefined();
    expect(notApplicableReason).toContain('both sides resolved to South Africa');
  });

  it('does not write a row when the date is unparseable', () => {
    const block = `{{rugbybox
|date = sometime next year
|team1 = {{ru-rt|RSA}}
|score =
|team2 = {{ru|NZL}}
}}`;
    const { fixture, notApplicableReason } = parseFixtureBlock(block, SOURCE_URL);
    expect(fixture).toBeUndefined();
    expect(notApplicableReason).toContain('unparsed/missing date');
  });
});
