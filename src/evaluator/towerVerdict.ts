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
}

export function judgeLeadsList(input: TowerVerdictInput): TowerVerdict {
  const requestedCount = input.success_criteria?.target_count ?? 20;

  if (!input.leads || !Array.isArray(input.leads)) {
    const verdict: TowerVerdict = {
      verdict: "STOP",
      delivered: 0,
      requested: requestedCount,
      gaps: ["invalid_artefact"],
      confidence: 100,
      rationale: `Leads array is missing or malformed. Cannot evaluate artefact.`,
    };
    console.log(
      `[TOWER] verdict=${verdict.verdict} delivered=${verdict.delivered} requested=${verdict.requested}`
    );
    return verdict;
  }

  const delivered = input.leads.length;
  const ratio = requestedCount > 0 ? delivered / requestedCount : 0;

  let verdict: TowerVerdictAction;
  let gaps: string[] = [];
  let confidence: number;
  let rationale: string;

  if (delivered >= requestedCount) {
    verdict = "ACCEPT";
    confidence = Math.min(95, Math.round(80 + (ratio - 1) * 15));
    if (confidence < 80) confidence = 80;
    gaps = [];
    rationale = `Delivered ${delivered} leads, meeting or exceeding the requested ${requestedCount}. Artefact accepted.`;
  } else if (ratio >= 0.5) {
    verdict = "CHANGE_PLAN";
    confidence = Math.round(50 + ratio * 30);
    gaps = ["insufficient_count"];
    rationale = `Delivered ${delivered} of ${requestedCount} requested leads (${Math.round(ratio * 100)}%). Consider adjusting search parameters or broadening criteria.`;
  } else {
    verdict = "RETRY";
    confidence = Math.round(30 + ratio * 40);
    gaps = ["very_low_count"];
    rationale = `Delivered only ${delivered} of ${requestedCount} requested leads (${Math.round(ratio * 100)}%). Recommend retrying with current or adjusted parameters.`;
  }

  const result: TowerVerdict = {
    verdict,
    delivered,
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
