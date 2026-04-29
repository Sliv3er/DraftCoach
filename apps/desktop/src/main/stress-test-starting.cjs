/**
 * Stress test: Verify starting items are always exactly 2 valid items
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('ERROR: GEMINI_API_KEY not set'); process.exit(1); }
const genAI = new GoogleGenerativeAI(API_KEY);

const BUILD_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysis: { type: "object", properties: { matchupType: { type: "string" }, enemyDamageSplit: { type: "string" }, keyThreats: { type: "string" } }, required: ["matchupType"] },
    runes: { type: "object", properties: { primaryTree: { type: "string" }, keystone: { type: "string" }, primaryRunes: { type: "array", items: { type: "string" } }, secondaryTree: { type: "string" }, secondaryRunes: { type: "array", items: { type: "string" } }, shards: { type: "array", items: { type: "string" } } }, required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"] },
    summoners: { type: "array", items: { type: "string" } },
    skillOrder: { type: "string" },
    startingItems: { type: "array", items: { type: "string" }, description: "Exactly 2 items: 1 starting item + 1 potion. Total cost ≤500g. Use ONLY from VALID STARTING ITEMS list." },
    coreBuild: { type: "array", items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] } },
    situationalItems: { type: "array", items: { type: "object", properties: { name: { type: "string" }, condition: { type: "string" } }, required: ["name"] } },
    junglePath: { type: "string" },
    winCondition: { type: "string" }
  },
  required: ["runes", "summoners", "skillOrder", "startingItems", "coreBuild", "situationalItems", "winCondition"]
};

const VALID_STARTERS = new Set([
  "Doran's Blade", "Doran's Ring", "Doran's Shield", "Doran's Bow", "Doran's Helm",
  "Dark Seal", "Cull", "Tear of the Goddess", "World Atlas", "Cappa Juice",
  "Scorchclaw Pup", "Gustwalker Hatchling", "Mosstomper Seedling",
  "Health Potion", "Refillable Potion", "Control Ward",
  "Long Sword", "Amplifying Tome", "Cloth Armor", "Ruby Crystal", "Null-Magic Mantle", "Sapphire Crystal",
  "Boots", "Rejuvenation Bead", "Faerie Charm", "Dagger", "Glowing Mote",
]);

const VALID_POTIONS = new Set(["Health Potion", "Refillable Potion"]);

const SYSTEM_PROMPT = `You are a League of Legends build engine. Output JSON.
BUILD RULES:
- coreBuild: 6 items (7 if ADC). Boots #1 or #2.
- situationalItems: 4+.
- If Jungle, include junglePath.

STARTING ITEMS RULES:
- startingItems: Exactly 2 items — 1 starting item + 1 potion.
- Starting gold = 500g. Total ≤500g.
- Jungle: 1 companion + Health Potion.
- Support: World Atlas + Health Potion.
- NEVER put starting items in coreBuild.`;

const SCENARIOS = [
  { c: 'Vayne',     r: 'ADC',     e: ['Draven', 'Leona'] },
  { c: 'Mundo',     r: 'Jungle',  e: ['KhaZix', 'Ornn'] },
  { c: 'Ahri',      r: 'Mid',     e: ['Yasuo', 'Lee Sin'] },
  { c: 'Nautilus',   r: 'Support', e: ['Caitlyn', 'Lux'] },
  { c: 'Fiora',     r: 'Top',     e: ['Darius', 'Elise'] },
  { c: 'Ezreal',    r: 'ADC',     e: ['Lucian', 'Nami'] },
  { c: 'Evelynn',   r: 'Jungle',  e: ['Jinx', 'Thresh'] },
  { c: 'Zed',       r: 'Mid',     e: ['Lissandra', 'Zac'] },
  { c: 'Lulu',      r: 'Support', e: ['KogMaw', 'Milio'] },
  { c: 'Camille',   r: 'Top',     e: ['Jax', 'Maokai'] },
];

const STARTING_ITEMS_REF = `VALID STARTING ITEMS (Starting gold = 500g):
  Laner: Doran's Blade (450g), Doran's Ring (400g), Doran's Shield (450g), Doran's Bow (400g), Doran's Helm (450g), Dark Seal (350g), Cull (450g)
  Jungle: Scorchclaw Pup (450g), Gustwalker Hatchling (450g), Mosstomper Seedling (450g)
  Support: World Atlas (400g)
  Potions: Health Potion (50g), Refillable Potion (150g)
  RULE: Buy exactly 1 starting item + 1 potion. Total ≤500g.`;

async function main() {
  console.log('Stress Test: Starting Items Validation (10 scenarios)\n');
  let passed = 0, failed = 0;
  const issues = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    process.stdout.write(`[${i+1}/10] ${s.c} ${s.r}... `);
    
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          temperature: 0.3, topP: 0.9, topK: 64, maxOutputTokens: 8192,
          responseMimeType: 'application/json', responseSchema: BUILD_RESPONSE_SCHEMA,
        },
      });

      const msg = `${STARTING_ITEMS_REF}\n\nChampion: ${s.c}, Role: ${s.r}, Enemies: ${s.e.join(', ')}. Generate optimized build. startingItems must be exactly 2 items (1 starter + 1 potion, ≤500g).`;
      const t0 = Date.now();
      const result = await model.generateContent(msg);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const json = JSON.parse(result.response.text());

      const si = json.startingItems || [];
      const siCount = si.length;
      const hasPotion = si.some(i => VALID_POTIONS.has(i));
      const allValid = si.every(i => VALID_STARTERS.has(i));
      const isJungle = /jungle/i.test(s.r);
      const isSupport = /support/i.test(s.r);
      
      const checks = [];
      if (siCount !== 2) checks.push(`COUNT=${siCount} (expected 2)`);
      if (!hasPotion) checks.push(`NO POTION`);
      if (!allValid) {
        const invalid = si.filter(i => !VALID_STARTERS.has(i));
        checks.push(`INVALID: ${invalid.join(', ')}`);
      }
      if (isJungle && !si.some(i => i.includes('Pup') || i.includes('Hatchling') || i.includes('Seedling'))) {
        checks.push('JUNGLE: no companion');
      }
      if (isSupport && !si.includes('World Atlas')) {
        checks.push('SUPPORT: no World Atlas');
      }

      if (checks.length === 0) {
        console.log(`✅ ${elapsed}s | ${si.join(' + ')}`);
        passed++;
      } else {
        console.log(`❌ ${elapsed}s | ${si.join(' + ')} | ${checks.join(', ')}`);
        failed++;
        issues.push({ scenario: `${s.c} ${s.r}`, items: si, issues: checks });
      }
    } catch (e) {
      console.log(`❌ ERROR: ${e.message.slice(0, 60)}`);
      failed++;
      issues.push({ scenario: `${s.c} ${s.r}`, items: [], issues: [e.message] });
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED out of 10`);
  if (issues.length > 0) {
    console.log('\nFAILURES:');
    for (const i of issues) {
      console.log(`  ${i.scenario}: ${i.items.join(' + ')} — ${i.issues.join(', ')}`);
    }
  }
  console.log(`${'═'.repeat(60)}`);
}

main().catch(console.error);
