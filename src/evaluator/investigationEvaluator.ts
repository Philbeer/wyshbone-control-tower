import { db } from "../lib/db";
import { investigations, runs } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { openai } from "../lib/openai";

interface EvaluationResult {
  diagnosis: string;
  patchSuggestion: string;
}

/**
 * Run investigation evaluation: generates diagnosis and patch suggestion using OpenAI
 * This is idempotent - if diagnosis and patch_suggestion already exist, returns them immediately
 */
export async function runInvestigation(investigationId: string): Promise<EvaluationResult> {
  console.log(`[InvestigationEvaluator] Starting evaluation for investigation ${investigationId}`);

  // 1. Load the investigation
  const investigation = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigationId),
  });

  if (!investigation) {
    throw new Error(`Investigation ${investigationId} not found`);
  }

  // 2. Check if already evaluated (idempotent)
  if (investigation.diagnosis && investigation.patch_suggestion) {
    console.log(`[InvestigationEvaluator] Investigation ${investigationId} already evaluated, returning cached results`);
    return {
      diagnosis: investigation.diagnosis,
      patchSuggestion: investigation.patch_suggestion,
    };
  }

  // 3. Load relevant runs
  let relevantRuns: any[] = [];
  
  if (investigation.run_id) {
    // Check if run_id looks like a conversation_run_id
    const conversationRuns = await db.query.runs.findMany({
      where: eq(runs.conversation_run_id, investigation.run_id),
      orderBy: (r, { asc }) => [asc(r.created_at)],
    });

    if (conversationRuns.length > 0) {
      // It's a conversation ID
      console.log(`[InvestigationEvaluator] Found ${conversationRuns.length} runs in conversation ${investigation.run_id}`);
      relevantRuns = conversationRuns;
    } else {
      // Try loading as single run ID
      const singleRun = await db.query.runs.findFirst({
        where: eq(runs.id, investigation.run_id),
      });

      if (singleRun) {
        console.log(`[InvestigationEvaluator] Found single run ${investigation.run_id}`);
        relevantRuns = [singleRun];
      } else {
        console.warn(`[InvestigationEvaluator] No runs found for run_id ${investigation.run_id}`);
      }
    }
  }

  // 4. Build transcript for OpenAI
  const transcript = buildTranscript(investigation, relevantRuns);
  console.log(`[InvestigationEvaluator] Built transcript (${transcript.length} chars)`);

  // 5. Call OpenAI for diagnosis and patch suggestion
  let diagnosis: string;
  let patchSuggestion: string;

  try {
    const result = await callOpenAI(transcript);
    diagnosis = result.diagnosis;
    patchSuggestion = result.patchSuggestion;
    console.log(`[InvestigationEvaluator] OpenAI evaluation completed successfully`);
  } catch (error: any) {
    console.error(`[InvestigationEvaluator] OpenAI call failed:`, error);
    diagnosis = `Evaluator failed to analyze this conversation. Error: ${error.message}`;
    patchSuggestion = "Unable to generate patch suggestion due to evaluation error. Please review manually.";
  }

  // 6. Update the investigation in database
  await db
    .update(investigations)
    .set({
      diagnosis,
      patch_suggestion: patchSuggestion,
    })
    .where(eq(investigations.id, investigationId));

  console.log(`[InvestigationEvaluator] Updated investigation ${investigationId} with diagnosis and patch`);

  return {
    diagnosis,
    patchSuggestion,
  };
}

/**
 * Build a plain-text transcript for OpenAI evaluation
 */
function buildTranscript(investigation: any, relevantRuns: any[]): string {
  const lines: string[] = [];

  lines.push("=== INVESTIGATION CONTEXT ===");
  lines.push(`Investigation ID: ${investigation.id}`);
  lines.push(`Trigger: ${investigation.trigger}`);
  lines.push(`Created: ${investigation.created_at}`);
  
  if (investigation.notes) {
    lines.push(`\nNotes: ${investigation.notes}`);
  }

  if (investigation.run_meta) {
    lines.push(`\nMetadata:`);
    if (investigation.run_meta.userId) {
      lines.push(`  User ID: ${investigation.run_meta.userId}`);
    }
    if (investigation.run_meta.sessionId) {
      lines.push(`  Session ID: ${investigation.run_meta.sessionId}`);
    }
    if (investigation.run_meta.source) {
      lines.push(`  Source: ${investigation.run_meta.source}`);
    }
    if (investigation.run_meta.goal_summary) {
      lines.push(`  Goal: ${investigation.run_meta.goal_summary}`);
    }
  }

  // Add conversation events
  if (relevantRuns.length > 0) {
    lines.push("\n=== CONVERSATION EVENTS ===");
    lines.push(`Total Events: ${relevantRuns.length}\n`);

    relevantRuns.forEach((run, index) => {
      lines.push(`--- Event ${index + 1} ---`);
      lines.push(`Time: ${run.created_at}`);
      lines.push(`Status: ${run.status}`);
      
      // Extract input
      const input = run.goal_summary || run.meta?.inputText || run.meta?.requestText || "No input";
      lines.push(`Input: ${input}`);

      // Extract output
      const output = run.meta?.output || run.meta?.responseText || run.meta?.outputText || "No output";
      lines.push(`Output: ${output}`);

      // Include metadata if relevant
      if (run.meta?.durationMs) {
        lines.push(`Duration: ${run.meta.durationMs}ms`);
      }
      if (run.meta?.toolCalls && run.meta.toolCalls.length > 0) {
        const toolNames = run.meta.toolCalls.map((t: any) => t.name || "unknown").join(", ");
        lines.push(`Tools Used: ${toolNames}`);
      }
      if (run.meta?.model) {
        lines.push(`Model: ${run.meta.model}`);
      }

      lines.push(""); // Blank line between events
    });
  } else {
    lines.push("\n=== NO RUN DATA AVAILABLE ===");
    lines.push("Investigation was created but no associated run data was found.");
  }

  return lines.join("\n");
}

/**
 * Call OpenAI to generate diagnosis and patch suggestion
 */
async function callOpenAI(transcript: string): Promise<EvaluationResult> {
  const systemPrompt = `You are an expert AI debugger for the Wyshbone agent system. You receive logs of a conversation and must explain what went wrong and propose a concrete patch.

Your task:
1. Analyze the conversation events to identify issues
2. Provide a clear diagnosis of what went wrong
3. Suggest a specific code patch to fix the issue

Return your response as strict JSON with exactly two fields:
{
  "diagnosis": "Clear explanation of what went wrong, why it happened, and the impact",
  "patch_suggestion": "Specific code changes or configuration updates needed to fix this issue"
}`;

  const userPrompt = `${transcript}

Return strict JSON with two fields:
{
  "diagnosis": "...",
  "patch_suggestion": "..."
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error("OpenAI returned empty response");
  }

  try {
    const parsed = JSON.parse(content);
    
    if (!parsed.diagnosis || !parsed.patch_suggestion) {
      throw new Error("OpenAI response missing required fields");
    }

    return {
      diagnosis: parsed.diagnosis,
      patchSuggestion: parsed.patch_suggestion,
    };
  } catch (parseError: any) {
    console.error("[InvestigationEvaluator] Failed to parse OpenAI response:", content);
    
    // Fallback: return raw response
    return {
      diagnosis: "Evaluator failed to parse response. Raw output below.",
      patchSuggestion: content,
    };
  }
}
