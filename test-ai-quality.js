/**
 * End-to-End AI Quality Stress Test
 * ──────────────────────────────────
 * Calls Gemini Flash with the FULL production pipeline (system prompt +
 * dynamic DDragon mechanics + valid items) and validates output quality.
 *
 * Run: node test-ai-quality.js
 * Requires: GEMINI_API_KEY in .env or environment
 */

'use strict';

require('dotenv').config();
const https = require('https');
const _prompts = require('./apps/desktop/src/main/prompt-builder');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('❌ GEMINI_API_KEY not set'); process.exit(1); }

let passed = 0, failed = 0, warnings = 0;

function assert(ok, name, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function warn(name) { warnings++; console.log(`  ⚠️  ${name}`); }
function section(t) { console.log(`\n${'─'.repeat(60)}\n── ${t}\n${'─'.repeat(60)}`); }

// ── DDragon item fetcher (replicates main.js logic) ─────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const doGet = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { doGet(res.headers.location); return; }
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        res.on('error', reject);
      }).on('error', reject);
    };
    doGet(url);
  });
}

async function fetchDDragonItems() {
  const versions = await httpsGet('https://ddragon.leagueoflegends.com/api/versions.json');
  const ver = versions[0];
  const itemsData = await httpsGet(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`);
  const items = new Map();
  const byId = new Map();
  for (const [id, d] of Object.entries(itemsData.data)) {
    const isSR = d.maps?.['11'] === true;
    if (isSR && !items.has(d.name.toLowerCase())) {
      items.set(d.name.toLowerCase(), { id, name: d.name, gold: d.gold?.total || 0 });
    }
    byId.set(id, { name: d.name, from: d.from || [], into: d.into || [], gold: d.gold?.total || 0, tags: d.tags || [], isSR });
  }

  // Build valid items reference (same as main.js)
  const categories = {};
  for (const [id, item] of byId) {
    if (!item.isSR) continue;
    const isBoots = item.tags.includes('Boots');
    if (!isBoots && item.gold < 2000) continue;
    if (!isBoots && (!item.from || item.from.length === 0)) continue;
    if (item.into && item.into.length > 0) continue;
    if (!item.tags || item.tags.length === 0) continue;
    const tag = item.tags[0];
    if (!categories[tag]) categories[tag] = [];
    if (!categories[tag].includes(item.name)) categories[tag].push(item.name);
  }
  let ref = 'VALID COMPLETED ITEMS (Season 2026):\n';
  for (const [tag, list] of Object.entries(categories)) ref += `${tag}: ${list.join(', ')}\n`;
  ref += 'RULE: ONLY suggest items from this list.\n';

  // Boots reference
  const boots = [];
  for (const [id, item] of byId) {
    if (item.from && item.from.includes('1001') && item.gold > 300 && item.isSR) boots.push(item.name);
  }
  const bootsRef = boots.length > 0 ? `VALID BOOTS: ${boots.join(', ')}\n` : '';

  return { version: ver, items, byId, validItemsRef: ref, bootsRef, validItemNames: new Set([...Object.values(categories).flat(), ...boots]) };
}

// ── Gemini API caller ───────────────────────────────────────────
async function callGemini(systemPrompt, userMessage) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 1500, topP: 0.85 },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch(e) { reject(new Error(`API parse error: ${e.message}\nRaw: ${data.substring(0, 500)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Output quality validator ────────────────────────────────────
function validateBuildOutput(text, scenario, validItems) {
  const lines = text.split('\n');
  const lc = text.toLowerCase();

  console.log(`\n   📋 Scenario: ${scenario.name}`);
  console.log(`   Output length: ${text.length} chars, ${lines.length} lines`);

  // 1. ANALYSIS section exists
  assert(lc.includes('analysis'), `[${scenario.name}] ANALYSIS section present`);

  // 2. CONSTRAINTS section exists
  assert(lc.includes('constraints') || lc.includes('constraint'), `[${scenario.name}] CONSTRAINTS section present`);
  assert(lc.includes('threat_1') || lc.includes('threat 1') || lc.includes('threat:'), `[${scenario.name}] THREAT_1 constraint listed`);

  // 3. RUNES section
  assert(lc.includes('runes') && lc.includes('keystone'), `[${scenario.name}] RUNES section with keystone`);
  assert(lc.includes('primary:') && lc.includes('secondary:'), `[${scenario.name}] Primary + Secondary trees specified`);
  assert(lc.includes('shards:'), `[${scenario.name}] Shards specified`);

  // 4. Same tree check — primary and secondary must differ
  const primaryMatch = text.match(/Primary:\s*(\w+)/i);
  const secondaryMatch = text.match(/Secondary:\s*(\w+)/i);
  if (primaryMatch && secondaryMatch) {
    assert(primaryMatch[1].toLowerCase() !== secondaryMatch[1].toLowerCase(),
      `[${scenario.name}] Primary (${primaryMatch[1]}) ≠ Secondary (${secondaryMatch[1]})`);
  }

  // 5. CORE BUILD section
  assert(lc.includes('core build'), `[${scenario.name}] CORE BUILD section present`);

  // 6. Boots in position 1-2
  const coreMatch = text.match(/CORE BUILD[\s\S]*?(?=SITUATIONAL|$)/i);
  if (coreMatch) {
    const coreLines = coreMatch[0].split('\n').filter(l => /^\s*\d+\.\s/.test(l));
    if (coreLines.length >= 2) {
      const first2 = coreLines.slice(0, 2).join(' ').toLowerCase();
      const hasBootsEarly = first2.includes('boots') || first2.includes('greaves') ||
        first2.includes('treads') || first2.includes('steelcaps') || first2.includes('plated') ||
        first2.includes('swifties') || first2.includes('ionian') || first2.includes('sorcerer');
      if (hasBootsEarly) {
        assert(true, `[${scenario.name}] Boots in slot 1-2`);
      } else {
        warn(`[${scenario.name}] Boots NOT in slot 1-2 (may be slot 3+)`);
      }
    }

    // 7. No duplicate items
    const itemNames = coreLines.map(l => l.replace(/^\s*\d+\.\s+/, '').split('(')[0].trim().toLowerCase());
    const uniqueItems = new Set(itemNames);
    assert(uniqueItems.size === itemNames.length, `[${scenario.name}] No duplicate items in CORE (${uniqueItems.size}/${itemNames.length})`);

    // 8. Item count
    assert(coreLines.length >= 5, `[${scenario.name}] CORE BUILD has ${coreLines.length} items (need ≥5)`);

    // 9. Constraint references in items
    const hasConstraintRefs = coreLines.filter(l => /constraint/i.test(l) || /threat/i.test(l)).length;
    if (hasConstraintRefs >= 3) {
      assert(true, `[${scenario.name}] ${hasConstraintRefs}/${coreLines.length} items reference constraints`);
    } else {
      warn(`[${scenario.name}] Only ${hasConstraintRefs}/${coreLines.length} items reference constraints`);
    }
  }

  // 10. SITUATIONAL ITEMS
  assert(lc.includes('situational'), `[${scenario.name}] SITUATIONAL ITEMS section present`);

  // 11. Scenario-specific checks
  for (const check of (scenario.checks || [])) {
    const result = check.test(text);
    if (result) assert(true, `[${scenario.name}] ${check.name}`);
    else warn(`[${scenario.name}] ${check.name}`);
  }

  return text;
}

// ═══════════════════════════════════════════════════════════════════
//  TEST SCENARIOS
// ═══════════════════════════════════════════════════════════════════
const SCENARIOS = [
  {
    name: 'ADC vs Suppression (Jinx vs Malz)',
    myChampion: 'Jinx', role: 'Bottom',
    allies: ['Thresh', 'Darius', 'Ahri', 'LeeSin'],
    enemies: ['Malzahar', 'Darius', 'Leona', 'Caitlyn', 'Amumu'],
    checks: [
      { name: 'QSS/suppression mentioned', test: t => /qss|quicksilver|suppress/i.test(t) },
      { name: 'Anti-heal considered (Darius heal)', test: t => /grievous|anti.?heal|mortal|morello/i.test(t) },
      { name: 'Lethal Tempo or Fleet (ADC keystone)', test: t => /lethal tempo|fleet footwork/i.test(t) },
    ]
  },
  {
    name: 'Mage vs Heal-Heavy (Viktor vs Vlad+Aatrox+Soraka)',
    myChampion: 'Viktor', role: 'Mid',
    allies: ['Jinx', 'Leona', 'Darius', 'LeeSin'],
    enemies: ['Vladimir', 'Aatrox', 'Soraka', 'Jinx', 'Leona'],
    checks: [
      { name: 'Anti-heal MANDATORY (3 healers)', test: t => /grievous|morello|anti.?heal/i.test(t) },
      { name: 'Arcane Comet or Phase Rush (mage keystone)', test: t => /arcane comet|phase rush|first strike/i.test(t) },
    ]
  },
  {
    name: 'Assassin vs Heavy CC (Zed vs Naut+Leona+Amumu)',
    myChampion: 'Zed', role: 'Mid',
    allies: ['Jinx', 'Thresh', 'Darius', 'Vi'],
    enemies: ['Nautilus', 'Leona', 'Amumu', 'Caitlyn', 'Syndra'],
    checks: [
      { name: 'Mercury Treads or Tenacity mentioned (high CC)', test: t => /mercury|merc|tenacity/i.test(t) },
      { name: 'Electrocute (assassin keystone)', test: t => /electrocute/i.test(t) },
      { name: 'No mana items (Zed=ENERGY)', test: t => !/manamune|tear of the goddess|archangel/i.test(t) },
    ]
  },
];

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n🧠 DraftCoach AI Quality Stress Test');
  console.log('═'.repeat(60));

  // Fetch DDragon items
  console.log('📦 Fetching DDragon items...');
  const ddragon = await fetchDDragonItems();
  console.log(`   ${ddragon.validItemNames.size} valid SR items, patch ${ddragon.version}`);

  // Build system prompt
  const systemPrompt = _prompts.buildSystemPrompt(ddragon.version.split('.').slice(0, 2).join('.'));

  for (const scenario of SCENARIOS) {
    section(scenario.name);

    // Fetch champion mechanics dynamically
    const allChamps = [scenario.myChampion, ...scenario.enemies];
    console.log(`   Fetching DDragon mechanics for: ${allChamps.join(', ')}...`);
    const mechMap = await _prompts.fetchMultipleChampionMechanics(allChamps);
    console.log(`   ✓ Fetched ${mechMap.size} champion profiles`);

    // Build mechanics context
    const mechContext = _prompts.buildMechanicsContext(scenario.myChampion, scenario.role, mechMap);
    console.log(`   Mechanics context (${mechContext.length} chars):`);
    for (const line of mechContext.split('\n').filter(l => l.trim())) {
      console.log(`     ${line}`);
    }

    // Build enemy profile
    let apCount = 0, adCount = 0;
    for (const e of scenario.enemies) {
      const d = mechMap.get(e);
      if (d?.dmg === 'AP') apCount++;
      else if (d?.dmg === 'AD') adCount++;
      else { apCount += 0.5; adCount += 0.5; }
    }
    const enemyProfile = `ENEMY TEAM PROFILE: ${adCount} AD, ${apCount} AP — ${adCount > apCount ? 'AD-heavy' : apCount > adCount ? 'AP-heavy' : 'mixed'}.`;

    // Build user message
    const userMessage = `${ddragon.validItemsRef}\n${ddragon.bootsRef}\n${enemyProfile}\n${mechContext}\nChampion: ${scenario.myChampion}, Role: ${scenario.role}, Allies: ${scenario.allies.join(', ')}, Enemies: ${scenario.enemies.join(', ')}, Patch: ${ddragon.version}. Generate optimized build. Output ANALYSIS first.\n\n⚠️ FINAL REMINDER: Every item MUST appear in the VALID COMPLETED ITEMS list above. NEVER invent item names.`;

    // Call Gemini
    console.log(`\n   🤖 Calling Gemini Flash...`);
    const t1 = Date.now();
    let output;
    try {
      output = await callGemini(systemPrompt, userMessage);
    } catch (e) {
      console.log(`  ❌ API call failed: ${e.message}`);
      failed++;
      continue;
    }
    const t2 = Date.now();
    console.log(`   ⏱️  Response in ${t2 - t1}ms`);

    // Print abbreviated output
    console.log(`\n   ── AI OUTPUT (first 1500 chars) ──`);
    const lines = output.substring(0, 1500).split('\n');
    for (const line of lines) console.log(`   │ ${line}`);
    if (output.length > 1500) console.log(`   │ ... (${output.length - 1500} more chars)`);

    // Validate
    console.log(`\n   ── VALIDATION ──`);
    validateBuildOutput(output, scenario, ddragon.validItemNames);
  }

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log(`🧪 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log('═'.repeat(60));

  if (failed === 0) {
    console.log('\n✅ ALL CHECKS PASSED — AI output is structured and intelligent!');
  } else {
    console.log(`\n⚠️ ${failed} checks failed — review output above.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Crash:', e); process.exit(1); });
