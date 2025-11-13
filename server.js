import express from 'express';
import { poller } from './lib/poller.js';
import { tasksManager } from './lib/tasks.js';

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

function renderTaskStatusBadge(status) {
  const colors = {
    planned: '#3b82f6',
    in_progress: '#f59e0b',
    done: '#22c55e',
    blocked: '#ef4444'
  };
  const labels = {
    planned: 'PLANNED',
    in_progress: 'IN PROGRESS',
    done: 'DONE',
    blocked: 'BLOCKED'
  };
  const color = colors[status] || '#9ca3af';
  const label = labels[status] || status.toUpperCase();
  return `<span style="display: inline-block; padding: 2px 8px; background: ${color}; color: white; border-radius: 3px; font-size: 10px; font-weight: 600;">${label}</span>`;
}

function renderTaskPriorityBadge(priority) {
  const colors = {
    low: '#6b7280',
    medium: '#3b82f6',
    high: '#ef4444'
  };
  const color = colors[priority] || '#9ca3af';
  return `<span style="display: inline-block; padding: 2px 6px; background: ${color}; color: white; border-radius: 3px; font-size: 9px; font-weight: 600;">${priority.toUpperCase()}</span>`;
}

function renderComplexityBadge(complexity) {
  const colors = {
    S: '#22c55e',
    M: '#3b82f6',
    L: '#f59e0b',
    XL: '#ef4444'
  };
  const color = colors[complexity] || '#9ca3af';
  return `<span style="display: inline-block; padding: 2px 6px; background: ${color}; color: white; border-radius: 3px; font-size: 9px; font-weight: 600;">${complexity}</span>`;
}

function renderCriticalPathBadge() {
  return '<span style="font-size: 12px;" title="Critical Path">⭐</span>';
}

function renderPhase2Badge() {
  return '<strong style="font-size: 10px; color: #7c3aed; background: #ede9fe; padding: 2px 6px; border-radius: 3px; margin-left: 6px;">Phase 2</strong>';
}

function renderTasksListByLayer(tasks) {
  if (!tasks || tasks.length === 0) {
    return '<p style="color: #9ca3af; font-style: italic; font-size: 14px;">No tasks</p>';
  }

  const tasksByLayer = {};
  tasks.forEach(task => {
    const layer = task.layer || 1;
    if (!tasksByLayer[layer]) {
      tasksByLayer[layer] = [];
    }
    tasksByLayer[layer].push(task);
  });

  const layers = Object.keys(tasksByLayer).sort((a, b) => parseInt(a) - parseInt(b));

  return layers.map(layer => {
    const layerTasks = tasksByLayer[layer];
    const groupName = layerTasks[0]?.group || `Layer ${layer}`;
    const isPhase2 = parseInt(layer) >= 5;
    
    const tasksHtml = layerTasks.map(task => {
      const hasAcceptance = task.acceptanceCheck && task.acceptanceCheck.type === 'fileContains';
      const complexity = task.complexity || 'M';
      const isCritical = task.criticalPath || false;
      const taskIsPhase2 = (task.layer || 1) >= 5;
      
      return `
        <div class="task-row" data-task-id="${task.id}" style="padding: 8px 12px; margin-bottom: 8px; background: #f9fafb; border-left: 3px solid ${task.status === 'done' ? '#22c55e' : task.status === 'in_progress' ? '#f59e0b' : task.status === 'blocked' ? '#ef4444' : '#3b82f6'}; border-radius: 4px; cursor: pointer; transition: background 0.2s;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
            ${renderComplexityBadge(complexity)}
            ${isCritical ? renderCriticalPathBadge() : ''}
            ${renderTaskStatusBadge(task.status)}
            <span style="font-size: 11px; color: #9ca3af; font-family: monospace;">${task.id}</span>
            ${hasAcceptance ? '<span style="font-size: 10px; background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 3px; font-weight: 600;">AUTO</span>' : ''}
            ${taskIsPhase2 ? renderPhase2Badge() : ''}
          </div>
          <div style="font-weight: 600; font-size: 13px; color: #1f2937;">${task.title}</div>
        </div>
      `;
    }).join('');

    return `
      <div style="margin-bottom: 16px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
          ${groupName}${isPhase2 ? renderPhase2Badge() : ''}
        </h4>
        ${tasksHtml}
      </div>
    `;
  }).join('');
}

