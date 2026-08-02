import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { MatchRow, opponentName } from '../../shared/match-models';
import { FieldValue } from '../../shared/field-value/field-value';
import { ERA_BUCKETS, EraBucket, eraBucketOf } from '../../shared/era-buckets';

type LoadState = 'loading' | 'loaded' | 'error';

function unique(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

/** One column of the record-by-era figure (docs/design.md §7.2, D34). */
export interface EraColumn {
  era: EraBucket;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  unrecorded: number;
  winPercent: number | null;
  total: number;
}

/**
 * Computed client-side over the rows History already loads — no extra
 * query (docs/design.md §7.2). Rows with `result === null` count into the
 * unrecorded segment and are excluded from the win-% denominator.
 */
export function buildEraColumns(matches: MatchRow[]): EraColumn[] {
  return ERA_BUCKETS.map((era) => {
    const rows = matches.filter((m) => eraBucketOf(m.match_date) === era);
    const wins = rows.filter((m) => m.result === 'win').length;
    const losses = rows.filter((m) => m.result === 'loss').length;
    const draws = rows.filter((m) => m.result === 'draw').length;
    const unrecorded = rows.filter((m) => m.result == null).length;
    const played = wins + losses + draws;
    const total = played + unrecorded;
    return {
      era,
      played,
      wins,
      losses,
      draws,
      unrecorded,
      winPercent: played > 0 ? Math.round((wins / played) * 100) : null,
      total,
    };
  });
}

/** The D33 count caption for the whole era figure. */
export function eraFigureCaption(columns: EraColumn[]): string {
  const withUnrecorded = columns.filter((c) => c.unrecorded > 0);
  const base = 'Win % of tests with a recorded result.';
  if (withUnrecorded.length === 0) {
    return base;
  }
  const parts = withUnrecorded.map(
    (c) => `${c.era}: ${c.played} of ${c.total} tests have a recorded result`,
  );
  return `${base} ${parts.join('; ')}.`;
}

@Component({
  selector: 'app-history',
  imports: [RouterLink, FieldValue],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class History implements OnInit {
  private readonly supabase = inject(SupabaseService);

  readonly state = signal<LoadState>('loading');
  readonly matches = signal<MatchRow[]>([]);

  readonly selectedOpponent = signal<string | null>(null);
  readonly selectedCompetition = signal<string | null>(null);
  readonly selectedEra = signal<EraBucket | null>(null);

  readonly opponentName = opponentName;

  readonly opponents = computed(() => unique(this.matches().map((m) => opponentName(m))));
  readonly competitions = computed(() => unique(this.matches().map((m) => m.competition)));
  readonly eras = computed(() =>
    ERA_BUCKETS.filter((era) => this.matches().some((m) => eraBucketOf(m.match_date) === era)),
  );

  readonly eraColumns = computed(() => buildEraColumns(this.matches()));
  readonly eraCaption = computed(() => eraFigureCaption(this.eraColumns()));

  readonly filtered = computed(() => {
    const opponent = this.selectedOpponent();
    const competition = this.selectedCompetition();
    const era = this.selectedEra();
    return this.matches().filter(
      (m) =>
        (!opponent || opponentName(m) === opponent) &&
        (!competition || m.competition === competition) &&
        (!era || eraBucketOf(m.match_date) === era),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  toggleOpponent(value: string): void {
    this.selectedOpponent.set(this.selectedOpponent() === value ? null : value);
  }

  toggleCompetition(value: string): void {
    this.selectedCompetition.set(this.selectedCompetition() === value ? null : value);
  }

  toggleEra(value: EraBucket): void {
    this.selectedEra.set(this.selectedEra() === value ? null : value);
  }

  private async load(): Promise<void> {
    // Same non-negotiable as Home: a missing field or an unreachable
    // Supabase must never throw or blank the page — it degrades to a
    // visible, honest state (AGENTS.md non-negotiables / PRD D16).
    try {
      const { data, error } = await this.supabase.client
        .from('matches')
        .select(
          'match_id, match_date, competition, competition_provenance, venue, venue_provenance, kickoff_time, kickoff_time_provenance, springboks_score, springboks_score_provenance, opponent_score, opponent_score_provenance, result, source_article_url, teams:opponent_team_id(canonical_name)',
        )
        .order('match_date', { ascending: false });

      if (error) {
        this.state.set('error');
        return;
      }

      this.matches.set((data ?? []) as unknown as MatchRow[]);
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }
}
