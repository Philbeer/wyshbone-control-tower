import { db } from "../../lib/db";
import {
  strategies,
  strategyPerformance,
  abTests,
  abTestResults,
  type Strategy,
  type StrategyRow,
  type StrategyPerformance,
  type AbTest,
  type AbTestResult,
} from "../../shared/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

// Debug bridge error reporting
async function reportError(type: string, message: string, data: Record<string, any> = {}) {
  try {
    await fetch('http://localhost:9999/code-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        message,
        repo: 'Tower',
        timestamp: new Date().toISOString(),
        ...data
      })
    });
  } catch (err) {
    // Debug bridge offline - fail silently
  }
}

// ==================== STRATEGY CRUD ====================

export async function createStrategy(params: {
  name: string;
  description: string;
  category: string;
  config: Record<string, any>;
}): Promise<Strategy> {
  try {
    const inserted = await db
      .insert(strategies)
      .values({
        name: params.name,
        description: params.description,
        category: params.category,
        config: params.config,
        isActive: "true",
      })
      .returning();

    const row = inserted[0];
    return {
      ...row,
      isActive: row.isActive === "true",
    };
  } catch (error: any) {
    await reportError('strategy-create-error', error.message, { params });
    throw error;
  }
}

export async function getStrategyById(id: string): Promise<Strategy | null> {
  try {
    const rows = await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, id))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      isActive: row.isActive === "true",
    };
  } catch (error: any) {
    await reportError('strategy-get-error', error.message, { id });
    throw error;
  }
}

export async function getAllStrategies(): Promise<Strategy[]> {
  try {
    const rows = await db
      .select()
      .from(strategies)
      .orderBy(desc(strategies.createdAt));

    return rows.map(row => ({
      ...row,
      isActive: row.isActive === "true",
    }));
  } catch (error: any) {
    await reportError('strategy-list-error', error.message, {});
    throw error;
  }
}

export async function updateStrategy(
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    category: string;
    config: Record<string, any>;
    isActive: boolean;
  }>
): Promise<Strategy> {
  try {
    const updateData: any = { ...updates };
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive ? "true" : "false";
    }
    updateData.updatedAt = new Date();

    const updated = await db
      .update(strategies)
      .set(updateData)
      .where(eq(strategies.id, id))
      .returning();

    const row = updated[0];
    return {
      ...row,
      isActive: row.isActive === "true",
    };
  } catch (error: any) {
    await reportError('strategy-update-error', error.message, { id, updates });
    throw error;
  }
}

// ==================== PERFORMANCE TRACKING ====================

export async function recordStrategyPerformance(params: {
  strategyId: string;
  context: string;
  runId?: string;
  metrics: {
    successRate?: number;
    avgDuration?: number;
    errorCount?: number;
    userSatisfaction?: number;
    throughput?: number;
    [key: string]: any;
  };
  outcome: string;
  meta?: Record<string, any>;
}): Promise<StrategyPerformance> {
  try {
    const inserted = await db
      .insert(strategyPerformance)
      .values({
        strategyId: params.strategyId,
        context: params.context,
        runId: params.runId || null,
        metrics: params.metrics,
        outcome: params.outcome,
        meta: params.meta || null,
      })
      .returning();

    return inserted[0];
  } catch (error: any) {
    await reportError('strategy-performance-record-error', error.message, { params });
    throw error;
  }
}

export async function getStrategyPerformance(
  strategyId: string,
  limit: number = 100
): Promise<StrategyPerformance[]> {
  try {
    const rows = await db
      .select()
      .from(strategyPerformance)
      .where(eq(strategyPerformance.strategyId, strategyId))
      .orderBy(desc(strategyPerformance.executedAt))
      .limit(limit);

    return rows;
  } catch (error: any) {
    await reportError('strategy-performance-get-error', error.message, { strategyId });
    throw error;
  }
}

