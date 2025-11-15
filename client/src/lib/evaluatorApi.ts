export type RunSummary = {
  id: string;
  createdAt: string;
  source: string;
  userIdentifier?: string | null;
  goalSummary?: string | null;
  status: string;
  meta?: any;
};

export type Investigation = {
  id: string;
  createdAt: string;
  trigger: string;
  runId?: string;
  notes?: string;
  runLogs?: any[];
  runMeta?: any;
  uiSnapshot?: any | null;
  supervisorSnapshot?: any | null;
  diagnosis?: string | null;
  patchSuggestion?: string | null;
};

const API_BASE = "";

export async function listRuns(limit = 20): Promise<RunSummary[]> {
  const res = await fetch(`${API_BASE}/tower/runs?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.statusText}`);
  return res.json();
}

export async function getRun(id: string): Promise<RunSummary> {
  const res = await fetch(`${API_BASE}/tower/runs/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch run: ${res.statusText}`);
  return res.json();
}

export async function listInvestigations(): Promise<Investigation[]> {
  const res = await fetch(`${API_BASE}/tower/evaluator/investigations`);
  if (!res.ok) throw new Error(`Failed to fetch investigations: ${res.statusText}`);
  return res.json();
}

export async function getInvestigation(id: string): Promise<Investigation> {
  const res = await fetch(`${API_BASE}/tower/evaluator/investigations/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch investigation: ${res.statusText}`);
  return res.json();
}

export async function createInvestigationFromRun(input: {
  runId: string;
  notes?: string;
}): Promise<Investigation> {
  const res = await fetch(`${API_BASE}/tower/evaluator/investigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trigger: "manual-from-run",
      runId: input.runId,
      notes: input.notes,
    }),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || "Failed to create investigation");
  }
  
  return res.json();
}
