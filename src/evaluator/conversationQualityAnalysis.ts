import { openai } from "../lib/openai";
import type { Investigation, ConversationQualityAnalysis, ConversationQualityMeta } from "./types";
import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { eq } from "drizzle-orm";

const SYSTEM_PROMPT = `You are the Wyshbone Conversation Quality Evaluator. You analyze flagged assistant conversations to identify what went wrong in the chat behaviour (not tools) and provide actionable recommendations.

Your task is to:
1. Summarize the conversation and identify the main failure mode
2. Classify the failure into ONE of these categories:
   - prompt_issue: The assistant's system prompt or instructions are inadequate
   - decision_logic_issue: The assistant made poor decisions about what to do
   - missing_behaviour_test: A specific scenario lacks proper test coverage
   - missing_clarification_logic: The assistant should have asked for clarification but didn't
   - unclear_or_ambiguous_user_input: The user's input was genuinely unclear

3. Provide a developer brief with:
   - Root cause hypothesis
   - Minimal reproducible scenario (shortened transcript focused on the problem)
   - Suggested changes (prompt / routing / decision logic)
   - Whether a new behaviour test should exist and what it should assert

OUTPUT FORMAT:
You must respond with a valid JSON object with this exact structure:
{
  "failure_category": "one of the five categories above",
  "summary": "short human-readable summary of what went wrong",
  "repro_scenario": "minimal transcript snippet showing the problem",
  "suggested_prompt_changes": "free-text suggestions for prompt improvements (optional)",
  "suggested_behaviour_test": "description of a test, if applicable (optional)"
}`;

function buildAnalysisPrompt(conversationMeta: ConversationQualityMeta): string {
  const { conversation_window, flagged_message_index, user_note, sessionId, userId } = conversationMeta;
  
  return JSON.stringify({
    session_id: sessionId,
    user_id: userId || "anonymous",
    flagged_message_index: flagged_message_index,
    user_note: user_note || "No additional note provided",
    conversation_window: conversation_window,
    instruction: "Analyze this conversation and identify what went wrong with the assistant's behaviour. Focus on the flagged message and surrounding context."
  }, null, 2);
}

export async function runConversationQualityAnalysis(
  investigation: Investigation
): Promise<ConversationQualityAnalysis> {
  if (!investigation.runMeta || investigation.runMeta.source !== "conversation_quality") {
    throw new Error("Investigation is not a conversation quality investigation");
  }

  const conversationMeta = investigation.runMeta as unknown as ConversationQualityMeta;

  const messages = [
    {
      role: "system" as const,
      content: SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: buildAnalysisPrompt(conversationMeta),
    },
  ];

  console.log(`[ConversationQualityAnalysis] Analyzing investigation ${investigation.id}`);

  const response = await openai.chat.completions.create({
    model: process.env.EVAL_MODEL_ID ?? "gpt-4o-mini",
    messages,
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("No response from LLM");
  }

  let analysis: ConversationQualityAnalysis;
  try {
    analysis = JSON.parse(text);
  } catch (err) {
    console.error("[ConversationQualityAnalysis] Failed to parse LLM response as JSON:", text);
    throw new Error("LLM returned invalid JSON");
  }

  // Validate required fields
  if (!analysis.failure_category || !analysis.summary || !analysis.repro_scenario) {
    throw new Error("LLM response missing required fields");
  }

  // Validate failure_category is one of the allowed values
  const validCategories = [
    "prompt_issue",
    "decision_logic_issue",
    "missing_behaviour_test",
    "missing_clarification_logic",
    "unclear_or_ambiguous_user_input"
  ];
  
  if (!validCategories.includes(analysis.failure_category)) {
    console.warn(`[ConversationQualityAnalysis] Invalid failure_category: ${analysis.failure_category}, defaulting to prompt_issue`);
    analysis.failure_category = "prompt_issue";
  }

  console.log(`[ConversationQualityAnalysis] Analysis complete. Category: ${analysis.failure_category}`);

  return analysis;
}

export async function processConversationQualityInvestigation(
  investigationId: string
): Promise<void> {
  console.log(`[ConversationQualityAnalysis] Processing investigation ${investigationId}`);

  // Fetch investigation
  const investigation = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigationId),
  });

  if (!investigation) {
    throw new Error(`Investigation ${investigationId} not found`);
  }

  const typedInvestigation: Investigation = {
    id: investigation.id,
    createdAt: investigation.created_at,
    trigger: investigation.trigger as any,
    runId: investigation.run_id ?? undefined,
    notes: investigation.notes ?? undefined,
    runLogs: investigation.run_logs ?? [],
    runMeta: investigation.run_meta ?? undefined,
    uiSnapshot: investigation.ui_snapshot ?? null,
    supervisorSnapshot: investigation.supervisor_snapshot ?? null,
    diagnosis: investigation.diagnosis ?? null,
    patchSuggestion: investigation.patch_suggestion ?? null,
  };

  // Run analysis
  const analysis = await runConversationQualityAnalysis(typedInvestigation);

  // Store analysis back in run_meta
  const updatedRunMeta = {
    ...(typedInvestigation.runMeta || {}),
    analysis,
  };

  // Also store a human-readable diagnosis
  const diagnosis = `Conversation Quality Analysis

Category: ${analysis.failure_category}
Summary: ${analysis.summary}

Reproducible Scenario:
${analysis.repro_scenario}

${analysis.suggested_prompt_changes ? `Suggested Prompt Changes:\n${analysis.suggested_prompt_changes}\n` : ''}
${analysis.suggested_behaviour_test ? `Suggested Behaviour Test:\n${analysis.suggested_behaviour_test}` : ''}`;

  await db
    .update(investigations)
    .set({
      run_meta: updatedRunMeta,
      diagnosis,
    })
    .where(eq(investigations.id, investigationId));

  console.log(`[ConversationQualityAnalysis] Investigation ${investigationId} updated with analysis`);
}
