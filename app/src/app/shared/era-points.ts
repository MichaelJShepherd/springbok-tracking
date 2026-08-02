import { EventType, MatchEventRow, isTimed } from './match-detail-models';

/**
 * The era points table (docs/design.md §7.4, D33(b)) — held as an app
 * constant, never a schema column (docs/design.md §9: a `points_value`
 * column would remove the reconciliation gate's self-checking property).
 *
 * Matches before 1894 are never charted: the points values moved three
 * times between 1890 and 1894 and which set applied to a given fixture
 * depends on the season boundary rather than the calendar year, so
 * `pointsFor` always returns `null` for `year < 1894` and callers must
 * treat that as "cannot chart", not "worth zero".
 */
const SCORING_EVENT_TYPES: readonly EventType[] = ['try', 'conversion', 'penalty', 'drop_goal'];

type EraPointsRow = Record<Extract<EventType, 'try' | 'conversion' | 'penalty' | 'drop_goal'>, number>;

/** [1894–1947, 1948–1970, 1971–1991, 1992–] */
const ERA_TABLE: EraPointsRow[] = [
  { try: 3, conversion: 2, penalty: 3, drop_goal: 4 },
  { try: 3, conversion: 2, penalty: 3, drop_goal: 3 },
  { try: 4, conversion: 2, penalty: 3, drop_goal: 3 },
  { try: 5, conversion: 2, penalty: 3, drop_goal: 3 },
];

function eraIndexFor(year: number): number {
  if (year < 1948) return 0;
  if (year < 1971) return 1;
  if (year < 1992) return 2;
  return 3;
}

/** Points value of a scoring event type in the era of `year`, or `null` if unchartable/pre-1894. */
export function pointsFor(type: EventType, year: number): number | null {
  if (year < 1894) return null;
  if (type !== 'try' && type !== 'conversion' && type !== 'penalty' && type !== 'drop_goal') {
    return 0;
  }
  return ERA_TABLE[eraIndexFor(year)][type];
}

function isScoringType(type: EventType): type is (typeof SCORING_EVENT_TYPES)[number] {
  return (SCORING_EVENT_TYPES as readonly string[]).includes(type);
}

export function isScoringEvent(event: Pick<MatchEventRow, 'event_type'>): boolean {
  return isScoringType(event.event_type);
}

/** One point on the stepped score-progression line: the running totals after minute `m`. */
export interface ProgressionPoint {
  m: number;
  sa: number;
  opp: number;
}

export type ProgressionFailureReason = 'none' | 'pre1894' | 'untimed' | 'mismatch';

export type ProgressionResult =
  | { ok: true; points: ProgressionPoint[]; leadChanges: number; timedEventCount: number }
  | { ok: false; reason: ProgressionFailureReason; reconstructed?: { sa: number; opp: number } };

/**
 * The reconciliation gate (docs/design.md §7.4, D33(b)). Renders the chart
 * only if every scoring event is timed AND the era-aware reconstruction
 * equals the stored final score exactly. Ports the prototype's algorithm
 * (docs/prototype.html `progression()`) onto the app's real schema.
 */
export function computeProgression(
  events: readonly MatchEventRow[],
  year: number,
  finalSa: number,
  finalOpp: number,
): ProgressionResult {
  const scoring = [...events]
    .filter((e) => isScoringEvent(e))
    .sort((a, b) => a.sequence_no - b.sequence_no);

  if (scoring.length === 0) {
    return { ok: false, reason: 'none' };
  }
  if (year < 1894) {
    return { ok: false, reason: 'pre1894' };
  }
  if (scoring.some((e) => !isTimed(e))) {
    return { ok: false, reason: 'untimed' };
  }

  let sa = 0;
  let opp = 0;
  let lead = 0;
  let leadChanges = 0;
  const points: ProgressionPoint[] = [{ m: 0, sa: 0, opp: 0 }];

  for (const event of scoring) {
    const value = pointsFor(event.event_type, year);
    if (value == null) {
      return { ok: false, reason: 'pre1894' };
    }
    if (event.team_side === 'springboks') {
      sa += value;
    } else {
      opp += value;
    }
    points.push({ m: event.minute as number, sa, opp });

    const now = sa > opp ? 1 : sa < opp ? -1 : 0;
    if (now !== 0 && now !== lead) {
      if (lead !== 0) {
        leadChanges++;
      }
      lead = now;
    }
  }

  if (sa !== finalSa || opp !== finalOpp) {
    return { ok: false, reason: 'mismatch', reconstructed: { sa, opp } };
  }

  return { ok: true, points, leadChanges, timedEventCount: scoring.length };
}

/** The reason copy for a failed gate (docs/design.md §7.4, verbatim causes). */
export function progressionFailureCopy(result: Extract<ProgressionResult, { ok: false }>): string {
  switch (result.reason) {
    case 'untimed':
      return "Scoring times aren't recorded for this match — the sequence below is the order the source gives, without clock positions.";
    case 'pre1894':
      return 'No progression is drawn for matches before 1894: the points values changed three times between 1890 and 1894, and we will not encode values we cannot verify per fixture.';
    case 'mismatch':
      return "The recorded scoring events don't add up to the final score, so no progression is drawn.";
    case 'none':
    default:
      return 'No scoring events are recorded for this match.';
  }
}
