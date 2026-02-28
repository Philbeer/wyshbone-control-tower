import { judgeEvidenceQuality } from "./evidenceQualityJudge";

export type TowerVerdictAction = "ACCEPT" | "CHANGE_PLAN" | "STOP";

export type ConstraintType =
  | "NAME_CONTAINS"
  | "NAME_STARTS_WITH"
  | "LOCATION"
  | "COUNT_MIN"
  | "HAS_ATTRIBUTE";

export interface Constraint {
  type: ConstraintType;
  field: string;
  value: string | number;
  hardness: "hard" | "soft";
}

export interface Lead {
  name: string;
  address?: string;
  [key: string]: unknown;
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

export type CvlConstraintStatus = "yes" | "no" | "unknown";

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
  verdict: CvlConstraintStatus;
  confidence: number;
  evidence_id?: string;
  source_url?: string;
  quote?: string;
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

  delivery_summary?: "PASS" | "PARTIAL" | "STOP" | string;

  requires_relationship_evidence?: boolean;
  verified_relationship_count?: number;
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
}

export interface AttemptHistoryEntry {
  plan_version: number;
  radius_km: number;
  delivered_count: number;
}

function resolveRequestedCount(input: TowerVerdictInput): number | null {
  if (input.requested_count_user != null) return input.requested_count_user;
  if (input.success_criteria?.requested_count_user != null)
    return input.success_criteria.requested_count_user;
  if (input.success_criteria?.target_count != null)
    return input.success_criteria.target_count;
  if (input.requested_count != null) return input.requested_count;
  return null;
}

function resolveLeads(input: TowerVerdictInput): Lead[] {
  if (Array.isArray(input.leads)) {
    return input.leads.filter(
      (l): l is Lead =>
        l != null && typeof l === "object" && typeof (l as any).name === "string"
    );
  }
  return [];
}

function hasCvl(input: TowerVerdictInput): boolean {
  return input.verification_summary != null &&
    typeof input.verification_summary.verified_exact_count === "number";
}

