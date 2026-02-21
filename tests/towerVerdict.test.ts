import {
  judgeLeadsList,
  judgeAskLeadQuestion,
  migrateLegacyConstraints,
  normalizeConstraintHardness,
  normalizeStructuredConstraint,
  normalizeStructuredConstraints,
  TowerVerdictInput,
  Lead,
  Constraint,
  StructuredConstraint,
  AskLeadQuestionInput,
} from "../src/evaluator/towerVerdict";

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
      if (Array.isArray(actual)) {
        if (
          !(actual as unknown[]).some(
            (item) => typeof item === "string" && item.includes(expected)
          )
        ) {
          throw new Error(
            `Expected array ${JSON.stringify(actual)} to contain "${expected}"`
          );
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
        throw new Error(
          `Expected array of length ${expected}, got ${Array.isArray(actual) ? actual.length : "non-array"}`
        );
      }
    },
  };
}

function runTests() {
  console.log(
    "Running Tower Verdict Tests (User Intent + Accumulated Delivery)\n"
  );

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
  {
    name: "The Angmering Dental Practice",
    address: "Station Road, Angmering",
  },
  {
    name: "Pulborough Dental Surgery",
    address: "Lower Street, Pulborough",
  },
  { name: "Petworth Dental Care", address: "East Street, Petworth" },
  {
    name: "Billingshurst Dental",
    address: "High Street, Billingshurst",
  },
  { name: "Henfield Dental Practice", address: "High Street, Henfield" },
  { name: "Findon Dental Surgery", address: "Findon Road, Findon" },
  { name: "Bramber Dental Clinic", address: "Castle Road, Bramber" },
];

// ── Core contract tests ──

test("STOP when requested_count_user is missing", () => {
  const result = judgeLeadsList({
    leads: sampleLeads,
    original_goal: "Find pubs in Arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("MISSING_REQUESTED_COUNT");
});

test("ACCEPT: basic count met with no constraints", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    original_goal: "Find 3 pubs in Arundel",
    constraints: [],
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.action).toBe("continue");
  expect(result.delivered).toBe(5);
  expect(result.requested).toBe(3);
});

test("Output always has verdict, action, requested, delivered, gaps, confidence, rationale, suggested_changes", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: sampleLeads,
    constraints: [],
    original_goal: "Find 5 pubs",
  });
  if (!["ACCEPT", "CHANGE_PLAN", "STOP"].includes(result.verdict)) {
    throw new Error(`Invalid verdict: ${result.verdict}`);
  }
  if (!["continue", "stop", "change_plan"].includes(result.action)) {
    throw new Error(`Invalid action: ${result.action}`);
  }
  if (typeof result.delivered !== "number")
    throw new Error("delivered must be number");
  if (typeof result.requested !== "number")
    throw new Error("requested must be number");
  if (!Array.isArray(result.gaps)) throw new Error("gaps must be array");
  if (typeof result.confidence !== "number")
    throw new Error("confidence must be number");
  if (result.confidence < 0 || result.confidence > 100)
    throw new Error("confidence must be 0-100");
  if (typeof result.rationale !== "string")
    throw new Error("rationale must be string");
  if (!Array.isArray(result.suggested_changes))
    throw new Error("suggested_changes must be array");
});

// ── Requested resolution priority ──

test("requested_count_user takes priority over success_criteria.target_count", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    success_criteria: { target_count: 20 },
    leads: sampleLeads,
    constraints: [],
    original_goal: "Find 3 pubs",
  });
  expect(result.requested).toBe(3);
  expect(result.verdict).toBe("ACCEPT");
});

test("success_criteria.requested_count_user used when top-level absent", () => {
  const result = judgeLeadsList({
    success_criteria: { requested_count_user: 4 },
    leads: sampleLeads,
    constraints: [],
    original_goal: "Find 4 pubs",
  });
  expect(result.requested).toBe(4);
  expect(result.verdict).toBe("ACCEPT");
});

test("Falls back to target_count then requested_count", () => {
  const result = judgeLeadsList({
    requested_count: 3,
    leads: sampleLeads,
    constraints: [],
    original_goal: "Find 3 pubs",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.requested).toBe(3);
});

// ── Delivered resolution priority ──

test("delivered_matching_accumulated preferred over leads.length", () => {
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads: [{ name: "A" }, { name: "B" }],
    delivered: { delivered_matching_accumulated: 6 },
    constraints: [],
    original_goal: "Find 4 things",
  });
  expect(result.delivered).toBe(6);
  expect(result.verdict).toBe("ACCEPT");
});

test("leads.length used when delivered_matching_accumulated absent", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints: [],
    original_goal: "Find 3 pubs",
  });
  expect(result.delivered).toBe(5);
});

test("delivered_matching_this_plan used as fallback", () => {
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads: [],
    delivered: { delivered_matching_this_plan: 5 },
    constraints: [],
    original_goal: "Find 4 things",
  });
  expect(result.delivered).toBe(5);
  expect(result.verdict).toBe("ACCEPT");
});

