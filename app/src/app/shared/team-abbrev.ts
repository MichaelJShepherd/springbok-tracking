/**
 * Three-letter opponent abbreviation for the form guide / head-to-head
 * marks (docs/design.md §7.1: "derived in the client from
 * `teams.canonical_name`... or a small alias map"). No schema change: this
 * is a small, client-owned lookup with a deterministic fallback so a new
 * opponent never breaks the mark.
 */
const ALIASES: Record<string, string> = {
  'New Zealand': 'NZL',
  England: 'ENG',
  Scotland: 'SCO',
  Wales: 'WAL',
  Ireland: 'IRE',
  France: 'FRA',
  Australia: 'AUS',
  Argentina: 'ARG',
  Italy: 'ITA',
  Fiji: 'FIJ',
  Samoa: 'SAM',
  Georgia: 'GEO',
  Namibia: 'NAM',
  'United States': 'USA',
  'British Isles': 'BIL',
  // Distinct from 'British Isles' (BIL) above — the two must never collide.
  'British & Irish Lions': 'LIO',
};

/** Marks are always exactly 3 characters (docs/design.md §7.1). */
export function abbreviateOpponent(name: string): string {
  const alias = ALIASES[name];
  if (alias) return alias;
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!letters) return '???';
  // Sane, deterministic fallback for a short name: pad with '?' rather than
  // repeating the first letter (the old `padEnd(3, letters.charAt(0))`
  // produced odd results like "STS" for "St").
  return letters.slice(0, 3).padEnd(3, '?');
}
