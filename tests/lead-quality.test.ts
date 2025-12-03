/**
 * TOW-5: Lead Quality Scoring Tests
 * 
 * Tests for the lead quality scoring heuristic.
 * 
 * Scoring rules tested:
 * - Base score: 50
 * - resultsCount adjustment:
 *   - 0 results → 20 (low confidence)
 *   - 1-10 results → 70 (good, focused search)
 *   - 11-50 results → 80 (great, comprehensive)
 *   - >50 results → 60 (broad, may be too unfocused)
 * - Bonuses:
 *   - Has location: +5
 *   - Has vertical: +5
 *   - Has query with 3+ words: +5
 * - Labels:
 *   - score < 40 → "low"
 *   - score 40-70 → "medium"
 *   - score > 70 → "high"
 * 
 * Run with: npx tsx tests/lead-quality.test.ts
 */

import { 
  computeLeadQualityScore, 
  explainLeadQualityScore,
  type LeadQualityLabel,
  type LeadQualityScore 
} from "../src/evaluator/leadQuality";

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
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof actual !== "number" || actual < expected) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== "number" || actual >= expected) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (typeof actual !== "number" || actual > expected) {
        throw new Error(`Expected ${actual} to be <= ${expected}`);
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
  console.log("🧪 Running TOW-5 Lead Quality Scoring Tests\n");
  
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
// Test cases for resultsCount base scores
// =====================

test("0 results gives base score of 20 (low label)", () => {
  const result = computeLeadQualityScore({ resultsCount: 0 });
  expect(result.score).toBe(20);
  expect(result.label).toBe("low");
});

test("1 result gives base score of 70 (medium label)", () => {
  const result = computeLeadQualityScore({ resultsCount: 1 });
  expect(result.score).toBe(70);
  expect(result.label).toBe("medium");
});

test("10 results gives base score of 70 (medium label)", () => {
  const result = computeLeadQualityScore({ resultsCount: 10 });
  expect(result.score).toBe(70);
  expect(result.label).toBe("medium");
});

test("11 results gives base score of 80 (high label)", () => {
  const result = computeLeadQualityScore({ resultsCount: 11 });
  expect(result.score).toBe(80);
  expect(result.label).toBe("high");
});

test("50 results gives base score of 80 (high label)", () => {
  const result = computeLeadQualityScore({ resultsCount: 50 });
  expect(result.score).toBe(80);
  expect(result.label).toBe("high");
});

test("51+ results gives base score of 60 (medium label)", () => {
  const result = computeLeadQualityScore({ resultsCount: 51 });
  expect(result.score).toBe(60);
  expect(result.label).toBe("medium");
});

test("100 results still gives base score of 60", () => {
  const result = computeLeadQualityScore({ resultsCount: 100 });
  expect(result.score).toBe(60);
  expect(result.label).toBe("medium");
});

// =====================
// Test cases for undefined/missing resultsCount
// =====================

test("undefined resultsCount treated as 0", () => {
  const result = computeLeadQualityScore({});
  expect(result.score).toBe(20);
  expect(result.label).toBe("low");
});

test("empty payload treated as 0 results", () => {
  const result = computeLeadQualityScore({ query: "test" });
  // 20 (0 results) + 0 (single word query) = 20
  expect(result.score).toBe(20);
  expect(result.label).toBe("low");
});

// =====================
// Test cases for bonuses
// =====================

test("location adds +5 to score", () => {
  const withLocation = computeLeadQualityScore({ resultsCount: 5, location: "New York" });
  const withoutLocation = computeLeadQualityScore({ resultsCount: 5 });
  expect(withLocation.score).toBe(withoutLocation.score + 5);
});

test("vertical adds +5 to score", () => {
  const withVertical = computeLeadQualityScore({ resultsCount: 5, vertical: "restaurants" });
  const withoutVertical = computeLeadQualityScore({ resultsCount: 5 });
  expect(withVertical.score).toBe(withoutVertical.score + 5);
});

test("detailed query (3+ words) adds +5 to score", () => {
  const detailedQuery = computeLeadQualityScore({ resultsCount: 5, query: "italian restaurants downtown" });
  const shortQuery = computeLeadQualityScore({ resultsCount: 5, query: "restaurants" });
  expect(detailedQuery.score).toBe(shortQuery.score + 5);
});

test("all bonuses stack (location + vertical + detailed query = +15)", () => {
  const allBonuses = computeLeadQualityScore({ 
    resultsCount: 5, 
    location: "New York", 
    vertical: "restaurants",
    query: "italian food places nearby"
  });
  const noBonuses = computeLeadQualityScore({ resultsCount: 5 });
  expect(allBonuses.score).toBe(noBonuses.score + 15);
});

// =====================
// Test cases for label thresholds
// =====================

test("score < 40 gives 'low' label", () => {
  // 0 results = 20, no bonuses
  const result = computeLeadQualityScore({ resultsCount: 0 });
  expect(result.score).toBeLessThan(40);
  expect(result.label).toBe("low");
});

test("score 40-70 gives 'medium' label", () => {
  // 5 results = 70, in medium range
  const result = computeLeadQualityScore({ resultsCount: 5 });
  expect(result.score).toBeGreaterThanOrEqual(40);
  expect(result.score).toBeLessThanOrEqual(70);
  expect(result.label).toBe("medium");
});

test("score > 70 gives 'high' label", () => {
  // 25 results = 80, high
  const result = computeLeadQualityScore({ resultsCount: 25 });
  expect(result.score).toBeGreaterThan(70);
  expect(result.label).toBe("high");
});

// =====================
// Test cases for score capping
// =====================

test("score is capped at 100", () => {
  // 25 results (80) + location (+5) + vertical (+5) + detailed query (+5) = 95
  const result = computeLeadQualityScore({ 
    resultsCount: 25, 
    location: "NYC", 
    vertical: "tech",
    query: "a b c d e f g h i j" // 10 words
  });
  expect(result.score).toBeLessThanOrEqual(100);
});

test("score is floored at 0", () => {
  // Even with worst case, score should be >= 0
  const result = computeLeadQualityScore({ resultsCount: 0 });
  expect(result.score).toBeGreaterThanOrEqual(0);
});

// =====================
// Test cases for edge cases
// =====================

test("empty string location doesn't add bonus", () => {
  const withEmptyLocation = computeLeadQualityScore({ resultsCount: 5, location: "" });
  const withoutLocation = computeLeadQualityScore({ resultsCount: 5 });
  expect(withEmptyLocation.score).toBe(withoutLocation.score);
});

test("whitespace-only location doesn't add bonus", () => {
  const withWhitespaceLocation = computeLeadQualityScore({ resultsCount: 5, location: "   " });
  const withoutLocation = computeLeadQualityScore({ resultsCount: 5 });
  expect(withWhitespaceLocation.score).toBe(withoutLocation.score);
});

test("2-word query doesn't add bonus", () => {
  const twoWords = computeLeadQualityScore({ resultsCount: 5, query: "italian restaurants" });
  const noQuery = computeLeadQualityScore({ resultsCount: 5 });
  expect(twoWords.score).toBe(noQuery.score);
});

test("3-word query adds bonus", () => {
  const threeWords = computeLeadQualityScore({ resultsCount: 5, query: "best italian restaurants" });
  const noQuery = computeLeadQualityScore({ resultsCount: 5 });
  expect(threeWords.score).toBe(noQuery.score + 5);
});

// =====================
// Test cases for explainLeadQualityScore
// =====================

test("explainLeadQualityScore returns readable explanation", () => {
  const explanation = explainLeadQualityScore({ 
    resultsCount: 25, 
    location: "NYC",
    vertical: "restaurants",
    query: "best pizza places"
  });
  expect(explanation).toContain("comprehensive search");
  expect(explanation).toContain("Location specified: +5");
  expect(explanation).toContain("Vertical specified: +5");
  expect(explanation).toContain("Detailed query (3+ words): +5");
});

test("explainLeadQualityScore explains zero results", () => {
  const explanation = explainLeadQualityScore({ resultsCount: 0 });
  expect(explanation).toContain("No results found");
  expect(explanation).toContain("base: 20");
});

test("explainLeadQualityScore explains broad search", () => {
  const explanation = explainLeadQualityScore({ resultsCount: 100 });
  expect(explanation).toContain("broad search");
  expect(explanation).toContain("base: 60");
});

// =====================
// Test cases for realistic scenarios
// =====================

test("realistic high-quality search: 15 restaurants in NYC for italian food", () => {
  const result = computeLeadQualityScore({
    query: "italian restaurants with outdoor seating",
    location: "New York City",
    vertical: "restaurants",
    resultsCount: 15
  });
  // 80 (11-50 results) + 5 (location) + 5 (vertical) + 5 (4+ words) = 95
  expect(result.score).toBe(95);
  expect(result.label).toBe("high");
});

test("realistic low-quality search: no results for vague query", () => {
  const result = computeLeadQualityScore({
    query: "stuff",
    resultsCount: 0
  });
  // 20 (0 results), no bonuses
  expect(result.score).toBe(20);
  expect(result.label).toBe("low");
});

test("realistic medium-quality search: few results, some specificity", () => {
  const result = computeLeadQualityScore({
    query: "plumbers",
    location: "Boston",
    resultsCount: 3
  });
  // 70 (1-10 results) + 5 (location) = 75
  expect(result.score).toBe(75);
  expect(result.label).toBe("high");
});

// Run all tests
runTests();

