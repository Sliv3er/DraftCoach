// DraftCoach — Flash vs Pro Head-to-Head Comparison
// Runs 3 identical test cases on both models, compares timing, accuracy, and build quality.

const http = require('http');
const https = require('https');

const TEST_CASES = [
  { myChampion: 'Darius', role: 'top', allies: ['LeeSin', 'Ahri', 'Jinx', 'Thresh'], enemies: ['Garen', 'Elise', 'Syndra', 'Lucian', 'Blitzcrank'] },
  { myChampion: 'Jinx', role: 'adc', allies: ['Ornn', 'Viego', 'Viktor', 'Lulu'], enemies: ['Yone', 'Graves', 'Zed', 'Kaisa', 'Nautilus'] },
  { myChampion: 'LeeSin', role: 'jungle', allies: ['Jax', 'Ahri', 'Ezreal', 'Thresh'], enemies: ['Malphite', 'KhaZix', 'Syndra', 'Vayne', 'Leona'] },
];

const MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
];

// ── DDragon Data ──
async function fetchDDragonData() {
  return new Promise((resolve, reject) => {
    https.get('https://ddragon.leagueoflegends.com/api/versions.json', (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const ver = JSON.parse(body)[0];
        https.get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/runesReforged.json`, (runeRes) => {
          let runeBody = '';
          runeRes.on('data', d => runeBody += d);
          runeRes.on('end', () => {
            const runeData = JSON.parse(runeBody);
            https.get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`, (itemRes) => {
              let itemBody = '';
              itemRes.on('data', d => itemBody += d);
              itemRes.on('end', () => {
                const itemData = JSON.parse(itemBody);
                const allRunes = new Set();
                const allKeystones = new Set();
                for (const tree of runeData) {
                  for (const slot of tree.slots) {
                    for (const rune of slot.runes) {
                      allRunes.add(rune.name);
                      if (tree.slots.indexOf(slot) === 0) allKeystones.add(rune.name);
                    }
                  }
                }
                const allItems = new Set();
                for (const [id, d] of Object.entries(itemData.data)) allItems.add(d.name);
                const validShards = new Set([
                  'Adaptive Force', 'Attack Speed', 'Ability Haste',
                  'Move Speed', 'Health Scaling',
                  'Health', 'Tenacity and Slow Resist', 'Armor', 'Magic Resist',
                ]);
                resolve({ ver, allRunes, allKeystones, allItems, validShards });
              });
            });
          });
        });
      });
    }).on('error', reject);
  });
}

// ── Run Single Streaming Test ──
function runTest(testCase, model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ ...testCase, model });
    const options = {
      hostname: '127.0.0.1', port: 3210, path: '/api/build-stream', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const startTime = Date.now();
    let firstChunkTime = 0, fullText = '', patchUsed = '', source = '';

    const req = http.request(options, (res) => {
      res.on('data', (d) => {
        for (const line of d.toString().split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.patchUsed) patchUsed = p.patchUsed;
            if (p.source) source = p.source;
            if (p.chunk) { if (!firstChunkTime) firstChunkTime = Date.now() - startTime; fullText += p.chunk; }
            if (p.corrected) fullText = p.corrected;
            if (p.fullText) fullText = p.fullText;
          } catch {}
        }
      });
      res.on('end', () => {
        resolve({ totalTime: Date.now() - startTime, ttft: firstChunkTime || (Date.now() - startTime), fullText, patchUsed, source, status: res.statusCode });
      });
    });
    req.on('error', (err) => resolve({ totalTime: 0, ttft: 0, fullText: '', patchUsed: '', source: '', status: 0, error: err.message }));
    req.write(body);
    req.end();
  });
}

// ── Extract sections for comparison ──
function extractSections(text) {
  const get = (name) => {
    const re = new RegExp(`${name}\\n([\\s\\S]*?)(?=\\n(?:${['RUNES','SUMMONERS','SKILL ORDER','STARTING ITEMS','CORE BUILD','SITUATIONAL','JUNGLE PATH','ENEMY POWER','YOUR POWER','WIN CONDITION'].join('|')})|$)`);
    const m = text.match(re);
    return m ? m[1].trim() : '(missing)';
  };
  return {
    runes: get('RUNES'),
    summoners: get('SUMMONERS'),
    skillOrder: get('SKILL ORDER'),
    startingItems: get('STARTING ITEMS'),
    coreBuild: get('CORE BUILD'),
    situational: get('SITUATIONAL ITEMS'),
    junglePath: get('JUNGLE PATH'),
    enemySpikes: get('ENEMY POWER SPIKES'),
    yourSpikes: get('YOUR POWER SPIKES'),
    winCondition: get('WIN CONDITION'),
  };
}

// ── Validate ──
function validate(text, dd) {
  const errors = [];
  const ksMatch = text.match(/Keystone:\s*(.+)/);
  if (ksMatch && !dd.allKeystones.has(ksMatch[1].trim())) errors.push(`Bad keystone: "${ksMatch[1].trim()}"`);

  const coreSection = text.match(/CORE BUILD\n([\s\S]*?)(?=\n(?:SITUATIONAL|JUNGLE|ENEMY|YOUR|WIN|\n\n))/);
  let itemCount = 0;
  if (coreSection) {
    for (const line of coreSection[1].split('\n')) {
      const m = line.match(/^\d+[.)]\s*(.+?)(?:\s*\(.*\))?$/);
      if (m) {
        itemCount++;
        const exists = [...dd.allItems].some(v => v.toLowerCase() === m[1].trim().toLowerCase());
        if (!exists) errors.push(`Bad item: "${m[1].trim()}"`);
      }
    }
  }

  const shardsMatch = text.match(/Shards:\s*(.+)/);
  if (shardsMatch) {
    for (const s of shardsMatch[1].split(',').map(s => s.trim())) {
      if (s && !dd.validShards.has(s)) errors.push(`Bad shard: "${s}"`);
    }
  }

  const hasPowerSpikes = text.includes('YOUR POWER SPIKES');
  const hasMatchup = text.includes('WIN CONDITION');
  return { errors, itemCount, hasPowerSpikes, hasMatchup };
}

