import type { SnapshotBundle } from "./types";

const UI_SNAPSHOT_URL =
  process.env.WYSHBONE_UI_SNAPSHOT_URL ??
  "http://wyshbone-ui/internal/code-snapshot";
const SUPERVISOR_SNAPSHOT_URL =
  process.env.WYSHBONE_SUPERVISOR_SNAPSHOT_URL ??
  "http://wyshbone-supervisor/internal/code-snapshot";

async function safeFetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSnapshotsForRun(
  runId?: string
): Promise<SnapshotBundle> {
  const [uiSnapshot, supervisorSnapshot] = await Promise.all([
    safeFetchJson(UI_SNAPSHOT_URL),
    safeFetchJson(SUPERVISOR_SNAPSHOT_URL),
  ]);

  return {
    uiSnapshot,
    supervisorSnapshot,
  };
}
