/**
 * Run a .sql file against Neon over its HTTPS endpoint.
 *
 * `drizzle-kit push` needs a direct connection on port 5432, which plenty of
 * networks block. Neon also speaks SQL over HTTPS on 443, which almost nothing
 * blocks, so this is the fallback path for applying DDL.
 *
 * Usage: npx tsx scripts/apply-sql.ts scripts/fantasy-tables.sql
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const file = process.argv[2];
if (!file) throw new Error("usage: tsx scripts/apply-sql.ts <file.sql>");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

/** Split on semicolons, but never inside a $$ ... $$ block. */
function statements(sql: string): string[] {
  const out: string[] = [];
  let buffer = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    if (line.trim().startsWith("--")) continue;
    if ((line.match(/\$\$/g)?.length ?? 0) % 2 === 1) inDollar = !inDollar;
    buffer += line + "\n";
    if (!inDollar && line.trimEnd().endsWith(";")) {
      if (buffer.trim()) out.push(buffer.trim());
      buffer = "";
    }
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out;
}

async function run(sql: string): Promise<void> {
  const host = new URL(url!).hostname;
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": url!,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "true",
    },
    body: JSON.stringify({ query: sql, params: [] }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

async function main() {
  const all = statements(readFileSync(file, "utf8"));
  console.log(`applying ${all.length} statements from ${file}`);
  for (const sql of all) {
    const label = sql.replace(/\s+/g, " ").slice(0, 68);
    await run(sql);
    console.log("  ok -", label);
  }
  console.log("done.");
}

main();
