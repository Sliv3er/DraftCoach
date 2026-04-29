#!/usr/bin/env node
/**
 * Pre-build security check — runs BEFORE electron-builder.
 * Scans source code for hardcoded API keys and verifies .gitignore.
 *
 * NOTE: .env bundling is currently ALLOWED for pre-production builds.
 * TODO: When switching to Cloudflare Worker proxy for production,
 *       re-enable .env file checks.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ERRORS = [];
const WARNINGS = [];

console.log('═══════════════════════════════════════════════════════');
console.log('  🔒 DraftCoach Pre-Build Security Check');
console.log('═══════════════════════════════════════════════════════');

// ── Check 1: Scan source files for hardcoded API keys ────────────
const API_KEY_PATTERNS = [
  /AIzaSy[A-Za-z0-9_-]{33}/g,           // Google/Gemini API key
  /RGAPI-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g,  // Riot API key
  /sk-[A-Za-z0-9]{20,}/g,               // OpenAI API key
  /ghp_[A-Za-z0-9]{36}/g,               // GitHub personal access token
  /glpat-[A-Za-z0-9_-]{20}/g,           // GitLab personal access token
];

const SCAN_EXTENSIONS = new Set(['.cjs', '.js', '.ts', '.tsx', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist-installer', 'dist-electron']);

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      // Skip this script itself and test files
      if (entry.name === 'pre-build-check.cjs') continue;
      if (entry.name.startsWith('test-')) continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of API_KEY_PATTERNS) {
          pattern.lastIndex = 0; // Reset regex state
          const match = pattern.exec(content);
          if (match) {
            const masked = match[0].slice(0, 8) + '...' + match[0].slice(-4);
            ERRORS.push(`Hardcoded API key in ${path.relative(ROOT, fullPath)}: ${masked}`);
          }
        }
      } catch { /* skip unreadable files */ }
    }
  }
}

console.log('  Scanning source files for hardcoded keys...');
scanDir(path.join(ROOT, 'src'));
console.log('  Source scan complete');

// ── Check 2: Verify .gitignore includes .env ─────────────────────
const gitignorePath = path.resolve(ROOT, '..', '..', '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  if (!gitignore.includes('.env')) {
    ERRORS.push('.gitignore does not include .env — secrets could be committed to git!');
  } else {
    console.log('  ✓ .gitignore includes .env');
  }
}

// ── Check 3: Info — .env bundling status ─────────────────────────
const envPaths = [
  path.join(ROOT, '.env'),
  path.resolve(ROOT, '..', 'desktop-tauri', 'build-bundle', '.env'),
];
const envFound = envPaths.some(p => fs.existsSync(p));
if (envFound) {
  WARNINGS.push('.env will be bundled with this build (pre-production mode)');
}

// ── Results ──────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');

if (WARNINGS.length > 0) {
  for (const warn of WARNINGS) {
    console.log(`  ⚠️  ${warn}`);
  }
}

if (ERRORS.length > 0) {
  console.error('');
  console.error('  ❌ SECURITY CHECK FAILED — BUILD ABORTED');
  console.error('');
  for (const err of ERRORS) {
    console.error(`  🚫 ${err}`);
  }
  console.error('');
  console.error('═══════════════════════════════════════════════════════');
  process.exit(1);
} else {
  console.log('');
  console.log('  ✅ Security checks passed — safe to build');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
}
