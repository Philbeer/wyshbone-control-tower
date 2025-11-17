import { db } from "../src/lib/db";
import { investigations } from "../shared/schema";
import { sql } from "drizzle-orm";

async function cleanAutoInvestigations() {
  console.log("🧹 Cleaning auto conversation quality investigations...");
  
  const result = await db
    .delete(investigations)
    .where(sql`${investigations.run_meta}->>'source' = 'auto_conversation_quality'`);
  
  console.log(`✅ Deleted ${result.rowCount} investigations`);
  process.exit(0);
}

cleanAutoInvestigations().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
