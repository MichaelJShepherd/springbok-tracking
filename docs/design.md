# Design direction — Springbok Tracking

Status: **v2 (task #89)** — complete rewrite. Supersedes design v1 (#70),
which the repo owner rejected on review of the #89 J6 screenshots: near-black
void, no identity, plain text cards, "wireframe that shipped". v2 is the
owner-directed replacement: **heritage rugby — the official record book of SA
rugby.** Companion to `docs/prd.md` and `docs/journeys.md`; the clickable
walkthrough of this document is `docs/prototype.html` (v2, same task).
Sign-off on both is the owner's, recorded on #89.

Decision rows added by this document: **D32** (direction supersede), **D33**
(derived-aggregate scope + labelling), **D34** (new component inventory).

---

## 1. The idea

**A printed record book, set in type, that happens to be a website.**

Not a scoreboard app, not a fan page, not a dashboard. The reference object is
the kind of hardback annual a rugby household keeps on a shelf: warm paper,
ruled tables, a serif that means business, a green-and-gold spine, and rows of
facts that go back further than you do. The site's product promise — *every
fact has a source, every gap is admitted* — is exactly the promise a record
book makes, so the metaphor is doing real work, not decoration.

Three consequences that drive every token below:

1. **Paper, not void.** The ground is warm off-white. Ink is a green-black.
   v1's failure was that a dark UI with grey cards has no identity available
   to it — everything reads as "default". Paper has an opinion by default.
2. **Rules, not shadows.** Depth comes from hairlines, double rules and
   ledger zebra — the vocabulary of print. Radii are 2–3px, never 14px.
   Nothing floats.
3. **Density is the feature.** A fan who came for the record wants numbers per
   square inch. Green and gold are used as *signal and structure* (mastheads,
   collar stripes, section rules, W/L/D semantics), never as a wash.

### 1.1 Trademark rule (carried forward from v1, unchanged)

**No Springbok logo, badge, bok head, protea, jersey artwork, or any
SARU/SA Rugby/World Rugby trademarked asset appears anywhere in this repo.**
Colours are not trademarks; a green-and-gold palette is fair game. The badge,
the wordmark and the bok silhouette are not, and are never referenced,
linked, embedded or approximated — including as "inspired-by" SVG. The only
kit reference permitted is abstract: the **collar stripe** (a gold rule under
a green band), which is a stripe, not a mark.

### 1.2 System constraints (rule 1.3, unchanged)

- **No framework, no dependency, no build step for the design system.** It is
  CSS custom properties plus plain CSS.
- **No external requests, ever.** No font CDN, no icon font, no remote image.
  Type is a system stack; every graphic is CSS or inline SVG; every texture is
  a CSS gradient. `docs/prototype.html` is one file and makes zero network
  requests — that is a test, see §11.
- **Few tokens.** One colour ramp per role, one 8-step space scale, two type
  families, three radii. If a component needs a new token, it is probably the
  wrong component.

---

## 2. Colour

### 2.1 Tokens

```css
:root {
  color-scheme: light;               /* single theme — see §10 */

  /* — Springbok green: structure, headings, "win", the spine — */
  --g-900: #04261B;   /* masthead ground, footer ground */
  --g-800: #06412C;   /* table headers, computed-stamp ground */
  --g-700: #005A38;   /* = --win; primary on-paper green ink */
  --g-600: #007749;   /* core SA green: rules, bars, chart series */
  --g-100: #E4EFE8;   /* green tint panel (head-to-head strip) */

  /* — Gold: three roles, never interchangeable (§2.3) — */
  --gold-500: #FFB81C;  /* DECOR: fills/rules on dark green only */
  --gold-300: #FFD97A;  /* TEXT on dark green grounds */
  --gold-700: #B57E10;  /* GRAPHIC: meaningful non-text marks on paper */
  --gold-ink: #6B4B0C;  /* TEXT: gold-flavoured labels on paper */

  /* — Paper & ink — */
  --paper:       #F3EEE2;  /* page ground */
  --card:        #FCF9F2;  /* plate / card ground */
  --card-alt:    #F7F2E7;  /* ledger zebra row */
  --rule:        #D9CFB8;  /* hairline */
  --rule-strong: #B9AC8E;  /* section rule, double rule */
  --ink:   #17221C;  /* body text */
  --ink-2: #3C4A43;  /* secondary text */
  --ink-3: #5D6B62;  /* meta, captions, attribution */
  --ink-4: #7C8983;  /* non-text: skeletons, chart gridlines, empty chips */

  /* — Result semantics (§2.5) — */
  --win:  #005A38;
  --loss: #9B2226;
  --draw: #7A5B12;
  --loss-tint: #FBECEC;
  --draw-tint: #FBF3DF;
  --win-tint:  #E4EFE8;   /* = --g-100 */

  /* — Honesty states (D16, §4) — */
  --state-absent:  var(--ink-3);   /* "not recorded" — calm */
  --state-loading: #2C5A7A;        /* cool ink; transient */
  --loading-tint:  #EAF1F6;
  --state-failed:  var(--loss);    /* alarmed, deliberately loss-hued */

  /* — Mood / sentiment (D2) — */
  --mood-pos: var(--g-600);
  --mood-neg: var(--loss);
  --mood-neutral: var(--ink-3);
}
```

That is **21 colour values**. v1 had 24 and no identity; the count is not the
problem, the ground was.

### 2.2 Contrast — measured, not asserted

Every pair below was computed with the WCAG 2.1 relative-luminance formula
(sRGB linearisation, `(L1+0.05)/(L2+0.05)`) by a throwaway Node script over
the token table — 59 pairs, run at authoring time (§11 records the method).
**No text pair in the system is below 4.5:1.**

| Foreground | Background | Ratio | Grade |
|---|---|---|---|
| `--ink` | `--paper` | 14.15 | AAA |
| `--ink` | `--card` | 15.58 | AAA |
| `--ink` | `--card-alt` | 14.67 | AAA |
| `--ink` | `--g-100` | 13.89 | AAA |
| `--ink-2` | `--card` | 8.87 | AAA |
| `--ink-2` | `--paper` | 8.05 | AAA |
| `--ink-2` | `--g-100` | 7.91 | AAA |
| `--ink-3` | `--card` | 5.33 | AA |
| `--ink-3` | `--card-alt` | 5.02 | AA |
| `--ink-3` | `--paper` | 4.84 | AA |
| `--card` | `--g-900` | 15.38 | AAA |
| `--card` | `--g-800` | 11.09 | AAA |
| `--card` | `--g-700` | 7.93 | AAA |
| `--card` | `--g-600` | 5.35 | AA |
| `--paper` | `--g-900` | 13.97 | AAA |
| `--g-100` | `--g-900` | 13.72 | AAA |
| `--gold-300` | `--g-900` | 11.91 | AAA |
| `--gold-300` | `--g-800` | 8.59 | AAA |
| `--gold-300` | `--g-700` | 6.14 | AA |
| `--gold-500` | `--g-900` | 9.34 | AAA |
| `--gold-500` | `--g-800` | 6.74 | AA |
| `--g-900` | `--gold-500` | 9.34 | AAA |
| `--gold-ink` | `--card` | 7.57 | AAA |
| `--gold-ink` | `--paper` | 6.88 | AA |
| `--gold-ink` | `--gold-500` | 4.60 | AA |
| `--win` | `--card` | 7.93 | AAA |
| `--win` | `--paper` | 7.20 | AAA |
| `--loss` | `--card` | 7.53 | AAA |
| `--loss` | `--paper` | 6.84 | AA |
| `--loss` | `--loss-tint` | 6.91 | AA |
| `--draw` | `--card` | 5.99 | AA |
| `--draw` | `--paper` | 5.44 | AA |
| `--draw` | `--draw-tint` | 5.70 | AA |
| `--card` on `--win` (chip) | | 7.93 | AAA |
| `--card` on `--loss` (chip) | | 7.53 | AAA |
| `--card` on `--draw` (chip) | | 5.99 | AA |
| `--state-loading` | `--card` | 7.01 | AAA |
| `--state-loading` | `--loading-tint` | 6.46 | AA |
| `--ink` | `--loss-tint` | 14.28 | AAA |
| `--ink` | `--draw-tint` | 14.81 | AAA |
| `--ink` | `--loading-tint` | 14.36 | AAA |

**Non-text (WCAG 1.4.11, 3:1 bar) — meaningful graphics only:**

| Token | On | Ratio | Verdict |
|---|---|---|---|
| `--g-600` (chart series, bars) | `--card` | 5.35 | passes |
| `--gold-700` (lead-change marks, active tab underline) | `--card` | 3.35 | passes |
| `--gold-700` | `--paper` | 3.05 | passes |
| `--ink-4` (skeleton bar, empty form chip) | `--card` | 3.47 | passes |
| `--ink-4` | `--paper` | 3.15 | passes |

**Deliberately below 3:1, and allowed to be** — these are decorative
separators that carry no information a sighted user needs to identify state,
because every boundary they draw is *also* drawn by zebra striping, spacing
or a text label: `--rule` on `--card` (1.47), `--rule-strong` on `--card`
(2.13) / `--paper` (1.94), `--gold-500` on `--card` (1.65 — which is exactly
why `--gold-500` is forbidden on paper, §2.3). **Rule: if a hairline is the
only thing communicating a boundary or a state, it must be `--ink-4` or
darker, or 2px+ of `--gold-700`.**

### 2.3 Gold's three roles (the rule that keeps gold from wrecking contrast)

Gold is the accent that makes this palette read as rugby, and it is also the
easiest way to fail AA. So gold is split by *job*, and the jobs never mix:

| Token | Job | Allowed on | Never |
|---|---|---|---|
| `--gold-500` | Decorative fill/rule — the collar stripe, masthead underline, section flourish | dark green grounds (`--g-900`/`--g-800`/`--g-700`) | as text or a meaningful mark on paper (1.65:1) |
| `--gold-300` | Text on dark green — masthead sub-line, computed-stamp text | `--g-900`/`--g-800`/`--g-700` | on paper |
| `--gold-700` | Meaningful **non-text** graphic on paper — lead-change dots, active-tab underline (2px+) | `--card`/`--paper` | as body text (3.35:1 < 4.5) |
| `--gold-ink` | Gold-flavoured **text** on paper — eyebrow labels, "computed" caption | `--card`/`--paper` | on dark green |

### 2.4 Where each colour lives (the wash test)

Green covers roughly **12%** of a page's area: masthead band, table header
rows, footer colophon, section rules, the win colour. Gold covers **under
2%**: collar stripes and a handful of marks. Everything else is paper and ink.
If a review screenshot looks like a green page, the implementation is wrong.

### 2.5 W/L/D colour system

Three semantics, each with **four consistent renderings**, so the same result
looks like the same thing on Home, History, detail and the form guide:

| Result | Ink | Chip (solid) | Tint panel | Rule/bar |
|---|---|---|---|---|
| **Win** | `--win` | `--card` on `--win` | `--win-tint` | `--g-600` |
| **Loss** | `--loss` | `--card` on `--loss` | `--loss-tint` | `--loss` |
| **Draw** | `--draw` | `--card` on `--draw` | `--draw-tint` | `--draw` |
| **No recorded result** | `--ink-3` italic | 1px dashed `--ink-4` on `--card`, glyph `–` | none | `--ink-4` dashed |

Non-negotiable accessibility rule: **colour is never the only signal.** Every
W/L/D mark carries the letter `W`/`L`/`D` (display serif, uppercase) *and* an
accessible name (`aria-label="Win, South Africa 12 New Zealand 11"`). The
three hues were chosen to survive the common colour-vision deficiencies
because they differ in lightness as well as hue (`--win` L*≈33, `--loss`
L*≈36 but far warmer, `--draw` L*≈41) — but the letter is what actually
carries it. A W/L/D dot with no letter does not ship.

---

## 3. Typography

Status: **amended by D36 (#92)**, owner instruction 2026-08-02 — v2's original
Iowan/Palatino-first serif "sucks" and needed to be rounder. Both families
below are still **system or near-universally-installed** stacks; there is
still no `@font-face`, no webfont file in the repo, and no CDN (§1.2). D36
also adds a third, narrower-scoped token — `--font-numeric` — for the
numeral exception (§3.1a).

```css
:root {
  /* Display AND text — the record book's voice, now also the body's voice
     (D36: the owner asked for the rounder serif everywhere, not just
     headings). Georgia is the roundest cross-platform system serif
     available without a font file — it ships on Windows, macOS and
     Android — so it leads both stacks; the rest of each stack is the same
     old-style-serif fallback family v1 used, kept in order behind Georgia.
     --font-display and --font-text are now the same stack: there is no
     longer a display/text split at the family level, only at the numeral
     level (§3.1a). */
  --font-display: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino,
    "Book Antiqua", "Hoefler Text", "Times New Roman", serif;
  --font-text: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino,
    "Book Antiqua", "Hoefler Text", "Times New Roman", serif;

  /* Numeric data contexts only (§3.1a) — ledger figures, scores, kickoff
     times, era/head-to-head percentages, W/L/D tallies, shirt numbers,
     event-clock minutes. This is the system sans stack v2 originally used
     for all body text; D36 narrows its job to numerals only. */
  --font-numeric: system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;

  /* Scale — 11 / 12 / 14 / 16 / 20 / 28 / 40 / clamp(44–64) */
  --t-eyebrow: 0.6875rem;   /* uppercase, 0.12em tracking, sans 650 */
  --t-cap:     0.75rem;     /* captions, attribution, provenance notes */
  --t-sm:      0.875rem;    /* table cells, chips, meta */
  --t-base:    1rem;        /* body */
  --t-lg:      1.25rem;     /* card titles (display) */
  --t-xl:      1.75rem;     /* section headings (display) */
  --t-2xl:     2.5rem;      /* page title (display) */
  --t-hero:    clamp(2.75rem, 11vw, 4rem);  /* score hero (display) */

  --lh-tight: 1.1;    /* display, scores */
  --lh-snug:  1.35;   /* table rows, chips */
  --lh-body:  1.55;   /* prose */
  --measure:  66ch;   /* max line length for prose (/method) */
}
```

### 3.1 Rules of use

- **Display/text serif** (D36: now the same stack) = scores' surrounding
  labels, page/section headings, card titles, W/L/D letters, prose, table
  header labels, eyebrows, chips, controls, captions — everything, per the
  owner's instruction, *except* the numeral contexts carved out in §3.1a.
  Headings set with `letter-spacing: -0.01em` and `--lh-tight`; the hero
  score's surrounding label gets `-0.02em`.
- **Eyebrow labels** (`FORM · LAST FIVE TESTS`, `THE RECORD BY ERA`) are the
  system's signature move: 11px, 650 weight, `0.12em` tracking, uppercase,
  `--ink-3` on paper or `--gold-300` on green, with a 1px `--rule-strong`
  underline spanning the block. As of D36 they render in `--font-text`
  (Georgia-first) like everything else — they are no longer the one sans
  note in a serif system, which is a deliberate simplification: one rule
  ("serif everywhere except numerals") beats two.
- **No italics except one job**: `absent_in_source` copy (§4). Italic means
  "the source didn't have this" everywhere in the system, so it is never
  spent on emphasis.
- **Small caps** are used only for the competition label in the detail
  masthead (`font-variant-caps: all-small-caps`), with a plain-uppercase
  fallback via letter-spacing where unsupported. This is one flourish, not a
  motif.

### 3.1a Numeral policy (D36 — decided empirically, #92)

**The rule:** every numeral that has to line up in a column, or be read as a
quantity at a glance, is set in `--font-numeric` (the system sans tabular
stack), never in `--font-display`/`--font-text` (Georgia-first). Everything
else — including the words and letters sitting right next to those numerals —
stays on the Georgia-first stack.

**Why, and how this was verified.** Classic Georgia has old-style,
non-tabular numeral shapes: digits sit at varying heights and widths by
design (it's a book face, not a data face). The obvious fix — `font-variant-
numeric: lining-nums tabular-nums` plus `font-feature-settings: "tnum" 1,
"lnum" 1` — is exactly what v1 already specified for numerals (§3.1's old
text). It does not work on Georgia on this Windows/Chrome build: a rendered
comparison (digit column set in Georgia with every numeric OpenType feature
switched on, side by side with the same digits in the sans stack, screenshot
recorded on #92) showed Georgia's digits staying old-style and misaligned
regardless of the feature flags, while the sans stack aligned immediately
with no extra CSS. Windows' Georgia build simply doesn't carry `tnum`/`lnum`
substitution tables the way some other platforms' copies do, so the feature
request is silently ignored rather than erroring — which is exactly the trap
this row exists to document, so nobody re-discovers it by shipping wobbly
columns.

**Scope of the exception** — rendered in `--font-numeric` with
`font-variant-numeric: tabular-nums lining`:
- History ledger: the Date and Score columns (Opponent, Venue, Competition
  and the W/D/L letter mark stay Georgia — a letter is not a numeral).
- Score heroes and score lines (Home cards, match detail) — the digits only;
  the team names beside them stay Georgia.
- Kickoff times, wherever rendered.
- Era and head-to-head win percentages, and their P/W/L/D tallies.
- Form-guide opponent/score captions and the W/L/D summary tally.
- Shirt numbers, event-clock minutes.
- The score-progression chart's printed final scores and axis labels.

**Everything else stays Georgia**, including: headings, prose, eyebrows,
table header labels, chips, controls, captions, the W/L/D letter mark, and
prose sentences that merely *contain* a number without needing column
alignment (e.g. "the 105th meeting"). If a future reviewer finds a numeral
context this list missed, it is a docs gap, not license to invent a fourth
font stack — extend this list and `--font-numeric`'s call sites together.

### 3.2 Type specimen (what each surface uses)

| Element | Family | Size | Weight/style |
|---|---|---|---|
| Masthead wordmark | display | `--t-xl` | 600, `-0.01em` |
| Page title | display | `--t-2xl` | 600 |
| Score hero (detail) | numeric (digits) / display (team names) | `--t-hero` | 600, tabular |
| Card score (Home) | numeric (digits) / display (team names) | `--t-2xl` | 600, tabular |
| Section heading | display | `--t-xl` | 600 |
| Card title | display | `--t-lg` | 600 |
| Eyebrow | text | `--t-eyebrow` | 650, uppercase, 0.12em |
| Body / prose | text | `--t-base` | 400, `--lh-body` |
| Table cell | text, numeric where a ledger figure (§3.1a) | `--t-sm` | 400, tabular where numeric |
| Table header | text | `--t-eyebrow` | 650, uppercase, on `--g-800` |
| Chip / badge | text | `--t-cap`–`--t-sm` | 600 |
| Caption / attribution / provenance | text | `--t-cap` | 400, `--ink-3` |
| W/L/D letter | display | `--t-sm`–`--t-lg` | 700 |

---

## 4. Space, density, rules and texture

### 4.1 Space & radius

```css
:root {
  --s-1: 0.25rem; --s-2: 0.5rem;  --s-3: 0.75rem; --s-4: 1rem;
  --s-6: 1.5rem;  --s-8: 2rem;    --s-12: 3rem;   --s-16: 4rem;

  --r-sm: 2px;    /* chips, badges, inputs */
  --r-md: 3px;    /* plates, panels */
  --r-lg: 3px;    /* deliberately equal to --r-md: nothing is rounder */

  --row-y:    0.75rem;  /* comfortable table/list row padding */
  --row-y-lg: 0.5rem;   /* ledger density: History table ≥720px */
  --plate-x:  var(--s-4);
  --gutter:   var(--s-4);
  --page-max: 1040px;   /* was 900px — the record needs the width */
}
```

**Density policy.** Two densities only: *comfortable* (everything on a phone,
plus all cards) and *ledger* (the History table and lineup lists above
720px, `--row-y-lg`, `--t-sm`). Ledger rows are 32px tall at 14px/1.35 —
tight enough to get ~18 rows above the fold on a laptop, which is the point
of a record book.

### 4.2 Rules — the depth system

Shadows are all but banned. The elevation vocabulary is print:

```css
--hairline:    1px solid var(--rule);
--hairline-2:  1px solid var(--rule-strong);
--double-rule: 3px double var(--rule-strong);   /* section breaks */
--collar:      0 -3px 0 inset var(--gold-500);  /* gold under a green band */
--plate-lift:  0 1px 0 var(--rule);             /* the ONLY shadow allowed */
```

- **Section break** = `border-top: var(--double-rule)` + `--s-8` above. A
  double rule is the single most "record book" mark available in pure CSS and
  costs nothing.
- **Collar stripe** = any green band (masthead, table header, footer) carries
  a 3px `--gold-500` rule on its paper-facing edge. This is the kit reference
  (§1.1) and the thing that makes a screenshot instantly identifiable.
- **No blur, anywhere.** `--plate-lift` is a 1px solid offset — the look of a
  second sheet under the first, not a floating card.

### 4.3 Plate treatments (card recipes)

v1 had one card: dark grey, 14px radius, blurred shadow. v2 has four plates,
each with a job. All four are pure CSS, no images.

```css
/* 1. PLATE — the default container. A pasted-in sheet. */
.plate {
  background: var(--card);
  border: var(--hairline);
  border-radius: var(--r-md);
  box-shadow: var(--plate-lift);
  padding: var(--s-4);
}

/* 2. PLATE-HEADED — a plate with a green title band + collar. Used for
   the Home cards, the head-to-head strip, the score-progression chart. */
.plate--headed > .plate__head {
  background: var(--g-800);
  color: var(--gold-300);
  border-bottom: 3px solid var(--gold-500);
  margin: calc(var(--s-4) * -1) calc(var(--s-4) * -1) var(--s-4);
  padding: var(--s-2) var(--s-4);
  font: 650 var(--t-eyebrow)/1 var(--font-text);
  letter-spacing: 0.12em; text-transform: uppercase;
}

/* 3. LEDGER — ruled data. Zebra + hairlines + green header. */
.ledger { border-collapse: collapse; width: 100%; background: var(--card); }
.ledger thead th {
  background: var(--g-800); color: var(--gold-300);
  border-bottom: 3px solid var(--gold-500);
  font: 650 var(--t-eyebrow)/1 var(--font-text);
  letter-spacing: 0.1em; text-transform: uppercase;
  text-align: left; padding: var(--s-2) var(--s-3);
}
.ledger tbody tr:nth-child(even) { background: var(--card-alt); }
.ledger tbody td { border-bottom: var(--hairline); padding: var(--row-y-lg) var(--s-3); }
.ledger tbody tr:hover { background: var(--g-100); }

/* 4. FIGURE — a bordered block for a chart or stat strip, captioned below
   the rule like a plate caption in a book. */
.figure { border: var(--hairline-2); background: var(--card); padding: var(--s-4); }
.figure > figcaption {
  border-top: var(--hairline); margin-top: var(--s-3); padding-top: var(--s-2);
  font: 400 var(--t-cap)/1.4 var(--font-text); color: var(--ink-3);
}
```

### 4.4 Paper texture (CSS only, ~10 lines, zero requests)

The ground gets the faintest grain so it reads as stock rather than as
`#F3EEE2`. Two layered gradients at 2–3% alpha plus a corner vignette,
painted on a `::before` overlay that is `pointer-events: none` and hidden
under `prefers-reduced-transparency`/`forced-colors`:

```css
body::before {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background:
    repeating-linear-gradient(0deg,   rgba(23,34,28,.020) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg,  rgba(23,34,28,.014) 0 1px, transparent 1px 4px),
    radial-gradient(120% 90% at 50% 0%, transparent 55%, rgba(23,34,28,.05) 100%);
}
@media (forced-colors: active) { body::before { display: none; } }
```

The grain must be invisible in isolation and only felt in aggregate. If it is
visible as stripes on any display, the alpha is too high — that is the tuning
rule, not a fixed number.

---

## 5. Honesty & provenance — restyled, still product law

D16, D14, D26, D5/D23 are non-negotiable (PRD §5 "honesty invariants"). v1
specified them; v2 keeps every one and gives it a paper rendering. Nothing
here is weakened.

### 5.1 D16 provenance states

| State | Rendering | Copy |
|---|---|---|
| `present` | normal ink, no chip | `Wayne Barnes` |
| `absent_in_source` | `--state-absent` (`--ink-3`, 5.33:1), **italic**, no icon, no border — calm, because a gap in 1891's records is not a fault | *not recorded* |
| `not_yet_fetched` | skeleton bar: `--ink-4` at 3.47:1 on `--card`, 0.7em tall, `--r-sm`, 1.6s ease-in-out shimmer; a `--t-cap` `--state-loading` note *"history still loading"* sits once per section, not once per field | (bar) + one note |
| `fetch_failed` | inline chip: 1px solid `--state-failed`, ground `--loss-tint`, text `--loss` (6.91:1), leading `⚠` glyph, `--r-sm`, never animated | ⚠ temporarily unavailable |

**The rule, unchanged from v1 and restated because it is the most important
sentence in this document: `absent_in_source` is calm; `fetch_failed` is
alarmed.** Conflating them tells a fan that a genuine 1891 gap is our outage.
On paper this is easier to hold than in v1's dark UI: italic grey ink is
visibly *a note by the editor*, while the failed chip is visibly *a sticker
someone slapped on*.

Reduced motion: `@media (prefers-reduced-motion: reduce)` replaces the
shimmer with a static `--ink-4` bar at 45% opacity. Every state also carries
its text in the accessible tree (`aria-label`), never colour/italic alone.

### 5.2 D14 "sources differ"

An inline badge immediately after the displayed value: `--r-sm`, 1px solid
`--gold-700`, ground `--card`, text `--gold-ink` (7.57:1), copy
`sources differ`, expanding on click/Enter to a two-row mini-ledger —
*displayed value + source link* above *alternate value + source link*. The
precedent value stays the one rendered in the fact position (D14). Never a
silent pick, never a tooltip-only disclosure (tooltips don't exist on touch).

### 5.3 D5 / D23 computed stamp

Derived facts (sentiment only — see §5.4 for why aggregates are *not* in this
class) carry a stamp, never a bare number:

```
┌──────────────────┐
│ ● C O M P U T E D │   Fan mood — computed by this site from
└──────────────────┘   r/rugbyunion match thread
                       method · source thread
```

Stamp style: ground `--g-800`, text `--gold-300` (8.59:1), 2px solid
`--gold-500` border, `--r-sm`, `--t-eyebrow` with `0.18em` tracking, filled
dot glyph. Deliberately **not** rotated or distressed — one stamp motif,
played straight. Green is never used for the stamp: green means *fact/win* in
this system, gold means *we inferred this*. The phrasing is fixed by D23
("computed by this site from X"), and the stamp is invalid without both the
method link and the source link (§5.2's rule applies: the pair of links *is*
principle 2's viewable source, per D5).

Mood states, all four, are specified: full four-bucket curve (Reddit);
single whole-match point (Guardian fallback, badge reads "from news
headlines"); *"too little discussion to score"* in `--ink-3` italic where the
D2 volume floor isn't met; *"no sentiment sources for this era"* in `--ink-3`
italic for pre-source matches (D3). In every one of the last three cases the
events layer renders unchanged (PRD §2.4).

### 5.4 Derived aggregates are NOT derived facts (new in v2 — D33)

Three of the four new components in §7 display numbers this site computes
(win %, head-to-head totals, cumulative score). This is a real product
question, and getting it wrong would either dilute D5's badge or hide a
computation:

**Aggregates are arithmetic over already-displayed facts, not inference, so
they do not get the D5 computed stamp** — that stamp means "we inferred
something a human would call a judgement" and spending it on `71/128` would
train fans to ignore it exactly where it matters (sentiment).

**Instead every aggregate carries a `count caption`**: a `--t-cap` `--ink-3`
line under the figure stating the denominator and what was excluded, e.g.
*"Win % of the 128 tests in this era with a recorded result; 6 further tests
have no recorded result."* No aggregate ever renders without its caption.
That satisfies principle 2 (the source is the rows, which are on the site and
individually sourced) and principle 6 (nothing is padded — the excluded rows
are stated, not silently dropped). This is recorded as **D33** so it is a
decision, not a designer's improvisation.

### 5.5 D26 attribution — the colophon

Attribution stops being a grey footnote and becomes a **colophon**: a
`--g-900` band at the bottom of the page with a `--gold-500` collar on its
top edge, `--paper`-coloured text (13.97:1), `--t-cap`, set in two columns
above 720px. It reads as the imprint page of a book, which is precisely what
it is.

- **Match detail (per page):** `Match data adapted from Wikipedia:
  "<exact article title>" (link) · CC BY-SA 4.0 (licence link) · Modified:
  parsed and normalised from wikitext.`
- **List pages (Home, History):** one site-level colophon naming the list
  article, same shape.
- **Fixture rows:** `Fixtures via API-Sports, fetched <timestamp>` per D28,
  rendered as a `--t-cap` `--ink-3` provenance line inside the fixture plate
  (not in the colophon — it belongs to the fact).
- **Sentiment:** the §5.3 stamp, in place, on the card.

A page that renders a Wikipedia-derived fact without its colophon is a bug of
the same severity as a wrong score.

---

## 6. Existing components, restyled

These already exist in `app/src/app/**`; v2 changes their appearance and, in
three noted cases, adds a slot. No behaviour is redefined.

| Component (file) | v2 treatment |
|---|---|
| App shell (`app/app.html`, `app.css`) | Masthead: `--g-900` band, display-serif wordmark, `--gold-300` strapline "Every Springbok test, 1891– ", 3px `--gold-500` collar. Nav = ledger index tabs (see §6.1). Page ground `--paper`, `--page-max` 1040px. |
| Fixture card (`pages/home`) | `.plate--headed`, head = `NEXT TEST`. Opponent in display `--t-lg`, kickoff SAST in tabular sans, competition in small caps, D28 provenance line at the bottom. Off-season variant (D8/D30): head reads `NO TEST SCHEDULED`, body = last result only. TBD/postponed = `--r-sm` chip, 1px `--rule-strong`, `--ink-2`. |
| Result card (`pages/home`) | `.plate--headed`, head = `LATEST RESULT`. Score in display `--t-2xl` tabular, W/L/D chip (§2.5) beside it, 4px left rule in the result colour on the plate. **New slot:** the form guide (§7.1) sits below the divider inside this plate. Match-day variant keeps D8 copy verbatim. |
| History table (`pages/history`) | `.ledger` at `--row-y-lg`; a `--g-800` sticky header with collar; W/L/D column = letter chip; sparse rows leave cells genuinely empty with an italic *not recorded* rather than an em-dash. **New slot:** the era strip (§7.2) sits above the filters. |
| Filter chips (`pages/history`) | Index tabs (§6.1) for era; `--r-sm` outline chips for opponent/competition — 1px `--rule-strong`, `--ink-2`; selected = `--g-700` ground, `--card` text (7.93:1). Horizontal scroll retained for the chip strip only (v1's reasoning stands). |
| Detail masthead (`pages/match-detail`) | Full-bleed `--g-900` band with collar: date + competition small caps in `--gold-300`, then a three-column score line — `SOUTH AFRICA` / hero score `12–11` / `NEW ZEALAND` in display `--t-hero`, tabular — then venue. **New slot:** the head-to-head strip (§7.3) directly beneath. |
| Lineups (`pages/match-detail`) | Two `.ledger`s side by side above 720px, stacked below. Shirt numbers in a fixed 2.5ch tabular column; a hairline after row 15 separates the bench. Each name keeps its own D16 state. |
| Events list (`pages/match-detail`) | Ruled list: minute (tabular, `--ink-3`, or blank where untimed), event glyph, scorer, running score in display tabular on the right. `--g-100` tint on Springbok-side rows only. **New slot:** the score-progression figure (§7.4) above the list. |
| Timeline (`pages/match-timeline`) | Axis on `--card` with `--rule` gridlines, `--gold-700` half-time marker, events as `--r-sm` marks in result colours; mood curve overlaid as a 2px `--mood-*` polyline with bucket labels in display small caps. Events paint first, always (PRD §2.4). |
| Sources-differ badge (`shared/sources-differ-badge`) | §5.2. |
| Field value (`shared/field-value`) | §5.1 — the four states, verbatim. |
| /method (`pages/method`) | Prose page at `--measure`, display headings, double-rule section breaks. Gains a short **"How the derived figures are computed"** section covering the four §7 components and the D33 caption rule, because §7.1–7.4 create new numbers and every number needs a method destination. |

### 6.1 Index tabs

Era/section navigation renders as ledger index tabs: `--t-eyebrow`, padding
`--s-2 --s-3`, 1px `--rule-strong` on the top and sides, no bottom border on
the active tab so it merges into the panel below, active tab underlined by a
2px `--gold-700` rule (3.35:1) *and* set in `--ink` at 600 weight. Focus ring
system-wide: `outline: 2px solid var(--g-600); outline-offset: 2px;` — never
`outline: none`.

---

## 7. The four new data components

These are the "richer data" half of the ticket. **All four are computable
from the existing schema via the existing `anon` SELECT grants** (`teams`,
`matches`, `match_events` — migration `20260801105708_initial_schema.sql`,
policies + grants at lines 219–237). No migration, no new table, no new
column is required; §9 records the one column that would have been nice and
why it is deliberately excluded. Each spec below gives: the shape, the data,
the degradation, and the accessibility contract.

### 7.1 Form guide — last five tests (Home, J1/J2)

**Shape.** An eyebrow `FORM · LAST FIVE TESTS`, then five square marks left
(oldest) → right (newest), each 2.75rem, `--r-sm`, solid result colour, the
letter `W`/`L`/`D` centred in display serif 700 at `--t-lg` in `--card`
(7.93 / 7.53 / 5.99:1). Under each mark, two `--t-cap` lines: opponent
abbreviation (`NZL`) and score (`12–11`), tabular. To the right of the strip,
a summary in display serif: `3W · 1L · 1D` with a `--t-cap` caption
`Points 96–71 (+25)`.

**Data.** `matches` → `result, match_date, springboks_score, opponent_score,
springboks_score_provenance, opponent_score_provenance,
teams:opponent_team_id(canonical_name)`, `match_date <= today`, order by
`match_date desc`, limit 5, then reversed for display. Opponent abbreviation
is derived in the client from `teams.canonical_name` (first three consonants
or a small alias map already owned by the `teams` table) — no schema change.

**Degradation (honest, D16/principle 6).**
- Fewer than five completed tests in the data → render only what exists and
  relabel the eyebrow to the true count (`FORM · LAST THREE TESTS`). Never
  pad with empty boxes.
- A match with `result = null` or score provenance ≠ `present` → the mark
  renders in the §2.5 "no recorded result" style (dashed `--ink-4`, glyph
  `–`) and is **excluded from the W/L/D summary**, with the caption stating
  it: `3W · 1L · 1D · 1 not recorded`.
- Points differential is only summed over marks whose both scores are
  `present`; if any are excluded the caption says
  `Points 96–71 (+25) from 4 of 5 tests`.
- Zero completed tests (impossible with real data, possible on a fresh DB) →
  the component does not render at all. An empty form strip is noise.

**A11y.** The strip is an `<ol>`; each mark is a link to its match with
`aria-label="Win — South Africa 12 New Zealand 11, 28 October 2023"`. The
summary is plain text, not an image. Keyboard: normal link tabbing.

### 7.2 The record by era (History, J3)

**Shape.** A full-width `.figure` above the filters, split into four era
columns (**exactly D29's buckets — pre-1950 / 1950–1995 / 1996–2010 /
2011– ** so the site uses one era vocabulary everywhere, including the
coverage evidence in D11). Each column, top to bottom: era label in display
serif `--t-lg`; **win % in display serif `--t-2xl` tabular** — the number the
eye lands on; a 10px stacked proportion bar (W `--g-600` / D `--draw` / L
`--loss` / unrecorded `--ink-4` hatched); and a tabular `--t-cap` line
`P 128 · W 71 · L 49 · D 8`. Columns are divided by hairlines, and the whole
figure sits under a double rule with the eyebrow `THE RECORD BY ERA`.

**Interaction.** A column is a button that applies that era to the History
filter (and reads as the active index tab afterwards) — this is the one place
the component does work rather than just informing, and it shortens J3 to
nav → era → row, inside the D10 ≤4 bar.

**Data.** Computed client-side over the History rows already fetched for the
table (`result, match_date`) — **no extra query, no extra round trip.** The
history page already loads the full D12 set (~600 rows, PRD §5).

**Degradation.** Rows with `result = null` are counted into the `unrecorded`
segment, never guessed, and excluded from the win-% denominator. The D33
count caption is mandatory:
*"Win % of tests with a recorded result. 1891–1949: 128 of 134 tests have a
recorded result."* An era with zero rows renders the label, an empty bar in
`--rule`, and *no tests recorded* in italic `--ink-3` — not a `0%`, because
0% is a claim and "we have nothing" is the truth.

**A11y.** The figure is a `<table>` visually restyled — or, in the app, a
`role="table"` with proper headers — so a screen reader gets
`Era, Played, Won, Lost, Drawn, Win %` cells rather than a soup of numbers.
The stacked bar is `aria-hidden`; the numbers next to it are the real content.
Win % is never conveyed by bar length alone.

### 7.3 Head-to-head strip (Game detail, J4)

**Shape.** A `--g-100` tint panel spanning the content width, directly under
the detail masthead, eyebrow `SOUTH AFRICA v NEW ZEALAND · ALL TIME` (built
from `teams.canonical_name`). Three zones, side by side above 720px and
stacked below:

1. **The record.** `P 105 · W 39 · L 62 · D 4` in tabular sans, with win %
   in display `--t-xl`. (`--ink-2` on `--g-100` = 7.91:1.)
2. **The extremes.** Two lines: `Biggest win 27–3 · Bloemfontein 2013` /
   `Biggest defeat 7–57 · Auckland 2017`, each a link to that match. This is
   the most record-book thing on the site and it costs one query.
3. **This match in the series.** `The 105th meeting` and — the detail that
   makes the page feel like an annual rather than a database —
   `Before this match: W 38 · L 62 · D 4`, computed from meetings dated
   before the one on screen. Plus a six-mark form strip (reusing §7.1's mark)
   of the previous meetings against this opponent.

**Data.** One extra `anon` read: `matches` where `opponent_team_id = <this
match's opponent>`, selecting `match_id, match_date, springboks_score,
opponent_score, result` + the provenance siblings. Indexed on
`matches_match_date_idx`; ~100 rows worst case (New Zealand). All arithmetic
client-side.

**Degradation.**
- Biggest win/defeat require both scores `present`; if no meeting qualifies,
  the zone renders *not recorded for any meeting in this series* in italic
  `--ink-3` rather than picking a partially-scored match.
- Ties on margin are broken by the earlier date, and the caption says
  `equalled twice` where relevant — never a silent pick.
- First-ever meeting against an opponent: zone 3 reads `The first meeting`
  and the "before this match" line and form strip are omitted (not rendered
  as zeroes).
- D33 count caption mandatory: *"From 105 tests against New Zealand;
  margins from the 103 with both scores recorded."*

**A11y.** `role="table"` semantics as §7.2; every score link has a full
`aria-label` naming both teams, the score and the date.

### 7.4 Score-progression figure (Game detail + Timeline, D11)

The component that most rewards a fan — and the one where honesty is hardest,
because D11 records that timed scoring sequences only reach 100% in the 2011+
bucket (0% pre-1950, 20% 1950–95, 27% 1996–2010). So the rule is severe:

**It renders only when it can be right, and otherwise it does not render.**

**Shape.** A `.figure` above the events list: inline SVG, 100% width,
`aspect-ratio: 5 / 2` (min-height 140px). X axis = minute 0→80 (+ extra time
where events exceed 80), gridlines every 10 min in `--rule`, a 2px
`--gold-700` half-time marker at 40′ labelled `HT`. Y axis = points 0→max,
labelled at 0 and max only. Two **stepped** polylines (a score jumps; it does
not glide): South Africa in `--g-600` (5.35:1), the opponent in `--loss`
(7.53:1) — 2.5px, distinguished by dash pattern as well as hue (SA solid,
opponent 6-3 dashed) so the two series survive monochrome print and CVD.
Lead changes get a 4px `--gold-700` dot plus a `--t-cap` label. Both final
scores are printed in display tabular at the right end of their lines. Two
in-figure keys, no floating legend.

**Data.** `match_events` → `sequence_no, event_type, team_side, minute,
minute_provenance, description` (already in `MATCH_EVENTS_SELECT`), plus the
match's final scores. Points per event come from an **era table held in app
code as a constant** (not a schema change):

| Era | Try | Conversion | Penalty | Drop goal | Goal from mark |
|---|---|---|---|---|---|
| **before 1894** | — never charted, see below | | | | |
| 1894–1947 | 3 | 2 | 3 | 4 | 4 |
| 1948–1970 | 3 | 2 | 3 | 3 | 3 |
| 1971–1991 | 4 | 2 | 3 | 3 | 3 (abolished 1977) |
| 1992– | 5 | 2 | 3 | 3 | — |

**Matches before 1894 are never charted, by rule.** The points values moved
three times between 1890 and 1894 (a try was worth 1, then 2, then 3, and the
penalty goal 2 then 3), and which set applied to a given 1891 fixture depends
on the season boundary rather than the calendar year. South Africa's first
three tests sit inside exactly that window — the 30 July 1891 test's 4–0 only
reconciles under the 1890 values, while the 29 August 3–0 only reconciles
under the 1891 penalty value. We are not going to encode a values table we
cannot verify per fixture, and the reconciliation gate below would refuse
these matches anyway (their events have no minutes either). Pre-1894 matches
therefore take the degraded path, which is the honest answer twice over.

**The reconciliation gate (the honesty mechanism).** The figure renders **iff
all three hold**:
1. every scoring event in the match satisfies `isTimed()` (minute non-null
   *and* `minute_provenance === 'present'`, per the existing helper);
2. the cumulative reconstruction's final totals **equal both stored final
   scores exactly**;
3. there is at least one scoring event.

If any fails, the figure is not drawn and one `--t-cap` `--ink-3` line takes
its place, chosen by cause:
- untimed events → *"Scoring times aren't recorded for this match — the
  sequence below is the order the source gives, without clock positions."*
  (D11 + D16 `absent_in_source`);
- reconstruction ≠ final score → *"The recorded scoring events don't add up
  to the final score, so no progression is drawn."* — we show the mismatch
  exists rather than drawing a chart that contradicts the score. This also
  makes the era table self-checking: if a points value is wrong for an era,
  charts silently vanish instead of silently lying, and that is the correct
  failure direction.
- no events → nothing renders; the events list's own D16 state speaks.

**The gate is not a pessimism tax.** D11's 20% timed rate for 1950–1995 means
a minority of older matches *do* qualify, and they are often the best ones:
the 1995 final's Wikipedia article records a minute for all nine scoring
events, they reconcile exactly under the 1992– values (SA 3 penalties +
2 drop goals = 15; NZ 3 penalties + 1 drop goal = 12), and the resulting
chart shows the 9–9 at full time, Mehrtens's extra-time penalty and
Stransky's 92nd-minute drop goal — three lead changes. That match is in the
prototype precisely to prove the gate lets the good ones through.

**Caption (mandatory, D33 + D26 flavour).** *"Built from the N timed scoring
events recorded in the source article; running totals reconcile to the final
score. 3 lead changes."*

**A11y.** The SVG has `role="img"` and an `aria-label` giving the whole story
as a sentence (*"Score progression: South Africa led 3–0 at 4 minutes… final
12–11"*), and — because a sentence is not a data table — the events list
immediately below **is** the accessible tabular equivalent and is never
replaced by the chart. The chart is additive by construction. No hover-only
information: every label the chart carries is printed on it.

### 7.5 Why these four

They answer the four questions a fan actually has next, in the place they
have them: *are we any good right now* (7.1, Home), *were we ever* (7.2,
History), *do we own this lot* (7.3, detail), *how did it actually unfold*
(7.4, detail/timeline). Each is one query or zero, each degrades to something
true, and none of them require a schema change.

---

## 8. Layout, motion, print

- **Mobile-first, one breakpoint.** Base styles target a phone; `min-width:
  720px` adds the ledger density, side-by-side lineups, two-column colophon
  and the four-column era strip (which stacks to 2×2 below 720px, never
  scrolls sideways). No component has more than two states. Nothing on any
  surface scrolls horizontally except the filter-chip strip (J3's explicit
  allowance).
- **Motion is nearly absent** and all of it respects
  `prefers-reduced-motion`: the D16 skeleton shimmer, a 120ms background
  transition on ledger row hover, a 150ms disclosure on the sources-differ
  badge. No page transitions, no chart animation — a record book does not
  animate, and an animated chart delays the fact.
- **Print stylesheet, ~15 lines, because the metaphor demands it**: drop the
  masthead band to plain type, remove the texture overlay, force
  `background: #fff`, keep the ledger rules, expand every link to
  `content: " (" attr(href) ")"` inside the colophon so a printed page still
  carries its attribution (D26 survives printing). A record book you can
  print a page of is the whole joke landing.
- **Forced-colors / high-contrast:** texture off, all semantic colour falls
  back to system colours, W/L/D letters and the chart's dash patterns carry
  the meaning. This is why every colour signal is doubled in §2.5 and §7.4.

---

## 9. Deliberately excluded

Recorded so nobody has to guess whether it was forgotten:

- **Dark mode.** See §10 — one theme, on purpose.
- **`match_events.points_value` column.** It would remove the §7.4 era table.
  Excluded from v2: the reconciliation gate already makes the era table
  self-checking (a wrong value hides the chart rather than lying), a new
  column means a migration plus a backfill decision for ~600 matches' events,
  and rule 1.3 says the simplest thing that works wins. **Flagged on #89 for
  the owner**: if the chart ever needs to render for matches whose events
  don't reconcile, that column is the right fix and needs its own decision
  row.
- **Player pages / opponent pages.** D13 stores players as display strings;
  entity pages need a schema change and a whole new surface. Not v2.
- **Streaks, rolling form beyond 5, biggest-ever wins across all opponents,
  competition-by-competition splits.** All computable, all tempting, all
  scope. The four in §7 were chosen because each maps to a question a journey
  already asks. New aggregates need a D34-style inventory row.
- **Any logo, badge, crest or jersey graphic.** §1.1.
- **Icon set.** Text glyphs already in every system font only (`⚠`, `·`,
  `–`, `●`). No icon font, no SVG sprite: an icon system is a dependency
  with a hundred files.
- **Charting library.** §7.4 is ~40 lines of inline SVG. A library for one
  chart is exactly what rule 1.3 forbids.

## 10. One theme, committed: paper

**The site is light-only.** `color-scheme: light` is declared, and there is no
`prefers-color-scheme: dark` block anywhere in the system.

Why, explicitly: a record book is printed, and the identity in §1 is *made
of* paper — a dark inversion of it is a different product, not a variant. A
second theme also doubles the surface that §2.2's contrast proof has to
cover, and every honesty state, tint, chart series and gold role would need a
second measured pair (that is 59 more pairs to keep true). Rule 1.3 breaks
the tie. Fans reading at night get a warm, low-blue ground rather than a
near-black one, which is a defensible trade rather than an oversight —
`--paper` at #F3EEE2 is deliberately warmer and ~6% darker than white for
exactly that reason.

If the owner wants dark mode, it is a decision row and a task of its own, and
the honest cost is a full second contrast pass.

## 11. How v2 was verified

- **Contrast:** all 59 token pairs in §2.2 computed with the WCAG 2.1
  relative-luminance formula by a throwaway Node script (sRGB linearisation
  then `(L1+0.05)/(L2+0.05)`), authored for this task and run against the
  token table verbatim. Every text pair ≥ 4.5:1; every meaningful non-text
  pair ≥ 3:1; the four sub-3:1 pairs are enumerated in §2.2 with the reason
  each is decorative-only. The script is not committed (it is a one-off
  calculator, not project code); the numbers it produced are in §2.2 so any
  reviewer can re-derive them.
- **Prototype:** `docs/prototype.html` rendered in headless Chrome and
  screenshotted at desktop (1100px), tablet (700px) and phone (520px)
  widths, on every screen (Home, History, all three match details, timeline,
  method). Every JS-generated component appears in the render — the era
  strip, the form guide, both charts and all three progression outcomes —
  which is the practical proof that the script ran without throwing.
  (`--dump-dom` produced no output on this machine; the screenshot path is
  the check that actually worked, and it is a stronger one because it also
  catches layout faults. It caught two: unequal card heights on Home, and
  the History ledger overflowing sideways at phone width — the second was a
  genuine J3 violation and is fixed by the §6/§8 stacked collapse, which the
  prototype now implements rather than merely describing.)
- **Zero external requests:** grepped for `<img>`, `<script src>`, `<link>`,
  `@font-face`, `@import`, `url(`, `fetch(`, `XMLHttpRequest`, `WebSocket`
  and any `http(s)://` outside the outbound attribution anchors. The only
  match is the single inline `<script>` tag. Nothing is fetched to render
  the page.
- **Journeys:** the prototype walks J0–J5 with real 1995/2023/1891 matches
  and the real 2026 fixture list, and renders every honesty state (D16 ×4,
  D8 edge states, D2's four mood states, D14's badge, D26's colophon) so
  sign-off is on the states, not just the happy path.

## 12. Mapping for the build task

| Design section | Files that will change when this is built (NOT in #89) |
|---|---|
| §2–§4 tokens, plates, ledger, texture | `app/src/styles.css` |
| §6 shell, masthead, colophon | `app/src/app/app.html`, `app.css` |
| §5.1 D16 states | `app/src/app/shared/field-value/*` |
| §5.2 sources-differ | `app/src/app/shared/sources-differ-badge/*` |
| §7.1 form guide | `pages/home/*` (+ a shared result-mark partial) |
| §7.2 era strip | `pages/history/*` |
| §7.3 head-to-head | `pages/match-detail/*` (one extra `anon` read) |
| §7.4 score progression | `pages/match-detail/*`, `pages/match-timeline/*`, era-points constant beside `match-detail-models.ts` |
| §6 /method additions | `pages/method/*` |

#89 changes **none** of these. It ships this document, the prototype, and the
D32–D34 decision rows only.
