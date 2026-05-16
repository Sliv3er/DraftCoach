#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || 'shared/kb/data');
const required = [
  'build-templates.json',
  'rune-templates.json',
  'build-templates-aram.json',
  'build-templates-aram-mayhem.json',
  'rune-templates-aram.json',
  'rune-templates-aram-mayhem.json',
  'augment-templates.json',
  'augments-master.json',
];

function fail(message) {
  console.error(`[kb] ${message}`);
  process.exitCode = 1;
}

function readJson(file) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) {
    fail(`missing ${file}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, 'utf-8'));
  } catch (err) {
    fail(`${file}: invalid JSON (${err.message})`);
    return null;
  }
}

function validateBuildFile(file, expectedRole) {
  const json = readJson(file);
  if (!json) return;
  const entries = json.data || {};
  const keys = Object.keys(entries);
  if (!keys.length) fail(`${file}: no build entries`);
  for (const key of keys) {
    const entry = entries[key];
    if (!entry.championId) fail(`${file}:${key}: missing championId`);
    if (expectedRole && entry.role !== expectedRole) fail(`${file}:${key}: expected role ${expectedRole}, got ${entry.role}`);
    const variants = entry.variants || {};
    const main = variants.DAMAGE || Object.values(variants)[0];
    if (!main) {
      fail(`${file}:${key}: missing variants`);
      continue;
    }
    if (!Array.isArray(main.coreItems) || main.coreItems.length < 2) fail(`${file}:${key}: too few core items`);
    if (!main.runes?.primaryKeystone) fail(`${file}:${key}: missing primary keystone`);
  }
  console.log(`[kb] ${file}: ${keys.length} entries`);
}

function validateRuneFile(file) {
  const json = readJson(file);
  if (!json) return;
  const count = Object.keys(json.data || {}).length;
  if (!count) fail(`${file}: no rune entries`);
  console.log(`[kb] ${file}: ${count} entries`);
}

function validateAugments() {
  const templates = readJson('augment-templates.json');
  const master = readJson('augments-master.json');
  if (!templates || !master) return;
  const championCount = Object.keys(templates.data || {}).length;
  const augmentCount = Array.isArray(master.augments) ? master.augments.length : 0;
  if (!championCount) fail('augment-templates.json: no champion augment templates');
  if (augmentCount < 50) fail(`augments-master.json: suspiciously low augment count (${augmentCount})`);
  for (const [champion, entry] of Object.entries(templates.data || {})) {
    if (!Array.isArray(entry.recommended) || !entry.recommended.length) fail(`augment-templates.json:${champion}: missing recommended augments`);
  }
  console.log(`[kb] augment-templates.json: ${championCount} champions`);
  console.log(`[kb] augments-master.json: ${augmentCount} augments`);
}

if (!fs.existsSync(dir)) {
  fail(`directory not found: ${dir}`);
} else {
  for (const file of required) readJson(file);
  validateBuildFile('build-templates.json');
  validateBuildFile('build-templates-aram.json', 'ARAM');
  validateBuildFile('build-templates-aram-mayhem.json', 'ARAM_MAYHEM');
  validateRuneFile('rune-templates.json');
  validateRuneFile('rune-templates-aram.json');
  validateRuneFile('rune-templates-aram-mayhem.json');
  validateAugments();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('[kb] validation passed');
