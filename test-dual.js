// DraftCoach — Comprehensive Dual Pipeline E2E Test
// Tests: dual endpoint, streaming, validation, sections, timing, and data integrity

const http = require('http');
const https = require('https');

const TEST_CASES = [
  { myChampion: 'Darius', role: 'top', allies: ['LeeSin', 'Ahri', 'Jinx', 'Thresh'], enemies: ['Garen', 'Elise', 'Syndra', 'Lucian', 'Blitzcrank'] },
  { myChampion: 'Jinx', role: 'adc', allies: ['Ornn', 'Viego', 'Viktor', 'Lulu'], enemies: ['Yone', 'Graves', 'Zed', 'Kaisa', 'Nautilus'] },
  { myChampion: 'LeeSin', role: 'jungle', allies: ['Jax', 'Ahri', 'Ezreal', 'Thresh'], enemies: ['Malphite', 'KhaZix', 'Syndra', 'Vayne', 'Leona'] },
];

// Fetch DDragon data for validation
async function fetchDDragon() {
  return new Promise((resolve, reject) => {
    https.get('https://ddragon.leagueoflegends.com/api/versions.json', r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => {
        const ver = JSON.parse(b)[0];
        let pending = 3;
        const data = { ver, runes: new Set(), items: new Set(), summoners: new Set(), keystones: new Set() };
        const done = () => { if (--pending === 0) resolve(data); };

        https.get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/runesReforged.json`, r2 => {
          let b2 = ''; r2.on('data', d => b2 += d); r2.on('end', () => {
            for (const tree of JSON.parse(b2)) for (const slot of tree.slots) for (const rune of slot.runes) {
              data.runes.add(rune.name);
              if (tree.slots.indexOf(slot) === 0) data.keystones.add(rune.name);
            }
            done();
          });
        });

        https.get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`, r3 => {
          let b3 = ''; r3.on('data', d => b3 += d); r3.on('end', () => {
            for (const [, item] of Object.entries(JSON.parse(b3).data)) data.items.add(item.name);
            done();
          });
        });

        https.get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/summoner.json`, r4 => {
          let b4 = ''; r4.on('data', d => b4 += d); r4.on('end', () => {
            for (const [, spell] of Object.entries(JSON.parse(b4).data)) data.summoners.add(spell.name);
            done();
          });
        });
      });
    }).on('error', reject);
  });
}

// Run dual endpoint test
function testDual(tc) {
  return new Promise((resolve) => {
    const body = JSON.stringify(tc);
    const start = Date.now();
    const result = {
      runes: { ttft: 0, doneAt: 0, text: '' },
      full: { ttft: 0, doneAt: 0, text: '' },
      errors: [],
    };

    const req = http.request({
      hostname: '127.0.0.1', port: 3210, path: '/api/build-dual', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      if (res.statusCode !== 200) {
        result.errors.push(`HTTP ${res.statusCode}`);
        return resolve(result);
      }

      res.on('data', (d) => {
        for (const l of d.toString().split('\n')) {
          if (!l.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(l.slice(6));
            const t = Date.now() - start;

            if (p.phase === 'runes') {
              if (p.chunk && !result.runes.ttft) result.runes.ttft = t;
              if (p.corrected) result.runes.text = p.corrected;
              if (p.done) {
                result.runes.doneAt = t;
                result.runes.text = p.fullText || result.runes.text;
              }
            }

            if (p.phase === 'full') {
              if (p.chunk && !result.full.ttft) result.full.ttft = t;
              if (p.corrected) result.full.text = p.corrected;
              if (p.done) {
                result.full.doneAt = t;
                result.full.text = p.fullText || result.full.text;
              }
            }

            // Cache hit (no phase)
            if (!p.phase && p.chunk) {
              if (!result.full.ttft) result.full.ttft = t;
              result.full.text += p.chunk;
            }
            if (!p.phase && p.done) {
              result.full.doneAt = t;
              if (p.fullText) result.full.text = p.fullText;
            }
          } catch {}
        }
      });

      res.on('end', () => {
        result.totalTime = Date.now() - start;
        resolve(result);
      });
    });

    req.on('error', (e) => { result.errors.push(e.message); resolve(result); });
    req.write(body);
    req.end();
  });
}

// Validate sections exist
function validateSections(text, role, dd) {
  const issues = [];
  const warnings = [];

  // Required sections
  const required = ['RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS', 'ENEMY POWER SPIKES', 'YOUR POWER SPIKES', 'WIN CONDITION'];
  if (/^jungle$/i.test(role)) required.push('JUNGLE PATH');
  for (const s of required) {
    if (!text.includes(s)) issues.push(`Missing: ${s}`);
  }

  // Validate keystone
  const ks = text.match(/Keystone:\s*(.+)/);
  if (ks && !dd.keystones.has(ks[1].trim())) issues.push(`Bad keystone: "${ks[1].trim()}"`);

  // Validate summoners
  const sumSection = text.match(/SUMMONERS\n([\s\S]*?)(?=\nSKILL ORDER)/);
  if (sumSection) {
    for (const line of sumSection[1].split('\n')) {
      const t = line.trim();
      if (t && !dd.summoners.has(t)) issues.push(`Bad summoner: "${t}"`);
    }
  }

  // Validate core build items
  const coreSection = text.match(/CORE BUILD\n([\s\S]*?)(?=\n(?:SITUATIONAL|JUNGLE|ENEMY|YOUR|WIN|\n\n))/);
  let itemCount = 0;
  if (coreSection) {
    for (const line of coreSection[1].split('\n')) {
      const m = line.match(/^\d+[.)]\s*(.+?)(?:\s*\(.*\))?$/);
      if (m) {
        itemCount++;
        const exists = [...dd.items].some(v => v.toLowerCase() === m[1].trim().toLowerCase());
        if (!exists) issues.push(`Bad item: "${m[1].trim()}"`);
      }
    }
  }

  // Item count check
  const isBot = /^(adc|bottom|bot)$/i.test(role);
  const expected = isBot ? 7 : 6;
  if (itemCount !== expected) warnings.push(`Expected ${expected} core items, got ${itemCount}`);

  // Validate shards
  const shardsMatch = text.match(/Shards:\s*(.+)/);
  const validShards = new Set(['Adaptive Force', 'Attack Speed', 'Ability Haste', 'Move Speed', 'Health Scaling', 'Health', 'Tenacity and Slow Resist', 'Armor', 'Magic Resist']);
  if (shardsMatch) {
    for (const s of shardsMatch[1].split(',').map(s => s.trim())) {
      if (s && !validShards.has(s)) issues.push(`Bad shard: "${s}"`);
    }
  }

  return { issues, warnings, itemCount };
}

async function main() {
  console.log('==============================================================');
  console.log('   DUAL PIPELINE — Comprehensive End-to-End Test');
  console.log('==============================================================\n');

  const dd = await fetchDDragon();
  console.log(`DDragon v${dd.ver}: ${dd.runes.size} runes, ${dd.items.size} items, ${dd.summoners.size} summoners\n`);

  let totalIssues = 0;
  let totalWarnings = 0;
  let totalTests = 0;

  for (const tc of TEST_CASES) {
    totalTests++;
    const label = `${tc.myChampion} ${tc.role}`;
    process.stdout.write(`\nTesting ${label} ... `);

    const r = await testDual(tc);

    if (r.errors.length > 0) {
      console.log('FAILED:', r.errors.join(', '));
      totalIssues += r.errors.length;
      continue;
    }

    const isCached = !r.runes.text && r.full.doneAt < 1000;

    // For cached results, only validate the full text
    const fullText = r.full.text;

    if (!fullText || fullText.length < 100) {
      console.log('FAILED: Empty or too short response');
      totalIssues++;
      continue;
    }

    const v = validateSections(fullText, tc.role, dd);

    // Check runes phase (non-cached only)
    const runesPhaseOk = isCached || r.runes.doneAt > 0;
    const fullPhaseOk = r.full.doneAt > 0;

    const icon = v.issues.length === 0 ? 'PASS' : 'FAIL';
    console.log(icon);

    // Timing
    if (isCached) {
      console.log(`  [cached] Total: ${(r.totalTime / 1000).toFixed(1)}s`);
    } else {
      console.log(`  Runes TTFT: ${(r.runes.ttft / 1000).toFixed(1)}s | Done: ${(r.runes.doneAt / 1000).toFixed(1)}s (${r.runes.text.length} chars)`);
      console.log(`  Full  TTFT: ${(r.full.ttft / 1000).toFixed(1)}s | Done: ${(r.full.doneAt / 1000).toFixed(1)}s (${r.full.text.length} chars)`);
    }

    // Sections
    console.log(`  Items: ${v.itemCount} | Issues: ${v.issues.length} | Warnings: ${v.warnings.length}`);

    // Data integrity checks
    const checks = [];
    if (fullText.includes('CORE BUILD')) checks.push('CORE BUILD present');
    else checks.push('CORE BUILD MISSING!');
    if (fullText.includes('YOUR POWER SPIKES')) checks.push('POWER SPIKES present');
    else checks.push('POWER SPIKES MISSING!');
    if (fullText.includes('WIN CONDITION')) checks.push('WIN CONDITION present');
    else checks.push('WIN CONDITION MISSING!');

    // Verify overlay/advisor would get correct data
    const overlayCheck = fullText.includes('CORE BUILD') ? 'Overlay would get items' : 'Overlay would be EMPTY!';
    const advisorCheck = fullText.includes('CORE BUILD') ? 'Advisor would get full build' : 'Advisor would lack items!';
    console.log(`  Data: ${overlayCheck} | ${advisorCheck}`);

    if (v.issues.length > 0) {
      console.log('  ISSUES:');
      v.issues.forEach(i => console.log(`    - ${i}`));
    }
    if (v.warnings.length > 0) {
      console.log('  WARNINGS:');
      v.warnings.forEach(w => console.log(`    - ${w}`));
    }

    totalIssues += v.issues.length;
    totalWarnings += v.warnings.length;
  }

  console.log('\n==============================================================');
  console.log('                        SUMMARY');
  console.log('==============================================================');
  console.log(`Tests: ${totalTests} | Issues: ${totalIssues} | Warnings: ${totalWarnings}`);
  console.log(totalIssues === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
}

main().catch(console.error);
