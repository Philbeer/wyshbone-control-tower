/**
 * TOW-3: Evaluator Stub Tests
 * 
 * Tests for the minimal evaluator stub function.
 * These tests verify that:
 * - evaluateSignal returns an object with outcome 'ok'
 * - isStub is true
 * - summary contains 'Stub evaluator'
 * - details contains signalType
 * - The function is synchronous and doesn't throw
 * 
 * Run with: npx tsx tests/evaluator.test.ts
 */

import { evaluateSignal } from "../src/services/evaluator";
import type { NormalizedEvent } from "../src/types/events";

// Create a minimal fake Signal/NormalizedEvent for testing
function createMockSignal(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    type: "test.event",
    source: "supervisor",
    payload: { foo: "bar" },
    correlationId: "test-corr-123",
    sessionId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Simple test framework
let passed = 0;
let failed = 0;
const tests: Array<{ name: string; fn: () => void }> = [];

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
    toBeLessThan(expected: number) {
      if (typeof actual !== "number" || actual >= expected) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
  };
}

function runTests() {
  console.log("🧪 Running TOW-3 Evaluator Tests\n");
  
  for (const { name, fn } of tests) {
    try {
      fn();
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
// Test cases
// =====================

test("should return an object with outcome 'ok'", () => {
  const signal = createMockSignal();
  const result = evaluateSignal(signal);
  expect(result.outcome).toBe("ok");
});

test("should have isStub set to true", () => {
  const signal = createMockSignal();
  const result = evaluateSignal(signal);
  expect(result.isStub).toBe(true);
});

test("should have summary containing 'Stub evaluator'", () => {
  const signal = createMockSignal();
  const result = evaluateSignal(signal);
  expect(result.summary).toContain("Stub evaluator");
});

test("should include signalType in details", () => {
  const signal = createMockSignal({ type: "LeadCreated" });
  const result = evaluateSignal(signal);
  expect(result.details).toBeDefined();
  expect(result.details?.signalType as string).toBe("LeadCreated");
});

test("should include signalSource in details", () => {
  const signal = createMockSignal({ source: "ui" });
  const result = evaluateSignal(signal);
  expect(result.details?.signalSource as string).toBe("ui");
});

test("should include correlationId in details", () => {
  const signal = createMockSignal({ correlationId: "my-corr-id" });
  const result = evaluateSignal(signal);
  expect(result.details?.correlationId as string).toBe("my-corr-id");
});

test("should have a valid ISO createdAt timestamp", () => {
  const signal = createMockSignal();
  const result = evaluateSignal(signal);
  expect(result.createdAt).toBeDefined();
  expect(typeof result.createdAt).toBe("string");
  
  const parsed = Date.parse(result.createdAt);
  if (isNaN(parsed)) {
    throw new Error("createdAt should be a valid ISO date");
  }
});

test("should handle missing sessionId gracefully", () => {
  const signal = createMockSignal({ sessionId: null });
  const result = evaluateSignal(signal);
  expect(result.outcome).toBe("ok");
  expect(result.details?.sessionId).toBeUndefined();
});

test("should handle signals with sessionId", () => {
  const signal = createMockSignal({ sessionId: "session-abc" });
  const result = evaluateSignal(signal);
  expect(result.details?.sessionId as string).toBe("session-abc");
});

test("should be synchronous (return immediately)", () => {
  const signal = createMockSignal();
  const startTime = Date.now();
  const result = evaluateSignal(signal);
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThan(100);
  expect(result).toBeDefined();
});

test("should handle 'supervisor' source", () => {
  const signal = createMockSignal({ source: "supervisor" });
  const result = evaluateSignal(signal);
  expect(result.outcome).toBe("ok");
  expect(result.details?.signalSource as string).toBe("supervisor");
});

test("should handle 'ui' source", () => {
  const signal = createMockSignal({ source: "ui" });
  const result = evaluateSignal(signal);
  expect(result.outcome).toBe("ok");
  expect(result.details?.signalSource as string).toBe("ui");
});

test("should handle 'tower' source", () => {
  const signal = createMockSignal({ source: "tower" });
  const result = evaluateSignal(signal);
  expect(result.outcome).toBe("ok");
  expect(result.details?.signalSource as string).toBe("tower");
});

// Run all tests
runTests();