function renderCriticalPathSection() {
  const criticalTasks = tasksManager.getCriticalPathTasks();
  
  if (!criticalTasks || criticalTasks.length === 0) {
    return '';
  }

  const tasksHtml = criticalTasks.map(task => {
    const appLabel = { ui: 'UI', supervisor: 'SUP', poller: 'POL', meta: 'META' }[task.app] || task.app;
    const complexity = task.complexity || 'M';
    const isPhase2 = (task.layer || 1) >= 5;
    
    return `
      <div class="task-row" data-task-id="${task.id}" style="padding: 10px 14px; margin-bottom: 8px; background: white; border: 1px solid #e5e7eb; border-radius: 4px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: background 0.2s;">
        <span style="font-size: 11px; color: #9ca3af; font-weight: 600; min-width: 45px;">Layer ${task.layer}${isPhase2 ? renderPhase2Badge() : ''}</span>
        ${renderComplexityBadge(complexity)}
        ${renderTaskStatusBadge(task.status)}
        <span style="font-size: 11px; color: #9ca3af; font-family: monospace; min-width: 70px;">${task.id}</span>
        <span style="font-size: 12px; font-weight: 500; color: #374151; flex: 1;">${task.title}</span>
        <span style="font-size: 11px; color: #9ca3af; background: #f3f4f6; padding: 2px 8px; border-radius: 3px;">${appLabel}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="section">
      <h2 class="section-title">⭐ Critical Path to Agentic v1</h2>
      <div style="border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; background: #fffbeb; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="margin: 0 0 16px 0; color: #78350f; font-size: 13px;">
          ${criticalTasks.length} critical tasks required for Agentic v1. All tasks shown in dependency order.
        </p>
        <div style="max-height: 600px; overflow-y: auto; padding-right: 8px;">
          ${tasksHtml}
        </div>
        <p style="margin: 16px 0 0 0; color: #92400e; font-size: 11px; font-style: italic;">
          💡 Scroll to view all ${criticalTasks.length} tasks. Tasks are ordered by dependencies (prerequisites first).
        </p>
      </div>
    </div>
  `;
}

function renderUsageMeter() {
  const BILLING_STEP_USD = 50; // each extra charge is about $50 (~£45)
  
  // Read from environment variable
  const rawUsage = process.env.REPLIT_ADDITIONAL_USAGE_USD || '0';
  const currentUsageUsd = Number(rawUsage) || 0;
  
  // Work out the next $50 boundary (50, 100, 150, ...)
  const nextBillAt = currentUsageUsd <= 0
    ? BILLING_STEP_USD
    : Math.ceil(currentUsageUsd / BILLING_STEP_USD) * BILLING_STEP_USD;
  
  const remainingUsd = nextBillAt - currentUsageUsd;
  
  // Progress within the current $50 block
  const progressWithinStep = currentUsageUsd <= 0
    ? 0
    : (currentUsageUsd % BILLING_STEP_USD) / BILLING_STEP_USD;
  
  const percent = Math.min(100, Math.max(0, progressWithinStep * 100));
  const barColor = percent > 80 ? '#ef4444' : '#22c55e';
  
  return `
    <div style="border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1f2937;">💰 Replit Usage Meter</h3>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Current Usage</div>
          <div style="font-family: monospace; font-size: 22px; font-weight: bold; color: #1f2937;">$${currentUsageUsd.toFixed(2)}</div>
        </div>
        <div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Next Bill At</div>
          <div style="font-family: monospace; font-size: 22px; font-weight: bold; color: #1f2937;">$${nextBillAt.toFixed(2)}</div>
          <div style="color: #9ca3af; font-size: 11px; margin-top: 2px;">≈ £${(nextBillAt * 0.9).toFixed(2)}</div>
        </div>
        <div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Remaining</div>
          <div style="font-family: monospace; font-size: 22px; font-weight: bold; color: ${percent > 80 ? '#ef4444' : '#22c55e'};">$${remainingUsd.toFixed(2)}</div>
        </div>
      </div>
      
      <div style="margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 12px; color: #6b7280;">Progress to next $50 charge</span>
          <span style="font-size: 12px; font-weight: 600; color: #1f2937;">${percent.toFixed(1)}%</span>
        </div>
        <div style="height: 12px; border-radius: 999px; background: #e5e7eb; overflow: hidden;">
          <div style="width: ${percent}%; height: 100%; background: ${barColor}; transition: width 0.3s ease;"></div>
        </div>
      </div>
      
      <div style="margin-top: 12px; padding: 8px 12px; background: #f9fafb; border-radius: 4px; border-left: 3px solid #3b82f6;">
        <small style="color: #6b7280; font-size: 11px;">
          💡 Update <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 3px; font-family: monospace;">REPLIT_ADDITIONAL_USAGE_USD</code> 
          in Replit Secrets when you check <a href="https://replit.com/account/usage" target="_blank" style="color: #3b82f6;">your usage page</a>
        </small>
      </div>
    </div>
  `;
}

function renderDashboard(state, tasksState) {
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

    // Get tasks for this source
    let appKey = null;
    if (source.name === 'Wyshbone UI') {
      appKey = 'ui';
    } else if (source.name === 'Wyshbone Supervisor') {
      appKey = 'supervisor';
    }
    
    const tasks = appKey ? tasksState[appKey] : [];
    const tasksHtml = tasks.length > 0 ? `
      <div style="margin-top: 24px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #374151;">📋 Tasks</h3>
        ${renderTasksListByLayer(tasks)}
      </div>
    ` : '';

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
        ${tasksHtml}
      </div>
    `;
  }).join('');

  // Add Poller tasks section
  const pollerTasks = tasksState.poller || [];
  const pollerTasksHtml = pollerTasks.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Wyshbone Poller Tasks</h2>
      <div style="border: 2px solid #3b82f6; border-radius: 8px; padding: 24px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #374151;">📋 Poller Tasks</h3>
        ${renderTasksListByLayer(pollerTasks)}
      </div>
    </div>
  ` : '';
  
  // Add Critical Path section
  const criticalPathHtml = renderCriticalPathSection();

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
        .task-row:hover {
          background: #e5e7eb !important;
        }
        .modal-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal-overlay.active {
          display: flex;
        }
        .modal-content {
          background: white;
          border-radius: 8px;
          max-width: 800px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .modal-header {
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .modal-body {
          padding: 24px;
        }
        .modal-close {
          background: #f3f4f6;
          border: none;
          border-radius: 4px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 18px;
          color: #6b7280;
          transition: background 0.2s;
        }
        .modal-close:hover {
          background: #e5e7eb;
        }
        .task-detail-row {
          margin-bottom: 16px;
        }
        .task-detail-label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .task-detail-value {
          font-size: 14px;
          color: #1f2937;
        }
        .prompt-container {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 12px;
          max-height: 300px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 12px;
          white-space: pre-wrap;
          word-wrap: break-word;
          margin-bottom: 12px;
        }
        .copy-btn {
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-weight: 600;
          cursor: pointer;
          font-size: 13px;
          transition: background 0.2s;
        }
        .copy-btn:hover {
          background: #2563eb;
        }
        .copy-btn.success {
          background: #22c55e;
        }
        .copy-feedback {
          display: inline-block;
          margin-left: 12px;
          color: #22c55e;
          font-size: 13px;
          font-weight: 600;
        }
        .no-prompt-msg {
          color: #9ca3af;
          font-style: italic;
          padding: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Wyshbone Status Dashboard</h1>
        <div class="subtitle">Auto-refreshing every 60 seconds</div>
        
        ${renderUsageMeter()}
        
        ${criticalPathHtml}
        
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

        ${pollerTasksHtml}
      </div>

      <!-- Task Detail Modal -->
      <div id="taskModal" class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h2 id="modalTaskTitle" style="font-size: 20px; font-weight: 600; margin-bottom: 8px;"></h2>
              <div id="modalTaskId" style="font-size: 12px; color: #9ca3af; font-family: monospace;"></div>
            </div>
            <button class="modal-close" onclick="closeTaskModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="task-detail-row">
              <div class="task-detail-label">App</div>
              <div id="modalTaskApp" class="task-detail-value"></div>
            </div>
            <div class="task-detail-row">
              <div class="task-detail-label">Layer & Group</div>
              <div id="modalTaskLayer" class="task-detail-value"></div>
            </div>
            <div class="task-detail-row">
              <div class="task-detail-label">Status</div>
              <div id="modalTaskStatus" class="task-detail-value"></div>
            </div>
            <div class="task-detail-row">
              <div class="task-detail-label">Complexity</div>
              <div id="modalTaskComplexity" class="task-detail-value"></div>
            </div>
            <div class="task-detail-row">
              <div class="task-detail-label">Description</div>
              <div id="modalTaskDescription" class="task-detail-value"></div>
            </div>
            <div class="task-detail-row">
              <div class="task-detail-label">Implementation Prompt</div>
              <div id="modalTaskPromptContainer"></div>
              <div>
                <button id="copyPromptBtn" class="copy-btn" onclick="copyPromptToClipboard()">📋 Copy prompt</button>
                <span id="copyFeedback" class="copy-feedback" style="display: none;"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Embed all tasks data
        const TASKS_DATA = ${JSON.stringify(tasksManager.getAllTasks())};

        // Create task lookup map
        const tasksMap = new Map();
        TASKS_DATA.forEach(task => tasksMap.set(task.id, task));

        // Handle task row clicks
        document.querySelectorAll('.task-row').forEach(row => {
          row.addEventListener('click', function(e) {
            e.preventDefault();
            const taskId = this.getAttribute('data-task-id');
            openTaskModal(taskId);
          });
        });

        function openTaskModal(taskId) {
          const task = tasksMap.get(taskId);
          if (!task) return;

          const appLabels = { ui: 'Wyshbone UI', supervisor: 'Wyshbone Supervisor', poller: 'Wyshbone Poller', meta: 'Meta-Agent' };
          
          document.getElementById('modalTaskTitle').textContent = task.title;
          document.getElementById('modalTaskId').textContent = task.id;
          document.getElementById('modalTaskApp').textContent = appLabels[task.app] || task.app;
          document.getElementById('modalTaskLayer').textContent = \`Layer \${task.layer} – \${task.group || 'Unknown'}\`;
          document.getElementById('modalTaskStatus').textContent = (task.status || 'planned').toUpperCase();
          document.getElementById('modalTaskComplexity').textContent = task.complexity || 'M';
          document.getElementById('modalTaskDescription').textContent = task.description || 'No description available.';

          const promptContainer = document.getElementById('modalTaskPromptContainer');
          const copyBtn = document.getElementById('copyPromptBtn');
          
          if (task.replitPrompt && task.replitPrompt.trim()) {
            promptContainer.innerHTML = \`<div class="prompt-container">\${escapeHtml(task.replitPrompt)}</div>\`;
            copyBtn.style.display = 'inline-block';
          } else {
            promptContainer.innerHTML = '<div class="no-prompt-msg">No implementation prompt yet – this is a roadmap placeholder.</div>';
            copyBtn.style.display = 'none';
          }

          document.getElementById('copyFeedback').style.display = 'none';
          document.getElementById('taskModal').classList.add('active');
        }

        function closeTaskModal() {
          document.getElementById('taskModal').classList.remove('active');
        }

        function copyPromptToClipboard() {
          const taskId = document.getElementById('modalTaskId').textContent;
          const task = tasksMap.get(taskId);
          
          if (!task || !task.replitPrompt || !task.replitPrompt.trim()) {
            showCopyFeedback('No prompt available!', false);
            return;
          }

          navigator.clipboard.writeText(task.replitPrompt).then(() => {
            showCopyFeedback('✓ Copied!', true);
          }).catch(err => {
            showCopyFeedback('Failed to copy', false);
            console.error('Copy failed:', err);
          });
        }

        function showCopyFeedback(message, success) {
          const feedback = document.getElementById('copyFeedback');
          const btn = document.getElementById('copyPromptBtn');
          
          feedback.textContent = message;
          feedback.style.display = 'inline-block';
          feedback.style.color = success ? '#22c55e' : '#ef4444';
          
          if (success) {
            btn.classList.add('success');
          }

          setTimeout(() => {
            feedback.style.display = 'none';
            btn.classList.remove('success');
          }, 2000);
        }

        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        // Close modal when clicking overlay
        document.getElementById('taskModal').addEventListener('click', function(e) {
          if (e.target === this) {
            closeTaskModal();
          }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            closeTaskModal();
          }
        });
      </script>
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
  const tasksState = poller.getTasksState();
  const html = renderDashboard(state, tasksState);
  res.send(html);
});

// Tasks API routes
app.get('/tasks.json', (req, res) => {
  const tasksState = poller.getTasksState();
  res.json(tasksState);
});

app.get('/critical-path.json', (req, res) => {
  const criticalTasks = tasksManager.getCriticalPathTasks();
  res.json({
    total: criticalTasks.length,
    tasks: criticalTasks
  });
});

app.post('/tasks/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['planned', 'in_progress', 'done', 'blocked'].includes(status)) {
    return res.status(400).json({
      error: 'Invalid status. Must be one of: planned, in_progress, done, blocked'
    });
  }

  const task = tasksManager.getTaskById(id);
  if (!task) {
    return res.status(404).json({
      error: `Task not found: ${id}`
    });
  }

  const success = await tasksManager.updateTaskStatus(id, status);
  if (success) {
    res.json({
      success: true,
      task: tasksManager.getTaskById(id)
    });
  } else {
    res.status(500).json({
      error: 'Failed to update task status'
    });
  }
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
  
  // Load tasks
  await tasksManager.loadTasks();
  
  // Start polling
  await poller.startPolling();
  
  app.listen(PORT, () => {
    console.log(`\n✓ Server running on http://localhost:${PORT}`);
    console.log(`\nQuick Start:`);
    console.log(`  1. Edit config/sources.json with your Wyshbone app URLs and export keys`);
    console.log(`  2. Access the dashboard at: http://localhost:${PORT}/status`);
    console.log(`  3. Machine-readable JSON feed: http://localhost:${PORT}/status.json`);
    console.log(`  4. Tasks API: http://localhost:${PORT}/tasks.json`);
    console.log(`  5. Proxy file requests: http://localhost:${PORT}/proxy/file?src=<source-name>&path=<file-path>`);
    console.log(`\nConfiguration:`);
    console.log(`  - Polling interval: ${120000 / 1000} seconds`);
    console.log(`  - Auto-refresh: 60 seconds`);
    console.log(`  - History retained: 50 snapshots per source`);
    console.log(`  - Tasks loaded: ${tasksManager.getAllTasks().length} task(s)\n`);
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
