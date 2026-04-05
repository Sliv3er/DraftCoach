// ─── Cooldown Data & Calculator ──────────────────────────────────────
// Static data for all summoner spell cooldowns, haste sources, and
// calculation helpers for the Live Scoreboard cooldown tracker.

// ── Summoner Spell Base Cooldowns (seconds) ─────────────────────────
const SUMMONER_SPELL_COOLDOWNS = {
  // By display name (from Live Client API)
  'Flash':       300,
  'Ignite':      180,
  'Exhaust':     240,
  'Heal':        240,
  'Barrier':     180,
  'Cleanse':     210,
  'Ghost':       210,
  'Teleport':    300,   // Before 14 min. After 14 min → Unleashed Teleport (level-scaled)
  'Smite':       90,
  'Mark':        80,    // ARAM snowball
  'Clarity':     240,   // ARAM
};

// Smite charges — not a traditional CD but we track it anyway
// Unleashed TP: CD = 330 - (5 * level) → range 330-240 at levels 1-18
function getUnleashedTPCooldown(level) {
  return Math.max(240, 330 - 5 * level);
}

// ── Summoner Spell Haste Sources ────────────────────────────────────
// These are the ONLY two sources of summoner spell haste in the game.

const COSMIC_INSIGHT_PERK_ID = 8347;   // Inspiration tree — +18 summoner spell haste
const COSMIC_INSIGHT_HASTE = 18;

const IONIAN_BOOTS_ITEM_ID = 3158;     // Ionian Boots of Lucidity — +10 summoner spell haste
const IONIAN_BOOTS_HASTE = 10;

// ── Summoner Spell ID → Name Map ────────────────────────────────────
// From DDragon / Live Client API
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
  54: '???',        // Placeholder
};

// ── Item Ability Haste Map (for ult CD estimation) ──────────────────
// Major completed items that grant Ability Haste.
// These are the most common item IDs that provide AH.
// We use this to estimate enemy ult cooldowns from their inventory.
const ITEM_ABILITY_HASTE = {
  // Mage items
  3165: 25,  // Morellonomicon
  3089: 0,   // Rabadon (no AH)
  3157: 25,  // Zhonya's Hourglass
  3003: 25,  // Archangel's Staff
  3004: 25,  // Manamune
  4628: 25,  // Horizon Focus
  4645: 25,  // Shadowflame
  6655: 25,  // Luden's Companion
  6656: 25,  // Everfrost / Rod of Ages variant
  3118: 25,  // Malignance
  3152: 20,  // Hextech Rocketbelt
  3116: 20,  // Rylai's Crystal Scepter
  3102: 25,  // Banshee's Veil

  // AD items
  6698: 25,  // Voltaic Cyclosword
  6697: 25,  // Hubris
  6696: 25,  // Axiom Arc
  3142: 20,  // Youmuu's Ghostblade
  6695: 15,  // Serpent's Fang
  3071: 25,  // Black Cleaver
  6694: 25,  // Serylda's Grudge
  6693: 15,  // Prowler's Claw
  3156: 20,  // Maw of Malmortius
  6692: 20,  // Eclipse
  3033: 0,   // Mortal Reminder
  3036: 0,   // Lord Dominik's

  // Tank items
  3075: 25,  // Thornmail
  3143: 25,  // Randuin's Omen
  3110: 25,  // Frozen Heart
  3065: 25,  // Spirit Visage
  3742: 25,  // Dead Man's Plate
  6664: 25,  // Hollow Radiance (Sunfire)
  6665: 25,  // Jak'Sho
  3001: 25,  // Abyssal Mask
  3190: 25,  // Locket of the Iron Solari
  3109: 25,  // Knight's Vow

  // Support
  3011: 15,  // Chemtech Putrifier
  3222: 25,  // Mikael's Blessing
  3504: 25,  // Ardent Censer
  3107: 25,  // Redemption
  2065: 25,  // Shurelya's Battlesong
  3153: 0,   // Blade of the Ruined King

  // Boots
  3158: 20,  // Ionian Boots of Lucidity (AH + summoner spell haste)
  3111: 0,   // Mercury's Treads
  3047: 0,   // Plated Steelcaps
  3009: 0,   // Boots of Swiftness
  3020: 0,   // Sorcerer's Shoes
  3006: 0,   // Berserker's Greaves

  // Jungle items
  6672: 0,   // Kraken Slayer
};

