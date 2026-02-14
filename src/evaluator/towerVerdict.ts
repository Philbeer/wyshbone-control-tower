export type TowerVerdictAction = "ACCEPT" | "RETRY" | "CHANGE_PLAN" | "STOP";

export type ConstraintType =
  | "NAME_CONTAINS"
  | "NAME_STARTS_WITH"
  | "LOCATION"
  | "COUNT_MIN";

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

export interface SuggestedChange {
  type: "RELAX_CONSTRAINT";
  field: string;
  from: string | number | null;
  to: string | number | null;
  reason: string;
}

export interface ConstraintResult {
  constraint: Constraint;
  matched_count: number;
  total_leads: number;
  passed: boolean;
}

export interface TowerVerdict {
  verdict: TowerVerdictAction;
  delivered: number;
  requested: number;
  gaps: string[];
  confidence: number;
  rationale: string;
  suggested_changes: SuggestedChange[];
  constraint_results?: ConstraintResult[];
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
  delivered?: number;
  success_criteria?: {
    target_count?: number;
    [key: string]: unknown;
  };
  plan?: unknown;
  plan_summary?: unknown;
  plan_version?: number;
  radius_km?: number;
  attempt_history?: AttemptHistoryEntry[];

  hard_constraints?: string[];
  soft_constraints?: string[];
}

export interface AttemptHistoryEntry {
  plan_version: number;
  radius_km: number;
  delivered_count: number;
}

function resolveRequestedCount(input: TowerVerdictInput): number | null {
  if (input.requested_count_user != null) return input.requested_count_user;
  if (input.success_criteria?.target_count != null) return input.success_criteria.target_count;
  if (input.requested_count != null) return input.requested_count;
  return null;
}

function resolveLeads(input: TowerVerdictInput): Lead[] {
  if (Array.isArray(input.leads)) {
    return input.leads.filter(
      (l): l is Lead => l != null && typeof l === "object" && typeof (l as any).name === "string"
    );
  }
  return [];
}

function resolveDeliveredCount(input: TowerVerdictInput): number {
  const leads = resolveLeads(input);
  if (leads.length > 0) return leads.length;
  if (input.accumulated_count != null) return input.accumulated_count;
  if (input.delivered_count != null) return input.delivered_count;
  if (typeof input.delivered === "number") return input.delivered;
  return 0;
}

