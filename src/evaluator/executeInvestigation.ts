import type { Investigation, InvestigationTrigger } from "./types";
import { createInvestigation } from "./createInvestigation";
import { runDiagnosis } from "./runDiagnosis";
import { fetchSnapshotsForRun } from "./fetchSnapshots";
import { storeInvestigation } from "./storeInvestigation";

export async function executeInvestigation(
  trigger: InvestigationTrigger,
  runId?: string,
  notes?: string
): Promise<Investigation> {
  const inv = await createInvestigation(trigger, runId, notes);

  const snapshots = await fetchSnapshotsForRun(runId);
  inv.uiSnapshot = snapshots.uiSnapshot ?? null;
  inv.supervisorSnapshot = snapshots.supervisorSnapshot ?? null;

  const diag = await runDiagnosis(inv, snapshots);
  inv.diagnosis = diag.diagnosis;
  inv.patchSuggestion = diag.patchSuggestion;

  await storeInvestigation(inv);

  return inv;
}
