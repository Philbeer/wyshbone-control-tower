import type { BehaviourTestResult } from "./behaviourTests";
import type { PatchEvaluation } from "../../shared/schema";
import { PatchSandbox } from "./patchSandbox";
import { diffTestResults, summarizeDiff } from "./patchDiff";
import { evaluatePatchStrict } from "./patchGate";
import { runAllBehaviourTests } from "./behaviourTests";
import { db } from "../lib/db";
import { patchEvaluations } from "../../shared/schema";
import { eq } from "drizzle-orm";

export type PatchEvaluationRequest = {
  patch: string;
};

export type PatchEvaluationResult = {
  id: string;
  status: "pending" | "approved" | "rejected";
  reasons: string[];
  diff: any;
  beforeResults: BehaviourTestResult[];
  afterResults: BehaviourTestResult[];
  investigationIds: string[];
  summary: string;
  riskLevel?: string;
};

type AutoDetectTrigger = {
  testId: string;
  reason: string;
  investigationId?: string;
};

export class PatchEvaluator {
  private sandbox: PatchSandbox;
  private autoDetectAndTriggerInvestigation?: Function;

  constructor(autoDetectFn?: Function) {
    this.sandbox = new PatchSandbox();
    this.autoDetectAndTriggerInvestigation = autoDetectFn;
  }

  async evaluatePatch(request: PatchEvaluationRequest): Promise<PatchEvaluationResult> {
    const startTime = Date.now();
    let evaluationId: string = '';

    try {
      const evaluation = await db
        .insert(patchEvaluations)
        .values({
          status: 'pending',
          patchText: request.patch,
          diff: null,
          reasons: [],
          testResultsBefore: null,
          testResultsAfter: null,
          investigationIds: [],
        })
        .returning();

      evaluationId = evaluation[0].id;

      console.log(`[PatchEvaluator] Starting evaluation ${evaluationId}`);

      console.log(`[PatchEvaluator] Running BEFORE tests...`);
      const beforeResults = await this.runTestsWithTimeout();

      console.log(`[PatchEvaluator] Applying patch in sandbox...`);
      const applyResult = await this.sandbox.applyPatch(request.patch);
      if (!applyResult.success) {
        return await this.failEvaluation(evaluationId, beforeResults, [], [
          `❌ Patch application failed: ${applyResult.error}`,
        ]);
      }

      console.log(`[PatchEvaluator] Running AFTER tests (sandboxed)...`);
      const afterResults = await this.runTestsWithTimeout();

      console.log(`[PatchEvaluator] Computing diff...`);
      const diff = diffTestResults(beforeResults, afterResults);
      const diffSummary = summarizeDiff(diff);

      console.log(`[PatchEvaluator] Running auto-detection on AFTER results...`);
      const autoDetectTriggers: AutoDetectTrigger[] = [];
      const investigationIds: string[] = [];

      if (this.autoDetectAndTriggerInvestigation) {
        for (const result of afterResults) {
          const triggeredReasons = this.checkAutoDetectConditions(result);
          if (triggeredReasons.length > 0) {
            autoDetectTriggers.push({
              testId: result.testId,
              reason: triggeredReasons.join(', '),
            });
          }
        }
      }

      console.log(`[PatchEvaluator] Evaluating with strict gate...`);
      const gateDecision = evaluatePatchStrict(
        diff,
        beforeResults,
        afterResults,
        autoDetectTriggers.map(t => t.reason),
        undefined
      );

      const finalStatus = gateDecision.status === 'approved' ? 'approved' : 'rejected';

      await db
        .update(patchEvaluations)
        .set({
          status: finalStatus,
          diff: diff as any,
          reasons: gateDecision.reasons,
          testResultsBefore: beforeResults as any,
          testResultsAfter: afterResults as any,
          investigationIds,
          evaluationMeta: {
            latencyRegressions: diff.latencyRegressions,
            autoDetectTriggers: autoDetectTriggers.map(t => `${t.testId}: ${t.reason}`),
            riskLevel: gateDecision.riskLevel,
          },
        })
        .where(eq(patchEvaluations.id, evaluationId));

      const elapsedMs = Date.now() - startTime;
      console.log(`[PatchEvaluator] Evaluation complete in ${elapsedMs}ms: ${finalStatus.toUpperCase()}`);

      return {
        id: evaluationId,
        status: finalStatus,
        reasons: gateDecision.reasons,
        diff,
        beforeResults,
        afterResults,
        investigationIds,
        summary: diffSummary,
        riskLevel: gateDecision.riskLevel,
      };
    } catch (error: any) {
      console.error(`[PatchEvaluator] Evaluation failed:`, error.message);

      if (evaluationId) {
        await db
          .update(patchEvaluations)
          .set({
            status: 'rejected',
            reasons: [`System error during evaluation: ${error.message}`],
          })
          .where(eq(patchEvaluations.id, evaluationId));
      }

      throw error;
    } finally {
      this.sandbox.reset();
    }
  }

