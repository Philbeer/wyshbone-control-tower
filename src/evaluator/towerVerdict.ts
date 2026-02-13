export type TowerVerdictAction = "ACCEPT" | "RETRY" | "CHANGE_PLAN" | "STOP";

export type SuggestedChangeType =
  | "RELAX_CONSTRAINT"
  | "EXPAND_AREA"
  | "BROADEN_QUERY"
  | "CHANGE_TOOL"
  | "ASK_USER";

export interface SuggestedChange {
  type: SuggestedChangeType;
  field: string;
  from: string | null;
  to: string | null;
  reason: string;
}

export interface TowerVerdict {
  verdict: TowerVerdictAction;
  delivered: number;
  requested: number;
  gaps: string[];
  confidence: number;
  rationale: string;
  suggested_changes: SuggestedChange[];
}

export interface TowerVerdictInput {
  leads?: unknown;
  success_criteria?: {
    target_count?: number;
    [key: string]: unknown;
  };
  constraints?: {
    count?: number;
    prefix?: string;
    location?: string;
    radius?: number | string;
    business_type?: string;
    [key: string]: unknown;
  };
  requested_count?: number;
  delivered_count?: number;
  delivered?: number;
  original_user_goal?: string;
  plan?: unknown;
  plan_summary?: unknown;
}

function resolveRequestedCount(input: TowerVerdictInput): number {
  if (input.success_criteria?.target_count != null) return input.success_criteria.target_count;
  if (input.constraints?.count != null) return input.constraints.count;
  if (input.requested_count != null) return input.requested_count;
  return 20;
}

function resolveDeliveredCount(input: TowerVerdictInput): number {
  if (input.delivered_count != null) return input.delivered_count;
  if (typeof input.delivered === "number") return input.delivered;
  if (Array.isArray(input.leads)) return input.leads.length;
  return 0;
}

function extractLocation(input: TowerVerdictInput): string | null {
  if (input.constraints?.location) return String(input.constraints.location);

  const goal = input.original_user_goal;
  if (goal) {
    const inMatch = goal.match(/\bin\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:that|with|who|which|using|from|near|around)|\s*$)/i);
    if (inMatch) return inMatch[1].trim();
  }

  const plan = input.plan_summary ?? input.plan;
  if (plan && typeof plan === "object") {
    const planObj = plan as Record<string, unknown>;
    if (typeof planObj.location === "string") return planObj.location;
  }

  return null;
}

function extractToolLimitation(input: TowerVerdictInput): string | null {
  const plan = input.plan_summary ?? input.plan;
  if (!plan || typeof plan !== "object") return null;

  const planObj = plan as Record<string, unknown>;

  if (Array.isArray(planObj.assumptions)) {
    for (const assumption of planObj.assumptions) {
      if (typeof assumption === "string") {
        const lower = assumption.toLowerCase();
        if (
          lower.includes("prefix") ||
          lower.includes("filter") ||
          lower.includes("does not support") ||
          lower.includes("cannot filter") ||
          lower.includes("limitation")
        ) {
          return assumption;
        }
      }
    }
  }

  return null;
}

function buildSuggestedChanges(
  input: TowerVerdictInput,
  gaps: string[],
  requestedCount: number,
  deliveredCount: number
): SuggestedChange[] {
  const changes: SuggestedChange[] = [];
  const prefix = input.constraints?.prefix ?? null;
  const location = extractLocation(input);
  const toolLimitation = extractToolLimitation(input);

  if (gaps.includes("constraint_too_strict") && prefix != null) {
    changes.push({
      type: "RELAX_CONSTRAINT",
      field: "prefix",
      from: prefix,
      to: null,
      reason: `Prefix constraint "${prefix}" produced ${deliveredCount} of ${requestedCount} requested matches.${toolLimitation ? ` Plan assumption: "${toolLimitation}"` : ""}`,
    });
  } else if (prefix != null && deliveredCount < requestedCount) {
    changes.push({
      type: "RELAX_CONSTRAINT",
      field: "prefix",
      from: prefix,
      to: null,
      reason: `Prefix "${prefix}" may be too restrictive — only ${deliveredCount} of ${requestedCount} delivered.`,
    });
  }

  if (location && deliveredCount < requestedCount) {
    changes.push({
      type: "EXPAND_AREA",
      field: "location",
      from: location,
      to: `${location} + surrounding area`,
      reason: `Insufficient results within ${location} (${deliveredCount} of ${requestedCount}).`,
    });
  }

  if (toolLimitation && !changes.some((c) => c.reason.includes(toolLimitation))) {
    changes.push({
      type: "BROADEN_QUERY",
      field: "tool",
      from: null,
      to: null,
      reason: `Tool limitation noted in plan: "${toolLimitation}". Consider post-processing or alternate tool.`,
    });
  }

  return changes.slice(0, 3);
}

export function judgeLeadsList(input: TowerVerdictInput): TowerVerdict {
  const requestedCount = resolveRequestedCount(input);
  const deliveredCount = resolveDeliveredCount(input);
  const prefix = input.constraints?.prefix ?? null;
  const goal = input.original_user_goal ?? null;

  let verdict: TowerVerdictAction;
  let gaps: string[] = [];
  let confidence: number;
  let rationale: string;

  if (requestedCount > 0 && deliveredCount === 0) {
    verdict = "CHANGE_PLAN";
    gaps = ["insufficient_count"];
    confidence = 95;
    rationale = `Delivered 0 of ${requestedCount} requested.`;

    if (prefix && deliveredCount === 0) {
      gaps.push("constraint_too_strict");
      rationale += ` Prefix constraint "${prefix}" produced 0 matches, broaden search or expand location/radius.`;
    }

    if (goal) {
      rationale += ` Goal: "${goal}"`;
    }
  } else if (deliveredCount < requestedCount) {
    verdict = "CHANGE_PLAN";
    gaps = ["insufficient_count"];
    confidence = Math.round(50 + (deliveredCount / requestedCount) * 30);
    rationale = `Delivered ${deliveredCount} of ${requestedCount} requested.`;

    if (prefix) {
      gaps.push("constraint_too_strict");
      rationale += ` Prefix constraint "${prefix}" may be limiting results.`;
    }

    if (goal) {
      rationale += ` Goal: "${goal}"`;
    }
  } else {
    verdict = "ACCEPT";
    const ratio = requestedCount > 0 ? deliveredCount / requestedCount : 1;
    confidence = Math.min(95, Math.round(80 + (ratio - 1) * 15));
    if (confidence < 80) confidence = 80;
    gaps = [];
    rationale = `Delivered ${deliveredCount} leads, meeting or exceeding the requested ${requestedCount}. Artefact accepted.`;
  }

  const suggestedChanges: SuggestedChange[] =
    verdict === "CHANGE_PLAN"
      ? buildSuggestedChanges(input, gaps, requestedCount, deliveredCount)
      : [];

  const result: TowerVerdict = {
    verdict,
    delivered: deliveredCount,
    requested: requestedCount,
    gaps,
    confidence,
    rationale,
    suggested_changes: suggestedChanges,
  };

  console.log(
    `[TOWER] verdict=${result.verdict} delivered=${result.delivered} requested=${result.requested} suggestions=${result.suggested_changes.length}`
  );

  return result;
}
