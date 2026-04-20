/**
 * prompt-builder.js
 * Centralised home for all Gemini system prompts and context builders.
 *
 * ALL champion data is fetched DYNAMICALLY from DDragon API at runtime —
 * zero hardcoded champions, always current patch, covers all 160+ champions.
 *
 * Improvements:
 *  1. Constraint-first chain-of-thought — model must list WHAT it needs to solve
 *     before picking items, binding every item to a constraint.
 *  2. Dynamic ability-mechanics context — parsed from DDragon spell descriptions
 *     at runtime for CC type, true damage, healing, suppression, etc.
 *  3. Full rune decision tree — class × matchup matrix.
 *  4. Live Advisor deterministic-first prompting.
 */

'use strict';

const https = require('https');

// ═══════════════════════════════════════════════════════════════════
//  DYNAMIC CHAMPION DATA FETCHER (DDragon API)
//  Fetches and parses champion mechanics from DDragon for ANY champion.
//  No hardcoded data — always up-to-date with the current patch.
// ═══════════════════════════════════════════════════════════════════

let _champDetailCache = new Map(); // Map<champId, parsedMechanics>
let _ddragonVersion = null;

function _httpsGet(url) {
  return new Promise((resolve, reject) => {
    const doGet = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doGet(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        res.on('error', reject);
      }).on('error', reject);
    };
    doGet(url);
  });
}

async function _ensureVersion() {
  if (_ddragonVersion) return _ddragonVersion;
  const versions = await _httpsGet('https://ddragon.leagueoflegends.com/api/versions.json');
  _ddragonVersion = versions[0];
  return _ddragonVersion;
}

// ── Keyword scanners for spell descriptions ──────────────────────
const CC_PATTERNS = [
  { regex: /\bsuppress(?:es|ion|ed)?\b/i, type: 'SUPPRESSION' },
  { regex: /\bstun(?:s|ned|ning)?\b/i, type: 'HARD_CC' },
  { regex: /\broot(?:s|ed|ing)?\b/i, type: 'HARD_CC' },
  { regex: /\bsnare(?:s|d)?\b/i, type: 'HARD_CC' },
  { regex: /\bknock[\s-]?(?:up|back|aside|s)\b/i, type: 'DISPLACEMENT' },
  { regex: /\bairborne\b/i, type: 'DISPLACEMENT' },
  { regex: /\bpull(?:s|ed|ing)?\b/i, type: 'DISPLACEMENT' },
  { regex: /\bcharm(?:s|ed)?\b/i, type: 'HARD_CC' },
  { regex: /\btaunt(?:s|ed)?\b/i, type: 'HARD_CC' },
  { regex: /\bfear(?:s|ed)?\b/i, type: 'HARD_CC' },
  { regex: /\bflee(?:s|d)?\b/i, type: 'HARD_CC' },
  { regex: /\bsleep(?:s|ing)?\b/i, type: 'HARD_CC' },
  { regex: /\bsilence(?:s|d)?\b/i, type: 'SOFT_CC' },
  { regex: /\bblind(?:s|ed)?\b/i, type: 'SOFT_CC' },
  { regex: /\bslow(?:s|ed|ing)?\b/i, type: 'SOFT_CC' },
  { regex: /\bground(?:s|ed)?\b/i, type: 'SOFT_CC' },
  { regex: /\bnearsight(?:s|ed)?\b/i, type: 'SOFT_CC' },
  { regex: /\bpolymorph(?:s|ed)?\b/i, type: 'HARD_CC' },
  { regex: /\bentomb(?:s|ed)?\b/i, type: 'HARD_CC' },
  { regex: /\bpetrif(?:y|ied|ies)\b/i, type: 'HARD_CC' },
  { regex: /\bimmobilize(?:s|d)?\b/i, type: 'HARD_CC' },
];

const TRUE_DMG_PATTERN = /\btrue\s+damage\b/i;
const HEAL_PATTERNS = [
  /\bheal(?:s|ed|ing)?\b/i,
  /\brestore(?:s|d)?\s+health\b/i,
  /\blife\s*steal\b/i,
  /\bomnivamp\b/i,
  /\bvamp\b/i,
  /\bregenerat(?:e|es|ion)\b/i,
  /\bdrain(?:s|ed|ing)?\b/i,
];
const SHIELD_PATTERNS = [
  /\bshield(?:s|ed|ing)?\b/i,
];
const DASH_PATTERNS = [
  /\bdash(?:es|ed|ing)?\b/i,
  /\bblink(?:s|ed)?\b/i,
  /\bleap(?:s|ed|ing)?\b/i,
  /\bjump(?:s|ed|ing)?\b/i,
  /\blunge(?:s|d)?\b/i,
  /\bteleport(?:s|ed)?\b/i,
];