export async function getAggregatedMetrics(
  strategyId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  avgSuccessRate: number;
  avgDuration: number;
  totalRuns: number;
  totalErrors: number;
  avgUserSatisfaction: number;
}> {
  try {
    let query = db
      .select()
      .from(strategyPerformance)
      .where(eq(strategyPerformance.strategyId, strategyId));

    if (startDate && endDate) {
      query = query.where(
        and(
          gte(strategyPerformance.executedAt, startDate),
          lte(strategyPerformance.executedAt, endDate)
        )
      ) as any;
    }

    const rows = await query;

    if (rows.length === 0) {
      return {
        avgSuccessRate: 0,
        avgDuration: 0,
        totalRuns: 0,
        totalErrors: 0,
        avgUserSatisfaction: 0,
      };
    }

    let totalSuccessRate = 0;
    let totalDuration = 0;
    let totalErrors = 0;
    let totalSatisfaction = 0;
    let satisfactionCount = 0;

    for (const row of rows) {
      const metrics = row.metrics as any;
      totalSuccessRate += metrics.successRate || 0;
      totalDuration += metrics.avgDuration || 0;
      totalErrors += metrics.errorCount || 0;
      if (metrics.userSatisfaction !== undefined) {
        totalSatisfaction += metrics.userSatisfaction;
        satisfactionCount++;
      }
    }

    return {
      avgSuccessRate: totalSuccessRate / rows.length,
      avgDuration: totalDuration / rows.length,
      totalRuns: rows.length,
      totalErrors,
      avgUserSatisfaction: satisfactionCount > 0 ? totalSatisfaction / satisfactionCount : 0,
    };
  } catch (error: any) {
    await reportError('strategy-metrics-aggregate-error', error.message, { strategyId });
    throw error;
  }
}

// ==================== A/B TESTING FRAMEWORK ====================

export async function createAbTest(params: {
  name: string;
  description: string;
  strategyAId: string;
  strategyBId: string;
  config?: {
    trafficSplit?: number;
    minSampleSize?: number;
    maxDurationDays?: number;
    [key: string]: any;
  };
}): Promise<AbTest> {
  try {
    const inserted = await db
      .insert(abTests)
      .values({
        name: params.name,
        description: params.description,
        strategyAId: params.strategyAId,
        strategyBId: params.strategyBId,
        status: "active",
        config: params.config || {},
      })
      .returning();

    return inserted[0];
  } catch (error: any) {
    await reportError('ab-test-create-error', error.message, { params });
    throw error;
  }
}

export async function recordAbTestResult(params: {
  testId: string;
  strategyId: string;
  variant: "A" | "B";
  metrics: {
    successRate?: number;
    avgDuration?: number;
    errorCount?: number;
    userSatisfaction?: number;
    [key: string]: any;
  };
  outcome: string;
}): Promise<AbTestResult> {
  try {
    const inserted = await db
      .insert(abTestResults)
      .values({
        testId: params.testId,
        strategyId: params.strategyId,
        variant: params.variant,
        metrics: params.metrics,
        outcome: params.outcome,
      })
      .returning();

    return inserted[0];
  } catch (error: any) {
    await reportError('ab-test-result-record-error', error.message, { params });
    throw error;
  }
}

export async function getAbTestResults(testId: string): Promise<{
  variantA: AbTestResult[];
  variantB: AbTestResult[];
}> {
  try {
    const allResults = await db
      .select()
      .from(abTestResults)
      .where(eq(abTestResults.testId, testId))
      .orderBy(desc(abTestResults.executedAt));

    const variantA = allResults.filter(r => r.variant === "A");
    const variantB = allResults.filter(r => r.variant === "B");

    return { variantA, variantB };
  } catch (error: any) {
    await reportError('ab-test-results-get-error', error.message, { testId });
    throw error;
  }
}

// ==================== STATISTICAL SIGNIFICANCE ====================

/**
 * Calculate statistical significance using two-sample t-test
 * Returns p-value (lower is more significant)
 */
