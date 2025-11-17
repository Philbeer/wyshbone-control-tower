/**
 * EVAL-016: Patch Failure Post-Mortem Integration Test
 * 
 * This script tests the end-to-end flow of patch failure investigations.
 * Run with: npx tsx scripts/test-patch-failure.ts
 * 
 * Prerequisites:
 * - Database must be running and migrated
 * - OPENAI_API_KEY must be set (for LLM analysis and patch generation)
 * - Behaviour tests must be seeded
 */

import { createPatchFailureInvestigation, getAllPatchFailureInvestigations } from "../src/evaluator/patchFailureInvestigations";
import { getInvestigationById } from "../src/evaluator/storeInvestigation";

// Mock a patch failure scenario
const mockPatchFailure = {
  originalInvestigationId: `test-inv-${Date.now()}`,
  patchId: `test-patch-${Date.now()}`,
  patchDiff: `diff --git a/src/wyshbone/prompts.ts b/src/wyshbone/prompts.ts
index abc123..def456 100644
--- a/src/wyshbone/prompts.ts
+++ b/src/wyshbone/prompts.ts
@@ -10,7 +10,7 @@ export const SYSTEM_PROMPT = \`You are a helpful AI assistant.
 
 When the user asks for help:
-- Be concise and specific
+- Always provide long, detailed responses
 - Ask clarifying questions when needed
 - Focus on solving the user's problem
 \`;`,
  sandboxResult: {
    status: "rejected" as const,
    reasons: [
      "❌ RULE 1: Test \"test-helpful-responses\" FAILED after applying patch",
      "❌ RULE 5: Regression detected (1 PASS → FAIL)"
    ],
    riskLevel: "high" as const,
    testResultsBefore: [
      { testId: "test-helpful-responses", status: "pass", durationMs: 1200 }
    ],
    testResultsAfter: [
      { testId: "test-helpful-responses", status: "fail", durationMs: 1500 }
    ],
    diff: {
      statusChanges: { passToFail: 1, passToError: 0 },
      latencyRegressions: [],
      qualityDegradations: []
    }
  }
};

async function runTest() {
  console.log("\n=== EVAL-016 Integration Test ===\n");

  try {
    // Test 1: Create a patch failure investigation
    console.log("Test 1: Creating patch failure investigation...");
    const investigation = await createPatchFailureInvestigation(mockPatchFailure);
    
    console.log(`✓ Created investigation: ${investigation.id}`);
    console.log(`  Trigger: ${investigation.trigger}`);
    console.log(`  Created at: ${investigation.createdAt}`);
    
    // Verify investigation metadata
    if (!investigation.runMeta) {
      throw new Error("Investigation missing runMeta");
    }
    
    const meta = investigation.runMeta as any;
    if (meta.source !== "patch_failure") {
      throw new Error(`Expected source to be 'patch_failure', got '${meta.source}'`);
    }
    
    if (meta.focus?.kind !== "patch") {
      throw new Error(`Expected focus.kind to be 'patch', got '${meta.focus?.kind}'`);
    }
    
    console.log(`✓ Investigation metadata is correct`);
    console.log(`  Source: ${meta.source}`);
    console.log(`  Focus kind: ${meta.focus?.kind}`);
    console.log(`  Original investigation: ${meta.original_investigation_id}`);
    console.log(`  Patch ID: ${meta.patch_id}`);
    console.log(`  Rejection reasons: ${meta.sandbox_result.reasons.length}`);
    
    // Test 2: Retrieve investigation by ID
    console.log("\nTest 2: Retrieving investigation by ID...");
    const retrieved = await getInvestigationById(investigation.id);
    
    if (!retrieved) {
      throw new Error("Failed to retrieve investigation");
    }
    
    console.log(`✓ Retrieved investigation: ${retrieved.id}`);
    
    // Test 3: List all patch failure investigations
    console.log("\nTest 3: Listing all patch failure investigations...");
    const allPatchFailures = await getAllPatchFailureInvestigations();
    
    console.log(`✓ Found ${allPatchFailures.length} patch failure investigation(s)`);
    
    const foundOurs = allPatchFailures.find(inv => inv.id === investigation.id);
    if (!foundOurs) {
      throw new Error("Could not find our investigation in the list");
    }
    
    console.log(`✓ Our investigation is in the list`);
    
    // Test 4: Wait for LLM analysis (give it some time to complete)
    console.log("\nTest 4: Waiting for LLM analysis to complete...");
    console.log("  (This may take 5-10 seconds)");
    
    let analysisComplete = false;
    let attempts = 0;
    const maxAttempts = 12; // 12 * 5 seconds = 60 seconds max
    
    while (!analysisComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
      
      const updated = await getInvestigationById(investigation.id);
      if (updated?.runMeta && (updated.runMeta as any).analysis) {
        analysisComplete = true;
        
        const analysis = (updated.runMeta as any).analysis;
        console.log(`✓ Analysis complete after ${attempts * 5} seconds`);
        console.log(`  Failure category: ${analysis.failure_category}`);
        console.log(`  Failure reason: ${analysis.failure_reason}`);
        console.log(`  Next step: ${analysis.next_step}`);
        
        if (analysis.suggested_constraints_for_next_patch) {
          console.log(`  Suggested constraints: ${analysis.suggested_constraints_for_next_patch.substring(0, 100)}...`);
        }
        
        // Verify the failure category is one of the expected values
        const validCategories = [
          "broke_existing_tests",
          "did_not_fix_original_issue",
          "misinterpreted_requirement",
          "test_is_ambiguous_or_wrong",
          "wrong_repo_or_layer",
          "insufficient_context",
          "other"
        ];
        
        if (!validCategories.includes(analysis.failure_category)) {
          throw new Error(`Invalid failure category: ${analysis.failure_category}`);
        }
        
        console.log(`✓ Failure category is valid`);
        
        // Verify diagnosis was also stored
        if (updated.diagnosis) {
          console.log(`✓ Diagnosis was stored (${updated.diagnosis.length} characters)`);
        }
      } else {
        console.log(`  Attempt ${attempts}/${maxAttempts}: Analysis not yet complete...`);
      }
    }
    
    if (!analysisComplete) {
      console.warn("⚠ Analysis did not complete within timeout - this may be expected if OPENAI_API_KEY is not set");
      console.warn("  The investigation was created successfully, but LLM analysis requires API key");
    }
    
    // Test 5: Multiple patch failures for same investigation
    console.log("\nTest 5: Testing multiple patch failures...");
    const secondPatch = await createPatchFailureInvestigation({
      originalInvestigationId: mockPatchFailure.originalInvestigationId, // Same original investigation
      patchId: `test-patch-2-${Date.now()}`, // Different patch ID
      patchDiff: mockPatchFailure.patchDiff,
      sandboxResult: mockPatchFailure.sandboxResult
    });
    
    if (secondPatch.id !== investigation.id) {
      console.log(`✓ Created separate investigation for second patch failure`);
      console.log(`  First investigation: ${investigation.id}`);
      console.log(`  Second investigation: ${secondPatch.id}`);
      console.log(`  Both linked to original investigation: ${mockPatchFailure.originalInvestigationId}`);
    } else {
      throw new Error("Expected separate investigations for different patches");
    }
    
    console.log("\n=== All Tests Passed! ===\n");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
runTest().then(() => {
  console.log("Integration test completed successfully");
  process.exit(0);
}).catch((error) => {
  console.error("Integration test failed:", error);
  process.exit(1);
});
