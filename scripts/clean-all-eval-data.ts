/**
 * MANUAL MAINTENANCE TOOL - DO NOT RUN AUTOMATICALLY IN PRODUCTION
 * 
 * This script deletes ALL historical evaluation data from the Wyshbone Tower database,
 * including runs, investigations, behaviour test runs, patch evaluations, and patch suggestions.
 * 
 * Use this when you want to reset the evaluation state to start fresh.
 * 
 * It does NOT delete:
 * - Schema tables (users, behaviourTests)
 * - Config/feature flags
 * - Tasks/roadmap definitions (stored in JSON files)
 * 
 * Usage: npx tsx scripts/clean-all-eval-data.ts
 */

import { db } from "../src/lib/db";
import { 
  runs, 
  investigations, 
  behaviourTestRuns, 
  patchEvaluations, 
  patchSuggestions 
} from "../shared/schema";

async function cleanAllEvalData() {
  console.log("🧹 Cleaning ALL evaluation data from Wyshbone Tower database...\n");
  
  try {
    // Delete patch suggestions first (references patch evaluations)
    console.log("📦 Deleting patch suggestions...");
    const patchSuggestionsResult = await db.delete(patchSuggestions);
    console.log(`   ✅ Deleted ${patchSuggestionsResult.rowCount || 0} patch suggestion(s)\n`);
    
    // Delete patch evaluations
    console.log("🔬 Deleting patch evaluations...");
    const patchEvaluationsResult = await db.delete(patchEvaluations);
    console.log(`   ✅ Deleted ${patchEvaluationsResult.rowCount || 0} patch evaluation(s)\n`);
    
    // Delete behaviour test runs
    console.log("🧪 Deleting behaviour test runs...");
    const behaviourTestRunsResult = await db.delete(behaviourTestRuns);
    console.log(`   ✅ Deleted ${behaviourTestRunsResult.rowCount || 0} behaviour test run(s)\n`);
    
    // Delete investigations (conversation quality, auto conversation quality, patch failures, etc.)
    console.log("🔍 Deleting all investigations...");
    const investigationsResult = await db.delete(investigations);
    console.log(`   ✅ Deleted ${investigationsResult.rowCount || 0} investigation(s)\n`);
    
    // Delete runs (live_user, test_user, etc.)
    console.log("🏃 Deleting all runs...");
    const runsResult = await db.delete(runs);
    console.log(`   ✅ Deleted ${runsResult.rowCount || 0} run(s)\n`);
    
    // Summary
    console.log("=" .repeat(80));
    console.log("✨ CLEANUP COMPLETE\n");
    console.log("Summary:");
    console.log(`   • Runs deleted:               ${runsResult.rowCount || 0}`);
    console.log(`   • Investigations deleted:     ${investigationsResult.rowCount || 0}`);
    console.log(`   • Behaviour test runs:        ${behaviourTestRunsResult.rowCount || 0}`);
    console.log(`   • Patch evaluations:          ${patchEvaluationsResult.rowCount || 0}`);
    console.log(`   • Patch suggestions:          ${patchSuggestionsResult.rowCount || 0}`);
    console.log("=" .repeat(80));
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error during cleanup:", error);
    process.exit(1);
  }
}

cleanAllEvalData();
