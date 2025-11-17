import { openai } from "../lib/openai";
import type { Investigation, WyshboneConversationAnalysis, AutoConversationQualityMeta } from "./types";

const WYSHBONE_V1_SPEC = `
WYSHBONE CONVERSATION QUALITY V1 SPEC

Good Behaviour:
1. First Message (Greeting):
   - Friendly greeting + short explanation of Wyshbone
   - Explicit two-path choice:
     a) Provide website/domain for personalisation, OR
     b) Describe what kind of leads and where to search
   
2. If User Provides Domain:
   - Acknowledge the domain
   - Ask about target market / geography before starting lead search
   - Do NOT start searching without clarifying location/market
   
3. If User Skips Domain (Describes Leads Directly):
   - Confirm product + target + location
   - Start search without nagging for domain
   - Do NOT repeatedly ask for domain if user has already specified search criteria
   
4. General Expectations:
   - Every assistant message should end with a clear next step or question
   - Do NOT repeat the same question or information unnecessarily
   - Do NOT misinterpret clear user intent
   - Do NOT leave the user hanging without guidance
`;

const SYSTEM_PROMPT = `You are the Wyshbone Automatic Conversation Quality Evaluator. You analyze completed Wyshbone UI conversations to detect "embarrassing" failures in chat behaviour.

${WYSHBONE_V1_SPEC}

Your task is to:
1. Read the full conversation transcript
2. Detect if the conversation violates the V1 spec above
3. Focus on obvious failures, especially:
   - Greeting that doesn't offer the correct two-path choice
   - User gives domain but system fails to ask about market/location
   - Bot ignores or misinterprets clear user requests
   - Bot repeats itself unnecessarily or gets stuck
   - Bot ends message without giving clear next step

4. If a failure is detected, provide a structured developer brief

OUTPUT FORMAT:
You must respond with valid JSON in this exact structure:
{
  "failure_detected": true/false,
  "failure_type": "one of: greeting_flow, domain_followup, misinterpreted_intent, repetition, dead_end, other (or null if no failure)",
  "severity": "low/medium/high (or null if no failure)",
  "summary": "1-3 sentence description of what went wrong (or null if no failure)",
  "user_intent": "short description of what user was trying to do (or null if no failure)",
  "expected_behaviour": "what should have happened per V1 spec (or null if no failure)",
  "actual_behaviour": "what the bot actually did (or null if no failure)",
  "suggested_fix": "natural language recommendation for fix (or null if no failure)",
  "suggested_tests": ["array of 1-3 bullet points for behaviour tests to add/update (or empty array if no failure)"]
}

If no failure is detected, return:
{
  "failure_detected": false,
  "failure_type": null,
  "severity": null,
  "summary": null,
  "user_intent": null,
  "expected_behaviour": null,
  "actual_behaviour": null,
  "suggested_fix": null,
  "suggested_tests": []
}`;

function buildAnalysisPrompt(conversationTranscript: any[]): string {
  return JSON.stringify({
    instruction: "Analyze this Wyshbone UI conversation against the V1 spec. Detect any violations or embarrassing failures.",
    conversation_transcript: conversationTranscript,
  }, null, 2);
}

export async function runAutoConversationQualityAnalysis(
  investigation: Investigation
): Promise<WyshboneConversationAnalysis | null> {
  if (!investigation.runMeta || investigation.runMeta.source !== "auto_conversation_quality") {
    throw new Error("Investigation is not an auto conversation quality investigation");
  }

  const meta = investigation.runMeta as unknown as AutoConversationQualityMeta;

  const messages = [
    {
      role: "system" as const,
      content: SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: buildAnalysisPrompt(meta.conversation_transcript),
    },
  ];

  console.log(`[AutoConversationQualityAnalysis] Analyzing investigation ${investigation.id}`);

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

  let rawAnalysis: any;
  try {
    rawAnalysis = JSON.parse(text);
  } catch (err) {
    console.error("[AutoConversationQualityAnalysis] Failed to parse LLM response as JSON:", text);
    throw new Error("LLM returned invalid JSON");
  }

  if (!rawAnalysis.failure_detected) {
    console.log(`[AutoConversationQualityAnalysis] No failure detected for investigation ${investigation.id}`);
    return null;
  }

  const analysis: WyshboneConversationAnalysis = {
    failure_type: rawAnalysis.failure_type || "other",
    severity: rawAnalysis.severity || "medium",
    summary: rawAnalysis.summary || "Unknown failure",
    user_intent: rawAnalysis.user_intent || "Unknown",
    expected_behaviour: rawAnalysis.expected_behaviour || "See V1 spec",
    actual_behaviour: rawAnalysis.actual_behaviour || "Unknown",
    suggested_fix: rawAnalysis.suggested_fix || "Manual review required",
    suggested_tests: rawAnalysis.suggested_tests || [],
  };

  const validFailureTypes = ["greeting_flow", "domain_followup", "misinterpreted_intent", "repetition", "dead_end", "other"];
  if (!validFailureTypes.includes(analysis.failure_type)) {
    console.warn(`[AutoConversationQualityAnalysis] Invalid failure_type: ${analysis.failure_type}, defaulting to 'other'`);
    analysis.failure_type = "other";
  }

  const validSeverities = ["low", "medium", "high"];
  if (!validSeverities.includes(analysis.severity)) {
    console.warn(`[AutoConversationQualityAnalysis] Invalid severity: ${analysis.severity}, defaulting to 'medium'`);
    analysis.severity = "medium";
  }

  console.log(`[AutoConversationQualityAnalysis] Failure detected. Type: ${analysis.failure_type}, Severity: ${analysis.severity}`);

  return analysis;
}
