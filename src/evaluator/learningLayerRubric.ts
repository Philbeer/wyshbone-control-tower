import type { PolicyName } from "../../shared/schema";

export interface DecisionLogEntry {
  run_id: string;
  step: number;
  action: string;
  parameters?: Record<string, any>;
  timestamp?: string;
}

export interface OutcomeLogEntry {
  run_id: string;
  step: number;
  outcome: "success" | "failure" | "partial";
  metrics?: Record<string, any>;
  timestamp?: string;
}

export interface TelemetrySummary {
  total_runs: number;
  success_count: number;
  failure_count: number;
  avg_duration_ms?: number;
  avg_cost?: number;
  outcome_delta?: number;
  sample_window_hours?: number;
}

export interface PolicySnapshot {
  scope_key: string;
  policy_name: PolicyName;
  version: number;
  value: Record<string, any>;
}

export interface LearningLayerInput {
  scope_key: string;
  policy_name: PolicyName;
  decision_log: DecisionLogEntry[];
  outcome_log: OutcomeLogEntry[];
  telemetry: TelemetrySummary;
  current_policy: PolicySnapshot;
  proposed_value?: Record<string, any>;
  run_id?: string;
}

export type LearningVerdict = "ALLOW" | "DENY";

export interface LearningRubricResult {
  verdict: LearningVerdict;
  confidence: number;
  reason: string;
  evidence_summary: Record<string, any>;
  proposed_value: Record<string, any> | null;
  deny_code?: string;
}

const MIN_SAMPLE_SIZE = 5;
const MIN_SUCCESS_RATE = 0.6;
const MAX_RADIUS_DELTA_KM = 10;
const MAX_STOP_TIGHTEN_PERCENT = 0.5;
const MIN_CONFIDENCE_THRESHOLD = 40;

function computeSuccessRate(telemetry: TelemetrySummary): number {
  if (telemetry.total_runs === 0) return 0;
  return telemetry.success_count / telemetry.total_runs;
}

function computeFailureRate(telemetry: TelemetrySummary): number {
  if (telemetry.total_runs === 0) return 0;
  return telemetry.failure_count / telemetry.total_runs;
}

function computeConfidence(telemetry: TelemetrySummary, outcomeLog: OutcomeLogEntry[]): number {
  let confidence = 0;

  const sampleSize = telemetry.total_runs;
  if (sampleSize >= 50) confidence += 40;
  else if (sampleSize >= 20) confidence += 30;
  else if (sampleSize >= MIN_SAMPLE_SIZE) confidence += 20;
  else confidence += 5;

  const successRate = computeSuccessRate(telemetry);
  if (successRate >= 0.9) confidence += 30;
  else if (successRate >= 0.7) confidence += 20;
  else if (successRate >= MIN_SUCCESS_RATE) confidence += 10;

  if (telemetry.outcome_delta != null && telemetry.outcome_delta > 0) {
    confidence += Math.min(20, Math.round(telemetry.outcome_delta * 100));
  }

  const outcomeConsistency = outcomeLog.length > 0
    ? outcomeLog.filter(o => o.outcome === "success").length / outcomeLog.length
    : 0;
  if (outcomeConsistency >= 0.8) confidence += 10;

  return Math.min(100, confidence);
}

function validateEvidence(input: LearningLayerInput): { valid: boolean; deny_code: string; reason: string } {
  if (!input.decision_log || input.decision_log.length === 0) {
    return { valid: false, deny_code: "MISSING_DECISION_LOG", reason: "No decision_log entries provided." };
  }
  if (!input.outcome_log || input.outcome_log.length === 0) {
    return { valid: false, deny_code: "MISSING_OUTCOME_LOG", reason: "No outcome_log entries provided." };
  }
  if (!input.telemetry || input.telemetry.total_runs == null) {
    return { valid: false, deny_code: "MISSING_TELEMETRY", reason: "Telemetry summary is missing or incomplete." };
  }
  if (!input.current_policy || !input.current_policy.value) {
    return { valid: false, deny_code: "MISSING_CURRENT_POLICY", reason: "Current policy snapshot is missing." };
  }
  return { valid: true, deny_code: "", reason: "" };
}

function checkSampleSize(telemetry: TelemetrySummary): { pass: boolean; deny_code: string; reason: string } {
  if (telemetry.total_runs < MIN_SAMPLE_SIZE) {
    return {
      pass: false,
      deny_code: "INSUFFICIENT_SAMPLE",
      reason: `Only ${telemetry.total_runs} runs observed; minimum ${MIN_SAMPLE_SIZE} required.`,
    };
  }
  return { pass: true, deny_code: "", reason: "" };
}

