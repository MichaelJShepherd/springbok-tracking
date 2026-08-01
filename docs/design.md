# Design direction — Springbok Tracking

Status: draft v1 (task #70, part of #66). Companion to `docs/prd.md` and
`docs/journeys.md`. This document is the design system reference; the
clickable walkthrough of it lives in `docs/prototype.html`. Sign-off on both
is recorded on task #70 per #66's owner-proxy mandate.

## 1. Identity

A modern SA-rugby-fan feel, built from colour and typography alone — **no
Springbok logo, badge, bok head, or any SARU/World Rugby trademarked asset**
appears anywhere in this repo. Colours are not trademarks, so a green/gold
palette is fair game; the badge, the wordmark and the specific bok
silhouette are not, and are never referenced, linked to, or approximated.

The tone: dense, fast, honest. This is a stats-and-facts tracker for a fan
who wants the answer, not a hype site — closer to a well-run scoreboard than
a fan-club page. Dark-ink neutrals keep long tables (History) readable;
green/gold are used sparingly, as accents and semantic signal, not as a
wash over every surface.

### 1.1 Tokens (CSS custom properties)

```css
:root {
  /* Palette — brand accent */
  --c-green-900: #06231a;
  --c-green-700: #0b3d2e;
  --c-green-600: #145c41;
  --c-green-500: #1d7a54;
  --c-gold-500: #d4af37;
  --c-gold-400: #e6c65c;

  /* Neutrals — dark ink, used for text/surfaces (most of the UI) */
  --c-ink-950: #0d0f0e;
  --c-ink-900: #141715;
  --c-ink-800: #1c201d;
  --c-ink-700: #2a2f2b;
  --c-ink-500: #6b746d;
  --c-ink-300: #a7b0a9;
  --c-ink-100: #e7ebe8;
  --c-paper: #f7f8f6;

  /* Semantic — results */
  --c-win: #1d7a54;      /* win */
  --c-loss: #a83232;     /* loss */
  --c-draw: #a7862b;     /* draw */

  /* Semantic — sentiment / mood curve */
  --c-mood-pos: #2e8b57;
  --c-mood-neg: #b5453f;
  --c-mood-neutral: #8a8f89;

  /* Honesty-state language (D16) */
  --c-state-absent: #9aa39c;     /* "not recorded" — muted, no alarm */
  --c-state-loading: #6b8fae;    /* "not yet fetched" — cool blue, transient */
  --c-state-failed: #b5453f;     /* "temporarily unavailable" — same hue as loss, deliberately: something is wrong */

  /* Type scale — system stack, zero webfont dependency */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --fs-100: 0.75rem;   /* meta, badges, attribution */
  --fs-200: 0.875rem;  /* table cells, secondary text */
  --fs-300: 1rem;      /* body */
  --fs-400: 1.25rem;   /* card titles */
  --fs-500: 1.75rem;   /* score, page heading */
  --fs-600: 2.25rem;   /* hero score on detail page */

  /* Spacing scale (4px base) */
  --sp-1: 0.25rem;
  --sp-2: 0.5rem;
  --sp-3: 0.75rem;
  --sp-4: 1rem;
  --sp-6: 1.5rem;
  --sp-8: 2rem;
  --sp-12: 3rem;

  /* Radius / elevation */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 14px;
  --shadow-1: 0 1px 2px rgba(0,0,0,.24);
  --shadow-2: 0 4px 12px rgba(0,0,0,.28);
}
```

### 1.2 Honesty-state visual language (D16)

Four provenance states exist on any nullable fact; they must **look**
different, not just read different, so a scanning eye catches the
distinction without reading every word:

| State | Treatment | Example copy |
|---|---|---|
| `present` | Normal text, no chip | "R. Poitrenaud" |
| `absent_in_source` | Muted ink (`--c-state-absent`), italic, no icon — this is not an error, the source simply never had it | *"not recorded"* |
| `not_yet_fetched` | Skeleton shimmer bar in `--c-state-loading` tint, no text | (shimmer) |
| `fetch_failed` | Small chip, `--c-state-failed` background at 12% opacity, solid border, warning-triangle glyph | ⚠ "temporarily unavailable" |

The rule: **absent-in-source is calm; fetch-failed is alarmed.** Conflating
the two would tell the fan a genuine gap in 1896 records is somehow our
outage.

### 1.3 "Computed" badge (D5 / D23)

Derived facts (currently: sentiment scores only) get a small pill, always
paired with two links — method and source — never floating alone:

```
[ ● computed ]  Fan mood — computed by this site from r/rugbyunion match thread
                (method) · (source thread)
```

Badge style: `--c-gold-400` text on `--c-ink-800`, `radius-sm`, `fs-100`,
a filled dot glyph (never the brand green — green is reserved for "win" /
factual states, gold flags "this is an inference"). The phrasing is fixed
per D23: "computed by this site from X", never "Reddit says" or "the
Guardian says".

## 2. Component inventory → surfaces

| Component | Surfaces | Notes |
|---|---|---|
| Fixture card | Home (J1) | Off-season variant (D8/D30) swaps body copy for "No test scheduled" + last result **only** (no predictive "next window" note); postponed/TBD renders a chip, never a blank |
| Result card | Home (J2) | W/L/D colour bar using `--c-win/--c-loss/--c-draw`; match-day-in-progress variant: "Match under way — no live coverage here" |
| History table + filter chips | History (J3) | See §3 mobile collapse |
| Detail header | Game detail (J4) | Score hero (`fs-600`), competition/date/venue meta row, "sources differ" badge inline on any disputed field |
| Lineups two-column | Game detail (J4) | SA \| Opponent; each name cell independently carries its own D16 state — a lineup can be half-present |
| Events list | Game detail, Timeline (J4/J5) | Single source of truth per PRD D7; rendered plain on detail, plotted on an axis on timeline |
| Timeline axis + mood curve overlay | Timeline (J5) | Axis renders events immediately; mood curve is a deferred overlay (never blocks event paint, PRD §2.4). Bucket labels come from D2's closed five-label vocabulary (Despair / Grumbling / Mixed / Upbeat / Euphoric); Guardian-fallback matches render ONE whole-match point, not a curve; threads under 25 comments render "too little discussion to score" |
| Sources-differ badge | Game detail (J4) | Small inline badge next to the disputed field, links both source values (D14) — never silently picks one visually without the badge |
| Attribution footer | Game detail, History (J3/J4) | CC BY-SA + exact article link + "modified: parsed and normalised from wikitext" (D26); History carries one site-level footer, detail carries one per page |

## 3. Mobile-first

All components are specified mobile-first (base styles target a phone
viewport; wider layouts are additive via a single `min-width: 720px`
breakpoint — no component needs more than two states).

### 3.1 History table mobile collapse

Above 720px the table renders as a normal dense table: Date | Opponent |
Score | W/D/L | Venue | Competition, sortable columns, filter chips in a
row above.

Below 720px the table collapses into a stacked card list — **not** a
horizontally-scrolling table (scrolling a data table sideways on a phone is
exactly the friction this product exists to remove):

```
┌─────────────────────────────┐
│ 24 Oct 1995   ●W            │  ← date + W/D/L colour dot, same row
│ RWC Final — vs New Zealand  │  ← opponent + competition, one line
│ 15–12  ·  Ellis Park        │  ← score + venue, one line
└─────────────────────────────┘
```

Filter chips remain horizontally scrollable as a single row (chips are
short; this is the one place horizontal scroll is fine because the content
is inherently a strip of choices, not a data grid). Tapping a card opens
Game detail exactly as tapping a row would on desktop.