// ── Constraint evaluation ──

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
    const nameResult = result.constraint_results.find(
      (r) => r.constraint.type === "NAME_CONTAINS"
    );
    if (!nameResult) throw new Error("Expected NAME_CONTAINS result");
    expect(nameResult.matched_count).toBe(1);
  }
});

test("NAME_STARTS_WITH: counts leads starting with letter", () => {
  const constraints: Constraint[] = [
    {
      type: "NAME_STARTS_WITH",
      field: "name",
      value: "T",
      hardness: "hard",
    },
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
    const nameResult = result.constraint_results.find(
      (r) => r.constraint.type === "NAME_CONTAINS"
    );
    if (!nameResult) throw new Error("Expected NAME_CONTAINS result");
    expect(nameResult.matched_count).toBe(2);
  }
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
    {
      type: "NAME_CONTAINS",
      field: "name",
      value: "dental",
      hardness: "hard",
    },
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
    (r) => r.constraint.type === "COUNT_MIN"
  );
  expect(countResult).toBeDefined();
  expect(countResult!.passed).toBe(false);
  expect(countResult!.matched_count).toBe(2);
});

test("LOCATION constraint always passes (Supervisor provides location context)", () => {
  const constraints: Constraint[] = [
    {
      type: "LOCATION",
      field: "location",
      value: "Arundel",
      hardness: "hard",
    },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 places in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
  if (result.constraint_results) {
    const locResult = result.constraint_results.find(
      (r) => r.constraint.type === "LOCATION"
    );
    if (!locResult) throw new Error("Expected LOCATION result");
    expect(locResult.passed).toBe(true as any);
  }
});

// ── Hard constraint enforcement ──

test("Hard constraint violated: NAME_STARTS_WITH hard with no matches", () => {
  const constraints: Constraint[] = [
    {
      type: "NAME_STARTS_WITH",
      field: "name",
      value: "Z",
      hardness: "hard",
    },
    { type: "COUNT_MIN", field: "count", value: 3, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 places starting with Z",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error(
      "Cannot ACCEPT when hard NAME_STARTS_WITH constraint violated"
    );
  }
  expect(result.gaps).toContain("HARD_CONSTRAINT_VIOLATED");
});

test("Hard constraint prevents ACCEPT even when count is met", () => {
  const constraints: Constraint[] = [
    {
      type: "NAME_STARTS_WITH",
      field: "name",
      value: "Z",
      hardness: "hard",
    },
    { type: "COUNT_MIN", field: "count", value: 1, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 1,
    leads: sampleLeads,
    constraints,
    original_goal: "Find a place starting with Z",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error(
      "Cannot ACCEPT when hard constraint NAME_STARTS_WITH(Z) violated"
    );
  }
});

// ── Soft constraint relaxation ──

test("Soft constraint: suggests RELAX_CONSTRAINT for soft NAME_CONTAINS", () => {
  const constraints: Constraint[] = [
    {
      type: "NAME_CONTAINS",
      field: "name",
      value: "Grill",
      hardness: "soft",
    },
    { type: "COUNT_MIN", field: "count", value: 3, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 grill restaurants",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Should not accept: 0 name matches for Grill");
  }
  const relaxChange = result.suggested_changes.find(
    (c) => c.field === "name_contains"
  );
  if (result.suggested_changes.length > 0 && !relaxChange) {
    const fields = result.suggested_changes.map(c => c.field).join(", ");
    throw new Error(
      `Expected RELAX_CONSTRAINT for soft name constraint if changes suggested. Got fields: ${fields}`
    );
  }
});

test("suggested_changes only contains typed objects, never strings", () => {
  const constraints: Constraint[] = [
    {
      type: "LOCATION",
      field: "location",
      value: "Arundel",
      hardness: "soft",
    },
    {
      type: "NAME_CONTAINS",
      field: "name",
      value: "Pizza",
      hardness: "soft",
    },
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
    if (
      ![
        "RELAX_CONSTRAINT",
        "EXPAND_AREA",
        "INCREASE_SEARCH_BUDGET",
        "CHANGE_QUERY",
        "STOP_CONDITION",
        "ADD_VERIFICATION_STEP",
      ].includes(change.type)
    ) {
      throw new Error(`Invalid suggested_change type: ${change.type}`);
    }
    if (!change.field || !change.reason) {
      throw new Error(
        "Suggested change must have type, field, and reason"
      );
    }
  }
});

test("suggested_changes only proposes relaxations for SOFT constraints", () => {
  const constraints: Constraint[] = [
    {
      type: "NAME_STARTS_WITH",
      field: "name",
      value: "Z",
      hardness: "hard",
    },
    {
      type: "LOCATION",
      field: "location",
      value: "Arundel",
      hardness: "soft",
    },
    { type: "COUNT_MIN", field: "count", value: 5, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 5 places starting with Z in Arundel",
  });
  for (const change of result.suggested_changes) {
    if (change.type === "RELAX_CONSTRAINT") {
      const matchingConstraint = constraints.find(
        (c) => c.field === change.field
      );
      if (matchingConstraint && matchingConstraint.hardness === "hard") {
        throw new Error(
          `Must not suggest relaxation for hard constraint: ${change.field}`
        );
      }
    }
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
    {
      type: "NAME_STARTS_WITH",
      field: "name",
      value: "T",
      hardness: "soft",
    },
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
    throw new Error(
      `Expected 2 constraint results, got ${result.constraint_results.length}`
    );
  }
});

// ── No-progress safety ──

test("No-progress safety check still works", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: [
      { name: "A", address: "X" },
      { name: "B", address: "Y" },
    ],
    constraints: [],
    original_goal: "Find 5 things",
    attempt_history: [
      { plan_version: 1, radius_km: 10, delivered_count: 2 },
      { plan_version: 2, radius_km: 10, delivered_count: 2 },
    ],
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("NO_PROGRESS");
});

// ── Replan context ──

test("CHANGE_PLAN when replans available and soft constraints can be relaxed", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: [{ name: "Only One" }],
    constraints: [
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 1, max_replans: 3, radius_km: 5 },
    success_criteria: { allow_relax_soft_constraints: true },
    original_goal: "Find 5 places in Arundel",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  if (result.suggested_changes.length === 0) {
    throw new Error("Expected suggestions when CHANGE_PLAN");
  }
});

