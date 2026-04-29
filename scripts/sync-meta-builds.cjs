/**
 * Full Meta Build Sync + Quality Control
 * Fetches meta builds for ALL champions via Gemini + Google Search grounding.
 * Then validates every file with strict QC rules.
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { GoogleGenerativeAI } = require(require('path').resolve(__dirname, '../apps/desktop/node_modules/@google/generative-ai'));
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('ERROR: GEMINI_API_KEY not set'); process.exit(1); }
const genAI = new GoogleGenerativeAI(API_KEY);

const OUT_DIR = path.resolve(__dirname, '../data/meta-builds/sr');
const AUGMENTS_DIR = path.resolve(__dirname, '../data/augments');

// ── Ensure output dirs ──
for (const d of [OUT_DIR, AUGMENTS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Fetch DDragon champion list ──
async function getAllChampions() {
  const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions = await vRes.json();
  const ver = versions[0];
  const cRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`);
  const cData = await cRes.json();
  const champs = [];
  for (const [key, c] of Object.entries(cData.data)) {
    champs.push({ name: c.name, id: c.id, tags: c.tags || [] });
  }
  return { champs, patch: ver };
}

// ── Batch fetch meta builds (top 2 roles per champion) ──
async function fetchMetaBuildBatch(champions, patch) {
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

// ── Fetch ARAM Mayhem augments master list ──
async function fetchAugmentsMasterList(patch) {
  console.log('\n[Augments] Fetching master augment list via Google Search grounding...');
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [{ googleSearch: {} }],
  });

  const prompt = `Search for the complete list of ALL augments in League of Legends ARAM: Mayhem mode (also called ARAM Augments / Howling Abyss augments). This mode uses Arena-style augments.

Return a JSON object with ALL augments:
{
  "patch": "${patch}",
  "fetchedAt": "ISO date",
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
- set: if the augment belongs to a themed set (e.g. "Bruiser", "Marksman"), include it
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
  const fileName = path.basename(filePath);

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    // Structure checks
    if (!data.champion) issues.push('missing champion field');
    if (!data.role) issues.push('missing role field');
    if (!data.metaBuild) issues.push('missing metaBuild field');
    if (!data.patch) issues.push('missing patch field');

    // Role check
    const role = (data.role || '').toLowerCase();
    if (!VALID_ROLES.has(role)) issues.push(`invalid role: "${data.role}"`);

    // Filename consistency
    const expectedFile = `${data.champion}_${role}.json`;
    if (fileName !== expectedFile) issues.push(`filename mismatch: ${fileName} vs ${expectedFile}`);

    if (data.metaBuild) {
      const mb = data.metaBuild;

      // Win rate sanity (40-65% is normal)
      if (typeof mb.winRate === 'number' && (mb.winRate < 35 || mb.winRate > 70)) {
        issues.push(`suspicious winRate: ${mb.winRate}%`);
      }

      // Pick rate sanity (0.1-30% is normal)
      if (typeof mb.pickRate === 'number' && (mb.pickRate < 0 || mb.pickRate > 40)) {
        issues.push(`suspicious pickRate: ${mb.pickRate}%`);
      }

      // Keystone validation
      if (mb.keystone && !VALID_KEYSTONES.has(mb.keystone.toLowerCase())) {
        issues.push(`invalid keystone: "${mb.keystone}"`);
      }

      // Core items count
      if (!mb.coreItems || !Array.isArray(mb.coreItems) || mb.coreItems.length < 2) {
        issues.push(`coreItems count: ${mb.coreItems?.length || 0}`);
      }

      // Starting items count
      if (!mb.startingItems || !Array.isArray(mb.startingItems) || mb.startingItems.length !== 2) {
        issues.push(`startingItems count: ${mb.startingItems?.length || 0}`);
      }

      // Boots check
      if (!mb.boots || mb.boots.length < 3) {
        issues.push('missing/empty boots');
      }

      // Skill order check
      if (!mb.skillOrder || !mb.skillOrder.includes('>')) {
        issues.push(`bad skillOrder: "${mb.skillOrder || ''}"`);
      }

      // Tree check
      if (mb.primaryTree && mb.secondaryTree && mb.primaryTree === mb.secondaryTree) {
        issues.push(`same trees: ${mb.primaryTree}`);
      }
    }
  } catch (err) {
    issues.push(`parse error: ${err.message}`);
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FULL META BUILD SYNC + AUGMENTS + QUALITY CONTROL');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Get all champions
  const { champs, patch } = await getAllChampions();
  const patchShort = patch.split('.').slice(0, 2).join('.');
  console.log(`Patch: ${patchShort} | Champions: ${champs.length}\n`);

  // 2. Batch fetch meta builds (10 per batch)
  const BATCH_SIZE = 10;
  let totalCached = 0;
  let batchErrors = 0;

  for (let i = 0; i < champs.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(champs.length / BATCH_SIZE);
    const batch = champs.slice(i, i + BATCH_SIZE);
    const names = batch.map(c => c.name).join(', ');
    process.stdout.write(`[Batch ${batchNum}/${totalBatches}] ${names}... `);

    try {
      const results = await fetchMetaBuildBatch(batch, patchShort);

      if (Array.isArray(results)) {
        for (const entry of results) {
          if (!entry.champion || !entry.role || !entry.metaBuild) continue;

          // Normalize champion ID
          let champId = entry.champion;
          const champMatch = champs.find(c => c.name === entry.champion);
          if (champMatch) champId = champMatch.id;

          // Normalize role
          const role = entry.role.toLowerCase().replace('bottom', 'adc').replace('bot', 'adc');
          const normalizedRole = VALID_ROLES.has(role) ? role : entry.role.toLowerCase();

          const outFile = path.join(OUT_DIR, `${champId}_${normalizedRole}.json`);
          const outData = {
            champion: champId,
            championName: entry.champion,
            role: normalizedRole,
            patch: patchShort,
            fetchedAt: new Date().toISOString(),
            metaBuild: entry.metaBuild,
          };
          fs.writeFileSync(outFile, JSON.stringify(outData, null, 2), 'utf-8');
          totalCached++;
        }
        console.log(`OK (${results.length} builds)`);
      } else {
        console.log('WARN: not an array');
        batchErrors++;
      }
    } catch (err) {
      console.log(`ERR: ${err.message.slice(0, 60)}`);
      batchErrors++;
    }

    // Rate limit
    if (i + BATCH_SIZE < champs.length) {
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  console.log(`\nMeta builds synced: ${totalCached} | Batch errors: ${batchErrors}\n`);

  // 3. Fetch augments master list
  try {
    const augData = await fetchAugmentsMasterList(patchShort);
    if (augData && augData.augments) {
      augData.fetchedAt = new Date().toISOString();
      augData.patch = patchShort;
      const augFile = path.join(AUGMENTS_DIR, 'augments-master.json');
      fs.writeFileSync(augFile, JSON.stringify(augData, null, 2), 'utf-8');
      console.log(`[Augments] Cached ${augData.augments.length} augments to ${augFile}`);
    }
  } catch (err) {
    console.log(`[Augments] ERR: ${err.message}`);
  }

  // 4. Quality Control
  console.log('\n' + '═'.repeat(60));
  console.log('  QUALITY CONTROL');
  console.log('═'.repeat(60) + '\n');

  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
  let qcPassed = 0, qcFailed = 0;
  const failures = [];

  for (const file of files) {
    const issues = qcFile(path.join(OUT_DIR, file));
    if (issues.length === 0) {
      qcPassed++;
    } else {
      qcFailed++;
      failures.push({ file, issues });
    }
  }

  console.log(`QC: ${qcPassed} PASSED, ${qcFailed} FAILED out of ${files.length} files\n`);

  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${f.file}: ${f.issues.join(', ')}`);
    }
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
  }

  // 5. Write manifest
  const manifest = {
    patch: patchShort,
    generatedAt: new Date().toISOString(),
    champCount: totalCached,
    fileCount: files.length,
    qcPassed,
    qcFailed,
    source: 'gemini-grounding-search',
  };
  fs.writeFileSync(path.join(OUT_DIR, '..', 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`\nManifest written. Total: ${totalCached} champion builds cached.`);
  console.log('═'.repeat(60));
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
