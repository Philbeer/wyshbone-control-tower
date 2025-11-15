import { executeInvestigation } from "./executeInvestigation";
import { getRunById } from "./runStore";
import type { Investigation, InvestigationTrigger } from "./types";

export async function createInvestigationForRun(params: {
  runId: string;
  trigger?: InvestigationTrigger;
  notes?: string;
}): Promise<Investigation> {
  const run = await getRunById(params.runId);
  
  let enhancedNotes = params.notes || "";
  
  if (run) {
    const runContext = `Investigation created for run ${params.runId} (source: ${run.source}${
      run.goalSummary ? `, goal: ${run.goalSummary}` : ""
    }${run.userIdentifier ? `, user: ${run.userIdentifier}` : ""}).`;
    
    enhancedNotes = enhancedNotes
      ? `${runContext}\n\nUser notes: ${enhancedNotes}`
      : runContext;
  }
  
  return executeInvestigation(
    params.trigger || "manual-from-run",
    params.runId,
    enhancedNotes
  );
}
