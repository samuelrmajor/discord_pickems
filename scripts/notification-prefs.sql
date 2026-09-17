-- Per-user, per-module Discord reminder opt-ins.
-- An absent row means off; a row is written only when someone switches a
-- module on.
-- Apply with: npm run db:sql scripts/notification-prefs.sql
-- (or `npm run db:push` from a network that allows port 5432)

CREATE TABLE IF NOT EXISTS "notification_prefs" (
  "user_name"  text NOT NULL,
  "module_key" text NOT NULL,
  "enabled"    boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_prefs_user_name_module_key_pk" PRIMARY KEY ("user_name", "module_key")
);

DO $$ BEGIN
  ALTER TABLE "notification_prefs"
    ADD CONSTRAINT "notification_prefs_user_name_users_name_fk"
    FOREIGN KEY ("user_name") REFERENCES "users"("name") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
