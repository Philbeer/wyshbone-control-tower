/**
 * TOW-1: Event intake service
 * 
 * Handles normalization and logging of incoming events.
 * Future TOW-2/TOW-3 work will extend this to:
 * - Persist events to the database (Signal model)
 * - Fan out to the evaluator for processing
 */

import { nanoid } from "nanoid";
import type { IncomingEvent, NormalizedEvent, EventSource } from "../types/events";

/**
 * In-memory queue for events (temporary for TOW-1).
 * TOW-2 will replace this with database persistence.
 */
const eventQueue: NormalizedEvent[] = [];

/**
 * Maximum events to retain in memory (prevent unbounded growth).
 */
const MAX_QUEUE_SIZE = 1000;

/**
 * Validates an incoming event payload.
 * @throws Error if validation fails
 */
export function validateIncomingEvent(event: unknown): asserts event is IncomingEvent {
  if (!event || typeof event !== "object") {
    throw new Error("Event must be a non-null object");
  }

  const e = event as Record<string, unknown>;

  // type is required and must be a non-empty string
  if (typeof e.type !== "string" || e.type.trim().length === 0) {
    throw new Error("Event type is required and must be a non-empty string");
  }

  // source, if provided, must be valid
  if (e.source !== undefined) {
    const validSources: EventSource[] = ["supervisor", "ui", "tower"];
    if (!validSources.includes(e.source as EventSource)) {
      throw new Error(`Invalid source. Must be one of: ${validSources.join(", ")}`);
    }
  }

  // correlationId, if provided, must be a string
  if (e.correlationId !== undefined && typeof e.correlationId !== "string") {
    throw new Error("correlationId must be a string");
  }

  // sessionId, if provided, must be a string
  if (e.sessionId !== undefined && typeof e.sessionId !== "string") {
    throw new Error("sessionId must be a string");
  }

  // createdAt, if provided, should be a valid ISO string
  if (e.createdAt !== undefined) {
    if (typeof e.createdAt !== "string") {
      throw new Error("createdAt must be a string");
    }
    const parsed = Date.parse(e.createdAt);
    if (isNaN(parsed)) {
      throw new Error("createdAt must be a valid ISO date string");
    }
  }
}

/**
 * Normalizes an incoming event by filling in defaults.
 */
export function normalizeEvent(event: IncomingEvent): NormalizedEvent {
  const now = new Date().toISOString();
  
  return {
    type: event.type.trim(),
    source: event.source ?? "supervisor",
    payload: event.payload ?? null,
    correlationId: event.correlationId ?? `evt-${nanoid(12)}`,
    sessionId: event.sessionId ?? null,
    createdAt: event.createdAt ?? now,
  };
}

/**
 * Processes an incoming event:
 * 1. Normalizes timestamps and defaults
 * 2. Logs to console in structured format
 * 3. Stores in in-memory queue (temporary)
 * 
 * @returns The normalized event with generated correlationId
 */
export async function handleIncomingEvent(event: IncomingEvent): Promise<NormalizedEvent> {
  const normalized = normalizeEvent(event);

  // Structured console log for Tower visibility
  console.info("[EventIntake]", JSON.stringify({
    type: normalized.type,
    source: normalized.source,
    correlationId: normalized.correlationId,
    sessionId: normalized.sessionId,
    createdAt: normalized.createdAt,
    hasPayload: normalized.payload !== null,
  }));

  // Store in in-memory queue (TOW-2 will persist to DB)
  eventQueue.push(normalized);
  
  // Trim queue if it exceeds max size (FIFO)
  if (eventQueue.length > MAX_QUEUE_SIZE) {
    eventQueue.shift();
  }

  return normalized;
}

/**
 * Returns the current event queue (for debugging/testing).
 * TOW-2 will replace this with a proper query interface.
 */
export function getEventQueue(): readonly NormalizedEvent[] {
  return eventQueue;
}

/**
 * Clears the event queue (for testing purposes).
 */
export function clearEventQueue(): void {
  eventQueue.length = 0;
}

