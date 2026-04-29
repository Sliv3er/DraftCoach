/**
 * DraftCoach — Flash vs Hybrid Mode Comparison Benchmark
 * Tests the SAME scenarios through both modes and compares:
 *   - Response time
 *   - JSON validity
 *   - Content quality (runes, items, completeness)
 *
 * Run: node apps/desktop/src/main/benchmark-compare.cjs
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('ERROR: GEMINI_API_KEY not set'); process.exit(1); }

// Schema (same as production)
const BUILD_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "object", description: "Matchup analysis",
      properties: {
        matchupType: { type: "string", description: "poke, all-in, sustain, or scaling" },
        enemyDamageSplit: { type: "string", description: "e.g. AD-heavy (3 AD)" },
        keyThreats: { type: "string", description: "1-2 most dangerous enemies and why" },
        survivabilityRequirement: { type: "string", description: "Stat thresholds needed" },
        itemPriorities: { type: "string", description: "1-3 most important item properties" }
      },
      required: ["matchupType", "enemyDamageSplit", "keyThreats"]
    },
    runes: {
      type: "object", description: "Complete rune page",
      properties: {
        primaryTree: { type: "string" }, keystone: { type: "string" },
        primaryRunes: { type: "array", items: { type: "string" }, description: "Exactly 3" },
        secondaryTree: { type: "string" },
        secondaryRunes: { type: "array", items: { type: "string" }, description: "Exactly 2" },
        shards: { type: "array", items: { type: "string" }, description: "Exactly 3" }
      },
      required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"]
    },
    summoners: { type: "array", items: { type: "string" }, description: "Exactly 2 summoner spell names" },
    skillOrder: { type: "string", description: "e.g. Q > W > E > R" },
    startingItems: { type: "array", items: { type: "string" } },
    coreBuild: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] },
      description: "6-7 items in buy order including boots"
    },
    situationalItems: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, condition: { type: "string" } }, required: ["name"] },
      description: "At least 4 situational items"
    },
    junglePath: { type: "string", description: "First clear if Jungle, empty otherwise" },
    enemyPowerSpikes: { type: "string" },
    winCondition: { type: "string", description: "2 sentences" },
    yourPowerSpikes: { type: "string" }
  },
  required: ["analysis", "runes", "summoners", "skillOrder", "startingItems", "coreBuild", "situationalItems", "winCondition"]
};

const SYSTEM_PROMPT = `You are a Grandmaster League of Legends Draft & Itemization Engine for Season 2026.
Your output is JSON. Focus on HIGH-QUALITY CONTENT.
BUILD RULES:
- coreBuild: EXACTLY 6 items (7 for ADC). Boots #1 or #2.
- situationalItems: At least 4.
- NEVER duplicate items. NEVER same primary/secondary tree.
- If Jungle: companion in startingItems, junglePath with 6+ camps.
- summoners: Just names, no explanations.`;

// 5 scenarios covering all roles
const SCENARIOS = [
  { champion: 'Jinx',    role: 'ADC',     enemies: ['Caitlyn', 'Nautilus', 'Zed', 'Ahri', 'Lee Sin'] },
  { champion: 'Darius',  role: 'Jungle',  enemies: ['Ambessa', 'Akali', 'Ahri', 'Caitlyn', 'Alistar'] },
  { champion: 'Akali',   role: 'Mid',     enemies: ['Yasuo', 'Lee Sin', 'Jinx', 'Thresh', 'Garen'] },
  { champion: 'Thresh',  role: 'Support', enemies: ['Nautilus', 'Jinx', 'Zed', 'Viktor', 'Renekton'] },
  { champion: 'Garen',   role: 'Top',     enemies: ['Darius', 'Lee Sin', 'Ahri', 'Caitlyn', 'Lulu'] },
];

const VALID_TREES = ['Precision', 'Domination', 'Sorcery', 'Resolve', 'Inspiration'];

function scoreQuality(json, scenario) {
  let score = 0;
  const maxScore = 20;
  const notes = [];

  // Analysis completeness (0-3)
  if (json.analysis) {
    if (json.analysis.matchupType) score++;
    if (json.analysis.keyThreats && json.analysis.keyThreats.length > 10) score++;
    if (json.analysis.enemyDamageSplit) score++;
  }

  // Rune validity (0-5)
  if (json.runes) {
    if (VALID_TREES.includes(json.runes.primaryTree)) score++; else notes.push(`bad primary: ${json.runes.primaryTree}`);
    if (VALID_TREES.includes(json.runes.secondaryTree)) score++; else notes.push(`bad secondary: ${json.runes.secondaryTree}`);
    if (json.runes.primaryTree !== json.runes.secondaryTree) score++; else notes.push('SAME trees');
    if (json.runes.primaryRunes?.length === 3) score++; else notes.push(`${json.runes.primaryRunes?.length || 0} primary runes`);
    if (json.runes.secondaryRunes?.length === 2) score++; else notes.push(`${json.runes.secondaryRunes?.length || 0} secondary runes`);
  }

  // Summoners (0-2)
  if (json.summoners?.length === 2) {
    score++;
    if (/jungle|jg/i.test(scenario.role) && json.summoners.includes('Smite')) score++;
    else if (!/jungle|jg/i.test(scenario.role)) score++;
  }

  // Skill order (0-1)
  if (json.skillOrder && /[QWER]\s*>\s*[QWER]\s*>\s*[QWER]\s*>\s*[QWER]/i.test(json.skillOrder)) score++;

  // Core build (0-4)
  const isAdc = /^(bottom|adc|bot)$/i.test(scenario.role);
  const expectedItems = isAdc ? 7 : 6;
  if (json.coreBuild) {
    if (json.coreBuild.length >= expectedItems) score += 2; else if (json.coreBuild.length >= 5) score++;
    const names = json.coreBuild.map(i => i.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length === 0) score++; else notes.push(`dupes: ${dupes.join(',')}`);
    if (json.coreBuild.every(i => i.reason && i.reason.length > 3)) score++; else notes.push('missing reasons');
  }

  // Situational (0-2)
  if (json.situationalItems?.length >= 4) score += 2; else if (json.situationalItems?.length >= 3) score++;

  // Jungle path (0-1)
  if (/jungle|jg/i.test(scenario.role)) {
    if (json.junglePath && json.junglePath.length > 15) score++; else notes.push('missing jungle path');
  } else {
    score++; // non-jungle gets free point
  }

  // Win condition + power spikes (0-2)
  if (json.winCondition && json.winCondition.length > 15) score++;
  if (json.yourPowerSpikes && json.yourPowerSpikes.length > 10) score++;

  return { score, maxScore, pct: Math.round(score / maxScore * 100), notes };
}

async function runOnce(genAI, modelName, scenario) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: modelName.includes('flash') ? 0.3 : 0.3,
      topP: 0.9, topK: 64, maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: BUILD_RESPONSE_SCHEMA,
    },
  });

  const msg = `Champion: ${scenario.champion}, Role: ${scenario.role}, Enemies: ${scenario.enemies.join(', ')}. Generate optimized build.`;
  const t0 = Date.now();
  const result = await model.generateContent(msg);
  const elapsed = Date.now() - t0;
  const raw = result.response.text();
  const json = JSON.parse(raw);
  return { json, elapsed, raw };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Flash-Only vs Hybrid (Pro) — Head-to-Head Comparison         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const genAI = new GoogleGenerativeAI(API_KEY);
  const flashResults = [];
  const proResults = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    const label = `${sc.champion} ${sc.role}`;

    // ── FLASH ──
    process.stdout.write(`  ⏳ [Flash] ${label}...`);
    try {
      const fr = await runOnce(genAI, 'gemini-3-flash-preview', sc);
      const fq = scoreQuality(fr.json, sc);
      console.log(` ✅ ${(fr.elapsed/1000).toFixed(1)}s | Quality: ${fq.score}/${fq.maxScore} (${fq.pct}%) | ${fr.json.runes.keystone} | ${fr.json.coreBuild.length} items${fq.notes.length ? ' | ⚠ ' + fq.notes.join(', ') : ''}`);
      flashResults.push({ label, elapsed: fr.elapsed, quality: fq, json: fr.json, error: null });
    } catch (e) {
      console.log(` ❌ ${e.message.slice(0, 80)}`);
      flashResults.push({ label, elapsed: 0, quality: { score: 0, maxScore: 20, pct: 0 }, json: null, error: e.message });
    }

    await new Promise(r => setTimeout(r, 1500)); // rate limit

    // ── PRO ──
    process.stdout.write(`  ⏳ [Pro]   ${label}...`);
    try {
      const pr = await runOnce(genAI, 'gemini-3.1-pro-preview', sc);
      const pq = scoreQuality(pr.json, sc);
      console.log(` ✅ ${(pr.elapsed/1000).toFixed(1)}s | Quality: ${pq.score}/${pq.maxScore} (${pq.pct}%) | ${pr.json.runes.keystone} | ${pr.json.coreBuild.length} items${pq.notes.length ? ' | ⚠ ' + pq.notes.join(', ') : ''}`);
      proResults.push({ label, elapsed: pr.elapsed, quality: pq, json: pr.json, error: null });
    } catch (e) {
      console.log(` ❌ ${e.message.slice(0, 80)}`);
      proResults.push({ label, elapsed: 0, quality: { score: 0, maxScore: 20, pct: 0 }, json: null, error: e.message });
    }

    await new Promise(r => setTimeout(r, 1500));
    console.log(''); // blank line between scenarios
  }

  // ═══════════════════════════════════════════════════════════════
  //  COMPARISON TABLE
  // ═══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(75)}`);
  console.log('HEAD-TO-HEAD COMPARISON');
  console.log(`${'═'.repeat(75)}`);
  console.log('');
  console.log('Scenario             │ Flash Time │ Pro Time │ Flash Quality │ Pro Quality │ Winner');
  console.log('─────────────────────┼────────────┼──────────┼──────────────┼─────────────┼────────');

  for (let i = 0; i < SCENARIOS.length; i++) {
    const f = flashResults[i];
    const p = proResults[i];
    const fTime = f.error ? 'ERR' : `${(f.elapsed/1000).toFixed(1)}s`;
    const pTime = p.error ? 'ERR' : `${(p.elapsed/1000).toFixed(1)}s`;
    const fQual = f.error ? 'ERR' : `${f.quality.pct}%`;
    const pQual = p.error ? 'ERR' : `${p.quality.pct}%`;

    let winner = '—';
    if (!f.error && !p.error) {
      if (f.quality.pct > p.quality.pct) winner = '🟢 Flash';
      else if (p.quality.pct > f.quality.pct) winner = '🔵 Pro';
      else if (f.elapsed < p.elapsed) winner = '🟢 Flash (faster)';
      else winner = '🔵 Pro (faster)';
    } else if (f.error) winner = '🔵 Pro';
    else if (p.error) winner = '🟢 Flash';

    const label = f.label.padEnd(20);
    console.log(`${label} │ ${fTime.padStart(10)} │ ${pTime.padStart(8)} │ ${fQual.padStart(12)} │ ${pQual.padStart(11)} │ ${winner}`);
  }

  // Aggregates
  const flashOk = flashResults.filter(r => !r.error);
  const proOk = proResults.filter(r => !r.error);

  const fAvgTime = flashOk.length ? Math.round(flashOk.reduce((a, r) => a + r.elapsed, 0) / flashOk.length) : 0;
  const pAvgTime = proOk.length ? Math.round(proOk.reduce((a, r) => a + r.elapsed, 0) / proOk.length) : 0;
  const fAvgQual = flashOk.length ? Math.round(flashOk.reduce((a, r) => a + r.quality.pct, 0) / flashOk.length) : 0;
  const pAvgQual = proOk.length ? Math.round(proOk.reduce((a, r) => a + r.quality.pct, 0) / proOk.length) : 0;
  const fMinTime = flashOk.length ? Math.min(...flashOk.map(r => r.elapsed)) : 0;
  const pMinTime = proOk.length ? Math.min(...proOk.map(r => r.elapsed)) : 0;
  const fMaxTime = flashOk.length ? Math.max(...flashOk.map(r => r.elapsed)) : 0;
  const pMaxTime = proOk.length ? Math.max(...proOk.map(r => r.elapsed)) : 0;

  console.log('─────────────────────┼────────────┼──────────┼──────────────┼─────────────┼────────');
  console.log(`${'AVERAGE'.padEnd(20)} │ ${(fAvgTime/1000).toFixed(1).padStart(9)}s │ ${(pAvgTime/1000).toFixed(1).padStart(7)}s │ ${(fAvgQual+'%').padStart(12)} │ ${(pAvgQual+'%').padStart(11)} │`);

  console.log(`\n  Flash: ${flashOk.length}/${flashResults.length} OK | Avg ${(fAvgTime/1000).toFixed(1)}s | Range ${(fMinTime/1000).toFixed(1)}-${(fMaxTime/1000).toFixed(1)}s | Avg quality ${fAvgQual}%`);
  console.log(`  Pro:   ${proOk.length}/${proResults.length} OK | Avg ${(pAvgTime/1000).toFixed(1)}s | Range ${(pMinTime/1000).toFixed(1)}-${(pMaxTime/1000).toFixed(1)}s | Avg quality ${pAvgQual}%`);
  console.log(`  Speed advantage: Flash is ${((pAvgTime - fAvgTime)/1000).toFixed(1)}s faster (${Math.round((1 - fAvgTime/pAvgTime) * 100)}%)`);
  console.log(`  Quality diff: ${Math.abs(fAvgQual - pAvgQual)}% ${fAvgQual >= pAvgQual ? '(Flash ≥ Pro)' : '(Pro better)'}`);

  // Item comparison
  console.log(`\n${'═'.repeat(75)}`);
  console.log('ITEM BUILD COMPARISON (side by side)');
  console.log(`${'═'.repeat(75)}`);
  for (let i = 0; i < SCENARIOS.length; i++) {
    const f = flashResults[i];
    const p = proResults[i];
    if (f.json && p.json) {
      console.log(`\n  ${f.label}:`);
      console.log(`    Flash: ${f.json.coreBuild.map(it => it.name).join(' → ')}`);
      console.log(`    Pro:   ${p.json.coreBuild.map(it => it.name).join(' → ')}`);
      const overlap = f.json.coreBuild.filter(fi => p.json.coreBuild.some(pi => pi.name === fi.name)).length;
      console.log(`    Overlap: ${overlap}/${f.json.coreBuild.length} items in common`);
    }
  }

  console.log(`\n${'═'.repeat(75)}`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
