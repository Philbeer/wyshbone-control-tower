/**
 * TOW-1: Event intake service
 * TOW-4: Extended with Lead Finder run logging
 * 
 * Handles normalization and logging of incoming events.
 * - TOW-1: Basic event intake
 * - TOW-2: Signal model (pending)
 * - TOW-3: Evaluator stub integration
 * - TOW-4: Lead Finder run logging
 */

import { nanoid } from "nanoid";
import type { IncomingEvent, NormalizedEvent, EventSource, LeadFinderPayload } from "../types/events";
import { isLeadFinderEvent } from "../types/events";
import { createLeadFinderRun, type LeadFinderRunPayload } from "../evaluator/runStore";

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

/**
 * TOW-4: Extracts Lead Finder payload fields from an event payload.
 * Handles various payload structures gracefully.
 */
function extractLeadFinderPayload(payload: unknown): LeadFinderPayload {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const p = payload as Record<string, unknown>;
  
  return {
    query: typeof p.query === "string" ? p.query : undefined,
    location: typeof p.location === "string" ? p.location : undefined,
    vertical: typeof p.vertical === "string" ? p.vertical : undefined,
    limit: typeof p.limit === "number" ? p.limit : undefined,
    resultsCount: typeof p.resultsCount === "number" 
      ? p.resultsCount 
      : typeof p.results_count === "number"
      ? p.results_count
      : undefined,
  };
}

/**
 * TOW-4: Creates a Lead Finder run from a normalized event.
 * 
 * This is called when an incoming event is detected as a Lead Finder search.
 * It extracts relevant fields from the payload and creates a run record.
 * 
 * @param event - The normalized event
 * @returns The created run's ID, or null if creation failed
 */
export async function createLeadFinderRunFromEvent(
  event: NormalizedEvent
): Promise<{ id: string; status: string } | null> {
  try {
    const lfPayload = extractLeadFinderPayload(event.payload);
    
    // Extract status from payload if available
    let status: "completed" | "error" | "timeout" = "completed";
    if (event.payload && typeof event.payload === "object") {
      const p = event.payload as Record<string, unknown>;
      if (p.status === "error") status = "error";
      else if (p.status === "timeout") status = "timeout";
    }

    // Build the run payload
    const runPayload: LeadFinderRunPayload = {
      correlationId: event.correlationId,
      sessionId: event.sessionId,
      query: lfPayload.query,
      location: lfPayload.location,
      vertical: lfPayload.vertical,
      resultsCount: lfPayload.resultsCount,
      status,
      startedAt: event.createdAt ? Date.parse(event.createdAt) : undefined,
      meta: event.payload && typeof event.payload === "object" 
        ? event.payload as Record<string, unknown>
        : undefined,
    };

    const result = await createLeadFinderRun(runPayload);
    
    console.info("[TOW-4 EventIntake] Lead Finder run created:", result.id);
    
    return result;
  } catch (error) {
    console.error(
      "[TOW-4 EventIntake] Failed to create Lead Finder run:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * TOW-4: Processes an incoming event and creates a run if it's a Lead Finder event.
 * 
 * This is the main entry point for TOW-4 functionality.
 * Call this after normalizing an event to automatically log Lead Finder runs.
 * 
 * @param event - The normalized event
 * @returns The run result if a Lead Finder run was created, null otherwise
 */
export async function processLeadFinderEvent(
  event: NormalizedEvent
): Promise<{ id: string; status: string } | null> {
  if (!isLeadFinderEvent(event.type)) {
    return null;
  }

  console.info("[TOW-4 EventIntake] Detected Lead Finder event:", event.type);
  
  return createLeadFinderRunFromEvent(event);
}

