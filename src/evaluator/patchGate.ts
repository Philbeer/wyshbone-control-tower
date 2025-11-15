import type { BehaviourTestResult } from "./behaviourTests";
import type { PatchDiffSummary } from "./patchDiff";

export type GateDecision = {
  status: "approved" | "rejected";
  reasons: string[];
  score: number;
  riskLevel: "low" | "medium" | "high";
};

const LATENCY_REGRESSION_THRESHOLD = 30;

export function evaluatePatchStrict(
  diff: PatchDiffSummary,
  beforeResults: BehaviourTestResult[],
  afterResults: BehaviourTestResult[],
  autoDetectTriggers: string[],
  investigatorFlags?: { risk?: string; classification?: string; quality?: string }
): GateDecision {
  const reasons: string[] = [];
  let riskLevel: GateDecision['riskLevel'] = 'low';

  const afterMap = new Map(afterResults.map(t => [t.testId, t]));
  for (const testId of Array.from(afterMap.keys())) {
    const test = afterMap.get(testId)!;
    if (test.status === 'fail') {
      reasons.push(`❌ RULE 1: Test "${testId}" FAILED after applying patch`);
      riskLevel = 'high';
    }
  }

  if (diff.statusChanges.passToError > 0 || diff.newErrors.length > 0) {
    reasons.push(`❌ RULE 2: New ERROR appeared (${diff.statusChanges.passToError} tests)`);
    riskLevel = 'high';
  }

  if (diff.latencyRegressions.length > 0) {
    reasons.push(`❌ RULE 3: Latency regression detected (${diff.latencyRegressions.length} tests > ${LATENCY_REGRESSION_THRESHOLD}% slower)`);
    riskLevel = 'high';
  }

  if (diff.qualityDegradations.length > 0) {
    reasons.push(`❌ RULE 4: Quality degradation detected (${diff.qualityDegradations.length} tests)`);
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
  }

  if (diff.statusChanges.passToFail > 0) {
    reasons.push(`❌ RULE 5: Regression detected (${diff.statusChanges.passToFail} PASS → FAIL)`);
    riskLevel = 'high';
  }

  if (investigatorFlags) {
    if (investigatorFlags.risk === 'high' || 
        ['dangerous', 'structurally breaking', 'major regression'].includes(investigatorFlags.classification || '')) {
      reasons.push(`❌ RULE 6: Investigator flagged patch as high-risk or dangerous`);
      riskLevel = 'high';
    }
    if (investigatorFlags.quality === 'degraded') {
      reasons.push(`❌ RULE 4 (Investigator): Quality marked as degraded`);
      riskLevel = riskLevel === 'high' ? 'high' : 'medium';
    }
  }

  if (autoDetectTriggers.length > 0) {
    reasons.push(`❌ RULE 7: Auto-detection triggers fired (${autoDetectTriggers.join(', ')})`);
    riskLevel = 'high';
  }

  const hasInconsistency = detectInconsistency(afterResults);
  if (hasInconsistency) {
    reasons.push(`❌ RULE 8: Test suite instability detected`);
    riskLevel = 'high';
  }

  const patchIsRelevant = true;
  if (!patchIsRelevant) {
    reasons.push(`❌ RULE 9: Patch appears to modify irrelevant files`);
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
  }

  const hasBootErrors = afterResults.some(t => 
    t.status === 'error' && 
    (t.details?.includes('import') || t.details?.includes('export') || t.details?.includes('boot'))
  );
  if (hasBootErrors) {
    reasons.push(`❌ RULE 10: Patch breaks imports, exports, or server boot`);
    riskLevel = 'high';
  }

  if (reasons.length > 0) {
    return {
      status: 'rejected',
      reasons,
      score: 0,
      riskLevel,
    };
  }

  const allTestsPass = afterResults.every(t => t.status === 'pass');
  const noNewErrors = diff.statusChanges.passToError === 0;
  const noRegressions = diff.statusChanges.passToFail === 0;
  const latencyStableOrImproved = diff.latencyRegressions.length === 0;
  const qualityEqual = diff.qualityDegradations.length === 0;
  const investigatorSafe = !investigatorFlags || 
    (investigatorFlags.risk !== 'high' && investigatorFlags.quality !== 'degraded');
  const noAutoDetectTriggers = autoDetectTriggers.length === 0;

  if (
    allTestsPass &&
    noNewErrors &&
    noRegressions &&
    latencyStableOrImproved &&
    qualityEqual &&
    investigatorSafe &&
    noAutoDetectTriggers
  ) {
    return {
      status: 'approved',
      reasons: [
        '✅ All tests PASS',
        '✅ No new errors',
        '✅ No regressions',
        '✅ Latency stable or improved',
        '✅ Quality maintained or improved',
        '✅ Investigator marks patch as safe',
        '✅ No auto-detection triggers',
      ],
      score: 100,
      riskLevel: 'low',
    };
  }

  reasons.push('⚠️ Patch does not meet all approval criteria');
  return {
    status: 'rejected',
    reasons,
    score: 25,
    riskLevel: 'medium',
  };
}

function detectInconsistency(results: BehaviourTestResult[]): boolean {
  return false;
}
