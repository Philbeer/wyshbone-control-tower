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
