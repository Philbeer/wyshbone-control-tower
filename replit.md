# Wyshbone Status Dashboard

## Overview

This project is a lightweight Node/Express application for monitoring the status and key metrics of multiple Wyshbone applications. It provides a live, server-side rendered dashboard, a JSON API, and a file proxy for authenticated access. Its core purpose is to offer real-time insights into application health, performance, and code quality, tracking changes over time to provide comprehensive observability and automated evaluation for Wyshbone applications.

## User Preferences

I prefer iterative development with clear, concise explanations. I want to be informed about major architectural decisions before they are implemented. Provide comprehensive context for any suggested changes or new features.

## System Architecture

The application is built on Node.js using Express, rendering server-side HTML with template literals and utilizing an in-memory Map for historical data tracking. It features automated polling of Wyshbone app endpoints every 2 minutes, history tracking (last 50 snapshots per source), delta computation for metrics, an auto-refreshing HTML dashboard (every 60 seconds), and robust error handling. A file proxy provides authenticated access to application resources.

The system incorporates a sophisticated evaluation suite (EVAL-001 to EVAL-016) for automated testing, diagnosis, and patch management:

*   **Investigation System (EVAL-001):** Manages investigations, triggers, and diagnostic results in a PostgreSQL database. Uses OpenAI GPT-4o-mini for automated diagnosis and patch suggestions.
*   **Automated Behaviour Tests (EVAL-002):** A harness for running scenario-specific tests against Wyshbone UI endpoints, recording results, and displaying statuses.
*   **Automated Detection and Investigation Triggering (EVAL-003):** Automatically triggers investigations for failures, timeouts, errors, and regressions detected by behaviour tests.
*   **Patch Quality + Regression Protection (EVAL-004):** A CI/CD-like gatekeeper that evaluates proposed patches in a sandbox, applying strict rejection rules to prevent regressions and quality degradation.
*   **Junior Developer Agent Integration (EVAL-005):** Manages the full patch lifecycle from investigation to application, including generating developer briefs and managing patch suggestions.
*   **Auto-Patch Generator (EVAL-006):** LLM-powered automatic patch generation for investigations using GPT-4o-mini, with automated evaluation via EVAL-004.
*   **Behaviour Test Investigation Bridge (EVAL-007):** Integrates behaviour tests with the investigation system, enabling automatic and manual investigation creation for test issues with deduplication.
*   **Live User Run Logging & Investigation Bridge (EVAL-008):** Logs real Wyshbone UI user conversations for observability, displaying recent runs, and enabling investigation creation with deduplication.
*   **Conversation Quality Investigator (EVAL-009):** Analyzes flagged and automatically detects Wyshbone-specific conversation quality issues using GPT-4o-mini, classifying failures, providing summaries, and suggesting fixes/tests. Includes dashboard integration for viewing and managing issues.
*   **Patch Failure Post-Mortem (EVAL-016):** Automatically analyzes rejected auto-generated patches (from EVAL-006) to classify failure reasons, recommend next steps, and provide suggested constraints for future patch attempts.

UI/UX decisions include a hybrid architecture with server-rendered routes and a React SPA dashboard. The dashboard features a two-column layout showing status metrics, recent runs, an evaluator console, and a roadmap visualization with interactive task modals.

## External Dependencies

*   **Node.js:** Runtime environment.
*   **Express:** Web application framework.
*   **PostgreSQL:** Database for persistent data storage (via Neon).
*   **OpenAI GPT-4o-mini:** Used for automated diagnosis, patch generation, and conversation quality analysis.
*   **Vite:** Used for serving the React SPA and development tooling.