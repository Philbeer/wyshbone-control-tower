import type { StopReason } from "./towerVerdict";

/*
 * Verification-Attempted Rubric
 * =============================
 * Tower considers "verification attempted" when AT LEAST ONE of the
 * following fields is present (even if null/false) on any lead in the
 * leads array:
 *
 *   1. verified   (boolean)  - Agent's own claim that the lead was checked.
 *   2. evidence   (string | string[] | object) - Supporting text / snippet
 *                              backing the claim. Empty string or empty
 *                              array counts as "present but empty" and will
 *                              trigger the VERIFIED_WITHOUT_EVIDENCE gap if
 *                              verified is true.
 *   3. source_url (string)   - URL from which evidence was gathered. A
 *                              non-empty source_url alone is sufficient to
 *                              count as evidence present.
 *
 * If NONE of these three fields exist on ANY lead AND the top-level
 * verified_exact_count is also missing, the verdict is STOP with gap
 * NO_EVIDENCE_PRESENT ("evidence check was not attempted").
 *
 * Per-lead classification:
 *   - verified=true  + evidence/source_url present  -> verified_with_evidence
 *   - verified=true  + no evidence/source_url       -> verified_without_evidence
 *                                                      (gap: VERIFIED_WITHOUT_EVIDENCE)
 *   - verified=false                                 -> counted but not penalised
 *   - verified=undefined/null                        -> unknown_count (not penalised)
 *
 * Constraint-level verification (in towerVerdict.ts):
 *   - CvlConstraintStatus "not_applicable" is treated as a VALID state
 *     (e.g. location not relevant to the query). It is NOT penalised as
 *     missing evidence and does NOT trigger the truth gate.
 */

export interface EvidenceLeadInfo {
  name: string;
  verified?: boolean;
  evidence?: string | string[] | Record<string, unknown> | null;
  source_url?: string | null;
  [key: string]: unknown;
}

export interface EvidenceQualityInput {
  leads: EvidenceLeadInfo[];
  verified_exact_count?: number;
  requested_count: number | null;
  delivery_summary?: "PASS" | "PARTIAL" | "STOP" | string;
  tower_verdict?: "ACCEPT" | "CHANGE_PLAN" | "STOP";
  verification_policy?: string;
}

export interface EvidenceQualityVerdict {
  pass: boolean;
  verdict: "ACCEPT" | "STOP";
  gaps: string[];
  stop_reason?: StopReason;
  verified_with_evidence: number;
  verified_without_evidence: number;
  unknown_count: number;
  detail: string;
}

function leadHasEvidence(lead: EvidenceLeadInfo): boolean {
  if (lead.evidence != null) {
    if (typeof lead.evidence === "string" && lead.evidence.trim().length > 0) return true;
    if (Array.isArray(lead.evidence) && lead.evidence.length > 0) return true;
    if (typeof lead.evidence === "object" && Object.keys(lead.evidence).length > 0) return true;
  }
  if (typeof lead.source_url === "string" && lead.source_url.trim().length > 0) return true;
  return false;
}

function leadIsVerified(lead: EvidenceLeadInfo): boolean | null {
  if (lead.verified === true) return true;
  if (lead.verified === false) return false;
  return null;
}

function leadHasAnyEvidenceField(lead: EvidenceLeadInfo): boolean {
  return lead.verified !== undefined || lead.evidence !== undefined || lead.source_url !== undefined;
}

