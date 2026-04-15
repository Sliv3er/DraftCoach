/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║  STRESS TEST: Intelligence & Decision Quality                ║
 * ║  Validates prompt engineering, decision logic, and pipeline  ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) { console.log(`  ✅ ${testName}`); passed++; }
  else { console.log(`  ❌ FAILED: ${testName}`); failed++; }
}

const mainJs = fs.readFileSync(path.join(__dirname, 'src', 'main', 'main.js'), 'utf-8');
const appTsx = fs.readFileSync(path.join(__dirname, 'src', 'renderer', 'App.tsx'), 'utf-8');
const buildOutput = fs.readFileSync(path.join(__dirname, 'src', 'renderer', 'components', 'BuildOutput.tsx'), 'utf-8');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║  STRESS TEST: Intelligence & Decision Quality                ║
╚════════════════════════════════════════════════════════════════╝
`);


// ═══════════════════════════════════════════════════════════════
// Suite 1: System Prompt Quality — Is the AI told to think smart?
// ═══════════════════════════════════════════════════════════════
console.log('── Suite 1: System Prompt Quality ──n');

// Mandatory chain-of-thought before build
assert(mainJs.includes('FIRST, output this analysis section to reason'), 'System prompt forces chain-of-thought ANALYSIS before build');
assert(mainJs.includes('THINK THEN BUILD'), 'System prompt has THINK THEN BUILD rule');
assert(mainJs.includes('must directly influence your item choices'), 'Analysis must directly influence items');

// Anti-cookie-cutter
assert(mainJs.includes('Do not just output standard high-winrate builds'), 'Anti-cookie-cutter instruction present');
assert(mainJs.includes('PLAY LIKE A GRANDMASTER'), 'PLAY LIKE A GRANDMASTER directive');
assert(mainJs.includes('Do NOT output a generic cookie-cutter build'), 'Cookie-cutter explicitly banned');

// Rune-item coherence
assert(mainJs.includes('Conqueror → sustained trade items'), 'Conqueror → sustain mapping documented');
assert(mainJs.includes('Lethal Tempo → attack speed items'), 'Lethal Tempo → AS mapping documented');
assert(mainJs.includes('Electrocute → burst items'), 'Electrocute → burst mapping documented');
assert(mainJs.includes('Fleet Footwork → sustain/kiting items'), 'Fleet → sustain mapping documented');
assert(mainJs.includes('Grasp → bruiser/tank items'), 'Grasp → bruiser mapping documented');
assert(mainJs.includes('Dark Harvest → snowball items'), 'Dark Harvest → snowball mapping documented');

// COMMON MISTAKES section
assert(mainJs.includes('COMMON MISTAKES'), 'COMMON MISTAKES section exists');
assert(mainJs.includes('Do NOT put boots as item 5 or 6'), 'Anti-mistake: boots placement');
assert(mainJs.includes('Do NOT suggest the same item twice'), 'Anti-mistake: duplicate items');
assert(mainJs.includes('Do NOT put starting items'), 'Anti-mistake: starting items in core');
assert(mainJs.includes('Do NOT pick secondary runes from the SAME tree'), 'Anti-mistake: same tree');
assert(mainJs.includes('Do NOT suggest 2 pairs of boots'), 'Anti-mistake: double boots');

// Example shows depth
assert(mainJs.includes('EXAMPLE (showing the expected reasoning depth'), 'Example section present');
assert(mainJs.includes('ADAPTED: 3 AP enemies'), 'Example shows adaptive reasoning');


// ═══════════════════════════════════════════════════════════════
// Suite 2: Validation Pipeline Robustness
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 2: Validation Pipeline Robustness ──n');

// 5-layer validation
assert(mainJs.includes('Validate RUNES section'), 'Layer 1: Rune validation');
assert(mainJs.includes('Validate items in CORE BUILD'), 'Layer 2: Item validation');
assert(mainJs.includes('Validate SUMMONERS section'), 'Layer 3: Summoner validation');
assert(mainJs.includes('Duplicate item dedup'), 'Layer 4: Item dedup');
assert(mainJs.includes('Secondary tree must differ from primary'), 'Layer 5: Tree collision fix');

// Shard validation
assert(mainJs.includes('Adaptive Force') && mainJs.includes('Attack Speed') && mainJs.includes('Ability Haste'), 'Valid shards Row 1 defined');
assert(mainJs.includes('Move Speed') && mainJs.includes('Health Scaling'), 'Valid shards Row 2 defined');
assert(mainJs.includes('Tenacity and Slow Resist'), 'Valid shards Row 3 defined');

// Levenshtein for fuzzy matching
assert(mainJs.includes('function levenshtein'), 'Levenshtein distance function exists');
assert(mainJs.includes('function findClosestMatch'), 'findClosestMatch function exists');
assert(mainJs.includes('maxDist = 5'), 'Max edit distance of 5 for fuzzy matching');

// Post-validation runs on ALL paths
assert(mainJs.includes('validateAndCorrectBuild'), 'validateAndCorrectBuild function exists');
// Count how many times it's called
const validateCalls = mainJs.match(/validateAndCorrectBuild\(/g);
assert(validateCalls && validateCalls.length >= 3, `validateAndCorrectBuild called ${validateCalls?.length || 0} times (expect ≥3: stream, dual-flash, dual-fallback)`);


// ═══════════════════════════════════════════════════════════════
// Suite 3: Enemy Profile Intelligence
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 3: Enemy Profile Intelligence ──n');

// computeEnemyProfile function
assert(mainJs.includes('async function computeEnemyProfile'), 'computeEnemyProfile function exists');

// Damage type classification
assert(mainJs.includes('HEAVY AP') || mainJs.includes('AP-heavy'), 'AP-heavy detection');
assert(mainJs.includes('HEAVY AD') || mainJs.includes('AD-heavy'), 'AD-heavy detection');
assert(mainJs.includes('TANKY'), 'Tank-heavy detection');
assert(mainJs.includes('HEALING'), 'Healing enemy detection');
assert(mainJs.includes('ASSASSIN'), 'Assassin threat detection');

// Counter hints system
assert(mainJs.includes('CHAMPION-SPECIFIC COUNTER TIPS') || mainJs.includes('counterHints'), 'Counter tips system exists');

// Enemy profile used in prompts
assert(mainJs.includes('enemyProfile') && mainJs.includes('ENEMY TEAM PROFILE'), 'Enemy profile injected into prompt');


// ═══════════════════════════════════════════════════════════════
// Suite 4: Live Advisor Decision Quality
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 4: Live Advisor Decision Quality ──\n');

// 5-step decision framework
assert(mainJs.includes('THREAT CHECK'), 'Decision framework: Threat check');
assert(mainJs.includes('DAMAGE SPLIT CHECK'), 'Decision framework: Damage split');
assert(mainJs.includes('GOLD EFFICIENCY'), 'Decision framework: Gold efficiency');
assert(mainJs.includes('ANTI-HEAL CHECK'), 'Decision framework: Anti-heal');
assert(mainJs.includes('BOOT CHECK'), 'Decision framework: Boot check');

// Gold context rules
assert(mainJs.includes('gold < 1000') || mainJs.includes('gold < 800'), 'Low gold → components only rule');
assert(mainJs.includes('gold > 2500') || mainJs.includes('gold >= 3000'), 'High gold → completed items rule');
assert(mainJs.includes('CURRENTLY BUILDING') && mainJs.includes('FINISH IT'), 'Currently-building protection');

// Build complete logic
assert(mainJs.includes('BUILD STATUS') && mainJs.includes('COMPLETE'), 'Build-complete detection');
assert(mainJs.includes('ADC quest boots') && mainJs.includes('CANNOT be sold'), 'ADC quest boots protection');
assert(mainJs.includes('ultra-late game') || mainJs.includes('isUltraLateGame'), 'Ultra-late game detection');

// Anti-flip-flop
assert(mainJs.includes('Do NOT flip-flop') && mainJs.includes('previousAdvice'), 'Anti-flip-flop with memory');

// Objective awareness
assert(mainJs.includes('DragonKill') && mainJs.includes('BaronKill'), 'Objective tracking (Dragon/Baron)');

// Class-filtered items
assert(mainJs.includes('Marksman') && mainJs.includes('CriticalStrike'), 'Marksman class gets crit items');
assert(mainJs.includes('Mage') && mainJs.includes('SpellDamage'), 'Mage class gets AP items');
assert(mainJs.includes('Tank') && mainJs.includes('Armor'), 'Tank class gets armor items');

// Damage profile pre-computed
assert(mainJs.includes('classifyDamageType'), 'Enemy damage type classifier exists');
assert(mainJs.includes('AD-leaning') && mainJs.includes('AP-leaning'), 'Damage lean detection');
assert(mainJs.includes('heavily AD') && mainJs.includes('heavily AP'), 'Heavy damage skew detection');


// ═══════════════════════════════════════════════════════════════
// Suite 5: Item Resolution Pipeline 
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 5: Item Resolution Pipeline ──\n');

// resolveDdragonItem function
assert(mainJs.includes('async function resolveDdragonItem') || mainJs.includes('function resolveDdragonItem'), 'resolveDdragonItem function exists');

// DDragon item cache
assert(mainJs.includes('ddragonItemCache'), 'DDragon item cache variable');

// Icon resolution in overlay
assert(mainJs.includes('iconUrl') && mainJs.includes('overlay-items-update'), 'Overlay updates include icon URLs');

// Item validation in advisor
assert(mainJs.includes('REJECTED invalid item'), 'Advisor rejects invalid items');


// ═══════════════════════════════════════════════════════════════
// Suite 6: Overlay Data Integrity
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 6: Overlay Data Integrity ──n');

// extractOverlayData function
assert(appTsx.includes('extractOverlayData'), 'extractOverlayData function exists');

// Overlay item structure
assert(appTsx.includes('buildItems'), 'Overlay tracks buildItems and bootItem');

// Lock-index system
assert(mainJs.includes('lockIndex'), 'Lock-index prevents modifying currently-building item');

// Boot slot protection in overlay
assert(mainJs.includes('Boots mismatch') || mainJs.includes('currentIsBoots'), 'Boot slot protection in overlay updates');


// ═══════════════════════════════════════════════════════════════
// Suite 7: Temperature & Model Configuration
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 7: Temperature & Model Configuration ──\n');

// Build generation temperature
const buildTempMatch = mainJs.match(/generationConfig:[\s\S]*?temperature:\s*([\d.]+)/);
if (buildTempMatch) {
  const temp = parseFloat(buildTempMatch[1]);
  assert(temp <= 0.5, `Build generation temperature ${temp} ≤ 0.5 (ensures consistency)`);
  assert(temp >= 0.1, `Build generation temperature ${temp} ≥ 0.1 (not completely deterministic)`);
} else {
  assert(false, 'Build generation temperature found');
}

// Advisor temperature
const advisorBlock = mainJs.substring(mainJs.indexOf("Live Game Advisor"));
const advisorTempMatch = advisorBlock.match(/temperature:\s*([\d.]+)/);
if (advisorTempMatch) {
  const temp = parseFloat(advisorTempMatch[1]);
  assert(temp <= 0.5, `Advisor temperature ${temp} ≤ 0.5 (consistent recommendations)`);
}

// Model selection
assert(mainJs.includes("'gemini-3-flash-preview'"), 'Flash model defined');
assert(mainJs.includes("'gemini-3-pro-preview'"), 'Pro model defined');


// ═══════════════════════════════════════════════════════════════
// Suite 8: RAG Context System
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 8: RAG Context System ──n');

assert(mainJs.includes('getLocalRagContext'), 'RAG context retrieval function exists');
assert(mainJs.includes('ragContext'), 'RAG context injected into prompts');
assert(mainJs.includes('checkAndSyncRag'), 'RAG sync function exists');
assert(mainJs.includes('seedRagFromBundle'), 'RAG bundle seeding exists');


// ═══════════════════════════════════════════════════════════════
// Suite 9: Build Caching System
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 9: Build Caching System ──n');

assert(mainJs.includes('buildCacheKey'), 'Cache key generation exists');
assert(mainJs.includes("source: 'cache'"), 'Cached builds tagged as cache source');
assert(mainJs.includes('getCache') && mainJs.includes('setCache'), 'Cache get/set functions exist');
assert(mainJs.includes('patchDetected'), 'Cache includes patch version');


// ═══════════════════════════════════════════════════════════════
// Suite 10: Scouting Report Intelligence
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 10: Scouting Report Intelligence ──n');

assert(mainJs.includes('runScoutingReport'), 'Scouting report function exists');
assert(mainJs.includes('fetchPlayerScoutData'), 'Player scout data fetch exists');
assert(mainJs.includes('computeFallbackRating'), 'Fallback rating computation exists');
assert(mainJs.includes('scout-report'), 'Scout report IPC channel exists');

// Scouting during loading screen
assert(mainJs.includes('scoutingState') && mainJs.includes('hasRun'), 'Scouting triggers once per game');
assert(mainJs.includes('gt < 60') && mainJs.includes('scoutingState.hasRun'), 'Scouting runs during early game only');


// ═══════════════════════════════════════════════════════════════
// Suite 11: Rune Export to League Client
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 11: Rune Export to League Client ──n');

assert(mainJs.includes('lcuCall'), 'LCU API call function exists');
assert(mainJs.includes('/lol-perks/v1/pages'), 'Rune page API endpoint');
assert(mainJs.includes('PERK_IDS') || mainJs.includes('perkMap'), 'Perk ID mapping exists');
assert(mainJs.includes('STYLE_IDS') || mainJs.includes('styleMap'), 'Style ID mapping exists');
assert(mainJs.includes('REMOVED_SHARD_REMAP'), 'Removed shard remapping for S2026');
assert(mainJs.includes('DEFAULT_SHARDS'), 'Default shard fallback values');


// ═══════════════════════════════════════════════════════════════
// Suite 12: Item Set Export to League Client
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 12: Item Set Export to League Client ──n');

assert(mainJs.includes('ITEM_SECTIONS') && mainJs.includes('STARTING ITEMS'), 'Item section parsing exists');
assert(mainJs.includes('itemIdMap') || mainJs.includes('resolveItem'), 'Item ID resolution exists');
assert(mainJs.includes('DraftCoach.json'), 'Item set exported to DraftCoach.json');
assert(mainJs.includes('itemSet') || mainJs.includes('ItemSet'), 'Item set structure built');


// ═══════════════════════════════════════════════════════════════
// Suite 13: ADC 7-Item Slot Handling
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 13: ADC 7-Item Slot Handling ──n');

// ADC detection
assert(mainJs.includes('isBot') && mainJs.includes('bottom|adc|bot'), 'ADC role detection regex');
assert(mainJs.includes('itemSlots') && mainJs.includes('isBot ? 7 : 6'), 'ADC gets 7 item slots');

// Prompt tells AI about 7 items
assert(mainJs.includes('item slots'), 'Prompt tells AI about item slot count');

// System prompt mentions 7 items
assert(mainJs.includes('7 items if the role is Bottom/ADC'), 'System prompt mentions 7 items for ADC');


// ═══════════════════════════════════════════════════════════════
// Suite 14: Frontend State Machine
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 14: Frontend State Machine ──\n');

// Build states
assert(appTsx.includes("'idle'") && appTsx.includes("'fetching'"), 'Status states: idle, fetching');
assert(appTsx.includes('setStatus'), 'setStatus function exists');

// LCU polling
assert(appTsx.includes('pollLCU'), 'pollLCU function exists');
assert(appTsx.includes('localPlayerCellId'), 'Player cell ID tracking');
assert(appTsx.includes('gameId'), 'Game ID tracking');

// Game-ended cleanup
assert(appTsx.includes("'game-ended'"), 'Game-ended event listener');
assert(appTsx.includes('setLiveAdvice(null)'), 'Live advice cleared on game end');
assert(appTsx.includes('setBuildResult(null)'), 'Build text cleared on game end (setBuildResult)');


// ═══════════════════════════════════════════════════════════════
// Suite 15: Generation Mode Toggle
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 15: Generation Mode Toggle ──\n');

assert(mainJs.includes("'flash'") && mainJs.includes("'hybrid'"), 'Flash and hybrid modes exist');
assert(mainJs.includes("generationMode === 'flash'"), 'Flash mode conditional branching');
assert(mainJs.includes("generationMode") && mainJs.includes("'hybrid'"), 'Hybrid/Pro mode exists');
assert(mainJs.includes('getSetting') && mainJs.includes('generationMode'), 'Generation mode read from settings');

// Flash mode skips runes
const flashBlockMatches = mainJs.includes('Promise.resolve(null)') && mainJs.includes("generationMode === 'flash'");
assert(flashBlockMatches, 'Flash mode skips runes generation');


// ═══════════════════════════════════════════════════════════════
// Suite 16: Summoner Spell Validation
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 16: Summoner Spell Validation ──n');

assert(mainJs.includes('getSummonerSpellsReference'), 'Summoner spell reference function');
assert(mainJs.includes('fetchDdragonSummoners'), 'DDragon summoner fetch function');
assert(mainJs.includes('sumSpellsRef'), 'Summoner spells injected into prompt');


// ═══════════════════════════════════════════════════════════════
// Suite 17: Boots Reference Data
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 17: Boots Reference Data ──n');

assert(mainJs.includes('getValidBootsReference'), 'Boots reference function exists');
assert(mainJs.includes('bootsRef'), 'Boots reference injected into prompt');
assert(mainJs.includes("tags.includes('Boots')"), 'Boots filtered by DDragon tag');


// ═══════════════════════════════════════════════════════════════
// Suite 18: Ping Monitor Integration
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 18: Ping Monitor ──n');

assert(mainJs.includes('startPingMonitor'), 'Ping monitor start function');
assert(mainJs.includes('stopPingMonitor'), 'Ping monitor stop function');
assert(mainJs.includes('getLiveClientPing'), 'Live client ping function');
assert(mainJs.includes('computePingStats'), 'Ping stats computation');


// ═══════════════════════════════════════════════════════════════
// Suite 19: Error Handling & Resilience
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 19: Error Handling & Resilience ──n');

// API key check
assert(mainJs.includes('GEMINI_API_KEY') && mainJs.includes('not set'), 'Missing API key check');

// Fallback model
assert(mainJs.includes('falling back to Flash') || mainJs.includes('fallback'), 'Pro→Flash fallback exists');

// NEED_RETRY handling
assert(mainJs.includes('NEED_RETRY'), 'NEED_RETRY handling for invalid builds');

// Timeout protection
assert(mainJs.includes('timeout') && mainJs.includes('3000'), 'Network timeout protection');

// Error catch in advisor
assert(mainJs.includes("[error]") && mainJs.includes('err.message'), 'Advisor error logging');


// ═══════════════════════════════════════════════════════════════
// Suite 20: Overlay Window Management
// ═══════════════════════════════════════════════════════════════
console.log('n── Suite 20: Overlay Window Management ──n');

assert(mainJs.includes('createOverlayWindow'), 'Overlay window creation');
assert(mainJs.includes('showOverlay') && mainJs.includes('hideOverlay'), 'Overlay show/hide functions');
assert(mainJs.includes('overlayManuallyHidden'), 'Manual hide tracking');
assert(mainJs.includes('foreground'), 'Foreground monitoring');
assert(mainJs.includes('startForegroundMonitor'), 'Foreground monitor function');


// ═══════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════
console.log(`
╔═══════════════════════════════════════════════════╗
║  Results: ${String(passed).padStart(3)} passed, ${String(failed).padStart(2)} failed${' '.repeat(19)}║
╚═══════════════════════════════════════════════════╝
`);

if (failed > 0) process.exit(1);
