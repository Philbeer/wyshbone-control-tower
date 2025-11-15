import type { BehaviourTestResult } from "./behaviourTests";
import type { BehaviourTestRun } from "../../shared/schema";
import type { InvestigationTrigger } from "./types";
import { getLastRunForTest, getRecentErrorsForTest } from "./runLogger";
import { executeInvestigation } from "./executeInvestigation";
import { ensureBehaviourInvestigationForRun } from "./behaviourInvestigations";
import { getAllBehaviourTestDefinitions } from "./behaviourTests";
import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";

const TIMEOUT_THRESHOLD_MS = 10000;
const ERROR_WINDOW_MINUTES = 5;
const REPEAT_ERROR_THRESHOLD = 2;

type TriggerReason = 
  | "fail"
  | "error"
  | "timeout"
  | "regression"
  | "quality"
  | "repeated-errors";

export async function autoDetectAndTriggerInvestigation(
  result: BehaviourTestResult,
  runId: string
): Promise<void> {
  const triggers: Array<{ reason: TriggerReason; summary: string }> = [];

  // 1. Check for explicit error status
  if (result.status === 'error') {
    triggers.push({
      reason: 'error',
      summary: `Test error: ${result.details || 'Unknown error'}`,
    });
  }

  // 2. Check for fail status
  if (result.status === 'fail') {
    triggers.push({
      reason: 'fail',
      summary: `Test failed: ${result.details || 'Heuristic check failed'}`,
    });
  }

  // 3. Check for timeout
  if (result.durationMs && result.durationMs > TIMEOUT_THRESHOLD_MS) {
    triggers.push({
      reason: 'timeout',
      summary: `Test timeout: ${result.durationMs}ms exceeds ${TIMEOUT_THRESHOLD_MS}ms threshold`,
    });
  }

  // 4. Check for empty or low-quality response
  const response = result.rawLog?.response || '';
  if (typeof response === 'string') {
    if (response.trim().length === 0) {
      triggers.push({
        reason: 'quality',
        summary: 'Empty response from UI',
      });
    } else if (response.length < 10) {
      triggers.push({
        reason: 'quality',
        summary: `Response too short (${response.length} chars)`,
      });
    }
  }

  // 5. Check for regression (previous run was PASS, current is FAIL/ERROR)
  if (result.status === 'fail' || result.status === 'error') {
    const previousRun = await getLastRunForTest(result.testId);
    if (previousRun && previousRun.status === 'pass' && previousRun.id !== runId) {
      triggers.push({
        reason: 'regression',
        summary: `Regression detected: previous run was PASS, now ${result.status.toUpperCase()}`,
      });
    }
  }

  // 6. Check for repeated errors in recent window
  if (result.status === 'error' || result.status === 'fail') {
    const recentErrors = await getRecentErrorsForTest(
      result.testId,
      ERROR_WINDOW_MINUTES
    );
    
    if (recentErrors.length >= REPEAT_ERROR_THRESHOLD) {
      triggers.push({
        reason: 'repeated-errors',
        summary: `${recentErrors.length} errors in last ${ERROR_WINDOW_MINUTES} minutes`,
      });
    }
  }

  // If no triggers, don't create investigation
  if (triggers.length === 0) {
    return;
  }

  // EVAL-007: Check if behaviour test investigation already exists for this testId
  // (deduplication is now handled by ensureBehaviourInvestigationForRun)
  const existingForRun = await db.query.investigations.findFirst({
    where: and(
      eq(investigations.run_id, runId),
    ),
  });

  if (existingForRun) {
    console.log(`[AutoDetect] Investigation already exists for run ${runId}, skipping`);
    return;
  }

  // Use the highest priority trigger
  const primaryTrigger = triggers[0];
  
  console.log(`[AutoDetect] Triggering investigation for testId=${result.testId} reason=${primaryTrigger.reason}`);
  
  // EVAL-007: Get test metadata
  const testDefinitions = getAllBehaviourTestDefinitions();
  const testDef = testDefinitions.find(t => t.id === result.testId);
  const testName = testDef?.name || result.testId;

  // Determine seriousness level
  const seriousness = primaryTrigger.reason === 'error' ? 'error' : 
                      primaryTrigger.reason === 'timeout' ? 'error' :
                      primaryTrigger.reason === 'fail' ? 'error' :
                      primaryTrigger.reason === 'regression' ? 'warning' : 'info';

  try {
    // EVAL-007: Create behaviour test investigation (with deduplication)
    await ensureBehaviourInvestigationForRun({
      testId: result.testId,
      testName,
      runId,
      triggerReason: triggers.map(t => `[${t.reason.toUpperCase()}] ${t.summary}`).join('; '),
      seriousness,
    });

    console.log(`[AutoDetect] Behaviour investigation created successfully for testId=${result.testId}`);
  } catch (error: any) {
    console.error(`[AutoDetect] Failed to create behaviour investigation:`, error.message);
  }
}

function mapReasonToTrigger(reason: TriggerReason): InvestigationTrigger {
  switch (reason) {
    case 'timeout':
      return 'timeout';
    case 'error':
    case 'repeated-errors':
      return 'tool_error';
    case 'fail':
    case 'regression':
    case 'quality':
      return 'behaviour_flag';
    default:
      return 'behaviour_flag';
  }
}

function buildInvestigationNotes(
  result: BehaviourTestResult,
  triggers: Array<{ reason: TriggerReason; summary: string }>,
  runId: string
): string {
  const lines: string[] = [];
  
  lines.push(`🤖 AUTO-DETECTED ISSUE`);
  lines.push(`Test: ${result.testId}`);
  lines.push(`Status: ${result.status.toUpperCase()}`);
  lines.push(`Duration: ${result.durationMs || 0}ms`);
  lines.push(``);
  
  lines.push(`Triggers (${triggers.length}):`);
  triggers.forEach((t, i) => {
    lines.push(`  ${i + 1}. [${t.reason.toUpperCase()}] ${t.summary}`);
  });
  lines.push(``);
  
  if (result.details) {
    lines.push(`Details: ${result.details}`);
    lines.push(``);
  }
  
  const response = result.rawLog?.response;
  if (response && typeof response === 'string') {
    lines.push(`Response preview:`);
    lines.push(`  ${response.substring(0, 200)}${response.length > 200 ? '...' : ''}`);
  }
  
  return lines.join('\n');
}
