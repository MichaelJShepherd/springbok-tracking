import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { formatKickoffSAST, opponentName } from '../../shared/match-models';
import { FieldValue } from '../../shared/field-value/field-value';
import { SourcesDifferBadge } from '../../shared/sources-differ-badge/sources-differ-badge';
import {
  DisagreeableField,
  EVENT_TYPE_LABELS,
  MATCH_DETAIL_SELECT,
  MATCH_EVENTS_SELECT,
  MatchDetailRow,
  MatchEventRow,
  LineupPlayerRow,
  MatchOfficialRow,
  OFFICIAL_ROLE_LABELS,
  disagreementFor,
  isTimed,
  sortOfficials,
} from '../../shared/match-detail-models';

type LoadState = 'loading' | 'loaded' | 'not_found' | 'error';

const LIST_ARTICLE_URL =
  'https://en.wikipedia.org/wiki/List_of_South_Africa_national_rugby_union_team_test_matches';

@Component({
  selector: 'app-match-detail',
  imports: [RouterLink, FieldValue, SourcesDifferBadge],
  templateUrl: './match-detail.html',
  styleUrl: './match-detail.css',
})
export class MatchDetail implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<LoadState>('loading');
  readonly match = signal<MatchDetailRow | null>(null);
  readonly officials = signal<MatchOfficialRow[]>([]);
  readonly lineups = signal<LineupPlayerRow[]>([]);
  readonly events = signal<MatchEventRow[]>([]);

  readonly opponentName = opponentName;
  readonly formatKickoffSAST = formatKickoffSAST;
  readonly eventTypeLabel = (type: MatchEventRow['event_type']) => EVENT_TYPE_LABELS[type];
  readonly officialRoleLabel = (role: MatchOfficialRow['role']) => OFFICIAL_ROLE_LABELS[role];
  readonly isTimed = isTimed;
  readonly disagreementFor = (field: DisagreeableField) => {
    const row = this.match();
    return row ? disagreementFor(row, field) : undefined;
  };

  readonly sortedOfficials = computed(() => sortOfficials(this.officials()));
  readonly referee = computed(() => this.sortedOfficials().find((o) => o.role === 'referee'));
  readonly otherOfficials = computed(() =>
    this.sortedOfficials().filter((o) => o.role !== 'referee'),
  );
  readonly springboksLineup = computed(() =>
    this.lineups()
      .filter((p) => p.team_side === 'springboks')
      .sort((a, b) => (a.shirt_number ?? Number.MAX_SAFE_INTEGER) - (b.shirt_number ?? Number.MAX_SAFE_INTEGER)),
  );
  readonly opponentLineup = computed(() =>
    this.lineups()
      .filter((p) => p.team_side === 'opponent')
      .sort((a, b) => (a.shirt_number ?? Number.MAX_SAFE_INTEGER) - (b.shirt_number ?? Number.MAX_SAFE_INTEGER)),
  );
  readonly sortedEvents = computed(() =>
    [...this.events()].sort((a, b) => a.sequence_no - b.sequence_no),
  );

  readonly attributionUrl = computed(() => this.match()?.source_article_url || LIST_ARTICLE_URL);
  readonly attributionLabel = computed(() =>
    this.match()?.source_article_url ? 'the source article on Wikipedia' : 'the source list on Wikipedia',
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.state.set('not_found');
      return;
    }
    this.load(id);
  }

  private async load(matchId: string): Promise<void> {
    // Same non-negotiable as Home/History: a missing field, an empty
    // table, or an unreachable Supabase must never throw or blank the
    // page (AGENTS.md non-negotiables / PRD D16).
    try {
      const [matchRes, officialsRes, lineupsRes, eventsRes] = await Promise.all([
        this.supabase.client.from('matches').select(MATCH_DETAIL_SELECT).eq('match_id', matchId).maybeSingle(),
        this.supabase.client
          .from('match_officials')
          .select('role, name, name_provenance')
          .eq('match_id', matchId),
        this.supabase.client
          .from('match_lineups')
          .select('team_side, shirt_number, player_name, player_name_provenance')
          .eq('match_id', matchId),
        this.supabase.client
          .from('match_events')
          .select(MATCH_EVENTS_SELECT)
          .eq('match_id', matchId)
          .order('sequence_no', { ascending: true }),
      ]);

      if (matchRes.error || officialsRes.error || lineupsRes.error || eventsRes.error) {
        this.state.set('error');
        return;
      }

      if (!matchRes.data) {
        this.state.set('not_found');
        return;
      }

      this.match.set(matchRes.data as unknown as MatchDetailRow);
      this.officials.set((officialsRes.data ?? []) as unknown as MatchOfficialRow[]);
      this.lineups.set((lineupsRes.data ?? []) as unknown as LineupPlayerRow[]);
      this.events.set((eventsRes.data ?? []) as unknown as MatchEventRow[]);
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }
}
