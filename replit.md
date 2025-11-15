# Wyshbone Status Dashboard

A lightweight Node/Express application that polls multiple Wyshbone apps and displays a live status dashboard.

## Project Overview

This is a server-side rendered monitoring dashboard that:
- Polls configured Wyshbone app endpoints every 2 minutes
- Tracks metrics: cleverness index, LOC, TODO/FIXME counts
- Displays deltas between snapshots
- Provides both HTML dashboard and JSON API
- Proxies file requests with authentication

## Architecture

### Files Structure

```
├── server.js           # Main Express server with routes
├── lib/
│   └── poller.js      # Polling logic and data management
├── config/
│   └── sources.json   # Configuration for Wyshbone apps to monitor
└── README.md          # Comprehensive documentation
```

### Technology Stack

- **Runtime**: Node.js (ESM modules)
- **Framework**: Express
- **Rendering**: Server-side HTML with template literals
- **Storage**: In-memory (Map-based)
- **HTTP Client**: Built-in fetch API

### Key Features

1. **Automated Polling**: Background polling every 2 minutes
2. **History Tracking**: Last 50 snapshots per source
3. **Delta Computation**: Calculates changes between snapshots
4. **Auto-Refresh Dashboard**: HTML refreshes every 60 seconds
5. **Error Handling**: Graceful handling of network/config errors
6. **File Proxy**: Authenticated file fetching from Wyshbone apps

## Configuration

Edit `config/sources.json` to add your Wyshbone app URLs and export keys:

```json
[
  {
    "name": "Wyshbone UI",
    "baseUrl": "https://your-app.repl.co",
    "exportKey": "your-export-key"
  }
]
```

## Running

```bash
node server.js
```

Server runs on port defined by `PORT` environment variable (default: 3000).

## Endpoints

- `GET /status` - HTML dashboard with auto-refresh
- `GET /status.json` - Machine-readable JSON API
- `GET /proxy/file?src=NAME&path=PATH` - Proxied file requests

## Recent Changes

- 2025-11-15: EVAL-002B: Streaming Test Endpoint Integration
  - **New Endpoint**: Wyshbone UI now provides `/api/tower/chat-test` for machine authentication
  - **Implementation** (src/evaluator/behaviourTests.ts):
    - Updated callWyshboneUI() to call `/api/tower/chat-test` endpoint
    - Added X-EXPORT-KEY header authentication using exportKey from sources.json
    - Implemented parseStreamingResponse() to handle Server-Sent Events (SSE) streaming
    - Accumulates all streamed chunks into single string for regex heuristic matching
    - Supports multiple SSE data formats (content, delta.content, plain text)
    - Graceful fallback to JSON parsing for non-streaming responses
  - **Chat API Types** (src/evaluator/chatApiTypes.ts):
    - ChatRequest interface with required user (id, name, email) and messages fields
    - Optional domain field for personalization tests
    - ChatMessage interface with role and content
  - **Status**: 
    - ✅ Uses correct `/api/tower/chat-test` endpoint with X-EXPORT-KEY auth
    - ✅ Handles streaming responses and captures full text
    - ✅ All four behaviour tests ready for real PASS/FAIL verdicts