// ── Ultimate Hunter (Domination Rune) ───────────────────────────────
const ULTIMATE_HUNTER_PERK_ID = 8105;  // Grants up to 25 Ultimate AH (5 + 4 per unique champion takedown stacked to 5)
// We can't know how many stacks they have, so we estimate:
// Early game (< 15 min) → ~2 stacks (~13 AH), Late game → ~5 stacks (~25 AH)

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
 * @param {number} level - Champion level (1-18)
 * @returns {number} Ult rank index (0, 1, 2)
 */
function getUltRank(level) {
  if (level >= 16) return 2;
  if (level >= 11) return 1;
  if (level >= 6) return 0;
  return -1; // No ult yet
}

/**
 * Estimate total ability haste from a player's item IDs.
 * @param {number[]} itemIds - Array of item IDs the player owns
 * @returns {number} Estimated total ability haste
 */
function estimateAbilityHaste(itemIds) {
  let totalAH = 0;
  for (const id of itemIds) {
    const ah = ITEM_ABILITY_HASTE[id];
    if (ah) totalAH += ah;
  }
  return totalAH;
}

/**
 * Check if a player has Cosmic Insight from their perk IDs.
 * @param {number[]} perkIds - Array of perk/rune IDs
 * @returns {boolean}
 */
function hasCosmicInsight(perkIds) {
  return perkIds.includes(COSMIC_INSIGHT_PERK_ID);
}

/**
 * Check if a player has Ionian Boots from their item list.
 * @param {number[]} itemIds - Array of item IDs
 * @returns {boolean}
 */
function hasIonianBoots(itemIds) {
  return itemIds.includes(IONIAN_BOOTS_ITEM_ID);
}

/**
 * Check if a player has Ultimate Hunter rune.
 * @param {number[]} perkIds - Array of perk/rune IDs
 * @returns {boolean}
 */
function hasUltimateHunter(perkIds) {
  return perkIds.includes(ULTIMATE_HUNTER_PERK_ID);
}

/**
 * Get the base cooldown for a summoner spell by name.
 * @param {string} spellName - Summoner spell display name
 * @param {number} [gameTime] - Current game time in seconds (for TP transformation)
 * @param {number} [level] - Champion level (for Unleashed TP scaling)
 * @returns {number} Base cooldown in seconds
 */
function getSummonerSpellCD(spellName, gameTime, level) {
  // Handle Teleport transformation
  if (spellName === 'Teleport' && gameTime && gameTime >= 840) { // 14 minutes
    return getUnleashedTPCooldown(level || 1);
  }
  return SUMMONER_SPELL_COOLDOWNS[spellName] || 300; // Default to 300 if unknown
}

/**
 * Full calculation: given an enemy's data, compute exact summoner spell CD.
 * @param {string} spellName - Summoner spell display name
 * @param {number[]} perkIds - Enemy's rune/perk IDs
 * @param {number[]} itemIds - Enemy's item IDs
 * @param {number} [gameTime] - Current game time
 * @param {number} [level] - Enemy champion level
 * @returns {{ baseCd: number, actualCd: number, hasteApplied: number }}
 */
function computeSummonerSpellTimer(spellName, perkIds, itemIds, gameTime, level) {
  const baseCd = getSummonerSpellCD(spellName, gameTime, level);
  const cosmic = hasCosmicInsight(perkIds);
  const ionian = hasIonianBoots(itemIds);
  const actualCd = calcSummonerCD(baseCd, cosmic, ionian);
  let hasteApplied = 0;
  if (cosmic) hasteApplied += COSMIC_INSIGHT_HASTE;
  if (ionian) hasteApplied += IONIAN_BOOTS_HASTE;
  return { baseCd, actualCd, hasteApplied };
}

/**
 * Full calculation: given an enemy's data, compute ultimate CD.
 * @param {number[]} ultCooldowns - Array of 3 base ult CDs [rank1, rank2, rank3]
 * @param {number} level - Enemy champion level
 * @param {number[]} itemIds - Enemy's item IDs
 * @param {number[]} perkIds - Enemy's perk IDs
 * @param {number} [gameTime] - Current game time (for Ultimate Hunter stack estimation)
 * @returns {{ baseCd: number, actualCd: number, abilityHaste: number } | null}
 */
function computeUltTimer(ultCooldowns, level, itemIds, perkIds, gameTime) {
  const rank = getUltRank(level);
  if (rank < 0 || !ultCooldowns || ultCooldowns.length === 0) return null;
  const baseCd = ultCooldowns[rank] || ultCooldowns[ultCooldowns.length - 1];
  let abilityHaste = estimateAbilityHaste(itemIds);

  // Add Ultimate Hunter estimate if they have the rune
  if (hasUltimateHunter(perkIds)) {
    // Estimate stacks based on game time
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