test("STOP when max_replans exhausted", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: [{ name: "Only One" }],
    constraints: [
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 3, max_replans: 3, radius_km: 5 },
    original_goal: "Find 5 places in Arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("MAX_REPLANS_EXHAUSTED");
});

test("STOP when allow_relax_soft_constraints is false and max replans exhausted", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: [{ name: "Only One" }],
    constraints: [
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 3, max_replans: 3, radius_km: 5 },
    success_criteria: { allow_relax_soft_constraints: false },
    original_goal: "Find 5 places in Arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
});

// ── Label honesty ──

test("label_misleading gap when relaxed_constraints present in title", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints: [],
    meta: { relaxed_constraints: ["prefix_filter dropped"] },
    artefact_title: "Pubs starting with prefix P in Arundel",
    original_goal: "Find 3 pubs starting with P",
  });
  expect(result.gaps).toContain("LABEL_MISLEADING");
});

test("no label_misleading gap when no relaxed_constraints", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints: [],
    meta: {},
    original_goal: "Find 3 pubs",
  });
  for (const gap of result.gaps) {
    if (gap === "LABEL_MISLEADING") {
      throw new Error("Should not have LABEL_MISLEADING when no relaxed_constraints");
    }
  }
});

// ── EXPAND_AREA suggestions ──

test("EXPAND_AREA suggested when insufficient count and location is soft", () => {
  const result = judgeLeadsList({
    requested_count_user: 10,
    leads: [{ name: "One pub" }],
    constraints: [
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 0, max_replans: 3, radius_km: 5 },
    original_goal: "Find 10 pubs near Arundel",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  const expandArea = result.suggested_changes.find(
    (c) => c.type === "EXPAND_AREA"
  );
  if (!expandArea) {
    throw new Error("Expected EXPAND_AREA suggestion");
  }
  expect(expandArea.field).toBe("radius_km");
});

test("EXPAND_AREA suggested for hard name constraint instead of RELAX_CONSTRAINT", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: [{ name: "Pear Tree Pub" }],
    constraints: [
      {
        type: "NAME_STARTS_WITH",
        field: "name",
        value: "P",
        hardness: "hard",
      },
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 0, max_replans: 3, radius_km: 5 },
    original_goal: "Find 5 pubs starting with P, expand location if needed",
  });
  const relaxPrefix = result.suggested_changes.find(
    (c) => c.type === "RELAX_CONSTRAINT" && c.field === "prefix_filter"
  );
  if (relaxPrefix) {
    throw new Error("Must NOT suggest relaxing hard NAME_STARTS_WITH constraint");
  }
  const expandArea = result.suggested_changes.find(
    (c) => c.type === "EXPAND_AREA"
  );
  if (!expandArea) {
    throw new Error("Expected EXPAND_AREA suggestion instead of relaxing hard constraint");
  }
});

// ── Acceptance Test A: Dentist case ──

