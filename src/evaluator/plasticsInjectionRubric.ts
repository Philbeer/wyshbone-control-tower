export type PlasticsVerdictAction = "ACCEPT" | "CHANGE_PLAN" | "STOP";

export interface PlasticsConstraints {
  max_scrap_percent: number;
  max_energy_kwh_per_good_part?: number;
  deadline_step?: number;
}

export interface PlasticsFactoryState {
  scrap_rate_now: number;
  achievable_scrap_floor?: number;
  defect_type?: string;
  energy_kwh_per_good_part?: number;
  moisture_level?: number;
  tool_condition?: string;
  step?: number;
}

export interface PlasticsFactoryDecision {
  action: string;
  parameters?: Record<string, unknown>;
}

export interface PlasticsStepSnapshot {
  step: number;
  scrap_rate: number;
  defect_type?: string;
  energy_kwh_per_good_part?: number;
  decision_action?: string;
}

export interface PlasticsRubricInput {
  constraints: PlasticsConstraints;
  factory_state: PlasticsFactoryState;
  factory_decision?: PlasticsFactoryDecision;
  history?: PlasticsStepSnapshot[];
}

export interface PlasticsTowerJudgement {
  verdict: PlasticsVerdictAction;
  action: "continue" | "stop" | "change_plan";
  scrap_rate_now: number;
  max_scrap_percent: number;
  confidence: number;
  reason: string;
  gaps: string[];
  suggested_changes: string[];
  step?: number;
}

function verdictToAction(verdict: PlasticsVerdictAction): "continue" | "stop" | "change_plan" {
  if (verdict === "ACCEPT") return "continue";
  if (verdict === "CHANGE_PLAN") return "change_plan";
  return "stop";
}

function isScrapWorsening(history: PlasticsStepSnapshot[]): boolean {
  if (history.length < 2) return false;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  return last.scrap_rate > prev.scrap_rate;
}

function isScrapRisingForTwoSteps(history: PlasticsStepSnapshot[]): boolean {
  if (history.length < 3) return false;
  const h = history.slice(-3);
  return h[2].scrap_rate > h[1].scrap_rate && h[1].scrap_rate > h[0].scrap_rate;
}

function didDefectShiftAfterMitigation(history: PlasticsStepSnapshot[]): boolean {
  if (history.length < 2) return false;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (!last.defect_type || !prev.defect_type) return false;
  if (prev.decision_action && last.defect_type !== prev.defect_type) {
    return true;
  }
  return false;
}

function isRepeatingFailingAction(history: PlasticsStepSnapshot[], currentDecision?: PlasticsFactoryDecision): boolean {
  if (!currentDecision || history.length < 1) return false;
  const lastStep = history[history.length - 1];
  if (
    lastStep.decision_action === currentDecision.action &&
    lastStep.scrap_rate > 0
  ) {
    return true;
  }
  return false;
}

