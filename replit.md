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
*   **Tower Verdict (Agent Loop Judgement):** Deterministically evaluates leads list artifacts against user goals and constraints, returning structured verdicts (ACCEPT/CHANGE_PLAN/STOP) with `action` (continue/retry/change_plan/stop) and `reason_code` fields. Enforces a strict judgement contract: requires `requested_count_user` (returns STOP with `missing_requested_count_user` if absent), judges only against that count. Supports structured constraints with `hardness` (hard/soft) and `was_relaxed` flags per field. Hard constraints are never auto-relaxed — if violated (was_relaxed=true on hard), returns STOP with `hard_constraint_violated`. Soft constraints are relaxed in priority order: EXPAND_AREA → INCREASE_COVERAGE → RELAX_CONSTRAINT. "Lying acceptance" prevention: ACCEPT rationale explicitly notes any relaxed constraints. Safety check: detects no-progress loops via `attempt_history` and returns STOP with `no_progress_over_attempts`. Backwards compatible with legacy payloads using `hard_constraints`/`soft_constraints` arrays.
*   **Judgement API:** A deterministic evaluation endpoint that returns a verdict (CONTINUE/STOP/CHANGE_STRATEGY) based on a run snapshot and success criteria.
*   **Artefact Judgement API:** Tower judges artifacts stored in Supabase by inspecting their `payload_json` and applying specific rules based on `artefactType` (e.g., `leads_list` artefacts are judged by count and constraint adherence) to determine whether to continue or stop a run.
*   **Tower Dev Chat:** A dedicated interface for developers to report issues, with automatic context gathering from the codebase and AI-powered patch suggestions using OpenAI GPT-4o-mini. Issues are tracked through various states (new, context_gathered, investigating, resolved, closed) in a PostgreSQL database.

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