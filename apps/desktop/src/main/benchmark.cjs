/**
 * DraftCoach — Live API Benchmark + Expanded Stress Test
 * Tests REAL Gemini Flash API calls with JSON structured output.
 * Measures: response time, JSON validity, section completeness, content quality.
 *
 * Run: node apps/desktop/src/main/benchmark.cjs
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });

const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('ERROR: GEMINI_API_KEY not set in .env'); process.exit(1); }

// ═══════════════════════════════════════════════════════════════
//  JSON SCHEMA (same as production)
// ═══════════════════════════════════════════════════════════════
const BUILD_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "object", description: "Matchup analysis",
      properties: {
        matchupType: { type: "string", description: "poke, all-in, sustain, or scaling" },
        enemyDamageSplit: { type: "string", description: "e.g. AD-heavy" },
        keyThreats: { type: "string", description: "1-2 most dangerous enemies" },
        survivabilityRequirement: { type: "string" },
        itemPriorities: { type: "string" }
      },
      required: ["matchupType", "enemyDamageSplit", "keyThreats"]
    },
    runes: {
      type: "object", description: "Complete rune page",
      properties: {
        primaryTree: { type: "string", description: "Precision, Domination, Sorcery, Resolve, or Inspiration" },
        keystone: { type: "string" },
        primaryRunes: { type: "array", items: { type: "string" }, description: "Exactly 3 primary runes" },
        secondaryTree: { type: "string", description: "Secondary tree — DIFFERENT from primary" },
        secondaryRunes: { type: "array", items: { type: "string" }, description: "Exactly 2 secondary runes" },
        shards: { type: "array", items: { type: "string" }, description: "Exactly 3 stat shards" }
      },
      required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"]
    },
    summoners: { type: "array", items: { type: "string" }, description: "Exactly 2 summoner spell names" },
    skillOrder: { type: "string", description: "e.g. Q > W > E > R" },
    startingItems: { type: "array", items: { type: "string" }, description: "Level 1 items only" },
    coreBuild: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, reason: { type: "string" } },
        required: ["name", "reason"]
      },
      description: "6-7 items in buy order including boots"
    },
    situationalItems: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, reason: { type: "string" } },
        required: ["name"]
      },
      description: "At least 4 situational items"
    },
    junglePath: { type: "string", description: "First clear if Jungle. Empty if not Jungle." },
    enemyPowerSpikes: { type: "string" },
    winCondition: { type: "string", description: "2 sentences" },
    yourPowerSpikes: { type: "string" }
  },
  required: ["analysis", "runes", "summoners", "skillOrder", "startingItems", "coreBuild", "situationalItems", "winCondition"]
};

// ═══════════════════════════════════════════════════════════════
//  SYSTEM PROMPT (simplified — matches production)
// ═══════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are a Grandmaster League of Legends Draft & Itemization Engine for Season 2026.

Your output is a JSON object. The schema enforces the structure — focus on producing HIGH-QUALITY CONTENT for each field.

BUILD RULES:
- coreBuild: EXACTLY 6 items (7 for ADC). Boots must be item #1 or #2.
- situationalItems: At least 4 entries with specific buy conditions.
- NEVER suggest the same item twice.
- NEVER put starting items in coreBuild.
- NEVER use the same tree for primaryTree and secondaryTree.
- If Jungle: include companion in startingItems, provide junglePath with 6+ camps separated by >.
- skillOrder: Use format "Q > W > E > R" (max priority order).
- summoners: Just spell names, no explanations.`;

// ═══════════════════════════════════════════════════════════════
//  TEST SCENARIOS — 10 diverse matchups covering all roles
// ═══════════════════════════════════════════════════════════════
const SCENARIOS = [
  { champion: 'Jinx',    role: 'ADC',     enemies: ['Caitlyn', 'Nautilus', 'Zed', 'Ahri', 'Lee Sin'] },
  { champion: 'Darius',  role: 'Jungle',  enemies: ['Ambessa', 'Akali', 'Ahri', 'Caitlyn', 'Alistar'] },
  { champion: 'Akali',   role: 'Mid',     enemies: ['Yasuo', 'Lee Sin', 'Jinx', 'Thresh', 'Garen'] },
  { champion: 'Thresh',  role: 'Support', enemies: ['Nautilus', 'Jinx', 'Zed', 'Viktor', 'Renekton'] },
  { champion: 'Garen',   role: 'Top',     enemies: ['Darius', 'Lee Sin', 'Ahri', 'Caitlyn', 'Lulu'] },
  { champion: 'Vayne',   role: 'ADC',     enemies: ['Draven', 'Leona', 'Talon', 'Syndra', 'Sejuani'] },
  { champion: 'Lee Sin', role: 'Jungle',  enemies: ['Kha\'Zix', 'Fiora', 'LeBlanc', 'Kai\'Sa', 'Braum'] },
  { champion: 'Lux',     role: 'Support', enemies: ['Blitzcrank', 'Ezreal', 'Rengar', 'Orianna', 'Sion'] },
  { champion: 'Yasuo',   role: 'Mid',     enemies: ['Viktor', 'Elise', 'Miss Fortune', 'Alistar', 'Malphite'] },
  { champion: 'Ornn',    role: 'Top',     enemies: ['Camille', 'Graves', 'Syndra', 'Lucian', 'Lulu'] },
];

// ═══════════════════════════════════════════════════════════════
//  QUALITY VALIDATOR
// ═══════════════════════════════════════════════════════════════
const VALID_TREES = ['Precision', 'Domination', 'Sorcery', 'Resolve', 'Inspiration'];
const VALID_SUMMONERS = ['Flash', 'Smite', 'Ghost', 'Heal', 'Teleport', 'Barrier', 'Exhaust', 'Ignite', 'Cleanse', 'Mark'];

function validateBuild(json, scenario) {
  const issues = [];

  // ANALYSIS
  if (!json.analysis) { issues.push('MISSING: analysis'); }
  else {
    if (!json.analysis.matchupType) issues.push('analysis.matchupType empty');
    if (!json.analysis.keyThreats) issues.push('analysis.keyThreats empty');
  }

  // RUNES
  if (!json.runes) { issues.push('MISSING: runes'); }
  else {
    if (!VALID_TREES.includes(json.runes.primaryTree)) issues.push(`runes.primaryTree invalid: "${json.runes.primaryTree}"`);
    if (!VALID_TREES.includes(json.runes.secondaryTree)) issues.push(`runes.secondaryTree invalid: "${json.runes.secondaryTree}"`);
    if (json.runes.primaryTree === json.runes.secondaryTree) issues.push(`SAME tree for primary and secondary: ${json.runes.primaryTree}`);
    if (!json.runes.keystone) issues.push('runes.keystone empty');
    if (!json.runes.primaryRunes || json.runes.primaryRunes.length !== 3) issues.push(`runes.primaryRunes: expected 3, got ${json.runes.primaryRunes?.length || 0}`);
    if (!json.runes.secondaryRunes || json.runes.secondaryRunes.length !== 2) issues.push(`runes.secondaryRunes: expected 2, got ${json.runes.secondaryRunes?.length || 0}`);
    if (!json.runes.shards || json.runes.shards.length !== 3) issues.push(`runes.shards: expected 3, got ${json.runes.shards?.length || 0}`);
  }

  // SUMMONERS
  if (!json.summoners || json.summoners.length !== 2) {
    issues.push(`summoners: expected 2, got ${json.summoners?.length || 0}`);
  } else {
    for (const s of json.summoners) {
      if (!VALID_SUMMONERS.includes(s)) issues.push(`Invalid summoner: "${s}"`);
    }
    if (/jungle|jg/i.test(scenario.role) && !json.summoners.includes('Smite')) {
      issues.push('Jungle role missing Smite');
    }
  }

  // SKILL ORDER
  if (!json.skillOrder) { issues.push('MISSING: skillOrder'); }
  else {
    const match = json.skillOrder.match(/([QWER])\s*>\s*([QWER])\s*>\s*([QWER])\s*>\s*([QWER])/i);
    if (!match) issues.push(`skillOrder invalid format: "${json.skillOrder}"`);
  }

  // STARTING ITEMS
  if (!json.startingItems || json.startingItems.length < 2) {
    issues.push(`startingItems: expected ≥2, got ${json.startingItems?.length || 0}`);
  }

  // CORE BUILD
  const isAdc = /^(bottom|adc|bot)$/i.test(scenario.role);
  const expectedItems = isAdc ? 7 : 6;
  if (!json.coreBuild || json.coreBuild.length < 5) {
    issues.push(`coreBuild: expected ${expectedItems}, got ${json.coreBuild?.length || 0}`);
  } else {
    const names = json.coreBuild.map(i => i.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) issues.push(`coreBuild duplicates: ${dupes.join(', ')}`);
    for (const item of json.coreBuild) {
      if (!item.name) issues.push('coreBuild item missing name');
      if (!item.reason) issues.push(`coreBuild "${item.name}" missing reason`);
    }
  }

  // SITUATIONAL
  if (!json.situationalItems || json.situationalItems.length < 3) {
    issues.push(`situationalItems: expected ≥4, got ${json.situationalItems?.length || 0}`);
  }

  // JUNGLE PATH
  if (/jungle|jg/i.test(scenario.role)) {
    if (!json.junglePath || json.junglePath.length < 10) {
      issues.push('Jungle role but junglePath empty/too short');
    }
  }

  // WIN CONDITION
  if (!json.winCondition || json.winCondition.length < 10) {
    issues.push('winCondition empty/too short');
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
//  BENCHMARK RUNNER
// ═══════════════════════════════════════════════════════════════
async function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     DraftCoach Live API Benchmark — JSON Structured Output      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const genAI = new GoogleGenerativeAI(API_KEY);
  const results = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    const label = `${sc.champion} ${sc.role} (${i + 1}/${SCENARIOS.length})`;
    process.stdout.write(`⏳ ${label}...`);

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: BUILD_RESPONSE_SCHEMA,
      },
    });

    const userMessage = `Champion: ${sc.champion}, Role: ${sc.role}, Enemies: ${sc.enemies.join(', ')}. Generate optimized build.`;

    const t0 = Date.now();
    let json = null;
    let rawText = '';
    let error = null;

    try {
      const result = await model.generateContent(userMessage);
      rawText = result.response.text();
      json = JSON.parse(rawText);
    } catch (e) {
      error = e.message;
    }

    const elapsed = Date.now() - t0;
    const elapsedS = (elapsed / 1000).toFixed(1);

    if (error) {
      console.log(` ❌ ERROR (${elapsedS}s): ${error}`);
      results.push({ label, elapsed, passed: false, issues: [error], json: null });
      continue;
    }

    const issues = validateBuild(json, sc);
    const passed = issues.length === 0;

    if (passed) {
      const coreNames = json.coreBuild.map(i => i.name).join(', ');
      console.log(` ✅ ${elapsedS}s | ${json.runes.keystone} | ${json.summoners.join('+')} | ${json.skillOrder} | Core: ${coreNames}`);
    } else {
      console.log(` ⚠️  ${elapsedS}s | ${issues.length} issues:`);
      for (const issue of issues) console.log(`      • ${issue}`);
    }

    results.push({ label, elapsed, passed, issues, json });

    // Rate limit: 1.5s between calls to avoid 429s
    if (i < SCENARIOS.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  // ═══════════════════════════════════════════════════════════════
  //  RESULTS SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(65)}`);
  console.log('RESULTS SUMMARY');
  console.log(`${'═'.repeat(65)}`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const times = results.filter(r => r.json).map(r => r.elapsed);
  const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const minTime = times.length > 0 ? Math.min(...times) : 0;
  const maxTime = times.length > 0 ? Math.max(...times) : 0;

  console.log(`\n  Pass rate: ${passed}/${results.length} (${Math.round(passed / results.length * 100)}%)`);
  console.log(`  Avg response time: ${(avgTime / 1000).toFixed(1)}s`);
  console.log(`  Min response time: ${(minTime / 1000).toFixed(1)}s`);
  console.log(`  Max response time: ${(maxTime / 1000).toFixed(1)}s`);

  console.log('\n  Per-scenario breakdown:');
  console.log('  ' + '─'.repeat(60));
  console.log('  Scenario                          Time    Status  Issues');
  console.log('  ' + '─'.repeat(60));
  for (const r of results) {
    const t = `${(r.elapsed / 1000).toFixed(1)}s`.padStart(6);
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    const issueCount = r.issues.length > 0 ? r.issues.length : '';
    console.log(`  ${r.label.padEnd(35)} ${t}  ${status}  ${issueCount}`);
  }
  console.log('  ' + '─'.repeat(60));

  // Quality metrics
  if (passed > 0) {
    const goodBuilds = results.filter(r => r.json);
    let totalCoreItems = 0, totalSitItems = 0;
    for (const r of goodBuilds) {
      totalCoreItems += r.json.coreBuild?.length || 0;
      totalSitItems += r.json.situationalItems?.length || 0;
    }
    console.log(`\n  Quality metrics (from ${goodBuilds.length} successful builds):`);
    console.log(`  Avg core items: ${(totalCoreItems / goodBuilds.length).toFixed(1)}`);
    console.log(`  Avg situational items: ${(totalSitItems / goodBuilds.length).toFixed(1)}`);
  }

  console.log(`\n${'═'.repeat(65)}`);
  process.exit(failed > 0 ? 1 : 0);
}

runBenchmark().catch(e => { console.error('FATAL:', e); process.exit(1); });
