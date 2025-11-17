# Wyshbone Status Dashboard

## Overview

This project is a lightweight Node/Express application designed to monitor the status and key metrics of multiple Wyshbone applications. It provides a live, server-side rendered dashboard, a JSON API, and a file proxy for authenticated access to app resources. The core purpose is to offer real-time insights into application health, performance, and code quality (e.g., LOC, TODO/FIXME counts, cleverness index), tracking changes over time. It aims to provide comprehensive observability and automated evaluation for Wyshbone applications.

## User Preferences

I prefer iterative development with clear, concise explanations. I want to be informed about major architectural decisions before they are implemented. Provide comprehensive context for any suggested changes or new features.

## System Architecture

The application is built on Node.js using Express, rendering server-side HTML with template literals. It utilizes an in-memory Map-based storage for tracking historical data, leveraging the built-in fetch API for HTTP requests.

**Core Features:**

*   **Automated Polling:** Configured Wyshbone app endpoints are polled every 2 minutes.
*   **History Tracking:** Stores the last 50 snapshots per monitored source.
*   **Delta Computation:** Calculates and displays changes in metrics between snapshots.
*   **Auto-Refresh Dashboard:** The HTML dashboard automatically refreshes every 60 seconds.
*   **Error Handling:** Includes graceful handling for network and configuration errors.
*   **File Proxy:** Provides authenticated proxying of file requests from Wyshbone applications.

**Evaluator System (EVAL-001 to EVAL-005):**

A sophisticated evaluation system is integrated to automate testing, diagnosis, and patch management.

*   **Investigation System (EVAL-001):**
    *   PostgreSQL database storage for investigations, triggers, and diagnostic results.
    *   Utilizes OpenAI GPT-4o-mini for automated diagnosis, generating actionable insights and patch suggestions based on run logs and code snapshots.
    *   Interactive dashboard at `/dashboard` and `/investigations` to manage and view investigations.
*   **Automated Behaviour Tests (EVAL-002):**
    *   Harness for defining and executing scenario-specific behaviour tests against Wyshbone UI endpoints (`/api/tower/chat-test`).
    *   Uses regex heuristics to determine pass/fail based on streaming responses.
    *   Records test runs with status (pass/fail/error), duration, and build tags.
    *   Dashboard integration displays test statuses and allows manual execution.
*   **Automated Detection and Investigation Triggering (EVAL-003):**
    *   Automatically detects failures, timeouts, errors, and regressions after each behaviour test run.
    *   Triggers new investigations automatically for issues like failed tests, errors, timeouts, regressions, or repeated errors.
*   **Patch Quality + Regression Protection (EVAL-004):**
    *   A CI/CD-like gatekeeper that evaluates proposed patches in an in-memory sandbox.
    *   Applies strict rejection rules (e.g., any test fails, new errors, latency regression, quality degradation) to ensure patch quality.
    *   Provides comprehensive diff summaries, before/after test results, and rejection reasons.
*   **Junior Developer Agent Integration (EVAL-005):**
    *   Manages a complete patch lifecycle from investigation to suggested patch, evaluation, approval, and application.
    *   Includes API endpoints for generating developer briefs, creating/listing patch suggestions, and updating suggestion statuses.
    *   Integrates with the patch evaluation pipeline for automated testing and status validation.
*   **Auto-Patch Generator (EVAL-006):**
    *   LLM-powered automatic patch generation for investigations using GPT-4o-mini.
    *   Generates unified diff patches from investigation context and diagnosis.
    *   Automatically evaluates generated patches through EVAL-004 gatekeeper pipeline.
    *   Provides "Auto patch (beta)" button in investigation UI for one-click patch generation.
    *   Handles edge cases like NO_PATCH_POSSIBLE with appropriate user feedback.
*   **Behaviour Test Investigation Bridge (EVAL-007):**
    *   Seamlessly bridges behaviour tests with the investigation system for comprehensive issue tracking.
    *   Automatic investigation creation for failed, errored, or timed-out behaviour tests via EVAL-003 integration.
    *   Manual investigation trigger via "Investigate" button in Behaviour Tests UI for proactive debugging.
    *   24-hour deduplication prevents investigation spam for repeated test failures.
    *   Investigation metadata stored in `run_meta` jsonb field includes `testId`, `testName`, and `source: "behaviour_test"`.
    *   REST API endpoint: `POST /tower/behaviour-tests/:testId/investigate` for manual investigation creation.