/**
 * Fetch and parse a single champion's mechanics from DDragon.
 * Returns a normalized mechanics profile.
 * @param {string} champName — DDragon champion key (e.g., "Darius", "LeeSin")
 * @returns {Promise<object>} parsed mechanics
 */
async function fetchChampionMechanics(champName) {
  // Check cache first
  if (_champDetailCache.has(champName)) return _champDetailCache.get(champName);

  const ver = await _ensureVersion();

  try {
    const data = await _httpsGet(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion/${champName}.json`);
    const champ = data.data[champName];
    if (!champ) return null;

    const result = _parseChampionData(champ);
    _champDetailCache.set(champName, result);
    return result;
  } catch (e) {
    console.error(`[prompt-builder] Failed to fetch ${champName} from DDragon:`, e.message);
    return null;
  }
}

/**
 * Parse raw DDragon champion data into a mechanics profile.
 */
function _parseChampionData(champ) {
  const spellTexts = champ.spells.map(s => s.description || '');
  const passiveText = champ.passive?.description || '';
  const allText = [...spellTexts, passiveText].join(' ');
  const ultText = spellTexts[3] || ''; // R is always index 3

  // ── Damage type ──
  const tags = champ.tags || [];
  const info = champ.info || {};
  let dmg = 'AD';
  if (info.magic > info.attack + 2) dmg = 'AP';
  else if (Math.abs(info.magic - info.attack) <= 2 && info.magic > 3) dmg = 'HYBRID';
  if (tags.includes('Mage') && !tags.includes('Fighter') && !tags.includes('Marksman')) dmg = 'AP';
  if (tags.includes('Marksman') && !tags.includes('Mage')) dmg = 'AD';

  // ── Range ──
  const range = (champ.stats?.attackrange || 0) > 300 ? 'RANGED' : 'MELEE';

  // ── Resource ──
  const partype = (champ.partype || '').toLowerCase();
  let resource = 'MANA';
  if (partype.includes('energy')) resource = 'ENERGY';
  else if (partype === 'none' || partype === '' || partype.includes('resourceless')
    || partype.includes('courage') || partype.includes('heat')
    || partype.includes('rage') || partype.includes('fury')
    || partype.includes('ferocity') || partype.includes('flow')
    || partype.includes('grit') || partype.includes('blood')
    || partype.includes('crimson')) resource = 'RESOURCELESS';

  // ── CC detection from spell descriptions ──
  const ccFound = [];
  const ccSeen = new Set();
  for (let si = 0; si < spellTexts.length; si++) {
    const text = spellTexts[si];
    const spellKey = ['Q', 'W', 'E', 'R'][si];
    for (const pat of CC_PATTERNS) {
      if (pat.regex.test(text)) {
        const key = `${pat.type}_${spellKey}`;
        if (!ccSeen.has(key)) {
          ccSeen.add(key);
          ccFound.push({ type: pat.type, spell: spellKey });
        }
      }
    }
  }
  // Also check passive
  for (const pat of CC_PATTERNS) {
    if (pat.regex.test(passiveText)) {
      const key = `${pat.type}_P`;
      if (!ccSeen.has(key)) {
        ccSeen.add(key);
        ccFound.push({ type: pat.type, spell: 'Passive' });
      }
    }
  }

  // ── Ult type ──
  let ultType = 'UNKNOWN';
  if (/\bsuppress/i.test(ultText)) ultType = 'SUPPRESSION';
  else if (/\bglobal\b|global range|unlimited range|anywhere on the map/i.test(ultText)) ultType = 'GLOBAL';
  else if (/\bchannel/i.test(ultText)) ultType = 'CHANNEL';
  else if (DASH_PATTERNS.some(p => p.test(ultText))) ultType = 'DASH_BURST';
  else if (/\bknock/i.test(ultText) || /\bpull/i.test(ultText) || /\bairborne/i.test(ultText)) ultType = 'DISPLACEMENT';
  else if (/\btransform/i.test(ultText) || /\btoggle/i.test(ultText)) ultType = 'TOGGLE';
  else ultType = 'BURST';

  // ── True damage ──
  const trueDmg = TRUE_DMG_PATTERN.test(allText);

  // ── Heal threat ──
  const healThreat = HEAL_PATTERNS.some(p => p.test(allText));

  // ── Shield threat ──
  const shieldThreat = SHIELD_PATTERNS.some(p => p.test(allText));

  // ── Dash count ──
  let dashes = 0;
  for (const text of spellTexts) {
    if (DASH_PATTERNS.some(p => p.test(text))) dashes++;
  }

  // ── Counter items (generated from flags) ──
  const counters = [];
  if (ccFound.some(c => c.type === 'SUPPRESSION')) counters.push('QSS (removes suppression)');
  if (trueDmg) counters.push('HP stacking (armor less effective vs true dmg)');
  if (healThreat) counters.push('Grievous Wounds (anti-heal)');
  if (dmg === 'AP') counters.push('Magic Resist items');
  if (dmg === 'AD') counters.push('Armor items');
  if (dashes >= 2) counters.push('Hard CC to lock down mobility');
  if (ccFound.filter(c => c.type === 'HARD_CC' || c.type === 'SUPPRESSION').length >= 2) {
    counters.push("Mercury's Treads (tenacity vs multiple CC)");
  }

  return {
    name: champ.name,
    dmg, range, resource,
    cc: ccFound,
    dashes,
    ult: { type: ultType },
    trueDmg, healThreat, shieldThreat,
    counters,
    tags,
  };
}

/**
 * Fetch mechanics for multiple champions in parallel.
 * @param {string[]} champNames
 * @returns {Promise<Map<string, object>>}
 */
async function fetchMultipleChampionMechanics(champNames) {
  const results = new Map();
  const promises = champNames.map(async (name) => {
    const mech = await fetchChampionMechanics(name);
    if (mech) results.set(name, mech);
  });
  await Promise.all(promises);
  return results;
}

/**
 * Clear the champion detail cache (call on game end / patch change).
 */
function clearChampionCache() {
  _champDetailCache.clear();
  _ddragonVersion = null;
}

// ═══════════════════════════════════════════════════════════════════
//  MECHANICS CONTEXT BUILDER
//  Takes dynamically-fetched champion data and generates prompt context.
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a compact ability-mechanics context string for injection into prompts.
 * Uses LIVE DDragon data — no hardcoded champion database.
 *
 * @param {string} myChampion
 * @param {string} role
 * @param {Map<string, object>} mechMap — Map from fetchMultipleChampionMechanics()
 * @returns {string}
 */
function buildMechanicsContext(myChampion, role, mechMap) {
  const lines = [];
  if (!mechMap || mechMap.size === 0) return '';

  // ── My champion resource type (affects starting items / Tear) ──
  const myData = mechMap.get(myChampion);
  if (myData) {
    const res = myData.resource;
    if (res === 'MANA' && ['mid', 'top', 'jungle'].includes((role || '').toLowerCase())) {
      lines.push(`MY CHAMPION (${myChampion}): Resource = ${res}. Consider Tear of the Goddess / Manamune path if high mana cost.`);
    }
    if (myData.range === 'MELEE') {
      lines.push(`MY CHAMPION (${myChampion}): MELEE — Doran's Blade starting; Plated Steelcaps vs AD-heavy enemies.`);
    }
    if (res === 'ENERGY') {
      lines.push(`MY CHAMPION (${myChampion}): Resource = ENERGY — Do NOT suggest Manamune or Tear of the Goddess.`);
    }
    if (res === 'RESOURCELESS') {
      lines.push(`MY CHAMPION (${myChampion}): RESOURCELESS — Do NOT suggest Manamune, Tear, or mana items.`);
    }
  }

  // ── Enemy mechanics — only fields relevant to itemization ──
  const ccFlags = [];
  const trueDmgFlags = [];
  const healFlags = [];
  const shieldFlags = [];
  const suppressionFlags = [];
  const qssTargets = [];
  const zhonyaTargets = [];
  const bansheeTargets = [];
  const antiHealTargets = [];
  let totalHardCC = 0;

  for (const [enemyName, d] of mechMap) {
    if (enemyName === myChampion) continue; // Skip self

    // Collect CC
    const hardCCs = (d.cc || []).filter(c =>
      c.type === 'HARD_CC' || c.type === 'SUPPRESSION' || c.type === 'DISPLACEMENT'
    );
    totalHardCC += hardCCs.length;

    // Suppression
    if (d.ult?.type === 'SUPPRESSION' || d.cc?.some(c => c.type === 'SUPPRESSION')) {
      suppressionFlags.push(enemyName);
      qssTargets.push(`${enemyName} (suppression — QSS mandatory)`);
    }

    // Zhonya value — AP assassins / burst ults
    if (d.dmg === 'AD' && d.dashes >= 2 && d.tags?.some(t => t === 'Assassin')) {
      zhonyaTargets.push(`${enemyName} (AD assassin burst — Zhonya's negates)`);
    }
    if (d.ult?.type === 'BURST' && d.dmg === 'AD') {
      zhonyaTargets.push(`${enemyName} (burst ult — Zhonya's survives)`);
    }

    // Banshee value — key ability reliant mages/hooks
    if (d.dmg === 'AP' && hardCCs.length >= 1 && d.tags?.some(t => t === 'Mage' || t === 'Support')) {
      bansheeTargets.push(`${enemyName} (AP CC — Banshee's blocks key ability)`);
    }

    // True damage
    if (d.trueDmg) trueDmgFlags.push(enemyName);

    // Anti-heal
    if (d.healThreat) {
      healFlags.push(enemyName);
      antiHealTargets.push(enemyName);
    }

    // Shield threat
    if (d.shieldThreat) shieldFlags.push(enemyName);

    // CC listing
    if (hardCCs.length > 0) {
      ccFlags.push(`${enemyName} (${hardCCs.length} hard CC: ${hardCCs.map(c => c.spell).join(',')})`);
    }
  }

  // ── Output structured context ──
  if (suppressionFlags.length > 0 || totalHardCC > 0 || trueDmgFlags.length > 0 ||
      antiHealTargets.length > 0 || zhonyaTargets.length > 0 || bansheeTargets.length > 0) {
    lines.push('\nABILITY MECHANICS ANALYSIS (use this to make itemization decisions):');
  }

  if (suppressionFlags.length > 0) {
    lines.push(`⚠️ SUPPRESSION DETECTED (${suppressionFlags.join(', ')}) — QSS or Quicksilver Sash is MANDATORY. Suppression cannot be avoided by dashes, Zhonyas, or tenacity.`);
  }

  if (zhonyaTargets.length > 0) {
    lines.push(`⚡ ZHONYA'S VALUE: ${zhonyaTargets.join(', ')}`);
  }

  if (bansheeTargets.length > 0) {
    lines.push(`⚡ BANSHEE'S VALUE: ${bansheeTargets.join(', ')}`);
  }

  if (totalHardCC >= 4) {
    lines.push(`⚠️ HIGH CC DENSITY (${totalHardCC} hard-CC instances): Mercury's Treads + Tenacity extremely valuable.`);
  } else if (totalHardCC >= 2) {
    lines.push(`CC NOTE (${totalHardCC} hard-CC sources: ${ccFlags.join('; ')}): Mercury's Treads viable.`);
  }

  if (trueDmgFlags.length > 0) {
    lines.push(`⚠️ TRUE DAMAGE from ${trueDmgFlags.join(', ')} — armor is NOT effective vs their true-dmg source. Plan around burst timing.`);
  }

  if (antiHealTargets.length > 0) {
    lines.push(`⚠️ HEALING THREAT (${antiHealTargets.join(', ')}) — Grievous Wounds is MANDATORY. Include Thornmail (tank/fighter), Mortal Reminder (ADC), or Morellonomicon (mage).`);
  }

  if (shieldFlags.length > 0) {
    lines.push(`SHIELD THREAT (${shieldFlags.join(', ')}) — enemy generates shields. Consider anti-shield options.`);
  }

  return lines.join('\n');
}


