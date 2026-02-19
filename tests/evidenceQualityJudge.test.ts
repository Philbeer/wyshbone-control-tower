import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { judgeEvidenceQuality } from "../src/evaluator/evidenceQualityJudge";
import type { EvidenceQualityInput } from "../src/evaluator/evidenceQualityJudge";
import { judgeLeadsList } from "../src/evaluator/towerVerdict";
import type { TowerVerdictInput } from "../src/evaluator/towerVerdict";

describe("Evidence Quality Judge — standalone", () => {
  it("EXAMPLE PASS: all verified leads have evidence, count met", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp", verified: true, evidence: "Found on Companies House registry", source_url: "https://find-and-update.company-information.service.gov.uk/company/12345" },
        { name: "Beta Ltd", verified: true, evidence: "Confirmed via Google Maps listing", source_url: "https://maps.google.com/place/beta-ltd" },
        { name: "Gamma Services", verified: true, evidence: ["LinkedIn profile verified", "Website confirmed"] },
      ],
      verified_exact_count: 3,
      requested_count: 3,
      delivery_summary: "PASS",
      tower_verdict: "ACCEPT",
    };

    const result = judgeEvidenceQuality(input);

    console.log("  EXAMPLE PASS result:", JSON.stringify(result, null, 2));

    assert.equal(result.pass, true, "Should pass");
    assert.equal(result.verdict, "ACCEPT");
    assert.equal(result.gaps.length, 0, "No gaps");
    assert.equal(result.verified_with_evidence, 3);
    assert.equal(result.verified_without_evidence, 0);
    assert.equal(result.unknown_count, 0);
    assert.ok(result.detail.includes("passed"), "Detail mentions passed");
    assert.equal(result.stop_reason, undefined, "No stop_reason on PASS");
  });

  it("EXAMPLE STOP: verified leads without evidence detected", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp", verified: true, evidence: "Found on Companies House registry" },
        { name: "Beta Ltd", verified: true },
        { name: "Gamma Services", verified: true, evidence: null },
        { name: "Delta Inc", verified: true, evidence: "" },
      ],
      verified_exact_count: 4,
      requested_count: 3,
      delivery_summary: "PASS",
      tower_verdict: "ACCEPT",
    };

    const result = judgeEvidenceQuality(input);

    console.log("  EXAMPLE STOP result:", JSON.stringify(result, null, 2));

    assert.equal(result.pass, false, "Should fail");
    assert.equal(result.verdict, "STOP");
    assert.ok(result.gaps.includes("VERIFIED_WITHOUT_EVIDENCE"));
    assert.equal(result.verified_with_evidence, 1);
    assert.equal(result.verified_without_evidence, 3);
    assert.ok(result.stop_reason != null, "Must have stop_reason");
    assert.equal(result.stop_reason!.code, "VERIFIED_WITHOUT_EVIDENCE");
    assert.ok(result.stop_reason!.message.includes("no supporting evidence"));
    assert.ok(result.stop_reason!.evidence != null);
    assert.deepEqual(
      (result.stop_reason!.evidence as any).missing_evidence_leads,
      ["Beta Ltd", "Gamma Services", "Delta Inc"]
    );
  });
});

