-- Initial schema for Springbok Tracking (PRD docs/prd.md §3).
--
-- Conventions used throughout this migration:
--   * text + CHECK instead of enums (AGENTS.md non-negotiables: enums churn
--     badly; text+CHECK is boring and easy to extend with a follow-up
--     migration).
--   * Every nullable "fact" field that can legitimately be missing carries a
--     companion `<field>_provenance` column constrained to the four D16
--     states: present / absent_in_source / not_yet_fetched / fetch_failed.
--     The UI renders these three non-'present' states differently (see
--     docs/design.md §1.2) instead of ever throwing on a missing value.
--   * RLS policies below use `using (true)` / role checks only — none of
--     them query their own table.
--   * Migrations are append-only from here on: change the schema with a new
--     migration file, never by editing this one.

create extension if not exists pgcrypto;

-- A shared CHECK expression for provenance columns. Postgres has no
-- reusable named CHECK fragment, so this is spelled out on every
-- provenance column below; keep the four states in sync if they ever change.

-- ---------------------------------------------------------------------
-- teams — canonical names + aliases, the cross-source join key (D13).
-- ---------------------------------------------------------------------
create table teams (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- matches — one row per test match (D12 match set). match_id per D13:
-- date + normalised opponent + same-day sequence disambiguator.
-- ---------------------------------------------------------------------
create table matches (
  match_id text primary key,
  match_date date not null,
  opponent_team_id uuid not null references teams (id),
  sequence smallint not null default 1,

  competition text,
  competition_provenance text not null default 'not_yet_fetched'
    check (competition_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),

  venue text,
  venue_provenance text not null default 'not_yet_fetched'
    check (venue_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),

  kickoff_time timestamptz,
  kickoff_time_provenance text not null default 'not_yet_fetched'
    check (kickoff_time_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),

  home_away text check (home_away in ('home', 'away', 'neutral')),

  springboks_score integer,
  springboks_score_provenance text not null default 'not_yet_fetched'
    check (springboks_score_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),

  opponent_score integer,
  opponent_score_provenance text not null default 'not_yet_fetched'
    check (opponent_score_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),

  result text check (result in ('win', 'loss', 'draw')),

  source_article_url text,
  created_at timestamptz not null default now(),

  unique (match_date, opponent_team_id, sequence)
);

create index matches_match_date_idx on matches (match_date desc);

-- ---------------------------------------------------------------------
-- match_officials — referee + other named officials, display strings only
-- (D13: no player/official entities in v1).
-- ---------------------------------------------------------------------
create table match_officials (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references matches (match_id) on delete cascade,
  role text not null check (role in ('referee', 'assistant_referee', 'tmo', 'other')),
  name text,
  name_provenance text not null default 'not_yet_fetched'
    check (name_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),
  created_at timestamptz not null default now()
);

create index match_officials_match_id_idx on match_officials (match_id);

-- ---------------------------------------------------------------------
-- match_lineups — both starting XVs where present; each name independently
-- carries its own D16 state (a lineup can be half-present).
-- ---------------------------------------------------------------------
create table match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references matches (match_id) on delete cascade,
  team_side text not null check (team_side in ('springboks', 'opponent')),
  shirt_number smallint,
  player_name text,
  player_name_provenance text not null default 'not_yet_fetched'
    check (player_name_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),
  created_at timestamptz not null default now()
);

create index match_lineups_match_id_idx on match_lineups (match_id);

-- ---------------------------------------------------------------------
-- match_events — one dataset, shared by game-detail (plain list) and the
-- timeline (plotted view) per PRD D7.
-- ---------------------------------------------------------------------
create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references matches (match_id) on delete cascade,
  sequence_no integer not null,
  event_type text not null
    check (event_type in ('try', 'conversion', 'penalty', 'drop_goal', 'yellow_card', 'red_card', 'other')),
  team_side text not null check (team_side in ('springboks', 'opponent')),
  description text,
  description_provenance text not null default 'not_yet_fetched'
    check (description_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),
  minute integer,
  minute_provenance text not null default 'not_yet_fetched'
    check (minute_provenance in ('present', 'absent_in_source', 'not_yet_fetched', 'fetch_failed')),
  created_at timestamptz not null default now(),

  unique (match_id, sequence_no)
);

