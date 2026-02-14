import { judgeLeadsList, TowerVerdictInput, Lead, Constraint } from "../src/evaluator/towerVerdict";

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
        if (!(actual as unknown[]).some(item =>
          typeof item === "string" && item.includes(expected)
        )) {
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
  console.log("Running Tower Verdict Tests (Evidence-Based Constraints)\n");

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

const sampleLeads: Lead[] = [
  { name: "The Plough Inn", address: "High Street, Arundel" },
  { name: "Pear Tree Pub", address: "Mill Road, Arundel" },
  { name: "The Swan", address: "River Road, Arundel" },
  { name: "The Red Lion", address: "Castle Square, Arundel" },
  { name: "The Black Rabbit", address: "Mill Road, Offham" },
];

const dentistLeads: Lead[] = [
  { name: "Arundel Dental Practice", address: "High Street, Arundel" },
  { name: "Castle Dental Care", address: "Tarrant Street, Arundel" },
  { name: "Arun Dental Surgery", address: "Mill Road, Littlehampton" },
  { name: "South Downs Dental", address: "London Road, Worthing" },
  { name: "River Road Dentists", address: "River Road, Storrington" },
  { name: "Chanctonbury Dental", address: "High Street, Steyning" },
  { name: "The Angmering Dental Practice", address: "Station Road, Angmering" },
  { name: "Pulborough Dental Surgery", address: "Lower Street, Pulborough" },
  { name: "Petworth Dental Care", address: "East Street, Petworth" },
  { name: "Billingshurst Dental", address: "High Street, Billingshurst" },
  { name: "Henfield Dental Practice", address: "High Street, Henfield" },
  { name: "Findon Dental Surgery", address: "Findon Road, Findon" },
  { name: "Bramber Dental Clinic", address: "Castle Road, Bramber" },
];

test("STOP when requested_count_user is missing", () => {
  const result = judgeLeadsList({
    leads: sampleLeads,
    original_goal: "Find pubs in Arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.gaps).toContain("missing_requested_count_user");
});

test("ACCEPT: basic count met with no constraints", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    original_goal: "Find 3 pubs in Arundel",
    constraints: [],
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.delivered).toBe(5);
  expect(result.requested).toBe(3);
});

test("NAME_CONTAINS: counts leads containing word", () => {
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "Pub", hardness: "soft" },
    { type: "COUNT_MIN", field: "count", value: 3, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 pubs in Arundel",
  });
  if (result.constraint_results) {
    const nameResult = result.constraint_results.find(r => r.constraint.type === "NAME_CONTAINS");
    if (!nameResult) throw new Error("Expected NAME_CONTAINS result");
    expect(nameResult.matched_count).toBe(1);
  }
});

test("NAME_STARTS_WITH: counts leads starting with letter", () => {
  const constraints: Constraint[] = [
    { type: "NAME_STARTS_WITH", field: "name", value: "T", hardness: "hard" },
    { type: "COUNT_MIN", field: "count", value: 3, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find places starting with T",
  });
  expect(result.delivered).toBe(4);
});

test("COUNT_MIN evaluates against matched leads, not total leads", () => {
  const leads: Lead[] = [
    { name: "Alpha Dental" },
    { name: "Beta Dental" },
    { name: "Charlie Plumbing" },
    { name: "Delta Plumbing" },
    { name: "Echo Plumbing" },
    { name: "Foxtrot Plumbing" },
  ];
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "dental", hardness: "hard" },
    { type: "COUNT_MIN", field: "count", value: 4, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints,
    original_goal: "Find 4 dental clinics",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error(`Expected verdict not to be ACCEPT, but got ACCEPT`);
  }
  expect(result.delivered).toBe(2);
  const countResult = result.constraint_results?.find(
    r => r.constraint.type === "COUNT_MIN"
  );
  expect(countResult).toBeDefined();
  expect(countResult!.passed).toBe(false);
  expect(countResult!.matched_count).toBe(2);
});

