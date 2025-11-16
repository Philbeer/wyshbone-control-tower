/**
 * EVAL-009: Conversation Quality Investigation Integration Test
 * 
 * This script tests the end-to-end flow of conversation quality investigations.
 * Run with: npx tsx scripts/test-conversation-quality.ts
 * 
 * Prerequisites:
 * - Database must be running and migrated
 * - OPENAI_API_KEY must be set (for LLM analysis)
 */

import { createConversationQualityInvestigation, getAllConversationQualityInvestigations } from "../src/evaluator/conversationQualityInvestigations";
import { getInvestigationById } from "../src/evaluator/storeInvestigation";

const mockMessages = [
  {
    role: "system",
    content: "You are a helpful assistant for the Wyshbone platform."
  },
  {
    role: "user",
    content: "I need help setting up a marketing campaign for my business"
  },
  {
    role: "assistant",
    content: "OK"
  }
];

async function runTest() {
  console.log("\n=== EVAL-009 Integration Test ===\n");

  try {
    // Test 1: Create a conversation quality investigation
    console.log("Test 1: Creating conversation quality investigation...");
    const investigation = await createConversationQualityInvestigation({
      sessionId: `test-session-${Date.now()}`,
      userId: "test-user-integration",
      messages: mockMessages,
      flagged_message_index: 2,
      user_note: "Assistant response is too brief and unhelpful"
    });
    
    console.log(`✓ Created investigation: ${investigation.id}`);
    console.log(`  Trigger: ${investigation.trigger}`);
    console.log(`  Created at: ${investigation.createdAt}`);
    
    // Verify investigation metadata
    if (!investigation.runMeta) {
      throw new Error("Investigation missing runMeta");
    }
    
    const meta = investigation.runMeta as any;
    if (meta.source !== "conversation_quality") {
      throw new Error(`Expected source to be 'conversation_quality', got '${meta.source}'`);
    }
    
    if (meta.focus?.kind !== "conversation") {
      throw new Error(`Expected focus.kind to be 'conversation', got '${meta.focus?.kind}'`);
    }
    
    console.log(`✓ Investigation metadata is correct`);
    console.log(`  Source: ${meta.source}`);
    console.log(`  Focus kind: ${meta.focus?.kind}`);
    console.log(`  Session ID: ${meta.sessionId}`);
    console.log(`  Flagged message index: ${meta.flagged_message_index}`);
    
    // Test 2: Retrieve investigation by ID
    console.log("\nTest 2: Retrieving investigation by ID...");
    const retrieved = await getInvestigationById(investigation.id);
    
    if (!retrieved) {
      throw new Error("Failed to retrieve investigation");
    }
    
    console.log(`✓ Retrieved investigation: ${retrieved.id}`);
    
    // Test 3: List all conversation quality investigations
    console.log("\nTest 3: Listing all conversation quality investigations...");
    const allConversationInvestigations = await getAllConversationQualityInvestigations();
    
    console.log(`✓ Found ${allConversationInvestigations.length} conversation quality investigation(s)`);
    
    const foundOurs = allConversationInvestigations.find(inv => inv.id === investigation.id);
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
        console.log(`  Summary: ${analysis.summary}`);
        
        if (analysis.suggested_prompt_changes) {
          console.log(`  Suggested prompt changes: ${analysis.suggested_prompt_changes.substring(0, 100)}...`);
        }
        
        if (analysis.suggested_behaviour_test) {
          console.log(`  Suggested test: ${analysis.suggested_behaviour_test.substring(0, 100)}...`);
        }
        
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
    
    // Test 5: Deduplication test
    console.log("\nTest 5: Testing deduplication...");
    const sameSession = await createConversationQualityInvestigation({
      sessionId: meta.sessionId, // Use same session ID
      userId: meta.userId,
      messages: mockMessages,
      flagged_message_index: 2,
      user_note: "Another flag for the same session"
    });
    
    if (sameSession.id === investigation.id) {
      console.log(`✓ Deduplication works - returned same investigation ID`);
    } else {
      throw new Error("Deduplication failed - created duplicate investigation");
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