export function judgePlasticsInjection(input: PlasticsRubricInput): PlasticsTowerJudgement {
  const { constraints, factory_state, factory_decision, history } = input;
  const { max_scrap_percent } = constraints;
  const { scrap_rate_now, achievable_scrap_floor } = factory_state;
  const steps = history ?? [];
  const gaps: string[] = [];
  const suggested_changes: string[] = [];

  if (
    achievable_scrap_floor != null &&
    max_scrap_percent < achievable_scrap_floor
  ) {
    const reason = `constraint impossible under current moisture/tool state — max_scrap_percent (${max_scrap_percent}%) is below achievable_scrap_floor (${achievable_scrap_floor}%)`;
    console.log(`[TOWER_PLASTICS] verdict=STOP reason=constraint_impossible step=${factory_state.step ?? "?"}`);
    return {
      verdict: "STOP",
      action: "stop",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 100,
      reason,
      gaps: ["constraint_impossible"],
      suggested_changes: ["reduce moisture or repair tooling before retrying"],
      step: factory_state.step,
    };
  }

  if (scrap_rate_now >= 50) {
    const reason = `extreme scrap rate (${scrap_rate_now}%) — immediate stop required`;
    console.log(`[TOWER_PLASTICS] verdict=STOP reason=extreme_scrap step=${factory_state.step ?? "?"}`);
    return {
      verdict: "STOP",
      action: "stop",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 100,
      reason,
      gaps: ["extreme_scrap"],
      suggested_changes: ["halt production and investigate root cause"],
      step: factory_state.step,
    };
  }

  if (constraints.deadline_step != null && factory_state.step != null) {
    const stepsLeft = constraints.deadline_step - factory_state.step;
    if (stepsLeft <= 0 && scrap_rate_now > max_scrap_percent) {
      const reason = `deadline reached at step ${factory_state.step} with scrap_rate (${scrap_rate_now}%) still above max (${max_scrap_percent}%)`;
      console.log(`[TOWER_PLASTICS] verdict=STOP reason=deadline_infeasible step=${factory_state.step}`);
      return {
        verdict: "STOP",
        action: "stop",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 95,
        reason,
        gaps: ["deadline_infeasible"],
        suggested_changes: ["extend deadline or relax scrap constraint"],
        step: factory_state.step,
      };
    }
  }

  if (scrap_rate_now > max_scrap_percent) {
    if (isScrapRisingForTwoSteps(steps)) {
      const reason = `scrap_rate rising for 2 consecutive steps (now ${scrap_rate_now}%, limit ${max_scrap_percent}%) — current approach is not working`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=scrap_rising_2_steps step=${factory_state.step ?? "?"}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 90,
        reason,
        gaps: ["scrap_rising_trend"],
        suggested_changes: ["try a different mitigation strategy"],
        step: factory_state.step,
      };
    }

    if (didDefectShiftAfterMitigation(steps)) {
      const last = steps[steps.length - 1];
      const prev = steps[steps.length - 2];
      const reason = `defect shifted from "${prev.defect_type}" to "${last.defect_type}" after mitigation — side effect detected, scrap still ${scrap_rate_now}%`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=defect_shift step=${factory_state.step ?? "?"}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 85,
        reason,
        gaps: ["defect_type_shifted"],
        suggested_changes: ["address the new defect type rather than repeating previous fix"],
        step: factory_state.step,
      };
    }

    const decisionIsContinue =
      factory_decision?.action === "continue" ||
      factory_decision?.action === "no_change";
    const repeating = isRepeatingFailingAction(steps, factory_decision);

    if (decisionIsContinue || repeating) {
      const reason = repeating
        ? `repeating failing action "${factory_decision?.action}" while scrap_rate (${scrap_rate_now}%) exceeds max (${max_scrap_percent}%)`
        : `decision is "${factory_decision?.action}" but scrap_rate (${scrap_rate_now}%) exceeds max (${max_scrap_percent}%) — plan must change`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=continue_while_failing step=${factory_state.step ?? "?"}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 90,
        reason,
        gaps: ["decision_ineffective"],
        suggested_changes: ["change mitigation approach — current action is not reducing scrap"],
        step: factory_state.step,
      };
    }

    const reason = `scrap_rate (${scrap_rate_now}%) exceeds max (${max_scrap_percent}%) but active mitigation in progress`;
    console.log(`[TOWER_PLASTICS] verdict=ACCEPT reason=mitigation_in_progress step=${factory_state.step ?? "?"}`);
    return {
      verdict: "ACCEPT",
      action: "continue",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 60,
      reason,
      gaps: ["scrap_above_target"],
      suggested_changes: [],
      step: factory_state.step,
    };
  }

  if (scrap_rate_now <= max_scrap_percent) {
    if (isScrapRisingForTwoSteps(steps)) {
      const reason = `scrap_rate rising for 2 steps (now ${scrap_rate_now}%) — still within limit (${max_scrap_percent}%) but trend is concerning`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=rising_trend_within_limit step=${factory_state.step ?? "?"}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 75,
        reason,
        gaps: ["scrap_rising_trend"],
        suggested_changes: ["adjust parameters to arrest rising trend before it exceeds limit"],
        step: factory_state.step,
      };
    }

    if (didDefectShiftAfterMitigation(steps)) {
      const last = steps[steps.length - 1];
      const prev = steps[steps.length - 2];
      const reason = `defect shifted from "${prev.defect_type}" to "${last.defect_type}" after mitigation — new issue emerging, scrap ${scrap_rate_now}%`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=defect_shift_within_limit step=${factory_state.step ?? "?"}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 70,
        reason,
        gaps: ["defect_type_shifted"],
        suggested_changes: ["investigate and address the new defect type"],
        step: factory_state.step,
      };
    }

    if (!isScrapWorsening(steps) || steps.length < 2) {
      const reason = `scrap_rate (${scrap_rate_now}%) within limit (${max_scrap_percent}%) and not worsening — on track`;
      console.log(`[TOWER_PLASTICS] verdict=ACCEPT reason=within_limit step=${factory_state.step ?? "?"}`);
      return {
        verdict: "ACCEPT",
        action: "continue",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 90,
        reason,
        gaps: [],
        suggested_changes: [],
        step: factory_state.step,
      };
    }

    const reason = `scrap_rate (${scrap_rate_now}%) within limit (${max_scrap_percent}%) but slightly worsening — monitor closely`;
    console.log(`[TOWER_PLASTICS] verdict=ACCEPT reason=within_limit_slight_rise step=${factory_state.step ?? "?"}`);
    return {
      verdict: "ACCEPT",
      action: "continue",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 75,
      reason,
      gaps: ["slight_worsening"],
      suggested_changes: [],
      step: factory_state.step,
    };
  }

  console.log(`[TOWER_PLASTICS] verdict=STOP reason=fallback step=${factory_state.step ?? "?"}`);
  return {
    verdict: "STOP",
    action: "stop",
    scrap_rate_now,
    max_scrap_percent,
    confidence: 50,
    reason: "unable to determine verdict from current state",
    gaps: ["unknown_state"],
    suggested_changes: [],
    step: factory_state.step,
  };
}
