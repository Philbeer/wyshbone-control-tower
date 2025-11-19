import { LiveUserRunPayload } from './runStore';
import { nanoid } from 'nanoid';

/**
 * Validates and normalizes an incoming run event payload.
 * Auto-fills missing fields with sensible defaults.
 * 
 * @param event - Raw incoming event from external sources
 * @returns Normalized payload ready for storage
 */
export function validateIncomingRun(event: any): LiveUserRunPayload {
  // Validate required fields
  if (!event || typeof event !== 'object') {
    throw new Error('Event must be a non-null object');
  }

  // Validate source
  if (!event.source || typeof event.source !== 'string' || event.source.trim().length === 0) {
    throw new Error('source must be a non-empty string');
  }

  // Validate status
  const validStatuses = ['success', 'error', 'timeout', 'fail'];
  if (!event.status || !validStatuses.includes(event.status)) {
    throw new Error(`status must be one of: ${validStatuses.join(', ')}`);
  }

  // Validate durationMs
  if (typeof event.durationMs !== 'number' || !Number.isFinite(event.durationMs)) {
    throw new Error('durationMs must be a finite number');
  }

  // Auto-fill timestamp if missing
  const startedAt = event.startedAt && 
                    typeof event.startedAt === 'number' && 
                    Number.isFinite(event.startedAt)
    ? event.startedAt
    : Date.now();

  const completedAt = event.completedAt && 
                      typeof event.completedAt === 'number' && 
                      Number.isFinite(event.completedAt)
    ? event.completedAt
    : (startedAt + event.durationMs);

  // Create stable anonymous userId if none provided
  // Use sessionId to ensure consistency across the same session
  let userId = event.userId;
  if (!userId) {
    if (event.sessionId) {
      // Generate a deterministic anonymous ID based on sessionId
      userId = `anon-${event.sessionId.substring(0, 12)}`;
    } else {
      // Fallback: generate a random anonymous ID
      userId = `anon-${nanoid(10)}`;
    }
  }

  // Build normalized payload
  const normalized: LiveUserRunPayload = {
    runId: event.runId || undefined,
    source: event.source,
    userId,
    userEmail: event.userEmail || null,
    sessionId: event.sessionId || null,
    request: event.request || undefined,
    response: event.response || undefined,
    status: event.status,
    goal: event.goal || undefined,
    startedAt,
    completedAt,
    durationMs: event.durationMs,
    model: event.model || undefined,
    mode: event.mode || undefined,
    meta: event.meta || undefined,
  };

  return normalized;
}

/**
 * Validates that a userId/sessionId/runId exist in the payload.
 * Logs warnings if critical fields are missing.
 */
export function validateEventMetadata(event: LiveUserRunPayload): void {
  if (!event.sessionId) {
    console.warn('[RunIngestion] No sessionId provided - conversation grouping may be affected');
  }

  if (!event.userId && !event.userEmail) {
    console.warn('[RunIngestion] No userId or userEmail provided - using anonymous identifier');
  }

  if (!event.runId) {
    console.warn('[RunIngestion] No runId provided - auto-generating conversation ID');
  }
}
