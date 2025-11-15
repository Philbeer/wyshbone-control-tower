import { apiRequest } from "@/lib/queryClient";
import type { RunSummary } from "../../../src/evaluator/runStore";

export async function createInvestigationFromLiveRun(runId: string): Promise<any> {
  const response = await apiRequest('POST', `/tower/runs/${runId}/investigate`);
  return response.json();
}
