import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { MatchRow, opponentName } from '../../shared/match-models';
import { FieldValue } from '../../shared/field-value/field-value';
import { ScoreProgression } from '../../shared/score-progression/score-progression';
import {
  BUCKET_LABELS,
  CURVE_BUCKET_ORDER,
  EVENT_TYPE_LABELS,
  MATCH_DETAIL_SELECT,
  MATCH_EVENTS_SELECT,
  MatchEventRow,
  SentimentScoreRow,
  isTimed,
  moodColorClass,
  sentimentBadgeText,
} from '../../shared/match-detail-models';

type LoadState = 'loading' | 'loaded' | 'not_found' | 'error';
type SentimentState = 'loading' | 'loaded' | 'error';

/** One plotted point on the mood curve SVG (design.md's inline-SVG spec). */
export interface CurvePoint {
  x: number;
  y: number;
  label: string;
  moodLabel: string;
  colorClass: 'pos' | 'neg' | 'neutral';
}

const CURVE_WIDTH = 560;
const CURVE_HEIGHT = 120;
const CURVE_PAD = 40;

/** Keeps the last axis marker's centred label fully inside the card (no sideways scroll, J3/J5). */
const AXIS_MARKER_MAX_PERCENT = 97;

@Component({
  selector: 'app-match-timeline',
  imports: [RouterLink, FieldValue, ScoreProgression],
  templateUrl: './match-timeline.html',
  styleUrl: './match-timeline.css',
})
export class MatchTimeline implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<LoadState>('loading');
  readonly match = signal<MatchRow | null>(null);
  readonly events = signal<MatchEventRow[]>([]);

  readonly sentimentState = signal<SentimentState>('loading');
  readonly sentimentRows = signal<SentimentScoreRow[]>([]);

  readonly opponentName = opponentName;
  readonly eventTypeLabel = (type: MatchEventRow['event_type']) => EVENT_TYPE_LABELS[type];
  readonly isTimed = isTimed;

  readonly sortedEvents = computed(() => [...this.events()].sort((a, b) => a.sequence_no - b.sequence_no));
  readonly timedEvents = computed(() => this.sortedEvents().filter((e) => isTimed(e)));
  readonly maxMinute = computed(() => {
    const timed = this.timedEvents();
    if (!timed.length) return 80;
    return Math.max(80, ...timed.map((e) => e.minute ?? 0));
  });

  /** True once at least one timed event exists — the axis line is only worth drawing then. */
  readonly hasTimedAxis = computed(() => this.timedEvents().length > 0);

  readonly matchYear = computed(() => Number(this.match()?.match_date.slice(0, 4) ?? 0));

  /** Clamped so a marker at the final minute never pushes its centred label outside the card. */
  markerLeftPercent(minute: number | null): number {
    const pct = ((minute ?? 0) / this.maxMinute()) * 100;
    return Math.min(AXIS_MARKER_MAX_PERCENT, pct);
  }

  readonly sentimentSource = computed(() => this.sentimentRows()[0]?.source ?? null);
  readonly sentimentBadgeText = computed(() => {
    const source = this.sentimentSource();
    return source ? sentimentBadgeText(source) : '';
  });
  readonly sentimentSourceUrl = computed(
    () => this.sentimentRows().find((r) => r.source_url)?.source_url ?? null,
  );

  /**
   * D2 minimum-volume floor. The floor is a property of the whole source
   * instance (one Reddit thread, one Guardian article set) — every bucket
   * an ingestion run writes for that source carries the same flag — so
   * this only suppresses the curve when the *entire* source was too thin,
   * never because one bucket among several well-sourced ones was.
   */
  readonly tooFew = computed(() => {
    const rows = this.sentimentRows();
    return rows.length > 0 && rows.every((r) => r.too_few);
  });
  readonly tooFewSample = computed(
    () => this.sentimentRows().find((r) => r.too_few)?.bucket_source_count ?? null,
  );

  /** Single-point variant: Guardian rows, or a Reddit thread scored as one whole-match bucket (D2). */
  readonly isSinglePoint = computed(() => {
    const rows = this.sentimentRows();
    return rows.length > 0 && !this.tooFew() && rows.every((r) => r.bucket === 'whole_match');
  });
  readonly singlePoint = computed(() => this.sentimentRows()[0] ?? null);
  readonly singlePointColorClass = computed(() => moodColorClass(this.singlePoint()?.score ?? null));

  readonly curveRows = computed(() =>
    CURVE_BUCKET_ORDER.map((bucket) => this.sentimentRows().find((r) => r.bucket === bucket)).filter(
      (r): r is SentimentScoreRow => !!r,
    ),
  );

  readonly curvePoints = computed<CurvePoint[]>(() => {
    const rows = this.curveRows();
    const n = rows.length;
    if (n === 0) return [];
    return rows.map((row, i) => {
      const x = CURVE_PAD + (i * (CURVE_WIDTH - 2 * CURVE_PAD)) / Math.max(1, n - 1);
      const score = row.score ?? 0;
      const y = CURVE_HEIGHT / 2 - score * (CURVE_HEIGHT / 2 - 10);
      return {
        x,
        y,
        label: BUCKET_LABELS[row.bucket],
        moodLabel: row.label ?? '—',
        colorClass: moodColorClass(row.score),
      };
    });
  });

  readonly curvePolyline = computed(() => this.curvePoints().map((p) => `${p.x},${p.y}`).join(' '));
  readonly curveViewBox = `0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`;
  readonly curveMidY = CURVE_HEIGHT / 2;
  readonly curveLeft = CURVE_PAD;
  readonly curveRight = CURVE_WIDTH - CURVE_PAD;

  /** True once we know for certain there is no mood source for this match's era (D3). */
  readonly noSentimentSources = computed(
    () => this.sentimentState() === 'loaded' && this.sentimentRows().length === 0,
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.state.set('not_found');
      return;
    }
    this.load(id);
    // Deliberately not awaited: the mood layer is a separate, independent
    // query (PRD §2.4) that must never block event rendering above, and
    // its own failure/slowness must not blank the events that already
    // rendered.
    void this.loadSentiment(id);
  }

  private async load(matchId: string): Promise<void> {
    try {
      const [matchRes, eventsRes] = await Promise.all([
        this.supabase.client.from('matches').select(MATCH_DETAIL_SELECT).eq('match_id', matchId).maybeSingle(),
        this.supabase.client
          .from('match_events')
          .select(MATCH_EVENTS_SELECT)
          .eq('match_id', matchId)
          .order('sequence_no', { ascending: true }),
      ]);

      if (matchRes.error || eventsRes.error) {
        this.state.set('error');
        return;
      }

      if (!matchRes.data) {
        this.state.set('not_found');
        return;
      }

      this.match.set(matchRes.data as unknown as MatchRow);
      this.events.set((eventsRes.data ?? []) as unknown as MatchEventRow[]);
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }

  private async loadSentiment(matchId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('sentiment_scores')
        .select('bucket, score, label, bucket_source_count, too_few, source, source_url')
        .eq('match_id', matchId);

      if (error) {
        this.sentimentState.set('error');
        return;
      }

      this.sentimentRows.set((data ?? []) as unknown as SentimentScoreRow[]);
      this.sentimentState.set('loaded');
    } catch {
      this.sentimentState.set('error');
    }
  }
}
