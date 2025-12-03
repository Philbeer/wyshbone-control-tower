/**
 * TOW-3: Minimal evaluator stub (log-only, canned response)
 * 
 * This module provides a simple, synchronous evaluator function that:
 * - Logs the incoming signal/event
 * - Returns a canned EvaluationResult
 * 
 * NO real AI logic yet. This is just wiring + logging + a fake result.
 * Future TOW tasks will add actual evaluation capabilities.
 */

import type { NormalizedEvent } from "../types/events";
import type { EvaluationResult } from "../types/evaluation";

/**
 * Evaluates a normalized event/signal and returns a canned result.
 * 
 * This is a stub implementation for TOW-3 that:
 * 1. Logs the signal details at INFO level
 * 2. Returns a hard-coded "ok" evaluation result
 * 
 * The function is synchronous and has no side effects other than logging.
 * 
 * @param signal - The normalized event to evaluate
 * @returns A canned EvaluationResult
 */
export function evaluateSignal(signal: NormalizedEvent): EvaluationResult {
  const now = new Date().toISOString();

  // Log at INFO level with key signal fields
  console.info("[TOW-3 Evaluator Stub]", JSON.stringify({
    message: "Evaluator stub called",
    signalType: signal.type,
    signalSource: signal.source,
    correlationId: signal.correlationId,
    sessionId: signal.sessionId ?? null,
    hasPayload: signal.payload !== null && signal.payload !== undefined,
    createdAt: signal.createdAt,
    evaluatedAt: now,
  }));

  // Construct the canned evaluation result
  const result: EvaluationResult = {
    outcome: 'ok',
    summary: 'Stub evaluator: event received and logged',
    details: {
      signalType: signal.type,
      signalSource: signal.source,
      correlationId: signal.correlationId,
      sessionId: signal.sessionId ?? undefined,
    },
    isStub: true,
    createdAt: now,
  };

  return result;
}

