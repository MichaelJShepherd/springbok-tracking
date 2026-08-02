# Handover — 2026-08-02

Written at the repo owner's request when he stepped away (task #104). Audience:
Michael picking this back up, or a fresh agent with no memory of the session.

**Read `AGENTS.md` in full before doing anything.** It is the operating manual
and this file deliberately does not repeat its rules (rule 1.6). The two that
bite hardest on resumption: no work without a board task (1.5), and every merge
passes the three gates in section 4 with the outcomes recorded on its task.

## 1. Where main is

`main` is at the merge of task #102 (as-built architecture doc). Working tree
clean, everything pushed, every feature branch merged — nothing is parked
unmerged. Local suites, both green:

- `npm run app:test` → 13 files, **124** tests
- `npm run ingestion:test` → 16 files, **175** tests
- `npm run lint` clean; `ng build` green at ~571 kB initial (budget 600 kB, D35)

The site runs locally only (D22). `npm run db:start` then `npm run app:serve`,
per AGENTS.md §7. Local Supabase holds 570 real matches and 6 real 2026
fixtures. Deployment does not exist yet — see §4.

## 2. What the product does today

Every Springbok test since 1891, browsable and honest about what it doesn't
know. Routes: `/`, `/history`, `/match/:id`, `/match/:id/timeline`,
`/fixture/:id`, `/method`. The design is the signed-off "heritage rugby"
system (D32): paper ground, Springbok green and gold, Georgia-first type with
a sans exception for numeric columns (D36 — Georgia's old-style figures do not
align in a ledger).

Four derived-data components carry mandatory count captions stating their
denominators (D33): last-five form guide, win % by era, head-to-head, and a
score-progression chart that renders **only** when every scoring event is timed
and the era-aware points reconstruction reconciles exactly to the stored final
score. On today's data that gate passes for four matches; everything else says
why it can't chart rather than drawing something wrong. That instinct — refuse
rather than fabricate — is the product, not a detail. `docs/architecture.md` is
current as of this handover and is the best single description of the build.

## 3. Merged and awaiting your acceptance

All of these are on `main` with full gate records on their tasks, sitting in
`in_review` because moving a task to Done is the owner's call (AGENTS.md §2):

| Task | What |
|---|---|
| #87 | Home attribution footer (journeys.md won over design.md; decision D31) |
| #90 | Design v2 implemented across every page + the four data components |
| #92 | Georgia-first type with the numeric-column exception (D36) |
| #93 | `.claude/` fully gitignored — agent worktrees can never be committed |
| #94 | Deployment plan, rewritten around your Cloudflare decision |
| #95 | Clickable fixtures → pre-match detail with head-to-head (D37) |
| #102 | This architecture-doc refresh |

## 4. The one big open thread: deployment

You chose the full Cloudflare stack over the plan's static-first
recommendation: **Pages + Workers + D1, no Supabase anywhere**, API-Sports
dropped permanently, and publishing the Wikipedia-derived data accepted in
principle. `docs/deployment-plan.md` carries the research, the rejected
options (with their real verified costs), your decision in §0, and the phasing.

Five tickets, ~7–8 engineering days, in strict order:

- **#97 Phase A** — port the schema to D1/SQLite; wrangler/Miniflare replaces
  `supabase start`. Highest-risk item in the whole migration, called out in the
  plan: timestamps must become explicit ISO-8601 text, or the app silently
  misparses every date. This ticket also lands the deployment decision rows.
- **#98 Phase B** — the read-only Worker API: 13 PostgREST calls collapse into
  5 endpoints with byte-identical field names. D1 has no RLS at all, so the
  public-read guarantee (D18/D19) has to become executable tests.
- **#99 Phase C** — ingestion writes move to batched D1 calls. Acceptance test
  is the full 570-match backfill completing against real remote D1.
- **#100 Phase D** — the app swaps to `fetch`; `@supabase/supabase-js` leaves
  the bundle.
- **#101 Phase E** — Pages deploy-on-merge, lean CI gate, daily ingestion cron,
  and a "data as of / last update failed" line in the UI. With a live database
  a failed ingestion run's data is already being served, so D25's fail-loudly
  rule needs a visible surface it never needed locally.

Phases A–D need nothing from you. **Phase E needs a Cloudflare account and an
API token as GitHub secrets** — that is the only thing on this project only you
can do.

## 5. Also parked, in rough priority order

- **#103** Home computes "today" in UTC while the fixture page correctly uses
  SA time, so the two can disagree about the same fixture for two hours around
  midnight. Found while verifying the architecture doc. Small, self-contained,
  and the fix pattern already exists in `shared/fixture-id.ts`.
- **#88** Sentiment live paths. The scoring pipeline is built and tested but
  deliberately inert: both source branches refuse to run rather than fire
  requests with invented parameters. Needs your Reddit OAuth and Guardian key
  (#67), then a real match-thread mapping and query builder.
- **#84** Fixture chip split (scheduled/postponed/TBD/cancelled) plus the
  fixture provenance line. Both are buildable now — the columns have existed
  since #79, contrary to some stale comments in the code.
- **#85** Full Wikipedia detail crawl for all 570 matches (today's detail data
  covers a sample; the resolver needs live search to do better).
- **#91** Two pre-existing keyboard-accessibility bugs.
- **#96** The multi-nation epic — Rugby Championship + Six Nations. Captured
  with honest prerequisites: the schema, ingestion, era buckets and even the
  green-and-gold palette are Springboks-relative today, and the hosting
  decision has to survive roughly ten times the data. Needs its own discovery
  pass before any build; #94 is its stated prerequisite.
- **#71/#72** Retention infrastructure revisit and the D12 match-set question.

## 6. Still yours to decide

Parked on their tickets, none urgent: the Cloudflare account and token (#101),
a custom domain, where the "data as of" line renders, whether to watch or prune
snapshot growth against D1's 500 MB per-database ceiling, accepting the free
tier's 7-day backup horizon, and re-confirming the non-commercial posture
(AGENTS.md 1.4) at the moment the site becomes public.

## 7. If you want the next agent to just get on with it

Dispatch **#97** (Phase A). It is unblocked, it is the foundation every other
phase sits on, and its ticket carries the risks worth knowing. Use the worker
prompt template the delivery-process skill provides, one task per branch, and
run all three gates — the review loop caught six blocking defects in the last
two features alone, including a contrast fix that looked correct in source but
never applied because it sat in an encapsulated stylesheet, and a test that
claimed to prove a timezone rule while asserting an outcome both the correct
and the broken implementation agreed on. Neither would have been found by
reading the diff and trusting it.

One process note worth carrying forward: when a review disputes a number, get
it from the tool that owns the number. A reviewer's recount of the ingestion
tests was wrong, the original figure was right, and the correction is in this
repo's history (#102) because the runner was asked rather than argued with.
