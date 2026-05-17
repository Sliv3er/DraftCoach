// ─── Cooldown Data & Calculator (Season 2026) ───────────────────────
// Static data for all summoner spell cooldowns, haste sources, and
// calculation helpers for the Live Scoreboard cooldown tracker.
// Updated for Season 2026 Role Quest system and latest patch.

// ── Champion Name → DDragon Key ─────────────────────────────────────
// The Live Client API returns display names, but DDragon uses internal keys
// that differ for many champions. This maps ALL known mismatches.
const CHAMPION_DDRAGON_KEY = {
  // Internal name differs from display name
  'Wukong':          'MonkeyKing',
  'Renata Glasc':    'Renata',
  'Nunu & Willump':  'Nunu',
  'Nunu':            'Nunu',
  // Capitalization matters
  'FiddleSticks':    'Fiddlesticks',
  'Fiddlesticks':    'Fiddlesticks',
  // Apostrophes and special characters → stripped in DDragon
  "Cho'Gath":        'Chogath',
  "Vel'Koz":         'Velkoz',
  "Kha'Zix":         'Khazix',
  "Kai'Sa":          'Kaisa',
  "Kog'Maw":         'KogMaw',
  "Rek'Sai":         'RekSai',
  "Bel'Veth":        'Belveth',
  "K'Sante":         'KSante',
  // Spaces in names → removed in DDragon
  'Lee Sin':         'LeeSin',
  'Master Yi':       'MasterYi',
  'Miss Fortune':    'MissFortune',
  'Tahm Kench':      'TahmKench',
  'Twisted Fate':    'TwistedFate',
  'Xin Zhao':        'XinZhao',
  'Aurelion Sol':    'AurelionSol',
  'Dr. Mundo':       'DrMundo',
  'Jarvan IV':       'JarvanIV',
  // Dots / special
  'LeBlanc':         'Leblanc',
};

/**
 * Convert a champion's display name to the DDragon key for URLs.
 * Falls back to stripping spaces/apostrophes/dots if not in the map.
 */
