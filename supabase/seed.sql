-- Seed data for the local walking skeleton (#73).
--
-- Three real, well-documented matches, chosen so the skeleton proves the
-- full pipeline (teams -> matches -> officials/lineups/events) without
-- pretending to be a full backfill. Facts below (dates, venues, scores,
-- referees) are drawn from public record; anything not filled in here is
-- left with an honest 'not_yet_fetched' provenance rather than guessed —
-- the real backfill (a later ingestion slice) will fill it from Wikipedia
-- wikitext per docs/prd.md D17.

insert into teams (id, canonical_name, aliases) values
  ('00000000-0000-0000-0000-000000000001', 'New Zealand', array['All Blacks']),
  ('00000000-0000-0000-0000-000000000002', 'England', array[]::text[])
;

-- 1995 Rugby World Cup Final — South Africa 15-12 New Zealand (aet),
-- 24 June 1995, Ellis Park, Johannesburg. Joel Stransky's extra-time drop
-- goal remains one of the most famous moments in Springbok history.
insert into matches (
  match_id, match_date, opponent_team_id, sequence,
  competition, competition_provenance,
  venue, venue_provenance,
  kickoff_time, kickoff_time_provenance,
  home_away,
  springboks_score, springboks_score_provenance,
  opponent_score, opponent_score_provenance,
  result
) values (
  '1995-06-24-new-zealand-1', '1995-06-24', '00000000-0000-0000-0000-000000000001', 1,
  'Rugby World Cup Final', 'present',
  'Ellis Park, Johannesburg', 'present',
  null, 'not_yet_fetched',
  'home',
  15, 'present',
  12, 'present',
  'win'
);

insert into match_officials (match_id, role, name, name_provenance) values
  ('1995-06-24-new-zealand-1', 'referee', 'Ed Morrison (England)', 'present');

insert into match_events (match_id, sequence_no, event_type, team_side, description, description_provenance, minute, minute_provenance) values
  ('1995-06-24-new-zealand-1', 1, 'penalty', 'springboks', 'Joel Stransky penalty', 'present', null, 'not_yet_fetched'),
  ('1995-06-24-new-zealand-1', 2, 'penalty', 'opponent', 'Andrew Mehrtens penalty', 'present', null, 'not_yet_fetched'),
  ('1995-06-24-new-zealand-1', 3, 'drop_goal', 'springboks', 'Joel Stransky extra-time drop goal — the match winner', 'present', null, 'not_yet_fetched');

-- 2007 Rugby World Cup Final — South Africa 15-6 England,
-- 20 October 2007, Stade de France, Saint-Denis.
insert into matches (
  match_id, match_date, opponent_team_id, sequence,
  competition, competition_provenance,
  venue, venue_provenance,
  kickoff_time, kickoff_time_provenance,
  home_away,
  springboks_score, springboks_score_provenance,
  opponent_score, opponent_score_provenance,
  result
) values (
  '2007-10-20-england-1', '2007-10-20', '00000000-0000-0000-0000-000000000002', 1,
  'Rugby World Cup Final', 'present',
  'Stade de France, Saint-Denis', 'present',
  null, 'not_yet_fetched',
  'neutral',
  15, 'present',
  6, 'present',
  'win'
);

insert into match_officials (match_id, role, name, name_provenance) values
  ('2007-10-20-england-1', 'referee', 'Alain Rolland (Ireland)', 'present');

insert into match_events (match_id, sequence_no, event_type, team_side, description, description_provenance, minute, minute_provenance) values
  ('2007-10-20-england-1', 1, 'penalty', 'springboks', 'Percy Montgomery penalty', 'present', null, 'not_yet_fetched'),
  ('2007-10-20-england-1', 2, 'penalty', 'springboks', 'Percy Montgomery penalty', 'present', null, 'not_yet_fetched'),
  ('2007-10-20-england-1', 3, 'penalty', 'opponent', 'Jonny Wilkinson penalty', 'present', null, 'not_yet_fetched'),
  ('2007-10-20-england-1', 4, 'penalty', 'springboks', 'Francois Steyn penalty', 'present', null, 'not_yet_fetched');

-- 2015 Rugby World Cup semi-final — New Zealand 20-18 South Africa,
-- 24 October 2015, Twickenham Stadium, London. Included deliberately as a
-- loss, so the History table's W/D/L colouring (docs/design.md) has more
-- than one state to render in the skeleton.
insert into matches (
  match_id, match_date, opponent_team_id, sequence,
  competition, competition_provenance,
  venue, venue_provenance,
  kickoff_time, kickoff_time_provenance,
  home_away,
  springboks_score, springboks_score_provenance,
  opponent_score, opponent_score_provenance,
  result
) values (
  '2015-10-24-new-zealand-1', '2015-10-24', '00000000-0000-0000-0000-000000000001', 1,
  'Rugby World Cup Semi-Final', 'present',
  'Twickenham Stadium, London', 'present',
  null, 'not_yet_fetched',
  'neutral',
  18, 'present',
  20, 'present',
  'loss'
);

insert into match_officials (match_id, role, name, name_provenance) values
  ('2015-10-24-new-zealand-1', 'referee', 'Craig Joubert (South Africa)', 'present');

insert into match_events (match_id, sequence_no, event_type, team_side, description, description_provenance, minute, minute_provenance) values
  ('2015-10-24-new-zealand-1', 1, 'try', 'opponent', 'Jerome Kaino try', 'present', null, 'not_yet_fetched'),
  ('2015-10-24-new-zealand-1', 2, 'try', 'springboks', 'Fourie du Preez try', 'present', null, 'not_yet_fetched');