export function calculateStatisticalSignificance(
  samplesA: number[],
  samplesB: number[]
): {
  pValue: number;
  isSignificant: boolean;
  tStatistic: number;
  degreesOfFreedom: number;
} {
  try {
    const n1 = samplesA.length;
    const n2 = samplesB.length;

    if (n1 < 2 || n2 < 2) {
      return {
        pValue: 1,
        isSignificant: false,
        tStatistic: 0,
        degreesOfFreedom: 0,
      };
    }

    // Calculate means
    const mean1 = samplesA.reduce((a, b) => a + b, 0) / n1;
    const mean2 = samplesB.reduce((a, b) => a + b, 0) / n2;

    // Calculate variances
    const variance1 = samplesA.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
    const variance2 = samplesB.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);

    // Calculate pooled standard error
    const pooledSE = Math.sqrt(variance1 / n1 + variance2 / n2);

    if (pooledSE === 0) {
      return {
        pValue: mean1 === mean2 ? 1 : 0,
        isSignificant: mean1 !== mean2,
        tStatistic: mean1 === mean2 ? 0 : Infinity,
        degreesOfFreedom: n1 + n2 - 2,
      };
    }

    // Calculate t-statistic
    const tStatistic = (mean1 - mean2) / pooledSE;

    // Degrees of freedom (Welch-Satterthwaite equation)
    const df = Math.floor(
      Math.pow(variance1 / n1 + variance2 / n2, 2) /
      (Math.pow(variance1 / n1, 2) / (n1 - 1) + Math.pow(variance2 / n2, 2) / (n2 - 1))
    );

    // Approximate p-value using t-distribution approximation
    const absTStat = Math.abs(tStatistic);
    const pValue = 2 * (1 - approximateTCDF(absTStat, df));

    return {
      pValue,
      isSignificant: pValue < 0.05,
      tStatistic,
      degreesOfFreedom: df,
    };
  } catch (error: any) {
    reportError('significance-calculation-error', error.message, {
      samplesACount: samplesA.length,
      samplesBCount: samplesB.length
    });
    throw error;
  }
}

/**
 * Approximate t-distribution CDF using normal approximation for large df
 */
function approximateTCDF(t: number, df: number): number {
  if (df > 30) {
    // Use normal approximation for large df
    return normalCDF(t);
  }

  // Simple approximation for small df
  const x = df / (df + t * t);
  return 1 - 0.5 * Math.pow(x, df / 2);
}

