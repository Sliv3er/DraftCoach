/**
 * Intelligence Upgrade Quality Test — Dynamic DDragon Version
 * ────────────────────────────────────────────────────────────
 * Tests the prompt-builder.js with LIVE DDragon data.
 * No hardcoded champion data — everything fetched at runtime.
 * Run with: node test-intelligence-upgrades.js
 */

'use strict';

const _prompts = require('./apps/desktop/src/main/prompt-builder');

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

async function runTests() {
  console.log('\n🧪 Intelligence Upgrade Quality Test (DYNAMIC DDragon)');
  console.log('═'.repeat(60));

  // ═══════════════════════════════════════════════════════════════
  // GROUP 1: Dynamic Champion Fetching
  // ═══════════════════════════════════════════════════════════════
  section('GROUP 1: Dynamic Champion Fetching from DDragon');

  // Fetch a known champion
  const darius = await _prompts.fetchChampionMechanics('Darius');
  assert(darius !== null, 'Darius: fetched successfully');
  assert(darius?.dmg === 'AD', `Darius dmg: ${darius?.dmg} (expect AD)`);
  assert(darius?.range === 'MELEE', `Darius range: ${darius?.range} (expect MELEE)`);
  assert(darius?.resource === 'MANA', `Darius resource: ${darius?.resource} (expect MANA)`);
  assert(darius?.trueDmg === true, `Darius trueDmg: ${darius?.trueDmg} (R is true damage)`);
  assert(Array.isArray(darius?.cc) && darius.cc.length > 0, `Darius CC found: ${darius?.cc?.length} types`);

  // Fetch Malzahar — must detect SUPPRESSION
  const malz = await _prompts.fetchChampionMechanics('Malzahar');
  assert(malz !== null, 'Malzahar: fetched successfully');
  assert(malz?.ult?.type === 'SUPPRESSION', `Malzahar ult: ${malz?.ult?.type} (expect SUPPRESSION)`);
  assert(malz?.cc?.some(c => c.type === 'SUPPRESSION'), 'Malzahar: suppression detected in CC');

  // Fetch Zed — must detect ENERGY
  const zed = await _prompts.fetchChampionMechanics('Zed');
  assert(zed?.resource === 'ENERGY', `Zed resource: ${zed?.resource} (expect ENERGY)`);
  assert(zed?.dashes >= 1, `Zed dashes: ${zed?.dashes} (expect ≥1)`);

  // Fetch Katarina — must detect RESOURCELESS
  const kata = await _prompts.fetchChampionMechanics('Katarina');
  assert(kata?.resource === 'RESOURCELESS', `Katarina resource: ${kata?.resource}`);

  // Fetch Jinx — must be RANGED + ADC
  const jinx = await _prompts.fetchChampionMechanics('Jinx');
  assert(jinx?.range === 'RANGED', `Jinx range: ${jinx?.range}`);
  assert(jinx?.tags?.includes('Marksman'), `Jinx tags: ${jinx?.tags?.join(',')} (includes Marksman)`);

  // Fetch Vayne — must detect true damage
  const vayne = await _prompts.fetchChampionMechanics('Vayne');
  assert(vayne?.trueDmg === true, `Vayne trueDmg: ${vayne?.trueDmg} (W silver bolts)`);

  // Fetch Soraka — must detect heal threat
  const soraka = await _prompts.fetchChampionMechanics('Soraka');
  assert(soraka?.healThreat === true, `Soraka healThreat: ${soraka?.healThreat}`);

  // Fetch Warwick — must detect suppression
  const ww = await _prompts.fetchChampionMechanics('Warwick');
  assert(ww?.ult?.type === 'SUPPRESSION' || ww?.cc?.some(c => c.type === 'SUPPRESSION'),
    `Warwick: suppression detected (ult: ${ww?.ult?.type})`);

  // Fetch UNKNOWN champion — must not crash
  const fake = await _prompts.fetchChampionMechanics('FakeChampion9999');
  assert(fake === null, 'Unknown champion: returns null (no crash)');

  // ═══════════════════════════════════════════════════════════════
  // GROUP 2: Batch Fetching
  // ═══════════════════════════════════════════════════════════════
  section('GROUP 2: Batch Fetching (Full Lobby)');

  const lobby = ['Jinx', 'Malzahar', 'Darius', 'Leona', 'Caitlyn', 'Amumu'];
  const mechMap = await _prompts.fetchMultipleChampionMechanics(lobby);
  assert(mechMap.size === lobby.length, `Fetched ${mechMap.size}/${lobby.length} champions`);

  console.log('   Champions fetched:');
  for (const [name, data] of mechMap) {
    console.log(`     ${name}: ${data.dmg}/${data.range}/${data.resource} | CC:${data.cc.length} | trueDmg:${data.trueDmg} | heal:${data.healThreat} | shield:${data.shieldThreat}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // GROUP 3: Mechanics Context Quality (Dynamic)
  // ═══════════════════════════════════════════════════════════════
  section('GROUP 3: buildMechanicsContext() Output Quality');

  // vs Malzahar team — MUST mention QSS/suppression
  {
    const ctx = _prompts.buildMechanicsContext('Jinx', 'bottom', mechMap);
    assert(ctx.includes('SUPPRESSION'), 'vs Malzahar team: SUPPRESSION mentioned');
    assert(ctx.toLowerCase().includes('qss'), 'vs Malzahar team: QSS mentioned');
    console.log('   Context output (first 300 chars):');
    console.log('   ' + ctx.substring(0, 300).replace(/\n/g, '\n   '));
  }

  // vs high-heal team
  {
    const healLobby = ['Viktor', 'Vladimir', 'Aatrox', 'Soraka', 'Jinx', 'Leona'];
    const healMap = await _prompts.fetchMultipleChampionMechanics(healLobby);
    const ctx = _prompts.buildMechanicsContext('Viktor', 'mid', healMap);
    const lcCtx = ctx.toLowerCase();
    assert(lcCtx.includes('grievous') || lcCtx.includes('anti-heal') || lcCtx.includes('healing threat'),
      'vs heal-heavy: mentions anti-heal/Grievous');
  }

  // vs high-CC team
  {
    const ccLobby = ['Yasuo', 'Nautilus', 'Leona', 'Amumu', 'Caitlyn', 'Lux'];
    const ccMap = await _prompts.fetchMultipleChampionMechanics(ccLobby);
    const ctx = _prompts.buildMechanicsContext('Yasuo', 'mid', ccMap);
    const lcCtx = ctx.toLowerCase();
    assert(lcCtx.includes('mercury') || lcCtx.includes('tenacity') || lcCtx.includes('cc'),
      'vs high-CC: mentions Mercury/Tenacity/CC');
  }

  // Energy champion — no mana items
  {
    const zedMap = await _prompts.fetchMultipleChampionMechanics(['Zed', 'Syndra']);
    const ctx = _prompts.buildMechanicsContext('Zed', 'mid', zedMap);
    assert(ctx.includes('ENERGY'), 'Zed: ENERGY resource noted');
    assert(ctx.includes('Do NOT suggest Manamune') || ctx.includes('Do NOT suggest Tear'),
      'Zed: warns against mana items');
  }

  // Resourceless champion
  {
    const kataMap = await _prompts.fetchMultipleChampionMechanics(['Katarina', 'Syndra']);
    const ctx = _prompts.buildMechanicsContext('Katarina', 'mid', kataMap);
    assert(ctx.includes('RESOURCELESS'), 'Katarina: RESOURCELESS noted');
  }

  // Empty mechMap — no crash
  {
    const ctx = _prompts.buildMechanicsContext('Jinx', 'bottom', new Map());
    assert(ctx === '', 'Empty mechMap: returns empty string');
  }

  // ═══════════════════════════════════════════════════════════════
  // GROUP 4: System Prompt Structure
  // ═══════════════════════════════════════════════════════════════
  section('GROUP 4: System Prompt Structure');

  const prompt = _prompts.buildSystemPrompt('16.8');
  assert(prompt.includes('STEP 1') && prompt.includes('ANALYSIS'), 'STEP 1 ANALYSIS present');
  assert(prompt.includes('STEP 2') && prompt.includes('CONSTRAINTS'), 'STEP 2 CONSTRAINTS present');
  assert(prompt.includes('Every item in CORE BUILD must reference'), 'Constraint-binding rule');
  assert(prompt.includes('KEYSTONE SELECTION RULES'), 'Rune decision tree embedded');
  assert(prompt.includes('dynamically parsed from DDragon'), 'Prompt references dynamic DDragon data');

  // ═══════════════════════════════════════════════════════════════
  // GROUP 5: Coverage Test — Fetch ALL Popular Champions
  // ═══════════════════════════════════════════════════════════════
  section('GROUP 5: Full Coverage — 30 Popular Champions');

  const popular = [
    'Jinx', 'Caitlyn', 'Vayne', 'Zed', 'Yasuo', 'Darius', 'Garen',
    'Lux', 'Ahri', 'Leona', 'Thresh', 'Blitzcrank', 'Malzahar',
    'Fizz', 'Katarina', 'LeeSin', 'Vi', 'Amumu', 'Jax', 'Fiora',
    'Irelia', 'Yone', 'Vladimir', 'Sylas', 'Akali', 'Ezreal',
    'MissFortune', 'Lucian', 'Morgana', 'Viego'
  ];

  const allMap = await _prompts.fetchMultipleChampionMechanics(popular);
  assert(allMap.size === popular.length, `Fetched ${allMap.size}/${popular.length} popular champions`);

  let coverageIssues = [];
  for (const name of popular) {
    const data = allMap.get(name);
    if (!data) { coverageIssues.push(`${name}: MISSING`); continue; }
    if (!data.dmg) coverageIssues.push(`${name}: no dmg type`);
    if (!data.resource) coverageIssues.push(`${name}: no resource`);
    if (!data.range) coverageIssues.push(`${name}: no range`);
  }
  assert(coverageIssues.length === 0, `All 30 champions have complete data`, coverageIssues.join('; '));

  // ═══════════════════════════════════════════════════════════════
  // GROUP 6: Cache Performance
  // ═══════════════════════════════════════════════════════════════
  section('GROUP 6: Cache Performance');

  // Second fetch should be instant (cached)
  const t1 = Date.now();
  await _prompts.fetchChampionMechanics('Darius');
  const t2 = Date.now();
  assert(t2 - t1 < 5, `Cached fetch: ${t2 - t1}ms (should be <5ms)`);

  // Clear cache
  _prompts.clearChampionCache();
  const t3 = Date.now();
  await _prompts.fetchChampionMechanics('Darius');
  const t4 = Date.now();
  console.log(`   Fresh fetch after cache clear: ${t4 - t3}ms`);

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log(`🧪 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n❌ SOME TESTS FAILED');
  } else {
    console.log('\n✅ ALL TESTS PASSED — Zero hardcoded data, 100% dynamic DDragon!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
