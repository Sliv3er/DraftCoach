'use strict';

const fs = require('fs');
const path = require('path');

const API = process.env.DRAFTCOACH_BUILD_API || 'http://127.0.0.1:3210/api/build-dual';
const MODEL_ARG = (process.argv.find(arg => arg.startsWith('--model=')) || '').split('=')[1];
const OUT_ARG = (process.argv.find(arg => arg.startsWith('--out=')) || '').split('=')[1];
const STATIC_ONLY = process.argv.includes('--no-live') || process.argv.includes('--static-only');
const REQUEST_TIMEOUT_MS = Number(process.env.DRAFTCOACH_AI_REGRESSION_TIMEOUT_MS || 180000);

const ALL_MODELS = [
  { id: 'qwen/qwen3.6-flash', name: 'Qwen3.6 Flash' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
  { id: 'google/gemini-3.1-pro-preview-customtools', name: 'Gemini 3.1 Pro Custom Tools' },
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6' },
];
const MODELS = MODEL_ARG
  ? ALL_MODELS.filter(m => m.id.includes(MODEL_ARG) || m.name.toLowerCase().includes(MODEL_ARG.toLowerCase()))
  : ALL_MODELS;

if (!MODELS.length) {
  console.error(`No model matched --model=${MODEL_ARG}`);
  process.exit(2);
}

const SCENARIOS = [
  { name: 'Darius vs AP CC heal', myChampion: 'Darius', role: 'top', allies: ['Mordekaiser', 'Viktor', 'Zilean', 'Ezreal'], enemies: ['Katarina', 'Nami', 'Kennen', 'LeeSin', 'Lissandra'], expect: { boots: ['Mercury'], mr: 2, noCore: ['Plated Steelcaps', 'Thornmail', 'Mortal Reminder'], antiHeal: ['Chempunk Chainsword'] } },
  { name: 'Rammus jungle full AD crit', myChampion: 'Rammus', role: 'jungle', allies: ['Orianna', 'Jinx', 'Lulu', 'Garen'], enemies: ['Tryndamere', 'MasterYi', 'Yasuo', 'Draven', 'Pyke'], expect: { boots: ['Plated Steelcaps'], armor: 2, noCore: ["Mercury's Treads"] } },
  { name: 'Ahri vs suppress AP', myChampion: 'Ahri', role: 'mid', allies: ['Jinx', 'Thresh', 'Vi', 'Garen'], enemies: ['Malzahar', 'Warwick', 'Kaisa', 'Nautilus', 'Gwen'], expect: { qssSituational: true, mr: 1, noCore: ['Thornmail', 'Mortal Reminder'] } },
  { name: 'Jinx ADC vs assassins CC', myChampion: 'Jinx', role: 'adc', allies: ['Lulu', 'Orianna', 'Sejuani', 'Gwen'], enemies: ['Zed', 'Rengar', 'Leona', 'Syndra', 'Jhin'], expect: { adcItems: true, noCore: ["Zhonya's Hourglass", 'Thornmail', 'Heartsteel', 'Kaenic Rookern'], defensiveAny: ['Guardian Angel', 'Mercurial Scimitar', 'Maw of Malmortius'] } },
  { name: 'Soraka support vs dive healing', myChampion: 'Soraka', role: 'support', allies: ['Jinx', 'Ahri', 'Sejuani', 'Garen'], enemies: ['Draven', 'Pyke', 'Katarina', 'Aatrox', 'Vladimir'], expect: { supportStart: true, supportItems: true, noCore: ['Thornmail', 'Mortal Reminder', 'Infinity Edge', 'Bloodthirster'] } },
  { name: 'Mordekaiser vs ranged kite', myChampion: 'Mordekaiser', role: 'top', allies: ['Jinx', 'Lulu', 'Vi', 'Ahri'], enemies: ['Vayne', 'Kindred', 'Azir', 'Janna', 'Camille'], expect: { noCore: ['Thornmail'], situationalAny: ['Randuin', 'Dead Man', 'Rylai', 'Force of Nature', 'Spirit Visage'] } },
  { name: 'Ezreal ADC poke AP', myChampion: 'Ezreal', role: 'adc', allies: ['Karma', 'Graves', 'Azir', 'Ornn'], enemies: ['Caitlyn', 'Lux', 'Jayce', 'Nidalee', 'Xerath'], expect: { adcItems: true, mr: 1, noCore: ['Thornmail', 'Heartsteel', "Zhonya's Hourglass"] } },
  { name: 'Malphite top full AP', myChampion: 'Malphite', role: 'top', allies: ['Jinx', 'Lulu', 'Vi', 'Ahri'], enemies: ['Gwen', 'Elise', 'Syndra', 'Ziggs', 'Brand'], expect: { boots: ['Mercury'], mr: 2, noCore: ['Plated Steelcaps', 'Thornmail'] } },
  { name: 'Thresh support vs poke AP', myChampion: 'Thresh', role: 'support', allies: ['Jinx', 'Orianna', 'Vi', 'Garen'], enemies: ['Ziggs', 'Lux', 'Caitlyn', 'Nidalee', 'Jayce'], expect: { supportStart: true, supportItems: true, noCore: ['Infinity Edge', 'Bloodthirster', "Rabadon's Deathcap", 'Thornmail'] } },
  { name: 'Akali mid vs full AD dive', myChampion: 'Akali', role: 'mid', allies: ['Jinx', 'Thresh', 'Maokai', 'Fiora'], enemies: ['Yasuo', 'LeeSin', 'Jinx', 'Pyke', 'Garen'], expect: { boots: ['Plated Steelcaps'], armor: 1, noCore: ["Mercury's Treads"] } },
  { name: 'Renekton top AD assassins heal', myChampion: 'Renekton', role: 'top', allies: ['Karma', 'RekSai', 'Ezreal', 'Kassadin'], enemies: ['Pantheon', 'Kayn', 'Smolder', 'Naafiri', 'Ahri'], expect: { boots: ['Plated Steelcaps'], armor: 1, antiHeal: ['Chempunk Chainsword'], noCore: ["Zhonya's Hourglass", "Rabadon's Deathcap", 'Shadowflame', 'Malignance', "Luden's Echo", 'Void Staff', 'Morellonomicon'], noText: ["Zhonya", "Rabadon", 'Shadowflame', 'Malignance', "Luden", 'Void Staff', 'Morellonomicon'] } },
  { name: 'Darius off-role support AP CC', myChampion: 'Darius', role: 'support', allies: ['Udyr', 'KSante', 'Caitlyn', 'Lux'], enemies: ['Fiddlesticks', 'Viktor', 'Thresh', 'TahmKench', 'Lucian'], expect: { supportStart: true, supportUpgrade: true, supportUpgradeFirst: true, boots: ['Mercury'], noCore: ["Zhonya's Hourglass", "Rabadon's Deathcap", 'Shadowflame', 'Malignance', "Luden's Echo", 'Void Staff', 'Morellonomicon'], noText: ["Zhonya", "Rabadon", 'Shadowflame', 'Malignance', "Luden", 'Void Staff', 'Morellonomicon', 'Thornmail', 'Mortal Reminder'] } },
  { name: 'Aatrox off-role support suppression', myChampion: 'Aatrox', role: 'support', allies: ['Udyr', 'KSante', 'Caitlyn', 'Lux'], enemies: ['Ambessa', 'Amumu', 'Viktor', 'Thresh', 'Lucian'], expect: { supportStart: true, supportUpgrade: true, supportUpgradeFirst: true, boots: ['Mercury'], noCore: ["Zhonya's Hourglass", "Rabadon's Deathcap", 'Shadowflame', 'Malignance', "Luden's Echo", 'Void Staff', 'Morellonomicon'], noText: ["Zhonya", "Rabadon", 'Shadowflame', 'Malignance', "Luden", 'Void Staff', 'Morellonomicon', 'Thornmail', 'Mortal Reminder'] } },
  { name: 'Caitlyn ADC no heal no forced antiheal', myChampion: 'Caitlyn', role: 'adc', allies: ['Lulu', 'Orianna', 'Sejuani', 'Garen'], enemies: ['Jhin', 'Zed', 'Orianna', 'Leona', 'Graves'], expect: { adcItems: true, noAntiHeal: true, exclusiveArmorPen: true, noCore: ['Thornmail', 'Mortal Reminder', 'Morellonomicon', 'Chempunk Chainsword'] } },
  { name: 'Jinx ADC tanks healing armor pen exclusivity', myChampion: 'Jinx', role: 'adc', allies: ['Lulu', 'Orianna', 'Sejuani', 'Garen'], enemies: ['DrMundo', 'Soraka', 'Ornn', 'Zed', 'Jhin'], expect: { adcItems: true, antiHeal: ['Mortal Reminder'], exclusiveArmorPen: true, noCore: ['Black Cleaver', "Serylda's Grudge", "Lord Dominik's Regards"] } },
  { name: 'Jax top physical pressure keeps boots', myChampion: 'Jax', role: 'top', allies: ['Viego', 'Akali', 'Ashe', 'Seraphine'], enemies: ['Urgot', 'Khazix', 'Ahri', 'Smolder', 'Poppy'], expect: { boots: ['Plated Steelcaps'], armor: 1, noCore: ["Sorcerer's Shoes", "Mercury's Treads"] } },
  { name: 'Darius top confirmed Kayle lane roles', myChampion: 'Darius', role: 'top', allies: ['Vladimir', 'Graves', 'Bard', 'Yone'], enemies: ['Senna', 'Lucian', 'Vi', 'Galio', 'Kayle'], enemyRoles: { Senna: 'adc', Lucian: 'mid', Vi: 'jungle', Galio: 'support', Kayle: 'top' }, expect: { boots: ['Mercury'], noText: ['Senna Top'], mustText: ['Kayle'] } },
  { name: 'Fizz mid AP assassin class safety', myChampion: 'Fizz', role: 'mid', allies: ['Camille', 'XinZhao', 'Ezreal', 'Malphite'], enemies: ['Milio', 'Kaisa', 'Akshan', 'Tryndamere', 'Kayn'], enemyRoles: { Milio: 'support', Kaisa: 'adc', Akshan: 'top', Tryndamere: 'mid', Kayn: 'jungle' }, expect: { apItems: 3, noCore: ['Chempunk Chainsword', "Sterak's Gage", 'Guardian Angel', 'Maw of Malmortius', 'Black Cleaver', 'Sundered Sky'], noText: ['off-class AP item removed', 'class-appropriate Grievous Wounds'] } },
];

const HEADERS = ['ANALYSIS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH', 'ENEMY POWER SPIKES', 'WIN CONDITION', 'YOUR POWER SPIKES'];
const MR = ["Mercury's Treads", 'Kaenic Rookern', 'Force of Nature', 'Spirit Visage', 'Maw of Malmortius', "Wit's End", "Banshee's Veil", 'Mercurial Scimitar'];
const ARMOR = ['Plated Steelcaps', "Randuin's Omen", 'Frozen Heart', "Dead Man's Plate", 'Thornmail', "Zhonya's Hourglass", 'Guardian Angel', "Jak'Sho, The Protean"];
const SUPPORT = ['World Atlas', 'Dream Maker', 'Celestial Opposition', 'Solstice Sleigh', 'Bloodsong', "Zaz'Zak's Realmspike", 'Locket of the Iron Solari', 'Redemption', "Mikael's Blessing", "Knight's Vow", "Zeke's Convergence", 'Trailblazer', 'Dawncore', 'Imperial Mandate', "Shurelya's Battlesong", 'Ardent Censer', 'Staff of Flowing Water'];
const SUPPORT_UPGRADES = ['Dream Maker', 'Celestial Opposition', 'Solstice Sleigh', 'Bloodsong', "Zaz'Zak's Realmspike"];
const ADC_BAD = ['Thornmail', 'Heartsteel', 'Kaenic Rookern', 'Sunfire Aegis', 'Unending Despair', "Zhonya's Hourglass"];
const COMPONENT_NAMES = ['Null-Magic Mantle', 'Kindlegem', 'Ruby Crystal', 'Long Sword', 'Amplifying Tome', 'Cloth Armor', 'Chain Vest', 'Pickaxe', 'Recurve Bow'];
const GRIEVOUS_ITEMS = ['Thornmail', 'Mortal Reminder', 'Morellonomicon', 'Chempunk Chainsword'];
const ARMOR_PEN_EXCLUSIVE_ITEMS = ['Black Cleaver', "Lord Dominik's Regards", 'Mortal Reminder', "Serylda's Grudge", 'Terminus'];
const AP_ITEMS = ["Zhonya's Hourglass", "Rabadon's Deathcap", 'Shadowflame', 'Void Staff', 'Cryptbloom', "Banshee's Veil", 'Morellonomicon', 'Lich Bane', 'Stormsurge', 'Cosmic Drive', "Nashor's Tooth", 'Malignance', "Luden's Echo", "Liandry's Torment", "Rylai's Crystal Scepter", "Mejai's Soulstealer", "Zaz'Zak's Realmspike"];
const BOOTS = ['Plated Steelcaps', "Mercury's Treads", 'Boots of Swiftness', "Berserker's Greaves", 'Ionian Boots of Lucidity', "Sorcerer's Shoes", 'Symbiotic Soles'];

function section(text, header) {
  const others = HEADERS.filter(h => h !== header).join('|');
  const match = String(text || '').match(new RegExp(`(?:^|\\n)${header}\\s*\\n([\\s\\S]*?)(?=\\n(?:${others})\\s*\\n|$)`, 'i'));
  return match ? match[1].trim() : '';
}

function itemName(line) {
  return String(line || '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*:\s*.*$/, '')
    .trim();
}

function items(text) {
  return String(text || '').split('\n').map(itemName).filter(Boolean);
}

function hasName(list, pattern) {
  return list.some(item => new RegExp(pattern, 'i').test(item));
}

function challengerJudge(text, scenario, core, situational) {
  const analysis = section(text, 'ANALYSIS');
  const winCondition = section(text, 'WIN CONDITION');
  const reasoning = `${analysis}\n${section(text, 'ENEMY POWER SPIKES')}\n${winCondition}\n${situational.join('\n')}`;
  const allItems = [...core, ...situational];
  const e = scenario.expect || {};
  const issues = [];

  if (/DECISION TRACE/i.test(text)) issues.push('backend decision trace leaked to UI output');
  if (!/Base Build:\s*BUILD\s*[123]/i.test(reasoning)) issues.push('does not state chosen U.GG build variant');
  if (!/matchup|damage split|key threats|survivability|priority/i.test(analysis)) issues.push('analysis lacks structured matchup reasoning');
  if (!winCondition || winCondition.length < 60) issues.push('win condition too thin');

  if (e.mr && !/AP|magic|MR|crowd control|CC|burst/i.test(reasoning)) {
    issues.push('MR/AP threat not explained');
  }
  if (e.armor && !/AD|physical|armor|auto|crit|dive/i.test(reasoning)) {
    issues.push('armor/AD threat not explained');
  }
  if (e.qssSituational && !/suppression|QSS|Mercurial|cleanse|lockdown/i.test(reasoning)) {
    issues.push('suppression counter not explained');
  }
  if (e.antiHeal && !/heal|healing|Grievous|anti-heal/i.test(reasoning)) {
    issues.push('anti-heal trigger not explained');
  }
  if (e.supportItems && !/support|peel|utility|protect|engage|economy/i.test(reasoning)) {
    issues.push('support economy/role not explained');
  }
  if (e.adcItems && !/carry|range|DPS|kite|crit|marksman|survive/i.test(reasoning)) {
    issues.push('ADC win condition not explained');
  }

  if (hasName(core, 'Mercury') && /Plated Steelcaps (?:are|is|provide|preferred|required)/i.test(reasoning)) {
    issues.push('reasoning contradicts Mercury boots');
  }
  if (hasName(core, 'Plated Steelcaps') && /Mercury'?s Treads (?:are|is|provide|preferred|required)/i.test(reasoning) && !e.mr) {
    issues.push('reasoning contradicts Steelcaps boots');
  }
  if (allItems.some(item => /Thornmail/i.test(item)) && /ranged\/enchanter|Nami|Soraka|support healing/i.test(reasoning) && !/tank|being hit|auto/i.test(reasoning)) {
    issues.push('Thornmail reasoning looks wrong for ranged/enchanter healing');
  }

  return { score: Math.max(0, 100 - issues.length * 10), issues };
}

function audit(text, scenario) {
  const analysis = section(text, 'ANALYSIS');
  const runes = section(text, 'RUNES');
  const core = items(section(text, 'CORE BUILD'));
  const situational = items(section(text, 'SITUATIONAL ITEMS'));
  const starting = items(section(text, 'STARTING ITEMS'));
  const all = [...core, ...situational];
  const e = scenario.expect || {};
  const issues = [];
  const notes = [];

  if (!analysis || analysis.length < 80) issues.push('analysis thin');
  if (!/Primary:/i.test(runes) || !/Secondary:/i.test(runes) || !/Keystone:/i.test(runes)) issues.push('runes incomplete');
  const expectedCore = /^(adc|bot|bottom)$/i.test(scenario.role) ? 7 : 6;
  if (core.length !== expectedCore) issues.push(`core count ${core.length}/${expectedCore}`);
  if (!core.some(x => BOOTS.some(boot => boot.toLowerCase() === x.toLowerCase()))) issues.push('missing upgraded boots');
  const duplicate = core.filter((x, i, arr) => arr.findIndex(y => y.toLowerCase() === x.toLowerCase()) !== i);
  if (duplicate.length) issues.push(`duplicate ${duplicate.join(',')}`);
  for (const component of COMPONENT_NAMES) {
    if (core.some(item => item.toLowerCase() === component.toLowerCase())) issues.push(`component in core ${component}`);
  }
  if (e.boots && !e.boots.some(b => hasName(core, b))) issues.push(`missing expected boots ${e.boots.join('/')}`);
  if (e.mr && core.filter(x => MR.some(m => x.toLowerCase().includes(m.toLowerCase()))).length < e.mr) issues.push(`MR items below ${e.mr}`);
  if (e.armor && core.filter(x => ARMOR.some(m => x.toLowerCase().includes(m.toLowerCase()))).length < e.armor) issues.push(`armor items below ${e.armor}`);
  if (e.noCore) for (const bad of e.noCore) if (core.some(x => x.toLowerCase() === bad.toLowerCase())) issues.push(`bad core ${bad}`);
  if (e.noText) for (const bad of e.noText) if (new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) issues.push(`bad narrative ${bad}`);
  if (e.mustText) for (const good of e.mustText) if (!new RegExp(good.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) issues.push(`missing narrative ${good}`);
  if (/Sundered Sky\s*\([^)]*(anti-heal|grievous|damage reduction|true damage|%HP|shield)/i.test(text)) issues.push('false Sundered Sky item reasoning');
  if (/Mercurial Scimitar:.*stasis/i.test(text)) issues.push('false Mercurial Scimitar stasis reasoning');
  if (/Maw of Malmort(?!ius)\w*/i.test(text)) issues.push('uncorrected Maw typo');
  if (/Eclipse\s*\([^)]*(armor|wave clear|sustain)/i.test(text) || /Eclipse:.*(?:armor|sustain)/i.test(text)) issues.push('false Eclipse item reasoning');
  if (/Plated Steelcaps\s*\([^)]*(AD damage|\d+%|15-20|Pantheon Q)/i.test(text) || /Plated Steelcaps:.*(?:AD damage|\d+%|15-20|Pantheon Q)/i.test(text)) issues.push('false Plated Steelcaps item reasoning');
  if (/Sterak's Gage\s*\([^)]*Tenacity/i.test(text) || /Sterak's Gage:.*Tenacity/i.test(text)) issues.push('false Sterak item reasoning');
  if (/Death's Dance\s*\([^)]*true damage/i.test(text) || /Death's Dance:.*true damage/i.test(text) || /true damage from Ahri/i.test(text)) issues.push('false Death Dance item reasoning');
  if (/cannot stack|mutually exclusive|keeping (?:Mortal Reminder|Lord Dominik|Serylda|Black Cleaver|Terminus)/i.test(text)) issues.push('validator wording leaked to item reasoning');
  if (e.antiHeal && !e.antiHeal.some(x => core.some(c => c.toLowerCase() === x.toLowerCase()))) issues.push(`missing expected anti-heal ${e.antiHeal.join('/')}`);
  if (e.noAntiHeal) {
    for (const bad of GRIEVOUS_ITEMS) {
      if (all.some(x => x.toLowerCase() === bad.toLowerCase())) issues.push(`unforced anti-heal item ${bad}`);
    }
    if (/(mandatory|must-buy|required|non-negotiable)\s+(anti-heal|grievous wounds)|(anti-heal|grievous wounds)\s+(is|are|becomes|remains)\s+(mandatory|required|non-negotiable)/i.test(text)) {
      issues.push('unforced mandatory anti-heal narrative');
    }
  }
  if (e.exclusiveArmorPen) {
    const group = all.filter(x => ARMOR_PEN_EXCLUSIVE_ITEMS.some(item => item.toLowerCase() === x.toLowerCase()));
    const unique = [...new Set(group.map(x => x.toLowerCase()))];
    if (unique.length > 1) issues.push(`exclusive armor-pen conflict ${group.join(' + ')}`);
    const names = ARMOR_PEN_EXCLUSIVE_ITEMS.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const conflictSentence = new RegExp(`[^.\\n]*(?:${names})[^.\\n]*(?:${names})[^.\\n]*\\.`, 'i');
    if (conflictSentence.test(text)) issues.push('exclusive armor-pen conflict narrative');
  }
  if (e.qssSituational && !all.some(x => /Mercurial|QSS|Quicksilver/i.test(x))) issues.push('missing QSS/Mercurial vs suppression');
  if (e.supportStart && !starting.some(x => /World Atlas/i.test(x))) issues.push('support start missing World Atlas');
  if (e.supportUpgrade && !core.some(x => SUPPORT_UPGRADES.some(s => s.toLowerCase() === x.toLowerCase()))) issues.push('support upgrade missing from core');
  if (e.supportUpgradeFirst && !SUPPORT_UPGRADES.some(s => s.toLowerCase() === String(core[0] || '').toLowerCase())) issues.push('support upgrade not first core slot');
  if (e.supportUpgradeFirst && core.slice(1).some(x => SUPPORT_UPGRADES.some(s => s.toLowerCase() === x.toLowerCase()))) issues.push('support upgrade duplicated after slot 1');
  if (e.supportItems && core.filter(x => SUPPORT.some(m => x.toLowerCase().includes(m.toLowerCase()))).length < 3) issues.push('support core not support-economy enough');
  if (e.adcItems && core.some(x => ADC_BAD.some(b => x.toLowerCase() === b.toLowerCase()))) issues.push('ADC has off-class core');
  if (e.apItems && core.filter(x => AP_ITEMS.some(ap => x.toLowerCase() === ap.toLowerCase())).length < e.apItems) issues.push(`AP core items below ${e.apItems}`);
  if (e.defensiveAny && !e.defensiveAny.some(x => all.some(i => i.toLowerCase().includes(x.toLowerCase())))) notes.push(`no listed defensive option ${e.defensiveAny.join('/')}`);
  if (e.situationalAny && !e.situationalAny.some(x => all.some(i => i.toLowerCase().includes(x.toLowerCase())))) notes.push(`no expected situational family ${e.situationalAny.join('/')}`);
  if (/Malmortir|Malmortiter|Guardian's Angel|Serpant|Quicksilver Sash/i.test(text)) issues.push('uncorrected item typo');
  const judge = challengerJudge(text, scenario, core, situational);
  if (judge.score < 80) issues.push(`challenger judge below threshold (${judge.score})`);

  return { issues, notes, judge, core, situational, starting, analysis: analysis.slice(0, 500), runes: runes.replace(/\s+/g, ' ').slice(0, 220) };
}

async function readSseBuild(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final = '';
  let source = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      const line = event.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6));
      if (payload.phase === 'full' && payload.corrected) final = payload.corrected;
      if (payload.phase === 'full' && payload.fullText !== undefined) {
        final = payload.fullText;
        source = payload.source || source;
      }
      if (payload.error) throw new Error(payload.error);
    }
  }
  if (!final.trim()) throw new Error('empty final build');
  return { final, source };
}

