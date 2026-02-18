export type PlasticsVerdictAction = "ACCEPT" | "CHANGE_PLAN" | "STOP";

export interface PlasticsConstraints {
  max_scrap_percent: number;
  max_energy_kwh_per_good_part?: number;
  deadline_step?: number;
}

export interface PlasticsFactoryState {
  scrap_rate_now: number;
  achievable_scrap_floor?: number;
  defect_type?: string | string[];
  energy_kwh_per_good_part?: number;
  moisture_level?: number;
  tool_condition?: string;
  machine?: string;
  step?: number;
}

export interface PlasticsFactoryDecision {
  action: string;
  parameters?: Record<string, unknown>;
}

export interface PlasticsStepSnapshot {
  step: number;
  scrap_rate: number;
  defect_type?: string | string[];
  energy_kwh_per_good_part?: number;
  decision_action?: string;
  machine?: string;
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
  machine?: string;
  stop_reason?: { code: string; message: string; evidence?: Record<string, unknown> };
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

function normalizeDefectType(dt: string | string[] | undefined): string {
  if (!dt) return "";
  if (Array.isArray(dt)) return [...dt].sort().join(",");
  return dt;
}

function defectTypeLabel(dt: string | string[] | undefined): string {
  if (!dt) return "none";
  if (Array.isArray(dt)) return dt.join(", ");
  return dt;
}

function didDefectShiftAfterMitigation(history: PlasticsStepSnapshot[]): boolean {
  if (history.length < 2) return false;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const lastNorm = normalizeDefectType(last.defect_type);
  const prevNorm = normalizeDefectType(prev.defect_type);
  if (!lastNorm || !prevNorm) return false;
  if (prev.decision_action && lastNorm !== prevNorm) {
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
  const { scrap_rate_now, achievable_scrap_floor, machine } = factory_state;
  const steps = history ?? [];
  const machineLabel = machine ?? "unknown";

  if (
    achievable_scrap_floor != null &&
    max_scrap_percent < achievable_scrap_floor
  ) {
    const reason = `constraint impossible under current moisture/tool state — max_scrap_percent (${max_scrap_percent}%) is below achievable_scrap_floor (${achievable_scrap_floor}%)`;
    console.log(`[TOWER_PLASTICS] verdict=STOP reason=constraint_impossible step=${factory_state.step ?? "?"} machine=${machineLabel}`);
    return {
      verdict: "STOP",
      action: "stop",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 100,
      reason,
      gaps: ["CONSTRAINT_IMPOSSIBLE"],
      suggested_changes: ["reduce moisture or repair tooling before retrying"],
      step: factory_state.step,
      machine,
      stop_reason: {
        code: "CONSTRAINT_IMPOSSIBLE",
        message: reason,
        evidence: { max_scrap_percent, achievable_scrap_floor, scrap_rate_now },
      },
    };
  }

  if (scrap_rate_now >= 50) {
    const reason = `extreme scrap rate (${scrap_rate_now}%) — immediate stop required`;
    console.log(`[TOWER_PLASTICS] verdict=STOP reason=extreme_scrap step=${factory_state.step ?? "?"} machine=${machineLabel}`);
    return {
      verdict: "STOP",
      action: "stop",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 100,
      reason,
      gaps: ["EXTREME_SCRAP"],
      suggested_changes: ["halt production and investigate root cause"],
      step: factory_state.step,
      machine,
      stop_reason: {
        code: "EXTREME_SCRAP",
        message: reason,
        evidence: { scrap_rate_now },
      },
    };
  }

  if (constraints.deadline_step != null && factory_state.step != null) {
    const stepsLeft = constraints.deadline_step - factory_state.step;
    if (stepsLeft <= 0 && scrap_rate_now > max_scrap_percent) {
      const reason = `deadline reached at step ${factory_state.step} with scrap_rate (${scrap_rate_now}%) still above max (${max_scrap_percent}%)`;
      console.log(`[TOWER_PLASTICS] verdict=STOP reason=deadline_infeasible step=${factory_state.step} machine=${machineLabel}`);
      return {
        verdict: "STOP",
        action: "stop",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 95,
        reason,
        gaps: ["DEADLINE_INFEASIBLE"],
        suggested_changes: ["extend deadline or relax scrap constraint"],
        step: factory_state.step,
        machine,
        stop_reason: {
          code: "DEADLINE_INFEASIBLE",
          message: reason,
          evidence: { step: factory_state.step, deadline_step: constraints.deadline_step, scrap_rate_now, max_scrap_percent },
        },
      };
    }
  }

  if (scrap_rate_now > max_scrap_percent) {
    if (isScrapRisingForTwoSteps(steps)) {
      const reason = `Current machine (${machineLabel}) is unstable under these conditions; scrap rising for 2 consecutive steps (now ${scrap_rate_now}%, limit ${max_scrap_percent}%). Switch to alternate machine profile.`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=scrap_rising_2_steps step=${factory_state.step ?? "?"} machine=${machineLabel}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 90,
        reason,
        gaps: ["SCRAP_RISING_TREND", "MACHINE_UNSTABLE"],
        suggested_changes: ["switch to alternate machine profile"],
        step: factory_state.step,
        machine,
        stop_reason: {
          code: "SCRAP_RISING_TREND",
          message: reason,
          evidence: { scrap_rate_now, max_scrap_percent, machine: machineLabel },
        },
      };
    }

    if (didDefectShiftAfterMitigation(steps)) {
      const last = steps[steps.length - 1];
      const prev = steps[steps.length - 2];
      const reason = `Current machine (${machineLabel}) is unstable under these conditions; defect shifted from "${defectTypeLabel(prev.defect_type)}" to "${defectTypeLabel(last.defect_type)}" after mitigation, scrap still ${scrap_rate_now}%. Switch to alternate machine profile.`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=defect_shift step=${factory_state.step ?? "?"} machine=${machineLabel}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 85,
        reason,
        gaps: ["DEFECT_TYPE_SHIFTED", "MACHINE_UNSTABLE"],
        suggested_changes: ["switch to alternate machine profile"],
        step: factory_state.step,
        machine,
        stop_reason: {
          code: "DEFECT_TYPE_SHIFTED",
          message: reason,
          evidence: { from_defect: defectTypeLabel(prev.defect_type), to_defect: defectTypeLabel(last.defect_type), scrap_rate_now, machine: machineLabel },
        },
      };
    }

    const decisionIsContinue =
      factory_decision?.action === "continue" ||
      factory_decision?.action === "no_change";
    const repeating = isRepeatingFailingAction(steps, factory_decision);

    if (decisionIsContinue || repeating) {
      const reason = repeating
        ? `Current machine (${machineLabel}) is unstable under these conditions; repeating failing action "${factory_decision?.action}" while scrap_rate (${scrap_rate_now}%) exceeds max (${max_scrap_percent}%). Switch to alternate machine profile.`
        : `Current machine (${machineLabel}) is unstable under these conditions; decision is "${factory_decision?.action}" but scrap_rate (${scrap_rate_now}%) exceeds max (${max_scrap_percent}%). Switch to alternate machine profile.`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=continue_while_failing step=${factory_state.step ?? "?"} machine=${machineLabel}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 90,
        reason,
        gaps: ["DECISION_INEFFECTIVE", "MACHINE_UNSTABLE"],
        suggested_changes: ["switch to alternate machine profile"],
        step: factory_state.step,
        machine,
        stop_reason: {
          code: "DECISION_INEFFECTIVE",
          message: reason,
          evidence: { decision_action: factory_decision?.action, scrap_rate_now, max_scrap_percent, machine: machineLabel },
        },
      };
    }