  private async runTestsWithTimeout(): Promise<BehaviourTestResult[]> {
    const timeout = 60000;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Test execution timeout')), timeout);
    });

    try {
      const results = await Promise.race([
        runAllBehaviourTests(),
        timeoutPromise,
      ]);

      return results;
    } catch (error: any) {
      if (error.message === 'Test execution timeout') {
        throw new Error('Behaviour tests exceeded 60 second timeout');
      }
      throw error;
    }
  }

  private checkAutoDetectConditions(result: BehaviourTestResult): string[] {
    const reasons: string[] = [];

    if (result.status === 'error') {
      reasons.push('error');
    }

    if (result.status === 'fail') {
      reasons.push('fail');
    }

    if (result.durationMs && result.durationMs > 10000) {
      reasons.push('timeout');
    }

    const response = result.rawLog?.response || '';
    if (typeof response === 'string') {
      if (response.trim().length === 0) {
        reasons.push('quality-empty');
      } else if (response.length < 10) {
        reasons.push('quality-short');
      }
    }

    return reasons;
  }

  private async failEvaluation(
    evaluationId: string,
    beforeResults: BehaviourTestResult[],
    afterResults: BehaviourTestResult[],
    reasons: string[]
  ): Promise<PatchEvaluationResult> {
    await db
      .update(patchEvaluations)
      .set({
        status: 'rejected',
        reasons,
        testResultsBefore: beforeResults as any,
        testResultsAfter: afterResults as any,
      })
      .where(eq(patchEvaluations.id, evaluationId));

    return {
      id: evaluationId,
      status: 'rejected',
      reasons,
      diff: null,
      beforeResults,
      afterResults,
      investigationIds: [],
      summary: 'Patch evaluation failed',
    };
  }

  async getEvaluation(id: string): Promise<PatchEvaluationResult | null> {
    const evaluation = await db.query.patchEvaluations.findFirst({
      where: eq(patchEvaluations.id, id),
    });

    if (!evaluation) {
      return null;
    }

    return {
      id: evaluation.id,
      status: evaluation.status as any,
      reasons: (evaluation.reasons as string[]) || [],
      diff: evaluation.diff,
      beforeResults: (evaluation.testResultsBefore as BehaviourTestResult[]) || [],
      afterResults: (evaluation.testResultsAfter as BehaviourTestResult[]) || [],
      investigationIds: (evaluation.investigationIds as string[]) || [],
      summary: this.buildSummary(evaluation),
      riskLevel: (evaluation.evaluationMeta as any)?.riskLevel,
    };
  }

  private buildSummary(evaluation: PatchEvaluation): string {
    const lines: string[] = [];
    
    lines.push(`Patch Evaluation: ${evaluation.status.toUpperCase()}`);
    lines.push(`Created: ${evaluation.createdAt.toISOString()}`);
    
    if (evaluation.reasons && Array.isArray(evaluation.reasons)) {
      lines.push(``);
      lines.push(`Reasons (${evaluation.reasons.length}):`);
      evaluation.reasons.forEach((r: string) => lines.push(`  ${r}`));
    }

    return lines.join('\n');
  }
}
