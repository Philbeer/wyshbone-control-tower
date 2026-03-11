import { judgeEvidenceQuality } from "./evidenceQualityJudge";

export type TowerVerdictAction = "ACCEPT" | "ACCEPT_WITH_UNVERIFIED" | "CHANGE_PLAN" | "STOP";

export const VERDICT_UI_MAP: Record<TowerVerdictAction, { label: string; intent: "success" | "warning" | "error" }> = {
  ACCEPT: { label: "Verified satisfied", intent: "success" },
  ACCEPT_WITH_UNVERIFIED: { label: "Ran, but not verified — best-effort accepted", intent: "warning" },
  CHANGE_PLAN: { label: "Replanning", intent: "warning" },
  STOP: { label: "Cannot meet requirements honestly", intent: "error" },
};

export type ConstraintType =
  | "NAME_CONTAINS"
  | "NAME_STARTS_WITH"
  | "LOCATION"
  | "COUNT_MIN"
  | "HAS_ATTRIBUTE";

// PHASE_4: evidence requirement levels from Supervisor
export type EvidenceRequirement = "none" | "lead_field" | "directory_data" | "search_snippet" | "website_text" | "external_source";

// PHASE_4: proof burden derived from evidence_requirement
export type ProofBurden = "self_evident" | "evidence_required" | "evidence_required_first_party" | "inherently_uncertain";

// PHASE_4: source tier for evidence provenance
export type SourceTier = "first_party_website" | "directory_field" | "search_snippet" | "lead_field" | "external_source" | "unknown";

// PHASE_4: richer per-constraint verdict
export type ConstraintVerdict = "VERIFIED" | "PLAUSIBLE" | "UNSUPPORTED" | "CONTRADICTED" | "NOT_APPLICABLE";

export interface Constraint {
  type: ConstraintType;
  field: string;
  value: string | number;
  hardness: "hard" | "soft";
  evidence_requirement?: EvidenceRequirement; // PHASE_4
  label?: string; // PHASE_4
}

export interface Lead {
  name: string;
  address?: string;
  [key: string]: unknown;
}

export type TimePredicateMode = "verifiable" | "proxy" | "unverifiable";
export type TimePredicateProxy = "news_mention" | "recent_reviews" | "new_listing" | "social_media_post" | "press_release";

export interface TimePredicateInput {
  predicate: string;
  hardness: "hard" | "soft";
}

export interface TimePredicateResult {
  time_predicates_required: TimePredicateInput[];
  time_predicates_mode: TimePredicateMode;
  time_predicates_proxy_used: TimePredicateProxy | null;
  time_predicates_satisfied_count: number;
  time_predicates_unknown_count: number;
  hard_constraints_blocked: string[];
  user_summary: string;
}

export type SuggestedChangeType =
  | "RELAX_CONSTRAINT"
  | "EXPAND_AREA"
  | "INCREASE_SEARCH_BUDGET"
  | "CHANGE_QUERY"
  | "STOP_CONDITION"
  | "ADD_VERIFICATION_STEP";

export type SuggestedChangeField =
  | "prefix_filter"
  | "name_contains"
  | "location"
  | "radius_km"
  | "business_type"
  | "requested_count_user"
  | string;

export interface SuggestedChange {
  type: SuggestedChangeType;
  field: SuggestedChangeField;
  from: string | number | null;
  to: string | number | null;
  reason: string;
}

export interface ConstraintResult {
  constraint: Constraint;
  matched_count: number;
  total_leads: number;
  passed: boolean;
  status?: CvlConstraintStatus;
  constraint_verdict?: ConstraintVerdict; // PHASE_4
  evidence_id?: string;
  source_url?: string;
  quote?: string;
  attribute_evidence_details?: Array<{ lead: string; evidence_id?: string; source_url?: string; quote?: string }>;
}

export interface StopReason {
  code: string;
  message: string;
  detail?: string;
  evidence?: Record<string, unknown>;
}

export interface TowerVerdictDebug {
  extractedDeliveredCount: number;
  extractedRequestedCount: number;
  source: string;
}

// PHASE_5: per-hard-constraint verdict summary for Supervisor
export interface HardConstraintVerdictEntry {
  id: string;
  verdict: ConstraintVerdict;
  label: string;
}

export interface TowerVerdict {
  verdict: TowerVerdictAction;
  action: "continue" | "stop" | "change_plan";
  delivered: number;
  requested: number;
  gaps: string[];
  confidence: number;
  rationale: string;
  suggested_changes: SuggestedChange[];
  constraint_results?: ConstraintResult[];
  stop_reason?: StopReason;
  failing_constraint_id?: string; // PHASE_5
  failing_constraint_reason?: string; // PHASE_5
  hard_constraint_verdicts?: HardConstraintVerdictEntry[]; // PHASE_5
  _debug?: TowerVerdictDebug;
}

export interface DeliveredInfo {
  delivered_matching_accumulated?: number;
  delivered_matching_this_plan?: number;
  delivered_total_accumulated?: number;
  delivered_total_this_plan?: number;
}

export interface MetaInfo {
  plan_version?: number;
  replans_used?: number;
  max_replans?: number;
  radius_km?: number;
  relaxed_constraints?: string[];
}

export type CvlConstraintStatus = "yes" | "no" | "unknown" | "not_attempted" | "not_applicable";

export interface CvlConstraintResult {
  constraint_id?: string;
  type: string;
  field?: string;
  value?: string | number;
  status: CvlConstraintStatus;
  reason?: string;
  confidence?: number;
  evidence_id?: string;
  source_url?: string;
  quote?: string;
}

export interface AttributeEvidenceArtefact {
  lead_name: string;
  lead_place_id?: string;
  attribute: string;
  attribute_key?: string;
  attribute_raw?: string;
  constraint_raw?: string;
  verdict: CvlConstraintStatus;
  confidence: number;
  evidence_id?: string;
  source_url?: string;
  quote?: string;
  extracted_quotes?: string[];
  page_title?: string;
  semantic_verdict?: CvlConstraintStatus;
  semantic_status?: "verified" | "weak_match" | "no_evidence" | "insufficient_evidence" | "contradicted"; // PHASE_4: added contradicted
  semantic_strength?: "strong" | "indirect" | "weak" | "none";
  semantic_confidence?: number;
  semantic_reasoning?: string;
  semantic_supporting_quotes?: string[];
  source_tier?: SourceTier; // PHASE_4
}

export interface CvlVerificationSummary {
  verified_exact_count: number;
  constraint_results?: CvlConstraintResult[];
}

export interface CvlConstraintsExtracted {
  requested_count_user?: number;
  constraints?: Constraint[];
}

export interface TowerVerdictInput {
  original_goal?: string;
  requested_count_user?: number;
  constraints?: Constraint[];
  leads?: Lead[];
  delivered_leads?: Lead[];

  original_user_goal?: string;
  normalized_goal?: string;
  requested_count?: number;
  accumulated_count?: number;
  delivered_count?: number;

  delivered?: DeliveredInfo | number;

  success_criteria?: {
    requested_count_user?: number;
    target_count?: number;
    hard_constraints?: Array<{ type: string; field: string; value?: any }>;
    soft_constraints?: Array<{ type: string; field: string; value?: any }>;
    allow_relax_soft_constraints?: boolean;
    [key: string]: unknown;
  };

  meta?: MetaInfo;

  plan?: unknown;
  plan_summary?: unknown;
  plan_version?: number;
  radius_km?: number;
  attempt_history?: AttemptHistoryEntry[];

  hard_constraints?: string[];
  soft_constraints?: string[];

  structured_constraints?: StructuredConstraint[];

  artefact_title?: string;
  artefact_summary?: string;

  verification_summary?: CvlVerificationSummary;
  constraints_extracted?: CvlConstraintsExtracted;

  attribute_evidence?: AttributeEvidenceArtefact[];

  verified_exact?: number;

  delivery_summary?: "PASS" | "PARTIAL" | "STOP" | string;

  requires_relationship_evidence?: boolean;
  verified_relationship_count?: number;

  time_predicates?: TimePredicateInput[];
  time_predicates_mode?: TimePredicateMode;
  time_predicates_proxy_used?: TimePredicateProxy | null;
  time_predicates_satisfied_count?: number;
  time_predicates_unknown_count?: number;

  unresolved_hard_constraints?: UnresolvedHardConstraint[];

  best_effort_accepted?: boolean;
  verification_policy?: string;
  strategy?: string;
  agent_clarified?: boolean;
}

export interface UnresolvedHardConstraint {
  constraint_id: string;
  label: string;
  verifiability: "verifiable" | "proxy" | "unverifiable";
  proxy_selected?: string | null;
  must_be_certain?: boolean;
}

export interface StructuredConstraint {
  id?: string;
  type: string;
  field?: string;
  value: string | number;
  hard?: boolean;
  hardness?: "hard" | "soft";
  operator?: string;
  rationale?: string;
  evidence_requirement?: EvidenceRequirement; // PHASE_4
  label?: string; // PHASE_4
}

export interface AttemptHistoryEntry {
  plan_version: number;
  radius_km: number;
  delivered_count: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function coerceToNumber(v: unknown): number | null {
  if (isFiniteNumber(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (isFinite(n)) return n;
  }
  return null;
}

function resolveRequestedCount(input: TowerVerdictInput): number | null {
  const candidates: unknown[] = [
    input.requested_count_user,
    input.success_criteria?.requested_count_user,
    input.success_criteria?.target_count,
    input.requested_count,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const n = coerceToNumber(c);
    if (n != null) return n;
  }
  return null;
}

function resolveLeads(input: TowerVerdictInput): Lead[] {
  const filterLeads = (arr: any[]): Lead[] =>
    arr.filter(
      (l): l is Lead =>
        l != null && typeof l === "object" && typeof (l as any).name === "string"
    );
  if (Array.isArray(input.leads) && input.leads.length > 0) {
    return filterLeads(input.leads);
  }
  if (Array.isArray(input.delivered_leads) && input.delivered_leads.length > 0) {
    return filterLeads(input.delivered_leads);
  }
  return [];
}

function hasCvl(input: TowerVerdictInput): boolean {
  return input.verification_summary != null &&
    typeof input.verification_summary.verified_exact_count === "number";
}

interface DeliveredCountResult {
  count: number;
  source: string;
}

function resolveDeliveredCount(input: TowerVerdictInput, matchedLeadCount: number | null): DeliveredCountResult {
  if (Array.isArray(input.delivered_leads) && input.delivered_leads.length > 0) {
    return { count: input.delivered_leads.length, source: "delivered_leads.length" };
  }

  // TOWER_COUNT_FIX: when delivered_count is explicitly provided and positive, prefer it
  // over leads.length. leads may contain the search pool (e.g. 20 SEARCH_PLACES results)
  // while delivered_count reflects the filtered delivery (e.g. 1 after FILTER_FIELDS).
  // Guard: delivered_count=0 with real leads is treated as stale/default — fall through
  // to leads.length so real deliveries aren't reported as zero.
  if (input.delivered_count != null && input.delivered_count > 0) {
    return { count: input.delivered_count, source: "delivered_count" };
  }

  const leads = resolveLeads(input);
  if (leads.length > 0) {
    return { count: leads.length, source: "leads.length" };
  }

  if (hasCvl(input)) {
    return { count: input.verification_summary!.verified_exact_count, source: "verification_summary.verified_exact_count" };
  }

  if (typeof input.verified_exact === "number" && input.verified_exact > 0) {
    return { count: input.verified_exact, source: "verified_exact" };
  }

  if (input.accumulated_count != null) {
    return { count: input.accumulated_count, source: "accumulated_count" };
  }

  const delivered = input.delivered;
  if (typeof delivered === "object" && delivered != null) {
    if (delivered.delivered_matching_accumulated != null)
      return { count: delivered.delivered_matching_accumulated, source: "delivered.delivered_matching_accumulated" };
    if (delivered.delivered_matching_this_plan != null)
      return { count: delivered.delivered_matching_this_plan, source: "delivered.delivered_matching_this_plan" };
  }

  if (typeof delivered === "number") {
    return { count: delivered, source: "delivered(number)" };
  }

  if (matchedLeadCount != null && matchedLeadCount > 0) {
    return { count: matchedLeadCount, source: "matchedLeadCount" };
  }

  return { count: 0, source: "default(0)" };
}

function findCvlStatusForConstraint(
  constraint: Constraint,
  cvlResults?: CvlConstraintResult[]
): CvlConstraintResult | null {
  if (!cvlResults || cvlResults.length === 0) return null;
  const exact = cvlResults.find((cr) => {
    if (cr.constraint_id && constraint.field && cr.constraint_id === constraint.field) return true;
    if (cr.type === constraint.type && cr.field === constraint.field) {
      if (cr.value != null && constraint.value != null) {
        return String(cr.value).toLowerCase() === String(constraint.value).toLowerCase();
      }
      return true;
    }
    return false;
  });
  if (exact) return exact;
  return cvlResults.find((cr) => cr.type === constraint.type && cr.field === constraint.field) ?? null;
}

function normalizeAttributeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^c_attr_/, "")
    .replace(/[\s\-]+/g, "_")
    .replace(/_{2,}/g, "_");
}

function findAttributeEvidence(
  leadName: string,
  attribute: string,
  evidence?: AttributeEvidenceArtefact[],
  leadPlaceId?: string
): { match: AttributeEvidenceArtefact; matchedBy: "placeId" | "name" } | null {
  if (!evidence || evidence.length === 0) return null;
  const normAttr = normalizeAttributeKey(attribute);
  const ATTR_TRACE = process.env.DEBUG_TOWER_ATTR_TRACE === "true";

  if (leadPlaceId) {
    const byPlaceId = evidence.find((e) => {
      if (!e.lead_place_id) return false;
      const placeIdMatch = e.lead_place_id === leadPlaceId;
      const evNormAttr = normalizeAttributeKey(e.attribute_key ?? e.attribute);
      const attrMatch = evNormAttr === normAttr;
      return placeIdMatch && attrMatch;
    });
    if (byPlaceId) {
      if (ATTR_TRACE) {
        console.log(`[TOWER][ATTR_TRACE] findAttributeEvidence: matched by placeId="${leadPlaceId}" attr_norm="${normAttr}" ev_attr_norm="${normalizeAttributeKey(byPlaceId.attribute_key ?? byPlaceId.attribute)}"`);
      }
      return { match: byPlaceId, matchedBy: "placeId" };
    }
  }

  const byName = evidence.find((e) => {
    const nameMatch = e.lead_name.toLowerCase() === leadName.toLowerCase();
    const evNormAttr = normalizeAttributeKey(e.attribute_key ?? e.attribute);
    const attrMatch = evNormAttr === normAttr;
    return nameMatch && attrMatch;
  });
  if (byName) {
    if (ATTR_TRACE) {
      console.log(`[TOWER][ATTR_TRACE] findAttributeEvidence: matched by name="${leadName}" attr_norm="${normAttr}" ev_attr_norm="${normalizeAttributeKey(byName.attribute_key ?? byName.attribute)}"`);
    }
    return { match: byName, matchedBy: "name" };
  }

  if (ATTR_TRACE) {
    console.log(`[TOWER][ATTR_TRACE] findAttributeEvidence: NO MATCH for lead="${leadName}" placeId="${leadPlaceId ?? "none"}" attr_norm="${normAttr}" evidence_attrs=[${evidence.map(e => `"${normalizeAttributeKey(e.attribute_key ?? e.attribute)}"`).join(",")}] evidence_names=[${evidence.map(e => `"${e.lead_name}"`).join(",")}] evidence_placeIds=[${evidence.map(e => `"${e.lead_place_id ?? "none"}"`).join(",")}]`);
  }
  return null;
}

// PHASE_4: derive proof burden from evidence_requirement
export function proofBurdenFromRequirement(req?: EvidenceRequirement): ProofBurden {
  switch (req) {
    case "none":
    case "lead_field":
      return "self_evident";
    case "directory_data":
    case "search_snippet":
      return "evidence_required";
    case "website_text":
      return "evidence_required_first_party";
    case "external_source":
      return "inherently_uncertain";
    default:
      return "evidence_required";
  }
}