    const reason = `scrap_rate (${scrap_rate_now}%) exceeds max (${max_scrap_percent}%) but active mitigation in progress`;
    console.log(`[TOWER_PLASTICS] verdict=ACCEPT reason=mitigation_in_progress step=${factory_state.step ?? "?"} machine=${machineLabel}`);
    return {
      verdict: "ACCEPT",
      action: "continue",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 60,
      reason,
      gaps: ["SCRAP_ABOVE_TARGET"],
      suggested_changes: [],
      step: factory_state.step,
      machine,
    };
  }

  if (scrap_rate_now <= max_scrap_percent) {
    if (isScrapRisingForTwoSteps(steps)) {
      const reason = `Current machine (${machineLabel}) is unstable under these conditions; scrap rising for 2 steps (now ${scrap_rate_now}%, limit ${max_scrap_percent}%). Switch to alternate machine profile.`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=rising_trend_within_limit step=${factory_state.step ?? "?"} machine=${machineLabel}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 75,
        reason,
        gaps: ["SCRAP_RISING_TREND", "MACHINE_UNSTABLE"],
        suggested_changes: ["switch to alternate machine profile"],
        step: factory_state.step,
        machine,
        stop_reason: {
          code: "SCRAP_RISING_TREND",
          message: reason,
          evidence: { scrap_rate_now, max_scrap_percent, machine: machineLabel },
        },
      };
    }

    if (didDefectShiftAfterMitigation(steps)) {
      const last = steps[steps.length - 1];
      const prev = steps[steps.length - 2];
      const reason = `Current machine (${machineLabel}) is unstable under these conditions; defect shifted from "${defectTypeLabel(prev.defect_type)}" to "${defectTypeLabel(last.defect_type)}" after mitigation, scrap ${scrap_rate_now}%. Switch to alternate machine profile.`;
      console.log(`[TOWER_PLASTICS] verdict=CHANGE_PLAN reason=defect_shift_within_limit step=${factory_state.step ?? "?"} machine=${machineLabel}`);
      return {
        verdict: "CHANGE_PLAN",
        action: "change_plan",
        scrap_rate_now,
        max_scrap_percent,
        confidence: 70,
        reason,
        gaps: ["DEFECT_TYPE_SHIFTED", "MACHINE_UNSTABLE"],
        suggested_changes: ["switch to alternate machine profile"],
        step: factory_state.step,
        machine,
        stop_reason: {
          code: "DEFECT_TYPE_SHIFTED",
          message: reason,
          evidence: { from_defect: defectTypeLabel(prev.defect_type), to_defect: defectTypeLabel(last.defect_type), scrap_rate_now, machine: machineLabel },
        },
      };
    }

    if (!isScrapWorsening(steps) || steps.length < 2) {
      const reason = `scrap_rate (${scrap_rate_now}%) within limit (${max_scrap_percent}%) and not worsening — on track`;
      console.log(`[TOWER_PLASTICS] verdict=ACCEPT reason=within_limit step=${factory_state.step ?? "?"} machine=${machineLabel}`);
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
        machine,
      };
    }

    const reason = `scrap_rate (${scrap_rate_now}%) within limit (${max_scrap_percent}%) but slightly worsening — monitor closely`;
    console.log(`[TOWER_PLASTICS] verdict=ACCEPT reason=within_limit_slight_rise step=${factory_state.step ?? "?"} machine=${machineLabel}`);
    return {
      verdict: "ACCEPT",
      action: "continue",
      scrap_rate_now,
      max_scrap_percent,
      confidence: 75,
      reason,
      gaps: ["SLIGHT_WORSENING"],
      suggested_changes: [],
      step: factory_state.step,
      machine,
    };
  }

  console.log(`[TOWER_PLASTICS] verdict=STOP reason=fallback step=${factory_state.step ?? "?"} machine=${machineLabel}`);
  return {
    verdict: "STOP",
    action: "stop",
    scrap_rate_now,
    max_scrap_percent,
    confidence: 50,
    reason: "unable to determine verdict from current state",
    gaps: ["UNKNOWN_STATE"],
    suggested_changes: [],
    step: factory_state.step,
    machine,
    stop_reason: {
      code: "UNKNOWN_STATE",
      message: "unable to determine verdict from current state",
      evidence: { scrap_rate_now, max_scrap_percent, machine: machineLabel },
    },
  };
}
