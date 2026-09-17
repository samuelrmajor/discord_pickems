-- One-time DDL for the power-rankings module.
--
-- Normally `npm run db:push` handles this, but that needs a direct Postgres
-- connection on port 5432, which some networks block outright. Everything here
-- is idempotent, so it is safe to run more than once, and safe to run even if
-- a later `db:push` from a permissive network gets there first.

CREATE TABLE IF NOT EXISTS "fantasy_cache" (
  "key"        text PRIMARY KEY NOT NULL,
  "payload"    jsonb NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ballots" (
  "season"       integer NOT NULL,
  "week"         integer NOT NULL,
  "voter"        text NOT NULL,
  "order"        text[] NOT NULL,
  "locked_in"    boolean DEFAULT false NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ballots_season_week_voter_pk" PRIMARY KEY ("season", "week", "voter")
);

DO $$ BEGIN
  ALTER TABLE "ballots"
    ADD CONSTRAINT "ballots_voter_users_name_fk"
    FOREIGN KEY ("voter") REFERENCES "users"("name") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ballots_season_week_idx" ON "ballots" ("season", "week");
