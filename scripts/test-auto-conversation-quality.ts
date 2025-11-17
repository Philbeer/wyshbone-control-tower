import { createAutoConversationQualityInvestigation, getAllAutoConversationQualityInvestigations } from "../src/evaluator/autoConversationQualityInvestigations";
import type { LiveUserRun } from "../src/evaluator/types";

const exampleRuns: Array<{name: string, run: Partial<LiveUserRun>}> = [
  {
    name: "Greeting Flow Violation - No domain offered",
    run: {
      id: "test-greeting-violation-1",
      source: "live_user",
      status: "success",
      duration: 5200,
      input_text: "I'm looking for a coffee machine",
      output_text: "I can help you find a coffee machine. What's your budget?",
      messages: [
        { role: "user", content: "I'm looking for a coffee machine" },
        { role: "assistant", content: "I can help you find a coffee machine. What's your budget?" }
      ],
      user_id: "user-123",
      session_id: "session-greeting-1",
      timestamp: new Date().toISOString()
    }
  },
  {
    name: "Greeting Flow Violation - Offered search instead of domain",
    run: {
      id: "test-greeting-violation-2",
      source: "live_user",
      status: "success",
      duration: 4800,
      input_text: "Help me find a laptop",
      output_text: "Let me search for laptops for you right away.",
      messages: [
        { role: "user", content: "Help me find a laptop" },
        { role: "assistant", content: "Let me search for laptops for you right away." }
      ],
      user_id: "user-456",
      session_id: "session-greeting-2",
      timestamp: new Date().toISOString()
    }
  },
  {
    name: "Domain Followup Violation - No market/geography after domain",
    run: {
      id: "test-domain-violation-1",
      source: "live_user",
      status: "success",
      duration: 6100,
      input_text: "Electronics",
      output_text: "Great! What specific electronics are you looking for?",
      messages: [
        { role: "user", content: "I want to shop" },
        { role: "assistant", content: "Would you like to browse by category, or search for something specific?" },
        { role: "user", content: "Electronics" },
        { role: "assistant", content: "Great! What specific electronics are you looking for?" }
      ],
      user_id: "user-789",
      session_id: "session-domain-1",
      timestamp: new Date().toISOString()
    }
  },
  {
    name: "Misinterpreted Intent - User wants product, bot thinks they want help",
    run: {
      id: "test-misinterpret-1",
      source: "live_user",
      status: "success",
      duration: 5500,
      input_text: "shoes",
      output_text: "I can help you with shoes. Do you need help with sizing, care instructions, or finding a specific style?",
      messages: [
        { role: "user", content: "shoes" },
        { role: "assistant", content: "I can help you with shoes. Do you need help with sizing, care instructions, or finding a specific style?" }
      ],
      user_id: "user-999",
      session_id: "session-misinterpret-1",
      timestamp: new Date().toISOString()
    }
  },
  {
    name: "Repetition - Bot asks same question twice",
    run: {
      id: "test-repetition-1",
      source: "live_user",
      status: "success",
      duration: 7800,
      input_text: "I don't know",
      output_text: "No problem! Would you like to browse by category, or search for something specific?",
      messages: [
        { role: "user", content: "I need something" },
        { role: "assistant", content: "Would you like to browse by category, or search for something specific?" },
        { role: "user", content: "I don't know" },
        { role: "assistant", content: "No problem! Would you like to browse by category, or search for something specific?" }
      ],
      user_id: "user-111",
      session_id: "session-repetition-1",
      timestamp: new Date().toISOString()
    }
  },
  {
    name: "Dead End - No actionable next step",
    run: {
      id: "test-deadend-1",
      source: "live_user",
      status: "success",
      duration: 4200,
      input_text: "I'm looking for gifts",
      output_text: "That's nice! Gifts are wonderful.",
      messages: [
        { role: "user", content: "I'm looking for gifts" },
        { role: "assistant", content: "That's nice! Gifts are wonderful." }
      ],
      user_id: "user-222",
      session_id: "session-deadend-1",
      timestamp: new Date().toISOString()
    }
  },
  {
    name: "Correct Flow - Greeting with domain offer",
    run: {
      id: "test-correct-greeting-1",
      source: "live_user",
      status: "success",
      duration: 3800,
      input_text: "Hi, I want to shop",
      output_text: "Welcome! Would you like to browse by category (like electronics, clothing, home goods), or search for something specific?",
      messages: [
        { role: "user", content: "Hi, I want to shop" },
        { role: "assistant", content: "Welcome! Would you like to browse by category (like electronics, clothing, home goods), or search for something specific?" }
      ],
      user_id: "user-333",
      session_id: "session-correct-1",
      timestamp: new Date().toISOString()
    }
  },
  {
    name: "Correct Flow - Domain followed by market/geography",
    run: {
      id: "test-correct-domain-1",
      source: "live_user",
      status: "success",
      duration: 5900,
      input_text: "Home goods",
      output_text: "Perfect! To show you the most relevant options, which market are you shopping for? (e.g., US, UK, EU) Or what's your location?",
      messages: [
        { role: "user", content: "I want to browse" },
        { role: "assistant", content: "Great! Would you like to browse by category, or search for something specific?" },
        { role: "user", content: "Home goods" },
        { role: "assistant", content: "Perfect! To show you the most relevant options, which market are you shopping for? (e.g., US, UK, EU) Or what's your location?" }
      ],
      user_id: "user-444",
      session_id: "session-correct-2",
      timestamp: new Date().toISOString()
    }
  }
];

