# Getting Started with Wyshbone Status Dashboard

## 🎯 Quick Start (Standalone Mode)

This application is a **standalone Node.js server** that can run independently of the fullstack template.

### Prerequisites

- Node.js 18+ (built-in fetch support)
- Express (already in dependencies)

### Run the Dashboard

```bash
node server.js
```

That's it! The server will:
1. Load configuration from `config/sources.json`
2. Start polling your Wyshbone apps every 2 minutes
3. Serve the dashboard on `http://localhost:3000` (or `PORT` env var)

### First Time Setup

1. **Edit Configuration**: Open `config/sources.json` and replace placeholders:

```json
[
  {
    "name": "Wyshbone UI",
    "baseUrl": "https://your-wyshbone-ui.repl.co",
    "exportKey": "your-actual-export-key"
  }
]
```

2. **Start Server**:
```bash
node server.js
```

3. **Access Dashboard**:
   - Open: `http://localhost:3000/status`
   - Or use the Replit webview

## 📁 Project Structure

This project contains TWO separate applications:

### 1. **Wyshbone Status Dashboard** (Standalone) ⭐

```
├── server.js              # Main Express server (standalone)
├── lib/
│   └── poller.js         # Polling logic
├── config/
│   └── sources.json      # Configuration
├── README.md             # Architecture docs
├── USAGE.md              # Detailed usage guide
└── INSTRUCTIONS.txt      # Quick reference
```

**Purpose**: Monitor multiple Wyshbone apps with a live status dashboard

**How to Run**: `node server.js`

**Endpoints**:
- `/status` - HTML dashboard
- `/status.json` - JSON API
- `/proxy/file` - File proxy

### 2. **Fullstack Template** (Optional)

```
├── server/
│   ├── index.ts          # Fullstack server
│   ├── routes.ts
│   └── storage.ts
├── client/
│   └── src/              # React frontend
└── shared/
    └── schema.ts
```

**Purpose**: Template for building full-stack applications (not related to dashboard)

**How to Run**: `npm run dev` (already configured in Replit workflow)

## 🎨 Dashboard Features

### Live Monitoring
- Auto-polls every 2 minutes
- Tracks 50 snapshots per source
- Displays real-time metrics

### Metrics Tracked
- **Cleverness Index**: Code quality score
- **Lines of Code**: Total LOC
- **TODO Count**: Pending tasks
- **FIXME Count**: Issues to fix

### Delta Display
- Shows changes since last check
- Green (+) for increases
- Red (-) for decreases
- Gray (±0) for no change

### Status Indicators
- 🟢 **OK**: Successfully fetched
- 🔴 **ERROR**: Failed to fetch
- ⚪ **NO DATA**: Not yet polled

## 🔧 Configuration

### Polling Interval

Edit `lib/poller.js`:
```javascript
const POLL_INTERVAL_MS = 120000; // 2 minutes (default)
```

### History Size

Edit `lib/poller.js`:
```javascript
const MAX_SNAPSHOTS = 50; // Keep last 50 snapshots (default)
```

### Auto-Refresh Rate

Edit `server.js` (search for "meta http-equiv"):
```html
<meta http-equiv="refresh" content="60"> <!-- 60 seconds -->
```

### Server Port

Use environment variable:
```bash
PORT=8080 node server.js
```

## 📊 API Reference

### GET /status

HTML dashboard with:
- Status cards for each source
- Recent changes ticker
- Auto-refresh every 60 seconds

### GET /status.json

JSON response:
```json
{
  "sources": [{
    "name": "Wyshbone UI",
    "status": "OK",
    "latest": {
      "fetchedAt": "2024-01-01T12:00:00Z",
      "data": { ... }
    },
    "deltas": {
      "cleverness": 5,
      "loc": 120,
      "todo": -1
    }
  }],
  "recentEvents": [...]
}
```

### GET /proxy/file

Proxy file requests with authentication:
```
/proxy/file?src=Wyshbone%20UI&path=src/App.tsx
```

## 🐛 Troubleshooting

### Config Not Found
```
✗ Error loading config/sources.json
```
**Fix**: Ensure `config/sources.json` exists with valid JSON

### Fetch Failed
```
✗ Wyshbone UI: fetch failed
```
**Fix**: 
- Verify `baseUrl` is correct and accessible
- Check `exportKey` is valid
- Ensure Wyshbone app is running

### HTTP 403 Forbidden
```
✗ Wyshbone UI: HTTP 403: Forbidden
```
**Fix**: Update `exportKey` in `config/sources.json`

### No Data Showing

**Fix**: Wait up to 2 minutes for first poll cycle to complete

## 💡 Tips

1. **Keep Keys Secure**: Don't commit real export keys to public repos
2. **Monitor Memory**: In-memory storage grows; adjust `MAX_SNAPSHOTS` if needed
3. **Use HTTPS**: Ensure Wyshbone apps use HTTPS for secure key transmission
4. **Test Endpoints**: Use curl to verify endpoints before configuring

## 🚀 Production Deployment

For production use:

1. Set secure export keys in `config/sources.json`
2. Configure appropriate polling interval
3. Set `PORT` environment variable
4. Run with process manager (pm2, systemd, etc.)

```bash
# Example with pm2
pm2 start server.js --name wyshbone-dashboard
```

## 📚 Additional Resources

- **README.md** - Complete architecture and API documentation
- **USAGE.md** - Comprehensive usage scenarios
- **INSTRUCTIONS.txt** - Quick reference card
- **replit.md** - Project overview

## 🆘 Support

Check console output for detailed error messages. Most issues relate to:
- Invalid configuration syntax
- Incorrect URLs or keys
- Network connectivity
- Wyshbone app availability

---

**Ready to monitor your Wyshbone apps?**

1. Edit `config/sources.json`
2. Run `node server.js`
3. Open `http://localhost:3000/status`

That's all! The dashboard will begin monitoring immediately. 🎉
