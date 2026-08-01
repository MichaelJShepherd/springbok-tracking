import { Provenance } from './provenance';
import { MatchRow } from './match-models';

/**
 * Additive models for the game-detail (J4) and timeline (J5) surfaces
 * (#77). These extend the shapes #75 already shipped in `match-models.ts`
 * without touching that file (lane rule: extend alongside, never edit).
 */

export type OfficialRole = 'referee' | 'assistant_referee' | 'tmo' | 'other';

export interface MatchOfficialRow {
  role: OfficialRole;
  name: string | null;
  name_provenance: Provenance;
}

export type TeamSide = 'springboks' | 'opponent';

export interface LineupPlayerRow {
  team_side: TeamSide;
  shirt_number: number | null;
  player_name: string | null;
  player_name_provenance: Provenance;
}

export type EventType =
  | 'try'
  | 'conversion'
  | 'penalty'
  | 'drop_goal'
  | 'yellow_card'
  | 'red_card'
  | 'other';

export interface MatchEventRow {
  sequence_no: number;
  event_type: EventType;
  team_side: TeamSide;
  description: string | null;
  description_provenance: Provenance;
  minute: number | null;
  minute_provenance: Provenance;
}

export type SentimentBucket = 'pre_match' | 'first_half' | 'second_half' | 'post_match' | 'whole_match';
export type SentimentSource = 'reddit' | 'guardian';
export type MoodLabel = 'Despair' | 'Grumbling' | 'Mixed' | 'Upbeat' | 'Euphoric';

export interface SentimentScoreRow {
  bucket: SentimentBucket;
  score: number | null;
  label: MoodLabel | null;
  bucket_source_count: number | null;
  too_few: boolean;
  source: SentimentSource;
  source_url: string | null;
}

/**
 * D14 "sources differ" support. No display-cleared source currently
 * disagrees with Wikipedia for historical match detail (Kaggle is a
 * logged-only cross-check, D14), so today's real rows never populate this —
 * the shape exists so a future ingestion change can populate it without a
 * breaking change, and so the badge can be covered by a test stub now
 * (ticket #77 requirement) rather than left unbuilt until real data exists.
 */
export type DisagreeableField =
  | 'venue'
  | 'competition'
  | 'kickoff_time'
  | 'springboks_score'
  | 'opponent_score';

export interface FieldDisagreement {
  field: DisagreeableField;
  displayedValue: string;
  displayedSource: string;
  displayedSourceUrl?: string;
  alternateValue: string;
  alternateSource: string;
  alternateSourceUrl?: string;
}

export interface MatchDetailRow extends MatchRow {
  disagreements?: FieldDisagreement[];
}

export function disagreementFor(
  row: MatchDetailRow,
  field: DisagreeableField,
): FieldDisagreement | undefined {
  return row.disagreements?.find((d) => d.field === field);
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  try: 'Try',
  conversion: 'Conversion',
  penalty: 'Penalty',
  drop_goal: 'Drop goal',
  yellow_card: 'Yellow card',
  red_card: 'Red card',
  other: 'Event',
};

export const OFFICIAL_ROLE_LABELS: Record<OfficialRole, string> = {
  referee: 'Referee',
  assistant_referee: 'Assistant referee',
  tmo: 'TMO',
  other: 'Official',
};

/** Sort key so the referee always renders first (J4: "referee prominent"). */
const ROLE_ORDER: Record<OfficialRole, number> = {
  referee: 0,
  assistant_referee: 1,
  tmo: 2,
  other: 3,
};

export function sortOfficials(officials: MatchOfficialRow[]): MatchOfficialRow[] {
  return [...officials].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/** A timed event has both a minute value and a `present` provenance (D11) — */
export function isTimed(event: MatchEventRow): boolean {
  return event.minute != null && event.minute_provenance === 'present';
}

export const BUCKET_LABELS: Record<SentimentBucket, string> = {
  pre_match: 'Pre-match',
  first_half: '1st half',
  second_half: '2nd half',
  post_match: 'Post-match',
  whole_match: 'Whole match',
};

/** Fixed bucket ordering for the multi-point mood curve (D2). */
export const CURVE_BUCKET_ORDER: SentimentBucket[] = [
  'pre_match',
  'first_half',
  'second_half',
  'post_match',
];

export function moodColorClass(score: number | null): 'pos' | 'neg' | 'neutral' {
  if (score == null) return 'neutral';
  if (score > 0.15) return 'pos';
  if (score < -0.15) return 'neg';
  return 'neutral';
}

export function sentimentBadgeText(source: SentimentSource): string {
  return source === 'reddit'
    ? 'Fan mood — computed by this site from r/rugbyunion match thread'
    : 'Fan mood — computed by this site from news headlines';
}
