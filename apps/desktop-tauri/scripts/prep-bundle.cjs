#!/usr/bin/env node
/**
 * Prep script that assembles the backend bundle with proper directory structure.
 * Tauri's resource globbing flattens directories, so we pre-assemble everything
 * into build-bundle/ and reference it as a single resource root.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build-bundle');
const SIDECAR_SRC = path.join(ROOT, 'sidecar');
const BACKEND_SRC = path.resolve(ROOT, '..', 'desktop', 'src', 'main');

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function cpDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[prep-bundle] Skip missing dir: ${src}`);
    return;
  }
  fs.cpSync(src, dest, { recursive: true });
}

console.log('[prep-bundle] Assembling backend bundle...');
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

// Sidecar directory (backend.js + package.json + node_modules)
const sidecarOut = path.join(OUT, 'sidecar');
fs.mkdirSync(sidecarOut, { recursive: true });
cp(path.join(SIDECAR_SRC, 'backend.js'), path.join(sidecarOut, 'backend.js'));
cp(path.join(SIDECAR_SRC, 'package.json'), path.join(sidecarOut, 'package.json'));
console.log('[prep-bundle] Copying sidecar/node_modules...');
cpDir(path.join(SIDECAR_SRC, 'node_modules'), path.join(sidecarOut, 'node_modules'));

// Backend directory (main.cjs + dependencies)
const backendOut = path.join(OUT, 'backend');
fs.mkdirSync(backendOut, { recursive: true });
const backendFiles = ['main.cjs', 'prompt-builder.cjs', 'crash-logger.cjs', 'settings.cjs', 'engine-js.js'];
for (const f of backendFiles) {
  const src = path.join(BACKEND_SRC, f);
  if (fs.existsSync(src)) cp(src, path.join(backendOut, f));
}
// Cooldowns subdir
cpDir(path.join(BACKEND_SRC, 'cooldowns'), path.join(backendOut, 'cooldowns'));

console.log('[prep-bundle] Bundle ready at:', OUT);