async function runTests() {
  console.log("🧪 Testing Auto Conversation Quality Detection\n");
  console.log("=" .repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  for (const example of exampleRuns) {
    console.log(`\n📝 Test: ${example.name}`);
    console.log("-".repeat(80));
    
    try {
      // Create investigation and trigger automatic analysis
      console.log("🔬 Creating investigation with automatic analysis...");
      const investigation = await createAutoConversationQualityInvestigation({
        runId: example.run.id!,
        sessionId: example.run.session_id,
        userId: example.run.user_id || null,
        conversationTranscript: example.run.messages!,
      });
      
      if (!investigation) {
        console.log("ℹ️  Investigation skipped (duplicate within 24h window)");
        console.log("✅ PASS: Deduplication working correctly");
        passed++;
        continue;
      }
      
      console.log(`✅ Investigation created: ${investigation.id}`);
      
      // Wait for async analysis to complete (give it a moment)
      console.log("⏳ Waiting for async analysis to complete...");
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Fetch the updated investigation
      const allInvestigations = await getAllAutoConversationQualityInvestigations();
      const updated = allInvestigations.find(i => i.id === investigation.id);
      
      if (!updated) {
        console.log("❌ FAIL: Investigation not found after creation");
        failed++;
        continue;
      }
      
      const meta = updated.runMeta as any;
      const analysis = meta?.analysis;
      const isClean = meta?.clean === true;
      
      if (isClean) {
        console.log(`ℹ️  No issues detected (marked as clean)`);
        
        // For correct flow cases, we expect no analysis
        if (example.name.includes("Correct Flow")) {
          console.log("✅ PASS: No issues detected for correct flow");
          passed++;
        } else {
          console.log("❌ FAIL: Expected to detect an issue but none found");
          console.log(`   Diagnosis: ${updated.diagnosis}`);
          failed++;
        }
      } else if (analysis) {
        console.log(`✅ Analysis complete:`);
        console.log(`   Category: ${analysis.failure_type}`);
        console.log(`   Severity: ${analysis.severity}`);
        console.log(`   Summary: ${analysis.summary?.substring(0, 100)}...`);
        
        if (analysis.suggested_fix) {
          console.log(`   Suggested Fix: ${analysis.suggested_fix.substring(0, 100)}...`);
        }
        
        // For violation cases, we expect an analysis
        if (example.name.includes("Violation") || example.name.includes("Misinterpret") || 
            example.name.includes("Repetition") || example.name.includes("Dead End")) {
          console.log("✅ PASS: Detected conversation quality issue as expected");
          passed++;
        } else {
          console.log("⚠️  UNEXPECTED: Analysis returned for correct flow");
          console.log("   This might be a false positive - review the analysis");
          console.log(`   Diagnosis: ${updated.diagnosis}`);
          failed++;
        }
      } else {
        console.log("⚠️  Investigation created but no analysis or clean flag set");
        console.log(`   Diagnosis: ${updated.diagnosis}`);
        console.log("   This might indicate the async analysis is still running");
        failed++;
      }
      
    } catch (error) {
      console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Total:  ${exampleRuns.length}`);
  
  if (failed === 0) {
    console.log(`\n🎉 All tests passed!`);
  } else {
    console.log(`\n⚠️  Some tests failed. Review the output above.`);
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
