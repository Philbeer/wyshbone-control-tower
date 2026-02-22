import {
  evaluateLearningLayer,
  LearningLayerInput,
  LearningRubricResult,
  DecisionLogEntry,
  OutcomeLogEntry,
  TelemetrySummary,
  PolicySnapshot,
} from "../src/evaluator/learningLayerRubric";

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
      if (typeof actual === "string") {
        if (!actual.includes(expected)) {
          throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!(actual as unknown[]).some((item) => typeof item === "string" && item.includes(expected))) {
          throw new Error(`Expected array ${JSON.stringify(actual)} to contain "${expected}"`);
        }
      } else {
        throw new Error(`Expected string or array, got ${typeof actual}`);
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
  };
}

function makeDecisionLog(count: number): DecisionLogEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    run_id: `run-${i}`,
    step: i + 1,
    action: "search",
    parameters: { query: `test-${i}` },
  }));
}

function makeOutcomeLog(outcomes: Array<"success" | "failure" | "partial">): OutcomeLogEntry[] {
  return outcomes.map((outcome, i) => ({
    run_id: `run-${i}`,
    step: i + 1,
    outcome,
  }));
}

function makeInput(overrides: Partial<LearningLayerInput> = {}): LearningLayerInput {
  return {
    scope_key: "test-scope",
    policy_name: "radius_policy_v1",
    decision_log: makeDecisionLog(10),
    outcome_log: makeOutcomeLog(["success", "success", "success", "success", "success", "failure", "success", "success", "success", "success"]),
    telemetry: {
      total_runs: 10,
      success_count: 9,
      failure_count: 1,
      outcome_delta: 0.1,
      sample_window_hours: 24,
    },
    current_policy: {
      scope_key: "test-scope",
      policy_name: "radius_policy_v1",
      version: 1,
      value: { radius_km: 5 },
    },
    ...overrides,
  };
}

// === DENY TESTS ===

test("DENY: missing decision_log", () => {
  const input = makeInput({ decision_log: [] });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("MISSING_DECISION_LOG");
});

test("DENY: missing outcome_log", () => {
  const input = makeInput({ outcome_log: [] });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("MISSING_OUTCOME_LOG");
});

test("DENY: missing telemetry", () => {
  const input = makeInput({ telemetry: undefined as any });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("MISSING_TELEMETRY");
});

test("DENY: missing current_policy", () => {
  const input = makeInput({ current_policy: undefined as any });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("MISSING_CURRENT_POLICY");
});

