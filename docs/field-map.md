# Field map — "List of South Africa rugby union test matches" (#74)

Extends #68's per-era sample findings with the actual wikitext structure
discovered while building `ingest:backfill` (PRD D12/D17). This is the map
`ingestion/src/lib/wiki-list-parser.ts` implements against, and the map
future slices (#76 — lineups/events from individual match/season articles)
should read before touching the same source.

## Source article

- **Title (confirmed at fetch time via the MediaWiki API):** `List of South
  Africa rugby union test matches` — matches the title the PRD/ticket
  assumed; no correction needed.
- Fetched once via `action=parse&prop=wikitext&formatversion=2` — a single
  page, not the ~650-page budget in PRD D24 (that figure covers a much
  larger future scope of fetching every season/match article too; this
  ticket's scope is the list article only, per its own description).
- 570 individual match templates found in the article
  (`{{#invoke:rugby box collapsible|main ... }}`), against
  the article's own declared "Overall" total of 572 (sum of its per-decade
  summary table). **Known, documented discrepancy:** two per-year "Games
  played" counts (2005 and 2006) each declare one more game than the number
  of match templates actually present under that year's heading — a
  pre-existing data-quality gap in the source article itself, not a parser
  bug. All 570 present templates parse successfully (0 skipped after the
  date-format fixes below).

## Article structure

- Match rows are nested under `==YYYY==`-or-`===YYYY===` year headings
  (never decade headings like `==2020s==`, which the parser's section
  splitter deliberately does not match — decade headings only carry summary
  tables, no match templates of their own).
- Every test is one balanced `{{#invoke:rugby box collapsible|main ...}}`
  template. **A plain non-greedy regex cannot extract these**: field values
  routinely nest their own `{{...}}` templates (e.g. `{{ru-rt|RSA}}`), which
  would close a naive match early. The parser instead walks brace depth
  (`extractBalancedBlocks`).
- Each field is one `| key = value` line; values are single-line even when
  they contain `<br />`-separated scorer lists. The parser matches fields
  line-by-line (`[ \t]*` around `=`, not `\s*`) — an earlier version used
  `\s*` and silently merged a blank field's line with the *next* field's
  line, because `\s` matches the newline between them.

## Two template generations

| | Legacy shape (from 1891 through ~2013) | Current shape (~2013/14 onward) |
|---|---|---|
| Side fields | `team1` / `team2` — home side is always `team1` | `home` / `away` |
| Side value | `{{ru-rt\|CODE}}` or `{{#invoke:flag\|ru\|CODE}}`, or a raw `[[Team name]]` wikilink for un-coded opponents (British & Irish Lions tours) | `{{Ru-rt\|CODE}}` / `{{Ru\|CODE}}` |
| `drop1`/`drop2` (drop goals) | Present on most, absent on the earliest (pre-1900s) blocks | Present |
| `time` (kickoff) | Usually blank | Populated on recent fixtures, `HH:MM` prefix |

The parser detects shape per-block (`'home' in rawFields` vs
`'team1' in rawFields`) rather than by year, since the transition isn't a
clean year boundary in the source.

## Field → column map

| Article field(s) | `matches` column | Notes / provenance rule |
|---|---|---|
| `date` | `match_date` | Tolerates wikilinked dates, external-link-citation-wrapped dates (`[https://... 20 October 2019]`, 2018–19 era), and a trailing footnote marker (`24 June 1995 *`, 1995/1999 World Cup finals). Unparsed → the match is skipped entirely (no date = no identity, PRD D13) and counted in the run's failure total. |
| `team1`/`team2` or `home`/`away` | (used to compute `opponent_team_id` + `home_away`) | Whichever side isn't South Africa becomes the opponent. No coded template *and* no wikilink at all → `unresolved: true`, and the team's own raw text becomes its (uncanonicalised) name rather than erroring. |
| `score` | `springboks_score` / `opponent_score` | Present + a clean `NN–NN` value + a resolvable South-Africa side → `present`. Field blank → `absent_in_source`. Field present but non-numeric (never observed live, exercised only in tests) → `fetch_failed`. |
| `stadium` | `venue` | `present` if non-blank after stripping wikilink markup, else `absent_in_source`. |
| `time` | `kickoff_time` | Blank → `absent_in_source` (the large majority of the article, all eras before recent fixtures). Populated but not `HH:MM`-shaped → `fetch_failed`. |
| `referee` | (→ `match_officials`, role `referee`) | Trailing `(Country)` stripped along with wikilink markup. Blank → `absent_in_source`. |
| *(none)* | `competition` | **No field in this article carries competition/tournament at all** — no per-match template field, no section heading below year level. `competition_provenance` is `absent_in_source` for every row from this source. A future source (season articles, or API-Sports for future fixtures per D14) would need to supply this if the product wants it. |
| *(none in this backfill)* | `match_lineups`, `match_events` | The article's `try1`/`con1`/`pen1`/`drop1` (and `2`-suffixed) fields carry scorer names with inconsistent minute-and-conversion annotations (e.g. `[[Name]] 4' c`, "2" for a brace, or nothing at all pre-1990s). Turning these into structured, minute-stamped `match_events` rows needs its own parser slice — deliberately out of this ticket's scope (which asked for the matches table), left for #76. No rows are written to these tables by `ingest:backfill`; they remain at their column default (`not_yet_fetched`) because no rows exist yet for any match. |

## Identity (D13)

`match_id = <ISO match_date>-<slug(opponent canonical name)>-<sequence>`,
e.g. `1896-09-05-british-irish-lions-1`. `sequence` increments per
`(match_date, opponent)` pair in source order, so a genuine same-day double
header against the same opponent gets `-1`, `-2`, etc.

## Team canonicalisation (D13)

`ingestion/src/lib/team-directory.ts` maps every rugby-code token the
article uses (including duplicate codes for the same country — `NZ`/`NZL`,
`ROM`/`ROU`, `RSA`/`SA`) to one canonical name, plus the handful of
uncoded opponents (British & Irish Lions tours) resolved by wikilink text
instead, with "British Isles" recorded as an alias.

## Fixtures (task #79) — Wikipedia season/tour articles

Discovering "the list article's season links" (PRD D9's original wording)
turned out not to work literally: a live check of the list article this
slice actually parses (`List of South Africa rugby union test matches`)
showed its year sections carry no hatnote or wikilink pointing at any
current-season fixtures article at all — every year section is just its own
match templates. `ingestion/src/lib/wiki-season-discovery.ts` instead tries
a small, documented ladder of Wikipedia rugby-union title patterns for the
current year and skips (does not error on) any that don't exist:

1. `<year> Nations Championship`
2. `<year> Rugby Championship`
3. `<year> men's rugby union internationals`
4. `<year> end-of-year rugby union internationals`
5. `<year> mid-year rugby union internationals`

Confirmed live at the time of writing: both (1) and (3) exist for 2026 and
both carry genuine upcoming Springboks fixtures (blank `score` field, dates
after the fetch date). (1)'s future rounds are still largely wikitext
comments (`<!-- round 4 -->` etc — not yet filled in by editors), so in
practice (3), the "catch-all" internationals-outside-major-tournaments
article, is where this slice found its real upcoming fixtures.

### Template shape

Distinct from the list article's `{{#invoke:rugby box collapsible|main}}`
templates: season/tour articles use a plain `{{rugbybox}}` / `{{Rugbybox}}`
template (marker case varies even within one page), same field vocabulary
otherwise (`date`, `time`, `home`/`away` or `team1`/`team2`, `score`,
`stadium`, `referee`, `try1`/`con1`/... scorer fields). `ingestion/src/lib/
wiki-fixtures-parser.ts` reuses wiki-list-parser's field-parsing and
team-resolution helpers rather than re-implementing them.

### What makes a block a fixture (not a played match)

- `score` is blank, or a placeholder the source uses in place of a result
  (`Postponed`, `Cancelled`) — a clean `NN–NN` value means the match has
  already been played and belongs to `ingest:backfill`/`ingest:refresh`
  instead; this script silently excludes it (not an error).
- Exactly one side must resolve to South Africa (checked via the same
  coded-template resolution the list parser uses) — pages like "20XX men's
  rugby union internationals" carry hundreds of other countries' fixtures
  in the same table shape, all correctly excluded.
- A-team (`ruA-rt`/`ruA`) and club-side (`{{flagicon|...}}` + a club
  wikilink) fixtures are excluded the same way: neither of those template
  forms resolves to the senior national team's code, so neither side
  matches "South Africa" and the block is skipped.

### Status (D8/#75 gate finding — postponed vs TBD vs cancelled)

`fixtures_upstream.status` (migration
`20260801140000_fixtures_upstream_status_and_source.sql`) is one of
`scheduled` / `postponed` / `tbd` / `cancelled`:

- `score` containing "cancel"/"postpone" (case-insensitive) → `cancelled` /
  `postponed`.
- Otherwise, a genuinely unknown kickoff time or venue (the source's own
  `TBC`/`TBD` placeholder, or a blank stadium field) → `tbd`.
- Otherwise → `scheduled` (the common case — date, kickoff and venue all
  known).

### Licence separation (D15) and source tracking

The same migration adds `source` (`'wikipedia'` / `'api-sports'`) and
`source_article_url` (populated for Wikipedia rows only) so `fixtures_upstream`
can hold both sources side by side without becoming indistinguishable, and
a `unique (match_date, opponent_team_id, source)` constraint so repeated
`ingest:fixtures` runs upsert instead of duplicating (there is no natural
key for a Wikipedia-sourced row the way `api_sports_fixture_id` is one for
an API-Sports row). When both sources carry a row for the same fixture, the
API-Sports row wins per D14 and the Wikipedia row for that fixture is
dropped rather than written twice.

### API-Sports (D9 primary, currently OFF)

`ingestion/src/lib/api-sports-client.ts` is implemented and unit-tested
against a recorded response fixture (D27) but has never been run against
the real API-Sports endpoint — no key exists yet (task #67's client
action). `ingest:fixtures` checks `API_SPORTS_KEY` and cleanly skips this
source (logged reason, non-error) when it's absent. When a key arrives,
whoever runs `ingest:fixtures` first with it set must (a) confirm
`SPRINGBOKS_TEAM_ID` in that module against the real API response, and (b)
record the D9 trigger's pass/fail outcome (every remaining current-year
fixture present with date+kickoff) on task #79.

