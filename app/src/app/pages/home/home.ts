import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { FixtureRow, MatchRow, formatKickoffSAST, opponentName } from '../../shared/match-models';
import { FieldValue } from '../../shared/field-value/field-value';

type LoadState = 'loading' | 'loaded' | 'error';

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
  imports: [RouterLink, FieldValue],
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

  readonly nextFixtureChips = computed(() => {
    const fixture = this.nextFixture();
    return fixture ? fixtureChips(fixture) : [];
  });

  readonly opponentName = opponentName;
  readonly fixtureChipsFor = fixtureChips;
  readonly formatKickoffSAST = formatKickoffSAST;

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    // A missing optional field, an empty table, or an unreachable Supabase
    // must never throw or blank the page (AGENTS.md non-negotiables /
    // PRD D16) — every branch below degrades to a visible, honest state.
    try {
      const today = todayIso();

      const [fixturesRes, liveRes, latestRes] = await Promise.all([
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
      ]);

      if (fixturesRes.error || liveRes.error || latestRes.error) {
        this.state.set('error');
        return;
      }

      const fixtures = (fixturesRes.data ?? []) as unknown as FixtureRow[];
      this.nextFixture.set(fixtures[0] ?? null);
      this.upcomingFixtures.set(fixtures.slice(1));
      this.liveMatch.set((liveRes.data ?? null) as unknown as MatchRow | null);
      this.latestResult.set((latestRes.data ?? null) as unknown as MatchRow | null);
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }
}
