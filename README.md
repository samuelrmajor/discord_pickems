# Pick'em

Weekly NFL pick'em for a group of twelve, and the consensus parlay that comes out of it.

Everyone picks a winner for every game. The group's majority pick on each game becomes one leg
of an n-leg parlay. Games, kickoff times, betting lines and scores all come from ESPN's public
API, so nothing has to be entered by hand.

## How it works

- **Login is just your name.** No passwords. The choice is stored in a cookie for a year, so you
  only do it once per device.
- **Picks save as you tap.** There is no save button. Each tap writes straight to the database.
- **Games lock at their own kickoff.** The Thursday game locking doesn't stop you from editing
  Sunday.
- **Bulk buttons** fill a whole week at once: all home, all away, or all favorites (from the
  DraftKings line ESPN publishes). The first tap fills only the games you haven't picked; tap the
  same button again to confirm overwriting the ones you have.
- **Ties are settled by a coin flip drawn in advance.** When the week is first loaded, every game
  gets a random side assigned and shown on its card (`tie -> SEA`). If the group splits 6-6, that side
  takes the parlay leg. Because it's drawn and displayed before anyone votes, nobody can game it.
- **The screen you land on follows the season, not the clock.** Any unlocked game you haven't
  picked puts you on Picks; otherwise you land on Results. So Monday and Tuesday show results,
  and Wednesday — when ESPN rolls over to a fresh slate — puts you back on picks. Results and
  Parlay are always one tap away, and the week arrows in the header let you pick future weeks
  ahead of time.

## Setup

1. **Database.** Create a free project at [neon.tech](https://neon.tech), copy the pooled
   connection string, and put it in `.env.local`:

   ```
   DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require"
   ```

   (`.env.example` has the shape.)

2. **Create the tables and load the schedule:**

   ```bash
   npm install
   npm run db:push     # creates users / games / picks
   npm run db:seed     # seeds the 12 members + pulls the full season schedule
   ```

   `npm run db:seed 1,2,3` limits the sync to specific weeks.

3. **Run it:**

   ```bash
   npm run dev
   ```

## Deploying

Push to GitHub, import the repo at [vercel.com](https://vercel.com), and set `DATABASE_URL` in
the project's environment variables. That's the only variable needed. Share the deployment URL
with the group.

## Keeping scores current

There's no cron. Every page load checks how stale the week's data is and re-syncs from ESPN if
needed — every 45 seconds while games are live, every 15 minutes otherwise. `/api/sync?week=3`
forces a resync by hand.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm test` | Grading, standings and consensus checks (no database needed) |
| `npm run test:db` | End-to-end checks against the real database (writes and cleans up after itself) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply the schema to Postgres |
| `npm run db:seed` | Seed members and sync the schedule |

## Layout

```
src/lib/espn.ts      ESPN client — schedule, odds, scores, week calendar
src/lib/sync.ts      Upserts a week; keeps coin flips and lines from being clobbered
src/lib/scoring.ts   Grading, standings, and the consensus parlay
src/lib/queries.ts   All database reads and writes
src/db/schema.ts     users / games / picks
src/app/week/[week]  The one page, with Picks / Results / Parlay tabs
```
