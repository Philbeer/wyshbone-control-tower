# Wyshbone Status Dashboard

## Overview
This project is a Node/Express application for monitoring Wyshbone applications. It provides a real-time, server-side rendered dashboard, a JSON API, and a file proxy for authenticated access. Its core purpose is to offer live insights into application health, performance, and code quality, track changes over time, and automate the evaluation of Wyshbone applications through an advanced suite of automated testing, diagnosis, and patch management tools. The project aims for comprehensive observability and automated evaluation.

## User Preferences
I prefer iterative development with clear, concise explanations. I want to be informed about major architectural decisions before they are implemented. Provide comprehensive context for any suggested changes or new features.

## System Architecture
The application is built on Node.js and Express, utilizing server-side rendering with template literals and an in-memory Map for historical data. It polls Wyshbone app endpoints every 2 minutes, tracks the last 50 snapshots per source, computes metric deltas, and provides an auto-refreshing HTML dashboard. A robust evaluation suite automates testing, diagnosis, and patch management:

*   **Automated Investigations:** Manages triggers and diagnostic results, leveraging OpenAI GPT-4o-mini for diagnosis and patch suggestions.
*   **Automated Behaviour Tests:** Runs scenario-specific tests against Wyshbone UI endpoints, records, and displays results.
*   **Automated Detection & Investigation Triggering:** Initiates investigations for failures, timeouts, errors, and regressions.
*   **Patch Quality & Regression Protection:** Evaluates proposed patches in a sandbox to prevent regressions.
*   **Auto-Patch Generation:** LLM-powered patch generation using GPT-4o-mini, with automated evaluation.
*   **Behaviour Test Integration:** Integrates behaviour tests with the investigation system.
*   **Live User Run Logging & Investigation:** Logs real Wyshbone UI user conversations and enables investigation creation.
*   **Conversation Quality Investigation:** Analyzes and detects Wyshbone-specific conversation quality issues using GPT-4o-mini.
*   **Patch Failure Post-Mortem:** Analyzes rejected patches to classify failure reasons.
*   **Tower Verdict (Agent Loop Judgement):** Provides evidence-based constraint evaluation of `leads_list` artifacts, returning structured verdicts (ACCEPT/CHANGE_PLAN/STOP) with typed constraints (NAME_CONTAINS, NAME_STARTS_WITH, LOCATION, COUNT_MIN) and configurable `hardness` (hard/soft). It includes logic for `requested_count_user`, `attempt_history` for no-progress loops, and backwards compatibility for legacy constraints.
*   **Plastics Injection Moulding Rubric:** Judges `factory_state` and `factory_decision` artefacts based on criteria like `max_scrap_percent`, `scrap_rate_now`, and `energy_kwh_per_good_part` trends to determine verdicts (STOP, ACCEPT/CONTINUE, CHANGE_PLAN).
*   **ASK_LEAD_QUESTION Overconfidence Guard:** For `step_type=ASK_LEAD_QUESTION`, checks `metrics.confidence` and `metrics.evidence_items`. High confidence requires official site evidence or multiple independent domains; otherwise, it triggers CHANGE_PLAN with `overconfident_without_support` and `suggested_changes`. Handles hard and soft attribute verification, stopping for unverifiable hard constraints.
*   **Artefact Judgement API:** Judges artifacts stored in Supabase by inspecting `payload_json` and applying rules based on `artefactType` (e.g., `leads_list`, `factory_state`/`factory_decision`), returning both legacy `verdict` and canonical `towerVerdict`.
*   **Tower Verdict Persistence:** All verdict decisions are persisted to the `tower_verdicts` Supabase table.
*   **Structured Stop Reasons:** Every STOP and CHANGE_PLAN verdict includes a structured `stop_reason` with a stable `code`, `message`, and optional `evidence`.
*   **Proof Mode:** Supports `proof_mode` for deterministic demo behavior for both `/tower-verdict` and `/judge-artefact` routes, with proof verdicts also persisted.
*   **Evidence Quality Judge:** A post-check module enforcing evidence discipline on web-derived claims, triggering STOP for issues like `VERIFIED_WITHOUT_EVIDENCE`, `VERIFIED_EXACT_BELOW_REQUESTED`, or `DELIVERY_SUMMARY_MISMATCH`.
*   **Tower Dev Chat:** An interface for developers to report issues, with automatic context gathering and AI-powered patch suggestions using GPT-4o-mini, tracked in PostgreSQL.
*   **Learning Layer v1 — Tower Policy Updates:** Tower judges whether to update policies (`radius_policy_v1`, `enrichment_policy_v1`, `stop_policy_v1`) based on evidence (`decision_log`, `outcome_log`, `telemetry`, `current_policy`). It applies a rubric with checks for evidence completeness, sample size, regression detection, success rate, magnitude guards, and confidence threshold.
*   **Learning Layer v1 — max_replans Learning (`POST /api/tower/learn-max-replans`):** Updates `stop_policy_v1.max_replans` per `scope_key` based on last N run outcomes. Computes `replan_helped_rate`, `waste_rate`, and `exceeded_rate`. Update logic: if exceeded>=0.30 AND helped>=0.50 → +1 (cap 3); if waste>=0.60 → -1 (floor 0); else no_learn. Guardrails: N>=5 required, max change ±1, blocks update if last 3 runs all FAIL. Persists to `policy_versions` and emits `policy_update` or `no_learn` artefacts with evidence summaries and rollback pointers. Core logic: `src/evaluator/maxReplansLearning.ts`. Tests: `tests/maxReplansLearning.test.ts`.