describe("Evidence Quality Judge — rule coverage", () => {
  it("unknown leads are not penalised", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp" },
        { name: "Beta Ltd" },
        { name: "Gamma Services" },
      ],
      verified_exact_count: 3,
      requested_count: 3,
    };

    const result = judgeEvidenceQuality(input);
    assert.equal(result.pass, true);
    assert.equal(result.unknown_count, 3);
    assert.equal(result.verified_without_evidence, 0);
    assert.equal(result.gaps.length, 0);
  });

  it("STOP when verified_exact < requested_count", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp", verified: true, evidence: "registry link" },
      ],
      verified_exact_count: 1,
      requested_count: 5,
    };

    const result = judgeEvidenceQuality(input);
    assert.equal(result.pass, false);
    assert.equal(result.verdict, "STOP");
    assert.ok(result.gaps.includes("VERIFIED_EXACT_BELOW_REQUESTED"));
    assert.equal(result.stop_reason!.code, "VERIFIED_EXACT_BELOW_REQUESTED");
    assert.ok(result.stop_reason!.message.includes("1"));
    assert.ok(result.stop_reason!.message.includes("5"));
  });

  it("STOP when delivery_summary=PASS but tower_verdict=STOP (mismatch)", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp", verified: true, evidence: "confirmed" },
      ],
      verified_exact_count: 1,
      requested_count: 1,
      delivery_summary: "PASS",
      tower_verdict: "STOP",
    };

    const result = judgeEvidenceQuality(input);
    assert.equal(result.pass, false);
    assert.equal(result.verdict, "STOP");
    assert.ok(result.gaps.includes("DELIVERY_SUMMARY_MISMATCH"));
    assert.equal(result.stop_reason!.code, "DELIVERY_SUMMARY_MISMATCH");
  });

  it("PASS when delivery_summary=PASS and tower_verdict=ACCEPT (consistent)", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp", verified: true, evidence: "confirmed" },
      ],
      verified_exact_count: 1,
      requested_count: 1,
      delivery_summary: "PASS",
      tower_verdict: "ACCEPT",
    };

    const result = judgeEvidenceQuality(input);
    assert.equal(result.pass, true);
    assert.equal(result.verdict, "ACCEPT");
  });

  it("source_url counts as evidence", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp", verified: true, source_url: "https://example.com" },
      ],
      requested_count: 1,
    };

    const result = judgeEvidenceQuality(input);
    assert.equal(result.pass, true);
    assert.equal(result.verified_with_evidence, 1);
    assert.equal(result.verified_without_evidence, 0);
  });

  it("verified=false is not penalised (only verified=true without evidence is)", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Alpha Corp", verified: false },
      ],
      verified_exact_count: 0,
      requested_count: 1,
    };

    const result = judgeEvidenceQuality(input);
    assert.equal(result.verified_without_evidence, 0, "verified=false should not count as verified_without_evidence");
    assert.ok(result.gaps.includes("VERIFIED_EXACT_BELOW_REQUESTED"), "count shortfall should trigger");
  });

  it("mixed leads: some verified+evidence, some verified-no-evidence, some unknown", () => {
    const input: EvidenceQualityInput = {
      leads: [
        { name: "Good Lead", verified: true, evidence: "found in registry" },
        { name: "Bad Lead", verified: true },
        { name: "Unknown Lead" },
      ],
      requested_count: 2,
    };

    const result = judgeEvidenceQuality(input);
    assert.equal(result.pass, false);
    assert.equal(result.verdict, "STOP");
    assert.ok(result.gaps.includes("VERIFIED_WITHOUT_EVIDENCE"));
    assert.equal(result.verified_with_evidence, 1);
    assert.equal(result.verified_without_evidence, 1);
    assert.equal(result.unknown_count, 1);
  });
});

describe("Evidence Quality Judge — integration with judgeLeadsList", () => {
  it("overrides ACCEPT to STOP when verified leads lack evidence", () => {
    const input: TowerVerdictInput = {
      requested_count_user: 2,
      leads: [
        { name: "Alpha Corp", verified: true, evidence: "company registry" },
        { name: "Beta Ltd", verified: true },
      ],
      constraints: [
        { type: "NAME_CONTAINS", field: "name", value: "corp", hardness: "soft" },
      ],
    };

    const result = judgeLeadsList(input);

    console.log(`  Integration test: verdict=${result.verdict} gaps=${result.gaps.join(",")}`);

    assert.equal(result.verdict, "STOP", "Should be overridden to STOP");
    assert.ok(result.gaps.includes("VERIFIED_WITHOUT_EVIDENCE"), "Should include evidence gap");
    assert.ok(result.stop_reason != null, "Should have stop_reason");
    assert.equal(result.stop_reason!.code, "VERIFIED_WITHOUT_EVIDENCE");
  });

  it("does not override when no evidence fields present on leads (legacy behaviour)", () => {
    const input: TowerVerdictInput = {
      requested_count_user: 2,
      leads: [
        { name: "Alpha Corp" },
        { name: "Beta Ltd" },
      ],
    };

    const result = judgeLeadsList(input);

    assert.equal(result.verdict, "ACCEPT", "Should remain ACCEPT — no evidence fields = legacy mode");
    assert.ok(!result.gaps.includes("VERIFIED_WITHOUT_EVIDENCE"));
  });

  it("STOP if delivery_summary=PASS but core verdict is STOP", () => {
    const input: TowerVerdictInput = {
      delivery_summary: "PASS",
    };

    const result = judgeLeadsList(input);

    assert.equal(result.verdict, "STOP", "Missing requested_count → STOP");
    assert.ok(result.gaps.includes("DELIVERY_SUMMARY_MISMATCH"), "Should detect mismatch");
  });
});

let passCount = 0;
let failCount = 0;
describe("Results tracker", () => {
  it("summary", () => {
    console.log(`# Evidence Quality Judge tests complete`);
  });
});
