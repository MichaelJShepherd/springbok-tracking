import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  findRugbyboxBlocks,
  blockMatchesTarget,
  resolveRugbyboxSides,
  rugbyboxReferee,
  rugbyboxScore,
  parseLineups,
  parseAdditionalOfficials,
  parseScoringEvents,
  mergeEventRows,
} from './rugbybox-parser.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

describe('findRugbyboxBlocks + blockMatchesTarget — 2023 RWC final (individual match article shape)', () => {
  const wikitext = loadFixture('2023-rwc-final.wikitext');
  const blocks = findRugbyboxBlocks(wikitext);

  it('finds exactly one Rugbybox block', () => {
    expect(blocks).toHaveLength(1);
  });

  it('matches the block against the right target (date + opponent)', () => {
    const sides = blockMatchesTarget(blocks[0], { matchDate: '2023-10-28', opponentCanonicalName: 'New Zealand' });
    expect(sides).toBeDefined();
    expect(sides?.homeIsSouthAfrica).toBe(false);
  });

  it('does not match a different date or a different opponent', () => {
    expect(blockMatchesTarget(blocks[0], { matchDate: '2023-10-29', opponentCanonicalName: 'New Zealand' })).toBeUndefined();
    expect(blockMatchesTarget(blocks[0], { matchDate: '2023-10-28', opponentCanonicalName: 'Australia' })).toBeUndefined();
  });

  it('reads the referee straight off the block, cleaned of wikilink/ref markup', () => {
    const { name, provenance } = rugbyboxReferee(blocks[0].fields);
    expect(name).toBe('Wayne Barnes');
    expect(provenance).toBe('present');
  });

  it('reads the cross-check score in home/away order', () => {
    expect(rugbyboxScore(blocks[0].fields)).toEqual({ home: 11, away: 12 });
  });
});

describe('parseLineups — 2023 RWC final', () => {
  const wikitext = loadFixture('2023-rwc-final.wikitext');
  const block = findRugbyboxBlocks(wikitext)[0];
  const sides = resolveRugbyboxSides(block.fields)!;
  const lineups = parseLineups(block.detailText, sides.homeIsSouthAfrica);

  it('assigns the home table (New Zealand) to opponent and the away table (South Africa) to springboks', () => {
    expect(sides.homeIsSouthAfrica).toBe(false);
    expect(lineups.opponent.find((p) => p.shirtNumber === 15)?.playerName).toBe('Beauden Barrett');
    expect(lineups.springboks.find((p) => p.shirtNumber === 15)?.playerName).toBe('Damian Willemse');
  });

  it('captures both starting XV and replacements (15 + 8 = 23 rows per side)', () => {
    expect(lineups.springboks).toHaveLength(23);
    expect(lineups.opponent).toHaveLength(23);
  });

  it('strips a captaincy annotation out of the player name', () => {
    expect(lineups.opponent.find((p) => p.shirtNumber === 7)?.playerName).toBe('Sam Cane');
  });

  it('reads yellow and red cards off the lineup rows, attributed to the right side', () => {
    const redCard = lineups.cardEvents.find((c) => c.eventType === 'red_card');
    expect(redCard).toMatchObject({ playerName: 'Sam Cane', teamSide: 'opponent', minute: 27 });

    const yellowCards = lineups.cardEvents.filter((c) => c.eventType === 'yellow_card');
    expect(yellowCards).toContainEqual(expect.objectContaining({ playerName: 'Shannon Frizell', teamSide: 'opponent', minute: 2 }));
    expect(yellowCards).toContainEqual(expect.objectContaining({ playerName: 'Cheslin Kolbe', teamSide: 'springboks', minute: 73 }));
    expect(yellowCards).toContainEqual(expect.objectContaining({ playerName: 'Siya Kolisi', teamSide: 'springboks', minute: 45 }));
  });
});

describe('parseAdditionalOfficials — 2023 RWC final', () => {
  const wikitext = loadFixture('2023-rwc-final.wikitext');
  const block = findRugbyboxBlocks(wikitext)[0];
  const officials = parseAdditionalOfficials(block.detailText);

  it('finds both assistant referees, the TMO, and the reserve official — none confused with each other', () => {
    expect(officials).toContainEqual({ role: 'assistant_referee', name: 'Karl Dickson' });
    expect(officials).toContainEqual({ role: 'assistant_referee', name: 'Matthew Carley' });
    expect(officials).toContainEqual({ role: 'tmo', name: 'Tom Foley' });
    expect(officials).toContainEqual({ role: 'other', name: 'Luke Pearce' });
  });

  it('does not mistake the country wikilink in a plain (no-link) name line for the official\'s name', () => {
    // "Tom Foley ([[Rugby Football Union|England]])" has no wikilink on Foley's own name —
    // a naive "first wikilink on the line" parse would wrongly read "England" as the TMO.
    const tmo = officials.find((o) => o.role === 'tmo');
    expect(tmo?.name).not.toBe('England');
    expect(tmo?.name).not.toBe('Rugby Football Union');
  });

  it('does not record "Player of the Match" as an official', () => {
    expect(officials.find((o) => o.name === 'Pieter-Steph du Toit')).toBeUndefined();
  });
});

