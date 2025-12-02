/**
 * TOW-1: Event intake endpoint
 * 
 * POST /events - Receives events from Supervisor, UI, or Tower itself.
 * This is the primary ingestion point for the Tower event system.
 */

import { Router, Request, Response } from "express";
import { 
  validateIncomingEvent, 
  handleIncomingEvent 
} from "../src/services/eventIntake";
import type { EventIntakeResponse, EventIntakeError } from "../src/types/events";

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
    // Validate the incoming event
    validateIncomingEvent(req.body);

    // Process the event
    const normalized = await handleIncomingEvent(req.body);

    // Return success response
    const response: EventIntakeResponse = {
      status: "accepted",
      eventType: normalized.type,
      correlationId: normalized.correlationId,
      receivedAt,
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

