/**
 * One-Click Start Script
 * Starts all DraftCoach services: Backend, Billing, and Web
 * 
 * Usage: node start-all.js
 * Or: npm run start:all
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SERVICES = [
  { name: 'Backend', dir: 'apps/backend', script: 'npm', args: ['run', 'dev'], color: '\x1b[36m' },    // Cyan
  { name: 'Billing', dir: 'apps/billing', script: 'npx', args: ['tsx', 'src/index.ts'], color: '\x1b[35m' },  // Magenta
  { name: 'Web',     dir: 'apps/web',     script: 'npx', args: ['next', 'dev'], color: '\x1b[33m' },  // Yellow
];

const RESET = '\x1b[0m';
const processes = [];

console.log('\n🚀 Starting DraftCoach All Services...\n');

// Track if user wants to stop
let shuttingDown = false;

function startService(service) {
  return new Promise((resolve) => {
    const cwd = path.join(ROOT, service.dir);
    const color = service.color;
    
    console.log(`${color}▶ Starting ${service.name}...${RESET}`);
    
    const child = spawn(service.script, service.args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    processes.push({ name: service.name, child });

    child.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.includes('error') || line.includes('Error') || line.includes('ERROR')) {
          console.log(`${color}[${service.name}]${RESET} ${line}`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`${color}[${service.name}]${RESET} ${line}`);
      }
    });

    child.on('spawn', () => {
      console.log(`${color}✓ ${service.name} started${RESET}`);
      resolve();
    });

    child.on('error', (err) => {
      console.log(`${color}✗ ${service.name} failed: ${err.message}${RESET}`);
      resolve();
    });

    // Give it a moment to spawn
    setTimeout(resolve, 1000);
  });
}

async function startAll() {
  // Start all services in parallel
  await Promise.all(SERVICES.map(startService));
  
  console.log('\n' + '='.repeat(50));
  console.log('🎮 DraftCoach is running!');
  console.log('='.repeat(50));
  console.log('\n📍 URLs:');
  console.log('   • Backend API:  http://localhost:3210');
  console.log('   • Billing API:  http://localhost:3211');
  console.log('   • Web App:      http://localhost:3000');
  console.log('   • Billing UI:   http://localhost:3000/billing');
  console.log('\n💡 Press Ctrl+C to stop all services\n');

  // Handle shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  
  console.log('\n\n🛑 Stopping all services...\n');
  
  for (const proc of processes) {
    console.log(`   Stopping ${proc.name}...`);
    proc.child.kill('SIGTERM');
  }
  
  setTimeout(() => {
    console.log('\n👋 Goodbye!\n');
    process.exit(0);
  }, 2000);
}

startAll();