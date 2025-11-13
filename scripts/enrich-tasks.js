import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_PATH = join(__dirname, '../config/tasks.json');

/**
 * WARNING: This script OVERWRITES config/tasks.json with programmatically generated data.
 * 
 * DO NOT RE-RUN this script after making manual edits to config/tasks.json,
 * as it will erase your changes.
 * 
 * This script should only be run ONCE during initial roadmap setup.
 * After that, edit config/tasks.json directly to maintain customizations.
 */

const LAYER_MAPPING = {
  1: {
    name: "Layer 1 – Agentic Core",
    tasks: ["UI-001", "UI-002", "SUP-001", "SUP-002", "SUP-003", "POL-001"]
  },
  2: {
    name: "Layer 2 – Goal-centric UX",
    tasks: ["UI-010", "UI-011", "UI-012", "UI-013", "UI-020", "UI-021", "UI-022", 
            "UI-030", "UI-031", "UI-032", "SUP-010", "SUP-011", "SUP-012"]
  },
  3: {
    name: "Layer 3 – Adaptive Planner & Executor",
    tasks: ["SUP-020", "SUP-021", "SUP-022", "SUP-030", "SUP-031", 
            "UI-040", "UI-041", "UI-042"]
  },
  4: {
    name: "Layer 4 – System Self-Monitoring",
    tasks: ["POL-010", "POL-011", "SUP-040", "POL-020", "POL-021", "POL-022",
            "POL-030", "POL-031", "POL-032", "UI-050"]
  },
  5: {
    name: "Layer 5 – Self-Improvement & Experimentation",
    tasks: ["POL-040", "SUP-050", "SUP-051", "SUP-052", "POL-050", "POL-051",
            "SUP-060", "SUP-061", "UI-060"]
  },
  6: {
    name: "Layer 6 – Meta-Agent / Multi-User Optimiser",
    tasks: ["META-010", "META-011", "META-020", "META-021", "META-030"]
  }
};

const COMPLEXITY_LARGE = ["SUP-001", "SUP-002", "SUP-010", "SUP-011", "SUP-012",
                          "SUP-020", "SUP-021", "SUP-022", "SUP-050", "SUP-051", 
                          "SUP-052", "SUP-060", "SUP-061", "POL-040", "META-010", "META-020"];

const COMPLEXITY_SMALL = ["POL-001", "UI-020", "UI-021", "UI-022", "POL-010", "POL-011",
                         "POL-020", "POL-021", "POL-022", "POL-030", "POL-031", "POL-032"];

const CRITICAL_PATH_TASKS = [
  // Layer 1
  "UI-001", "UI-002", "SUP-001", "SUP-002", "SUP-003", "POL-001",
  // Layer 2
  "UI-010", "UI-020", "UI-030", "SUP-010", "SUP-011", "SUP-012",
  // Layer 3
  "SUP-020", "SUP-021", "SUP-022", "SUP-030", "UI-040",
  // Layer 4
  "POL-010", "POL-011", "SUP-040", "POL-020", "POL-021", "POL-022",
  "POL-030", "POL-031", "POL-032", "UI-050"
];

function getLayerForTask(taskId) {
  for (const [layer, config] of Object.entries(LAYER_MAPPING)) {
    if (config.tasks.includes(taskId)) {
      return { layer: parseInt(layer), group: config.name };
    }
  }
  return { layer: 2, group: LAYER_MAPPING[2].name };
}

function getComplexityForTask(taskId) {
  if (COMPLEXITY_LARGE.includes(taskId)) return "L";
  if (COMPLEXITY_SMALL.includes(taskId)) return "S";
  return "M";
}

function isCriticalPath(taskId) {
  return CRITICAL_PATH_TASKS.includes(taskId);
}

function getDependenciesForTask(task) {
  const { id, app } = task;
  const { layer } = getLayerForTask(id);
  
  // Layer 1 tasks have no dependencies
  if (layer === 1) return [];
  
  const deps = [];
  
  // Layer 2+ tasks depend on Layer 1 tasks of the same app
  if (app === 'ui') {
    deps.push("UI-001", "UI-002");
  } else if (app === 'supervisor') {
    deps.push("SUP-001", "SUP-002");
  } else if (app === 'poller') {
    deps.push("POL-001");
  }
  
  // Specific dependencies based on task ID
  const specificDeps = {
    "UI-020": ["UI-010"],
    "UI-021": ["UI-010"],
    "UI-022": ["UI-010"],
    "UI-030": ["UI-001", "UI-002", "SUP-001", "SUP-002"],
    "UI-031": ["UI-001", "UI-002", "SUP-001", "SUP-002"],
    "UI-032": ["UI-001", "UI-002", "SUP-001", "SUP-002"],
    "SUP-020": ["SUP-001", "SUP-002", "SUP-010", "SUP-011", "SUP-012"],
    "SUP-021": ["SUP-001", "SUP-002", "SUP-010", "SUP-011", "SUP-012"],
    "SUP-022": ["SUP-001", "SUP-002", "SUP-010", "SUP-011", "SUP-012"],
    "SUP-030": ["SUP-020", "SUP-021", "SUP-022"],
    "SUP-031": ["SUP-020", "SUP-021", "SUP-022"],
    "POL-020": ["POL-010", "POL-011"],
    "POL-021": ["POL-010", "POL-011"],
    "POL-022": ["POL-010", "POL-011"],
    "POL-030": ["POL-020", "POL-021", "POL-022"],
    "POL-031": ["POL-020", "POL-021", "POL-022"],
    "POL-032": ["POL-020", "POL-021", "POL-022"]
  };
  
  if (specificDeps[id]) {
    return [...new Set([...deps, ...specificDeps[id]])];
  }
  
  return [...new Set(deps)];
}

async function enrichTasks() {
  console.log('Loading tasks from config/tasks.json...');
  const tasksData = await readFile(TASKS_PATH, 'utf-8');
  const tasks = JSON.parse(tasksData);
  
  console.log(`Enriching ${tasks.length} tasks...`);
  
  const enrichedTasks = tasks.map(task => {
    const { layer, group } = getLayerForTask(task.id);
    const complexity = getComplexityForTask(task.id);
    const criticalPath = isCriticalPath(task.id);
    const dependsOn = getDependenciesForTask(task);
    
    return {
      ...task,
      layer,
      group,
      complexity,
      dependsOn,
      criticalPath
    };
  });
  
  console.log('Saving enriched tasks...');
  await writeFile(TASKS_PATH, JSON.stringify(enrichedTasks, null, 2), 'utf-8');
  console.log(`✓ Successfully enriched ${enrichedTasks.length} tasks`);
  
  // Stats
  const stats = {
    layers: {},
    complexity: {},
    criticalPath: 0
  };
  
  enrichedTasks.forEach(task => {
    stats.layers[task.layer] = (stats.layers[task.layer] || 0) + 1;
    stats.complexity[task.complexity] = (stats.complexity[task.complexity] || 0) + 1;
    if (task.criticalPath) stats.criticalPath++;
  });
  
  console.log('\nEnrichment Statistics:');
  console.log('- By Layer:', stats.layers);
  console.log('- By Complexity:', stats.complexity);
  console.log('- Critical Path Tasks:', stats.criticalPath);
}

enrichTasks().catch(console.error);