## Known blocker at time of writing

The full live-write verification run (fetch → parse → write to Postgres)
is blocked: the local schema's `service_role` Postgres role has no GRANT
(select/insert/update/delete) on any of the ingestion-write tables
(`source_snapshots`, `teams`, `matches`, `match_officials`,
`ingestion_runs`) — `rolbypassrls` is true but a GRANT is still required
independently of RLS. The migration only added an explicit `GRANT SELECT`
for `anon`; it never added the equivalent for `service_role`. This is a
schema issue (out of this ticket's lane) recorded on #74 and filed as a
new Backlog task.

**Resolved by #80** (migration `20260801113000_service_role_grants.sql`,
merged before this ticket started) — `ingest:refresh` below ran real
live writes successfully against local Supabase.

---

## #76 — match detail (lineups, officials, events) from `{{Rugbybox}}`

`ingest:refresh` (`ingestion/src/scripts/refresh.ts`) resolves a richer
per-match Wikipedia source for matches already in the DB and parses
lineups, officials beyond the referee, and scoring/card events out of it.
This section is the map for `ingestion/src/lib/rugbybox-parser.ts` and
`ingestion/src/lib/detail-source-resolver.ts`.

### The source template: `{{Rugbybox ...}}`

Confirmed by fetching real wikitext (not guessed) before writing the
parser: both an individual match article (`2023 Rugby World Cup final`)
and a season/tour article that embeds many matches on one page (`2022
mid-year rugby union tests`) represent each match the same way — one
`{{Rugbybox ...}}` template (case-insensitive template name), immediately
followed by:

