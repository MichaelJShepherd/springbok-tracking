import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { MatchRow, decadeOf, opponentName } from '../../shared/match-models';
import { FieldValue } from '../../shared/field-value/field-value';

type LoadState = 'loading' | 'loaded' | 'error';

function unique(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
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
  readonly selectedEra = signal<string | null>(null);

  readonly opponentName = opponentName;

  readonly opponents = computed(() => unique(this.matches().map((m) => opponentName(m))));
  readonly competitions = computed(() => unique(this.matches().map((m) => m.competition)));
  readonly eras = computed(() =>
    Array.from(new Set(this.matches().map((m) => decadeOf(m.match_date)))).sort(),
  );

  readonly filtered = computed(() => {
    const opponent = this.selectedOpponent();
    const competition = this.selectedCompetition();
    const era = this.selectedEra();
    return this.matches().filter(
      (m) =>
        (!opponent || opponentName(m) === opponent) &&
        (!competition || m.competition === competition) &&
        (!era || decadeOf(m.match_date) === era),
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

  toggleEra(value: string): void {
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
