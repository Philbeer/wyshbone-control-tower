export type TowerVerdictAction = "ACCEPT" | "RETRY" | "CHANGE_PLAN" | "STOP" | "ASK_USER";

export type TowerAction = "continue" | "retry" | "change_plan" | "stop";

export type SuggestedChangeType =
  | "RELAX_CONSTRAINT"
  | "EXPAND_AREA"
  | "INCREASE_COVERAGE"
  | "BROADEN_QUERY"
  | "CHANGE_TOOL"
  | "ASK_USER";

export interface SuggestedChange {
  type: SuggestedChangeType;
  field: string;
  from: string | number | null;
  to: string | number | null;
  reason: string;
}

export interface AskUserOption {
  label: string;
  description: string;
  field: string;
  action: string;
}

export interface ConstraintSpec {
  value: string | number | boolean | null;
  hardness: "hard" | "soft";
  was_relaxed?: boolean;
}

export interface StructuredConstraints {
  business_type?: ConstraintSpec;
  location?: ConstraintSpec;
  prefix_filter?: ConstraintSpec;
  [key: string]: ConstraintSpec | undefined;
}

export interface AttemptHistoryEntry {
  plan_version: number;
  radius_km: number;
  delivered_count: number;
}

export interface TowerVerdict {
  verdict: TowerVerdictAction;
  action: TowerAction;
  delivered: number;
  requested: number;
  gaps: string[];
  confidence: number;
  rationale: string;
  suggested_changes: SuggestedChange[];
  reason_code: string;
  ask_user_options?: AskUserOption[];
}

export interface TowerVerdictInput {
  leads?: unknown;

  original_user_goal?: string;
  normalized_goal?: string;

  requested_count_user?: number;

  constraints?: StructuredConstraints | LegacyConstraints;

  hard_constraints?: string[];
  soft_constraints?: string[];

  accumulated_count?: number;
  delivered_count?: number;
  delivered?: number;

  plan_version?: number;
  radius_km?: number;

  attempt_history?: AttemptHistoryEntry[];

  success_criteria?: {
    target_count?: number;
    [key: string]: unknown;
  };

  requested_count?: number;

  plan?: unknown;
  plan_summary?: unknown;
}

interface LegacyConstraints {
  count?: number;
  prefix?: string;
  prefix_filter?: string;
  location?: string;
  radius?: number | string;
  business_type?: string;
  [key: string]: unknown;
}

function isStructuredConstraints(c: unknown): c is StructuredConstraints {
  if (!c || typeof c !== "object") return false;
  const obj = c as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object" && "hardness" in (val as Record<string, unknown>)) {
      return true;
    }
  }
  return false;
}

function verdictToAction(verdict: TowerVerdictAction): TowerAction {
  switch (verdict) {
    case "ACCEPT": return "continue";
    case "RETRY": return "retry";
    case "CHANGE_PLAN": return "change_plan";
    case "STOP": return "stop";
    case "ASK_USER": return "stop";
  }
}

function resolveRequestedCount(input: TowerVerdictInput): number | null {
  if (input.requested_count_user != null) return input.requested_count_user;
  if (input.success_criteria?.target_count != null) return input.success_criteria.target_count;
  if (input.requested_count != null) return input.requested_count;
  return null;
}

function resolveDeliveredCount(input: TowerVerdictInput): number {
  if (input.accumulated_count != null) return input.accumulated_count;
  if (input.delivered_count != null) return input.delivered_count;
  if (typeof input.delivered === "number") return input.delivered;
  if (Array.isArray(input.leads)) return input.leads.length;
  return 0;
}

function getConstraintValue(input: TowerVerdictInput, field: string): string | number | boolean | null {
  if (!input.constraints) return null;
  if (isStructuredConstraints(input.constraints)) {
    const spec = input.constraints[field];
    return spec?.value ?? null;
  }
  const legacy = input.constraints as LegacyConstraints;
  if (field === "prefix_filter") return legacy.prefix_filter ?? legacy.prefix ?? null;
  return (legacy[field] as string | number | null) ?? null;
}

function isHard(field: string, input: TowerVerdictInput): boolean {
  if (input.constraints && isStructuredConstraints(input.constraints)) {
    const spec = input.constraints[field];
    if (spec) return spec.hardness === "hard";
  }
  const hardList = input.hard_constraints ?? [];
  const norm = field.toLowerCase();
  return hardList.some((h) => h.toLowerCase() === norm);
}

