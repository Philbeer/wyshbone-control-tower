# REPORT_PART3_TOWER.md — MVP Learning Plan: Tower Implementation Status

**Audit date:** 2026-03-02
**Scope:** Wyshbone Tower repo only
**Purpose:** Report current implementation status for Part 3 (MVP Learning Plan) — decision policy and judgement. No fixes proposed.

---

## 1. Executive Summary

- **Tower issues structured verdicts through two independent judgement engines**: a run-level evaluator (`judgement.ts`, emitting `CONTINUE` / `STOP`) and an artefact-level evaluator (`towerVerdict.ts`, emitting `ACCEPT` / `ACCEPT_WITH_UNVERIFIED` / `CHANGE_PLAN` / `STOP`). Both persist results to PostgreSQL on a best-effort basis (fire-and-forget; HTTP response succeeds even if DB write fails).
- **Three policy knobs exist and are tunable** via a Learning Layer: `radius_policy_v1`, `enrichment_policy_v1`, and `stop_policy_v1` — with magnitude guards, confidence thresholds, sample-size minimums, and regression detection already enforced.
- **`max_replans` is the most mature learning signal**, with dedicated INCREASE/DECREASE/NO_LEARN logic, guardrails (cap=3, floor=0, min sample=5), and rollback pointers persisted as `learning_artefacts`.
- **History and priors are partially used**: attempt_history detects no-progress loops, run_outcomes feed max_replans learning, and outcome_log/decision_log feed the general Learning Layer — but there is no cross-run memory aggregation or feedback loop from Supervisor outcomes back into Tower rubrics automatically.
- **Key Part 3 gaps** include: no explicit `RETRY` verdict in the core tower-verdict path, no automated policy-learning trigger (Supervisor must call `/learn` manually), no budget or strictness knobs exposed as user-facing configuration, and no idempotency guarantees on judgement endpoints.

---

## 2. What Tower Currently Judges

### 2.1 Run-Level Judgement (`src/evaluator/judgement.ts`)

Evaluates whether an active run should continue or stop, based on a `JudgementSuccess` criteria vs. a `JudgementSnapshot`.

| Check | Verdict | Reason Code |
|---|---|---|
| Target leads met, quality OK, cost within budget | `STOP` | `SUCCESS_ACHIEVED` |
| Total cost > max_cost_gbp | `STOP` | `COST_EXCEEDED` |
| Cost-per-lead > max_cost_per_lead_gbp | `STOP` | `CPL_EXCEEDED` |
| Failure count > max_failures | `STOP` | `FAILURES_EXCEEDED` |
| New leads in window < stall_min_delta_leads | `STOP` | `STALL_DETECTED` |
| None of the above | `CONTINUE` | `RUNNING` |

**Output type:** `JudgementVerdict = "CONTINUE" | "STOP" | "CHANGE_STRATEGY"`
(Note: `CHANGE_STRATEGY` is declared in the enum but never emitted by current logic.)

### 2.2 Artefact-Level Judgement (`src/evaluator/towerVerdict.ts`)

Evaluates completed artefacts (primarily `leads_list`) against typed constraints and evidence.

| Verdict | Meaning |
|---|---|
| `ACCEPT` | All hard constraints verified to declared standard |
| `ACCEPT_WITH_UNVERIFIED` | Best-effort accepted; unresolved hard constraints exist but `best_effort_accepted=true` |
| `CHANGE_PLAN` | Requirements not met but replanning is possible |
| `STOP` | Requirements cannot be met honestly, or budget/replans exhausted |

**Stop reason codes** (non-exhaustive): `NO_PROGRESS`, `NO_RESULTS`, `HARD_CONSTRAINT_VIOLATED`, `HARD_CONSTRAINT_UNVERIFIABLE`, `HARD_CONSTRAINT_UNKNOWN`, `CONSTRAINT_GATE_BLOCKED`, `TRUTH_GATE_BLOCKED`, `TIME_PREDICATE_BLOCKED`, `RELATIONSHIP_EVIDENCE_MISSING`, `MUST_BE_CERTAIN_VIOLATED`, `INPUT_CONCATENATED`, `LABEL_MISLEADING`, `VERIFIED_WITHOUT_EVIDENCE`, `COST_EXCEEDED`, and more.