*   **Single-Test Scoped Behaviour Auto-Patch Flow (EVAL-008 - deprecated naming, see below):**
    *   Surgical patch generation focused on fixing a single behaviour test at a time.
    *   Every behaviour test investigation includes explicit `focus` metadata in `run_meta`:
        *   `type: "behaviour-single-test"`
        *   `focus.kind: "behaviour-test"`
        *   `focus.testId` and `focus.testName` for the specific test
    *   Dev briefs respect focus scope, filtering to only the targeted test's data and history.
    *   Auto-patch generator receives explicit single-test instructions:
        *   "Fix ONLY this test"
        *   "Make the SMALLEST possible change"
        *   "Do NOT touch unrelated behaviour tests or modules"
    *   Patch suggestions tagged with focus metadata for observability.
    *   Patch evaluations log focus in `evaluationMeta` for human-readable summaries.
    *   Gatekeeper pipeline (EVAL-004) remains strict and unchanged, but patches are more surgical and likely to pass.
*   **Live User Run Logging & Investigation Bridge (EVAL-008):**
    *   Logs real Wyshbone UI user conversations into Tower for observability and debugging.
    *   API endpoint `POST /tower/runs/log` accepts live user run data from Wyshbone UI:
        *   User input text, assistant response, status (success/error/timeout/fail)
        *   Duration, user/session identifiers, tool calls, and custom metadata
        *   Validated and stored in the `runs` table with `source: "live_user"`
    *   Dashboard displays "Recent Live Runs" panel showing the last 20 user interactions:
        *   Input/output previews, status badges, duration, user/session info
        *   Click rows to see full conversation details in a modal
        *   "Investigate" button creates or reuses investigations for debugging
    *   Investigation bridge (`ensureLiveUserInvestigationForRun`) with 24-hour deduplication:
        *   Creates investigations with live run context, user/session metadata
        *   Stores `source: "live_user"` in `run_meta` for filtering
        *   Manual trigger via dashboard or API `POST /tower/runs/:runId/investigate`
    *   Conservative auto-detection (currently logs errors only, future: repeated errors, timeouts, quality issues)
    *   Separate query endpoint `GET /tower/runs/live` for filtering live user runs only
    *   Integration guide at `docs/EVAL-008_UI_INTEGRATION.md` for Wyshbone UI team
*   **Conversation Quality Investigator (EVAL-009 - ✅ PRODUCTION READY):**
    *   Analyzes flagged assistant conversations to identify chat behavior issues and provide actionable recommendations.
    *   **API Endpoints:**
        *   `POST /tower/conversation-flag`: Creates conversation quality investigations
            *   Required: `session_id`, `messages` array, `flagged_message_index`
            *   Optional: `user_id`, `user_note` (free text explaining the issue)
            *   Validates input and creates investigation with `source: "conversation_quality"` and `focus.kind: "conversation"`
        *   `GET /tower/conversation-quality`: Retrieves all conversation quality investigations
    *   **LLM-Powered Analysis** using GPT-4o-mini to classify failures into categories:
        *   `prompt_issue`: System prompt or instructions inadequate
        *   `decision_logic_issue`: Poor assistant decisions about actions
        *   `missing_behaviour_test`: Specific scenario lacks test coverage
        *   `missing_clarification_logic`: Should have asked for clarification
        *   `unclear_or_ambiguous_user_input`: User input genuinely unclear
    *   **Structured Analysis Output** includes:
        *   Failure category classification
        *   Human-readable summary of the issue
        *   Minimal reproducible scenario (transcript snippet)
        *   Suggested prompt changes (optional)
        *   Suggested behavior test description (optional)
    *   **Dashboard Integration:**
        *   "Conversation Quality" panel showing recent flagged conversations
        *   Color-coded badges using Badge component variants for failure categories
        *   Analysis summaries with timestamps
        *   Click to view full conversation window with flagged message highlighted
        *   View suggested fixes and test recommendations
        *   "Open in Console" button for detailed investigation
        *   Toast notifications for errors and successful operations
        *   Skeleton loading states for better UX
    *   **Deduplication with Reanalysis:**
        *   24-hour window by session ID prevents duplicate investigations
        *   When duplicate flags arrive, updates conversation window and user notes
        *   Automatically triggers reanalysis with new data
    *   **Testing:**
        *   Integration test: `npx tsx scripts/test-conversation-quality.ts`
        *   HTTP API test: `npx tsx scripts/test-conversation-quality-http.ts`
        *   Both tests verify end-to-end flow, validation, and deduplication
    *   Analysis runs asynchronously and updates investigation with diagnosis
    *   Investigations stored with full conversation context for downstream patch generation
    *   **Production Notes:**
        *   Requires `OPENAI_API_KEY` for LLM analysis
        *   Server runs on port 5000
        *   See `docs/EVAL-009_CONVERSATION_QUALITY.md` for complete documentation
