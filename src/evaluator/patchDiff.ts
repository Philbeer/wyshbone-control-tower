import type { BehaviourTestResult } from "./behaviourTests";

export type TestDiff = {
  testId: string;
  before: BehaviourTestResult;
  after: BehaviourTestResult;
  statusChanged: boolean;
  latencyIncrease: number | null;
  latencyIncreasePercent: number | null;
  qualityChanged: boolean;
  isRegression: boolean;
};

export type PatchDiffSummary = {
  totalTests: number;
  statusChanges: {
    passToFail: number;
    passToError: number;
    failToPass: number;
    errorToPass: number;
  };
  latencyRegressions: Array<{
    testId: string;
    before: number;
    after: number;
    increase: number;
    increasePercent: number;
  }>;
  qualityDegradations: string[];
  newErrors: string[];
  improvements: string[];
  testDiffs: TestDiff[];
};

export function diffTestResults(
  before: BehaviourTestResult[],
  after: BehaviourTestResult[]
): PatchDiffSummary {
  const beforeMap = new Map(before.map(t => [t.testId, t]));
  const afterMap = new Map(after.map(t => [t.testId, t]));

  const testDiffs: TestDiff[] = [];
  const statusChanges = {
    passToFail: 0,
    passToError: 0,
    failToPass: 0,
    errorToPass: 0,
  };
  const latencyRegressions: PatchDiffSummary['latencyRegressions'] = [];
  const qualityDegradations: string[] = [];
  const newErrors: string[] = [];
  const improvements: string[] = [];

  const allTestIds = new Set([...Array.from(beforeMap.keys()), ...Array.from(afterMap.keys())]);
  for (const testId of Array.from(allTestIds)) {
    const beforeTest = beforeMap.get(testId);
    const afterTest = afterMap.get(testId);

    if (!beforeTest || !afterTest) {
      continue;
    }

    const statusChanged = beforeTest.status !== afterTest.status;
    let latencyIncrease: number | null = null;
    let latencyIncreasePercent: number | null = null;

    if (beforeTest.durationMs && afterTest.durationMs) {
      latencyIncrease = afterTest.durationMs - beforeTest.durationMs;
      latencyIncreasePercent = (latencyIncrease / beforeTest.durationMs) * 100;

      if (latencyIncreasePercent > 30) {
        latencyRegressions.push({
          testId,
          before: beforeTest.durationMs,
          after: afterTest.durationMs,
          increase: latencyIncrease,
          increasePercent: latencyIncreasePercent,
        });
      }
    }

    const qualityChanged = detectQualityChange(beforeTest, afterTest);
    const isRegression = 
      (beforeTest.status === 'pass' && afterTest.status !== 'pass') ||
      (beforeTest.status !== 'error' && afterTest.status === 'error');

    if (statusChanged) {
      if (beforeTest.status === 'pass' && afterTest.status === 'fail') {
        statusChanges.passToFail++;
      } else if (beforeTest.status === 'pass' && afterTest.status === 'error') {
        statusChanges.passToError++;
      } else if (beforeTest.status === 'fail' && afterTest.status === 'pass') {
        statusChanges.failToPass++;
      } else if (beforeTest.status === 'error' && afterTest.status === 'pass') {
        statusChanges.errorToPass++;
      }
    }

    if (isRegression) {
      newErrors.push(`${testId}: ${beforeTest.status} → ${afterTest.status}`);
    }

    if (qualityChanged) {
      qualityDegradations.push(`${testId}: Response quality degraded`);
    }

    if (!statusChanged && !isRegression && afterTest.status === 'pass') {
      if (latencyIncrease && latencyIncrease < 0) {
        improvements.push(`${testId}: Latency improved by ${Math.abs(latencyIncrease)}ms`);
      }
    }

    testDiffs.push({
      testId,
      before: beforeTest,
      after: afterTest,
      statusChanged,
      latencyIncrease,
      latencyIncreasePercent,
      qualityChanged,
      isRegression,
    });
  }

  return {
    totalTests: testDiffs.length,
    statusChanges,
    latencyRegressions,
    qualityDegradations,
    newErrors,
    improvements,
    testDiffs,
  };
}

function detectQualityChange(before: BehaviourTestResult, after: BehaviourTestResult): boolean {
  const beforeResponse = before.rawLog?.response || '';
  const afterResponse = after.rawLog?.response || '';

  if (typeof beforeResponse === 'string' && typeof afterResponse === 'string') {
    if (afterResponse.length < beforeResponse.length * 0.5) {
      return true;
    }

    if (afterResponse.trim().length < 10 && beforeResponse.trim().length >= 10) {
      return true;
    }

    const beforeHasGreeting = /\b(hi|hello|hey|welcome|greetings)\b/i.test(beforeResponse);
    const afterHasGreeting = /\b(hi|hello|hey|welcome|greetings)\b/i.test(afterResponse);
    if (beforeHasGreeting && !afterHasGreeting && before.testId === 'greeting-basic') {
      return true;
    }
  }

  return false;
}

export function summarizeDiff(diff: PatchDiffSummary): string {
  const lines: string[] = [];

  lines.push(`📊 PATCH EVALUATION DIFF`);
  lines.push(`Total tests: ${diff.totalTests}`);
  lines.push(``);

  lines.push(`Status Changes:`);
  lines.push(`  PASS → FAIL: ${diff.statusChanges.passToFail}`);
  lines.push(`  PASS → ERROR: ${diff.statusChanges.passToError}`);
  lines.push(`  FAIL → PASS: ${diff.statusChanges.failToPass}`);
  lines.push(`  ERROR → PASS: ${diff.statusChanges.errorToPass}`);
  lines.push(``);

  if (diff.latencyRegressions.length > 0) {
    lines.push(`⏱️ Latency Regressions (${diff.latencyRegressions.length}):`);
    diff.latencyRegressions.forEach(r => {
      lines.push(`  ${r.testId}: ${r.before}ms → ${r.after}ms (+${r.increasePercent.toFixed(1)}%)`);
    });
    lines.push(``);
  }

  if (diff.qualityDegradations.length > 0) {
    lines.push(`📉 Quality Degradations (${diff.qualityDegradations.length}):`);
    diff.qualityDegradations.forEach(q => lines.push(`  ${q}`));
    lines.push(``);
  }

  if (diff.newErrors.length > 0) {
    lines.push(`❌ New Errors/Failures (${diff.newErrors.length}):`);
    diff.newErrors.forEach(e => lines.push(`  ${e}`));
    lines.push(``);
  }

  if (diff.improvements.length > 0) {
    lines.push(`✅ Improvements (${diff.improvements.length}):`);
    diff.improvements.forEach(i => lines.push(`  ${i}`));
    lines.push(``);
  }

  return lines.join('\n');
}