function resolveDeliveredCount(input: TowerVerdictInput, matchedLeadCount: number | null): number {
  if (hasCvl(input)) {
    return input.verification_summary!.verified_exact_count;
  }

  const delivered = input.delivered;
  if (typeof delivered === "object" && delivered != null) {
    if (delivered.delivered_matching_accumulated != null)
      return delivered.delivered_matching_accumulated;
  }

  if (matchedLeadCount != null && matchedLeadCount > 0) return matchedLeadCount;

  if (typeof delivered === "object" && delivered != null) {
    if (delivered.delivered_matching_this_plan != null)
      return delivered.delivered_matching_this_plan;
  }

  if (typeof delivered === "number") return delivered;
  if (input.accumulated_count != null) return input.accumulated_count;
  if (input.delivered_count != null) return input.delivered_count;
  return 0;
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

      if (cvlMatch && cvlMatch.status !== "unknown") {
        if (ATTR_TRACE) {
          console.log(`[TOWER][ATTR_TRACE] DECISION: using cvlMatch directly → status=${cvlMatch.status} passed=${cvlMatch.status === "yes"}`);
        }
        return {
          constraint,
          matched_count: cvlMatch.status === "yes" ? total : 0,
          total_leads: total,
          passed: cvlMatch.status === "yes",
          status: cvlMatch.status,
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

        for (const lead of leads) {
          const leadPlaceId = (lead as any).place_id ?? (lead as any).placeId;
          const result = findAttributeEvidence(lead.name, attrName, attributeEvidence, leadPlaceId);
          if (ATTR_TRACE) {
            const ev = result?.match;
            console.log(`[TOWER][ATTR_TRACE] findAttributeEvidence(lead="${lead.name}", placeId="${leadPlaceId ?? "none"}", attr="${attrName}", attr_norm="${normalizeAttributeKey(attrName)}") → ${result ? `found via ${result.matchedBy}: verdict=${ev!.verdict} evidence_id=${ev!.evidence_id ?? "none"} quote=${(ev!.quote ?? "none").substring(0, 80)}` : "NOT FOUND"}`);
          }
          if (result) {
            const ev = result.match;
            if (ev.verdict === "yes") {
              hasYes = true;
              evidencePointers.push({
                lead: lead.name,
                evidence_id: ev.evidence_id,
                source_url: ev.source_url,
                quote: ev.quote,
              });
            } else if (ev.verdict === "no") {
              hasNo = true;
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

        const firstEvidence = evidencePointers[0];
        if (ATTR_TRACE) {
          console.log(`[TOWER][ATTR_TRACE] DECISION: from attributeEvidence → status=${resolvedStatus} hasYes=${hasYes} hasNo=${hasNo} hasUnknown=${hasUnknown} evidencePointers=${evidencePointers.length}`);
          const topExcerpts = evidencePointers.slice(0, 2).map(ep => `lead="${ep.lead}" quote="${(ep.quote ?? "none").substring(0, 100)}"`);
          console.log(`[TOWER][ATTR_TRACE] top_evidence: ${topExcerpts.length > 0 ? topExcerpts.join(" | ") : "none found"}`);
        }
        return {
          constraint,
          matched_count: evidencePointers.length,
          total_leads: total,
          passed: resolvedStatus === "yes",
          status: resolvedStatus,
          evidence_id: firstEvidence?.evidence_id,
          source_url: firstEvidence?.source_url,
          quote: firstEvidence?.quote,
          attribute_evidence_details: evidencePointers.length > 0 ? evidencePointers : undefined,
        };
      }

      if (ATTR_TRACE) {
        console.log(`[TOWER][ATTR_TRACE] DECISION: no cvlMatch, no attributeEvidence → status=unknown passed=false`);
        console.log(`[TOWER][ATTR_TRACE] field_paths_checked: input.verification_summary.constraint_results (for cvlMatch), input.attribute_evidence (for per-lead evidence)`);
      }
      return {
        constraint,
        matched_count: 0,
        total_leads: total,
        passed: false,
        status: "unknown",
      };
    }

    case "NAME_CONTAINS": {
      if (cvlMatch) {
        return {
          constraint,
          matched_count: cvlMatch.status === "yes" ? total : 0,
          total_leads: total,
          passed: cvlMatch.status === "yes",
        };
      }
      const word = String(constraint.value).toLowerCase();
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
      const matched = leads.filter((l) => regex.test(l.name));
      return {
        constraint,
        matched_count: matched.length,
        total_leads: total,
        passed: matched.length > 0,
      };
    }

    case "NAME_STARTS_WITH": {
      if (cvlMatch) {
        return {
          constraint,
          matched_count: cvlMatch.status === "yes" ? total : 0,
          total_leads: total,
          passed: cvlMatch.status === "yes",
        };
      }
      const prefix = String(constraint.value).toLowerCase();
      const matched = leads.filter((l) =>
        l.name.toLowerCase().startsWith(prefix)
      );
      return {
        constraint,
        matched_count: matched.length,
        total_leads: total,
        passed: matched.length > 0,
      };
    }

    case "LOCATION": {
      if (cvlMatch) {
        const passed = cvlMatch.status === "yes";
        return {
          constraint,
          matched_count: passed ? total : 0,
          total_leads: total,
          passed,
        };
      }
      return {
        constraint,
        matched_count: total,
        total_leads: total,
        passed: true,
        _locationUnverified: true,
      } as ConstraintResult & { _locationUnverified?: boolean };
    }

    case "COUNT_MIN": {
      return {
        constraint,
        matched_count: total,
        total_leads: total,
        passed: false,
      };
    }

    default:
      return {
        constraint,
        matched_count: 0,
        total_leads: total,
        passed: false,
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

function checkLabelHonesty(input: TowerVerdictInput): string[] {
  const gaps: string[] = [];
  const meta = getMeta(input);
  const relaxed = meta.relaxed_constraints;

  if (!relaxed || relaxed.length === 0) return gaps;

  const title = input.artefact_title ?? "";
  const summary = input.artefact_summary ?? "";
  const combined = `${title} ${summary}`.toLowerCase();

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
        return gaps;
      }
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
      const knownSafe = /^(american|african|mexican|dominican|franciscan|republican|anglican|candidate|candid|candy|candle|canal|canada|canadian|canary|cancel|cancer|canvas|canyon|scandal|volcano|significant|particular|popular|regular|circular|nuclear|angular|understand|thousand|standard|command|demand|expand|tuscan|artisan|partisan|guardian|median|suburban|veteran|spartan|christian|norwegian|hawaiian|european|indian|persian|russian|orphan|ocean|organ|urban|sedan|sultan|jordan|morgan|duncan|colorado|orlando|avocado|desperado|commando|tornado|crescendo|innuendo|nintendo|pseudo|overdo|bushido|bravado|eldorado|scholar|dollar|muscular|secular|spectacular|molecular|singular|cellular|modular|toucan|pelican|pecan|caravan|afghan|catalan|marzipan|husband|island|islands|began|scan|uncan|outdo|outis|outdid|outdoes|overis|overdid|overdoes|overwas|alcan|texan|vatican|vulcan|parmesan|artesian|diocesan)$/;
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
  if (verdict === "ACCEPT") return "continue";
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

export function judgeLeadsList(input: TowerVerdictInput): TowerVerdict {
  const coreResult = judgeLeadsListCore(input);

  const leads = resolveLeads(input);
  const evidenceLeads = leads.map((l) => ({
    name: l.name,
    verified: l.verified as boolean | undefined,
    evidence: l.evidence as string | string[] | Record<string, unknown> | null | undefined,
    source_url: l.source_url as string | null | undefined,
  }));

  const hasAnyEvidenceField = evidenceLeads.some(
    (l) => l.verified !== undefined || l.evidence !== undefined || l.source_url !== undefined
  );

  if (hasAnyEvidenceField || input.delivery_summary) {
    const eqResult = judgeEvidenceQuality({
      leads: evidenceLeads,
      verified_exact_count: input.verification_summary?.verified_exact_count,
      requested_count: coreResult.requested,
      delivery_summary: input.delivery_summary,
      tower_verdict: coreResult.verdict,
    });

    if (!eqResult.pass && coreResult.verdict !== "STOP") {
      console.log(`[TOWER] evidence_quality_override verdict=${coreResult.verdict}→STOP gaps=${eqResult.gaps.join(",")}`);
      return {
        ...coreResult,
        verdict: "STOP",
        action: "stop",
        gaps: [...coreResult.gaps, ...eqResult.gaps],
        stop_reason: eqResult.stop_reason,
        rationale: `${coreResult.rationale} [Evidence quality: ${eqResult.detail}]`,
      };
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
      const relReason = hasDelivered
        ? "Candidates found, but relationship evidence is missing. Results are candidates only — no verified relationship match exists."
        : "Required relationship could not be verified. No results with confirmed relationship evidence.";
      const relCode = hasDelivered
        ? "RELATIONSHIP_EVIDENCE_MISSING"
        : "RELATIONSHIP_UNVERIFIED";

      const detectionSource = input.requires_relationship_evidence === true
        ? "explicit (requires_relationship_evidence=true)"
        : `auto-detected predicate "${relDetection.predicate}" in goal`;

      console.log(
        `[TOWER] relationship_predicate_gate: verdict=${coreResult.verdict}→STOP code=${relCode} ` +
        `source=${detectionSource} verified_relationship_count=${verifiedRelCount} ` +
        `delivered=${coreResult.delivered}`
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
            detected_predicate: relDetection.predicate ?? undefined,
            detection_source: detectionSource,
          },
        },
        rationale: `${coreResult.rationale} [Relationship predicate: ${relReason}]`,
      };
    }
  }

  return coreResult;
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

  if (requestedCount === null) {
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: 0,
      requested: 0,
      gaps: ["MISSING_REQUESTED_COUNT"],
      confidence: 100,
      rationale: "Cannot evaluate: requested_count_user is missing from input.",
      suggested_changes: [],
      stop_reason: {
        code: "MISSING_REQUESTED_COUNT",
        message: "Cannot evaluate: requested_count_user is missing from input.",
      },
    };
    console.log(`[TOWER] verdict=STOP reason=MISSING_REQUESTED_COUNT`);
    return result;
  }

  if (checkNoProgress(input)) {
    const matchedCount =
      leads.length > 0 ? getMatchedLeadCount(constraints, leads) : 0;
    const deliveredCount = resolveDeliveredCount(input, matchedCount);
    const message = deliveredCount > 0
      ? `Only ${deliveredCount} exact matches were found. Remaining results do not meet all stated requirements.`
      : leads.length > 0
        ? "No exact matches were found. Closest alternatives were identified after relaxing soft constraints."
        : "No results were found that meet the stated requirements.";
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: requestedCount,
      gaps: ["NO_PROGRESS"],
      confidence: 95,
      rationale: message,
      suggested_changes: [],
      stop_reason: {
        code: "NO_PROGRESS",
        message,
        evidence: { delivered: deliveredCount, requested: requestedCount, leads_count: leads.length },
      },
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
    const deliveredCount = resolveDeliveredCount(input, matchedCount);
    const result: TowerVerdict = {
      verdict: "CHANGE_PLAN",
      action: "change_plan",
      delivered: deliveredCount,
      requested: requestedCount,
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
  const deliveredCount = resolveDeliveredCount(input, matchedLeadCount);

  const constraintResults = constraints.map((c) => {
    if (c.type === "COUNT_MIN") {
      const minCount = Number(c.value);
      return {
        constraint: c,
        matched_count: deliveredCount,
        total_leads: leads.length,
        passed: deliveredCount >= minCount,
      } as ConstraintResult;
    }
    return evaluateConstraint(c, leads, cvlConstraintResults, attrEvidence);
  });

  const hardUnknownsCvl = cvlPresent
    ? constraints
        .filter((c) => c.hardness === "hard")
        .filter((c) => {
          const cvlMatch = findCvlStatusForConstraint(c, cvlConstraintResults);
          return cvlMatch != null && cvlMatch.status === "unknown";
        })
    : [];

  const hardUnknownsAttr = constraints
    .filter((c) => c.hardness === "hard" && c.type === "HAS_ATTRIBUTE")
    .filter((c) => {
      if (hardUnknownsCvl.some((u) => u.type === c.type && u.field === c.field && u.value === c.value)) return false;
      const cr = constraintResults.find(
        (r) => r.constraint.type === c.type && r.constraint.field === c.field && r.constraint.value === c.value
      );
      return cr != null && cr.status === "unknown";
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

  const labelGaps = checkLabelHonesty(input);

  if (deliveredCount >= requestedCount && requestedCount > 0) {
    if (hardViolations.length > 0) {
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
          requested: requestedCount,
          gaps: [...gaps, "HARD_CONSTRAINT_UNVERIFIABLE"],
          confidence: 70,
          rationale: `Count met (${deliveredCount}/${requestedCount}) but hard constraints unverifiable with current tools: ${unknownIds.join(", ")}.`,
          suggested_changes: suggestions,
          constraint_results: constraintResults,
          stop_reason: {
            code: "HARD_CONSTRAINT_UNVERIFIABLE",
            message: `Count met but hard constraints unverifiable with current tools.`,
            evidence: { delivered: deliveredCount, requested: requestedCount, unverifiable_constraints: unknownIds },
          },
        };
        console.log(`[TOWER] verdict=STOP reason=HARD_CONSTRAINT_UNVERIFIABLE`);
        return result;
      }

      if (canReplan(input)) {
        const result: TowerVerdict = {
          verdict: "CHANGE_PLAN",
          action: "change_plan",
          delivered: deliveredCount,
          requested: requestedCount,
          gaps,
          confidence: 60,
          rationale: `Count met (${deliveredCount}/${requestedCount}) but hard constraints have unknown status: ${unknownIds.join(", ")}. Verification needed before accepting.`,
          suggested_changes: suggestions,
          constraint_results: constraintResults,
          stop_reason: {
            code: "HARD_CONSTRAINT_UNKNOWN",
            message: `Count met but hard constraints have unknown status. Verification needed before accepting.`,
            evidence: { delivered: deliveredCount, requested: requestedCount, unknown_constraints: unknownIds },
          },
        };
        console.log(`[TOWER] verdict=CHANGE_PLAN reason=hard_constraint_unknown_needs_verification`);
        return result;
      }

      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: requestedCount,
        gaps: [...gaps, "NO_PROGRESS"],
        confidence: 70,
        rationale: `Count met (${deliveredCount}/${requestedCount}) but hard constraints have unknown status and no replans remain: ${unknownIds.join(", ")}.`,
        suggested_changes: [],
        constraint_results: constraintResults,
        stop_reason: {
          code: "HARD_CONSTRAINT_UNKNOWN",
          message: `Count met but hard constraints have unknown status and no replans remain.`,
          evidence: { delivered: deliveredCount, requested: requestedCount, unknown_constraints: unknownIds },
        },
      };
      console.log(`[TOWER] verdict=STOP reason=hard_unknown_no_replans`);
      return result;
    } else {
      const ratio = deliveredCount / requestedCount;
      const confidence = Math.min(95, Math.round(80 + (ratio - 1) * 15));

      const gaps = [...locationUnverifiedGaps, ...labelGaps];
      const rationale = cvlPresent
        ? "The requested number of verified matches was delivered. All hard constraints satisfied."
        : "The requested number of exact matches was delivered.";
      const result: TowerVerdict = {
        verdict: "ACCEPT",
        action: "continue",
        delivered: deliveredCount,
        requested: requestedCount,
        gaps,
        confidence: Math.max(80, confidence),
        rationale,
        suggested_changes: [],
        constraint_results: constraintResults,
      };
      console.log(
        `[TOWER] verdict=ACCEPT delivered=${deliveredCount} requested=${requestedCount} cvl=${cvlPresent}`
      );
      return result;
    }
  }

  if (hardViolations.length > 0) {
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
        requested: requestedCount,
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
      return result;
    }

    if (allHardViolated) {
      const violatedFields = hardViolations.map((r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`);
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: requestedCount,
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
      return result;
    }

    const gaps = [
      ...hardViolations.map(() => "HARD_CONSTRAINT_VIOLATED"),
      ...labelGaps,
    ];
    if (deliveredCount < requestedCount) {
      gaps.push("INSUFFICIENT_COUNT");
    }

    let softChanges = buildSuggestions(input, constraints, constraintResults, deliveredCount, requestedCount);

    if (canReplan(input) && softChanges.length === 0 && isLocationExpandable(constraints, input)) {
      const fallback = buildFallbackExpandArea(input, deliveredCount, requestedCount);
      if (fallback) softChanges = [fallback];
    }

    if (canReplan(input) && softChanges.length > 0) {
      const violatedFields = hardViolations.map((r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`);
      const result: TowerVerdict = {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        delivered: deliveredCount,
        requested: requestedCount,
        gaps,
        confidence: Math.round(
          30 + (deliveredCount / Math.max(requestedCount, 1)) * 40
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
          evidence: { violated_fields: violatedFields, delivered: deliveredCount, requested: requestedCount },
        },
      };
      console.log(
        `[TOWER] verdict=CHANGE_PLAN reason=hard_violated_suggestions_available`
      );
      return result;
    }

    const violatedFields = hardViolations.map((r) => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`);
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: requestedCount,
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
    return result;
  }

  if (deliveredCount < requestedCount && requestedCount > 0) {
    const gaps: string[] = ["INSUFFICIENT_COUNT", ...locationUnverifiedGaps, ...labelGaps];

    let suggestions = buildSuggestions(input, constraints, constraintResults, deliveredCount, requestedCount);

    if (canReplan(input) && suggestions.length === 0 && isLocationExpandable(constraints, input)) {
      const fallback = buildFallbackExpandArea(input, deliveredCount, requestedCount);
      if (fallback) suggestions = [fallback];
    }

    if (canReplan(input) && suggestions.length > 0) {
      const result: TowerVerdict = {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        delivered: deliveredCount,
        requested: requestedCount,
        gaps,
        confidence:
          deliveredCount === 0
            ? 95
            : Math.round(50 + (deliveredCount / requestedCount) * 30),
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
          evidence: { delivered: deliveredCount, requested: requestedCount, leads_count: leads.length },
        },
      };
      console.log(
        `[TOWER] verdict=CHANGE_PLAN delivered=${deliveredCount} requested=${requestedCount}`
      );
      return result;
    }

    if (!canReplan(input)) {
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: requestedCount,
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
          evidence: { delivered: deliveredCount, requested: requestedCount, leads_count: leads.length },
        },
      };
      console.log(
        `[TOWER] verdict=STOP delivered=${deliveredCount} requested=${requestedCount} reason=max_replans_exhausted`
      );
      return result;
    }

    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: requestedCount,
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
        evidence: { delivered: deliveredCount, requested: requestedCount, leads_count: leads.length },
      },
    };
    console.log(
      `[TOWER] verdict=STOP delivered=${deliveredCount} requested=${requestedCount} reason=no_suggestions_location_not_expandable`
    );
    return result;
  }

  const result: TowerVerdict = {
    verdict: "STOP",
    action: "stop",
    delivered: deliveredCount,
    requested: requestedCount,
    gaps: ["INTERNAL_ERROR", ...labelGaps],
    confidence: 100,
    rationale: "No results were found that meet the stated requirements.",
    suggested_changes: [],
    stop_reason: {
      code: "INTERNAL_ERROR",
      message: `Unexpected state reached in verdict evaluation.`,
      evidence: { delivered: deliveredCount, requested: requestedCount },
    },
  };
  console.log(`[TOWER] verdict=STOP reason=invalid_state`);
  return result;
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