function isSoft(field: string, input: TowerVerdictInput): boolean {
  if (input.constraints && isStructuredConstraints(input.constraints)) {
    const spec = input.constraints[field];
    if (spec) return spec.hardness === "soft";
  }
  const softList = input.soft_constraints ?? [];
  const norm = field.toLowerCase();
  return softList.some((s) => s.toLowerCase() === norm);
}

function wasRelaxed(field: string, input: TowerVerdictInput): boolean {
  if (input.constraints && isStructuredConstraints(input.constraints)) {
    const spec = input.constraints[field];
    return spec?.was_relaxed === true;
  }
  return false;
}

function hasConstraintClassification(input: TowerVerdictInput): boolean {
  if (input.constraints && isStructuredConstraints(input.constraints)) return true;
  return (
    (Array.isArray(input.hard_constraints) && input.hard_constraints.length > 0) ||
    (Array.isArray(input.soft_constraints) && input.soft_constraints.length > 0)
  );
}

function getConstraintFields(input: TowerVerdictInput): string[] {
  if (input.constraints && isStructuredConstraints(input.constraints)) {
    return Object.keys(input.constraints).filter(k => input.constraints && (input.constraints as StructuredConstraints)[k] != null);
  }
  if (!input.constraints) return [];
  const legacy = input.constraints as LegacyConstraints;
  const fields: string[] = [];
  if (legacy.location) fields.push("location");
  if (legacy.business_type) fields.push("business_type");
  if (legacy.prefix_filter || legacy.prefix) fields.push("prefix_filter");
  return fields;
}

function resolvePrefix(input: TowerVerdictInput): string | null {
  const val = getConstraintValue(input, "prefix_filter");
  if (val != null) return String(val);
  if (!input.constraints || isStructuredConstraints(input.constraints)) return null;
  const legacy = input.constraints as LegacyConstraints;
  return legacy.prefix ?? legacy.prefix_filter ?? null;
}

