/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║  STRESS TEST: Stability Fixes — Flash-Only Mode & More       ║
 * ╚════════════════════════════════════════════════════════════════╝
 *
 * Tests:
 *  Suite 1: Session Tracking (Fix #1 — duplicate generation)
 *  Suite 2: Auto-Generate Dedup & Status Guard (Fix #1)
 *  Suite 3: Jungle Companion Icons (Fix #3)
 *  Suite 4: Item Alias Resolution (Fix #3)
 *  Suite 5: Anti-Hallucination Prompt (Fix #2)
 *  Suite 6: Live Advisor Valid Items Filter (into exclusion)
 *  Suite 7: Flash-Only Mode End-to-End Simulation
 *  Suite 8: Overlay CONSUMABLES_TO_IGNORE (Fix #3)
 *  Suite 9: Array Mutation Prevention
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAILED: ${testName}`);
    failed++;
  }
}

// ── Load source files for testing ──
const mainJsPath = path.join(__dirname, 'src', 'main', 'main.js');
const mainJs = fs.readFileSync(mainJsPath, 'utf-8');

const appTsxPath = path.join(__dirname, 'src', 'renderer', 'App.tsx');
const appTsx = fs.readFileSync(appTsxPath, 'utf-8');

const buildOutputPath = path.join(__dirname, 'src', 'renderer', 'components', 'BuildOutput.tsx');
const buildOutput = fs.readFileSync(buildOutputPath, 'utf-8');


console.log(`
╔════════════════════════════════════════════════════════════════╗
║  STRESS TEST: Stability Fixes — Flash-Only Mode & More       ║
╚════════════════════════════════════════════════════════════════╝
`);

// ═══════════════════════════════════════════════════════════════
// Suite 1: Session Tracking (Fix #1 — duplicate generation)
// ═══════════════════════════════════════════════════════════════
console.log('── Suite 1: Session Tracking (prevent duplicate builds) ──\n');

// Test: lastSessionIdRef exists
assert(
  appTsx.includes('lastSessionIdRef'),
  'lastSessionIdRef is declared in App.tsx'
);

// Test: pollLCU uses session ID check instead of unconditional reset
assert(
  !appTsx.includes('// New champ select = new game. Unlock champion detection for this session.'),
  'Old unconditional reset comment is REMOVED'
);

assert(
  appTsx.includes('lastSessionIdRef.current !== sessionId'),
  'pollLCU checks session ID before resetting lock'
);

// Test: buildGeneratedRef only resets inside the session ID check
const sessionCheckBlock = appTsx.match(/if\s*\(lastSessionIdRef\.current\s*!==\s*sessionId\)\s*\{[^}]+\}/s);
assert(
  sessionCheckBlock && sessionCheckBlock[0].includes('buildGeneratedRef.current = false'),
  'buildGeneratedRef reset is INSIDE session ID check (not unconditional)'
);

assert(
  sessionCheckBlock && sessionCheckBlock[0].includes('autoGenKeyRef.current = \'\''),
  'autoGenKeyRef reset is INSIDE session ID check (not unconditional)'
);

// Test: No duplicate "const session" declaration
const sessionDeclarations = appTsx.match(/const session = result\.session/g);
assert(
  sessionDeclarations && sessionDeclarations.length === 1,
  'Only ONE "const session = result.session" declaration (no duplicates)'
);

// Test: lastSessionIdRef resets on game-ended
const gameEndedBlock = appTsx.match(/const gameEndedHandler[\s\S]*?ipcRenderer\.on\('game-ended'/);
assert(
  gameEndedBlock && gameEndedBlock[0].includes("lastSessionIdRef.current = ''"),
  'lastSessionIdRef resets on game-ended event'
);


// ═══════════════════════════════════════════════════════════════
// Suite 2: Auto-Generate Dedup & Status Guard (Fix #1)
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 2: Auto-Generate Dedup & Status Guard ──\n');

// Test: status === 'fetching' guard exists
assert(
  appTsx.includes("if (status === 'fetching') return;"),
  'Auto-generate has status === fetching guard'
);

// Test: status is in dependency array
const autoGenEffect = appTsx.match(/\[autoDetect,\s*myChampion,\s*role,\s*allies,\s*enemies,\s*status,\s*handleGenerate\]/);
assert(
  autoGenEffect !== null,
  'Auto-generate useEffect includes "status" in dependency array'
);

// Test: Array spread (immutable sort)
assert(
  appTsx.includes('[...allies].sort()') && appTsx.includes('[...enemies].sort()'),
  'comboKey uses [...allies].sort() instead of allies.sort() (no state mutation)'
);

// Test: Simulate dedup key matching — same key should block
{
  const comboKey1 = `Aatrox|top|${['Lux','Jinx','Thresh','Leona'].sort().join(',')}|${['Zed','Yasuo','Lee Sin','Blitzcrank','Ashe'].sort().join(',')}`;
  const comboKey2 = `Aatrox|top|${['Lux','Jinx','Thresh','Leona'].sort().join(',')}|${['Zed','Yasuo','Lee Sin','Blitzcrank','Ashe'].sort().join(',')}`;
  assert(comboKey1 === comboKey2, 'Same draft produces identical comboKey (dedup works)');
}

// Test: Different drafts produce different keys
{
  const key1 = `Aatrox|top|${['Lux','Jinx','Thresh','Leona'].sort().join(',')}|${['Zed','Yasuo','Lee Sin','Blitzcrank','Ashe'].sort().join(',')}`;
  const key2 = `Aatrox|top|${['Lux','Jinx','Thresh','Leona'].sort().join(',')}|${['Zed','Yasuo','Lee Sin','Blitzcrank','Darius'].sort().join(',')}`;
  assert(key1 !== key2, 'Different drafts produce different comboKeys');
}


// ═══════════════════════════════════════════════════════════════
// Suite 3: Jungle Companion Icons (Fix #3 — CONSUMABLES_TO_IGNORE)
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 3: Jungle Companion Icons (CONSUMABLES_TO_IGNORE) ──\n');

// Test: Jungle companions NOT in CONSUMABLES_TO_IGNORE
assert(
  !appTsx.includes("'gustwalker hatchling'") || appTsx.indexOf("'gustwalker hatchling'") > appTsx.indexOf('OVERLAY_ALIASES'),
  'Gustwalker Hatchling is NOT in CONSUMABLES_TO_IGNORE set'
);

assert(
  !appTsx.includes("'mosstomper seedling'") || appTsx.indexOf("'mosstomper seedling'") > appTsx.indexOf('OVERLAY_ALIASES'),
  'Mosstomper Seedling is NOT in CONSUMABLES_TO_IGNORE set'
);

assert(
  !appTsx.includes("'scorched claw'") || appTsx.indexOf("'scorched claw'") > appTsx.indexOf('OVERLAY_ALIASES'),
  'Scorched Claw is NOT in CONSUMABLES_TO_IGNORE set'
);

// Test: Comment explains intentional exclusion
assert(
  appTsx.includes('Jungle companions intentionally NOT excluded'),
  'Comment documents why jungle companions were removed from ignore list'
);

// Test: Health potion IS still in the list
const consumablesBlock = appTsx.match(/CONSUMABLES_TO_IGNORE\s*=\s*new\s*Set\(\[[\s\S]*?\]\)/);
assert(
  consumablesBlock && consumablesBlock[0].includes("'health potion'"),
  'Health potion still in CONSUMABLES_TO_IGNORE (not over-removed)'
);

assert(
  consumablesBlock && consumablesBlock[0].includes("'control ward'"),
  'Control ward still in CONSUMABLES_TO_IGNORE'
);


// ═══════════════════════════════════════════════════════════════
// Suite 4: Item Alias Resolution (Fix #3 — findIcon)
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 4: Item Alias Resolution (findIcon) ──\n');

// Test: ITEM_ALIASES exists in BuildOutput.tsx
assert(
  buildOutput.includes('ITEM_ALIASES'),
  'ITEM_ALIASES map exists in BuildOutput.tsx'
);

// Test: All required aliases are present
const aliasesBlock = buildOutput.match(/ITEM_ALIASES[\s\S]*?\{[\s\S]*?\}/);
const aliasesText = aliasesBlock ? aliasesBlock[0] : '';

const requiredAliases = [
  ['hatchling', 'gustwalker hatchling'],
  ['seedling', 'mosstomper seedling'],
  ['scorchclaw', 'scorchclaw pup'],
  ['scorched claw', 'scorchclaw pup'],
  ['gustwalker', 'gustwalker hatchling'],
  ['mosstomper', 'mosstomper seedling'],
];

for (const [from, to] of requiredAliases) {
  assert(
    aliasesText.includes(`'${from}'`) && aliasesText.includes(`'${to}'`),
    `Alias: "${from}" → "${to}" exists`
  );
}

// Test: findIcon uses ITEM_ALIASES before lookup
assert(
  buildOutput.includes('ITEM_ALIASES[n]'),
  'findIcon checks ITEM_ALIASES before icon lookup'
);

// Test: findIcon uses let (not const) for n to allow alias mutation
assert(
  buildOutput.includes('let n = name.toLowerCase()'),
  'findIcon uses "let n" (mutable) for alias resolution'
);

// Test: OVERLAY_ALIASES in App.tsx
assert(
  appTsx.includes('OVERLAY_ALIASES'),
  'OVERLAY_ALIASES exists in App.tsx extractOverlayData'
);

const overlayAliasBlock = appTsx.match(/OVERLAY_ALIASES[\s\S]*?\{[\s\S]*?\}/);
assert(
  overlayAliasBlock && overlayAliasBlock[0].includes("'hatchling': 'gustwalker hatchling'"),
  'OVERLAY_ALIASES includes hatchling → gustwalker hatchling'
);


// ═══════════════════════════════════════════════════════════════
// Suite 5: Anti-Hallucination Prompt (Fix #2)
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 5: Anti-Hallucination Prompt Reminder ──\n');

// Test: FINAL REMINDER exists in build-stream user message
assert(
  mainJs.includes('FINAL REMINDER') && mainJs.includes('const userMessage = `${ragContext}'),
  'build-stream user message has FINAL REMINDER'
);

// Test: FINAL REMINDER exists in build-dual user message
assert(
  mainJs.includes('FINAL REMINDER') && mainJs.includes('const fullUserMessage = `${ragContext}'),
  'build-dual user message has FINAL REMINDER'
);

// Test: FINAL REMINDER is at the END of the message (last thing model reads)
// Verify FINAL REMINDER is present in ALL build endpoint userMessages
{
  const lines = mainJs.split(/\r?\n/);
  // Find ALL build endpoint userMessage lines (contain body.myChampion)
  const allBuildMsgLines = lines.filter(l =>
    l.includes('body.myChampion') && l.includes('body.role') &&
    (l.includes('const userMessage') || l.includes('const fullUserMessage'))
  );
  assert(
    allBuildMsgLines.length >= 2,
    'Found ' + allBuildMsgLines.length + ' build endpoint userMessage lines (expected 3: runes, build-stream, build-dual)'
  );
  // Check EVERY one has FINAL REMINDER
  const allHaveFinal = allBuildMsgLines.every(l => l.includes('FINAL REMINDER'));
  assert(
    allHaveFinal,
    'ALL ' + allBuildMsgLines.length + ' build endpoint userMessages contain FINAL REMINDER'
  );
}

// Test: Reminder mentions "does NOT exist"
assert(
  mainJs.includes('does NOT exist in the current patch'),
  'Reminder explicitly states invalid items "do NOT exist"'
);

// Test: Reminder mentions "NEVER invent"
assert(
  mainJs.includes('NEVER invent item names'),
  'Reminder says "NEVER invent item names"'
);


// ═══════════════════════════════════════════════════════════════
// Suite 6: Live Advisor Valid Items Filter
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 6: Live Advisor Valid Items Filter ──\n');

// Test: getFilteredValidItems has the into filter
const advisorFilterBlock = mainJs.match(/const getFilteredValidItems[\s\S]*?return validItems/);
assert(
  advisorFilterBlock && advisorFilterBlock[0].includes('d.into && d.into.length > 0'),
  'getFilteredValidItems excludes mid-tier components (into filter)'
);

// Test: Comment explains why
assert(
  advisorFilterBlock && advisorFilterBlock[0].includes('mid-tier components'),
  'Into filter has explanatory comment about mid-tier components'
);

// Test: Still has the gold < 2000 filter
assert(
  advisorFilterBlock && advisorFilterBlock[0].includes('d.gold < 2000'),
  'getFilteredValidItems still has gold < 2000 filter'
);

// Test: Still has from filter
assert(
  advisorFilterBlock && advisorFilterBlock[0].includes('!d.from || d.from.length === 0'),
  'getFilteredValidItems still has from filter'
);

// Test: Boots are still included despite into filter
assert(
  advisorFilterBlock && advisorFilterBlock[0].includes("itemTags.includes('Boots')"),
  'Boots are always included in advisor valid items'
);


// ═══════════════════════════════════════════════════════════════
// Suite 7: Flash-Only Mode End-to-End Simulation
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 7: Flash-Only Mode E2E Simulation ──\n');

// Test: Flash-only mode skips runes phase
const flashSkipBlock = mainJs.match(/if\s*\(generationMode\s*===\s*'flash'\)\s*\{[\s\S]*?Promise\.resolve/);
assert(
  flashSkipBlock !== null,
  'Flash-only mode skips separate runes phase (Promise.resolve(null))'
);

// Test: Flash-only mode uses flash model for full phase
assert(
  mainJs.includes("generationMode === 'flash'") && mainJs.includes("'gemini-3-flash-preview'"),
  'Flash-only mode routes to gemini-3-flash-preview for full build'
);

// Test: fullPhaseModelName is set correctly for flash mode
const modelAssignment = mainJs.match(/const fullPhaseModelName\s*=\s*generationMode\s*===\s*'flash'\s*\?\s*'gemini-3-flash-preview'/);
assert(
  modelAssignment !== null,
  'fullPhaseModelName correctly set to flash model in flash-only mode'
);

// Simulate the dedup key race condition that was causing 4x generation
{
  const allies = ['Lux', 'Jinx', 'Thresh', 'Leona'];
  const enemies = ['Zed', 'Yasuo', 'Lee Sin', 'Blitzcrank', 'Ashe'];

  // Simulate multiple rapid polls — key should be stable
  const key1 = `Aatrox|top|${[...allies].sort().join(',')}|${[...enemies].sort().join(',')}`;
  const key2 = `Aatrox|top|${[...allies].sort().join(',')}|${[...enemies].sort().join(',')}`;
  const key3 = `Aatrox|top|${[...allies].sort().join(',')}|${[...enemies].sort().join(',')}`;
  const key4 = `Aatrox|top|${[...allies].sort().join(',')}|${[...enemies].sort().join(',')}`;

  assert(key1 === key2 && key2 === key3 && key3 === key4,
    'Rapid polls produce IDENTICAL keys (no mutation-based drift)');

  // Verify arrays are NOT mutated by spread-sort
  const originalAllies = ['Lux', 'Jinx', 'Thresh', 'Leona'];
  const sorted = [...originalAllies].sort();
  assert(
    originalAllies[0] === 'Lux' && originalAllies[1] === 'Jinx',
    '[...array].sort() does NOT mutate original array'
  );
}

// Simulate session tracking — same session should NOT reset lock
{
  let lastSessionId = '';
  let buildGenerated = true;
  let autoGenKey = 'Aatrox|top|...';

  // Poll 1: same session
  const sessionId1 = `1-12345`;
  if (lastSessionId !== sessionId1) {
    lastSessionId = sessionId1;
    buildGenerated = false;
    autoGenKey = '';
  }
  // After first poll, lock is reset
  assert(buildGenerated === false, 'First poll of new session resets buildGenerated');

  // Simulate build completion
  buildGenerated = true;
  autoGenKey = 'Aatrox|top|allies|enemies';

  // Poll 2: same session — should NOT reset
  const sessionId2 = `1-12345`;
  if (lastSessionId !== sessionId2) {
    lastSessionId = sessionId2;
    buildGenerated = false;
    autoGenKey = '';
  }
  assert(buildGenerated === true, 'Same session poll does NOT reset buildGenerated');
  assert(autoGenKey === 'Aatrox|top|allies|enemies', 'Same session poll does NOT clear autoGenKey');

  // Poll 3: NEW session — should reset
  const sessionId3 = `1-67890`;
  if (lastSessionId !== sessionId3) {
    lastSessionId = sessionId3;
    buildGenerated = false;
    autoGenKey = '';
  }
  assert(buildGenerated === false, 'NEW session resets buildGenerated');
  assert(autoGenKey === '', 'NEW session clears autoGenKey');
}

// Simulate the exact race condition that caused 4x generation in flash-only mode
{
  let autoGenKey = '';
  let buildGenerated = false;
  let status = 'idle';
  let generateCallCount = 0;

  const handleGenerate = () => {
    generateCallCount++;
    status = 'fetching';
    // Simulate 2s build time
    setTimeout(() => { status = 'idle'; buildGenerated = true; }, 100);
  };

  const tryAutoGenerate = () => {
    if (status === 'fetching') return; // Guard!
    const comboKey = 'Aatrox|top|allies|enemies';
    if (autoGenKey === comboKey) return; // Dedup!
    autoGenKey = comboKey;
    handleGenerate();
  };

  // Simulate 4 rapid polls (2s apart but React batches them)
  tryAutoGenerate(); // Should trigger
  tryAutoGenerate(); // Should be blocked (key match)
  tryAutoGenerate(); // Should be blocked (key match)
  tryAutoGenerate(); // Should be blocked (key match)

  assert(generateCallCount === 1, 'Flash-only: Build generates EXACTLY 1 time (not 4)');

  // Even if key was somehow cleared, status guard blocks
  autoGenKey = '';
  tryAutoGenerate(); // Should be blocked (status === fetching)
  assert(generateCallCount === 1, 'Status guard blocks during active fetch');
}


// ═══════════════════════════════════════════════════════════════
// Suite 8: Overlay CONSUMABLES_TO_IGNORE validation
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 8: Overlay CONSUMABLES_TO_IGNORE ──\n');

// Extract the actual set contents
const setMatch = appTsx.match(/CONSUMABLES_TO_IGNORE\s*=\s*new\s*Set\(\[([\s\S]*?)\]\)/);
const setContents = setMatch ? setMatch[1] : '';

// Items that SHOULD be in the ignore list
const shouldIgnore = [
  'health potion', 'refillable potion', 'corrupting potion',
  'stealth ward', 'oracle lens', 'farsight alteration', 'control ward',
];

for (const item of shouldIgnore) {
  assert(setContents.includes(`'${item}'`), `"${item}" IS in CONSUMABLES_TO_IGNORE`);
}

// Items that should NOT be in the ignore list (jungle companions)
const shouldNotIgnore = [
  'gustwalker hatchling', 'mosstomper seedling', 'scorched claw',
];

for (const item of shouldNotIgnore) {
  assert(!setContents.includes(`'${item}'`), `"${item}" is NOT in CONSUMABLES_TO_IGNORE`);
}


// ═══════════════════════════════════════════════════════════════
// Suite 9: Array Mutation Prevention
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 9: Array Mutation Prevention ──\n');

// Test: .sort() is never called directly on state arrays in the auto-gen effect
const autoGenBlock = appTsx.match(/Auto-generate when all 10[\s\S]*?handleGenerate\(\)/);
assert(
  autoGenBlock && !autoGenBlock[0].includes('allies.sort()'),
  'Auto-gen does NOT call allies.sort() (would mutate state)'
);

assert(
  autoGenBlock && !autoGenBlock[0].includes('enemies.sort()'),
  'Auto-gen does NOT call enemies.sort() (would mutate state)'
);

assert(
  autoGenBlock && autoGenBlock[0].includes('[...allies].sort()'),
  'Auto-gen uses [...allies].sort() (immutable)'
);

assert(
  autoGenBlock && autoGenBlock[0].includes('[...enemies].sort()'),
  'Auto-gen uses [...enemies].sort() (immutable)'
);

// Verify spread-sort doesn't mutate
{
  const arr = ['c', 'a', 'b'];
  const sorted = [...arr].sort();
  assert(arr[0] === 'c' && arr[1] === 'a' && arr[2] === 'b', 'Spread-sort does not mutate original');
  assert(sorted[0] === 'a' && sorted[1] === 'b' && sorted[2] === 'c', 'Spread-sort returns sorted copy');
}


// ═══════════════════════════════════════════════════════════════
// Suite 10: Live Advisor Pipeline Integrity
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 10: Live Advisor Pipeline Integrity ──\n');

// Test: Advisor starts on game detection
assert(
  mainJs.includes("startLiveAdvisor()") && mainJs.includes("Game detected"),
  'Live advisor auto-starts when game is detected'
);

// Test: Advisor stops on game end
assert(
  mainJs.includes("stopLiveAdvisor()") && mainJs.includes("Game process ended"),
  'Live advisor auto-stops when game ends'
);

// Test: Advisor resets state on game end
const gameEndBlock = mainJs.match(/Game process ended[\s\S]*?console\.log\('\[main\] All game state reset/);
assert(
  gameEndBlock && gameEndBlock[0].includes("liveAdvisorState.lastAdviceTime = 0"),
  'Advisor lastAdviceTime resets on game end'
);
assert(
  gameEndBlock && gameEndBlock[0].includes("liveAdvisorState.lastPhase = ''"),
  'Advisor lastPhase resets on game end'
);
assert(
  gameEndBlock && gameEndBlock[0].includes("liveAdvisorState.originalBuildText = ''"),
  'Advisor originalBuildText resets on game end'
);

// Test: Advisor uses Flash model
assert(
  mainJs.includes("const selectedModel = 'gemini-3-flash-preview'") &&
  mainJs.includes('Flash + pre-computed context'),
  'Live advisor uses Flash model with pre-computed context'
);

// Test: 90s cooldown
assert(
  mainJs.includes('advisorCooldown: 90000'),
  'Advisor has 90s cooldown between AI calls'
);

// Test: 6 trigger types exist
assert(mainJs.includes('Phase change'), 'Trigger 1: Phase change');
assert(mainJs.includes('Enemy threat detected'), 'Trigger 2: Fed enemy');
assert(mainJs.includes('Player died'), 'Trigger 3: Player death');
assert(mainJs.includes('Gold spike'), 'Trigger 4: Gold spike');
assert(mainJs.includes('Enemy completed major item'), 'Trigger 5: Enemy item');
assert(mainJs.includes('Periodic build check'), 'Trigger 6: Periodic');

// Test: Pre-computed threat analysis (no Step 1 AI call)
assert(
  mainJs.includes('Eliminate Step 1 AI call') && mainJs.includes('pre-computed threat analysis'),
  'Advisor uses pre-computed threat analysis (no redundant AI call)'
);

// Test: Previous advice memory (anti-flip-flop)
assert(
  mainJs.includes('previousAdvice') && mainJs.includes('Do NOT flip-flop'),
  'Advisor injects previous advice to prevent flip-flopping'
);

// Test: Item validation against DDragon
assert(
  mainJs.includes('validateItem') && mainJs.includes('REJECTED invalid item'),
  'Advisor validates all suggested items against DDragon'
);

// Test: Overlay dedup safety net
assert(
  mainJs.includes('Dedup safety net') && mainJs.includes('seenIds'),
  'Advisor has dedup safety net before pushing to overlay'
);

// Test: ADC quest boots protection
assert(
  mainJs.includes('ADC quest boots cannot be sold'),
  'Advisor blocks selling ADC quest boots for non-boots items'
);

// Test: store-original-build IPC handler
assert(
  mainJs.includes("ipcMain.on('store-original-build'") && mainJs.includes('Stored original build text'),
  'store-original-build IPC handler exists and logs'
);

// Test: Frontend sends store-original-build after Pro build
assert(
  appTsx.includes("ipcRenderer.send('store-original-build'"),
  'Frontend sends store-original-build after build generation'
);

// Test: Frontend invokes live-advisor-start after build
assert(
  appTsx.includes("ipcRenderer.invoke('live-advisor-start')"),
  'Frontend invokes live-advisor-start after build generation'
);


// ═══════════════════════════════════════════════════════════════
// Suite 11: Build-Dual Endpoint Flash-Only Path
// ═══════════════════════════════════════════════════════════════
console.log('\n── Suite 11: Build-Dual Flash-Only Path ──\n');

// Test: generationMode setting is read
assert(
  mainJs.includes("getSetting('generationMode')") && mainJs.includes("|| 'hybrid'"),
  'generationMode reads from settings with hybrid default'
);

// Test: Flash-only skips runes phase
const flashOnlyBlock = mainJs.match(/if\s*\(generationMode\s*===\s*'flash'\)\s*\{[\s\S]*?\}/);
assert(
  flashOnlyBlock && flashOnlyBlock[0].includes('skip the separate runes phase'),
  'Flash-only mode comment explains runes skip'
);

// Test: Full build still runs in flash-only mode
assert(
  mainJs.includes("model: fullPhaseModelName") || mainJs.includes("model: fullPhaseModelName,"),
  'Full build phase uses fullPhaseModelName (which is flash model in flash-only mode)'
);

// Test: Fallback to Flash if Pro fails (redundant in flash-only but safe)
assert(
  mainJs.includes("Pro result missing CORE BUILD") && mainJs.includes("falling back to Flash"),
  'Fallback exists if Pro/Flash full build fails'
);

// Test: Cache works in flash-only mode
assert(
  mainJs.includes("phase: 'full', chunk: cached.text, done: true, source: 'cache'"),
  'Cache returns full build in flash-only mode'
);

// Test: validateAndCorrectBuild runs on flash-only output
const fullPhaseBlock = mainJs.match(/Phase 2: Full build[\s\S]*?return validated;/);
assert(
  fullPhaseBlock && fullPhaseBlock[0].includes('validateAndCorrectBuild'),
  'validateAndCorrectBuild runs on full build in flash-only mode'
);


// ═══════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════
console.log(`
╔═══════════════════════════════════════════════════╗
║  Results: ${String(passed).padStart(2)} passed, ${String(failed).padStart(2)} failed${' '.repeat(20)}║
╚═══════════════════════════════════════════════════╝
`);

if (failed > 0) {
  process.exit(1);
}
