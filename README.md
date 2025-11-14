# Wyshbone Status Dashboard

A Node/Express polling dashboard that monitors multiple Wyshbone apps' `/export/status.json` endpoints and displays live status metrics with delta tracking.

## Features

- 🔄 **Automated Polling**: Polls configured Wyshbone apps every 2 minutes
- 📊 **Live Dashboard**: Server-side rendered HTML with 60-second auto-refresh
- 📈 **Delta Tracking**: Shows changes in cleverness index, LOC, TODO, and FIXME counts
- 🔍 **Recent Events**: Displays notable changes across all sources
- 🔌 **JSON API**: Machine-readable endpoint for integrations
- 📁 **File Proxy**: Fetch individual files from Wyshbone apps
- 💾 **In-Memory Storage**: Maintains last 50 snapshots per source

## Quick Start

### 1. Configure Your Sources

Edit `config/sources.json` with your Wyshbone app URLs and export keys:

```json
[
  {
    "name": "Wyshbone UI",
    "baseUrl": "https://your-wyshbone-ui.repl.co",
    "exportKey": "your-export-key-here"
  },
  {
    "name": "Wyshbone Supervisor",
    "baseUrl": "https://your-wyshbone-supervisor.repl.co",
    "exportKey": "your-export-key-here"
  }
]
```

### 2. Start the Server

```bash
node server.js
```

The server will start on port 3000 (or the PORT environment variable if set).

### 3. Access the Dashboard

- **Live Dashboard**: http://localhost:3000/status
- **JSON API**: http://localhost:3000/status.json
- **File Proxy**: http://localhost:3000/proxy/file?src=SOURCE_NAME&path=FILE_PATH

## API Endpoints

### GET /status

Returns a server-rendered HTML dashboard showing:
- Recent changes ticker (last 10 events)
- Status cards for each configured source
- Metrics: Cleverness Index, LOC, TODO count, FIXME count
- Deltas since previous snapshot
- Auto-refreshes every 60 seconds

### GET /status.json

Returns JSON aggregate state:

```json
{
  "sources": [
    {
      "name": "Wyshbone UI",
      "baseUrl": "https://...",
      "status": "OK" | "ERROR" | "NO_DATA",
      "latest": {
        "fetchedAt": "2024-01-01T12:00:00.000Z",
        "success": true,
        "data": { /* Wyshbone status.json response */ }
      },
      "previous": { /* Previous snapshot */ },
      "deltas": {
        "cleverness": 5,
        "loc": 120,
        "todo": 1,
        "fixme": -2
      }
    }
  ],
  "recentEvents": [
    {
      "sourceName": "Wyshbone UI",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "deltas": { /* delta values */ }
    }
  ]
}
```

### GET /proxy/file

Proxies file requests to configured Wyshbone apps with authentication.

**Query Parameters:**
- `src`: Source name (must match a name in config/sources.json)
- `path`: File path to fetch

**Example:**
```
GET /proxy/file?src=Wyshbone%20UI&path=src/components/Button.tsx
```

**Response:**
```json
{
  "path": "src/components/Button.tsx",
  "content": "/* file content */"
}
```

## Task Acceptance Checking

The dashboard automatically monitors task completion through three mechanisms (checked in priority order):

### 1. Convention-Based Flags (Recommended)

The simplest method - **zero configuration required**. Tasks are automatically checked based on naming convention:

- **UI tasks**: `UI-001` → checks for `ui001_done: true`
- **UI tasks**: `UI-002` → checks for `ui002_done: true`
- **SUP tasks**: `SUP-001` → checks for `sup001_done: true`
- **SUP tasks**: `SUP-050` → checks for `sup050_done: true`

When the Wyshbone app exports these flags in its `/export/status.json`:

```json
{
  "ui001_done": true,
  "ui002_done": true,
  "ui003_done": false
}
```

Control Tower automatically marks UI-001 and UI-002 as **DONE**. No additional configuration needed!

### 2. Custom Status Flags (acceptanceKey)

For non-standard flag names, tasks can specify an `acceptanceKey`:

```json
{
  "id": "UI-001",
  "acceptanceKey": "ui001_goalCaptureEnabled",
  ...
}
```

When the Wyshbone app exports this custom field as `true`, the task is marked complete.

### 3. File Contents Check (fileContains)

Fallback method when status flags aren't available:

```json
{
  "id": "UI-002",
  "acceptanceCheck": {
    "type": "fileContains",
    "file": "server/routes.ts",
    "mustContain": "clarifyingQuestions"
  }
}
```

The dashboard fetches the specified file and checks if it contains the required string.

**Check Priority**: Convention flags → acceptanceKey → fileContains (most efficient first)

## Configuration

### Polling Interval

Default: 120000ms (2 minutes)

To change, edit `POLL_INTERVAL_MS` in `lib/poller.js`

### History Retention

Default: 50 snapshots per source

To change, edit `MAX_SNAPSHOTS` in `lib/poller.js`

### Auto-Refresh Rate

Default: 60 seconds

To change, edit the `<meta http-equiv="refresh" content="60">` tag in `server.js`

## Error Handling

- Network failures are logged and stored as error snapshots
- Invalid configuration prevents polling from starting
- HTTP errors (403, 404, etc.) are captured and displayed
- 10-second timeout on all fetch requests
- Graceful shutdown on SIGINT/SIGTERM

## Architecture

### lib/poller.js

- Loads configuration from `config/sources.json`
- Maintains in-memory history (Map of source name → snapshot array)
- Polls all sources in parallel every interval
- Computes deltas between latest and previous snapshots
- Provides `getState()` for aggregated view

### server.js

- Express server with 3 routes
- Server-side HTML rendering using template literals
- Formats relative timestamps and delta values
- Proxies authenticated file requests
- Handles graceful shutdown

## Development

The application uses ESM modules (`"type": "module"` in package.json).

Dependencies:
- express (server framework)
- Built-in fetch (Node.js 18+)

No build step required - pure JavaScript.

## License

MIT
