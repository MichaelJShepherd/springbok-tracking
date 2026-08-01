-- #79: fixtures_upstream gained no way to tell postponed from TBD from
-- cancelled (both rendered one indistinguishable "TBD" chip on Home, a
-- finding raised on #75's gate review) or to tell which source produced a
-- row now that Wikipedia season-article fixtures (available today, no key
-- needed) and API-Sports fixtures (future, behind API_SPORTS_KEY) can both
-- land in this one table per PRD D9/D15. Additive only, per the
-- append-only migration convention (see 20260801105708_initial_schema.sql).

-- D8/#75: postponed / TBD (venue or date genuinely unknown) / cancelled
-- must render differently, not collapse into one chip. 'scheduled' is the
-- default — the large majority of rows, where the fixture is simply booked.
alter table fixtures_upstream
  add column status text not null default 'scheduled'
    check (status in ('scheduled', 'postponed', 'tbd', 'cancelled'));

-- D15 licence separation needs a way to tell, per row, which source
-- produced it — 'wikipedia' rows carry CC BY-SA attribution obligations
-- (D26) that 'api-sports' rows (D28's API-facts carve-out) do not.
alter table fixtures_upstream
  add column source text not null default 'wikipedia'
    check (source in ('wikipedia', 'api-sports'));

-- The "viewable source" for a Wikipedia-derived fixture row (principle 2) —
-- the exact season/tour article it came from. Left null for api-sports rows,
-- which carry their own provenance note per D28 instead (named source +
-- fetch timestamp, already covered by `fetched_at` + `source`).
alter table fixtures_upstream
  add column source_article_url text;

-- Without this, a re-run of `ingest:fixtures` against Wikipedia (no
-- api_sports_fixture_id to upsert on) would insert a fresh duplicate row for
-- the same fixture every time. One row per (date, opponent, source) instead
-- — matching api-sports and wikipedia rows for the same fixture can still
-- coexist side by side until an API key exists to reconcile them (D14).
alter table fixtures_upstream
  add constraint fixtures_upstream_date_opponent_source_key
    unique (match_date, opponent_team_id, source);