describe('parseScoringEvents — 2023 RWC final (timed scorer fields)', () => {
  const wikitext = loadFixture('2023-rwc-final.wikitext');
  const block = findRugbyboxBlocks(wikitext)[0];
  const sides = resolveRugbyboxSides(block.fields)!;
  const events = parseScoringEvents(block.fields, sides.homeIsSouthAfrica);

  it('expands a multi-minute scorer entry into one event per minute, all present/timed', () => {
    const pollardEvents = events.filter((e) => e.description === 'Pollard');
    expect(pollardEvents).toHaveLength(4);
    expect(pollardEvents.every((e) => e.eventType === 'penalty' && e.minuteProvenance === 'present')).toBe(true);
    expect(pollardEvents.map((e) => e.minute).sort((a, b) => a! - b!)).toEqual([3, 13, 19, 34]);
  });

  it('sorts all events by minute across scorer fields, not by field order', () => {
    const minutes = events.map((e) => e.minute);
    const sorted = [...minutes].sort((a, b) => a! - b!);
    expect(minutes).toEqual(sorted);
  });

  it('attributes each event to the correct team side (away=South Africa here)', () => {
    const barrettTry = events.find((e) => e.description === 'B. Barrett');
    expect(barrettTry).toMatchObject({ eventType: 'try', teamSide: 'opponent', minute: 58 });
    const pollardPen = events.find((e) => e.description === 'Pollard');
    expect(pollardPen?.teamSide).toBe('springboks');
  });
});

describe('parseScoringEvents — 2022 South Africa v Wales (season-article shape, mixed minute formats)', () => {
  const wikitext = loadFixture('2022-sa-wales.wikitext');
  const block = findRugbyboxBlocks(wikitext)[0];
  const sides = resolveRugbyboxSides(block.fields)!;
  const events = parseScoringEvents(block.fields, sides.homeIsSouthAfrica);

  it('home is South Africa here (unlike the RWC final fixture) — sides are resolved per block, not assumed', () => {
    expect(sides.homeIsSouthAfrica).toBe(true);
  });

  it('parses a stoppage-time minute ("80+3\'") as base + added time', () => {
    const stoppageTimeEvent = events.find((e) => e.description === 'Willemse' && e.eventType === 'penalty' && e.minute === 83);
    expect(stoppageTimeEvent).toBeDefined();
  });

  it('expands a single "(2) 3\' m, 32\' c" entry into two events for the same player', () => {
    const reesZammitEvents = events.filter((e) => e.description === 'Rees-Zammit');
    expect(reesZammitEvents).toHaveLength(2);
    expect(reesZammitEvents.map((e) => e.minute).sort((a, b) => a! - b!)).toEqual([3, 32]);
  });

  it('reads an unnamed "Penalty try" entry as its own event rather than dropping it', () => {
    const penaltyTry = events.find((e) => e.description.toLowerCase().includes('penalty try'));
    expect(penaltyTry).toMatchObject({ eventType: 'try', minute: 75, teamSide: 'springboks' });
  });
});

describe('mergeEventRows', () => {
  it('interleaves card events with scoring events by minute and renumbers sequentially', () => {
    const wikitext = loadFixture('2022-sa-wales.wikitext');
    const block = findRugbyboxBlocks(wikitext)[0];
    const sides = resolveRugbyboxSides(block.fields)!;
    const scoring = parseScoringEvents(block.fields, sides.homeIsSouthAfrica);
    const lineups = parseLineups(block.detailText, sides.homeIsSouthAfrica);

    const merged = mergeEventRows(scoring, lineups.cardEvents);

    // A yellow card exists at minute 74 (Rees-Zammit) — it must land in minute order
    // among the scoring events, not just appended at the end.
    const cardIndex = merged.findIndex((e) => e.eventType === 'yellow_card' && e.minute === 74);
    const laterScoringIndex = merged.findIndex((e) => e.minute === 75);
    expect(cardIndex).toBeGreaterThanOrEqual(0);
    expect(cardIndex).toBeLessThan(laterScoringIndex);

    // sequence_no is 1..N with no gaps, matching array position.
    expect(merged.map((e) => e.sequenceNo)).toEqual(merged.map((_, i) => i + 1));
  });
});

describe('findRugbyboxBlocks — a page with no Rugbybox at all (pre-professional-era matches have no such source)', () => {
  it('returns an empty list rather than throwing, so callers can honestly fall back to absent_in_source', () => {
    expect(findRugbyboxBlocks('Just some prose about an 1896 tour, no infobox templates here.')).toEqual([]);
  });
});
