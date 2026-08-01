import { Component, input } from '@angular/core';
import { Provenance } from '../provenance';

/**
 * Renders a single fact field according to its D16 provenance state
 * (docs/prd.md D16, docs/design.md §1.2). Used anywhere a value can be
 * legitimately missing — this is what keeps a missing optional field from
 * ever being rendered as a blank cell or a crash.
 */
@Component({
  selector: 'app-field-value',
  imports: [],
  templateUrl: './field-value.html',
  styleUrl: './field-value.css',
})
export class FieldValue {
  readonly value = input<string | number | null>(null);
  readonly provenance = input<Provenance>('present');
}
