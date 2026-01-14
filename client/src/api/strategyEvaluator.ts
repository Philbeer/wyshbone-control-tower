/**
 * API client for Strategy Evaluator
 */

const API_BASE = '/tower/strategy';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  category: string;
  config: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyPerformance {
  id: string;
  strategyId: string;
  executedAt: string;
  context: string;
  runId: string | null;
  metrics: {
    successRate?: number;
    avgDuration?: number;
    errorCount?: number;
    userSatisfaction?: number;
    throughput?: number;
    [key: string]: any;
  };
  outcome: string;
  meta?: Record<string, any>;
}

export interface AbTest {
  id: string;
  name: string;
  description: string;
  strategyAId: string;
  strategyBId: string;
  status: 'active' | 'paused' | 'completed';
  startedAt: string;
  endedAt: string | null;
  config: {
    trafficSplit?: number;
    minSampleSize?: number;
    maxDurationDays?: number;
    [key: string]: any;
  };
  results?: any;
  createdAt: string;
}

export interface DashboardData {
  generatedAt: string;
  summary: {
    totalStrategies: number;
    activeStrategies: number;
    activeAbTests: number;
  };
  topPerformers: Array<{
    strategy: Strategy;
    metrics: any;
  }>;
  underperformers: Array<{
    strategy: Strategy;
    metrics: any;
  }>;
  recommendations: string[];
  activeAbTests: Array<{
    id: string;
    name: string;
    status: string;
    startedAt: string;
  }>;
  strategies: Array<{
    id: string;
    name: string;
    category: string;
    isActive: boolean;
    metrics: any;
  }>;
}

// ==================== STRATEGIES ====================

export async function createStrategy(params: {
  name: string;
  description: string;
  category: string;
  config: Record<string, any>;
}): Promise<Strategy> {
  const response = await fetch(`${API_BASE}/strategies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getAllStrategies(): Promise<Strategy[]> {
  const response = await fetch(`${API_BASE}/strategies`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getStrategy(id: string): Promise<Strategy> {
  const response = await fetch(`${API_BASE}/strategies/${id}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function updateStrategy(
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    category: string;
    config: Record<string, any>;
    isActive: boolean;
  }>
): Promise<Strategy> {
  const response = await fetch(`${API_BASE}/strategies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== PERFORMANCE ====================

export async function recordPerformance(
  strategyId: string,
  params: {
    context: string;
    runId?: string;
    metrics: any;
    outcome: string;
    meta?: Record<string, any>;
  }
): Promise<StrategyPerformance> {
  const response = await fetch(`${API_BASE}/strategies/${strategyId}/performance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getPerformance(
  strategyId: string,
  limit = 100
): Promise<StrategyPerformance[]> {
  const response = await fetch(`${API_BASE}/strategies/${strategyId}/performance?limit=${limit}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getMetrics(
  strategyId: string,
  startDate?: string,
  endDate?: string
): Promise<any> {
  let url = `${API_BASE}/strategies/${strategyId}/metrics`;
  const params = new URLSearchParams();

  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== A/B TESTING ====================

export async function createAbTest(params: {
  name: string;
  description: string;
  strategyAId: string;
  strategyBId: string;
  config?: any;
}): Promise<AbTest> {
  const response = await fetch(`${API_BASE}/ab-tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getAllAbTests(): Promise<AbTest[]> {
  const response = await fetch(`${API_BASE}/ab-tests`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function recordAbTestResult(
  testId: string,
  params: {
    strategyId: string;
    variant: 'A' | 'B';
    metrics: any;
    outcome: string;
  }
): Promise<any> {
  const response = await fetch(`${API_BASE}/ab-tests/${testId}/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function analyzeAbTest(testId: string): Promise<any> {
  const response = await fetch(`${API_BASE}/ab-tests/${testId}/analyze`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function updateAbTestStatus(
  testId: string,
  status: 'active' | 'paused' | 'completed'
): Promise<AbTest> {
  const response = await fetch(`${API_BASE}/ab-tests/${testId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// ==================== DASHBOARD ====================

export async function getDashboardData(): Promise<DashboardData> {
  const response = await fetch(`${API_BASE}/dashboard`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getRecommendations(): Promise<any> {
  const response = await fetch(`${API_BASE}/recommendations`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function compareStrategies(
  strategyAId: string,
  strategyBId: string,
  days = 7
): Promise<any> {
  const response = await fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyAId, strategyBId, days }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
