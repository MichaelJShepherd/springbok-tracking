// Canonical team names + aliases (PRD D13) — the small lookup that absorbs
// name drift across the list article's ~135 years of wikitext ("All Blacks"
// vs "New Zealand", "British Isles" vs "British & Irish Lions", and the
// handful of rugby-code duplicates the article itself uses inconsistently,
// e.g. both {{ru-rt|NZ}} and {{ru-rt|NZL}}).
//
// This table only needs to cover opponents that actually appear against
// South Africa in the list article — it is not a general country list.

export interface TeamDirectoryEntry {
  canonicalName: string;
  aliases: string[];
}

// Keyed by every short "code" token the article's templates use for a team
// (rugby union country code, IOC code, or ad-hoc variant). Several codes can
// point at the same canonical entry.
const CODE_DIRECTORY: Record<string, TeamDirectoryEntry> = {
  RSA: { canonicalName: 'South Africa', aliases: ['Springboks'] },
  SA: { canonicalName: 'South Africa', aliases: ['Springboks'] },
  ARG: { canonicalName: 'Argentina', aliases: ['Los Pumas'] },
  AUS: { canonicalName: 'Australia', aliases: ['Wallabies'] },
  CAN: { canonicalName: 'Canada', aliases: [] },
  ENG: { canonicalName: 'England', aliases: [] },
  ESP: { canonicalName: 'Spain', aliases: [] },
  FIJ: { canonicalName: 'Fiji', aliases: [] },
  FRA: { canonicalName: 'France', aliases: ['Les Bleus'] },
  GEO: { canonicalName: 'Georgia', aliases: [] },
  IRE: { canonicalName: 'Ireland', aliases: [] },
  ITA: { canonicalName: 'Italy', aliases: ['Azzurri'] },
  JPN: { canonicalName: 'Japan', aliases: ['Brave Blossoms'] },
  NAM: { canonicalName: 'Namibia', aliases: [] },
  NZ: { canonicalName: 'New Zealand', aliases: ['All Blacks'] },
  NZL: { canonicalName: 'New Zealand', aliases: ['All Blacks'] },
  POR: { canonicalName: 'Portugal', aliases: [] },
  ROM: { canonicalName: 'Romania', aliases: [] },
  ROU: { canonicalName: 'Romania', aliases: [] },
  SAM: { canonicalName: 'Samoa', aliases: [] },
  SCO: { canonicalName: 'Scotland', aliases: [] },
  TON: { canonicalName: 'Tonga', aliases: [] },
  URU: { canonicalName: 'Uruguay', aliases: [] },
  USA: { canonicalName: 'United States', aliases: ['Eagles'] },
  WAL: { canonicalName: 'Wales', aliases: [] },
};

// Teams that the article never wraps in a coded template — plain wikilink
// text instead (mainly the pre-professional-era British & Irish Lions
// tours). Keyed by the exact link text the parser falls back to.
const NAME_DIRECTORY: Record<string, TeamDirectoryEntry> = {
  'British & Irish Lions': { canonicalName: 'British & Irish Lions', aliases: ['British Isles'] },
  'British Isles': { canonicalName: 'British & Irish Lions', aliases: ['British Isles'] },
};

/** South Africa's own canonical entry, used to detect which side is the Springboks. */
export const SOUTH_AFRICA = CODE_DIRECTORY['RSA'];

/**
 * Resolves a team code (e.g. "NZL") to its canonical directory entry.
 * Returns undefined for an unrecognised code — callers must treat that as
 * an absent_in_source condition, never invent a name.
 */
export function resolveByCode(code: string): TeamDirectoryEntry | undefined {
  return CODE_DIRECTORY[code.toUpperCase()];
}

/**
 * Resolves a team by the plain display name the parser fell back to reading
 * off a wikilink (no coded template present).
 */
export function resolveByName(name: string): TeamDirectoryEntry {
  const trimmed = name.trim();
  return NAME_DIRECTORY[trimmed] ?? { canonicalName: trimmed, aliases: [] };
}

/** True if the given code identifies South Africa itself. */
export function isSouthAfricaCode(code: string): boolean {
  return code.toUpperCase() === 'RSA' || code.toUpperCase() === 'SA';
}
