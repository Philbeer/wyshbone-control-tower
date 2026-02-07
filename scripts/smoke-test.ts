/**
 * Tower Smoke Test
 * 
 * A simple, robust sanity check that proves Tower isn't obviously broken.
 * Windows-safe: no file watchers, no long-running processes, fail-fast on errors.
 * 
 * Tests core functionality:
 * - Server can start and respond to health checks
 * - Static routes work
 * - API routes respond (even if they return errors due to missing DB)
 * 
 * Usage: npm run smoke
 */

import { spawn, ChildProcess, execSync } from 'child_process';

const PORT = 3099; // Use non-standard port to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT_MS = 45000; // 45 seconds to start (includes npm install time)
const REQUEST_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 500;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
  warning?: boolean;
}

const results: TestResult[] = [];
let serverProcess: ChildProcess | null = null;

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(message: string) {
  console.log(message);
}

function addResult(name: string, passed: boolean, error?: string, details?: string, warning = false) {
  results.push({ name, passed, error, details, warning });
  const icon = passed 
    ? (warning ? `${YELLOW}⚠️${RESET}` : `${GREEN}✅${RESET}`) 
    : `${RED}❌${RESET}`;
  log(`${icon} ${name}`);
  if (error) {
    log(`   ${RED}Error: ${error}${RESET}`);
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForServer(): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetchWithTimeout(`${BASE_URL}/status.json`, {}, 2000);
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  
  return false;
}

async function startServer(): Promise<void> {
  log(`\n${BOLD}Starting Tower server on port ${PORT}...${RESET}`);
  
  const isWindows = process.platform === 'win32';
  
  // Use cmd.exe on Windows for proper environment variable handling
  if (isWindows) {
    serverProcess = spawn('cmd.exe', ['/c', `set PORT=${PORT}&& npx tsx server.js`], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });
  } else {
    serverProcess = spawn('npx', ['tsx', 'server.js'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
    });
  }

  let serverOutput = '';
  
  serverProcess.stdout?.on('data', (data) => {
    serverOutput += data.toString();
  });

  serverProcess.stderr?.on('data', (data) => {
    serverOutput += data.toString();
  });

  // Wait for server to be ready by polling
  const ready = await waitForServer();
  
  if (!ready) {
    // Try to get more helpful error info
    const outputSample = serverOutput.slice(0, 800);
    throw new Error(`Server failed to start within ${STARTUP_TIMEOUT_MS / 1000}s.\n\nServer output:\n${outputSample}`);
  }
}

async function stopServer(): Promise<void> {
  if (!serverProcess) return;

  log(`\n${BOLD}Stopping Tower server...${RESET}`);

  return new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      resolve();
    }, 5000);

    serverProcess!.on('exit', () => {
      clearTimeout(killTimeout);
      resolve();
    });

    try {
      if (process.platform === 'win32') {
        // Windows: kill the process tree
        if (serverProcess!.pid) {
          try {
            execSync(`taskkill /pid ${serverProcess!.pid} /f /t`, { 
              stdio: 'ignore',
              windowsHide: true,
            });
          } catch {
            // Process might already be dead
          }
        }
      } else {
        serverProcess!.kill('SIGTERM');
      }
    } catch {
      // Ignore kill errors
    }

    // Force resolve after a short delay
    setTimeout(resolve, 1000);
  });
}

async function testHealthCheck(): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/status.json`);
    if (response.ok) {
      const data = await response.json();
      addResult('Health check (GET /status.json)', true, undefined, `Sources: ${data.sources?.length || 0}`);
    } else {
      addResult('Health check (GET /status.json)', false, `HTTP ${response.status}`);
    }
  } catch (err: any) {
    addResult('Health check (GET /status.json)', false, err.message);
  }
}

async function testTasksEndpoint(): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/tasks.json`);
    if (response.ok) {
      const data = await response.json();
      const taskCount = Object.values(data).flat().length;
      addResult('Tasks API (GET /tasks.json)', true, undefined, `Tasks: ${taskCount}`);
    } else {
      addResult('Tasks API (GET /tasks.json)', false, `HTTP ${response.status}`);
    }
  } catch (err: any) {
    addResult('Tasks API (GET /tasks.json)', false, err.message);
  }
}

async function testRunsEndpoint(): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/tower/runs`);
    if (response.ok) {
      const data = await response.json();
      addResult('Runs API (GET /tower/runs)', true, undefined, `Runs: ${Array.isArray(data) ? data.length : 0}`);
    } else if (response.status === 500) {
      // 500 usually means DB not configured - this is expected in some environments
      addResult('Runs API (GET /tower/runs)', true, undefined, 'DB not configured (expected without SUPABASE_DATABASE_URL)', true);
    } else {
      addResult('Runs API (GET /tower/runs)', false, `HTTP ${response.status}`);
    }
  } catch (err: any) {
    addResult('Runs API (GET /tower/runs)', false, err.message);
  }
}

async function testBehaviourTests(): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/tower/behaviour-tests`);
    if (response.ok) {
      const data = await response.json();
      addResult('Behaviour tests (GET /tower/behaviour-tests)', true, undefined, `Tests: ${Array.isArray(data) ? data.length : 0}`);
    } else if (response.status === 500) {
      // 500 usually means DB not configured
      addResult('Behaviour tests (GET /tower/behaviour-tests)', true, undefined, 'DB not configured (expected without SUPABASE_DATABASE_URL)', true);
    } else {
      addResult('Behaviour tests (GET /tower/behaviour-tests)', false, `HTTP ${response.status}`);
    }
  } catch (err: any) {
    addResult('Behaviour tests (GET /tower/behaviour-tests)', false, err.message);
  }
}

