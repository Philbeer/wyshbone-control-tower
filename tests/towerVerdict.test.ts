import { judgeLeadsList, TowerVerdictInput } from "../src/evaluator/towerVerdict";

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
    toContain(expected: string) {
      if (Array.isArray(actual)) {
        if (!(actual as unknown[]).some(item => typeof item === "string" && item.includes(expected))) {
          if (!(actual as unknown[]).includes(expected)) {
            throw new Error(`Expected array ${JSON.stringify(actual)} to contain "${expected}"`);
          }
        }
      } else if (typeof actual !== "string" || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, got ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected}, got ${Array.isArray(actual) ? actual.length : "non-array"}`);
      }
    },
  };
}

function runTests() {
  console.log("Running Tower Verdict Tests (New Contract)\n");

  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`  FAIL: ${name}`);
      console.log(`     ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

test("STOP when requested_count_user is missing", () => {
  const result = judgeLeadsList({
    delivered_count: 5,
    original_user_goal: "Find pubs in Arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("missing_requested_count_user");
  expect(result.action).toBe("stop");
});

test("Output shape always includes action and reason_code", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    delivered_count: 5,
    original_user_goal: "Find 5 pubs in Arundel",
  });
  expect(result.action).toBeDefined();
  expect(result.reason_code).toBeDefined();
  if (!["continue", "retry", "change_plan", "stop"].includes(result.action)) {
    throw new Error(`Invalid action: ${result.action}`);
  }
});

test("ACCEPT when delivered >= requested (basic)", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    delivered_count: 5,
    original_user_goal: "Find 5 pubs in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.action).toBe("continue");
  expect(result.delivered).toBe(5);
  expect(result.requested).toBe(5);
  expect(result.suggested_changes).toHaveLength(0);
  expect(result.reason_code).toBe("accepted");
});

test("Acceptance Test A: dentists in Arundel, requested=4, delivered=13 within 25km", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 4,
    accumulated_count: 13,
    original_user_goal: "Find 4 dentists in Arundel",
    constraints: {
      business_type: { value: "dentist", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
    },
    radius_km: 25,
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("ACCEPT");
  expect(result.action).toBe("continue");
  expect(result.delivered).toBe(13);
  expect(result.requested).toBe(4);
  if (!result.rationale.toLowerCase().includes("relaxed") && !result.rationale.toLowerCase().includes("expanded")) {
    if (input.radius_km && input.radius_km > 5) {
      expect(result.rationale).toContain("location expanded");
    }
  }
});

test("Acceptance Test B: pubs in Arundel prefix P hard, delivered=0 → CHANGE_PLAN suggesting EXPAND_AREA only", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 0,
    original_user_goal: "Find 5 pubs in Arundel starting with P",
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
      prefix_filter: { value: "P", hardness: "hard", was_relaxed: false },
    },
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");

  const expandArea = result.suggested_changes.find(c => c.type === "EXPAND_AREA");
  if (!expandArea) {
    throw new Error("Expected EXPAND_AREA in suggestions");
  }

  const relaxPrefix = result.suggested_changes.find(
    c => c.field === "prefix_filter" && c.type === "RELAX_CONSTRAINT"
  );
  if (relaxPrefix) {
    throw new Error("Must NOT suggest relaxing hard prefix_filter constraint");
  }
});

test("Acceptance Test B extension: max radius reached with 0 results → STOP", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 0,
    original_user_goal: "Find 5 pubs in Arundel starting with P",
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "hard", was_relaxed: false },
      prefix_filter: { value: "P", hardness: "hard", was_relaxed: false },
    },
    radius_km: 50,
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
});

test("Hard constraint violation: prefix_filter was_relaxed=true → STOP", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 20,
    original_user_goal: "Find 5 pubs in Arundel starting with P",
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
      prefix_filter: { value: "P", hardness: "hard", was_relaxed: true },
    },
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("hard_constraint_violated");
  const hasViolationGap = result.gaps.some(g => g.includes("hard_constraint_violated"));
  if (!hasViolationGap) {
    throw new Error("Expected gaps to include hard_constraint_violated");
  }
});

test("Lying acceptance prevention: ACCEPT with relaxed constraints notes them in rationale", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 4,
    accumulated_count: 13,
    original_user_goal: "Find 4 dentists in Arundel",
    constraints: {
      business_type: { value: "dentist", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: true },
    },
    radius_km: 25,
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("ACCEPT");
  expect(result.rationale).toContain("relaxed");
  expect(result.reason_code).toBe("accepted_with_relaxed_constraints");
});

test("No-progress safety check: STOP when plan_version increases but nothing changes", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 2,
    original_user_goal: "Find 5 pubs in Arundel",
    attempt_history: [
      { plan_version: 1, radius_km: 10, delivered_count: 2 },
      { plan_version: 2, radius_km: 10, delivered_count: 2 },
    ],
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
    },
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("no_progress_over_attempts");
  expect(result.action).toBe("stop");
});

