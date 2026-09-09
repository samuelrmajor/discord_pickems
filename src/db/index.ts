import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string."
  );
}

// Reuse the client across hot reloads / lambda invocations.
const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const client = globalForDb.__pg ?? postgres(connectionString, { prepare: false, max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