function extractLocation(input: TowerVerdictInput): string | null {
  const val = getConstraintValue(input, "location");
  if (val != null) return String(val);

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

function checkHardConstraintViolations(input: TowerVerdictInput): string[] {
  const violated: string[] = [];
  const fields = getConstraintFields(input);

  for (const field of fields) {
    if (!isHard(field, input)) continue;

    if (wasRelaxed(field, input)) {
      violated.push(field);
      continue;
    }

    const currentVal = getConstraintValue(input, field);
    if (currentVal === null || currentVal === undefined) {
      violated.push(field);
    }
  }

  return violated;
}

function getRelaxedConstraintNotes(input: TowerVerdictInput): string[] {
  const notes: string[] = [];
  const fields = getConstraintFields(input);

  for (const field of fields) {
    if (wasRelaxed(field, input)) {
      const spec = isStructuredConstraints(input.constraints!)
        ? (input.constraints as StructuredConstraints)[field]
        : null;
      notes.push(`${field} relaxed${spec ? ` (was: ${spec.value})` : ""}`);
    }
  }

  if (input.radius_km && input.radius_km > 5) {
    const locationVal = getConstraintValue(input, "location");
    if (locationVal) {
      notes.push(`location expanded to ${input.radius_km}km`);
    }
  }

  return notes;
}

function buildSuggestedChanges(
  input: TowerVerdictInput,
  requestedCount: number,
  deliveredCount: number
): { changes: SuggestedChange[]; requiresHardRelax: boolean; hardFieldsNeeded: string[] } {
  const changes: SuggestedChange[] = [];
  const hardFieldsNeeded: string[] = [];

  const location = extractLocation(input);
  if (location && isSoft("location", input)) {
    const currentRadius = input.radius_km ?? 5;
    changes.push({
      type: "EXPAND_AREA",
      field: "location",
      from: `${location} (${currentRadius}km)`,
      to: `${location} (${currentRadius + 10}km)`,
      reason: `Insufficient results within ${location} (${deliveredCount} of ${requestedCount}). Location is soft and can be expanded.`,
    });
  }

  changes.push({
    type: "INCREASE_COVERAGE",
    field: "tool_maxResults",
    from: null,
    to: 60,
    reason: `Increase tool maxResults to improve coverage. This is a tool hint, not the requested count.`,
  });

  const prefix = resolvePrefix(input);
  if (prefix != null && (isSoft("prefix_filter", input) || isSoft("prefix", input))) {
    changes.push({
      type: "RELAX_CONSTRAINT",
      field: "prefix_filter",
      from: prefix,
      to: null,
      reason: `Prefix constraint "${prefix}" produced ${deliveredCount} of ${requestedCount}. Prefix is soft.`,
    });
  }

  if (isSoft("business_type", input)) {
    const bt = getConstraintValue(input, "business_type");
    if (bt && deliveredCount < requestedCount) {
      changes.push({
        type: "RELAX_CONSTRAINT",
        field: "business_type",
        from: typeof bt === "boolean" ? String(bt) : bt,
        to: null,
        reason: `Business type "${bt}" is soft and can be broadened.`,
      });
    }
  }

  const softChanges = changes.filter(c => c.type !== "INCREASE_COVERAGE" || changes.length === 1);
  const hasRealSoftChanges = changes.some(c => c.type !== "INCREASE_COVERAGE");

  if (!hasRealSoftChanges && deliveredCount < requestedCount) {
    if (location && !isSoft("location", input) && isHard("location", input)) {
      hardFieldsNeeded.push("location");
    }
    if (prefix != null && !isSoft("prefix_filter", input) && !isSoft("prefix", input)) {
      hardFieldsNeeded.push("prefix_filter");
    }
    const bt = getConstraintValue(input, "business_type");
    if (bt && !isSoft("business_type", input) && isHard("business_type", input)) {
      hardFieldsNeeded.push("business_type");
    }
  }

  return {
    changes: changes.slice(0, 4),
    requiresHardRelax: !hasRealSoftChanges && hardFieldsNeeded.length > 0,
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

  if (location && deliveredCount < requestedCount) {
    changes.push({
      type: "EXPAND_AREA",
      field: "location",
      from: location,
      to: `${location} + surrounding area`,
      reason: `Insufficient results within ${location} (${deliveredCount} of ${requestedCount}).`,
    });
  }

  if (prefix != null && deliveredCount < requestedCount) {
    changes.push({
      type: "RELAX_CONSTRAINT",
      field: "prefix_filter",
      from: prefix,
      to: null,
      reason: `Prefix "${prefix}" may be too restrictive — only ${deliveredCount} of ${requestedCount} delivered.`,
    });
  }

  return changes.slice(0, 3);
}

function buildAskUserOptions(hardFieldsNeeded: string[], input: TowerVerdictInput): AskUserOption[] {
  const options: AskUserOption[] = [];

  if (hardFieldsNeeded.includes("location")) {
    const location = extractLocation(input);
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
      label: `Option ${String.fromCharCode(65 + options.length)}: Relax prefix filter`,
      description: `Remove the requirement for names starting with "${prefix ?? ""}"`,
      field: "prefix_filter",
      action: "RELAX_CONSTRAINT",
    });
  }

  if (hardFieldsNeeded.includes("business_type")) {
    const bt = getConstraintValue(input, "business_type");
    const btStr = bt != null ? String(bt) : "current type";
    options.push({
      label: `Option ${String.fromCharCode(65 + options.length)}: Relax business type`,
      description: `Broaden from "${btStr}" to related business types`,
      field: "business_type",
      action: "BROADEN_QUERY",
    });
  }

  return options;
}