async function runOne(model, scenario) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...scenario, model: model.id, gameMode: 'sr' }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { final, source } = await readSseBuild(response);
    return {
      elapsedMs: Date.now() - started,
      source,
      text: final,
      audit: audit(final, scenario),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function assertServer() {
  try {
    const res = await fetch(API.replace('/api/build-dual', '/health'));
    if (!res.ok) throw new Error(`health HTTP ${res.status}`);
  } catch (err) {
    console.error(`DraftCoach backend is not reachable at ${API}. Start the sidecar/app first. (${err.message})`);
    process.exit(2);
  }
}

function runStaticAdvisorChecks() {
  const mainPath = path.resolve(__dirname, '..', 'apps/desktop/src/main/main.cjs');
  const source = fs.readFileSync(mainPath, 'utf8');
  const buildOutputPath = path.resolve(__dirname, '..', 'apps/desktop-tauri/src/components/BuildOutput.tsx');
  const buildOutputSource = fs.readFileSync(buildOutputPath, 'utf8');
  const uggSyncPath = path.resolve(__dirname, 'sync-ugg.cjs');
  const uggSyncSource = fs.readFileSync(uggSyncPath, 'utf8');
  const buildTemplatesPath = path.resolve(__dirname, '..', 'shared/kb/data/build-templates.json');
  const buildTemplates = JSON.parse(fs.readFileSync(buildTemplatesPath, 'utf8'));
  const issues = [];
  if (!source.includes('REJECTED component in live advisor')) issues.push('live advisor does not reject component next-items');
  if (!source.includes('completed item goals only')) issues.push('live advisor prompt does not require completed item goals');
  if (source.includes('recommend the buyable component')) issues.push('live advisor still tells AI to recommend buyable components');
  if (!source.includes('VALIDATED LIVE BUILD PLAN') || !source.includes('Treat VALIDATED LIVE BUILD PLAN as the source of truth')) issues.push('live advisor is not anchored to the validated build plan');
  if (!source.includes('Ignored NEXT ITEMS outside validated plan')) issues.push('live advisor does not reject next-item drift from the validated plan');
  if (!source.includes('const safeChanges = changes.filter(c => Boolean(c.currentItem && c.recommendedItem))')) issues.push('live advisor still blocks explicit swaps of the next planned item');
  if (!source.includes('META BASELINE ALREADY SHOWN TO THE USER') || !source.includes('REFERENCE BUILDS')) issues.push('U.GG refinement context is missing baseline or variant builds');
  if (!source.includes('CONFIRMED ENEMY ROLES from League client assignedPosition') || !source.includes('sanitizeEnemyRoleClaims')) issues.push('enemy role assignment guard is missing');
  if (!source.includes('DECISION TRACE')) issues.push('backend decision trace prompt/gate is missing');
  if (!source.includes('stripDecisionTrace')) issues.push('backend does not strip decision trace before UI output');
  if (!source.includes('judgeReasoningQuality')) issues.push('backend reasoning judge is missing');
  if (!source.includes('enforceBootInvariant') || !source.includes('coreItems.length === expectedCore && coreItems.some(isBootItemName)')) issues.push('core build boot invariant is missing');
  if (!source.includes('preserveCanonicalBootSlot') || !source.includes('_canonicalBuildItems')) issues.push('live advisor can still drop canonical boots from full plan');
  if (!source.includes('scoreKBBuildTemplateData') || !source.includes('kbGeneratedAtMs')) issues.push('KB loader can still prefer stale incomplete same-patch cache data');
  if (!source.includes('antiHealDecisionForChampion') || !source.includes('BRUISER_THORNMAIL_OK_CHAMPIONS') || !source.includes('AD bruisers like Darius/Renekton/Aatrox may prefer Thornmail') || !source.includes('do not force full anti-heal for one minor healing source')) issues.push('anti-heal selection is not draft/class aware enough');
  if (!buildOutputSource.includes('liveUpdatedItemsContainBoots')) issues.push('main UI can still render bootless live-updated core builds');
  if (!uggSyncSource.includes('defaultBootChoice') || !uggSyncSource.includes('padCoreItems') || !uggSyncSource.includes('itemAllowedForChampion')) issues.push('U.GG sync no longer pads sparse builds with role-safe full items');
  for (const [key, template] of Object.entries(buildTemplates.data || {})) {
    for (const [label, variant] of Object.entries(template.variants || {})) {
      const coreCount = (variant.coreItems || []).length + (variant.bootChoice ? 1 : 0);
      if (!variant.bootChoice || coreCount < 6) {
        issues.push(`U.GG baseline incomplete: ${key}/${label} has ${coreCount} items`);
        break;
      }
    }
    if (issues.some(issue => issue.startsWith(`U.GG baseline incomplete: ${key}/`))) break;
  }
  return issues;
}

(async () => {
  const staticIssues = runStaticAdvisorChecks();
  if (staticIssues.length) {
    console.error('Static regression checks failed:');
    for (const issue of staticIssues) console.error(`- ${issue}`);
    process.exit(1);
  }
  if (STATIC_ONLY) {
    console.log('Static regression checks passed.');
    return;
  }

  await assertServer();
  const results = [];
  for (const scenario of SCENARIOS) {
    for (const model of MODELS) {
      process.stdout.write(`[${model.name}] ${scenario.name}... `);
      try {
        const result = await runOne(model, scenario);
        results.push({ model: model.name, modelId: model.id, scenario: scenario.name, ...result });
        const judgeInfo = `judge=${result.audit.judge.score}`;
        console.log(`${(result.elapsedMs / 1000).toFixed(1)}s ${judgeInfo} issues=${result.audit.issues.length}${result.audit.issues.length ? ` ${result.audit.issues.join('; ')}` : ''}`);
      } catch (err) {
        results.push({ model: model.name, modelId: model.id, scenario: scenario.name, error: err.message });
        console.log(`ERROR ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  const failures = results.filter(r => r.error || r.audit.issues.length);
  console.log('\n=== SUMMARY ===');
  for (const model of MODELS) {
    const group = results.filter(r => r.model === model.name);
    const ok = group.filter(r => !r.error && !r.audit.issues.length).length;
    const avg = group.filter(r => !r.error).reduce((sum, r) => sum + r.elapsedMs, 0) / Math.max(1, group.filter(r => !r.error).length);
    const judgeAvg = group.filter(r => !r.error).reduce((sum, r) => sum + (r.audit.judge?.score || 0), 0) / Math.max(1, group.filter(r => !r.error).length);
    console.log(`${model.name}: ${ok}/${group.length} pass, judge ${judgeAvg.toFixed(1)}, avg ${(avg / 1000).toFixed(1)}s`);
  }

  if (OUT_ARG) fs.writeFileSync(path.resolve(OUT_ARG), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  if (failures.length) {
    console.log('\n=== FAILURES ===');
    for (const failure of failures) {
      console.log(`\n${failure.model} / ${failure.scenario}`);
      if (failure.error) console.log(`error: ${failure.error}`);
      else {
        console.log(`issues: ${failure.audit.issues.join('; ')}`);
        console.log(`core: ${failure.audit.core.join(' | ')}`);
        console.log(`situational: ${failure.audit.situational.slice(0, 5).join(' | ')}`);
        if (failure.audit.judge?.issues?.length) console.log(`judge: ${failure.audit.judge.issues.join('; ')}`);
        console.log(`analysis: ${failure.audit.analysis.replace(/\n/g, ' / ')}`);
      }
    }
    process.exit(1);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
