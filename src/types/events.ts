/**
 * TOW-1: Event intake type definitions
 * 
 * This is a minimal, forward-compatible event payload shape.
 * TOW-2 will introduce the proper Signal model and may extend this.
 */

/**
 * Valid sources that can emit events to Tower.
 */
export type EventSource = "supervisor" | "ui" | "tower";

/**
 * TOW-4: Lead Finder specific constants and types
 */

/** Source identifier for Lead Finder runs */
export const LEAD_FINDER_SOURCE = "lead_finder" as const;

/** Event types that indicate a Lead Finder search */
export const LEAD_FINDER_EVENT_TYPES = [
  "LeadFinderSearch",
  "LeadFinderRun", 
  "lead_finder_search",
  "lead_finder.search",
] as const;

/**
 * Checks if an event type represents a Lead Finder search.
 */
export function isLeadFinderEvent(eventType: string): boolean {
  return LEAD_FINDER_EVENT_TYPES.some(
    (t) => t.toLowerCase() === eventType.toLowerCase()
  );
}

/**
 * Lead Finder payload structure.
 * These are the fields we extract from Lead Finder events for run logging.
 */
export interface LeadFinderPayload {
  /** The search query text */
  query?: string;
  /** Geographic location for the search */
  location?: string;
  /** Business vertical/industry */
  vertical?: string;
  /** Number of results requested */
  limit?: number;
  /** Number of leads found */
  resultsCount?: number;
  /** Any additional metadata */
  [key: string]: unknown;
}

/**
 * IncomingEvent represents a generic event received by Tower's /events endpoint.
 * 
 * Design notes:
 * - `type` is required - it identifies what happened (e.g., "LeadCreated", "SearchRunStarted")
 * - `source` defaults to "supervisor" if not provided
 * - `payload` is arbitrary JSON for forward compatibility
 * - `correlationId` links related events across the system
 * - `sessionId` groups events within a conversation/run session
 * - `createdAt` is auto-filled if not provided
 */
export type IncomingEvent = {
  /** Event type identifier, e.g. "LeadCreated", "SearchRunStarted" */
  type: string;
  
  /** Origin of the event - defaults to "supervisor" */
  source?: EventSource;
  
  /** Arbitrary JSON payload - structure depends on event type */
  payload?: unknown;
  
  /** Unique ID to correlate related events across systems */
  correlationId?: string;
  
  /** Session/conversation identifier for grouping events */
  sessionId?: string;
  
  /** ISO timestamp when the event was created - auto-filled if missing */
  createdAt?: string;
};

/**
 * NormalizedEvent is an IncomingEvent with all optional fields filled in.
 * This is what gets stored/logged after intake processing.
 */
export type NormalizedEvent = Required<Pick<IncomingEvent, "type" | "source" | "createdAt">> & {
  payload: unknown;
  correlationId: string;
  sessionId: string | null;
};

/**
 * Response returned by the POST /events endpoint.
 * TOW-3: Extended with optional evaluation field.
 */
export type EventIntakeResponse = {
  status: "accepted";
  eventType: string;
  correlationId: string;
  receivedAt: string;
  /** TOW-3: Evaluation result from the evaluator stub (optional for backwards compatibility) */
  evaluation?: import("./evaluation").EvaluationResult;
};

/**
 * Error response for invalid event submissions.
 */
export type EventIntakeError = {
  error: string;
  details?: string;
};

