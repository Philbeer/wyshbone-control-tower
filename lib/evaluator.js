/**
 * Evaluator - Main integration point for evaluation systems
 *
 * This module brings together:
 * - Strategy evaluation and A/B testing
 * - Failure categorization and pattern detection
 * - Investigation system
 * - Behaviour tests
 * - Run tracking
 */

import { strategyEvaluator } from './strategy-evaluator.js';
import { failureCategorizer } from './failure-categorizer.js';

class Evaluator {
  constructor() {
    this.strategyEvaluator = strategyEvaluator;
    this.failureCategorizer = failureCategorizer;
    this.investigationModule = null;
    this.behaviourTestModule = null;
  }

  async init() {
    // Lazy load investigation and behaviour test modules
    if (!this.investigationModule) {
      try {
        this.investigationModule = await import('../src/evaluator/executeInvestigation.ts');
      } catch (err) {
        console.warn('Investigation module not available:', err.message);
      }
    }

    if (!this.behaviourTestModule) {
      try {
        this.behaviourTestModule = await import('../src/evaluator/behaviourTests.ts');
      } catch (err) {
        console.warn('Behaviour test module not available:', err.message);
      }
    }

    return this;
  }

  // ==================== STRATEGY EVALUATION ====================

  async evaluateStrategy(strategyId, context, metrics) {
    await this.init();
    return this.strategyEvaluator.recordPerformance({
      strategyId,
      context,
      metrics,
      outcome: metrics.successRate >= 0.8 ? 'success' : 'needs_improvement',
    });
  }

  async runStrategyComparison(strategyAId, strategyBId, options = {}) {
    await this.init();

    const days = options.days || 7;
    const comparison = await this.strategyEvaluator.compareStrategies(
      strategyAId,
      strategyBId,
      days
    );

    // Create A/B test if not exists
    if (options.createAbTest && !options.testId) {
      const abTest = await this.strategyEvaluator.createAbTest({
        name: `${comparison.strategyA.name} vs ${comparison.strategyB.name}`,
        description: `Automatic comparison test created on ${new Date().toISOString()}`,
        strategyAId,
        strategyBId,
        config: {
          trafficSplit: 0.5,
          minSampleSize: 30,
          maxDurationDays: 7,
        },
      });
      return { ...comparison, abTestId: abTest.id };
    }

    return comparison;
  }

  async getBestStrategyForContext(context, category = null) {
    await this.init();

    const topPerformer = await this.strategyEvaluator.getTopPerformingStrategy(category, 30);

    if (!topPerformer) {
      return null;
    }

    return {
      strategy: topPerformer.strategy,
      metrics: topPerformer.metrics,
      context,
      recommendation: `Use "${topPerformer.strategy.name}" for ${context}`,
    };
  }

  // ==================== A/B TESTING INTEGRATION ====================

  async runAbTest(testId, variant, context, metrics) {
    await this.init();

    const test = await this.strategyEvaluator.getAllAbTests().then(tests =>
      tests.find(t => t.id === testId)
    );

    if (!test) {
      throw new Error(`A/B test not found: ${testId}`);
    }

    const strategyId = variant === 'A' ? test.strategyAId : test.strategyBId;

    return this.strategyEvaluator.recordAbTestResult({
      testId,
      strategyId,
      variant,
      metrics,
      outcome: metrics.successRate >= 0.8 ? 'success' : 'failure',
    });
  }

  async analyzeAndRecommend(testId) {
    await this.init();

    const analysis = await this.strategyEvaluator.analyzeAbTest(testId);

    // If there's a clear winner, recommend it
    if (analysis.winner && analysis.significance < 0.05) {
      const test = await this.strategyEvaluator.getAllAbTests().then(tests =>
        tests.find(t => t.id === testId)
      );

      const winningStrategyId =
        analysis.winner === 'A' ? test.strategyAId : test.strategyBId;

      // Mark test as completed
      await this.strategyEvaluator.updateAbTestStatus(testId, 'completed');

      return {
        ...analysis,
        action: 'deploy_winner',
        winningStrategyId,
        message: `Deploy Strategy ${analysis.winner} with ${(analysis.significance * 100).toFixed(2)}% confidence`,
      };
    }

    return {
      ...analysis,
      action: 'continue_testing',
      message: 'Not enough evidence to declare a winner. Continue testing.',
    };
  }

