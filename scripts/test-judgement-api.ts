const PORT = process.env.PORT || 5000;
const BASE = `http://localhost:${PORT}`;

async function run() {
  console.log(`Testing Judgement API at ${BASE}/api/tower/evaluate\n`);

  const stallPayload = {
    run_id: "runtime-test-stall",
    mission_type: "leadgen",
    success: {
      target_leads: 50,
      max_cost_gbp: 100,
      max_cost_per_lead_gbp: 5,
      min_quality_score: 0.7,
      max_steps: 200,
      max_failures: 10,
      stall_window_steps: 10,
      stall_min_delta_leads: 3,
    },
    snapshot: {
      steps_completed: 80,
      leads_found: 20,
      leads_new_last_window: 0,
      failures_count: 2,
      total_cost_gbp: 40,
      avg_quality_score: 0.85,
    },
  };

  const continuePayload = {
    run_id: "runtime-test-continue",
    mission_type: "leadgen",
    success: {
      target_leads: 50,
      max_cost_gbp: 100,
      max_cost_per_lead_gbp: 5,
      min_quality_score: 0.7,
      max_steps: 200,
      max_failures: 10,
      stall_window_steps: 10,
      stall_min_delta_leads: 2,
    },
    snapshot: {
      steps_completed: 30,
      leads_found: 15,
      leads_new_last_window: 4,
      failures_count: 1,
      total_cost_gbp: 25,
      avg_quality_score: 0.9,
    },
  };

  console.log("=== Test 1: Expect STOP / STALL_DETECTED ===");
  const r1 = await fetch(`${BASE}/api/tower/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stallPayload),
  });
  const j1 = await r1.json();
  console.log(JSON.stringify(j1, null, 2));
  const pass1 = j1.verdict === "STOP" && j1.reason_code === "STALL_DETECTED";
  console.log(pass1 ? "PASS\n" : "FAIL\n");

  console.log("=== Test 2: Expect CONTINUE / RUNNING ===");
  const r2 = await fetch(`${BASE}/api/tower/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(continuePayload),
  });
  const j2 = await r2.json();
  console.log(JSON.stringify(j2, null, 2));
  const pass2 = j2.verdict === "CONTINUE" && j2.reason_code === "RUNNING";
  console.log(pass2 ? "PASS\n" : "FAIL\n");

  const allPassed = pass1 && pass2;
  console.log(allPassed ? "All runtime tests passed." : "Some tests failed.");
  if (!allPassed) process.exit(1);
}

run().catch((err) => {
  console.error("Runtime test error:", err.message);
  process.exit(1);
});