test("Acceptance A.1: dentist requested=4, delivered_matching_accumulated=1 → FAIL + CHANGE_PLAN", () => {
  const result = judgeLeadsList({
    requested_count_user: 4,
    delivered: { delivered_matching_accumulated: 1 },
    leads: [],
    constraints: [
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 0, max_replans: 3, radius_km: 5 },
    original_goal: "Find 4 dentists in Arundel using google places search",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Must not ACCEPT with only 1 delivered");
  }
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("INSUFFICIENT_COUNT");
  const expandArea = result.suggested_changes.find(
    (c) => c.type === "EXPAND_AREA"
  );
  if (!expandArea) {
    throw new Error("Expected EXPAND_AREA suggestion for dentist case");
  }
});

test("Acceptance A.2: dentist requested=4, delivered_matching_accumulated=4 → ACCEPT", () => {
  const result = judgeLeadsList({
    requested_count_user: 4,
    delivered: { delivered_matching_accumulated: 4 },
    leads: [],
    constraints: [
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 1, max_replans: 3, radius_km: 10 },
    original_goal: "Find 4 dentists in Arundel using google places search",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.action).toBe("continue");
  expect(result.delivered).toBe(4);
});

test("Acceptance A.3: dentist with leads array, requested=4, 13 leads → ACCEPT", () => {
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads: dentistLeads,
    constraints: [
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    original_goal: "Find 4 dentists in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.delivered).toBe(13);
  expect(result.requested).toBe(4);
});

// ── Acceptance Test B: Swan case ──

test("Acceptance B: swan pubs, accumulated=2 after max replans → FAIL + STOP", () => {
  const result = judgeLeadsList({
    requested_count_user: 4,
    delivered: { delivered_matching_accumulated: 2 },
    leads: [],
    constraints: [
      {
        type: "NAME_CONTAINS",
        field: "name",
        value: "swan",
        hardness: "hard",
      },
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 3, max_replans: 3, radius_km: 25 },
    original_goal: "Find 4 pubs in Arundel with the word swan in the name",
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Must not ACCEPT with only 2 of 4 delivered");
  }
  expect(result.action).toBe("stop");
});

// ── Acceptance Test C: Prefix hard constraint ──

test("Acceptance C.1: prefix P hard, expand location soft, replans available → CHANGE_PLAN with EXPAND_AREA only", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: [{ name: "Pear Tree Pub" }],
    constraints: [
      {
        type: "NAME_STARTS_WITH",
        field: "name",
        value: "P",
        hardness: "hard",
      },
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 0, max_replans: 3, radius_km: 5 },
    success_criteria: { allow_relax_soft_constraints: true },
    original_goal:
      "Find 5 pubs in Arundel starting with P, make P hard, expand location if needed",
  });
  const relaxPrefix = result.suggested_changes.find(
    (c) => c.type === "RELAX_CONSTRAINT" && c.field === "prefix_filter"
  );
  if (relaxPrefix) {
    throw new Error("Must NOT suggest relaxing hard prefix constraint");
  }
});

test("Acceptance C.2: prefix P hard, cannot reach 5 after max replans → STOP", () => {
  const result = judgeLeadsList({
    requested_count_user: 5,
    delivered: { delivered_matching_accumulated: 2 },
    leads: [],
    constraints: [
      {
        type: "NAME_STARTS_WITH",
        field: "name",
        value: "P",
        hardness: "hard",
      },
      {
        type: "LOCATION",
        field: "location",
        value: "Arundel",
        hardness: "soft",
      },
    ],
    meta: { replans_used: 3, max_replans: 3, radius_km: 25 },
    original_goal:
      "Find 5 pubs in Arundel starting with P, make P hard, expand location if needed",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
});

test("Acceptance B extension: all hard with NAME_STARTS_WITH(Z) and 0 name matches, no replans → STOP with impossible", () => {
  const constraints: Constraint[] = [
    {
      type: "NAME_STARTS_WITH",
      field: "name",
      value: "Z",
      hardness: "hard",
    },
    { type: "COUNT_MIN", field: "count", value: 5, hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 5,
    leads: sampleLeads,
    constraints,
    meta: { replans_used: 3, max_replans: 3 },
    original_goal: "Find 5 pubs starting with Z",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.rationale).toContain("impossible");
});

test("Swan case: 1 of 4 pubs with hard NAME_CONTAINS produces CHANGE_PLAN + EXPAND_AREA", () => {
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "swan", hardness: "hard" },
    { type: "LOCATION", field: "location", value: "arundel", hardness: "hard" },
  ];
  const leads: Lead[] = [
    { name: "The Swan Inn", address: "Arundel High Street" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints,
    original_goal: "find 4 pubs in arundel that have the word swan in the name",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.delivered).toBe(1);
  expect(result.requested).toBe(4);
  const expandArea = result.suggested_changes.find((s) => s.type === "EXPAND_AREA");
  if (!expandArea) throw new Error("Expected EXPAND_AREA suggestion");
  expect(expandArea.field).toBe("radius_km");
});

test("Swan case with legacy string constraints produces CHANGE_PLAN", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn", address: "Arundel High Street" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    hard_constraints: ["NAME_CONTAINS:swan", "LOCATION:arundel"],
    original_goal: "find 4 pubs in arundel that have the word swan in the name",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.delivered).toBe(1);
  const expandArea = result.suggested_changes.find((s) => s.type === "EXPAND_AREA");
  if (!expandArea) throw new Error("Expected EXPAND_AREA suggestion from legacy constraints");
});

test("Swan case with constraints missing hardness defaults to hard and produces CHANGE_PLAN", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn", address: "Arundel High Street" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints: [
      { type: "NAME_CONTAINS", field: "name", value: "swan" } as any,
      { type: "LOCATION", field: "location", value: "arundel" } as any,
    ],
    original_goal: "find 4 pubs in arundel that have the word swan in the name",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.delivered).toBe(1);
  const expandArea = result.suggested_changes.find((s) => s.type === "EXPAND_AREA");
  if (!expandArea) throw new Error("Expected EXPAND_AREA after hardness defaulting");
});