/**
 * Standard normal cumulative distribution function
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return x > 0 ? 1 - probability : probability;
}

// ==================== A/B TEST ANALYSIS ====================

export async function analyzeAbTest(testId: string): Promise<{
  strategyAMetrics: any;
  strategyBMetrics: any;
  winner: "A" | "B" | "tie" | null;
  significance: number;
  recommendation: string;
  chartData: any;
}> {
  try {
    const test = await db
      .select()
      .from(abTests)
      .where(eq(abTests.id, testId))
      .limit(1);

    if (test.length === 0) {
      throw new Error(`A/B test not found: ${testId}`);
    }

    const { variantA, variantB } = await getAbTestResults(testId);

    if (variantA.length === 0 || variantB.length === 0) {
      return {
        strategyAMetrics: {},
        strategyBMetrics: {},
        winner: null,
        significance: 0,
        recommendation: "Not enough data to analyze. Run more tests.",
        chartData: [],
      };
    }

    // Extract metrics
    const successRatesA = variantA.map(r => (r.metrics as any).successRate || 0);
    const successRatesB = variantB.map(r => (r.metrics as any).successRate || 0);

    const durationsA = variantA.map(r => (r.metrics as any).avgDuration || 0);
    const durationsB = variantB.map(r => (r.metrics as any).avgDuration || 0);

    // Calculate aggregated metrics
    const avgSuccessRateA = successRatesA.reduce((a, b) => a + b, 0) / successRatesA.length;
    const avgSuccessRateB = successRatesB.reduce((a, b) => a + b, 0) / successRatesB.length;

    const avgDurationA = durationsA.reduce((a, b) => a + b, 0) / durationsA.length;
    const avgDurationB = durationsB.reduce((a, b) => a + b, 0) / durationsB.length;

    // Calculate statistical significance for success rates
    const successRateSignificance = calculateStatisticalSignificance(
      successRatesA,
      successRatesB
    );

    // Determine winner
    let winner: "A" | "B" | "tie" = "tie";
    if (successRateSignificance.isSignificant) {
      winner = avgSuccessRateA > avgSuccessRateB ? "A" : "B";
    }

    // Generate recommendation
    let recommendation = "";
    if (!successRateSignificance.isSignificant) {
      recommendation = "No statistically significant difference found. Consider running more tests or adjusting strategies.";
    } else {
      const winnerLetter = winner;
      const improvement = Math.abs(avgSuccessRateA - avgSuccessRateB);
      recommendation = `Strategy ${winnerLetter} is the clear winner with ${(improvement * 100).toFixed(2)}% better success rate (p-value: ${successRateSignificance.pValue.toFixed(4)}). Recommend deploying Strategy ${winnerLetter}.`;
    }

    // Prepare chart data
    const chartData = [
      {
        variant: "Strategy A",
        successRate: avgSuccessRateA,
        avgDuration: avgDurationA,
        sampleSize: variantA.length,
      },
      {
        variant: "Strategy B",
        successRate: avgSuccessRateB,
        avgDuration: avgDurationB,
        sampleSize: variantB.length,
      },
    ];

    const results = {
      strategyAMetrics: {
        avgSuccessRate: avgSuccessRateA,
        avgDuration: avgDurationA,
        sampleSize: variantA.length,
      },
      strategyBMetrics: {
        avgSuccessRate: avgSuccessRateB,
        avgDuration: avgDurationB,
        sampleSize: variantB.length,
      },
      winner: winner === "tie" ? null : winner,
      significance: successRateSignificance.pValue,
      recommendation,
      chartData,
    };

    // Update A/B test with results
    await db
      .update(abTests)
      .set({
        results,
      })
      .where(eq(abTests.id, testId));

    return results;
  } catch (error: any) {
    await reportError('ab-test-analysis-error', error.message, { testId });
    throw error;
  }
}

// ==================== AUTOMATIC RECOMMENDATIONS ====================

export async function generateStrategyRecommendations(): Promise<{
  topPerformers: Array<{ strategy: Strategy; metrics: any }>;
  underperformers: Array<{ strategy: Strategy; metrics: any }>;
  recommendations: string[];
}> {
  try {
    const allStrategies = await getAllStrategies();
    const activeStrategies = allStrategies.filter(s => s.isActive);

    const strategyMetrics = await Promise.all(
      activeStrategies.map(async strategy => {
        const metrics = await getAggregatedMetrics(strategy.id);
        return { strategy, metrics };
      })
    );

    // Sort by success rate
    strategyMetrics.sort((a, b) => b.metrics.avgSuccessRate - a.metrics.avgSuccessRate);

    const topPerformers = strategyMetrics.slice(0, 3);
    const underperformers = strategyMetrics.slice(-3);

    const recommendations: string[] = [];

    // Recommendation 1: Promote top performers
    if (topPerformers.length > 0 && topPerformers[0].metrics.avgSuccessRate > 0.8) {
      recommendations.push(
        `Strategy "${topPerformers[0].strategy.name}" is performing exceptionally well (${(topPerformers[0].metrics.avgSuccessRate * 100).toFixed(1)}% success rate). Consider using it as the default strategy.`
      );
    }

    // Recommendation 2: Flag underperformers
    for (const item of underperformers) {
      if (item.metrics.avgSuccessRate < 0.5 && item.metrics.totalRuns > 10) {
        recommendations.push(
          `Strategy "${item.strategy.name}" is underperforming (${(item.metrics.avgSuccessRate * 100).toFixed(1)}% success rate). Consider deactivating or optimizing it.`
        );
      }
    }

    // Recommendation 3: Suggest A/B tests
    if (strategyMetrics.length >= 2) {
      const topTwo = strategyMetrics.slice(0, 2);
      const difference = Math.abs(
        topTwo[0].metrics.avgSuccessRate - topTwo[1].metrics.avgSuccessRate
      );
      if (difference < 0.1 && topTwo[0].metrics.totalRuns > 20 && topTwo[1].metrics.totalRuns > 20) {
        recommendations.push(
          `Strategies "${topTwo[0].strategy.name}" and "${topTwo[1].strategy.name}" have similar performance. Consider running an A/B test to determine the better strategy.`
        );
      }
    }

    return {
      topPerformers,
      underperformers,
      recommendations,
    };
  } catch (error: any) {
    await reportError('recommendation-generation-error', error.message, {});
    throw error;
  }
}

// ==================== UTILITY FUNCTIONS ====================

export async function getAllAbTests(): Promise<AbTest[]> {
  try {
    return await db
      .select()
      .from(abTests)
      .orderBy(desc(abTests.createdAt));
  } catch (error: any) {
    await reportError('ab-test-list-error', error.message, {});
    throw error;
  }
}

export async function updateAbTestStatus(
  testId: string,
  status: "active" | "paused" | "completed"
): Promise<AbTest> {
  try {
    const updated = await db
      .update(abTests)
      .set({
        status,
        endedAt: status === "completed" ? new Date() : null,
      })
      .where(eq(abTests.id, testId))
      .returning();

    return updated[0];
  } catch (error: any) {
    await reportError('ab-test-status-update-error', error.message, { testId, status });
    throw error;
  }
}
