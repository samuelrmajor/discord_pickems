-- One-time DDL for the anytime-touchdown module.
--
-- Same story as fantasy-tables.sql: `npm run db:push` does this too, but needs
-- port 5432. Idempotent, so it is safe to run more than once.
--
--   npm run db:sql scripts/td-tables.sql

CREATE TABLE IF NOT EXISTS "td_picks" (
  "season"       integer NOT NULL,
  "week"         integer NOT NULL,
  "user_name"    text NOT NULL,
  "athlete_id"   text NOT NULL,
  "athlete_name" text NOT NULL,
  "position"     text NOT NULL,
  "team_abbr"    text NOT NULL,
  "game_id"      text NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "td_picks_season_week_user_name_pk" PRIMARY KEY ("season", "week", "user_name")
);

DO $$ BEGIN
  ALTER TABLE "td_picks"
    ADD CONSTRAINT "td_picks_user_name_users_name_fk"
    FOREIGN KEY ("user_name") REFERENCES "users"("name") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "td_picks"
    ADD CONSTRAINT "td_picks_game_id_games_id_fk"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "td_picks_season_week_athlete_idx"
  ON "td_picks" ("season", "week", "athlete_id");