test("CHANGE_PLAN prioritizes EXPAND_AREA then INCREASE_COVERAGE then RELAX_CONSTRAINT", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 10,
    delivered_count: 3,
    original_user_goal: "Find 10 pubs in Arundel starting with P",
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
      prefix_filter: { value: "P", hardness: "soft", was_relaxed: false },
    },
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("CHANGE_PLAN");

  const types = result.suggested_changes.map(c => c.type);
  const expandIdx = types.indexOf("EXPAND_AREA");
  const coverageIdx = types.indexOf("INCREASE_COVERAGE");
  const relaxIdx = types.indexOf("RELAX_CONSTRAINT");

  if (expandIdx === -1) throw new Error("Expected EXPAND_AREA");
  if (coverageIdx === -1) throw new Error("Expected INCREASE_COVERAGE");
  if (relaxIdx === -1) throw new Error("Expected RELAX_CONSTRAINT");
  if (expandIdx > coverageIdx) throw new Error("EXPAND_AREA should come before INCREASE_COVERAGE");
  if (coverageIdx > relaxIdx) throw new Error("INCREASE_COVERAGE should come before RELAX_CONSTRAINT");
});

test("Never suggest relaxing a hard constraint", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 0,
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
      prefix_filter: { value: "P", hardness: "hard", was_relaxed: false },
    },
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  for (const change of result.suggested_changes) {
    if (change.field === "prefix_filter" && change.type === "RELAX_CONSTRAINT") {
      throw new Error("Must not suggest relaxing hard constraint prefix_filter");
    }
    if (change.field === "business_type" && (change.type === "RELAX_CONSTRAINT" || change.type === "BROADEN_QUERY")) {
      throw new Error("Must not suggest broadening hard constraint business_type");
    }
  }
});

test("Legacy input: CHANGE_PLAN when no structured constraints provided", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    delivered_count: 0,
    constraints: {
      prefix_filter: { value: "P", hardness: "soft", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
    },
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.gaps).toContain("insufficient_count");
});

test("Legacy hard/soft arrays still work (backwards compatible)", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" } as any,
    hard_constraints: ["count", "business_type"],
    soft_constraints: ["location", "prefix_filter"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("CHANGE_PLAN");

  const expandArea = result.suggested_changes.find(c => c.type === "EXPAND_AREA" && c.field === "location");
  if (!expandArea) {
    throw new Error("Expected EXPAND_AREA for soft location");
  }
});

test("Suggested changes are structured objects, not strings", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 0,
    constraints: {
      prefix_filter: { value: "P", hardness: "soft", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
    },
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  for (const change of result.suggested_changes) {
    if (typeof change !== "object") {
      throw new Error("Suggested change must be an object");
    }
    if (!change.type || !change.field || !change.reason) {
      throw new Error("Suggested change must have type, field, and reason");
    }
    if (typeof change.type !== "string" || typeof change.field !== "string" || typeof change.reason !== "string") {
      throw new Error("type, field, reason must be strings");
    }
  }
});

test("STOP when all constraints hard and insufficient results (ASK_USER with options)", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 0,
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "hard", was_relaxed: false },
      prefix_filter: { value: "P", hardness: "hard", was_relaxed: false },
    },
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.suggested_changes).toHaveLength(0);
  if (!result.ask_user_options || result.ask_user_options.length === 0) {
    throw new Error("Expected ask_user_options to be populated");
  }
});

test("Gaps include constraint_too_strict(prefix_filter) when prefix produces 0", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 0,
    constraints: {
      business_type: { value: "pub", hardness: "hard", was_relaxed: false },
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
      prefix_filter: { value: "P", hardness: "soft", was_relaxed: false },
    },
    original_user_goal: "Find 5 pubs in Arundel starting with P",
  };
  const result = judgeLeadsList(input);
  const hasStrictGap = result.gaps.some(g => g.includes("constraint_too_strict") && g.includes("prefix_filter"));
  if (!hasStrictGap) {
    throw new Error(`Expected constraint_too_strict(prefix_filter) in gaps, got: ${JSON.stringify(result.gaps)}`);
  }
});

test("Uses accumulated_count over delivered_count when both provided", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    accumulated_count: 10,
    delivered_count: 3,
    original_user_goal: "Find 5 leads",
  };
  const result = judgeLeadsList(input);
  expect(result.delivered).toBe(10);
  expect(result.verdict).toBe("ACCEPT");
});

test("Normalized goal used when original_user_goal is absent", () => {
  const input: TowerVerdictInput = {
    requested_count_user: 5,
    delivered_count: 2,
    normalized_goal: "Find 5 pubs in Arundel starting with P",
    constraints: {
      location: { value: "Arundel", hardness: "soft", was_relaxed: false },
    },
  };
  const result = judgeLeadsList(input);
  expect(result.rationale).toContain("Find 5 pubs");
});

test("Falls back to requested_count when requested_count_user is missing but requested_count present", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 5,
    original_user_goal: "Find 5 pubs",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("ACCEPT");
  expect(result.requested).toBe(5);
});

runTests();