// PHASE_4: derive ConstraintVerdict from evaluation outcome
// PHASE_5: exported for verdict derivation
export const CONSTRAINT_VERDICT_RANK: Record<ConstraintVerdict, number> = {
  CONTRADICTED: 0, UNSUPPORTED: 1, NOT_APPLICABLE: 2, PLAUSIBLE: 3, VERIFIED: 4,
};

function deriveConstraintVerdict(
  passed: boolean,
  status: CvlConstraintStatus | undefined,
  semanticStatus?: string,
  proofBurden?: ProofBurden,
  sourceTier?: SourceTier,
): ConstraintVerdict {
  if (status === "not_applicable") return "NOT_APPLICABLE";
  if (semanticStatus === "contradicted") return "CONTRADICTED";
  if (!passed && status === "no") return "UNSUPPORTED";
  if (!passed) return "UNSUPPORTED";
  if (semanticStatus === "verified" || status === "yes") {
    if (proofBurden === "evidence_required_first_party" && sourceTier && sourceTier !== "first_party_website") {
      return "PLAUSIBLE";
    }
    return "VERIFIED";
  }
  if (semanticStatus === "weak_match") return "PLAUSIBLE";
  if (proofBurden === "self_evident") return "VERIFIED";
  return "PLAUSIBLE";
}

function evaluateConstraint(
  constraint: Constraint,
  leads: Lead[],
  cvlResults?: CvlConstraintResult[],
  attributeEvidence?: AttributeEvidenceArtefact[]
): ConstraintResult {
  const total = leads.length;
  const cvlMatch = findCvlStatusForConstraint(constraint, cvlResults);

  switch (constraint.type) {
    case "HAS_ATTRIBUTE": {
      const ATTR_TRACE = process.env.DEBUG_TOWER_ATTR_TRACE === "true";
      const attrName = String(constraint.value);

      if (ATTR_TRACE) {
        console.log(`[TOWER][ATTR_TRACE] === HAS_ATTRIBUTE evaluation ===`);
        console.log(`[TOWER][ATTR_TRACE] constraint: type=${constraint.type} field=${constraint.field} value=${constraint.value} hardness=${constraint.hardness}`);
        console.log(`[TOWER][ATTR_TRACE] leads_count=${leads.length} lead_names=[${leads.map(l => l.name).join(", ")}]`);
        console.log(`[TOWER][ATTR_TRACE] cvlMatch found=${!!cvlMatch} status=${cvlMatch?.status ?? "N/A"} reason=${cvlMatch?.reason ?? "N/A"}`);
        console.log(`[TOWER][ATTR_TRACE] attributeEvidence provided=${!!attributeEvidence} count=${attributeEvidence?.length ?? 0}`);
        if (attributeEvidence && attributeEvidence.length > 0) {
          console.log(`[TOWER][ATTR_TRACE] attributeEvidence items: ${JSON.stringify(attributeEvidence.map(e => ({ lead_name: e.lead_name, lead_place_id: e.lead_place_id ?? "none", attribute: e.attribute, attribute_key: e.attribute_key ?? "none", attribute_norm: normalizeAttributeKey(e.attribute_key ?? e.attribute), verdict: e.verdict, confidence: e.confidence })))}`);
        }
      }

      // PHASE_4: compute proof burden for this constraint
      const burden = proofBurdenFromRequirement(constraint.evidence_requirement);

      if (cvlMatch && cvlMatch.status !== "unknown") {
        if (ATTR_TRACE) {
          console.log(`[TOWER][ATTR_TRACE] DECISION: using cvlMatch directly → status=${cvlMatch.status} passed=${cvlMatch.status === "yes"}`);
        }
        const cvlPassed = cvlMatch.status === "yes";
        return {
          constraint,
          matched_count: cvlPassed ? total : 0,
          total_leads: total,
          passed: cvlPassed,
          status: cvlMatch.status,
          constraint_verdict: deriveConstraintVerdict(cvlPassed, cvlMatch.status, undefined, burden), // PHASE_4
          evidence_id: cvlMatch.evidence_id,
          source_url: cvlMatch.source_url,
          quote: cvlMatch.quote,
        };
      }

      if (attributeEvidence && attributeEvidence.length > 0) {
        const evidencePointers: Array<{ lead: string; evidence_id?: string; source_url?: string; quote?: string }> = [];
        let hasYes = false;
        let hasNo = false;
        let hasUnknown = false;
        // PHASE_4: track per-lead verdicts for aggregate constraint_verdict
        let bestLeadVerdict: ConstraintVerdict = "UNSUPPORTED";
        let anyContradicted = false;

        for (const lead of leads) {
          const leadPlaceId = (lead as any).place_id ?? (lead as any).placeId;
          const result = findAttributeEvidence(lead.name, attrName, attributeEvidence, leadPlaceId);
          if (ATTR_TRACE) {
            const ev = result?.match;
            console.log(`[TOWER][ATTR_TRACE] findAttributeEvidence(lead="${lead.name}", placeId="${leadPlaceId ?? "none"}", attr="${attrName}", attr_norm="${normalizeAttributeKey(attrName)}") → ${result ? `found via ${result.matchedBy}: verdict=${ev!.verdict} evidence_id=${ev!.evidence_id ?? "none"} quote=${(ev!.quote ?? "none").substring(0, 80)}` : "NOT FOUND"}`);
          }
          if (result) {
            const ev = result.match;
            const effectiveVerdict = ev.semantic_verdict ?? ev.verdict;
            if (ATTR_TRACE && ev.semantic_verdict) {
              console.log(`[TOWER][ATTR_TRACE] semantic override: lead="${lead.name}" upstream=${ev.verdict} semantic=${ev.semantic_verdict} status=${ev.semantic_status ?? "N/A"} strength=${ev.semantic_strength ?? "N/A"} confidence=${ev.semantic_confidence ?? "N/A"} quotes=${JSON.stringify(ev.semantic_supporting_quotes ?? [])} reasoning="${(ev.semantic_reasoning ?? "").substring(0, 100)}"`);
            }
            if (effectiveVerdict === "yes") {
              hasYes = true;
              evidencePointers.push({
                lead: lead.name,
                evidence_id: ev.evidence_id,
                source_url: ev.source_url,
                quote: ev.quote,
              });
              // PHASE_4: derive per-lead verdict using source_tier
              const lv = deriveConstraintVerdict(true, "yes", ev.semantic_status, burden, ev.source_tier);
              if (CONSTRAINT_VERDICT_RANK[lv] > CONSTRAINT_VERDICT_RANK[bestLeadVerdict]) {
                bestLeadVerdict = lv;
              }
            } else if (effectiveVerdict === "no") {
              hasNo = true;
              if (ev.semantic_status === "contradicted") anyContradicted = true; // PHASE_4
            } else {
              hasUnknown = true;
            }
          } else {
            hasUnknown = true;
          }
        }

        let resolvedStatus: CvlConstraintStatus;
        if (hasYes && !hasNo) {
          resolvedStatus = "yes";
        } else if (hasNo) {
          resolvedStatus = "no";
        } else {
          resolvedStatus = "unknown";
        }

        // PHASE_4: compute aggregate constraint_verdict
        let aggregateVerdict: ConstraintVerdict;
        if (anyContradicted && resolvedStatus !== "yes") {
          aggregateVerdict = "CONTRADICTED";
        } else if (resolvedStatus === "yes") {
          aggregateVerdict = bestLeadVerdict;
        } else {
          aggregateVerdict = "UNSUPPORTED";
        }

        const firstEvidence = evidencePointers[0];
        if (ATTR_TRACE) {
          console.log(`[TOWER][ATTR_TRACE] DECISION: from attributeEvidence → status=${resolvedStatus} hasYes=${hasYes} hasNo=${hasNo} hasUnknown=${hasUnknown} evidencePointers=${evidencePointers.length} constraint_verdict=${aggregateVerdict}`);
          const topExcerpts = evidencePointers.slice(0, 2).map(ep => `lead="${ep.lead}" quote="${(ep.quote ?? "none").substring(0, 100)}"`);
          console.log(`[TOWER][ATTR_TRACE] top_evidence: ${topExcerpts.length > 0 ? topExcerpts.join(" | ") : "none found"}`);
        }
        return {
          constraint,
          matched_count: evidencePointers.length,
          total_leads: total,
          passed: resolvedStatus === "yes",
          status: resolvedStatus,
          constraint_verdict: aggregateVerdict, // PHASE_4
          evidence_id: firstEvidence?.evidence_id,
          source_url: firstEvidence?.source_url,
          quote: firstEvidence?.quote,
          attribute_evidence_details: evidencePointers.length > 0 ? evidencePointers : undefined,
        };
      }

      if (ATTR_TRACE) {
        console.log(`[TOWER][ATTR_TRACE] DECISION: no cvlMatch, no attributeEvidence → status=not_attempted passed=false`);
        console.log(`[TOWER][ATTR_TRACE] field_paths_checked: input.verification_summary.constraint_results (for cvlMatch), input.attribute_evidence (for per-lead evidence)`);
      }
      return {
        constraint,
        matched_count: 0,
        total_leads: total,
        passed: false,
        status: "not_attempted",
        constraint_verdict: "UNSUPPORTED" as ConstraintVerdict, // PHASE_4
      };
    }

    case "NAME_CONTAINS": {
      // PHASE_4: CVL unknown should not block self-evident constraints — verify locally
      if (cvlMatch && cvlMatch.status !== "unknown" && cvlMatch.status !== "not_attempted") {
        const passed = cvlMatch.status === "yes";
        return {
          constraint,
          matched_count: passed ? total : 0,
          total_leads: total,
          passed,
          constraint_verdict: deriveConstraintVerdict(passed, cvlMatch.status, undefined, proofBurdenFromRequirement(constraint.evidence_requirement)),
        };
      }
      const word = String(constraint.value).toLowerCase();
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
      const matched = leads.filter((l) => regex.test(l.name));
      const localPassed = matched.length > 0;
      return {
        constraint,
        matched_count: matched.length,
        total_leads: total,
        passed: localPassed,
        constraint_verdict: localPassed ? "VERIFIED" as ConstraintVerdict : "UNSUPPORTED" as ConstraintVerdict, // PHASE_4: self-evident local check
      };
    }

    case "NAME_STARTS_WITH": {
      // PHASE_4: CVL unknown should not block self-evident constraints — verify locally
      if (cvlMatch && cvlMatch.status !== "unknown" && cvlMatch.status !== "not_attempted") {
        const passed = cvlMatch.status === "yes";
        return {
          constraint,
          matched_count: passed ? total : 0,
          total_leads: total,
          passed,
          constraint_verdict: deriveConstraintVerdict(passed, cvlMatch.status, undefined, proofBurdenFromRequirement(constraint.evidence_requirement)),
        };
      }
      const prefix = String(constraint.value).toLowerCase();
      const matched = leads.filter((l) =>
        l.name.toLowerCase().startsWith(prefix)
      );
      const localPassed = matched.length > 0;
      return {
        constraint,
        matched_count: matched.length,
        total_leads: total,
        passed: localPassed,
        constraint_verdict: localPassed ? "VERIFIED" as ConstraintVerdict : "UNSUPPORTED" as ConstraintVerdict, // PHASE_4: self-evident local check
      };
    }

    case "LOCATION": {
      if (cvlMatch) {
        const passed = cvlMatch.status === "yes" || cvlMatch.status === "not_applicable";
        const cv = cvlMatch.status === "not_applicable" ? "NOT_APPLICABLE" as ConstraintVerdict : deriveConstraintVerdict(passed, cvlMatch.status); // PHASE_4
        return {
          constraint,
          matched_count: passed ? total : 0,
          total_leads: total,
          passed,
          constraint_verdict: cv,
          ...(cvlMatch.status === "not_applicable" ? { status: "not_applicable" as CvlConstraintStatus } : {}),
        };
      }
      return {
        constraint,
        matched_count: total,
        total_leads: total,
        passed: true,
        constraint_verdict: "PLAUSIBLE" as ConstraintVerdict, // PHASE_4: location unverified without CVL
        _locationUnverified: true,
      } as ConstraintResult & { _locationUnverified?: boolean };
    }

    case "COUNT_MIN": {
      return {
        constraint,
        matched_count: total,
        total_leads: total,
        passed: false,
        constraint_verdict: "UNSUPPORTED" as ConstraintVerdict, // PHASE_4
      };
    }

    default:
      return {
        constraint,
        matched_count: 0,
        total_leads: total,
        passed: false,
        constraint_verdict: "UNSUPPORTED" as ConstraintVerdict, // PHASE_4
      };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkNoProgress(input: TowerVerdictInput): boolean {
  const history = input.attempt_history;
  if (!history || history.length < 2) return false;

  const last = history[history.length - 1];
  const prev = history[history.length - 2];

  return (
    last.radius_km === prev.radius_km &&
    last.delivered_count === prev.delivered_count &&
    last.plan_version > prev.plan_version
  );
}

function getMatchedLeadCount(constraints: Constraint[], leads: Lead[]): number {
  if (constraints.length === 0) return leads.length;

  const nameConstraints = constraints.filter(
    (c) => c.type === "NAME_CONTAINS" || c.type === "NAME_STARTS_WITH"
  );

  if (nameConstraints.length === 0) return leads.length;

  return leads.filter((lead) => {
    return nameConstraints.every((c) => {
      if (c.type === "NAME_CONTAINS") {
        const regex = new RegExp(
          `\\b${escapeRegex(String(c.value))}\\b`,
          "i"
        );
        return regex.test(lead.name);
      }
      if (c.type === "NAME_STARTS_WITH") {
        return lead.name
          .toLowerCase()
          .startsWith(String(c.value).toLowerCase());
      }
      return true;
    });
  }).length;
}

function getMeta(input: TowerVerdictInput): MetaInfo {
  return input.meta ?? {
    plan_version: input.plan_version,
    radius_km: input.radius_km,
  };
}

function canReplan(input: TowerVerdictInput): boolean {
  const meta = getMeta(input);
  if (meta.replans_used != null && meta.max_replans != null) {
    return meta.replans_used < meta.max_replans;
  }
  return true;
}

function allowRelaxSoft(input: TowerVerdictInput): boolean {
  return input.success_criteria?.allow_relax_soft_constraints !== false;
}

function checkLabelHonesty(input: TowerVerdictInput, constraintResults?: ConstraintResult[]): string[] {
  const gaps: string[] = [];
  const meta = getMeta(input);
  const relaxed = meta.relaxed_constraints;

  const title = input.artefact_title ?? "";
  const summary = input.artefact_summary ?? "";
  const combined = `${title} ${summary}`.toLowerCase();

  if (relaxed && relaxed.length > 0) {
    for (const rc of relaxed) {
      const words = rc
        .replace(/dropped|expanded|relaxed|removed|to\s+\d+\w*/gi, "")
        .trim()
        .toLowerCase()
        .split(/[\s_]+/)
        .filter((w) => w.length > 2);
      for (const word of words) {
        if (combined.includes(word)) {
          gaps.push("LABEL_MISLEADING");
          break;
        }
      }
      if (gaps.includes("LABEL_MISLEADING")) break;
    }
  }

  const matchPattern = /\b(match(?:es|ed|ing)?|verified\s+match(?:es)?|exact\s+match(?:es)?)\b/;
  if (matchPattern.test(combined)) {
    const hasUnbackedMatchClaim = !constraintResults ||
      constraintResults.length === 0 ||
      constraintResults.some(
        (cr) => cr.status === "unknown" || cr.status === "not_attempted"
      );
    if (hasUnbackedMatchClaim) {
      if (!gaps.includes("LABEL_MISLEADING")) {
        gaps.push("LABEL_MISLEADING");
      }
      gaps.push("MATCH_CLAIM_WITHOUT_EVIDENCE");
    }
  }

  return gaps;
}

export function detectConcatenationArtifacts(
  texts: string[]
): { corrupted: boolean; reason: string | null } {
  for (const raw of texts) {
    if (!raw || raw.length < 3) continue;
    const text = raw.trim();

    if (/\([^)]{40,}\?\s*\)/.test(text)) {
      return {
        corrupted: true,
        reason: "Input contains a full question embedded in parentheses.",
      };
    }

    const words = text.split(/\s+/);
    if (words.length >= 3) {
      for (let i = 0; i < words.length - 2; i++) {
        const w = words[i].toLowerCase().replace(/[^a-z]/g, "");
        if (w.length >= 3 && w === words[i + 1]?.toLowerCase().replace(/[^a-z]/g, "") && w === words[i + 2]?.toLowerCase().replace(/[^a-z]/g, "")) {
          return {
            corrupted: true,
            reason: `Input contains repeated word "${words[i]}" suggesting copy-paste corruption.`,
          };
        }
      }
    }

    const lower = text.toLowerCase();
    const concatPatterns = [
      lower.match(/\b([a-z]{2,})(can|could|should|would|will|shall|does|did|is|are|was|were|have|has|had)([a-z]{2,})\b/),
      lower.match(/\b([a-z]{3,})(can|could|should|would|will|shall|does|did|is|are|was|were|have|has|had)\b/),
    ];
    for (const concatMatch of concatPatterns) {
      if (!concatMatch) continue;
      const full = concatMatch[0];
      const knownSafe = /^(american|african|mexican|dominican|franciscan|republican|anglican|candidate|candid|candy|candle|canal|canada|canadian|canary|cancel|cancer|canvas|canyon|scandal|volcano|significant|particular|popular|regular|circular|nuclear|angular|understand|thousand|standard|command|demand|expand|tuscan|artisan|partisan|guardian|median|suburban|veteran|spartan|christian|norwegian|hawaiian|european|indian|persian|russian|orphan|ocean|organ|urban|sedan|sultan|jordan|morgan|duncan|colorado|orlando|avocado|desperado|commando|tornado|crescendo|innuendo|nintendo|pseudo|overdo|bushido|bravado|eldorado|scholar|dollar|muscular|secular|spectacular|molecular|singular|cellular|modular|toucan|pelican|pecan|caravan|afghan|catalan|marzipan|husband|island|islands|began|scan|uncan|outdo|outis|outdid|outdoes|overis|overdid|overdoes|overwas|alcan|texan|vatican|vulcan|parmesan|artesian|diocesan|dentist|dentists|consist|consists|consistent|persist|persists|insist|insists|resist|resists|exist|exists|assist|assists|enlist|enlists|consist|desist|artist|artists|florist|florists|tourist|tourists|publicist|publicists|specialist|specialists|journalist|journalists|bristol|pistol|crystal|epistle|whistle|thistle|misty|history|historical|historic|listen|listed|listing|listings|discover|distort|distill|distant|distinguish|district|distribute|dismiss|dispute|dissolve|display|disturb|disclaim|discard|disgust|disdain|disabled|disappear|disagree|disappoint)$/;
      if (!knownSafe.test(full)) {
        return {
          corrupted: true,
          reason: `Input appears concatenated: "${full}" looks like words merged without spaces.`,
        };
      }
    }
  }
  return { corrupted: false, reason: null };
}

function verdictToAction(verdict: TowerVerdictAction): "continue" | "stop" | "change_plan" {
  if (verdict === "ACCEPT" || verdict === "ACCEPT_WITH_UNVERIFIED") return "continue";
  if (verdict === "CHANGE_PLAN") return "change_plan";
  return "stop";
}

function inferFieldFromType(type: string): string {
  if (type === "NAME_CONTAINS" || type === "NAME_STARTS_WITH") return "name";
  if (type === "LOCATION") return "location";
  if (type === "COUNT_MIN") return "count";
  if (type === "HAS_ATTRIBUTE") return "attribute";
  return "unknown";
}

function defaultHardnessForType(type: string): "hard" | "soft" {
  if (type === "NAME_CONTAINS" || type === "NAME_STARTS_WITH" || type === "LOCATION") return "hard";
  if (type === "HAS_ATTRIBUTE") return "hard";
  return "soft";
}

function parseLegacyConstraintString(raw: string, hardness: "hard" | "soft"): Constraint | null {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return null;

  const typePart = raw.substring(0, colonIdx).trim().toUpperCase();
  const valuePart = raw.substring(colonIdx + 1).trim();

  const validTypes: ConstraintType[] = ["NAME_CONTAINS", "NAME_STARTS_WITH", "LOCATION", "COUNT_MIN", "HAS_ATTRIBUTE"];
  if (!validTypes.includes(typePart as ConstraintType)) return null;

  const type = typePart as ConstraintType;
  const value = type === "COUNT_MIN" ? Number(valuePart) : valuePart;
  if (type === "COUNT_MIN" && isNaN(value as number)) return null;

  return {
    type,
    field: inferFieldFromType(type),
    value,
    hardness,
  };
}

export function migrateLegacyConstraints(
  hardConstraints?: string[],
  softConstraints?: string[]
): Constraint[] {
  const result: Constraint[] = [];

  if (Array.isArray(hardConstraints)) {
    for (const raw of hardConstraints) {
      const parsed = parseLegacyConstraintString(raw, "hard");
      if (parsed) result.push(parsed);
    }
  }

  if (Array.isArray(softConstraints)) {
    for (const raw of softConstraints) {
      const parsed = parseLegacyConstraintString(raw, "soft");
      if (parsed) result.push(parsed);
    }
  }

  return result;
}

export function normalizeConstraintHardness(obj: Record<string, any>): Constraint | null {
  if (!obj || !obj.type || !obj.field || obj.value === undefined) return null;

  const validTypes: ConstraintType[] = ["NAME_CONTAINS", "NAME_STARTS_WITH", "LOCATION", "COUNT_MIN", "HAS_ATTRIBUTE"];
  if (!validTypes.includes(obj.type as ConstraintType)) return null;

  return {
    type: obj.type as ConstraintType,
    field: obj.field as string,
    value: obj.value as string | number,
    hardness: obj.hardness === "hard" || obj.hardness === "soft"
      ? obj.hardness
      : defaultHardnessForType(obj.type),
    evidence_requirement: obj.evidence_requirement, // PHASE_4
    label: obj.label, // PHASE_4
  };
}

const SUPERVISOR_TYPE_MAP: Record<string, ConstraintType> = {
  LOCATION_EQUALS: "LOCATION",
  LOCATION: "LOCATION",
  NAME_CONTAINS: "NAME_CONTAINS",
  NAME_STARTS_WITH: "NAME_STARTS_WITH",
  COUNT_MIN: "COUNT_MIN",
  HAS_ATTRIBUTE: "HAS_ATTRIBUTE",
};

export function normalizeStructuredConstraint(sc: StructuredConstraint): Constraint | null {
  if (!sc || !sc.type || sc.value === undefined) return null;

  const normalizedType = SUPERVISOR_TYPE_MAP[sc.type];
  if (!normalizedType) return null;

  const field = sc.field ?? inferFieldFromType(normalizedType);

  let hardness: "hard" | "soft";
  if (sc.hardness === "hard" || sc.hardness === "soft") {
    hardness = sc.hardness;
  } else if (typeof sc.hard === "boolean") {
    hardness = sc.hard ? "hard" : "soft";
  } else {
    hardness = defaultHardnessForType(normalizedType);
  }

  return {
    type: normalizedType,
    field,
    value: normalizedType === "COUNT_MIN" ? Number(sc.value) : sc.value,
    hardness,
    evidence_requirement: sc.evidence_requirement, // PHASE_4
    label: sc.label, // PHASE_4
  };
}

export function normalizeStructuredConstraints(scs: StructuredConstraint[]): Constraint[] {
  return scs
    .map(normalizeStructuredConstraint)
    .filter((c): c is Constraint => c !== null);
}

function resolveConstraints(input: TowerVerdictInput): Constraint[] {
  if (Array.isArray(input.constraints) && input.constraints.length > 0) {
    const normalized = input.constraints
      .map((c) => normalizeConstraintHardness(c as any))
      .filter((c): c is Constraint => c !== null);
    if (normalized.length > 0) return normalized;
  }

  if (Array.isArray(input.structured_constraints) && input.structured_constraints.length > 0) {
    const normalized = normalizeStructuredConstraints(input.structured_constraints);
    if (normalized.length > 0) return normalized;
  }

  const legacy = migrateLegacyConstraints(
    input.hard_constraints,
    input.soft_constraints
  );
  if (legacy.length > 0) return legacy;

  const sc = input.success_criteria;
  if (sc) {
    const scConstraints: Constraint[] = [];
    if (Array.isArray(sc.hard_constraints)) {
      for (const c of sc.hard_constraints) {
        const norm = normalizeConstraintHardness({ ...c, hardness: (c as any).hardness ?? "hard" });
        if (norm) scConstraints.push(norm);
      }
    }
    if (Array.isArray(sc.soft_constraints)) {
      for (const c of sc.soft_constraints) {
        const norm = normalizeConstraintHardness({ ...c, hardness: (c as any).hardness ?? "soft" });
        if (norm) scConstraints.push(norm);
      }
    }
    if (scConstraints.length > 0) return scConstraints;
  }

  return [];
}

const RELATIONSHIP_PREDICATE_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\bworks?\s+with\b/, label: "works with" },
  { regex: /\bworking\s+with\b/, label: "working with" },
  { regex: /\bsupplies\s+(?:to\s+)?(?!chain\b|list\b|store\b|room\b)/, label: "supplies" },
  { regex: /\bsupply\s+(?:to\s+)?(?!chain\b|list\b|store\b|room\b)/, label: "supply" },
  { regex: /\bsupplying\s+/, label: "supplying" },
  { regex: /\bserves?\b(?!\s+(?:food|coffee|drinks|meals|alcohol|beer|wine|lunch|dinner|breakfast))/, label: "serves" },
  { regex: /\bserving\b(?!\s+(?:food|coffee|drinks|meals|alcohol|beer|wine|lunch|dinner|breakfast))/, label: "serving" },
  { regex: /\bsupports?\b(?!\s+(?:windows|mac|linux|ios|android|mobile|desktop|browsers?|devices?|formats?|languages?|teams?|staff))/, label: "supports" },
  { regex: /\bsupporting\b(?!\s+(?:windows|mac|linux|ios|android|mobile|desktop|browsers?|devices?|formats?|languages?|teams?|staff))/, label: "supporting" },
  { regex: /\bpartners?\s+with\b/, label: "partners with" },
  { regex: /\bpartnering\s+with\b/, label: "partnering with" },
  { regex: /\bprovides?\s+services?\s+to\b/, label: "provides services to" },
  { regex: /\bproviding\s+services?\s+to\b/, label: "providing services to" },
  { regex: /\bcontracted\s+(?:by|to)\b/, label: "contracted by/to" },
];

