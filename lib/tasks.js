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
        // File exists but is malformed JSON
        console.error('✗ Error: config/tasks.json contains invalid JSON');
        console.error('  Creating backup and starting fresh...');
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
}

export const tasksManager = new TasksManager();