*   **Patch Failure Post-Mortem (EVAL-016):**
    *   Automatically captures and analyzes rejected auto-generated patches to understand failure reasons.
    *   **Automatic Triggering:** When auto-generated patches (EVAL-006) are rejected by the gatekeeper (EVAL-004), creates investigation with `source: "patch_failure"` and `focus.kind: "patch"`
    *   **LLM-Powered Analysis** using GPT-4o-mini to classify failures into categories:
        *   `broke_existing_tests`: Patch caused regressions in passing tests
        *   `did_not_fix_original_issue`: Patch didn't solve the intended problem
        *   `misinterpreted_requirement`: Patch implemented wrong solution
        *   `test_is_ambiguous_or_wrong`: Test itself may be incorrect
        *   `wrong_repo_or_layer`: Change belongs in different codebase
        *   `insufficient_context`: Not enough information to generate correct patch
        *   `other`: Unusual or complex failure
    *   **Structured Analysis Output** includes:
        *   Failure reason (concise 1-2 sentence explanation)
        *   Failure category classification
        *   Next step recommendations
        *   Suggested constraints for next patch attempt (optional)
    *   **Dashboard Integration:**
        *   "Patch Failures" panel showing recent rejected patches
        *   Color-coded badges for failure categories and risk levels
        *   Modal view with full analysis, sandbox results, and patch diff
        *   Links back to original investigation
        *   "Open in Console" button for detailed investigation
    *   **Tracking Multiple Patch Failures:**
        *   Each rejected patch generates its own investigation record
        *   Multiple patches for the same investigation are linked via `original_investigation_id`
        *   No deduplication - enables tracking iteration history and learning from repeated failures
    *   **Testing:**
        *   Integration test: `npx tsx scripts/test-patch-failure.ts`
        *   Verifies automatic investigation creation, analysis, and multiple patch tracking
    *   **API Endpoint:**
        *   `GET /tower/patch-failures`: Retrieves all patch failure investigations
    *   Analysis runs asynchronously and stores results in `run_meta.analysis` and `diagnosis`
    *   Creates feedback loop for improving auto-patch quality over time
    *   **Production Notes:**
        *   Requires `OPENAI_API_KEY` for LLM analysis
        *   Hooks into `src/evaluator/autoPatch.ts` rejection flow
        *   See `docs/EVAL-016_PATCH_FAILURE.md` for complete documentation

**UI/UX:**

*   Hybrid architecture with server-rendered routes (`/status`) and a React SPA at `/dashboard`.
*   Interactive debugging console with run tracking.
*   Status dashboard with a two-column layout showing Tower Status metrics, Recent Runs, and an Evaluator Console for active investigations.
*   Roadmap visualization with tasks grouped by architectural layers, displaying completion status, and "Phase 2" indicators for advanced tasks.
*   Interactive task modals with full details and copy-to-clipboard functionality for prompts.

## External Dependencies

*   **Node.js:** Runtime environment.
*   **Express:** Web application framework.
*   **PostgreSQL:** Database for storing investigations, behaviour test runs, and other persistent data (via Neon for serverless connections).
*   **OpenAI GPT-4o-mini:** Utilized by the evaluator for automated diagnosis and patch suggestion generation.
*   **Vite:** Used for serving the React SPA and providing hot module replacement during development.