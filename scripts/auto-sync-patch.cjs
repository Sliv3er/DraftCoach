#!/usr/bin/env node
// DraftCoach Auto Patch Sync
// Runs on VPS via cron. Checks for new LoL patches and syncs
// meta builds + augments to the GitHub data branch.
//
// Usage:   node auto-sync-patch.cjs
// Cron:    0 0,6,12,18 * * * /opt/draftcoach-sync/run-sync.sh
// Force:   node auto-sync-patch.cjs --force
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config ──
const WORK_DIR = process.env.SYNC_WORK_DIR || '/opt/draftcoach-sync';
const DATA_DIR = path.join(WORK_DIR, 'repo');
const META_DIR = path.join(DATA_DIR, 'data', 'meta-builds', 'sr');
const AUGMENTS_DIR = path.join(DATA_DIR, 'data', 'augments');
const MANIFEST_FILE = path.join(DATA_DIR, 'data', 'meta-builds', 'manifest.json');
const STATE_FILE = path.join(WORK_DIR, 'sync-state.json');
const BATCH_SIZE = 10;
const MAX_RETRIES = 2;
const FORCE = process.argv.includes('--force');

// ── Logging ──
function log(level, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`);
}

// ── Load state ──
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {}
  return { lastSyncedPatch: null, lastSyncAt: null, syncCount: 0 };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ── Check DDragon for current patch ──
async function getCurrentPatch() {
  const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions = await res.json();
  return versions[0]; // e.g., "16.10.1"
}

function patchShort(patch) {
  return patch.split('.').slice(0, 2).join('.'); // "16.10"
}

// ── Get all champions from DDragon ──
async function getAllChampions(patch) {
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`);
  const data = await res.json();
  const champs = [];
  for (const [key, c] of Object.entries(data.data)) {
    champs.push({ name: c.name, id: c.id, tags: c.tags || [] });
  }
  return champs;
}

// ── Mobalytics Sync (replaces Gemini-based fetchMetaBuildBatch) ──
function runMobalyticsSync() {
  log('INFO', 'Running Mobalytics meta sync...');
  const syncScript = path.join(__dirname, 'sync-mobalytics.cjs');
  execSync(`node ${syncScript}`, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf-8',
    stdio: 'inherit',
    timeout: 600000, // 10 min timeout
  });
  log('INFO', 'Mobalytics sync completed successfully');

  log('INFO', 'Running Mobalytics ARAM/Mayhem mode sync...');
  const modeSyncScript = path.join(__dirname, 'sync-mobalytics-modes.cjs');
  execSync(`node ${modeSyncScript}`, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf-8',
    stdio: 'inherit',
    timeout: 600000,
  });
  log('INFO', 'Mobalytics mode sync completed successfully');
}

