# Wyshbone Status Dashboard

## Overview
This project is a Node/Express application designed to monitor the status and key metrics of multiple Wyshbone applications. It provides a real-time, server-side rendered dashboard, a JSON API, and a file proxy for authenticated access. The primary goal is to offer live insights into application health, performance, and code quality, tracking changes over time for comprehensive observability and automated evaluation of Wyshbone applications.

## User Preferences
I prefer iterative development with clear, concise explanations. I want to be informed about major architectural decisions before they are implemented. Provide comprehensive context for any suggested changes or new features.

## System Architecture
The application is built using Node.js and Express, featuring server-side rendering with template literals and an in-memory Map for historical data. It automatically polls Wyshbone app endpoints every 2 minutes, tracks the last 50 snapshots per source, computes metric deltas, and provides an auto-refreshing HTML dashboard. Error handling is robust, and a file proxy enables authenticated access to application resources.

The system incorporates a sophisticated evaluation suite for automated testing, diagnosis, and patch management:

*   **Automated Investigations:** Manages investigations, triggers, and diagnostic results. Utilizes OpenAI GPT-4o-mini for automated diagnosis and patch suggestions.
*   **Automated Behaviour Tests:** Runs scenario-specific tests against Wyshbone UI endpoints, records results, and displays statuses.
*   **Automated Detection and Investigation Triggering:** Automatically initiates investigations for failures, timeouts, errors, and regressions.
*   **Patch Quality + Regression Protection:** Evaluates proposed patches in a sandbox, preventing regressions and quality degradation.
*   **Auto-Patch Generation:** LLM-powered automatic patch generation for investigations using GPT-4o-mini, with automated evaluation.
*   **Behaviour Test Integration:** Integrates behaviour tests with the investigation system, enabling automatic and manual investigation creation.
*   **Live User Run Logging & Investigation:** Logs real Wyshbone UI user conversations for observability and enables investigation creation.
*   **Conversation Quality Investigation:** Analyzes and automatically detects Wyshbone-specific conversation quality issues using GPT-4o-mini, classifying failures and suggesting fixes/tests.
*   **Patch Failure Post-Mortem:** Analyzes rejected auto-generated patches to classify failure reasons and recommend next steps.
*   **Tower Verdict (Agent Loop Judgement):** Evidence-based constraint evaluation of leads_list artifacts. Returns structured verdicts (ACCEPT/CHANGE_PLAN/STOP) with `action` (continue/change_plan/stop). Requires `requested_count_user` (returns STOP if absent). Typed constraints: NAME_CONTAINS, NAME_STARTS_WITH, LOCATION, COUNT_MIN — each with `hardness` (hard/soft). Hard constraint violations prevent ACCEPT. COUNT_MIN evaluates against name-matched lead count, not total leads. Soft constraints suggest RELAX_CONSTRAINT when insufficient matches. Safety check: detects no-progress loops via `attempt_history`. Backwards compatible with legacy `hard_constraints`/`soft_constraints` arrays.
*   **Plastics Injection Moulding Rubric (Feb 2026):** Tower judges `factory_state` and `factory_decision` artefacts for plastics injection moulding demos. Rubric inputs: `constraints.max_scrap_percent`, `state.scrap_rate_now`, `state.achievable_scrap_floor`, `defect_type`, `energy_kwh_per_good_part` trends. Verdict logic: STOP if `max_scrap_percent < achievable_scrap_floor` ("constraint impossible under current moisture/tool state"); ACCEPT/CONTINUE if `scrap_rate_now <= max_scrap_percent` and not worsening; CHANGE_PLAN if scrap exceeds max and decision is "continue" or repeats failing action, or if scrap rising for 2 steps, or defect shifts after mitigation; STOP for extreme scrap (>=50%) or deadline infeasible. Emits `tower_judgement` artefact with short reasons at each step. Implementation: `src/evaluator/plasticsInjectionRubric.ts`, tests: `tests/plasticsInjectionRubric.test.ts`.
*   **Artefact Judgement API:** Tower judges artifacts stored in Supabase by inspecting their `payload_json` and applying specific rules based on `artefactType` (e.g., `leads_list` artefacts are judged by count and constraint adherence, `factory_state`/`factory_decision` artefacts by plastics rubric) to determine whether to continue or stop a run. Returns both legacy `verdict` (pass/fail) and canonical `towerVerdict` (ACCEPT/CHANGE_PLAN/STOP) with structured `stop_reason` for Supervisor consumption.
*   **Tower Verdict Persistence (Feb 2026):** All verdict decisions are persisted to the `tower_verdicts` Supabase table (run_id, artefact_id, artefact_type, verdict, stop_reason, delivered, requested, gaps, suggested_changes, confidence, rationale, created_at). Persistence is fire-and-forget (non-blocking, error-logged). Both `/tower-verdict` and `/judge-artefact` routes persist.
*   **Structured Stop Reasons (Feb 2026):** Every STOP and CHANGE_PLAN verdict includes `stop_reason: { code: string, message: string, evidence?: Record<string, unknown> }`. Gap codes are stable UPPERCASE constants (e.g., `MISSING_REQUESTED_COUNT`, `HARD_CONSTRAINT_VIOLATED`, `NO_PROGRESS`, `INSUFFICIENT_COUNT`). Dynamic data (field names, counts) is in `stop_reason.evidence`, not embedded in gap strings.
*   **Proof Mode (Feb 2026):** Both `/tower-verdict` and `/judge-artefact` routes support `proof_mode` parameter (STOP/CHANGE_PLAN/ACCEPT) for deterministic demo behavior. Proof verdicts are also persisted.
*   **Evidence Quality Judge (Feb 2026):** Post-check module (`src/evaluator/evidenceQualityJudge.ts`) that wraps `judgeLeadsList` to enforce evidence discipline on web-derived claims. Rules: (1) VERIFIED_WITHOUT_EVIDENCE — leads marked `verified=true` but lacking `evidence`/`source_url` trigger STOP; (2) VERIFIED_EXACT_BELOW_REQUESTED — `verified_exact_count < requested_count` triggers STOP; (3) DELIVERY_SUMMARY_MISMATCH — `delivery_summary=PASS` but `tower_verdict≠ACCEPT` triggers STOP. Unknown leads (no `verified` field) are never penalised, preserving legacy behaviour. Evidence quality checks only activate when leads carry evidence-related fields or `delivery_summary` is provided. Tests: `tests/evidenceQualityJudge.test.ts` (13 tests).
*   **Tower Dev Chat:** A dedicated interface for developers to report issues, with automatic context gathering from the codebase and AI-powered patch suggestions using OpenAI GPT-4o-mini. Issues are tracked through various states (new, context_gathered, investigating, resolved, closed) in a PostgreSQL database.

