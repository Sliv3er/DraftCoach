// DraftCoach — AI Build Quality & Performance Test
// Tests multiple champion/role combos, validates output against DDragon,
// measures response time, and generates a summary report.

const http = require('http');
const https = require('https');

// ── Test Cases ──
const TEST_CASES = [
  { myChampion: 'Darius', role: 'top', allies: ['LeeSin', 'Ahri', 'Jinx', 'Thresh'], enemies: ['Garen', 'Elise', 'Syndra', 'Lucian', 'Blitzcrank'] },
  { myChampion: 'Jinx', role: 'adc', allies: ['Ornn', 'Viego', 'Viktor', 'Lulu'], enemies: ['Yone', 'Graves', 'Zed', 'Kaisa', 'Nautilus'] },
  { myChampion: 'LeeSin', role: 'jungle', allies: ['Jax', 'Ahri', 'Ezreal', 'Thresh'], enemies: ['Malphite', 'KhaZix', 'Syndra', 'Vayne', 'Leona'] },
  { myChampion: 'Lux', role: 'support', allies: ['Sion', 'Viego', 'Viktor', 'Jinx'], enemies: ['Darius', 'Nidalee', 'Zed', 'MissFortune', 'Pyke'] },
];

const MODELS = ['gemini-3.1-pro-preview'];

// ── DDragon Data ──
async function fetchDDragonData() {
  return new Promise((resolve, reject) => {
    https.get('https://ddragon.leagueoflegends.com/api/versions.json', (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const ver = JSON.parse(body)[0];
        // Fetch runes
        https.get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/runesReforged.json`, (runeRes) => {
          let runeBody = '';
          runeRes.on('data', d => runeBody += d);
          runeRes.on('end', () => {
            const runeData = JSON.parse(runeBody);
            // Fetch items
            https.get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`, (itemRes) => {
              let itemBody = '';
              itemRes.on('data', d => itemBody += d);
              itemRes.on('end', () => {
                const itemData = JSON.parse(itemBody);
                
                // Extract all valid rune names
                const allRunes = new Set();
                const allTrees = new Set();
                const allKeystones = new Set();
                for (const tree of runeData) {
                  allTrees.add(tree.name);
                  for (const slot of tree.slots) {
                    for (const rune of slot.runes) {
                      allRunes.add(rune.name);
                      if (tree.slots.indexOf(slot) === 0) allKeystones.add(rune.name);
                    }
                  }
                }
                // Extract all valid item names
                const allItems = new Set();
                for (const [id, d] of Object.entries(itemData.data)) {
                  allItems.add(d.name);
                }
                // Valid shards
                const validShards = new Set([
                  'Adaptive Force', 'Attack Speed', 'Ability Haste',
                  'Move Speed', 'Health Scaling',
                  'Health', 'Tenacity and Slow Resist', 'Armor', 'Magic Resist',
                ]);

                resolve({ ver, allRunes, allTrees, allKeystones, allItems, validShards });
              });
            });
          });
        });
      });
    }).on('error', reject);
  });
}

// ── Run Single Test ──
function runTest(testCase, model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ ...testCase, model });
    const options = {
      hostname: '127.0.0.1',
      port: 3210,
      path: '/api/build-stream',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const startTime = Date.now();
    let firstChunkTime = 0;
    let fullText = '';
    let patchUsed = '';
    let source = '';

    const req = http.request(options, (res) => {
      res.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.patchUsed) patchUsed = payload.patchUsed;
            if (payload.source) source = payload.source;
            if (payload.chunk) {
              if (firstChunkTime === 0) firstChunkTime = Date.now() - startTime;
              fullText += payload.chunk;
            }
            if (payload.corrected) fullText = payload.corrected;
            if (payload.fullText) fullText = payload.fullText;
          } catch (e) {}
        }
      });

      res.on('end', () => {
        resolve({
          totalTime: Date.now() - startTime,
          firstChunkTime: firstChunkTime || (Date.now() - startTime),
          fullText,
          patchUsed,
          status: res.statusCode,
          source,
        });
      });
    });

    req.on('error', (err) => {
      resolve({ totalTime: 0, firstChunkTime: 0, fullText: '', patchUsed: '', status: 0, error: err.message });
    });

    req.write(body);
    req.end();
  });
}

