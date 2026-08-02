import { Component, computed, input } from '@angular/core';
import { MatchEventRow } from '../match-detail-models';
import { ProgressionPoint, computeProgression, progressionFailureCopy } from '../era-points';

const W = 640;
const H = 250;
const PAD_LEFT = 42;
const PAD_RIGHT = 58;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;

interface ChartModel {
  points: ProgressionPoint[];
  maxMinute: number;
  yTop: number;
  saPath: string;
  oppPath: string;
  leadDots: { x: number; y: number }[];
  gridMinutes: number[];
  x: (m: number) => number;
  y: (v: number) => number;
}

/**
 * The score-progression figure (docs/design.md §7.4, D34(4), D33(b)). Gated:
 * renders the inline SVG only if the reconciliation gate passes; otherwise
 * shows the stated reason and lets the caller's own events list stand as
 * the accessible equivalent (never replaced).
 */
@Component({
  selector: 'app-score-progression',
  imports: [],
  templateUrl: './score-progression.html',
  styleUrl: './score-progression.css',
})
export class ScoreProgression {
  readonly events = input.required<MatchEventRow[]>();
  readonly year = input.required<number>();
  readonly finalSa = input.required<number>();
  readonly finalOpp = input.required<number>();
  readonly springboksLabel = input<string>('South Africa');
  readonly opponentLabel = input.required<string>();

  readonly result = computed(() =>
    computeProgression(this.events(), this.year(), this.finalSa(), this.finalOpp()),
  );

  readonly failureCopy = computed(() => {
    const r = this.result();
    return r.ok ? '' : progressionFailureCopy(r);
  });

  readonly chart = computed<ChartModel | null>(() => {
    const r = this.result();
    if (!r.ok) return null;

    const maxMinute = Math.max(80, ...r.points.map((p) => p.m));
    const yTop = Math.max(3, Math.ceil((Math.max(this.finalSa(), this.finalOpp()) + 1) / 3) * 3);
    const x = (m: number) => PAD_LEFT + (m / maxMinute) * (W - PAD_LEFT - PAD_RIGHT);
    const y = (v: number) => H - PAD_BOTTOM - (v / yTop) * (H - PAD_TOP - PAD_BOTTOM);

    const stepPath = (key: 'sa' | 'opp'): string => {
      let d = `M ${x(0)} ${y(0)}`;
      for (let i = 1; i < r.points.length; i++) {
        d += ` L ${x(r.points[i].m)} ${y(r.points[i - 1][key])} L ${x(r.points[i].m)} ${y(r.points[i][key])}`;
      }
      d += ` L ${x(maxMinute)} ${y(r.points[r.points.length - 1][key])}`;
      return d;
    };

    const leadDots: { x: number; y: number }[] = [];
    let lead = 0;
    for (let i = 1; i < r.points.length; i++) {
      const pt = r.points[i];
      const now = pt.sa > pt.opp ? 1 : pt.sa < pt.opp ? -1 : 0;
      if (now !== 0 && now !== lead) {
        if (lead !== 0) {
          leadDots.push({ x: x(pt.m), y: y(Math.max(pt.sa, pt.opp)) });
        }
        lead = now;
      }
    }

    const gridMinutes: number[] = [];
    for (let m = 10; m <= maxMinute; m += 10) {
      gridMinutes.push(m);
    }

    return {
      points: r.points,
      maxMinute,
      yTop,
      saPath: stepPath('sa'),
      oppPath: stepPath('opp'),
      leadDots,
      gridMinutes,
      x,
      y,
    };
  });

  readonly viewBox = `0 0 ${W} ${H}`;
  readonly halfTimeX = () => (this.chart() ? this.chart()!.x(40) : 0);
  readonly zeroY = () => (this.chart() ? this.chart()!.y(0) : 0);
  readonly topY = () => (this.chart() ? this.chart()!.y(this.chart()!.yTop) : 0);
  readonly axisY = () => (this.chart() ? this.chart()!.y(0) : 0);

  readonly ariaLabel = computed(() => {
    const r = this.result();
    if (!r.ok) return '';
    return `Score progression: South Africa ${this.finalSa()}, ${this.opponentLabel()} ${this.finalOpp()}, built from ${r.timedEventCount} timed scoring events, with ${r.leadChanges} lead change${r.leadChanges === 1 ? '' : 's'}.`;
  });

  readonly caption = computed(() => {
    const r = this.result();
    if (!r.ok) return '';
    const leadStory =
      r.leadChanges > 0
        ? `${r.leadChanges} lead change${r.leadChanges === 1 ? '' : 's'}.`
        : 'Neither side ever led, or one side led throughout.';
    return `Built from the ${r.timedEventCount} timed scoring events recorded in the source article; running totals reconcile to the final score ${this.finalSa()}–${this.finalOpp()}. ${leadStory}`;
  });
}