const TIME_PREDICATE_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\bopened\s+(?:in\s+(?:the\s+)?)?(?:last|past)\s+\d+\s+(?:month|year|week)s?\b/, label: "opened in last N" },
  { regex: /\bopened\s+(?:with)?in\s+(?:the\s+)?(?:last|past)\s+\d+\s+(?:month|year|week)s?\b/, label: "opened within last N" },
  { regex: /\bopened\s+(?:after|since)\s+\d{4}\b/, label: "opened after year" },
  { regex: /\bopened\s+(?:after|since)\s+\w+\s+\d{4}\b/, label: "opened after date" },
  { regex: /\bnew(?:ly)?\s+opened\b/, label: "newly opened" },
  { regex: /\brecently\s+opened\b/, label: "recently opened" },
  { regex: /\bopened\s+recently\b/, label: "opened recently" },
  { regex: /\bopened\s+this\s+(?:year|month|quarter)\b/, label: "opened this period" },
  { regex: /\bopening\s+date\b/, label: "opening date" },
  { regex: /\blaunch(?:ed)?\s+(?:in\s+(?:the\s+)?)?(?:last|past)\s+\d+/, label: "launched in last N" },
  { regex: /\bestablished\s+(?:in\s+(?:the\s+)?)?(?:last|past|after|since)\s+/, label: "established after" },
];

export function detectTimePredicate(
  goal: string | null | undefined
): { detected: boolean; predicate: string | null } {
  if (!goal) return { detected: false, predicate: null };
  const lower = goal.toLowerCase();
  for (const { regex, label } of TIME_PREDICATE_PATTERNS) {
    if (regex.test(lower)) {
      return { detected: true, predicate: label };
    }
  }
  return { detected: false, predicate: null };
}

export function evaluateTimePredicates(input: TowerVerdictInput, _goal: string | null): TimePredicateResult {
  const predicates = input.time_predicates ?? [];

  if (predicates.length === 0) {
    return {
      time_predicates_required: [],
      time_predicates_mode: "verifiable",
      time_predicates_proxy_used: null,
      time_predicates_satisfied_count: 0,
      time_predicates_unknown_count: 0,
      hard_constraints_blocked: [],
      user_summary: "",
    };
  }

  const required: TimePredicateInput[] = [...predicates];

  if (input.time_predicates_mode == null) {
    return {
      time_predicates_required: required,
      time_predicates_mode: "unverifiable",
      time_predicates_proxy_used: null,
      time_predicates_satisfied_count: 0,
      time_predicates_unknown_count: required.length,
      hard_constraints_blocked: required
        .filter((tp) => tp.hardness === "hard")
        .map((tp) => `time_predicate_${tp.predicate.replace(/\s+/g, "_").toLowerCase()}`),
      user_summary: `Stopped: Supervisor did not declare verifiability for time predicate '${required[0].predicate}'. Cannot assume satisfied.`,
    };
  }

  const mode: TimePredicateMode = input.time_predicates_mode;
  const proxyUsed: TimePredicateProxy | null = input.time_predicates_proxy_used ?? null;
  const satisfiedCount = input.time_predicates_satisfied_count ?? 0;
  const unknownCount = input.time_predicates_unknown_count ?? Math.max(required.length - satisfiedCount, 0);

  const hardBlocked: string[] = [];

  for (const tp of required) {
    if (tp.hardness !== "hard") continue;

    if (mode === "unverifiable" && proxyUsed == null) {
      hardBlocked.push(`time_predicate_${tp.predicate.replace(/\s+/g, "_").toLowerCase()}`);
    } else if (mode === "proxy" && proxyUsed == null) {
      hardBlocked.push(`time_predicate_${tp.predicate.replace(/\s+/g, "_").toLowerCase()}`);
    } else if (mode === "proxy" && proxyUsed != null) {
      if (satisfiedCount === 0) {
        hardBlocked.push(`time_predicate_${tp.predicate.replace(/\s+/g, "_").toLowerCase()}`);
      }
    } else if (mode === "verifiable") {
      if (satisfiedCount === 0) {
        hardBlocked.push(`time_predicate_${tp.predicate.replace(/\s+/g, "_").toLowerCase()}`);
      }
    }
  }

  let userSummary: string;
  if (mode === "unverifiable" && proxyUsed == null) {
    const predicateLabel = required[0]?.predicate ?? "opening date";
    userSummary = `Stopped: required '${predicateLabel}' cannot be verified and no proxy was accepted.`;
  } else if (mode === "proxy" && proxyUsed == null) {
    const predicateLabel = required[0]?.predicate ?? "opening date";
    userSummary = `Stopped: proxy verification for '${predicateLabel}' was requested but not executed.`;
  } else if (mode === "proxy" && proxyUsed != null) {
    if (satisfiedCount > 0) {
      userSummary = `Opening dates cannot be guaranteed; proxy used: ${proxyUsed.replace(/_/g, " ")}.`;
    } else {
      userSummary = `Proxy '${proxyUsed.replace(/_/g, " ")}' was used but found no supporting evidence.`;
    }
  } else if (mode === "verifiable" && satisfiedCount > 0) {
    userSummary = `Time predicate satisfied per Supervisor: ${satisfiedCount} of ${required.length} met.`;
  } else {
    userSummary = `Time predicate could not be satisfied.`;
  }

  return {
    time_predicates_required: required,
    time_predicates_mode: mode,
    time_predicates_proxy_used: proxyUsed,
    time_predicates_satisfied_count: satisfiedCount,
    time_predicates_unknown_count: unknownCount,
    hard_constraints_blocked: hardBlocked,
    user_summary: userSummary,
  };
}

