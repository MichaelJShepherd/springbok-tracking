import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseListArticle } from './wiki-list-parser.js';
import { buildMatchRows, collectTeams } from './match-normaliser.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

describe('buildMatchRows', () => {
  it('builds a deterministic match_id from date + slugified opponent + sequence (D13)', () => {
    const parsed = parseListArticle(loadFixture('1896-lions.wikitext'));
    const { rows, skipped } = buildMatchRows(parsed);
    expect(skipped).toHaveLength(0);
    expect(rows.map((r) => r.matchId)).toEqual([
      '1896-09-05-british-irish-lions-1',
      '1896-08-29-british-irish-lions-1',
    ]);
  });

  it('disambiguates two same-day matches against the same opponent with an incrementing sequence', () => {
    const parsed = parseListArticle(loadFixture('1896-lions.wikitext'));
    // Force a same-day collision by cloning the first match's date onto the second.
    const collided = parsed.map((m, i) => (i === 1 ? { ...m, matchDate: parsed[0].matchDate } : m));
    const { rows } = buildMatchRows(collided);
    expect(rows[0].matchId).toBe('1896-09-05-british-irish-lions-1');
    expect(rows[1].matchId).toBe('1896-09-05-british-irish-lions-2');
  });

  it('derives result (win/loss/draw) from springboks vs opponent score', () => {
    const parsed = parseListArticle(loadFixture('1896-lions.wikitext'));
    const { rows } = buildMatchRows(parsed);
    expect(rows[0].result).toBe('win'); // 5-0
    expect(rows[1].result).toBe('loss'); // 3-9
  });

  it('skips a template with no identifiable date or opponent instead of inventing a row', () => {
    const parsed = parseListArticle(loadFixture('2005-tri-nations.wikitext'));
    const brokenBlock = { ...parsed[0], matchDate: undefined };
    const { rows, skipped } = buildMatchRows([brokenBlock, ...parsed.slice(1)]);
    expect(skipped).toHaveLength(1);
    expect(rows).toHaveLength(parsed.length - 1);
  });

  it('sets competition to absent_in_source universally (the list article has no competition field)', () => {
    const parsed = parseListArticle(loadFixture('2026-current.wikitext'));
    const { rows } = buildMatchRows(parsed);
    for (const row of rows) {
      expect(row.competition).toBeNull();
      expect(row.competitionProvenance).toBe('absent_in_source');
    }
  });
});

describe('collectTeams', () => {
  it('collects distinct opponents only, excluding South Africa itself', () => {
    const parsed = parseListArticle(loadFixture('2005-tri-nations.wikitext'));
    const teams = collectTeams(parsed);
    const names = teams.map((t) => t.canonicalName);
    expect(names).toContain('New Zealand');
    expect(names).toContain('France');
    expect(names).not.toContain('South Africa');
  });
});
