export type InvestigationTrigger =
  | "manual"
  | "manual-from-run"
  | "timeout"
  | "tool_error"
  | "behaviour_flag";

export interface Investigation {
  id: string;
  createdAt: Date;
  trigger: InvestigationTrigger;
  runId?: string;
  notes?: string;

  runLogs: any[];
  runMeta?: {
    userId?: string;
    sessionId?: string;
    agent?: "ui" | "supervisor" | "tower";
    description?: string;
  };

  uiSnapshot?: any | null;
  supervisorSnapshot?: any | null;

  diagnosis?: string | null;
  patchSuggestion?: string | null;
}

export interface SnapshotBundle {
  uiSnapshot?: any | null;
  supervisorSnapshot?: any | null;
}

export interface DiagnosticResult {
  diagnosis: string;
  patchSuggestion: string;
}
