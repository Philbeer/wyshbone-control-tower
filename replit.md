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

UI/UX decisions have been completely simplified for ease of use. The dashboard now uses plain language and focuses on three core sections:

**Simplified Dashboard Design:**

*   **Recent Runs:** Shows all user conversations from Wyshbone UI with conversation-level grouping. Multiple messages with the same `runId` are grouped as a single conversation card. Each card displays:
    *   Event count badge (e.g., "3 messages")
    *   First message input summary
    *   Time range (first message to latest message)
    *   Status indicator
    *   "View Timeline" button to see all messages chronologically
    *   "Flag conversation" button to mark entire conversation for review
*   **Auto-Flagged Runs:** Automatically detected quality issues (bad reasoning, hallucinations, unhelpful tone, etc.). Each entry shows the original input and reason it was flagged.
*   **Manual Flags:** Conversations that users manually flagged for review. Shows original input and optional user-provided reason.
*   **Advanced Tools (Collapsed):** Contains Tower Status metrics, Automated Tests, Patch Failures, and Complete Run History. Includes a "Clear All Flags" button to reset investigation data.

**Conversation Timeline View:**

When clicking "View Timeline" from any conversation, users see a detailed chronological view of all messages in that conversation, including:
*   Message number and timestamp for each event
*   Input and output text for each message
*   Status badges (success, error, etc.)
*   Duration and tool usage metadata
*   Model information when available

**Simplified Investigation Workflow:**

When clicking "Investigate & Fix" from any section, users are taken to a dedicated investigation page that shows:
1. Run input and output
2. Auto diagnosis explaining the issue (automatically generated by OpenAI GPT-4o-mini)
3. Suggested patch (code changes to fix the problem, automatically generated by OpenAI)
4. "Approve Patch" and "Reject Patch" buttons

The investigation page automatically triggers AI evaluation when loaded if diagnosis or patch suggestion are missing. During evaluation:
- Shows a loading spinner with "Generating diagnosis using OpenAI..." message
- Calls OpenAI GPT-4o-mini to analyze the conversation and generate diagnosis
- Displays diagnosis and patch suggestion once OpenAI responds (typically 5-30 seconds)
- Evaluation is idempotent - won't re-evaluate if already complete

This replaces the previous complex sidebar-based workflow with a straightforward, task-focused page.

**Language Simplification:**

All technical jargon has been removed:
- "EVAL-XXX" references removed
- "Conversation quality" → "Quality issues"  
- "Investigation system" → "Investigate & Fix"
- "Patch lifecycle" → "Patch suggestions"
- "Sandbox evaluation" → (removed, happens transparently)

**Tower Dev Chat v0 (Developer Issues):**

A dedicated interface for developers to report issues with automatic context gathering and AI-powered patch suggestions:

*   **Developer Issues Page (/dev/issues):** Accessible via "Developer Issues" button in the navigation header
*   **Issue Submission Form:** Title, description, and optional screenshot URL
*   **Automatic Context Gathering:** When an issue is created, the system:
    *   Extracts keywords from the issue text (file patterns, error messages, technical terms)
    *   Searches the codebase for relevant files matching keywords
    *   Fetches recent log excerpts if errors are mentioned
    *   Stores all gathered context in the database
*   **Context Display:** The right panel shows the issue details along with:
    *   Relevant source files (collapsible with syntax highlighting)
    *   Log excerpts (if applicable)
*   **AI Patch Suggestions:** Developers can click "Generate Patch Suggestions" to:
    *   Analyze the issue description and gathered context using OpenAI GPT-4o-mini
    *   Generate code patch suggestions with file paths, summaries, and full file contents
    *   Display patches in collapsible cards with copy-to-clipboard functionality
    *   Note: Patches are stored in database only - no modifications to source files
*   **Issue Status Tracking:** Issues progress through states: new → context_gathered → investigating → resolved → closed

Database tables:
*   `dev_issues`: Stores issue metadata (id, title, description, screenshotUrl, status, createdAt)
*   `dev_issue_context`: Stores gathered context (filePath, fileContents, logExcerpt) linked to issues
*   `dev_issue_patches`: Stores AI-generated patch suggestions (filePath, newContents, summary) linked to issues

API Routes:
*   GET /api/dev/issues - List all issues
*   POST /api/dev/issues/create - Create new issue
*   POST /api/dev/issues/context - Trigger context gathering
*   GET /api/dev/issues/:id - Get issue with context
*   PATCH /api/dev/issues/:id/status - Update issue status
*   POST /api/dev/issues/:id/suggest-patch - Generate AI patch suggestions using OpenAI
*   GET /api/dev/issues/:id/patches - Get all patches for an issue

## External Dependencies

*   **Node.js:** Runtime environment.
*   **Express:** Web application framework.
*   **PostgreSQL:** Database for persistent data storage (via Neon).
*   **OpenAI GPT-4o-mini:** Used for automated diagnosis, patch generation, and conversation quality analysis.
*   **Vite:** Used for serving the React SPA and development tooling.