// ═══════════════════════════════════════════════════════════════════
//  RUNE DECISION TREE
// ═══════════════════════════════════════════════════════════════════

const RUNE_DECISION_TREE = `
KEYSTONE SELECTION RULES (apply in order — first match wins):

PRECISION TREE — Keystones:
  Lethal Tempo → Use when: champion wins with sustained auto-attack DPS (ADC, on-hit builds, Jinx, Kaisa, Ashe, Kog'Maw, Tristana, Lucian, on-hit Vayne, Twitch) OR ranged vs melee extended trades.
  Conqueror    → Use when: champion wins with extended melee trades or sustained ability damage (Irelia, Jax, Darius, Garen, Aatrox, Fiora, Yasuo, Yone, Riven, Sett, Renekton, Samira, Tryndamere). NOT for burst mages or assassins.
  Fleet Footwork → Use when: champion is in a poke/losing lane and needs sustain to survive (e.g., Jinx vs Caitlyn, melee vs ranged poke).

DOMINATION TREE — Keystones:
  Electrocute → Use when: champion wins with 3-spell burst combo (Zed, Talon, Katarina, LeBlanc, Ahri, burst junglers).
  Dark Harvest → Use when: champion scales off stacks and prefers late snowball (Veigar, scaling AP assassins). Do NOT use on tank/fighter/ADC.
  Predator    → Use when: champion needs gank roam speed (Hecarim, Sion). Rare pick.

SORCERY TREE — Keystones:
  Arcane Comet → Use when: champion has reliable slow/root to land comet (Lux, Brand, Xerath, poke mages).
  Phase Rush → Use when: champion needs movespeed after 3 spells to disengage or chase (Cassiopeia, Ryze, Kennen).

RESOLVE TREE — Keystones:
  Grasp of the Undying → Use when: champion wins with short repeated trades via auto attacks (Malphite, Ornn, Sion, Garen, short-trade tanks). MELEE ONLY.
  Aftershock  → Use when: champion immobilizes enemies and wants resistance burst (Nautilus, Leona, Blitzcrank, Alistar, tank supports).
  Guardian    → Use when: support who shields/heals an ally (Lulu, Janna, Soraka, Taric). Rare over Aftershock.

INSPIRATION TREE — Keystones:
  First Strike → Use when: champion can damage the enemy before they can trade back (Gangplank, Ezreal, Jayce poke).
  Glacial Augment → Use when: support who kites or stuns into slows (Senna, niche picks).

SECONDARY TREE PAIRINGS (common high-win pairings):
  Precision primary  → Secondary: Domination (Eyeball + Treasure Hunter) OR Inspiration (Magical Footwear + Biscuit)
  Domination primary → Secondary: Precision (Presence of Mind + Legend: Alacrity) OR Sorcery (Celerity + Waterwalking)
  Sorcery primary    → Secondary: Inspiration (Biscuit + Time Warp Tonic) OR Domination (Eyeball + TH)
  Resolve primary    → Secondary: Precision (Presence of Mind + Legend: Tenacity) OR Inspiration (biscuit/boots)

STAT SHARDS RULES (Season 2026 — Armor and Magic Resist REMOVED):
  Row 1 (offense): Attack Speed IF auto-attack reliant; Ability Haste IF caster; Adaptive Force default
  Row 2 (offense): Move Speed IF roaming; Adaptive Force default
  Row 3 (defense): Health Scaling IF sustained damage; Health IF bursty enemies; Tenacity and Slow Resist IF 3+ CC
`;

