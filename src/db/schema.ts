import {
  index,
  integer,
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
