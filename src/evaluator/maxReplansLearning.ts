import type { PolicyName } from "../../shared/schema";

export interface RunOutcome {
  run_id: string;
  outcome: "success" | "failure" | "partial";
  replans_used: number;
  max_replans: number;
  replan_helped: boolean;
  delivery_summary: "PASS" | "PARTIAL" | "STOP" | "FAIL";
  timestamp?: string;
}

export interface MaxReplansLearningInput {
  scope_key: string;
  run_outcomes: RunOutcome[];
  current_policy: {
    scope_key: string;
    policy_name: PolicyName;
    version: number;
    value: Record<string, any>;
  };
}

export type MaxReplansDecision = "INCREASE" | "DECREASE" | "NO_LEARN";

export interface MaxReplansLearningResult {
  decision: MaxReplansDecision;
  old_max_replans: number;
  new_max_replans: number;
  proposed_value: Record<string, any> | null;
  evidence_summary: Record<string, any>;
  reason: string;
  reason_codes: string[];
  confidence: number;
}

const MIN_SAMPLE_SIZE = 5;
const MAX_REPLANS_CAP = 3;
const MAX_REPLANS_FLOOR = 0;
const EXCEEDED_THRESHOLD = 0.30;
const HELPED_THRESHOLD = 0.50;
const WASTE_THRESHOLD = 0.60;
const RECENT_FAIL_WINDOW = 3;

function computeRates(outcomes: RunOutcome[]): {
  replan_helped_rate: number;
  waste_rate: number;
  exceeded_rate: number;
} {
  const total = outcomes.length;
  if (total === 0) {
    return { replan_helped_rate: 0, waste_rate: 0, exceeded_rate: 0 };
  }

  const helpedCount = outcomes.filter(o => o.replan_helped).length;
  const exceededCount = outcomes.filter(o => o.replans_used >= o.max_replans).length;

  const wasteCount = outcomes.filter(o => {
    return o.replans_used > 0 &&
      !o.replan_helped &&
      (o.delivery_summary === "FAIL" || o.delivery_summary === "STOP");
  }).length;

  return {
    replan_helped_rate: helpedCount / total,
    waste_rate: wasteCount / total,
    exceeded_rate: exceededCount / total,
  };
}

function checkGuardrails(input: MaxReplansLearningInput): {
  pass: boolean;
  reason_codes: string[];
  reason: string;
} {
  const codes: string[] = [];
  const reasons: string[] = [];

  if (input.run_outcomes.length < MIN_SAMPLE_SIZE) {
    codes.push("INSUFFICIENT_SAMPLE");
    reasons.push(`Only ${input.run_outcomes.length} runs; minimum ${MIN_SAMPLE_SIZE} required.`);
  }

  if (input.run_outcomes.length >= RECENT_FAIL_WINDOW) {
    const recent = input.run_outcomes.slice(-RECENT_FAIL_WINDOW);
    const allFail = recent.every(o =>
      o.delivery_summary === "FAIL" || o.outcome === "failure"
    );
    if (allFail) {
      codes.push("RECENT_ALL_FAIL");
      reasons.push("Last 3 runs all FAIL — blocking policy update to avoid compounding failure.");
    }
  }

  return {
    pass: codes.length === 0,
    reason_codes: codes,
    reason: reasons.join(" "),
  };
}

function computeConfidence(outcomes: RunOutcome[]): number {
  const n = outcomes.length;
  let confidence = 0;

  if (n >= 50) confidence += 40;
  else if (n >= 20) confidence += 30;
  else if (n >= MIN_SAMPLE_SIZE) confidence += 20;
  else confidence += 5;

  const passRate = outcomes.filter(o =>
    o.delivery_summary === "PASS" || o.outcome === "success"
  ).length / n;

  if (passRate >= 0.9) confidence += 30;
  else if (passRate >= 0.7) confidence += 20;
  else if (passRate >= 0.5) confidence += 10;

  const consistencyWindow = outcomes.slice(-5);
  const consistentOutcomes = consistencyWindow.length > 0 &&
    consistencyWindow.every(o => o.delivery_summary === consistencyWindow[0].delivery_summary);
  if (consistentOutcomes) confidence += 10;

  return Math.min(100, confidence);
}

