import {
  evaluateMaxReplansLearning,
  MaxReplansLearningInput,
  RunOutcome,
} from "../src/evaluator/maxReplansLearning";

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
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, got ${actual}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected: string) {
      if (typeof actual === "string" && !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      } else if (Array.isArray(actual) && !actual.includes(expected)) {
        throw new Error(`Expected array to contain "${expected}", got ${JSON.stringify(actual)}`);
      }
    },
  };
}

function makeOutcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    run_id: `run-${Math.random().toString(36).slice(2, 8)}`,
    outcome: "success",
    replans_used: 1,
    max_replans: 2,
    replan_helped: true,
    delivery_summary: "PASS",
    ...overrides,
  };
}

function makeInput(overrides: Partial<MaxReplansLearningInput> & { run_outcomes?: RunOutcome[] } = {}): MaxReplansLearningInput {
  const defaultOutcomes: RunOutcome[] = Array.from({ length: 10 }, (_, i) =>
    makeOutcome({ run_id: `run-${i}` })
  );
  return {
    scope_key: "test-scope",
    run_outcomes: defaultOutcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 1, max_steps: 20, max_failures: 10 },
    },
    ...overrides,
  };
}

test("INCREASE: exceeded >= 0.30 and helped >= 0.50 => +1", () => {
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < 10; i++) {
    outcomes.push(makeOutcome({
      run_id: `run-${i}`,
      replans_used: 2,
      max_replans: 2,
      replan_helped: true,
      delivery_summary: "PASS",
      outcome: "success",
    }));
  }
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 2, max_steps: 20 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("INCREASE");
  expect(result.new_max_replans).toBe(3);
  expect(result.old_max_replans).toBe(2);
  expect(result.proposed_value).toBeDefined();
  expect((result.proposed_value as any).max_replans).toBe(3);
  expect(result.reason_codes).toContain("EXCEEDED_HIGH");
  expect(result.reason_codes).toContain("HELPED_HIGH");
});

test("INCREASE: from 1 to 2 when conditions met", () => {
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < 10; i++) {
    const exceeded = i < 4;
    const helped = i < 6;
    outcomes.push(makeOutcome({
      run_id: `run-${i}`,
      replans_used: exceeded ? 1 : 0,
      max_replans: 1,
      replan_helped: helped,
      delivery_summary: "PASS",
      outcome: "success",
    }));
  }
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 1 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("INCREASE");
  expect(result.new_max_replans).toBe(2);
});

test("INCREASE: capped at 3, returns NO_LEARN with AT_CAP", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 10 }, (_, i) =>
    makeOutcome({
      run_id: `run-${i}`,
      replans_used: 3,
      max_replans: 3,
      replan_helped: true,
      delivery_summary: "PASS",
    })
  );
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 5,
      value: { max_replans: 3 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("NO_LEARN");
  expect(result.new_max_replans).toBe(3);
  expect(result.reason_codes).toContain("AT_CAP");
});

test("DECREASE: waste >= 0.60 => -1", () => {
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < 10; i++) {
    const isWaste = i < 7;
    outcomes.push(makeOutcome({
      run_id: `run-${i}`,
      replans_used: isWaste ? 2 : 0,
      max_replans: 2,
      replan_helped: false,
      delivery_summary: isWaste ? "FAIL" : "PASS",
      outcome: isWaste ? "failure" : "success",
    }));
  }
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 2,
      value: { max_replans: 2, max_steps: 20 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("DECREASE");
  expect(result.new_max_replans).toBe(1);
  expect(result.old_max_replans).toBe(2);
  expect(result.proposed_value).toBeDefined();
  expect((result.proposed_value as any).max_replans).toBe(1);
  expect(result.reason_codes).toContain("WASTE_HIGH");
});

test("DECREASE: floor at 0, returns NO_LEARN with AT_FLOOR", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 10 }, (_, i) =>
    makeOutcome({
      run_id: `run-${i}`,
      replans_used: 1,
      max_replans: 0,
      replan_helped: false,
      delivery_summary: i >= 8 ? "PASS" : "FAIL",
      outcome: i >= 8 ? "success" : "failure",
    })
  );
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 3,
      value: { max_replans: 0 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("NO_LEARN");
  expect(result.new_max_replans).toBe(0);
  expect(result.reason_codes).toContain("AT_FLOOR");
});

test("NO_LEARN: no threshold met", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 10 }, (_, i) =>
    makeOutcome({
      run_id: `run-${i}`,
      replans_used: 0,
      max_replans: 2,
      replan_helped: false,
      delivery_summary: "PASS",
      outcome: "success",
    })
  );
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 2 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("NO_LEARN");
  expect(result.proposed_value).toBeNull();
  expect(result.reason_codes).toContain("NO_THRESHOLD_MET");
});

