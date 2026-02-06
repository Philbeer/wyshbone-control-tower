import type {
  JudgementSuccess,
  JudgementSnapshot,
  JudgementResponse,
  JudgementVerdict,
  JudgementReasonCode,
} from "../../shared/schema";

export function evaluate(
  success: JudgementSuccess,
  snapshot: JudgementSnapshot
): JudgementResponse {
  let verdict: JudgementVerdict;
  let reason_code: JudgementReasonCode;
  let explanation: string;
  let strategy: JudgementResponse["strategy"] | undefined;

  const costPerLead =
    snapshot.leads_found > 0
      ? snapshot.total_cost_gbp / snapshot.leads_found
      : null;

  if (
    snapshot.leads_found >= success.target_leads &&
    snapshot.avg_quality_score >= success.min_quality_score &&
    snapshot.total_cost_gbp <= success.max_cost_gbp
  ) {
    verdict = "STOP";
    reason_code = "SUCCESS_ACHIEVED";
    explanation = `Target met: ${snapshot.leads_found}/${success.target_leads} leads found with quality ${snapshot.avg_quality_score.toFixed(2)} (min ${success.min_quality_score}) and cost £${snapshot.total_cost_gbp.toFixed(2)} within £${success.max_cost_gbp.toFixed(2)} budget.`;
  } else if (snapshot.total_cost_gbp > success.max_cost_gbp) {
    verdict = "STOP";
    reason_code = "COST_EXCEEDED";
    explanation = `Total cost £${snapshot.total_cost_gbp.toFixed(2)} exceeds budget of £${success.max_cost_gbp.toFixed(2)}. ${snapshot.leads_found} leads found so far.`;
  } else if (
    costPerLead !== null &&
    costPerLead > success.max_cost_per_lead_gbp
  ) {
    verdict = "STOP";
    reason_code = "CPL_EXCEEDED";
    explanation = `Cost per lead £${costPerLead.toFixed(2)} exceeds limit of £${success.max_cost_per_lead_gbp.toFixed(2)}. ${snapshot.leads_found} leads at £${snapshot.total_cost_gbp.toFixed(2)} total.`;
  } else if (snapshot.failures_count > success.max_failures) {
    verdict = "STOP";
    reason_code = "FAILURES_EXCEEDED";
    explanation = `Failure count ${snapshot.failures_count} exceeds threshold of ${success.max_failures}.${snapshot.last_error_code ? ` Last error: ${snapshot.last_error_code}.` : ""}`;
  } else if (snapshot.leads_new_last_window < success.stall_min_delta_leads) {
    verdict = "STOP";
    reason_code = "STALL_DETECTED";
    explanation = `Only ${snapshot.leads_new_last_window} new leads in the last ${success.stall_window_steps}-step window, below minimum of ${success.stall_min_delta_leads}. Run appears stalled.`;
  } else {
    verdict = "CONTINUE";
    reason_code = "RUNNING";
    explanation = `Run progressing: ${snapshot.leads_found}/${success.target_leads} leads, £${snapshot.total_cost_gbp.toFixed(2)}/£${success.max_cost_gbp.toFixed(2)} budget, step ${snapshot.steps_completed}/${success.max_steps}.`;
  }

  return {
    verdict,
    reason_code,
    explanation,
    ...(strategy ? { strategy } : {}),
    evaluated_at: new Date().toISOString(),
  };
}