// ── Validation ──
function validateBuild(text, ddragon) {
  const issues = [];
  const warnings = [];

  // Check RUNES section exists
  if (!text.includes('RUNES')) issues.push('❌ Missing RUNES section');
  if (!text.includes('CORE BUILD')) issues.push('❌ Missing CORE BUILD section');
  if (!text.includes('SKILL ORDER')) warnings.push('⚠️ Missing SKILL ORDER section');
  if (!text.includes('YOUR POWER SPIKES')) warnings.push('⚠️ Missing YOUR POWER SPIKES section');

  // Validate keystone
  const keystoneMatch = text.match(/Keystone:\s*(.+)/);
  if (keystoneMatch) {
    const ks = keystoneMatch[1].trim();
    if (!ddragon.allKeystones.has(ks)) issues.push(`❌ Invalid keystone: "${ks}"`);
  } else {
    issues.push('❌ No keystone found');
  }

  // Validate tree names
  const primaryMatch = text.match(/Primary:\s*(.+)/);
  if (primaryMatch) {
    const tree = primaryMatch[1].trim();
    if (!ddragon.allTrees.has(tree)) issues.push(`❌ Invalid primary tree: "${tree}"`);
  }
  const secondaryMatch = text.match(/Secondary:\s*(.+)/);
  if (secondaryMatch) {
    const tree = secondaryMatch[1].trim();
    if (!ddragon.allTrees.has(tree)) issues.push(`❌ Invalid secondary tree: "${tree}"`);
  }

  // Validate individual runes in the RUNES block
  const runesSection = text.match(/RUNES\n([\s\S]*?)(?=\n(?:SUMMONERS|SKILL ORDER|\n\n))/);
  if (runesSection) {
    const lines = runesSection[1].split('\n');
    let runeCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Primary:') || trimmed.startsWith('Secondary:') || trimmed.startsWith('Keystone:') || trimmed.startsWith('Shards:')) continue;
      runeCount++;
      if (!ddragon.allRunes.has(trimmed)) {
        issues.push(`❌ Invalid rune: "${trimmed}"`);
      }
    }
    if (runeCount < 5) warnings.push(`⚠️ Only ${runeCount} runes found (expected 5-6)`);
  }

  // Validate shards
  const shardsMatch = text.match(/Shards:\s*(.+)/);
  if (shardsMatch) {
    const shards = shardsMatch[1].split(',').map(s => s.trim());
    for (const shard of shards) {
      if (shard && !ddragon.validShards.has(shard)) {
        issues.push(`❌ Invalid shard: "${shard}"`);
      }
    }
    if (shards.length !== 3) warnings.push(`⚠️ Expected 3 shards, got ${shards.length}`);
  } else {
    issues.push('❌ No shards found');
  }

  // Validate CORE BUILD items
  const coreSection = text.match(/CORE BUILD\n([\s\S]*?)(?=\n(?:SITUATIONAL|JUNGLE PATH|ENEMY POWER|WIN CONDITION|\n\n))/);
  let itemCount = 0;
  let hasBoots = false;
  if (coreSection) {
    const lines = coreSection[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^\d+[\.\)]\s*(.+?)(?:\s*\(.*\))?$/);
      if (match) {
        const itemName = match[1].trim();
        itemCount++;
        const lower = itemName.toLowerCase();
        if (lower.includes('boots') || lower.includes('greaves') || lower.includes('treads') || lower.includes('swiftness') || lower.includes('plated') || lower.includes('ionian') || lower.includes('sorcerer')) {
          hasBoots = true;
        }
        // Check if item exists (case-insensitive)
        const exists = [...ddragon.allItems].some(v => v.toLowerCase() === lower);
        if (!exists) {
          issues.push(`❌ Invalid item: "${itemName}"`);
        }
      }
    }
    if (itemCount < 5) warnings.push(`⚠️ Only ${itemCount} core items (expected 6-7)`);
  }

  // Check for boots
  if (!hasBoots && !text.toLowerCase().includes('magical footwear') && !text.toLowerCase().includes('quest boot')) {
    warnings.push('⚠️ No boots found in core build');
  }

  return { issues, warnings, itemCount, hasBoots };
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   DraftCoach AI Build Quality & Performance Test');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('Fetching DDragon data for validation...');
  const ddragon = await fetchDDragonData();
  console.log(`DDragon v${ddragon.ver}: ${ddragon.allRunes.size} runes, ${ddragon.allItems.size} items, ${ddragon.allTrees.size} trees\n`);

  const allResults = [];

  for (const model of MODELS) {
    console.log(`\n══ Model: ${model} ══\n`);

    for (const testCase of TEST_CASES) {
      const label = `${testCase.myChampion} ${testCase.role}`;
      process.stdout.write(`  Testing ${label} ...`);

      const result = await runTest(testCase, model);

      if (result.error || result.status !== 200) {
        console.log(` ❌ FAILED (${result.error || `status ${result.status}`})`);
        allResults.push({ label, model, error: result.error || `status ${result.status}` });
        continue;
      }

      const validation = validateBuild(result.fullText, ddragon);
      const errCount = validation.issues.length;
      const warnCount = validation.warnings.length;
      const icon = errCount === 0 ? '✅' : '❌';

      console.log(` ${icon} ${(result.totalTime / 1000).toFixed(1)}s | TTFT: ${(result.firstChunkTime / 1000).toFixed(1)}s | ${errCount} errors, ${warnCount} warnings | ${validation.itemCount} items`);

      if (errCount > 0 || warnCount > 0) {
        for (const issue of validation.issues) console.log(`     ${issue}`);
        for (const warn of validation.warnings) console.log(`     ${warn}`);
      }

      allResults.push({
        label, model, totalTime: result.totalTime, firstChunkTime: result.firstChunkTime,
        errors: errCount, warnings: warnCount, issues: validation.issues, warns: validation.warnings,
        itemCount: validation.itemCount, hasBoots: validation.hasBoots, patchUsed: result.patchUsed,
      });
    }
  }

  // ── Summary Report ──
  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('                SUMMARY REPORT');
  console.log('═══════════════════════════════════════════════════\n');

  const successful = allResults.filter(r => !r.error);
  const failed = allResults.filter(r => r.error);
  const withErrors = successful.filter(r => r.errors > 0);
  const clean = successful.filter(r => r.errors === 0);

  console.log(`Total tests: ${allResults.length}`);
  console.log(`✅ Clean: ${clean.length} | ❌ Errors: ${withErrors.length} | 💀 Failed: ${failed.length}`);

  if (successful.length > 0) {
    const avgTime = successful.reduce((s, r) => s + r.totalTime, 0) / successful.length;
    const avgTTFT = successful.reduce((s, r) => s + r.firstChunkTime, 0) / successful.length;
    const minTime = Math.min(...successful.map(r => r.totalTime));
    const maxTime = Math.max(...successful.map(r => r.totalTime));

    console.log(`\nPerformance:`);
    console.log(`  Avg total: ${(avgTime / 1000).toFixed(1)}s | Avg TTFT: ${(avgTTFT / 1000).toFixed(1)}s`);
    console.log(`  Min: ${(minTime / 1000).toFixed(1)}s | Max: ${(maxTime / 1000).toFixed(1)}s`);

    const noBoots = successful.filter(r => !r.hasBoots);
    if (noBoots.length > 0) {
      console.log(`\n⚠️ Builds missing boots: ${noBoots.map(r => r.label).join(', ')}`);
    }

    // All unique errors across tests
    const allIssues = [];
    for (const r of withErrors) {
      for (const i of r.issues) {
        allIssues.push(`${r.label}: ${i}`);
      }
    }
    if (allIssues.length > 0) {
      console.log(`\nAll validation errors:`);
      for (const i of allIssues) console.log(`  ${i}`);
    }
  }
}

main().catch(console.error);
