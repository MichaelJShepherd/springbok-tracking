import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeadToHeadSummary, ordinal } from '../head-to-head';
import { ResultMark } from '../result-mark/result-mark';

/**
 * The head-to-head strip (docs/design.md §7.3/§6.2, PRD D34/D37) — shared
 * between match-detail (post-match) and fixture-detail (pre-match) rather
 * than duplicated markup+CSS per page (Gate 2 finding, #95): both pages
 * feed this component the same `HeadToHeadSummary` shape from the same
 * `buildHeadToHead` computation, differing only in *how* `matchFound` ends
 * up true or false for them (a real match's own id vs. a fixture route id
 * that can never match one).
 *
 * Zone 3 ("the Nth meeting" / "before this match") renders only when
 * `summary.matchFound` — false by construction on fixture-detail, since the
 * fixture hasn't been played yet and its route id is never a real
 * `match_id`. A `summary.total` of zero renders an absent-state sentence
 * instead of a `P 0 · W 0 · L 0 · D 0` fabrication (design.md §6.2).
 */
@Component({
  selector: 'app-head-to-head-strip',
  imports: [RouterLink, ResultMark],
  templateUrl: './head-to-head-strip.html',
  styleUrl: './head-to-head-strip.css',
})
export class HeadToHeadStrip {
  readonly opponentName = input.required<string>();
  readonly summary = input.required<HeadToHeadSummary>();

  readonly ordinal = ordinal;
}
