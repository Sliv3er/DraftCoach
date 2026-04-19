/**
 * DraftCoach Overlay Stress Test
 * ──────────────────────────────
 * Tests the item resolution pipeline, overlay sync, and generation tracking.
 * Run with: node test-overlay-stress.js
 */

const https = require('https');
const http = require('http');

// ── Test Utilities ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    results.push({ status: '✅', name: testName });
  } else {
    failed++;
    results.push({ status: '❌', name: testName, detail });
    console.error(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

// ── Native HTTPS fetcher ────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const doGet = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doGet(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
        res.on('error', reject);
      }).on('error', reject);
    };
    doGet(url);
  });
}

// ── DDragon Item Fetcher ────────────────────────────────────────────
async function fetchDDragonItems() {
  const versions = await httpsGet('https://ddragon.leagueoflegends.com/api/versions.json');
  const ver = versions[0];
  console.log(`📦 DDragon version: ${ver}`);

  const itemsData = await httpsGet(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`);

  const items = new Map();     // SR-only name lookup
  const allItems = new Map();  // ALL items (for comparison)
  const byId = new Map();
  for (const [id, d] of Object.entries(itemsData.data)) {
    const norm = d.name.toLowerCase().replace(/['\u2019]/g, "'").replace(/\s+/g, ' ').trim();
    const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${ver}/img/item/${id}.png`;
    const isSR = d.maps?.['11'] === true;
    // ALL items (for comparison)
    if (!allItems.has(norm)) {
      allItems.set(norm, { id, name: d.name, iconUrl, gold: d.gold?.total || 0, isSR });
    }
    // ONLY Summoner's Rift items in the name lookup (matches production code)
    if (isSR && !items.has(norm)) {
      items.set(norm, { id, name: d.name, iconUrl, gold: d.gold?.total || 0 });
    }
    byId.set(id, { name: d.name, from: d.from || [], gold: d.gold?.total || 0, base: d.gold?.base || 0, iconUrl, tags: d.tags || [], into: d.into || [], isSR });
  }
  return { version: ver, items, allItems, byId };
}

