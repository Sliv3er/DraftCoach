// ─── Cooldown Tracker Test Suite (Season 2026) ──────────────────
// Run with: node test-cooldowns.js

const cd = require('../../shared/cooldowns/cooldown-data');

let passed = 0;
let failed = 0;

function assert(condition, name, details) {
  if (condition) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); if (details) console.log(`     ${details}`); failed++; }
}

function assertClose(actual, expected, tolerance, name) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) { console.log(`  ✅ ${name} (${actual}s ≈ ${expected}s)`); passed++; }
  else { console.log(`  ❌ ${name} — got ${actual}s, expected ~${expected}s (±${tolerance})`); failed++; }
}

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 1: Champion Name → DDragon Key Mapping');
// ═══════════════════════════════════════════════════════════════

assert(cd.champToDdragonKey('Wukong') === 'MonkeyKing', 'Wukong → MonkeyKing');
assert(cd.champToDdragonKey('Lee Sin') === 'LeeSin', 'Lee Sin → LeeSin');
assert(cd.champToDdragonKey("Cho'Gath") === 'Chogath', "Cho'Gath → Chogath");
assert(cd.champToDdragonKey("Kai'Sa") === 'Kaisa', "Kai'Sa → Kaisa");
assert(cd.champToDdragonKey("Kha'Zix") === 'Khazix', "Kha'Zix → Khazix");
assert(cd.champToDdragonKey("Vel'Koz") === 'Velkoz', "Vel'Koz → Velkoz");
assert(cd.champToDdragonKey('Renata Glasc') === 'Renata', 'Renata Glasc → Renata');
assert(cd.champToDdragonKey('Nunu & Willump') === 'Nunu', 'Nunu & Willump → Nunu');
assert(cd.champToDdragonKey("K'Sante") === 'KSante', "K'Sante → KSante");
assert(cd.champToDdragonKey("Bel'Veth") === 'Belveth', "Bel'Veth → Belveth");
assert(cd.champToDdragonKey('Dr. Mundo') === 'DrMundo', 'Dr. Mundo → DrMundo');
assert(cd.champToDdragonKey('Jarvan IV') === 'JarvanIV', 'Jarvan IV → JarvanIV');
assert(cd.champToDdragonKey('LeBlanc') === 'Leblanc', 'LeBlanc → Leblanc');
assert(cd.champToDdragonKey('Miss Fortune') === 'MissFortune', 'Miss Fortune → MissFortune');
assert(cd.champToDdragonKey('Fiddlesticks') === 'Fiddlesticks', 'Fiddlesticks → Fiddlesticks');
// Regular champions (no mapping needed)
assert(cd.champToDdragonKey('Ahri') === 'Ahri', 'Ahri → Ahri (no change)');
assert(cd.champToDdragonKey('Zed') === 'Zed', 'Zed → Zed (no change)');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 2: Spell Name Normalization');
// ═══════════════════════════════════════════════════════════════

assert(cd.normalizeSpellName('Flash') === 'Flash', 'Flash stays Flash');
assert(cd.normalizeSpellName('SummonerFlash') === 'Flash', 'SummonerFlash → Flash');
assert(cd.normalizeSpellName('summonerflash') === 'Flash', 'summonerflash → Flash');
assert(cd.normalizeSpellName('SummonerDot') === 'Ignite', 'SummonerDot → Ignite');
assert(cd.normalizeSpellName('SummonerHaste') === 'Ghost', 'SummonerHaste → Ghost');
assert(cd.normalizeSpellName('SummonerBoost') === 'Cleanse', 'SummonerBoost → Cleanse');
assert(cd.normalizeSpellName('Unleashed Teleport') === 'Unleashed Teleport', 'Unleashed Teleport stays');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 3: Summoner Spell Base Cooldowns');
// ═══════════════════════════════════════════════════════════════

assert(cd.SUMMONER_SPELL_COOLDOWNS['Flash'] === 300, 'Flash base CD = 300s');
assert(cd.SUMMONER_SPELL_COOLDOWNS['Ignite'] === 180, 'Ignite base CD = 180s');
assert(cd.SUMMONER_SPELL_COOLDOWNS['Teleport'] === 300, 'Teleport base CD = 300s');
assert(cd.SUMMONER_SPELL_COOLDOWNS['Unleashed Teleport'] === 420, 'Unleashed TP = 420s (quest)');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 4: 2026 TP Changes');
// ═══════════════════════════════════════════════════════════════

// TP no longer changes at 14 min — it stays as chosen spell
let result = cd.computeSummonerSpellTimer('Teleport', [], [], 600, 10);
assert(result.baseCd === 300, 'TP at 600s = 300s (no transform)');

result = cd.computeSummonerSpellTimer('Teleport', [], [], 900, 12);
assert(result.baseCd === 300, 'TP at 900s = 300s (no 14-min transform in S2026)');

// Unleashed TP from quest = 420s
result = cd.computeSummonerSpellTimer('Unleashed Teleport', [], [], 1200, 15);
assert(result.baseCd === 420, 'Unleashed TP = 420s (quest reward)');

