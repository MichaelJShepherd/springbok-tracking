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
