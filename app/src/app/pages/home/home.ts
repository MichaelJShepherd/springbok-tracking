import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { FixtureRow, MatchRow, formatKickoffSAST, opponentName } from '../../shared/match-models';
import { FieldValue } from '../../shared/field-value/field-value';
import { ResultMark, MarkResult } from '../../shared/result-mark/result-mark';
import { abbreviateOpponent } from '../../shared/team-abbrev';
import { fixtureRouteId } from '../../shared/fixture-id';

type LoadState = 'loading' | 'loaded' | 'error';

/** One mark in the form guide strip (docs/design.md §7.1). */
export interface FormGuideMark {
  matchId: string;
  result: MarkResult;
  /** False when the result is unrecorded, or a score's provenance isn't `present` — excluded from the tally. */
  includedInTally: boolean;
  bothScoresPresent: boolean;
  opponentAbbrev: string;
  scoreLabel: string;
  ariaLabel: string;
  springboksScore: number | null;
  opponentScore: number | null;
}

export interface FormGuideSummary {
  marks: FormGuideMark[];
  eyebrow: string;
  wins: number;
  losses: number;
  draws: number;
  excluded: number;
  pointsFor: number;
  pointsAgainst: number;
  scoredCount: number;
  caption: string;
}

/** Builds the form-guide summary from the last-N-tests rows (oldest first). Exported for unit testing the degradation rules. */
export function buildFormGuide(rowsOldestFirst: MatchRow[]): FormGuideSummary | null {
  if (rowsOldestFirst.length === 0) {
    return null; // An empty form strip is noise (design.md §7.1) — don't render.
  }

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let excluded = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let scoredCount = 0;

  const marks: FormGuideMark[] = rowsOldestFirst.map((row) => {
    const bothScoresPresent =
      row.springboks_score_provenance === 'present' && row.opponent_score_provenance === 'present';
    const includedInTally = row.result != null && bothScoresPresent;
    const opponent = opponentName(row);

    if (includedInTally) {
      if (row.result === 'win') wins++;
      else if (row.result === 'loss') losses++;
      else if (row.result === 'draw') draws++;
      pointsFor += row.springboks_score ?? 0;
      pointsAgainst += row.opponent_score ?? 0;
      scoredCount++;
    } else {
      excluded++;
    }

    const scoreLabel = bothScoresPresent ? `${row.springboks_score}–${row.opponent_score}` : '–';
    const resultWord = row.result === 'win' ? 'Win' : row.result === 'loss' ? 'Loss' : row.result === 'draw' ? 'Draw' : 'Unrecorded';
    const ariaLabel = includedInTally
      ? `${resultWord} — South Africa ${row.springboks_score} ${opponent} ${row.opponent_score}, ${row.match_date}`
      : `Result not recorded — South Africa vs ${opponent}, ${row.match_date}`;

    return {
      matchId: row.match_id,
      result: includedInTally ? row.result : null,
      includedInTally,
      bothScoresPresent,
      opponentAbbrev: abbreviateOpponent(opponent),
      scoreLabel,
      ariaLabel,
      springboksScore: row.springboks_score,
      opponentScore: row.opponent_score,
    };
  });

  const countWord = rowsOldestFirst.length === 5 ? 'FIVE' : rowsOldestFirst.length === 4 ? 'FOUR' : rowsOldestFirst.length === 3 ? 'THREE' : rowsOldestFirst.length === 2 ? 'TWO' : 'ONE';
  const eyebrow = `FORM · LAST ${countWord} TEST${rowsOldestFirst.length === 1 ? '' : 'S'}`;

  const diff = pointsFor - pointsAgainst;
  const diffLabel = `${diff >= 0 ? '+' : ''}${diff}`;
  let caption = `Points ${pointsFor}–${pointsAgainst} (${diffLabel})`;
  if (scoredCount < rowsOldestFirst.length) {
    caption += ` from ${scoredCount} of ${rowsOldestFirst.length} tests`;
  }
  if (excluded > 0) {
    caption += ` · ${excluded} not recorded`;
  }

  return {
    marks,
    eyebrow,
    wins,
    losses,
    draws,
    excluded,
    pointsFor,
    pointsAgainst,
    scoredCount,
    caption,
  };
}

/** A fixture fact the source hasn't confirmed yet — rendered as a chip. */
export interface FixtureChip {
  label: string;
}