function champToDdragonKey(name) {
  if (!name) return 'Unknown';
  // Check explicit map first
  if (CHAMPION_DDRAGON_KEY[name]) return CHAMPION_DDRAGON_KEY[name];
  // Fallback: strip spaces, apostrophes, dots, and special chars
  return name.replace(/[\s'.\-&]/g, '');
}

// ── Summoner Spell Base Cooldowns (seconds) — Season 2026 ───────────
const SUMMONER_SPELL_COOLDOWNS = {
  // By display name (from Live Client API)
  'Flash':       300,
  'Ignite':      180,
  'Exhaust':     240,
  'Heal':        240,
  'Barrier':     180,
  'Cleanse':     210,
  'Ghost':       210,
  'Teleport':    300,   // Chosen TP: base 300s. Quest-upgraded → gets a shield, same CD
  'Smite':       90,
  'Mark':        80,    // ARAM snowball
  'Clarity':     240,   // ARAM
  // 2026: Quest-granted Unleashed TP for top laners who didn't pick TP
  'Unleashed Teleport': 420,  // 7 minute cooldown from quest
};

// ── Summoner Spell Name Normalization ───────────────────────────────
// Live Client API sometimes returns rawDisplayName or variations.
// This maps common variants to our canonical names.
const SPELL_NAME_NORMALIZE = {
  // Standard names
  'flash': 'Flash', 'ignite': 'Ignite', 'exhaust': 'Exhaust',
  'heal': 'Heal', 'barrier': 'Barrier', 'cleanse': 'Cleanse',
  'ghost': 'Ghost', 'teleport': 'Teleport', 'smite': 'Smite',
  'mark': 'Mark', 'clarity': 'Clarity',
  // Common API raw names
  'summonerflash': 'Flash', 'summonerdot': 'Ignite',
  'summonerexhaust': 'Exhaust', 'summonerheal': 'Heal',
  'summonerbarrier': 'Barrier', 'summonerboost': 'Cleanse',
  'summonerhaste': 'Ghost', 'summonerteleport': 'Teleport',
  'summonersmite': 'Smite', 'summonersnowball': 'Mark',
  'summonermana': 'Clarity',
  // Unleashed variants
  'unleashed teleport': 'Unleashed Teleport',
  'unleashedteleport': 'Unleashed Teleport',
};

/**
 * Normalize a summoner spell name from the API to a canonical name.
 */
function normalizeSpellName(raw) {
  if (!raw) return 'Unknown';
  // Already a canonical name?
  if (SUMMONER_SPELL_COOLDOWNS[raw] !== undefined) return raw;
  // Lowercase lookup
  const lower = raw.toLowerCase().trim();
  if (SPELL_NAME_NORMALIZE[lower]) return SPELL_NAME_NORMALIZE[lower];
  // Partial match
  for (const [key, value] of Object.entries(SPELL_NAME_NORMALIZE)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }
  return raw; // Return as-is if unknown
}

// ── Summoner Spell DDragon Icon Keys ────────────────────────────────
const SPELL_DDRAGON_KEY = {
  'Flash': 'SummonerFlash',
  'Ignite': 'SummonerDot',
  'Exhaust': 'SummonerExhaust',
  'Heal': 'SummonerHeal',
  'Teleport': 'SummonerTeleport',
  'Ghost': 'SummonerHaste',
  'Barrier': 'SummonerBarrier',
  'Cleanse': 'SummonerBoost',
  'Smite': 'SummonerSmite',
  'Mark': 'SummonerSnowball',
  'Clarity': 'SummonerMana',
  'Unleashed Teleport': 'SummonerTeleport', // Same icon as regular TP
};

// ── Summoner Spell ID → Name Map ────────────────────────────────────
const SUMMONER_SPELL_ID_MAP = {
  1:  'Cleanse',
  3:  'Exhaust',
  4:  'Flash',
  6:  'Ghost',
  7:  'Heal',
  11: 'Smite',
  12: 'Teleport',
  13: 'Clarity',
  14: 'Ignite',
  21: 'Barrier',
  32: 'Mark',       // Snowball (ARAM)
  39: 'Mark',       // Snowball variant
};

// Smite charges — not a traditional CD but we track it anyway
// Unleashed TP (2026 Quest): Fixed 420s (7 min) cooldown
// Regular TP (chosen): 300s base, no longer transforms mid-game in S2026

// ── Summoner Spell Haste Sources ────────────────────────────────────
// In Season 2026, these are the primary sources of summoner spell haste:

const COSMIC_INSIGHT_PERK_ID = 8347;   // Inspiration tree — +18 summoner spell haste
const COSMIC_INSIGHT_HASTE = 18;

const IONIAN_BOOTS_ITEM_ID = 3158;     // Ionian Boots of Lucidity — +10 summoner spell haste
const IONIAN_BOOTS_HASTE = 10;

// Jack of All Trades (Inspiration rune) — grants up to +10 haste at 10 stacks
const JACK_OF_ALL_TRADES_PERK_ID = 8321;
const JACK_OF_ALL_TRADES_HASTE = 10;  // Max stacks estimate

// ── Rune IDs that affect cooldowns ──────────────────────────────────
const ULTIMATE_HUNTER_PERK_ID = 8105;  // Up to 25 Ultimate AH (5 + 4 per unique champion takedown)
const INGENIOUS_HUNTER_PERK_ID = 8134; // Item Haste, not spell haste — but good to track
const TRANSCENDENCE_PERK_ID = 8210;    // +10 AH at level 8

// ── Item Ability Haste Map (for ult CD estimation) ──────────────────
// Major completed items that grant Ability Haste.
// Updated for Season 2026 item system.
const ITEM_ABILITY_HASTE = {
  // Mage items
  3165: 25,  // Morellonomicon
  3089: 0,   // Rabadon (no AH)
  3157: 25,  // Zhonya's Hourglass
  3003: 25,  // Archangel's Staff / Seraph's
  3004: 25,  // Manamune / Muramana
  4628: 25,  // Horizon Focus
  4645: 25,  // Shadowflame
  6655: 25,  // Luden's Companion
  6656: 25,  // Rod of Ages
  3118: 25,  // Malignance
  3152: 20,  // Hextech Rocketbelt
  3116: 0,   // Rylai's (no AH in S2026)
  3102: 25,  // Banshee's Veil
  3115: 0,   // Nashor's Tooth
  4629: 25,  // Cosmic Drive
  3100: 0,   // Lich Bane
  3135: 0,   // Void Staff
  6653: 25,  // Liandry's Anguish
  6657: 25,  // Luden's Storm

  // AD Assassin/Lethality
  6698: 25,  // Voltaic Cyclosword
  6697: 25,  // Hubris
  6696: 25,  // Axiom Arc — SPECIAL: refunds % of ult CD on takedown
  3142: 20,  // Youmuu's Ghostblade
  6695: 15,  // Serpent's Fang
  6693: 15,  // Prowler's Claw
  3814: 15,  // Edge of Night

  // AD Fighter/Bruiser
  3071: 25,  // Black Cleaver
  6694: 25,  // Serylda's Grudge
  3156: 20,  // Maw of Malmortius
  6692: 20,  // Eclipse
  3161: 25,  // Spear of Shojin
  6631: 25,  // Stridebreaker
  6630: 25,  // Goredrinker
  3078: 25,  // Trinity Force
  3508: 20,  // Essence Reaver
  3033: 0,   // Mortal Reminder
  3036: 0,   // Lord Dominik's
  3153: 0,   // BotRK

  // Tank items
  3075: 25,  // Thornmail
  3143: 25,  // Randuin's Omen
  3110: 25,  // Frozen Heart
  3065: 25,  // Spirit Visage
  3742: 0,   // Dead Man's Plate (no AH)
  6664: 25,  // Hollow Radiance (Sunfire)
  6665: 25,  // Jak'Sho
  3001: 25,  // Abyssal Mask
  3068: 25,  // Sunfire Aegis
  3119: 25,  // Winter's Approach / Fimbulwinter
  6662: 25,  // Iceborn Gauntlet
  3083: 0,   // Warmog's Armor
  
  // Support items
  3190: 25,  // Locket of the Iron Solari
  3109: 25,  // Knight's Vow
  3222: 25,  // Mikael's Blessing
  3504: 25,  // Ardent Censer
  3107: 25,  // Redemption
  2065: 25,  // Shurelya's Battlesong
  3011: 15,  // Chemtech Putrifier
  3002: 25,  // Trailblazer
  6616: 25,  // Staff of Flowing Water
  3050: 25,  // Zeke's Convergence
  
  // Boots
  3158: 20,  // Ionian Boots of Lucidity (AH + summoner spell haste)
  3111: 0,   // Mercury's Treads
  3047: 0,   // Plated Steelcaps
  3009: 0,   // Boots of Swiftness
  3020: 0,   // Sorcerer's Shoes
  3006: 0,   // Berserker's Greaves
  3013: 0,   // Synchronized Souls (Support boots)

  // Jungle items — keep for completeness
  6672: 0,   // Kraken Slayer
};

// ── Calculation Helpers ─────────────────────────────────────────────

/**
 * Calculate actual summoner spell cooldown.
 * @param {number} baseCD - Base cooldown in seconds
 * @param {boolean} hasCosmicInsight - Whether the player has Cosmic Insight rune
 * @param {boolean} hasIonianBoots - Whether the player has Ionian Boots
 * @returns {number} Actual cooldown in seconds
 */
function calcSummonerCD(baseCD, hasCosmicInsight, hasIonianBoots) {
  let haste = 0;
  if (hasCosmicInsight) haste += COSMIC_INSIGHT_HASTE;
  if (hasIonianBoots) haste += IONIAN_BOOTS_HASTE;
  return Math.round(baseCD * (100 / (100 + haste)));
}

/**
 * Calculate actual ultimate cooldown.
 * @param {number} baseCD - Base ult cooldown at current rank
 * @param {number} abilityHaste - Total ability haste from items/runes
 * @returns {number} Actual cooldown in seconds
 */
function calcUltCD(baseCD, abilityHaste) {
  return Math.round(baseCD * (100 / (100 + abilityHaste)));
}

/**
 * Determine ult rank from champion level.
 * Most ults are learned at 6/11/16. Returns 0-indexed rank (0, 1, 2).
 * @param {number} level - Champion level (1-18, or up to 20 for top laners in S2026)
 * @returns {number} Ult rank index (0, 1, 2)
 */
function getUltRank(level) {
  if (level >= 16) return 2;
  if (level >= 11) return 1;
  if (level >= 6) return 0;
  return -1; // No ult yet
}

/**
 * Estimate total ability haste from a player's item IDs and perk IDs.
 * @param {number[]} itemIds - Array of item IDs the player owns
 * @param {number[]} [perkIds] - Optional: perk IDs for rune-based AH
 * @param {number} [level] - Optional: champion level for level-gated runes
 * @returns {number} Estimated total ability haste
 */
function estimateAbilityHaste(itemIds, perkIds, level) {
  let totalAH = 0;
  
  // Item-based AH
  for (const id of itemIds) {
    const ah = ITEM_ABILITY_HASTE[id];
    if (ah) totalAH += ah;
  }
  
  // Rune-based AH
  if (perkIds) {
    // Transcendence: +10 AH at level 8+
    if (perkIds.includes(TRANSCENDENCE_PERK_ID) && level && level >= 8) {
      totalAH += 10;
    }
    // Jack of All Trades (estimate max stacks in mid-late game)
    if (perkIds.includes(JACK_OF_ALL_TRADES_PERK_ID) && itemIds.length >= 3) {
      totalAH += JACK_OF_ALL_TRADES_HASTE;
    }
  }
  
  return totalAH;
}

/**
 * Check if a player has Cosmic Insight from their perk IDs.
 */
function hasCosmicInsight(perkIds) {
  return perkIds.includes(COSMIC_INSIGHT_PERK_ID);
}

/**
 * Check if a player has Ionian Boots from their item list.
 */
function hasIonianBoots(itemIds) {
  return itemIds.includes(IONIAN_BOOTS_ITEM_ID);
}

/**
 * Check if a player has Ultimate Hunter rune.
 */
function hasUltimateHunter(perkIds) {
  return perkIds.includes(ULTIMATE_HUNTER_PERK_ID);
}

/**
 * Get the base cooldown for a summoner spell by name.
 * Season 2026: TP no longer transforms at 14 min. 
 * Chosen TP stays at 300s (quest upgrades it with a shield, not CD change).
 * Quest-granted Unleashed TP = 420s.
 */
function getSummonerSpellCD(spellName, gameTime, level) {
  const normalized = normalizeSpellName(spellName);
  return SUMMONER_SPELL_COOLDOWNS[normalized] || 300;
}

// Legacy function kept for backwards compatibility with tests
function getUnleashedTPCooldown(level) {
  // Season 2026: Unleashed TP from quest is fixed at 420s
  return 420;
}

/**
 * Full calculation: given an enemy's data, compute exact summoner spell CD.
 */
function computeSummonerSpellTimer(spellName, perkIds, itemIds, gameTime, level) {
  const normalized = normalizeSpellName(spellName);
  const baseCd = getSummonerSpellCD(normalized, gameTime, level);
  const cosmic = hasCosmicInsight(perkIds);
  const ionian = hasIonianBoots(itemIds);
  const actualCd = calcSummonerCD(baseCd, cosmic, ionian);
  let hasteApplied = 0;
  if (cosmic) hasteApplied += COSMIC_INSIGHT_HASTE;
  if (ionian) hasteApplied += IONIAN_BOOTS_HASTE;
  return { baseCd, actualCd, hasteApplied, normalizedName: normalized };
}

/**
 * Full calculation: given an enemy's data, compute ultimate CD.
 */
function computeUltTimer(ultCooldowns, level, itemIds, perkIds, gameTime) {
  const rank = getUltRank(level);
  if (rank < 0 || !ultCooldowns || ultCooldowns.length === 0) return null;
  const baseCd = ultCooldowns[rank] || ultCooldowns[ultCooldowns.length - 1];
  let abilityHaste = estimateAbilityHaste(itemIds, perkIds, level);

  // Add Ultimate Hunter estimate if they have the rune
  if (hasUltimateHunter(perkIds)) {
    // Estimate stacks based on game time (more conservative early)
    const estimatedStacks = gameTime ? Math.min(5, Math.floor(gameTime / 180)) : 2;
    abilityHaste += 5 + (4 * estimatedStacks); // 5 base + 4 per stack
  }

  const actualCd = calcUltCD(baseCd, abilityHaste);
  return { baseCd, actualCd, abilityHaste };
}

module.exports = {
  SUMMONER_SPELL_COOLDOWNS,
  SUMMONER_SPELL_ID_MAP,
  ITEM_ABILITY_HASTE,
  COSMIC_INSIGHT_PERK_ID,
  IONIAN_BOOTS_ITEM_ID,
  ULTIMATE_HUNTER_PERK_ID,
  TRANSCENDENCE_PERK_ID,
  JACK_OF_ALL_TRADES_PERK_ID,
  SPELL_DDRAGON_KEY,
  CHAMPION_DDRAGON_KEY,
  champToDdragonKey,
  normalizeSpellName,
  calcSummonerCD,
  calcUltCD,
  getUltRank,
  estimateAbilityHaste,
  hasCosmicInsight,
  hasIonianBoots,
  hasUltimateHunter,
  getSummonerSpellCD,
  getUnleashedTPCooldown,
  computeSummonerSpellTimer,
  computeUltTimer,
};