export function detectRelationshipPredicate(
  goal: string | null | undefined
): { detected: boolean; predicate: string | null } {
  if (!goal) return { detected: false, predicate: null };
  const lower = goal.toLowerCase();
  for (const { regex, label } of RELATIONSHIP_PREDICATE_PATTERNS) {
    if (regex.test(lower)) {
      return { detected: true, predicate: label };
    }
  }
  return { detected: false, predicate: null };
}

// TOWER_SELF_EVIDENT_FIX: determine if all hard constraints are self-evident
// (i.e. verifiable without external evidence). Self-evident types:
//   NAME_CONTAINS / NAME_STARTS_WITH — verified by inspecting lead name directly
//   LOCATION — verified by Supervisor or structurally plausible without CVL
//   COUNT_MIN — verified by counting delivered leads
// When all hard constraints are self-evident, the evidence quality judge should
// not override ACCEPT → STOP for missing verification data.
function allHardConstraintsSelfEvident(constraintResults: ConstraintResult[]): boolean {
  const hardResults = constraintResults.filter((cr) => cr.constraint.hardness === "hard");
  if (hardResults.length === 0) return false; // TOWER_SELF_EVIDENT_FIX: no hard constraints ≠ self-evident; evidence quality still applies
  const selfEvidentTypes: Set<string> = new Set(["NAME_CONTAINS", "NAME_STARTS_WITH", "LOCATION", "COUNT_MIN"]);
  for (const cr of hardResults) {
    if (!selfEvidentTypes.has(cr.constraint.type)) return false;
    if (cr.constraint.type === "COUNT_MIN" || cr.constraint.type === "LOCATION") continue;
    if (cr.constraint.evidence_requirement != null &&
        cr.constraint.evidence_requirement !== "none" &&
        cr.constraint.evidence_requirement !== "lead_field") {
      return false;
    }
  }
  return true;
}

export function judgeLeadsList(input: TowerVerdictInput): TowerVerdict {
  const rawResult = judgeLeadsListInner(input);
  // PHASE_5: attach hard_constraint_verdicts and failing info to every verdict
  if (rawResult.constraint_results && rawResult.constraint_results.length > 0) {
    return attachPhase5Fields(rawResult, rawResult.constraint_results);
  }
  return rawResult;
}

function judgeLeadsListInner(input: TowerVerdictInput): TowerVerdict {
  const coreResult = judgeLeadsListCore(input);

  const leads = resolveLeads(input);
  const evidenceLeads = leads.map((l) => ({
    name: l.name,
    verified: l.verified as boolean | undefined,
    evidence: l.evidence as string | string[] | Record<string, unknown> | null | undefined,
    source_url: l.source_url as string | null | undefined,
  }));

  const eqResult = judgeEvidenceQuality({
    leads: evidenceLeads,
    verified_exact_count: input.verification_summary?.verified_exact_count,
    requested_count: resolveRequestedCount(input) != null ? coreResult.requested : null,
    delivery_summary: input.delivery_summary,
    tower_verdict: coreResult.verdict,
  });

  // TOWER_SELF_EVIDENT_FIX: skip evidence quality override when all hard constraints
  // are self-evident (NAME_CONTAINS, NAME_STARTS_WITH, LOCATION, COUNT_MIN with no
  // external evidence requirement). These queries don't need verified/evidence fields
  // on leads — the constraint evaluation itself is sufficient proof.
  const selfEvident = coreResult.constraint_results
    ? allHardConstraintsSelfEvident(coreResult.constraint_results)
    : false;

  const discoveryOnly = input.verification_policy === "DIRECTORY_VERIFIED" && input.strategy === "discovery_only";

  if (!eqResult.pass && coreResult.verdict === "ACCEPT" && !selfEvident && !discoveryOnly) {
    console.log(`[TOWER] evidence_quality_override verdict=ACCEPT→STOP gaps=${eqResult.gaps.join(",")}`);
    return {
      ...coreResult,
      verdict: "STOP",
      action: "stop",
      gaps: [...coreResult.gaps, ...eqResult.gaps],
      stop_reason: eqResult.stop_reason,
      rationale: `${coreResult.rationale} [Evidence quality: ${eqResult.detail}]`,
    };
  }
  if (!eqResult.pass && coreResult.verdict === "ACCEPT" && selfEvident) {
    console.log(`[TOWER] evidence_quality_override SKIPPED (self-evident constraints) gaps=${eqResult.gaps.join(",")}`); // TOWER_SELF_EVIDENT_FIX
  }
  if (!eqResult.pass && coreResult.verdict === "ACCEPT" && discoveryOnly) {
    console.log(`[TOWER] evidence_quality_override SKIPPED (discovery_only + DIRECTORY_VERIFIED) gaps=${eqResult.gaps.join(",")}`);
  }

  if (!eqResult.pass && coreResult.verdict === "CHANGE_PLAN") {
    const extraGaps = eqResult.gaps.filter((g: string) => !coreResult.gaps.includes(g));
    if (extraGaps.length > 0) {
      return {
        ...coreResult,
        gaps: [...coreResult.gaps, ...extraGaps],
        rationale: `${coreResult.rationale} [Evidence quality: ${eqResult.detail}]`,
      };
    }
  }

  if (!eqResult.pass && coreResult.verdict === "STOP") {
    const extraGaps = eqResult.gaps.filter((g: string) => !coreResult.gaps.includes(g));
    if (extraGaps.length > 0) {
      return {
        ...coreResult,
        gaps: [...coreResult.gaps, ...extraGaps],
        stop_reason: eqResult.stop_reason ?? coreResult.stop_reason,
        rationale: `${coreResult.rationale} [Evidence quality: ${eqResult.detail}]`,
      };
    }
  }

  const goal =
    input.original_goal ??
    input.original_user_goal ??
    input.normalized_goal ??
    null;
  const relDetection = detectRelationshipPredicate(goal);

  const requiresRelEvidence =
    input.requires_relationship_evidence === true || relDetection.detected;
  const verifiedRelCount = input.verified_relationship_count ?? 0;

  if (requiresRelEvidence && verifiedRelCount === 0) {
    if (coreResult.verdict === "ACCEPT") {
      const hasDelivered = coreResult.delivered > 0;
      const verificationAttempted = input.verified_relationship_count !== undefined;

      let relCode: string;
      let relReason: string;

      if (!verificationAttempted) {
        relCode = "RELATIONSHIP_VERIFICATION_NOT_ATTEMPTED";
        relReason = hasDelivered
          ? "Candidates found, but relationship verification was never attempted. Cannot confirm any lead satisfies the relationship requirement."
          : "No relationship verification was attempted. Cannot confirm any lead satisfies the relationship requirement.";
      } else if (hasDelivered) {
        relCode = "RELATIONSHIP_EVIDENCE_MISSING";
        relReason = "Candidates found and relationship verification was attempted, but no verified relationship match exists. Results are candidates only.";
      } else {
        relCode = "RELATIONSHIP_CHECKED_NO_MATCH";
        relReason = "Relationship verification was attempted but found no results with confirmed relationship evidence.";
      }

      const detectionSource = input.requires_relationship_evidence === true
        ? "explicit (requires_relationship_evidence=true)"
        : `auto-detected predicate "${relDetection.predicate}" in goal`;

      console.log(
        `[TOWER] relationship_predicate_gate: verdict=${coreResult.verdict}→STOP code=${relCode} ` +
        `source=${detectionSource} verified_relationship_count=${verifiedRelCount} ` +
        `verification_attempted=${verificationAttempted} delivered=${coreResult.delivered}`
      );

      return {
        ...coreResult,
        verdict: "STOP" as TowerVerdictAction,
        action: "stop" as const,
        gaps: [...coreResult.gaps, relCode],
        stop_reason: {
          code: relCode,
          message: relReason,
          evidence: {
            requires_relationship_evidence: true,
            verified_relationship_count: verifiedRelCount,
            verification_attempted: verificationAttempted,
            detected_predicate: relDetection.predicate ?? undefined,
            detection_source: detectionSource,
          },
        },
        rationale: `${coreResult.rationale} [Relationship predicate: ${relReason}]`,
      };
    }
  }

  if (input.unresolved_hard_constraints && input.unresolved_hard_constraints.length > 0) {
    const certaintyViolations = input.unresolved_hard_constraints.filter(
      (uhc) => uhc.must_be_certain === true && (uhc.verifiability === "proxy" || uhc.verifiability === "unverifiable")
    );

    if (certaintyViolations.length > 0 && (coreResult.verdict === "ACCEPT" || coreResult.verdict === "ACCEPT_WITH_UNVERIFIED")) {
      const gateCode = "MUST_BE_CERTAIN_VIOLATED";
      const violatedIds = certaintyViolations.map((c) => c.constraint_id);
      const violatedLabels = certaintyViolations.map((c) => c.label);
      const reasons = certaintyViolations.map((c) =>
        `User required certainty for "${c.label}", but evidence is not strictly verifiable (verifiability: ${c.verifiability}).`
      );
      const userReason = reasons.join(" ");
      console.log(
        `[TOWER] must_be_certain_backstop: verdict=${coreResult.verdict}→STOP violated=${violatedIds.join(",")}`
      );
      return {
        ...coreResult,
        verdict: "STOP" as TowerVerdictAction,
        action: "stop" as const,
        gaps: [...coreResult.gaps, gateCode, ...violatedIds],
        stop_reason: {
          code: gateCode,
          message: userReason,
          evidence: {
            must_be_certain_constraints: certaintyViolations.map((c) => ({
              constraint_id: c.constraint_id,
              label: c.label,
              verifiability: c.verifiability,
            })),
          },
        },
        rationale: `${coreResult.rationale} [Certainty backstop: ${userReason}]`,
      };
    }
  }

  if (input.unresolved_hard_constraints && input.unresolved_hard_constraints.length > 0 && coreResult.verdict === "ACCEPT") {
    const blocked: Array<{ id: string; label: string; reason: string }> = [];
    for (const uhc of input.unresolved_hard_constraints) {
      if (uhc.verifiability === "unverifiable") {
        blocked.push({
          id: uhc.constraint_id,
          label: uhc.label,
          reason: `Stopped: ${uhc.label} can't be verified with current sources.`,
        });
      } else if (uhc.verifiability === "proxy" && (uhc.proxy_selected == null || uhc.proxy_selected === "")) {
        blocked.push({
          id: uhc.constraint_id,
          label: uhc.label,
          reason: `Stopped: required ${uhc.label} can't be verified without an accepted proxy.`,
        });
      } else if (uhc.verifiability === "verifiable") {
        blocked.push({
          id: uhc.constraint_id,
          label: uhc.label,
          reason: `Stopped: ${uhc.label} is verifiable but was not resolved before execution completed.`,
        });
      }
    }

    if (blocked.length > 0) {
      const blockedIds = blocked.map((b) => b.id);
      const blockedLabels = blocked.map((b) => b.label);

      if (input.best_effort_accepted === true) {
        const gateCode = "CONSTRAINT_GATE_BEST_EFFORT";
        const userReason = blockedLabels.map((l) => `${l} (unverified, best-effort accepted)`).join("; ");
        console.log(
          `[TOWER] constraint_gate_check: verdict=ACCEPT→ACCEPT_WITH_UNVERIFIED best_effort=true blocked=${blockedIds.join(",")}`
        );
        return {
          ...coreResult,
          verdict: "ACCEPT_WITH_UNVERIFIED" as TowerVerdictAction,
          action: "continue" as const,
          gaps: [...coreResult.gaps, gateCode, ...blockedIds],
          stop_reason: {
            code: gateCode,
            message: userReason,
            evidence: {
              unresolved_hard_constraints: blocked,
              best_effort_accepted: true,
            },
          },
          rationale: `${coreResult.rationale} [Constraint gate: unverified constraints accepted as best-effort: ${blockedLabels.join(", ")}]`,
        };
      }

      const gateCode = "CONSTRAINT_GATE_BLOCKED";
      const userReason = blocked.map((b) => b.reason).join(" ");
      console.log(
        `[TOWER] constraint_gate_check: verdict=ACCEPT→STOP blocked=${blockedIds.join(",")}`
      );
      return {
        ...coreResult,
        verdict: "STOP" as TowerVerdictAction,
        action: "stop" as const,
        gaps: [...coreResult.gaps, gateCode, ...blockedIds],
        stop_reason: {
          code: gateCode,
          message: userReason,
          evidence: {
            unresolved_hard_constraints: blocked,
          },
        },
        rationale: `${coreResult.rationale} [Constraint gate: ${userReason}]`,
      };
    }
  }

  const tpResult = evaluateTimePredicates(input, goal);
  if (tpResult.time_predicates_required.length > 0) {
    const hasHardBlocked = tpResult.hard_constraints_blocked.length > 0;

    if (hasHardBlocked && coreResult.verdict === "ACCEPT") {
      const tpCode = "TIME_PREDICATE_BLOCKED";
      console.log(
        `[TOWER] time_predicate_gate: verdict=ACCEPT→STOP code=${tpCode} ` +
        `mode=${tpResult.time_predicates_mode} proxy=${tpResult.time_predicates_proxy_used} ` +
        `satisfied=${tpResult.time_predicates_satisfied_count} blocked=${tpResult.hard_constraints_blocked.join(",")}`
      );
      return {
        ...coreResult,
        verdict: "STOP" as TowerVerdictAction,
        action: "stop" as const,
        gaps: [...coreResult.gaps, tpCode, ...tpResult.hard_constraints_blocked],
        stop_reason: {
          code: tpCode,
          message: tpResult.user_summary,
          evidence: {
            time_predicates_required: tpResult.time_predicates_required,
            time_predicates_mode: tpResult.time_predicates_mode,
            time_predicates_proxy_used: tpResult.time_predicates_proxy_used,
            time_predicates_satisfied_count: tpResult.time_predicates_satisfied_count,
            time_predicates_unknown_count: tpResult.time_predicates_unknown_count,
            hard_constraints_blocked: tpResult.hard_constraints_blocked,
          },
        },
        rationale: `${coreResult.rationale} [Time predicate: ${tpResult.user_summary}]`,
      };
    }

    if (tpResult.time_predicates_mode === "proxy" && tpResult.time_predicates_proxy_used != null && tpResult.time_predicates_satisfied_count > 0 && coreResult.verdict === "ACCEPT") {
      const deliverySummary = input.delivery_summary ?? "";
      const acceptableProxy = deliverySummary === "PARTIAL" || deliverySummary === "STOP" || /\bproxy\b/i.test(deliverySummary);
      if (!acceptableProxy) {
        const tpCode = "TIME_PREDICATE_PROXY_LANGUAGE_MISMATCH";
        console.log(
          `[TOWER] time_predicate_gate: delivery_summary does not acknowledge proxy. ` +
          `delivery_summary="${deliverySummary}" proxy=${tpResult.time_predicates_proxy_used}`
        );
        return {
          ...coreResult,
          verdict: "STOP" as TowerVerdictAction,
          action: "stop" as const,
          gaps: [...coreResult.gaps, tpCode],
          stop_reason: {
            code: tpCode,
            message: `Delivery summary says "${deliverySummary}" but proxy was used for time predicate. Summary must acknowledge proxy, not claim verified.`,
            evidence: {
              delivery_summary: deliverySummary,
              time_predicates_proxy_used: tpResult.time_predicates_proxy_used,
              time_predicates_satisfied_count: tpResult.time_predicates_satisfied_count,
            },
          },
          rationale: `${coreResult.rationale} [Time predicate: ${tpResult.user_summary}]`,
        };
      }
    }

    if (coreResult.verdict === "ACCEPT" || coreResult.verdict === "CHANGE_PLAN") {
      const hasTimeGaps = tpResult.hard_constraints_blocked.length > 0 || tpResult.time_predicates_unknown_count > 0;
      if (hasTimeGaps) {
        const extraGaps = tpResult.hard_constraints_blocked.filter(g => !coreResult.gaps.includes(g));
        if (extraGaps.length > 0) {
          return {
            ...coreResult,
            gaps: [...coreResult.gaps, ...extraGaps],
            rationale: `${coreResult.rationale} [Time predicate: ${tpResult.user_summary}]`,
          };
        }
      }
    }
  }

  if (coreResult.verdict === "ACCEPT" && coreResult.constraint_results) {
    const hardUnverified = coreResult.constraint_results.filter((cr: ConstraintResult) => {
      if (cr.constraint.hardness !== "hard") return false;
      if (cr.passed) return false;
      const st = cr.status;
      if (st === "not_applicable") return false;
      return st === "unknown" || st === "not_attempted" || !cr.passed;
    });

    if (hardUnverified.length > 0) {
      const unverifiedLabels = hardUnverified.map((cr: ConstraintResult) =>
        `${cr.constraint.type}(${cr.constraint.field}=${cr.constraint.value})`
      );

      if (input.best_effort_accepted === true) {
        const gateCode = "TRUTH_GATE_BEST_EFFORT";
        console.log(
          `[TOWER] truth_gate: verdict=ACCEPT→ACCEPT_WITH_UNVERIFIED best_effort=true unverified=${unverifiedLabels.join(",")}`
        );
        return {
          ...coreResult,
          verdict: "ACCEPT_WITH_UNVERIFIED" as TowerVerdictAction,
          action: "continue" as const,
          gaps: [...coreResult.gaps, gateCode],
          stop_reason: {
            code: gateCode,
            message: `Hard constraints not verified: ${unverifiedLabels.join(", ")}. User accepted best-effort.`,
            evidence: {
              unverified_constraints: unverifiedLabels,
              best_effort_accepted: true,
            },
          },
          rationale: `${coreResult.rationale} [Truth gate: hard constraints unverified but best-effort accepted: ${unverifiedLabels.join(", ")}]`,
        };
      }

      const gateCode = "TRUTH_GATE_BLOCKED";
      console.log(
        `[TOWER] truth_gate: verdict=ACCEPT→STOP unverified=${unverifiedLabels.join(",")}`
      );
      return {
        ...coreResult,
        verdict: "STOP" as TowerVerdictAction,
        action: "stop" as const,
        gaps: [...coreResult.gaps, gateCode],
        stop_reason: {
          code: gateCode,
          message: `Hard constraints not verified: ${unverifiedLabels.join(", ")}. Cannot PASS with unverified hard constraints.`,
          evidence: {
            unverified_constraints: unverifiedLabels,
          },
        },
        rationale: `${coreResult.rationale} [Truth gate: hard constraints unverified — ${unverifiedLabels.join(", ")}]`,
      };
    }
  }

  return coreResult;
}

