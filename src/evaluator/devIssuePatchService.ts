import { openai } from "../lib/openai";
import { db } from "../lib/db";
import { devIssues, devIssueContext, devIssuePatches } from "../../shared/schema";
import { eq } from "drizzle-orm";
import type { DevIssue, DevIssueContext, DevIssuePatch, InsertDevIssuePatch } from "../../shared/schema";

const SYSTEM_PROMPT = `You are a senior TypeScript/React/Node developer working on the Wyshbone codebase.

You will receive:
- Issue description (title and details)
- Error logs (if available)
- Relevant source files (file_path + content)

Your job:
1. Identify the bug or problematic behaviour based on the issue description and context.
2. Propose minimal changes to fix it.
3. For each file you change, return the FULL updated file content.
4. Do not invent new files unless strictly necessary.
5. Prefer small, surgical edits over large refactors.
6. Only modify files that need changes - do not include files with no changes.

Return your response as a JSON object with this exact structure:
{
  "analysis": "Brief explanation of the bug/issue and your approach to fix it",
  "patches": [
    {
      "file_path": "path/to/file.ts",
      "summary": "Short description of changes made to this file",
      "new_contents": "The complete updated file contents"
    }
  ]
}

Important:
- If no code changes are needed, return an empty patches array: {"analysis": "...", "patches": []}
- Always return valid JSON
- Include the FULL file content in new_contents, not just the changed parts
- Keep summaries concise (1-2 sentences max)`;

interface PatchSuggestionResult {
  issue: DevIssue;
  patches: Array<{
    id: string;
    filePath: string;
    summary: string;
  }>;
}

interface LLMPatchResponse {
  analysis: string;
  patches: Array<{
    file_path: string;
    summary: string;
    new_contents: string;
  }>;
}

function buildUserPrompt(issue: DevIssue, context: DevIssueContext[]): string {
  const fileContexts = context.filter(c => c.filePath && c.fileContents);
  const logContexts = context.filter(c => c.logExcerpt);

  let prompt = `# Issue: ${issue.title}

## Description
${issue.description}

`;

  if (logContexts.length > 0) {
    prompt += `## Error Logs\n`;
    for (const ctx of logContexts) {
      prompt += `\`\`\`\n${ctx.logExcerpt}\n\`\`\`\n\n`;
    }
  }

  if (fileContexts.length > 0) {
    prompt += `## Relevant Files\n\n`;
    for (const ctx of fileContexts) {
      prompt += `### ${ctx.filePath}\n\`\`\`\n${ctx.fileContents}\n\`\`\`\n\n`;
    }
  }

  prompt += `Please analyze this issue and suggest code changes to fix it. Return your response as JSON.`;

  return prompt;
}

export async function generatePatchSuggestions(issueId: string): Promise<PatchSuggestionResult> {
  console.log(`[DevIssuePatch] Generating patch suggestions for issue ${issueId}`);

  const issue = await db.select().from(devIssues).where(eq(devIssues.id, issueId)).limit(1);
  
  if (issue.length === 0) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  const issueData = issue[0];

  const context = await db.select().from(devIssueContext).where(eq(devIssueContext.issueId, issueId));

  console.log(`[DevIssuePatch] Found ${context.length} context items for issue`);

  const userPrompt = buildUserPrompt(issueData, context);

  const messages = [
    {
      role: "system" as const,
      content: SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: userPrompt,
    },
  ];

  console.log(`[DevIssuePatch] Calling OpenAI for patch suggestions...`);

  const response = await openai.chat.completions.create({
    model: process.env.EVAL_MODEL_ID ?? "gpt-4o-mini",
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("No response from OpenAI");
  }

  console.log(`[DevIssuePatch] Received response from OpenAI`);

  let llmResponse: LLMPatchResponse;
  try {
    llmResponse = JSON.parse(text);
  } catch (err) {
    console.error("[DevIssuePatch] Failed to parse LLM response as JSON:", text);
    throw new Error("OpenAI returned invalid JSON");
  }

  if (!llmResponse.patches || !Array.isArray(llmResponse.patches)) {
    llmResponse.patches = [];
  }

  console.log(`[DevIssuePatch] LLM suggested ${llmResponse.patches.length} patch(es)`);
  if (llmResponse.analysis) {
    console.log(`[DevIssuePatch] Analysis: ${llmResponse.analysis}`);
  }

  const savedPatches: Array<{ id: string; filePath: string; summary: string }> = [];

  for (const patch of llmResponse.patches) {
    if (!patch.file_path || !patch.new_contents) {
      console.warn(`[DevIssuePatch] Skipping invalid patch entry:`, patch);
      continue;
    }

    const insertData: InsertDevIssuePatch = {
      issueId: issueId,
      filePath: patch.file_path,
      newContents: patch.new_contents,
      summary: patch.summary || "Code update",
    };

    const result = await db.insert(devIssuePatches).values(insertData).returning();
    
    if (result.length > 0) {
      savedPatches.push({
        id: result[0].id,
        filePath: result[0].filePath,
        summary: result[0].summary,
      });
      console.log(`[DevIssuePatch] Saved patch for ${patch.file_path}`);
    }
  }

  console.log(`[DevIssuePatch] Saved ${savedPatches.length} patch(es) to database`);

  return {
    issue: issueData,
    patches: savedPatches,
  };
}

export async function getPatchesForIssue(issueId: string): Promise<DevIssuePatch[]> {
  return db.select().from(devIssuePatches).where(eq(devIssuePatches.issueId, issueId));
}
