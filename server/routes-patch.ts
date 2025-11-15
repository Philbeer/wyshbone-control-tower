import express from 'express';
import { PatchEvaluator } from '../src/evaluator/patchEvaluator';

const router = express.Router();

let patchEvaluator: PatchEvaluator | null = null;

export function initializePatchRoutes(autoDetectFn?: Function) {
  patchEvaluator = new PatchEvaluator(autoDetectFn);
}

router.post('/submit', async (req, res) => {
  try {
    if (!patchEvaluator) {
      return res.status(500).json({ error: 'Patch evaluator not initialized' });
    }

    const { patch } = req.body;

    if (!patch || typeof patch !== 'string') {
      return res.status(400).json({ error: 'Invalid patch: must provide patch text' });
    }

    console.log(`[PatchRoutes] Received patch submission (${patch.length} bytes)`);

    const result = await patchEvaluator.evaluatePatch({ patch });

    res.json({
      id: result.id,
      status: result.status,
      reasons: result.reasons,
      summary: result.summary,
      riskLevel: result.riskLevel,
      diff: result.diff,
      beforeResults: result.beforeResults,
      afterResults: result.afterResults,
      investigationIds: result.investigationIds,
    });
  } catch (error: any) {
    console.error('[PatchRoutes] Error during patch evaluation:', error);
    res.status(500).json({ 
      error: 'Patch evaluation failed', 
      details: error.message 
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!patchEvaluator) {
      return res.status(500).json({ error: 'Patch evaluator not initialized' });
    }

    const { id } = req.params;

    const evaluation = await patchEvaluator.getEvaluation(id);

    if (!evaluation) {
      return res.status(404).json({ error: 'Patch evaluation not found' });
    }

    res.json(evaluation);
  } catch (error: any) {
    console.error('[PatchRoutes] Error fetching patch evaluation:', error);
    res.status(500).json({ 
      error: 'Failed to fetch patch evaluation', 
      details: error.message 
    });
  }
});

export default router;