test("Acceptance Test A: dentists in Arundel, requested=4, delivered=13 within 25km → ACCEPT", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "soft" },
    { type: "COUNT_MIN", field: "count", value: 4, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads: dentistLeads,
    constraints,
    original_goal: "Find 4 dentists in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.delivered).toBe(13);
  expect(result.requested).toBe(4);
});

test("Acceptance Test B: pubs in Arundel prefix P hard, delivered=0 → CHANGE_PLAN", () => {
  const emptyLeads: Lead[] = [];
  const constraints: Constraint[] = [
    { type: "NAME_STARTS_WITH", field: "name", value: "P", hardness: "hard" },
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "soft" },
    { type: "COUNT_MIN", field: "count", value: 5, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: emptyLeads,
    constraints,
    original_goal: "Find 5 pubs in Arundel starting with P",
  });

  if (result.verdict === "ACCEPT") {
    throw new Error("Must not ACCEPT with 0 leads delivered");
  }

  const relaxPrefix = result.suggested_changes.find(
    c => c.field === "name" && c.from === "P"
  );
  if (relaxPrefix) {
    throw new Error("Must NOT suggest relaxing hard NAME_STARTS_WITH constraint");
  }
});

test("Acceptance Test B extension: max replans → STOP with hard constraint impossible", () => {
  const emptyLeads: Lead[] = [];
  const constraints: Constraint[] = [
    { type: "NAME_STARTS_WITH", field: "name", value: "P", hardness: "hard" },
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
    { type: "COUNT_MIN", field: "count", value: 5, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: emptyLeads,
    constraints,
    original_goal: "Find 5 pubs in Arundel starting with P",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.rationale).toContain("impossible");
});

test("Hard constraint violated: NAME_STARTS_WITH hard with no matches", () => {
  const constraints: Constraint[] = [
    { type: "NAME_STARTS_WITH", field: "name", value: "Z", hardness: "hard" },
    { type: "COUNT_MIN", field: "count", value: 3, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 places starting with Z",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Cannot ACCEPT when hard NAME_STARTS_WITH constraint violated");
  }
  expect(result.gaps).toContain("hard_constraint_violated(name)");
});

test("Hard constraint prevents ACCEPT even when count is met", () => {
  const constraints: Constraint[] = [
    { type: "NAME_STARTS_WITH", field: "name", value: "Z", hardness: "hard" },
    { type: "COUNT_MIN", field: "count", value: 1, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 1,
    leads: sampleLeads,
    constraints,
    original_goal: "Find a place starting with Z",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Cannot ACCEPT when hard constraint NAME_STARTS_WITH(Z) violated");
  }
});

test("Soft constraint: suggests RELAX_CONSTRAINT for soft NAME_CONTAINS", () => {
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "Grill", hardness: "soft" },
    { type: "COUNT_MIN", field: "count", value: 3, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 grill restaurants",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Should not accept: 0 name matches for Grill and count 5 < 3 matched");
  }
  const relaxChange = result.suggested_changes.find(c => c.field === "name");
  if (result.suggested_changes.length > 0 && !relaxChange) {
    throw new Error("Expected RELAX_CONSTRAINT for soft name constraint if changes suggested");
  }
});

test("suggested_changes only contains typed objects, never strings", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "soft" },
    { type: "NAME_CONTAINS", field: "name", value: "Pizza", hardness: "soft" },
    { type: "COUNT_MIN", field: "count", value: 5, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 5 pizza places in Arundel",
  });
  for (const change of result.suggested_changes) {
    if (typeof change !== "object") {
      throw new Error("Suggested change must be an object");
    }
    expect(change.type).toBe("RELAX_CONSTRAINT");
    if (!change.field || !change.reason) {
      throw new Error("Suggested change must have type, field, and reason");
    }
  }
});