- 2025-11-15: EVAL-002: Automated Behaviour Tests
  - **Test Harness & Definitions**: Created 4 real behaviour tests that probe Wyshbone UI:
    - greeting-basic: Verifies welcome message and goal inquiry on new user conversation
    - personalisation-domain: Checks domain acknowledgment and business-specific adaptation
    - lead-search-basic: Validates lead search triggering and result delivery
    - monitor-setup-basic: Confirms monitoring setup acknowledgment and recurring behavior
  - **Database Schema**: Added behaviour_tests and behaviour_test_runs tables
    - Tests table: id, name, description, category, isActive
    - Runs table: id, createdAt, testId, status (pass/fail/error), details, rawLog, buildTag, durationMs
  - **Test Execution Engine** (src/evaluator/behaviourTests.ts):
    - Calls Wyshbone UI /api/chat endpoint with scenario-specific prompts
    - Uses regex heuristics to determine pass/fail (greeting patterns, domain mentions, search indicators, monitoring language)
    - Gracefully handles errors when UI unavailable (503) and reports as "error" status
    - Measures execution time for performance tracking
  - **Storage Layer** (src/evaluator/behaviourTestStore.ts):
    - ensureBehaviourTestsSeeded() auto-populates test definitions on startup
    - recordBehaviourTestRun() persists results with build tags
    - getTestsWithLatestRuns() returns tests paired with most recent execution
    - Handles text-to-boolean conversion for isActive, text-to-number for durationMs
  - **API Endpoints**:
    - GET /tower/behaviour-tests - Returns all tests with latest run status
    - POST /tower/behaviour-tests/run - Executes tests (supports runAll, testId, buildTag)
  - **Dashboard UI** (BehaviourTestsCard):
    - Integrated into /dashboard between Tower Status and Recent Runs
    - Shows all 4 tests with status badges (green=pass, red=fail, orange=error, gray=never run)
    - "Run all" button executes full test suite with loading state
    - Individual "Run" buttons per test for targeted execution
    - Real-time updates with timestamps ("Just now", "2m ago", etc.)
    - Displays test details, category, duration, and failure diagnostics
  - **End-to-End Testing**: Playwright verification confirms full workflow from UI to API to database
  - Architecture notes:
    - Tests auto-seed on server startup
    - Results persist with optional build tags for tracking across deployments
    - Simple heuristic-based pass/fail (no GPT calls for smoke tests)
    - Ready for EVAL-003 multi-run pattern analysis

- 2025-11-15: EVAL-001B: Interactive Debugging Console with Runs Tracking
  - **React Dashboard Integration**: Added Vite middleware to serve React SPA at `/dashboard`
    - Hybrid architecture: Server-rendered routes (`/status`) + React app (`/dashboard`, `/`)
    - Seamless hot module replacement during development
  - **Runs Database & API**: 
    - Created `runs` table with auto-generated IDs and source tracking
    - POST /tower/runs auto-generates run IDs, defaults source to "MANUAL"
    - GET /tower/runs returns recent runs (limit parameter supported)
    - GET /tower/runs/:id retrieves specific run details
  - **Interactive Console UI**:
    - StatusDashboard page with two-column layout (responsive grid)
    - Left: Tower Status metrics + Recent Runs table with real-time data
    - Right: Sticky Evaluator Console displaying active investigations
    - RecentRunsTable component with "Investigate" buttons for each run
  - **Investigation Workflow**:
    - Click "Investigate" → Dialog opens for notes entry
    - Submit → Creates investigation linked to run (enriched context)
    - EvaluatorConsole polls investigation endpoint every 2s
    - Displays run context, user notes, diagnosis, and patch suggestions
    - Polling auto-stops when diagnosis complete (max 30 attempts / 60s)
  - **EvaluatorContext**: React context for sharing active investigation across components
  - **End-to-End Testing**: Playwright tests confirm full workflow from UI to API
  - **User Experience**: Chat-like bubble interface for investigation results, copy-to-clipboard for patches
  - Architecture notes:
    - Page title set to "Wyshbone Tower - Evaluator Console"
    - All database operations flow through shared persistence layer (runStore, storeInvestigation)
    - Error handling for missing API keys (graceful degradation)
    - Ready for integration with actual run logging system

- 2025-11-15: EVAL-001: Minimal Evaluator v0 implementation
  - Created complete evaluator foundation layer in `src/evaluator/` directory
  - Implemented investigation system with PostgreSQL database storage:
    - TypeScript types for investigations, triggers, and diagnostic results
    - Database schema with investigations table (id, trigger, run logs, snapshots, diagnosis, patches)
    - Storage layer with CRUD operations (create, get all, get by ID)
  - Integrated OpenAI GPT-4o-mini for automated diagnosis:
    - Evaluator analyzes run logs and code snapshots to identify root causes
    - Provides actionable diagnosis and patch suggestions
    - Configurable via EVAL_MODEL_ID environment variable
  - Optional code snapshot fetching from UI/Supervisor apps (fails gracefully if unavailable)
  - Three API endpoints for investigation management:
    - `POST /tower/evaluator/investigate` - Create and execute new investigation
    - `GET /tower/evaluator/investigations` - List all investigations
    - `GET /tower/evaluator/investigations/:id` - Get specific investigation details
  - Interactive investigations dashboard at `/investigations`:
    - Empty state with "Create Investigation" button
    - Investigation cards showing trigger, notes, timestamps, and diagnosis previews
    - Manual investigation creation with optional run ID and notes
    - Link from main dashboard to investigations page
  - Architecture notes:
    - Modified server startup to use `tsx` for TypeScript module support
    - Configured Neon WebSocket for serverless database connections
    - Placeholder run log fetcher (ready for integration with actual logging system)
  - Ready for EVAL-002 (automated behaviour detection) and EVAL-003 (multi-run analysis)

