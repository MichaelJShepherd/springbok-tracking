import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Static explainer page (PRD §2.5): sourcing rules, the two principle-2
 * carve-outs (D5 derived facts, D28 API facts), the five-label sentiment
 * vocabulary, the D2 minimum-volume rule, and the D26 CC BY-SA attribution
 * explanation. No data fetching — this page is entirely static content.
 */
@Component({
  selector: 'app-method',
  imports: [RouterLink],
  templateUrl: './method.html',
  styleUrl: './method.css',
})
export class Method {}
