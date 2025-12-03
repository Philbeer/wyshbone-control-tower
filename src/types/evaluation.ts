/**
 * TOW-3: Evaluation result type definitions
 * 
 * These types define the structure of evaluation results returned
 * by the evaluator after processing a signal/event.
 */

/**
 * Possible outcomes from evaluating a signal.
 * - 'ok': Signal was successfully processed
 * - 'ignored': Signal was intentionally skipped (e.g., irrelevant event type)
 * - 'error': An error occurred during evaluation
 */
export type EvaluationOutcome = 'ok' | 'ignored' | 'error';

/**
 * EvaluationResult represents the output of running a signal through
 * the evaluator. For TOW-3 this is a stub that logs and returns a
 * canned response. Future tasks will add real AI-powered evaluation.
 */
export interface EvaluationResult {
  /** The outcome of the evaluation */
  outcome: EvaluationOutcome;
  
  /** Short human-readable summary of what happened */
  summary: string;
  
  /** Additional details about the evaluation (echoed metadata, signal info, etc.) */
  details?: Record<string, unknown>;
  
  /** True if this is a stub/placeholder evaluation (no real AI logic) */
  isStub: boolean;
  
  /** ISO timestamp when the evaluation was created */
  createdAt: string;
}