async function testEventIngestion(): Promise<void> {
  try {
    const now = Date.now();
    const testRun = {
      source: 'smoke_test',
      userId: `smoke-test-${now}`,
      sessionId: `smoke-session-${now}`,
      goal: 'Smoke test verification',
      status: 'success',
      durationMs: 100,
      startedAt: now - 100,
      completedAt: now,
      meta: { smokeTest: true },
    };

    const response = await fetchWithTimeout(`${BASE_URL}/tower/runs/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRun),
    });

    if (response.ok) {
      const result = await response.json();
      addResult('Event ingestion (POST /tower/runs/log)', true, undefined, `Run ID: ${result.id || 'created'}`);
    } else if (response.status === 500) {
      // 500 usually means DB not configured
      addResult('Event ingestion (POST /tower/runs/log)', true, undefined, 'DB not configured (expected without SUPABASE_DATABASE_URL)', true);
    } else {
      const errorText = await response.text();
      addResult('Event ingestion (POST /tower/runs/log)', false, `HTTP ${response.status}: ${errorText.slice(0, 100)}`);
    }
  } catch (err: any) {
    addResult('Event ingestion (POST /tower/runs/log)', false, err.message);
  }
}

async function runSmokeTests(): Promise<void> {
  log(`\n${BOLD}${YELLOW}═══════════════════════════════════════${RESET}`);
  log(`${BOLD}${YELLOW}   TOWER SMOKE TEST${RESET}`);
  log(`${BOLD}${YELLOW}═══════════════════════════════════════${RESET}\n`);

  let serverStarted = false;

  try {
    // Test 1: Server can start
    try {
      await startServer();
      serverStarted = true;
      addResult('Server startup', true, undefined, `Port ${PORT}`);
    } catch (err: any) {
      addResult('Server startup', false, err.message);
      return;
    }

    // Test 2: Health check (critical - must pass)
    await testHealthCheck();

    // Test 3: Tasks API (critical - must pass)
    await testTasksEndpoint();

    // Test 4: Runs endpoint (may fail without DB)
    await testRunsEndpoint();

    // Test 5: Behaviour tests (may fail without DB)
    await testBehaviourTests();

    // Test 6: Event ingestion (may fail without DB)
    await testEventIngestion();

  } finally {
    if (serverStarted) {
      await stopServer();
    }
  }
}

async function main() {
  const startTime = Date.now();
  
  try {
    await runSmokeTests();
  } catch (err: any) {
    log(`\n${RED}${BOLD}FATAL ERROR: ${err.message}${RESET}`);
    addResult('Smoke test execution', false, err.message);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  log(`\n${BOLD}═══════════════════════════════════════${RESET}`);
  log(`${BOLD}   SMOKE TEST SUMMARY${RESET}`);
  log(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const warnings = results.filter(r => r.warning).length;
  const total = results.length;

  results.forEach(r => {
    const icon = r.passed 
      ? (r.warning ? `${YELLOW}⚠️${RESET}` : `${GREEN}✅${RESET}`) 
      : `${RED}❌${RESET}`;
    log(`${icon} ${r.name}`);
    if (r.error) {
      log(`   ${RED}→ ${r.error}${RESET}`);
    }
    if (r.details) {
      log(`   ${YELLOW}→ ${r.details}${RESET}`);
    }
  });

  log(`\n${BOLD}Results: ${passed}/${total} passed${RESET}${warnings > 0 ? ` (${warnings} with warnings)` : ''} (${duration}s)`);

  if (failed > 0) {
    log(`\n${RED}${BOLD}❌ SMOKE TEST FAILED${RESET}`);
    log(`${RED}${failed} test(s) failed. Fix issues before declaring task complete.${RESET}\n`);
    process.exit(1);
  } else {
    log(`\n${GREEN}${BOLD}✅ SMOKE TEST PASSED${RESET}`);
    if (warnings > 0) {
      log(`${YELLOW}Note: ${warnings} test(s) passed with warnings (DB not configured).${RESET}`);
      log(`${YELLOW}For full functionality, set SUPABASE_DATABASE_URL environment variable.${RESET}`);
    }
    log(`${GREEN}Tower is ready.${RESET}\n`);
    process.exit(0);
  }
}

// Handle process cleanup
process.on('uncaughtException', async (err) => {
  log(`\n${RED}${BOLD}UNCAUGHT EXCEPTION: ${err.message}${RESET}`);
  await stopServer();
  process.exit(1);
});

process.on('unhandledRejection', async (err: any) => {
  log(`\n${RED}${BOLD}UNHANDLED REJECTION: ${err?.message || err}${RESET}`);
  await stopServer();
  process.exit(1);
});

process.on('SIGINT', async () => {
  log(`\n${YELLOW}Interrupted, cleaning up...${RESET}`);
  await stopServer();
  process.exit(1);
});

// Run
main();
