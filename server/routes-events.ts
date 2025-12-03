/**
 * TOW-1: Event intake endpoint
 * TOW-3: Added evaluator stub integration
 * TOW-4: Added Lead Finder run logging
 * 
 * POST /events - Receives events from Supervisor, UI, or Tower itself.
 * This is the primary ingestion point for the Tower event system.
 */

import { Router, Request, Response } from "express";
import { 
  validateIncomingEvent, 
  handleIncomingEvent,
  processLeadFinderEvent
} from "../src/services/eventIntake";
import { evaluateSignal } from "../src/services/evaluator";
import type { EventIntakeResponse, EventIntakeError } from "../src/types/events";
import type { EvaluationResult } from "../src/types/evaluation";

const router = Router();

/**
 * POST /events
 * 
 * Accepts an event payload and queues it for processing.
 * 
 * Request body (IncomingEvent):
 *   - type: string (required) - Event identifier
 *   - source: "supervisor" | "ui" | "tower" (optional, defaults to "supervisor")
 *   - payload: any (optional) - Event-specific data
 *   - correlationId: string (optional) - For linking related events
 *   - sessionId: string (optional) - Conversation/session identifier
 *   - createdAt: string (optional) - ISO timestamp, auto-filled if missing
 * 
 * Response (202 Accepted):
 *   - status: "accepted"
 *   - eventType: string
 *   - correlationId: string
 *   - receivedAt: string (ISO timestamp)
 * 
 * Error (400 Bad Request):
 *   - error: string
 *   - details?: string
 */
router.post("/events", async (req: Request, res: Response) => {
  const receivedAt = new Date().toISOString();

  try {
    // Log that the endpoint was hit
    console.info("[EventIntake] POST /events received");

    // Validate the incoming event
    validateIncomingEvent(req.body);

    // Process the event (creates the normalized signal)
    const normalized = await handleIncomingEvent(req.body);
    console.info("[EventIntake] Signal created:", normalized.correlationId);

    // TOW-3: Run the evaluator stub on the signal
    const evaluation = evaluateSignal(normalized);
    console.info("[EventIntake] Evaluator stub completed:", evaluation.outcome);

    // TOW-4: Create a Lead Finder run if this is a Lead Finder event
    const leadFinderRun = await processLeadFinderEvent(normalized);
    if (leadFinderRun) {
      console.info("[EventIntake] Lead Finder run logged:", leadFinderRun.id);
    }

    // Return success response with evaluation result
    const response: EventIntakeResponse = {
      status: "accepted",
      eventType: normalized.type,
      correlationId: normalized.correlationId,
      receivedAt,
      evaluation, // TOW-3: Include the evaluation result
    };

    res.status(202).json(response);
  } catch (error: unknown) {
    // Handle validation or processing errors
    const message = error instanceof Error ? error.message : "Unknown error";
    
    console.error("[EventIntake] Validation error:", message);

    const errorResponse: EventIntakeError = {
      error: "Invalid event payload",
      details: message,
    };

    res.status(400).json(errorResponse);
  }
});

export default router;

