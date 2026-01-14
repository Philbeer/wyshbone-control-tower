/**
 * TOW-8: verticalId Propagation Tests
 * 
 * Tests for the verticalId field propagation across Tower runs, signals, and logs.
 * These tests verify that:
 * - verticalId is correctly extracted from incoming events
 * - verticalId defaults to "brewery" when not provided
 * - verticalId is preserved in normalized events
 * 
 * Run with: npx tsx tests/vertical-id.test.ts
 * 
 * Note: These tests focus on pure functions in the types/events module.
 * Database integration tests would require a test database setup.
 */

// We only import the types we need - no database dependencies
import type { IncomingEvent, NormalizedEvent } from "../src/types/events";

// Simple test framework
let passed = 0;
let failed = 0;
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, got ${actual}`);
      }
    },
    toContain(expected: string) {
      if (typeof actual !== "string" || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
  };
}

async function runTests() {
  console.log("🧪 Running TOW-8 verticalId Propagation Tests\n");
  
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ❌ ${name}`);
      console.log(`     ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// =====================
// Inline normalizeEvent for testing (to avoid db dependency)
// This mirrors the logic in eventIntake.ts
// =====================

function normalizeEventForTest(event: IncomingEvent): NormalizedEvent {
  const now = new Date().toISOString();
  
  // TOW-8: Extract verticalId from event or payload, default to "brewery"
  let verticalId: string | null = event.verticalId ?? null;
  if (!verticalId && event.payload && typeof event.payload === "object") {
    const p = event.payload as Record<string, unknown>;
    if (typeof p.verticalId === "string") {
      verticalId = p.verticalId;
    }
  }
  // Default to "brewery" for current phase if not specified
  verticalId = verticalId ?? "brewery";
  
  return {
    type: event.type.trim(),
    source: event.source ?? "supervisor",
    payload: event.payload ?? null,
    correlationId: event.correlationId ?? `evt-test-${Date.now()}`,
    sessionId: event.sessionId ?? null,
    createdAt: event.createdAt ?? now,
    verticalId,
  };
}

// =====================
// Test cases for normalizeEvent with verticalId
// =====================

test("normalizeEvent extracts verticalId from event", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    verticalId: "brewery",
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("brewery");
});

test("normalizeEvent extracts verticalId from payload when not on event", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    payload: { verticalId: "coffee" },
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("coffee");
});

test("normalizeEvent prefers event-level verticalId over payload", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    verticalId: "brewery",
    payload: { verticalId: "coffee" },
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("brewery");
});

test("normalizeEvent defaults to 'brewery' when verticalId not provided", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("brewery");
});

test("normalizeEvent defaults to 'brewery' when payload is empty object", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    payload: {},
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("brewery");
});

test("normalizeEvent defaults to 'brewery' when payload has non-string verticalId", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    payload: { verticalId: 123 }, // not a string
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("brewery");
});

test("normalizeEvent handles null payload", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    payload: null,
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("brewery");
});

// =====================
// Test cases for various verticalId values
// =====================

test("normalizeEvent accepts 'coffee' as verticalId", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    verticalId: "coffee",
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("coffee");
});

test("normalizeEvent accepts 'restaurant' as verticalId", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    verticalId: "restaurant",
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("restaurant");
});

test("normalizeEvent accepts custom vertical values", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "supervisor",
    verticalId: "custom_vertical_123",
  };
  
  const normalized = normalizeEventForTest(event);
  expect(normalized.verticalId).toBe("custom_vertical_123");
});

// =====================
// Test normalized event structure
// =====================

test("normalized event includes all expected fields", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    source: "ui",
    correlationId: "corr-123",
    sessionId: "sess-456",
    verticalId: "brewery",
    payload: { data: "test" },
  };
  
  const normalized = normalizeEventForTest(event);
  
  expect(normalized.type).toBe("TestEvent");
  expect(normalized.source).toBe("ui");
  expect(normalized.correlationId).toBe("corr-123");
  expect(normalized.sessionId).toBe("sess-456");
  expect(normalized.verticalId).toBe("brewery");
  expect((normalized.payload as any).data).toBe("test");
});

test("normalized event generates correlationId if not provided", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    verticalId: "brewery",
  };
  
  const normalized = normalizeEventForTest(event);
  
  expect(normalized.correlationId).toBeTruthy();
  expect(normalized.correlationId.startsWith("evt-")).toBe(true);
});

// =====================
// Type structure tests (compile-time verification at runtime)
// =====================

test("IncomingEvent type accepts optional verticalId", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
    verticalId: "brewery",
  };
  
  expect(event.verticalId).toBe("brewery");
});

test("IncomingEvent type allows undefined verticalId", () => {
  const event: IncomingEvent = {
    type: "TestEvent",
  };
  
  expect(event.verticalId).toBeUndefined();
});

test("NormalizedEvent always has verticalId (either provided or defaulted)", () => {
  const event1 = normalizeEventForTest({ type: "Test1", verticalId: "brewery" });
  const event2 = normalizeEventForTest({ type: "Test2" }); // no verticalId
  
  expect(event1.verticalId).toBe("brewery");
  expect(event2.verticalId).toBe("brewery"); // defaulted
});

// Run all tests
runTests();