- 2025-11-15: Evaluator Roadmap implementation
  - Added 5 evaluator tasks (EVAL-001 to EVAL-005) to config/tasks.json
  - Created Evaluator Roadmap section in dashboard with dedicated purple/violet styling
  - Extended task modal to show evaluator-specific fields:
    - Summary field for quick overview
    - "Replit Build Pre-Prompt (Base)" section with copyable base prompt template
    - Status update buttons (Not Started, In Progress, Done)
  - Added getEvaluatorTasks() method to TasksManager
  - Added /evaluator-tasks.json API endpoint
  - Updated status badge rendering to support "not_started" status
  - Tasks shown in dependency order: EVAL-001 → EVAL-002 → EVAL-003 → EVAL-004 → EVAL-005
  - All evaluator tasks are Layer 7 (Evaluator Roadmap group)
  - Base prompt template format follows convention from requirements

- 2025-11-14: Convention-based task acceptance
  - Implemented automatic task completion detection using naming convention
  - UI-XXX tasks check for `uiXXX_done` flag (e.g., UI-001 → ui001_done)
  - SUP-XXX tasks check for `supXXX_done` flag (e.g., SUP-001 → sup001_done)
  - Zero configuration required - works automatically for all UI/SUP tasks
  - Falls back to `acceptanceKey` for custom flags, then `fileContains` for file-based checking
  - Properly persists to tasks.json during polling to maintain state across restarts
  - UI-001 and UI-002 now auto-detected as complete via ui001_done and ui002_done flags

- 2025-11-13: Phase 2 visual indicators
  - Added bold "Phase 2" badges to all tasks with layer >= 5
  - Badges appear on layer headings (e.g., "Layer 5 – Self-Improvement & Experimentation **Phase 2**")
  - Badges also appear on individual task rows in the badge row
  - Purple/violet styling (#7c3aed background #ede9fe) makes Phase 2 tasks stand out
  - Applied across all task rendering locations: Critical Path, Source Status, and Poller sections
  - 9 tasks currently marked as Phase 2 (all in Layer 5)

- 2025-11-13: Interactive task modal with copy-to-clipboard
  - Made all task rows clickable in Critical Path section and per-app task lists
  - Added modal popup showing full task details (ID, title, description, app, layer, status, complexity)
  - Implemented copy-to-clipboard button for `replitPrompt` field
  - Modal closes via X button, clicking overlay, or ESC key
  - Embedded all 51 tasks as JSON in HTML for instant modal population
  - Added hover effects on task rows for better UX
  - Shows helpful message for placeholder tasks without implementation prompts

- 2025-11-13: Roadmap enrichment implementation
  - Expanded roadmap from 6 to 51 tasks across 6 architectural layers
  - Enriched tasks with layer, group, complexity (S/M/L/XL), dependencies, criticalPath
  - Enhanced lib/tasks.js with layer grouping, critical path extraction, and topological sorting
  - Added dependency validation that fails fast on missing dependencies
  - Implemented critical path dashboard section showing all 27 critical tasks (scrollable)
  - Added /critical-path.json API endpoint returning 27 critical tasks in dependency order
  - Added scripts/enrich-tasks.js with warning about not re-running after manual edits

- 2025-11-13: Initial implementation
  - Created poller with configurable sources
  - Built server-side rendered dashboard
  - Implemented delta tracking
  - Added JSON API and file proxy endpoints
