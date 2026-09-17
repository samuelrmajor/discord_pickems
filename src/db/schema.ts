import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  name: text("name").primaryKey(),
});

export const games = pgTable(
  "games",
  {
    id: text("id").primaryKey(), // ESPN event id
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    shortName: text("short_name").notNull(),

    homeAbbr: text("home_abbr").notNull(),
    homeName: text("home_name").notNull(),
    homeLogo: text("home_logo"),
    awayAbbr: text("away_abbr").notNull(),
    awayName: text("away_name").notNull(),
    awayLogo: text("away_logo"),

    /** 'home' | 'away' | null — sticky, never overwritten with null. */
    favorite: text("favorite"),
    spread: real("spread"),

    /**
     * 'home' | 'away'. Drawn once when the game is first seeded, before anyone
     * votes, and never changed. Breaks a 6-6 deadlock in the consensus parlay.
     */
    coinFlip: text("coin_flip").notNull(),

    /** 'scheduled' | 'in_progress' | 'final' */
    status: text("status").notNull().default("scheduled"),
    statusDetail: text("status_detail").notNull().default(""),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    /** 'home' | 'away' | 'push' | null */
    winner: text("winner"),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("games_season_week_idx").on(t.season, t.week)]
);

export const picks = pgTable(
  "picks",
  {
    userName: text("user_name")
      .notNull()
      .references(() => users.name, { onDelete: "cascade" }),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 'home' | 'away' */
    choice: text("choice").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userName, t.gameId] })]
);

export type GameRow = typeof games.$inferSelect;
export type PickRow = typeof picks.$inferSelect;

/**
 * Raw-ish payloads pulled from Sleeper, one row per logical resource
 * ("league", "players", "matchups:2026:3", ...). Sleeper has no ETags and the
 * player dump is 11MB, so we slim each payload on ingest and let the DB be the
 * cache — it survives cold lambdas and deploys, unlike an in-process Map.
 */
export const fantasyCache = pgTable("fantasy_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One member's power-ranking ballot for one week.
 *
 * `order` is the full list of league member names, best first. Storing the
 * ordering rather than a row per (voter, ranked) pair keeps a ballot atomic:
 * a reorder is one write, and a half-applied ballot can't exist.
 */
export const ballots = pgTable(
  "ballots",
  {
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    voter: text("voter")
      .notNull()
      .references(() => users.name, { onDelete: "cascade" }),
    order: text("order").array().notNull(),
    /** The explicit "I'm done" flag. Editing stays open until the week locks. */
    lockedIn: boolean("locked_in").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.week, t.voter] }),
    index("ballots_season_week_idx").on(t.season, t.week),
  ]
);

export type FantasyCacheRow = typeof fantasyCache.$inferSelect;
export type BallotRow = typeof ballots.$inferSelect;
