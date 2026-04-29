require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('ERROR: GEMINI_API_KEY not set'); process.exit(1); }
const genAI = new GoogleGenerativeAI(API_KEY);

const BUILD_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "object", description: "Matchup analysis",
      properties: {
        matchupType: { type: "string", description: "poke, all-in, sustain, or scaling" },
        enemyDamageSplit: { type: "string", description: "e.g. AD-heavy (3 AD)" },
        keyThreats: { type: "string", description: "1-2 most dangerous enemies and why" }
      },
      required: ["matchupType", "enemyDamageSplit", "keyThreats"]
    },
    runes: {
      type: "object", description: "Complete rune page",
      properties: {
        primaryTree: { type: "string" }, keystone: { type: "string" },
        primaryRunes: { type: "array", items: { type: "string" } },
        secondaryTree: { type: "string" },
        secondaryRunes: { type: "array", items: { type: "string" } },
        shards: { type: "array", items: { type: "string" } }
      },
      required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"]
    },
    summoners: { type: "array", items: { type: "string" } },
    skillOrder: { type: "string" },
    startingItems: { type: "array", items: { type: "string" } },
    coreBuild: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] }
    },
    situationalItems: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, condition: { type: "string" } }, required: ["name"] }
    },
    junglePath: { type: "string" },
    enemyPowerSpikes: { type: "string" },
    winCondition: { type: "string" },
    yourPowerSpikes: { type: "string" }
  },
  required: ["analysis", "runes", "summoners", "skillOrder", "startingItems", "coreBuild", "situationalItems", "winCondition"]
};

function jsonBuildToText(json) {
  let text = '';
  if (json.analysis) {
    text += 'ANALYSIS\n';
    if (json.analysis.matchupType) text += `Matchup Type: ${json.analysis.matchupType}\n`;
    if (json.analysis.enemyDamageSplit) text += `Enemy Damage Split: ${json.analysis.enemyDamageSplit}\n`;
    if (json.analysis.keyThreats) text += `Key Threats: ${json.analysis.keyThreats}\n`;
    text += '\n';
  }
  if (json.runes) {
    text += 'RUNES\n';
    text += `Primary: ${json.runes.primaryTree}\nKeystone: ${json.runes.keystone}\n`;
    (json.runes.primaryRunes || []).forEach(r => text += `${r}\n`);
    text += `Secondary: ${json.runes.secondaryTree}\n`;
    (json.runes.secondaryRunes || []).forEach(r => text += `${r}\n`);
    text += `Shards: ${(json.runes.shards || []).join(', ')}\n\n`;
  }
  if (json.summoners) {
    text += 'SUMMONERS\n' + json.summoners.join('\n') + '\n\n';
  }
  if (json.skillOrder) text += `SKILL ORDER\n${json.skillOrder}\n\n`;
  if (json.startingItems) text += `STARTING ITEMS\n${json.startingItems.join('\n')}\n\n`;
  if (json.coreBuild) {
    text += 'CORE BUILD\n';
    json.coreBuild.forEach((item, idx) => {
      text += `${idx + 1}. ${item.name} (${item.reason})\n`;
    });
    text += '\n';
  }
  if (json.situationalItems) {
    text += 'SITUATIONAL ITEMS\n';
    json.situationalItems.forEach(item => {
      text += `${item.name}${item.condition ? ': ' + item.condition : ''}\n`;
    });
    text += '\n';
  }
  if (json.junglePath) text += `JUNGLE PATH\n${json.junglePath}\n\n`;
  if (json.winCondition) text += `WIN CONDITION\n${json.winCondition}\n\n`;
  return text.trim();
}

async function fetchRobustJsonBuild(genAI, primaryModelName, systemPrompt, userMessage) {
  const maxRetries = primaryModelName.includes('flash') ? 3 : 1;
  let rawText = '';
  let cleanText = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: primaryModelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: primaryModelName.includes('flash') ? 0.2 + (attempt * 0.1) : 0.3,
          topP: 0.85, topK: 40, maxOutputTokens: 8192,
          responseMimeType: 'application/json', responseSchema: BUILD_RESPONSE_SCHEMA,
        },
      });

      const startTime = Date.now();
      const result = await model.generateContent(userMessage);
      rawText = result.response.text();
      const elapsedS = ((Date.now() - startTime) / 1000).toFixed(1);
      
      const buildJson = JSON.parse(rawText);
      if (!buildJson.coreBuild || buildJson.coreBuild.length < 5) {
        throw new Error(`Parsed but missing core items (got ${buildJson.coreBuild ? buildJson.coreBuild.length : 0})`);
      }

      cleanText = jsonBuildToText(buildJson);
      return { text: cleanText, modelUsed: primaryModelName, elapsedS, attempt, error: null };
    } catch (e) {
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  if (primaryModelName.includes('flash')) {
    try {
      const proModel = genAI.getGenerativeModel({
        model: 'gemini-3.1-pro-preview', systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.3, topP: 0.85, topK: 40, maxOutputTokens: 8192,
          responseMimeType: 'application/json', responseSchema: BUILD_RESPONSE_SCHEMA,
        },
      });
      const startTime = Date.now();
      const result = await proModel.generateContent(userMessage);
      rawText = result.response.text();
      const elapsedS = ((Date.now() - startTime) / 1000).toFixed(1);
      cleanText = jsonBuildToText(JSON.parse(rawText));
      return { text: cleanText, modelUsed: 'gemini-3.1-pro-preview (Rescue)', elapsedS, attempt: 'Rescue', error: null };
    } catch (rescueErr) {
      return { text: '', modelUsed: 'FAILED', elapsedS: 0, attempt: 'Rescue Failed', error: rescueErr.message };
    }
  }

  return { text: '', modelUsed: 'FAILED', elapsedS: 0, attempt: maxRetries, error: 'All attempts failed' };
}