// Unleashed TP + Cosmic Insight
result = cd.computeSummonerSpellTimer('Unleashed Teleport', [8347], [], 1200, 15);
assertClose(result.actualCd, 356, 1, 'Unleashed TP + Cosmic Insight');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 5: Summoner Spell Haste Calculation');
// ═══════════════════════════════════════════════════════════════

assert(cd.calcSummonerCD(300, false, false) === 300, 'Flash no haste = 300s');
assertClose(cd.calcSummonerCD(300, true, false), 254, 1, 'Flash + Cosmic');
assertClose(cd.calcSummonerCD(300, false, true), 273, 1, 'Flash + Ionian');
assertClose(cd.calcSummonerCD(300, true, true), 234, 1, 'Flash + Cosmic + Ionian');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 6: Perk/Item Detection');
// ═══════════════════════════════════════════════════════════════

assert(cd.hasCosmicInsight([8005, 8347, 8101]), 'Detects Cosmic Insight');
assert(!cd.hasCosmicInsight([8005, 8101, 8200]), 'No false positive Cosmic');
assert(cd.hasIonianBoots([3006, 3158, 3340]), 'Detects Ionian Boots');
assert(!cd.hasIonianBoots([3006, 3111, 3340]), 'No false positive Ionian');
assert(cd.hasUltimateHunter([8100, 8105, 8200]), 'Detects Ultimate Hunter');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 7: Ability Haste with Runes');
// ═══════════════════════════════════════════════════════════════

// Transcendence at level 8+: +10 AH
assert(cd.estimateAbilityHaste([], [8210], 8) === 10, 'Transcendence at lvl 8 = +10 AH');
assert(cd.estimateAbilityHaste([], [8210], 7) === 0, 'Transcendence at lvl 7 = 0 (not active)');

// Items + Transcendence
const ahWithRune = cd.estimateAbilityHaste([3157, 3158], [8210], 10); // Zhonya 25 + Ionian 20 + Transcendence 10
assert(ahWithRune === 55, `Items + Transcendence = 55 AH (got ${ahWithRune})`);

// Jack of All Trades
assert(cd.estimateAbilityHaste([3157, 3158, 3065], [8321], 10) === 80,
  'Items + Jack of All Trades = 70+10 AH');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 8: Ultimate Rank from Level');
// ═══════════════════════════════════════════════════════════════

assert(cd.getUltRank(5) === -1, 'Level 5 = no ult');
assert(cd.getUltRank(6) === 0, 'Level 6 = rank 1');
assert(cd.getUltRank(11) === 1, 'Level 11 = rank 2');
assert(cd.getUltRank(16) === 2, 'Level 16 = rank 3');
assert(cd.getUltRank(20) === 2, 'Level 20 (S2026 top lane) = rank 3');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 9: Ult CD Computation');
// ═══════════════════════════════════════════════════════════════

let ultResult = cd.computeUltTimer([120, 100, 80], 6, [], [], 300);
assert(ultResult && ultResult.baseCd === 120 && ultResult.actualCd === 120, 'Ult rank 1 no AH = 120s');

ultResult = cd.computeUltTimer([120, 100, 80], 11, [3157, 3158], [8210], 600);
// Zhonya 25 + Ionian 20 + Transcendence 10 = 55 AH → 100 * (100/155) = 64.5
assertClose(ultResult.actualCd, 65, 1, 'Ult rank 2 + items + Transcendence');

ultResult = cd.computeUltTimer([120, 100, 80], 5, [], [], 300);
assert(ultResult === null, 'No ult at level 5');

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 10: Edge Cases');
// ═══════════════════════════════════════════════════════════════

result = cd.computeSummonerSpellTimer('UnknownSpell', [], [], 600, 10);
assert(result.baseCd === 300, 'Unknown spell defaults to 300s');

result = cd.computeSummonerSpellTimer('Flash', [], [], 0, 0);
assert(result.actualCd === 300, 'Flash with zeros = 300s');

ultResult = cd.computeUltTimer([], 6, [], [], 300);
assert(ultResult === null, 'Empty ult array = null');

ultResult = cd.computeUltTimer(null, 6, [], [], 300);
assert(ultResult === null, 'Null ult array = null');

// Extreme AH doesn't go negative
const extreme = cd.calcUltCD(80, 200);
assert(extreme > 0 && extreme < 80, `Extreme AH safe: ${extreme}s`);

// ═══════════════════════════════════════════════════════════════
console.log('\n🧪 TEST 11: Spell DDragon Key Map');
// ═══════════════════════════════════════════════════════════════

assert(cd.SPELL_DDRAGON_KEY['Flash'] === 'SummonerFlash', 'Flash icon key');
assert(cd.SPELL_DDRAGON_KEY['Ignite'] === 'SummonerDot', 'Ignite icon key');
assert(cd.SPELL_DDRAGON_KEY['Unleashed Teleport'] === 'SummonerTeleport', 'Unleashed TP icon key');
assert(cd.SPELL_DDRAGON_KEY['Ghost'] === 'SummonerHaste', 'Ghost icon key');

// ═══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED — safe to use in game!');
  process.exit(0);
}