test("Swan case with success_criteria.hard_constraints (no hardness field) produces CHANGE_PLAN", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn", address: "Arundel High Street" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    success_criteria: {
      requested_count_user: 4,
      hard_constraints: [
        { type: "NAME_CONTAINS", field: "name", value: "swan" },
        { type: "LOCATION", field: "location", value: "arundel" },
      ],
    },
    original_goal: "find 4 pubs in arundel that have the word swan in the name",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.delivered).toBe(1);
});

test("migrateLegacyConstraints parses NAME_CONTAINS and LOCATION strings", () => {
  const result = migrateLegacyConstraints(
    ["NAME_CONTAINS:swan", "LOCATION:arundel"],
    ["COUNT_MIN:4"]
  );
  expect(result.length).toBe(3);
  expect(result[0].type).toBe("NAME_CONTAINS");
  expect(result[0].field).toBe("name");
  expect(result[0].value as string).toBe("swan");
  expect(result[0].hardness).toBe("hard");
  expect(result[1].type).toBe("LOCATION");
  expect(result[1].hardness).toBe("hard");
  expect(result[2].type).toBe("COUNT_MIN");
  expect(result[2].hardness).toBe("soft");
  expect(result[2].value as number).toBe(4);
});

test("migrateLegacyConstraints skips unparseable strings", () => {
  const result = migrateLegacyConstraints(
    ["NAME_CONTAINS:swan", "INVALID_FORMAT", "NO_TYPE:value"],
    []
  );
  expect(result.length).toBe(1);
  expect(result[0].type).toBe("NAME_CONTAINS");
});

test("normalizeConstraintHardness defaults NAME_CONTAINS to hard", () => {
  const result = normalizeConstraintHardness({ type: "NAME_CONTAINS", field: "name", value: "swan" });
  if (!result) throw new Error("Expected non-null constraint");
  expect(result.hardness).toBe("hard");
});

test("normalizeConstraintHardness preserves explicit soft", () => {
  const result = normalizeConstraintHardness({ type: "NAME_CONTAINS", field: "name", value: "swan", hardness: "soft" });
  if (!result) throw new Error("Expected non-null constraint");
  expect(result.hardness).toBe("soft");
});

test("normalizeConstraintHardness defaults COUNT_MIN to soft", () => {
  const result = normalizeConstraintHardness({ type: "COUNT_MIN", field: "count", value: 5 });
  if (!result) throw new Error("Expected non-null constraint");
  expect(result.hardness).toBe("soft");
});

test("normalizeConstraintHardness returns null for missing fields", () => {
  const result = normalizeConstraintHardness({ type: "NAME_CONTAINS" } as any);
  if (result !== null) throw new Error("Expected null for missing field/value");
});

test("Swan case: 4 of 4 delivered produces ACCEPT", () => {
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "swan", hardness: "hard" },
    { type: "LOCATION", field: "location", value: "arundel", hardness: "hard" },
  ];
  const leads: Lead[] = [
    { name: "The Swan Inn" },
    { name: "Swan Hotel" },
    { name: "Black Swan Pub" },
    { name: "Old Swan Brewery" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints,
    original_goal: "find 4 pubs in arundel that have the word swan in the name",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.delivered).toBe(4);
});

test("Swan case with replans exhausted produces STOP", () => {
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "swan", hardness: "hard" },
  ];
  const leads: Lead[] = [
    { name: "The Swan Inn" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints,
    meta: { replans_used: 3, max_replans: 3, radius_km: 50 },
    original_goal: "find 4 pubs in arundel that have the word swan in the name",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("MAX_REPLANS_EXHAUSTED");
});

test("normalizeStructuredConstraint converts LOCATION_EQUALS to LOCATION", () => {
  const sc: StructuredConstraint = {
    id: "c_location",
    type: "LOCATION_EQUALS",
    field: "location",
    value: "arundel",
    hard: false,
    operator: "=",
    rationale: "User specified the location as arundel",
  };
  const result = normalizeStructuredConstraint(sc);
  expect(result!.type).toBe("LOCATION");
  expect(result!.field).toBe("location");
  expect(result!.hardness).toBe("soft");
  expect(result!.value as string).toBe("arundel");
});

test("normalizeStructuredConstraint converts hard:true to hardness hard", () => {
  const sc: StructuredConstraint = {
    id: "c_count",
    type: "COUNT_MIN",
    field: "count",
    value: 4,
    hard: true,
    operator: ">=",
  };
  const result = normalizeStructuredConstraint(sc);
  expect(result!.type).toBe("COUNT_MIN");
  expect(result!.hardness).toBe("hard");
  expect(result!.value as number).toBe(4);
});

test("normalizeStructuredConstraint converts NAME_CONTAINS with hard:false to soft", () => {
  const sc: StructuredConstraint = {
    id: "c_name_contains",
    type: "NAME_CONTAINS",
    field: "name",
    value: "swan",
    hard: false,
    operator: "contains_word",
  };
  const result = normalizeStructuredConstraint(sc);
  expect(result!.type).toBe("NAME_CONTAINS");
  expect(result!.hardness).toBe("soft");
  expect(result!.value as string).toBe("swan");
});