interface HonestPartialResult {
  detected: boolean;
  verifiedExactCount: number;
  hardEvidenceConstraintsPassed: boolean;
}

function detectHonestPartial(
  input: TowerVerdictInput,
  deliveredCount: number,
  requestedCount: number,
  constraintResults: ConstraintResult[],
  hardViolations: ConstraintResult[],
  hardUnknowns: Constraint[],
): HonestPartialResult {
  const NO = { detected: false, verifiedExactCount: 0, hardEvidenceConstraintsPassed: false };

  if (deliveredCount <= 0) return NO;
  const nonCountHardViolations = hardViolations.filter(
    (r) => r.constraint.type !== "COUNT_MIN"
  );
  if (nonCountHardViolations.length > 0) return NO;

  const deliverySummary = input.delivery_summary;
  if (deliverySummary !== "PARTIAL" && deliverySummary !== "PASS") return NO;

  const leads = resolveLeads(input);

  let verifiedExactCount = 0;

  if (input.verification_summary && typeof input.verification_summary.verified_exact_count === "number") {
    verifiedExactCount = input.verification_summary.verified_exact_count;
  } else {
    for (const lead of leads) {
      const isVerified = (lead as any).verified === true;
      const hasEvidence =
        ((lead as any).evidence != null &&
          ((typeof (lead as any).evidence === "string" && (lead as any).evidence.trim().length > 0) ||
           (Array.isArray((lead as any).evidence) && (lead as any).evidence.length > 0))) ||
        (typeof (lead as any).source_url === "string" && (lead as any).source_url.trim().length > 0);
      if (isVerified && hasEvidence) {
        verifiedExactCount++;
      }
    }
  }

  if (verifiedExactCount <= 0) return NO;
  if (verifiedExactCount >= requestedCount) return NO;
  if (verifiedExactCount > deliveredCount) {
    verifiedExactCount = deliveredCount;
  }

  const hardEvidenceConstraints = constraintResults.filter(
    (cr) => cr.constraint.hardness === "hard" && cr.constraint.type === "HAS_ATTRIBUTE"
  );
  const hardEvidenceConstraintsPassed = hardEvidenceConstraints.length === 0 ||
    hardEvidenceConstraints.some((cr) => cr.passed || cr.status === "yes");

  const nonEvidenceHardUnknowns = hardUnknowns.filter((c) => c.type !== "HAS_ATTRIBUTE");
  if (nonEvidenceHardUnknowns.length > 0) return NO;

  return {
    detected: true,
    verifiedExactCount,
    hardEvidenceConstraintsPassed,
  };
}

// PHASE_5: build hard_constraint_verdicts array from constraintResults
function buildHardConstraintVerdicts(constraintResults: ConstraintResult[]): HardConstraintVerdictEntry[] {
  return constraintResults
    .filter((cr) => cr.constraint.hardness === "hard")
    .map((cr) => ({
      id: cr.constraint.label ?? `${cr.constraint.type}:${cr.constraint.field}:${cr.constraint.value}`,
      verdict: cr.constraint_verdict ?? (cr.passed ? "VERIFIED" : "UNSUPPORTED") as ConstraintVerdict,
      label: cr.constraint.label ?? `${cr.constraint.type}(${cr.constraint.field}=${cr.constraint.value})`,
    }));
}

// PHASE_5: find the first (worst) hard constraint that should drive a STOP/CHANGE_PLAN
function findFailingHardConstraint(
  constraintResults: ConstraintResult[],
): { id: string; reason: string; verdict: ConstraintVerdict } | null {
  const hard = constraintResults.filter((cr) => cr.constraint.hardness === "hard");
  if (hard.length === 0) return null;

  let worst: ConstraintResult | null = null;
  let worstRank = Infinity;
  for (const cr of hard) {
    const cv = cr.constraint_verdict ?? (cr.passed ? "VERIFIED" : "UNSUPPORTED") as ConstraintVerdict;
    const rank = CONSTRAINT_VERDICT_RANK[cv];
    if (rank < worstRank) {
      worstRank = rank;
      worst = cr;
    }
  }

  if (!worst) return null;
  const cv = worst.constraint_verdict ?? (worst.passed ? "VERIFIED" : "UNSUPPORTED") as ConstraintVerdict;
  if (cv === "VERIFIED" || cv === "PLAUSIBLE" || cv === "NOT_APPLICABLE") return null;

  const id = worst.constraint.label ?? `${worst.constraint.type}:${worst.constraint.field}:${worst.constraint.value}`;
  const reason = cv === "CONTRADICTED"
    ? `Hard constraint "${id}" is contradicted by evidence.`
    : `Hard constraint "${id}" is unsupported — no evidence confirms it.`;
  return { id, reason, verdict: cv };
}

// PHASE_5: attach hard_constraint_verdicts and failing info to a TowerVerdict
function attachPhase5Fields(
  result: TowerVerdict,
  constraintResults: ConstraintResult[],
): TowerVerdict {
  const hcv = buildHardConstraintVerdicts(constraintResults);
  if (hcv.length === 0) return result;

  const failing = findFailingHardConstraint(constraintResults);
  return {
    ...result,
    hard_constraint_verdicts: hcv,
    ...(failing ? {
      failing_constraint_id: failing.id,
      failing_constraint_reason: failing.reason,
    } : {}),
  };
}