1. Two `{| cellspacing="0" cellpadding="0" ...}` sub-tables — starting
   XV + replacements + coach, **home side first, away side second** (this
   ordering held in both fetched samples and is the parser's only
   assumption about layout). Each player row is
   `POS ||'''NN'''||[[Player Name]] || || {{suboff|MIN}}` — position code,
   bold shirt number, wikilinked name, optional sub/card templates.
   Cards ride on the same row: `{{yel|MIN}}` and `{{sin bin|offMin|onMin}}`
   both read as a yellow card (at the first minute given); `{{sent
   off|...|MIN}}` reads as a red card at the last numeric parameter.
2. A free-text block carrying `'''Assistant referee(s):'''` /
   `'''Television match official:'''` / `'''Reserve official:'''` labels,
   each followed by one or more `<br />`-separated names — parsed
   role-by-label, never by "first wikilink on the line" (a plain, unlinked
   name followed by a linked country, e.g. `Tom Foley
   ([[Rugby Football Union|England]])`, would otherwise misread the
   country as the official).

Rugbybox's own scorer fields (`try1`/`con1`/`pen1`/`drop1` for the home
side, `2`-suffixed for away) carry `<br />`-separated player entries, each
optionally with a `(made/attempts)` count and one or more `MIN'` (or
`BASE+STOPPAGE'`, e.g. `80+3'`) minute markers — multiple minutes on one
entry (e.g. a brace: `(2) 3' m, 32' c`) become one `match_events` row per
minute for that player. An entry with no minute at all (older wikitext, or
a template variant that omits it) still becomes one row, with
`minute_provenance = absent_in_source` — the D11 "ordered-only" fallback.
Events are sorted timed-first by minute, then any untimed events appended
in source field order, then card events merged in the same way and the
whole set renumbered — see `mergeEventRows`.

