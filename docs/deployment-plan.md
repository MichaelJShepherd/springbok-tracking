# Deployment plan — Springbok Tracking (#94)

> **Status.** Decided by the owner on 2026-08-02 — see §0. §§1–3 are the
> research and options as originally presented; §4's static-first
> recommendation was **considered and overridden**, and is kept verbatim
> because a decision's rationale is worth nothing without the alternative it
> beat. **§4A is the implementation plan for the architecture actually
> chosen.** Nothing here is implemented and no
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
> revisited *before* any real deployment) — §4A.5 does that (§7 is the rejected option's version), and the plan is not
> executable until that answer is accepted.

## 0. Owner decision (2026-08-02)

Michael read this plan and decided. Four calls, and **the static-first
recommendation in §4 was considered and overridden**:

| # | Decision |
|---|---|
| 1 | **Architecture = Cloudflare Workers + D1** — option **C** in §3, not the recommended option D. Accepted with eyes open: the 5–8 day migration and the loss of Postgres RLS. |
| 2 | **No Supabase at all, anywhere.** Not paid, not free, not private, not as ingestion's datastore. **D1 is the only datastore in the project**, including for ingestion. This goes further than the constraint originally given on #94 ("don't want to pay for more Supabase") and is the clearer rule. |
| 3 | **Cloudflare Pages: yes.** Michael creates the account and issues the API token. |
| 4 | **Both licence calls accepted.** The Wikipedia-derived dataset may be published (draft **D38**, in principle). API-Sports is **dropped permanently** (draft **D39**): the #67 API-Sports key errand is dead, and D9's 🟡 trigger closes by owner decision rather than by a live-fetch test. |

**Why the override is coherent**, stated as the owner's reasoning and not as
a grudging note — three things this plan's §4 under-weighted:

- **One vendor, one bill, one console.** The recommendation shipped a
  *two-vendor* answer (Cloudflare for serving, Supabase for ingestion's
  datastore) and asked the owner to keep an account he had just said he
  wanted less of. Options are not free: every vendor is another set of
  terms, another dashboard, another quota to watch and another thing to
  cancel. Workers + D1 + Pages is one account for the site, the API, the
  database and the CDN. That is a real simplicity argument (rule 1.3),
  applied to *operations* rather than to lines of code — the axis §4 did
  not price.
- **No grey area to live in.** §2.1 could only say that a second free
  Supabase organization is documented but not clearly permitted — an
  Acceptable Use Policy judgement, enforced case-by-case. Building a
  deployment on a permission nobody can point to is a standing risk with no
  owner. D1's free tier needs no interpretation.
- **A real API tier, sized for where the product is going.** Backlog **#96**
  (multi-nation expansion, ~10 nations) explicitly names #94 as its
  prerequisite because it multiplies the data roughly tenfold, and it will
  need per-nation queries rather than one whole-table download. A static
  JSON export is at its best at exactly 570 rows and one team; a query
  endpoint is what survives ~5,700 matches and a nation switcher. Choosing
  the shape that does not have to be re-chosen in three months is
  scalability breaking a near-tie (rule 1.3's second clause), not
  speculative abstraction.

**What the override costs, recorded honestly** so nobody re-discovers it in
Phase B: Postgres RLS goes away, and with it the property that public
read-only access is enforced by the database rather than by code we wrote
(`docs/architecture.md` §3.3). D18's rationale — "by architecture, not
discipline" — is genuinely weakened here, and the mitigation is tests, not
hope: §4A Phase B specifies the Worker's read-only guarantee as executable
checks (GET-only, allow-listed tables, parameterised SQL, no outbound
`fetch`, internal tables unreachable). That mitigation is the price of this
decision, and it is a real one.

Everything below §4A supersedes §5's static-first cron design, which is
retained only as the record of the rejected option.

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
| D15 | API-Sports rows must **never** be mixed into a redistributable export, and v1 offers no bulk download. A world-readable JSON file *is* a bulk download — see §6.3 for the rejected static shape, and draft D39 in §9 for how the owner closed it. |
| D18 | All upstream calls server-side; no key beyond a public anon key ever reaches the browser. |
| D19 | No user request ever triggers an upstream fetch. |
| D20 / #71 | Guardian/Reddit source text lives only in the ingestion process's memory; only derived scores + URLs + dates persist; logs must never contain it. **Must be revisited before any real deployment** — §4A.5 (and §7 for the rejected shape). |
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
| D1 free — re-verified 2026-08-02 for §4A, see §2.3a | 10 databases; 500 MB per database; 5 GB per account; 5M rows read/day; 100k rows written/day | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| KV free | 100k reads/day but only **1,000 writes/day** | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| R2 free | 10 GB-month storage, 1M Class A + 10M Class B ops/month, **zero egress fees on all tiers** | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Pages status | **Not** documented as deprecated; still fully supported. Docs frame Workers as the broader-feature option; claims that Cloudflare now steers new projects away from Pages are community interpretation, **not** a vendor statement | [migrate-from-Pages guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) |
| SPA routing | Workers static assets: `not_found_handling = "single-page-application"` returns 200 + `index.html`. Pages: omit a top-level `404.html` and Pages serves `index.html` for unmatched routes — no `_redirects` needed for basic SPA fallback | [Workers static assets](https://developers.cloudflare.com/workers/static-assets/), [Pages serving](https://developers.cloudflare.com/pages/configuration/serving-pages/) |

### 2.3a D1, re-verified properly (these figures are now load-bearing)

§2.3's D1 row was written when D1 was one option among four and flagged the
pricing and limits pages as inconsistent. With the owner's decision they
decide real design choices, so they were re-verified from the vendor's docs
on **2026-08-02**. The two pages turn out not to contradict each other — each
is simply silent where the other speaks. All figures below are free plan
unless stated.

| Fact | Free | Paid | Source |
|---|---|---|---|
| Databases per account | **10** | 50,000 | [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Max size, single database | **500 MB** | 10 GB (cannot be raised) | [limits](https://developers.cloudflare.com/d1/platform/limits/) — the pricing page states no per-database ceiling at all |
| Storage per account | **5 GB** | 1 TB included, then $0.75/GB-month | [limits](https://developers.cloudflare.com/d1/platform/limits/), [pricing](https://developers.cloudflare.com/d1/platform/pricing/) (these agree) |
| Rows read / written | **5M read/day, 100k written/day** | 25B read + 50M written per month included | [pricing](https://developers.cloudflare.com/d1/platform/pricing/) — the limits page does not mention these at all |
| **How a row read is counted** | **every row scanned, not every row returned** — a full table scan of 5,000 rows reports `rows_read: 5000`, and a `WHERE` on an unindexed column bills everything it examined | same | [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/) |
| Queries per Worker invocation | **50** | 1,000 | [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Bound parameters per query | 100 | 100 | [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Max SQL statement length | 100,000 bytes | same | [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Max columns per table | 100 | same | [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Max query/batch duration; max row size | 30 s; 2 MB | same | [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| **Time Travel** (backup / point-in-time recovery to any minute) | **7 days** | 30 days | [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) |
| Row-level security, roles, per-table grants | **No such concept exists.** D1's own Data Security page covers encryption at rest, TLS, and compliance only — there is no mention of RLS, roles or per-row access control anywhere in the D1 docs. Access control is entirely at the API-token and Worker-binding level | | [D1 data security](https://developers.cloudflare.com/d1/reference/data-security/) |
| Workers Logs | 200,000 events/day, **3-day retention** | 20M/month included, 7-day retention | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |

**What these numbers mean for this project, arithmetic stated so it can be
checked:** the whole dataset is ~570 matches plus detail rows, so the 500 MB
per-database ceiling is not a constraint on the *match* data — only
`source_snapshots` (raw wikitext, unbounded growth) can ever approach it, and
even #96's tenfold multi-nation expansion leaves the match tables trivial.
The read accounting is the figure that actually bites: `/api/matches` scans
all ~570 rows, so 5M row-reads/day divides to roughly **8,700 uncached
History loads per day** before the free allowance is touched — ample, and
Phase B's edge caching makes it ample by a further order of magnitude. Rows
written (100k/day) is far above D24's steady state of a handful of upserts.
Time Travel at **7 days on free** is a real backup story but a short one, and
it is the only one this architecture has.

Bulk loading and out-of-Worker writes, also verified 2026-08-02:

- **`wrangler d1 execute --remote --file=x.sql`** is Cloudflare's documented
  bulk-load path; the file ceiling is 5 GiB and per-statement 100 KB, with
  splitting recommended beyond that. [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- **D1 HTTP query API** exists: `POST /client/v4/accounts/{account_id}/d1/database/{database_id}/query`, Bearer token, plus `/raw`, `/export` and `/import` variants. No D1-specific rate or request-size limit is documented; the general Cloudflare API ceiling of **1,200 requests per 5 minutes per token** applies. [API reference](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/), [API limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/)
- **`wrangler d1 import` does not exist** as a command — bulk loading is `execute --file`.
- **Migrations** are first class: `wrangler d1 migrations create|list|apply`, with applied files tracked in a `d1_migrations` **table inside the database** (name configurable), migration files sequential in a `migrations/` folder. [migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- **Local dev needs no Docker**: `wrangler dev` runs local by default on Miniflare/workerd, local D1 is a real SQLite file on disk, relocatable with `--persist-to`, and seeding is `wrangler d1 execute <DB> --file=./seed.sql --local`. [local dev](https://developers.cloudflare.com/d1/best-practices/local-development/), [local data](https://developers.cloudflare.com/workers/development-testing/local-data/)
- **SPA + API in one Worker**: `assets.not_found_handling = "single-page-application"` gives the SPA fallback, and `assets.run_worker_first` forces the Worker to handle matching paths (e.g. `/api/*`) instead of the asset handler. [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [advanced routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/)

**Still unverified after a genuine attempt** (flagged, not guessed): whether
`wrangler d1 migrations apply` supports `--remote`; the exact current
`run_worker_first` syntax (boolean vs. array of path globs); any maximum
number of statements in a single `d1.batch()`; a maximum table count per D1
database; and whether `wrangler tail` is plan-gated. The local-D1 SQLite file
path (`.wrangler/state/v3/d1/…/db.sqlite`) is corroborated by search but not
quoted from a fetched vendor page.

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
  reimplemented as hand-written scoping in a Worker. Confirmed on re-check
  (§2.3a): D1's own Data Security page covers encryption at rest, TLS and
  compliance and contains no mention of row-level security, roles or
  per-row access control — access control lives at the API-token and
  Worker-binding level, outside the database.

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

> **Settled by §0.** The owner chose Cloudflare, so this comparison is now
> history: GitHub Pages' undocumented `404.html` SPA convention and its
> 100 GB soft cap are **moot**, and Netlify's credit model is moot. The one
> live consequence is that §4A.1 serves the SPA from the **same Worker** that
> serves `/api/*`, which is a shape none of the three columns below
> contemplated — one deployment, one origin, no CORS.

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

## 4. Recommendation (CONSIDERED AND OVERRIDDEN — see §0; §4A is the plan of record)

> Kept verbatim, not edited down. The owner chose option C over this, for the
> reasons in §0; a rejected recommendation still has to be readable, or the
> decision that beat it cannot be judged later.


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

## 4A. Implementation plan — Cloudflare Workers + D1 (the chosen architecture)

This section replaces §4's recommendation as the plan of record. Five phases,
each independently mergeable behind AGENTS.md §3's "keep it small and inert"
rule, and each ending in something verifiable. Total **7–8 days** for one
agent, at the top of the owner-accepted 5–8 day range — the D1 port and the
ingestion write-layer refactor are the two that will not compress.

| Phase | Deliverable | Effort |
|---|---|---|
| A | D1 schema port + local dev story | 1.5 d |
| B | Worker read API (5 endpoints, public read-only, tested) | 1.5 d |
| C | Ingestion write-layer refactor (no `supabase-js` anywhere) | 2 d |
| D | App data-layer swap (`supabase-js` → `fetch`) | 1 d |
| E | Pages + CI + deploy + daily cron | 1.5 d |
| — | Contingency (Phase C's bulk-load path is the likeliest overrun) | 0.5–1 d |

Target end state: one Cloudflare account holding one Worker (serving both
the SPA's static assets and `/api/*`), one D1 database, and one GitHub
repository holding the app, the ingestion scripts, the D1 migrations and
three workflows. No Supabase, no Postgres, no PostgREST, no second vendor.

### Phase A — D1 schema port and local development (1.5 days)

**A.1 The Postgres → SQLite mapping, column class by column class.** These
are the actual constructs in `supabase/migrations/` (three files today:
initial schema, service-role grants, and #79's `fixtures_upstream`
`status`/`source` columns), not a generic list:

| Postgres construct (ours) | Where it appears | D1/SQLite translation | Consequence |
|---|---|---|---|
| `uuid primary key default gen_random_uuid()` | `teams`, `match_officials`, `match_lineups`, `match_events`, `fixtures_upstream`, `sentiment_scores`, `source_snapshots`, `ingestion_runs` | `text primary key`, value generated by the writer (`crypto.randomUUID()`, available in Node and in Workers) | No `pgcrypto`, no server-side default. The writer must always supply the id — a missing id becomes a NOT NULL failure, which is the honest outcome. |
| `text` PK (`matches.match_id`) | `matches` | unchanged | The one table that already had a natural key ports for free. |
| `text[] not null default '{}'` | `teams.aliases` | `text not null default '[]'`, holding a JSON array; read with `JSON.parse`, query with `json_each()` only if ever needed | Nothing queries by alias today — alias resolution happens in ingestion memory in `team-directory.ts` — so this is a storage-format change with no query cost. |
| `numeric(4,3)` + range CHECK | `sentiment_scores.score` | `real` + the same `check (score >= -1 and score <= 1)` | Precision moves from the database to the writer: round to 3 dp before insert. Add a unit test on the rounding, because the CHECK will not catch `0.12345`. |
| `boolean not null default false` | `sentiment_scores.too_few` | `integer not null default 0 check (too_few in (0,1))` | The Worker must map 0/1 back to a JSON boolean so the app's `SentimentScoreRow.too_few: boolean` contract is unchanged. |
| `timestamptz ... default now()` | `created_at`/`fetched_at`/`computed_at`/`started_at`/`finished_at` on nearly every table; `matches.kickoff_time`; `fixtures_upstream.kickoff_time` | `text` holding ISO-8601 UTC, written explicitly by the writer; **not** `CURRENT_TIMESTAMP` as a default | SQLite's `CURRENT_TIMESTAMP` yields `YYYY-MM-DD HH:MM:SS` (space, no `Z`) which is **not** what the app parses today. Writing explicit ISO strings keeps `formatKickoffSAST` and the timeline's bucketing working untouched. This is the single most likely source of a silent bug in the port — pin it with a test per timestamp column. |
| `date` | `matches.match_date`, `fixtures_upstream.match_date` | `text` `YYYY-MM-DD` | No change in practice: the app already treats `match_date` as a string and slices the year off it. |
| `smallint` / `integer` | `sequence`, scores, `minute`, `sequence_no`, run counters | `integer` | Straight through. |
| `check (x in (...))` — 20+ of them, incl. every D16 provenance column | everywhere | **supported, keep verbatim** | D16's four-state provenance model ports unchanged, which is the constraint that mattered most. |
| `references ... on delete cascade` / `on delete set null` | detail tables → `matches`; `source_snapshots` → `matches` | supported, but SQLite enforces FKs only with `PRAGMA foreign_keys = ON`; D1 also offers `PRAGMA defer_foreign_keys` for migration-time reordering | Verify enforcement with a test that deletes a match and asserts children vanish — do not assume it is on. |
| `unique (match_date, opponent_team_id, sequence)`, `unique (match_id, sequence_no)`, `unique (match_id, bucket, source)`, `unique` on `api_sports_fixture_id` | `matches`, `match_events`, `sentiment_scores`, `fixtures_upstream` | supported | These are what make ingestion's upserts idempotent, so they must land before any write path is tested. |
| `on conflict ... do update` (supabase-js `.upsert()`) | every ingestion write | `insert ... on conflict(<cols>) do update set ...` — SQLite supports upsert, but the conflict target must be named explicitly | Phase C's real work. The implicit conflict target `supabase-js` infers has to become an explicit column list at each of the write sites. |
| RLS: `enable row level security`, `for select using (true)` on seven display tables, default-deny on `source_snapshots`/`ingestion_runs`, `GRANT SELECT` to `anon`, full grants to `service_role` | migrations 1 and 2, whole posture | **nothing — no roles, no grants, no policies exist in D1** | The entire access-control layer becomes Worker code. This is the override's cost; Phase B is where it is paid, in tests. |
| `create extension pgcrypto` | migration 1 | delete | Only used for `gen_random_uuid()`. |
| `create index ... (match_date desc)` | `matches` | supported | Keep it: History's default sort and the head-to-head query both lean on it. |

**A.2 Append-only migrations, D1-flavoured.** The repo's convention (schema
changes are new files, never edits) is preserved by using Wrangler's
first-class migrations system — `wrangler d1 migrations create|list|apply`
over a sequential `migrations/` folder, with applied files recorded in a
`d1_migrations` table inside the database itself (§2.3a). That is the same
append-only discipline the Postgres migrations already follow, enforced by
the tool instead of by a comment. Practical rules to write into the migration
directory's own header comment, mirroring the existing one: new file per
change; never edit an applied file; and because SQLite has **no
`ALTER COLUMN`**, a column-type or constraint change is a
create-copy-drop-rename migration written out longhand. The three existing
Postgres migrations collapse into **one** initial D1 migration (the
service-role grants file has no D1 equivalent at all, and #79's added columns
are folded in) — the Postgres migrations stay in the repo, unapplied, until
Phase D lands, then are deleted in one commit with the `supabase/` directory.

**A.3 Local development — what replaces `supabase start`.** `wrangler dev`
runs local by default on Miniflare/workerd, with a **local D1 that is a real
SQLite file on disk** (relocatable via `--persist-to`), and the docs describe
**no Docker requirement anywhere** — so the local loop gets faster and
lighter than today's Docker-based `supabase start`, not heavier. Seeding is a
documented one-liner: `wrangler d1 execute <DB> --file=./seed.sql --local`.
The `npm run db:*` scripts change meaning but keep their names, so
AGENTS.md §7's command vocabulary survives:

| Today | Becomes |
|---|---|
| `npm run db:start` (`supabase start`, Docker, slow first run) | deleted — there is no service to start; `npm run dev:api` (`wrangler dev`) both serves the API and creates the local DB on demand |
| `npm run db:stop` | deleted |
| `npm run db:reset` (re-applies migrations + `seed.sql`) | `npm run db:reset` — drop the local D1 file, apply all migrations locally, then load `seed.sql` (ported to SQLite: the same three documented matches) |
| `npm run app:serve` (`ng serve` → local Supabase) | unchanged, but proxies `/api` to `wrangler dev` |
| local anon key in `app/src/environments/environment.ts` | deleted — there is no key. The environment file carries only the API base URL |

Ingestion's local runs point at the same local D1 (Phase C), so the
end-to-end local loop is: `db:reset` → `ingest:*` → `dev:api` → `app:serve`,
with no container runtime anywhere.

**Phase A is done when:** migrations apply to a fresh local D1 and to the
remote D1; the seed loads; a test deletes a match and its children cascade;
and a test asserts every timestamp column round-trips as parseable ISO-8601.

### Phase B — the Worker read API (1.5 days)

**B.1 Endpoints, derived from the app's actual queries.** Today's thirteen
`supabase-js` calls (enumerated in §1.1) collapse into **five** endpoints.
The collapse is deliberate: Workers bill CPU per invocation and D1 allows
**50 queries per invocation on the free plan** (§2.3a), so page-shaped
endpoints mean one round trip per surface instead of four, with an order of
magnitude of headroom against that ceiling — the busiest endpoint below uses
five queries.

| Endpoint | Replaces | Returns | Notes |
|---|---|---|---|
| `GET /api/home` | `Home`'s 4 calls (`fixtures_upstream` from today; today's unfinished match; latest finished match; last five) | `{ nextFixture, upcomingFixtures, liveMatch, latestResult, formGuide }` | Four D1 queries in one invocation. `?today=` is **not** a parameter — the Worker uses its own clock, so a client cannot ask about another date. |
| `GET /api/matches` | `History`'s 1 call | all matches + opponent name, `match_date` desc | The whole-table read History already does. ~570 rows; gzipped by the platform. |
| `GET /api/match/:id` | `MatchDetail`'s 4 blocking calls **and** `MatchTimeline`'s 3 | `{ match, officials, lineups, events, sentiment }` | One bundle serves both surfaces (D7: events are one dataset with two renderings). 404 when the match does not exist, which `MatchDetail` already models as `not_found`. |
| `GET /api/match/:id/head-to-head` | `MatchDetail`'s deferred 5th call | opponent history rows | Deliberately separate: the app fires this without awaiting it so a slow or failed head-to-head never blocks the page. Keeping it separate preserves that. |
| `GET /api/meta` | — (new) | `{ generated_at, row_counts, last_run: { status, finished_at } }` | The D25/health surface. Reads **three allow-listed columns** of the newest `ingestion_runs` row — never `notes` (which carries the completeness JSON), never a snapshot. |

The joins the app currently gets from PostgREST's embed syntax
(`teams:opponent_team_id(canonical_name)`) become ordinary SQL joins, and the
response field names stay **byte-identical** to today's row shapes
(`match-models.ts`, `match-detail-models.ts`), so Phase D is a transport
change and not a model change. Any renaming here would silently double
Phase D's cost.

**B.2 The read-only guarantee, as code and as tests.** This is what replaces
RLS, and it is the part of the override that must not be waved through:

1. **Method allow-list.** Anything that is not `GET` (or `HEAD`) returns 405
   before routing. The D1 binding is used only through prepared `SELECT`s.
2. **Table allow-list.** A single module holds every SQL string; the seven
   display tables appear in it and `source_snapshots` / `ingestion_runs` do
   not, except `/api/meta`'s three-column read. A test greps the Worker's
   source for `source_snapshots` and for `wikitext` and fails on any hit
   outside that one query.
3. **Parameterised only.** Every path or query parameter goes through D1
   bound parameters; a test asserts no SQL string in the module is built by
   interpolation, and a request with `'; drop table matches; --` as a match
   id returns 404 with the database intact.
4. **D19, structurally.** The Worker makes **no outbound `fetch()` at all**.
   A test asserts the source contains no `fetch(` call to any external host,
   so no user request can ever reach Wikipedia, Reddit or the Guardian —
   D19's guarantee, moved from "the browser has no upstream path" to "the
   only server we run has no upstream path".
5. **No write binding.** The Worker's D1 binding is the same database
   (D1 has no read-only binding mode to lean on), so (1)–(3) are the whole
   defence — which is precisely why they are tests and not comments. Write
   access is by Cloudflare API token, held only by CI (Phase C).
6. **Caching, sized against the read accounting.** D1 bills **rows scanned,
   not rows returned** (§2.3a), so `/api/matches` costs ~570 row-reads every
   time it is served uncached — roughly 8,700 uncached History loads a day
   inside the 5M/day free allowance. That is already ample, and a short
   `Cache-Control` (5–15 minutes) on the data endpoints pushes repeat traffic
   onto Cloudflare's edge instead of D1, since the data only changes once a
   day anyway. `/api/meta` carries `no-store` so a health check never reads a
   cached answer. Also from the read accounting: keep the `match_date` index
   and add one on `matches.opponent_team_id` for the head-to-head query — an
   unindexed `WHERE` bills every row it examines.

Tests run under Vitest with the Workers pool against a local D1, seeded from
`seed.sql` — the same fixtures-only, offline discipline D27 already mandates.

**B.3 One Worker, two jobs.** The same Worker serves the SPA's static assets
and `/api/*`, using the two documented settings from §2.3a:
`assets.not_found_handling = "single-page-application"` so unmatched non-API
paths fall back to `index.html` (Angular's deep links `/history`,
`/match/:id/timeline` keep working), and `assets.run_worker_first` so the
asset handler does not swallow `/api/*` before the Worker sees it. The exact
current `run_worker_first` syntax (boolean vs. array of path globs) is on
§4A.6's verify-first list — get it from the live docs, not from here. This is
one deployment, one domain and therefore **no CORS configuration at all** —
a genuine simplification over today's cross-origin `localhost:4200` →
`localhost:54321` setup.

**Phase B is done when:** all five endpoints return today's row shapes from a
local D1, the six guarantees above have passing tests, and a deep link and
`/api/*` are both served correctly by one `wrangler dev`.

### Phase C — ingestion write layer (2 days)

The largest phase, and the one the owner's "no Supabase anywhere" call
creates. `@supabase/supabase-js` is ingestion's only runtime dependency
today; it goes, and with it `lib/supabase-client.ts`.

**C.1 What actually has to change.** Ingestion's shape is deliberately
narrow: four scripts, one client module, and a guardrail module that reads
and writes `ingestion_runs`. The fetch/parse/normalise libraries — every
`wiki-*`, `rugbybox-parser`, `match-normaliser`, `sentiment-*`,
`team-directory` file — touch no database and must not be edited at all. The
write sites are: `teams`, `matches`, `match_officials` (delete+insert),
`match_lineups`, `match_events`, `fixtures_upstream`, `source_snapshots`,
`ingestion_runs`, plus the guardrail's two reads.

**C.2 How CI writes to D1.** A GitHub Actions runner is not a Worker, so it
needs an out-of-band path. The options, and the recommendation:

- **Cloudflare's D1 HTTP query API** (`POST /client/v4/accounts/{id}/d1/database/{id}/query`, Bearer token) — a plain
  `fetch` from Node, parameterised, no CLI in the loop. **Recommended** for
  the incremental daily writes: it is the closest analogue to what
  `supabase-js` was doing, keeps ingestion a plain Node program, and needs one
  secret. Three verified limits shape the client: no D1-specific rate limit is
  documented, but the **general Cloudflare API ceiling of 1,200 requests per
  5 minutes per token** applies, so writes must be **batched, never
  row-at-a-time**; **100 bound parameters per query** caps how many rows fit
  in one multi-row upsert (a 20-column table ⇒ 5 rows per statement, so chunk
  deliberately); and **100 KB per SQL statement** is the other ceiling to
  chunk against.
- **`wrangler d1 execute --remote --file=x.sql`** — Cloudflare's *documented*
  bulk-load path, and the right tool for the **one-off loads** (initial
  backfill, #85's ~650-page detail crawl), where one statement file beats
  hundreds of HTTP round trips. File ceiling 5 GiB, statement ceiling 100 KB.
  Note there is **no `wrangler d1 import` command** — `execute --file` is the
  mechanism.
- Rejected: a write-capable Worker endpoint. It would put a mutation surface
  on the public internet guarded by a shared secret, which is exactly the
  attack surface Phase B exists to avoid, and it would inherit the Worker CPU
  limit for a job that runs for minutes.

So: a small `lib/d1-client.ts` replaces `lib/supabase-client.ts`, exposing
the handful of operations the scripts actually use (`insertRows`,
`upsertRows` with an explicit conflict target, `deleteWhere`, `queryOne`,
`queryMany`) over the HTTP API, batching statements to stay inside the API's
request-size limits. The scripts change only where they call it; their
control flow, politeness and logging do not move.

**C.3 What must be preserved, explicitly.**

- **Politeness (1.4) is untouched.** `wikipedia-client.ts` is not edited in
  this phase — same serial fetches, same 1.5 s interval, same 5 s/15 s
  back-off honouring `Retry-After`, same honest User-Agent. The only change
  is where the process runs.
- **D17 snapshots survive.** `source_snapshots` is a real table in D1 and
  every fetched page's wikitext is still written there before any
  parse-dependent write, so re-parses stay reproducible and a Wikipedia
  restructure stays diffable. Watch the size budget: this is the one table
  that grows without bound, so Phase C adds a row-count and bytes figure to
  the run summary and a note in the migration header that snapshot pruning
  gets its own decision row if D1's **500 MB per-database** ceiling (§2.3a)
  is ever approached — the match tables never will; wikitext might.
  (This is also the constraint that killed the rejected "repository as the
  database" variant in §3, and it applies just as much here.)
- **D25 guardrail semantics are preserved exactly.** `evaluateGuardrail`'s
  two conditions (zero `matches` rows written; >20-point completeness drop
  against the previous run) are pure functions over numbers and do not change
  at all. Only `getPreviousRun`/`writeIngestionRun` change transport. The
  previous-run completeness snapshot keeps round-tripping as JSON in the
  run row's `notes` column — which is also why `/api/meta` never exposes
  that column.
- **Idempotency.** Every write stays an upsert against the unique
  constraints listed in A.1, so a re-run after a partial failure converges
  instead of duplicating. D1 has no transaction spanning separate HTTP calls,
  so a chunked write that fails halfway leaves partial data — upsert
  idempotency plus the guardrail is the answer, and the run is simply re-run.
  (Time Travel, §2.3a, is the backstop if a run corrupts rather than merely
  half-writes: restore to any minute within **7 days** on the free plan.)

**Phase C is done when:** a full local `ingest:backfill` + `ingest:refresh`
+ `ingest:fixtures` run writes to local D1 with identical row counts to
today's Postgres run, `@supabase/supabase-js` is gone from
`ingestion/package.json`, and the guardrail's zero-rows and
completeness-drop paths both still fail the process with a non-zero exit.

### Phase D — app data layer (1 day)

Replace `SupabaseService` with a `DataService` that does typed `fetch()`
against the five Phase B endpoints. Files touched:
`core/supabase.service.ts` (deleted, replaced), the four page components
(thirteen call sites → five), `shared/testing/supabase-stub.ts` (becomes a
`fetch`/`HttpClient` stub), the four page spec files, and
`app/src/environments/environment*.ts` (one `apiBaseUrl`, no key).

Non-negotiables carried across unchanged, because every one of them is
already tested: each page keeps its `'loading' | 'loaded' | 'error'` state
machine and must still degrade to a visible, honest state rather than throw
or blank (D16); `MatchDetail` keeps `not_found` as a distinct state, now
driven by a 404; the head-to-head strip and the timeline's sentiment layer
stay non-blocking and independently failable; `FieldValue` and every
provenance rendering path are untouched because the row shapes are
identical.

Two by-products worth naming: **`@supabase/supabase-js` leaves the app's
dependency list**, which is the revisit D35 deferred to deployment time; and
**no key or credential of any kind remains in the Angular bundle** — the
production environment file holds a URL, so D18 stops being a property to
re-check at every change.

**Phase D is done when:** `npm test` is green with no Supabase import
anywhere under `app/`, the production build is under D35's 600 kB warning
(measure and record the new figure), and all five surfaces render against
`wrangler dev` + local D1.

### Phase E — Pages, CI, deploy and the daily cron (1.5 days)

**E.1 Hosting shape.** One Worker with static assets serves the SPA and
`/api/*` (B.3), deployed by `wrangler-action` from GitHub Actions. Michael
creates the Cloudflare account and issues a scoped API token; CI holds
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
Custom domain optional and free.

**E.2 `ci.yml` — the lean merge gate.** Triggers on `pull_request` and
`push` to `main`; one job; `paths-ignore` for `docs/**` and `**/*.md` with a
skip-path no-op so branch protection still passes. Steps: install → `npm run
lint` → `npm test` (app + ingestion + Worker, including Phase B's read-only
guarantee tests and the D20 retention suite) → `npm run build` → **one smoke
check**: start the Worker locally against a seeded local D1 and assert `/`
serves the shell, `/history` deep-links (SPA fallback works), and
`/api/matches` returns a non-empty array. That is the minimum that catches
what the local loop structurally cannot: that the built artefact plus the
routing config actually serve. Everything else stays in the local loop per
AGENTS.md §4 — per-PR CI is the largest recurring cost in this model.

**E.3 `deploy.yml` — auto-deploy on merge.** Triggers on `push` to `main`
(docs-only paths excluded) and `workflow_dispatch`. Steps: build the app →
apply any pending D1 migrations to the remote database → deploy the Worker →
**health check**, four assertions, all plain `curl` + `node -e`:

1. `GET /` ⇒ 200 and the HTML contains the app root element.
2. `GET /history` ⇒ 200 (SPA fallback intact).
3. `GET /api/meta` ⇒ 200, valid JSON, `generated_at` parseable, `matches`
   count > 0.
4. `GET /api/matches` ⇒ 200 and a non-empty array.

Migrations run **before** the Worker deploy and are append-only and
forward-only, so a rollback of code never needs a rollback of schema — the
practical rule that follows is that a migration must never break the
previous Worker version's queries (additive columns only, or a two-step
deploy).

**E.4 Rollback.** App or API regression: revert the commit on `main` and let
auto-deploy run (trunk-based, forward-fix first); if the deploy itself is
broken, redeploy the previous build — Wrangler keeps prior Worker versions
and can roll back to one. Data regression: re-run the ingestion workflow
(every write is an idempotent upsert), and if the data itself is corrupt,
**D1 Time Travel** restores the database to any minute within the last
**7 days** on the free plan (30 on paid) via `wrangler d1 time-travel
restore --timestamp=…`. Two caveats to state plainly rather than discover:
the restore is destructive and overwrites in place, and **7 days is the
entire backup horizon** — a corruption noticed on the eighth day is
unrecoverable except by re-running ingestion from source, which is why D17's
snapshots and the ability to rebuild from scratch remain load-bearing.

**E.5 `ingest.yml` — the daily cron.** Schedule and budget are unchanged
from §5, which the owner's decision does not touch: one daily run at
**20:00 UTC** (`ingest:fixtures` + a windowed `ingest:refresh`), inside
D24's ≤10 Wikipedia fetches/day steady state; `ingest:backfill` and #85's
~650-fetch detail crawl are `workflow_dispatch`-only; `ingest:sentiment` is
**not scheduled** until #88 restores its D25 guardrail. `concurrency: {group:
ingest, cancel-in-progress: false}` so a delayed run can never overlap the
next and double the request rate. Secrets: `CLOUDFLARE_API_TOKEN` (D1 write
scope) and `CLOUDFLARE_ACCOUNT_ID`; **no `API_SPORTS_KEY` ever** (D39);
`REDDIT_*`/`GUARDIAN_API_KEY` only after #88 and §4A.5's gates.

**D25 visibility, adapted to a database-backed serving path.** The gating
trick that made this cheap under static serving does **not** transfer: with a
live database, a failed run has already written whatever it wrote before it
failed, and the site serves it immediately. So visibility here rests on four
things, and the last one is new:

1. Non-zero exit from the guardrail ⇒ red workflow run.
2. A `failed` row in `ingestion_runs`, surfaced by `GET /api/meta`.
3. Failure email — with the caveat found in §2.5 and worth repeating: GitHub
   has no dedicated cron-failure feature, and notifications for scheduled
   runs go to **whoever created or last edited the cron line**, so the
   `schedule:` block must be committed by the owner's own account or the mail
   lands nowhere useful. Enable Settings → Notifications → System → Actions,
   "only notify for failed workflow runs".
4. An `if: failure()` step opening or commenting on a single tracking issue.
5. **Because a bad run's rows are already live**, the app must never present
   a thin dataset as complete: `/api/meta`'s last-run status is rendered as a
   visible "data as of / last update failed" line (the honest-degradation
   discipline D16 and D8 already establish). Deciding exactly where that line
   renders is a UI question for the implementation ticket, not a licence to
   hide it.

**When Wikipedia restructures**, the mechanism is unchanged and still works:
completeness drops >20 points against the previous run ⇒ non-zero exit ⇒ red
run, issue, `failed` in `/api/meta`, and the raw wikitext of the breaking run
is in `source_snapshots` for a diff against the last good snapshot without
re-fetching anything.

### 4A.5 — #71 / D20 retention, under Workers + D1

The answer is the same in substance as §7's and needs three edits for this
architecture. Ingestion still runs on an ephemeral GitHub-hosted runner, so
the core claim is unchanged and stronger than a laptop: Guardian article and
headline text and Reddit comment bodies are fetched, scored and discarded
inside one job, never written to disk, never cached, never passed to a
subprocess, and the host is destroyed with the run. What changes:

1. **"Never in D1" is now an explicit invariant, not a side effect.** There
   is no column for a comment body, headline or standfirst in the ported
   schema, and the retention suite's structural whitelist already asserts
   the exact D20-permitted column set for `sentiment_scores`. Phase A must
   not add a "raw" or "debug" column to any table, and Phase C's
   `d1-client.ts` must never gain a generic "log the payload" helper — the
   static scan in the retention suite is what catches both.
2. **Public logs remain the sharp edge.** This is a public repository, so
   workflow logs are world-readable, and the no-source-text-in-logs rule is
   a disclosure control rather than tidiness. The retention suite
   (`ingestion/src/lib/sentiment-retention.spec.ts`, four independent
   checks) runs as a **blocking gate** both in `ci.yml` on every PR and as
   the **first step of `ingest.yml`**, so a violating `main` cannot fetch
   anything at all. `ingest.yml` uploads **no artefacts of any kind**.
3. **One new surface to check: the Worker.** Workers Logs retain **200,000
   events/day for 3 days on the free plan** (§2.3a) — short, but not zero, so
   they count as a retention surface and #71's answer has to name them. The
   Worker must never log request or response bodies for `/api/*`. The
   exposure is structurally small: the Worker never touches sentiment source
   text at all, only the derived `sentiment_scores` columns B.2's allow-list
   permits. Add the Worker's source directory to the retention suite's glob
   so a future edit there is scanned like every other file, and note that
   Workers Logs are visible to whoever can read the Cloudflare account — not
   the world, unlike the workflow logs in (2).

Sequencing is unchanged: these gates land with Phase E, and the sentiment
cron waits for #88. #71 is answerable now, in this shape, and this section is
the proposed answer.

### 4A.6 — What still needs verifying before Phase A starts

The owner's choice made a pile of D1 figures load-bearing that were merely
interesting when D1 was option C, so they were re-verified: **§2.3a now
carries them all**, including the two that could have invalidated design
choices (the 500 MB per-database ceiling against `source_snapshots`' growth,
and Time Travel's 7-day free retention as the only backup story). §2.3's
earlier "the pages disagree" flag is resolved — the pages are silent in
different places, not contradictory.

What genuinely remains open, all of it small, none of it able to change the
architecture — resolve each from the live docs as the first act of the phase
that needs it, and record the answer on the implementation ticket:

| Open item | Needed by | If it comes back badly |
|---|---|---|
| Does `wrangler d1 migrations apply` support `--remote`? | Phase A / E.3 | Fall back to `wrangler d1 execute --remote --file=<migration>.sql` and track applied files ourselves — annoying, not blocking |
| Exact current `run_worker_first` syntax (boolean vs. array of path globs) | Phase B.3 | Split the SPA and the API into two Workers on one domain; costs a route config, not a redesign |
| Maximum statements per `d1.batch()` (undocumented) | Phase C.2 | Chunk conservatively; the 100-bound-parameter and 100 KB statement ceilings already force chunking |
| Maximum tables per D1 database (not stated anywhere) | Phase A | We need nine; implausible as a constraint |
| Is `wrangler tail` plan-gated? | Phase E debugging | Workers Logs (§2.3a) already cover the need |
| Local D1 SQLite file path — search-corroborated, not quoted from a vendor page | Phase A `db:reset` | Read it off `wrangler dev`'s own output instead of hard-coding it |

Two items from the pre-decision research are now **moot** and should not be
re-investigated: GitHub Pages' undocumented `404.html` SPA-routing
convention, and Netlify's credit model — neither host was chosen. Whether
Workers **cron** invocations draw on the free request allowance stays
unverified but is inconsequential here: one scheduled run a day cannot
threaten a 100,000/day allowance, and in this architecture the cron lives in
GitHub Actions anyway, not in a Worker.

## 5. Ingestion cron design for the REJECTED static option (superseded by §4A Phase E — retained as the record of what was compared)

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

## 6. Pipeline wiring for the REJECTED static option (superseded by §4A Phase E)

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

## 7. #71 / D20 retention for the REJECTED static option (superseded by §4A.5, which carries the answer of record)

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
| 1 | ~~Accept or reject the recommendation~~ — **done, 2026-08-02 (§0)**: architecture, no-Supabase, Cloudflare Pages and both licence calls all decided. What remains is accepting the redrafted rows in §9 (D37–D44) when the implementation ticket lands them in `prd.md`. | Blocks the implementation ticket |
| 2 | **Create the Cloudflare account**, create the Worker/Pages project and the D1 database, and issue a **scoped API token** (Workers + D1 edit for this project only) plus the account ID as repository secrets. Confirmed as his to do (§0 decision 3). | Blocks Phases A, C and E |
| 3 | ~~Create a free Supabase project~~ — **cancelled by §0 decision 2.** No Supabase anywhere. D1 is the only datastore. | — |
| 4 | **Decide on a custom domain** (free on Cloudflare) or accept the `workers.dev` subdomain. If a domain: buy it, point DNS. | Not blocking |
| 5 | **Commit the `schedule:` block himself, or accept that cron-failure email goes to the committing account** — GitHub sends scheduled-run notifications to whoever created or last edited the cron line. Then enable Settings → Notifications → System → Actions, "only notify for failed workflow runs". | Blocks D25 visibility |
| 6 | **Re-enable the ingestion workflow** if the repo goes 60 days without activity and GitHub disables it. Nobody else can. | Recurring |
| 7 | **Re-confirm the AGENTS.md 1.4 posture** at deploy time: the ambiguous-terms "proceed at the owner's risk" stance rests on the project being non-commercial (#64), and a public deployment is the moment to say so out loud. | Blocks first deploy |
| 8 | ~~Confirm API-Sports keys stay unissued~~ — **settled by §0 decision 4**: API-Sports is dropped permanently, so no key is ever requested and #67's API-Sports errand is closed. Still his to confirm: that **Reddit/Guardian keys stay unissued** until #88 and §4A.5's gates are in place. | Not blocking |

## 9. Proposed decision-log rows (drafts — for the owner to accept)

**Still drafts, and still not written into `docs/prd.md`'s table by this
ticket** — even though §0's decisions are made. The implementation ticket
lands the real rows, deliberately: in-flight branches are editing `prd.md`,
and two agents appending to the same table is how a merge conflict eats a
decision. Rows below are redrafted to match §0; numbering starts at D37 to
leave D36 for work in flight, and renumbering on acceptance is expected.

| ID | Draft decision | Draft rationale |
|---|---|---|
| **D37** | **Deployment architecture (owner decision, overriding the plan's recommendation): Cloudflare Workers + D1 + Pages, one vendor, one account.** One Worker serves both the Angular SPA's static assets and a public read-only `/api/*` (five page-shaped endpoints); **D1 is the only datastore in the project, for serving and for ingestion alike**; ingestion runs from GitHub Actions and writes to D1 out-of-band via the D1 HTTP API (incremental) and `wrangler d1 execute --remote --file` (bulk). **Supabase is removed entirely** — from the app, from ingestion, from local development — superseding D21's Supabase clause while leaving D21's Angular-SPA and plain-Node-ingestion clauses intact. `@supabase/supabase-js` is deleted from both `app/` and `ingestion/`, discharging D35's deferred bundle question. Supersedes D22. **Recorded consequence: D1 has no roles, grants or row-level security**, so §3.3's public-read posture becomes Worker code, and D18's "by architecture, not discipline" standard is met instead by executable checks (GET-only, table allow-list, parameterised SQL, no outbound `fetch`, internal tables unreachable) — see §4A Phase B. | Owner decision, 2026-08-02, on #94. The plan recommended a static-first shape (§4); Michael overrode it for three reasons the plan under-weighted: one vendor and one bill is operationally simpler than two even when it is more code (rule 1.3 applied to operations); no reliance on a documented-but-unclear multiple-free-organization allowance; and a real query API is the shape that survives #96's multi-nation expansion, which names #94 as its prerequisite precisely because it multiplies the data tenfold. |
| **D38** | **Publishing the Wikipedia-derived dataset is accepted in principle; the export's shape is deferred.** D15's "no bulk download in v1" is amended: a public, Wikipedia-only dataset export **may** be published, on three standing conditions — (a) an explicit table+column **allow-list**, never `SELECT *`, never `source_snapshots` or `ingestion_runs`; (b) every row Wikipedia-derived and published under CC BY-SA with D26's attribution and "parsed and normalised from wikitext" modification note travelling with the data; (c) no row from any other source present. **No export is built by the deployment work itself** — under D37 the site is served by an API, not by published files, so this row grants permission rather than scheduling a feature. The concrete artefact (endpoint or file, and its licence header) gets its own ticket and its own row if and when it is wanted. | The owner accepted the licence reasoning: the problem D15 was actually protecting against is licence *mixing*, and exporting exactly one licence's rows is a stronger guarantee than having no export feature. Deferring the shape avoids building a bulk download nothing currently needs (1.3), while settling the question that was blocking the architecture. |
| **D39** | **API-Sports is dropped permanently. Wikipedia is the fixtures source, not the fallback.** D9's 🟡 provisional trigger is **closed by owner decision** rather than by its live-fetch pass condition, and D9's ladder inverts for good. No API-Sports key is requested or held: **the #67 client action's API-Sports errand is dead** (its Reddit-OAuth errand survives, gated behind #88). D14's fixtures precedence clause and D28's API-facts carve-out become **dormant** — retained in the log, unused in v1 — and D15's licence-separation requirement for fixtures becomes **moot**, since only one source will ever populate `fixtures_upstream`. The table keeps its `source` and `status` columns: `source` because a dormant decision may be revived, and `status` because **#84** (splitting the Home fixture chip into scheduled/postponed/TBD/cancelled) reads it and is unaffected — those values come from Wikipedia season articles, not from API-Sports. Revisit only if a fixtures requirement appears that Wikipedia demonstrably cannot serve. | D1 already narrowed API-Sports to fixtures alone; #79 shipped a working Wikipedia fixtures path needing no key, no quota and no third-party licence. Keeping a second licensed source alive to fill one card on Home is what 1.3 forbids, and closing the trigger by decision beats leaving a 🟡 row waiting on a key nobody will now request. |
| **D40** | **D20 restated for CI-hosted ingestion.** Source text (Guardian article/headline/standfirst, Reddit comment bodies) is fetched, scored and discarded inside a single ephemeral CI job: never written to disk, never cached, never passed to a subprocess, never printed, and the runner is destroyed with the run. The "24h" figure is retired as a laptop-era artefact. Because this repository is public, **workflow logs are public**, so the no-source-text-in-logs rule is a disclosure control: `sentiment-retention.spec.ts` is a **blocking gate** both on every PR and as the first step of the ingestion workflow, the ingestion workflow uploads **no artefacts of any kind**, and the Worker's source is added to that suite's scan glob. **Source text is never written to D1**: no column for a body, headline or standfirst exists in the ported schema, none may be added, and `sentiment_scores` keeps exactly the D20-permitted column set the retention suite already pins. Workers Logs (200k events/day, 3-day retention on free) are named as a retention surface and must never carry `/api/*` request or response bodies. Closes #71. | #71 asked what replaces "it never leaves the process's memory" when the process runs in CI. Answer: a shorter-lived host than the laptop it replaces, plus automated gates — provided both log surfaces are treated as retention surfaces, the public one (workflow logs) as a disclosure control and the private one (Workers Logs) as a shorter-lived one. |
| **D41** | **Ingestion runs as a GitHub Actions scheduled workflow**, one daily run at 20:00 UTC (`ingest:fixtures` + a windowed `ingest:refresh`) within D24's ≤10 Wikipedia fetches/day steady state; full backfill and the ~650-fetch detail crawl are `workflow_dispatch`-only; `ingest:sentiment` is **not** scheduled until #88 restores its D25 guardrail. Politeness is unchanged (serial, ≥1.5 s, back-off, honest User-Agent) and a single `concurrency` group prevents overlapping runs. Accepted caveats, recorded not waved at: scheduled runs may be delayed or dropped by GitHub, and are auto-disabled after 60 days of repository inactivity. | A cron on a runner that is free for public repositories, with the politeness code unchanged, is the cheapest home that keeps D24's arithmetic true. The caveats are tolerable because a missed run means yesterday's data, not an outage. |
| **D42** | **D25 visibility, with a live database in the serving path.** A failed run surfaces four ways: a non-zero exit ⇒ red workflow run; a `failed` row in `ingestion_runs`; a failure email to the owner (with the caveat that GitHub sends scheduled-run notifications to whoever created or last edited the `schedule:` line, so the owner must commit it); and an auto-opened tracking issue. `GET /api/meta` exposes the last run's status, `generated_at` and row counts — three allow-listed columns, never `notes`. **Because a failed run's rows are already live** (unlike the rejected static shape, where gating the deploy hid them), the app must render the last-run status as a visible "data as of / last update failed" line rather than presenting a thin dataset as complete, per D16/D8's honest-degradation discipline. | The gating trick that made this free under static serving does not transfer to a database-backed path, and pretending otherwise would leave D25 weaker after deployment than before. Naming the UI surface is what keeps "fail visibly" true when the failure is already being served. |
| **D43** | **CI carries a lean merge gate only:** one job — lint, unit tests (app + ingestion + Worker, including Phase B's read-only guarantee tests and the D40 retention suite), production build, and one smoke check that the Worker serves `/`, a deep link, and `/api/matches` against a seeded local D1 — with docs-only paths skipped. The full verification suite stays in the local loop per AGENTS.md §4. Auto-deploy on merge to `main` applies pending D1 migrations, deploys the Worker, then runs a four-assertion health check. **Migrations are forward-only and must never break the previous Worker version's queries** (additive columns, or a two-step deploy), so a code rollback never needs a schema rollback. Rollback: revert on `main` and let auto-deploy run, or redeploy the previous Worker version; data corruption falls back to D1 Time Travel (7 days on free). | Per-PR CI is the largest recurring cost in an agent-driven repo, and every job added multiplies by the PR count. The gate's job is to catch what the local loop structurally cannot: that the deployed artefact actually serves both the SPA and the API. The migration rule is what makes a one-command rollback honest. |
| **D44** | **Hosting: one Cloudflare Worker serves both the SPA (static assets) and `/api/*`**, deployed from GitHub Actions via `wrangler-action`. SPA deep links via `assets.not_found_handling = "single-page-application"`; `/api/*` reaches the Worker via `assets.run_worker_first`. Static asset requests are free and uncharged on every Cloudflare plan. One origin means **no CORS configuration at all**, and one deployment means the app and the API can never drift apart in version. GitHub Pages and Netlify are rejected and their trade-offs are moot (§2.6). | Verified 2026-08-02. Two deployments serving one product is an integration surface with no benefit here; collapsing them removes CORS, a second domain, and the possibility of a half-deployed release. |

## 10. Open questions

Questions 1, 2, 3, 5 and 6 of the original list are **answered by §0** — no
Supabase anywhere (so the free-organization grey area is irrelevant),
Cloudflare yes, API-Sports dropped, dataset publishing accepted in principle.
What is still genuinely open:

1. **Custom domain: yes, and which?** Or the platform subdomain for now.
   His call, not blocking.
2. **Sentiment sequencing:** confirm the sentiment cron waits for #88 and
   §4A.5's gates — i.e. that #67's *Reddit* registration is not urgent (its
   API-Sports half is closed by D39).
3. **Non-commercial confirmation** at deploy time (AGENTS.md 1.4 / #64). The
   ambiguous-terms posture that permits the Wikipedia fetching rests on it.
4. **Where the "data as of / last update failed" line renders** (D42). It has
   to render somewhere, because a failed run's rows are live immediately under
   this architecture; which surface is a design question, and the honest
   default is the site footer plus the /method page.
5. **Does he want the 500 MB `source_snapshots` growth watched, or pruned?**
   D17 requires keeping snapshots; D1's free per-database ceiling is 500 MB;
   #85's full 650-page crawl and #96's ten nations both push at it. The plan's
   position is watch first (report bytes on every run), prune only when a real
   limit is approached (1.3) — but a pruning policy is a decision row, so it
   is flagged rather than assumed.
6. **Accepting a 7-day backup horizon** (D1 Time Travel on free). Corruption
   noticed on day eight means rebuilding from source. The alternative is a
   paid plan, which the plan does not recommend for a rebuildable dataset.

## 11. What this plan deliberately does not include

- Any code, workflow file, migration or config change. This ticket is the
  plan; implementation tickets get cut from §4A's five phases.
- SSR, prerendering or an SEO story (D21 rules SSR out for v1; an SPA with a
  client-rendered shell is what D21 already chose).
- Monitoring, alerting or uptime services beyond the four-assertion health
  check and `/api/meta` — a paid monitor would be infrastructure "for later"
  (1.3). Workers Logs come free with the platform and cover debugging.
- Any multi-nation work (#96). D37 was chosen partly *because* it survives
  that expansion, but nothing in §4A builds for it: the schema stays
  SA-relative and #96 keeps its own discovery pass.
- Staging or preview environments. Trunk-based with a lean gate and a
  one-command rollback is the whole environment topology; a second
  environment would double the deploy surface for a read-only site with no
  writes to protect.
- Any estimate of engineering effort beyond §3's table, which is
  deliberately in days-for-one-agent and will be re-estimated on the
  implementation tickets.