### 2.3 Additional Sub-Judgements

| Module | Purpose |
|---|---|
| `evidenceQualityJudge.ts` | Post-check: overrides ACCEPT→STOP if evidence is missing/fake |
| `plasticsInjectionRubric.ts` | Domain-specific rubric for factory_state/factory_decision artefacts |
| `judgeAskLeadQuestion` (in towerVerdict.ts) | Overconfidence guard for ASK_LEAD_QUESTION step_type; can issue `retry` action |
| `failureCategorizer.ts` | Post-mortem failure categorization (prompt_issue, decision_logic_issue, tool_error, etc.) |

---

## 3. Whether Tower Can Output "Policy Knobs" Today

**Yes — partially.** Tower defines three named policies and can evaluate/update them:

| Policy Name | Knob Fields | Where Defined |
|---|---|---|
| `radius_policy_v1` | `radius_km` | `learningLayerRubric.ts` line 162 |
| `enrichment_policy_v1` | `enrichment_steps[]` | `learningLayerRubric.ts` line 175 |
| `stop_policy_v1` | `max_steps`, `max_failures`, `max_replans` | `learningLayerRubric.ts` line 189, `maxReplansLearning.ts` |

**How they work today:**

1. Supervisor (or an external caller) sends a `POST /api/tower/learn` or `POST /api/tower/learn-max-replans` request with `decision_log`, `outcome_log`, `telemetry`, and `current_policy`.
2. Tower evaluates and returns `ALLOW` or `DENY` with a `proposed_value`.
3. If `ALLOW`, Tower persists a new `policy_versions` row and a `learning_artefacts` row (with rollback pointer).

**What is NOT present:**

- No automatic trigger — Supervisor must call these endpoints explicitly.
- No user-facing knob configuration (e.g., "be stricter" or "use a bigger search budget").
- No knob for `verification_depth` or `source_priority` as named tunable policies.
- Knobs are scoped by `scope_key` (e.g., per-vertical) but this is caller-defined, not enforced.

---

## 4. Biggest Risks

### 4.1 Wrong Verdict

| Risk | Detail | Severity |
|---|---|---|
| Evidence quality bypass | `judgeEvidenceQuality` only converts ACCEPT→STOP, never overrides CHANGE_PLAN→STOP; a CHANGE_PLAN with fabricated evidence could slip through | Medium |
| Constraint resolution priority ambiguity | `resolveRequestedCount` has a 4-level fallback chain (`requested_count_user` → `success_criteria.requested_count_user` → `success_criteria.target_count` → `requested_count`); if Supervisor populates multiple, the "wrong" one may win | Medium |
| Label honesty is heuristic-based | `LABEL_MISLEADING` detection relies on string matching between `delivery_summary` and actual results; edge cases may produce false positives or false negatives | Low–Medium |

### 4.2 Missing Verdict

| Risk | Detail | Severity |
|---|---|---|
| No RETRY in core verdict path | `towerVerdict.ts` only returns ACCEPT/CHANGE_PLAN/STOP; `retry` action exists only in `judgeAskLeadQuestion` sub-path | High for Part 3 |
| `CHANGE_STRATEGY` never emitted | Declared in `judgementVerdictEnum` but `evaluate()` in `judgement.ts` never produces it | Low (dead code) |
| No verdict for partial success with learning signal | If a run partially succeeds, there is no "ACCEPT_PARTIAL_AND_LEARN" path | Medium |

### 4.3 Non-Determinism

| Risk | Detail | Severity |
|---|---|---|
| No LLM calls in core verdict path | `towerVerdict.ts` and `judgement.ts` are fully deterministic (pure functions on input) | Low (good) |
| OpenAI used in investigations/diagnosis | `executeInvestigation.ts` uses GPT-4o-mini for diagnosis and patch suggestion — non-deterministic but not in the verdict path | Low |
| Timestamp-dependent behavior | `evaluated_at` is set to `new Date().toISOString()` — cosmetic, not logic-affecting | None |

### 4.4 Missing Persistence

