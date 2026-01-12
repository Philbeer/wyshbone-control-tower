/**
 * Strategy Evaluator - Simple JavaScript wrapper for strategy evaluation
 *
 * This module provides a friendly interface for:
 * - Creating and managing strategies
 * - Recording performance metrics
 * - Running A/B tests
 * - Getting recommendations
 */

class StrategyEvaluator {
  constructor() {
    this.coreModule = null;
  }

  async init() {
    if (!this.coreModule) {
      this.coreModule = await import('../src/evaluator/strategyEvaluator.ts');
    }
    return this;
  }

  // ==================== STRATEGY MANAGEMENT ====================

  async createStrategy({ name, description, category, config }) {
    await this.init();
    return this.coreModule.createStrategy({ name, description, category, config });
  }

  async getStrategy(id) {
    await this.init();
    return this.coreModule.getStrategyById(id);
  }

  async getAllStrategies() {
    await this.init();
    return this.coreModule.getAllStrategies();
  }

  async updateStrategy(id, updates) {
    await this.init();
    return this.coreModule.updateStrategy(id, updates);
  }

  async deactivateStrategy(id) {
    await this.init();
    return this.coreModule.updateStrategy(id, { isActive: false });
  }

  // ==================== PERFORMANCE TRACKING ====================

  async recordPerformance({ strategyId, context, runId, metrics, outcome, meta }) {
    await this.init();
    return this.coreModule.recordStrategyPerformance({
      strategyId,
      context,
      runId,
      metrics,
      outcome,
      meta,
    });
  }

  async getPerformance(strategyId, limit = 100) {
    await this.init();
    return this.coreModule.getStrategyPerformance(strategyId, limit);
  }

  async getMetrics(strategyId, startDate = null, endDate = null) {
    await this.init();
    return this.coreModule.getAggregatedMetrics(strategyId, startDate, endDate);
  }

  // ==================== A/B TESTING ====================

  async createAbTest({ name, description, strategyAId, strategyBId, config = {} }) {
    await this.init();
    return this.coreModule.createAbTest({
      name,
      description,
      strategyAId,
      strategyBId,
      config,
    });
  }

  async recordAbTestResult({ testId, strategyId, variant, metrics, outcome }) {
    await this.init();
    return this.coreModule.recordAbTestResult({
      testId,
      strategyId,
      variant,
      metrics,
      outcome,
    });
  }

  async analyzeAbTest(testId) {
    await this.init();
    return this.coreModule.analyzeAbTest(testId);
  }

  async getAllAbTests() {
    await this.init();
    return this.coreModule.getAllAbTests();
  }

  async updateAbTestStatus(testId, status) {
    await this.init();
    return this.coreModule.updateAbTestStatus(testId, status);
  }

  // ==================== RECOMMENDATIONS ====================

  async getRecommendations() {
    await this.init();
    return this.coreModule.generateStrategyRecommendations();
  }

  // ==================== HELPER METHODS ====================

  async compareStrategies(strategyAId, strategyBId, days = 7) {
    await this.init();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const metricsA = await this.coreModule.getAggregatedMetrics(strategyAId, startDate, endDate);
    const metricsB = await this.coreModule.getAggregatedMetrics(strategyBId, startDate, endDate);

    const strategyA = await this.coreModule.getStrategyById(strategyAId);
    const strategyB = await this.coreModule.getStrategyById(strategyBId);

    return {
      strategyA: {
        ...strategyA,
        metrics: metricsA,
      },
      strategyB: {
        ...strategyB,
        metrics: metricsB,
      },
      comparison: {
        successRateDiff: metricsA.avgSuccessRate - metricsB.avgSuccessRate,
        durationDiff: metricsA.avgDuration - metricsB.avgDuration,
        totalRunsDiff: metricsA.totalRuns - metricsB.totalRuns,
      },
    };
  }

  async getTopPerformingStrategy(category = null, days = 30) {
    await this.init();

    let strategies = await this.coreModule.getAllStrategies();

    if (category) {
      strategies = strategies.filter(s => s.category === category);
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const strategiesWithMetrics = await Promise.all(
      strategies.map(async strategy => {
        const metrics = await this.coreModule.getAggregatedMetrics(
          strategy.id,
          startDate,
          endDate
        );
        return { strategy, metrics };
      })
    );

    // Sort by success rate, then by number of runs
    strategiesWithMetrics.sort((a, b) => {
      if (b.metrics.avgSuccessRate !== a.metrics.avgSuccessRate) {
        return b.metrics.avgSuccessRate - a.metrics.avgSuccessRate;
      }
      return b.metrics.totalRuns - a.metrics.totalRuns;
    });

    return strategiesWithMetrics[0] || null;
  }
}

// Export singleton instance
export const strategyEvaluator = new StrategyEvaluator();

// Export class for testing
export { StrategyEvaluator };
