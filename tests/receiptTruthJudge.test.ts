import {
  judgeRunReceipt,
  computeReceiptTruth,
} from "../src/evaluator/receiptTruthJudge";
import type {
  ReceiptPayload,
  SiblingArtefact,
  ReceiptDeliveredLead,
} from "../src/evaluator/receiptTruthJudge";

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
  };
}

function runTests() {
  console.log("Running Receipt Truth Judge Tests\n");

  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL: ${name}\n    ${msg}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
  if (failed > 0) process.exit(1);
}

function makeLeadPackArtefact(id: string, emails: string[], phones: string[], placeId?: string, name?: string): SiblingArtefact {
  return {
    id,
    artefact_type: "lead_pack",
    payload_json: {
      ...(placeId ? { place_id: placeId } : {}),
      ...(name ? { name } : {}),
      outputs: {
        lead_pack: {
          contacts: {
            emails: emails.map(e => ({ value: e, source: "website" })),
            phones: phones.map(p => ({ value: p, source: "website" })),
          },
        },
      },
    },
  };
}

function makeContactExtractArtefact(id: string, emails: string[], phones: string[], placeId?: string, name?: string): SiblingArtefact {
  return {
    id,
    artefact_type: "contact_extract",
    payload_json: {
      ...(placeId ? { place_id: placeId } : {}),
      ...(name ? { name } : {}),
      outputs: {
        contacts: {
          emails,
          phones,
        },
      },
    },
  };
}

test("Test 1: contacts_proven=true, counts match artefacts => ACCEPT", () => {
  const receipt: ReceiptPayload = {
    requested_count: 3,
    delivered_count: 3,
    delivered_leads: [
      { name: "Venue A", place_id: "p1" },
      { name: "Venue B", place_id: "p2" },
      { name: "Venue C", place_id: "p3" },
    ],
    contacts_proven: true,
    unique_email_count: 5,
    unique_phone_count: 9,
    narrative_lines: ["Found 3 venues", "Found 5 emails and 9 phone numbers"],
  };

  const siblings: SiblingArtefact[] = [
    makeLeadPackArtefact("a1", ["a@test.com", "b@test.com"], ["111", "222", "333"], "p1"),
    makeContactExtractArtefact("a2", ["c@test.com", "d@test.com"], ["444", "555", "666"], "p2"),
    makeLeadPackArtefact("a3", ["e@test.com"], ["777", "888", "999"], "p3"),
  ];

  const result = judgeRunReceipt(receipt, siblings);
  expect(result.verdict).toBe("ACCEPT");
  expect(result.metrics.tower_computed_emails).toBe(5);
  expect(result.metrics.tower_computed_phones).toBe(9);
  expect(result.metrics.rule_results["A"].passed).toBe(true);
  expect(result.metrics.rule_results["B"].passed).toBe(true);
  expect(result.metrics.rule_results["C"].passed).toBe(true);
});

test("Test 2: receipt says emails=9 phones=11 but artefacts yield 5 and 9 => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 3,
    delivered_count: 3,
    delivered_leads: [
      { name: "Venue A", place_id: "p1" },
      { name: "Venue B", place_id: "p2" },
      { name: "Venue C", place_id: "p3" },
    ],
    contacts_proven: true,
    unique_email_count: 9,
    unique_phone_count: 11,
    narrative_lines: ["Found 3 venues", "Found 9 emails and 11 phone numbers"],
  };

  const siblings: SiblingArtefact[] = [
    makeLeadPackArtefact("a1", ["a@test.com", "b@test.com"], ["111", "222", "333"], "p1"),
    makeContactExtractArtefact("a2", ["c@test.com", "d@test.com"], ["444", "555", "666"], "p2"),
    makeLeadPackArtefact("a3", ["e@test.com"], ["777", "888", "999"], "p3"),
  ];

  const result = judgeRunReceipt(receipt, siblings);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("Contact count mismatch");
  expect(result.metrics.tower_computed_emails).toBe(5);
  expect(result.metrics.tower_computed_phones).toBe(9);
  expect(result.metrics.receipt_email_count).toBe(9);
  expect(result.metrics.receipt_phone_count).toBe(11);
  expect(result.stop_reason).toBeDefined();
  expect(result.stop_reason!.code).toBe("RECEIPT_TRUTH_FAILED");
});

test("Test 3: contacts_proven=false but narrative says \"couldn't find any emails\" => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 2,
    delivered_count: 2,
    delivered_leads: [
      { name: "Venue A", place_id: "p1" },
      { name: "Venue B", place_id: "p2" },
    ],
    contacts_proven: false,
    unique_email_count: null,
    unique_phone_count: null,
    narrative_lines: [
      "Found 2 venues",
      "Couldn't find any emails for these venues",
    ],
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("Receipt claims absence without proof");
  expect(result.metrics.rule_results["B"].passed).toBe(false);
});