export function judgeEvidenceQuality(input: EvidenceQualityInput): EvidenceQualityVerdict {
  const { leads, verified_exact_count, requested_count, delivery_summary, tower_verdict } = input;

  const gaps: string[] = [];
  let verifiedWithEvidence = 0;
  let verifiedWithoutEvidence = 0;
  let unknownCount = 0;
  const missingEvidenceLeadNames: string[] = [];

  const anyLeadHasEvidenceField = leads.some(leadHasAnyEvidenceField);

  for (const lead of leads) {
    const verifiedStatus = leadIsVerified(lead);

    if (verifiedStatus === null) {
      unknownCount++;
      continue;
    }

    if (verifiedStatus === true) {
      if (leadHasEvidence(lead)) {
        verifiedWithEvidence++;
      } else {
        verifiedWithoutEvidence++;
        missingEvidenceLeadNames.push(lead.name);
      }
    }
  }

  if (verifiedWithoutEvidence > 0) {
    gaps.push("VERIFIED_WITHOUT_EVIDENCE");
  }

  if (leads.length > 0 && !anyLeadHasEvidenceField && verified_exact_count == null) {
    gaps.push("NO_EVIDENCE_PRESENT");
  }

  const effectiveVerified = verified_exact_count ?? verifiedWithEvidence;

  const isDirectoryVerified = input.verification_policy === "DIRECTORY_VERIFIED";
  if (!isDirectoryVerified && requested_count != null && effectiveVerified < requested_count && requested_count > 0) {
    gaps.push("VERIFIED_EXACT_BELOW_REQUESTED");
  }

  if (delivery_summary === "PASS" && tower_verdict === "STOP") {
    gaps.push("DELIVERY_SUMMARY_MISMATCH");
  }

  if (
    delivery_summary === "PASS" &&
    leads.length > 0 &&
    !anyLeadHasEvidenceField &&
    verified_exact_count == null
  ) {
    if (!gaps.includes("DELIVERY_SUMMARY_MISMATCH")) {
      gaps.push("DELIVERY_SUMMARY_MISMATCH");
    }
    if (!gaps.includes("PASS_WITHOUT_VERIFICATION")) {
      gaps.push("PASS_WITHOUT_VERIFICATION");
    }
  }

  const hasBlockingGap =
    gaps.includes("VERIFIED_WITHOUT_EVIDENCE") ||
    gaps.includes("DELIVERY_SUMMARY_MISMATCH") ||
    gaps.includes("PASS_WITHOUT_VERIFICATION");

  const noEvidenceGap =
    gaps.includes("NO_EVIDENCE_PRESENT") &&
    !hasBlockingGap;

  const countShortfall =
    gaps.includes("VERIFIED_EXACT_BELOW_REQUESTED") &&
    !hasBlockingGap &&
    !noEvidenceGap;

  if (hasBlockingGap) {
    const primaryCode = gaps[0];
    let message: string;
    if (primaryCode === "VERIFIED_WITHOUT_EVIDENCE") {
      message = `${verifiedWithoutEvidence} lead(s) marked verified but have no supporting evidence.`;
    } else if (primaryCode === "DELIVERY_SUMMARY_MISMATCH") {
      message = `delivery_summary is PASS but Tower verdict is STOP — inconsistency detected.`;
    } else if (primaryCode === "PASS_WITHOUT_VERIFICATION") {
      message = `delivery_summary is PASS but no leads carry verification data — PASS claim is unsubstantiated.`;
    } else {
      message = `Evidence quality check failed: ${primaryCode}`;
    }

    return {
      pass: false,
      verdict: "STOP",
      gaps,
      stop_reason: {
        code: primaryCode,
        message,
        evidence: {
          verified_with_evidence: verifiedWithEvidence,
          verified_without_evidence: verifiedWithoutEvidence,
          unknown_count: unknownCount,
          requested_count: requested_count,
          verified_exact_count: effectiveVerified,
          missing_evidence_leads: missingEvidenceLeadNames.slice(0, 10),
          ...(delivery_summary ? { delivery_summary } : {}),
          ...(tower_verdict ? { tower_verdict } : {}),
        },
      },
      verified_with_evidence: verifiedWithEvidence,
      verified_without_evidence: verifiedWithoutEvidence,
      unknown_count: unknownCount,
      detail: message,
    };
  }

  if (noEvidenceGap) {
    const message = `${leads.length} lead(s) delivered but none carry verification data — evidence check was not attempted.`;
    return {
      pass: false,
      verdict: "STOP",
      gaps,
      stop_reason: {
        code: "NO_EVIDENCE_PRESENT",
        message,
        evidence: {
          leads_count: leads.length,
          verified_with_evidence: 0,
          verified_without_evidence: 0,
          unknown_count: unknownCount,
          requested_count: requested_count,
        },
      },
      verified_with_evidence: 0,
      verified_without_evidence: 0,
      unknown_count: unknownCount,
      detail: message,
    };
  }

  if (countShortfall) {
    return {
      pass: false,
      verdict: "STOP",
      gaps,
      stop_reason: {
        code: "VERIFIED_EXACT_BELOW_REQUESTED",
        message: `Only ${effectiveVerified} verified exact matches out of ${requested_count} requested.`,
        evidence: {
          verified_exact_count: effectiveVerified,
          requested_count: requested_count,
          verified_with_evidence: verifiedWithEvidence,
          unknown_count: unknownCount,
        },
      },
      verified_with_evidence: verifiedWithEvidence,
      verified_without_evidence: verifiedWithoutEvidence,
      unknown_count: unknownCount,
      detail: `Only ${effectiveVerified} verified exact matches out of ${requested_count} requested.`,
    };
  }

  return {
    pass: true,
    verdict: "ACCEPT",
    gaps: [],
    verified_with_evidence: verifiedWithEvidence,
    verified_without_evidence: 0,
    unknown_count: unknownCount,
    detail: `Evidence quality passed: ${effectiveVerified} verified with evidence, ${unknownCount} unknown (not penalised).`,
  };
}
