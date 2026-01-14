/**
 * TOW-5: Lead Quality Scoring
 * 
 * Simple heuristic-based lead quality scoring for Lead Finder runs.
 * This is intentionally basic and can be refined later.
 * 
 * Scoring rules:
 * - Base score: 50
 * - resultsCount adjustment:
 *   - 0 results → 20 (low confidence)
 *   - 1-10 results → 70 (good, focused search)
 *   - 11-50 results → 80 (great, comprehensive)
 *   - >50 results → 60 (broad, may be too unfocused)
 * - Bonuses:
 *   - Has location: +5
 *   - Has vertical: +5
 *   - Has query with 3+ words: +5
 * 
 * Labels:
 * - score < 40 → "low"
 * - score 40-70 → "medium"
 * - score > 70 → "high"
 */

import type { LeadFinderPayload } from "../types/events";

/**
 * Lead quality label bucket
 */
export type LeadQualityLabel = "low" | "medium" | "high";

/**
 * Lead quality score result
 */
export interface LeadQualityScore {
  /** Numeric score from 0-100 */
  score: number;
  /** Bucketed label for easy display */
  label: LeadQualityLabel;
}

/**
 * Computes a lead quality score based on the Lead Finder payload.
 * 
 * The scoring is intentionally simple and deterministic:
 * - Rewards focused searches (moderate result counts)
 * - Rewards specificity (location, vertical, detailed query)
 * - Penalizes empty or overly broad searches
 * 
 * @param payload - The Lead Finder event payload
 * @returns Score (0-100) and label (low/medium/high)
 */
export function computeLeadQualityScore(payload: LeadFinderPayload): LeadQualityScore {
  // Start with base score
  let score = 50;

  // Adjust based on resultsCount
  const resultsCount = payload.resultsCount ?? 0;
  
  if (resultsCount === 0) {
    // No results - low confidence search
    score = 20;
  } else if (resultsCount >= 1 && resultsCount <= 10) {
    // Good, focused search with reasonable results
    score = 70;
  } else if (resultsCount >= 11 && resultsCount <= 50) {
    // Great, comprehensive search
    score = 80;
  } else if (resultsCount > 50) {
    // Broad search - may be unfocused
    score = 60;
  }

  // Bonus for having a location (more targeted search)
  if (payload.location && payload.location.trim().length > 0) {
    score += 5;
  }

  // Bonus for having a vertical (industry-specific search)
  if (payload.vertical && payload.vertical.trim().length > 0) {
    score += 5;
  }

  // Bonus for a detailed query (3+ words suggests specificity)
  if (payload.query && payload.query.trim().split(/\s+/).length >= 3) {
    score += 5;
  }

  // Cap score at 100
  score = Math.min(100, Math.max(0, score));

  // Determine label based on score
  let label: LeadQualityLabel;
  if (score < 40) {
    label = "low";
  } else if (score <= 70) {
    label = "medium";
  } else {
    label = "high";
  }

  return { score, label };
}

/**
 * Returns a human-readable description of the scoring factors.
 * Useful for debugging/understanding why a score was assigned.
 * 
 * @param payload - The Lead Finder event payload
 * @returns Description of scoring factors
 */
export function explainLeadQualityScore(payload: LeadFinderPayload): string {
  const parts: string[] = [];
  const resultsCount = payload.resultsCount ?? 0;

  // Base explanation
  if (resultsCount === 0) {
    parts.push("No results found (base: 20)");
  } else if (resultsCount >= 1 && resultsCount <= 10) {
    parts.push(`${resultsCount} results - focused search (base: 70)`);
  } else if (resultsCount >= 11 && resultsCount <= 50) {
    parts.push(`${resultsCount} results - comprehensive search (base: 80)`);
  } else {
    parts.push(`${resultsCount} results - broad search (base: 60)`);
  }

  // Bonuses
  if (payload.location && payload.location.trim().length > 0) {
    parts.push(`Location specified: +5`);
  }
  if (payload.vertical && payload.vertical.trim().length > 0) {
    parts.push(`Vertical specified: +5`);
  }
  if (payload.query && payload.query.trim().split(/\s+/).length >= 3) {
    parts.push(`Detailed query (3+ words): +5`);
  }

  return parts.join("; ");
}