test("Test 4: cannot match artefacts to delivered leads, receipt claims proven => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 2,
    delivered_count: 2,
    delivered_leads: [
      { name: "Venue A" },
      { name: "Venue B" },
    ],
    contacts_proven: true,
    unique_email_count: 3,
    unique_phone_count: 2,
    narrative_lines: ["Found 2 venues", "Found 3 emails and 2 phone numbers"],
  };

  const siblings: SiblingArtefact[] = [
    makeLeadPackArtefact("a1", ["x@test.com"], ["111"], undefined, "Unknown Venue Z"),
    makeContactExtractArtefact("a2", ["y@test.com", "z@test.com"], ["222"], undefined, "Unknown Venue W"),
  ];

  const result = judgeRunReceipt(receipt, siblings);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("Cannot reliably match");
  expect(result.metrics.matching_reliable).toBe(false);
});

test("Rule A: delivered_count does not match delivered_leads.length => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 5,
    delivered_count: 3,
    delivered_leads: [
      { name: "A", place_id: "p1" },
      { name: "B", place_id: "p2" },
    ],
    contacts_proven: false,
    unique_email_count: null,
    unique_phone_count: null,
    narrative_lines: [],
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("delivered_count (3) does not match delivered_leads.length (2)");
});

test("Rule A: requested_count is not a number => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: undefined as any,
    delivered_count: 2,
    delivered_leads: [
      { name: "A", place_id: "p1" },
      { name: "B", place_id: "p2" },
    ],
    contacts_proven: false,
    unique_email_count: null,
    unique_phone_count: null,
    narrative_lines: [],
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("requested_count is not a finite number");
});

test("Rule B: contacts_proven=false but unique_email_count is set => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 2,
    delivered_count: 2,
    delivered_leads: [
      { name: "A", place_id: "p1" },
      { name: "B", place_id: "p2" },
    ],
    contacts_proven: false,
    unique_email_count: 5,
    unique_phone_count: null,
    narrative_lines: [],
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("contacts_proven=false but unique_email_count is not null");
});

test("Rule B: contacts_proven=true but counts are not numbers => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 2,
    delivered_count: 2,
    delivered_leads: [
      { name: "A", place_id: "p1" },
      { name: "B", place_id: "p2" },
    ],
    contacts_proven: true,
    unique_email_count: null,
    unique_phone_count: null,
    narrative_lines: [],
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("contacts_proven=true but unique_email_count is not a number");
});

test("Rule E: wildly impossible coverage counts => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 2,
    delivered_count: 2,
    delivered_leads: [
      { name: "A", place_id: "p1" },
      { name: "B", place_id: "p2" },
    ],
    contacts_proven: false,
    unique_email_count: null,
    unique_phone_count: null,
    narrative_lines: [],
    websites_checked_count: -1,
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("websites_checked_count (-1) is not sane");
});

test("contacts_proven=false with safe narrative => ACCEPT", () => {
  const receipt: ReceiptPayload = {
    requested_count: 2,
    delivered_count: 2,
    delivered_leads: [
      { name: "A", place_id: "p1" },
      { name: "B", place_id: "p2" },
    ],
    contacts_proven: false,
    unique_email_count: null,
    unique_phone_count: null,
    narrative_lines: ["Found 2 venues matching your criteria"],
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("ACCEPT");
  expect(result.reasons).toContain("All receipt truth checks passed");
});

test("contacts_proven=true with 0 counts verified by artefacts => ACCEPT", () => {
  const receipt: ReceiptPayload = {
    requested_count: 1,
    delivered_count: 1,
    delivered_leads: [
      { name: "Venue A", place_id: "p1" },
    ],
    contacts_proven: true,
    unique_email_count: 0,
    unique_phone_count: 0,
    narrative_lines: ["Found 1 venue", "found 0 emails"],
  };

  const siblings: SiblingArtefact[] = [
    makeLeadPackArtefact("a1", [], [], "p1"),
  ];

  const result = judgeRunReceipt(receipt, siblings);
  expect(result.verdict).toBe("ACCEPT");
});

test("computeReceiptTruth deduplicates contacts across artefacts", () => {
  const leads: ReceiptDeliveredLead[] = [{ name: "X", place_id: "p1" }];
  const siblings: SiblingArtefact[] = [
    makeLeadPackArtefact("a1", ["dup@test.com"], ["111"], "p1"),
    makeContactExtractArtefact("a2", ["dup@test.com", "new@test.com"], ["111", "222"], "p1"),
  ];

  const truth = computeReceiptTruth(leads, siblings);
  expect(truth.uniqueEmails).toBe(2);
  expect(truth.uniquePhones).toBe(2);
});

test("Narrative with 'no emails' and contacts_proven=false => STOP", () => {
  const receipt: ReceiptPayload = {
    requested_count: 1,
    delivered_count: 1,
    delivered_leads: [{ name: "A", place_id: "p1" }],
    contacts_proven: false,
    unique_email_count: null,
    unique_phone_count: null,
    narrative_lines: ["There were no emails available"],
  };

  const result = judgeRunReceipt(receipt, []);
  expect(result.verdict).toBe("STOP");
  expect(result.reasons).toContain("Receipt claims absence without proof");
});

runTests();
