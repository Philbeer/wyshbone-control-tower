/**
 * API client for Failure Categorizer
 */

const API_BASE = '/tower/failures';

export interface FailureCategory {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  patterns: string[];
  recommendationTemplate: string;
  severity: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategorizedFailure {
  id: string;
  categoryId: string;
  runId: string | null;
  investigationId: string | null;
  errorMessage: string;
  errorStack: string | null;
  context: Record<string, any> | null;
  confidence: string;
  detectedAt: string;
  resolution: string | null;
  resolvedAt: string | null;
  meta: Record<string, any> | null;
}

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  frequency: string;
  relatedFailures: string[];
  recommendation: string | null;
  status: string;
}

export interface FailureMemory {
  id: string;
  categoryId: string;
  patternId: string | null;
  solution: string;
  successRate: number;
  timesApplied: number;
  lastAppliedAt: string | null;
  metadata: any;
  createdAt: string;
}

// ==================== CATEGORIES ====================

export async function getAllCategories(): Promise<FailureCategory[]> {
  const response = await fetch(`${API_BASE}/categories`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getCategory(id: string): Promise<FailureCategory> {
  const response = await fetch(`${API_BASE}/categories/${id}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getCategorySummary(id: string): Promise<any> {
  const response = await fetch(`${API_BASE}/categories/${id}/summary`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== CLASSIFICATION ====================

export async function classifyFailure(params: {
  errorMessage: string;
  errorStack?: string;
  context?: Record<string, any>;
  runId?: string;
  investigationId?: string;
}): Promise<CategorizedFailure> {
  const response = await fetch(`${API_BASE}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getCategorizedFailures(params?: {
  categoryId?: string;
  limit?: number;
}): Promise<CategorizedFailure[]> {
  const url = new URL(`${API_BASE}/failures`, window.location.origin);

  if (params?.categoryId) {
    url.searchParams.append('categoryId', params.categoryId);
  }

  if (params?.limit) {
    url.searchParams.append('limit', params.limit.toString());
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function markFailureResolved(
  id: string,
  resolution: string
): Promise<CategorizedFailure> {
  const response = await fetch(`${API_BASE}/failures/${id}/resolve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== PATTERNS ====================

export async function detectPatterns(categoryId?: string): Promise<FailurePattern[]> {
  const url = new URL(`${API_BASE}/patterns`, window.location.origin);

  if (categoryId) {
    url.searchParams.append('categoryId', categoryId);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getTopPatterns(limit = 10): Promise<FailurePattern[]> {
  const response = await fetch(`${API_BASE}/patterns/top?limit=${limit}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== RECOMMENDATIONS ====================

export async function getRecommendations(categoryId?: string): Promise<any> {
  const url = new URL(`${API_BASE}/recommendations`, window.location.origin);

  if (categoryId) {
    url.searchParams.append('categoryId', categoryId);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== TRENDS ====================

export async function getFailureTrends(params?: {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
}): Promise<any> {
  const url = new URL(`${API_BASE}/trends`, window.location.origin);

  if (params?.startDate) {
    url.searchParams.append('startDate', params.startDate);
  }

  if (params?.endDate) {
    url.searchParams.append('endDate', params.endDate);
  }

  if (params?.categoryId) {
    url.searchParams.append('categoryId', params.categoryId);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function get30DayTrends(categoryId?: string): Promise<any> {
  const url = new URL(`${API_BASE}/trends/30-day`, window.location.origin);

  if (categoryId) {
    url.searchParams.append('categoryId', categoryId);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function analyzeFailureSpike(): Promise<any> {
  const response = await fetch(`${API_BASE}/trends/spike`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== MEMORY SYSTEM ====================

export async function recordSolution(params: {
  categoryId: string;
  patternId?: string;
  solution: string;
  successRate: number;
  metadata?: any;
}): Promise<FailureMemory> {
  const response = await fetch(`${API_BASE}/memory/solutions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getMemorySolutions(
  categoryId: string,
  limit = 10
): Promise<FailureMemory[]> {
  const response = await fetch(
    `${API_BASE}/memory/solutions?categoryId=${categoryId}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function applySolution(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/memory/solutions/${id}/apply`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

// ==================== OVERVIEW ====================

export async function getOverview(): Promise<any> {
  const response = await fetch(`${API_BASE}/overview`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getInsights(categoryId?: string): Promise<any> {
  const url = new URL(`${API_BASE}/insights`, window.location.origin);

  if (categoryId) {
    url.searchParams.append('categoryId', categoryId);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
