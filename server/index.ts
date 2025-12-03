// Wyshbone Status Dashboard - Main Entry Point
// This replaces the fullstack template to run the standalone dashboard

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { execSync } = require('child_process');
const path = require('path');

const dashboardPath = path.join(process.cwd(), 'server.js');

console.log('🚀 Starting Wyshbone Status Dashboard...');
console.log(`📁 Dashboard location: ${dashboardPath}`);

try {
  execSync(`node "${dashboardPath}"`, { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to start dashboard:', error);
  process.exit(1);
}
