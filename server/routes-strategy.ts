import express from 'express';
import { evaluator } from '../lib/evaluator.js';

const router = express.Router();

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

router.post('/strategies', async (req, res) => {
  try {
    const { name, description, category, config } = req.body;

    if (!name || !description || !category || !config) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, category, config',
      });
    }

    const strategy = await evaluator.strategyEvaluator.createStrategy({
      name,
      description,
      category,
      config,
    });

    res.status(201).json(strategy);
  } catch (err: any) {
    console.error('Error creating strategy:', err);
    await reportError('strategy-create-api-error', err.message, { body: req.body });
    res.status(500).json({ error: 'Failed to create strategy: ' + err.message });
  }
});

router.get('/strategies', async (req, res) => {
  try {
    const strategies = await evaluator.strategyEvaluator.getAllStrategies();
    res.status(200).json(strategies);
  } catch (err: any) {
    console.error('Error fetching strategies:', err);
    await reportError('strategy-list-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch strategies: ' + err.message });
  }
});

router.get('/strategies/:id', async (req, res) => {
  try {
    const strategy = await evaluator.strategyEvaluator.getStrategy(req.params.id);

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.status(200).json(strategy);
  } catch (err: any) {
    console.error('Error fetching strategy:', err);
    await reportError('strategy-get-api-error', err.message, { id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch strategy: ' + err.message });
  }
});

router.patch('/strategies/:id', async (req, res) => {
  try {
    const updates = req.body;
    const strategy = await evaluator.strategyEvaluator.updateStrategy(req.params.id, updates);

    res.status(200).json(strategy);
  } catch (err: any) {
    console.error('Error updating strategy:', err);
    await reportError('strategy-update-api-error', err.message, {
      id: req.params.id,
      updates: req.body
    });
    res.status(500).json({ error: 'Failed to update strategy: ' + err.message });
  }
});

// ==================== PERFORMANCE TRACKING ====================

router.post('/strategies/:id/performance', async (req, res) => {
  try {
    const { context, runId, metrics, outcome, meta } = req.body;

    if (!context || !metrics || !outcome) {
      return res.status(400).json({
        error: 'Missing required fields: context, metrics, outcome',
      });
    }

    const performance = await evaluator.strategyEvaluator.recordPerformance({
      strategyId: req.params.id,
      context,
      runId,
      metrics,
      outcome,
      meta,
    });

    res.status(201).json(performance);
  } catch (err: any) {
    console.error('Error recording performance:', err);
    await reportError('performance-record-api-error', err.message, {
      strategyId: req.params.id,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to record performance: ' + err.message });
  }
});

router.get('/strategies/:id/performance', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const performance = await evaluator.strategyEvaluator.getPerformance(req.params.id, limit);

    res.status(200).json(performance);
  } catch (err: any) {
    console.error('Error fetching performance:', err);
    await reportError('performance-get-api-error', err.message, { id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch performance: ' + err.message });
  }
});

router.get('/strategies/:id/metrics', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const metrics = await evaluator.strategyEvaluator.getMetrics(
      req.params.id,
      startDate,
      endDate
    );

    res.status(200).json(metrics);
  } catch (err: any) {
    console.error('Error fetching metrics:', err);
    await reportError('metrics-get-api-error', err.message, { id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch metrics: ' + err.message });
  }
});

// ==================== A/B TESTING ====================

router.post('/ab-tests', async (req, res) => {
  try {
    const { name, description, strategyAId, strategyBId, config } = req.body;

    if (!name || !description || !strategyAId || !strategyBId) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, strategyAId, strategyBId',
      });
    }

    const abTest = await evaluator.strategyEvaluator.createAbTest({
      name,
      description,
      strategyAId,
      strategyBId,
      config: config || {},
    });

    res.status(201).json(abTest);
  } catch (err: any) {
    console.error('Error creating A/B test:', err);
    await reportError('ab-test-create-api-error', err.message, { body: req.body });
    res.status(500).json({ error: 'Failed to create A/B test: ' + err.message });
  }
});

router.get('/ab-tests', async (req, res) => {
  try {
    const abTests = await evaluator.strategyEvaluator.getAllAbTests();
    res.status(200).json(abTests);
  } catch (err: any) {
    console.error('Error fetching A/B tests:', err);
    await reportError('ab-test-list-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch A/B tests: ' + err.message });
  }
});

