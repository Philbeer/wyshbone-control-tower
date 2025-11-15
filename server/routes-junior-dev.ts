import express from 'express';
import { PatchEvaluator } from '../src/evaluator/patchEvaluator.ts';
import {
  buildDevBrief,
  createPatchSuggestion,
  evaluatePatchSuggestion,
  updatePatchSuggestionStatus,
  getPatchSuggestionsForInvestigation,
} from '../src/evaluator/juniorDev.ts';
import { requestAutoPatchForInvestigation } from '../src/evaluator/autoPatch.ts';

const router = express.Router();

let patchEvaluator: PatchEvaluator | null = null;

export function initializeJuniorDevRoutes(autoDetectFn?: Function) {
  patchEvaluator = new PatchEvaluator(autoDetectFn);
}

router.get('/investigations/:id/dev-brief', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[JuniorDevRoutes] Generating dev brief for investigation ${id}`);

    const brief = await buildDevBrief(id);

    res.json(brief);
  } catch (error: any) {
    console.error('[JuniorDevRoutes] Error generating dev brief:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({
      error: 'Failed to generate dev brief',
      details: error.message
    });
  }
});

router.post('/investigations/:id/patch-suggestions', async (req, res) => {
  try {
    if (!patchEvaluator) {
      return res.status(500).json({ error: 'Patch evaluator not initialized' });
    }

    const { id: investigationId } = req.params;
    const { patchText, summary, source, runId, externalLink, autoEvaluate } = req.body;

    if (!patchText || typeof patchText !== 'string') {
      return res.status(400).json({ error: 'Invalid request: patchText is required' });
    }

    console.log(`[JuniorDevRoutes] Creating patch suggestion for investigation ${investigationId}`);

    const suggestion = await createPatchSuggestion({
      investigationId,
      patchText,
      summary: summary || null,
      source: source || 'agent',
      runId: runId || undefined,
      externalLink: externalLink || undefined,
    });

    if (autoEvaluate === true) {
      console.log(`[JuniorDevRoutes] Auto-evaluating patch suggestion ${suggestion.id}`);
      const evalResult = await evaluatePatchSuggestion(suggestion.id, patchEvaluator);

      return res.json({
        suggestion: {
          id: suggestion.id,
          status: evalResult.evaluation.status,
          patchEvaluationId: evalResult.evaluation.id,
        },
        evaluation: {
          status: evalResult.evaluation.status,
          riskLevel: evalResult.evaluation.riskLevel,
          reasons: evalResult.evaluation.reasons,
          summary: evalResult.evaluation.summary,
        },
      });
    }

    res.json({
      suggestion: {
        id: suggestion.id,
        status: suggestion.status,
        investigationId: suggestion.investigationId,
        createdAt: suggestion.createdAt,
      },
    });
  } catch (error: any) {
    console.error('[JuniorDevRoutes] Error creating patch suggestion:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({
      error: 'Failed to create patch suggestion',
      details: error.message
    });
  }
});

router.get('/investigations/:id/patch-suggestions', async (req, res) => {
  try {
    const { id: investigationId } = req.params;

    console.log(`[JuniorDevRoutes] Fetching patch suggestions for investigation ${investigationId}`);

    const suggestions = await getPatchSuggestionsForInvestigation(investigationId);

    res.json({
      investigationId,
      suggestions: suggestions.map(s => ({
        id: s.id,
        status: s.status,
        summary: s.summary,
        source: s.source,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        externalLink: s.externalLink,
        patchEvaluationId: s.patchEvaluationId,
        evaluation: s.evaluation ? {
          status: s.evaluation.status,
          reasons: s.evaluation.reasons,
        } : undefined,
      })),
    });
  } catch (error: any) {
    console.error('[JuniorDevRoutes] Error fetching patch suggestions:', error);
    res.status(500).json({
      error: 'Failed to fetch patch suggestions',
      details: error.message
    });
  }
});

router.post('/patch-suggestions/:id/status', async (req, res) => {
  try {
    const { id: suggestionId } = req.params;
    const { status, externalLink, note } = req.body;

    if (!status || !['applied', 'rejected'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status: must be "applied" or "rejected"'
      });
    }

    console.log(`[JuniorDevRoutes] Updating patch suggestion ${suggestionId} status to ${status}`);

    const updatedSuggestion = await updatePatchSuggestionStatus(
      suggestionId,
      status,
      externalLink,
      note
    );

    res.json({
      id: updatedSuggestion.id,
      status: updatedSuggestion.status,
      updatedAt: updatedSuggestion.updatedAt,
      externalLink: updatedSuggestion.externalLink,
    });
  } catch (error: any) {
    console.error('[JuniorDevRoutes] Error updating patch suggestion status:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Cannot mark')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({
      error: 'Failed to update patch suggestion status',
      details: error.message
    });
  }
});

router.post('/investigations/:id/auto-patch', async (req, res) => {
  try {
    if (!patchEvaluator) {
      return res.status(500).json({ error: 'Patch evaluator not initialized' });
    }

    const { id: investigationId } = req.params;

    console.log(`[JuniorDevRoutes] Auto-patching investigation ${investigationId}`);

    const result = await requestAutoPatchForInvestigation(investigationId, patchEvaluator);

    res.json({
      investigationId,
      suggestionId: result.suggestionId,
      evaluation: result.evaluation,
    });
  } catch (error: any) {
    console.error('[JuniorDevRoutes] Error auto-patching investigation:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Investigation not found' });
    }
    
    if (error.message === 'NO_PATCH_POSSIBLE') {
      return res.status(400).json({
        error: 'Auto-patch not possible',
        reason: 'no_patch_possible',
        details: 'The AI could not generate a safe patch for this investigation'
      });
    }

    res.status(500).json({
      error: 'Evaluation failed',
      details: error.message
    });
  }
});

export default router;
