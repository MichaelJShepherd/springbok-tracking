// Turns ParsedMatch records (wiki-list-parser.ts) into the rows the schema
// expects for `teams` and `matches` (PRD D13/D16).

import type { ParsedMatch, Provenance } from './wiki-list-parser.js';
import type { TeamDirectoryEntry } from './team-directory.js';

export interface TeamRow {
  canonicalName: string;
  aliases: string[];
}

export interface MatchRow {
  matchId: string;
  matchDate: string;
  opponentCanonicalName: string;
  sequence: number;
  competition: string | null;
  competitionProvenance: Provenance;
  venue: string | null;
  venueProvenance: Provenance;
  kickoffTime: string | null;
  kickoffTimeProvenance: Provenance;
  homeAway: 'home' | 'away' | null;
  springboksScore: number | null;
  springboksScoreProvenance: Provenance;
  opponentScore: number | null;
  opponentScoreProvenance: Provenance;
  result: 'win' | 'loss' | 'draw' | null;
  sourceArticleUrl: string;
  refereeName: string | null;
  refereeProvenance: Provenance;
  parseErrors: string[];
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const SOURCE_ARTICLE_URL =
  'https://en.wikipedia.org/wiki/List_of_South_Africa_rugby_union_test_matches';

/**
 * Builds one MatchRow per ParsedMatch that has enough to identify (a date
 * and an opponent). Matches missing even that are reported as skipped by
 * the caller rather than silently dropped (D25 needs an honest count).
 *
 * `sequence` disambiguates same-day fixtures against the same opponent
 * (PRD D13) — assigned in source-order per (date, opponent) pair.
 */
export function buildMatchRows(parsed: ParsedMatch[]): { rows: MatchRow[]; skipped: ParsedMatch[] } {
  const rows: MatchRow[] = [];
  const skipped: ParsedMatch[] = [];
  const sequenceCounts = new Map<string, number>();

  for (const m of parsed) {
    const opponent: TeamDirectoryEntry | undefined =
      m.homeIsSouthAfrica === true ? m.away?.team : m.homeIsSouthAfrica === false ? m.home?.team : undefined;

    if (!m.matchDate || !opponent) {
      skipped.push(m);
      continue;
    }

    const key = `${m.matchDate}|${opponent.canonicalName}`;
    const sequence = (sequenceCounts.get(key) ?? 0) + 1;
    sequenceCounts.set(key, sequence);

    const result: MatchRow['result'] =
      m.springboksScore == null || m.opponentScore == null
        ? null
        : m.springboksScore > m.opponentScore
          ? 'win'
          : m.springboksScore < m.opponentScore
            ? 'loss'
            : 'draw';

    rows.push({
      matchId: `${m.matchDate}-${slugify(opponent.canonicalName)}-${sequence}`,
      matchDate: m.matchDate,
      opponentCanonicalName: opponent.canonicalName,
      sequence,
      competition: null,
      competitionProvenance: m.competitionProvenance,
      venue: m.venue ?? null,
      venueProvenance: m.venueProvenance,
      kickoffTime: m.kickoffTime ?? null,
      kickoffTimeProvenance: m.kickoffProvenance,
      homeAway: m.homeIsSouthAfrica === true ? 'home' : m.homeIsSouthAfrica === false ? 'away' : null,
      springboksScore: m.springboksScore ?? null,
      springboksScoreProvenance: m.scoreProvenance,
      opponentScore: m.opponentScore ?? null,
      opponentScoreProvenance: m.scoreProvenance,
      result,
      sourceArticleUrl: SOURCE_ARTICLE_URL,
      refereeName: m.refereeName ?? null,
      refereeProvenance: m.refereeProvenance,
      parseErrors: m.parseErrors,
    });
  }

  return { rows, skipped };
}

/** Collects the distinct set of opponent teams referenced by a parsed match set (for the `teams` table). */
export function collectTeams(parsed: ParsedMatch[]): TeamRow[] {
  const byName = new Map<string, Set<string>>();
  for (const m of parsed) {
    for (const side of [m.home, m.away]) {
      if (!side || side.team.canonicalName === 'South Africa') continue;
      const set = byName.get(side.team.canonicalName) ?? new Set<string>();
      for (const alias of side.team.aliases) set.add(alias);
      byName.set(side.team.canonicalName, set);
    }
  }
  return [...byName.entries()].map(([canonicalName, aliases]) => ({
    canonicalName,
    aliases: [...aliases],
  }));
}
