import { describe, expect, it } from 'vitest';
import { resolveByAnyKnownName } from './team-directory.js';

describe('resolveByAnyKnownName (task #79 — API-Sports opponent canonicalisation, Gate 2 finding)', () => {
  it('resolves an already-canonical name to itself', () => {
    expect(resolveByAnyKnownName('New Zealand').canonicalName).toBe('New Zealand');
  });

  it('resolves a known alias to its canonical name, case-insensitively', () => {
    expect(resolveByAnyKnownName('all blacks').canonicalName).toBe('New Zealand');
    expect(resolveByAnyKnownName('Los Pumas').canonicalName).toBe('Argentina');
  });

  it('resolves the British & Irish Lions alias entry (NAME_DIRECTORY, not CODE_DIRECTORY)', () => {
    expect(resolveByAnyKnownName('British Isles').canonicalName).toBe('British & Irish Lions');
  });

  it('falls back to the trimmed input unchanged for a name this directory has never seen — never invents a match', () => {
    expect(resolveByAnyKnownName('  Utopia XV  ').canonicalName).toBe('Utopia XV');
  });
});