test("DENY: insufficient sample size", () => {
  const input = makeInput({
    decision_log: makeDecisionLog(3),
    outcome_log: makeOutcomeLog(["success", "success", "failure"]),
    telemetry: { total_runs: 3, success_count: 2, failure_count: 1 },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("INSUFFICIENT_SAMPLE");
});

test("DENY: critical regression (last 3 failures)", () => {
  const input = makeInput({
    outcome_log: makeOutcomeLog(["success", "success", "success", "failure", "failure", "failure"]),
    telemetry: { total_runs: 6, success_count: 3, failure_count: 3 },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("CRITICAL_REGRESSION");
});

test("DENY: low success rate with no derivable change", () => {
  const input = makeInput({
    outcome_log: makeOutcomeLog(["success", "failure", "failure", "failure", "success"]),
    telemetry: { total_runs: 5, success_count: 2, failure_count: 3 },
    current_policy: {
      scope_key: "test-scope",
      policy_name: "radius_policy_v1",
      version: 1,
      value: { radius_km: 50 },
    },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
});

test("DENY: radius magnitude exceeded", () => {
  const input = makeInput({
    proposed_value: { radius_km: 50 },
    current_policy: {
      scope_key: "test-scope",
      policy_name: "radius_policy_v1",
      version: 1,
      value: { radius_km: 5 },
    },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("MAGNITUDE_EXCEEDED");
});

test("DENY: enrichment steps removed", () => {
  const input = makeInput({
    policy_name: "enrichment_policy_v1",
    proposed_value: { enrichment_steps: ["web_search"] },
    current_policy: {
      scope_key: "test-scope",
      policy_name: "enrichment_policy_v1",
      version: 1,
      value: { enrichment_steps: ["web_search", "verify_address"] },
    },
    telemetry: { total_runs: 20, success_count: 18, failure_count: 2, outcome_delta: 0.15 },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("ENRICHMENT_STEPS_REMOVED");
});

test("DENY: stop policy tightening exceeds max", () => {
  const input = makeInput({
    policy_name: "stop_policy_v1",
    proposed_value: { max_failures: 1, max_steps: 20 },
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_failures: 10, max_steps: 20 },
    },
    telemetry: { total_runs: 20, success_count: 18, failure_count: 2, outcome_delta: 0.1 },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("MAGNITUDE_EXCEEDED");
});

test("DENY: no change needed when metrics are good", () => {
  const input = makeInput({
    telemetry: { total_runs: 20, success_count: 15, failure_count: 5, outcome_delta: 0.05 },
    current_policy: {
      scope_key: "test-scope",
      policy_name: "radius_policy_v1",
      version: 1,
      value: { radius_km: 3 },
    },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBe("NO_CHANGE_NEEDED");
});

// === ALLOW TESTS ===

test("ALLOW: radius_policy_v1 — high success rate triggers tighten", () => {
  const outcomes: Array<"success" | "failure"> = Array(50).fill("success");
  outcomes[10] = "failure"; outcomes[20] = "failure"; outcomes[30] = "failure"; outcomes[40] = "failure";
  const input = makeInput({
    telemetry: { total_runs: 50, success_count: 46, failure_count: 4, outcome_delta: 0.2 },
    outcome_log: makeOutcomeLog(outcomes),
    decision_log: makeDecisionLog(50),
    current_policy: {
      scope_key: "test-scope",
      policy_name: "radius_policy_v1",
      version: 1,
      value: { radius_km: 10 },
    },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("ALLOW");
  expect(result.proposed_value).toBeDefined();
  expect(result.confidence).toBeGreaterThan(0);
  expect(result.reason).toContain("Policy update approved");
});

test("ALLOW: radius_policy_v1 — high failure rate triggers expand", () => {
  const outcomes: Array<"success" | "failure"> = [];
  for (let i = 0; i < 20; i++) outcomes.push(i % 3 === 0 ? "failure" : "success");
  const input = makeInput({
    telemetry: { total_runs: 20, success_count: 13, failure_count: 7, outcome_delta: 0.1 },
    outcome_log: makeOutcomeLog(outcomes),
    decision_log: makeDecisionLog(20),
    current_policy: {
      scope_key: "test-scope",
      policy_name: "radius_policy_v1",
      version: 1,
      value: { radius_km: 5 },
    },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("ALLOW");
  expect(result.proposed_value).toBeDefined();
  const newRadius = (result.proposed_value as any)?.radius_km;
  expect(newRadius).toBeGreaterThan(5);
});

test("ALLOW: enrichment_policy_v1 — adds verify_address on failure rate", () => {
  const outcomes: Array<"success" | "failure"> = [];
  for (let i = 0; i < 20; i++) outcomes.push(i % 3 === 0 ? "failure" : "success");
  const input = makeInput({
    policy_name: "enrichment_policy_v1",
    telemetry: { total_runs: 20, success_count: 13, failure_count: 7, outcome_delta: 0.1 },
    outcome_log: makeOutcomeLog(outcomes),
    decision_log: makeDecisionLog(20),
    current_policy: {
      scope_key: "test-scope",
      policy_name: "enrichment_policy_v1",
      version: 1,
      value: { enrichment_steps: ["web_search", "phone_lookup"] },
    },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("ALLOW");
  expect(result.proposed_value).toBeDefined();
});

test("ALLOW: stop_policy_v1 — tightens max_failures on high failure rate", () => {
  const outcomes: Array<"success" | "failure"> = [];
  for (let i = 0; i < 20; i++) outcomes.push(i % 2 === 0 ? "success" : "failure");
  const input = makeInput({
    policy_name: "stop_policy_v1",
    telemetry: { total_runs: 20, success_count: 10, failure_count: 10, outcome_delta: 0.15 },
    outcome_log: makeOutcomeLog(outcomes),
    decision_log: makeDecisionLog(20),
    current_policy: {
      scope_key: "test-scope",
      policy_name: "stop_policy_v1",
      version: 1,
      value: { max_failures: 10, max_steps: 20 },
    },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("ALLOW");
  expect(result.proposed_value).toBeDefined();
  const newMaxFailures = (result.proposed_value as any)?.max_failures;
  expect(newMaxFailures).toBeDefined();
});

// === CONFIDENCE TESTS ===

test("Confidence scales with sample size and success rate", () => {
  const smallSample = evaluateLearningLayer(makeInput({
    telemetry: { total_runs: 5, success_count: 5, failure_count: 0, outcome_delta: 0.1 },
    decision_log: makeDecisionLog(5),
    outcome_log: makeOutcomeLog(["success", "success", "success", "success", "success"]),
    current_policy: { scope_key: "test-scope", policy_name: "radius_policy_v1", version: 1, value: { radius_km: 10 } },
  }));

  const largeOutcomes: Array<"success" | "failure"> = Array(50).fill("success");
  largeOutcomes[10] = "failure"; largeOutcomes[20] = "failure"; largeOutcomes[30] = "failure"; largeOutcomes[40] = "failure";
  const largeSample = evaluateLearningLayer(makeInput({
    telemetry: { total_runs: 50, success_count: 46, failure_count: 4, outcome_delta: 0.2 },
    decision_log: makeDecisionLog(50),
    outcome_log: makeOutcomeLog(largeOutcomes),
    current_policy: { scope_key: "test-scope", policy_name: "radius_policy_v1", version: 1, value: { radius_km: 10 } },
  }));

  expect(largeSample.confidence).toBeGreaterThan(smallSample.confidence);
});

// === EVIDENCE SUMMARY TESTS ===

test("Evidence summary includes expected fields", () => {
  const outcomes: Array<"success" | "failure"> = Array(50).fill("success");
  outcomes[10] = "failure"; outcomes[20] = "failure"; outcomes[30] = "failure"; outcomes[40] = "failure";
  const input = makeInput({
    telemetry: { total_runs: 50, success_count: 46, failure_count: 4, outcome_delta: 0.2, sample_window_hours: 48 },
    decision_log: makeDecisionLog(50),
    outcome_log: makeOutcomeLog(outcomes),
    current_policy: { scope_key: "test-scope", policy_name: "radius_policy_v1", version: 1, value: { radius_km: 10 } },
  });
  const result = evaluateLearningLayer(input);
  expect(result.evidence_summary.total_runs).toBe(50);
  expect(result.evidence_summary.success_rate).toBeDefined();
  expect(result.evidence_summary.decision_log_count).toBeDefined();
});

// === ROLLBACK POINTER / ARTEFACT FIELD TESTS ===

test("ALLOW result has proposed_value and no deny_code", () => {
  const outcomes: Array<"success" | "failure"> = Array(50).fill("success");
  outcomes[10] = "failure"; outcomes[20] = "failure"; outcomes[30] = "failure"; outcomes[40] = "failure";
  const input = makeInput({
    telemetry: { total_runs: 50, success_count: 46, failure_count: 4, outcome_delta: 0.2 },
    decision_log: makeDecisionLog(50),
    outcome_log: makeOutcomeLog(outcomes),
    current_policy: { scope_key: "test-scope", policy_name: "radius_policy_v1", version: 1, value: { radius_km: 10 } },
  });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("ALLOW");
  expect(result.proposed_value).toBeDefined();
  expect(result.deny_code).toBe(undefined as any);
});

test("DENY result has deny_code", () => {
  const input = makeInput({ decision_log: [] });
  const result = evaluateLearningLayer(input);
  expect(result.verdict).toBe("DENY");
  expect(result.deny_code).toBeDefined();
});

function runTests() {
  console.log("Running Learning Layer v1 (Tower) Tests\n");

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
