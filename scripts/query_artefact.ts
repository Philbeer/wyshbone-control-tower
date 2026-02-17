import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    SELECT id, title, 
      substring(payload_json::text, 1, 2000) as pp
    FROM artefacts 
    ORDER BY created_at DESC NULLS LAST
    LIMIT 5
  `);
  for (const row of result.rows) {
    console.log("=== ARTEFACT:", row.id, "===");
    console.log("title:", row.title);
    console.log("payload:", row.pp);
    console.log("");
  }
  if (result.rows.length === 0) {
    console.log("No artefacts found in table");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
