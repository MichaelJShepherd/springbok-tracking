# Discovery — Springbok Tracking

Status: draft (pending gap review and data-source verdicts)
Owner: Michael (repo owner)

## Thesis

Following the Springboks today means re-Googling scattered sites every time
you want to know "when do the Boks play next, what happened last match, and
where do they stand" — this project beats that manual web check with one
fast, always-current page.

The bar to beat is **manual web checking**: if the site is not quicker and
more trustworthy than a Google search, it has no reason to exist.

## Design principles

These settle future arguments. In priority order:

1. **Simplicity first, scalability second.** (Repo-wide rule — see
   AGENTS.md 1.3. It governs product scope too: fewer features, done well.)
2. **Nothing is shown without a viewable source.** Every fixture, score and
   standing links to where it came from. If we can't source it, we don't
   display it.
3. **Fresh enough beats real time.** Fixtures and results updated on a
   schedule that matches fan needs (daily is fine; match-day more often).
   Live scores are out of scope unless a compliant source makes them cheap.
4. **Read-only, no accounts.** The public site collects no personal data
   and has no login. This eliminates an entire class of security, privacy
   and abuse problems by construction.
5. **Compliant data only.** A source whose terms are unclear is a source we
   don't use (AGENTS.md 1.4). Losing a feature beats breaching terms.

## Scope of the first product

In scope (the slice that beats manual web checking):

- Next fixtures: opponent, competition, date, kickoff in SA time, venue.
- Recent results: score, opponent, competition, date.
- Current standing in the active competition (e.g. Rugby Championship table).

Explicitly out of scope for now (revisit only after the above is live):

- Live in-match scores and commentary.
- Player-level statistics and squad announcements.
- News aggregation.
- Notifications / subscriptions of any kind (would require storing user data).

## Audience and end state

- **Audience:** public users; no login, no tenancy. Single public site.
- **End state:** ongoing — the repo owner keeps and evolves it. No handover
  planned, so no ownership-transfer scoping is required.
- Because the audience is public, any future third-party integration that
  distinguishes single-tenant from public multi-tenant must be re-costed at
  that point (none are in the current scope).

## Data sources and integration economics

Rule: per AGENTS.md 1.4, every source needs its terms of service and
robots.txt read **before the first data fetch**, and the conclusion recorded
here. Ambiguous terms = prohibited.

Research method note: this session's network egress policy blocked all
direct page fetches (403 for every host, including a control fetch), so the
verdicts below rest on search-engine reads of the named policy pages, not
verbatim first-hand reads. **Before the first data fetch, re-read the
primary source's terms verbatim from an unblocked environment and confirm
the verdicts below.** No sports data was fetched during research.

| Source | Access | Cost | Terms verdict | Decision |
|---|---|---|---|---|
| API-Sports Rugby (api-sports.io) | REST/JSON API: games, results, standings for Rugby Championship, World Cup, internationals | Free 100 req/day (limited seasons); Pro $19/mo | Allowed with conditions — API access is the product; stay within rate limits; free-plan scope is mutable | **Build — primary source.** Confirm current season is on the free plan and re-read terms verbatim before first fetch |
| Wikipedia (MediaWiki API) | Action/REST API over team + competition articles | Free | Allowed with conditions — polite serial reads, descriptive User-Agent, CC BY-SA 4.0 attribution with link to source article | **Build — cross-check + fallback.** Not primary: hand-edited wikitext tables are fragile to parse |
| Wikidata | SPARQL / dumps | Free | Allowed — CC0 | Optional for team/competition entities; match-level data too sparse to rely on |
| TheSportsDB | JSON API (Rugby Championship league 4986 etc.) | Free–$9/mo | Allowed with conditions — must credit as source; paid key for production/app-store | **Defer — runner-up** if API-Sports free plan proves insufficient; community-maintained results less dependable |
| Sportradar / Stats Perform / Goalserve | Licensed enterprise feeds | ~$550–$10,000+/mo | Allowed but enterprise contracts | **Reject — economically prohibitive** for this project |
| springboks.rugby / sarugby.co.za (scrape) | HTML scraping | Free | **Ambiguous → prohibited** — terms/robots unreadable from this environment; snippets suggest content-reuse restrictions | Not used unless a future verbatim terms read clears it |
| world.rugby (scrape) | HTML scraping | Free | **Ambiguous → prohibited** — terms unreadable; sister site reportedly bans automated collection | Not used |
| supersport.com (scrape) | HTML scraping | Free | **Ambiguous → prohibited** — nothing verified either way | Not used |
| espn.co.uk / espn.com (scrape) | HTML scraping | Free | **Prohibited (leaning explicit)** — Disney/ESPN ToU reportedly ban robots/scrapers without written permission | Not used |

Standing rule from these verdicts: the product is built on **APIs and
licensed-open data only**; no HTML scraping of rugby sites is in scope.

## Feedback loop (UAT)

- **Named contact:** Michael (repo owner), acting as proxy for public users.
- **Cadence:** weekly cold test on the production site — open it as a fan
  would, note anything slower or less trustworthy than a Google search.
- **Channel:** findings land as tasks on the project board.

## Gap review

Draft plan to be reviewed through four lenses (product logic, data model,
security/abuse, operations) by an independent reviewer; findings triaged
into "resolve before PRD" vs "PRD absorbs".

| # | Lens | Finding | Triage |
|---|---|---|---|
| (pending review) | | | |
