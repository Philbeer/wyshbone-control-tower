import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_PATH = join(__dirname, '../config/tasks.json');

class TasksManager {
  constructor() {
    this.tasks = [];
  }

  /**
   * Load tasks from config/tasks.json
   * Creates a default file if it doesn't exist
   */
  async loadTasks() {
    try {
      const tasksData = await readFile(TASKS_PATH, 'utf-8');
      this.tasks = JSON.parse(tasksData);
      console.log(`✓ Loaded ${this.tasks.length} task(s) from config/tasks.json`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it with default structure
        console.log('⚠ config/tasks.json not found, creating default...');
        await this.createDefaultTasks();
        return true;
      } else if (error instanceof SyntaxError) {
        // File exists but is malformed JSON - create backup before overwriting
        console.error('✗ Error: config/tasks.json contains invalid JSON');
        const backupPath = TASKS_PATH + '.backup.' + Date.now();
        try {
          const corruptData = await readFile(TASKS_PATH, 'utf-8');
          await writeFile(backupPath, corruptData, 'utf-8');
          console.error(`  Created backup at: ${backupPath}`);
        } catch (backupError) {
          console.error('  Failed to create backup:', backupError.message);
        }
        console.error('  Creating fresh tasks.json...');
        await this.createDefaultTasks();
        return true;
      } else {
        console.error('✗ Error loading tasks:', error.message);
        // Don't crash, just use empty tasks
        this.tasks = [];
        return false;
      }
    }
  }

  /**
   * Create default tasks.json file
   */
  async createDefaultTasks() {
    const defaultTasks = [
      {
        id: 'UI-EXAMPLE-1',
        app: 'ui',
        title: 'Example task: capture user goal at start of chat',
        description: 'This is an example; Phil will replace with real tasks.',
        status: 'planned',
        priority: 'medium',
        type: 'replit_prompt',
        replitPrompt: 'Example placeholder prompt for the Wyshbone UI repl.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    this.tasks = defaultTasks;
    await this.saveTasks();
    console.log('✓ Created default config/tasks.json');
  }

  /**
   * Save tasks to config/tasks.json
   */
  async saveTasks() {
    try {
      const tasksJson = JSON.stringify(this.tasks, null, 2);
      await writeFile(TASKS_PATH, tasksJson, 'utf-8');
      return true;
    } catch (error) {
      console.error('✗ Error saving tasks:', error.message);
      return false;
    }
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    return this.tasks;
  }

  /**
   * Get tasks by app (ui, supervisor, poller)
   */
  getTasksByApp(appKey) {
    return this.tasks.filter(task => task.app === appKey);
  }

  /**
   * Get tasks grouped by app
   */
  getTasksGroupedByApp() {
    return {
      ui: this.getTasksByApp('ui'),
      supervisor: this.getTasksByApp('supervisor'),
      poller: this.getTasksByApp('poller')
    };
  }

  /**
   * Get a single task by ID
   */
  getTaskById(id) {
    return this.tasks.find(task => task.id === id);
  }

  /**
   * Update task status
   */
  async updateTaskStatus(id, newStatus) {
    const task = this.getTaskById(id);
    if (!task) {
      console.error(`✗ Task not found: ${id}`);
      return false;
    }

    task.status = newStatus;
    task.updatedAt = new Date().toISOString();
    await this.saveTasks();
    console.log(`✓ Updated task ${id} status to: ${newStatus}`);
    return true;
  }

  /**
   * Update task with partial data
   */
  async updateTask(id, partialUpdate) {
    const task = this.getTaskById(id);
    if (!task) {
      console.error(`✗ Task not found: ${id}`);
      return false;
    }

    Object.assign(task, partialUpdate);
    task.updatedAt = new Date().toISOString();
    await this.saveTasks();
    console.log(`✓ Updated task ${id}`);
    return true;
  }

  /**
   * Get tasks that need acceptance checking (not done, have acceptanceCheck)
   */
  getTasksNeedingCheck() {
    return this.tasks.filter(task => 
      task.status !== 'done' && 
      task.acceptanceCheck && 
      task.acceptanceCheck.type === 'fileContains'
    );
  }

  /**
   * Get tasks grouped by app and layer
   * Returns: { [app]: { [layer]: Task[] } }
   */
  getTasksByAppAndLayer() {
    const grouped = {};
    
    this.tasks.forEach(task => {
      const app = task.app || 'unknown';
      const layer = task.layer || 1;
      
      if (!grouped[app]) {
        grouped[app] = {};
      }
      
      if (!grouped[app][layer]) {
        grouped[app][layer] = [];
      }
      
      grouped[app][layer].push(task);
    });
    
    return grouped;
  }

  /**
   * Get critical path tasks sorted by layer and then topologically
   * Returns: Task[] including all dependencies even if not marked critical
   * Throws if any dependency is missing from task set
   */
  getCriticalPathTasks() {
    const criticalTasks = this.tasks.filter(task => task.criticalPath === true);
    const taskMap = new Map(this.tasks.map(t => [t.id, t]));
    const allNeededTasks = new Set();
    const missingDeps = new Set();
    
    const addWithDeps = (taskId, parentTaskId = null) => {
      if (allNeededTasks.has(taskId)) return;
      
      const task = taskMap.get(taskId);
      if (!task) {
        missingDeps.add(taskId);
        if (parentTaskId) {
          console.error(`Missing dependency: ${taskId} (required by ${parentTaskId})`);
        }
        return;
      }
      
      allNeededTasks.add(taskId);
      
      if (task.dependsOn && task.dependsOn.length > 0) {
        for (const depId of task.dependsOn) {
          addWithDeps(depId, taskId);
        }
      }
    };
    
    for (const task of criticalTasks) {
      addWithDeps(task.id);
    }
    
    if (missingDeps.size > 0) {
      const missing = Array.from(missingDeps).join(', ');
      throw new Error(`Critical path has unresolved dependencies: ${missing}. Fix config/tasks.json`);
    }
    
    const tasksToSort = this.tasks.filter(t => allNeededTasks.has(t.id));
    return this.topologicallySortedTasks(tasksToSort);
  }

  /**
   * Topologically sort tasks by dependencies
   * Returns: Task[] in valid dependency order (dependencies before dependents)
   */
  topologicallySortedTasks(tasks) {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (taskId) => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        console.warn(`Circular dependency detected involving ${taskId}`);
        return;
      }
      
      visiting.add(taskId);
      const task = taskMap.get(taskId);
      
      if (task && task.dependsOn && task.dependsOn.length > 0) {
        for (const depId of task.dependsOn) {
          if (taskMap.has(depId)) {
            visit(depId);
          }
        }
      }
      
      visiting.delete(taskId);
      visited.add(taskId);
      
      if (task) {
        sorted.push(task);
      }
    };
    
    for (const task of tasks) {
      visit(task.id);
    }
    
    return sorted;
  }
}

export const tasksManager = new TasksManager();
