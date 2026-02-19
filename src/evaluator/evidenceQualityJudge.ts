import type { StopReason } from "./towerVerdict";

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
  requested_count: number;
  delivery_summary?: "PASS" | "PARTIAL" | "STOP" | string;
  tower_verdict?: "ACCEPT" | "CHANGE_PLAN" | "STOP";
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

export function judgeEvidenceQuality(input: EvidenceQualityInput): EvidenceQualityVerdict {
  const { leads, verified_exact_count, requested_count, delivery_summary, tower_verdict } = input;

  const gaps: string[] = [];
  let verifiedWithEvidence = 0;
  let verifiedWithoutEvidence = 0;
  let unknownCount = 0;
  const missingEvidenceLeadNames: string[] = [];

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

  const effectiveVerified = verified_exact_count ?? verifiedWithEvidence;

  if (effectiveVerified < requested_count && requested_count > 0) {
    gaps.push("VERIFIED_EXACT_BELOW_REQUESTED");
  }

  if (
    delivery_summary === "PASS" &&
    tower_verdict === "STOP"
  ) {
    gaps.push("DELIVERY_SUMMARY_MISMATCH");
  }

  const hasBlockingGap =
    gaps.includes("VERIFIED_WITHOUT_EVIDENCE") ||
    gaps.includes("DELIVERY_SUMMARY_MISMATCH");

  const countShortfall =
    gaps.includes("VERIFIED_EXACT_BELOW_REQUESTED") &&
    !gaps.includes("VERIFIED_WITHOUT_EVIDENCE") &&
    !gaps.includes("DELIVERY_SUMMARY_MISMATCH");

  if (hasBlockingGap) {
    const primaryCode = gaps[0];
    const message =
      primaryCode === "VERIFIED_WITHOUT_EVIDENCE"
        ? `${verifiedWithoutEvidence} lead(s) marked verified but have no supporting evidence.`
        : primaryCode === "DELIVERY_SUMMARY_MISMATCH"
          ? `delivery_summary is PASS but Tower verdict is STOP — inconsistency detected.`
          : `Evidence quality check failed: ${primaryCode}`;

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
