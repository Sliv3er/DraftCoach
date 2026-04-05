// Generates items.json with ALL major League items (150+)
// Run: node tools/generate-items.js
const fs = require('fs');
const path = require('path');

// Format: [id, name, tags[], cost, spikeTiming, statProfile{}, passiveKeywords[]]
const ITEMS = [
    // ── AP BURST ──
    ["3285", "Luden's Companion", ["AP", "BURST", "MANA"], 2900, "MID", { ap: 90, mana: 600, abilityHaste: 20 }, ["ECHO_DAMAGE"]],
    ["3089", "Rabadon's Deathcap", ["AP", "BURST", "SCALING"], 3600, "LATE", { ap: 130 }, ["AP_MULTIPLIER"]],
    ["4005", "Shadowflame", ["AP", "BURST", "PENETRATION"], 3000, "MID", { ap: 100, magicPen: 10 }, ["CRIT_MAGIC", "FLAT_MAGIC_PEN"]],
    ["6653", "Liandry's Torment", ["AP", "BURN", "HEALTH"], 3000, "MID", { ap: 90, health: 300 }, ["BURN_PERCENT_HP"]],
    ["3118", "Malignance", ["AP", "BURST", "HASTE"], 2700, "MID", { ap: 80, abilityHaste: 25, mana: 600 }, ["ULT_HASTE"]],
    ["4628", "Horizon Focus", ["AP", "BURST", "DAMAGE"], 2700, "MID", { ap: 85, health: 150 }, ["HYPERSHOT"]],
    ["3152", "Hextech Rocketbelt", ["AP", "BURST", "DASH", "ENGAGE"], 2600, "MID", { ap: 80, health: 250 }, ["DASH_ACTIVE"]],
    // ── AP UTILITY ──
    ["3135", "Void Staff", ["AP", "PENETRATION"], 2800, "MID", { ap: 65, magicPenPercent: 40 }, ["MAGIC_PEN_PERCENT"]],
    ["3165", "Morellonomicon", ["AP", "ANTI_HEAL", "HEALTH"], 2500, "MID", { ap: 80, health: 300 }, ["GRIEVOUS_WOUNDS"]],
    ["3157", "Zhonya's Hourglass", ["AP", "ANTI_DIVE", "ANTI_BURST", "SAFETY", "ARMOR", "DEFENSIVE"], 2600, "MID", { ap: 80, armor: 45 }, ["STASIS"]],
    ["3102", "Banshee's Veil", ["AP", "ANTI_BURST", "MR", "SAFETY", "DEFENSIVE"], 2500, "MID", { ap: 80, mr: 45 }, ["SPELL_SHIELD"]],
    ["3116", "Rylai's Crystal Scepter", ["AP", "UTILITY", "HEALTH", "SLOW"], 2600, "MID", { ap: 75, health: 350 }, ["SLOW_ON_HIT"]],
    ["3040", "Seraph's Embrace", ["AP", "MANA", "SCALING", "HEALTH"], 2600, "LATE", { ap: 80, mana: 860 }, ["MANA_SHIELD"]],
    ["3003", "Archangel's Staff", ["AP", "MANA", "SCALING"], 2600, "LATE", { ap: 60, mana: 860 }, ["MANA_TO_AP"]],
    ["4629", "Cosmic Drive", ["AP", "HASTE", "UTILITY"], 3000, "MID", { ap: 80, health: 250, abilityHaste: 25 }, ["MOVESPEED_ON_HIT"]],
    ["3115", "Nashor's Tooth", ["AP", "ATTACK_SPEED", "ONHIT"], 3000, "MID", { ap: 90, attackSpeed: 50 }, ["AP_ONHIT"]],
    ["3100", "Lich Bane", ["AP", "BURST", "ONHIT"], 2700, "MID", { ap: 85, abilityHaste: 15 }, ["SPELLBLADE"]],
    // ── AD DAMAGE ──
    ["6672", "Kraken Slayer", ["AD", "DAMAGE", "ATTACK_SPEED", "ONHIT"], 3100, "MID", { ad: 40, attackSpeed: 35 }, ["TRUE_DAMAGE_ONHIT"]],
    ["3031", "Infinity Edge", ["AD", "CRIT", "DAMAGE", "SCALING"], 3400, "LATE", { ad: 70, critChance: 25 }, ["CRIT_MULTIPLIER"]],
    ["6676", "The Collector", ["AD", "CRIT", "BURST", "LETHALITY"], 3000, "MID", { ad: 50, critChance: 25, lethality: 10 }, ["EXECUTE"]],
    ["6696", "Axiom Arc", ["AD", "LETHALITY", "HASTE"], 3000, "MID", { ad: 55, lethality: 18, abilityHaste: 25 }, ["ULT_REFUND"]],
    ["3142", "Youmuu's Ghostblade", ["AD", "LETHALITY", "DAMAGE"], 2800, "MID", { ad: 55, lethality: 18 }, ["MOVESPEED_ACTIVE"]],
    ["6694", "Serylda's Grudge", ["AD", "PENETRATION", "SLOW", "UTILITY"], 3200, "MID", { ad: 45, abilityHaste: 20, armorPenPercent: 30 }, ["SLOW_ON_ABILITY"]],
    ["3036", "Lord Dominik's Regards", ["AD", "PENETRATION", "ANTI_TANK"], 3000, "MID", { ad: 35, critChance: 25, armorPenPercent: 35 }, ["GIANT_SLAYER"]],
    ["3033", "Mortal Reminder", ["AD", "ANTI_HEAL", "CRIT", "PENETRATION"], 2800, "MID", { ad: 35, critChance: 25, armorPenPercent: 25 }, ["GRIEVOUS_WOUNDS"]],
    ["6693", "Prowler's Claw", ["AD", "LETHALITY", "BURST"], 2800, "MID", { ad: 55, lethality: 18, abilityHaste: 15 }, ["DASH_TO_TARGET"]],
    ["6695", "Serpent's Fang", ["AD", "LETHALITY", "ANTI_SHIELD"], 2600, "MID", { ad: 55, lethality: 15 }, ["SHIELD_REAVER"]],
    ["3004", "Manamune", ["AD", "MANA", "SCALING"], 2900, "LATE", { ad: 35, mana: 860 }, ["MANA_TO_AD"]],
    ["3042", "Muramana", ["AD", "MANA", "SCALING", "ONHIT"], 2900, "LATE", { ad: 35, mana: 860 }, ["MANA_ONHIT"]],
    ["6632", "Divine Sunderer", ["AD", "HEALTH", "PENETRATION"], 3300, "MID", { ad: 40, health: 400, abilityHaste: 20 }, ["SPELLBLADE_PERCENT_HP"]],
    ["3078", "Trinity Force", ["AD", "ATTACK_SPEED", "HEALTH"], 3333, "MID", { ad: 35, attackSpeed: 30, health: 300, abilityHaste: 20 }, ["SPELLBLADE", "THREEFOLD"]],
    ["3161", "Spear of Shojin", ["AD", "HASTE", "HEALTH"], 3300, "MID", { ad: 55, health: 300, abilityHaste: 20 }, ["ABILITY_SPAM"]],
    ["6609", "Chempunk Chainsword", ["AD", "ANTI_HEAL", "HEALTH"], 2600, "MID", { ad: 40, health: 250, abilityHaste: 15 }, ["GRIEVOUS_WOUNDS"]],
    ["3071", "Black Cleaver", ["AD", "HEALTH", "PENETRATION", "UTILITY"], 3100, "MID", { ad: 40, health: 450, abilityHaste: 25 }, ["ARMOR_SHRED"]],
    ["3074", "Ravenous Hydra", ["AD", "LIFESTEAL", "DAMAGE"], 3400, "MID", { ad: 65, abilityHaste: 20 }, ["OMNIVAMP", "AOE_CLEAVE"]],
    ["3748", "Titanic Hydra", ["AD", "HEALTH", "DAMAGE"], 3300, "MID", { ad: 40, health: 500 }, ["HP_TO_DAMAGE", "AOE_CLEAVE"]],
    ["3156", "Maw of Malmortius", ["AD", "ANTI_BURST", "MR", "DEFENSIVE"], 2800, "MID", { ad: 55, mr: 45, abilityHaste: 15 }, ["MAGIC_SHIELD"]],
    ["3139", "Mercurial Scimitar", ["AD", "ANTI_CC", "MR"], 3000, "MID", { ad: 40, mr: 50, critChance: 20 }, ["QSS_CLEANSE"]],
    ["3181", "Hullbreaker", ["AD", "HEALTH", "SPLITPUSH"], 2800, "MID", { ad: 50, health: 400 }, ["SIEGE_BUFF"]],
    ["3026", "Guardian Angel", ["AD", "SAFETY", "ARMOR", "DEFENSIVE", "ANTI_DIVE"], 3200, "LATE", { ad: 45, armor: 40 }, ["REVIVE"]],
    ["6333", "Death's Dance", ["AD", "SAFETY", "ARMOR", "DEFENSIVE"], 3300, "MID", { ad: 55, armor: 45, abilityHaste: 15 }, ["DAMAGE_DELAY"]],
    ["3072", "Bloodthirster", ["AD", "LIFESTEAL", "CRIT"], 3400, "LATE", { ad: 55, critChance: 20 }, ["OVERHEAL_SHIELD", "LIFESTEAL"]],
    ["6673", "Immortal Shieldbow", ["AD", "CRIT", "SAFETY", "LIFESTEAL", "DEFENSIVE", "ANTI_BURST"], 3000, "MID", { ad: 50, critChance: 25 }, ["LIFELINE_SHIELD"]],
    ["3046", "Phantom Dancer", ["AD", "ATTACK_SPEED", "CRIT"], 2600, "MID", { attackSpeed: 30, critChance: 25 }, ["GHOSTING"]],
    ["3085", "Runaan's Hurricane", ["AD", "ATTACK_SPEED", "CRIT"], 2600, "MID", { attackSpeed: 40, critChance: 25 }, ["BOLT_SPREAD"]],
    ["3094", "Rapid Firecannon", ["AD", "ATTACK_SPEED", "CRIT"], 2500, "MID", { attackSpeed: 30, critChance: 25 }, ["ENERGIZED_RANGE"]],
    ["3087", "Statikk Shiv", ["AD", "ATTACK_SPEED", "CRIT", "WAVECLEAR"], 2600, "MID", { attackSpeed: 40, critChance: 25 }, ["ENERGIZED_AOE"]],
    ["3153", "Blade of the Ruined King", ["AD", "ATTACK_SPEED", "ONHIT", "ANTI_TANK"], 3200, "MID", { ad: 30, attackSpeed: 30 }, ["PERCENT_HP_ONHIT"]],
    ["3091", "Wit's End", ["AD", "ATTACK_SPEED", "MR", "ONHIT"], 2800, "MID", { attackSpeed: 40, mr: 40 }, ["MAGIC_DAMAGE_ONHIT"]],
    ["3124", "Guinsoo's Rageblade", ["AD", "ATTACK_SPEED", "ONHIT"], 2600, "MID", { attackSpeed: 45 }, ["PHANTOM_HIT"]],
    // ── TANK / DEFENSIVE ──
    ["3075", "Thornmail", ["TANK", "ARMOR", "ANTI_HEAL", "DEFENSIVE"], 2700, "MID", { armor: 60, health: 350 }, ["REFLECT_DAMAGE", "GRIEVOUS_WOUNDS"]],
    ["3143", "Randuin's Omen", ["TANK", "ARMOR", "ANTI_CRIT", "DEFENSIVE"], 2700, "MID", { armor: 60, health: 400 }, ["SLOW_ACTIVE", "CRIT_REDUCTION"]],
    ["3110", "Frozen Heart", ["TANK", "ARMOR", "HASTE", "MANA", "DEFENSIVE"], 2500, "MID", { armor: 80, mana: 400, abilityHaste: 20 }, ["ATTACK_SPEED_SLOW_AURA"]],
    ["3082", "Warden's Mail", ["TANK", "ARMOR", "DEFENSIVE"], 1000, "EARLY", { armor: 40 }, ["ATTACK_SPEED_SLOW"]],
    ["3742", "Dead Man's Plate", ["TANK", "ARMOR", "HEALTH", "MOBILITY"], 2900, "MID", { armor: 45, health: 400 }, ["MOMENTUM"]],
    ["3068", "Sunfire Aegis", ["TANK", "ARMOR", "HEALTH", "DAMAGE"], 2700, "MID", { armor: 40, health: 400, mr: 40 }, ["IMMOLATE"]],
    ["6665", "Jak'Sho, The Protean", ["TANK", "ARMOR", "MR", "HEALTH", "DEFENSIVE"], 3200, "MID", { armor: 40, mr: 40, health: 400 }, ["DRAIN_TANK"]],
    ["3001", "Evenshroud", ["TANK", "SUPPORT", "ARMOR", "MR", "ENGAGE"], 2400, "MID", { armor: 30, mr: 30, health: 300, abilityHaste: 20 }, ["EXPOSE_WEAKNESS"]],
    ["3065", "Spirit Visage", ["TANK", "MR", "HEALTH", "DEFENSIVE"], 2900, "MID", { mr: 60, health: 450, abilityHaste: 10 }, ["HEAL_AMPLIFIER"]],
    ["4401", "Force of Nature", ["TANK", "MR", "HEALTH", "MOBILITY", "DEFENSIVE"], 2900, "MID", { mr: 70, health: 400 }, ["MAGIC_DAMAGE_REDUCTION"]],
    ["3194", "Kaenic Rookern", ["TANK", "MR", "HEALTH", "DEFENSIVE", "ANTI_BURST"], 2900, "MID", { mr: 80, health: 350 }, ["MAGIC_SHIELD"]],
    ["6667", "Hollow Radiance", ["TANK", "MR", "HEALTH", "DAMAGE"], 2800, "MID", { mr: 50, health: 350, abilityHaste: 15 }, ["IMMOLATE"]],
    ["3193", "Gargoyle Stoneplate", ["TANK", "ARMOR", "MR", "DEFENSIVE", "ANTI_BURST"], 3200, "LATE", { armor: 40, mr: 40 }, ["SHIELD_ACTIVE"]],
    ["3119", "Winter's Approach", ["TANK", "MANA", "HEALTH"], 2600, "LATE", { health: 400, mana: 860 }, ["MANA_SHIELD"]],
    ["3083", "Warmog's Armor", ["TANK", "HEALTH", "REGEN", "DEFENSIVE"], 3000, "MID", { health: 800 }, ["REGEN_PASSIVE"]],
    ["3302", "Terminus", ["AD", "ONHIT", "ARMOR", "MR"], 3000, "MID", { ad: 35, attackSpeed: 30 }, ["ADAPTIVE_RESIST"]],
    // ── SUPPORT ──
    ["3504", "Ardent Censer", ["SUPPORT", "UTILITY", "HEAL_SHIELD", "HEAL_SHIELD_AMP", "SUPPORT_ECONOMY"], 2300, "MID", { ap: 60, healShieldPower: 10 }, ["ON_SHIELD_BUFF"]],
    ["3011", "Chemtech Putrifier", ["SUPPORT", "AP", "ANTI_HEAL", "SUPPORT_ECONOMY"], 2300, "MID", { ap: 55, abilityHaste: 15 }, ["GRIEVOUS_WOUNDS_ALLY"]],
    ["3222", "Mikael's Blessing", ["SUPPORT", "UTILITY", "ANTI_CC", "MR", "SUPPORT_ECONOMY"], 2300, "MID", { mr: 50, healShieldPower: 15 }, ["CLEANSE_ALLY"]],
    ["3107", "Redemption", ["SUPPORT", "UTILITY", "HEAL_SHIELD", "HEAL_SHIELD_AMP", "SUPPORT_ECONOMY"], 2300, "MID", { health: 200, healShieldPower: 15 }, ["AOE_HEAL"]],
    ["6655", "Imperial Mandate", ["SUPPORT", "AP", "UTILITY", "CC_REWARD", "SUPPORT_ECONOMY"], 2300, "MID", { ap: 60, abilityHaste: 20 }, ["MARK_DAMAGE"]],
    ["6616", "Staff of Flowing Water", ["SUPPORT", "AP", "UTILITY", "HEAL_SHIELD", "HEAL_SHIELD_AMP", "SUPPORT_ECONOMY"], 2300, "MID", { ap: 60, healShieldPower: 8 }, ["ON_SHIELD_HASTE"]],
    ["2065", "Shurelya's Battlesong", ["SUPPORT", "UTILITY", "ENGAGE", "SUPPORT_ECONOMY"], 2300, "MID", { ap: 40, abilityHaste: 20, health: 200 }, ["SPEED_ACTIVE"]],
    ["3109", "Knight's Vow", ["SUPPORT", "TANK", "HEALTH", "SUPPORT_ECONOMY"], 2300, "MID", { health: 400, abilityHaste: 15 }, ["BOND_REDIRECT"]],
    ["3190", "Locket of the Iron Solari", ["SUPPORT", "TANK", "ANTI_BURST", "DEFENSIVE", "SUPPORT_ECONOMY"], 2300, "MID", { armor: 30, mr: 30, abilityHaste: 15 }, ["SHIELD_ACTIVE_TEAM"]],
    ["4643", "Vigilant Wardstone", ["SUPPORT", "UTILITY", "VISION", "SUPPORT_ECONOMY"], 1100, "LATE", { abilityHaste: 10 }, ["EXTRA_WARDS"]],
    // ── BOOTS ──
    ["3020", "Sorcerer's Shoes", ["BOOTS", "AP", "PENETRATION"], 1100, "EARLY", { magicPen: 18 }, ["FLAT_MAGIC_PEN"]],
    ["3158", "Ionian Boots of Lucidity", ["BOOTS", "UTILITY", "HASTE"], 900, "EARLY", { abilityHaste: 20 }, ["SUMMONER_HASTE"]],
    ["3009", "Boots of Swiftness", ["BOOTS", "UTILITY", "MOBILITY"], 900, "EARLY", {}, ["SLOW_RESIST"]],
    ["3006", "Berserker's Greaves", ["BOOTS", "AD", "ATTACK_SPEED"], 1100, "EARLY", { attackSpeed: 35 }, ["ATTACK_SPEED"]],
    ["3047", "Plated Steelcaps", ["BOOTS", "ARMOR", "DEFENSIVE", "TANK"], 1100, "EARLY", { armor: 20 }, ["BLOCK_AUTOS"]],
    ["3111", "Mercury's Treads", ["BOOTS", "MR", "ANTI_CC", "DEFENSIVE", "TANK"], 1100, "EARLY", { mr: 25 }, ["TENACITY"]],
    ["3013", "Symbiotic Soles", ["BOOTS", "UTILITY"], 900, "EARLY", {}, ["ADAPTIVE_MOVESPEED"]],
    // ── STARTING / CONSUMABLES ──
    ["3850", "Spellthief's Edge", ["SUPPORT", "AP", "STARTING", "SUPPORT_ECONOMY"], 400, "EARLY", { ap: 8 }, ["GOLD_GENERATION"]],
    ["3862", "Relic Shield", ["SUPPORT", "TANK", "STARTING", "SUPPORT_ECONOMY"], 400, "EARLY", { health: 30 }, ["GOLD_GENERATION"]],
    ["3858", "World Atlas", ["SUPPORT", "STARTING", "SUPPORT_ECONOMY"], 400, "EARLY", { health: 50 }, ["GOLD_GENERATION"]],
    ["1055", "Doran's Blade", ["AD", "STARTING"], 450, "EARLY", { ad: 10, health: 100 }, ["OMNIVAMP"]],
    ["1056", "Doran's Ring", ["AP", "STARTING"], 400, "EARLY", { ap: 15, health: 70 }, ["MANA_REGEN"]],
    ["1054", "Doran's Shield", ["TANK", "STARTING", "DEFENSIVE"], 450, "EARLY", { health: 80 }, ["REGEN_ON_HIT"]],
    ["1083", "Cull", ["AD", "STARTING", "SCALING"], 450, "EARLY", { ad: 7 }, ["GOLD_ON_KILL"]],
    ["2003", "Health Potion", ["CONSUMABLE", "STARTING"], 50, "EARLY", {}, ["HEAL"]],
    ["2031", "Refillable Potion", ["CONSUMABLE", "STARTING"], 150, "EARLY", {}, ["HEAL"]],
    ["2055", "Control Ward", ["CONSUMABLE", "VISION"], 75, "EARLY", {}, ["VISION_CONTROL"]],
    ["3364", "Oracle Lens", ["TRINKET"], 0, "EARLY", {}, ["REVEAL"]],
    ["3340", "Stealth Ward", ["TRINKET"], 0, "EARLY", {}, ["WARD"]],
    // ── JUNGLE ──
    ["1101", "Scorchclaw Pup", ["JUNGLE", "STARTING"], 450, "EARLY", {}, ["BURN_SMITE"]],
    ["1102", "Gustwalker Hatchling", ["JUNGLE", "STARTING"], 450, "EARLY", {}, ["SPEED_SMITE"]],
    ["1103", "Mosstomper Seedling", ["JUNGLE", "STARTING"], 450, "EARLY", {}, ["SHIELD_SMITE"]],
    // ── UPGRADED SUPPORT ──
    ["3853", "Shard of True Ice", ["SUPPORT", "AP", "STARTING", "WARD", "SUPPORT_ECONOMY"], 0, "EARLY", { ap: 40 }, ["WARDS"]],
    ["3855", "Runesteel Spaulders", ["SUPPORT", "AD", "STARTING", "WARD", "SUPPORT_ECONOMY"], 0, "EARLY", { ad: 12 }, ["WARDS"]],
    ["3857", "Pauldrons of Whiterock", ["SUPPORT", "TANK", "STARTING", "WARD", "SUPPORT_ECONOMY"], 0, "EARLY", { health: 100 }, ["WARDS"]],
    // ── NICHE / SITUATIONAL ──
    ["3179", "Umbral Glaive", ["AD", "LETHALITY", "VISION"], 2600, "MID", { ad: 50, lethality: 15 }, ["WARD_KILLER"]],
    ["6675", "Navori Flickerblade", ["AD", "CRIT", "HASTE"], 3400, "LATE", { ad: 60, critChance: 25, abilityHaste: 20 }, ["ABILITY_RESET"]],
    ["3053", "Sterak's Gage", ["AD", "HEALTH", "DEFENSIVE", "ANTI_BURST"], 3100, "MID", { ad: 45, health: 400 }, ["LIFELINE_SHIELD"]],
    ["3814", "Edge of Night", ["AD", "LETHALITY", "DEFENSIVE", "SAFETY"], 2800, "MID", { ad: 50, lethality: 15, health: 250 }, ["SPELL_SHIELD"]],
    ["6698", "Voltaic Cyclosword", ["AD", "LETHALITY", "ENERGIZED"], 2900, "MID", { ad: 55, lethality: 18 }, ["ENERGIZED_SLOW"]],
    ["3508", "Essence Reaver", ["AD", "CRIT", "MANA"], 2800, "MID", { ad: 45, critChance: 25, abilityHaste: 20 }, ["SPELLBLADE", "MANA_RESTORE"]],
    ["6701", "Opportunity", ["AD", "LETHALITY"], 2700, "MID", { ad: 55, lethality: 18 }, ["AMBUSH_DAMAGE"]],
    ["3179", "Umbral Glaive", ["AD", "LETHALITY", "VISION"], 2600, "MID", { ad: 50, lethality: 15, abilityHaste: 15 }, ["WARD_KILLER"]],
    ["6621", "Dawncore", ["SUPPORT", "HEAL_SHIELD", "HEAL_SHIELD_AMP", "SUPPORT_ECONOMY"], 2700, "MID", { healShieldPower: 20, abilityHaste: 20 }, ["MEGA_HEAL_SHIELD"]],
    ["3860", "Celestial Opposition", ["SUPPORT", "TANK", "SLOW", "SUPPORT_ECONOMY"], 2300, "MID", { health: 200, armor: 30, mr: 30 }, ["SLOW_ZONE"]],
];

const outPath = path.resolve(__dirname, '../shared/kb/data/items.json');
const meta = {
    patch: "26.4", buildHash: "kb-items-full-001",
    createdAt: new Date().toISOString(), source: "generate-items-v1",
    checksum: "sha256:generated", previousPatch: "26.3", rollbackAvailable: true
};
const data = {};
for (const [id, name, tags, cost, spikeTiming, statProfile, passiveKeywords] of ITEMS) {
    data[id] = { id, name, tags, cost, spikeTiming, statProfile, passiveKeywords };
}
fs.writeFileSync(outPath, JSON.stringify({ meta, data }, null, 4), 'utf-8');
console.log(`Wrote ${Object.keys(data).length} items to ${outPath}`);
