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

- 2025-11-13: Initial implementation
  - Created poller with configurable sources
  - Built server-side rendered dashboard
  - Implemented delta tracking
  - Added JSON API and file proxy endpoints