test("suggested_changes only proposes relaxations for SOFT constraints", () => {
  const constraints: Constraint[] = [
    { type: "NAME_STARTS_WITH", field: "name", value: "Z", hardness: "hard" },
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "soft" },
    { type: "COUNT_MIN", field: "count", value: 5, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 5 places starting with Z in Arundel",
  });
  for (const change of result.suggested_changes) {
    const matchingConstraint = constraints.find(c => c.field === change.field);
    if (matchingConstraint && matchingConstraint.hardness === "hard") {
      throw new Error(`Must not suggest relaxation for hard constraint: ${change.field}`);
    }
  }
});

test("Output is strict JSON shape", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: sampleLeads,
    constraints: [],
    original_goal: "Find 5 pubs",
  });
  if (!["ACCEPT", "RETRY", "CHANGE_PLAN", "STOP"].includes(result.verdict)) {
    throw new Error(`Invalid verdict: ${result.verdict}`);
  }
  if (typeof result.delivered !== "number") throw new Error("delivered must be number");
  if (typeof result.requested !== "number") throw new Error("requested must be number");
  if (!Array.isArray(result.gaps)) throw new Error("gaps must be array");
  if (typeof result.confidence !== "number") throw new Error("confidence must be number");
  if (result.confidence < 0 || result.confidence > 100) throw new Error("confidence must be 0-100");
  if (typeof result.rationale !== "string") throw new Error("rationale must be string");
  if (!Array.isArray(result.suggested_changes)) throw new Error("suggested_changes must be array");
});

test("No-progress safety check still works", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: [{ name: "A", address: "X" }, { name: "B", address: "Y" }],
    constraints: [],
    original_goal: "Find 5 things",
    attempt_history: [
      { plan_version: 1, radius_km: 10, delivered_count: 2 },
      { plan_version: 2, radius_km: 10, delivered_count: 2 },
    ],
  });
  expect(result.verdict).toBe("STOP");
  expect(result.gaps).toContain("no_further_progress_possible");
});

test("Falls back to requested_count when requested_count_user absent", () => {
  const result = judgeLeadsList({
    requested_count: 3,
    leads: sampleLeads,
    constraints: [],
    original_goal: "Find 3 pubs",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.requested).toBe(3);
});

test("NAME_CONTAINS uses word boundary matching", () => {
  const leads: Lead[] = [
    { name: "The Pub", address: "X" },
    { name: "Republic Bar", address: "Y" },
    { name: "Pub and Grill", address: "Z" },
  ];
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "Pub", hardness: "hard" },
    { type: "COUNT_MIN", field: "count", value: 2, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 2,
    leads,
    constraints,
    original_goal: "Find pubs",
  });
  if (result.constraint_results) {
    const nameResult = result.constraint_results.find(r => r.constraint.type === "NAME_CONTAINS");
    if (!nameResult) throw new Error("Expected NAME_CONTAINS result");
    expect(nameResult.matched_count).toBe(2);
  }
});

test("LOCATION constraint always passes (Supervisor provides location context)", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 places in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
  if (result.constraint_results) {
    const locResult = result.constraint_results.find(r => r.constraint.type === "LOCATION");
    if (!locResult) throw new Error("Expected LOCATION result");
    expect(locResult.passed).toBe(true as any);
  }
});

test("suggested_changes empty when verdict is ACCEPT", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints: [
      { type: "COUNT_MIN", field: "count", value: 3, hardness: "hard" },
    ],
    original_goal: "Find 3 things",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.suggested_changes).toHaveLength(0);
});

test("constraint_results included in output when constraints provided", () => {
  const constraints: Constraint[] = [
    { type: "NAME_STARTS_WITH", field: "name", value: "T", hardness: "soft" },
    { type: "COUNT_MIN", field: "count", value: 2, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 2,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 2 places starting with T",
  });
  if (!result.constraint_results) {
    throw new Error("Expected constraint_results in output");
  }
  if (result.constraint_results.length !== 2) {
    throw new Error(`Expected 2 constraint results, got ${result.constraint_results.length}`);
  }
});

runTests();