function judgeLeadsListCore(input: TowerVerdictInput): TowerVerdict {
  const requestedCount = resolveRequestedCount(input);
  const leads = resolveLeads(input);
  const constraints = resolveConstraints(input);
  const goal =
    input.original_goal ??
    input.original_user_goal ??
    input.normalized_goal ??
    null;

  const hasLeadsArray = (Array.isArray(input.leads) && input.leads.length > 0) ||
    (Array.isArray(input.delivered_leads) && input.delivered_leads.length > 0);
  const hasReliableCount =
    hasCvl(input) ||
    (typeof input.verified_exact === "number" && input.verified_exact > 0) ||
    input.delivered_count != null ||
    input.accumulated_count != null ||
    (typeof input.delivered === "number") ||
    (typeof input.delivered === "object" && input.delivered != null && (
      input.delivered.delivered_matching_accumulated != null ||
      input.delivered.delivered_matching_this_plan != null
    ));

  if (!hasLeadsArray && !hasReliableCount) {
    const missingFields = [
      "leads",
      "delivered_leads",
      "delivered_count",
      "verification_summary.verified_exact_count",
      "verified_exact",
      "accumulated_count",
      "delivered",
    ].filter(f => {
      if (f === "leads") return !Array.isArray(input.leads) || input.leads.length === 0;
      if (f === "delivered_leads") return !Array.isArray(input.delivered_leads) || input.delivered_leads.length === 0;
      if (f === "delivered_count") return input.delivered_count == null;
      if (f === "verification_summary.verified_exact_count") return !hasCvl(input);
      if (f === "verified_exact") return typeof input.verified_exact !== "number";
      if (f === "accumulated_count") return input.accumulated_count == null;
      if (f === "delivered") return input.delivered == null;
      return true;
    });
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: 0,
      requested: requestedCount ?? 0,
      gaps: ["CONTRACT_ERROR"],
      confidence: 100,
      rationale: `Contract error: final_delivery artefact is missing all delivery fields. Missing: ${missingFields.join(", ")}. Tower cannot evaluate delivery without data.`,
      suggested_changes: [],
      stop_reason: {
        code: "CONTRACT_ERROR",
        message: `Contract error: final_delivery missing required fields: ${missingFields.join(", ")}.`,
        evidence: {
          missing_fields: missingFields,
          fields_present: Object.keys(input).filter(k => (input as any)[k] != null),
        },
      },
      _debug: { extractedDeliveredCount: 0, extractedRequestedCount: requestedCount ?? 0, source: "none(contract_error)" },
    };
    console.log(`[TOWER] verdict=STOP reason=CONTRACT_ERROR missing=${missingFields.join(",")}`);
    return result;
  }

  const userRequestedCount = requestedCount !== null;

  if (checkNoProgress(input)) {
    const matchedCount =
      leads.length > 0 ? getMatchedLeadCount(constraints, leads) : 0;
    const dcResult = resolveDeliveredCount(input, matchedCount);
    const deliveredCount = dcResult.count;
    const message = deliveredCount > 0
      ? `Only ${deliveredCount} exact matches were found. Remaining results do not meet all stated requirements.`
      : leads.length > 0
        ? "No exact matches were found. Closest alternatives were identified after relaxing soft constraints."
        : "No results were found that meet the stated requirements.";
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: requestedCount ?? 0,
      gaps: ["NO_PROGRESS"],
      confidence: 95,
      rationale: message,
      suggested_changes: [],
      stop_reason: {
        code: "NO_PROGRESS",
        message,
        evidence: { delivered: deliveredCount, requested: requestedCount ?? 0, leads_count: leads.length },
      },
      _debug: { extractedDeliveredCount: deliveredCount, extractedRequestedCount: requestedCount ?? 0, source: dcResult.source },
    };
    console.log(`[TOWER] verdict=STOP reason=NO_PROGRESS`);
    return result;
  }

  const concatCheck = detectConcatenationArtifacts([
    input.artefact_title ?? "",
    input.artefact_summary ?? "",
    goal ?? "",
  ]);
  if (concatCheck.corrupted) {
    const matchedCount =
      leads.length > 0 ? getMatchedLeadCount(constraints, leads) : 0;
    const dcResultConcat = resolveDeliveredCount(input, matchedCount);
    const deliveredCount = dcResultConcat.count;
    const result: TowerVerdict = {
      verdict: "CHANGE_PLAN",
      action: "change_plan",
      delivered: deliveredCount,
      requested: requestedCount ?? 0,
      gaps: ["INPUT_CONCATENATED"],
      confidence: 95,
      rationale: `Input appears corrupted. ${concatCheck.reason} Ask the user to restate the request.`,
      suggested_changes: [{
        type: "CHANGE_QUERY" as SuggestedChangeType,
        field: "query",
        from: goal ?? input.artefact_title ?? "",
        to: "Ask user to restate",
        reason: concatCheck.reason ?? "Input appears concatenated.",
      }],
      stop_reason: {
        code: "INPUT_CONCATENATED",
        message: "Input appears concatenated. Ask the user to restate the request.",
        evidence: { detected_reason: concatCheck.reason },
      },
      _debug: { extractedDeliveredCount: deliveredCount, extractedRequestedCount: requestedCount ?? 0, source: dcResultConcat.source },
    };
    console.log(`[TOWER] verdict=CHANGE_PLAN reason=INPUT_CONCATENATED detail="${concatCheck.reason}"`);
    return result;
  }

  const cvlPresent = hasCvl(input);
  const cvlConstraintResults = input.verification_summary?.constraint_results;
  const attrEvidence = input.attribute_evidence;

  if (attrEvidence && attrEvidence.length > 0) {
    console.log(`[TOWER] attribute_evidence found: ${attrEvidence.length} artefact(s)`);
  }

  const matchedLeadCount =
    leads.length > 0 ? getMatchedLeadCount(constraints, leads) : null;
  const dcMain = resolveDeliveredCount(input, matchedLeadCount);
  const deliveredCount = dcMain.count;
  const deliveredSource = dcMain.source;
  const debugBlock: TowerVerdictDebug = { extractedDeliveredCount: deliveredCount, extractedRequestedCount: requestedCount ?? 0, source: deliveredSource };

  const constraintResults = constraints.map((c) => {
    if (c.type === "COUNT_MIN") {
      const minCount = Number(c.value);
      const countPassed = deliveredCount >= minCount;
      return {
        constraint: c,
        matched_count: deliveredCount,
        total_leads: leads.length,
        passed: countPassed,
        constraint_verdict: (countPassed ? "VERIFIED" : "UNSUPPORTED") as ConstraintVerdict, // PHASE_5
      } as ConstraintResult;
    }
    return evaluateConstraint(c, leads, cvlConstraintResults, attrEvidence);
  });

  // PHASE_5: derive hardViolations, hardUnknowns, and hardContradicted from constraint_verdict
  const hardResults = constraintResults.filter((cr) => cr.constraint.hardness === "hard");
  const hardContradicted = hardResults.filter((cr) => {
    const cv = cr.constraint_verdict ?? (cr.passed ? "VERIFIED" : "UNSUPPORTED");
    return cv === "CONTRADICTED";
  });
  const hardUnsupported = hardResults.filter((cr) => {
    const cv = cr.constraint_verdict ?? (cr.passed ? "VERIFIED" : "UNSUPPORTED");
    return cv === "UNSUPPORTED";
  });
  // PHASE_5: exclude LOCATION from PLAUSIBLE downgrade — LOCATION without CVL is structurally
  // plausible and has always been treated as passing (backward compat)
  const hardPlausible = hardResults.filter((cr) => {
    const cv = cr.constraint_verdict ?? (cr.passed ? "VERIFIED" : "UNSUPPORTED");
    return cv === "PLAUSIBLE" && cr.constraint.type !== "LOCATION";
  });

  // PHASE_5: backward compat — hardViolations = UNSUPPORTED + CONTRADICTED, hardUnknowns = constraints with unknown/not_attempted status
  const hardUnknownsCvl = cvlPresent
    ? constraints
        .filter((c) => c.hardness === "hard")
        .filter((c) => {
          const cvlMatch = findCvlStatusForConstraint(c, cvlConstraintResults);
          return cvlMatch != null && (cvlMatch.status === "unknown" || cvlMatch.status === "not_attempted");
        })
    : [];

  const hardUnknownsAttr = constraints
    .filter((c) => c.hardness === "hard" && c.type === "HAS_ATTRIBUTE")
    .filter((c) => {
      if (hardUnknownsCvl.some((u) => u.type === c.type && u.field === c.field && u.value === c.value)) return false;
      const cr = constraintResults.find(
        (r) => r.constraint.type === c.type && r.constraint.field === c.field && r.constraint.value === c.value
      );
      return cr != null && (cr.status === "unknown" || cr.status === "not_attempted");
    });

  const hardUnknowns = [...hardUnknownsCvl, ...hardUnknownsAttr];

  const hardUnknownKeys = new Set(hardUnknowns.map((c) => `${c.type}:${c.field}:${c.value}`));

  const hardViolations = constraintResults.filter(
    (r) =>
      !r.passed &&
      r.constraint.hardness === "hard" &&
      !hardUnknownKeys.has(`${r.constraint.type}:${r.constraint.field}:${r.constraint.value}`)
  );

  if (process.env.DEBUG_TOWER_ATTR_TRACE === "true") {
    const attrResults = constraintResults.filter(r => r.constraint.type === "HAS_ATTRIBUTE");
    if (attrResults.length > 0) {
      console.log(`[TOWER][ATTR_TRACE] === Verdict-level HAS_ATTRIBUTE summary ===`);
      for (const ar of attrResults) {
        console.log(`[TOWER][ATTR_TRACE] constraint=${ar.constraint.field}=${ar.constraint.value} hardness=${ar.constraint.hardness} passed=${ar.passed} status=${ar.status ?? "not_set"} matched=${ar.matched_count}/${ar.total_leads}`);
        if (ar.attribute_evidence_details && ar.attribute_evidence_details.length > 0) {
          const topExcerpts = ar.attribute_evidence_details.slice(0, 2).map(d => `lead="${d.lead}" quote="${(d.quote ?? "none").substring(0, 100)}"`);
          console.log(`[TOWER][ATTR_TRACE] evidence_details: ${topExcerpts.join(" | ")}`);
        }
      }
      const attrHardUnknowns = hardUnknowns.filter(c => c.type === "HAS_ATTRIBUTE");
      const attrHardViolations = hardViolations.filter(r => r.constraint.type === "HAS_ATTRIBUTE");
      console.log(`[TOWER][ATTR_TRACE] hardUnknowns(HAS_ATTRIBUTE)=${attrHardUnknowns.length} hardViolations(HAS_ATTRIBUTE)=${attrHardViolations.length}`);
      console.log(`[TOWER][ATTR_TRACE] total hardUnknowns=${hardUnknowns.length} total hardViolations=${hardViolations.length}`);
    }
  }

  const locationUnverifiedGaps: string[] = [];
  if (!cvlPresent) {
    const locationConstraints = constraints.filter((c) => c.type === "LOCATION");
    if (locationConstraints.length > 0) {
      locationUnverifiedGaps.push("LOCATION_NOT_VERIFIABLE");
    }
  }

  const labelGaps = checkLabelHonesty(input, constraintResults);

  // PHASE_5: CONTRADICTED → immediate STOP, no replan offered
  if (hardContradicted.length > 0) {
    const first = hardContradicted[0];
    const failId = first.constraint.label ?? `${first.constraint.type}:${first.constraint.field}:${first.constraint.value}`;
    const failReason = `Hard constraint "${failId}" is contradicted by evidence — immediate stop.`;
    const contradictedFields = hardContradicted.map(
      (r) => r.constraint.label ?? `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`
    );
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: requestedCount ?? 0,
      gaps: [...hardContradicted.map(() => "HARD_CONSTRAINT_CONTRADICTED"), ...labelGaps],
      confidence: 100,
      rationale: `Hard constraint contradicted: ${contradictedFields.join(", ")}. Evidence actively disproves the constraint — no replan possible.`,
      suggested_changes: [],
      constraint_results: constraintResults,
      stop_reason: {
        code: "HARD_CONSTRAINT_CONTRADICTED",
        message: failReason,
        evidence: { contradicted_constraints: contradictedFields, delivered: deliveredCount },
      },
      failing_constraint_id: failId,
      failing_constraint_reason: failReason,
      hard_constraint_verdicts: buildHardConstraintVerdicts(constraintResults),
    };
    console.log(`[TOWER] verdict=STOP reason=HARD_CONSTRAINT_CONTRADICTED constraint=${failId}`); // PHASE_5
    return { ...result, _debug: debugBlock };
  }

  if (!userRequestedCount) {
    if (deliveredCount >= 1 && hardViolations.length === 0 && hardUnknowns.length === 0) {
      // PHASE_5: if any hard constraints are PLAUSIBLE (not VERIFIED), downgrade to ACCEPT_WITH_UNVERIFIED
      const hasPlausibleOnly = hardPlausible.length > 0 && hardUnsupported.length === 0 && hardContradicted.length === 0;
      const gaps = [...locationUnverifiedGaps, ...labelGaps];
      if (hasPlausibleOnly) {
        const plausibleLabels = hardPlausible.map(
          (cr) => cr.constraint.label ?? `${cr.constraint.type}(${cr.constraint.field}=${cr.constraint.value})`
        );
        const result: TowerVerdict = {
          verdict: "ACCEPT_WITH_UNVERIFIED",
          action: "continue",
          delivered: deliveredCount,
          requested: 0,
          gaps: [...gaps, "HARD_CONSTRAINT_PLAUSIBLE"],
          confidence: 70,
          rationale: `Match(es) delivered. Hard constraints plausible but not fully verified: ${plausibleLabels.join(", ")}.`,
          suggested_changes: [],
          constraint_results: constraintResults,
        };
        console.log(`[TOWER] verdict=ACCEPT_WITH_UNVERIFIED reason=hard_plausible_not_verified delivered=${deliveredCount}`); // PHASE_5
        return { ...result, _debug: debugBlock };
      }
      const rationale = cvlPresent
        ? "Verified match(es) delivered. All hard constraints satisfied."
        : "Exact match(es) delivered. No specific count was requested.";
      const result: TowerVerdict = {
        verdict: "ACCEPT",
        action: "continue",
        delivered: deliveredCount,
        requested: 0,
        gaps,
        confidence: 85,
        rationale,
        suggested_changes: [],
        constraint_results: constraintResults,
      };
      console.log(`[TOWER] verdict=ACCEPT reason=no_count_requested delivered=${deliveredCount}`);
      return { ...result, _debug: debugBlock };
    }

    if (deliveredCount >= 1 && hardViolations.length > 0) {
      const violatedFields = hardViolations.map(
        (r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`
      );
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: 0,
        gaps: [...hardViolations.map(() => "HARD_CONSTRAINT_VIOLATED"), ...labelGaps],
        confidence: 95,
        rationale: `Results delivered but hard constraints violated: ${violatedFields.join(", ")}.`,
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "COUNT_MET_HARD_VIOLATED",
          message: `Hard constraints violated: ${violatedFields.join(", ")}.`,
          evidence: { delivered: deliveredCount, violated_fields: violatedFields },
        },
      };
      console.log(`[TOWER] verdict=STOP reason=no_count_requested_hard_violated delivered=${deliveredCount}`);
      return { ...result, _debug: debugBlock };
    }

    if (deliveredCount >= 1 && hardUnknowns.length > 0) {
      const unknownIds = hardUnknowns.map(
        (c) => `${c.type}(${c.field}=${c.value})`
      );
      if (canReplan(input)) {
        const suggestions: SuggestedChange[] = hardUnknowns.map((c) => ({
          type: "ADD_VERIFICATION_STEP" as SuggestedChangeType,
          field: c.field,
          from: null,
          to: null,
          reason: `Hard constraint ${c.type}(${c.field}) status unknown — verification needed.`,
        }));
        const result: TowerVerdict = {
          verdict: "CHANGE_PLAN",
          action: "change_plan",
          delivered: deliveredCount,
          requested: 0,
          gaps: hardUnknowns.map(() => "HARD_CONSTRAINT_UNKNOWN"),
          confidence: 60,
          rationale: `Results delivered but hard constraints have unknown status: ${unknownIds.join(", ")}. Verification needed.`,
          suggested_changes: suggestions,
          constraint_results: constraintResults,
        };
        console.log(`[TOWER] verdict=CHANGE_PLAN reason=no_count_requested_hard_unknown delivered=${deliveredCount}`);
        return { ...result, _debug: debugBlock };
      }
      const result: TowerVerdict = {
        verdict: "ACCEPT_WITH_UNVERIFIED",
        action: "continue",
        delivered: deliveredCount,
        requested: 0,
        gaps: hardUnknowns.map(() => "HARD_CONSTRAINT_UNKNOWN"),
        confidence: 60,
        rationale: `Results delivered but some hard constraints could not be verified: ${unknownIds.join(", ")}. Accepted as best-effort.`,
        suggested_changes: [],
        constraint_results: constraintResults,
      };
      console.log(`[TOWER] verdict=ACCEPT_WITH_UNVERIFIED reason=no_count_requested_hard_unknown_no_replans delivered=${deliveredCount}`);
      return { ...result, _debug: debugBlock };
    }

    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: 0,
      requested: 0,
      gaps: ["ZERO_DELIVERED"],
      confidence: 100,
      rationale: "No results were delivered.",
      suggested_changes: [],
      constraint_results: constraintResults,
      stop_reason: {
        code: "ZERO_DELIVERED",
        message: "No results were delivered despite no explicit count requirement.",
      },
    };
    console.log(`[TOWER] verdict=STOP reason=no_count_requested_zero_delivered`);
    return { ...result, _debug: debugBlock };
  }

  const effectiveRequestedCount = requestedCount as number;

  if (deliveredCount >= effectiveRequestedCount && effectiveRequestedCount > 0) {
    if (hardViolations.length > 0) {
      const violatedFields = hardViolations.map(
        (r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`
      );
      const gaps = [
        ...hardViolations.map(() => "HARD_CONSTRAINT_VIOLATED"),
        ...locationUnverifiedGaps,
        ...labelGaps,
      ];
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps,
        confidence: 95,
        rationale: `Count met (${deliveredCount}/${effectiveRequestedCount}) but hard constraints violated: ${violatedFields.join(", ")}. Results do not satisfy all stated requirements.`,
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "COUNT_MET_HARD_VIOLATED",
          message: `Count met but hard constraints violated: ${violatedFields.join(", ")}.`,
          evidence: { delivered: deliveredCount, requested: effectiveRequestedCount, violated_fields: violatedFields },
        },
      };
      console.log(`[TOWER] verdict=STOP reason=COUNT_MET_HARD_VIOLATED delivered=${deliveredCount} requested=${effectiveRequestedCount} violated=${violatedFields.join(",")}`);
      return result;
    } else if (hardUnknowns.length > 0) {
      const unknownIds = hardUnknowns.map(
        (c) => `${c.type}(${c.field}=${c.value})`
      );
      const gaps = [
        ...unknownIds.map(() => "HARD_CONSTRAINT_UNKNOWN"),
        ...locationUnverifiedGaps.map(() => "LOCATION_NOT_VERIFIABLE"),
        ...labelGaps.map(() => "LABEL_MISLEADING"),
      ];

      const suggestions: SuggestedChange[] = hardUnknowns.map((c) => {
        const cvlMatch = findCvlStatusForConstraint(c, cvlConstraintResults);
        const isUnverifiable = cvlMatch?.reason?.toLowerCase().includes("unverifiable");
        if (isUnverifiable) {
          return {
            type: "ADD_VERIFICATION_STEP" as SuggestedChangeType,
            field: c.field,
            from: null,
            to: null,
            reason: `Hard constraint ${c.type}(${c.field}) is unverifiable: ${cvlMatch?.reason ?? "unknown reason"}`,
          };
        }
        return {
          type: "ADD_VERIFICATION_STEP" as SuggestedChangeType,
          field: c.field,
          from: null,
          to: null,
          reason: `Hard constraint ${c.type}(${c.field}) status is unknown — verification needed.`,
        };
      });

      const anyUnverifiable = hardUnknowns.some((c) => {
        const cvlMatch = findCvlStatusForConstraint(c, cvlConstraintResults);
        return cvlMatch?.reason?.toLowerCase().includes("unverifiable");
      });

      if (process.env.DEBUG_TOWER_ATTR_TRACE === "true") {
        console.log(`[TOWER][ATTR_TRACE] === Verdict path for hardUnknowns ===`);
        console.log(`[TOWER][ATTR_TRACE] anyUnverifiable=${anyUnverifiable} canReplan=${canReplan(input)} hardUnknowns=${hardUnknowns.length}`);
        for (const c of hardUnknowns) {
          const match = findCvlStatusForConstraint(c, cvlConstraintResults);
          console.log(`[TOWER][ATTR_TRACE] unknownConstraint: type=${c.type} field=${c.field} value=${c.value} cvlMatch=${!!match} cvlReason=${match?.reason ?? "N/A"} unverifiable_flag=${match?.reason?.toLowerCase().includes("unverifiable") ?? false}`);
        }
      }

      if (anyUnverifiable && !canReplan(input)) {
        const result: TowerVerdict = {
          verdict: "STOP",
          action: "stop",
          delivered: deliveredCount,
          requested: effectiveRequestedCount,
          gaps: [...gaps, "HARD_CONSTRAINT_UNVERIFIABLE"],
          confidence: 70,
          rationale: `Count met (${deliveredCount}/${effectiveRequestedCount}) but hard constraints unverifiable with current tools: ${unknownIds.join(", ")}.`,
          suggested_changes: suggestions,
          constraint_results: constraintResults,
          stop_reason: {
            code: "HARD_CONSTRAINT_UNVERIFIABLE",
            message: `Count met but hard constraints unverifiable with current tools.`,
            evidence: { delivered: deliveredCount, requested: effectiveRequestedCount, unverifiable_constraints: unknownIds },
          },
        };
        console.log(`[TOWER] verdict=STOP reason=HARD_CONSTRAINT_UNVERIFIABLE`);
        return { ...result, _debug: debugBlock };
      }

      if (canReplan(input)) {
        const result: TowerVerdict = {
          verdict: "CHANGE_PLAN",
          action: "change_plan",
          delivered: deliveredCount,
          requested: effectiveRequestedCount,
          gaps,
          confidence: 60,
          rationale: `Count met (${deliveredCount}/${effectiveRequestedCount}) but hard constraints have unknown status: ${unknownIds.join(", ")}. Verification needed before accepting.`,
          suggested_changes: suggestions,
          constraint_results: constraintResults,
          stop_reason: {
            code: "HARD_CONSTRAINT_UNKNOWN",
            message: `Count met but hard constraints have unknown status. Verification needed before accepting.`,
            evidence: { delivered: deliveredCount, requested: effectiveRequestedCount, unknown_constraints: unknownIds },
          },
        };
        console.log(`[TOWER] verdict=CHANGE_PLAN reason=hard_constraint_unknown_needs_verification`);
        return { ...result, _debug: debugBlock };
      }

      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps: [...gaps, "NO_PROGRESS"],
        confidence: 70,
        rationale: `Count met (${deliveredCount}/${effectiveRequestedCount}) but hard constraints have unknown status and no replans remain: ${unknownIds.join(", ")}.`,
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "HARD_CONSTRAINT_UNKNOWN",
          message: `Count met but hard constraints have unknown status and no replans remain.`,
          evidence: { delivered: deliveredCount, requested: effectiveRequestedCount, unknown_constraints: unknownIds },
        },
      };
      console.log(`[TOWER] verdict=STOP reason=hard_unknown_no_replans`);
      return { ...result, _debug: debugBlock };
    } else {
      const ratio = deliveredCount / effectiveRequestedCount;
      const confidence = Math.min(95, Math.round(80 + (ratio - 1) * 15));

      const gaps = [...locationUnverifiedGaps, ...labelGaps];

      // PHASE_5: if any hard constraints are PLAUSIBLE (not VERIFIED), downgrade to ACCEPT_WITH_UNVERIFIED
      const hasPlausibleOnly = hardPlausible.length > 0 && hardUnsupported.length === 0 && hardContradicted.length === 0;
      if (hasPlausibleOnly) {
        const plausibleLabels = hardPlausible.map(
          (cr) => cr.constraint.label ?? `${cr.constraint.type}(${cr.constraint.field}=${cr.constraint.value})`
        );
        const result: TowerVerdict = {
          verdict: "ACCEPT_WITH_UNVERIFIED",
          action: "continue",
          delivered: deliveredCount,
          requested: effectiveRequestedCount,
          gaps: [...gaps, "HARD_CONSTRAINT_PLAUSIBLE"],
          confidence: Math.max(65, confidence - 15),
          rationale: `Count met (${deliveredCount}/${effectiveRequestedCount}). Hard constraints plausible but not fully verified: ${plausibleLabels.join(", ")}.`,
          suggested_changes: [],
          constraint_results: constraintResults,
        };
        console.log(`[TOWER] verdict=ACCEPT_WITH_UNVERIFIED reason=count_met_hard_plausible delivered=${deliveredCount} requested=${effectiveRequestedCount}`); // PHASE_5
        return { ...result, _debug: debugBlock };
      }

      const rationale = cvlPresent
        ? "The requested number of verified matches was delivered. All hard constraints satisfied."
        : "The requested number of exact matches was delivered.";
      const result: TowerVerdict = {
        verdict: "ACCEPT",
        action: "continue",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps,
        confidence: Math.max(80, confidence),
        rationale,
        suggested_changes: [],
        constraint_results: constraintResults,
      };
      console.log(
        `[TOWER] verdict=ACCEPT delivered=${deliveredCount} requested=${effectiveRequestedCount} cvl=${cvlPresent}`
      );
      return { ...result, _debug: debugBlock };
    }
  }

  if (hardViolations.length > 0) {
    const onlyCountMinViolations = hardViolations.every((r) => r.constraint.type === "COUNT_MIN");
    if (onlyCountMinViolations && deliveredCount > 0 && deliveredCount < effectiveRequestedCount) {
      const honestPartialEarly = detectHonestPartial(
        input,
        deliveredCount,
        effectiveRequestedCount,
        constraintResults,
        hardViolations,
        hardUnknowns,
      );
      if (honestPartialEarly.detected && !canReplan(input)) {
        const honestGaps = ["HONEST_SHORTFALL", ...locationUnverifiedGaps, ...labelGaps];
        const result: TowerVerdict = {
          verdict: "ACCEPT_WITH_UNVERIFIED",
          action: "continue",
          delivered: honestPartialEarly.verifiedExactCount,
          requested: effectiveRequestedCount,
          gaps: honestGaps,
          confidence: Math.round(40 + (honestPartialEarly.verifiedExactCount / effectiveRequestedCount) * 50),
          rationale: `Honest partial result: ${honestPartialEarly.verifiedExactCount} of ${effectiveRequestedCount} requested leads are verified with evidence. ` +
            `Shortfall of ${effectiveRequestedCount - honestPartialEarly.verifiedExactCount} could not be filled with verified results. ` +
            `Unverified candidates were not promoted to exact.`,
          suggested_changes: [],
          constraint_results: constraintResults,
          stop_reason: {
            code: "HONEST_SHORTFALL",
            message: `${honestPartialEarly.verifiedExactCount} of ${effectiveRequestedCount} leads verified with evidence. Shortfall is genuine — weak/unverified candidates were not promoted.`,
            evidence: {
              verified_exact_count: honestPartialEarly.verifiedExactCount,
              requested: effectiveRequestedCount,
              shortfall: effectiveRequestedCount - honestPartialEarly.verifiedExactCount,
              delivery_summary: input.delivery_summary ?? null,
              hard_evidence_constraints_passed: honestPartialEarly.hardEvidenceConstraintsPassed,
            },
          },
        };
        console.log(
          `[TOWER] verdict=ACCEPT_WITH_UNVERIFIED reason=HONEST_SHORTFALL verified_exact=${honestPartialEarly.verifiedExactCount} ` +
          `requested=${effectiveRequestedCount} delivery_summary=${input.delivery_summary ?? "none"}`
        );
        return { ...result, _debug: debugBlock };
      }
      if (honestPartialEarly.detected && canReplan(input)) {
        const honestGaps = ["HONEST_SHORTFALL", ...locationUnverifiedGaps, ...labelGaps];
        let suggestions = buildSuggestions(input, constraints, constraintResults, deliveredCount, effectiveRequestedCount);
        if (suggestions.length === 0 && isLocationExpandable(constraints, input)) {
          const fallback = buildFallbackExpandArea(input, deliveredCount, effectiveRequestedCount);
          if (fallback) suggestions = [fallback];
        }
        const result: TowerVerdict = {
          verdict: "CHANGE_PLAN",
          action: "change_plan",
          delivered: honestPartialEarly.verifiedExactCount,
          requested: effectiveRequestedCount,
          gaps: honestGaps,
          confidence: Math.round(40 + (honestPartialEarly.verifiedExactCount / effectiveRequestedCount) * 40),
          rationale: `Honest partial result: ${honestPartialEarly.verifiedExactCount} of ${effectiveRequestedCount} requested leads are verified with evidence. ` +
            `Replanning to find ${effectiveRequestedCount - honestPartialEarly.verifiedExactCount} more verified leads.`,
          suggested_changes: suggestions,
          constraint_results: constraintResults,
          stop_reason: {
            code: "HONEST_SHORTFALL",
            message: `${honestPartialEarly.verifiedExactCount} verified, ${effectiveRequestedCount - honestPartialEarly.verifiedExactCount} still needed. Replanning.`,
            evidence: {
              verified_exact_count: honestPartialEarly.verifiedExactCount,
              requested: effectiveRequestedCount,
              shortfall: effectiveRequestedCount - honestPartialEarly.verifiedExactCount,
              delivery_summary: input.delivery_summary ?? null,
              hard_evidence_constraints_passed: honestPartialEarly.hardEvidenceConstraintsPassed,
            },
          },
        };
        console.log(
          `[TOWER] verdict=CHANGE_PLAN reason=HONEST_SHORTFALL verified_exact=${honestPartialEarly.verifiedExactCount} ` +
          `requested=${effectiveRequestedCount} delivery_summary=${input.delivery_summary ?? "none"}`
        );
        return { ...result, _debug: debugBlock };
      }
    }

    const allHard = constraints.filter((c) => c.hardness === "hard");
    const allHardViolated =
      allHard.length > 0 &&
      hardViolations.length === allHard.length &&
      deliveredCount === 0;

    if (allHardViolated && !canReplan(input)) {
      const violatedFields = hardViolations.map((r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`);
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps: [
          ...hardViolations.map(() => "HARD_CONSTRAINT_VIOLATED"),
          ...labelGaps,
        ],
        confidence: 100,
        rationale: `No exact matches were found. Hard constraint impossible: ${violatedFields.join(", ")} — 0 of ${leads.length} leads meet all stated requirements.`,
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "HARD_CONSTRAINT_VIOLATED",
          message: `No exact matches found. Hard constraints violated and no replans remain.`,
          evidence: { violated_fields: violatedFields, delivered: deliveredCount, leads_count: leads.length },
        },
      };
      console.log(`[TOWER] verdict=STOP reason=hard_constraint_impossible`);
      return { ...result, _debug: debugBlock };
    }

    if (allHardViolated) {
      const violatedFields = hardViolations.map((r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`);
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps: [
          ...hardViolations.map(() => "HARD_CONSTRAINT_VIOLATED"),
          ...labelGaps,
        ],
        confidence: 100,
        rationale: `No exact matches were found. Hard constraint impossible: ${violatedFields.join(", ")} — 0 of ${leads.length} leads meet all stated requirements.`,
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "HARD_CONSTRAINT_VIOLATED",
          message: `No exact matches found. All hard constraints violated.`,
          evidence: { violated_fields: violatedFields, delivered: deliveredCount, leads_count: leads.length },
        },
      };
      console.log(`[TOWER] verdict=STOP reason=hard_constraint_impossible`);
      return { ...result, _debug: debugBlock };
    }

    const gaps = [
      ...hardViolations.map(() => "HARD_CONSTRAINT_VIOLATED"),
      ...labelGaps,
    ];
    if (deliveredCount < effectiveRequestedCount) {
      gaps.push("INSUFFICIENT_COUNT");
    }

    let softChanges = buildSuggestions(input, constraints, constraintResults, deliveredCount, effectiveRequestedCount);

    if (canReplan(input) && softChanges.length === 0 && isLocationExpandable(constraints, input)) {
      const fallback = buildFallbackExpandArea(input, deliveredCount, effectiveRequestedCount);
      if (fallback) softChanges = [fallback];
    }

    if (canReplan(input) && softChanges.length > 0) {
      const violatedFields = hardViolations.map((r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`);
      const result: TowerVerdict = {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps,
        confidence: Math.round(
          30 + (deliveredCount / Math.max(effectiveRequestedCount, 1)) * 40
        ),
        rationale: deliveredCount > 0
          ? `Only ${deliveredCount} exact matches were found. Remaining results do not meet all stated requirements.`
          : leads.length > 0
            ? "No exact matches were found. Closest alternatives were identified after relaxing soft constraints."
            : "No results were found that meet the stated requirements.",
        suggested_changes: softChanges,
        constraint_results: constraintResults,
        stop_reason: {
          code: "HARD_CONSTRAINT_VIOLATED",
          message: `Hard constraints violated. Suggestions available for replanning.`,
          evidence: { violated_fields: violatedFields, delivered: deliveredCount, requested: effectiveRequestedCount },
        },
      };
      console.log(
        `[TOWER] verdict=CHANGE_PLAN reason=hard_violated_suggestions_available`
      );
      return { ...result, _debug: debugBlock };
    }

    const violatedFields = hardViolations.map((r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`);
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: effectiveRequestedCount,
      gaps: [...gaps, "NO_PROGRESS"],
      confidence: 95,
      rationale: deliveredCount > 0
        ? `Only ${deliveredCount} exact matches were found. Remaining results do not meet all stated requirements. Hard constraint impossible: ${violatedFields.join(", ")}.`
        : `No exact matches were found. Hard constraint impossible: ${violatedFields.join(", ")} — 0 of ${leads.length} leads meet all stated requirements.`,
      suggested_changes: [],
      constraint_results: constraintResults,
      stop_reason: {
        code: "HARD_CONSTRAINT_VIOLATED",
        message: `Hard constraints violated with no suggestions or replans available.`,
        evidence: { violated_fields: violatedFields, delivered: deliveredCount, leads_count: leads.length },
      },
    };
    console.log(`[TOWER] verdict=STOP reason=hard_constraint_impossible`);
    return { ...result, _debug: debugBlock };
  }

  if (deliveredCount < effectiveRequestedCount && effectiveRequestedCount > 0) {
    const gaps: string[] = ["INSUFFICIENT_COUNT", ...locationUnverifiedGaps, ...labelGaps];

    const isHonestPartial = detectHonestPartial(
      input,
      deliveredCount,
      effectiveRequestedCount,
      constraintResults,
      hardViolations,
      hardUnknowns,
    );

    if (isHonestPartial.detected && !canReplan(input)) {
      const honestGaps = ["HONEST_SHORTFALL", ...locationUnverifiedGaps, ...labelGaps];
      const result: TowerVerdict = {
        verdict: "ACCEPT_WITH_UNVERIFIED",
        action: "continue",
        delivered: isHonestPartial.verifiedExactCount,
        requested: effectiveRequestedCount,
        gaps: honestGaps,
        confidence: Math.round(40 + (isHonestPartial.verifiedExactCount / effectiveRequestedCount) * 50),
        rationale: `Honest partial result: ${isHonestPartial.verifiedExactCount} of ${effectiveRequestedCount} requested leads are verified with evidence. ` +
          `Shortfall of ${effectiveRequestedCount - isHonestPartial.verifiedExactCount} could not be filled with verified results. ` +
          `Unverified candidates were not promoted to exact.`,
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "HONEST_SHORTFALL",
          message: `${isHonestPartial.verifiedExactCount} of ${effectiveRequestedCount} leads verified with evidence. Shortfall is genuine — weak/unverified candidates were not promoted.`,
          evidence: {
            verified_exact_count: isHonestPartial.verifiedExactCount,
            requested: effectiveRequestedCount,
            shortfall: effectiveRequestedCount - isHonestPartial.verifiedExactCount,
            delivery_summary: input.delivery_summary ?? null,
            hard_evidence_constraints_passed: isHonestPartial.hardEvidenceConstraintsPassed,
          },
        },
      };
      console.log(
        `[TOWER] verdict=ACCEPT_WITH_UNVERIFIED reason=HONEST_SHORTFALL verified_exact=${isHonestPartial.verifiedExactCount} ` +
        `requested=${effectiveRequestedCount} delivery_summary=${input.delivery_summary ?? "none"}`
      );
      return { ...result, _debug: debugBlock };
    }

    if (isHonestPartial.detected && canReplan(input)) {
      const honestGaps = ["HONEST_SHORTFALL", ...locationUnverifiedGaps, ...labelGaps];
      let suggestions = buildSuggestions(input, constraints, constraintResults, deliveredCount, effectiveRequestedCount);
      if (suggestions.length === 0 && isLocationExpandable(constraints, input)) {
        const fallback = buildFallbackExpandArea(input, deliveredCount, effectiveRequestedCount);
        if (fallback) suggestions = [fallback];
      }
      const result: TowerVerdict = {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        delivered: isHonestPartial.verifiedExactCount,
        requested: effectiveRequestedCount,
        gaps: honestGaps,
        confidence: Math.round(40 + (isHonestPartial.verifiedExactCount / effectiveRequestedCount) * 40),
        rationale: `Honest partial result: ${isHonestPartial.verifiedExactCount} of ${effectiveRequestedCount} requested leads are verified with evidence. ` +
          `Replanning to find ${effectiveRequestedCount - isHonestPartial.verifiedExactCount} more verified leads.`,
        suggested_changes: suggestions,
        constraint_results: constraintResults,
        stop_reason: {
          code: "HONEST_SHORTFALL",
          message: `${isHonestPartial.verifiedExactCount} verified, ${effectiveRequestedCount - isHonestPartial.verifiedExactCount} still needed. Replanning.`,
          evidence: {
            verified_exact_count: isHonestPartial.verifiedExactCount,
            requested: effectiveRequestedCount,
            shortfall: effectiveRequestedCount - isHonestPartial.verifiedExactCount,
            delivery_summary: input.delivery_summary ?? null,
            hard_evidence_constraints_passed: isHonestPartial.hardEvidenceConstraintsPassed,
          },
        },
      };
      console.log(
        `[TOWER] verdict=CHANGE_PLAN reason=HONEST_SHORTFALL verified_exact=${isHonestPartial.verifiedExactCount} ` +
        `requested=${effectiveRequestedCount} delivery_summary=${input.delivery_summary ?? "none"}`
      );
      return { ...result, _debug: debugBlock };
    }

    let suggestions = buildSuggestions(input, constraints, constraintResults, deliveredCount, effectiveRequestedCount);

    if (canReplan(input) && suggestions.length === 0 && isLocationExpandable(constraints, input)) {
      const fallback = buildFallbackExpandArea(input, deliveredCount, effectiveRequestedCount);
      if (fallback) suggestions = [fallback];
    }

    if (canReplan(input) && suggestions.length > 0) {
      const result: TowerVerdict = {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps,
        confidence:
          deliveredCount === 0
            ? 95
            : Math.round(50 + (deliveredCount / effectiveRequestedCount) * 30),
        rationale: deliveredCount > 0
          ? `Only ${deliveredCount} exact matches were found. Remaining results do not meet all stated requirements.`
          : leads.length > 0
            ? "No exact matches were found. Closest alternatives were identified after relaxing soft constraints."
            : "No results were found that meet the stated requirements.",
        suggested_changes: suggestions,
        constraint_results: constraintResults,
        stop_reason: {
          code: "INSUFFICIENT_COUNT",
          message: `Insufficient matches found. Suggestions available for replanning.`,
          evidence: { delivered: deliveredCount, requested: effectiveRequestedCount, leads_count: leads.length },
        },
      };
      console.log(
        `[TOWER] verdict=CHANGE_PLAN delivered=${deliveredCount} requested=${effectiveRequestedCount}`
      );
      return { ...result, _debug: debugBlock };
    }

    if (!canReplan(input)) {
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: effectiveRequestedCount,
        gaps: [...gaps, "MAX_REPLANS_EXHAUSTED"],
        confidence: 90,
        rationale: deliveredCount > 0
          ? `Only ${deliveredCount} exact matches were found. Remaining results do not meet all stated requirements.`
          : leads.length > 0
            ? "No exact matches were found. Closest alternatives were identified after relaxing soft constraints."
            : "No results were found that meet the stated requirements.",
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "MAX_REPLANS_EXHAUSTED",
          message: `Insufficient matches and no replans remain.`,
          evidence: { delivered: deliveredCount, requested: effectiveRequestedCount, leads_count: leads.length },
        },
      };
      console.log(
        `[TOWER] verdict=STOP delivered=${deliveredCount} requested=${effectiveRequestedCount} reason=max_replans_exhausted`
      );
      return { ...result, _debug: debugBlock };
    }

    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: effectiveRequestedCount,
      gaps: [...gaps, "NO_PROGRESS"],
      confidence: 90,
      rationale: deliveredCount > 0
        ? `Only ${deliveredCount} exact matches were found. Remaining results do not meet all stated requirements.`
        : leads.length > 0
          ? "No exact matches were found. Closest alternatives were identified after relaxing soft constraints."
          : "No results were found that meet the stated requirements.",
      suggested_changes: [],
      constraint_results: constraintResults,
      stop_reason: {
        code: "INSUFFICIENT_COUNT",
        message: `Insufficient matches and no suggestions available.`,
        evidence: { delivered: deliveredCount, requested: effectiveRequestedCount, leads_count: leads.length },
      },
    };
    console.log(
      `[TOWER] verdict=STOP delivered=${deliveredCount} requested=${effectiveRequestedCount} reason=no_suggestions_location_not_expandable`
    );
    return { ...result, _debug: debugBlock };
  }

  console.log(
    `[TOWER] fallback_guard: delivered=${deliveredCount}(${typeof deliveredCount}) requested=${effectiveRequestedCount}(${typeof effectiveRequestedCount}) ` +
    `leads=${leads.length} hardViolations=${hardViolations.length} hardUnknowns=${hardUnknowns.length} ` +
    `constraints=${constraints.length} constraint_results=${constraintResults.length} source=${debugBlock.source}`
  );

  const numericDelivered = isFiniteNumber(deliveredCount) ? deliveredCount : 0;
  const numericRequested = isFiniteNumber(effectiveRequestedCount) ? effectiveRequestedCount : 0;

  if (numericDelivered >= numericRequested && hardViolations.length === 0 && hardUnknowns.length === 0) {
    // PHASE_5: check for PLAUSIBLE in fallback path
    const hasPlausibleOnly = hardPlausible.length > 0 && hardUnsupported.length === 0 && hardContradicted.length === 0;
    if (hasPlausibleOnly) {
      const plausibleLabels = hardPlausible.map(
        (cr) => cr.constraint.label ?? `${cr.constraint.type}(${cr.constraint.field}=${cr.constraint.value})`
      );
      const result: TowerVerdict = {
        verdict: "ACCEPT_WITH_UNVERIFIED",
        action: "continue",
        delivered: numericDelivered,
        requested: numericRequested,
        gaps: [...labelGaps, "HARD_CONSTRAINT_PLAUSIBLE"],
        confidence: 65,
        rationale: `Delivered ${numericDelivered} of ${numericRequested} requested. Hard constraints plausible but not fully verified: ${plausibleLabels.join(", ")}.`,
        suggested_changes: [],
        constraint_results: constraintResults,
      };
      console.log(`[TOWER] verdict=ACCEPT_WITH_UNVERIFIED reason=fallback_hard_plausible delivered=${numericDelivered} requested=${numericRequested}`); // PHASE_5
      return { ...result, _debug: debugBlock };
    }
    const result: TowerVerdict = {
      verdict: "ACCEPT",
      action: "continue",
      delivered: numericDelivered,
      requested: numericRequested,
      gaps: [...labelGaps],
      confidence: 80,
      rationale: `Delivered ${numericDelivered} of ${numericRequested} requested. Count met.`,
      suggested_changes: [],
      constraint_results: constraintResults,
    };
    console.log(`[TOWER] verdict=ACCEPT reason=fallback_count_met delivered=${numericDelivered} requested=${numericRequested} leads=${leads.length}`);
    return { ...result, _debug: debugBlock };
  }

  const result: TowerVerdict = {
    verdict: "STOP",
    action: "stop",
    delivered: numericDelivered,
    requested: numericRequested,
    gaps: ["INTERNAL_ERROR", ...labelGaps],
    confidence: 100,
    rationale: `Unexpected state in verdict evaluation: delivered=${numericDelivered}, requested=${numericRequested}, leads=${leads.length}, hardViolations=${hardViolations.length}, hardUnknowns=${hardUnknowns.length}, constraints=${constraints.length}. _debug: source=${debugBlock.source}.`,
    suggested_changes: [],
    stop_reason: {
      code: "INTERNAL_ERROR",
      message: `Unexpected state reached in verdict evaluation.`,
      evidence: {
        delivered: numericDelivered,
        requested: numericRequested,
        leads_count: leads.length,
        hard_violations_count: hardViolations.length,
        hard_unknowns_count: hardUnknowns.length,
        constraints_count: constraints.length,
        _debug: debugBlock,
      },
    },
  };
  console.log(`[TOWER] verdict=STOP reason=invalid_state delivered=${numericDelivered} requested=${numericRequested} leads=${leads.length} hardViolations=${hardViolations.length} hardUnknowns=${hardUnknowns.length} source=${debugBlock.source}`);
  return { ...result, _debug: debugBlock };
}

