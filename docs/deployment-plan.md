# Deployment plan — Springbok Tracking (#94)

> **Status.** Proposal for the repo owner. Nothing here is implemented and no
> application code changes with this document. Written against `main` at
> commit `57fc028`, read on 2026-08-02. Every price, quota and free-tier rule
> below was checked live on **2026-08-02** against the vendor's own
> documentation and is cited with a URL; free tiers move, so re-verify
> anything older than a few weeks before acting on it. Anything the research
> could not verify from a vendor page is labelled **unverified** rather than
> guessed.
>
> This plan closes PRD **D22** ("deployment explicitly deferred") and makes
> AGENTS.md §3's "every merge to `main` auto-deploys" actually true. It also
> has to answer Backlog **#71**/D20 (retention infrastructure must be
> revisited *before* any real deployment) — §7 does that, and the plan is not
> executable until that answer is accepted.

## 1. What we are deploying, and what the owner asked for

Owner constraints (Michael, 2026-08-02, recorded on #94):

1. The Node ingestion needs a home and must run on **a cron job or similar**.
2. He already has a couple of Supabase projects and **does not want to pay
   for more Supabase** — investigate cheaper/free backends.
3. Produce the **overall deployment plan and pipeline**.

What exists to deploy (AGENTS.md §7, `docs/architecture.md`):

- `app/` — an Angular 20 SPA, **public and read-only**, five routes, no auth,
  no writes, no SSR (D21). Today it reads Postgres through PostgREST with
  `@supabase/supabase-js` and the anon key.
- `ingestion/` — plain TypeScript run by `tsx`, four `npm run ingest:*`
  scripts, writing to Postgres with the service-role key via `supabase-js`.
  `backfill`, `refresh` and `fixtures` do real work today; `sentiment` is
  live-but-disabled pending keys and #88.
- `supabase/` — two append-only migrations, nine tables, RLS + grants.

### 1.1 The read surface the app actually needs

This matters more than any vendor comparison, because it decides how much a
migration costs. Every read in the app is one of thirteen calls across four
components (`app/src/app/pages/{home,history,match-detail,match-timeline}`),
all of them anonymous, all of them the same shape every time:

| Component | Calls | What it needs |
|---|---|---|
| `Home` | 4 | upcoming `fixtures_upstream` rows; today's unfinished match; latest finished match; last five matches |
| `History` | 1 | **all** `matches` rows joined to opponent name, newest first (then every filter and the era figure is computed client-side over that array) |
| `MatchDetail` | 5 | one match; its officials, lineups, events; plus all matches against that one opponent (head-to-head) |
| `MatchTimeline` | 3 | one match; its events; its `sentiment_scores` |

There is no query in the app that depends on the *database* being a
database: no pagination, no server-side filtering, no aggregation, no
search, no writes. `History` already loads all ~570 rows and filters in the
browser (`history.ts`), and D33/D34's four data components were deliberately
specified as arithmetic over rows the page already has. The entire read
surface is satisfied by **three static JSON shapes**: the match list, the
fixture list, and one per-match detail bundle. That is the single most
important fact in this document.

### 1.2 Binding constraints any option must satisfy

| Constraint | What it forbids or requires |
|---|---|
| AGENTS.md 1.3 | Simplicity first. The winner is the one that is easiest to read and delete, not the most capable. |
| AGENTS.md 1.4 | Politeness unchanged by deployment: serial fetches, ≥1.5s interval, honest User-Agent, back-off on 429 (`wikipedia-client.ts`). A move to CI must not multiply fetch volume. |
| AGENTS.md §3 | `main` must always be deployable; merge to `main` auto-deploys. |
| D15 | API-Sports rows must **never** be mixed into a redistributable export, and v1 offers no bulk download. A world-readable JSON file *is* a bulk download — see §6.3. |
| D18 | All upstream calls server-side; no key beyond a public anon key ever reaches the browser. |
| D19 | No user request ever triggers an upstream fetch. |
| D20 / #71 | Guardian/Reddit source text lives only in the ingestion process's memory; only derived scores + URLs + dates persist; logs must never contain it. **Must be revisited before any real deployment** — §7. |
| D24 | Budget math: one-off backfill ≈650 Wikipedia fetches; steady state ≤10 Wikipedia fetches/day, 1–2 API-Sports calls/day, match-day Reddit reads. |
| D25 | A failed ingestion run must fail **visibly** — non-zero exit, red `ingestion_runs` row, never silently thin data. |
| D26 | Attribution (Wikipedia source article + CC BY-SA + "modified") must survive whatever serving shape is chosen. |

## 2. Verified vendor facts (all checked 2026-08-02)

### 2.1 Supabase

| Fact | Value | Source |
|---|---|---|
| Free active projects | **2 per organization**, aggregated across the org's Owner/Admin members; paused projects don't count | [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) |
| Additional free orgs | Docs explicitly say you can create another Free Plan organization once an org's 2-project quota is used. No ToS clause found either permitting or prohibiting one person running several free orgs — only the general Acceptable Use Policy (last modified 2026-06-01), which allows suspension for suspected abuse. **Treat as a grey area enforced case-by-case, not a black-letter allowance.** | [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [AUP](https://supabase.com/aup) |
| Free limits | 500 MB database, 5 GB egress + 5 GB cached egress, unlimited API requests, 50,000 MAU, **no included backups** | [pricing](https://supabase.com/pricing) |
| Auto-pause | Free projects pause after ~a week without "sufficient user database activity"; warning email ~1 week before; one-click restore with data intact; restorable for **1 year** after pausing | [free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) |
| Pro | **$25/mo per organization** platform fee, plus compute **per project** (from $10/mo Micro, offset by a $10/mo credit included in Pro) | [pricing](https://supabase.com/pricing) |

Project size needed: ~570 matches plus detail rows plus wikitext snapshots —
comfortably inside 500 MB, and egress is irrelevant if the browser never
talks to it.

### 2.2 Neon and other managed Postgres

| Fact | Value | Source |
|---|---|---|
| Neon free storage | 0.5 GB per project; writes fail at the cap | [plans](https://neon.com/docs/introduction/plans) |
| Neon free compute | 100 CU-hours/month per project (raised from 50 in Oct 2025); up to 100 projects; 10 branches | [plans](https://neon.com/docs/introduction/plans) |
| Neon free egress | 5 GB/month; compute suspends on overage until the next cycle | [plans](https://neon.com/docs/introduction/plans) |
| Neon scale-to-zero | Idle timeout **fixed at 5 minutes on Free and cannot be disabled**; Neon says reactivation is "within a few hundred milliseconds" | [scale-to-zero](https://neon.com/docs/introduction/scale-to-zero) |
| Neon Data API | A PostgREST-compatible Data API exists (a Rust re-implementation run as a shared fleet) but is **Beta, not GA**; plan-gating for Free projects not explicitly stated on the page | [Data API](https://neon.com/docs/data-api/overview), [launch post](https://neon.com/blog/a-postgrest-compatible-data-api-now-on-neon) |
| Aiven for PostgreSQL free | 1 GB storage, 1 vCPU, 1 GB RAM, single node, backups included, **no expiry, no card** | [free tier](https://aiven.io/free-tier) |
| Nile free | 1 GB storage, 50M query tokens/mo, **no cold start / never pauses** | [pricing](https://www.thenile.dev/pricing) |
| Render Postgres free | **Expires after 30 days** (cut from 90 in 2024), then a 14-day grace period before deletion | [changelog](https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90) |
| Turso | SQLite/libSQL, not Postgres: 5 GB, 500M row reads/mo, 10M row writes/mo | turso.tech/pricing (secondary-sourced) |
| Xata / Railway / Fly.io | No durable free tier any more (Xata: 14-day credit; Railway: $5 one-off trial; Fly: free tier withdrawn for orgs created after 2024-10-07) | secondary-sourced — re-verify before relying on these |
| Managed PostgREST | **No free managed PostgREST-as-a-service exists.** PostgREST is a binary you host. Cheapest honest path is a free container host (e.g. a Render free web service, which spins down and cold-starts) in front of a free Postgres — two accounts and a cold start, or ~$7/mo to remove the cold start. | research finding, no vendor page to cite for a product that doesn't exist |

The last row is the load-bearing one: **the app's current data layer is
PostgREST**, so "just move to Neon/Aiven" is not a like-for-like swap unless
you either adopt Neon's beta Data API or host PostgREST yourself.

### 2.3 Cloudflare

| Fact | Value | Source |
|---|---|---|
| Workers free | 100,000 requests/day; **10 ms CPU per invocation**; 50 subrequests/request | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Static assets | **Free and unlimited on all plans** — asset requests are not charged and do not count against plan usage; 20,000 files/version (free), 25 MiB/file | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Cron Triggers | Available on free; **max 5 per account** on free; max 15-minute wall clock for a scheduled invocation on both free and paid; the 10 ms CPU cap still applies. Whether cron invocations draw from the 100k/day request pool is **unverified** | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| D1 free | 5M rows read/day, 100k rows written/day, 5 GB storage account-wide, 500 MB per database (the docs' per-DB/DB-count figures are inconsistent between the pricing and limits pages — **re-check before quoting**) | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| KV free | 100k reads/day but only **1,000 writes/day** | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| R2 free | 10 GB-month storage, 1M Class A + 10M Class B ops/month, **zero egress fees on all tiers** | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Pages status | **Not** documented as deprecated; still fully supported. Docs frame Workers as the broader-feature option; claims that Cloudflare now steers new projects away from Pages are community interpretation, **not** a vendor statement | [migrate-from-Pages guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) |
| SPA routing | Workers static assets: `not_found_handling = "single-page-application"` returns 200 + `index.html`. Pages: omit a top-level `404.html` and Pages serves `index.html` for unmatched routes — no `_redirects` needed for basic SPA fallback | [Workers static assets](https://developers.cloudflare.com/workers/static-assets/), [Pages serving](https://developers.cloudflare.com/pages/configuration/serving-pages/) |

### 2.4 Cloudflare D1/SQLite vs this project's Postgres schema

Checked against [D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/):

- `CHECK` constraints: **supported** (so D16's provenance CHECKs survive).
- `ON DELETE CASCADE`: supported via SQLite FK pragmas.
- `DEFAULT CURRENT_TIMESTAMP`: supported.
- `text[]`: **not supported.** `teams.aliases text[]` (D13's name-drift
  absorber) must become a JSON text column or a join table.
- `numeric(4,3)`: **not supported** as a type. `sentiment_scores.score`'s
  precision becomes an application/CHECK concern.
- `ALTER COLUMN`: not supported; schema changes need the
  create-copy-drop-rename dance, which fights the repo's append-only
  migration convention.
- RLS: **architecturally absent** — no roles, no `GRANT`, no `CREATE POLICY`.
  The entire §3.3 posture (anon SELECT on seven display tables,
  default-deny on `source_snapshots`/`ingestion_runs`) has to be
  reimplemented as hand-written scoping in a Worker. Note this is inferred
  from the complete absence of role/policy syntax in the SQL reference,
  not from a quotable "D1 has no RLS" sentence.

### 2.5 GitHub Actions

| Fact | Value | Source |
|---|---|---|
| Cost for public repos | Standard GitHub-hosted runners are **free** in public repositories; larger runners are always billed | [billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions) |
| Job/run limits | 6 hours per job; 35 days per workflow run; 20 concurrent jobs on Free; `GITHUB_TOKEN` 1,000 API req/hour/repo | [actions limits](https://docs.github.com/en/actions/reference/actions-limits) |
| Storage | Free plan shows 500 MB shared with Packages; an explicit "public repos get unlimited artifact storage" statement was **not** found — treat artifacts as a scarce resource | [actions limits](https://docs.github.com/en/actions/reference/actions-limits) |
| Cron minimum | Every 5 minutes | [schedule event](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule) |
| Cron reliability | Docs: the `schedule` event "can be delayed during periods of high loads… some queued jobs may be dropped." A cron is best-effort, not a guarantee | same |
| Cron auto-disable | "In a **public** repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" | same |
| Cron branch/timezone | Only runs if the workflow file is on the **default branch**, against its latest commit; UTC unless an IANA zone is given | same |
| Overlap control | A `concurrency:` group with a fixed name prevents overlapping runs | [concurrency](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) |
| Failure notification | No dedicated "cron failed" feature. It is the general Actions notification setting: Settings → Notifications → System → Actions, with "only notify for failed workflow runs". Notifications for scheduled runs go to whoever **created or last edited the cron line** (or last re-enabled it) | [notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications), [workflow run notifications](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs) |
| Secrets | Repo vs environment secrets; **not** passed to workflows triggered from forked repositories (except `GITHUB_TOKEN`); auto-masked in logs; prefer `pull_request` over `pull_request_target`. That secrets *are* available to `schedule` runs is **unverified by an exact doc sentence** (it follows from `schedule` not being a fork event, and matches universal practice) | [using secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions), [pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target) |
| Supabase in CI | `supabase/setup-cli` is the official action; Docker is preinstalled on `ubuntu-latest`, so `supabase start` works. Startup is **reported** at roughly 2–5 minutes — no official figure exists | [setup-cli](https://github.com/supabase/setup-cli) |
| Deploy actions | `actions/deploy-pages` (+ `actions/upload-pages-artifact`) for GitHub Pages; `cloudflare/wrangler-action` for Workers/Pages; Netlify has no actively-maintained official action | [deploy-pages](https://github.com/marketplace/actions/deploy-github-pages-site), [wrangler-action](https://github.com/cloudflare/wrangler-action), [netlify/actions](https://github.com/netlify/actions) |

### 2.6 App hosting comparison

| | Cloudflare Pages / Workers static assets | GitHub Pages | Netlify Free |
|---|---|---|---|
| Cost | $0 | $0 | $0 |
| Bandwidth | Static asset requests unlimited and uncharged on all plans | 100 GB/month **soft** limit | **300 credits/month, hard cap**, no rollover; bandwidth 20 credits/GB ⇒ ~15 GB/month if nothing else consumes credits |
| Deploys | Direct upload from CI via `wrangler-action`, so Pages build quotas are not consumed | 10 builds/hour soft limit, bypassed when deploying via your own Actions workflow; 10-minute deploy timeout | 15 credits per production deploy (flat), 1 concurrent build |
| SPA deep links | Documented: `not_found_handling = "single-page-application"` (Workers) or omit `404.html` (Pages) | The `404.html` copy-of-index trick — **community convention, not documented by GitHub** | `_redirects` with `/* /index.html 200` |
| Custom domain + HTTPS | Free | Free on all plans incl. Free, Let's Encrypt auto-provisioned | Free |
| Gotchas | Cloudflare account needed | Pages ToS prohibits commercial/e-commerce/SaaS use (fine here — the project is non-commercial per #64, and that is also the basis of the 1.4 posture); publishing from a **private** repo needs Pro | Credit model landed 2025-09-04 and was repriced 2026-04-14; a new signup gets the credit model, not the legacy 100 GB |

**Hosting call: Cloudflare Pages (or Workers static assets — same product
family, same config file), deployed by direct upload from GitHub Actions.**
It is the only one of the three with documented SPA fallback *and* no
metered bandwidth ceiling, and deploying prebuilt output from Actions
sidesteps its own build quotas entirely. GitHub Pages is a perfectly good
fallback if Michael would rather not add a Cloudflare account — the cost is
an undocumented SPA-routing trick and a 100 GB soft cap that this site will
never approach. Netlify is out: a hard 300-credit monthly cap with no
rollover is a worse deal than either alternative for a site with unknown
traffic.

## 3. The four candidate architectures

Common to all four: the app is built by `ng build` and served as static
files from a CDN; ingestion runs on a schedule; nothing is manual.

### A. Keep Supabase, hosted free project, app talks to PostgREST

Exactly today's architecture with the URL changed. A free Supabase project
in a new free organization; `environment.ts` (production) points at it with
its anon key; ingestion runs from GitHub Actions cron with the service-role
key as a repo secret. Zero code change beyond one environment file.

- **Breaks:** nothing structurally. But every visitor's page load now
  depends on a free-tier project that auto-pauses after ~a week of
  insufficient activity, has no backups, and sits in a grey area of the
  Acceptable Use Policy if it lives in a second free org (§2.1). The daily
  ingestion write would in practice keep it awake — that is an inference
  from the pausing docs' "sufficient user database activity", not a
  guarantee. `@supabase/supabase-js` stays in the initial bundle, which
  D35 already names as the bundle-weight driver to revisit at deployment.
- **Failure modes:** project paused ⇒ **site down** (not degraded — the
  whole read path is that project); free-tier terms change ⇒ site down or a
  bill; no backups ⇒ data loss recoverable only by re-running ingestion.

### B. Neon (or Aiven/Nile) + a PostgREST-compatible API

Move Postgres to Neon free, and either adopt Neon's **beta** Data API or
self-host PostgREST on a free container host.

- **Effort:** with the beta Data API, the app keeps a PostgREST-shaped
  client but `supabase-js`'s auth/header conventions and RLS assumptions
  have to be re-established on a different implementation, and the schema's
  RLS policies re-created; with self-hosted PostgREST, add a container host
  and its cold start. Either way the migration is real and the payoff is
  only "same architecture, different logo".
- **Breaks:** RLS/grant posture must be reproved on the new platform; free
  Neon scale-to-zero is fixed at 5 minutes and cannot be disabled, so an
  occasional-traffic site cold-starts constantly (Neon says a few hundred
  ms; unbenchmarked here); the Data API is Beta, and 1.3 says boring
  technology over novel technology.
- **Failure modes:** beta API changes under us; compute-hour or egress
  overage suspends the database ⇒ site down; storage cap ⇒ writes fail.

### C. Cloudflare Workers + D1

Port the schema to SQLite/D1, replace RLS with a read-only Worker API,
serve the SPA from static assets, and either rewrite ingestion as a
Cron-Triggered Worker or keep it in Actions writing over HTTP/wrangler.

- **Effort:** the largest of the four. `text[]` and `numeric(4,3)` must be
  redesigned (§2.4); the append-only migration convention fights SQLite's
  missing `ALTER COLUMN`; the entire RLS/grants posture becomes hand-written
  Worker code, which converts an invariant currently enforced by the
  database into one enforced by discipline — the exact trade D18's rationale
  ("by architecture, not discipline") rejects. Ingestion-as-a-Worker is
  worse still: 10 ms CPU per invocation and a 15-minute wall clock will not
  host a polite, serial, back-off-respecting crawl.
- **Breaks:** RLS; array/numeric columns; the append-only migration rule;
  most of `docs/architecture.md` §3.
- **Failure modes:** a bug in hand-written scoping exposes an internal table
  that RLS currently default-denies; D1 daily write caps during a backfill.

### D. Static-first: no runtime backend at all

The site is public and read-only; the data changes only when ingestion
runs (D19 guarantees that). So publish the data as **static JSON alongside
the app** and delete the runtime data layer entirely. §1.1 shows the whole
read surface reduces to three shapes:

```
/data/meta.json                 generated_at, row counts, last run status
/data/matches.json              all ~570 matches + opponent name (History, Home, head-to-head)
/data/fixtures.json             upcoming fixtures (Home)
/data/match/<match_id>.json     one bundle: match, officials, lineups, events, sentiment
```

`match_id` is already a filesystem- and URL-safe slug
(`YYYY-MM-DD-<slugified-opponent>-<sequence>`, `match-normaliser.ts`), so
the per-match files need no new identifier scheme. Rough sizing:
`matches.json` at ~570 rows × ~20 fields ≈ 200 KB raw, ~30 KB gzipped —
one request, cached, then every filter, era column and head-to-head figure
is the client-side arithmetic D33/D34 already specified. This must be
measured during implementation, not assumed.

The app change is one bounded layer: replace `SupabaseService` with a
`DataService` that does `fetch()` + typed JSON, and rewrite thirteen call
sites across four components plus the four spec files and
`shared/testing/supabase-stub.ts`. `@supabase/supabase-js` leaves the app's
dependency list and the initial bundle, which is the exact revisit D35
asked for. D18 and D19 stop being invariants to defend and become facts:
there is no key and no upstream reachable from the browser at all.

The open question inside D is **where ingestion's state lives**, and it has
two honest variants:

- **D-repo — the repository as the database.** No database anywhere. Each cron run boots
  an ephemeral local Supabase in CI (`supabase/setup-cli` + `supabase
  start`, reported 2–5 min), loads the previously committed JSON back into
  it, ingests, re-exports, commits. **This breaks D17.** `source_snapshots`
  holds raw wikitext per source page precisely so parses stay reproducible
  and a Wikipedia restructure is diffable; with no persistent store you
  either drop it (violating a decision row) or commit megabytes of wikitext
  to a public repo every day. It also needs a JSON→DB importer that is a
  mirror image of the exporter, and it loses D25's previous-run baseline
  unless that is committed too. Rejected on those grounds.
- **D-db — private ingestion database, static public site.** Keep a Postgres
  behind ingestion, but let **nothing public depend on it**. Ingestion runs
  in Actions cron, writes to it exactly as it does locally, then an exporter
  reads it and emits the JSON above; the workflow publishes the JSON with
  the app. Because the browser never touches it, the database's uptime,
  cold starts, pausing behaviour and egress become irrelevant — and the
  cheapest zero-code-change choice for it is a **free Supabase project**,
  since ingestion already speaks `supabase-js`.

### The table

Effort is engineering days for one agent, including tests and the
verification gates.

| | A. Supabase-served | B. Neon + PostgREST-ish | C. Workers + Cloudflare D1 | D-repo. Static, repo-as-DB | **D-db. Static + private ingestion DB** |
|---|---|---|---|---|---|
| **Monthly cost** | $0 (free project) | $0 free, or ~$7/mo to remove a cold start | $0 | $0 | **$0** |
| **Accounts needed** | GitHub, Supabase, host | GitHub, Neon (+container host), host | GitHub, Cloudflare | GitHub, host | GitHub, Supabase (free), host |
| **Migration effort** | 0.5–1 day | 2–3 days + beta risk | 5–8 days | 3–4 days | **2–3 days** |
| **What breaks** | Nothing structurally; bundle keeps `supabase-js` | RLS/grants must be reproved; beta API | RLS gone; `text[]`, `numeric(p,s)`, append-only migrations | **D17 snapshots**; needs a mirror importer; D25 baseline | Fixtures export needs a D15 answer (§6.3); no live/instant data path ever |
| **Ops failure modes** | Free project pauses or terms change ⇒ **site down**; no backups | Cold start on every visit; compute/egress overage suspends DB ⇒ site down | Hand-written scoping bug exposes internal tables; D1 write caps | Docker + `supabase start` in every cron run; daily bot commits of wikitext | Ingestion breaks ⇒ **site keeps serving last good data** (degrades, never dies); cron delayed/dropped by GitHub; cron auto-disabled after 60 days' repo inactivity |
| **Decision rows touched** | D22 | D21, D22 | D18, D19, D21, D22, and `architecture.md` §3 | D15, D17, D20, D22 | D15, D20, D21, D22, D35 |
| **1.3 verdict** | Simplest diff, most fragile result | More work for the same architecture | Most work, least honest invariants | Simple runtime, complicated pipeline | **Simplest thing that stays up** |

## 4. Recommendation

**Adopt D-db: a purely static public site, with a private free Supabase
project used only as ingestion's datastore.**

The rationale is rule 1.3 read literally — "prefer the simplest thing that
works… if two designs work, pick the one that is easier to read and
delete". The simplest thing that works here is *no runtime backend*, and we
can have it because D19 already forbids the only feature that would need
one. Concretely:

1. **It deletes a tier instead of moving it.** Options A, B and C all keep a
   request-time database in the critical path of a site whose data changes
   a few times a day. D-db removes PostgREST, RLS, the anon key, the CORS
   surface, the client library and the "is the project awake?" question from
   the public path. There is strictly less to read, less to configure and
   less to break.
2. **It converts our two hardest invariants into facts.** D18 (no keys
   client-side) and D19 (no user-triggered upstream fetch) are today
   properties we assert and re-check; with a static site there is no
   credential and no reachable upstream to assert anything about. That is
   the "by architecture, not by discipline" standard D18's own rationale
   sets.
3. **Its worst day is a stale page, not an outage.** Every other option's
   dominant failure mode takes the site down (paused project, suspended
   compute, blown quota, bad Worker deploy). D-db's dominant failure mode is
   "the last successful export is still being served" — which is also
   exactly what D25 wants: a bad run must not publish thin data.
4. **The verified numbers say $0 with no metered ceiling.** Cloudflare
   charges nothing for static asset requests on any plan and does not count
   them against plan usage; Actions minutes are free on standard runners for
   public repositories. There is no bandwidth cliff, no compute-hour budget
   and no card on file. The Supabase project is free, private, and — unlike
   option A — the site does not care if it pauses.
5. **It pays off a debt we already owe.** D35 recorded that
   `@supabase/supabase-js` in the initial chunk is the real bundle-weight
   driver, to be revisited "at deployment time (D22)". This is deployment
   time, and the recommended option removes the dependency rather than
   re-padding the budget.

The honest costs, stated plainly: one bounded refactor of the app's data
layer (§1.1: one service, four components, thirteen call sites, four spec
files); a new exporter script; and the loss of any path to data that
changes between cron runs — a live-score feature would need a different
architecture, and D8's "match under way — no live coverage here" copy means
v1 explicitly doesn't want one. Sentiment (#88) fits without change: its
output is `sentiment_scores` rows, which the exporter folds into each
per-match bundle exactly like events.

**If Michael refuses even a free, private Supabase project**, the fallback
ladder is: (i) Aiven free Postgres (1 GB, no expiry, no card) plus a
one-file rewrite of `ingestion/src/lib/supabase-client.ts` and its ~13
write call sites onto a plain Postgres driver — roughly +2 days and one
more dependency; or (ii) accept D-repo's repository-as-database and file a decision
row retiring D17's snapshot table. Both are worse; neither is unreasonable.

## 5. Ingestion cron design (for the recommended option)

**Where:** GitHub Actions scheduled workflow, `ingest.yml`, on
`ubuntu-latest`. Free for public repositories on standard runners (§2.5).
Not a Cloudflare Cron Trigger: 10 ms CPU per invocation and a 15-minute
ceiling cannot host a polite serial crawl with 1.5 s spacing and back-off.

**Schedule (D24's budget math, unchanged politeness):**

| Job | Cron (UTC) | Fetches | Why |
|---|---|---|---|
| `ingest:fixtures` + `ingest:refresh --since=<~60 days ago>` | `0 20 * * *` (22:00 SAST) | ≤10 Wikipedia fetches/day, 1–2 API-Sports calls/day once keyed | One run a day, after a typical Springbok kickoff window, so a Saturday result and the next fixture are in by the time anyone looks on Sunday morning. D24's steady-state budget is ≤10 Wikipedia fetches/day; this sits at the budget, not above it. |
| `ingest:backfill` | `workflow_dispatch` only | 1 | The list article is one fetch, but a full re-derive is an owner-initiated act, not a daily one. |
| Full detail crawl (~650 fetches) | `workflow_dispatch` only | ~650, ~16 min at 1.5 s | D24 costs this as a one-off. Serial, inside one job, well under the 6-hour job limit. Never on a schedule. |
| `ingest:sentiment` | **not scheduled until #88 lands** | — | The script currently cannot write a row and has no D25 guardrail (`docs/field-map.md`). Putting it on cron before #88 would schedule a no-op and, worse, schedule a source-text path with no guardrail — see §7. |

Politeness is untouched: the same `wikipedia-client.ts` runs, serially, at
its 1.5 s interval with 5 s/15 s back-off and `Retry-After` respect, sending
the same honest User-Agent. One runner, one process, `concurrency:` group
`ingest` with `cancel-in-progress: false` so a delayed run can never
overlap the next one and double the request rate. Note for the record that
moving ingestion to a shared-cloud IP is a change in *where* Wikipedia sees
us from, not in *how much* we ask for; if Wikipedia starts refusing a CI
egress range, AGENTS.md 1.4 says a block is an answer — the run fails
visibly and we stop, rather than routing around it.

**Secrets.** Repository secrets, referenced only in `ingest.yml`, never in
`ci.yml` (so a fork PR can never see them — and by §2.5 forks don't get
secrets anyway):

| Secret | Needed | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | now | The private ingestion project. `lib/env.ts` already reads `process.env` first and only falls back to a `.env` file, so Actions env vars work with **no code change**. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | now | Deploy only. Scope the token to Pages/Workers edit for this project alone. |
| `API_SPORTS_KEY` | when issued (#79/D9) | Absent ⇒ the fixtures script cleanly falls back to Wikipedia. |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `GUARDIAN_API_KEY` | when issued (#67) | Do **not** add these until #88 and §7's retention gates are in place. Absent ⇒ both sentiment sources stay cleanly OFF, logged, zero network calls. |

**D25 visibility — what a failed run looks like.** Four layers, cheapest
first:

1. The guardrail already sets `process.exitCode = 1` on zero rows written or
   a >20-point completeness drop, and writes `status: 'failed'` to
   `ingestion_runs`. A non-zero exit fails the step and the workflow: a red
   run in the Actions tab.
2. **The export and deploy steps are gated on ingestion success.** A failed
   run publishes nothing, so the last good `/data` stays live. This is the
   single most important line in this section — it makes "fail loudly" and
   "never serve thin data" the same mechanism.
3. Email: Michael enables Settings → Notifications → System → Actions with
   "only notify for failed workflow runs". Caveat from the docs: scheduled
   run notifications go to whoever **created or last edited the cron line**,
   so the `schedule:` block must be committed by the owner's account, or the
   mail lands nowhere useful.
4. An `if: failure()` step that opens (or comments on) a single tracking
   issue titled `ingestion failing` — a red tab nobody visits is not
   visibility. This is the standard community pattern, not a GitHub feature.

`/data/meta.json` carries `generated_at`, per-table row counts and the last
run's status, which is what the deploy health check (§6.2) asserts and what
`/method` can render honestly if we want a public "data as of" line.

**When Wikipedia restructures.** This is the failure D25 exists for, and the
static shape makes it safer, not riskier: the parse yields fewer/blank
fields ⇒ completeness drops >20 points vs the previous `ingestion_runs` row
⇒ non-zero exit ⇒ no export, no deploy, last good data still live, red run,
issue opened. The raw wikitext for the run that broke is in
`source_snapshots` in the private project (D17), so the fix is diffable
against the last good snapshot without re-fetching anything. This is the
reason D-db keeps a real database instead of D-repo's repository-as-database.

**Cron's own failure modes, honestly.** GitHub documents that scheduled
runs can be delayed and that queued jobs may be dropped — a missed day is
expected behaviour, not a bug, and the site simply serves yesterday's data.
Scheduled workflows in a public repo are **automatically disabled after 60
days with no repository activity**; a quiet stretch therefore silently stops
ingestion. Mitigation: the exporter commits `/data` to a dedicated
`site-data` branch on every successful run (§6.1), which is repository
activity, and gives us a free data history to roll back to. If that turns
out not to reset the 60-day clock, the fallback is that the owner re-enables
the workflow — flagged in §8 as something only he can do.

## 6. Pipeline wiring

Three workflows, deliberately small. The governing principle: the full
verification suite lives in the local loop where it is free, and CI carries
only a lean merge gate — per-PR CI at agent volume is the largest recurring
cost in this model, and every job added multiplies by the PR count.

### 6.1 Branches and artefacts

- `main` — trunk. Merging to it auto-deploys the **app** (AGENTS.md §3).
- `site-data` — a data-only branch written by the ingestion workflow
  (never by a human, never merged into `main`). Holds `/data/*.json`. Keeps
  the exported dataset out of `main`'s history, out of the CI merge gate,
  and gives rollback and diffing for free.
- Deploy = the app build output from `main` + the JSON from `site-data`,
  uploaded together to Cloudflare Pages by `wrangler-action`.

### 6.2 The three workflows

**1. `ci.yml` — the merge gate.** Triggers: `pull_request`, plus `push` to
`main`. One job, `ubuntu-latest`, Node with npm cache, `npm run install:all`,
then:

- `npm run lint`
- `npm test` (app + ingestion; includes `sentiment-retention.spec.ts`, which
  §7 makes a required gate)
- `npm run build`
- **one smoke check**: serve `app/dist/app` on a local port, fetch `/` and
  one deep link (`/history`), assert HTTP 200 and that the SPA shell
  rendered — i.e. that the built artefact plus the SPA-fallback config
  actually serve, which is the one thing local `ng serve` does not prove.

Everything else — the full local suite, browser checks, the gate 2/gate 3
reviews of AGENTS.md §4 — stays local and stays the implementing agent's
job. `paths-ignore` for `docs/**` and `**/*.md` so a docs-only PR (like this
one) runs nothing; if a required check is configured, pair it with a
skip-path no-op job so branch protection still passes.

**2. `deploy.yml` — auto-deploy on merge.** Trigger: `push` to `main`
(excluding docs-only paths), plus `workflow_dispatch`, plus
`workflow_call` so the ingestion workflow can invoke it after a data
export. Steps: build the app → check out `site-data` into `dist/data` →
`wrangler-action` upload → **health check**.

Health check, as a plain step that fails the workflow:

1. `GET /` ⇒ 200 and the HTML contains the app root element.
2. `GET /history` (a deep link) ⇒ 200, proving SPA fallback is configured.
3. `GET /data/meta.json` ⇒ 200, valid JSON, `generated_at` present and
   parseable, `matches` count > 0.
4. `GET /data/matches.json` ⇒ 200 and a non-empty array.

Four `curl`s and a `node -e`. No monitoring service, no dependency. If a
deploy is green and these four pass, the site is genuinely up — a static
site has no other state to be wrong about.

**3. `ingest.yml` — the cron.** Trigger: `schedule` (§5) plus
`workflow_dispatch` with inputs for the manual backfill/full-crawl modes.
`concurrency: {group: ingest, cancel-in-progress: false}`. Steps: retention
gate (§7) → ingest → export → commit `/data` to `site-data` **only if the
ingest exited 0 and the export is non-empty** → call `deploy.yml` → the same
health check → `if: failure()` issue. No `upload-artifact` step, ever (§7).

### 6.3 D15 and the exported dataset — the one real problem with D-db

A world-readable `/data/matches.json` is, plainly, a bulk download, and D15
says v1 offers none and that API-Sports rows must never sit in a
redistributable export. Two clean answers exist; the plan proposes the
first:

- **Proposed: the export is Wikipedia-derived only, and says so.** The
  exporter takes an explicit **allow-list of tables and columns** (never
  `SELECT *`), excludes `source_snapshots` and `ingestion_runs` entirely,
  and — critically — filters `fixtures_upstream` to `source = 'wikipedia'`
  rows only, which `ingestion/src/scripts/fixtures.ts` already tags. The
  published dataset is then 100% CC BY-SA material, carries D26's
  attribution in the JSON itself (`meta.json` holds the licence URL, the
  source article URL and the "parsed and normalised from wikitext"
  modification note; each match row keeps its `source_article_url`), and
  no licence mixing can occur. The cost: **API-Sports fixtures can never be
  displayed under this architecture**, which inverts D9's ladder
  permanently — Wikipedia becomes the fixtures source, not the fallback.
  Today that costs nothing: no API-Sports key exists, the Wikipedia
  fixtures path already works (#79), and D1 already cut standings, leaving
  fixtures as API-Sports' only job. It does mean not spending #79's
  remaining lane.
- **Alternative if API-Sports fixtures are wanted:** keep them out of the
  static export and serve *only* fixtures from a tiny runtime endpoint. That
  reintroduces a backend, a key path and an uptime dependency for one card
  on Home. Rejected on 1.3, but recorded so the trade is visible.

D26 survives either way: attribution is rendered by the app from data it
already has (`source_article_url` per match, the list-article URL in
`meta.json`), so the footers specified in D26/D31 need no new plumbing.

### 6.4 Rollback

- **App regression:** trunk-based means forward-fix first — revert the
  commit on `main`, auto-deploy runs again. If the deploy itself is broken,
  Cloudflare Pages keeps prior deployments and a previous one can be
  promoted.
- **Bad data:** revert the offending `site-data` commit and re-run
  `deploy.yml`. The data's whole history is in that branch, diffable row by
  row — a materially better rollback story than "the database is wrong now".
- **Bad ingestion logic:** revert on `main`, then `workflow_dispatch` the
  ingestion run. The private database is rebuildable from scratch by
  re-running backfill, and `source_snapshots` means a re-parse needs no new
  fetches.

## 7. #71 / D20 — the retention answer for this architecture

#71 exists because D20's guarantee is phrased as "source text exists only
inside the ingestion process's memory", and that sentence quietly assumed
the process runs on the owner's laptop. Moving it into CI changes two
things — one for the better, one for the worse — and the plan must be honest
about both.

**Better: the process is now genuinely ephemeral.** A GitHub-hosted runner
is destroyed after the job. Where a laptop accumulates shell history, swap,
editor buffers and stray `.json` scratch files indefinitely, a runner's
entire filesystem ceases to exist minutes after the fetch. "It never leaves
the ingestion process's memory" is a *stronger* claim in CI than locally,
provided nothing is deliberately carried out of the job.

**Worse: everything the job prints is world-readable.** This is a public
repository, so workflow logs are public. D20's "ingestion logs are forbidden
from containing body/headline/comment text" moves from a private tidiness
rule to a public-disclosure rule. That is the one substantive change #71 has
to answer.

**The infra guarantees that replace the in-memory claim:**

1. **The retention suite becomes a blocking gate in two places.**
   `ingestion/src/lib/sentiment-retention.spec.ts` already implements four
   independent checks (behavioural marker test with `console.*` spied;
   structural whitelist asserting the exact D20-permitted column set; a
   glob-wide static scan for logging of `.body`/`.headline`/`.standfirst` or
   `JSON.stringify` of a comment/article collection; and an upsert-site
   guard). It runs (a) in `ci.yml` on every PR, so a violating change cannot
   merge, and (b) as the **first step of `ingest.yml`**, so a violating
   `main` cannot fetch anything at all. A red retention suite means no
   ingestion run happened, not a warning.
2. **Nothing leaves the job except the allow-listed export.** The ingestion
   workflow contains no `actions/upload-artifact` step and no artefact
   upload of any kind — a one-line, reviewable rule — and the exporter emits
   only allow-listed tables and columns (§6.3), so `sentiment_scores`
   contributes exactly D20's permitted fields and a future schema addition
   cannot leak by default. Deny-by-default in the exporter is the mechanism;
   the column whitelist test is the alarm.
3. **The datastore has nowhere to put source text.** No column for a
   comment body, headline or standfirst exists in the schema, and the
   private project holds nothing public depends on. Even a full compromise
   of it yields derived scores, URLs, timestamps and Wikipedia wikitext —
   the last of which is CC BY-SA material anyone can fetch themselves.
4. **Log discipline is enforced, not requested.** No raw HTTP response body
   is ever printed; run summaries print counts and reasons only. The static
   scan in (1) is what makes this checkable rather than aspirational, and it
   is glob-based over `src/lib` and `src/scripts` so new files are covered
   automatically.
5. **Keys arrive last, and only behind the above.** `REDDIT_*` and
   `GUARDIAN_API_KEY` are not added as repository secrets until #88 lands
   the real fetch path *with* D25's guardrail re-added, and until gates
   (1)–(4) are live. Until then both clients stay cleanly OFF, log why, and
   make zero network calls — verified in #78.
6. **Guardian/Reddit text lifetime, restated for CI.** Fetched article and
   comment text is scored in-process and never written to disk, never
   cached to a filesystem HTTP cache, and never passed to a subprocess; the
   process lives for the length of one job step (seconds to minutes) and the
   host is destroyed with the run. D20's clause should be restated in those
   terms — see the proposed decision row D40 — because "24h" was a
   laptop-era figure and CI makes a tighter, checkable promise.

**Recommendation on #71:** it is answerable now, in this shape, and the
answer is items 1–6 — but it must be *implemented* (the two gate wirings,
the exporter allow-list, the no-artifact rule) before the sentiment cron is
switched on. Sequencing: #71's implementation lands with the pipeline
tickets; the sentiment schedule waits for #88.

## 8. Things only Michael can do

None of these can be done by an agent, and three of them block the first
deploy.

| # | Action | Blocking? |
|---|---|---|
| 1 | **Accept or reject the recommendation** and the proposed decision rows in §9, especially D38 (publishing a Wikipedia-only bulk dataset) and D39 (dropping API-Sports fixtures). | Blocks everything |
| 2 | **Create the Cloudflare account** (or say "GitHub Pages instead"), create the Pages project, and issue a scoped API token + account ID as repository secrets. | Blocks deploy |
| 3 | **Create the free Supabase project** for ingestion — in whichever organization he judges appropriate, given §2.1's grey area on multiple free orgs — and add its URL and service-role key as repository secrets. This costs nothing; the request is not for paid Supabase. | Blocks cron |
| 4 | **Decide on a custom domain** (free on both hosts) or accept the platform subdomain. If a domain: buy it, point DNS. | Not blocking |
| 5 | **Commit the `schedule:` block himself, or accept that cron-failure email goes to the committing account** — GitHub sends scheduled-run notifications to whoever created or last edited the cron line. Then enable Settings → Notifications → System → Actions, "only notify for failed workflow runs". | Blocks D25 visibility |
| 6 | **Re-enable the ingestion workflow** if the repo goes 60 days without activity and GitHub disables it. Nobody else can. | Recurring |
| 7 | **Re-confirm the AGENTS.md 1.4 posture** at deploy time: the ambiguous-terms "proceed at the owner's risk" stance rests on the project being non-commercial (#64), and a public deployment is the moment to say so out loud. GitHub Pages' ToS also forbids commercial use, if that host is chosen. | Blocks first deploy |
| 8 | Confirm that **API-Sports and Reddit/Guardian keys stay unissued** for now, or accept §7's sequencing if he wants them sooner. | Not blocking |

## 9. Proposed decision-log rows (drafts — for the owner to accept)

**Not** written into `docs/prd.md`'s table by this ticket; that table is the
owner's to change. Numbering starts at D37 to leave D36 for work in flight;
renumber on acceptance.

| ID | Draft decision | Draft rationale |
|---|---|---|
| **D37** | **Serving shape: the public site is fully static.** The Angular SPA is deployed as static files to a CDN and reads its data from versioned static JSON (`/data/meta.json`, `/data/matches.json`, `/data/fixtures.json`, `/data/match/<match_id>.json`) produced by an ingestion-time exporter. There is **no runtime backend, no database and no API in the public request path**; `@supabase/supabase-js` is removed from the app's dependencies. D21's Supabase stack is retained **on the ingestion side only** (a private, free project no public request touches). D19's "no user request triggers an upstream fetch" and D18's "no keys client-side" become structural facts rather than invariants to police. Supersedes D22. | Rule 1.3: the site is public and read-only and its data changes only when ingestion runs, so a request-time database buys nothing and costs an uptime dependency, a credential surface and a client library. Every alternative's worst day is an outage; this one's worst day is a stale page. Also discharges D35's deferred bundle question by deletion. |
| **D38** | **The exported dataset is a published, Wikipedia-only artefact.** D15's "no bulk download in v1" is amended: the static JSON *is* a bulk download and is accepted as one, on three conditions — (a) the exporter uses an explicit table+column **allow-list**, never `SELECT *`, and never exports `source_snapshots` or `ingestion_runs`; (b) every exported row is Wikipedia-derived, published under CC BY-SA with D26's attribution and modification note carried in `meta.json` and per-row `source_article_url`; (c) no row from any other source is present. | Static serving requires publishing the data; the licence-mixing problem D15 was actually protecting against is solved by exporting one licence's data only, which is a stronger guarantee than "we have no export feature". |
| **D39** | **API-Sports fixtures are dropped from v1; Wikipedia is the fixtures source.** D9's ladder inverts permanently under D37: `fixtures_upstream` keeps its `source` column, only `source = 'wikipedia'` rows are exported, and no API-Sports key is requested. D14's fixtures precedence and D28's API-facts carve-out become dormant (retained in the log; unused in v1). Revisit only if a fixtures requirement appears that Wikipedia demonstrably cannot serve. | D1 already narrowed API-Sports to fixtures only; the Wikipedia fixtures path works today (#79) with no key, no quota and no licence question. Keeping a second licensed source alive to serve one card on Home is what 1.3 forbids. |
| **D40** | **D20 restated for CI-hosted ingestion.** Source text (Guardian article/headline/standfirst, Reddit comment bodies) is fetched, scored and discarded inside a single ephemeral CI job: never written to disk, never cached, never passed to a subprocess, never printed, and the runner is destroyed with the run. The "24h" figure is retired as a laptop-era artefact. Because this repository is public, **workflow logs are public**, so the no-source-text-in-logs rule is a disclosure control: `sentiment-retention.spec.ts` is a **blocking gate** both on every PR and as the first step of the ingestion workflow, the ingestion workflow uploads **no artefacts of any kind**, and the exporter's allow-list is deny-by-default. Closes #71. | #71 asked what replaces "it never leaves the process's memory" when the process runs in CI. Answer: a shorter-lived host plus three automated gates — a stronger guarantee than the laptop it replaces, provided the log surface is treated as published, which it now is. |
| **D41** | **Ingestion runs as a GitHub Actions scheduled workflow**, one daily run at 20:00 UTC (`ingest:fixtures` + a windowed `ingest:refresh`) within D24's ≤10 Wikipedia fetches/day steady state; full backfill and the ~650-fetch detail crawl are `workflow_dispatch`-only; `ingest:sentiment` is **not** scheduled until #88 restores its D25 guardrail. Politeness is unchanged (serial, ≥1.5 s, back-off, honest User-Agent) and a single `concurrency` group prevents overlapping runs. Accepted caveats, recorded not waved at: scheduled runs may be delayed or dropped by GitHub, and are auto-disabled after 60 days of repository inactivity. | A cron on a runner that is free for public repositories, with the politeness code unchanged, is the cheapest home that keeps D24's arithmetic true. The caveats are tolerable because a missed run means yesterday's data, not an outage. |
| **D42** | **D25 visibility is enforced by gating, not by watching.** Export and deploy are conditional on ingestion exiting 0, so a failed guardrail publishes nothing and the last good data stays live; failure additionally surfaces as a red workflow run, a failure email to the owner, and an auto-opened tracking issue. `/data/meta.json` carries `generated_at`, row counts and the last run's status as the publicly checkable health surface. | "Fail loudly" and "never serve silently thin data" become one mechanism instead of two. A red run nobody looks at is not visibility; a gate is. |
| **D43** | **CI carries a lean merge gate only:** one job — lint, unit tests (including the D40 retention suite), production build, and one smoke check that the built artefact serves `/` and a deep link — with docs-only paths skipped. The full verification suite stays in the local loop per AGENTS.md §4, and auto-deploy on merge to `main` plus a four-assertion post-deploy health check complete the pipeline. Rollback: revert on `main` for app changes, revert the data branch and redeploy for data. | Per-PR CI is the largest recurring cost in an agent-driven repo, and every job added multiplies by the PR count. The gate's job is to catch what the local loop structurally cannot: that the built artefact actually serves. |
| **D44** | **Hosting: Cloudflare Pages (static assets), deployed by direct upload from GitHub Actions.** Documented SPA fallback, no metered bandwidth ceiling for static assets on any plan, free custom domain and TLS; deploying prebuilt output from CI bypasses the platform's own build quotas. GitHub Pages is the accepted fallback if a Cloudflare account is unwelcome (cost: an undocumented `404.html` SPA-routing convention and a 100 GB/month soft cap). Netlify is rejected: its free plan is a hard 300-credit monthly cap with no rollover since 2025-09-04, repriced 2026-04-14. | Verified 2026-08-02. The only option of the three with both documented SPA routing and no bandwidth cliff. |

## 10. Open questions only Michael can answer

1. **Is a free, private Supabase project acceptable**, or does "no more
   Supabase" mean none at all — including a free one nothing public touches?
   The answer picks between the recommendation and the Aiven-plus-driver-
   rewrite fallback (+2 days, one more dependency).
2. **Given §2.1's grey area**, is he comfortable putting that project in a
   second free organization, or would he rather it sit in an existing org
   (using one of its two free slots), or on a paid org he already runs
   (~$10/mo compute — the only line item in this whole plan that isn't $0)?
3. **Cloudflare account: yes or no?** If no, GitHub Pages, and we accept the
   undocumented SPA trick.
4. **Custom domain: yes, and which?** Or platform subdomain for now.
5. **D39 — is dropping API-Sports fixtures acceptable?** It is the one
   genuine capability this plan gives up, and #79's remaining lane goes with
   it.
6. **D38 — is publishing the Wikipedia-derived dataset as public JSON
   acceptable?** It is a bulk download, which D15 declined for v1; the
   licence case is clean, but it is his call.
7. **Sentiment sequencing:** confirm the sentiment cron waits for #88 and
   the D40 gates, i.e. that #67's Reddit registration is not urgent.
8. **Non-commercial confirmation** at deploy time (AGENTS.md 1.4 / #64), and
   whether GitHub Pages' no-commercial-use ToS matters if that host is
   chosen.

## 11. What this plan deliberately does not include

- Any code, workflow file, migration or config change. This ticket is the
  plan; implementation tickets get cut after the owner's decision.
- SSR, prerendering or an SEO story (D21 rules SSR out for v1; a static SPA
  with a client-rendered shell is what D21 already chose).
- Monitoring, alerting or uptime services beyond the four-assertion health
  check — a static site's failure surface is small enough that a paid
  monitor would be infrastructure "for later" (1.3).
- Staging or preview environments. Trunk-based with a lean gate and a
  one-command rollback is the whole environment topology; a second
  environment would double the deploy surface for a read-only site with no
  writes to protect.
- Any estimate of engineering effort beyond §3's table, which is
  deliberately in days-for-one-agent and will be re-estimated on the
  implementation tickets.
