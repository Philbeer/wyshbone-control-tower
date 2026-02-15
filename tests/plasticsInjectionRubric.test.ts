import {
  judgePlasticsInjection,
  PlasticsRubricInput,
  PlasticsStepSnapshot,
  PlasticsTowerJudgement,
} from "../src/evaluator/plasticsInjectionRubric";

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
        throw new Error(
          `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
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
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, got ${actual}`);
      }
    },
  };
}

function runTests() {
  console.log("Running Plastics Injection Moulding Rubric Tests\n");

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

test("STOP: constraint impossible — max_scrap_percent < achievable_scrap_floor", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 2 },
    factory_state: {
      scrap_rate_now: 5,
      achievable_scrap_floor: 4,
      moisture_level: 0.3,
      tool_condition: "worn",
      step: 1,
    },
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("constraint_impossible");
  expect(result.reason).toContain("constraint impossible under current moisture/tool state");
});

test("STOP: extreme scrap rate (>=50%)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 55, step: 3 },
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("extreme_scrap");
  expect(result.reason).toContain("extreme scrap rate");
});

test("STOP: deadline infeasible", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 3, deadline_step: 5 },
    factory_state: { scrap_rate_now: 8, step: 5 },
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("deadline_infeasible");
});

test("ACCEPT: scrap within limit and not worsening", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 3, step: 2 },
    history: [
      { step: 1, scrap_rate: 4 },
      { step: 2, scrap_rate: 3 },
    ],
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.action).toBe("continue");
  expect(result.reason).toContain("within limit");
  expect(result.reason).toContain("not worsening");
});

test("ACCEPT: scrap within limit, no history (first step)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 2, step: 1 },
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.action).toBe("continue");
});

test("CHANGE_PLAN: scrap > max and decision is 'continue' (no rising trend)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 8, step: 3 },
    factory_decision: { action: "continue" },
    history: [
      { step: 1, scrap_rate: 9 },
      { step: 2, scrap_rate: 7, decision_action: "adjust_temp" },
      { step: 3, scrap_rate: 8 },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("decision_ineffective");
  expect(result.gaps).toContain("machine_unstable");
  expect(result.reason).toContain("Switch to alternate machine profile");
  expect(result.suggested_changes).toContain("switch to alternate machine profile");
});

test("CHANGE_PLAN: repeating failing action", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 9, step: 4 },
    factory_decision: { action: "adjust_temp" },
    history: [
      { step: 2, scrap_rate: 7 },
      { step: 3, scrap_rate: 8, decision_action: "adjust_temp" },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.reason).toContain("repeating failing action");
  expect(result.reason).toContain("Switch to alternate machine profile");
  expect(result.gaps).toContain("machine_unstable");
});

test("CHANGE_PLAN: scrap rising for 2 consecutive steps (above limit)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 10, step: 4 },
    history: [
      { step: 1, scrap_rate: 4 },
      { step: 2, scrap_rate: 6 },
      { step: 3, scrap_rate: 8 },
      { step: 4, scrap_rate: 10 },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("scrap_rising_trend");
  expect(result.gaps).toContain("machine_unstable");
  expect(result.reason).toContain("Current machine is unstable");
  expect(result.reason).toContain("Switch to alternate machine profile");
});

test("CHANGE_PLAN: scrap rising for 2 consecutive steps (within limit)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 15 },
    factory_state: { scrap_rate_now: 10, step: 4 },
    history: [
      { step: 1, scrap_rate: 4 },
      { step: 2, scrap_rate: 6 },
      { step: 3, scrap_rate: 8 },
      { step: 4, scrap_rate: 10 },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("scrap_rising_trend");
  expect(result.gaps).toContain("machine_unstable");
  expect(result.reason).toContain("Switch to alternate machine profile");
});

test("CHANGE_PLAN: defect shifts after mitigation (above limit)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 7, defect_type: "sink_marks", step: 3 },
    history: [
      { step: 1, scrap_rate: 6, defect_type: "flash" },
      { step: 2, scrap_rate: 7, defect_type: "flash", decision_action: "reduce_pressure" },
      { step: 3, scrap_rate: 7, defect_type: "sink_marks" },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("defect_type_shifted");
  expect(result.gaps).toContain("machine_unstable");
  expect(result.reason).toContain("defect shifted");
  expect(result.reason).toContain("Switch to alternate machine profile");
});

test("CHANGE_PLAN: defect shifts after mitigation (within limit)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 10 },
    factory_state: { scrap_rate_now: 5, defect_type: "warping", step: 3 },
    history: [
      { step: 1, scrap_rate: 4, defect_type: "short_shots" },
      { step: 2, scrap_rate: 5, defect_type: "short_shots", decision_action: "increase_pressure" },
      { step: 3, scrap_rate: 5, defect_type: "warping" },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("defect_type_shifted");
  expect(result.gaps).toContain("machine_unstable");
  expect(result.reason).toContain("Switch to alternate machine profile");
});

test("ACCEPT: scrap > max but active mitigation in progress (not continue, not repeat)", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 7, step: 2 },
    factory_decision: { action: "adjust_temp" },
    history: [
      { step: 1, scrap_rate: 8, decision_action: "reduce_pressure" },
      { step: 2, scrap_rate: 7 },
    ],
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.action).toBe("continue");
  expect(result.gaps).toContain("scrap_above_target");
});