The Rugbybox block also carries its own `referee` field (same cleanup
rule as the list-article parser) and its own `score`/`home`/`away`
fields — used only as the join key to confirm this is the right block for
a given `(match_date, opponent)` target (`blockMatchesTarget`), and to
backfill the `match_officials` referee row **only if** the existing row
from `ingest:backfill` is not already `present` (D14: the list article
stays the authoritative displayed source; this is a fill-in, never an
overwrite).

### Source resolution — no live search, a small deterministic title list

`detail-source-resolver.ts`'s `candidateArticleTitles` tries, in order:

1. A small curated table of **high-profile individual match articles**
   (currently the four Springboks Rugby World Cup finals from 1995
   onward — a well-documented historical fact, not proprietary
   information, AGENTS.md 1.1).
2. For matches from **1994 onward**, deterministic season/tour article
   title guesses by month (`"<year> mid-year rugby union tests"` for
   June/July, `"<year> Rugby Championship"`/`"<year> Tri Nations"` for
   August–October, `"<year> end-of-year rugby union internationals"` for
   October–December).
3. Matches **before 1994** are not attempted at all — D11 already
   documents this as the era before these source shapes existed
   (timed scoring sequences reach 100% only from 2011 onward), so
   fetching would just burn politeness budget on requests known to come
   back empty.

This is deliberately simpler than a live MediaWiki search (AGENTS.md
1.3): it costs one extra fetch-and-miss per wrong guess, which the
stratified verification run below shows is a real, non-trivial cost for
older years whose actual page-naming convention this map does not yet
know. **Known gap, honestly recorded rather than papered over:** several
1996–2010-era title guesses came back "page doesn't exist" in the
verification run (1996, 1998, 2000, 2002) — Wikipedia's actual naming
convention for Springbok tests in that window is not yet known and is
follow-up work for whoever extends this resolver (see the full-crawl
Backlog task filed from this ticket).

### Row-based D16 provenance (a schema clarification, not a schema change)

`matches`/`match_officials`'s referee row use per-field
`<field>_provenance` **columns** (D16). `match_lineups`/`match_officials`
(non-referee roles)/`match_events` have no such per-match "was this table
even checked" column — they are just rows, zero or more per match. This
ticket's convention, consistent with how `ingest:backfill` already left
these tables at zero rows for every match: **if a matching Rugbybox block
is found and parsed, every row it yields is written with `present`
provenance (or `absent_in_source`/timing per event, per D11); if no
matching source is found at all after trying every candidate, zero rows
are written and that reads as "not recorded"** — indistinguishable from
"not yet attempted" at the row level, same as the pre-#76 state for every
match. Changing that would need a schema change (out of this ticket's
lane — `supabase/**` is not touched here); flagged for whoever next
touches this schema.

### Live verification: ~30-match stratified sample (this ticket)

Real `ingest:refresh --stratified=30` run against local Supabase (28
matches selected — `floor(30/4)=7` per D29 era bucket), full output on
task #76. Per-era coverage (of era-eligible matches attempted; pre-1994
matches are skipped by design, see above):

| Era | Matches | Attempted | Lineups found | Officials found | Events found |
|---|---|---|---|---|---|
| pre-1950 | 7 | 0 (before 1994 cutoff) | — | — | — |
| 1950–95 | 7 | 0 (before 1994 cutoff) | — | — | — |
| 1996–2010 | 7 | 7 | 0 | 0 | 2 |
| 2011+ | 7 | 7 | 3 | 4 | 4 |