router.post('/ab-tests/:id/results', async (req, res) => {
  try {
    const { strategyId, variant, metrics, outcome } = req.body;

    if (!strategyId || !variant || !metrics || !outcome) {
      return res.status(400).json({
        error: 'Missing required fields: strategyId, variant, metrics, outcome',
      });
    }

    if (variant !== 'A' && variant !== 'B') {
      return res.status(400).json({
        error: 'Invalid variant. Must be "A" or "B"',
      });
    }

    const result = await evaluator.strategyEvaluator.recordAbTestResult({
      testId: req.params.id,
      strategyId,
      variant,
      metrics,
      outcome,
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error('Error recording A/B test result:', err);
    await reportError('ab-test-result-api-error', err.message, {
      testId: req.params.id,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to record A/B test result: ' + err.message });
  }
});

router.get('/ab-tests/:id/analyze', async (req, res) => {
  try {
    const analysis = await evaluator.strategyEvaluator.analyzeAbTest(req.params.id);
    res.status(200).json(analysis);
  } catch (err: any) {
    console.error('Error analyzing A/B test:', err);
    await reportError('ab-test-analyze-api-error', err.message, { testId: req.params.id });
    res.status(500).json({ error: 'Failed to analyze A/B test: ' + err.message });
  }
});

router.patch('/ab-tests/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !['active', 'paused', 'completed'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: active, paused, completed',
      });
    }

    const abTest = await evaluator.strategyEvaluator.updateAbTestStatus(req.params.id, status);
    res.status(200).json(abTest);
  } catch (err: any) {
    console.error('Error updating A/B test status:', err);
    await reportError('ab-test-status-api-error', err.message, {
      testId: req.params.id,
      status: req.body.status
    });
    res.status(500).json({ error: 'Failed to update A/B test status: ' + err.message });
  }
});

// ==================== RECOMMENDATIONS ====================

router.get('/recommendations', async (req, res) => {
  try {
    const recommendations = await evaluator.strategyEvaluator.getRecommendations();
    res.status(200).json(recommendations);
  } catch (err: any) {
    console.error('Error generating recommendations:', err);
    await reportError('recommendations-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to generate recommendations: ' + err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const dashboardData = await evaluator.getStrategyDashboardData();
    res.status(200).json(dashboardData);
  } catch (err: any) {
    console.error('Error fetching dashboard data:', err);
    await reportError('dashboard-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch dashboard data: ' + err.message });
  }
});

// ==================== UTILITY ROUTES ====================

router.post('/compare', async (req, res) => {
  try {
    const { strategyAId, strategyBId, days } = req.body;

    if (!strategyAId || !strategyBId) {
      return res.status(400).json({
        error: 'Missing required fields: strategyAId, strategyBId',
      });
    }

    const comparison = await evaluator.strategyEvaluator.compareStrategies(
      strategyAId,
      strategyBId,
      days || 7
    );

    res.status(200).json(comparison);
  } catch (err: any) {
    console.error('Error comparing strategies:', err);
    await reportError('strategy-compare-api-error', err.message, { body: req.body });
    res.status(500).json({ error: 'Failed to compare strategies: ' + err.message });
  }
});

router.get('/top-performer', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const days = parseInt(req.query.days as string) || 30;

    const topPerformer = await evaluator.strategyEvaluator.getTopPerformingStrategy(
      category,
      days
    );

    if (!topPerformer) {
      return res.status(404).json({ error: 'No strategies found' });
    }

    res.status(200).json(topPerformer);
  } catch (err: any) {
    console.error('Error fetching top performer:', err);
    await reportError('top-performer-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch top performer: ' + err.message });
  }
});

export default router;
