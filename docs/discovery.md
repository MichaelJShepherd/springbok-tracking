# Discovery — Springbok Tracking

Status: draft v2 (rescoped 2026-08-01; gap review below)
Owner: Michael (repo owner)

> v2 supersedes the original draft: the product vision has expanded from a
> "next fixtures + recent results + standings" page to a full match archive
> with per-game detail and a sentiment + events timeline. Board tasks #64
> (this rescope) and #65 (match-detail source research, full report in its
> comments).

## Thesis

Everything about a Springboks game — what happened, who played, who
refereed, how it felt — is scattered across search results, stats sites and
match threads. This project beats that scavenger hunt with **one place that
holds every Boks game, past and future, in full detail, with the story and
mood around it**.

The bar to beat is **manual web checking**: if the site is not quicker and
more trustworthy than Googling each question separately, it has no reason to
exist.

## Product vision (the four pillars)

1. **Historical results** — a simple view of every Springboks test result,
   all-time (1891 to today): opponent, score, date, venue, competition.
2. **Future fixtures** — a simple view of upcoming games: opponent,
   competition, date, kickoff in SA time, venue.
3. **Game detail** — everything we know about each game: squads/lineups,
   scores, locations, referees, and in-match events (tries, cards,
   substitutions) where a compliant source provides them.
4. **Sentiment + events timeline** — per match, a timeline pairing in-match
   events with the mood around the game. Primary source: r/rugbyunion match
   threads read via the **official Reddit Data API** (free non-commercial
   tier) — reading is allowed by Reddit's terms; the analyse-and-display
   step is ambiguous, and proceeds under the owner's ask-forgiveness
   posture (AGENTS.md 1.4, decided 2026-08-01). Scraping reddit.com —
   with or without a login — remains prohibited (explicit terms +
   circumvention). Fallback: news-derived sentiment from cleared outlets.

Detail density is expected to vary by era: a 2024 test may have full
lineups, events and sentiment; an 1896 test may have only a score and venue.
The design must degrade gracefully rather than pretend uniform depth.

## Design principles

These settle future arguments. In priority order:

1. **Simplicity first, scalability second.** (Repo-wide rule — see
   AGENTS.md 1.3. It governs product scope too: fewer features, done well.)
2. **Nothing is shown without a viewable source.** Every fact links to where
   it came from. If we can't source it, we don't display it. (Two bounded
   carve-outs, defined in PRD D5 and D28: derived facts and API-provided
   facts, each with their own provenance display; no third class without a
   decision row.)
3. **Fresh enough beats real time.** Updated on a schedule that matches fan
   needs (daily is fine; match-day more often). Live in-match updates are
   out of scope unless a compliant source makes them cheap.
4. **Read-only, no accounts.** The public site collects no personal data
   and has no login. This eliminates an entire class of security, privacy
   and abuse problems by construction.
5. **Explicit terms are final; ambiguity is the owner's risk.** An explicit
   prohibition is a no, with no workarounds, and technical controls are
   never circumvented. Where terms are genuinely ambiguous, we proceed
   politely at the owner's accepted risk (AGENTS.md 1.4, non-commercial
   posture, decided 2026-08-01) and stop if the source objects or blocks.
6. **Sparse honestly, never padded.** Where history is thin, say so; never
   infer or fabricate detail to make old games look as rich as new ones.
   (Inference is permitted only inside the badged derived-fact class —
   PRD D5.)

## Scope of the first product

In scope:

- The four pillars above.

Explicitly out of scope for now (revisit only after the above is live):

- Live in-match scores and commentary (events are compiled post-match).
- Aggregated player-level career statistics (per-match lineups are in;
  player pages/stats are not).
- General rugby news aggregation (headlines are consumed only as sentiment
  inputs, not republished as a news feed).
- Notifications / subscriptions of any kind (would require storing user data).
- Other teams or competitions beyond what Springboks games touch.

## Audience and end state

- **Audience:** public users; no login, no tenancy. Single public site.
  The site is **non-commercial** (no ads, no monetisation) — several source
  verdicts below depend on this and must be re-run if it ever changes.
- **End state:** ongoing — the repo owner keeps and evolves it. No handover
  planned, so no ownership-transfer scoping is required.
