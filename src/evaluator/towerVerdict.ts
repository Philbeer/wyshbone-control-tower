export type TowerVerdictAction = "ACCEPT" | "RETRY" | "CHANGE_PLAN" | "STOP";

export interface TowerVerdict {
  verdict: TowerVerdictAction;
  delivered: number;
  requested: number;
  gaps: string[];
  confidence: number;
  rationale: string;
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
    [key: string]: unknown;
  };
  requested_count?: number;
  delivered_count?: number;
  delivered?: number;
  original_user_goal?: string;
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

  const result: TowerVerdict = {
    verdict,
    delivered: deliveredCount,
    requested: requestedCount,
    gaps,
    confidence,
    rationale,
  };

  console.log(
    `[TOWER] verdict=${result.verdict} delivered=${result.delivered} requested=${result.requested}`
  );

  return result;
}
