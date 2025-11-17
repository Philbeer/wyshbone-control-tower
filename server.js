import express from 'express';
import { createServer } from 'http';
import { poller } from './lib/poller.js';
import { tasksManager } from './lib/tasks.js';

const app = express();
const server = createServer(app);
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
    blocked: '#ef4444',
    not_started: '#9ca3af'
  };
  const labels = {
    planned: 'PLANNED',
    in_progress: 'IN PROGRESS',
    done: 'DONE',
    blocked: 'BLOCKED',
    not_started: 'NOT STARTED'
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

function renderEvaluatorRoadmapSection() {
  const evaluatorTasks = tasksManager.getEvaluatorTasks();
  
  if (!evaluatorTasks || evaluatorTasks.length === 0) {
    return '';
  }

  const tasksHtml = evaluatorTasks.map(task => {
    const complexity = task.complexity || 'M';
    const summary = task.summary || task.description;
    
    return `
      <div class="task-row evaluator-task" data-task-id="${task.id}" style="padding: 12px 16px; margin-bottom: 10px; background: white; border: 1px solid #e5e7eb; border-radius: 4px; cursor: pointer; transition: all 0.2s;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          ${renderComplexityBadge(complexity)}
          ${renderTaskStatusBadge(task.status)}
          <span style="font-size: 11px; color: #9ca3af; font-family: monospace; font-weight: 600;">${task.id}</span>
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 6px;">${task.title}</div>
        <div style="font-size: 12px; color: #6b7280; line-height: 1.5;">${summary}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="section">
      <h2 class="section-title">🔍 Evaluator Roadmap</h2>
      <div style="border: 2px solid #7c3aed; border-radius: 8px; padding: 20px; background: #faf5ff; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <p style="margin: 0 0 16px 0; color: #5b21b6; font-size: 13px;">
          ${evaluatorTasks.length} evaluator tasks for building automated testing and quality assurance. Click any task to view details and copy the build prompt.
        </p>
        <div style="max-height: 600px; overflow-y: auto; padding-right: 8px;">
          ${tasksHtml}
        </div>
        <p style="margin: 16px 0 0 0; color: #6b21a8; font-size: 11px; font-style: italic;">
          💡 Each task includes a base Replit build prompt you can copy and customize.
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
  
  // Add Evaluator Roadmap section
  const evaluatorRoadmapHtml = renderEvaluatorRoadmapSection();

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
      <!-- Tower Navigation Tabs -->
      <div style="border-bottom: 1px solid #e5e7eb; background: white;">
        <div class="container">
          <nav style="display: flex; gap: 24px; padding: 12px 0;">
            <a href="/status" style="text-decoration: none; font-size: 14px; font-weight: 500; color: #111827; border-bottom: 2px solid #3b82f6; padding-bottom: 12px;">
              Status & Plan
            </a>
            <a href="/dashboard" style="text-decoration: none; font-size: 14px; font-weight: 500; color: #6b7280; padding-bottom: 12px; transition: color 0.2s;">
              Evaluator Console
            </a>
          </nav>
        </div>
      </div>
      
      <div class="container">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h1>Wyshbone Status Dashboard</h1>
          <a href="/investigations" style="padding: 0.5rem 1rem; background: #7c3aed; color: white; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.875rem;">🔍 Investigations</a>
        </div>
        <div class="subtitle">Auto-refreshing every 60 seconds</div>
        
        ${renderUsageMeter()}
        
        ${criticalPathHtml}
        
        ${evaluatorRoadmapHtml}
        
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
            <button class="modal-close" onclick="closeTaskModal()" aria-label="Close" data-testid="button-close-modal">&times;</button>
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
            <div id="evaluatorStatusRow" class="task-detail-row" style="display: none;">
              <div class="task-detail-label">Update Status</div>
              <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button class="status-btn" data-status="not_started" style="padding: 6px 12px; border: 1px solid #e5e7eb; background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">Not Started</button>
                <button class="status-btn" data-status="in_progress" style="padding: 6px 12px; border: 1px solid #e5e7eb; background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">In Progress</button>
                <button class="status-btn" data-status="done" style="padding: 6px 12px; border: 1px solid #e5e7eb; background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">Done</button>
              </div>
              <div id="statusUpdateFeedback" style="margin-top: 8px; font-size: 12px; display: none;"></div>
            </div>
            <div class="task-detail-row">
              <div class="task-detail-label">Complexity</div>
              <div id="modalTaskComplexity" class="task-detail-value"></div>
            </div>
            <div id="evaluatorSummaryRow" class="task-detail-row" style="display: none;">
              <div class="task-detail-label">Summary</div>
              <div id="modalTaskSummary" class="task-detail-value"></div>
            </div>
            <div class="task-detail-row">
              <div class="task-detail-label">Description</div>
              <div id="modalTaskDescription" class="task-detail-value"></div>
            </div>
            <div id="evaluatorPromptRow" class="task-detail-row" style="display: none;">
              <div class="task-detail-label">Replit Build Pre-Prompt (Base)</div>
              <div id="modalTaskEvaluatorPromptContainer"></div>
              <div>
                <button id="copyEvaluatorPromptBtn" class="copy-btn" onclick="copyEvaluatorPromptToClipboard()">📋 Copy base prompt</button>
                <span id="copyEvaluatorFeedback" class="copy-feedback" style="display: none;"></span>
              </div>
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

          const appLabels = { 
            ui: 'Wyshbone UI', 
            supervisor: 'Wyshbone Supervisor', 
            poller: 'Wyshbone Poller', 
            meta: 'Meta-Agent',
            evaluator: 'Evaluator'
          };
          
          const isEvaluatorTask = task.app === 'evaluator';
          
          document.getElementById('modalTaskTitle').textContent = task.title;
          document.getElementById('modalTaskId').textContent = task.id;
          document.getElementById('modalTaskApp').textContent = appLabels[task.app] || task.app;
          document.getElementById('modalTaskLayer').textContent = \`Layer \${task.layer} – \${task.group || 'Unknown'}\`;
          document.getElementById('modalTaskStatus').textContent = (task.status || 'planned').toUpperCase().replace('_', ' ');
          document.getElementById('modalTaskComplexity').textContent = task.complexity || 'M';
          document.getElementById('modalTaskDescription').textContent = task.description || 'No description available.';

          // Show/hide evaluator-specific fields
          if (isEvaluatorTask) {
            // Show summary
            const summaryRow = document.getElementById('evaluatorSummaryRow');
            summaryRow.style.display = 'block';
            document.getElementById('modalTaskSummary').textContent = task.summary || '';
            
            // Show status update buttons
            const statusRow = document.getElementById('evaluatorStatusRow');
            statusRow.style.display = 'block';
            
            // Show evaluator prompt section
            const evaluatorPromptRow = document.getElementById('evaluatorPromptRow');
            evaluatorPromptRow.style.display = 'block';
            const evaluatorPromptContainer = document.getElementById('modalTaskEvaluatorPromptContainer');
            const basePrompt = \`You are my coding assistant for the Wyshbone Tower repl.
Implement \${task.id}: \${task.title}.
\${task.description}
Build on all previous EVAL tasks.
Produce actual code, not instructions.\`;
            evaluatorPromptContainer.innerHTML = \`<div class="prompt-container">\${escapeHtml(basePrompt)}</div>\`;
          } else {
            document.getElementById('evaluatorSummaryRow').style.display = 'none';
            document.getElementById('evaluatorStatusRow').style.display = 'none';
            document.getElementById('evaluatorPromptRow').style.display = 'none';
          }

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
          document.getElementById('copyEvaluatorFeedback').style.display = 'none';
          document.getElementById('statusUpdateFeedback').style.display = 'none';
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

        function copyEvaluatorPromptToClipboard() {
          const taskId = document.getElementById('modalTaskId').textContent;
          const task = tasksMap.get(taskId);
          
          if (!task || task.app !== 'evaluator') {
            showCopyEvaluatorFeedback('Not an evaluator task!', false);
            return;
          }

          const basePrompt = \`You are my coding assistant for the Wyshbone Tower repl.
Implement \${task.id}: \${task.title}.
\${task.description}
Build on all previous EVAL tasks.
Produce actual code, not instructions.\`;

          navigator.clipboard.writeText(basePrompt).then(() => {
            showCopyEvaluatorFeedback('✓ Copied!', true);
          }).catch(err => {
            showCopyEvaluatorFeedback('Failed to copy', false);
            console.error('Copy failed:', err);
          });
        }

        function showCopyEvaluatorFeedback(message, success) {
          const feedback = document.getElementById('copyEvaluatorFeedback');
          const btn = document.getElementById('copyEvaluatorPromptBtn');
          
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

        async function updateTaskStatus(newStatus) {
          const taskId = document.getElementById('modalTaskId').textContent;
          const feedbackEl = document.getElementById('statusUpdateFeedback');
          
          try {
            feedbackEl.textContent = 'Updating...';
            feedbackEl.style.color = '#6b7280';
            feedbackEl.style.display = 'block';

            const response = await fetch(\`/tasks/\${taskId}/status\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) {
              throw new Error('Failed to update status');
            }

            const result = await response.json();
            
            // Update the task in the local map
            const task = tasksMap.get(taskId);
            if (task) {
              task.status = newStatus;
            }
            
            // Update the display
            document.getElementById('modalTaskStatus').textContent = newStatus.toUpperCase().replace('_', ' ');
            
            feedbackEl.textContent = '✓ Status updated! Refresh page to see changes.';
            feedbackEl.style.color = '#22c55e';
            
            setTimeout(() => {
              feedbackEl.style.display = 'none';
            }, 3000);
          } catch (error) {
            console.error('Error updating status:', error);
            feedbackEl.textContent = '✗ Failed to update status';
            feedbackEl.style.color = '#ef4444';
          }
        }

        // Add status button event listeners
        document.querySelectorAll('.status-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            const newStatus = this.getAttribute('data-status');
            updateTaskStatus(newStatus);
          });
        });

        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        // Close modal when clicking overlay
        const modalOverlay = document.getElementById('taskModal');
        if (modalOverlay) {
          modalOverlay.addEventListener('click', function(e) {
            if (e.target === this) {
              closeTaskModal();
            }
          });
        }

        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' || e.key === 'Esc') {
            const modal = document.getElementById('taskModal');
            if (modal && modal.classList.contains('active')) {
              closeTaskModal();
            }
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

app.get('/evaluator-tasks.json', (req, res) => {
  const evaluatorTasks = tasksManager.getEvaluatorTasks();
  res.json({
    total: evaluatorTasks.length,
    tasks: evaluatorTasks
  });
});

app.get('/investigations', async (req, res) => {
  try {
    const { getAllInvestigations } = await import('./src/evaluator/storeInvestigation.ts');
    const investigations = await getAllInvestigations();
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tower Investigations - Evaluator Diagnostics</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; color: #111827; padding: 2rem; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #7c3aed; }
    .subtitle { color: #6b7280; margin-bottom: 2rem; }
    .header-actions { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .btn { padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #7c3aed; color: white; }
    .btn-primary:hover { background: #6d28d9; }
    .empty-state { background: white; border-radius: 12px; padding: 4rem; text-align: center; }
    .empty-state h2 { font-size: 1.5rem; color: #374151; margin-bottom: 0.5rem; }
    .empty-state p { color: #6b7280; margin-bottom: 2rem; }
    .investigations-grid { display: grid; gap: 1.5rem; }
    .investigation-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .investigation-card:hover { box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .investigation-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem; }
    .investigation-id { font-family: monospace; font-size: 0.875rem; color: #6b7280; }
    .trigger-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
    .trigger-manual { background: #dbeafe; color: #1e40af; }
    .trigger-timeout { background: #fef3c7; color: #92400e; }
    .trigger-tool_error { background: #fee2e2; color: #991b1b; }
    .trigger-behaviour_flag { background: #fce7f3; color: #831843; }
    .investigation-meta { font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem; }
    .investigation-notes { background: #f9fafb; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.875rem; }
    .diagnosis-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
    .diagnosis-label { font-weight: 600; color: #374151; margin-bottom: 0.5rem; }
    .diagnosis-content { background: #faf5ff; padding: 1rem; border-radius: 8px; font-size: 0.875rem; line-height: 1.6; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
    .no-diagnosis { color: #9ca3af; font-style: italic; }
    .view-details-btn { padding: 0.5rem 1rem; background: #7c3aed; color: white; border-radius: 6px; text-decoration: none; font-size: 0.875rem; font-weight: 500; }
    .view-details-btn:hover { background: #6d28d9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Tower Investigations</h1>
    <p class="subtitle">Evaluator diagnostic reports and patch suggestions</p>
    
    <div class="header-actions">
      <button class="btn btn-primary" onclick="createInvestigation()">+ New Investigation</button>
      <a href="/status" style="padding: 0.75rem 1.5rem; background: #6b7280; color: white; border-radius: 8px; text-decoration: none; font-weight: 600;">← Back to Dashboard</a>
    </div>
    
    ${investigations.length === 0 ? `
      <div class="empty-state">
        <h2>No Investigations Yet</h2>
        <p>Create your first investigation to diagnose issues with Tower, UI, or Supervisor runs.</p>
        <button class="btn btn-primary" onclick="createInvestigation()">Create Investigation</button>
      </div>
    ` : `
      <div class="investigations-grid">
        ${investigations.map(inv => `
          <div class="investigation-card">
            <div class="investigation-header">
              <div>
                <div class="investigation-id">${inv.id}</div>
                ${inv.runId ? `<div style="font-size: 0.875rem; color: #374151; margin-top: 0.25rem;">Run: ${inv.runId}</div>` : ''}
              </div>
              <span class="trigger-badge trigger-${inv.trigger}">${inv.trigger.toUpperCase()}</span>
            </div>
            
            <div class="investigation-meta">
              Created: ${new Date(inv.createdAt).toLocaleString()}
            </div>
            
            ${inv.notes ? `<div class="investigation-notes">${inv.notes}</div>` : ''}
            
            <div class="diagnosis-section">
              <div class="diagnosis-label">Diagnosis:</div>
              ${inv.diagnosis ? `
                <div class="diagnosis-content">${inv.diagnosis.substring(0, 500)}${inv.diagnosis.length > 500 ? '...' : ''}</div>
              ` : `
                <div class="no-diagnosis">No diagnosis available</div>
              `}
            </div>
            
            <div style="margin-top: 1rem; text-align: right;">
              <a href="/tower/evaluator/investigations/${inv.id}" class="view-details-btn">View Full Details</a>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  </div>
  
  <script>
    async function createInvestigation() {
      const runId = prompt('Enter Run ID (optional):');
      const notes = prompt('Enter investigation notes (optional):');
      
      try {
        const response = await fetch('/tower/evaluator/investigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger: 'manual',
            runId: runId || undefined,
            notes: notes || undefined
          })
        });
        
        if (response.ok) {
          alert('Investigation created successfully!');
          location.reload();
        } else {
          const error = await response.json();
          alert('Failed to create investigation: ' + error.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  </script>
</body>
</html>
    `.trim();
    
    res.send(html);
  } catch (err) {
    console.error('Error rendering investigations page', err);
    res.status(500).send('Failed to load investigations: ' + err.message);
  }
});

app.post('/tasks/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['planned', 'in_progress', 'done', 'blocked', 'not_started'].includes(status)) {
    return res.status(400).json({
      error: 'Invalid status. Must be one of: planned, in_progress, done, blocked, not_started'
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

// Evaluator API modules - loaded at startup
let executeInvestigation;
let getAllInvestigations;
let getInvestigationById;
let createInvestigationForRun;

// Run tracking modules - loaded at startup
let listRecentRuns;
let listLiveUserRuns;  // EVAL-008
let getRunById;
let createRun;
let createLiveUserRun;  // EVAL-008

// EVAL-009: Automatic conversation quality analysis
let createAutoConversationQualityInvestigation;
let getAllAutoConversationQualityInvestigations;

// Behaviour test modules - loaded at startup
let runBehaviourTest;
let runAllBehaviourTests;
let getTestsWithLatestRuns;
let recordBehaviourTestRun;
let ensureBehaviourTestsSeeded;
let autoDetectAndTriggerInvestigation;
let ensureBehaviourInvestigationForRun;  // EVAL-007
let ensureLiveUserInvestigationForRun;  // EVAL-008
let getAllBehaviourTestDefinitions;  // EVAL-007

// Runs API routes
app.get('/tower/runs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const runs = await listRecentRuns(limit);
    res.status(200).json(runs);
  } catch (err) {
    console.error('Error listing runs', err);
    res.status(500).json({ error: 'Failed to list runs: ' + err.message });
  }
});

// EVAL-008: Live user runs endpoint (must come before /:id route)
app.get('/tower/runs/live', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const runs = await listLiveUserRuns(limit);
    res.status(200).json(runs);
  } catch (err) {
    console.error('Error listing live user runs', err);
    res.status(500).json({ error: 'Failed to list live user runs: ' + err.message });
  }
});

app.get('/tower/runs/:id', async (req, res) => {
  try {
    const run = await getRunById(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.status(200).json(run);
  } catch (err) {
    console.error('Error fetching run', err);
    res.status(500).json({ error: 'Failed to fetch run: ' + err.message });
  }
});

app.post('/tower/runs', async (req, res) => {
  try {
    const { source, userIdentifier, goalSummary, status, meta } = req.body ?? {};
    
    // Generate ID if not provided
    const id = req.body?.id || `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // Default source to "MANUAL" if not provided
    const runSource = source || "MANUAL";
    
    await createRun({ id, source: runSource, userIdentifier, goalSummary, status, meta });
    const createdRun = await getRunById(id);
    res.status(201).json(createdRun);
  } catch (err) {
    console.error('Error creating run', err);
    res.status(500).json({ error: 'Failed to create run: ' + err.message });
  }
});

// Evaluator API routes
app.post('/tower/evaluator/investigate', async (req, res) => {
  try {
    const { trigger = "manual", runId, notes } = req.body ?? {};
    
    // If runId is provided, use the enhanced investigation creator
    if (runId) {
      const investigation = await createInvestigationForRun({ runId, trigger, notes });
      res.status(200).json(investigation);
    } else {
      const investigation = await executeInvestigation(trigger, runId, notes);
      res.status(200).json(investigation);
    }
  } catch (err) {
    console.error('Error executing investigation', err);
    res.status(500).json({ error: 'Failed to execute investigation: ' + err.message });
  }
});

app.get('/tower/evaluator/investigations', async (req, res) => {
  try {
    const investigations = await getAllInvestigations();
    res.status(200).json(investigations);
  } catch (err) {
    console.error('Error fetching investigations', err);
    res.status(500).json({ error: 'Failed to fetch investigations: ' + err.message });
  }
});

app.get('/tower/evaluator/investigations/:id', async (req, res) => {
  try {
    const investigation = await getInvestigationById(req.params.id);
    if (!investigation) {
      res.status(404).json({ error: 'Investigation not found' });
      return;
    }
    res.status(200).json(investigation);
  } catch (err) {
    console.error('Error fetching investigation', err);
    res.status(500).json({ error: 'Failed to fetch investigation: ' + err.message });
  }
});

// Behaviour Tests API routes
app.get('/tower/behaviour-tests', async (req, res) => {
  try {
    const testsWithRuns = await getTestsWithLatestRuns();
    res.status(200).json(testsWithRuns);
  } catch (err) {
    console.error('Error fetching behaviour tests', err);
    res.status(500).json({ error: 'Failed to fetch behaviour tests: ' + err.message });
  }
});

app.post('/tower/behaviour-tests/run', async (req, res) => {
  try {
    const { testId, buildTag, runAll } = req.body ?? {};
    
    let results;
    if (runAll || !testId) {
      // Run all active tests
      results = await runAllBehaviourTests({ buildTag });
    } else {
      // Run single test
      const result = await runBehaviourTest(testId, { buildTag });
      results = [result];
    }
    
    // Persist all results and trigger auto-detection
    for (const result of results) {
      const savedRun = await recordBehaviourTestRun({ ...result, buildTag });
      
      // EVAL-003: Auto-detect failures/timeouts/regressions and trigger investigations
      if (autoDetectAndTriggerInvestigation) {
        try {
          await autoDetectAndTriggerInvestigation(result, savedRun.id);
        } catch (autoDetectErr) {
          console.error('[AutoDetect] Error during auto-detection:', autoDetectErr.message);
          // Don't fail the whole request if auto-detection fails
        }
      }
    }
    
    res.status(200).json({ results });
  } catch (err) {
    console.error('Error running behaviour tests', err);
    res.status(500).json({ error: 'Failed to run behaviour tests: ' + err.message });
  }
});

// EVAL-007: Manual investigation trigger for behaviour tests
app.post('/tower/behaviour-tests/:testId/investigate', async (req, res) => {
  try {
    const { testId } = req.params;
    
    // Validate test exists
    if (!getAllBehaviourTestDefinitions) {
      return res.status(500).json({ error: 'Behaviour test system not initialized' });
    }
    
    const testDefs = getAllBehaviourTestDefinitions();
    const testDef = testDefs.find(t => t.id === testId);
    
    if (!testDef) {
      return res.status(404).json({ error: `Unknown test ID: ${testId}` });
    }
    
    // Get most recent run for this test (if any)
    const testsWithRuns = await getTestsWithLatestRuns();
    const testWithRun = testsWithRuns.find(t => t.test.id === testId);
    const latestRun = testWithRun?.latestRun;
    
    // Determine trigger reason
    let triggerReason = 'Manual investigation requested from behaviour tests dashboard';
    if (latestRun) {
      triggerReason += `. Last run status: ${latestRun.status.toUpperCase()}`;
    } else {
      triggerReason += '. No previous runs found';
    }
    
    // Create or reuse investigation
    const investigation = await ensureBehaviourInvestigationForRun({
      testId,
      testName: testDef.name,
      runId: latestRun?.id,
      triggerReason,
      seriousness: 'info',
    });
    
    res.status(200).json(investigation);
  } catch (err) {
    console.error('Error creating manual investigation for behaviour test', err);
    res.status(500).json({ 
      error: 'Failed to create investigation: ' + err.message 
    });
  }
});

// EVAL-008: Live User Run Logging & Investigation Bridge

// Log a new live user run from Wyshbone UI
app.post('/tower/runs/log', async (req, res) => {
  try {
    const payload = req.body;
    
    // Enhanced validation
    if (!payload.source || payload.source !== 'live_user') {
      return res.status(400).json({ 
        error: 'Invalid payload: source must be "live_user"' 
      });
    }
    
    if (!payload.request?.inputText || !payload.response?.outputText) {
      return res.status(400).json({ 
        error: 'Invalid payload: request.inputText and response.outputText are required' 
      });
    }
    
    if (!['success', 'error', 'timeout', 'fail'].includes(payload.status)) {
      return res.status(400).json({ 
        error: 'Invalid status: must be one of success, error, timeout, or fail' 
      });
    }
    
    if (typeof payload.durationMs !== 'number' || !Number.isFinite(payload.durationMs) || payload.durationMs <= 0) {
      return res.status(400).json({ 
        error: 'Invalid durationMs: must be a positive finite number greater than zero' 
      });
    }
    
    const result = await createLiveUserRun(payload);
    
    // EVAL-008: Auto-detection for live runs (conservative triggers only)
    if (ensureLiveUserInvestigationForRun && payload.status === 'error') {
      try {
        console.log(`[EVAL-008] Auto-investigating error run ${result.id}`);
        await ensureLiveUserInvestigationForRun({
          runId: result.id,
          userId: payload.userId,
          sessionId: payload.sessionId,
          inputText: payload.request.inputText,
          triggerReason: 'Auto-detected error from live user run',
          seriousness: 'error',
        });
      } catch (autoDetectErr) {
        console.error('[EVAL-008 AutoDetect] Error during auto-detection:', autoDetectErr.message);
        // Don't fail the request if auto-detection fails
      }
    }

    // EVAL-009: Automatic conversation quality analysis for all live user runs
    if (createAutoConversationQualityInvestigation && payload.meta?.messages && Array.isArray(payload.meta.messages)) {
      try {
        console.log(`[EVAL-009] Auto-analyzing conversation quality for run ${result.id}`);
        await createAutoConversationQualityInvestigation({
          runId: result.id,
          sessionId: payload.sessionId,
          userId: payload.userId,
          conversationTranscript: payload.meta.messages,
        });
      } catch (autoAnalysisErr) {
        console.error('[EVAL-009 AutoAnalysis] Error during conversation analysis:', autoAnalysisErr.message);
        // Don't fail the request if auto-analysis fails
      }
    }
    
    res.status(200).json(result);
  } catch (err) {
    console.error('Error logging live user run', err);
    res.status(500).json({ error: 'Failed to log run: ' + err.message });
  }
});

// Manual investigation trigger for live runs
app.post('/tower/runs/:runId/investigate', async (req, res) => {
  try {
    const { runId } = req.params;
    
    // Fetch the run
    const run = await getRunById(runId);
    if (!run) {
      return res.status(404).json({ error: `Run not found: ${runId}` });
    }
    
    // Only allow investigation of live_user runs
    if (run.source !== 'live_user') {
      return res.status(400).json({ 
        error: 'Only live_user runs can be investigated via this endpoint' 
      });
    }
    
    // Extract run metadata
    const inputText = run.meta?.requestText || run.goalSummary || 'Unknown input';
    const userId = run.userIdentifier;
    const sessionId = run.meta?.sessionId;
    
    const triggerReason = `Manual investigation from dashboard. Status: ${run.status.toUpperCase()}`;
    
    // Create or reuse investigation
    const investigation = await ensureLiveUserInvestigationForRun({
      runId,
      userId,
      sessionId,
      inputText,
      triggerReason,
      seriousness: run.status === 'error' || run.status === 'fail' ? 'error' : 'info',
    });
    
    res.status(200).json(investigation);
  } catch (err) {
    console.error('Error creating investigation for live run', err);
    res.status(500).json({ 
      error: 'Failed to create investigation: ' + err.message 
    });
  }
});

// Note: Vite middleware will handle React app routes (/, /dashboard, etc.)

// Start server
async function start() {
  console.log('\n=== Wyshbone Status Dashboard ===\n');
  
  // Load tasks
  await tasksManager.loadTasks();
  
  // Load evaluator modules
  try {
    const evaluatorModule = await import('./src/evaluator/executeInvestigation.ts');
    const storageModule = await import('./src/evaluator/storeInvestigation.ts');
    const investigateRunModule = await import('./src/evaluator/createInvestigationForRun.ts');
    const runStoreModule = await import('./src/evaluator/runStore.ts');
    
    executeInvestigation = evaluatorModule.executeInvestigation;
    getAllInvestigations = storageModule.getAllInvestigations;
    getInvestigationById = storageModule.getInvestigationById;
    createInvestigationForRun = investigateRunModule.createInvestigationForRun;
    
    listRecentRuns = runStoreModule.listRecentRuns;
    listLiveUserRuns = runStoreModule.listLiveUserRuns;  // EVAL-008
    getRunById = runStoreModule.getRunById;
    createRun = runStoreModule.createRun;
    createLiveUserRun = runStoreModule.createLiveUserRun;  // EVAL-008
    
    // Load behaviour test modules
    const behaviourTestsModule = await import('./src/evaluator/behaviourTests.ts');
    const behaviourTestStoreModule = await import('./src/evaluator/behaviourTestStore.ts');
    
    runBehaviourTest = behaviourTestsModule.runBehaviourTest;
    runAllBehaviourTests = behaviourTestsModule.runAllBehaviourTests;
    getTestsWithLatestRuns = behaviourTestStoreModule.getTestsWithLatestRuns;
    recordBehaviourTestRun = behaviourTestStoreModule.recordBehaviourTestRun;
    ensureBehaviourTestsSeeded = behaviourTestStoreModule.ensureBehaviourTestsSeeded;
    
    const autoDetectModule = await import('./src/evaluator/autoDetect.ts');
    autoDetectAndTriggerInvestigation = autoDetectModule.autoDetectAndTriggerInvestigation;
    
    // EVAL-007: Load behaviour investigation module
    const behaviourInvestigationsModule = await import('./src/evaluator/behaviourInvestigations.ts');
    ensureBehaviourInvestigationForRun = behaviourInvestigationsModule.ensureBehaviourInvestigationForRun;
    getAllBehaviourTestDefinitions = behaviourTestsModule.getAllBehaviourTestDefinitions;
    
    // EVAL-008: Load live user investigation module
    const liveUserInvestigationsModule = await import('./src/evaluator/liveUserInvestigations.ts');
    ensureLiveUserInvestigationForRun = liveUserInvestigationsModule.ensureLiveUserInvestigationForRun;

    // EVAL-009: Load automatic conversation quality investigation module
    const autoConversationQualityModule = await import('./src/evaluator/autoConversationQualityInvestigations.ts');
    createAutoConversationQualityInvestigation = autoConversationQualityModule.createAutoConversationQualityInvestigation;
    getAllAutoConversationQualityInvestigations = autoConversationQualityModule.getAllAutoConversationQualityInvestigations;
    
    // EVAL-007: Backfill legacy behaviour test investigations (one-time migration)
    try {
      const backfillCount = await behaviourInvestigationsModule.backfillBehaviourTestInvestigations();
      if (backfillCount > 0) {
        console.log(`✓ Backfilled ${backfillCount} legacy behaviour test investigations`);
      }
    } catch (err) {
      console.warn('⚠️  Failed to backfill legacy investigations:', err.message);
    }
    
    // Load patch evaluator routes (EVAL-004)
    const patchRoutesModule = await import('./server/routes-patch.ts');
    patchRoutesModule.initializePatchRoutes(autoDetectAndTriggerInvestigation);
    app.use('/tower/patch', patchRoutesModule.default);
    
    // Load junior dev routes (EVAL-005)
    const juniorDevRoutesModule = await import('./server/routes-junior-dev.ts');
    juniorDevRoutesModule.initializeJuniorDevRoutes(autoDetectAndTriggerInvestigation);
    app.use('/tower', juniorDevRoutesModule.default);
    
    // Load conversation quality routes (EVAL-009 manual flagging)
    const conversationQualityRoutesModule = await import('./server/routes-conversation-quality.ts');
    app.use('/tower', conversationQualityRoutesModule.default);
    
    // Load auto conversation quality routes (EVAL-009 automatic detection)
    const autoConversationQualityRoutesModule = await import('./server/routes-auto-conversation-quality.ts');
    app.use('/tower', autoConversationQualityRoutesModule.default);
    
    // Load patch failure routes (EVAL-016)
    const patchFailureRoutesModule = await import('./server/routes-patch-failures.ts');
    app.use('/tower', patchFailureRoutesModule.default);
    
    // Load manual flags routes (simplified flagging workflow)
    const manualFlagsRoutesModule = await import('./server/routes-manual-flags.ts');
    app.use('/tower', manualFlagsRoutesModule.default);
    
    // Load investigate routes (investigation detail page)
    const investigateRoutesModule = await import('./server/routes-investigate.ts');
    app.use('/tower', investigateRoutesModule.default);
    
    // Load investigate-run routes (create investigation for a run)
    const investigateRunRoutesModule = await import('./server/routes-investigate-run.ts');
    app.use('/tower', investigateRunRoutesModule.default);
    
    // Load reset routes (clear all flags and investigations)
    const resetRoutesModule = await import('./server/routes-reset.ts');
    app.use('/tower', resetRoutesModule.default);
    
    // Ensure behaviour test definitions are seeded
    await ensureBehaviourTestsSeeded();
    
    console.log('✓ Evaluator modules loaded');
  } catch (err) {
    console.warn('⚠️  Failed to load evaluator modules:', err.message);
  }
  
  // Setup Vite middleware for React app (development mode)
  if (process.env.NODE_ENV !== 'production') {
    const { setupVite } = await import('./server/vite.ts');
    await setupVite(app, server);
    console.log('✓ Vite middleware loaded');
  }
  
  // Start polling
  await poller.startPolling();
  
  server.listen(PORT, () => {
    console.log(`\n✓ Server running on http://localhost:${PORT}`);
    console.log(`\nQuick Start:`);
    console.log(`  1. React Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`  2. Server-rendered status: http://localhost:${PORT}/status`);
    console.log(`  3. Machine-readable JSON feed: http://localhost:${PORT}/status.json`);
    console.log(`  4. Tasks API: http://localhost:${PORT}/tasks.json`);
    console.log(`  5. Runs API: http://localhost:${PORT}/tower/runs`);
    console.log(`\nConfiguration:`);
    console.log(`  - Polling interval: ${120000 / 1000} seconds`);
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
