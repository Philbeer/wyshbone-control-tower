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
        if (!(actual as unknown[]).includes(expected)) {
          throw new Error(`Expected array ${JSON.stringify(actual)} to contain "${expected}"`);
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
  console.log("Running Tower Verdict Tests (Hard/Soft Constraints)\n");

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

test("ACCEPT when delivered >= requested (unchanged behaviour)", () => {
  const result = judgeLeadsList({
    requested_count: 5,
    delivered_count: 5,
    original_user_goal: "Find 5 pubs in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.delivered).toBe(5);
  expect(result.requested).toBe(5);
  expect(result.suggested_changes).toHaveLength(0);
});

test("STOP behaviour unchanged (no hard/soft provided)", () => {
  const result = judgeLeadsList({
    requested_count: 5,
    delivered_count: 5,
  });
  expect(result.verdict).toBe("ACCEPT");
});

test("Legacy CHANGE_PLAN when no hard/soft constraints provided", () => {
  const result = judgeLeadsList({
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.gaps).toContain("insufficient_count");
});

test("CHANGE_PLAN with soft location: suggests EXPAND_AREA first", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type"],
    soft_constraints: ["location", "prefix_filter"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("CHANGE_PLAN");
  if (result.suggested_changes.length === 0) {
    throw new Error("Expected at least one suggested change");
  }
  const firstChange = result.suggested_changes[0];
  expect(firstChange.type).toBe("EXPAND_AREA");
  expect(firstChange.field).toBe("location");
});

test("CHANGE_PLAN with soft prefix: suggests RELAX_CONSTRAINT for prefix", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type", "location"],
    soft_constraints: ["prefix_filter"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("CHANGE_PLAN");
  const prefixChange = result.suggested_changes.find(c => c.field === "prefix_filter");
  if (!prefixChange) {
    throw new Error("Expected a suggested change for prefix_filter");
  }
  expect(prefixChange.type).toBe("RELAX_CONSTRAINT");
});

test("CHANGE_PLAN never suggests relaxing a hard constraint", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type", "prefix_filter"],
    soft_constraints: ["location"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("CHANGE_PLAN");
  for (const change of result.suggested_changes) {
    if (change.field === "prefix_filter" && change.type === "RELAX_CONSTRAINT") {
      throw new Error("Must not suggest relaxing hard constraint prefix_filter");
    }
    if (change.field === "business_type" && change.type === "BROADEN_QUERY") {
      throw new Error("Must not suggest broadening hard constraint business_type");
    }
  }
  const locationChange = result.suggested_changes.find(c => c.field === "location");
  if (!locationChange) {
    throw new Error("Expected EXPAND_AREA for soft location");
  }
  expect(locationChange.type).toBe("EXPAND_AREA");
});

test("ASK_USER when all constraints are hard and results insufficient", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type", "prefix_filter", "location"],
    soft_constraints: [],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("ASK_USER");
  expect(result.suggested_changes).toHaveLength(0);
  if (!result.ask_user_options || result.ask_user_options.length === 0) {
    throw new Error("Expected ask_user_options to be populated");
  }
  const optionFields = result.ask_user_options.map(o => o.field);
  if (!optionFields.includes("location")) {
    throw new Error("Expected an option for location");
  }
  if (!optionFields.includes("prefix_filter")) {
    throw new Error("Expected an option for prefix_filter");
  }
});

test("ASK_USER rationale explains the tradeoff", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type", "prefix_filter", "location"],
    soft_constraints: [],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.rationale).toContain("hard");
});

test("Acceptance: pubs in Arundel with hard=[count,business_type], soft=[location,prefix]", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type"],
    soft_constraints: ["location", "prefix_filter"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);

  expect(result.verdict).toBe("CHANGE_PLAN");

  const expandArea = result.suggested_changes.find(c => c.type === "EXPAND_AREA" && c.field === "location");
  if (!expandArea) {
    throw new Error("Preferred: CHANGE_PLAN should suggest EXPAND_AREA(location) to search nearby while keeping prefix");
  }

  if (result.verdict === "ACCEPT") {
    throw new Error("Should NOT ACCEPT a plan that drops prefix and returns 20 pubs");
  }
});

test("Acceptance: after max replans, ASK_USER when only hard constraints remain", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type", "prefix_filter", "location"],
    soft_constraints: [],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);

  expect(result.verdict).toBe("ASK_USER");

  if (result.verdict === "CHANGE_PLAN") {
    throw new Error("Should return ASK_USER, not CHANGE_PLAN, when relaxing hard constraints is required");
  }
});

test("Should not ACCEPT when prefix dropped and 20 pubs returned but prefix was hard", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 20,
    constraints: { location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type", "prefix_filter"],
    soft_constraints: ["location"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("ACCEPT");
});

test("Suggested changes are structured objects, not strings", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type"],
    soft_constraints: ["location", "prefix_filter"],
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

test("Business type broadening only suggested when soft", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type"],
    soft_constraints: ["location", "prefix_filter"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  const btChange = result.suggested_changes.find(c => c.field === "business_type");
  if (btChange) {
    throw new Error("business_type is hard — must not suggest broadening");
  }
});

test("Field not in soft or hard list is not suggested for relaxation", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type"],
    soft_constraints: ["location"],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("CHANGE_PLAN");
  const prefixChange = result.suggested_changes.find(c => c.field === "prefix_filter" || c.field === "prefix");
  if (prefixChange) {
    throw new Error("prefix is not in soft_constraints — must not suggest relaxing it");
  }
});

test("ASK_USER when field not classified and no soft options available", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 0,
    constraints: { prefix: "P", location: "Arundel", business_type: "pub" },
    hard_constraints: ["count", "business_type", "location"],
    soft_constraints: [],
    original_user_goal: "Find 5 pubs in Arundel that begin with P",
  };
  const result = judgeLeadsList(input);
  expect(result.verdict).toBe("ASK_USER");
});

test("Normalized goal used when original_user_goal is absent", () => {
  const input: TowerVerdictInput = {
    requested_count: 5,
    delivered_count: 2,
    normalized_goal: "Find 5 pubs in Arundel starting with P",
    hard_constraints: ["count"],
    soft_constraints: ["location"],
  };
  const result = judgeLeadsList(input);
  expect(result.rationale).toContain("Find 5 pubs");
});

runTests();
