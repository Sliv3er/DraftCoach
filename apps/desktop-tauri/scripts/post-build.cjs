#!/usr/bin/env node
/**
 * Post-build: Copy backend bundle to target/release with proper directory structure.
 * Tauri's resource bundler flattens directories, so we bypass it entirely.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = path.join(ROOT, 'build-bundle');
const RELEASE = path.join(ROOT, 'src-tauri', 'target', 'release');

if (!fs.existsSync(BUNDLE)) {
  console.error('[post-build] build-bundle/ not found. Run prep-bundle first.');
  process.exit(1);
}
if (!fs.existsSync(RELEASE)) {
  console.error('[post-build] target/release/ not found. Run tauri build first.');
  process.exit(1);
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dst) {
  rmrf(dst);
  fs.cpSync(src, dst, { recursive: true });
}

console.log('[post-build] Copying sidecar/ to target/release/sidecar/');
copyDir(path.join(BUNDLE, 'sidecar'), path.join(RELEASE, 'sidecar'));

console.log('[post-build] Copying backend/ to target/release/backend/');
copyDir(path.join(BUNDLE, 'backend'), path.join(RELEASE, 'backend'));

console.log('[post-build] Done. Backend bundle ready at:', RELEASE);
