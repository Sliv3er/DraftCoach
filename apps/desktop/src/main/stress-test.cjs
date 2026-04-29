/**
 * Stress test for FRONTEND rendering resilience.
 * Tests that the UI parsers correctly handle all known AI output formats.
 * Run: node apps/desktop/src/main/stress-test.cjs
 */

'use strict';

// ══════════════════════════════════════════════════════════════
//  Simulate the FRONTEND parsers (matching BuildOutput.tsx logic)
// ══════════════════════════════════════════════════════════════

function parseRunes(content) {
  const lines = content.split('\n').filter(l => l.trim());
  let primaryTree = '', secondaryTree = '', keystone = '';
  const primaryRunes = [], secondaryRunes = [], shards = [];
  let section = 'primary';

  for (const rawLine of lines) {
    let line = rawLine.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
    line = line.replace(/^Row\s*\d+:\s*/i, '');

    if (/^primary(?:\s+tree)?:/i.test(line)) {
      primaryTree = line.replace(/^primary(?:\s+tree)?:\s*/i, '').trim();
      section = 'primary';
      continue;
    }
    if (/^secondary(?:\s+tree)?:/i.test(line)) {
      secondaryTree = line.replace(/^secondary(?:\s+tree)?:\s*/i, '').trim();
      section = 'secondary';
      continue;
    }
    if (/^(?:stat\s+)?shards?:/i.test(line)) {
      const inlineShards = line.replace(/^(?:stat\s+)?shards?:\s*/i, '');
      if (inlineShards.trim()) {
        shards.push(...inlineShards.split(',').map(x => x.trim()).filter(Boolean));
      }
      section = 'shards';
      continue;
    }
    if (/^keystone:/i.test(line)) {
      keystone = line.replace(/^keystone:\s*/i, '').replace(/\s*\(.*\)$/, '').trim();
      continue;
    }

    const name = line.replace(/\s*\(.*\)$/, '').trim();
    if (!name) continue;
    if (section === 'primary') primaryRunes.push(name);
    else if (section === 'secondary') secondaryRunes.push(name);
    else if (section === 'shards') shards.push(name);
  }

  if (!keystone && primaryRunes.length > 0) keystone = primaryRunes.shift();
  return { primaryTree, secondaryTree, keystone, primaryRunes, secondaryRunes, shards };
}

function parseSummoners(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const names = [];
  for (const line of lines) {
    let cleaned = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
    cleaned = cleaned.replace(/^\d+[.)\s]+\s*/, '');
    // Strip dash/em-dash/en-dash explanations: "Flash — Essential" → "Flash"
    cleaned = cleaned.replace(/\s*[—–\-]\s+.+$/, '');
    // Strip parenthetical: "Smite (Required)" → "Smite"
    cleaned = cleaned.replace(/\s*\(.*\)\s*$/, '');
    names.push(cleaned.trim());
  }
  return names;
}

function parseSkillOrder(content) {
  let skillText = content;
  const orderMatch = content.match(/([QWER])\s*>\s*([QWER])\s*>\s*([QWER])\s*>\s*([QWER])/i);
  if (orderMatch) {
    skillText = `${orderMatch[1]} > ${orderMatch[2]} > ${orderMatch[3]} > ${orderMatch[4]}`;
  } else {
    const abilities = [];
    const maxMatches = content.match(/(?:Max|1st|2nd|3rd|4th)[^:]*:\s*([QWER])/gi);
    if (maxMatches) {
      for (const m of maxMatches) {
        const letter = m.match(/([QWER])\s*$/i);
        if (letter) abilities.push(letter[1].toUpperCase());
      }
    }
    if (abilities.length >= 3) {
      const all = ['Q', 'W', 'E', 'R'];
      const missing = all.filter(a => !abilities.includes(a));
      skillText = [...abilities, ...missing].join(' > ');
    }
  }
  const parts = skillText.split('>').map(s => s.trim()).filter(Boolean);
  return parts;
}

function parseItems(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const items = [];
  for (const line of lines) {
    let text = line.trim().replace(/\*\*/g, '');
    const numMatch = text.match(/^(\d+)[.)\s]+\s*(.+)$/);
    if (numMatch) text = numMatch[2];
    text = text.replace(/\s*\(PRIORITY\s*\d+\)/gi, '');
    const reasonMatch = text.match(/^([^(]+)\((.+)\)[.),;\s]*$/);
    let name = text.trim(), reason = '';
    if (reasonMatch) {
      name = reasonMatch[1].trim();
      reason = reasonMatch[2].trim()
        .replace(/CONSTRAINT:\s*[\w_]+\s*[—–-]\s*/gi, '')
        .replace(/CONSTRAINT:\s*[\w_]+/gi, '')
        .trim();
    }
    items.push({ name, reason });
  }
  return items;
}

