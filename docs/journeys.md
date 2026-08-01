# User journeys — Springbok Tracking

Status: draft v1 (task #69). Companion to docs/prd.md; each journey names
the PRD decisions it exercises. The persona throughout is "a Boks fan with
a phone" — no accounts, no roles (PRD D18/discovery principle 4).

Every journey states its **beat-Google bar**: the interaction count that
must beat re-Googling (PRD D10 makes these the weekly cold-test checks).

## J1 — "When do the Boks play next?"

The fan opens the site. The next-fixture card is the first thing on Home:
opponent, competition, date, kickoff in SA time, venue. Done.

- Bar: answer visible in ≤2 interactions from landing (D10). Target: 0 —
  it's above the fold.
- Off-season: the card must still be worth arriving at (D8): "No test
  scheduled. Last result: SA 27–13 NZ. Next window: Rugby Championship,
  Aug–Oct." A blank card loses to Google.
- Postponed/TBD: chips, never invented facts (D8, D16).

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
the 90s. `/history` shows the all-time table (D12 set), newest first,
with filters: opponent, competition, era/decade, venue country. Filtered
rows link to detail.

- Bar: any historic game findable in ≤4 interactions (D10): nav → filter →
  (scroll) → row.
- Sparse eras render honestly: an 1896 row may be date/opponent/score only
  — no padded columns (D16, principle 6).
- Footer attribution to the Wikipedia list article (D26).

## J4 — "Tell me everything about this game"

From J2 or J3 the fan lands on `/match/:id`: score and basics at top, then
officials (referee prominent), lineups side by side, scoring events in
match order. Each fact class shows its per-field state when absent: "not
recorded" vs "temporarily unavailable" (D16).

- Bar: this page must aggregate what would otherwise be 2–3 Google hops
  (lineup, ref, scorers) — its existence is the win; no interaction bar
  beyond arriving (≤4 via J3).
- Sources: page footer carries the exact source article link + CC BY-SA +
  modification note (D26). If ingested sources disagree on a fact, the
  precedent value renders with a "sources differ" badge linking both
  (D14) — the disagreement is shown, not hidden.

## J5 — "How did the match feel?" (timeline)

From game detail, one tap to `/match/:id/timeline`: the match-time axis
with scoring/card events plotted, and — where a source exists — the fan
mood curve per bucket (pre, H1, H2, post) with its five-word labels
(D2). The mood layer carries the badge: "Fan mood — computed by this site
from r/rugbyunion match thread", linking method + source thread (D5, D23).

- Modern matches: full curve. Guardian-fallback matches: coarser curve,
  badge says "from news headlines" (D4).
- Older matches: events-only timeline plus "no sentiment sources for this
  era" (D3). The page is still worth opening for the events alone (D7).
- Bar: ≤1 interaction from game detail; the mood layer must never delay
  the events rendering (sentiment loads after events paint).

## J6 — The cold-test journey (operator, weekly)

Michael opens the local site as a fan (no cache, phone viewport): runs J1,
J2, J3 against the D10 bars, spot-checks one sparse-era detail page (J4)
and one timeline (J5) for honesty states, and confirms the footer
attribution renders. Any miss files as a bug-priority board task (D10).

## Journey → decision coverage

| Journey | Exercises |
|---|---|
| J1 | D8, D9, D10, D16 |
| J2 | D8, D10 |
| J3 | D10, D12, D16, D26 |
| J4 | D13, D14, D16, D26 |
| J5 | D2, D3, D4, D5, D7, D23 |
| J6 | D10, D25 |

Decisions not exercised by any journey are back-of-house (ingestion,
keys, budgets: D15, D17–D22, D24, D27) and are tested per D27 instead.