| Risk | Detail | Severity |
|---|---|---|
| `judgement_evaluations` persistence is fire-and-forget | `routes-judgement.ts` catches DB errors with `console.warn` and still returns the result — evaluation can succeed but not be persisted | Medium |
| `tower_verdicts` persistence is fire-and-forget | `routes-judge-artefact.ts` `persistTowerVerdict()` catches errors silently | Medium |
| No idempotency keys | Duplicate calls to `/evaluate`, `/tower-verdict`, or `/judge-artefact` create duplicate rows | Medium |
| Policy version race condition | `routes-learning-layer.ts` reads latest version then increments — concurrent calls could create conflicting versions | Medium |
| Learning artefacts lack deduplication | Multiple calls to `/learn` for the same run could create duplicate `learning_artefacts` rows | Low |

---

## 5. Judgement Inputs and Rubrics

### 5.1 Current Judgement Schemas

#### Run-Level (`POST /api/tower/evaluate`)

**Input (`judgementRequestSchema`):**
```
{
  run_id: string,
  mission_type: string,
  success: {
    target_leads: number,
    max_cost_gbp: number,
    max_cost_per_lead_gbp: number,
    min_quality_score: number (0–1),
    max_steps: number,
    max_failures: number (default 10),
    stall_window_steps: number,
    stall_min_delta_leads: number
  },
  snapshot: {
    steps_completed: number,
    leads_found: number,
    leads_new_last_window: number,
    failures_count: number,
    total_cost_gbp: number,
    avg_quality_score: number (0–1),
    last_error_code?: string
  }
}
```

**Rubric:** Deterministic waterfall — checks success → cost → CPL → failures → stall → else CONTINUE.

#### Artefact-Level (`POST /api/tower/tower-verdict` and `POST /api/tower/judge-artefact`)

**Input (`TowerVerdictInput`):**
```
{
  original_goal?: string,
  requested_count_user?: number,
  constraints?: Constraint[],
  leads?: Lead[],
  delivered?: DeliveredInfo | number,
  success_criteria?: { target_count, hard_constraints[], soft_constraints[], allow_relax_soft_constraints },
  meta?: { plan_version, replans_used, max_replans, radius_km, relaxed_constraints[] },
  attempt_history?: AttemptHistoryEntry[],
  verification_summary?: { verified_exact_count, constraint_results[] },
  attribute_evidence?: AttributeEvidenceArtefact[],
  delivery_summary?: "PASS" | "PARTIAL" | "STOP",
  requires_relationship_evidence?: boolean,
  verified_relationship_count?: number,
  time_predicates?: TimePredicateInput[],
  time_predicates_mode?: "verifiable" | "proxy" | "unverifiable",
  unresolved_hard_constraints?: UnresolvedHardConstraint[],
  best_effort_accepted?: boolean
}
```

**Rubric:** Multi-gate evaluation chain:
1. Concatenation artifact detection
2. Count resolution (requested vs delivered)
3. Constraint matching (hard/soft, NAME_CONTAINS, LOCATION, COUNT_MIN, HAS_ATTRIBUTE)
4. CVL verification (verified_exact_count priority)
5. No-progress detection (attempt_history)
6. Must-be-certain backstop
7. Relationship predicate gate
8. Constraint gate (unresolved hard constraints)
9. Time predicate gate
10. Truth gate (final constraint_results check)
11. Evidence quality judge (ACCEPT→STOP override)

### 5.2 What Tower Expects

| Concept | Current Implementation |
|---|---|
| **Goal** | `original_goal` / `original_user_goal` / `normalized_goal` — optional free-text fields; used for relationship predicate auto-detection only |
| **Success criteria** | Fully structured: `target_count`, typed `hard_constraints[]`, `soft_constraints[]`, cost/quality thresholds |
| **Artefact** | `leads[]` array with name/address/attributes, or `factory_state`/`factory_decision` payload |
| **Evidence** | `verification_summary`, `attribute_evidence[]`, `evidence_id`, `source_url`, `quote` per constraint result |

### 5.3 Use of History, Priors, or Learning Signals