create index match_events_match_id_idx on match_events (match_id);

-- ---------------------------------------------------------------------
-- fixtures_upstream — API-Sports-derived fixture rows, licence-separated
-- from the Wikipedia-derived tables per D15 (never mixed into one export).
-- ---------------------------------------------------------------------
create table fixtures_upstream (
  id uuid primary key default gen_random_uuid(),
  api_sports_fixture_id text unique,
  match_date date not null,
  opponent_team_id uuid not null references teams (id),
  kickoff_time timestamptz,
  venue text,
  competition text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index fixtures_upstream_match_date_idx on fixtures_upstream (match_date desc);

-- ---------------------------------------------------------------------
-- sentiment_scores — derived facts (D5/D23). Only score/label/URL/dates
-- are persisted; source content itself never is (D20).
-- ---------------------------------------------------------------------
create table sentiment_scores (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references matches (match_id) on delete cascade,
  bucket text not null
    check (bucket in ('pre_match', 'first_half', 'second_half', 'post_match', 'whole_match')),
  score numeric(4, 3) check (score >= -1 and score <= 1),
  label text check (label in ('Despair', 'Grumbling', 'Mixed', 'Upbeat', 'Euphoric')),
  bucket_source_count integer,
  too_few boolean not null default false,
  source text not null check (source in ('reddit', 'guardian')),
  source_url text,
  computed_at timestamptz not null default now(),

  unique (match_id, bucket, source)
);

create index sentiment_scores_match_id_idx on sentiment_scores (match_id);

-- ---------------------------------------------------------------------
-- source_snapshots — raw wikitext per source page, so parses are
-- reproducible and diffable (D17). Not displayed publicly.
-- ---------------------------------------------------------------------
create table source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_page text not null,
  match_id text references matches (match_id) on delete set null,
  wikitext text not null,
  fetched_at timestamptz not null default now()
);

create index source_snapshots_match_id_idx on source_snapshots (match_id);

-- ---------------------------------------------------------------------
-- ingestion_runs — ops guardrail per D25. Not displayed publicly.
-- ---------------------------------------------------------------------
create table ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pages_fetched integer not null default 0,
  rows_written integer not null default 0,
  failures integer not null default 0,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  notes text
);

-- =======================================================================
-- Row-level security
--
-- Public (anon) read access on display tables only; no anon writes
-- anywhere in this schema (writes happen only via the service-role key,
-- used exclusively by local ingestion scripts — D18/D19).
-- =======================================================================

alter table teams enable row level security;
alter table matches enable row level security;
alter table match_officials enable row level security;
alter table match_lineups enable row level security;
alter table match_events enable row level security;
alter table fixtures_upstream enable row level security;
alter table sentiment_scores enable row level security;
alter table source_snapshots enable row level security;
alter table ingestion_runs enable row level security;

create policy "public read teams" on teams for select to anon using (true);
create policy "public read matches" on matches for select to anon using (true);
create policy "public read match_officials" on match_officials for select to anon using (true);
create policy "public read match_lineups" on match_lineups for select to anon using (true);
create policy "public read match_events" on match_events for select to anon using (true);
create policy "public read fixtures_upstream" on fixtures_upstream for select to anon using (true);
create policy "public read sentiment_scores" on sentiment_scores for select to anon using (true);

-- source_snapshots and ingestion_runs are ingestion/ops internals — no
-- policy is created for them, so RLS's default-deny leaves them
-- unreadable (and unwritable) to anon.

-- Recent Supabase CLI versions no longer auto-expose newly created tables
-- to the PostgREST API roles (anon/authenticated/service_role) — RLS
-- policies alone are not enough, the role also needs the underlying SQL
-- GRANT. These grants only *permit* the check; RLS above is still what
-- actually restricts which rows come back.
grant usage on schema public to anon;
grant select on teams, matches, match_officials, match_lineups, match_events, fixtures_upstream, sentiment_scores to anon;