**Constraint-Driven Evidence-Based Evaluation (v3):**
Tower uses user intent (`requested_count_user`) and accumulated matching results (`delivered_matching_accumulated`) for judgement.
*   **Requested resolution priority:** `requested_count_user` > `success_criteria.requested_count_user` > `success_criteria.target_count` > `requested_count`.
*   **Delivered resolution priority:** `delivered.delivered_matching_accumulated` > `leads.length` (when constraints applied) > `delivered.delivered_matching_this_plan`. Never uses `delivered_total_*` for success.
*   **Constraint types:** NAME_CONTAINS (word-boundary), NAME_STARTS_WITH (prefix), LOCATION (trusted from Supervisor), COUNT_MIN (against matched leads). Supervisor stores constraints as `structured_constraints` with `hard: boolean` and `LOCATION_EQUALS` type; Tower normalizes these via `normalizeStructuredConstraints` (converts `hard` boolean to `hardness` string, maps `LOCATION_EQUALS` to `LOCATION`).
*   **Constraint resolution priority:** `constraints` (typed) > `structured_constraints` (Supervisor format) > `hard_constraints`/`soft_constraints` (legacy strings) > `success_criteria` objects.
*   **Replan-aware verdict logic:** Uses `meta.replans_used` / `meta.max_replans` and `allow_relax_soft_constraints` to decide CHANGE_PLAN vs STOP.
*   **Suggested change types:** RELAX_CONSTRAINT, EXPAND_AREA, INCREASE_SEARCH_BUDGET, CHANGE_QUERY, STOP_CONDITION, ADD_VERIFICATION_STEP — all strictly typed objects.
*   **Label honesty:** Detects `label_misleading` gap when `meta.relaxed_constraints` keywords appear in artefact title/summary.
*   **Hard constraint enforcement:** Hard constraints are never auto-relaxed; suggests EXPAND_AREA instead.
Each constraint has `hardness` (hard/soft). Hard violations prevent ACCEPT. Output includes `constraint_results` with per-constraint match counts.
*   **CVL-aware judgement (Feb 2026):** When `verification_summary` is present in the input, Tower uses evidence-based constraint verification. `verified_exact_count` takes absolute priority over all legacy count resolution paths. LOCATION constraints no longer auto-pass — they must have CVL status "yes" to pass. Hard constraints with CVL status "unknown" trigger CHANGE_PLAN (with ADD_VERIFICATION_STEP suggestion) if replans are available, or STOP if "unverifiable" and no replans. Legacy behaviour is fully preserved when `verification_summary` is absent. CVL constraint matching uses (type+field+value) for precision, falling back to (type+field) when value is not available. Gap types: `location_not_verifiable`, `hard_constraint_unknown`, `hard_constraint_unverifiable`.
*   **Rationale wording (Exact vs Closest alignment, Feb 2026):** Tower rationale text uses delivery_summary-aligned language. ACCEPT: "The requested number of exact matches was delivered." STOP with partial: "Only {N} exact matches were found. Remaining results do not meet all stated requirements." STOP with zero exact but closest exist: "No exact matches were found. Closest alternatives were identified after relaxing soft constraints." STOP with nothing: "No results were found that meet the stated requirements." Tower rationale never mentions UI wording, suggestions, or user emotion — facts only.