| Signal | Where Used | How |
|---|---|---|
| `attempt_history` | `towerVerdict.ts` | Detects no-progress loops (identical delivered_count across plan versions) → forces STOP |
| `run_outcomes[]` | `maxReplansLearning.ts` | Computes `replan_helped_rate`, `waste_rate`, `exceeded_rate` to adjust max_replans |
| `decision_log` + `outcome_log` | `learningLayerRubric.ts` | Fed into confidence computation and regression detection for policy updates |
| `telemetry` summary | `learningLayerRubric.ts` | `total_runs`, `success_count`, `failure_count`, `outcome_delta` used for sample size and success rate checks |
| `failure_memory` table | `shared/schema.ts` | Schema exists (`solution`, `successRate`, `timesApplied`, `applicableContexts`) but no code reads from it in the verdict path |

---

## 6. Existing Stop / Retry / Change Plan Logic

### 6.1 ACCEPT

**Conditions:**
- Delivered count ≥ requested count
- All hard constraints passed (or verified via CVL)
- Evidence quality judge passes
- All gates pass (relationship, constraint, time predicate, truth)

### 6.2 CHANGE_PLAN

**Conditions:**
- Delivered < requested AND replans_used < max_replans (`canReplan = true`)
- Hard constraint unknown but replan possible
- Overconfident-without-support (ASK_LEAD_QUESTION path)
- Input concatenation artifacts detected
- Suggested changes generated (EXPAND_AREA, RELAX_CONSTRAINT, INCREASE_SEARCH_BUDGET, CHANGE_QUERY, ADD_VERIFICATION_STEP)

### 6.3 STOP

**Conditions:**
- Success achieved (run-level)
- Cost/CPL exceeded
- Failures exceeded threshold
- Stall detected (no new leads)
- No progress across replans (attempt_history)
- Replans exhausted (`replans_used >= max_replans`)
- Hard constraint unverifiable with no replans left
- Must-be-certain violated
- Evidence quality check failed
- Truth gate blocked
- Time predicate blocked
- Relationship evidence missing

### 6.4 RETRY

**Conditions (limited scope):**
- Only in `judgeAskLeadQuestion` (within `towerVerdict.ts`)
- Triggered when confidence is high but evidence is insufficient
- Returns `action: "retry"` (not a formal `TowerVerdictAction` enum value)

### 6.5 Explicit Caps and Thresholds

| Threshold | Value | Location |
|---|---|---|
| `MAX_REPLANS_CAP` | 3 | `maxReplansLearning.ts:38` |
| `MAX_REPLANS_FLOOR` | 0 | `maxReplansLearning.ts:39` |
| `EXCEEDED_THRESHOLD` | 0.30 | `maxReplansLearning.ts:40` |
| `HELPED_THRESHOLD` | 0.50 | `maxReplansLearning.ts:41` |
| `WASTE_THRESHOLD` | 0.60 | `maxReplansLearning.ts:42` |
| `MIN_SAMPLE_SIZE` | 5 | `maxReplansLearning.ts:37`, `learningLayerRubric.ts:58` |
| `MIN_SUCCESS_RATE` | 0.60 | `learningLayerRubric.ts:59` |
| `MAX_RADIUS_DELTA_KM` | 10 | `learningLayerRubric.ts:60` |
| `MAX_STOP_TIGHTEN_PERCENT` | 0.50 | `learningLayerRubric.ts:61` |
| `MIN_CONFIDENCE_THRESHOLD` | 40 | `learningLayerRubric.ts:62` |
| `RECENT_FAIL_WINDOW` | 3 | `maxReplansLearning.ts:43` |
| `max_failures` (default) | 10 | `shared/schema.ts:432` |

---

## 7. Policy Knob Concepts Already Present

| Concept | Found? | Implementation | Location |
|---|---|---|---|
| **Budget** | Yes | `max_cost_gbp`, `max_cost_per_lead_gbp` in `JudgementSuccess`; `INCREASE_SEARCH_BUDGET` as a suggested change type | `shared/schema.ts`, `towerVerdict.ts:53` |
| **Strictness** | Partial | `must_be_certain` flag on unresolved hard constraints; `best_effort_accepted` toggle; `hardness: "hard" | "soft"` on constraints | `towerVerdict.ts:224`, `towerVerdict.ts:216` |
| **Verification depth** | Partial | `verifiability: "verifiable" | "proxy" | "unverifiable"` on constraints; `time_predicates_mode` with same levels | `towerVerdict.ts:222`, `towerVerdict.ts:32` |
| **Replan ceiling** | Yes | `max_replans` in `MetaInfo`, dynamically adjusted by `maxReplansLearning.ts` (cap=3, floor=0) | `towerVerdict.ts:117`, `maxReplansLearning.ts` |
| **Stop-early threshold** | Yes | `stall_min_delta_leads`, `max_failures`, `max_steps` in `JudgementSuccess`; `stop_policy_v1` tunable via Learning Layer | `shared/schema.ts:431-434`, `learningLayerRubric.ts:189` |
| **Source priority** | Partial | `resolveRequestedCount()` and `resolveDeliveredCount()` define a priority chain for count resolution; no general source-priority ranking | `towerVerdict.ts:244-291` |

