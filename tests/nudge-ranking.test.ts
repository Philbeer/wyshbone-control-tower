/**
 * TOW-6: Subconscious Nudge Ranking Tests
 * 
 * Tests for the nudge importance scoring heuristic.
 * 
 * Scoring rules tested:
 * - Base scores by type: follow_up(60) > stale_lead(50) > engagement(40) > reminder(30) > insight(20)
 * - Recency bonus (0-20): exponential decay over 3-day half-life
 * - Status bonus (10): "new" nudges get a boost
 * - Lead quality bonus (0-15): scales with lead quality score
 * - Staleness escalation (0-10): for stale_lead type, longer = more urgent
 * - Labels: high (≥70), medium (40-69), low (<40)
 * 
 * Run with: npx tsx tests/nudge-ranking.test.ts
 */

import {
  computeNudgeScore,
  getImportanceLabel,
  rankNudges,
  explainNudgeScore,
  rankSubconsciousNudges,
  type SubconNudge,
  type RankedNudge,
  type ImportanceLabel,
} from "../src/evaluator/nudgeRanking";

// Simple test framework (matches lead-quality.test.ts pattern)
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
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected}, got ${Array.isArray(actual) ? actual.length : "non-array"}`);
      }
    },
  };
}

async function runTests() {
  console.log("🧪 Running TOW-6 Nudge Ranking Tests\n");
  
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
// Helper to create test nudges
// =====================

function createNudge(overrides: Partial<SubconNudge> = {}): SubconNudge {
  return {
    id: "test-" + Math.random().toString(36).slice(2, 9),
    type: "reminder",
    status: "new",
    createdAt: new Date(),
    ...overrides,
  };
}

// Fixed "now" for deterministic tests
const NOW = new Date("2024-06-15T12:00:00Z");

// =====================
// Test cases for type-based base scores
// =====================

test("follow_up type has highest base score", () => {
  const nudge = createNudge({ type: "follow_up", status: "seen", createdAt: NOW });
  const score = computeNudgeScore(nudge, { now: NOW });
  // follow_up base = 60, recency ~20 (just created), no status bonus (seen)
  expect(score).toBeGreaterThanOrEqual(75);
});

test("insight type has lowest base score", () => {
  const nudge = createNudge({ type: "insight", status: "seen", createdAt: NOW });
  const score = computeNudgeScore(nudge, { now: NOW });
  // insight base = 20, recency ~20 (just created), no status bonus
  expect(score).toBeLessThanOrEqual(45);
});

test("type ordering: follow_up > stale_lead > engagement > reminder > insight", () => {
  const types = ["follow_up", "stale_lead", "engagement", "reminder", "insight"];
  const scores = types.map((type) => {
    const nudge = createNudge({ type, status: "seen", createdAt: NOW });
    return computeNudgeScore(nudge, { now: NOW });
  });
  
  // Each type should score higher than the next
  for (let i = 0; i < scores.length - 1; i++) {
    expect(scores[i]).toBeGreaterThan(scores[i + 1]);
  }
});

test("unknown type gets default score", () => {
  const nudge = createNudge({ type: "unknown_type", status: "seen", createdAt: NOW });
  const score = computeNudgeScore(nudge, { now: NOW });
  // default unknown = 25, recency ~20 = 45
  expect(score).toBeGreaterThanOrEqual(40);
  expect(score).toBeLessThanOrEqual(50);
});

// =====================
// Test cases for recency bonus
// =====================

test("newer nudges score higher than older ones (same type)", () => {
  const recent = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW,
  });
  const old = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  });
  
  const recentScore = computeNudgeScore(recent, { now: NOW });
  const oldScore = computeNudgeScore(old, { now: NOW });
  
  expect(recentScore).toBeGreaterThan(oldScore);
});

test("recency bonus decays over time", () => {
  const justNow = createNudge({ type: "reminder", status: "seen", createdAt: NOW });
  const oneDayOld = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
  });
  const threeDaysOld = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
  });
  
  const scoreNow = computeNudgeScore(justNow, { now: NOW });
  const score1d = computeNudgeScore(oneDayOld, { now: NOW });
  const score3d = computeNudgeScore(threeDaysOld, { now: NOW });
  
  expect(scoreNow).toBeGreaterThan(score1d);
  expect(score1d).toBeGreaterThan(score3d);
});

test("very old nudges still get a minimal recency bonus", () => {
  const veryOld = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
  });
  
  const score = computeNudgeScore(veryOld, { now: NOW });
  // reminder base = 30, very small recency, no status bonus
  // Should be around 30-32
  expect(score).toBeGreaterThanOrEqual(30);
  expect(score).toBeLessThanOrEqual(35);
});

// =====================
// Test cases for status bonus
// =====================

test("'new' status adds bonus over 'seen'", () => {
  const newNudge = createNudge({ type: "reminder", status: "new", createdAt: NOW });
  const seenNudge = createNudge({ type: "reminder", status: "seen", createdAt: NOW });
  
  const newScore = computeNudgeScore(newNudge, { now: NOW });
  const seenScore = computeNudgeScore(seenNudge, { now: NOW });
  
  expect(newScore).toBeGreaterThan(seenScore);
  expect(newScore - seenScore).toBe(10); // NEW_STATUS_BONUS = 10
});

test("'handled' status has no bonus", () => {
  const handledNudge = createNudge({ type: "reminder", status: "handled", createdAt: NOW });
  const seenNudge = createNudge({ type: "reminder", status: "seen", createdAt: NOW });
  
  const handledScore = computeNudgeScore(handledNudge, { now: NOW });
  const seenScore = computeNudgeScore(seenNudge, { now: NOW });
  
  expect(handledScore).toBe(seenScore);
});

// =====================
// Test cases for lead quality bonus
// =====================

test("higher lead quality increases score", () => {
  const highQuality = createNudge({ 
    type: "follow_up", 
    status: "seen", 
    createdAt: NOW, 
    leadQualityScore: 90,
  });
  const lowQuality = createNudge({ 
    type: "follow_up", 
    status: "seen", 
    createdAt: NOW, 
    leadQualityScore: 30,
  });
  const noQuality = createNudge({ 
    type: "follow_up", 
    status: "seen", 
    createdAt: NOW,
  });
  
  const highScore = computeNudgeScore(highQuality, { now: NOW });
  const lowScore = computeNudgeScore(lowQuality, { now: NOW });
  const noScore = computeNudgeScore(noQuality, { now: NOW });
  
  expect(highScore).toBeGreaterThan(lowScore);
  expect(lowScore).toBeGreaterThan(noScore);
});

test("lead quality bonus scales linearly (0-15 range)", () => {
  const quality100 = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW, 
    leadQualityScore: 100,
  });
  const quality50 = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW, 
    leadQualityScore: 50,
  });
  const quality0 = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW, 
    leadQualityScore: 0,
  });
  
  const score100 = computeNudgeScore(quality100, { now: NOW });
  const score50 = computeNudgeScore(quality50, { now: NOW });
  const score0 = computeNudgeScore(quality0, { now: NOW });
  
  // Difference between 100 and 50 quality should be ~7.5 (half of 15)
  const diff100to50 = score100 - score50;
  const diff50to0 = score50 - score0;
  
  expect(diff100to50).toBeGreaterThan(6);
  expect(diff100to50).toBeLessThan(9);
  expect(Math.abs(diff100to50 - diff50to0)).toBeLessThan(2); // Should be roughly equal
});

test("null lead quality adds no bonus", () => {
  const nullQuality = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW, 
    leadQualityScore: null,
  });
  const noQuality = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW,
  });
  
  expect(computeNudgeScore(nullQuality, { now: NOW })).toBe(
    computeNudgeScore(noQuality, { now: NOW })
  );
});

// =====================
// Test cases for staleness escalation
// =====================

test("stale_lead type gets escalation bonus based on stale duration", () => {
  const freshStale = createNudge({ 
    type: "stale_lead", 
    status: "seen", 
    createdAt: NOW, 
    staleAt: NOW,
  });
  const oldStale = createNudge({ 
    type: "stale_lead", 
    status: "seen", 
    createdAt: NOW, 
    staleAt: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000), // 14 days stale
  });
  
  const freshScore = computeNudgeScore(freshStale, { now: NOW });
  const oldScore = computeNudgeScore(oldStale, { now: NOW });
  
  expect(oldScore).toBeGreaterThan(freshScore);
});

test("staleness bonus caps at max (14 days)", () => {
  const stale14d = createNudge({ 
    type: "stale_lead", 
    status: "seen", 
    createdAt: NOW, 
    staleAt: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000),
  });
  const stale30d = createNudge({ 
    type: "stale_lead", 
    status: "seen", 
    createdAt: NOW, 
    staleAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
  });
  
  const score14d = computeNudgeScore(stale14d, { now: NOW });
  const score30d = computeNudgeScore(stale30d, { now: NOW });
  
  // Both should have max staleness bonus, so scores should be equal
  expect(score14d).toBe(score30d);
});

test("non-stale_lead types ignore staleAt field", () => {
  const reminderWithStaleAt = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW, 
    staleAt: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000),
  });
  const reminderWithoutStaleAt = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW,
  });
  
  expect(computeNudgeScore(reminderWithStaleAt, { now: NOW })).toBe(
    computeNudgeScore(reminderWithoutStaleAt, { now: NOW })
  );
});

// =====================
// Test cases for importance labels
// =====================

test("score >= 70 gives 'high' label", () => {
  expect(getImportanceLabel(70)).toBe("high");
  expect(getImportanceLabel(85)).toBe("high");
  expect(getImportanceLabel(100)).toBe("high");
});

test("score 40-69 gives 'medium' label", () => {
  expect(getImportanceLabel(40)).toBe("medium");
  expect(getImportanceLabel(55)).toBe("medium");
  expect(getImportanceLabel(69)).toBe("medium");
});

test("score < 40 gives 'low' label", () => {
  expect(getImportanceLabel(0)).toBe("low");
  expect(getImportanceLabel(20)).toBe("low");
  expect(getImportanceLabel(39)).toBe("low");
});

// =====================
// Test cases for rankNudges
// =====================

test("rankNudges sorts by importance descending", () => {
  const nudges = [
    createNudge({ id: "low", type: "insight", status: "seen", createdAt: NOW }),
    createNudge({ id: "high", type: "follow_up", status: "new", createdAt: NOW }),
    createNudge({ id: "med", type: "reminder", status: "new", createdAt: NOW }),
  ];
  
  const ranked = rankNudges(nudges, { now: NOW });
  
  expect(ranked[0].id).toBe("high");
  expect(ranked[1].id).toBe("med");
  expect(ranked[2].id).toBe("low");
});

test("rankNudges uses createdAt as tiebreaker", () => {
  const older = new Date(NOW.getTime() - 1000);
  const newer = NOW;
  
  const nudges = [
    createNudge({ id: "older", type: "reminder", status: "seen", createdAt: older }),
    createNudge({ id: "newer", type: "reminder", status: "seen", createdAt: newer }),
  ];
  
  const ranked = rankNudges(nudges, { now: NOW });
  
  // Newer should come first as tiebreaker
  expect(ranked[0].id).toBe("newer");
  expect(ranked[1].id).toBe("older");
});

test("rankNudges adds importanceScore and importanceLabel to each nudge", () => {
  const nudges = [createNudge({ type: "follow_up", status: "new", createdAt: NOW })];
  const ranked = rankNudges(nudges, { now: NOW });
  
  expect(ranked).toHaveLength(1);
  expect(typeof ranked[0].importanceScore).toBe("number");
  expect(["low", "medium", "high"].includes(ranked[0].importanceLabel)).toBe(true);
});

test("rankNudges handles empty array", () => {
  const ranked = rankNudges([], { now: NOW });
  expect(ranked).toHaveLength(0);
});

// =====================
// Test cases for explainNudgeScore
// =====================

test("explainNudgeScore includes type base score", () => {
  const nudge = createNudge({ type: "follow_up", status: "seen", createdAt: NOW });
  const explanation = explainNudgeScore(nudge, { now: NOW });
  expect(explanation).toContain("follow_up");
  expect(explanation).toContain("base 60");
});

test("explainNudgeScore includes recency", () => {
  const nudge = createNudge({ type: "reminder", status: "seen", createdAt: NOW });
  const explanation = explainNudgeScore(nudge, { now: NOW });
  expect(explanation).toContain("Recency");
});

test("explainNudgeScore includes status bonus for new", () => {
  const nudge = createNudge({ type: "reminder", status: "new", createdAt: NOW });
  const explanation = explainNudgeScore(nudge, { now: NOW });
  expect(explanation).toContain('Status "new"');
  expect(explanation).toContain("+10");
});

test("explainNudgeScore includes lead quality when present", () => {
  const nudge = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW, 
    leadQualityScore: 80,
  });
  const explanation = explainNudgeScore(nudge, { now: NOW });
  expect(explanation).toContain("Lead quality (80)");
});

test("explainNudgeScore includes staleness for stale_lead", () => {
  const nudge = createNudge({ 
    type: "stale_lead", 
    status: "seen", 
    createdAt: NOW,
    staleAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
  });
  const explanation = explainNudgeScore(nudge, { now: NOW });
  expect(explanation).toContain("Staleness");
});

// =====================
// Test cases for rankSubconsciousNudges service function
// =====================

test("rankSubconsciousNudges returns ranked nudges", async () => {
  const nudges = [
    createNudge({ type: "insight", status: "seen", createdAt: NOW }),
    createNudge({ type: "follow_up", status: "new", createdAt: NOW }),
  ];
  
  const ranked = await rankSubconsciousNudges(nudges, { context: { now: NOW } });
  
  expect(ranked).toHaveLength(2);
  expect(ranked[0].type).toBe("follow_up");
  expect(ranked[1].type).toBe("insight");
});

test("rankSubconsciousNudges enriches with lead quality when fetcher provided", async () => {
  const nudges = [
    createNudge({ 
      type: "follow_up", 
      status: "new", 
      createdAt: NOW, 
      leadId: "lead-123",
      leadQualityScore: null, // Missing quality
    }),
  ];
  
  const mockFetchLeadQuality = async (leadIds: string[]) => {
    const map = new Map<string, number>();
    if (leadIds.includes("lead-123")) {
      map.set("lead-123", 85);
    }
    return map;
  };
  
  const ranked = await rankSubconsciousNudges(nudges, { 
    fetchLeadQuality: mockFetchLeadQuality,
    context: { now: NOW },
  });
  
  // The nudge should have been enriched with lead quality
  // This affects the score calculation
  expect(ranked).toHaveLength(1);
  expect(ranked[0].importanceScore).toBeGreaterThan(0);
});

// =====================
// Test cases for score capping
// =====================

test("score is capped at 100", () => {
  // follow_up (60) + new status (10) + max recency (20) + max lead quality (15) = 105
  const maxScoreNudge = createNudge({ 
    type: "follow_up", 
    status: "new", 
    createdAt: NOW,
    leadQualityScore: 100,
  });
  
  const score = computeNudgeScore(maxScoreNudge, { now: NOW });
  expect(score).toBeLessThanOrEqual(100);
});

test("score is floored at 0", () => {
  // Even with worst case, score should be >= 0
  const oldInsight = createNudge({ 
    type: "insight", 
    status: "seen", 
    createdAt: new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000), // 1 year old
  });
  
  const score = computeNudgeScore(oldInsight, { now: NOW });
  expect(score).toBeGreaterThanOrEqual(0);
});

// =====================
// Test cases for date parsing
// =====================

test("handles createdAt as string", () => {
  const nudge = createNudge({ 
    type: "reminder", 
    status: "seen", 
    createdAt: NOW.toISOString(),
  });
  
  const score = computeNudgeScore(nudge, { now: NOW });
  expect(score).toBeGreaterThan(0);
});

test("handles staleAt as string", () => {
  const staleAt = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nudge = createNudge({ 
    type: "stale_lead", 
    status: "seen", 
    createdAt: NOW,
    staleAt: staleAt.toISOString(),
  });
  
  const score = computeNudgeScore(nudge, { now: NOW });
  expect(score).toBeGreaterThan(0);
});

// =====================
// Test cases for custom type weights
// =====================

test("custom type weights override defaults", () => {
  const nudge = createNudge({ type: "reminder", status: "seen", createdAt: NOW });
  
  const defaultScore = computeNudgeScore(nudge, { now: NOW });
  const customScore = computeNudgeScore(nudge, { 
    now: NOW, 
    typeWeights: { reminder: 80 }, // Override reminder from 30 to 80
  });
  
  expect(customScore).toBeGreaterThan(defaultScore);
  expect(customScore - defaultScore).toBe(50); // 80 - 30 = 50
});

// =====================
// Realistic scenario tests
// =====================

test("realistic: urgent follow-up scores high", () => {
  const urgentFollowUp = createNudge({
    type: "follow_up",
    status: "new",
    createdAt: NOW,
    leadQualityScore: 85,
    message: "Contact John Smith - interested in premium plan",
  });
  
  const result = rankNudges([urgentFollowUp], { now: NOW });
  
  expect(result[0].importanceScore).toBeGreaterThanOrEqual(80);
  expect(result[0].importanceLabel).toBe("high");
});

test("realistic: old insight scores low", () => {
  const oldInsight = createNudge({
    type: "insight",
    status: "seen",
    createdAt: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000),
    message: "Market trend analysis for Q2",
  });
  
  const result = rankNudges([oldInsight], { now: NOW });
  
  expect(result[0].importanceScore).toBeLessThan(40);
  expect(result[0].importanceLabel).toBe("low");
});

test("realistic: very stale lead escalates priority", () => {
  const veryStale = createNudge({
    type: "stale_lead",
    status: "new",
    createdAt: NOW,
    staleAt: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000),
    leadQualityScore: 70,
  });
  
  const freshStale = createNudge({
    type: "stale_lead",
    status: "new",
    createdAt: NOW,
    staleAt: NOW,
    leadQualityScore: 70,
  });
  
  const results = rankNudges([freshStale, veryStale], { now: NOW });
  
  // Very stale should rank higher
  expect(results[0].staleAt).not.toBe(NOW);
  expect(results[0].importanceScore).toBeGreaterThan(results[1].importanceScore);
});

// Run all tests
runTests();