test("normalizeStructuredConstraints converts batch of Supervisor constraints", () => {
  const scs: StructuredConstraint[] = [
    { id: "c_count", type: "COUNT_MIN", field: "count", value: 4, hard: true, operator: ">=" },
    { id: "c_location", type: "LOCATION_EQUALS", field: "location", value: "arundel", hard: false, operator: "=" },
    { id: "c_name_contains", type: "NAME_CONTAINS", field: "name", value: "swan", hard: false, operator: "contains_word" },
  ];
  const result = normalizeStructuredConstraints(scs);
  expect(result.length).toBe(3);
  expect(result[0].type).toBe("COUNT_MIN");
  expect(result[0].hardness).toBe("hard");
  expect(result[1].type).toBe("LOCATION");
  expect(result[1].hardness).toBe("soft");
  expect(result[2].type).toBe("NAME_CONTAINS");
  expect(result[2].hardness).toBe("soft");
});

test("normalizeStructuredConstraint rejects unknown type", () => {
  const sc: StructuredConstraint = {
    type: "UNKNOWN_TYPE",
    value: "test",
  };
  const result = normalizeStructuredConstraint(sc);
  expect(result).toBe(null);
});

test("Swan case with real Supabase structured_constraints: CHANGE_PLAN with EXPAND_AREA", () => {
  const leads: Lead[] = [
    { name: "The White Swan", phone: "01903 882677", address: "16 Chichester Rd, Arundel BN18 0AD, UK" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    structured_constraints: [
      { id: "c_count", type: "COUNT_MIN", field: "count", value: 4, hard: true, operator: ">=" },
      { id: "c_location", type: "LOCATION_EQUALS", field: "location", value: "arundel", hard: false, operator: "=" },
      { id: "c_name_contains", type: "NAME_CONTAINS", field: "name", value: "swan", hard: false, operator: "contains_word" },
    ],
    original_goal: "find 4 pubs in arundel that have the word swan in the name",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.delivered).toBe(1);
  const hasExpandArea = result.suggested_changes.some(s => s.type === "EXPAND_AREA");
  if (!hasExpandArea) {
    throw new Error(`Expected EXPAND_AREA suggestion but got: ${JSON.stringify(result.suggested_changes.map(s => s.type))}`);
  }
});

test("Swan case: structured_constraints fallback when constraints is empty", () => {
  const leads: Lead[] = [
    { name: "The White Swan" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints: [],
    structured_constraints: [
      { id: "c_name_contains", type: "NAME_CONTAINS", field: "name", value: "swan", hard: false },
    ],
    original_goal: "find pubs with swan in the name",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.delivered).toBe(1);
});

test("Policy: shortfall + canReplan + no constraints → CHANGE_PLAN with fallback EXPAND_AREA (Case B)", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    original_goal: "find 4 pubs in arundel",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("INSUFFICIENT_COUNT");
  const hasExpandArea = result.suggested_changes.some(s => s.type === "EXPAND_AREA");
  if (!hasExpandArea) {
    throw new Error(`Expected EXPAND_AREA suggestion but got: ${JSON.stringify(result.suggested_changes.map(s => s.type))}`);
  }
  const expandSuggestion = result.suggested_changes.find(s => s.type === "EXPAND_AREA")!;
  if (!expandSuggestion.reason.includes("location is soft and replans remain")) {
    throw new Error(`Expected reason to mention 'location is soft and replans remain' but got: ${expandSuggestion.reason}`);
  }
});

test("Policy: shortfall + canReplan + soft location constraint → CHANGE_PLAN with EXPAND_AREA (Case A)", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints: [
      { type: "LOCATION", field: "location", value: "arundel", hardness: "soft" },
      { type: "NAME_CONTAINS", field: "name", value: "swan", hardness: "soft" },
    ],
    original_goal: "find 4 pubs in arundel with swan in the name",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  expect(result.gaps).toContain("INSUFFICIENT_COUNT");
  const hasExpandArea = result.suggested_changes.some(s => s.type === "EXPAND_AREA");
  if (!hasExpandArea) {
    throw new Error(`Expected EXPAND_AREA suggestion but got: ${JSON.stringify(result.suggested_changes.map(s => s.type))}`);
  }
});

test("Policy: shortfall + replans exhausted → STOP (Case C)", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints: [
      { type: "LOCATION", field: "location", value: "arundel", hardness: "soft" },
    ],
    meta: { replans_used: 3, max_replans: 3 },
    original_goal: "find 4 pubs in arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("MAX_REPLANS_EXHAUSTED");
});

test("Policy: shortfall + location hard → STOP (Case D)", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints: [
      { type: "LOCATION", field: "location", value: "arundel", hardness: "hard" },
    ],
    original_goal: "find 4 pubs in arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
});

