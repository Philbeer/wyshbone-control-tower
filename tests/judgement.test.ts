import { evaluate } from "../src/evaluator/judgement";
import type { JudgementSuccess, JudgementSnapshot } from "../shared/schema";

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
      if (typeof actual !== "string" || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, got ${actual}`);
      }
    },
  };
}

function runTests() {
  console.log("Running Judgement API Tests\n");

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

function makeSuccess(overrides: Partial<JudgementSuccess> = {}): JudgementSuccess {
  return {
    target_leads: 50,
    max_cost_gbp: 100,
    max_cost_per_lead_gbp: 5,
    min_quality_score: 0.7,
    max_steps: 200,
    max_failures: 10,
    stall_window_steps: 10,
    stall_min_delta_leads: 2,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<JudgementSnapshot> = {}): JudgementSnapshot {
  return {
    steps_completed: 50,
    leads_found: 20,
    leads_new_last_window: 5,
    failures_count: 1,
    total_cost_gbp: 40,
    avg_quality_score: 0.85,
    ...overrides,
  };
}

test("SUCCESS_ACHIEVED when all targets met", () => {
  const success = makeSuccess({ target_leads: 50 });
  const snapshot = makeSnapshot({
    leads_found: 55,
    avg_quality_score: 0.8,
    total_cost_gbp: 80,
  });
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("SUCCESS_ACHIEVED");
  expect(result.evaluated_at).toBeDefined();
});

test("COST_EXCEEDED when total cost over budget", () => {
  const success = makeSuccess({ max_cost_gbp: 100 });
  const snapshot = makeSnapshot({ total_cost_gbp: 150 });
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("COST_EXCEEDED");
  expect(result.explanation).toContain("150.00");
});

test("CPL_EXCEEDED when cost per lead too high", () => {
  const success = makeSuccess({ max_cost_per_lead_gbp: 5 });
  const snapshot = makeSnapshot({ leads_found: 10, total_cost_gbp: 80 });
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("CPL_EXCEEDED");
  expect(result.explanation).toContain("8.00");
});

test("STALL_DETECTED when leads_new_last_window below threshold", () => {
  const success = makeSuccess({ stall_min_delta_leads: 3 });
  const snapshot = makeSnapshot({ leads_new_last_window: 1 });
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("STALL_DETECTED");
});

test("FAILURES_EXCEEDED when failures over threshold", () => {
  const success = makeSuccess({ max_failures: 5 });
  const snapshot = makeSnapshot({ failures_count: 8, last_error_code: "TIMEOUT" });
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("FAILURES_EXCEEDED");
  expect(result.explanation).toContain("TIMEOUT");
});

test("CONTINUE when run is progressing normally", () => {
  const success = makeSuccess();
  const snapshot = makeSnapshot();
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("CONTINUE");
  expect(result.reason_code).toBe("RUNNING");
});

test("Priority: SUCCESS_ACHIEVED takes precedence even with high cost", () => {
  const success = makeSuccess({
    target_leads: 10,
    max_cost_gbp: 100,
    max_cost_per_lead_gbp: 5,
    min_quality_score: 0.7,
  });
  const snapshot = makeSnapshot({
    leads_found: 10,
    total_cost_gbp: 45,
    avg_quality_score: 0.75,
  });
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("SUCCESS_ACHIEVED");
});

test("Priority: COST_EXCEEDED before CPL_EXCEEDED", () => {
  const success = makeSuccess({
    max_cost_gbp: 50,
    max_cost_per_lead_gbp: 2,
  });
  const snapshot = makeSnapshot({
    leads_found: 5,
    total_cost_gbp: 60,
  });
  const result = evaluate(success, snapshot);
  expect(result.verdict).toBe("STOP");
  expect(result.reason_code).toBe("COST_EXCEEDED");
});

test("evaluated_at is a valid ISO timestamp", () => {
  const result = evaluate(makeSuccess(), makeSnapshot());
  const parsed = Date.parse(result.evaluated_at);
  if (isNaN(parsed)) {
    throw new Error("evaluated_at should be a valid ISO date");
  }
});

runTests();