// ── Main ──
async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('     ⚔️  FLASH vs PRO — Head-to-Head Build Comparison  ⚔️');
  console.log('══════════════════════════════════════════════════════════════\n');

  const dd = await fetchDDragonData();
  console.log(`DDragon v${dd.ver}: ${dd.allRunes.size} runes, ${dd.allItems.size} items\n`);

  const results = {}; // model -> [result, result, result]

  for (const model of MODELS) {
    const shortName = model.includes('flash') ? '⚡ FLASH' : '🧠 PRO';
    console.log(`\n────── ${shortName} (${model}) ──────\n`);
    results[model] = [];

    for (const tc of TEST_CASES) {
      const label = `${tc.myChampion} ${tc.role}`;
      process.stdout.write(`  ${label} ...`);
      const r = await runTest(tc, model);

      if (r.error || r.status !== 200) {
        console.log(` ❌ FAILED (${r.error || r.status})`);
        results[model].push({ label, error: true });
        continue;
      }

      const v = validate(r.fullText, dd);
      const sections = extractSections(r.fullText);
      const icon = v.errors.length === 0 ? '✅' : '❌';
      console.log(` ${icon} Total: ${(r.totalTime/1000).toFixed(1)}s | TTFT: ${(r.ttft/1000).toFixed(1)}s | ${v.errors.length} errors | ${v.itemCount} items | Spikes: ${v.hasPowerSpikes ? '✅' : '❌'}`);

      if (v.errors.length > 0) v.errors.forEach(e => console.log(`     ${e}`));

      results[model].push({ label, ...r, validation: v, sections });
    }
  }

  // ── Side-by-Side Comparison ──
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('                   SIDE-BY-SIDE COMPARISON');
  console.log('══════════════════════════════════════════════════════════════');

  for (let i = 0; i < TEST_CASES.length; i++) {
    const label = `${TEST_CASES[i].myChampion} ${TEST_CASES[i].role}`;
    const flash = results[MODELS[0]][i];
    const pro = results[MODELS[1]][i];

    console.log(`\n╔══ ${label.toUpperCase()} ══╗`);

    if (flash.error || pro.error) {
      console.log('  (one or both models failed)');
      continue;
    }

    // Timing
    console.log(`\n  ⏱  TIMING`);
    console.log(`  Flash: Total ${(flash.totalTime/1000).toFixed(1)}s | TTFT ${(flash.ttft/1000).toFixed(1)}s`);
    console.log(`  Pro:   Total ${(pro.totalTime/1000).toFixed(1)}s | TTFT ${(pro.ttft/1000).toFixed(1)}s`);
    const faster = flash.totalTime < pro.totalTime ? '⚡ Flash' : '🧠 Pro';
    console.log(`  Winner: ${faster} (${Math.abs(flash.totalTime - pro.totalTime) / 1000}s faster)`);

    // Runes
    console.log(`\n  🔮 RUNES`);
    console.log(`  Flash:\n    ${flash.sections.runes.split('\n').join('\n    ')}`);
    console.log(`  Pro:\n    ${pro.sections.runes.split('\n').join('\n    ')}`);

    // Core Build
    console.log(`\n  ⚔️  CORE BUILD`);
    console.log(`  Flash:\n    ${flash.sections.coreBuild.split('\n').join('\n    ')}`);
    console.log(`  Pro:\n    ${pro.sections.coreBuild.split('\n').join('\n    ')}`);

    // Power Spikes
    console.log(`\n  📈 YOUR POWER SPIKES`);
    console.log(`  Flash: ${flash.sections.yourSpikes || '(missing)'}`);
    console.log(`  Pro:   ${pro.sections.yourSpikes || '(missing)'}`);

    // Win Condition
    console.log(`\n  🏆 WIN CONDITION`);
    console.log(`  Flash: ${flash.sections.winCondition}`);
    console.log(`  Pro:   ${pro.sections.winCondition}`);

    // Accuracy
    console.log(`\n  ✅ ACCURACY`);
    console.log(`  Flash: ${flash.validation.errors.length} errors, ${flash.validation.itemCount} items`);
    console.log(`  Pro:   ${pro.validation.errors.length} errors, ${pro.validation.itemCount} items`);
  }

  // ── Summary ──
  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('                      FINAL SCORECARD');
  console.log('══════════════════════════════════════════════════════════════\n');

  for (const model of MODELS) {
    const shortName = model.includes('flash') ? '⚡ FLASH' : '🧠 PRO';
    const data = results[model].filter(r => !r.error);
    if (data.length === 0) { console.log(`${shortName}: All failed`); continue; }

    const avgTotal = data.reduce((s, r) => s + r.totalTime, 0) / data.length;
    const avgTTFT = data.reduce((s, r) => s + r.ttft, 0) / data.length;
    const totalErrors = data.reduce((s, r) => s + r.validation.errors.length, 0);
    const spikesCount = data.filter(r => r.validation.hasPowerSpikes).length;

    console.log(`${shortName} (${model})`);
    console.log(`  Avg Total: ${(avgTotal/1000).toFixed(1)}s | Avg TTFT: ${(avgTTFT/1000).toFixed(1)}s`);
    console.log(`  Total Errors: ${totalErrors} | Power Spikes: ${spikesCount}/${data.length}`);
    console.log('');
  }
}

main().catch(console.error);
