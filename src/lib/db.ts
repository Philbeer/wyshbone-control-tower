import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../shared/schema";

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

// FAIL FAST: SUPABASE_DATABASE_URL is required
if (!SUPABASE_DATABASE_URL) {
  console.error("========================================");
  console.error("FATAL: SUPABASE_DATABASE_URL is required; refusing to start");
  console.error("========================================");
  console.error("Tower ONLY connects to Supabase Postgres.");
  console.error("Set SUPABASE_DATABASE_URL in your Secrets.");
  console.error("Do NOT use Replit's DATABASE_URL or PGHOST.");
  process.exit(1);
}

// Parse connection string to extract non-secret info for logging
function parseConnectionInfo(url: string): { host: string; database: string; user: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, "") || "unknown",
      user: parsed.username || "unknown",
    };
  } catch {
    return { host: "parse-error", database: "parse-error", user: "parse-error" };
  }
}

const connectionInfo = parseConnectionInfo(SUPABASE_DATABASE_URL);

// SAFETY CHECK: Ensure we're connected to Supabase, NOT Replit Postgres
const isSupabase = connectionInfo.host.includes("supabase.com") || connectionInfo.host.includes("supabase.co");
const isReplitPg = connectionInfo.host.includes("helium") || connectionInfo.host.includes("replit");

console.log("========================================");
console.log("Tower Database Connection Info:");
console.log(`  Host: ${connectionInfo.host}`);
console.log(`  Database: ${connectionInfo.database}`);
console.log(`  User: ${connectionInfo.user}`);
console.log(`  Is Supabase: ${isSupabase ? "YES ✓" : "NO"}`);
console.log(`  Is Replit PG: ${isReplitPg ? "YES (WARNING!)" : "NO ✓"}`);
console.log("========================================");

if (isReplitPg) {
  console.error("FATAL: SUPABASE_DATABASE_URL appears to point to Replit Postgres!");
  console.error("Tower must connect to Supabase, not Replit's internal database.");
  process.exit(1);
}

if (!isSupabase) {
  const isLocal = connectionInfo.host === "localhost" || connectionInfo.host === "127.0.0.1";
  if (isLocal) {
    console.warn("WARNING: SUPABASE_DATABASE_URL points to localhost. Acceptable for local dev only.");
  } else {
    console.error("FATAL: SUPABASE_DATABASE_URL does not point to a Supabase host.");
    console.error(`  Detected host: ${connectionInfo.host}`);
    console.error("  Expected host pattern: *.supabase.com or *.supabase.co");
    console.error("  In deployed environments, Tower must connect to Supabase only.");
    process.exit(1);
  }
}

const pool = new pg.Pool({
  connectionString: SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export { connectionInfo };
