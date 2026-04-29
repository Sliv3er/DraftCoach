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

// ── Gemini setup ──
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  return new GoogleGenerativeAI(apiKey);
}

// ── Fetch meta builds (top 2 roles per champion) ──
async function fetchMetaBuildBatch(genAI, champions, patch) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [{ googleSearch: {} }],
  });

  const champList = champions.map((c, i) => `${i + 1}. ${c.name}`).join('\n');

  const prompt = `Search u.gg and op.gg for the highest winrate builds on League of Legends Patch ${patch} for these champions:
${champList}

For EACH champion, return builds for their TOP 2 MOST PLAYED ROLES (by pick rate).
If a champion is only meaningfully played in 1 role (e.g. Yuumi is only Support), return just 1 entry for that champion.

Return ONLY a compact JSON array (no markdown, no code blocks, just raw JSON):
[
  {
    "champion": "ChampionName",
    "role": "Top/Jungle/Mid/ADC/Support",
    "metaBuild": {
      "winRate": 52.3,
      "pickRate": 8.5,
      "keystone": "Lethal Tempo",
      "primaryTree": "Precision",
      "secondaryTree": "Domination",
      "startingItems": ["Doran's Blade", "Health Potion"],
      "coreItems": ["Kraken Slayer", "Phantom Dancer", "Infinity Edge"],
      "boots": "Berserker's Greaves",
      "skillOrder": "Q > W > E > R"
    }
  }
]

Rules:
- Return 2 entries per champion (one per role) when they have 2+ viable roles
- Return 1 entry if the champion only has 1 viable role
- winRate and pickRate as numbers (e.g. 52.3, not "52.3%")
- coreItems: the 3 most popular core items in build order
- startingItems: exactly 2 (1 starting item + 1 potion)
- boots: the most popular boots upgrade
- skillOrder: max priority format "Q > W > E > R"
- Use current patch ${patch} data, not outdated builds
- The secondary role must have meaningful pick rate (>1%). Do NOT invent off-meta roles.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleanJson = text.replace(/^```(json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '').trim();
  return JSON.parse(cleanJson);
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

  // 4. Get all champions
  const champs = await getAllChampions(fullPatch);
  log('INFO', `Champions: ${champs.length}`);

  // 5. Gemini setup
  const genAI = getGenAI();

  // 6. Batch sync
  let totalCached = 0;
  let batchErrors = 0;
  const failedChamps = [];

  for (let i = 0; i < champs.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(champs.length / BATCH_SIZE);
    const batch = champs.slice(i, i + BATCH_SIZE);
    const names = batch.map(c => c.name).join(', ');
    log('INFO', `[Batch ${batchNum}/${totalBatches}] ${names}`);

    try {
      const results = await fetchMetaBuildBatch(genAI, batch, patch);
      if (Array.isArray(results)) {
        for (const entry of results) {
          if (!entry.champion || !entry.role || !entry.metaBuild) continue;
          let champId = entry.champion;
          const champMatch = champs.find(c => c.name === entry.champion);
          if (champMatch) champId = champMatch.id;

          const role = entry.role.toLowerCase().replace('bottom', 'adc').replace('bot', 'adc');
          const normalizedRole = VALID_ROLES.has(role) ? role : entry.role.toLowerCase();

          const outFile = path.join(META_DIR, `${champId}_${normalizedRole}.json`);
          fs.writeFileSync(outFile, JSON.stringify({
            champion: champId,
            championName: entry.champion,
            role: normalizedRole,
            patch,
            fetchedAt: new Date().toISOString(),
            metaBuild: entry.metaBuild,
          }, null, 2), 'utf-8');
          totalCached++;
        }
        log('INFO', `  → ${results.length} builds OK`);
      }
    } catch (err) {
      log('ERROR', `  → Batch failed: ${err.message.slice(0, 80)}`);
      batchErrors++;
      failedChamps.push(...batch);
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < champs.length) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // 7. Retry failed batches (up to MAX_RETRIES)
  if (failedChamps.length > 0) {
    log('INFO', `Retrying ${failedChamps.length} failed champions...`);
    for (let retry = 0; retry < MAX_RETRIES && failedChamps.length > 0; retry++) {
      const toRetry = [...failedChamps];
      failedChamps.length = 0;

      for (let i = 0; i < toRetry.length; i += BATCH_SIZE) {
        const batch = toRetry.slice(i, i + BATCH_SIZE);
        try {
          await new Promise(r => setTimeout(r, 5000));
          const results = await fetchMetaBuildBatch(genAI, batch, patch);
          if (Array.isArray(results)) {
            for (const entry of results) {
              if (!entry.champion || !entry.role || !entry.metaBuild) continue;
              let champId = entry.champion;
              const champMatch = champs.find(c => c.name === entry.champion);
              if (champMatch) champId = champMatch.id;
              const role = entry.role.toLowerCase().replace('bottom', 'adc').replace('bot', 'adc');
              const normalizedRole = VALID_ROLES.has(role) ? role : role;

              fs.writeFileSync(path.join(META_DIR, `${champId}_${normalizedRole}.json`), JSON.stringify({
                champion: champId, championName: entry.champion, role: normalizedRole,
                patch, fetchedAt: new Date().toISOString(), metaBuild: entry.metaBuild,
              }, null, 2), 'utf-8');
              totalCached++;
            }
          }
        } catch {
          failedChamps.push(...batch);
        }
      }
      log('INFO', `  Retry ${retry + 1}: ${failedChamps.length} still failing`);
    }
  }

  log('INFO', `Meta sync complete: ${totalCached} builds, ${batchErrors} initial errors, ${failedChamps.length} unrecoverable`);

  // 8. Fetch augments
  try {
    const augData = await fetchAugmentsMasterList(genAI, patch);
    if (augData?.augments) {
      augData.fetchedAt = new Date().toISOString();
      augData.patch = patch;
      fs.writeFileSync(path.join(AUGMENTS_DIR, 'augments-master.json'), JSON.stringify(augData, null, 2), 'utf-8');
      log('INFO', `Augments: ${augData.augments.length} cached`);
    }
  } catch (err) {
    log('ERROR', `Augments fetch failed: ${err.message}`);
  }

  // 9. QC
  log('INFO', '─── Quality Control ───');
  const files = fs.readdirSync(META_DIR).filter(f => f.endsWith('.json'));
  let qcPassed = 0, qcFailed = 0;
  const qcFailures = [];

  for (const file of files) {
    const issues = qcFile(path.join(META_DIR, file));
    if (issues.length === 0) qcPassed++;
    else { qcFailed++; qcFailures.push({ file, issues }); }
  }

  log('INFO', `QC: ${qcPassed} passed, ${qcFailed} failed out of ${files.length}`);
  if (qcFailures.length > 0) {
    for (const f of qcFailures.slice(0, 10)) {
      log('WARN', `  ${f.file}: ${f.issues.join(', ')}`);
    }
  }

  // 10. Write manifest
  const manifest = {
    patch,
    generatedAt: new Date().toISOString(),
    champCount: totalCached,
    fileCount: files.length,
    qcPassed,
    qcFailed,
    source: 'auto-sync-vps',
  };
  fs.writeFileSync(path.join(DATA_DIR, 'data', 'meta-builds', 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

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
  state.lastResult = { totalCached, qcPassed, qcFailed, failedChamps: failedChamps.length };
  saveState(state);

  log('INFO', '═══════════════════════════════════════════════════');
  log('INFO', `Done! Patch ${patch}: ${totalCached} builds, QC ${qcPassed}/${files.length}`);
  log('INFO', '═══════════════════════════════════════════════════');
}

main().catch(err => {
  log('FATAL', err.stack || err.message);
  process.exit(1);
});
