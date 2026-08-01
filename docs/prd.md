# PRD — Springbok Tracking

Status: draft v1 (task #69, part of #66) — baselined only after external AI
review of this doc and docs/journeys.md, recorded on task #69.
Owner: Michael (repo owner). Product decisions below were taken owner-proxy
under #66's mandate; any row can be overturned by Michael on review.

The thesis, pillars, principles and source verdicts live in
`docs/discovery.md` and are not repeated here. This document decides what
v1 concretely is. **The decision log is the anchor: every material change
lands there first, then cascades.**

## 1. Decision log

Rows D1–D20 answer the 20 "resolve before PRD" gap findings (G-numbers from
discovery v2). Later rows record further material decisions. Status: ✅
decided · 🟡 provisional (named trigger will confirm or overturn).

| ID | Re | Decision | Rationale | Status |
|---|---|---|---|---|
| D1 | G1 | **Standings are OUT of v1.** Not a pillar; the API-Sports "Build" row is narrowed to fixtures + current-era results cross-check only | Simplicity-first; standings only exist part of the year and Google wins there | ✅ |
| D2 | G2 | Sentiment unit = **one score in [-1,+1] + a five-word label per timeline bucket**, per match. Buckets: pre-match / 1st half / 2nd half / post-match, resolution permitting, else one whole-match bucket. Producer = **lexicon-based scoring (AFINN-style + small rugby lexicon)** over r/rugbyunion match-thread comments; no LLM in v1. Accuracy bar: directionally correct (win→net-positive SA sentiment, loss→net-negative) on ≥8 of 10 manually spot-checked matches, checked once at build time and recorded on the task | Cheapest producer that is testable and explainable; LLM adds cost/complexity with no bar to justify it | ✅ |
| D3 | G3 | **Sentiment is explicitly a modern-era feature.** Timeline UI exists for every match; the mood layer renders only where a source exists (Reddit match threads ≈ 2012+, Guardian 1999+). Older matches show events-only with an honest "no sentiment sources for this era" note | Principle 6; pretending 1891 has a mood would be padding | ✅ |
| D4 | G4 | Pillar 4 source ladder: **Reddit Data API (primary) → Guardian headlines (fallback) → events-only timeline (floor)**. The floor is a real, shippable state — pillar 4 does not block v1 launch | Zero unconditionally cleared sources means the pillar must be able to ship without any | ✅ |
| D5 | G5 | New principle carve-out, one class only: **"derived facts"** — values computed by this site (sentiment scores). They are displayed with a distinct "computed" badge, a method link (how it was computed), and a source link (the thread/articles it was computed FROM). Principle 2's "viewable source" = that pair of links. Principle 6 amended: inference is allowed only inside the badged derived-fact class, never in match facts | Bounded exception beats a broken principle | ✅ |
| D6 | G6 | Pillar 4 is justified against simplicity-first by **sequencing**: build order is pillars 1→2→3→4; sentiment is the last slice, behind its own route, and v1 is launchable (locally, per #66) without it | The pillar earns its place by not endangering the other three | ✅ |
| D7 | G7 | In-match events are **one dataset** (owned by pillar 3's game-detail model); pillar 4's timeline is a *view* of that dataset with the mood layer overlaid | One source of truth; two renderings | ✅ |
| D8 | G8 | Empty/edge states specified in §4: off-season (next-fixture card shows "no test scheduled — last result + next likely window"), match-day/in-progress ("match under way — no live coverage here, result after full time"), postponed/venue-TBD (render the fact with a "TBD" chip), result-without-detail (score-only card, honest sparse state) | The bar is beating Google on trust; blank states lose that | ✅ |
| D9 | G9 | Fixtures ingestion targets **API-Sports free tier first; Wikipedia season-article fixtures table is the documented fallback**, switched per-source-outage, not per-request. 🟡 trigger: first live fetch (needs API key, client action) confirms current-season coverage; if absent, fallback becomes primary and D9 is updated | Cheapest path kept, fallback removes the single-point assumption G9 flagged | 🟡 |
| D10 | G10 | The "beat Googling" bar gets a measurable proxy: **top task success in the weekly cold test — next fixture visible in ≤2 interactions from landing, last result in ≤2, any historic game findable in ≤4**. A cold-test week that misses any of these = a bug-priority board task, not a note | Makes the UAT loop falsifiable | ✅ |
| D11 | G11 | 🟡 **Pending #68 coverage sample** (running). Provisional: pillar 3 detail depth is whatever Wikipedia provides per era, rendered through the sparse-state model (D16); TheSportsDB is promoted only if #68 shows <50% lineup coverage for the 1996+ eras | Threshold gives finding G25 its trigger; spend $9/mo only on evidence | 🟡 |
| D12 | G12 | **The match set = the rows of Wikipedia's "List of South Africa rugby union test matches"** (SA's cap-awarded tests as represented there). Non-cap tour games, invitational XVs and the 1986 Cavaliers series are excluded from v1; a decision-log row is required to add any excluded class later | Row membership becomes a recorded decision with a single authority | ✅ |
| D13 | G13 | Identity: internal `match_id = date + opponent + sequence` (same-day disambiguator). **Players and officials are stored as display strings in v1** — no player entities (player pages are out of scope anyway). Wikidata ID mapping is deferred until a feature needs it | Simplest model that serves all four pillars; entities are speculative until player pages exist | ✅ |
| D14 | G14 | Source precedence, per field class: **historical results/detail: Wikipedia > Kaggle (cross-check only) — API-Sports does not serve history. Future fixtures/kickoff: API-Sports > Wikipedia.** When two ingested sources disagree on a fact we store both, display the precedent value, and badge "sources differ" linking both — never silently pick | Principle 2 requires the disagreement be visible, not resolved in the dark | ✅ |
| D15 | G15 | Licence separation: **Wikipedia-derived match data is one dataset, carried and displayed under CC BY-SA with per-page attribution (D26); API-Sports-derived fixture rows live in a separate table and are never mixed into a redistributable export. The site offers no bulk download in v1**, which keeps the share-alike question contained to what pages display | Contains the licence-compatibility problem instead of solving all of copyright | ✅ |
| D16 | G16 | Every nullable fact field carries a provenance state: **`present` / `absent_in_source` / `not_yet_fetched` / `fetch_failed`** — and the UI renders the last three differently ("not recorded", subtle loading-history note, "temporarily unavailable") | D8/principle 6 made honest, mechanically | ✅ |
| D17 | G17 | Wikitext strategy: **one-off backfill into Supabase via ingestion scripts** (Node, run locally), parse-on-request rejected. **Raw wikitext snapshots are stored per source page** (table `source_snapshots`) so parses are reproducible, diffable when Wikipedia restructures, and provenance-complete | The largest unknown gets the safest shape: parse once, keep the receipts | ✅ |
| D18 | G18 | **All upstream calls are server-side** (local Supabase Edge Functions / Node ingestion scripts). Keys live in `.env` (gitignored) / `supabase/.env.local`; the Angular bundle contains no secrets and talks only to the local Supabase URL with the anon key (public-read RLS) | Closes the client-side key path by architecture, not discipline | ✅ |
| D19 | G19 | **Invariant: no user request ever triggers an upstream fetch.** Ingestion runs as explicitly invoked local jobs (npm scripts) in v1; public reads hit Postgres only. There is no "refresh" button wired to upstream | Makes quota exhaustion and 1.4-breach-by-traffic structurally impossible | ✅ |
| D20 | G20 | Guardian 24h retention as an infrastructure invariant: **article text exists only inside the ingestion process's memory**; what is persisted is derived scores + citation metadata (headline, URL, date). Ingestion logs are forbidden from containing body text (lint rule on the ingestion module). No CDN/build-artefact exposure exists locally; this row must be revisited before any real deployment | The clause is explicit; compliance is designed in | ✅ |
| D21 | — | Stack (owner, #66): **Angular 20 SPA + Supabase (local: Postgres, PostgREST, Edge Functions where needed)**. Ingestion: plain **Node/TypeScript scripts** run via npm, writing to Postgres via the service-role key locally. No SSR in v1 | Owner constraint; scripts beat Edge Functions for local-only ingestion simplicity | ✅ |
| D22 | — | Local-only build (#66): "production" for this run = `ng build` output served locally against local Supabase. Deployment pipeline, hosting, CDN and the AGENTS.md §3 auto-deploy wiring are all explicitly out of this run's scope | Owner instruction | ✅ |
| D23 | G21 | Derived-mood labelling (PRD absorbs, decided now): the badge reads **"Fan mood — computed by this site from r/rugbyunion match thread"** (or "from news headlines"); never phrased as the outlet's or Reddit's own view | Misrepresentation risk closed at the copy level | ✅ |
| D24 | G23 | Budget math (recorded): backfill ≈ 572 matches + ~24 season pages + list page ≈ **~650 Wikipedia fetches, serial at ≤1 rps ≈ ~15 min one-off**; steady state ≈ ≤10 Wikipedia fetches/day + 1–2 API-Sports calls/day (cap 100) + match-day Reddit thread reads (≤60 QPM cap, actual ≈ a few dozen requests per match day) + Guardian backfill windowed under 5,000/day. All within free tiers with ≥90% headroom | The arithmetic that G23 demanded, now on record | ✅ |
| D25 | G27/G28 | Ops guardrails in v1 (PRD absorbs, decided now): every ingestion run writes an `ingestion_runs` row (source, pages, rows written, failures); a run with **zero rows written or >20% field-completeness drop vs the previous run fails loudly** (non-zero exit + red row) instead of writing silently thin data | Catches the quiet Wikipedia-restructure failure mode cheaply | ✅ |
| D26 | G26 | Attribution rendering: **every match-detail page footer** carries "Match data adapted from Wikipedia (link to the exact source article), CC BY-SA 4.0 (licence link); modified: parsed and normalised from wikitext". List pages carry one site-footer attribution to the list article. Sentiment cards carry the D5/D23 badge. API-Sports-derived fixture rows carry "Fixtures via API-Sports" | Satisfies BY-SA's attribution+changes requirements concretely | ✅ |
| D27 | G29 | Testing strategy: **recorded fixtures only in tests** — wikitext samples from each era and canned API/Reddit JSON live in the repo as test fixtures; no test ever calls a live API (rate-limit + determinism). Parser regression = golden-file tests per era. Sentiment = unit tests on the lexicon scorer + the D2 spot-check recorded once on the task | Gate 3 gets something real to bite on | ✅ |

## 2. What v1 is (functional scope)

A public, read-only, single-page Angular app with four surfaces:

1. **Home / Fixtures & latest** — next fixture card (SA time), latest
   result card, short list of upcoming fixtures. Edge states per D8.
2. **History** — the all-time results table (D12 set): date, opponent,
   score, W/D/L, venue, competition; filter by opponent/era/competition;
   each row links to game detail. Fast, dense, sortable.
3. **Game detail** — per match: score, venue, competition, date, referee +
   officials, lineups (both sides where present), scoring events timeline.
   Sparse states per D16. Wikipedia attribution footer per D26.
4. **Match timeline (sentiment + events)** — the D7 view: events plotted on
   a match-time axis with the mood curve overlaid per D2/D3, badge per D23.

Out of scope for v1: everything discovery lists, plus standings (D1).

## 3. Architecture (local run, #66)

```
[Node ingestion scripts]──writes──▶[Supabase local: Postgres]
  wikipedia-backfill                     ▲ public read (RLS, anon key)
  wikipedia-refresh                      │
  fixtures-sync (API-Sports→fallback)  [Angular 20 SPA]
  sentiment-ingest (Reddit→Guardian)
```

- Ingestion scripts: TypeScript, `npm run ingest:*`, service-role key from
  local env. Politeness: serial fetches, ≤1 rps, descriptive User-Agent
  `springbok-tracking (github.com/MichaelJShepherd/springbok-tracking)`.
- Postgres schema (initial): `matches`, `match_officials`, `match_lineups`,
  `match_events`, `fixtures_upstream` (API-Sports table, licence-separated
  per D15), `sentiment_scores`, `source_snapshots`, `ingestion_runs`.
  Field-level provenance per D16 on `matches`/detail tables.
- Angular: standalone components, signals; routes `/`, `/history`,
  `/match/:id`, `/match/:id/timeline`. No SSR (D21).

## 4. Edge states (D8, normative)

| Situation | Surface behaviour |
|---|---|
| No scheduled fixture | Next-fixture card: "No test scheduled. Last result: … Next window: (competition calendar note)" |
| Match under way today | Card: "Match under way — no live coverage here; result appears after full time" |
| Fixture postponed / venue TBD | Row renders with "postponed"/"TBD" chip; fact never invented |
| Result known, detail absent | Detail page renders score + "not recorded" rows per D16 states |
| Sentiment source missing for era | Timeline renders events-only + honest note (D3) |
| Upstream broken (fetch_failed) | "Temporarily unavailable" chip; ingestion_runs row red (D25) |

## 5. Non-functional requirements

- **Performance:** history table interactive < 1s on local data (it's a
  few thousand rows — no pagination gymnastics, one indexed query).
- **Compliance invariants:** D18 (no keys client-side), D19 (no
  user-triggered upstream), D20 (Guardian 24h), D26 (attribution), polite
  fetching per AGENTS.md 1.4.
- **Honesty invariants:** D16 states, D23 labelling, principle 6.
- **Testing:** D27; suite runs fully offline.

## 6. Open items feeding this PRD

| Item | Feeds | Carrier |
|---|---|---|
| #68 Wikipedia coverage sample | D11 threshold decision | running |
| #67 browser terms reads + Reddit OAuth registration | D4 ladder rung availability, D9 trigger, D20 clause wording | client action (Michael) |
| Design direction + prototype sign-off | gates feature UI build | next Phase 1 step |
