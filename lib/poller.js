import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tasksManager } from './tasks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../config/sources.json');
const MAX_SNAPSHOTS = 50;
const POLL_INTERVAL_MS = 10000; // 10 seconds

class Poller {
  constructor() {
    this.sources = [];
    this.history = new Map(); // sourceName -> array of snapshots
    this.intervalId = null;
  }

  async loadConfig() {
    try {
      const configData = await readFile(CONFIG_PATH, 'utf-8');
      this.sources = JSON.parse(configData);
      
      // Normalize baseUrls by removing trailing slashes
      this.sources.forEach(source => {
        source.baseUrl = source.baseUrl.replace(/\/+$/, '');
        
        if (!this.history.has(source.name)) {
          this.history.set(source.name, []);
        }
      });
      
      console.log(`✓ Loaded ${this.sources.length} source(s) from config/sources.json`);
      return true;
    } catch (error) {
      console.error('✗ Error loading config/sources.json:', error.message);
      console.error('  Please ensure config/sources.json exists and is valid JSON');
      return false;
    }
  }

  async pollSource(source) {
    const url = `${source.baseUrl}/export/status.json`;
    const snapshot = {
      fetchedAt: new Date().toISOString(),
      success: false,
      sourceName: source.name
    };

    try {
      const response = await fetch(url, {
        headers: {
          'X-EXPORT-KEY': source.exportKey
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        snapshot.error = `HTTP ${response.status}: ${response.statusText}`;
        return snapshot;
      }

      const data = await response.json();
      snapshot.success = true;
      snapshot.data = data;
      
      return snapshot;
    } catch (error) {
      snapshot.error = error.message;
      return snapshot;
    }
  }

  async pollAll() {
    console.log(`[${new Date().toISOString()}] Polling ${this.sources.length} source(s)...`);
    
    const promises = this.sources.map(source => this.pollSource(source));
    const snapshots = await Promise.all(promises);

    snapshots.forEach(snapshot => {
      const history = this.history.get(snapshot.sourceName);
      history.push(snapshot);
      
      // Keep only last MAX_SNAPSHOTS
      if (history.length > MAX_SNAPSHOTS) {
        history.shift();
      }

      if (snapshot.success) {
        console.log(`  ✓ ${snapshot.sourceName}: OK`);
      } else {
        console.log(`  ✗ ${snapshot.sourceName}: ${snapshot.error}`);
      }
    });

    // Run task acceptance checks after polling sources
    await this.checkTaskAcceptance();
  }

  async startPolling() {
    const configLoaded = await this.loadConfig();
    if (!configLoaded) {
      console.error('Cannot start polling without valid configuration');
      return;
    }

    // Do initial poll
    await this.pollAll();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.pollAll().catch(error => {
        console.error('Error during polling cycle:', error);
      });
    }, POLL_INTERVAL_MS);

    console.log(`✓ Polling started (interval: ${POLL_INTERVAL_MS / 1000}s)`);
  }

  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('✓ Polling stopped');
    }
  }

  computeDeltas(latest, previous) {
    if (!latest || !previous || !latest.data || !previous.data) {
      return null;
    }

    const deltas = {};
    
    // Cleverness delta
    if (latest.data.quality?.clevernessIndex !== undefined && 
        previous.data.quality?.clevernessIndex !== undefined) {
      deltas.cleverness = latest.data.quality.clevernessIndex - previous.data.quality.clevernessIndex;
    }

    // LOC delta
    if (latest.data.totals?.loc !== undefined && 
        previous.data.totals?.loc !== undefined) {
      deltas.loc = latest.data.totals.loc - previous.data.totals.loc;
    }

    // TODO delta
    if (latest.data.totals?.todo !== undefined && 
        previous.data.totals?.todo !== undefined) {
      deltas.todo = latest.data.totals.todo - previous.data.totals.todo;
    }

    // FIXME delta
    if (latest.data.totals?.fixme !== undefined && 
        previous.data.totals?.fixme !== undefined) {
      deltas.fixme = latest.data.totals.fixme - previous.data.totals.fixme;
    }

    return deltas;
  }

  getState() {
    const state = {
      sources: [],
      recentEvents: []
    };

    this.sources.forEach(source => {
      const history = this.history.get(source.name);
      if (!history || history.length === 0) {
        state.sources.push({
          name: source.name,
          baseUrl: source.baseUrl,
          status: 'NO_DATA',
          latest: null,
          previous: null,
          deltas: null
        });
        return;
      }

      const latest = history[history.length - 1];
      const previous = history.length > 1 ? history[history.length - 2] : null;
      const deltas = this.computeDeltas(latest, previous);

      state.sources.push({
        name: source.name,
        baseUrl: source.baseUrl,
        status: latest.success ? 'OK' : 'ERROR',
        latest,
        previous,
        deltas
      });

      // Add to recent events if there are notable changes
      if (deltas && Object.values(deltas).some(d => d !== 0)) {
        state.recentEvents.push({
          sourceName: source.name,
          timestamp: latest.fetchedAt,
          deltas
        });
      }
    });

    // Sort recent events by timestamp (newest first) and limit to 10
    state.recentEvents.sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    ).splice(10);

    return state;
  }

  getSourceByName(name) {
    return this.sources.find(s => s.name === name);
  }

  /**
   * Fetch file content from a source via /export/file API
   */
  async fetchFileFromSource(source, filePath) {
    const url = `${source.baseUrl}/export/file?path=${encodeURIComponent(filePath)}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'X-EXPORT-KEY': source.exportKey
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      return { success: true, content: data.content || '' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check task acceptance criteria
   * Called during each poll cycle to auto-mark tasks as done
   */
  async checkTaskAcceptance() {
    const tasksToCheck = tasksManager.getTasksNeedingCheck();
    
    if (tasksToCheck.length === 0) {
      return;
    }

    console.log(`[Tasks] Checking ${tasksToCheck.length} task(s) for acceptance...`);

    for (const task of tasksToCheck) {
      try {
        // Map task.app to source name
        let sourceName = null;
        if (task.app === 'ui') {
          sourceName = 'Wyshbone UI';
        } else if (task.app === 'supervisor') {
          sourceName = 'Wyshbone Supervisor';
        } else if (task.app === 'poller') {
          // Poller tasks are not checked automatically (handled manually)
          continue;
        }

        const source = this.getSourceByName(sourceName);
        if (!source) {
          console.log(`  ⚠ ${task.id}: Source "${sourceName}" not found in config`);
          continue;
        }

        // Fetch the file
        const result = await this.fetchFileFromSource(source, task.acceptanceCheck.file);
        
        if (!result.success) {
          console.log(`  ⚠ ${task.id}: Failed to fetch file - ${result.error}`);
          continue;
        }

        // Check if mustContain string appears in the file
        if (result.content.includes(task.acceptanceCheck.mustContain)) {
          console.log(`  ✓ ${task.id}: Acceptance check PASSED! Marking as done.`);
          await tasksManager.updateTaskStatus(task.id, 'done');
        } else {
          console.log(`  ⊘ ${task.id}: Acceptance check not yet met`);
        }
      } catch (error) {
        console.error(`  ✗ ${task.id}: Error during acceptance check - ${error.message}`);
      }
    }
  }

  /**
   * Get tasks state grouped by app
   */
  getTasksState() {
    return tasksManager.getTasksGroupedByApp();
  }
}

export const poller = new Poller();