**UI/UX Decisions:**
The dashboard features a simplified design with plain language, focusing on three core sections:
*   **Recent Runs:** Displays user conversations grouped by `runId`, showing event count, input summary, time range, status, and options to view timelines or flag conversations.
*   **Auto-Flagged Runs:** Shows automatically detected quality issues with original input and reason.
*   **Manual Flags:** Displays conversations manually flagged by users.
*   **Advanced Tools:** Collapsible section for Tower Status, Automated Tests, Patch Failures, and Complete Run History.

**Conversation Timeline View:** Provides a detailed chronological view of all messages within a conversation, including input/output text, status badges, duration, tool usage, and model information.

**Simplified Investigation Workflow:** A dedicated investigation page displays run input/output, AI-generated diagnosis, and suggested patch. It includes "Approve Patch" and "Reject Patch" buttons. AI evaluation for diagnosis and patches is triggered automatically and is idempotent.

**Language Simplification:** Technical jargon has been removed for clarity and ease of understanding.

**Database Rules:** Tower strictly uses a Supabase-hosted Postgres database (`SUPABASE_DATABASE_URL`). It prevents connections to Replit Postgres, non-Supabase hosts in deployed environments (except localhost for development), and local databases for core judgment, artefact, or run data. All persistence flows are routed through a single `db` export.

## External Dependencies
*   **Node.js:** Runtime environment.
*   **Express:** Web application framework.
*   **PostgreSQL:** Database for persistent data storage (accessed via Supabase).
*   **OpenAI GPT-4o-mini:** Used for automated diagnosis, patch generation, and conversation quality analysis.
*   **Vite:** Used for serving the React SPA and development tooling.