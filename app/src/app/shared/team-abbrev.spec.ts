import { abbreviateOpponent } from './team-abbrev';

describe('abbreviateOpponent (docs/design.md §7.1)', () => {
  it('is always exactly 3 characters, for an aliased name, a short fallback name, and a long fallback name', () => {
    expect(abbreviateOpponent('New Zealand').length).toBe(3);
    expect(abbreviateOpponent('St').length).toBe(3);
    expect(abbreviateOpponent('Someveryunexpectedcountry').length).toBe(3);
  });

  it('maps "British & Irish Lions" to its own curated 3-char code, distinct from "British Isles"', () => {
    const lions = abbreviateOpponent('British & Irish Lions');
    expect(lions.length).toBe(3);
    expect(lions).not.toBe('LIONS');
    expect(lions).not.toBe(abbreviateOpponent('British Isles'));
  });

  it('never returns padEnd-junk (e.g. a repeated first letter) for a short unaliased name', () => {
    // The old fallback padded with the first letter, turning "St" into
    // "STS" — the sane fallback pads with '?' instead.
    expect(abbreviateOpponent('St')).toBe('ST?');
  });
});