---

## 8. Interfaces from Supervisor

### 8.1 Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/tower/evaluate` | POST | Run-level continue/stop judgement |
| `/api/tower/tower-verdict` | POST | Artefact-level verdict (leads_list, plastics) |
| `/api/tower/judge-artefact` | POST | Artefact judgement via Supabase payload lookup |
| `/api/tower/learn` | POST | General policy update evaluation |
| `/api/tower/learn-max-replans` | POST | Specific max_replans policy learning |
| `/api/tower/policy-versions/:scopeKey/:policyName` | GET | Retrieve policy version history |
| `/tower/runs/log` | POST | Event ingestion / run logging |
| `/api/tower/health` | GET | Health check |

### 8.2 Expected Input Payloads

See Section 5.1 for full schemas. Key points:

- `/evaluate` expects `judgementRequestSchema` (run_id, mission_type, success criteria, snapshot)
- `/tower-verdict` expects leads[], constraints[], success_criteria, meta, delivery_summary, verification/evidence fields
- `/judge-artefact` expects runId, artefactId, goal, artefactType — then fetches payload from DB
- `/learn` expects scope_key, policy_name, decision_log[], outcome_log[], telemetry, current_policy
- `/learn-max-replans` expects scope_key, run_outcomes[], current_policy

### 8.3 Output Payload Structure

**`/evaluate` response:**
```
{ verdict, reason_code, explanation, strategy?, evaluated_at }
```

**`/tower-verdict` response:**
```
{ verdict, action, delivered, requested, gaps[], confidence, rationale, suggested_changes[], constraint_results[], stop_reason? }
```

**`/judge-artefact` response:**
```
{ verdict: "pass"|"fail", action: "continue"|"stop"|"retry"|"change_plan", towerVerdict: "ACCEPT"|"CHANGE_PLAN"|"STOP", stop_reason?, reasons[], metrics, suggested_changes[] }
```

**`/learn` response:**
```
{ verdict: "ALLOW"|"DENY", confidence, reason, evidence_summary, proposed_value, deny_code? }
```

### 8.4 Idempotency and Persistence Assumptions

- **No idempotency keys** on any endpoint. Duplicate calls produce duplicate DB rows.
- **Persistence is best-effort**: all DB writes are wrapped in try/catch with `console.warn`/`console.error` — the HTTP response succeeds even if persistence fails.
- **No transaction boundaries**: verdict computation and persistence are not atomic.
- **Policy version incrementing is not locked**: concurrent `/learn` calls for the same scope_key + policy_name could create conflicting version numbers.

---

## 9. Gaps vs Part 3 Spec