test("ACCEPT: slight worsening but within limit", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 10 },
    factory_state: { scrap_rate_now: 5, step: 3 },
    history: [
      { step: 1, scrap_rate: 3 },
      { step: 2, scrap_rate: 4 },
      { step: 3, scrap_rate: 5 },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("scrap_rising_trend");
});

test("Output always includes required fields", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 3, step: 1 },
  });
  if (!["ACCEPT", "CHANGE_PLAN", "STOP"].includes(result.verdict)) {
    throw new Error(`Invalid verdict: ${result.verdict}`);
  }
  if (!["continue", "stop", "change_plan"].includes(result.action)) {
    throw new Error(`Invalid action: ${result.action}`);
  }
  if (typeof result.scrap_rate_now !== "number") throw new Error("scrap_rate_now must be number");
  if (typeof result.max_scrap_percent !== "number") throw new Error("max_scrap_percent must be number");
  if (typeof result.confidence !== "number") throw new Error("confidence must be number");
  if (typeof result.reason !== "string") throw new Error("reason must be string");
  if (!Array.isArray(result.gaps)) throw new Error("gaps must be array");
  if (!Array.isArray(result.suggested_changes)) throw new Error("suggested_changes must be array");
});

test("Multi-step scenario: judgements appear at each step", () => {
  const steps: PlasticsStepSnapshot[] = [];
  const verdicts: string[] = [];

  const stepData = [
    { scrap_rate: 6, defect_type: "flash", decision_action: undefined },
    { scrap_rate: 7, defect_type: "flash", decision_action: "adjust_temp" },
    { scrap_rate: 8, defect_type: "flash", decision_action: "adjust_temp" },
    { scrap_rate: 9, defect_type: "sink_marks", decision_action: "reduce_pressure" },
  ];

  for (let i = 0; i < stepData.length; i++) {
    const sd = stepData[i];
    steps.push({
      step: i + 1,
      scrap_rate: sd.scrap_rate,
      defect_type: sd.defect_type,
      decision_action: sd.decision_action,
    });

    const result = judgePlasticsInjection({
      constraints: { max_scrap_percent: 5 },
      factory_state: {
        scrap_rate_now: sd.scrap_rate,
        defect_type: sd.defect_type,
        step: i + 1,
      },
      factory_decision: sd.decision_action ? { action: sd.decision_action } : undefined,
      history: [...steps],
    });

    verdicts.push(result.verdict);
    expect(result.step).toBe(i + 1);
  }

  if (verdicts.length !== 4) {
    throw new Error(`Expected 4 verdicts, got ${verdicts.length}`);
  }

  if (!verdicts.includes("CHANGE_PLAN")) {
    throw new Error(`Expected at least one CHANGE_PLAN in scenario, got: ${verdicts.join(", ")}`);
  }
});

test("Multi-step scenario includes STOP for impossible constraint", () => {
  const result1 = judgePlasticsInjection({
    constraints: { max_scrap_percent: 1 },
    factory_state: { scrap_rate_now: 5, achievable_scrap_floor: 3, step: 1 },
  });
  expect(result1.verdict).toBe("STOP");
  expect(result1.gaps).toContain("constraint_impossible");

  const result2 = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 4, achievable_scrap_floor: 3, step: 2 },
  });
  expect(result2.verdict).toBe("ACCEPT");
});

test("CHANGE_PLAN: decision is 'no_change' while above limit", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: { scrap_rate_now: 8, step: 2 },
    factory_decision: { action: "no_change" },
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("machine_unstable");
  expect(result.reason).toContain("Switch to alternate machine profile");
});

test("Energy tracking flows through to output", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5 },
    factory_state: {
      scrap_rate_now: 3,
      energy_kwh_per_good_part: 1.2,
      step: 1,
    },
    history: [
      { step: 1, scrap_rate: 3, energy_kwh_per_good_part: 1.2 },
    ],
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.scrap_rate_now).toBe(3);
});

test("Achievable scrap floor equal to max_scrap_percent does NOT trigger impossible", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 4 },
    factory_state: { scrap_rate_now: 4, achievable_scrap_floor: 4, step: 1 },
  });
  if (result.verdict === "STOP" && result.gaps.includes("constraint_impossible")) {
    throw new Error("Should not be impossible when max_scrap_percent == achievable_scrap_floor");
  }
});

test("STOP: deadline past with scrap above limit", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 3, deadline_step: 4 },
    factory_state: { scrap_rate_now: 6, step: 6 },
  });
  expect(result.verdict).toBe("STOP");
  expect(result.gaps).toContain("deadline_infeasible");
});

test("Deadline met — scrap within limit, no STOP", () => {
  const result = judgePlasticsInjection({
    constraints: { max_scrap_percent: 5, deadline_step: 4 },
    factory_state: { scrap_rate_now: 3, step: 4 },
  });
  if (result.verdict === "STOP" && result.gaps.includes("deadline_infeasible")) {
    throw new Error("Should not stop for deadline when scrap is within limit");
  }
});

runTests();
