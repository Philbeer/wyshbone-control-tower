export type TowerVerdictAction = "ACCEPT" | "RETRY" | "CHANGE_PLAN" | "STOP" | "ASK_USER";

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

export interface AskUserOption {
  label: string;
  description: string;
  field: string;
  action: string;
}

export interface TowerVerdict {
  verdict: TowerVerdictAction;
  delivered: number;
  requested: number;
  gaps: string[];
  confidence: number;
  rationale: string;
  suggested_changes: SuggestedChange[];
  ask_user_options?: AskUserOption[];
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
    prefix_filter?: string;
    location?: string;
    radius?: number | string;
    business_type?: string;
    [key: string]: unknown;
  };
  hard_constraints?: string[];
  soft_constraints?: string[];
  requested_count?: number;
  delivered_count?: number;
  delivered?: number;
  original_user_goal?: string;
  normalized_goal?: string;
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

function resolvePrefix(input: TowerVerdictInput): string | null {
  return input.constraints?.prefix ?? input.constraints?.prefix_filter ?? null;
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

function isHard(field: string, input: TowerVerdictInput): boolean {
  const hardList = input.hard_constraints ?? [];
  const norm = field.toLowerCase();
  return hardList.some((h) => h.toLowerCase() === norm);
}

function isSoft(field: string, input: TowerVerdictInput): boolean {
  const softList = input.soft_constraints ?? [];
  const norm = field.toLowerCase();
  return softList.some((s) => s.toLowerCase() === norm);
}

function hasConstraintClassification(input: TowerVerdictInput): boolean {
  return (
    (Array.isArray(input.hard_constraints) && input.hard_constraints.length > 0) ||
    (Array.isArray(input.soft_constraints) && input.soft_constraints.length > 0)
  );
}

interface BuildResult {
  changes: SuggestedChange[];
  requiresHardRelax: boolean;
  hardFieldsNeeded: string[];
}

function buildConstraintAwareChanges(
  input: TowerVerdictInput,
  gaps: string[],
  requestedCount: number,
  deliveredCount: number
): BuildResult {
  const changes: SuggestedChange[] = [];
  const prefix = resolvePrefix(input);
  const location = input.constraints?.location ?? null;
  const hardFieldsNeeded: string[] = [];

  if (location && isSoft("location", input)) {
    changes.push({
      type: "EXPAND_AREA",
      field: "location",
      from: location,
      to: `${location} + surrounding area`,
      reason: `Insufficient results within ${location} (${deliveredCount} of ${requestedCount}). Location is a soft constraint and can be expanded.`,
    });
  }

  if (isSoft("business_type", input)) {
    const bt = input.constraints?.business_type ?? null;
    if (bt && deliveredCount < requestedCount) {
      changes.push({
        type: "BROADEN_QUERY",
        field: "business_type",
        from: bt,
        to: null,
        reason: `Business type "${bt}" is a soft constraint and can be broadened to find more results.`,
      });
    }
  }

  if (prefix != null && (isSoft("prefix_filter", input) || isSoft("prefix", input))) {
    changes.push({
      type: "RELAX_CONSTRAINT",
      field: "prefix_filter",
      from: prefix,
      to: null,
      reason: `Prefix constraint "${prefix}" produced ${deliveredCount} of ${requestedCount} requested matches. Prefix is a soft constraint.`,
    });
  }

  if (changes.length === 0 && deliveredCount < requestedCount) {
    if (location && !isSoft("location", input)) {
      hardFieldsNeeded.push("location");
    }
    if (prefix != null && !isSoft("prefix_filter", input) && !isSoft("prefix", input)) {
      hardFieldsNeeded.push("prefix_filter");
    }
    if (input.constraints?.business_type && !isSoft("business_type", input)) {
      hardFieldsNeeded.push("business_type");
    }
  }

  return {
    changes: changes.slice(0, 3),
    requiresHardRelax: changes.length === 0 && hardFieldsNeeded.length > 0,
    hardFieldsNeeded,
  };
}

function buildLegacyChanges(
  input: TowerVerdictInput,
  gaps: string[],
  requestedCount: number,
  deliveredCount: number
): SuggestedChange[] {
  const changes: SuggestedChange[] = [];
  const prefix = resolvePrefix(input);
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

function buildAskUserOptions(hardFieldsNeeded: string[], input: TowerVerdictInput): AskUserOption[] {
  const options: AskUserOption[] = [];

  if (hardFieldsNeeded.includes("location")) {
    const location = input.constraints?.location ?? null;
    options.push({
      label: "Option A: Relax location",
      description: `Expand search beyond ${location ?? "current area"} to surrounding areas`,
      field: "location",
      action: "EXPAND_AREA",
    });
  }

  if (hardFieldsNeeded.includes("prefix_filter")) {
    const prefix = resolvePrefix(input);
    options.push({
      label: "Option B: Relax prefix filter",
      description: `Remove the requirement for names starting with "${prefix ?? ""}"`,
      field: "prefix_filter",
      action: "RELAX_CONSTRAINT",
    });
  }

  if (hardFieldsNeeded.includes("business_type")) {
    const bt = input.constraints?.business_type ?? null;
    options.push({
      label: `Option ${String.fromCharCode(65 + options.length)}: Relax business type`,
      description: `Broaden from "${bt ?? "current type"}" to related business types`,
      field: "business_type",
      action: "BROADEN_QUERY",
    });
  }

  return options;
}

function checkCountHardViolation(
  input: TowerVerdictInput,
  requestedCount: number,
  deliveredCount: number
): boolean {
  if (!isHard("count", input) && !isHard("requested_count", input)) return false;
  return deliveredCount < requestedCount;
}

function checkBusinessTypeHardViolation(input: TowerVerdictInput): boolean {
  return isHard("business_type", input);
}

export function judgeLeadsList(input: TowerVerdictInput): TowerVerdict {
  const requestedCount = resolveRequestedCount(input);
  const deliveredCount = resolveDeliveredCount(input);
  const prefix = resolvePrefix(input);
  const goal = input.original_user_goal ?? input.normalized_goal ?? null;
  const classified = hasConstraintClassification(input);

  let verdict: TowerVerdictAction;
  let gaps: string[] = [];
  let confidence: number;
  let rationale: string;
  let suggestedChanges: SuggestedChange[] = [];
  let askUserOptions: AskUserOption[] | undefined;

  if (deliveredCount >= requestedCount && requestedCount > 0) {
    verdict = "ACCEPT";
    const ratio = deliveredCount / requestedCount;
    confidence = Math.min(95, Math.round(80 + (ratio - 1) * 15));
    if (confidence < 80) confidence = 80;
    gaps = [];
    rationale = `Delivered ${deliveredCount} leads, meeting or exceeding the requested ${requestedCount}. Artefact accepted.`;
  } else if (requestedCount > 0 && deliveredCount < requestedCount) {
    gaps = ["insufficient_count"];
    rationale = deliveredCount === 0
      ? `Delivered 0 of ${requestedCount} requested.`
      : `Delivered ${deliveredCount} of ${requestedCount} requested.`;

    if (prefix && deliveredCount === 0) {
      gaps.push("constraint_too_strict");
      rationale += ` Prefix constraint "${prefix}" produced 0 matches.`;
    } else if (prefix) {
      gaps.push("constraint_too_strict");
      rationale += ` Prefix constraint "${prefix}" may be limiting results.`;
    }

    if (goal) {
      rationale += ` Goal: "${goal}"`;
    }

    if (classified) {
      const buildResult = buildConstraintAwareChanges(input, gaps, requestedCount, deliveredCount);

      if (buildResult.requiresHardRelax) {
        verdict = "ASK_USER";
        confidence = 90;
        rationale += ` All remaining constraints are hard — cannot auto-relax. User decision required.`;
        suggestedChanges = [];
        askUserOptions = buildAskUserOptions(buildResult.hardFieldsNeeded, input);
      } else {
        verdict = "CHANGE_PLAN";
        confidence = deliveredCount === 0 ? 95 : Math.round(50 + (deliveredCount / requestedCount) * 30);
        suggestedChanges = buildResult.changes;
      }
    } else {
      verdict = "CHANGE_PLAN";
      confidence = deliveredCount === 0 ? 95 : Math.round(50 + (deliveredCount / requestedCount) * 30);
      suggestedChanges = buildLegacyChanges(input, gaps, requestedCount, deliveredCount);
    }
  } else {
    verdict = "ACCEPT";
    confidence = 80;
    gaps = [];
    rationale = `Delivered ${deliveredCount} leads. Artefact accepted.`;
  }

  const result: TowerVerdict = {
    verdict,
    delivered: deliveredCount,
    requested: requestedCount,
    gaps,
    confidence,
    rationale,
    suggested_changes: suggestedChanges,
    ...(askUserOptions && askUserOptions.length > 0 ? { ask_user_options: askUserOptions } : {}),
  };

  console.log(
    `[TOWER] verdict=${result.verdict} delivered=${result.delivered} requested=${result.requested} suggestions=${result.suggested_changes.length}`
  );

  return result;
}