function checkSuccessRate(telemetry: TelemetrySummary): { pass: boolean; deny_code: string; reason: string } {
  const rate = computeSuccessRate(telemetry);
  if (rate < MIN_SUCCESS_RATE) {
    return {
      pass: false,
      deny_code: "LOW_SUCCESS_RATE",
      reason: `Success rate ${(rate * 100).toFixed(1)}% is below minimum ${(MIN_SUCCESS_RATE * 100).toFixed(1)}%.`,
    };
  }
  return { pass: true, deny_code: "", reason: "" };
}

function checkCriticalRegressions(outcomeLog: OutcomeLogEntry[]): { pass: boolean; deny_code: string; reason: string } {
  if (outcomeLog.length < 3) return { pass: true, deny_code: "", reason: "" };

  const recent = outcomeLog.slice(-3);
  const allFailed = recent.every(o => o.outcome === "failure");
  if (allFailed) {
    return {
      pass: false,
      deny_code: "CRITICAL_REGRESSION",
      reason: "Last 3 outcomes are all failures — possible regression detected.",
    };
  }
  return { pass: true, deny_code: "", reason: "" };
}

function deriveProposedValue(input: LearningLayerInput): Record<string, any> | null {
  if (input.proposed_value) return input.proposed_value;

  const current = input.current_policy.value;
  const successRate = computeSuccessRate(input.telemetry);
  const failureRate = computeFailureRate(input.telemetry);

  switch (input.policy_name) {
    case "radius_policy_v1": {
      const currentRadius = current.radius_km ?? current.default_radius_km ?? 5;
      if (failureRate > 0.3 && currentRadius < 50) {
        const newRadius = Math.min(currentRadius + 5, currentRadius + MAX_RADIUS_DELTA_KM);
        return { ...current, radius_km: newRadius };
      }
      if (successRate > 0.85 && currentRadius > 3) {
        const newRadius = Math.max(currentRadius - 2, 1);
        return { ...current, radius_km: newRadius };
      }
      return null;
    }

    case "enrichment_policy_v1": {
      const currentSteps = current.enrichment_steps ?? current.steps ?? [];
      if (failureRate > 0.3 && Array.isArray(currentSteps)) {
        const hasVerify = currentSteps.includes("verify_address");
        if (!hasVerify) {
          return { ...current, enrichment_steps: [...currentSteps, "verify_address"] };
        }
      }
      if (successRate > 0.9 && Array.isArray(currentSteps) && currentSteps.length > 1) {
        return { ...current, enrichment_steps: currentSteps };
      }
      return null;
    }

    case "stop_policy_v1": {
      const currentMaxSteps = current.max_steps ?? current.step_limit ?? 20;
      const currentMaxFailures = current.max_failures ?? 10;
      if (failureRate > 0.4 && currentMaxFailures > 3) {
        const newMaxFailures = Math.max(
          Math.round(currentMaxFailures * (1 - MAX_STOP_TIGHTEN_PERCENT)),
          3
        );
        return { ...current, max_failures: newMaxFailures };
      }
      if (successRate > 0.85 && currentMaxSteps < 50) {
        return { ...current, max_steps: currentMaxSteps + 5 };
      }
      return null;
    }

    default:
      return null;
  }
}

function checkMagnitude(
  policyName: PolicyName,
  currentValue: Record<string, any>,
  proposedValue: Record<string, any>
): { pass: boolean; deny_code: string; reason: string } {
  switch (policyName) {
    case "radius_policy_v1": {
      const oldR = currentValue.radius_km ?? currentValue.default_radius_km ?? 0;
      const newR = proposedValue.radius_km ?? proposedValue.default_radius_km ?? oldR;
      const delta = Math.abs(newR - oldR);
      if (delta > MAX_RADIUS_DELTA_KM) {
        return {
          pass: false,
          deny_code: "MAGNITUDE_EXCEEDED",
          reason: `Radius change of ${delta}km exceeds maximum allowed delta of ${MAX_RADIUS_DELTA_KM}km.`,
        };
      }
      break;
    }

    case "stop_policy_v1": {
      const oldF = currentValue.max_failures ?? 10;
      const newF = proposedValue.max_failures ?? oldF;
      if (newF < oldF) {
        const reduction = (oldF - newF) / oldF;
        if (reduction > MAX_STOP_TIGHTEN_PERCENT) {
          return {
            pass: false,
            deny_code: "MAGNITUDE_EXCEEDED",
            reason: `Stop policy tightening of ${(reduction * 100).toFixed(0)}% exceeds max ${(MAX_STOP_TIGHTEN_PERCENT * 100).toFixed(0)}%.`,
          };
        }
      }
      break;
    }

    case "enrichment_policy_v1": {
      const oldSteps = currentValue.enrichment_steps ?? currentValue.steps ?? [];
      const newSteps = proposedValue.enrichment_steps ?? proposedValue.steps ?? [];
      if (Array.isArray(oldSteps) && Array.isArray(newSteps)) {
        const removed = oldSteps.filter((s: string) => !newSteps.includes(s));
        if (removed.length > 0) {
          return {
            pass: false,
            deny_code: "ENRICHMENT_STEPS_REMOVED",
            reason: `Enrichment steps removed: ${removed.join(", ")}. Only additive changes allowed.`,
          };
        }
      }
      break;
    }
  }

  return { pass: true, deny_code: "", reason: "" };
}