/**
 * Missing-fact chips for a fixture (D8: "postponed/venue-TBD"). The
 * `fixtures_upstream` table (docs/prd.md D14) carries no status column, so
 * there is no data to distinguish "postponed" from "not yet confirmed" —
 * both currently present the same way: the source simply hasn't supplied a
 * venue or kickoff time yet. Never invent a status the data doesn't have.
 */
export function fixtureChips(fixture: FixtureRow): FixtureChip[] {
  const chips: FixtureChip[] = [];
  if (!fixture.venue) {
    chips.push({ label: 'Venue TBD' });
  }
  if (!fixture.kickoff_time) {
    chips.push({ label: 'Kickoff TBD' });
  }
  return chips;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, FieldValue, ResultMark],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly supabase = inject(SupabaseService);

  readonly state = signal<LoadState>('loading');
  readonly nextFixture = signal<FixtureRow | null>(null);
  readonly upcomingFixtures = signal<FixtureRow[]>([]);
  readonly liveMatch = signal<MatchRow | null>(null);
  readonly latestResult = signal<MatchRow | null>(null);
  readonly formGuideRows = signal<MatchRow[]>([]);

  readonly formGuide = computed(() => buildFormGuide(this.formGuideRows()));

  readonly nextFixtureChips = computed(() => {
    const fixture = this.nextFixture();
    return fixture ? fixtureChips(fixture) : [];
  });

  readonly opponentName = opponentName;
  readonly fixtureChipsFor = fixtureChips;
  readonly formatKickoffSAST = formatKickoffSAST;
  readonly fixtureRouteId = fixtureRouteId;

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    // A missing optional field, an empty table, or an unreachable Supabase
    // must never throw or blank the page (AGENTS.md non-negotiables /
    // PRD D16) — every branch below degrades to a visible, honest state.
    try {
      const today = todayIso();

      const [fixturesRes, liveRes, latestRes, formRes] = await Promise.all([
        this.supabase.client
          .from('fixtures_upstream')
          .select('id, match_date, kickoff_time, venue, competition, teams:opponent_team_id(canonical_name)')
          .gte('match_date', today)
          .order('match_date', { ascending: true }),
        this.supabase.client
          .from('matches')
          .select(
            'match_id, match_date, competition, competition_provenance, venue, venue_provenance, kickoff_time, kickoff_time_provenance, springboks_score, springboks_score_provenance, opponent_score, opponent_score_provenance, result, source_article_url, teams:opponent_team_id(canonical_name)',
          )
          .eq('match_date', today)
          .is('result', null)
          .maybeSingle(),
        this.supabase.client
          .from('matches')
          .select(
            'match_id, match_date, competition, competition_provenance, venue, venue_provenance, kickoff_time, kickoff_time_provenance, springboks_score, springboks_score_provenance, opponent_score, opponent_score_provenance, result, source_article_url, teams:opponent_team_id(canonical_name)',
          )
          .not('result', 'is', null)
          .order('match_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Form guide (docs/design.md §7.1) — last five tests, newest first
        // from the DB, reversed for display. `.lte` keeps this query's call
        // signature distinct from the live/latest queries above.
        this.supabase.client
          .from('matches')
          .select(
            'match_id, match_date, competition, competition_provenance, venue, venue_provenance, kickoff_time, kickoff_time_provenance, springboks_score, springboks_score_provenance, opponent_score, opponent_score_provenance, result, source_article_url, teams:opponent_team_id(canonical_name)',
          )
          .lte('match_date', today)
          .order('match_date', { ascending: false })
          .limit(5),
      ]);

      if (fixturesRes.error || liveRes.error || latestRes.error || formRes.error) {
        this.state.set('error');
        return;
      }

      const fixtures = (fixturesRes.data ?? []) as unknown as FixtureRow[];
      this.nextFixture.set(fixtures[0] ?? null);
      this.upcomingFixtures.set(fixtures.slice(1));
      this.liveMatch.set((liveRes.data ?? null) as unknown as MatchRow | null);
      this.latestResult.set((latestRes.data ?? null) as unknown as MatchRow | null);
      const formRows = ((formRes.data ?? []) as unknown as MatchRow[]).slice().reverse();
      this.formGuideRows.set(formRows);
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }
}
