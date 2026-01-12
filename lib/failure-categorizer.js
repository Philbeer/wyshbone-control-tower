/**
 * Failure Categorizer - Simple JavaScript wrapper for failure categorization
 *
 * This module provides a friendly interface for:
 * - Classifying failures into categories
 * - Detecting failure patterns
 * - Generating category-specific recommendations
 * - Tracking failure trends over time
 * - Integrating with memory system for learned solutions
 */

class FailureCategorizer {
  constructor() {
    this.coreModule = null;
  }

  async init() {
    if (!this.coreModule) {
      this.coreModule = await import('../src/evaluator/failureCategorizer.ts');
    }
    return this;
  }

  // ==================== CATEGORY MANAGEMENT ====================

  async ensureCategories() {
    await this.init();
    return this.coreModule.ensureDefaultCategories();
  }

  async getAllCategories() {
    await this.init();
    return this.coreModule.getAllCategories();
  }

  async getCategory(id) {
    await this.init();
    return this.coreModule.getCategoryById(id);
  }

  // ==================== FAILURE CLASSIFICATION ====================

  async classifyFailure({ errorMessage, errorStack, context, runId, investigationId }) {
    await this.init();
    return this.coreModule.classifyFailure({
      errorMessage,
      errorStack,
      context,
      runId,
      investigationId,
    });
  }

  async classifyFromError(error, context = {}) {
    await this.init();
    return this.coreModule.classifyFailure({
      errorMessage: error.message || String(error),
      errorStack: error.stack,
      context,
    });
  }

  async getCategorizedFailures({ categoryId, limit = 100 } = {}) {
    await this.init();
    return this.coreModule.getCategorizedFailures({ categoryId, limit });
  }

  async markResolved(failureId, resolution) {
    await this.init();
    return this.coreModule.markFailureResolved(failureId, resolution);
  }

  // ==================== PATTERN DETECTION ====================

  async detectPatterns(categoryId = null) {
    await this.init();
    return this.coreModule.detectPatterns(categoryId);
  }

  async getTopPatterns(limit = 10) {
    await this.init();
    const patterns = await this.coreModule.detectPatterns();
    return patterns.slice(0, limit);
  }

  // ==================== RECOMMENDATIONS ====================

  async getRecommendations(categoryId) {
    await this.init();
    return this.coreModule.generateRecommendations(categoryId);
  }

  async getAllRecommendations() {
    await this.init();
    const categories = await this.coreModule.getAllCategories();
    const recommendations = [];

    for (const category of categories) {
      try {
        const rec = await this.coreModule.generateRecommendations(category.id);
        recommendations.push({
          category,
          ...rec,
        });
      } catch (err) {
        // Skip categories with no data
      }
    }

    return recommendations;
  }

  // ==================== TREND TRACKING ====================

  async getTrends({ startDate, endDate, categoryId } = {}) {
    await this.init();
    return this.coreModule.getFailureTrends({
      startDate,
      endDate,
      categoryId,
    });
  }

  async get30DayTrends(categoryId = null) {
    await this.init();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    return this.coreModule.getFailureTrends({
      startDate,
      endDate,
      categoryId,
    });
  }

  async get7DayTrends(categoryId = null) {
    await this.init();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    return this.coreModule.getFailureTrends({
      startDate,
      endDate,
      categoryId,
    });
  }

  // ==================== MEMORY SYSTEM ====================

  async recordSolution({ categoryId, patternId, solution, successRate, metadata }) {
    await this.init();
    return this.coreModule.recordSolution({
      categoryId,
      patternId,
      solution,
      successRate,
      metadata,
    });
  }

  async applySolution(solutionId) {
    await this.init();
    return this.coreModule.applySolution(solutionId);
  }

  async getMemorySolutions(categoryId, limit = 10) {
    await this.init();
    return this.coreModule.getMemorySolutions(categoryId, limit);
  }

  async getBestSolutionForCategory(categoryId) {
    await this.init();
    const solutions = await this.coreModule.getMemorySolutions(categoryId, 1);
    return solutions[0] || null;
  }

  // ==================== HELPER METHODS ====================

  async getCategorySummary(categoryId) {
    await this.init();

    const category = await this.coreModule.getCategoryById(categoryId);
    const patterns = await this.coreModule.detectPatterns(categoryId);
    const failures = await this.coreModule.getCategorizedFailures({ categoryId, limit: 100 });
    const recommendations = await this.coreModule.generateRecommendations(categoryId);
    const memorySolutions = await this.coreModule.getMemorySolutions(categoryId);

    return {
      category,
      totalFailures: failures.length,
      patterns: patterns.length,
      topPatterns: patterns.slice(0, 5),
      recommendations,
      memorySolutions,
      recentFailures: failures.slice(0, 10),
    };
  }

  async getOverview() {
    await this.init();

    const categories = await this.coreModule.getAllCategories();
    const trends = await this.get30DayTrends();
    const topPatterns = await this.getTopPatterns(10);
    const allRecommendations = await this.getAllRecommendations();

    return {
      totalCategories: categories.length,
      totalFailures: trends.totalFailures,
      byCategory: trends.byCategory,
      topPatterns,
      recommendations: allRecommendations,
      trends,
    };
  }

  async analyzeFailureSpike() {
    await this.init();

    const today = await this.get7DayTrends();
    const lastWeek = await this.getTrends({
      startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });

    const todayTotal = today.totalFailures;
    const lastWeekTotal = lastWeek.totalFailures;

    const percentageChange = ((todayTotal - lastWeekTotal) / lastWeekTotal) * 100;

    return {
      currentWeek: todayTotal,
      previousWeek: lastWeekTotal,
      percentageChange,
      isSpike: percentageChange > 50,
      categoriesAffected: today.byCategory.slice(0, 5),
    };
  }
}

// Export singleton instance
export const failureCategorizer = new FailureCategorizer();

// Export class for testing
export { FailureCategorizer };