test("GUARDRAIL: insufficient sample (N < 5)", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 3 }, (_, i) =>
    makeOutcome({ run_id: `run-${i}` })
  );
  const input = makeInput({ run_outcomes: outcomes });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("NO_LEARN");
  expect(result.reason_codes).toContain("INSUFFICIENT_SAMPLE");
  expect(result.confidence).toBe(0);
});

test("GUARDRAIL: last 3 runs all FAIL blocks update", () => {
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < 10; i++) {
    const isLast3 = i >= 7;
    outcomes.push(makeOutcome({
      run_id: `run-${i}`,
      replans_used: 2,
      max_replans: 2,
      replan_helped: true,
      delivery_summary: isLast3 ? "FAIL" : "PASS",
      outcome: isLast3 ? "failure" : "success",
    }));
  }
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 2 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("NO_LEARN");
  expect(result.reason_codes).toContain("RECENT_ALL_FAIL");
});

test("GUARDRAIL: last 3 not all FAIL allows update", () => {
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < 10; i++) {
    const isLast2 = i >= 8;
    outcomes.push(makeOutcome({
      run_id: `run-${i}`,
      replans_used: 2,
      max_replans: 2,
      replan_helped: true,
      delivery_summary: isLast2 ? "FAIL" : "PASS",
      outcome: isLast2 ? "failure" : "success",
    }));
  }
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 2 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("INCREASE");
});

test("Evidence summary includes expected rate fields", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 10 }, (_, i) =>
    makeOutcome({ run_id: `run-${i}` })
  );
  const input = makeInput({ run_outcomes: outcomes });
  const result = evaluateMaxReplansLearning(input);
  expect(result.evidence_summary.sample_size).toBe(10);
  expect(result.evidence_summary.replan_helped_rate).toBeDefined();
  expect(result.evidence_summary.waste_rate).toBeDefined();
  expect(result.evidence_summary.exceeded_rate).toBeDefined();
  expect(result.evidence_summary.current_max_replans).toBeDefined();
});

test("Change by max 1: increase only +1 even if rates are extreme", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 50 }, (_, i) =>
    makeOutcome({
      run_id: `run-${i}`,
      replans_used: 1,
      max_replans: 1,
      replan_helped: true,
      delivery_summary: "PASS",
    })
  );
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 1 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("INCREASE");
  expect(result.new_max_replans).toBe(2);
  expect(result.new_max_replans - result.old_max_replans).toBe(1);
});

test("Change by max 1: decrease only -1 even if waste is extreme", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 50 }, (_, i) =>
    makeOutcome({
      run_id: `run-${i}`,
      replans_used: 3,
      max_replans: 3,
      replan_helped: false,
      delivery_summary: "FAIL",
      outcome: "failure",
    })
  );
  outcomes.push(makeOutcome({
    run_id: "run-pass",
    replans_used: 0,
    max_replans: 3,
    replan_helped: false,
    delivery_summary: "PASS",
    outcome: "success",
  }));
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 3 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("DECREASE");
  expect(result.new_max_replans).toBe(2);
  expect(result.old_max_replans - result.new_max_replans).toBe(1);
});

test("Preserves other policy fields in proposed_value", () => {
  const outcomes: RunOutcome[] = Array.from({ length: 10 }, (_, i) =>
    makeOutcome({
      run_id: `run-${i}`,
      replans_used: 2,
      max_replans: 2,
      replan_helped: true,
      delivery_summary: "PASS",
    })
  );
  const input = makeInput({
    run_outcomes: outcomes,
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_replans: 2, max_steps: 20, max_failures: 10 },
    },
  });
  const result = evaluateMaxReplansLearning(input);
  expect(result.decision).toBe("INCREASE");
  expect((result.proposed_value as any).max_steps).toBe(20);
  expect((result.proposed_value as any).max_failures).toBe(10);
  expect((result.proposed_value as any).max_replans).toBe(3);
});

test("Confidence scales with sample size", () => {
  const smallOutcomes = Array.from({ length: 5 }, (_, i) =>
    makeOutcome({ run_id: `run-${i}` })
  );
  const largeOutcomes = Array.from({ length: 50 }, (_, i) =>
    makeOutcome({ run_id: `run-${i}` })
  );
  const smallResult = evaluateMaxReplansLearning(makeInput({ run_outcomes: smallOutcomes }));
  const largeResult = evaluateMaxReplansLearning(makeInput({ run_outcomes: largeOutcomes }));
  expect(largeResult.confidence).toBeGreaterThan(smallResult.confidence);
});

function runTests() {
  console.log("Running max_replans Learning Tests\n");

  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