function evaluateConstraint(constraint: Constraint, leads: Lead[]): ConstraintResult {
  const total = leads.length;

  switch (constraint.type) {
    case "NAME_CONTAINS": {
      const word = String(constraint.value).toLowerCase();
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
      const matched = leads.filter(l => regex.test(l.name));
      return {
        constraint,
        matched_count: matched.length,
        total_leads: total,
        passed: matched.length > 0,
      };
    }

    case "NAME_STARTS_WITH": {
      const prefix = String(constraint.value).toLowerCase();
      const matched = leads.filter(l =>
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
      return {
        constraint,
        matched_count: total,
        total_leads: total,
        passed: true,
      };
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
    c => c.type === "NAME_CONTAINS" || c.type === "NAME_STARTS_WITH"
  );

  if (nameConstraints.length === 0) return leads.length;

  return leads.filter(lead => {
    return nameConstraints.every(c => {
      if (c.type === "NAME_CONTAINS") {
        const regex = new RegExp(`\\b${escapeRegex(String(c.value))}\\b`, "i");
        return regex.test(lead.name);
      }
      if (c.type === "NAME_STARTS_WITH") {
        return lead.name.toLowerCase().startsWith(String(c.value).toLowerCase());
      }
      return true;
    });
  }).length;
}

export function judgeLeadsList(input: TowerVerdictInput): TowerVerdict {
  const requestedCount = resolveRequestedCount(input);
  const leads = resolveLeads(input);
  const deliveredCount = resolveDeliveredCount(input);
  const constraints = Array.isArray(input.constraints) ? input.constraints : [];
  const goal = input.original_goal ?? input.original_user_goal ?? input.normalized_goal ?? null;

  if (requestedCount === null) {
    const result: TowerVerdict = {
      verdict: "STOP",
      delivered: deliveredCount,
      requested: 0,
      gaps: ["missing_requested_count_user"],
      confidence: 100,
      rationale: "Cannot judge: requested_count_user is missing from input.",
      suggested_changes: [],
    };
    console.log(`[TOWER] verdict=STOP reason=missing_requested_count_user`);
    return result;
  }

  if (checkNoProgress(input)) {
    const result: TowerVerdict = {
      verdict: "STOP",
      delivered: deliveredCount,
      requested: requestedCount,
      gaps: ["no_further_progress_possible"],
      confidence: 95,
      rationale: "No progress detected across attempts. Stopping to avoid burning replans.",
      suggested_changes: [],
    };
    console.log(`[TOWER] verdict=STOP reason=no_progress_over_attempts`);
    return result;
  }

  const matchedCount = leads.length > 0
    ? getMatchedLeadCount(constraints, leads)
    : deliveredCount;

  const constraintResults = constraints.map(c => {
    if (c.type === "COUNT_MIN") {
      const minCount = Number(c.value);
      return {
        constraint: c,
        matched_count: matchedCount,
        total_leads: leads.length,
        passed: matchedCount >= minCount,
      } as ConstraintResult;
    }
    return evaluateConstraint(c, leads);
  });

  const hardViolations = constraintResults.filter(
    r => !r.passed && r.constraint.hardness === "hard"
  );
  const softViolations = constraintResults.filter(
    r => !r.passed && r.constraint.hardness === "soft"
  );

  const countConstraint = constraints.find(c => c.type === "COUNT_MIN");
  const effectiveRequested = countConstraint
    ? Number(countConstraint.value)
    : requestedCount;

  if (hardViolations.length > 0) {
    const allHard = constraints.filter(c => c.hardness === "hard");
    const allHardViolated = allHard.length > 0 &&
      hardViolations.length === allHard.length &&
      matchedCount === 0;

    if (allHardViolated) {
      const result: TowerVerdict = {
        verdict: "STOP",
        delivered: matchedCount,
        requested: effectiveRequested,
        gaps: hardViolations.map(r =>
          `hard_constraint_violated(${r.constraint.field})`
        ),
        confidence: 100,
        rationale: `Hard constraint impossible: ${hardViolations.map(r => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`).join(", ")} — 0 matches in ${deliveredCount} leads.${goal ? ` Goal: "${goal}"` : ""}`,
        suggested_changes: [],
        constraint_results: constraintResults,
      };
      console.log(`[TOWER] verdict=STOP reason=hard_constraint_impossible`);
      return result;
    }

    const gaps = hardViolations.map(r =>
      `hard_constraint_violated(${r.constraint.field})`
    );

    if (matchedCount < effectiveRequested) {
      gaps.push("insufficient_count");
    }

    const softChanges = buildSoftRelaxations(softViolations, matchedCount, effectiveRequested);

    if (softChanges.length > 0) {
      const result: TowerVerdict = {
        verdict: "CHANGE_PLAN",
        delivered: matchedCount,
        requested: effectiveRequested,
        gaps,
        confidence: Math.round(30 + (matchedCount / Math.max(effectiveRequested, 1)) * 40),
        rationale: `Hard constraint(s) not met: ${hardViolations.map(r => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value}) matched ${r.matched_count}/${r.total_leads}`).join(", ")}. Suggesting soft constraint relaxations.${goal ? ` Goal: "${goal}"` : ""}`,
        suggested_changes: softChanges,
        constraint_results: constraintResults,
      };
      console.log(`[TOWER] verdict=CHANGE_PLAN reason=hard_violated_soft_available`);
      return result;
    }

    const result: TowerVerdict = {
      verdict: "STOP",
      delivered: matchedCount,
      requested: effectiveRequested,
      gaps,
      confidence: 95,
      rationale: `Hard constraint impossible: ${hardViolations.map(r => `${r.constraint.type}(${r.constraint.field}=${r.constraint.value})`).join(", ")} — no soft constraints to relax.${goal ? ` Goal: "${goal}"` : ""}`,
      suggested_changes: [],
      constraint_results: constraintResults,
    };
    console.log(`[TOWER] verdict=STOP reason=hard_constraint_impossible`);
    return result;
  }

  if (matchedCount >= effectiveRequested && effectiveRequested > 0) {
    const ratio = matchedCount / effectiveRequested;
    const confidence = Math.min(95, Math.round(80 + (ratio - 1) * 15));

    const result: TowerVerdict = {
      verdict: "ACCEPT",
      delivered: matchedCount,
      requested: effectiveRequested,
      gaps: [],
      confidence: Math.max(80, confidence),
      rationale: `Delivered ${matchedCount} matching leads, meeting the requested ${effectiveRequested}.${softViolations.length > 0 ? ` Note: ${softViolations.map(r => `${r.constraint.field} constraint not fully met`).join(", ")}.` : ""}${goal ? ` Goal: "${goal}"` : ""}`,
      suggested_changes: [],
      constraint_results: constraintResults,
    };
    console.log(`[TOWER] verdict=ACCEPT delivered=${matchedCount} requested=${effectiveRequested}`);
    return result;
  }

  if (effectiveRequested > 0 && matchedCount < effectiveRequested) {
    const gaps: string[] = ["insufficient_count"];

    if (softViolations.length > 0) {
      for (const sv of softViolations) {
        gaps.push(`constraint_too_strict(${sv.constraint.field})`);
      }
    }

    const softChanges = buildSoftRelaxations(
      [...softViolations, ...constraintResults.filter(r => r.constraint.hardness === "soft" && r.passed)],
      matchedCount,
      effectiveRequested
    );

    const filteredSoftChanges = softChanges.filter(
      (change, index, self) => self.findIndex(c => c.field === change.field) === index
    );

    if (filteredSoftChanges.length > 0) {
      const result: TowerVerdict = {
        verdict: "CHANGE_PLAN",
        delivered: matchedCount,
        requested: effectiveRequested,
        gaps,
        confidence: matchedCount === 0 ? 95 : Math.round(50 + (matchedCount / effectiveRequested) * 30),
        rationale: `Delivered ${matchedCount} of ${effectiveRequested} requested.${softViolations.length > 0 ? ` Soft constraints limiting results: ${softViolations.map(r => `${r.constraint.field}`).join(", ")}.` : ""}${goal ? ` Goal: "${goal}"` : ""}`,
        suggested_changes: filteredSoftChanges,
        constraint_results: constraintResults,
      };
      console.log(`[TOWER] verdict=CHANGE_PLAN delivered=${matchedCount} requested=${effectiveRequested}`);
      return result;
    }

    const result: TowerVerdict = {
      verdict: "STOP",
      delivered: matchedCount,
      requested: effectiveRequested,
      gaps: [...gaps, "no_further_progress_possible"],
      confidence: 90,
      rationale: `Delivered ${matchedCount} of ${effectiveRequested} requested. No soft constraints available to relax.${goal ? ` Goal: "${goal}"` : ""}`,
      suggested_changes: [],
      constraint_results: constraintResults,
    };
    console.log(`[TOWER] verdict=STOP delivered=${matchedCount} requested=${effectiveRequested} reason=no_soft_to_relax`);
    return result;
  }

  const result: TowerVerdict = {
    verdict: "STOP",
    delivered: matchedCount,
    requested: effectiveRequested,
    gaps: [],
    confidence: 100,
    rationale: `Cannot proceed with requested=${effectiveRequested}.`,
    suggested_changes: [],
  };
  console.log(`[TOWER] verdict=STOP reason=invalid_state`);
  return result;
}

function buildSoftRelaxations(
  softResults: ConstraintResult[],
  matchedCount: number,
  requestedCount: number
): SuggestedChange[] {
  const changes: SuggestedChange[] = [];

  const locationConstraints = softResults.filter(r => r.constraint.type === "LOCATION");
  for (const r of locationConstraints) {
    changes.push({
      type: "RELAX_CONSTRAINT",
      field: r.constraint.field,
      from: String(r.constraint.value),
      to: `${r.constraint.value} within 10km`,
      reason: `insufficient matches (${matchedCount} of ${requestedCount})`,
    });
  }

  const nameConstraints = softResults.filter(
    r => r.constraint.type === "NAME_CONTAINS" || r.constraint.type === "NAME_STARTS_WITH"
  );
  for (const r of nameConstraints) {
    changes.push({
      type: "RELAX_CONSTRAINT",
      field: r.constraint.field,
      from: String(r.constraint.value),
      to: null,
      reason: `${r.constraint.type} "${r.constraint.value}" matched ${r.matched_count} of ${r.total_leads} leads`,
    });
  }

  return changes;
}