  // ==================== FAILURE CATEGORIZATION INTEGRATION ====================

  async categorizeFailure(error, context = {}) {
    await this.init();

    return this.failureCategorizer.classifyFailure({
      errorMessage: error.message || String(error),
      errorStack: error.stack,
      context,
    });
  }

  async categorizeAndInvestigate(error, runId = null) {
    await this.init();

    // Categorize the failure
    const categorized = await this.failureCategorizer.classifyFromError(error, { runId });

    // Get recommendations for this category
    const recommendations = await this.failureCategorizer.getRecommendations(
      categorized.categoryId
    );

    // Check if there's a known solution in memory
    const bestSolution = await this.failureCategorizer.getBestSolutionForCategory(
      categorized.categoryId
    );

    return {
      categorized,
      recommendations,
      bestSolution,
    };
  }

  async learnFromFailure(categoryId, solution, successRate, metadata = {}) {
    await this.init();

    return this.failureCategorizer.recordSolution({
      categoryId,
      solution,
      successRate,
      metadata,
    });
  }

  async getFailureInsights(categoryId = null) {
    await this.init();

    if (categoryId) {
      return this.failureCategorizer.getCategorySummary(categoryId);
    }

    return this.failureCategorizer.getOverview();
  }

  async detectFailureSpike() {
    await this.init();

    return this.failureCategorizer.analyzeFailureSpike();
  }

  // ==================== INVESTIGATION INTEGRATION ====================

  async investigateStrategyFailure(strategyId, runId = null) {
    await this.init();

    if (!this.investigationModule) {
      throw new Error('Investigation module not available');
    }

    const strategy = await this.strategyEvaluator.getStrategy(strategyId);
    const performance = await this.strategyEvaluator.getPerformance(strategyId, 10);

    const notes = `Investigating strategy "${strategy.name}" due to performance issues. Recent performance: ${JSON.stringify(performance.slice(0, 3))}`;

    return this.investigationModule.executeInvestigation('strategy_failure', runId, notes);
  }

  async investigateCategorizedFailure(failureId) {
    await this.init();

    if (!this.investigationModule) {
      throw new Error('Investigation module not available');
    }

    const failures = await this.failureCategorizer.getCategorizedFailures({ limit: 1000 });
    const failure = failures.find(f => f.id === failureId);

    if (!failure) {
      throw new Error(`Failure not found: ${failureId}`);
    }

    const category = await this.failureCategorizer.getCategory(failure.categoryId);
    const recommendations = await this.failureCategorizer.getRecommendations(failure.categoryId);

    const notes = `Investigating ${category.name} failure: ${failure.errorMessage}. Recommendations: ${recommendations.categoryRecommendation}`;

    return this.investigationModule.executeInvestigation('categorized_failure', failure.runId, notes);
  }

  // ==================== COMPREHENSIVE REPORT ====================

  async generateStrategyReport() {
    await this.init();

    const recommendations = await this.strategyEvaluator.getRecommendations();
    const allStrategies = await this.strategyEvaluator.getAllStrategies();
    const activeAbTests = await this.strategyEvaluator
      .getAllAbTests()
      .then(tests => tests.filter(t => t.status === 'active'));

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalStrategies: allStrategies.length,
        activeStrategies: allStrategies.filter(s => s.isActive).length,
        activeAbTests: activeAbTests.length,
      },
      topPerformers: recommendations.topPerformers,
      underperformers: recommendations.underperformers,
      recommendations: recommendations.recommendations,
      activeAbTests: activeAbTests.map(test => ({
        id: test.id,
        name: test.name,
        status: test.status,
        startedAt: test.startedAt,
      })),
    };
  }

  // ==================== UTILITY METHODS ====================

  async getStrategyDashboardData() {
    await this.init();

    const report = await this.generateStrategyReport();
    const allStrategies = await this.strategyEvaluator.getAllStrategies();

    const strategiesWithMetrics = await Promise.all(
      allStrategies.map(async strategy => {
        const metrics = await this.strategyEvaluator.getMetrics(strategy.id);
        return {
          id: strategy.id,
          name: strategy.name,
          category: strategy.category,
          isActive: strategy.isActive,
          metrics,
        };
      })
    );

    return {
      ...report,
      strategies: strategiesWithMetrics,
    };
  }
}

// Export singleton instance
export const evaluator = new Evaluator();

// Export class for testing
export { Evaluator };