export interface AskLeadQuestionInput {
  confidence: number;
  evidence_items?: Array<{
    source: string;
    url?: string;
    is_official?: boolean;
    domain?: string;
    [key: string]: unknown;
  }>;
  step_status?: string;
  attribute_type?: "hard" | "soft";
  capability_says_unverifiable?: boolean;
  evidence_sufficient?: boolean;
  [key: string]: unknown;
}

export interface AskLeadQuestionVerdict {
  towerVerdict: "ACCEPT" | "CHANGE_PLAN" | "STOP";
  action: "continue" | "stop" | "retry" | "change_plan";
  reason: string;
  confidence: number;
  gaps: string[];
  stop_reason?: StopReason;
  suggested_changes: SuggestedChange[];
  metrics: Record<string, unknown>;
}

function isVerified(evidenceItems: AskLeadQuestionInput["evidence_items"]): boolean {
  if (!evidenceItems || evidenceItems.length === 0) return false;
  const hasOfficialSite = evidenceItems.some((e) => e.is_official === true);
  if (hasOfficialSite) return true;
  const independentDomains = new Set(
    evidenceItems.map((e) => e.domain ?? e.source).filter(Boolean)
  );
  return independentDomains.size >= 2;
}

export function judgeAskLeadQuestion(input: AskLeadQuestionInput): AskLeadQuestionVerdict {
  const confidence = input.confidence;
  const evidenceItems = Array.isArray(input.evidence_items) ? input.evidence_items : [];
  const attributeType = input.attribute_type;
  const capabilityUnverifiable = input.capability_says_unverifiable === true;
  const evidenceSufficient = input.evidence_sufficient !== false;

  const baseMetrics: Record<string, unknown> = {
    confidence,
    evidence_count: evidenceItems.length,
    attribute_type: attributeType ?? null,
    capability_says_unverifiable: capabilityUnverifiable,
  };

  if (confidence === 1.0) {
    console.log(`[TOWER] ASK_LEAD_QUESTION verdict=STOP reason=invalid_confidence confidence=${confidence}`);
    return {
      towerVerdict: "STOP",
      action: "stop",
      reason: "invalid_confidence",
      confidence,
      gaps: ["INVALID_CONFIDENCE"],
      stop_reason: {
        code: "INVALID_CONFIDENCE",
        message: "Confidence of 1.0 is not permitted. No real-world answer can be perfectly certain.",
        detail: "Cap confidence below 1.0 and provide supporting evidence.",
        evidence: { confidence },
      },
      suggested_changes: [],
      metrics: baseMetrics,
    };
  }

  if (attributeType === "hard" && (capabilityUnverifiable || !evidenceSufficient)) {
    console.log(`[TOWER] ASK_LEAD_QUESTION verdict=STOP reason=UNVERIFIABLE_HARD_CONSTRAINT attribute_type=hard`);
    return {
      towerVerdict: "STOP",
      action: "stop",
      reason: "unverifiable_hard_constraint",
      confidence,
      gaps: ["UNVERIFIABLE_HARD_CONSTRAINT"],
      stop_reason: {
        code: "UNVERIFIABLE_HARD_CONSTRAINT",
        message: "Hard attribute is unverifiable — capability says unverifiable or evidence insufficient.",
        detail: capabilityUnverifiable
          ? "The capability reported this attribute as unverifiable with current tools."
          : "Evidence is insufficient to verify this hard attribute.",
        evidence: { confidence, attribute_type: attributeType, capability_says_unverifiable: capabilityUnverifiable, evidence_sufficient: evidenceSufficient },
      },
      suggested_changes: [],
      metrics: { ...baseMetrics, verified: false },
    };
  }

  if (attributeType === "soft" && (capabilityUnverifiable || !evidenceSufficient)) {
    const reasonFlags: string[] = [];
    if (capabilityUnverifiable) reasonFlags.push("CAPABILITY_UNVERIFIABLE");
    if (!evidenceSufficient) reasonFlags.push("EVIDENCE_INSUFFICIENT");

    console.log(`[TOWER] ASK_LEAD_QUESTION verdict=ACCEPT reason=soft_unverifiable_accepted attribute_type=soft flags=${reasonFlags.join(",")}`);
    return {
      towerVerdict: "ACCEPT",
      action: "continue",
      reason: "soft_unverifiable_accepted",
      confidence,
      gaps: reasonFlags,
      suggested_changes: [],
      metrics: {
        ...baseMetrics,
        verified: false,
        reason_flags: reasonFlags,
        disclosure: "Soft attribute could not be fully verified; unknowns disclosed for delivery_summary.",
      },
    };
  }

  if (confidence > 0.85) {
    const independentDomains = new Set(
      evidenceItems.map((e) => e.domain ?? e.source).filter(Boolean)
    );
    const independentCount = independentDomains.size;
    const hasOfficialSite = evidenceItems.some((e) => e.is_official === true);
    const verified = isVerified(evidenceItems);

    if (!verified) {
      const missingParts: string[] = [];
      if (independentCount < 2) missingParts.push(`only ${independentCount} independent domain(s)`);
      if (!hasOfficialSite) missingParts.push("no official site evidence");

      const suggestedChanges: SuggestedChange[] = [];
      if (!hasOfficialSite) {
        suggestedChanges.push({
          type: "ADD_VERIFICATION_STEP",
          field: "evidence",
          from: null,
          to: null,
          reason: "Visit the official site for the entity to obtain first-party evidence.",
        });
      }
      if (independentCount < 2) {
        suggestedChanges.push({
          type: "ADD_VERIFICATION_STEP",
          field: "evidence",
          from: independentCount,
          to: 2,
          reason: "Add a second independent source (different domain) to corroborate the answer.",
        });
      }

      console.log(`[TOWER] ASK_LEAD_QUESTION verdict=CHANGE_PLAN reason=overconfident_without_support confidence=${confidence} independent=${independentCount} official=${hasOfficialSite}`);
      return {
        towerVerdict: "CHANGE_PLAN",
        action: "retry",
        reason: "overconfident_without_support",
        confidence,
        gaps: ["OVERCONFIDENT_WITHOUT_SUPPORT"],
        stop_reason: {
          code: "OVERCONFIDENT_WITHOUT_SUPPORT",
          message: `Confidence ${confidence} exceeds 0.85 but evidence is insufficient: ${missingParts.join("; ")}. Verified means official site evidence OR 2+ independent domains corroborate.`,
          detail: `Supervisor should: ${suggestedChanges.map(s => s.reason).join("; ")}`,
          evidence: { confidence, independent_count: independentCount, has_official_site: hasOfficialSite, verified },
        },
        suggested_changes: suggestedChanges,
        metrics: { ...baseMetrics, independent_count: independentCount, has_official_site: hasOfficialSite, verified },
      };
    }
  }

  console.log(`[TOWER] ASK_LEAD_QUESTION verdict=ACCEPT confidence=${confidence} evidence_count=${evidenceItems.length}`);
  return {
    towerVerdict: "ACCEPT",
    action: "continue",
    reason: "evidence_sufficient",
    confidence,
    gaps: [],
    suggested_changes: [],
    metrics: { ...baseMetrics, verified: isVerified(evidenceItems) },
  };
}