Compared against #68/D11's expectations (100% lineups/referee/scoring
from 1996+, measured against individual/season *articles*, not the list
article this backfill uses): this run's 1996–2010 lineup/officials
coverage (0%) is **below** #68's finding, and the anomaly is explainable,
not a parser bug — every 1996–2010 candidate either hit a wrong page-title
guess (see the gap above) or landed on a season page whose specific match
section had a Rugbybox but not the two lineup sub-tables (`2004`/`2008`
end-of-year internationals: events found, lineups/officials not). The
2011+ bucket matches D11's finding much better (lineups found for 3 of 7,
all via `<year> Rugby Championship` pages that do carry full team
tables) — the shortfall there is entirely wrong-title misses for the
matches whose actual detail page this resolver's deterministic list
doesn't yet cover (e.g. November end-of-year tests, one-off warm-up
Tests). **Conclusion for whoever picks up the full crawl:** the parser
itself is sound (21 unit tests against real fetched wikitext, all
passing); the remaining gap is entirely in source-title resolution
coverage, not parsing — worth a live MediaWiki search-based resolver as a
follow-up rather than a bigger static title table.

### Wikipedia rate limiting encountered live

The stratified run above hit real HTTP 429 responses from Wikipedia
partway through, even fetching at the AGENTS.md 1.4 ceiling of ≤1rps —
apparently a burst/short-window limit distinct from the steady-state
1rps figure. `wikipedia-client.ts`'s `fetchWikitext` now backs off (5s,
then 15s, respecting a `Retry-After` header if Wikipedia sends one) and
the steady-state interval was slowed to 1.5s between requests (AGENTS.md
1.4: a block is an answer, not an obstacle — the fix is to go slower, not
to route around it). No fetch was retried more than twice; a persistent
429 still surfaces as a normal `fetch_failed`-equivalent skip for that
page, counted in the run's failure total.

## Sentiment (task #78)

`ingest:sentiment` (`ingestion/src/scripts/sentiment.ts`) replaces its
previous print-only stub with a real (but currently unreachable — see
below) implementation of PRD D2/D4's Reddit-primary/Guardian-fallback
lexicon sentiment pipeline into `sentiment_scores`.

### Lexicon (D2 "AFINN-style + small rugby lexicon")

`ingestion/src/lib/sentiment-lexicon.ts` is a small, hand-written,
original word list (general sentiment words + a rugby-specific set) —
deliberately **not** a copy of the real AFINN dataset, to keep this public
repo clear of a third-party dataset's own licence/attribution terms
(AGENTS.md 1.1) and to keep the scorer dependency-free (1.3: a plain
object literal, no data file to fetch). `sentiment-scorer.ts` tokenises
text, averages matched word scores per comment/article, averages those
across a bucket, and normalises into PRD D2's `[-1, 1]` range. Known,
accepted limitation: this is a bag-of-words scorer with no negation
handling and no context disambiguation (e.g. "thrashed" reads the same
whichever side did the thrashing) — PRD D2's own accuracy bar (≥8/10
directionally correct, spot-checked once real data flows) is explicitly
out of this task's scope.

### Bucketing (D2/D3)