export function evaluateLearningLayer(input: LearningLayerInput): LearningRubricResult {
  const evidenceCheck = validateEvidence(input);
  if (!evidenceCheck.valid) {
    return {
      verdict: "DENY",
      confidence: 0,
      reason: evidenceCheck.reason,
      evidence_summary: { check: "evidence_completeness", input_policy: input.policy_name },
      proposed_value: null,
      deny_code: evidenceCheck.deny_code,
    };
  }

  const sampleCheck = checkSampleSize(input.telemetry);
  if (!sampleCheck.pass) {
    return {
      verdict: "DENY",
      confidence: 0,
      reason: sampleCheck.reason,
      evidence_summary: {
        total_runs: input.telemetry.total_runs,
        min_required: MIN_SAMPLE_SIZE,
      },
      proposed_value: null,
      deny_code: sampleCheck.deny_code,
    };
  }

  const regressionCheck = checkCriticalRegressions(input.outcome_log);
  if (!regressionCheck.pass) {
    return {
      verdict: "DENY",
      confidence: computeConfidence(input.telemetry, input.outcome_log),
      reason: regressionCheck.reason,
      evidence_summary: {
        total_runs: input.telemetry.total_runs,
        last_outcomes: input.outcome_log.slice(-3).map(o => o.outcome),
      },
      proposed_value: null,
      deny_code: regressionCheck.deny_code,
    };
  }

  const successCheck = checkSuccessRate(input.telemetry);
  const proposedValue = deriveProposedValue(input);

  if (!proposedValue) {
    const reason = successCheck.pass
      ? "No policy change derived from current evidence — metrics are within acceptable range."
      : successCheck.reason;
    return {
      verdict: "DENY",
      confidence: computeConfidence(input.telemetry, input.outcome_log),
      reason,
      evidence_summary: {
        total_runs: input.telemetry.total_runs,
        success_rate: computeSuccessRate(input.telemetry),
        failure_rate: computeFailureRate(input.telemetry),
        outcome_delta: input.telemetry.outcome_delta,
      },
      proposed_value: null,
      deny_code: successCheck.pass ? "NO_CHANGE_NEEDED" : successCheck.deny_code,
    };
  }

  const magnitudeCheck = checkMagnitude(input.policy_name, input.current_policy.value, proposedValue);
  if (!magnitudeCheck.pass) {
    return {
      verdict: "DENY",
      confidence: computeConfidence(input.telemetry, input.outcome_log),
      reason: magnitudeCheck.reason,
      evidence_summary: {
        total_runs: input.telemetry.total_runs,
        old_value: input.current_policy.value,
        proposed_value: proposedValue,
      },
      proposed_value: proposedValue,
      deny_code: magnitudeCheck.deny_code,
    };
  }

  const confidence = computeConfidence(input.telemetry, input.outcome_log);
  if (confidence < MIN_CONFIDENCE_THRESHOLD) {
    return {
      verdict: "DENY",
      confidence,
      reason: `Confidence ${confidence}% is below minimum threshold of ${MIN_CONFIDENCE_THRESHOLD}%.`,
      evidence_summary: {
        total_runs: input.telemetry.total_runs,
        success_rate: computeSuccessRate(input.telemetry),
        confidence,
      },
      proposed_value: proposedValue,
      deny_code: "LOW_CONFIDENCE",
    };
  }

  return {
    verdict: "ALLOW",
    confidence,
    reason: `Policy update approved: ${input.policy_name} for scope ${input.scope_key} (v${input.current_policy.version} → v${input.current_policy.version + 1}).`,
    evidence_summary: {
      total_runs: input.telemetry.total_runs,
      success_rate: computeSuccessRate(input.telemetry),
      failure_rate: computeFailureRate(input.telemetry),
      outcome_delta: input.telemetry.outcome_delta,
      sample_window_hours: input.telemetry.sample_window_hours,
      decision_log_count: input.decision_log.length,
      outcome_log_count: input.outcome_log.length,
    },
    proposed_value: proposedValue,
  };
}
