export type InvestigationTrigger =
  | "manual"
  | "manual-from-run"
  | "timeout"
  | "tool_error"
  | "behaviour_flag"
  | "conversation_quality";

export interface ConversationQualityAnalysis {
  failure_category: "prompt_issue" | "decision_logic_issue" | "missing_behaviour_test" | "missing_clarification_logic" | "unclear_or_ambiguous_user_input";
  summary: string;
  repro_scenario: string;
  suggested_prompt_changes?: string;
  suggested_behaviour_test?: string;
}

export interface ConversationQualityMeta {
  source: "conversation_quality";
  focus: {
    kind: "conversation";
  };
  sessionId: string;
  userId?: string | null;
  flagged_message_index: number;
  conversation_window: any[];
  user_note?: string;
  analysis?: ConversationQualityAnalysis;
}

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
    source?: string;
    focus?: {
      kind?: string;
      testId?: string;
      testName?: string;
    };
    [key: string]: any;
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
