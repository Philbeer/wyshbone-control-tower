import type { TowerVerdictAction, StopReason, SuggestedChange } from "./towerVerdict";

export type FailureReason =
  | "underfilled_results"
  | "weak_verification"
  | "too_slow"
  | "impossible_constraints"
  | "other";

export type VerificationQualityScore = "weak" | "ok" | "strong";

export interface LearningMetrics {
  requested_count: number;
  returned_count: number;
  underfilled: boolean;
  verification_quality_score: VerificationQualityScore;
  cost_or_time_signal: {
    steps_count?: number;
    tool_calls?: number;
    duration_bucket?: "fast" | "normal" | "slow";
    replans_used?: number;
  };
  failure_reason: FailureReason | null;
}

export interface LearningFieldChange {
  field: string;
  before: string | number | null;
  after: string | number | null;
}

export interface LearningUpdateArtefact {
  type: "learning_update";
  query_shape_key: string;
  changed_fields: LearningFieldChange[];
  tower_reason: string;
  metrics_trigger: LearningMetrics;
  run_id: string;
}

export interface LearningUpdateInput {
  verdict: TowerVerdictAction;
  delivered: number;
  requested: number;
  gaps: string[];
  confidence: number;
  stop_reason?: StopReason | null;
  suggested_changes: SuggestedChange[];
  constraint_results?: Array<{ constraint: { hardness: string }; passed: boolean; status?: string }>;

  run_id: string;
  query_shape_key?: string | null;
  replans_used?: number;
  steps_count?: number;
  tool_calls?: number;

  current_search_budget_pages?: number;
  current_verification_level?: "minimal" | "standard" | "strict";
  current_radius_escalation?: "conservative" | "moderate" | "aggressive";
}

const SEARCH_BUDGET_CAP = 3;
const SEARCH_BUDGET_FLOOR = 1;

function deriveVerificationQuality(input: LearningUpdateInput): VerificationQualityScore {
  if (input.constraint_results && input.constraint_results.length > 0) {
    const hardConstraints = input.constraint_results.filter(cr => cr.constraint.hardness === "hard");
    if (hardConstraints.length === 0) return "ok";
    const unknownOrMissing = hardConstraints.filter(
      cr => cr.status === "unknown" || cr.status === "not_attempted"
    );
    if (unknownOrMissing.length > hardConstraints.length * 0.5) return "weak";
    if (unknownOrMissing.length === 0) return "strong";
    return "ok";
  }

  if (input.gaps.includes("HARD_CONSTRAINT_UNKNOWN") || input.gaps.includes("VERIFIED_WITHOUT_EVIDENCE")) {
    return "weak";
  }
  if (input.confidence >= 80) return "strong";
  if (input.confidence >= 50) return "ok";
  return "weak";
}

function deriveDurationBucket(input: LearningUpdateInput): "fast" | "normal" | "slow" {
  const replans = input.replans_used ?? 0;
  const steps = input.steps_count ?? 0;
  if (replans >= 2 || steps > 15) return "slow";
  if (replans === 0 && steps <= 5) return "fast";
  return "normal";
}

function deriveFailureReason(input: LearningUpdateInput): FailureReason | null {
  if (input.verdict === "ACCEPT" || input.verdict === "ACCEPT_WITH_UNVERIFIED") {
    const bucket = deriveDurationBucket(input);
    if (bucket === "slow") return "too_slow";
    return null;
  }

  const underfilled = input.delivered < input.requested && input.requested > 0;
  if (underfilled) {
    return "underfilled_results";
  }

  if (
    input.gaps.includes("HARD_CONSTRAINT_UNKNOWN") ||
    input.gaps.includes("VERIFIED_WITHOUT_EVIDENCE") ||
    input.gaps.includes("RELATIONSHIP_EVIDENCE_MISSING") ||
    input.gaps.includes("RELATIONSHIP_VERIFICATION_NOT_ATTEMPTED")
  ) {
    return "weak_verification";
  }

  if (
    input.gaps.includes("HARD_CONSTRAINT_VIOLATED") ||
    input.stop_reason?.code === "HARD_CONSTRAINT_VIOLATED"
  ) {
    return "impossible_constraints";
  }

  return "other";
}