test("Policy: shortfall + max radius already reached (50km) → STOP (Case E)", () => {
  const leads: Lead[] = [
    { name: "The Swan Inn" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    constraints: [
      { type: "LOCATION", field: "location", value: "arundel", hardness: "soft" },
    ],
    meta: { radius_km: 50 },
    original_goal: "find 4 pubs in arundel",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
});

test("Policy: shortfall + no constraints + radius at cap → STOP", () => {
  const leads: Lead[] = [
    { name: "Some Pub" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    meta: { radius_km: 50 },
    original_goal: "find 4 pubs",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
});

test("Policy: shortfall + no constraints + replans exhausted → STOP", () => {
  const leads: Lead[] = [
    { name: "Some Pub" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    meta: { replans_used: 5, max_replans: 5 },
    original_goal: "find 4 pubs",
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.gaps).toContain("MAX_REPLANS_EXHAUSTED");
});

test("Policy: zero leads + canReplan + no constraints → CHANGE_PLAN with EXPAND_AREA", () => {
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads: [],
    original_goal: "find 4 pubs in arundel",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("change_plan");
  const hasExpandArea = result.suggested_changes.some(s => s.type === "EXPAND_AREA");
  if (!hasExpandArea) {
    throw new Error(`Expected EXPAND_AREA fallback but got: ${JSON.stringify(result.suggested_changes.map(s => s.type))}`);
  }
});

test("Policy: EXPAND_AREA doubles radius up to 50km cap", () => {
  const leads: Lead[] = [{ name: "Pub A" }];
  const result = judgeLeadsList({
    requested_count_user: 4,
    leads,
    meta: { radius_km: 30 },
    original_goal: "find 4 pubs",
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  const expandSuggestion = result.suggested_changes.find(s => s.type === "EXPAND_AREA");
  if (!expandSuggestion) throw new Error("Missing EXPAND_AREA");
  expect(expandSuggestion.from as number).toBe(30);
  expect(expandSuggestion.to as number).toBe(50);
});

test("Swan case: constraints field takes priority over structured_constraints", () => {
  const leads: Lead[] = [
    { name: "The White Swan" },
    { name: "The Black Bull" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 2,
    leads,
    constraints: [
      { type: "NAME_CONTAINS", field: "name", value: "swan", hardness: "soft" },
    ],
    structured_constraints: [
      { type: "NAME_CONTAINS", field: "name", value: "bull", hard: false },
    ],
    original_goal: "find pubs",
  });
  expect(result.constraint_results![0].constraint.value as string).toBe("swan");
});

// ── CVL-aware judgement tests ──

test("CVL: verified_exact_count overrides delivered_matching_accumulated", () => {
  const result = judgeLeadsList({
    requested_count_user: 10,
    leads: [{ name: "A" }, { name: "B" }],
    delivered: { delivered_matching_accumulated: 50 },
    constraints: [],
    original_goal: "Find 10 things",
    verification_summary: {
      verified_exact_count: 2,
    },
  });
  expect(result.delivered).toBe(2);
  if (result.verdict === "ACCEPT") {
    throw new Error("Must NOT accept when verified_exact_count (2) < requested (10), even though delivered_matching_accumulated is 50");
  }
});

test("CVL: ACCEPT when verified_exact_count meets requested", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: [{ name: "A" }, { name: "B" }, { name: "C" }],
    delivered: { delivered_matching_accumulated: 1 },
    constraints: [],
    original_goal: "Find 3 things",
    verification_summary: {
      verified_exact_count: 5,
    },
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.delivered).toBe(5);
});

test("CVL: LOCATION no longer auto-passes when CVL says unknown", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 places in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "LOCATION", field: "location", status: "unknown", reason: "unverifiable with current tools" },
      ],
    },
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Must NOT accept when hard LOCATION constraint status is unknown");
  }
  const hasUnknownGap = result.gaps.some(g => g.includes("HARD_CONSTRAINT_UNKNOWN"));
  if (!hasUnknownGap) {
    throw new Error(`Expected HARD_CONSTRAINT_UNKNOWN gap but got: ${JSON.stringify(result.gaps)}`);
  }
});

test("CVL: LOCATION no longer auto-passes when CVL says no", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 places in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "LOCATION", field: "location", status: "no", reason: "leads are in London, not Arundel" },
      ],
    },
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Must NOT accept when hard LOCATION constraint status is no");
  }
  const hasViolation = result.gaps.some(g => g.includes("HARD_CONSTRAINT_VIOLATED"));
  if (!hasViolation) {
    throw new Error(`Expected HARD_CONSTRAINT_VIOLATED gap but got: ${JSON.stringify(result.gaps)}`);
  }
});

test("CVL: LOCATION passes when CVL says yes", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 places in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "LOCATION", field: "location", status: "yes" },
      ],
    },
  });
  expect(result.verdict).toBe("ACCEPT");
});

test("CVL: ACCEPT requires all hard constraints = yes", () => {
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "pub", hardness: "hard" },
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 pubs in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "NAME_CONTAINS", field: "name", status: "yes" },
        { type: "LOCATION", field: "location", status: "no" },
      ],
    },
  });
  if (result.verdict === "ACCEPT") {
    throw new Error("Must NOT accept when any hard constraint has status 'no'");
  }
});