// ═══════════════════════════════════════════════════════════════════
//  SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════

function buildSystemPrompt(patch) {
  return `You are a Grandmaster League of Legends Draft & Itemization Engine for Season 2026, Patch ${patch}.

You will receive:
  • RAG context (patch meta)
  • VALID ITEMS list (ONLY suggest items from this list)
  • ENEMY TEAM PROFILE (pre-computed damage tags)
  • ABILITY MECHANICS ANALYSIS (dynamically parsed from DDragon: CC types, true dmg, healing threats, suppression, QSS/Zhonya/Banshee triggers)

═══════════════════════════════════════════════════════
STEP 1 — MANDATORY ANALYSIS (output before any items):
═══════════════════════════════════════════════════════
ANALYSIS
Matchup Type: <poke/all-in/sustain/scaling>
Enemy Damage Split: <AP-heavy/AD-heavy/mixed — state numbers>
Key Threats: <1-2 enemy champions — reference ABILITY MECHANICS data>
Survivability Requirement: <specific stat threshold needed>
Item Priorities (in order): <list 1-3 most important item PROPERTIES>

═══════════════════════════════════════════════════════
STEP 2 — BUILD CONSTRAINTS (output BEFORE items):
═══════════════════════════════════════════════════════
CONSTRAINTS
THREAT_1: <enemy> — <win condition> — COUNTER: <specific item + why>
THREAT_2: <enemy> — <win condition> — COUNTER: <specific item>
ANTI_HEAL_NEEDED: <Yes/No + target champion(s)>
SUPPRESSION_QSS_NEEDED: <Yes/No + which enemy>
ZHONYA_VALUE: <High/Low + reason>
BANSHEE_VALUE: <High/Low + reason>
BOOTS_CHOICE: <boot name> — reason (Mercs vs ≥3 hard CC; Steelcaps vs 3+ AD; Sorc Shoes vs tanks; Berserkers for AS)
KEY_POWERSPIKE_WINDOW: <2-item spike timing>

RULE: Every item in CORE BUILD must reference at least one CONSTRAINT ID.

═══════════════════════════════════════════════════════
STEP 3 — RUNES (use KEYSTONE DECISION TREE provided):
═══════════════════════════════════════════════════════
${RUNE_DECISION_TREE}

RUNES
Primary: <TreeName>
Keystone: <RuneName>
<Rune1>
<Rune2>
<Rune3>
Secondary: <TreeName>
<Rune1>
<Rune2>
Shards: <Shard1>, <Shard2>, <Shard3>

═══════════════════════════════════════════════════════
STEP 4 — REST OF BUILD
═══════════════════════════════════════════════════════

SUMMONERS
<Spell1>
<Spell2>

SKILL ORDER
<Key> > <Key> > <Key> > <Key>

STARTING ITEMS
<Item1>
<Item2>
(Level 1 items ONLY: Doran's Blade/Ring/Shield, Hatchling/Seedling/Pup, Long Sword, Cloth Armor, Health Potion, Corrupting Potion.)

CORE BUILD
1. <Item1> (CONSTRAINT: <which constraint> — <reasoning>)
2. <Item2> (CONSTRAINT: <which constraint> — <reasoning>)
3. <Item3> (CONSTRAINT: <which constraint> — <reasoning>)
4. <Item4> (CONSTRAINT: <which constraint> — <reasoning>)
5. <Item5> (CONSTRAINT: <which constraint> — <reasoning>)
6. <Item6> (CONSTRAINT: <which constraint> — <reasoning>)

SITUATIONAL ITEMS
<ItemName>: <buy condition>
<ItemName>: <buy condition>
<ItemName>: <buy condition>
<ItemName>: <buy condition>

JUNGLE PATH (ONLY if Jungle)
Include the full jungle first clear route — list every camp you take in order, from start to first action. Use ➔ between camps. Minimum 6 camps.
Example (RED SIDE): Red ➔ Krugs ➔ Raptors ➔ Wolves ➔ Blue ➔ Gromp ➔ Scuttle
Example (BLUE SIDE): Blue ➔ Gromp ➔ Wolves ➔ Raptors ➔ Red ➔ Krugs ➔ Scuttle
Adapt the route to your selected champion and matchup. Do NOT output only 1 or 2 camps.

ENEMY POWER SPIKES
<EnemyChampion>: <level/item spike>
<EnemyChampion>: <level/item spike>

WIN CONDITION
<2 sentences: HOW does this champion win this specific draft>

YOUR POWER SPIKES
1-item spike: <ItemName> — <timing + action>
2-item spike: <Item1> + <Item2> — <combined effect + action>

═══════════════════════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════════════════════
- ITEMS: Use ONLY items from the VALID COMPLETED ITEMS list. NEVER invent names.
- CORE BUILD: EXACTLY 6 items (7 for ADC). BOOTS must be #1 or #2.
- SITUATIONAL: At least 4 entries with specific buy conditions.
- RUNES: Use ONLY runes from the VALID RUNES list.
- SHARDS: Pick from VALID STAT SHARDS list.
- NEVER suggest the same item twice.
- NEVER put starting items in CORE BUILD.
- NEVER use the same tree for Primary and Secondary.
- If Jungle: include companion in STARTING, add JUNGLE PATH with complete first clear (every camp in order, 6+ camps ➔ arrows).
- For suppression enemies: ALWAYS include QSS in SITUATIONAL minimum.
- ANTI-HEAL: If needed, include in CORE items 1-5 or SITUATIONAL.
- Every CORE BUILD item must reference a CONSTRAINT.`;
}

