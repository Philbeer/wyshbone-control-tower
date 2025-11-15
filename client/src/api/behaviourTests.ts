export type BehaviourTestSummary = {
  test: {
    id: string;
    name: string;
    description: string;
    category: string;
    isActive: boolean;
  };
  latestRun: {
    id: string;
    createdAt: string;
    status: "pass" | "fail" | "error" | "pending";
    details: string | null;
    buildTag: string | null;
    durationMs: number | null;
  } | null;
};

export type BehaviourTestResult = {
  testId: string;
  status: "pass" | "fail" | "error";
  details: string;
  rawLog?: any;
  durationMs?: number;
};

export async function fetchBehaviourTests(): Promise<BehaviourTestSummary[]> {
  const response = await fetch('/tower/behaviour-tests');
  
  if (!response.ok) {
    throw new Error(`Failed to fetch behaviour tests: ${response.statusText}`);
  }
  
  return response.json();
}

export async function runAllBehaviourTests(buildTag?: string): Promise<BehaviourTestResult[]> {
  const response = await fetch('/tower/behaviour-tests/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ runAll: true, buildTag }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to run tests: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.results;
}

export async function runSingleBehaviourTest(testId: string, buildTag?: string): Promise<BehaviourTestResult> {
  const response = await fetch('/tower/behaviour-tests/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ testId, buildTag }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to run test: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.results[0];
}
