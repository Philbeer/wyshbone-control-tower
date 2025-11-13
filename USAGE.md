# Wyshbone Status Dashboard - Usage Guide

## Installation & Setup

### Step 1: Configure Your Wyshbone Apps

Open `config/sources.json` and replace the placeholders with your actual Wyshbone app information:

```json
[
  {
    "name": "Wyshbone UI",
    "baseUrl": "https://wyshbone-ui-yourname.repl.co",
    "exportKey": "your-actual-export-key-here"
  },
  {
    "name": "Wyshbone Supervisor",
    "baseUrl": "https://wyshbone-supervisor-yourname.repl.co",
    "exportKey": "your-actual-export-key-here"
  }
]
```

**Important Notes:**
- `name`: A friendly display name for the source
- `baseUrl`: The base URL of your Wyshbone app (without trailing slash)
- `exportKey`: The authentication key for accessing the `/export/*` endpoints

You can add as many sources as you need. Simply add more objects to the array.

### Step 2: Start the Server

Run the following command:

```bash
node server.js
```

You should see output like:

```
=== Wyshbone Status Dashboard ===

✓ Loaded 2 source(s) from config/sources.json
[2024-01-01T12:00:00.000Z] Polling 2 source(s)...
  ✓ Wyshbone UI: OK
  ✓ Wyshbone Supervisor: OK
✓ Polling started (interval: 120s)

✓ Server running on http://localhost:3000

Quick Start:
  1. Edit config/sources.json with your Wyshbone app URLs and export keys
  2. Access the dashboard at: http://localhost:3000/status
  3. Machine-readable JSON feed: http://localhost:3000/status.json
  ...
```

### Step 3: Access the Dashboard

Open your browser and navigate to:

```
http://localhost:3000/status
```

Or if running on Replit, the URL will be shown in the webview.

## Understanding the Dashboard

### Status Cards

Each configured source gets its own status card showing:

- **Status Badge**: OK (green), ERROR (red), or NO DATA (gray)
- **Last Updated**: Relative time since last successful fetch
- **Cleverness Index**: Current value with delta since previous snapshot
- **Lines of Code**: Total LOC with delta
- **TODO Count**: Number of TODO comments with delta
- **FIXME Count**: Number of FIXME comments with delta

### Deltas

Deltas show changes between the current and previous snapshot:
- **Green (+)**: Value increased
- **Red (-)**: Value decreased
- **Gray (±0)**: No change

### Recent Changes Ticker

The top section shows the last 10 notable events across all sources. An event is considered "notable" if any metric changed.

Example:
```
[2m ago] Wyshbone UI: cleverness +5, LOC +120, TODO +1
```

## API Usage

### Machine-Readable JSON Feed

For programmatic access or AI integration:

```bash
curl http://localhost:3000/status.json
```

Response structure:
```json
{
  "sources": [
    {
      "name": "Wyshbone UI",
      "status": "OK",
      "latest": {
        "fetchedAt": "2024-01-01T12:00:00Z",
        "success": true,
        "data": {
          "quality": { "clevernessIndex": 85 },
          "totals": { "loc": 12450, "todo": 23, "fixme": 5 }
        }
      },
      "deltas": {
        "cleverness": 5,
        "loc": 120,
        "todo": 1,
        "fixme": -2
      }
    }
  ],
  "recentEvents": [...]
}
```

### File Proxy

Fetch individual files from your Wyshbone apps:

```bash
curl "http://localhost:3000/proxy/file?src=Wyshbone%20UI&path=src/components/Button.tsx"
```

Response:
```json
{
  "path": "src/components/Button.tsx",
  "content": "import React from 'react';\n\nexport function Button() {...}"
}
```

## Customization

### Change Polling Interval

Edit `lib/poller.js` and modify:

```javascript
const POLL_INTERVAL_MS = 120000; // 2 minutes
```

To poll every 5 minutes:
```javascript
const POLL_INTERVAL_MS = 300000; // 5 minutes
```

### Change History Retention

Edit `lib/poller.js` and modify:

```javascript
const MAX_SNAPSHOTS = 50;
```

To keep 100 snapshots:
```javascript
const MAX_SNAPSHOTS = 100;
```

### Change Auto-Refresh Rate

Edit `server.js` and find the line:

```html
<meta http-equiv="refresh" content="60">
```

To refresh every 30 seconds:
```html
<meta http-equiv="refresh" content="30">
```

### Change Port

Set the `PORT` environment variable:

```bash
PORT=8080 node server.js
```

## Troubleshooting

### "Error loading config/sources.json"

**Problem**: The configuration file is missing or contains invalid JSON.

**Solution**:
1. Ensure `config/sources.json` exists
2. Validate the JSON syntax (no trailing commas, proper quotes)
3. Make sure the file is readable

### "fetch failed" Errors

**Problem**: Cannot reach the Wyshbone app endpoints.

**Solution**:
1. Verify the `baseUrl` is correct and accessible
2. Check that the `/export/status.json` endpoint exists on the Wyshbone app
3. Ensure the `exportKey` is valid
4. Check network connectivity

### HTTP 403 Forbidden

**Problem**: Authentication is failing.

**Solution**:
1. Verify the `exportKey` matches what's configured on the Wyshbone app
2. Ensure the export endpoints are enabled on the Wyshbone app

### No Data Showing

**Problem**: Dashboard shows "NO DATA" for all sources.

**Solution**:
1. Wait for the first polling cycle to complete (up to 2 minutes)
2. Check the console output for error messages
3. Manually test the endpoint: `curl -H "X-EXPORT-KEY: your-key" https://your-app/export/status.json`

## Stopping the Server

Press `Ctrl+C` in the terminal. The server will gracefully shutdown:

```
Shutting down gracefully...
✓ Polling stopped
```

## Integration with Other Tools

### Use with AI Agents

The `/status.json` endpoint is designed for machine consumption. You can integrate it with AI agents or monitoring tools:

```javascript
// Example: Fetch status from JavaScript
const response = await fetch('http://localhost:3000/status.json');
const { sources } = await response.json();

sources.forEach(source => {
  console.log(`${source.name}: ${source.status}`);
  if (source.deltas?.cleverness > 0) {
    console.log(`  Cleverness improved by ${source.deltas.cleverness}!`);
  }
});
```

### Monitoring Alerts

You could build a monitoring system that:
1. Polls `/status.json` periodically
2. Checks for error states or declining metrics
3. Sends notifications when thresholds are breached

Example alert logic:
```javascript
if (source.status === 'ERROR') {
  sendAlert(`${source.name} is down!`);
} else if (source.deltas?.cleverness < -10) {
  sendAlert(`${source.name} cleverness dropped significantly!`);
}
```

## Best Practices

1. **Keep Export Keys Secure**: Never commit `config/sources.json` with real keys to public repositories
2. **Monitor Resource Usage**: In-memory storage grows with history; consider lower `MAX_SNAPSHOTS` for many sources
3. **Set Appropriate Intervals**: Balance freshness with server load; 2 minutes is a good default
4. **Use HTTPS in Production**: Ensure your Wyshbone apps use HTTPS for secure key transmission
5. **Regular Cleanup**: Old snapshots automatically rotate out, but monitor memory if running 24/7

## Support

For issues or questions:
1. Check the console output for error messages
2. Verify configuration in `config/sources.json`
3. Test endpoints manually with curl
4. Review the README.md for architecture details