// ── Fetch augments master list ──
async function fetchAugmentsMasterList(genAI, patch) {
  log('INFO', 'Fetching ARAM Mayhem augments master list...');
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [{ googleSearch: {} }],
  });

  const prompt = `Search for the complete list of ALL augments in League of Legends ARAM: Mayhem mode (also called ARAM Augments / Howling Abyss augments). This mode uses Arena-style augments.

Return a JSON object with ALL augments:
{
  "patch": "${patch}",
  "fetchedAt": "${new Date().toISOString()}",
  "augments": [
    {
      "name": "Augment Name",
      "tier": "Silver|Gold|Prismatic",
      "effect": "Short description of what it does",
      "set": "Set name if part of a set, null otherwise"
    }
  ]
}

Rules:
- Include ALL augments from all tiers (Silver, Gold, Prismatic)
- tier must be exactly "Silver", "Gold", or "Prismatic"
- effect: 1-2 sentences max
- Return ONLY raw JSON, no markdown, no code blocks
- Be comprehensive — include every augment you can find`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleanJson = text.replace(/^```(json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '').trim();
  return JSON.parse(cleanJson);
}

// ── Quality Control ──
const VALID_ROLES = new Set(['top', 'jungle', 'mid', 'adc', 'support']);
const VALID_KEYSTONES = new Set([
  'press the attack', 'lethal tempo', 'fleet footwork', 'conqueror',
  'electrocute', 'predator', 'dark harvest', 'hail of blades',
  'summon aery', 'arcane comet', 'phase rush',
  'grasp of the undying', 'aftershock', 'guardian',
  'glacial augment', 'unsealed spellbook', 'first strike',
]);

function qcFile(filePath) {
  const issues = [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!data.champion) issues.push('missing champion');
    if (!data.role) issues.push('missing role');
    if (!data.metaBuild) issues.push('missing metaBuild');

    const role = (data.role || '').toLowerCase();
    if (!VALID_ROLES.has(role)) issues.push(`bad role: ${data.role}`);

    if (data.metaBuild) {
      const mb = data.metaBuild;
      if (typeof mb.winRate === 'number' && (mb.winRate < 35 || mb.winRate > 70))
        issues.push(`winRate: ${mb.winRate}`);
      if (typeof mb.pickRate === 'number' && (mb.pickRate < 0 || mb.pickRate > 40))
        issues.push(`pickRate: ${mb.pickRate}`);
      if (mb.keystone && !VALID_KEYSTONES.has(mb.keystone.toLowerCase()))
        issues.push(`keystone: ${mb.keystone}`);
      if (!mb.coreItems || mb.coreItems.length < 2)
        issues.push('few coreItems');
      if (!mb.startingItems || mb.startingItems.length !== 2)
        issues.push('startingItems count');
      if (!mb.boots || mb.boots.length < 3)
        issues.push('missing boots');
      if (!mb.skillOrder || !mb.skillOrder.includes('>'))
        issues.push('bad skillOrder');
    }
  } catch (err) {
    issues.push(`parse: ${err.message}`);
  }
  return issues;
}

// ── Git helpers ──
function gitExec(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function ensureRepo() {
  if (!fs.existsSync(path.join(DATA_DIR, '.git'))) {
    log('INFO', 'Cloning data branch...');
    execSync(`git clone --single-branch --branch data https://github.com/Sliv3er/DraftCoach.git repo`, {
      cwd: WORK_DIR, encoding: 'utf-8',
    });
  } else {
    log('INFO', 'Pulling latest data branch...');
    gitExec('git pull origin data', DATA_DIR);
  }
}

