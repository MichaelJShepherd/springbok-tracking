import { Component, input } from '@angular/core';

export type MarkResult = 'win' | 'loss' | 'draw' | null;

/**
 * A single W/L/D mark (docs/design.md §2.5, §7.1) — the letter always
 * carries the meaning, colour is never the only signal. Shared by the Home
 * form guide and the detail head-to-head strip's mini form (§7.3).
 */
@Component({
  selector: 'app-result-mark',
  imports: [],
  templateUrl: './result-mark.html',
  styleUrl: './result-mark.css',
})
export class ResultMark {
  readonly result = input.required<MarkResult>();
  readonly ariaLabel = input<string>('No recorded result');
  readonly size = input<'lg' | 'sm'>('lg');

  readonly letter = (): string => {
    switch (this.result()) {
      case 'win':
        return 'W';
      case 'loss':
        return 'L';
      case 'draw':
        return 'D';
      default:
        return '–';
    }
  };
}
