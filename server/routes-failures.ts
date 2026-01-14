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

// ==================== CATEGORIES ====================

router.get('/categories', async (req, res) => {
  try {
    const categories = await evaluator.failureCategorizer.getAllCategories();
    res.status(200).json(categories);
  } catch (err: any) {
    console.error('Error fetching failure categories:', err);
    await reportError('failure-categories-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch failure categories: ' + err.message });
  }
});

router.get('/categories/:id', async (req, res) => {
  try {
    const category = await evaluator.failureCategorizer.getCategory(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.status(200).json(category);
  } catch (err: any) {
    console.error('Error fetching failure category:', err);
    await reportError('failure-category-api-error', err.message, { id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch failure category: ' + err.message });
  }
});

router.get('/categories/:id/summary', async (req, res) => {
  try {
    const summary = await evaluator.failureCategorizer.getCategorySummary(req.params.id);
    res.status(200).json(summary);
  } catch (err: any) {
    console.error('Error fetching category summary:', err);
    await reportError('category-summary-api-error', err.message, { id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch category summary: ' + err.message });
  }
});

// ==================== CLASSIFICATION ====================

router.post('/classify', async (req, res) => {
  try {
    const { errorMessage, errorStack, context, runId, investigationId } = req.body;

    if (!errorMessage) {
      return res.status(400).json({
        error: 'Missing required field: errorMessage',
      });
    }

    const categorized = await evaluator.failureCategorizer.classifyFailure({
      errorMessage,
      errorStack,
      context,
      runId,
      investigationId,
    });

    res.status(201).json(categorized);
  } catch (err: any) {
    console.error('Error classifying failure:', err);
    await reportError('failure-classify-api-error', err.message, { body: req.body });
    res.status(500).json({ error: 'Failed to classify failure: ' + err.message });
  }
});

router.get('/failures', async (req, res) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;

    const failures = await evaluator.failureCategorizer.getCategorizedFailures({
      categoryId,
      limit,
    });

    res.status(200).json(failures);
  } catch (err: any) {
    console.error('Error fetching categorized failures:', err);
    await reportError('failures-get-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch categorized failures: ' + err.message });
  }
});

router.patch('/failures/:id/resolve', async (req, res) => {
  try {
    const { resolution } = req.body;

    if (!resolution) {
      return res.status(400).json({
        error: 'Missing required field: resolution',
      });
    }

    const failure = await evaluator.failureCategorizer.markResolved(req.params.id, resolution);
    res.status(200).json(failure);
  } catch (err: any) {
    console.error('Error resolving failure:', err);
    await reportError('failure-resolve-api-error', err.message, {
      id: req.params.id,
      resolution: req.body.resolution
    });
    res.status(500).json({ error: 'Failed to resolve failure: ' + err.message });
  }
});

// ==================== PATTERNS ====================

router.get('/patterns', async (req, res) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const patterns = await evaluator.failureCategorizer.detectPatterns(categoryId);
    res.status(200).json(patterns);
  } catch (err: any) {
    console.error('Error detecting patterns:', err);
    await reportError('patterns-detect-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to detect patterns: ' + err.message });
  }
});

router.get('/patterns/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const patterns = await evaluator.failureCategorizer.getTopPatterns(limit);
    res.status(200).json(patterns);
  } catch (err: any) {
    console.error('Error fetching top patterns:', err);
    await reportError('top-patterns-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch top patterns: ' + err.message });
  }
});

// ==================== RECOMMENDATIONS ====================

router.get('/recommendations', async (req, res) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;

    if (categoryId) {
      const recommendations = await evaluator.failureCategorizer.getRecommendations(categoryId);
      res.status(200).json(recommendations);
    } else {
      const allRecommendations = await evaluator.failureCategorizer.getAllRecommendations();
      res.status(200).json(allRecommendations);
    }
  } catch (err: any) {
    console.error('Error generating recommendations:', err);
    await reportError('recommendations-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to generate recommendations: ' + err.message });
  }
});

// ==================== TRENDS ====================

router.get('/trends', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const categoryId = req.query.categoryId as string | undefined;

    const trends = await evaluator.failureCategorizer.getTrends({
      startDate,
      endDate,
      categoryId,
    });

    res.status(200).json(trends);
  } catch (err: any) {
    console.error('Error fetching failure trends:', err);
    await reportError('trends-get-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch failure trends: ' + err.message });
  }
});

router.get('/trends/30-day', async (req, res) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const trends = await evaluator.failureCategorizer.get30DayTrends(categoryId);
    res.status(200).json(trends);
  } catch (err: any) {
    console.error('Error fetching 30-day trends:', err);
    await reportError('30day-trends-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch 30-day trends: ' + err.message });
  }
});

router.get('/trends/spike', async (req, res) => {
  try {
    const spike = await evaluator.failureCategorizer.analyzeFailureSpike();
    res.status(200).json(spike);
  } catch (err: any) {
    console.error('Error analyzing failure spike:', err);
    await reportError('spike-analyze-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to analyze failure spike: ' + err.message });
  }
});

// ==================== MEMORY SYSTEM ====================

router.post('/memory/solutions', async (req, res) => {
  try {
    const { categoryId, patternId, solution, successRate, metadata } = req.body;

    if (!categoryId || !solution || successRate === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: categoryId, solution, successRate',
      });
    }

    const memorySolution = await evaluator.failureCategorizer.recordSolution({
      categoryId,
      patternId,
      solution,
      successRate,
      metadata,
    });

    res.status(201).json(memorySolution);
  } catch (err: any) {
    console.error('Error recording solution:', err);
    await reportError('solution-record-api-error', err.message, { body: req.body });
    res.status(500).json({ error: 'Failed to record solution: ' + err.message });
  }
});

router.get('/memory/solutions', async (req, res) => {
  try {
    const categoryId = req.query.categoryId as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!categoryId) {
      return res.status(400).json({
        error: 'Missing required parameter: categoryId',
      });
    }

    const solutions = await evaluator.failureCategorizer.getMemorySolutions(categoryId, limit);
    res.status(200).json(solutions);
  } catch (err: any) {
    console.error('Error fetching memory solutions:', err);
    await reportError('solutions-get-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch memory solutions: ' + err.message });
  }
});

router.post('/memory/solutions/:id/apply', async (req, res) => {
  try {
    await evaluator.failureCategorizer.applySolution(req.params.id);
    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Error applying solution:', err);
    await reportError('solution-apply-api-error', err.message, { id: req.params.id });
    res.status(500).json({ error: 'Failed to apply solution: ' + err.message });
  }
});

// ==================== OVERVIEW ====================

router.get('/overview', async (req, res) => {
  try {
    const overview = await evaluator.failureCategorizer.getOverview();
    res.status(200).json(overview);
  } catch (err: any) {
    console.error('Error fetching failure overview:', err);
    await reportError('overview-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch failure overview: ' + err.message });
  }
});

router.get('/insights', async (req, res) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const insights = await evaluator.getFailureInsights(categoryId);
    res.status(200).json(insights);
  } catch (err: any) {
    console.error('Error fetching failure insights:', err);
    await reportError('insights-api-error', err.message, {});
    res.status(500).json({ error: 'Failed to fetch failure insights: ' + err.message });
  }
});

export default router;