| # | Part 3 Requirement | Present Now | Missing | Best Next Step |
|---|---|---|---|---|
| 1 | Explicit RETRY verdict in verdict enum | Only in `judgeAskLeadQuestion` sub-path as `action: "retry"` | Not a first-class `TowerVerdictAction` | Add `RETRY` to `TowerVerdictAction` enum; define when it triggers in `judgeLeadsList` |
| 2 | Policy knobs as user-configurable settings | Three knobs exist (`radius_policy_v1`, `enrichment_policy_v1`, `stop_policy_v1`) but only tunable via API | No UI, no user-facing "strictness" dial, no per-run knob override | Add a policy config endpoint or UI; allow Supervisor to pass knob overrides per run |
| 3 | Automated learning trigger | Learning endpoints exist but require explicit Supervisor call | No automatic post-run learning invocation | Add a post-verdict hook that triggers `/learn` when a run completes |
| 4 | Feedback loop from Supervisor outcomes | `run_outcomes[]` fed manually to `/learn-max-replans` | No automatic ingestion of Supervisor run results into Tower's learning pipeline | Build an event-driven pipeline: Supervisor posts outcome → Tower auto-evaluates policy |
| 5 | Cross-run memory / priors | `failure_memory` table schema exists with `solution`, `successRate`, `timesApplied` | Table exists but no code reads from it in verdict or learning paths | Wire `failure_memory` into verdict rubric as a prior (e.g., known-bad constraint combos) |
| 6 | Idempotent judgement calls | None | No idempotency keys; duplicate verdicts created on retry | Add `idempotency_key` to request schemas; deduplicate on insert |
| 7 | Verdict persistence atomicity | Fire-and-forget DB writes | Verdict returned even if persistence fails; no transaction | Use DB transaction; fail the request if persistence fails (or queue for retry) |
| 8 | Budget knob as a tunable policy | `max_cost_gbp` exists as a static input field | Not a Learning Layer–managed policy; not adjustable between runs | Create `budget_policy_v1` with Learning Layer integration |
| 9 | Verification depth as a tunable policy | `verifiability` levels exist as constraint metadata | Not a named policy knob; not adjustable by learning | Create `verification_policy_v1` controlling default depth and escalation rules |
| 10 | Source priority as a tunable policy | Count resolution priority is hardcoded in `resolveRequestedCount` / `resolveDeliveredCount` | Not configurable; no policy knob | Extract priority order into a configurable policy |
| 11 | CHANGE_STRATEGY in run-level judgement | Enum value exists but never emitted | Dead code | Either implement or remove from enum |
| 12 | Deterministic replay / audit trail | Verdicts persisted with rationale, gaps, confidence | No input snapshot persisted alongside verdict (only output); no replay capability | Persist full input alongside verdict for deterministic replay |
| 13 | Stop-early threshold as a dynamic knob | `stop_policy_v1` exists with `max_steps`/`max_failures` | Only adjusted via explicit `/learn` call; not context-adaptive | Add heuristic: auto-tighten stop thresholds for repeated-failure scope_keys |
| 14 | Policy rollback mechanism | `rollback_pointer` field exists in `learning_artefacts` | No actual rollback endpoint or automated rollback trigger | Build `POST /api/tower/rollback-policy` endpoint |

---

## 10. Appendix — Relevant Files

| File | Why It Matters |
|---|---|
| `src/evaluator/towerVerdict.ts` (2203 lines) | Core artefact verdict engine: ACCEPT/CHANGE_PLAN/STOP logic, constraint evaluation, all gates |
| `src/evaluator/judgement.ts` (63 lines) | Run-level CONTINUE/STOP evaluator |
| `src/evaluator/learningLayerRubric.ts` (379 lines) | General policy learning: evidence validation, sample size, regression, magnitude guards, confidence |
| `src/evaluator/maxReplansLearning.ts` (222 lines) | Dedicated max_replans INCREASE/DECREASE/NO_LEARN logic |
| `src/evaluator/evidenceQualityJudge.ts` (219 lines) | Post-check: evidence discipline enforcement, ACCEPT→STOP override |
| `src/evaluator/plasticsInjectionRubric.ts` | Domain-specific rubric for factory artefacts |
| `src/evaluator/failureCategorizer.ts` | Post-mortem failure categorization |
| `src/evaluator/patchEvaluator.ts` | Patch quality gatekeeper |
| `shared/schema.ts` (514 lines) | All DB schemas: `tower_verdicts`, `judgement_evaluations`, `policy_versions`, `learning_artefacts`, `failure_memory` |
| `server/routes-tower-verdict.ts` (540 lines) | HTTP route for `/api/tower/tower-verdict` |
| `server/routes-judge-artefact.ts` (781 lines) | HTTP route for `/api/tower/judge-artefact` |
| `server/routes-judgement.ts` (50 lines) | HTTP route for `/api/tower/evaluate` |
| `server/routes-learning-layer.ts` (376 lines) | HTTP routes for `/api/tower/learn` and `/api/tower/learn-max-replans` |
| `config/tasks.json` | Project roadmap including agentic/learning tasks (SUP-010, etc.) |
| `replit.md` | Canonical project documentation with architecture and feature summaries |
