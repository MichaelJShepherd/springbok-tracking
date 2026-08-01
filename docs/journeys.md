# User journeys — Springbok Tracking

Status: draft v2 (task #69, gate-review fixes applied). Companion to
docs/prd.md; each journey names the PRD decisions it exercises. The persona
throughout is "a Boks fan with a phone" — no accounts, no roles (discovery
principle 4). All surfaces are mobile-first (PRD §5); journeys note mobile
behaviour only where it differs from desktop.

Journeys J1–J3 state their **beat-Google bar**: the interaction count that
must beat re-Googling (PRD D10 defines exactly these three bars; the weekly
cold test measures them).

## J0 — First visit

A fan lands with zero context. Home must communicate, without scrolling
past the fold: what this site is (every Boks game, past and future), the
two cards (J1/J2), and that facts are sourced (visible attribution footer,
per D26). The /method link in the footer answers "why trust this over
Google" for the curious (PRD §2.5). No onboarding, no tour — the site is
its own explanation or it has failed.

## J1 — "When do the Boks play next?"

The fan opens the site. The next-fixture card is the first thing on Home:
opponent, competition, date, kickoff in SA time, venue. Done.

- Bar: answer visible in ≤2 interactions from landing (D10). Target: 0 —
  it's above the fold.
- Off-season: the card shows "No test scheduled" plus the last result
  (D8, D30 — no predictive "next window" note; an unsourced prediction is
  what this site exists to not do).
- Postponed/TBD: chips, never invented facts (D8).

## J2 — "What happened in the last match?"

Same landing. Latest-result card sits beside the next-fixture card: score,
opponent, competition, date, W/L colouring. Tapping it opens Game detail
(J4).

- Bar: result visible in ≤2 interactions (D10). Target: 0.
- Match-day: "Match under way — no live coverage here; result appears
  after full time" (D8). The site never pretends to be a live tracker
  (discovery principle 3).

## J3 — "Find that game" (history browse)

The fan wants the 1995 World Cup final, or every game against France in
the 90s. `/history` shows the all-time table (D12 set), newest first (§2
default), with filters: opponent, competition, era/decade. Filtered rows
link to detail.

- Bar: any historic game findable in ≤4 interactions (D10): nav → filter →
  (scroll) → row.
- Mobile: the table collapses to stacked result rows (date, opponent,
  score, W/L colour) — filters become a sheet; nothing scrolls sideways.
- Sparse eras render honestly: an 1896 row may be date/opponent/score only
  — no padded columns (D16, principle 6).
- Footer attribution to the Wikipedia list article (D26).

## J4 — "Tell me everything about this game"

From J2 or J3 the fan lands on `/match/:id`: score and basics at top, then
officials (referee prominent), lineups side by side (stacked on mobile),
scoring events in match order. Each fact class shows its per-field honesty
state when absent (D16), and the fan can tell them apart:

- **"Not recorded"** — an 1896 game whose lineups don't exist in the
  source (absent_in_source).
- **A subtle "history still loading" note** — a match whose detail page
  exists from the backfill's first pass but whose detail fetch hasn't run
  yet (not_yet_fetched).
- **"Temporarily unavailable"** — a field whose last ingestion attempt
  failed (fetch_failed); the fan sees the site knows, rather than a blank.

Bar: this page must aggregate what would otherwise be 2–3 Google hops
(lineup, ref, scorers) — its existence is the win; no interaction bar
beyond arriving (≤4 via J3).

Sources: page footer carries the exact source article link + CC BY-SA +
modification note (D26). If display-cleared sources disagree on a fact,
the precedent value renders with a "sources differ" badge linking both
(D14) — the disagreement is shown, not hidden.

## J5 — "How did the match feel?" (timeline)

From game detail, one tap to `/match/:id/timeline`: the match-time axis
with scoring/card events plotted, and — where a source exists — the fan
mood curve per bucket (pre, H1, H2, post) with its five-word labels
(D2). The mood layer carries the badge: "Fan mood — computed by this site
from r/rugbyunion match thread", linking method + source thread (D5, D23).

- Modern matches: full curve. Guardian-fallback matches: one whole-match
  score, badge says "from news headlines" (D2, D4).
- Thin threads: "too little discussion to score" instead of a number
  (D2's minimum-volume rule).
- Older matches: events-only timeline plus "no sentiment sources for this
  era" (D3). The page is still worth opening for the events alone (D7).
- Reachability and render independence are PRD commitments, not journey
  inventions: one tap from game detail, events never blocked by the mood
  layer (PRD §2.3–2.4).

## J6 — The cold-test journey (operator, weekly)

Michael opens the local site as a fan (no cache, phone viewport): runs J1,
J2, J3 against the D10 bars, spot-checks one sparse-era detail page (J4)
and one timeline (J5) for honesty states, and confirms the footer
attribution renders. Any miss files as a bug-priority board task (D10).

## Journey → decision coverage

| Journey | Exercises |
|---|---|
| J0 | D26, §2.5 (/method) |
| J1 | D8, D10, D30 |
| J2 | D8, D10 |
| J3 | D10, D12, D16, D26 |
| J4 | D14, D16, D26 |
| J5 | D2, D3, D4, D5, D7, D23 |
| J6 | D8, D10, D16, D26 |

Decisions not exercised by any journey are back-of-house (ingestion,
identity, keys, budgets, ops, testing: D1, D6, D9, D11, D13, D15,
D17–D22, D24, D25, D27–D29) and are verified per D27 (tests) or on their
own named triggers instead.
