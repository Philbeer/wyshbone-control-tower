// Wyshbone Status Dashboard - Main Entry Point
// This replaces the fullstack template to run the standalone dashboard

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import and run the dashboard server
const { execSync } = require('child_process');
const path = require('path');

// The dashboard is in server.js at the project root
const dashboardPath = path.join(process.cwd(), 'server.js');

console.log('🚀 Starting Wyshbone Status Dashboard...');
console.log(`📁 Dashboard location: ${dashboardPath}`);

// Execute the dashboard server using tsx to support TypeScript imports
try {
  execSync(`npx tsx ${dashboardPath}`, { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to start dashboard:', error);
  process.exit(1);
}
