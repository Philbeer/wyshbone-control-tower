import express from 'express';
import { poller } from './lib/poller.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Utility functions for rendering
function formatRelativeTime(isoString) {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function formatDelta(value) {
  if (value === undefined || value === null) return '';
  if (value === 0) return '<span style="color: #666;">±0</span>';
  if (value > 0) return `<span style="color: #22c55e;">+${value}</span>`;
  return `<span style="color: #ef4444;">${value}</span>`;
}

function renderStatusBadge(status) {
  if (status === 'OK') {
    return '<span style="display: inline-block; padding: 4px 12px; background: #22c55e; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">OK</span>';
  } else if (status === 'ERROR') {
    return '<span style="display: inline-block; padding: 4px 12px; background: #ef4444; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">ERROR</span>';
  }
  return '<span style="display: inline-block; padding: 4px 12px; background: #9ca3af; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">NO DATA</span>';
}

function renderDashboard(state) {
  const recentEventsHtml = state.recentEvents.length > 0
    ? state.recentEvents.map(event => {
        const parts = [];
        if (event.deltas.cleverness !== 0) {
          parts.push(`cleverness ${formatDelta(event.deltas.cleverness)}`);
        }
        if (event.deltas.loc !== 0) {
          parts.push(`LOC ${formatDelta(event.deltas.loc)}`);
        }
        if (event.deltas.todo !== 0) {
          parts.push(`TODO ${formatDelta(event.deltas.todo)}`);
        }
        if (event.deltas.fixme !== 0) {
          parts.push(`FIXME ${formatDelta(event.deltas.fixme)}`);
        }
        return `
          <div style="padding: 8px; background: #f9fafb; border-left: 3px solid #3b82f6; margin-bottom: 8px; border-radius: 4px;">
            <span style="color: #6b7280; font-size: 12px;">[${formatRelativeTime(event.timestamp)}]</span>
            <strong>${event.sourceName}:</strong> ${parts.join(', ')}
          </div>
        `;
      }).join('')
    : '<p style="color: #9ca3af; font-style: italic;">No recent changes detected</p>';

  const sourceCardsHtml = state.sources.map(source => {
    const latest = source.latest;
    const deltas = source.deltas || {};
    
    let metricsHtml = '';
    if (source.status === 'OK' && latest.data) {
      const data = latest.data;
      metricsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;">
          <div>
            <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Cleverness Index</div>
            <div style="font-family: monospace; font-size: 24px; font-weight: bold; margin-top: 4px;">
              ${data.quality?.clevernessIndex ?? 'N/A'} ${formatDelta(deltas.cleverness)}
            </div>
          </div>
          <div>
            <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Lines of Code</div>
            <div style="font-family: monospace; font-size: 24px; font-weight: bold; margin-top: 4px;">
              ${data.totals?.loc?.toLocaleString() ?? 'N/A'} ${formatDelta(deltas.loc)}
            </div>
          </div>
          <div>
            <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">TODO Count</div>
            <div style="font-family: monospace; font-size: 24px; font-weight: bold; margin-top: 4px;">
              ${data.totals?.todo ?? 'N/A'} ${formatDelta(deltas.todo)}
            </div>
          </div>
          <div>
            <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">FIXME Count</div>
            <div style="font-family: monospace; font-size: 24px; font-weight: bold; margin-top: 4px;">
              ${data.totals?.fixme ?? 'N/A'} ${formatDelta(deltas.fixme)}
            </div>
          </div>
        </div>
      `;
    } else if (source.status === 'ERROR') {
      metricsHtml = `
        <div style="margin-top: 16px; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; color: #991b1b;">
          <strong>Error:</strong> ${latest?.error || 'Unknown error'}
        </div>
      `;
    } else {
      metricsHtml = `
        <div style="margin-top: 16px; padding: 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; color: #6b7280;">
          No data available yet
        </div>
      `;
    }

    return `
      <div style="border: 2px solid ${source.status === 'OK' ? '#22c55e' : source.status === 'ERROR' ? '#ef4444' : '#d1d5db'}; border-radius: 8px; padding: 24px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 600;">${source.name}</h2>
          ${renderStatusBadge(source.status)}
        </div>
        <div style="color: #9ca3af; font-size: 12px; margin-top: 8px;">
          ${latest ? `Last updated: ${formatRelativeTime(latest.fetchedAt)}` : 'Never updated'}
        </div>
        ${metricsHtml}
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="60">
      <title>Wyshbone Status Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: #f3f4f6;
          padding: 32px 16px;
          color: #111827;
        }
        .container {
          max-width: 1280px;
          margin: 0 auto;
        }
        h1 {
          font-size: 36px;
          font-weight: 700;
          margin-bottom: 8px;
          text-align: center;
        }
        .subtitle {
          text-align: center;
          color: #6b7280;
          margin-bottom: 32px;
          font-size: 14px;
        }
        .section {
          margin-bottom: 32px;
        }
        .section-title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 16px;
          color: #374151;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 24px;
        }
        @media (max-width: 768px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Wyshbone Status Dashboard</h1>
        <div class="subtitle">Auto-refreshing every 60 seconds</div>
        
        <div class="section">
          <h2 class="section-title">Recent Changes (Last 10 Events)</h2>
          ${recentEventsHtml}
        </div>

        <div class="section">
          <h2 class="section-title">Source Status</h2>
          <div class="grid">
            ${sourceCardsHtml}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Routes
app.get('/status.json', (req, res) => {
  const state = poller.getState();
  res.json(state);
});

app.get('/status', (req, res) => {
  const state = poller.getState();
  const html = renderDashboard(state);
  res.send(html);
});

app.get('/proxy/file', async (req, res) => {
  const { src, path } = req.query;

  if (!src || !path) {
    return res.status(400).json({ 
      error: 'Missing required parameters: src and path' 
    });
  }

  const source = poller.getSourceByName(src);
  if (!source) {
    return res.status(404).json({ 
      error: `Source '${src}' not found in configuration` 
    });
  }

  const url = `${source.baseUrl}/export/file?path=${encodeURIComponent(path)}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'X-EXPORT-KEY': source.exportKey
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status}: ${response.statusText}`
      });
    }

    const data = await response.json();
    res.json({ path, content: data.content || data });
  } catch (error) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/status');
});

// Start server
async function start() {
  console.log('\n=== Wyshbone Status Dashboard ===\n');
  
  await poller.startPolling();
  
  app.listen(PORT, () => {
    console.log(`\n✓ Server running on http://localhost:${PORT}`);
    console.log(`\nQuick Start:`);
    console.log(`  1. Edit config/sources.json with your Wyshbone app URLs and export keys`);
    console.log(`  2. Access the dashboard at: http://localhost:${PORT}/status`);
    console.log(`  3. Machine-readable JSON feed: http://localhost:${PORT}/status.json`);
    console.log(`  4. Proxy file requests: http://localhost:${PORT}/proxy/file?src=<source-name>&path=<file-path>`);
    console.log(`\nConfiguration:`);
    console.log(`  - Polling interval: ${120000 / 1000} seconds`);
    console.log(`  - Auto-refresh: 60 seconds`);
    console.log(`  - History retained: 50 snapshots per source\n`);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  poller.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down gracefully...');
  poller.stopPolling();
  process.exit(0);
});

start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