test("CVL: ACCEPT when all hard constraints = yes and count met", () => {
  const constraints: Constraint[] = [
    { type: "NAME_CONTAINS", field: "name", value: "pub", hardness: "hard" },
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    original_goal: "Find 3 pubs in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "NAME_CONTAINS", field: "name", status: "yes" },
        { type: "LOCATION", field: "location", status: "yes" },
      ],
    },
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.rationale).toContain("verified");
});

test("CVL: hard constraint unknown with replans available → CHANGE_PLAN", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    meta: { replans_used: 0, max_replans: 3 },
    original_goal: "Find 3 places in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "LOCATION", field: "location", status: "unknown" },
      ],
    },
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  const hasAddVerification = result.suggested_changes.some(s => s.type === "ADD_VERIFICATION_STEP");
  if (!hasAddVerification) {
    throw new Error(`Expected ADD_VERIFICATION_STEP suggestion but got: ${JSON.stringify(result.suggested_changes.map(s => s.type))}`);
  }
});

test("CVL: hard constraint unknown + unverifiable + no replans → STOP", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    meta: { replans_used: 3, max_replans: 3 },
    original_goal: "Find 3 places in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "LOCATION", field: "location", status: "unknown", reason: "unverifiable with current tools" },
      ],
    },
  });
  expect(result.verdict).toBe("STOP");
  expect(result.gaps).toContain("HARD_CONSTRAINT_UNVERIFIABLE");
});

test("CVL: legacy behaviour preserved when CVL absent", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints: [
      { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
    ],
    original_goal: "Find 3 places in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
});

test("CVL: location_not_verifiable gap when no CVL and LOCATION constraint present", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints: [
      { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
    ],
    original_goal: "Find 3 places in Arundel",
  });
  expect(result.verdict).toBe("ACCEPT");
  expect(result.gaps).toContain("LOCATION_NOT_VERIFIABLE");
});

test("CVL: no location_not_verifiable gap when CVL present", () => {
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints: [
      { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
    ],
    original_goal: "Find 3 places in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "LOCATION", field: "location", status: "yes" },
      ],
    },
  });
  expect(result.verdict).toBe("ACCEPT");
  for (const gap of result.gaps) {
    if (gap === "LOCATION_NOT_VERIFIABLE") {
      throw new Error("Should not have location_not_verifiable when CVL is present");
    }
  }
});

test("CVL: ADD_VERIFICATION_STEP is a valid suggested_change type", () => {
  const constraints: Constraint[] = [
    { type: "LOCATION", field: "location", value: "Arundel", hardness: "hard" },
  ];
  const result = judgeLeadsList({
    requested_count_user: 3,
    leads: sampleLeads,
    constraints,
    meta: { replans_used: 0, max_replans: 3 },
    original_goal: "Find 3 places in Arundel",
    verification_summary: {
      verified_exact_count: 5,
      constraint_results: [
        { type: "LOCATION", field: "location", status: "unknown" },
      ],
    },
  });
  for (const change of result.suggested_changes) {
    if (typeof change !== "object") {
      throw new Error("Suggested change must be an object");
    }
    if (
      ![
        "RELAX_CONSTRAINT",
        "EXPAND_AREA",
        "INCREASE_SEARCH_BUDGET",
        "CHANGE_QUERY",
        "STOP_CONDITION",
        "ADD_VERIFICATION_STEP",
      ].includes(change.type)
    ) {
      throw new Error(`Invalid suggested_change type: ${change.type}`);
    }
  }
});

// ── ASK_LEAD_QUESTION overconfidence flagging (2 example judgements) ──

test("Example judgement 1: confidence=1.0 with full evidence → STOP invalid_confidence", () => {
  const result = judgeAskLeadQuestion({
    confidence: 1.0,
    evidence_items: [
      { source: "google_maps", url: "https://maps.google.com/place/123", is_official: false },
      { source: "company_website", url: "https://example.com", is_official: true },
      { source: "yelp", url: "https://yelp.com/biz/abc", is_official: false },
    ],
  });
  expect(result.verdict).toBe("STOP");
  expect(result.action).toBe("stop");
  expect(result.reason).toBe("invalid_confidence");
  expect(result.gaps).toContain("INVALID_CONFIDENCE");
  if (!result.stop_reason) throw new Error("Expected stop_reason");
  expect(result.stop_reason.code).toBe("INVALID_CONFIDENCE");
});

test("Example judgement 2: confidence=0.92 with 1 non-official source → CHANGE_PLAN/retry overconfident_without_support", () => {
  const result = judgeAskLeadQuestion({
    confidence: 0.92,
    evidence_items: [
      { source: "google_maps", url: "https://maps.google.com/place/456", is_official: false },
    ],
  });
  expect(result.verdict).toBe("CHANGE_PLAN");
  expect(result.action).toBe("retry");
  expect(result.reason).toBe("overconfident_without_support");
  expect(result.gaps).toContain("OVERCONFIDENT_WITHOUT_SUPPORT");
  if (!result.stop_reason) throw new Error("Expected stop_reason");
  expect(result.stop_reason.code).toBe("OVERCONFIDENT_WITHOUT_SUPPORT");
});

runTests();
