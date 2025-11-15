import type { Investigation, DiagnosticResult, SnapshotBundle } from "./types";
import { openai } from "../lib/openai";

function buildInvestigationPrompt(inv: Investigation, snapshots: SnapshotBundle) {
  return {
    role: "user" as const,
    content: JSON.stringify(
      {
        investigation: {
          id: inv.id,
          trigger: inv.trigger,
          runId: inv.runId,
          notes: inv.notes,
        },
        runMeta: inv.runMeta,
        runLogs: inv.runLogs,
        snapshots,
      },
      null,
      2
    ),
  };
}

export async function runDiagnosis(
  investigation: Investigation,
  snapshots: SnapshotBundle
): Promise<DiagnosticResult> {
  const messages = [
    {
      role: "system" as const,
      content:
        "You are the Wyshbone Evaluator. You receive logs from a failing or suspicious run, plus optional code snapshots from the UI and Supervisor.\n\n" +
        "Output your response in TWO sections:\n\n" +
        "## DIAGNOSIS\n" +
        "[Explain the root cause clearly for a developer: logic errors, prompt issues, tool wiring, state handling, etc.]\n\n" +
        "## PATCH SUGGESTION\n" +
        "[Provide precise, copy-and-paste code fixes. Include full functions or file patches. No placeholders.]\n\n" +
        "Focus strictly on fixing the observed issue. Do not invent unrelated features.",
    },
    buildInvestigationPrompt(investigation, snapshots),
  ];

  const response = await openai.chat.completions.create({
    model: process.env.EVAL_MODEL_ID ?? "gpt-4o-mini",
    messages,
    temperature: 0.2,
  });

  const text =
    response.choices[0]?.message?.content ??
    "No diagnosis generated. Please inspect logs manually.";

  const diagnosisMatch = text.match(/## DIAGNOSIS\s*([\s\S]*?)(?=## PATCH SUGGESTION|$)/i);
  const patchMatch = text.match(/## PATCH SUGGESTION\s*([\s\S]*?)$/i);

  const result: DiagnosticResult = {
    diagnosis: diagnosisMatch ? diagnosisMatch[1].trim() : text,
    patchSuggestion: patchMatch ? patchMatch[1].trim() : "See diagnosis for details.",
  };

  return result;
}
