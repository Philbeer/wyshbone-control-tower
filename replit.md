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

- 2025-11-13: Automated task acceptance via status JSON flags
  - Added `acceptanceKey` mechanism for lightweight status-based acceptance checking
  - Tasks can now be marked complete when Wyshbone apps expose boolean flags in their status JSON
  - UI-001 now uses `acceptanceKey: "ui001_goalCaptureEnabled"` to auto-detect implementation
  - When Wyshbone UI exports `ui001_goalCaptureEnabled: true`, Control Tower automatically marks UI-001 as DONE
  - Acceptance checks prioritize `acceptanceKey` (instant) over `fileContains` (requires file fetch)
  - No file scanning or repo cloning needed - purely JSON-based lightweight checks

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