function parseSituational(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const items = [];
  for (const line of lines) {
    let cleaned = line.trim().replace(/\*\*/g, '').replace(/^\d+[.)\s]+\s*/, '');
    let name = '', condition = '';
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      name = cleaned.slice(0, colonIdx).trim();
      condition = cleaned.slice(colonIdx + 1).trim();
    } else {
      const parenMatch = cleaned.match(/^([^(]+)\((.+)\)\s*$/);
      if (parenMatch) {
        name = parenMatch[1].trim();
        condition = parenMatch[2].trim();
      } else {
        name = cleaned;
      }
    }
    condition = condition.replace(/CONSTRAINT:\s*[\w_]+\s*[—–-]\s*/gi, '').replace(/CONSTRAINT:\s*[\w_]+/gi, '').trim();
    items.push({ name, condition });
  }
  return items;
}

const SECTION_KEYS = [
  'ANALYSIS', 'CONSTRAINTS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
  'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH',
  'ENEMY POWER SPIKES', 'WIN CONDITION', 'YOUR POWER SPIKES',
];

function parseSections(text) {
  const sections = [];
  const lines = text.split('\n');
  let curTitle = '', curLines = [];
  for (const line of lines) {
    const trimmed = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
    if (!trimmed) { if (curTitle) curLines.push(''); continue; }
    const upper = trimmed.toUpperCase().replace(/[#*\-:]/g, '').trim();
    const matched = SECTION_KEYS.find(s => upper.startsWith(s));
    if (matched) {
      if (curTitle) sections.push({ title: curTitle, content: curLines.join('\n').trim() });
      curTitle = matched;
      const rest = trimmed.replace(/^[#*\-\s]*/g, '').replace(new RegExp(`^${matched}[^\\n]*?(?::|\\n|$)`, 'i'), '').trim();
      curLines = rest ? [rest] : [];
    } else if (curTitle) {
      curLines.push(trimmed);
    }
  }
  if (curTitle) sections.push({ title: curTitle, content: curLines.join('\n').trim() });
  return sections;
}

// KNOWN valid summoner spells
const VALID_SUMMONERS = ['Flash', 'Smite', 'Ghost', 'Heal', 'Teleport', 'Barrier', 'Exhaust', 'Ignite', 'Cleanse', 'Mark'];

// ══════════════════════════════════════════════════════════════
//  TEST CASES
// ══════════════════════════════════════════════════════════════

const TEST_CASES = [
  {
    name: 'Darius JG — Row N + numbered summoners + CONSTRAINT items + STEP sections',
    input: `ANALYSIS
Matchup Type: All-In / Sustain
Enemy Damage Split: Mixed (2 AP / 2 AD / 1 Tank) — 4 Assassins present.
Key Threats: Ambessa (Suppression/Burst), Akali (AP Burst/Shroud)
Survivability Requirement: High HP + Mixed Resistances (3500+ HP, 150+ Armor/MR)
Item Priorities: Stickiness/Mobility, Anti-Burst, Anti-Suppression

CONSTRAINTS
THREAT_1: Ambessa — Suppression — COUNTER: Mercurial Scimitar (Mandatory QSS effect)
THREAT_2: Akali/Ahri — AP Burst — COUNTER: Sterak's Gage (Shield) + Mercury's Treads
ANTI_HEAL_NEEDED: Yes (Ahri/Alistar) — COUNTER: Thornmail
SUPPRESSION_QSS_NEEDED: Yes (Ambessa)
BOOTS_CHOICE: Mercury's Treads

RUNES
Primary Tree: Precision
Conqueror
Row 1: Triumph
Row 2: Legend: Haste
Row 3: Last Stand
Secondary Tree: Inspiration
Row 1: Magical Footwear
Row 3: Approach Velocity
Stat Shards:
Row 1: Attack Speed
Row 2: Move Speed
Row 3: Tenacity and Slow Resist

SUMMONERS
1. Smite (Required for Jungle)
2. Ghost (Essential for sticking to Caitlyn and Brand)

SKILL ORDER
Maximum Rage (E) — Full HP scaling
Level 1: Q
Level 2: E
Level 3: W
Max Order: Q > E > W > R

STARTING ITEMS
Gustwalker Hatchling
Health Potion

CORE BUILD
1. Mercury's Treads (CONSTRAINT: BOOTS_CHOICE — vs AP/CC)
2. Sterak's Gage (CONSTRAINT: THREAT_2 — shield vs burst)
3. Mercurial Scimitar (CONSTRAINT: SUPPRESSION_QSS — vs Ambessa R)
4. Dead Man's Plate (mobility to reach targets)
5. Thornmail (CONSTRAINT: ANTI_HEAL — vs Ahri/Alistar healing)
6. Spirit Visage (amplifies W healing + MR)

SITUATIONAL ITEMS
Thornmail (Against Ahri/Alistar healing)
Force of Nature (Against Akali/Ahri AP burst)
Death's Dance (Against heavy AD assassin focus)
Sunfire Aegis (Additional Armor and AOE burn for teamfights)

STEP 5 — EXECUTION
Check enemy builds at 15 minutes.

ENEMY POWER SPIKES
Ambessa: Level 6 (R suppression)
Akali: Level 6 (R all-in)

WIN CONDITION
Front-to-back teamfighting. Use Ghost + Dead Man's to reach backline.

JUNGLE PATH
1. Blue
2. Gromp
3. Wolves
4. Raptors
5. Red
6. Krugs
7. Scuttle/Gank

YOUR POWER SPIKES
1-item spike: Sterak's Gage — burst protection`,
  },
  {
    name: 'Akali MID — Clean format (already correct)',
    input: `ANALYSIS
Matchup Type: Burst/Assassin
Enemy Damage Split: AP-heavy

RUNES
Primary: Domination
Keystone: Electrocute
Sudden Impact
Eyeball Collection
Relentless Hunter
Secondary: Sorcery
Transcendence
Gathering Storm
Shards: Adaptive Force, Adaptive Force, Health Scaling

SUMMONERS
Flash
Ignite

SKILL ORDER
Q > E > W > R

STARTING ITEMS
Doran's Ring
Health Potion
Health Potion

CORE BUILD
1. Hextech Rocketbelt (gap close + burst)
2. Sorcerer's Shoes (magic pen)
3. Shadowflame (crit on low HP targets)
4. Zhonya's Hourglass (dive safety)
5. Rabadon's Deathcap (AP scaling)
6. Void Staff (magic pen vs MR stackers)

SITUATIONAL ITEMS
Banshee's Veil: Buy vs heavy CC
Morellonomicon: Buy vs healing
Lich Bane: Buy if snowballing

WIN CONDITION
One-shot carries in side lanes, then collapse for teamfights.`,
  },
  {
    name: 'Jinx ADC — PRIORITY items + multi-line shards',
    input: `ANALYSIS
Matchup Type: Scaling/Teamfight

RUNES
Primary: Precision
Lethal Tempo
Presence of Mind
Legend: Alacrity
Coup de Grace
Secondary: Domination
Eyeball Collection
Treasure Hunter
Shards: Attack Speed, Adaptive Force, Health Scaling

SUMMONERS
Flash
Heal

SKILL ORDER
Q > W > E > R

STARTING ITEMS
Doran's Blade
Health Potion

CORE BUILD
1. Kraken Slayer (PRIORITY 1)
2. Berserker's Greaves (PRIORITY 1)
3. Infinity Edge (PRIORITY 1)
4. Phantom Dancer (PRIORITY 2)
5. Lord Dominik's Regards (PRIORITY 2)
6. Bloodthirster (PRIORITY 3)
7. Guardian Angel

SITUATIONAL ITEMS
Mortal Reminder (anti-heal vs healers)
Maw of Malmortius (vs AP burst teams)
Quicksilver Sash (vs suppression/heavy CC)

WIN CONDITION
Scale to 3 items and dominate teamfights with AOE rockets.`,
  },
  {
    name: 'Thresh SUP — Missing "Keystone:" label + verbose summoners',
    input: `ANALYSIS
Matchup Type: Engage/Peel

RUNES
Primary: Inspiration
Glacial Augment
Hextech Flashtraption
Biscuit Delivery
Cosmic Insight
Secondary: Resolve
Font of Life
Unflinching
Shards: Ability Haste, Adaptive Force, Health Scaling

SUMMONERS
Flash — Essential for engage
Ignite — Kill pressure in lane

SKILL ORDER
E > Q > W > R

STARTING ITEMS
Relic Shield
Health Potion

CORE BUILD
1. Celestial Opposition (team shield)
2. Ionian Boots of Lucidity (CDR)
3. Locket of the Iron Solari (teamfight shield)
4. Knight's Vow (ADC protection)
5. Redemption (teamfight heal)
6. Zeke's Convergence (empower ADC)

SITUATIONAL ITEMS
Mikael's Blessing: vs heavy CC
Anathema's Chains: vs fed carry
Frozen Heart: vs attack speed carries
Wardstone: if ahead and need vision

WIN CONDITION
Land hooks to catch enemies. Peel for ADC in teamfights.

ENEMY POWER SPIKES
Nautilus: Level 6 (R engage)
Zed: Level 6 (R all-in)`,
  },
  {
    name: 'Lee Sin JG — Keystone in separate line, numbered jungle path',
    input: `ANALYSIS
Matchup Type: Early Aggression

RUNES
Primary Tree: Domination
Keystone: Electrocute
Sudden Impact
Eyeball Collection
Relentless Hunter
Secondary Tree: Precision
Triumph
Legend: Haste
Shards: Adaptive Force, Adaptive Force, Health Scaling

SUMMONERS
Flash
Smite

SKILL ORDER
Q > W > E > R

STARTING ITEMS
Mosstomper Seedling
Health Potion

CORE BUILD
1. Plated Steelcaps (vs AD heavy)
2. Sundered Sky (sustain + burst)
3. Black Cleaver (armor shred)
4. Maw of Malmortius (MR + shield)
5. Death's Dance (anti-burst)
6. Guardian Angel (revive)

SITUATIONAL ITEMS
Chempunk Chainsword: vs healing (Fiora)
Edge of Night: vs targeted CC
Youmuu's Ghostblade: for early snowball
Sterak's Gage: vs burst comps

JUNGLE PATH
1. Red Buff
2. Krugs
3. Raptors
4. Wolves
5. Blue Buff
6. Gromp
7. Scuttle Crab

ENEMY POWER SPIKES
Kha'Zix: Level 6 (isolation burst)
Fiora: Level 6 (Riposte)

WIN CONDITION
Gank aggressively pre-6. Snowball early leads into objectives.

YOUR POWER SPIKES
1-item spike: Sundered Sky — duel anyone
2-item spike: Sundered Sky + Black Cleaver — teamfight threat`,
  },
  {
    name: 'Vayne ADC — 7 items for ADC, parenthetical reasons',
    input: `ANALYSIS
Matchup Type: scaling
Enemy Damage Split: Mixed (2 AD: Draven, Talon; 2 AP: Syndra, Leona magic dmg; 1 Tank: Sejuani)
Key Threats: Draven (early bully), Talon (roam kills)

RUNES
Primary: Precision
Keystone: Fleet Footwork
Presence of Mind
Legend: Alacrity
Coup de Grace
Secondary: Domination
Taste of Blood
Treasure Hunter
Shards: Attack Speed, Adaptive Force, Health Scaling

SUMMONERS
Flash
Heal

SKILL ORDER
Q > W > E > R

STARTING ITEMS
Doran's Blade
Health Potion

CORE BUILD
1. Berserker's Greaves (AS)
2. Blade of the Ruined King (% HP shred vs Sejuani)
3. Guinsoo's Rageblade (on-hit synergy)
4. Immortal Shieldbow (anti-Talon burst)
5. Wit's End (MR + on-hit vs Syndra)
6. Terminus (armor/MR shred)
7. Guardian Angel (revive)

SITUATIONAL ITEMS
Mercurial Scimitar: vs Sejuani R
Mortal Reminder: vs healing
Phantom Dancer: if safe to go more AS
Maw of Malmortius: vs triple AP

WIN CONDITION
Survive lane phase vs Draven. Scale to 3 items and kite teamfights.

YOUR POWER SPIKES
1-item spike: BotRK — can trade with Draven
2-item spike: BotRK + Rageblade — shreds tanks`,
  },
  {
    name: 'Lux SUP — Colon format situational + parenthetical conditions',
    input: `ANALYSIS
Matchup Type: Poke/Burst
Enemy Damage Split: AD-heavy

RUNES
Primary: Sorcery
Keystone: Arcane Comet
Manaflow Band
Transcendence
Scorch
Secondary: Inspiration
Biscuit Delivery
Cosmic Insight
Shards: Adaptive Force, Adaptive Force, Health Scaling

SUMMONERS
Flash
Exhaust

SKILL ORDER
E > Q > W > R

STARTING ITEMS
Spellthief's Edge
Health Potion

CORE BUILD
1. Zaz'Zak's Realmspike (poke amp)
2. Ionian Boots of Lucidity (CDR)
3. Luden's Companion (burst + mana)
4. Horizon Focus (long range amp)
5. Zhonya's Hourglass (vs assassins)
6. Cryptbloom (magic pen + team heal)

SITUATIONAL ITEMS
Staff of Flowing Water: (if ADC needs AP boost)
Banshee's Veil: (if getting caught by Blitzcrank)
Morellonomicon: (if enemy has healing)
Mejai's Soulstealer: (if snowballing hard)

WIN CONDITION
Poke from range with E+Comet. Land Q for picks. Shield team with W.`,
  },
  {
    name: 'Ornn TOP — Tank with special items, minimal formatting',
    input: `ANALYSIS
Matchup Type: sustain
Enemy Damage Split: Mixed
Key Threats: Camille

RUNES
Primary: Resolve
Grasp of the Undying
Demolish
Second Wind
Overgrowth
Secondary: Inspiration
Biscuit Delivery
Time Warp Tonic
Shards: Ability Haste, Adaptive Force, Health Scaling

SUMMONERS
Flash
Teleport

SKILL ORDER
Q > W > E > R

STARTING ITEMS
Doran's Shield
Health Potion

CORE BUILD
1. Sunfire Aegis (waveclear + tank)
2. Plated Steelcaps (vs Camille + Lucian)
3. Heartsteel (infinite scaling HP)
4. Kaenic Rookern (MR + shield)
5. Thornmail (anti-heal + armor)
6. Jak'Sho, The Protean (resist scaling)

SITUATIONAL ITEMS
Frozen Heart: vs attack speed comps
Warmog's Armor: for siege/poke
Gargoyle Stoneplate: teamfight tankiness
Force of Nature: vs sustained magic damage

ENEMY POWER SPIKES
Camille: Level 6 (R lockdown)
Syndra: Level 6 (R burst)

WIN CONDITION
Survive laning. Upgrade ally items with passive. Engage teamfights with R.

YOUR POWER SPIKES
1-item spike: Sunfire — can waveclear and trade
2-item spike: Sunfire + Heartsteel — unkillable`,
  },
  {
    name: 'Yasuo MID — Keystone=Lethal Tempo, crit build, wind wall context',
    input: `ANALYSIS
Matchup Type: All-in
Enemy Damage Split: AP-heavy (Viktor, Orianna, Elise AP)
Key Threats: Viktor (poke + burst), Malphite (R engage)

RUNES
Primary: Precision
Keystone: Lethal Tempo
Triumph
Legend: Alacrity
Last Stand
Secondary: Resolve
Second Wind
Overgrowth
Shards: Attack Speed, Adaptive Force, Health Scaling

SUMMONERS
Flash
Ignite

SKILL ORDER
Q > E > W > R

STARTING ITEMS
Doran's Blade
Health Potion

CORE BUILD
1. Berserker's Greaves (AS for Q cooldown)
2. Kraken Slayer (crit + true dmg)
3. Infinity Edge (100% crit spike)
4. Wit's End (MR + on-hit vs Viktor)
5. Immortal Shieldbow (anti-burst)
6. Guardian Angel (revive for teamfights)

SITUATIONAL ITEMS
Death's Dance: vs heavy AD
Maw of Malmortius: vs triple AP
Mortal Reminder: vs healing
Blade of the Ruined King: vs tanks

ENEMY POWER SPIKES
Viktor: Level 6 (R burst zone)
Malphite: Level 6 (unstoppable R engage)

WIN CONDITION
Farm safely vs Viktor. Use wind wall to block key abilities. All-in at 2 items.

YOUR POWER SPIKES
1-item spike: Kraken Slayer — can duel
2-item spike: Kraken + IE — 100% crit, massive damage`,
  },
  {
    name: 'Garen TOP — Phase Rush, no ANALYSIS section at all (edge case)',
    input: `RUNES
Primary: Sorcery
Keystone: Phase Rush
Nimbus Cloak
Celerity
Gathering Storm
Secondary: Resolve
Second Wind
Overgrowth
Shards: Attack Speed, Adaptive Force, Health Scaling

SUMMONERS
Flash
Ignite

SKILL ORDER
Q > E > W > R

STARTING ITEMS
Doran's Shield
Health Potion

CORE BUILD
1. Berserker's Greaves (AS for E spins)
2. Stridebreaker (slow + gap close)
3. Phantom Dancer (AS + movespeed)
4. Dead Man's Plate (roam + engage)
5. Force of Nature (MR + speed)
6. Sterak's Gage (shield + HP)

SITUATIONAL ITEMS
Mortal Reminder: vs healing
Maw of Malmortius: vs AP burst
Randuin's Omen: vs crit ADCs
Warmog's Armor: for sustained fights

WIN CONDITION
Split push side lanes. Phase Rush to disengage bad fights.`,
  },
  {
    name: 'Mundo JG — JSON mode output with full jungle path',
    input: jsonBuildToText({
      analysis: { matchupType: "sustain", enemyDamageSplit: "Mixed", keyThreats: "Vayne — % HP true damage" },
      runes: { primaryTree: "Resolve", keystone: "Grasp of the Undying", primaryRunes: ["Demolish", "Conditioning", "Overgrowth"], secondaryTree: "Precision", secondaryRunes: ["Triumph", "Legend: Haste"], shards: ["Ability Haste", "Adaptive Force", "Health Scaling"] },
      summoners: ["Flash", "Smite"],
      skillOrder: "Q > E > W > R",
      startingItems: ["Mosstomper Seedling", "Health Potion"],
      coreBuild: [
        { name: "Plated Steelcaps", reason: "vs AD" }, { name: "Heartsteel", reason: "HP scaling" },
        { name: "Sunfire Aegis", reason: "clear speed" }, { name: "Spirit Visage", reason: "R healing amp" },
        { name: "Warmog's Armor", reason: "HP regen" }, { name: "Thornmail", reason: "anti-heal" }
      ],
      situationalItems: [
        { name: "Force of Nature", condition: "vs AP heavy" }, { name: "Randuin's Omen", condition: "vs crit ADC" },
        { name: "Kaenic Rookern", condition: "vs burst mage" }, { name: "Jak'Sho, The Protean", condition: "teamfights" }
      ],
      junglePath: "Red > Krugs > Raptors > Wolves > Blue > Gromp > Scuttle",
      enemyPowerSpikes: "Vayne: Level 6 (R stealth + %HP)", winCondition: "Farm jungle. Scale to 3 items. Frontline teamfights with R sustain.",
      yourPowerSpikes: "1-item: Heartsteel — infinite HP stacking"
    }),
  },
];

// ══════════════════════════════════════════════════════════════
//  JSON MODE TEST — simulate jsonBuildToText() output
// ══════════════════════════════════════════════════════════════

function jsonBuildToText(json) {
  const lines = [];
  if (json.analysis) {
    lines.push('ANALYSIS');
    if (json.analysis.matchupType) lines.push(`Matchup Type: ${json.analysis.matchupType}`);
    if (json.analysis.enemyDamageSplit) lines.push(`Enemy Damage Split: ${json.analysis.enemyDamageSplit}`);
    if (json.analysis.keyThreats) lines.push(`Key Threats: ${json.analysis.keyThreats}`);
    if (json.analysis.survivabilityRequirement) lines.push(`Survivability Requirement: ${json.analysis.survivabilityRequirement}`);
    if (json.analysis.itemPriorities) lines.push(`Item Priorities: ${json.analysis.itemPriorities}`);
    lines.push('');
  }
  if (json.runes) {
    lines.push('RUNES');
    lines.push(`Primary: ${json.runes.primaryTree || ''}`);
    lines.push(`Keystone: ${json.runes.keystone || ''}`);
    if (json.runes.primaryRunes) json.runes.primaryRunes.forEach(r => lines.push(r));
    lines.push(`Secondary: ${json.runes.secondaryTree || ''}`);
    if (json.runes.secondaryRunes) json.runes.secondaryRunes.forEach(r => lines.push(r));
    if (json.runes.shards) lines.push(`Shards: ${json.runes.shards.join(', ')}`);
    lines.push('');
  }
  if (json.summoners) { lines.push('SUMMONERS'); json.summoners.forEach(s => lines.push(s)); lines.push(''); }
  if (json.skillOrder) { lines.push('SKILL ORDER'); lines.push(json.skillOrder); lines.push(''); }
  if (json.startingItems) { lines.push('STARTING ITEMS'); json.startingItems.forEach(i => lines.push(i)); lines.push(''); }
  if (json.coreBuild) {
    lines.push('CORE BUILD');
    json.coreBuild.forEach((item, i) => lines.push(`${i + 1}. ${item.name}${item.reason ? ` (${item.reason})` : ''}`));
    lines.push('');
  }
  if (json.situationalItems) {
    lines.push('SITUATIONAL ITEMS');
    json.situationalItems.forEach(item => lines.push(`${item.name}: ${item.condition || ''}`));
    lines.push('');
  }
  if (json.junglePath) { lines.push('JUNGLE PATH'); lines.push(json.junglePath); lines.push(''); }
  if (json.enemyPowerSpikes) { lines.push('ENEMY POWER SPIKES'); lines.push(json.enemyPowerSpikes); lines.push(''); }
  if (json.winCondition) { lines.push('WIN CONDITION'); lines.push(json.winCondition); lines.push(''); }
  if (json.yourPowerSpikes) { lines.push('YOUR POWER SPIKES'); lines.push(json.yourPowerSpikes); lines.push(''); }
  return lines.join('\n');
}

TEST_CASES.push({
  name: 'JSON MODE — Tank TOP via jsonBuildToText() converter',
  input: jsonBuildToText({
    analysis: { matchupType: "all-in", enemyDamageSplit: "AD-heavy (3 AD)", keyThreats: "Zed — burst", survivabilityRequirement: "3000+ HP", itemPriorities: "Armor" },
    runes: { primaryTree: "Resolve", keystone: "Grasp of the Undying", primaryRunes: ["Demolish", "Second Wind", "Overgrowth"], secondaryTree: "Inspiration", secondaryRunes: ["Biscuit Delivery", "Time Warp Tonic"], shards: ["Ability Haste", "Adaptive Force", "Health Scaling"] },
    summoners: ["Flash", "Teleport"],
    skillOrder: "Q > E > W > R",
    startingItems: ["Doran's Shield", "Health Potion"],
    coreBuild: [
      { name: "Plated Steelcaps", reason: "vs AD" }, { name: "Sunfire Aegis", reason: "waveclear" },
      { name: "Zhonya's Hourglass", reason: "Zed R" }, { name: "Thornmail", reason: "anti-heal" },
      { name: "Randuin's Omen", reason: "crit reduction" }, { name: "Spirit Visage", reason: "MR" }
    ],
    situationalItems: [
      { name: "Force of Nature", condition: "If AP heavy" }, { name: "Gargoyle Stoneplate", condition: "Teamfights" },
      { name: "Warmog's Armor", condition: "Sieges" }, { name: "Dead Man's Plate", condition: "Roaming" }
    ],
    junglePath: "", enemyPowerSpikes: "Zed: Level 6", winCondition: "Front-to-back teamfights.",
    yourPowerSpikes: "1-item: Sunfire Aegis"
  }),
});

// ══════════════════════════════════════════════════════════════
//  RUN TESTS
// ══════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║       DraftCoach Frontend Rendering Stress Test                 ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

let totalPass = 0;
let totalFail = 0;

for (const tc of TEST_CASES) {
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`TEST: ${tc.name}`);
  console.log(`${'─'.repeat(65)}`);

  const t0 = Date.now();
  const sections = parseSections(tc.input);
  const parseMs = Date.now() - t0;
  const issues = [];

  // ── RUNES ──
  const runesSection = sections.find(s => s.title === 'RUNES');
  if (runesSection) {
    const runes = parseRunes(runesSection.content);
    if (!runes.primaryTree) issues.push('RUNES: No primary tree name');
    if (!runes.secondaryTree) issues.push('RUNES: No secondary tree name');
    if (!runes.keystone) issues.push('RUNES: No keystone');
    if (runes.primaryRunes.length < 3) issues.push(`RUNES: Only ${runes.primaryRunes.length} primary runes (need 3)`);
    if (runes.secondaryRunes.length < 2) issues.push(`RUNES: Only ${runes.secondaryRunes.length} secondary runes (need 2)`);
    if (runes.shards.length < 3) issues.push(`RUNES: Only ${runes.shards.length} shards (need 3)`);
    // Check for "Row N:" pollution
    const allRuNeNames = [runes.keystone, ...runes.primaryRunes, ...runes.secondaryRunes, ...runes.shards];
    for (const n of allRuNeNames) {
      if (/^Row\s*\d+/i.test(n)) issues.push(`RUNES: "Row N:" not stripped from "${n}"`);
      if (/Primary\s+Tree/i.test(n)) issues.push(`RUNES: "Primary Tree" not stripped from "${n}"`);
    }
    console.log(`  RUNES: ✓ Primary=${runes.primaryTree}, Keystone=${runes.keystone}, Runes=[${runes.primaryRunes.join(',')}], Secondary=${runes.secondaryTree}, [${runes.secondaryRunes.join(',')}], Shards=[${runes.shards.join(',')}]`);
  } else {
    issues.push('RUNES: Section missing');
  }

  // ── SUMMONERS ──
  const sumsSection = sections.find(s => s.title === 'SUMMONERS');
  if (sumsSection) {
    const sums = parseSummoners(sumsSection.content);
    if (sums.length < 2) issues.push(`SUMMONERS: Only ${sums.length} spells`);
    for (const s of sums) {
      if (/^\d+/.test(s)) issues.push(`SUMMONERS: Still numbered: "${s}"`);
      if (!VALID_SUMMONERS.includes(s)) issues.push(`SUMMONERS: Invalid spell name: "${s}"`);
    }
    console.log(`  SUMMONERS: ✓ ${sums.join(', ')}`);
  } else {
    issues.push('SUMMONERS: Section missing');
  }

  // ── SKILL ORDER ──
  const skillSection = sections.find(s => s.title === 'SKILL ORDER');
  if (skillSection) {
    const parts = parseSkillOrder(skillSection.content);
    if (parts.length < 4) issues.push(`SKILL ORDER: Only ${parts.length} abilities (need 4)`);
    else if (!/^[QWER]$/i.test(parts[0])) issues.push(`SKILL ORDER: First ability "${parts[0]}" is not Q/W/E/R`);
    console.log(`  SKILL ORDER: ✓ ${parts.join(' > ')}`);
  } else {
    issues.push('SKILL ORDER: Section missing');
  }

  // ── CORE BUILD ──
  const coreSection = sections.find(s => s.title === 'CORE BUILD');
  if (coreSection) {
    const items = parseItems(coreSection.content);
    if (items.length < 5) issues.push(`CORE BUILD: Only ${items.length} items (need 5-7)`);
    for (const item of items) {
      if (/PRIORITY/i.test(item.name)) issues.push(`CORE BUILD: PRIORITY not stripped from "${item.name}"`);
      if (/CONSTRAINT/i.test(item.reason)) issues.push(`CORE BUILD: CONSTRAINT not stripped from reason "${item.reason}"`);
    }
    console.log(`  CORE BUILD: ✓ ${items.length} items: ${items.map(i => i.name).join(', ')}`);
  } else {
    issues.push('CORE BUILD: Section missing');
  }

  // ── SITUATIONAL ITEMS ──
  const sitSection = sections.find(s => s.title === 'SITUATIONAL ITEMS');
  if (sitSection) {
    const items = parseSituational(sitSection.content);
    if (items.length < 2) issues.push(`SITUATIONAL: Only ${items.length} items`);
    for (const item of items) {
      if (!item.name) issues.push(`SITUATIONAL: Empty item name`);
      if (/CONSTRAINT/i.test(item.condition)) issues.push(`SITUATIONAL: CONSTRAINT in condition "${item.condition}"`);
    }
    console.log(`  SITUATIONAL: ✓ ${items.length} items: ${items.map(i => `${i.name}${i.condition ? ' ('+i.condition+')' : ''}`).join(', ')}`);
  } else {
    issues.push('SITUATIONAL: Section missing');
  }

  // ── STARTING ITEMS ──
  if (!sections.find(s => s.title === 'STARTING ITEMS')) issues.push('STARTING ITEMS: Section missing');
  // ── WIN CONDITION ──
  if (!sections.find(s => s.title === 'WIN CONDITION')) issues.push('WIN CONDITION: Section missing');
  // ── CONSTRAINTS should NOT be displayed ──
  const constraintsSection = sections.find(s => s.title === 'CONSTRAINTS');
  if (constraintsSection) console.log(`  CONSTRAINTS: ✓ Parsed but HIDDEN from UI display`);

  // ── JUNGLE PATH (if jungle) ──
  const jungleSection = sections.find(s => s.title === 'JUNGLE PATH');
  if (jungleSection) console.log(`  JUNGLE PATH: ✓ Present`);

  console.log(`  Parse time: ${parseMs}ms`);
  const passed = issues.length === 0;
  if (passed) {
    totalPass++;
    console.log(`  Result: ✅ ALL CHECKS PASSED`);
  } else {
    totalFail++;
    console.log(`  Result: ❌ ${issues.length} ISSUES:`);
    for (const issue of issues) {
      console.log(`    • ${issue}`);
    }
  }
}

console.log(`\n${'═'.repeat(65)}`);
console.log(`RESULTS: ${totalPass} PASSED, ${totalFail} FAILED out of ${TEST_CASES.length} tests`);
console.log(`${'═'.repeat(65)}`);

process.exit(totalFail > 0 ? 1 : 0);
