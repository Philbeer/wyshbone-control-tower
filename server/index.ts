// Wyshbone Status Dashboard - Main Entry Point
// This replaces the fullstack template to run the standalone dashboard

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import and run the dashboard server
const { spawnSync } = require('child_process');
const path = require('path');

// The dashboard is in server.js at the project root
const dashboardPath = path.join(process.cwd(), 'server.js');

console.log('🚀 Starting Wyshbone Status Dashboard...');
console.log(`📁 Dashboard location: ${dashboardPath}`);

// Execute the dashboard server using tsx to support TypeScript imports
// Use spawnSync with args array to handle paths with spaces (Windows-friendly)
try {
  const result = spawnSync('npx', ['tsx', dashboardPath], { 
    stdio: 'inherit',
    shell: true,  // Required for npx on Windows (npx.cmd)
  });
  
  if (result.error) {
    throw result.error;
  }
  
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
} catch (error) {
  console.error('Failed to start dashboard:', error);
  process.exit(1);
}