export function judgeLeadsList(input: TowerVerdictInput): TowerVerdict {
  const requestedCount = resolveRequestedCount(input);
  const deliveredCount = resolveDeliveredCount(input);
  const prefix = resolvePrefix(input);
  const goal = input.original_user_goal ?? input.normalized_goal ?? null;
  const classified = hasConstraintClassification(input);

  if (requestedCount === null) {
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: 0,
      gaps: [],
      confidence: 100,
      rationale: "Cannot judge: requested_count_user is missing from input.",
      suggested_changes: [],
      reason_code: "missing_requested_count_user",
    };
    console.log(`[TOWER] verdict=STOP reason=missing_requested_count_user`);
    return result;
  }

  if (checkNoProgress(input)) {
    const result: TowerVerdict = {
      verdict: "STOP",
      action: "stop",
      delivered: deliveredCount,
      requested: requestedCount,
      gaps: ["no_further_progress_possible"],
      confidence: 95,
      rationale: `No progress detected: plan_version increased but radius_km and delivered_count unchanged across attempts. Stopping to avoid burning replans.`,
      suggested_changes: [],
      reason_code: "no_progress_over_attempts",
    };
    console.log(`[TOWER] verdict=STOP reason=no_progress_over_attempts`);
    return result;
  }

  if (classified) {
    const hardViolations = checkHardConstraintViolations(input);
    if (hardViolations.length > 0) {
      const violationList = hardViolations.map(f => `hard_constraint_violated(${f})`);
      const result: TowerVerdict = {
        verdict: "STOP",
        action: "stop",
        delivered: deliveredCount,
        requested: requestedCount,
        gaps: violationList,
        confidence: 100,
        rationale: `Hard constraint(s) violated: ${hardViolations.join(", ")}. Cannot accept results that violate hard constraints.`,
        suggested_changes: [],
        reason_code: "hard_constraint_violated",
      };
      console.log(`[TOWER] verdict=STOP reason=hard_constraint_violated fields=${hardViolations.join(",")}`);
      return result;
    }
  }

  let verdict: TowerVerdictAction;
  let gaps: string[] = [];
  let confidence: number;
  let rationale: string;
  let suggestedChanges: SuggestedChange[] = [];
  let askUserOptions: AskUserOption[] | undefined;
  let reasonCode: string = "ok";

  if (deliveredCount >= requestedCount && requestedCount > 0) {
    verdict = "ACCEPT";
    const ratio = deliveredCount / requestedCount;
    confidence = Math.min(95, Math.round(80 + (ratio - 1) * 15));
    if (confidence < 80) confidence = 80;
    gaps = [];
    rationale = `Delivered ${deliveredCount} leads, meeting or exceeding the requested ${requestedCount}.`;
    reasonCode = "accepted";

    const relaxedNotes = getRelaxedConstraintNotes(input);
    if (relaxedNotes.length > 0) {
      rationale += ` Accepted with relaxed constraints: ${relaxedNotes.join("; ")}.`;
      reasonCode = "accepted_with_relaxed_constraints";
    }
  } else if (requestedCount > 0 && deliveredCount < requestedCount) {
    gaps = ["insufficient_count"];
    rationale = deliveredCount === 0
      ? `Delivered 0 of ${requestedCount} requested.`
      : `Delivered ${deliveredCount} of ${requestedCount} requested.`;

    if (prefix && deliveredCount === 0) {
      gaps.push("constraint_too_strict(prefix_filter)");
      rationale += ` Prefix constraint "${prefix}" produced 0 matches.`;
    } else if (prefix && deliveredCount < requestedCount) {
      gaps.push("constraint_too_strict(prefix_filter)");
      rationale += ` Prefix constraint "${prefix}" may be limiting results.`;
    }

    if (goal) {
      rationale += ` Goal: "${goal}"`;
    }

    if (classified) {
      const buildResult = buildSuggestedChanges(input, requestedCount, deliveredCount);

      if (buildResult.requiresHardRelax) {
        const maxRadius = input.radius_km ?? 0;
        if (maxRadius >= 50) {
          verdict = "STOP";
          confidence = 95;
          rationale += ` All soft constraints exhausted and max radius reached. Cannot proceed without violating hard constraints.`;
          suggestedChanges = [];
          reasonCode = "no_further_progress_possible";
          gaps.push("no_further_progress_possible");
        } else {
          verdict = "STOP";
          confidence = 90;
          rationale += ` All remaining constraints are hard — cannot auto-relax. User decision required.`;
          suggestedChanges = [];
          reasonCode = "hard_constraints_only";
          askUserOptions = buildAskUserOptions(buildResult.hardFieldsNeeded, input);
        }
      } else {
        verdict = "CHANGE_PLAN";
        confidence = deliveredCount === 0 ? 95 : Math.round(50 + (deliveredCount / requestedCount) * 30);
        suggestedChanges = buildResult.changes;
        reasonCode = "insufficient_count";
      }
    } else {
      verdict = "CHANGE_PLAN";
      confidence = deliveredCount === 0 ? 95 : Math.round(50 + (deliveredCount / requestedCount) * 30);
      suggestedChanges = buildLegacyChanges(input, gaps, requestedCount, deliveredCount);
      reasonCode = "insufficient_count";
    }
  } else {
    verdict = "STOP";
    confidence = 100;
    gaps = [];
    rationale = `Requested count is ${requestedCount}. Cannot proceed.`;
    reasonCode = "invalid_requested_count";
  }

  const result: TowerVerdict = {
    verdict,
    action: verdictToAction(verdict),
    delivered: deliveredCount,
    requested: requestedCount,
    gaps,
    confidence,
    rationale,
    suggested_changes: suggestedChanges,
    reason_code: reasonCode,
    ...(askUserOptions && askUserOptions.length > 0 ? { ask_user_options: askUserOptions } : {}),
  };

  console.log(
    `[TOWER] verdict=${result.verdict} action=${result.action} delivered=${result.delivered} requested=${result.requested} reason_code=${result.reason_code} suggestions=${result.suggested_changes.length}`
  );

  return result;
}
