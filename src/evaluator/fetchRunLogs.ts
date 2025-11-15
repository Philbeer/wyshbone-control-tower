export async function fetchRunLogs(runId?: string): Promise<any[]> {
  if (!runId) return [];

  return [
    {
      timestamp: new Date().toISOString(),
      level: "info",
      message: `Placeholder log entry for run ${runId}`,
      payload: { note: "Run log fetching to be implemented when logging system is ready" }
    }
  ];
}
