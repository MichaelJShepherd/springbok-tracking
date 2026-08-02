import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { formatKickoffSAST, opponentName } from '../../shared/match-models';
import { HeadToHeadRow, buildHeadToHead } from '../../shared/head-to-head';
import { HeadToHeadStrip } from '../../shared/head-to-head-strip/head-to-head-strip';
import { HEAD_TO_HEAD_SELECT } from '../../shared/match-detail-models';
import {
  FIXTURE_DETAIL_SELECT,
  FixtureDetailRow,
  FixtureSource,
  FixtureStatus,
  formatFetchedAtSAST,
} from '../../shared/fixture-detail-models';
import { parseFixtureRouteId, slugifyOpponent, todayInSAST } from '../../shared/fixture-id';

type LoadState = 'loading' | 'loaded' | 'not_found' | 'error';
type H2hState = 'loading' | 'loaded' | 'error';

const STATUS_LABELS: Record<FixtureStatus, string> = {
  scheduled: 'Scheduled',
  postponed: 'Postponed',
  tbd: 'TBD',
  cancelled: 'Cancelled',
};

/**
 * D14 precedence: an api-sports row is preferred over a wikipedia row for
 * the same (date, opponent) pair. This is *why* `fixtures_upstream`'s
 * unique key is `(match_date, opponent_team_id, source)` rather than just
 * `(match_date, opponent_team_id)` — the pair alone does not identify one
 * row when both sources have written a fixture for the same date/opponent,
 * which is exactly the case this tie-break resolves (docs/design.md §6.2,
 * PRD D37).
 *
 * NOTE for future maintainers: D9's fixtures-ingestion trigger could
 * invert this precedence (Wikipedia becoming primary), and the deployment
 * work tracked under #94/D39 will likely remove this tie-break entirely
 * once `ingest:fixtures`' own dedupe (D14, `fixtures.ts`) means only one
 * row survives per fixture upstream of the app altogether. Don't assume
 * this constant is permanent.
 */
const PREFERRED_FIXTURE_SOURCE: FixtureSource = 'api-sports';

/**
 * Pre-match game-detail page (docs/design.md §6.2, PRD D37, #95). Reads
 * `fixtures_upstream` for the fixture facts and `matches` only for the
 * head-to-head aggregate — the two tables' rows are never merged into one
 * displayed record (D15 licence separation, same discipline as Home).
 */
@Component({
  selector: 'app-fixture-detail',
  imports: [HeadToHeadStrip],
  templateUrl: './fixture-detail.html',
  styleUrl: './fixture-detail.css',
})
export class FixtureDetail implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);

  /** Injectable so the match-day (D8) state is testable on any day (AGENTS.md Gate 3). */
  readonly clock = input<() => Date>(() => new Date());

  readonly state = signal<LoadState>('loading');
  readonly fixture = signal<FixtureDetailRow | null>(null);

  readonly h2hState = signal<H2hState>('loading');
  readonly h2hRows = signal<HeadToHeadRow[]>([]);
  readonly headToHead = computed(() => {
    const f = this.fixture();
    if (!f || this.h2hState() !== 'loaded') return null;
    // The route id is never a real `match_id` (the fixture hasn't been
    // played yet), so `matchFound` is always false here by construction —
    // zone 3 ("Nth meeting" / "before this match") never renders, and zone
    // 1's all-time record correctly stands in for "before this match"
    // (docs/design.md §6.2).
    const routeId = this.route.snapshot.paramMap.get('id') ?? '';
    return buildHeadToHead(this.h2hRows(), routeId);
  });

  readonly opponentName = opponentName;
  readonly formatKickoffSAST = formatKickoffSAST;
  readonly formatFetchedAtSAST = formatFetchedAtSAST;
  readonly statusLabel = (status: FixtureStatus): string => STATUS_LABELS[status];

  /**
   * D8's "match under way" state — gated on kickoff having actually
   * *passed*, not merely on the calendar date matching (Gate 2 finding 1):
   * a fixture dated today with a 19:05 kickoff is not "under way" at 09:00,
   * and claiming so would suppress the one fact — the kickoff time — a fan
   * checking the page that morning came for. A null kickoff_time can never
   * be "passed", so it never triggers this state either — it falls through
   * to the ordinary date/kickoff-TBD rendering instead (docs/design.md §6.2).
   */
  readonly isMatchUnderWay = computed(() => {
    const f = this.fixture();
    if (!f || !f.kickoff_time) return false;
    if (f.match_date !== todayInSAST(this.clock())) return false;
    return this.clock()().getTime() >= new Date(f.kickoff_time).getTime();
  });

  readonly provenanceIsWikipedia = computed(() => this.fixture()?.source === 'wikipedia');
  readonly provenanceIsApiSports = computed(() => this.fixture()?.source === PREFERRED_FIXTURE_SOURCE);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const parsed = id ? parseFixtureRouteId(id) : null;
    if (!parsed) {
      this.state.set('not_found');
      return;
    }
    this.load(parsed.matchDate, parsed.opponentSlug);
  }

  private async load(matchDate: string, opponentSlug: string): Promise<void> {
    // Same non-negotiable as every other page: a missing row, or an
    // unreachable Supabase, must never throw or blank the page (AGENTS.md
    // non-negotiables / PRD D16).
    try {
      const { data, error } = await this.supabase.client
        .from('fixtures_upstream')
        .select(FIXTURE_DETAIL_SELECT)
        .eq('match_date', matchDate);

      if (error) {
        this.state.set('error');
        return;
      }

      const rows = (data ?? []) as unknown as FixtureDetailRow[];
      const candidates = rows.filter((r) => slugifyOpponent(opponentName(r)) === opponentSlug);
      if (candidates.length === 0) {
        this.state.set('not_found');
        return;
      }
      const fixture = candidates.find((r) => r.source === PREFERRED_FIXTURE_SOURCE) ?? candidates[0];

      this.fixture.set(fixture);
      this.state.set('loaded');

      // Head-to-head strip — deliberately not awaited: an independent read
      // that must never block or blank the rest of the page (same
      // non-negotiable match-detail's own head-to-head load follows).
      void this.loadHeadToHead(fixture.opponent_team_id);
    } catch {
      this.state.set('error');
    }
  }

  private async loadHeadToHead(opponentTeamId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('matches')
        .select(HEAD_TO_HEAD_SELECT)
        .eq('opponent_team_id', opponentTeamId)
        .order('match_date', { ascending: true });

      if (error) {
        this.h2hState.set('error');
        return;
      }

      this.h2hRows.set((data ?? []) as unknown as HeadToHeadRow[]);
      this.h2hState.set('loaded');
    } catch {
      this.h2hState.set('error');
    }
  }
}