const MAX_RADIUS_KM = 50;

function isLocationExpandable(constraints: Constraint[], input: TowerVerdictInput): boolean {
  const locationHard = constraints.some(
    (c) => c.type === "LOCATION" && c.hardness === "hard"
  );
  if (locationHard) return false;

  const meta = getMeta(input);
  const currentRadius = meta.radius_km ?? 5;
  if (currentRadius >= MAX_RADIUS_KM) return false;

  return true;
}

function buildFallbackExpandArea(input: TowerVerdictInput, deliveredCount: number, requestedCount: number): SuggestedChange | null {
  const meta = getMeta(input);
  const currentRadius = meta.radius_km ?? 5;
  if (currentRadius >= MAX_RADIUS_KM) return null;

  return {
    type: "EXPAND_AREA",
    field: "radius_km",
    from: currentRadius,
    to: Math.min(currentRadius * 2, MAX_RADIUS_KM),
    reason: `Insufficient matches (${deliveredCount} of ${requestedCount}). Expanding search area because location is soft and replans remain.`,
  };
}

function buildSuggestions(
  input: TowerVerdictInput,
  constraints: Constraint[],
  constraintResults: ConstraintResult[],
  deliveredCount: number,
  requestedCount: number
): SuggestedChange[] {
  const changes: SuggestedChange[] = [];
  const meta = getMeta(input);
  const canRelaxSoft = allowRelaxSoft(input);

  const softConstraints = constraints.filter((c) => c.hardness === "soft");
  const hardConstraints = constraints.filter((c) => c.hardness === "hard");

  const locationSoft = softConstraints.filter((c) => c.type === "LOCATION");
  const nameSoft = softConstraints.filter(
    (c) => c.type === "NAME_CONTAINS" || c.type === "NAME_STARTS_WITH"
  );

  const hasHardNameConstraints = hardConstraints.some(
    (c) => c.type === "NAME_CONTAINS" || c.type === "NAME_STARTS_WITH"
  );

  if (deliveredCount < requestedCount) {
    const currentRadius = meta.radius_km ?? 5;
    const canExpandRadius = currentRadius < MAX_RADIUS_KM;

    if (locationSoft.length > 0 && canRelaxSoft && canExpandRadius) {
      for (const lc of locationSoft) {
        changes.push({
          type: "EXPAND_AREA",
          field: "radius_km",
          from: currentRadius,
          to: Math.min(currentRadius * 2, MAX_RADIUS_KM),
          reason: `Insufficient matches (${deliveredCount} of ${requestedCount}). Expanding search area.`,
        });
      }
    } else if (hasHardNameConstraints && canExpandRadius) {
      changes.push({
        type: "EXPAND_AREA",
        field: "radius_km",
        from: currentRadius,
        to: Math.min(currentRadius * 2, MAX_RADIUS_KM),
        reason: `Hard name constraint limits results. Expanding area instead of relaxing name filter.`,
      });
    }

    if (nameSoft.length > 0 && canRelaxSoft) {
      for (const nc of nameSoft) {
        const result = constraintResults.find(
          (r) => r.constraint === nc
        );
        changes.push({
          type: "RELAX_CONSTRAINT",
          field: nc.type === "NAME_STARTS_WITH" ? "prefix_filter" : "name_contains",
          from: String(nc.value),
          to: null,
          reason: `${nc.type} "${nc.value}" matched ${result?.matched_count ?? 0} of ${result?.total_leads ?? 0} leads`,
        });
      }
    }
  }

  const seen = new Set<string>();
  return changes.filter((c) => {
    const key = `${c.type}:${c.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
