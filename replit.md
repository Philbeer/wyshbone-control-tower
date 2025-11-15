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