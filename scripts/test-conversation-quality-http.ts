/**
 * EVAL-009: HTTP-Level Integration Test for Conversation Quality API
 * 
 * This script tests the HTTP endpoints directly to verify validation and responses.
 * Run with: npx tsx scripts/test-conversation-quality-http.ts
 * 
 * Note: Uses native fetch available in Node 18+
 */

// Ensure fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  throw new Error('This script requires Node 18+ with native fetch support');
}

async function testAPI() {
  const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
  
  console.log("\n=== EVAL-009 HTTP API Test ===\n");
  console.log(`Testing against: ${BASE_URL}\n`);
  
  try {
    // Test 1: POST with valid data
    console.log("Test 1: POST /tower/conversation-flag with valid data");
    const validPayload = {
      session_id: `test-http-${Date.now()}`,
      user_id: "test-user-http",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Help me with marketing" },
        { role: "assistant", content: "OK" }
      ],
      flagged_message_index: 2,
      user_note: "Response too brief"
    };
    
    const createResponse = await fetch(`${BASE_URL}/tower/conversation-flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload)
    });
    
    if (!createResponse.ok) {
      throw new Error(`Expected 200, got ${createResponse.status}: ${await createResponse.text()}`);
    }
    
    const createData = await createResponse.json();
    console.log(`✓ Status: ${createResponse.status}`);
    console.log(`✓ Investigation ID: ${createData.investigation_id}`);
    console.log(`✓ Status: ${createData.status}`);
    
    if (!createData.investigation_id || !createData.investigation_id.startsWith("cq-")) {
      throw new Error("Invalid investigation ID format");
    }
    
    // Test 2: POST without session_id (should fail)
    console.log("\nTest 2: POST without session_id (expect 400)");
    const invalidPayload1 = {
      user_id: "test",
      messages: validPayload.messages,
      flagged_message_index: 0
    };
    
    const invalidResponse1 = await fetch(`${BASE_URL}/tower/conversation-flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload1)
    });
    
    if (invalidResponse1.status !== 400) {
      throw new Error(`Expected 400, got ${invalidResponse1.status}`);
    }
    
    const errorData1 = await invalidResponse1.json();
    console.log(`✓ Status: ${invalidResponse1.status}`);
    console.log(`✓ Error: ${errorData1.error}`);
    
    if (!errorData1.error.includes("session_id")) {
      throw new Error("Error message should mention session_id");
    }
    
    // Test 3: POST without messages (should fail)
    console.log("\nTest 3: POST without messages (expect 400)");
    const invalidPayload2 = {
      session_id: "test",
      flagged_message_index: 0
    };
    
    const invalidResponse2 = await fetch(`${BASE_URL}/tower/conversation-flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload2)
    });
    
    if (invalidResponse2.status !== 400) {
      throw new Error(`Expected 400, got ${invalidResponse2.status}`);
    }
    
    const errorData2 = await invalidResponse2.json();
    console.log(`✓ Status: ${invalidResponse2.status}`);
    console.log(`✓ Error: ${errorData2.error}`);
    
    if (!errorData2.error.includes("messages")) {
      throw new Error("Error message should mention messages");
    }
    
    // Test 4: POST with invalid flagged_message_index (should fail)
    console.log("\nTest 4: POST with out-of-bounds flagged_message_index (expect 400)");
    const invalidPayload3 = {
      session_id: "test",
      messages: validPayload.messages,
      flagged_message_index: 999
    };
    
    const invalidResponse3 = await fetch(`${BASE_URL}/tower/conversation-flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload3)
    });
    
    if (invalidResponse3.status !== 400) {
      throw new Error(`Expected 400, got ${invalidResponse3.status}`);
    }
    
    const errorData3 = await invalidResponse3.json();
    console.log(`✓ Status: ${invalidResponse3.status}`);
    console.log(`✓ Error: ${errorData3.error}`);
    
    if (!errorData3.error.includes("flagged_message_index")) {
      throw new Error("Error message should mention flagged_message_index");
    }
    
    // Test 5: GET /tower/conversation-quality
    console.log("\nTest 5: GET /tower/conversation-quality");
    const getResponse = await fetch(`${BASE_URL}/tower/conversation-quality`);
    
    if (!getResponse.ok) {
      throw new Error(`Expected 200, got ${getResponse.status}: ${await getResponse.text()}`);
    }
    
    const investigations = await getResponse.json();
    console.log(`✓ Status: ${getResponse.status}`);
    console.log(`✓ Found ${investigations.length} investigation(s)`);
    
    if (!Array.isArray(investigations)) {
      throw new Error("Response should be an array");
    }
    
    // Verify our investigation is in the list
    const foundOurs = investigations.find((inv: any) => inv.id === createData.investigation_id);
    if (!foundOurs) {
      throw new Error("Could not find our investigation in the list");
    }
    
    console.log(`✓ Our investigation is in the response`);
    
    // Verify structure
    if (foundOurs.runMeta?.source !== "conversation_quality") {
      throw new Error(`Expected source='conversation_quality', got '${foundOurs.runMeta?.source}'`);
    }
    
    if (foundOurs.runMeta?.focus?.kind !== "conversation") {
      throw new Error(`Expected focus.kind='conversation', got '${foundOurs.runMeta?.focus?.kind}'`);
    }
    
    console.log(`✓ Investigation has correct metadata structure`);
    
    // Test 6: Deduplication
    console.log("\nTest 6: Test deduplication (same session_id)");
    const duplicatePayload = {
      ...validPayload,
      user_note: "Second flag for same session"
    };
    
    const dupResponse = await fetch(`${BASE_URL}/tower/conversation-flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(duplicatePayload)
    });
    
    if (!dupResponse.ok) {
      throw new Error(`Expected 200, got ${dupResponse.status}`);
    }
    
    const dupData = await dupResponse.json();
    
    if (dupData.investigation_id !== createData.investigation_id) {
      throw new Error("Deduplication failed - created new investigation instead of reusing existing");
    }
    
    console.log(`✓ Deduplication works - returned same investigation ID`);
    
    console.log("\n=== All HTTP API Tests Passed! ===\n");
    
  } catch (error) {
    console.error("\n❌ HTTP API test failed:", error);
    process.exit(1);
  }
}

// Wait for server to be ready
async function waitForServer(maxAttempts = 10) {
  const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/status.json`);
      if (response.ok) {
        console.log("✓ Server is ready");
        return;
      }
    } catch (err) {
      console.log(`Waiting for server... (attempt ${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error("Server did not become ready in time");
}

// Run the test
waitForServer()
  .then(() => testAPI())
  .then(() => {
    console.log("HTTP API test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("HTTP API test failed:", error);
    process.exit(1);
  });