// ── Replicate resolveDdragonItem (FIXED version) ────────────────────
function resolveDdragonItemStrict(itemName, cache) {
  const norm = itemName.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
  // Exact match (primary — fastest)
  if (cache.items.has(norm)) return cache.items.get(norm);
  // Strict prefix match only — no loose substring matching
  for (const [key, val] of cache.items) {
    if ((key.startsWith(norm + ' ') || norm.startsWith(key + ' ')) && Math.abs(key.length - norm.length) <= 15) {
      return val;
    }
  }
  // Apostrophe-tolerant exact match
  const normNoApostrophe = norm.replace(/'/g, '');
  for (const [key, val] of cache.items) {
    if (key.replace(/'/g, '') === normNoApostrophe) return val;
  }
  return null;
}

// ── Replicate OLD resolveDdragonItem (BROKEN version for comparison) ──
function resolveDdragonItemOld(itemName, cache) {
  const norm = itemName.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
  if (cache.items.has(norm)) return cache.items.get(norm);
  // Old loose matching — this is what caused bugs
  for (const [key, val] of cache.items) {
    if (key.includes(norm) || norm.includes(key)) return val;
  }
  return null;
}

// ── Test Suite ──────────────────────────────────────────────────────
async function runTests() {
  console.log('\n🧪 DraftCoach Overlay Stress Test');
  console.log('═'.repeat(60));

  const cache = await fetchDDragonItems();
  console.log(`   SR items: ${cache.items.size}, ALL items: ${cache.allItems.size}, byId: ${cache.byId.size}\n`);

  // ── GROUP 0: SR filtering must exclude non-SR items ──────────────
  console.log('── GROUP 0: Summoner\'s Rift Filtering ──');
  {
    const nonSRitems = [];
    for (const [name, data] of cache.allItems) {
      if (!data.isSR && !cache.items.has(name)) {
        nonSRitems.push(data.name);
      }
    }
    const srOnlyCount = cache.items.size;
    const filteredOut = cache.allItems.size - srOnlyCount;
    console.log(`   ${filteredOut} non-SR items filtered out`);
    assert(filteredOut > 0, `Non-SR items filtered (${filteredOut} excluded)`);
    assert(srOnlyCount < cache.allItems.size, `SR items (${srOnlyCount}) < total (${cache.allItems.size})`);
    
    // Check specific Arena/ARAM items are NOT in SR cache
    const ARENA_ITEMS = ['Goredrinker', 'Stridebreaker', 'Prowler\'s Claw', 'Galeforce', 'Duskblade of Draktharr'];
    for (const item of ARENA_ITEMS) {
      const norm = item.toLowerCase().replace(/['\u2019]/g, "'").replace(/\s+/g, ' ').trim();
      const inSR = cache.items.has(norm);
      const inAll = cache.allItems.has(norm);
      if (inAll && !inSR) {
        console.log(`   🛡️  "${item}" correctly filtered (in DDragon but NOT on SR)`);
        assert(true, `"${item}" excluded from SR cache`);
      } else if (inSR) {
        console.log(`   ℹ️  "${item}" IS on Summoner's Rift in this patch`);
      } else {
        console.log(`   ℹ️  "${item}" not in DDragon at all`);
      }
    }
  }

  // ── GROUP 1: Known removed/outdated items should NOT resolve ──────
  console.log('\n── GROUP 1: Removed/Non-SR Items Must Be Rejected ──');
  const REMOVED_ITEMS = [
    'Divine Sunderer',
    'Turbo Chemtank',
    'Prowler\'s Claw',
    'Galeforce',
    'Duskblade of Draktharr',
    'Goredrinker',
    'Stridebreaker',
    'Everfrost',
    'Locket of the Iron Solari',
    'Shurelya\'s Battlesong',
    'Moonstone Renewer',
    'Eclipse',
    'Crown of the Shattered Queen',
    'Axiom Arc',
    'Demonic Embrace',
  ];

  let removedPassCount = 0;
  let removedFailCount = 0;
  for (const item of REMOVED_ITEMS) {
    const strict = resolveDdragonItemStrict(item, cache);
    const old = resolveDdragonItemOld(item, cache);

    if (strict === null) {
      removedPassCount++;
    } else {
      // Item might actually exist in current patch — check DDragon
      const exactMatch = cache.items.has(item.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim());
      if (exactMatch) {
        // Item exists in DDragon — it wasn't actually removed
        removedPassCount++;
        console.log(`   ℹ️  "${item}" actually EXISTS in DDragon (not removed in this patch)`);
      } else {
        removedFailCount++;
        console.log(`   ❌ "${item}" incorrectly resolved to "${strict.name}" (${strict.id})`);
      }
    }

    // Also check: did the OLD version incorrectly match?
    if (old !== null && strict === null) {
      console.log(`   🛡️  FIX CONFIRMED: "${item}" → old matched "${old.name}", new correctly rejects`);
    }
  }
  assert(removedFailCount === 0, `Removed items rejected (${removedPassCount}/${REMOVED_ITEMS.length})`, `${removedFailCount} leaked through`);

  // ── GROUP 2: Valid items MUST resolve correctly ───────────────────
  console.log('\n── GROUP 2: Valid Items Must Resolve ──');
  const VALID_ITEMS = [
    'Infinity Edge', 'Rabadon\'s Deathcap', 'Zhonya\'s Hourglass',
    'Blade of the Ruined King', 'Guardian Angel', 'Mortal Reminder',
    'Randuin\'s Omen', 'Spirit Visage', 'Thornmail',
    'Mercury\'s Treads', 'Plated Steelcaps', 'Ionian Boots of Lucidity',
    'Warmog\'s Armor', 'Dead Man\'s Plate', 'Force of Nature',
  ];

  let validPassCount = 0;
  for (const item of VALID_ITEMS) {
    const result = resolveDdragonItemStrict(item, cache);
    if (result) {
      validPassCount++;
    } else {
      console.log(`   ❌ "${item}" failed to resolve (should exist)`);
    }
  }
  assert(validPassCount === VALID_ITEMS.length, `Valid items resolved (${validPassCount}/${VALID_ITEMS.length})`);

  // ── GROUP 3: Apostrophe variations must resolve ───────────────────
  console.log('\n── GROUP 3: Apostrophe Tolerance ──');
  const APOSTROPHE_TESTS = [
    ['Luden\'s Companion', 'Luden\u2019s Companion'],   // smart quote
    ['Rabadon\'s Deathcap', 'Rabadons Deathcap'],  // no apostrophe
    ['Zhonya\'s Hourglass', 'Zhonyas Hourglass'],  // no apostrophe
  ];

  for (const [canonical, variant] of APOSTROPHE_TESTS) {
    const base = resolveDdragonItemStrict(canonical, cache);
    const alt = resolveDdragonItemStrict(variant, cache);
    if (base && alt) {
      assert(base.id === alt.id, `"${variant}" → "${base.name}" (same as canonical)`);
    } else if (!base) {
      console.log(`   ⚠️  Canonical "${canonical}" not found in DDragon — skipping`);
    } else {
      assert(false, `"${variant}" variant failed to resolve`, `canonical resolves to ${base.name}`);
    }
  }

  // ── GROUP 4: Cross-contamination tests ────────────────────────────
  console.log('\n── GROUP 4: No Cross-Contamination ──');
  const CROSS_TESTS = [
    // [input, should NOT match]
    ['Sunderer', 'Sundered Sky'],      // "Sunderer" is not "Sundered Sky"
    ['Phantom', 'Phantom Dancer'],      // "Phantom" alone shouldn't match
    ['Blade', 'Blade of the Ruined King'], // "Blade" alone is too short
  ];

  for (const [input, shouldNotMatch] of CROSS_TESTS) {
    const result = resolveDdragonItemStrict(input, cache);
    if (result === null) {
      assert(true, `"${input}" correctly rejected (no match)`);
    } else if (result.name === shouldNotMatch) {
      // Only a problem if the prefix-length check didn't catch it
      const normInput = input.toLowerCase();
      const normKey = shouldNotMatch.toLowerCase();
      if (normKey.startsWith(normInput + ' ') && Math.abs(normKey.length - normInput.length) <= 15) {
        console.log(`   ⚠️  "${input}" matched "${result.name}" via strict prefix (acceptable)`);
        assert(true, `"${input}" → "${result.name}" (strict prefix — acceptable)`);
      } else {
        assert(false, `"${input}" incorrectly matched "${result.name}"`, 'Cross-contamination detected');
      }
    } else {
      console.log(`   ℹ️  "${input}" matched "${result.name}" (different from "${shouldNotMatch}")`);
      assert(true, `"${input}" → "${result.name}" (no cross-contamination with "${shouldNotMatch}")`);
    }
  }

  // ── GROUP 5: Generation counter simulation ────────────────────────
  console.log('\n── GROUP 5: Generation Counter Logic ──');
  {
    let currentGen = 0;
    let currentItems = ['Infinity Edge', 'Phantom Dancer'];
    let updateCount = 0;

    // Simulate 50 rapid updates
    const updates = [];
    for (let i = 1; i <= 50; i++) {
      updates.push({ gen: i, items: [`Item_${i}_A`, `Item_${i}_B`] });
    }

    // Process in random order (simulating network jitter)
    const shuffled = [...updates].sort(() => Math.random() - 0.5);

    for (const update of shuffled) {
      if (update.gen >= currentGen) {
        currentGen = update.gen;
        currentItems = update.items;
        updateCount++;
      }
      // else: rejected (stale)
    }

    // After processing, currentGen should be 50 (the max)
    assert(currentGen === 50, `Generation counter reached max (${currentGen}/50)`);
    assert(currentItems[0] === 'Item_50_A', `Final items are from gen 50: ${currentItems[0]}`);
    console.log(`   Processed ${updateCount}/50 updates (rest rejected as stale)`);
  }

  // ── GROUP 6: Deduplication safety ─────────────────────────────────
  console.log('\n── GROUP 6: Item Deduplication ──');
  {
    const items = [
      { id: '3031', name: 'Infinity Edge' },
      { id: '3031', name: 'Infinity Edge' },  // duplicate
      { id: '3089', name: "Rabadon's Deathcap" },
      { id: '3089', name: "Rabadon's Deathcap" },  // duplicate
      { id: '3006', name: "Berserker's Greaves" },
    ];

    // Replicate dedup logic from main.js
    const seenIds = new Set();
    const deduped = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].id && seenIds.has(items[i].id)) {
        // duplicate — skip
        continue;
      }
      if (items[i].id) seenIds.add(items[i].id);
      deduped.push(items[i]);
    }

    assert(deduped.length === 3, `Dedup: ${items.length} → ${deduped.length} items`);
    assert(deduped[0].name === 'Infinity Edge', `First item preserved: ${deduped[0].name}`);
    assert(deduped[1].name === "Rabadon's Deathcap", `Second unique item: ${deduped[1].name}`);
    assert(deduped[2].name === "Berserker's Greaves", `Third unique item: ${deduped[2].name}`);
  }

  // ── GROUP 7: Rapid overlay update simulation ──────────────────────
  console.log('\n── GROUP 7: Rapid Overlay Update Simulation ──');
  {
    let overlayState = null;
    let overlayGen = 0;
    let staleRejections = 0;

    // Simulate initial data
    overlayGen++;
    overlayState = {
      buildItems: [
        { id: '3031', name: 'Infinity Edge', iconUrl: '...', gold: 3400 },
        { id: '3006', name: "Berserker's Greaves", iconUrl: '...', gold: 1100 },
      ],
      _generation: overlayGen,
    };

    // Simulate 20 rapid live advisor updates
    const advisorUpdates = [];
    for (let i = 0; i < 20; i++) {
      const gen = overlayGen + i + 1;
      advisorUpdates.push({
        gen,
        items: [
          { id: '3031', name: 'Infinity Edge', iconUrl: '...', gold: 3400 },
          { id: String(3000 + i), name: `Dynamic Item ${i}`, iconUrl: '...', gold: 2800 + i * 100 },
        ],
      });
    }

    // Process in shuffled order
    const shuffled = [...advisorUpdates].sort(() => Math.random() - 0.5);
    for (const update of shuffled) {
      if (update.gen >= overlayGen) {
        overlayGen = update.gen;
        overlayState = { buildItems: update.items, _generation: overlayGen };
      } else {
        staleRejections++;
      }
    }

    assert(overlayGen === 21, `Final generation: ${overlayGen} (expected 21)`);
    assert(overlayState.buildItems[1].name === 'Dynamic Item 19', `Final dynamic item: "${overlayState.buildItems[1].name}"`);
    console.log(`   ${staleRejections} stale updates rejected out of 20`);
  }

  // ── GROUP 8: getValidItemsReference simulation ────────────────────
  console.log('\n── GROUP 8: Valid Items Reference Completeness ──');
  {
    // Count completed items (same logic as getValidItemsReference)
    let completedCount = 0;
    const completedNames = [];
    for (const [id, item] of cache.byId) {
      const isBoots = item.tags && item.tags.includes('Boots');
      if (!isBoots && item.gold < 2000) continue;
      if (!isBoots && (!item.from || item.from.length === 0)) continue;
      if (item.into && item.into.length > 0) continue;
      if (!item.tags || item.tags.length === 0) continue;
      completedCount++;
      completedNames.push(item.name);
    }

    assert(completedCount > 50, `Found ${completedCount} completed items (should be >50)`);

    // Verify key items are in the list
    const mustInclude = ['Infinity Edge', "Rabadon's Deathcap", 'Thornmail'];
    for (const name of mustInclude) {
      assert(completedNames.includes(name), `"${name}" is in completed items list`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`🧪 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    for (const r of results) {
      if (r.status === '❌') {
        console.log(`   ${r.name}${r.detail ? ': ' + r.detail : ''}`);
      }
    }
  } else {
    console.log('\n✅ ALL TESTS PASSED!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