`ingestion/src/lib/sentiment-buckets.ts`'s `bucketForTimestamp` assigns
one comment timestamp to `pre_match` / `first_half` / `second_half` /
`post_match` relative to a match's `kickoff_time`, using a documented,
simple heuristic (40-minute halves + a 15-minute halftime tolerance for
stoppage time — not a real play-by-play clock). When no kickoff timestamp
exists for a match (the large majority of the backfilled set, per D16),
every comment instead falls into the single `whole_match` bucket. The
Guardian path always uses `whole_match` only, per D2 ("headlines have no
match clock").

### Minimum-volume floor (D2)

`MIN_REDDIT_COMMENTS = 25` and `MIN_GUARDIAN_ARTICLES = 5`
(`sentiment-scorer.ts`) — a bucket under its floor is written with
`too_few = true` and `score`/`label` left `null` ("too little discussion
to score") rather than a fabricated number.

### D20 retention — no comment/headline text persisted or logged

`ingestion/src/lib/sentiment-pipeline.ts` is the one seam where raw
comment/article text is read (to score/bucket it) and a `sentiment_scores`
row is produced — its `SentimentRow` interface is exactly the D20-permitted
column set (`match_id`, `bucket`, `score`, `label`, `bucket_source_count`,
`too_few`, `source`, `source_url`). `ingestion/src/lib/sentiment-retention.spec.ts`
is the automated check the ticket asked for (in place of a custom ESLint
rule — a behavioural test proved more direct and Gate-3-friendly than a
static lint rule alone), and combines four independent techniques after a
Gate 3 review found and closed real bypasses in an earlier version:
(a) runs the real row-building functions against fixture text containing a
unique marker string, with `console.*` spied, and asserts the marker never
appears in a returned row or anything logged; (b) asserts every returned
row has *exactly* the permitted column set, so an added field fails
immediately even before it is wired to a real insert; (c) a static scan —
a matched-paren call-expression scanner (tolerant of the call spanning
multiple lines) that flags any `console.log/warn/error/info/debug` or
`process.stdout/stderr.write` call referencing `.body`/`.headline`/
`.standfirst`, or `JSON.stringify`-ing a comments/articles collection —
run glob-wide over every non-spec `.ts` file under `ingestion/src/lib` and
`ingestion/src/scripts` (not a fixed file list, so a new file is covered
automatically); and (d) an upsert-site guard confirming
`scripts/sentiment.ts` has no `sentiment_scores` write path at all right
now (see the next section) — the strongest available form of "nothing
extra gets upserted" while that remains true. All four would fail if
someone reintroduced source-text persistence or logging.

### Reddit/Guardian — LIVE, but DISABLED until keys exist

`ingestion/src/lib/reddit-client.ts` and `ingestion/src/lib/guardian-client.ts`
follow the same "cleanly OFF" contract as `api-sports-client.ts` (task
#79): `isRedditConfigured()` (`REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`)
and `isGuardianConfigured()` (`GUARDIAN_API_KEY`) gate the only two
functions in this codebase that reach either host at all, and
`scripts/sentiment.ts` never calls either fetch function outside an `if
(isXConfigured())` branch. **No key exists at task #78 time** (task #67's
Reddit OAuth registration is still pending; no Guardian Open Platform key
has been requested), and this task made no live call to either host —
verified both by code inspection (the gate above) and by a real local run
with both env vars unset, which logged both OFF reasons and made zero
network calls. Both clients are unit-tested only against recorded,
synthetic fixtures (`ingestion/src/lib/__fixtures__/reddit-match-thread-comments.json`,
`.../guardian-articles.json` — invented comments/articles, no real
usernames or personal data, D27/AGENTS.md 1.1).

### D25 guardrail — currently absent, not just adapted (honest state)

Both live branches unconditionally refuse to run (see the section above),
so `scripts/sentiment.ts` always writes zero rows regardless of which
source(s) are configured, and it treats that as a clean `success` with
`rows_written = 0` and a logged reason — the same zero-rows adaptation
task #79 made for `ingest:fixtures`'s true-off-season case. Unlike that
precedent, though, this script **does not call `evaluateGuardrail`
(`lib/ingestion-guardrail.ts`) at all** — there is nothing for a
zero-rows/completeness-drop check to meaningfully evaluate while zero rows
is the only reachable outcome, so an earlier "the check still applies once
configured" line in this section was wrong: no such per-configuration
adaptation was ever implemented. Re-adding the guardrail is explicit
follow-up work (task **#88**), to land alongside the real match->thread
lookup, Guardian query builder, and PRD D4 ladder.

### Real end-to-end run: not yet possible

No live comment/article has ever been scored by this pipeline — the
lexicon scorer, bucketing, and volume floor are exercised only by unit
tests against recorded/synthetic fixtures (D27). Even once
`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`/`GUARDIAN_API_KEY` exist,
`scripts/sentiment.ts` will still refuse to run both branches (logging why
and writing a `success`/zero-rows `ingestion_runs` row) until task #88
lands: a real match → Reddit-thread lookup, a real Guardian query builder
(opponent name + match date window — `fetchMatchArticles` is never called
with an invented query or empty date bounds), PRD D4's per-match ladder on
top of them, and the D25 guardrail re-added around whatever that live path
writes. Whoever picks up #88 must also record the D2 accuracy spot-check
(≥8/10 matches directionally correct) on its own task, and re-confirm the
D20 retention posture holds against real data.