function buildLearningMetrics(input: LearningUpdateInput): LearningMetrics {
  return {
    requested_count: input.requested,
    returned_count: input.delivered,
    underfilled: input.delivered < input.requested && input.requested > 0,
    verification_quality_score: deriveVerificationQuality(input),
    cost_or_time_signal: {
      steps_count: input.steps_count,
      tool_calls: input.tool_calls,
      duration_bucket: deriveDurationBucket(input),
      replans_used: input.replans_used,
    },
    failure_reason: deriveFailureReason(input),
  };
}

function buildPolicyChanges(
  failureReason: FailureReason,
  input: LearningUpdateInput
): LearningFieldChange[] {
  const changes: LearningFieldChange[] = [];

  if (failureReason === "underfilled_results") {
    const currentBudget = input.current_search_budget_pages ?? 1;
    if (currentBudget < SEARCH_BUDGET_CAP) {
      changes.push({
        field: "search_budget_pages",
        before: currentBudget,
        after: Math.min(currentBudget + 1, SEARCH_BUDGET_CAP),
      });
    }
  }

  if (failureReason === "weak_verification") {
    const currentLevel = input.current_verification_level ?? "minimal";
    const levelMap: Record<string, string> = {
      minimal: "standard",
      standard: "strict",
    };
    const nextLevel = levelMap[currentLevel];
    if (nextLevel) {
      changes.push({
        field: "verification_level",
        before: currentLevel,
        after: nextLevel,
      });
    }
  }

  if (failureReason === "too_slow") {
    const currentLevel = input.current_verification_level ?? "standard";
    const levelDownMap: Record<string, string> = {
      strict: "standard",
      standard: "minimal",
    };
    const prevLevel = levelDownMap[currentLevel];
    if (prevLevel) {
      changes.push({
        field: "verification_level",
        before: currentLevel,
        after: prevLevel,
      });
    } else {
      const currentBudget = input.current_search_budget_pages ?? 2;
      if (currentBudget > SEARCH_BUDGET_FLOOR) {
        changes.push({
          field: "search_budget_pages",
          before: currentBudget,
          after: Math.max(currentBudget - 1, SEARCH_BUDGET_FLOOR),
        });
      }
    }
  }

  return changes;
}

function buildTowerReason(failureReason: FailureReason, input: LearningUpdateInput): string {
  switch (failureReason) {
    case "underfilled_results":
      return `Underfilled: delivered ${input.delivered}/${input.requested}. Increasing search budget.`;
    case "weak_verification":
      return `Weak verification detected (gaps: ${input.gaps.filter(g => g.includes("UNKNOWN") || g.includes("EVIDENCE") || g.includes("RELATIONSHIP")).join(", ")}). Escalating verification level.`;
    case "too_slow":
      return `ACCEPT but too slow (replans=${input.replans_used ?? 0}, steps=${input.steps_count ?? 0}). Reducing verification overhead.`;
    case "impossible_constraints":
      return `Impossible constraints detected. No policy change for MVP.`;
    case "other":
      return `Non-categorized failure. No policy change for MVP.`;
  }
}

export function evaluateLearningUpdate(input: LearningUpdateInput): LearningUpdateArtefact | null {
  if (!input.query_shape_key) return null;

  const metrics = buildLearningMetrics(input);
  const failureReason = metrics.failure_reason;

  if (input.verdict === "STOP") {
    return null;
  }

  if (input.verdict === "ACCEPT" || input.verdict === "ACCEPT_WITH_UNVERIFIED") {
    if (failureReason !== "too_slow") return null;
  }

  if (input.verdict === "CHANGE_PLAN") {
    if (failureReason !== "underfilled_results" && failureReason !== "weak_verification") return null;
  }

  if (!failureReason) return null;

  const changes = buildPolicyChanges(failureReason, input);
  if (changes.length === 0) return null;

  const reason = buildTowerReason(failureReason, input);

  console.log(
    `[TOWER_LEARNING] emit learning_update run_id=${input.run_id} ` +
    `verdict=${input.verdict} failure_reason=${failureReason} ` +
    `changes=${changes.map(c => `${c.field}:${c.before}->${c.after}`).join(",")}`
  );

  return {
    type: "learning_update",
    query_shape_key: input.query_shape_key,
    changed_fields: changes,
    tower_reason: reason,
    metrics_trigger: metrics,
    run_id: input.run_id,
  };
}