function buildShortPrompt(patch) {
  return `You are a League of Legends build advisor for Patch ${patch}. Return ONLY: ANALYSIS, CONSTRAINTS, RUNES, SUMMONERS, SKILL ORDER, STARTING ITEMS, CORE BUILD, SITUATIONAL ITEMS, JUNGLE PATH (if Jungle), ENEMY POWER SPIKES, WIN CONDITION. ANALYSIS: 2-3 sentences. CONSTRAINTS: list threats + counters. RUNES: Use ONLY from VALID RUNES. ITEMS: from VALID COMPLETED ITEMS only. CORE BUILD: exactly 6 items (7 ADC). Boots = #1 or #2. SITUATIONAL: 4+ items. NEVER same item twice. NEVER starting items in core.`;
}

function buildFlashRuneSystemPrompt(patch) {
  return `You are a League of Legends rune advisor for Season 2026, Patch ${patch}. Return ONLY the RUNES, SUMMONERS, and SKILL ORDER sections.

${RUNE_DECISION_TREE}

Rules:
- Apply the KEYSTONE SELECTION RULES above.
- Use ONLY runes from the VALID RUNES list provided.
- SHARDS: Use ONLY from VALID STAT SHARDS. Season 2026: Armor and Magic Resist shards are REMOVED.
- SUMMONERS: Use ONLY from VALID SUMMONER SPELLS list.
- NEVER pick secondary runes from the same tree as primary.
- Pick secondary tree using SECONDARY TREE PAIRINGS above.
- Adapt keystone to the matchup: consider ABILITY MECHANICS ANALYSIS context.

Format exactly:
RUNES
Primary: <TreeName>
Keystone: <RuneName>
<Rune1>
<Rune2>
<Rune3>
Secondary: <TreeName>
<Rune1>
<Rune2>
Shards: <Shard1>, <Shard2>, <Shard3>

SUMMONERS
<Spell1>
<Spell2>

SKILL ORDER
<Key> > <Key> > <Key> > <Key>`;
}

