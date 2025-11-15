import { randomUUID } from "crypto";
import type { Investigation, InvestigationTrigger } from "./types";
import { fetchRunLogs } from "./fetchRunLogs";

export async function createInvestigation(
  trigger: InvestigationTrigger,
  runId?: string,
  notes?: string
): Promise<Investigation> {
  const logs = await fetchRunLogs(runId);

  const investigation: Investigation = {
    id: randomUUID(),
    createdAt: new Date(),
    trigger,
    runId,
    notes,
    runLogs: logs,
    runMeta: undefined,
    uiSnapshot: null,
    supervisorSnapshot: null,
    diagnosis: null,
    patchSuggestion: null,
  };

  return investigation;
}
