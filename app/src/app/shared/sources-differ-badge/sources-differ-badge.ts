import { Component, input } from '@angular/core';
import { FieldDisagreement } from '../match-detail-models';

/**
 * D14: "when two display-cleared sources disagree on a fact... badge
 * 'sources differ' linking both — never silently pick." Renders nothing
 * when there is no recorded disagreement for the field (the normal case
 * today — see match-detail-models.ts's FieldDisagreement doc comment).
 */
@Component({
  selector: 'app-sources-differ-badge',
  imports: [],
  templateUrl: './sources-differ-badge.html',
  styleUrl: './sources-differ-badge.css',
})
export class SourcesDifferBadge {
  readonly disagreement = input<FieldDisagreement | undefined>(undefined);
}