const SYSTEM_PROMPT = `You are a League of Legends build engine. output JSON. BUILD RULES:
- coreBuild: 6 items (7 if ADC).
- situationalItems: 4+.
- If Jungle, include junglePath.`;

const SCENARIOS = [
  { c: 'Vayne', r: 'ADC', e: ['Draven', 'Leona', 'Talon', 'Sejuani', 'Syndra'] },
  { c: 'Mundo', r: 'Jungle', e: ['Vayne', 'Lulu', 'Zed', 'KhaZix', 'Ornn'] },
  { c: 'Ahri', r: 'Mid', e: ['Yasuo', 'Nautilus', 'Samira', 'Lee Sin', 'Garen'] },
  { c: 'Nautilus', r: 'Support', e: ['Caitlyn', 'Lux', 'Viktor', 'Jarvan', 'Malphite'] },
  { c: 'Fiora', r: 'Top', e: ['Darius', 'Elise', 'Syndra', 'Ashe', 'Braum'] },
  { c: 'Ezreal', r: 'ADC', e: ['Lucian', 'Nami', 'Orianna', 'Vi', 'Camille'] },
  { c: 'Evelynn', r: 'Jungle', e: ['Jinx', 'Thresh', 'Ahri', 'Xin Zhao', 'Renekton'] },
  { c: 'Zed', r: 'Mid', e: ['Lissandra', 'Alistar', 'KaiSa', 'Zac', 'Sion'] },
  { c: 'Lulu', r: 'Support', e: ['KogMaw', 'Milio', 'Azir', 'Sejuani', 'Aatrox'] },
  { c: 'Camille', r: 'Top', e: ['Jax', 'Maokai', 'Cassiopeia', 'Xayah', 'Rakan'] },
];

async function main() {
  console.log('Running 10 complex scenarios against live API with retry logic...\n');
  const results = [];
  
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    process.stdout.write(`[${i+1}/10] ${s.c} ${s.r}... `);
    const msg = `Champion: ${s.c}, Role: ${s.r}, Enemies: ${s.e.join(', ')}`;
    const r = await fetchRobustJsonBuild(genAI, 'gemini-3-flash-preview', SYSTEM_PROMPT, msg);
    
    if (r.error) {
      console.log(`❌ FAILED (${r.error})`);
    } else {
      const isRescue = r.modelUsed.includes('Rescue');
      const timeStr = `${r.elapsedS}s`.padStart(6);
      const attemptStr = `(Attempt ${r.attempt})`.padEnd(12);
      const status = isRescue ? '🆘 RESCUED BY PRO' : '✅ SUCCESS';
      console.log(`${timeStr} | ${attemptStr} | ${status} | ${r.text.split('\\nCORE BUILD\\n')[1]?.split('\\n')[0].replace(/^1\.\\s*/,'')}`);
    }
    results.push(r);
    await new Promise(res => setTimeout(res, 1500));
  }
  
  console.log('\n--- SUMMARY ---');
  const rescues = results.filter(r => r.modelUsed.includes('Rescue')).length;
  const multiAttempts = results.filter(r => !r.modelUsed.includes('Rescue') && r.attempt > 1).length;
  const firstTries = results.filter(r => r.attempt === 1).length;
  
  console.log(`First Try Success: ${firstTries}/10`);
  console.log(`Required Retry:    ${multiAttempts}/10`);
  console.log(`Pro Rescues:       ${rescues}/10`);
  
  const totalTime = results.reduce((acc, r) => acc + parseFloat(r.elapsedS), 0);
  console.log(`Average Time:      ${(totalTime / 10).toFixed(1)}s`);
}

main().catch(console.error);
