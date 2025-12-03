/**
 * TOW-4: Lead Finder Run Logging Tests
 * TOW-5: Extended with Lead Quality scoring tests
 * 
 * Tests for the Lead Finder event detection and type definitions.
 * These tests verify that:
 * - Lead Finder events are correctly identified
 * - Constants are correctly defined
 * - Non-Lead Finder events are not misidentified
 * - TOW-5: Lead quality scoring is integrated
 * 
 * Note: These tests focus on pure functions in the types module.
 * Database integration tests would require a test database setup.
 * 
 * Run with: npx tsx tests/lead-finder-runs.test.ts
 */

import { 
  isLeadFinderEvent, 
  LEAD_FINDER_SOURCE,
  LEAD_FINDER_EVENT_TYPES 
} from "../src/types/events";

import { computeLeadQualityScore } from "../src/evaluator/leadQuality";

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
  console.log("🧪 Running TOW-4 Lead Finder Event Detection Tests\n");
  
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
// Test cases for isLeadFinderEvent
// =====================

test("isLeadFinderEvent returns true for 'LeadFinderSearch'", () => {
  expect(isLeadFinderEvent("LeadFinderSearch")).toBe(true);
});

test("isLeadFinderEvent returns true for 'LeadFinderRun'", () => {
  expect(isLeadFinderEvent("LeadFinderRun")).toBe(true);
});

test("isLeadFinderEvent returns true for 'lead_finder_search'", () => {
  expect(isLeadFinderEvent("lead_finder_search")).toBe(true);
});

test("isLeadFinderEvent returns true for 'lead_finder.search'", () => {
  expect(isLeadFinderEvent("lead_finder.search")).toBe(true);
});

test("isLeadFinderEvent is case-insensitive", () => {
  expect(isLeadFinderEvent("LEADFINDERSEARCH")).toBe(true);
  expect(isLeadFinderEvent("leadfindersearch")).toBe(true);
  expect(isLeadFinderEvent("LeadFinderSEARCH")).toBe(true);
});

test("isLeadFinderEvent returns false for non-Lead Finder events", () => {
  expect(isLeadFinderEvent("UserLogin")).toBe(false);
  expect(isLeadFinderEvent("ChatMessage")).toBe(false);
  expect(isLeadFinderEvent("LeadCreated")).toBe(false);
  expect(isLeadFinderEvent("SearchCompleted")).toBe(false);
});

test("isLeadFinderEvent returns false for similar but different events", () => {
  expect(isLeadFinderEvent("LeadFinder")).toBe(false);
  expect(isLeadFinderEvent("lead_finder")).toBe(false);
  expect(isLeadFinderEvent("FinderSearch")).toBe(false);
});

test("isLeadFinderEvent returns false for empty string", () => {
  expect(isLeadFinderEvent("")).toBe(false);
});

// =====================
// Test cases for constants
// =====================

test("LEAD_FINDER_SOURCE is 'lead_finder'", () => {
  expect(LEAD_FINDER_SOURCE).toBe("lead_finder");
});

test("LEAD_FINDER_EVENT_TYPES contains expected values", () => {
  expect(LEAD_FINDER_EVENT_TYPES.includes("LeadFinderSearch")).toBe(true);
  expect(LEAD_FINDER_EVENT_TYPES.includes("LeadFinderRun")).toBe(true);
  expect(LEAD_FINDER_EVENT_TYPES.includes("lead_finder_search")).toBe(true);
  expect(LEAD_FINDER_EVENT_TYPES.includes("lead_finder.search")).toBe(true);
});

test("LEAD_FINDER_EVENT_TYPES has exactly 4 entries", () => {
  expect(LEAD_FINDER_EVENT_TYPES.length).toBe(4);
});

// =====================
// Edge cases for isLeadFinderEvent
// =====================

test("isLeadFinderEvent handles whitespace in event type", () => {
  // Event types with leading/trailing whitespace should not match
  expect(isLeadFinderEvent(" LeadFinderSearch")).toBe(false);
  expect(isLeadFinderEvent("LeadFinderSearch ")).toBe(false);
});

test("isLeadFinderEvent handles partial matches correctly", () => {
  // Should not match substrings
  expect(isLeadFinderEvent("MyLeadFinderSearch")).toBe(false);
  expect(isLeadFinderEvent("LeadFinderSearchExtra")).toBe(false);
});

// =====================
// TOW-5: Lead Quality Scoring Integration Tests
// =====================

test("TOW-5: computeLeadQualityScore returns score and label", () => {
  const result = computeLeadQualityScore({ resultsCount: 10 });
  expect(result.score).toBeDefined();
  expect(result.label).toBeDefined();
});

test("TOW-5: quality score varies with resultsCount", () => {
  const noResults = computeLeadQualityScore({ resultsCount: 0 });
  const someResults = computeLeadQualityScore({ resultsCount: 10 });
  const manyResults = computeLeadQualityScore({ resultsCount: 100 });
  
  // Verify different resultsCount values give different scores
  expect(noResults.score).toBe(20);
  expect(someResults.score).toBe(70);
  expect(manyResults.score).toBe(60);
});

test("TOW-5: quality label matches score range", () => {
  const low = computeLeadQualityScore({ resultsCount: 0 });
  const medium = computeLeadQualityScore({ resultsCount: 5 });
  const high = computeLeadQualityScore({ resultsCount: 25 });
  
  expect(low.label).toBe("low");
  expect(medium.label).toBe("medium");
  expect(high.label).toBe("high");
});

test("TOW-5: location bonus is applied", () => {
  const withLocation = computeLeadQualityScore({ resultsCount: 5, location: "NYC" });
  const withoutLocation = computeLeadQualityScore({ resultsCount: 5 });
  
  expect(withLocation.score).toBe(withoutLocation.score + 5);
});

test("TOW-5: vertical bonus is applied", () => {
  const withVertical = computeLeadQualityScore({ resultsCount: 5, vertical: "restaurants" });
  const withoutVertical = computeLeadQualityScore({ resultsCount: 5 });
  
  expect(withVertical.score).toBe(withoutVertical.score + 5);
});

// Run all tests
runTests();
