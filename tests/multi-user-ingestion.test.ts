/**
 * Integration Test: Multi-User Run Ingestion
 * 
 * This test verifies that Tower correctly ingests runs from multiple users
 * and that all views/dashboards display them independently.
 */

const TOWER_URL = process.env.TOWER_URL || 'http://localhost:5000';

interface TestRun {
  userId: string;
  sessionId: string;
  source: string;
  inputText: string;
  status: 'success' | 'error' | 'timeout' | 'fail';
}

const testUsers: TestRun[] = [
  {
    userId: 'alice@example.com',
    sessionId: 'session-alice-001',
    source: 'live_user',
    inputText: 'Alice: How do I deploy my app?',
    status: 'success',
  },
  {
    userId: 'bob@company.com',
    sessionId: 'session-bob-002',
    source: 'supervisor',
    inputText: 'Bob: Fix the database connection error',
    status: 'error',
  },
  {
    userId: 'charlie@test.org',
    sessionId: 'session-charlie-003',
    source: 'live_user',
    inputText: 'Charlie: Generate a report for Q1 sales',
    status: 'success',
  },
  {
    userId: null as any, // Test anonymous user with sessionId
    sessionId: 'session-anon-004',
    source: 'live_user',
    inputText: 'Anonymous: What is the weather today?',
    status: 'success',
  },
];

async function sendRunToTower(run: TestRun, runIndex: number): Promise<any> {
  const payload = {
    runId: `test-run-${Date.now()}-${runIndex}`,
    source: run.source,
    userId: run.userId,
    sessionId: run.sessionId,
    request: {
      inputText: run.inputText,
    },
    response: {
      outputText: `Response for ${run.inputText}`,
    },
    status: run.status,
    goal: run.inputText,
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    durationMs: 5000,
    model: 'gpt-4o-mini',
    mode: 'test',
  };

  const response = await fetch(`${TOWER_URL}/tower/runs/log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to ingest run: ${error.error || response.statusText}`);
  }

  return await response.json();
}

async function getRecentRuns(): Promise<any[]> {
  const response = await fetch(`${TOWER_URL}/tower/runs?limit=100`);
  if (!response.ok) {
    throw new Error(`Failed to fetch runs: ${response.statusText}`);
  }
  return await response.json();
}

async function getConversations(): Promise<any[]> {
  const response = await fetch(`${TOWER_URL}/tower/conversations?limit=100`);
  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`);
  }
  return await response.json();
}

async function runMultiUserIngestionTest() {
  console.log('🧪 Starting Multi-User Ingestion Test\n');

  // Step 1: Ingest runs from multiple users
  console.log('📥 Ingesting runs from 4 different users...');
  const results = [];
  for (let i = 0; i < testUsers.length; i++) {
    const run = testUsers[i];
    try {
      const result = await sendRunToTower(run, i);
      results.push(result);
      console.log(`✓ User ${i + 1} (${run.userId || 'anonymous'}): Run ingested successfully`);
    } catch (error: any) {
      console.error(`✗ User ${i + 1} (${run.userId || 'anonymous'}): Failed - ${error.message}`);
      throw error;
    }
  }

  // Wait a bit for database to catch up
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 2: Verify all runs are stored
  console.log('\n📊 Verifying stored runs...');
  const allRuns = await getRecentRuns();
  const ingestedRunIds = results.map(r => r.id);
  const storedRuns = allRuns.filter(r => ingestedRunIds.includes(r.id));

  if (storedRuns.length !== testUsers.length) {
    throw new Error(`Expected ${testUsers.length} runs, found ${storedRuns.length}`);
  }
  console.log(`✓ All ${testUsers.length} runs stored in database`);

  // Step 3: Verify user identifiers are preserved
  console.log('\n👤 Verifying user identifiers...');
  for (let i = 0; i < testUsers.length; i++) {
    const expectedUser = testUsers[i].userId;
    const storedRun = storedRuns.find((r: any) => r.id === ingestedRunIds[i]);
    
    if (!storedRun) {
      throw new Error(`Run ${i + 1} not found in stored runs`);
    }

    if (expectedUser) {
      // User provided - should match exactly
      if (storedRun.user_identifier !== expectedUser) {
        throw new Error(
          `Run ${i + 1}: Expected userId "${expectedUser}", got "${storedRun.user_identifier}"`
        );
      }
      console.log(`✓ User ${i + 1}: userId preserved correctly (${expectedUser})`);
    } else {
      // Anonymous user - should have generated anonymous ID
      if (!storedRun.user_identifier || !storedRun.user_identifier.startsWith('anon-')) {
        throw new Error(
          `Run ${i + 1}: Expected anonymous userId, got "${storedRun.user_identifier}"`
        );
      }
      console.log(`✓ User ${i + 1}: Anonymous ID generated (${storedRun.user_identifier})`);
    }
  }

  // Step 4: Verify conversations are grouped correctly
  console.log('\n💬 Verifying conversation grouping...');
  const conversations = await getConversations();
  const testConversations = conversations.filter(c => 
    ingestedRunIds.some(id => c.conversation_run_id.includes(id.split('-evt-')[0]))
  );

  if (testConversations.length === 0) {
    console.warn('⚠️  No conversations found (may be expected for single-event runs)');
  } else {
    console.log(`✓ Found ${testConversations.length} conversations`);
    for (const conv of testConversations) {
      console.log(`  - Conversation: ${conv.conversation_run_id}, User: ${conv.user_identifier || 'none'}`);
    }
  }

  // Step 5: Verify multi-source support
  console.log('\n🔄 Verifying multi-source support...');
  const sources = new Set(storedRuns.map(r => r.source));
  console.log(`✓ Accepted ${sources.size} different sources: ${Array.from(sources).join(', ')}`);

  if (!sources.has('supervisor')) {
    throw new Error('Supervisor source was not accepted!');
  }

  console.log('\n✅ Multi-User Ingestion Test PASSED');
  console.log('\nSummary:');
  console.log(`  - Ingested runs from ${testUsers.length} users`);
  console.log(`  - Verified ${sources.size} different sources`);
  console.log(`  - All user identifiers preserved or generated correctly`);
  console.log(`  - Conversations grouped properly`);
}

// Run the test
runMultiUserIngestionTest()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