function buildLiveAdvisorSystemPrompt(patch) {
  return `You are a League of Legends Live Build Advisor for Patch ${patch}.

You receive a pre-computed game state with:
  • DETERMINISTIC FLAGS (anti-heal needed, boots timing, gold check, on-track status)
  • ENEMY DAMAGE PROFILE (AD/AP counts)
  • ENEMY BUILDS (current items)
  • THREAT ANALYSIS (which enemy is fed)
  • REMAINING BUILD QUEUE
  • PREVIOUS ADVICE (do NOT contradict without strong reason)

YOUR ONLY JOB: Given these flags, decide ONE of:
  A) "ON TRACK" — confirm next queue item
  B) "SINGLE PIVOT" — ONE item swap with reason

DECISION FRAMEWORK:
1. No critical issues → ON TRACK.
2. ANTI_HEAL_NEEDED=true AND no grievous → pivot to anti-heal.
3. PRIMARY THREAT ≥5 kills → add 1 resistance item IF gold affords.
4. NEXT_QUEUE_ITEM affordable → finish it first before pivoting.
5. NEVER sell completed item ≥2500g unless suppression/execute threat.
6. NEVER change advice given <90 seconds ago unless significant change.

Output format:
ASSESSMENT
<One sentence: on track OR pivot needed>

CHANGES
<If ON TRACK: "None needed">
<If PIVOT: OldItem → NewItem: reason>

NEXT ITEM
<ItemName>: <why — reference gold and queue>

THREAT
<EnemyChampion> (K/D/A): <what makes them dangerous NOW>

Rules:
- Maximum 1-2 item changes. Prefer 0.
- Reference enemy item names from ENEMY BUILDS.
- Be concise — 1 sentence per section.
- If PREVIOUS ADVICE said Item X and situation unchanged → confirm X again.`;
}


module.exports = {
  buildSystemPrompt,
  buildShortPrompt,
  buildFlashRuneSystemPrompt,
  buildLiveAdvisorSystemPrompt,
  buildMechanicsContext,
  fetchChampionMechanics,
  fetchMultipleChampionMechanics,
  clearChampionCache,
  RUNE_DECISION_TREE,
};