export function evaluateMaxReplansLearning(input: MaxReplansLearningInput): MaxReplansLearningResult {
  const currentMaxReplans = input.current_policy.value.max_replans ?? 1;

  const guardrailCheck = checkGuardrails(input);
  if (!guardrailCheck.pass) {
    return {
      decision: "NO_LEARN",
      old_max_replans: currentMaxReplans,
      new_max_replans: currentMaxReplans,
      proposed_value: null,
      evidence_summary: {
        sample_size: input.run_outcomes.length,
        guardrail_blocked: true,
      },
      reason: guardrailCheck.reason,
      reason_codes: guardrailCheck.reason_codes,
      confidence: 0,
    };
  }

  const rates = computeRates(input.run_outcomes);
  const confidence = computeConfidence(input.run_outcomes);

  const evidence_summary = {
    sample_size: input.run_outcomes.length,
    replan_helped_rate: Math.round(rates.replan_helped_rate * 1000) / 1000,
    waste_rate: Math.round(rates.waste_rate * 1000) / 1000,
    exceeded_rate: Math.round(rates.exceeded_rate * 1000) / 1000,
    current_max_replans: currentMaxReplans,
    confidence,
  };

  if (rates.exceeded_rate >= EXCEEDED_THRESHOLD && rates.replan_helped_rate >= HELPED_THRESHOLD) {
    const newMaxReplans = Math.min(currentMaxReplans + 1, MAX_REPLANS_CAP);
    if (newMaxReplans === currentMaxReplans) {
      return {
        decision: "NO_LEARN",
        old_max_replans: currentMaxReplans,
        new_max_replans: currentMaxReplans,
        proposed_value: null,
        evidence_summary: { ...evidence_summary, at_cap: true },
        reason: `max_replans already at cap (${MAX_REPLANS_CAP}). No increase possible.`,
        reason_codes: ["AT_CAP"],
        confidence,
      };
    }
    return {
      decision: "INCREASE",
      old_max_replans: currentMaxReplans,
      new_max_replans: newMaxReplans,
      proposed_value: { ...input.current_policy.value, max_replans: newMaxReplans },
      evidence_summary,
      reason: `Exceeded rate ${(rates.exceeded_rate * 100).toFixed(1)}% >= ${EXCEEDED_THRESHOLD * 100}% and helped rate ${(rates.replan_helped_rate * 100).toFixed(1)}% >= ${HELPED_THRESHOLD * 100}%: increasing max_replans ${currentMaxReplans} → ${newMaxReplans}.`,
      reason_codes: ["EXCEEDED_HIGH", "HELPED_HIGH"],
      confidence,
    };
  }

  if (rates.waste_rate >= WASTE_THRESHOLD) {
    const newMaxReplans = Math.max(currentMaxReplans - 1, MAX_REPLANS_FLOOR);
    if (newMaxReplans === currentMaxReplans) {
      return {
        decision: "NO_LEARN",
        old_max_replans: currentMaxReplans,
        new_max_replans: currentMaxReplans,
        proposed_value: null,
        evidence_summary: { ...evidence_summary, at_floor: true },
        reason: `max_replans already at floor (${MAX_REPLANS_FLOOR}). No decrease possible.`,
        reason_codes: ["AT_FLOOR"],
        confidence,
      };
    }
    return {
      decision: "DECREASE",
      old_max_replans: currentMaxReplans,
      new_max_replans: newMaxReplans,
      proposed_value: { ...input.current_policy.value, max_replans: newMaxReplans },
      evidence_summary,
      reason: `Waste rate ${(rates.waste_rate * 100).toFixed(1)}% >= ${WASTE_THRESHOLD * 100}%: decreasing max_replans ${currentMaxReplans} → ${newMaxReplans}.`,
      reason_codes: ["WASTE_HIGH"],
      confidence,
    };
  }

  return {
    decision: "NO_LEARN",
    old_max_replans: currentMaxReplans,
    new_max_replans: currentMaxReplans,
    proposed_value: null,
    evidence_summary,
    reason: "No threshold met for update. Rates within acceptable range.",
    reason_codes: ["NO_THRESHOLD_MET"],
    confidence,
  };
}
