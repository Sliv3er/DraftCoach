/**
 * Comprehensive Stress Test: Starting Items + Meta Reference + Multi-Mode
 * Tests SR, ARAM, and ARAM Mayhem builds with validation.
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('ERROR: GEMINI_API_KEY not set'); process.exit(1); }
const genAI = new GoogleGenerativeAI(API_KEY);

// ── Schemas ──
const SR_SCHEMA = {
  type: "object",
  properties: {
    analysis: { type: "object", properties: { matchupType: { type: "string" } }, required: ["matchupType"] },
    runes: { type: "object", properties: { primaryTree: { type: "string" }, keystone: { type: "string" }, primaryRunes: { type: "array", items: { type: "string" } }, secondaryTree: { type: "string" }, secondaryRunes: { type: "array", items: { type: "string" } }, shards: { type: "array", items: { type: "string" } } }, required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"] },
    summoners: { type: "array", items: { type: "string" } },
    skillOrder: { type: "string" },
    startingItems: { type: "array", items: { type: "string" }, description: "Exactly 2 items: 1 starting item + 1 potion. Total ≤500g." },
    coreBuild: { type: "array", items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] } },
    situationalItems: { type: "array", items: { type: "object", properties: { name: { type: "string" }, condition: { type: "string" } }, required: ["name"] } },
    winCondition: { type: "string" }
  },
  required: ["runes", "summoners", "skillOrder", "startingItems", "coreBuild", "situationalItems", "winCondition"]
};

const ARAM_SCHEMA = {
  type: "object",
  properties: {
    runes: { type: "object", properties: { primaryTree: { type: "string" }, keystone: { type: "string" }, primaryRunes: { type: "array", items: { type: "string" } }, secondaryTree: { type: "string" }, secondaryRunes: { type: "array", items: { type: "string" } }, shards: { type: "array", items: { type: "string" } } }, required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"] },
    summoners: { type: "array", items: { type: "string" } },
    skillOrder: { type: "string" },
    startingItems: { type: "array", items: { type: "string" } },
    coreBuild: { type: "array", items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] } },
    situationalItems: { type: "array", items: { type: "object", properties: { name: { type: "string" }, condition: { type: "string" } }, required: ["name"] } },
    winCondition: { type: "string" }
  },
  required: ["runes", "summoners", "skillOrder", "coreBuild", "situationalItems", "winCondition"]
};

const ARAM_MAYHEM_SCHEMA = {
  type: "object",
  properties: {
    runes: { type: "object", properties: { primaryTree: { type: "string" }, keystone: { type: "string" }, primaryRunes: { type: "array", items: { type: "string" } }, secondaryTree: { type: "string" }, secondaryRunes: { type: "array", items: { type: "string" } }, shards: { type: "array", items: { type: "string" } } }, required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"] },
    summoners: { type: "array", items: { type: "string" } },
    skillOrder: { type: "string" },
    startingItems: { type: "array", items: { type: "string" } },
    coreBuild: { type: "array", items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] } },
    situationalItems: { type: "array", items: { type: "object", properties: { name: { type: "string" }, condition: { type: "string" } }, required: ["name"] } },
    augments: { type: "array", items: { type: "object", properties: { name: { type: "string" }, tier: { type: "string" }, reason: { type: "string" }, pickAt: { type: "string" } }, required: ["name", "tier", "reason"] }, description: "Top 4 augments for this champion" },
    winCondition: { type: "string" }
  },
  required: ["runes", "summoners", "skillOrder", "coreBuild", "augments", "winCondition"]
};

// ── Prompts ──
const SR_PROMPT = `You are a League of Legends Build Engine for Patch 16.9.
BUILD RULES:
- coreBuild: 6 items. Boots #1 or #2.
- situationalItems: 4+.
- startingItems: Exactly 2 (1 starter + 1 potion, ≤500g).
- NEVER put starting items in coreBuild.
Output valid JSON.`;

const ARAM_PROMPT = `You are a League of Legends ARAM Build Engine for Patch 16.9.
ARAM RULES:
- Map: Howling Abyss — constant teamfighting
- coreBuild: 6 items (including boots)
- startingItems: empty array [] — ARAM has no starting items
- Summoners: Mark/Dash + Flash
- No jungle path
Output valid JSON.`;

const ARAM_MAYHEM_PROMPT = `You are an ARAM: Mayhem Build Engine for Patch 16.9.
ARAM MAYHEM RULES:
- Howling Abyss + Arena-style augments (Level 1, 7, 11, 15)
- coreBuild: 6 items (including boots)
- startingItems: empty array []
- Summoners: Mark/Dash + Flash
- Also recommend 4 augments with tier and reasoning
Output valid JSON.`;

// ── Test Scenarios ──
const SCENARIOS = [
  // SR builds — test starting items
  { mode: 'sr',     c: 'Jinx',     r: 'ADC',     e: ['Draven', 'Leona'],   schema: SR_SCHEMA, prompt: SR_PROMPT },
  { mode: 'sr',     c: 'Lee Sin',  r: 'Jungle',  e: ['KhaZix', 'Ahri'],    schema: SR_SCHEMA, prompt: SR_PROMPT },
  { mode: 'sr',     c: 'Lux',      r: 'Support', e: ['Caitlyn', 'Nami'],    schema: SR_SCHEMA, prompt: SR_PROMPT },
  { mode: 'sr',     c: 'Darius',   r: 'Top',     e: ['Fiora', 'Elise'],     schema: SR_SCHEMA, prompt: SR_PROMPT },
  { mode: 'sr',     c: 'Zed',      r: 'Mid',     e: ['Lissandra', 'Zac'],   schema: SR_SCHEMA, prompt: SR_PROMPT },
  // ARAM builds — no starting items, ARAM-specific items
  { mode: 'aram',   c: 'Brand',    r: null,      e: [],                      schema: ARAM_SCHEMA, prompt: ARAM_PROMPT },
  { mode: 'aram',   c: 'Vayne',    r: null,      e: [],                      schema: ARAM_SCHEMA, prompt: ARAM_PROMPT },
  { mode: 'aram',   c: 'Sona',     r: null,      e: [],                      schema: ARAM_SCHEMA, prompt: ARAM_PROMPT },
  // ARAM Mayhem — augments
  { mode: 'mayhem', c: 'Jinx',     r: null,      e: [],                      schema: ARAM_MAYHEM_SCHEMA, prompt: ARAM_MAYHEM_PROMPT },
  { mode: 'mayhem', c: 'Veigar',   r: null,      e: [],                      schema: ARAM_MAYHEM_SCHEMA, prompt: ARAM_MAYHEM_PROMPT },
];

const VALID_POTIONS = new Set(["Health Potion", "Refillable Potion"]);

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('COMPREHENSIVE STRESS TEST — All 3 Phases (10 scenarios)');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0, failed = 0;
  const results = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    const label = `${s.c} ${s.r || s.mode.toUpperCase()}`;
    process.stdout.write(`[${i+1}/10] ${label.padEnd(25)}... `);

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        systemInstruction: s.prompt,
        generationConfig: {
          temperature: 0.3, topP: 0.9, topK: 64, maxOutputTokens: 8192,
          responseMimeType: 'application/json', responseSchema: s.schema,
        },
      });

      let msg;
      if (s.mode === 'sr') {
        msg = `Champion: ${s.c}, Role: ${s.r}, Enemies: ${s.e.join(', ')}. Generate optimized build. startingItems: exactly 2 (1 starter + 1 potion).`;
      } else if (s.mode === 'aram') {
        msg = `Champion: ${s.c}, Mode: ARAM. Generate ARAM build. coreBuild: 6 items. startingItems: []. Summoners: Mark/Dash + Flash.`;
      } else {
        msg = `Champion: ${s.c}, Mode: ARAM Mayhem. Generate ARAM Mayhem build + augments. coreBuild: 6 items. startingItems: []. Recommend 4 augments.`;
      }

      const t0 = Date.now();
      const result = await model.generateContent(msg);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const json = JSON.parse(result.response.text());

      const checks = [];

      // ── Phase 1: Starting Items ──
      if (s.mode === 'sr') {
        const si = json.startingItems || [];
        if (si.length !== 2) checks.push(`SI_COUNT=${si.length}`);
        if (si.length > 0 && !si.some(i => VALID_POTIONS.has(i))) checks.push('NO_POTION');
      } else {
        const si = json.startingItems || [];
        if (si.length > 0) checks.push(`ARAM_HAS_STARTERS=${si.length}`);
      }

      // ── Core Build ──
      const cb = json.coreBuild || [];
      if (cb.length < 5 || cb.length > 7) checks.push(`CORE=${cb.length}`);

      // ── Runes ──
      if (!json.runes?.keystone) checks.push('NO_KEYSTONE');
      if (json.runes?.primaryTree === json.runes?.secondaryTree) checks.push('SAME_TREES');

      // ── Summoners ──
      const sums = json.summoners || [];
      if (s.mode !== 'sr') {
        const hasSnowball = sums.some(s => /mark|dash|snowball/i.test(s));
        if (!hasSnowball) checks.push('NO_SNOWBALL');
      }

      // ── Phase 3: Augments (Mayhem only) ──
      if (s.mode === 'mayhem') {
        const augs = json.augments || [];
        if (augs.length < 2) checks.push(`AUGMENTS=${augs.length}`);
        const hasReasons = augs.every(a => a.reason && a.reason.length > 5);
        if (!hasReasons && augs.length > 0) checks.push('AUGS_NO_REASONS');
      }

      if (checks.length === 0) {
        const extras = [];
        if (s.mode === 'sr') extras.push(`SI: ${(json.startingItems||[]).join('+')}`);
        if (s.mode === 'mayhem') extras.push(`Augs: ${(json.augments||[]).length}`);
        extras.push(`Core: ${cb.length}`);
        console.log(`✅ ${elapsed}s | ${extras.join(' | ')}`);
        passed++;
        results.push({ label, status: '✅', time: elapsed });
      } else {
        console.log(`❌ ${elapsed}s | ${checks.join(', ')}`);
        failed++;
        results.push({ label, status: '❌', time: elapsed, issues: checks });
      }
    } catch (e) {
      console.log(`❌ ERROR: ${e.message.slice(0, 80)}`);
      failed++;
      results.push({ label, status: '❌', time: '?', issues: [e.message.slice(0, 80)] });
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED out of 10\n`);
  
  console.log('Mode     | Champion          | Status | Time  | Issues');
  console.log('─────────|───────────────────|────────|───────|──────────');
  for (const r of results) {
    const issues = r.issues ? r.issues.join(', ') : '';
    console.log(`${r.label.padEnd(25)} | ${r.status}     | ${(r.time + 's').padEnd(6)}| ${issues}`);
  }
  console.log(`${'═'.repeat(60)}`);
}

main().catch(console.error);