- Because the audience is public, any future third-party integration that
  distinguishes single-tenant from public multi-tenant must be re-costed at
  that point.

## Data sources and integration economics

Rule: per AGENTS.md 1.4, every source needs its terms of service and
robots.txt read **before the first data fetch**, and the conclusion recorded
here. Explicit prohibitions are final; ambiguous terms mean proceed politely
at the owner's accepted risk (posture decided 2026-08-01, task #64 —
verdicts below labelled "ambiguous — owner's risk" accordingly; rows decided
under the older "ambiguous = prohibited" rule have been re-labelled).

Research provenance: v1 verdicts came from search-engine reads only (direct
fetches were blocked in that session). The v2 rows below come from three
research agents (2026-08-01) that fetched policy/documentation pages
directly where possible; rows marked **[re-verify]** rest on secondary
sources or unfetchable pages and need a direct verbatim read before the
first data fetch. No sports, news or Reddit data was fetched during any
research pass.

### Fixtures, results, standings (current era)

| Source | Access | Cost | Terms verdict | Decision |
|---|---|---|---|---|
| API-Sports Rugby (api-sports.io) | REST/JSON API: games, results, standings. **No lineups, events or referee fields at any tier** (#65) | Free 100 req/day (limited seasons); Pro $19/mo | Allowed with conditions — stay within rate limits; free-plan scope is mutable [re-verify] | **Build — fixtures only** (narrowed by PRD D1: no standings, no results cross-check) |
| TheSportsDB | JSON API; has lineup + event-timeline endpoints | Patreon ~$9/mo (free key is a shared test key; terms bar free keys from powering a live public app) | Allowed with conditions — attribution; paid key for production (#65) | **Defer — runner-up** for detail if Wikipedia coverage proves too thin; coverage depth unconfirmed |
| Sportradar / Stats Perform / Goalserve | Licensed enterprise feeds (full lineups/play-by-play) | ~$550–$10,000+/mo, contact-sales | Allowed but enterprise contracts | **Reject — economically prohibitive** |
| World Rugby / SA Rugby | No public developer API exists (#65) | — | — | **Reject — nothing to integrate** |
| springboks.rugby / sarugby.co.za / world.rugby / supersport.com (scrape) | HTML scraping | Free | **Ambiguous — owner's risk available**, but snippets suggest content-reuse restrictions; verbatim reads pending (#67) | **Not used** — APIs and Wikipedia cover these needs; no reason to spend the risk |
| espn.co.uk / espn.com / ESPN Scrum (scrape) | HTML scraping | Free | **Prohibited (explicit)** — Disney umbrella terms ban robots/spiders/data mining | Not used |

### All-time history + per-match detail (pillars 1 and 3)

| Source | Access | Cost | Terms verdict | Decision |
|---|---|---|---|---|
| Wikipedia (MediaWiki API) | "List of South Africa rugby union test matches" (~572 tests, all-time) as the results backbone; individual match articles for lineups, referee/officials panel, scoring sequences | Free | Allowed with conditions — polite serial reads, descriptive User-Agent, CC BY-SA 4.0: attribution + link to source article + licence link + mark changes; derivative data redistributed under CC BY-SA | **Build — primary source for pillars 1 and 3.** Pre-1950s entries and routine-test articles are sparser; degrade per principle 6. Semi-structured wikitext = real parsing effort |
| Wikidata | SPARQL; team/competition/official entities | Free (CC0) | Allowed | **Defer — ID resolution/enrichment only**; per-match data too sparse |
| Kaggle "International Rugby Union results 1871–2024" | CSV download | Free | **Unverified — owner's risk available**; licence field still needs a read on the dataset page [re-verify #67] | **Defer — cross-check candidate**; confirm licence before shipping data derived from it |
| GitHub open datasets (punkstar/rugby-data-api, transientlunatic/Rugby-Data) | Repo data files | Free | MIT but archived/fixtures-only; no licence stated respectively (#65) | **Reject** |

### Sentiment (pillar 4)

| Source | Access | Cost | Terms verdict | Decision |
|---|---|---|---|---|
| Reddit — scrape reddit.com HTML | Scraping | Free | **Prohibited** — User Agreement bans automated collection without consent; robots.txt disallows all but licensed search crawlers; old.reddit now login-walled | Not used |
| Reddit — scrape via a logged-in account | Scraping behind login | Free | **Prohibited** — same UA clause, plus AGENTS.md 1.4 explicitly forbids circumventing logins. Owner asked 2026-08-01; rejected on both grounds | Not used |
| Reddit — .json endpoints | Unauthenticated JSON | Free | **Prohibited** — deprecated May 2026, returns 403; same UA clause | Not used |
| Reddit — official Data API, free tier | OAuth app, ~100 QPM, non-commercial | Free (registration now via ticket queue — expect lead time) | **Reading** match threads: allowed with conditions. Sentiment inference + displaying derived scores: **ambiguous — proceeds at owner's risk** (2026-08-01). The 2023 clause restricts *training* ML models on content; inference/display has no confirmed carve-out either way | **Build — primary sentiment source.** Non-commercial OAuth app, within QPM limits, honest User-Agent; stop if Reddit objects or revokes. Derived scores only on the site — no republishing of comment text |
| Reddit — commercial API tier | Paid contract | ~$0.24/1k calls, ~$12k/mo minimum reported | Allowed by contract | **Reject — economically prohibitive** |
| Pushshift / Arctic Shift / Academic Torrents / PullPush | Historical Reddit dumps | Free | Pushshift: **prohibited (explicit)** — revoked 2023, mod-only. Arctic Shift / Academic Torrents / PullPush: **ambiguous — owner's risk available** (unauthorised redistribution of scraped content) | Not used — the official Data API covers the need |
| Guardian Open Platform | REST API: articles, liveblogs, tags since 1999 | Free Developer key: 5,000 calls/day, 12/s, non-commercial only | Allowed with conditions — attribution/link-back; **content may not be retained >24h** (explicit — not relaxed by the ambiguity posture) [re-verify attribution clause #67]. Storing *derived sentiment scores* long-term: ambiguous — owner's risk | **Build — fallback/secondary sentiment source**; design so article text never persists >24h |
| NewsAPI.org | REST API | Free tier is dev/test only; production from $449/mo | Free tier **prohibited for a live site** (explicit terms) | **Reject** |
| GNews.io | REST API | Free 100 req/day; €49.99/mo Essential | **Ambiguous — owner's risk available** — pricing page and ToS contradict each other on commercial/production use | **Defer** — Reddit + Guardian cover the need |
| NewsData.io | REST API | Free 200 credits/day | **Unverified — owner's risk available**; terms page unfetchable [re-verify #67] | **Defer** |
| News24 RSS | Public headline+link feeds, documented as a syndication mechanism | Free | Likely allowed for headline+link display; full terms need a direct read [re-verify #67] | **Defer — strongest SA-outlet candidate** if a local-voice source is wanted |
| BBC Sport RSS | Public feeds | Free | **Unverified — owner's risk available**; known terms page belongs to a defunct developer programme [re-verify #67] | **Defer** |
| SuperSport RSS/site | — | Free | **Ambiguous — owner's risk available**; no syndication terms found | Not used — nothing it provides that cleared sources don't |
| Planet Rugby / RugbyPass (RSS or site) | Feeds/scraping | Free | **Prohibited (explicit)** — terms ban automated access/extraction/analysis (fetched directly) | Not used |
| Comment/forum platforms generally | — | — | No platform found with terms permitting sentiment mining | Not used |

Standing rules from these verdicts:

- The product is built on **APIs and licensed-open data first**; explicit
  prohibitions are final, and no circumvention of logins or blocks ever —
  a block is an answer. Ambiguous sources may be used politely at the
  owner's accepted risk, but only where a cleared source doesn't already
  cover the need.
- **Wikipedia is the load-bearing source** for history and match detail;
  its CC BY-SA attribution must be designed in, not bolted on.
- **Sentiment v1 is Reddit-derived** via the official Data API free tier
  (owner's-risk posture on the analyse/display step, decided 2026-08-01);
  Guardian is the fallback. No republishing of Reddit comment text —
  derived scores and thread links only.
- Every row marked [re-verify] still gets a verbatim primary-source read
  before the first data fetch (#67) — the posture change relaxes what we
  do about ambiguity, not the obligation to look.

## Feedback loop (UAT)

- **Named contact:** Michael (repo owner), acting as proxy for public users.
- **Cadence:** weekly cold test on the production site — open it as a fan
  would, note anything slower or less trustworthy than a Google search.
- **Channel:** findings land as tasks on the project board.

## Gap review

Reviewed 2026-08-01 by an independent agent (fresh context, gap analysis
only — task #64) through four lenses. Disposition of the 13 v1 findings:
one superseded (recent-results window — subsumed by all-time history), one
partially resolved (historical depth — resolved for pillar 1, reframed as
#11 for pillar 3), eleven carried forward unresolved (tagged v1#n below).

Triage: **resolve before PRD** = the PRD may not be started/baselined
without an answer; **PRD absorbs** = decide during PRD.

| # | Lens | Finding | Triage |
|---|---|---|---|
| 1 | Product | (v1#2) Standings dropped from the pillars but never declared out of scope, yet the API-Sports decision still says "Build — fixtures/results/standings". In or out must be stated | Resolve before PRD |
| 2 | Product | Pillar 4's core noun undefined: no unit (score/label/per-team), no producer (lexicon/LLM/editorial), no input set, no accuracy bar | Resolve before PRD |
| 3 | Product | Sentiment coverage mismatch: only cleared source starts 1999, single UK outlet, patchy SH coverage — yet presented as co-equal with three all-time pillars. Scope it to well-covered matches or it isn't a pillar | Resolve before PRD |
| 4 | Product | Pillar 4 has zero unconditionally cleared sources: Guardian contingent on the 24h-retention question, News24 [re-verify] and headline-only. If Guardian's answer is no, the pillar has no source; no fallback named | Resolve before PRD |
| 5 | Product | Pillar 4 collides with principles 2 (no viewable source for a derived score) and 6 (sentiment *is* inference). Needs an explicit bounded carve-out or the principles break on day one | Resolve before PRD |
| 6 | Product | No justification of pillar 4 against simplicity-first (AGENTS.md 1.3): the hardest, least-sourced pillar is in the first product with no argument for why it isn't sequenced after pillars 1–3 are live | Resolve before PRD |
| 7 | Product | In-match events appear in both pillar 3 and pillar 4 — one feature or two? Matters for scope and data model | PRD absorbs |
| 8 | Product | (v1#1) Empty/edge states undefined: off-season, match in progress, postponed/venue change, result-but-no-detail | PRD absorbs |
| 9 | Product | API-Sports free tier "limited seasons" may exclude the current/future season — exactly what pillar 2 needs. Build decision rests on an unconfirmed assumption; fallback is $19/mo or another source | Resolve before PRD |
| 10 | Product | The "beat Googling" bar has no pass/fail criterion, and the weekly cold test defines no threshold at which the product is failing its bar | PRD absorbs |
| 11 | Data model | (v1#7 reframed) Pillar 3 assumes per-match Wikipedia articles exist; in reality they cluster around World Cup/Lions tests. No coverage sample taken, so pillar 3's viability — and whether TheSportsDB's paid key is required — is unknown | Resolve before PRD |
| 12 | Data model | "Every Springboks test" is undefined as a set: pre-official-test era, non-cap tour games, 1986 Cavaliers, and SA Rugby's list disagrees with Wikipedia's. Row membership is currently a source's opinion, not a decision | Resolve before PRD |
| 13 | Data model | (v1#6) No canonical identity for matches/players/officials across sources and 135 years of name drift; Wikidata nominated but no scheme decided | Resolve before PRD |
| 14 | Data model | (v1#4) No conflict-resolution rule, and the rescope created live overlap (API-Sports vs Wikipedia vs Kaggle). No precedence order for when cleared sources disagree | Resolve before PRD |
| 15 | Data model | Licence compatibility unexamined: CC BY-SA share-alike derivatives vs API-Sports/Guardian no-redistribution terms — a combined match record may be un-publishable under either. Whether the site's dataset becomes CC BY-SA is asked, never answered | Resolve before PRD |
| 16 | Data model | Principle 6 has no data-model expression: *no data exists*, *not yet fetched*, *source silent* and *fetch failed* are four different honest states, currently indistinguishable | PRD absorbs |
| 17 | Data model | Wikitext parsing undecided: backfill-into-dataset vs parse-on-request, template variance across eras, raw-snapshot retention for provenance. The largest engineering unknown in the doc | Resolve before PRD |
| 18 | Security | (v1#8) No key-handling position; the naive path embeds API keys client-side. AGENTS.md 1.1 covers the repo, not a shipped bundle | Resolve before PRD |
| 19 | Security | (v1#8/#11) Cache architecture undecided against a 100 req/day ceiling; per-visitor upstream calls are arithmetically impossible and quota exhaustion is both an outage and a 1.4 breach. Needed invariant: user input never triggers upstream fetches | Resolve before PRD |
| 20 | Security | Guardian 24h retention is an infrastructure invariant, not a code decision: CDN caches, build artefacts, logs and backups all retain content past 24h by default | Resolve before PRD |
| 21 | Security | A derived "mood" label next to a named outlet's article asserts something the outlet never said; needs labelling rules to avoid misrepresentation | PRD absorbs |
| 22 | Operations | The [re-verify] backlog lived only as inline markers, not on the board (AGENTS.md 1.5). Now filed as task #67, which covers eight sources (the marked rows plus Wikipedia and TheSportsDB) | Resolve before PRD |
| 23 | Operations | (v1#11) Budget math never done: 572-match backfill vs Wikipedia polite rate; daily refresh vs 100 req/day; sentiment backfill vs Guardian 5,000/day | Resolve before PRD |
| 24 | Operations | (v1#5) Principle 2 unoperationalised for anything without a public per-record page (API-Sports facts, every derived sentiment value). Needs a documented exception class or those facts can't be shown | Resolve before PRD |
| 25 | Operations | (v1#9) "Defer — runner-up if Wikipedia proves too thin" names no threshold, measurement or decision owner; coupled to finding 11's coverage sample | Resolve before PRD |
| 26 | Operations | (v1#12) Attribution rendering undecided (per fact / per page / footer); CC BY-SA also requires marking *what* was changed in parsed/normalised data | PRD absorbs |
| 27 | Operations | (v1#10) Staleness detection is still one weekly human check; no automated signal for empty fetches, zero-row parses, quota exhaustion, or a source starting to 403 | PRD absorbs |
| 28 | Operations | Wikipedia restructuring is the most likely routine breakage and fails quietly as missing fields; no parser-health check, field-completeness assertion, or raw snapshot to diff | PRD absorbs |
| 29 | Operations | (v1#13) Testing strategy for source-dependent code unstated: recorded fixtures vs live calls, parser regression across eras, sentiment evaluation. Gate 3 has nothing to bite on | PRD absorbs |

Reviewer's summary judgement, recorded verbatim in intent: the compliance
discipline is strong, but **terms clearance has been mistaken for
feasibility** — several sources are cleared to use but never checked for
whether they contain the data the pillar needs. The 20 "resolve before PRD"
findings are the opening worklist of inception (count corrected in Gate 2
review — the reviewer's prose said 19; the table tags 20 rows). Two cheap
unblockers first:

- a stratified coverage sample (~40 matches across eras) of Wikipedia
  per-match articles closes #11 and #25 and decides whether pillar 3 needs
  a paid source (filed as task #68);
- the verbatim [re-verify] terms reads, Guardian retention first — that one
  answer could delete or confirm pillar 4 (filed as task #67).

### Post-review addendum (2026-08-01, same day)

After this review was delivered, the owner changed the compliance posture
(AGENTS.md 1.4): ambiguous terms now mean proceed politely at the owner's
risk instead of prohibited. Effect on the findings above:

- **#4 is softened, not closed**: pillar 4 regains a primary source (Reddit
  Data API, owner's-risk on the analyse/display step), and Guardian drops
  to fallback. The Guardian 24h-retention clause is explicit, so #20 stands
  unchanged.
- **#5 stands**: the principles carve-out for derived sentiment is still
  needed — the posture change makes the pillar permissible, not coherent.
- **#22/#67 stand**: terms must still be read before the first fetch; the
  posture changes what we do about ambiguity, not the obligation to look.
- All other findings are unaffected.