function pushData(patchVer, buildCount) {
  gitExec('git add data/', DATA_DIR);
  const status = gitExec('git status --porcelain', DATA_DIR);
  if (!status) {
    log('INFO', 'No changes to push');
    return false;
  }
  gitExec(`git commit -m "auto: patch ${patchVer} — ${buildCount} builds synced"`, DATA_DIR);
  gitExec('git push origin data', DATA_DIR);
  log('INFO', `Pushed to data branch: ${buildCount} builds for patch ${patchVer}`);
  return true;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  log('INFO', '═══════════════════════════════════════════════════');
  log('INFO', '  DraftCoach Auto Patch Sync');
  log('INFO', '═══════════════════════════════════════════════════');

  // 1. Check current patch
  const fullPatch = await getCurrentPatch();
  const patch = patchShort(fullPatch);
  log('INFO', `Current DDragon patch: ${fullPatch} (${patch})`);

  // 2. Compare with last synced
  const state = loadState();
  if (!FORCE && state.lastSyncedPatch === patch) {
    log('INFO', `Already synced for patch ${patch} (last: ${state.lastSyncAt}). Skipping.`);
    return;
  }

  if (FORCE) {
    log('INFO', 'Force mode — re-syncing regardless of patch version');
  } else {
    log('INFO', `New patch detected! ${state.lastSyncedPatch || 'none'} → ${patch}`);
  }

  // 3. Ensure repo
  for (const d of [WORK_DIR, META_DIR, AUGMENTS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  ensureRepo();
  // Ensure output dirs exist in the repo
  for (const d of [META_DIR, AUGMENTS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  // 4. Run Mobalytics sync (writes to shared/kb/data/)
  try {
    runMobalyticsSync();
  } catch (err) {
    log('ERROR', `Mobalytics sync failed: ${err.message}`);
    process.exit(1);
  }

  // 5. Copy KB files to data repo if paths differ
  const kbDir = path.resolve(__dirname, '../shared/kb/data');
  if (fs.existsSync(kbDir) && kbDir !== META_DIR) {
    for (const f of [
      'build-templates.json',
      'rune-templates.json',
      'build-templates-aram.json',
      'build-templates-aram-mayhem.json',
      'rune-templates-aram.json',
      'rune-templates-aram-mayhem.json',
      'augment-templates.json',
      'augments-master.json',
    ]) {
      const src = path.join(kbDir, f);
      if (fs.existsSync(src)) {
        const dest = path.join(DATA_DIR, 'data', 'kb', f);
        if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        log('INFO', `Copied ${f} to data repo`);
      }
    }
  }

  // 6. Read sync results
  const buildTemplates = JSON.parse(fs.readFileSync(path.join(kbDir, 'build-templates.json'), 'utf-8'));
  const totalCached = Object.keys(buildTemplates.data).length;
  const aramTemplates = fs.existsSync(path.join(kbDir, 'build-templates-aram.json'))
    ? JSON.parse(fs.readFileSync(path.join(kbDir, 'build-templates-aram.json'), 'utf-8'))
    : { data: {} };
  const mayhemTemplates = fs.existsSync(path.join(kbDir, 'build-templates-aram-mayhem.json'))
    ? JSON.parse(fs.readFileSync(path.join(kbDir, 'build-templates-aram-mayhem.json'), 'utf-8'))
    : { data: {} };
  const augmentTemplates = fs.existsSync(path.join(kbDir, 'augment-templates.json'))
    ? JSON.parse(fs.readFileSync(path.join(kbDir, 'augment-templates.json'), 'utf-8'))
    : { data: {} };
  log('INFO', `Meta sync complete: ${totalCached} build entries`);

  // 7. QC — validate the generated KB files
  log('INFO', '─── Quality Control ───');
  const btData = buildTemplates.data;
  let qcPassed = 0, qcFailed = 0;
  for (const [key, entry] of Object.entries(btData)) {
    const v = entry.variants?.DAMAGE;
    if (v?.runes?.primaryKeystone && v?.coreItems?.length >= 2) {
      qcPassed++;
    } else {
      qcFailed++;
      if (qcFailed <= 5) log('WARN', `QC fail: ${key} — missing runes or items`);
    }
  }
  log('INFO', `QC: ${qcPassed} passed, ${qcFailed} failed out of ${Object.keys(btData).length}`);

  // 8. Write manifest
  const manifest = {
    patch,
    generatedAt: new Date().toISOString(),
    champCount: totalCached,
    modes: {
      sr: totalCached,
      aram: Object.keys(aramTemplates.data || {}).length,
      aramMayhem: Object.keys(mayhemTemplates.data || {}).length,
      augmentChampions: Object.keys(augmentTemplates.data || {}).length,
    },
    qcPassed,
    qcFailed,
    source: 'mobalytics-auto-sync',
  };
  fs.mkdirSync(path.join(DATA_DIR, 'data', 'kb'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'data', 'kb', 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  if (fs.existsSync(META_DIR)) fs.writeFileSync(path.join(META_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // 11. Push to GitHub
  try {
    const pushed = pushData(patch, totalCached);
    if (pushed) {
      log('INFO', 'Successfully pushed to GitHub data branch');
    }
  } catch (err) {
    log('ERROR', `Git push failed: ${err.message}`);
  }

  // 12. Update state
  state.lastSyncedPatch = patch;
  state.lastSyncAt = new Date().toISOString();
  state.syncCount = (state.syncCount || 0) + 1;
  state.lastResult = { totalCached, qcPassed, qcFailed, modes: manifest.modes };
  saveState(state);

  log('INFO', '═══════════════════════════════════════════════════');
  log('INFO', `Done! Patch ${patch}: SR ${totalCached}, ARAM ${manifest.modes.aram}, Mayhem ${manifest.modes.aramMayhem}, Augments ${manifest.modes.augmentChampions}, QC ${qcPassed}/${Object.keys(btData).length}`);
  log('INFO', '═══════════════════════════════════════════════════');
}

main().catch(err => {
  log('FATAL', err.stack || err.message);
  process.exit(1);
});