**Constraint-Driven Evidence-Based Evaluation (v3):**
Tower uses user intent (`requested_count_user`) and accumulated matching results (`delivered_matching_accumulated`). It defines a priority for resolving requested and delivered counts. Constraints are typed (NAME_CONTAINS, NAME_STARTS_WITH, LOCATION, COUNT_MIN, HAS_ATTRIBUTE) with `hardness` (hard/soft), and a clear resolution priority for different constraint formats. Logic includes replan-aware verdicting, typed `suggested_change` types, and detection of `label_misleading` gaps. Hard constraints are strictly enforced, never auto-relaxed. CVL-aware judgement uses `verification_summary` for evidence-based verification, prioritizing `verified_exact_count` and requiring CVL status for LOCATION constraints. Rationale wording is factual and aligned with `delivery_summary`.

**HAS_ATTRIBUTE Constraint & attribute_evidence (CVL):**
CVL evaluation for `HAS_ATTRIBUTE` constraints (e.g., `c_attr_live_music`) consumes `attribute_evidence` artefacts from Supervisor. When evaluating a lead for HAS_ATTRIBUTE: if an `attribute_evidence` artefact exists for that lead+attribute, the constraint status is set to the artefact's verdict (yes/no/unknown) with confidence and evidence pointers (evidence_id, source_url, quote). If no artefact exists, status defaults to `unknown` with low confidence. Unknown is never treated as false — it excludes the constraint from hard violations and prevents `verified_exact` from being true until all hard constraints are resolved to `yes`. The `ConstraintResult` exposes `status`, `evidence_id`, `source_url`, `quote`, and `attribute_evidence_details` for UI consumption. The `routes-judge-artefact.ts` fetches `attribute_evidence` artefacts from the `artefacts` table (type=`attribute_evidence`) for the same `run_id` and passes them into `judgeLeadsListArtefact`.

**UI/UX Decisions:**
The dashboard is simplified, featuring plain language and three core sections: **Recent Runs** (user conversations with events, status, timelines, flagging), **Auto-Flagged Runs** (automatically detected quality issues), and **Manual Flags**. An **Advanced Tools** section provides access to Tower Status, Automated Tests, Patch Failures, and Complete Run History. A **Conversation Timeline View** offers detailed chronological message views, and a **Simplified Investigation Workflow** displays run input/output, AI diagnosis, and suggested patches with approval/rejection options. Technical jargon is minimized.

**Database Rules:** Tower exclusively uses a Supabase-hosted Postgres database (`SUPABASE_DATABASE_URL`), strictly preventing connections to other databases for core judgment, artifact, or run data in deployed environments.

## External Dependencies
*   **Node.js:** Runtime environment.
*   **Express:** Web application framework.
*   **PostgreSQL:** Database for persistent data storage (accessed via Supabase).
*   **OpenAI GPT-4o-mini:** Used for automated diagnosis, patch generation, and conversation quality analysis.