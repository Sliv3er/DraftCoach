#!/usr/bin/env node
/**
 * sync-mobalytics.cjs — Fetch meta builds from Mobalytics GraphQL API
 *
 * Replaces the old Gemini-based sync-meta-builds.cjs with deterministic,
 * real statistical data from Mobalytics (items, runes, spells, skill order).
 *
 * Usage:  node scripts/sync-mobalytics.cjs [--dry-run] [--champion <slug>]
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ─────────────────────────────────────────────────────────

const MOBALYTICS_GQL = 'https://app.mobalytics.gg/api/lol/graphql/v1/query';
const DDRAGON_BASE   = 'https://ddragon.leagueoflegends.com';
const KB_DIR         = path.resolve(__dirname, '../shared/kb/data');
const ROLES          = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const MIN_WINS       = 400;           // minimum wins to consider a role viable
const BATCH_DELAY_MS = 1200;          // delay between API calls
const KEEP_TYPES     = ['MOST_POPULAR', 'OPTIONAL', 'ALTERNATIVE'];
const TYPE_TO_VARIANT = { MOST_POPULAR: 'DAMAGE', OPTIONAL: 'SAFETY', ALTERNATIVE: 'UTILITY' };

// Stat shard ID → name
const SHARD_MAP = {
  5001: 'Health Scaling', 5002: 'Armor', 5003: 'Magic Resist',
  5005: 'Attack Speed',   5007: 'Ability Haste', 5008: 'Adaptive Force',
  5010: 'Move Speed',     5011: 'Health Scaling',
};

// Summoner spell ID → name
const SPELL_MAP = {
  1: 'Cleanse', 3: 'Exhaust', 4: 'Flash', 6: 'Ghost', 7: 'Heal',
  11: 'Smite', 12: 'Teleport', 14: 'Ignite', 21: 'Barrier', 32: 'Snowball',
};

const SKILL_LETTERS = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };

// Boot item IDs (to separate boots from core items)
const BOOT_IDS = new Set([
  '3005','3006','3009','3013','3020','3047','3111','3117','3158',
]);

// ─── CLI Args ───────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const singleIdx = args.indexOf('--champion');
const SINGLE_CHAMP = singleIdx >= 0 ? args[singleIdx + 1] : null;

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function gqlQuery(query) {
  const res = await fetch(MOBALYTICS_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GQL HTTP ${res.status}`);
  return res.json();
}

// ─── DDragon Data ───────────────────────────────────────────────────

async function fetchDDragon() {
  console.log('[DDragon] Fetching latest version...');
  const vRes = await fetch(`${DDRAGON_BASE}/api/versions.json`);
  const versions = await vRes.json();
  const version = versions[0];
  const patch = version.split('.').slice(0, 2).join('.');
  console.log(`[DDragon] Version: ${version} (patch ${patch})`);

  const [champRes, itemRes, runeRes] = await Promise.all([
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`),
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/item.json`),
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/runesReforged.json`),
  ]);

  const champData = await champRes.json();
  const itemData  = await itemRes.json();
  const runeData  = await runeRes.json();

  // Champion list: DDragon id → { id, name, slug }
  const champions = Object.values(champData.data).map(c => ({
    id: c.id,                          // e.g. "AurelionSol"
    name: c.name,                      // e.g. "Aurelion Sol"
    slug: c.id.toLowerCase(),          // e.g. "aurelionsol"
  }));

  // Item map: riot ID string → name
  const itemMap = {};
  for (const [id, item] of Object.entries(itemData.data)) {
    itemMap[id] = item.name;
  }

  // Perk map: perk ID → { name, treeName }
  // Tree map: tree ID → tree name
  const perkMap = {};
  const treeMap = {};
  for (const tree of runeData) {
    treeMap[tree.id] = tree.name;    // e.g. 8000 → "Precision"
    for (const slot of tree.slots) {
      for (const rune of slot.runes) {
        perkMap[rune.id] = { name: rune.name, tree: tree.name };
      }
    }
  }

  console.log(`[DDragon] ${champions.length} champions, ${Object.keys(itemMap).length} items, ${Object.keys(perkMap).length} perks`);
  return { version, patch, champions, itemMap, perkMap, treeMap };
}

// ─── Mobalytics Query ───────────────────────────────────────────────

const BUILD_FIELDS = `
  id role type name
  stats { wins }
  perks { IDs style subStyle }
  items { type items }
  spells
  skillOrder
`;

async function fetchChampionBuilds(slug) {
  // Query all 5 roles via aliases in ONE request
  const roleQueries = ROLES.map(role =>
    `${role.toLowerCase()}: champion(filters: { slug: "${slug}", role: ${role} }) {
      buildsOptions { options { ${BUILD_FIELDS} } }
    }`
  ).join('\n');

  const query = `{ lol { ${roleQueries} } }`;
  const data = await gqlQuery(query);

  if (!data.data?.lol) return {};

  const result = {};
  for (const role of ROLES) {
    const options = data.data.lol[role.toLowerCase()]?.buildsOptions?.options;
    if (!options || options.length === 0) continue;

    // Filter to the 3 build types we care about
    const kept = options.filter(b => KEEP_TYPES.includes(b.type));
    if (kept.length === 0) continue;

    // Check if the most popular build has enough wins
    const mpBuild = kept.find(b => b.type === 'MOST_POPULAR');
    if (!mpBuild || (mpBuild.stats?.wins || 0) < MIN_WINS) continue;

    result[role] = kept;
  }

  return result;
}

// ─── ID Resolution ──────────────────────────────────────────────────

function resolvePerks(build, dd) {
  const ids = build.perks?.IDs || [];
  if (ids.length < 9) return null;

  const primaryTree   = dd.treeMap[build.perks.style]    || `Unknown(${build.perks.style})`;
  const secondaryTree = dd.treeMap[build.perks.subStyle] || `Unknown(${build.perks.subStyle})`;
  const keystone      = dd.perkMap[ids[0]]?.name         || `Perk(${ids[0]})`;
  const primarySlots  = [ids[1], ids[2], ids[3]].map(id => dd.perkMap[id]?.name || `Perk(${id})`);
  const secondarySlots = [ids[4], ids[5]].map(id => dd.perkMap[id]?.name || `Perk(${id})`);
  const statShards    = [ids[6], ids[7], ids[8]].map(id => SHARD_MAP[id] || `Shard(${id})`);

  return { primaryTree, primaryKeystone: keystone, primarySlots, secondaryTree, secondarySlots, statShards };
}

function resolveItems(build, dd) {
  const groups = {};
  for (const g of (build.items || [])) {
    groups[g.type] = (g.items || []).map(id => ({
      id: String(id),
      name: dd.itemMap[String(id)] || `Item(${id})`,
    }));
  }

  const starting = groups['Starter'] || [];
  const coreRaw  = groups['Core'] || [];
  const fullRaw  = groups['FullBuild'] || [];
  const sitRaw   = groups['Situational'] || [];

  // Separate boots from core
  let bootChoice = null;
  const coreItems = [];
  for (const item of [...coreRaw, ...fullRaw]) {
    if (!bootChoice && BOOT_IDS.has(item.id)) {
      bootChoice = item;
    } else {
      coreItems.push(item);
    }
  }

  return { startingItems: starting, coreItems: coreItems.slice(0, 5), bootChoice, situationalItems: sitRaw };
}

function resolveSpells(build) {
  return (build.spells || []).map(id => SPELL_MAP[id] || `Spell(${id})`);
}

function resolveSkillOrder(build) {
  const order = build.skillOrder || [];
  if (order.length < 3) return null;

  // first3: first 3 levels
  const first3 = order.slice(0, 3).map(s => SKILL_LETTERS[s] || '?');

  // maxOrder: which non-R skill reaches 5 points first
  const counts = { 1: 0, 2: 0, 3: 0 };
  const maxOrder = [];
  for (const s of order) {
    if (s === 4) continue;
    counts[s]++;
    if (counts[s] === 5 && !maxOrder.includes(SKILL_LETTERS[s])) {
      maxOrder.push(SKILL_LETTERS[s]);
    }
  }
  // Fill remaining
  for (const s of [1, 2, 3]) {
    if (!maxOrder.includes(SKILL_LETTERS[s])) maxOrder.push(SKILL_LETTERS[s]);
  }

  return { first3, maxOrder };
}

// ─── Build KB Entry ─────────────────────────────────────────────────

function buildVariant(mobalyticsBuild, dd, label) {
  const runes = resolvePerks(mobalyticsBuild, dd);
  const items = resolveItems(mobalyticsBuild, dd);
  const spells = resolveSpells(mobalyticsBuild);
  const skills = resolveSkillOrder(mobalyticsBuild);

  return {
    label,
    runes: runes ? {
      primaryTree: runes.primaryTree,
      primaryKeystone: runes.primaryKeystone,
      primarySlots: runes.primarySlots,
      secondaryTree: runes.secondaryTree,
      secondarySlots: runes.secondarySlots,
      statShards: runes.statShards,
    } : undefined,
    summonerSpells: spells,
    skillOrder: skills || undefined,
    startingItems: items.startingItems,
    coreItems: items.coreItems,
    bootChoice: items.bootChoice || undefined,
  };
}

// ─── Main Pipeline ──────────────────────────────────────────────────

async function main() {
  console.log('\n========================================');
  console.log('  🎯 DraftCoach Mobalytics Meta Sync');
  console.log('========================================\n');

  const dd = await fetchDDragon();

  const buildTemplates = { meta: {}, data: {} };
  const runeTemplates  = { meta: {}, data: {} };

  const champList = SINGLE_CHAMP
    ? dd.champions.filter(c => c.slug === SINGLE_CHAMP.toLowerCase())
    : dd.champions;

  if (champList.length === 0) {
    console.error(`Champion not found: ${SINGLE_CHAMP}`);
    process.exit(1);
  }

  console.log(`\n[Sync] Processing ${champList.length} champions...\n`);

  let totalRoles = 0;
  let totalBuilds = 0;
  let failedSlugs = [];

  for (let i = 0; i < champList.length; i++) {
    const champ = champList[i];
    const pct = ((i / champList.length) * 100).toFixed(0);
    process.stdout.write(`  [${pct.padStart(3)}%] ${champ.id.padEnd(16)} `);

    let roleBuilds;
    try {
      roleBuilds = await fetchChampionBuilds(champ.slug);
    } catch (err) {
      console.log(`❌ API error: ${err.message}`);
      failedSlugs.push(champ.slug);
      await sleep(BATCH_DELAY_MS);
      continue;
    }

    const viableRoles = Object.keys(roleBuilds);
    if (viableRoles.length === 0) {
      console.log('⚠️  no viable roles');
      await sleep(BATCH_DELAY_MS);
      continue;
    }

    // Sort roles by wins to determine primary role
    viableRoles.sort((a, b) => {
      const wA = roleBuilds[a].find(x => x.type === 'MOST_POPULAR')?.stats?.wins || 0;
      const wB = roleBuilds[b].find(x => x.type === 'MOST_POPULAR')?.stats?.wins || 0;
      return wB - wA;
    });

    const primaryRole = viableRoles[0];
    const roleSummary = viableRoles.map(r => {
      const w = roleBuilds[r].find(x => x.type === 'MOST_POPULAR')?.stats?.wins || 0;
      return `${r}(${w})`;
    }).join(' ');
    console.log(`✅ ${roleSummary}`);

    for (const role of viableRoles) {
      const builds = roleBuilds[role];
      const key = role === primaryRole ? champ.id : `${champ.id}_${role}`;

      const variants = {};
      for (const b of builds) {
        const variantLabel = TYPE_TO_VARIANT[b.type];
        if (!variantLabel) continue;
        variants[variantLabel] = buildVariant(b, dd, variantLabel);
        totalBuilds++;
      }

      buildTemplates.data[key] = {
        championId: champ.id,
        role,
        variants,
      };

      // Also write rune templates
      for (const [vLabel, variant] of Object.entries(variants)) {
        if (!variant.runes) continue;
        const runeKey = `${champ.id}_${role}_${vLabel}`;
        runeTemplates.data[runeKey] = {
          championId: champ.id,
          role,
          label: vLabel,
          ...variant.runes,
        };
      }

      totalRoles++;
    }

    await sleep(BATCH_DELAY_MS);
  }

  // ── Write Meta ──
  const meta = {
    patch: dd.patch,
    source: 'mobalytics-gql',
    generatedAt: new Date().toISOString(),
    buildHash: `moba-${Date.now()}`,
    stats: { champions: champList.length, roles: totalRoles, builds: totalBuilds, failed: failedSlugs.length },
  };
  buildTemplates.meta = meta;
  runeTemplates.meta  = meta;

  // ── Write Files ──
  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would write:');
    console.log(`  build-templates.json: ${Object.keys(buildTemplates.data).length} entries`);
    console.log(`  rune-templates.json:  ${Object.keys(runeTemplates.data).length} entries`);
    console.log('\nSample (first 2 entries):');
    const sample = Object.entries(buildTemplates.data).slice(0, 2);
    console.log(JSON.stringify(Object.fromEntries(sample), null, 2).substring(0, 2000));
  } else {
    const btPath = path.join(KB_DIR, 'build-templates.json');
    const rtPath = path.join(KB_DIR, 'rune-templates.json');
    fs.writeFileSync(btPath, JSON.stringify(buildTemplates, null, 4));
    fs.writeFileSync(rtPath, JSON.stringify(runeTemplates, null, 4));
    console.log(`\n[Write] build-templates.json → ${Object.keys(buildTemplates.data).length} entries`);
    console.log(`[Write] rune-templates.json  → ${Object.keys(runeTemplates.data).length} entries`);
  }

  // ── Summary ──
  console.log('\n========================================');
  console.log('  📊 Sync Summary');
  console.log('========================================');
  console.log(`  Patch:      ${dd.patch}`);
  console.log(`  Champions:  ${champList.length}`);
  console.log(`  Roles:      ${totalRoles}`);
  console.log(`  Builds:     ${totalBuilds}`);
  console.log(`  Failed:     ${failedSlugs.length}${failedSlugs.length ? ' → ' + failedSlugs.join(', ') : ''}`);
  console.log('========================================\n');

  if (failedSlugs.length > 0) {
    console.log('⚠️  Some champions failed. Re-run with --champion <slug> to retry individually.');
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
