#!/usr/bin/env node
/**
 * sync-mobalytics-modes.cjs
 *
 * Fetches non-SR Mobalytics data:
 * - ARAM builds from Mobalytics `gameMode: ARAM`
 * - ARAM Mayhem builds from the ARAM build baseline
 * - ARAM Mayhem augment recommendations from Mobalytics `gameMode: ARENA`
 *   augmented with CommunityDragon augment names/effects.
 *
 * Usage:
 *   node scripts/sync-mobalytics-modes.cjs [--dry-run] [--champion aatrox]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MOBALYTICS_GQL = 'https://app.mobalytics.gg/api/lol/graphql/v1/query';
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const CDRAGON_ARENA = 'https://raw.communitydragon.org/latest/cdragon/arena/en_us.json';
const KB_DIR = path.resolve(__dirname, '../shared/kb/data');
const BATCH_DELAY_MS = 1200;
const KEEP_TYPES = ['MOST_POPULAR', 'OPTIONAL', 'ALTERNATIVE', 'RECOMMENDED'];
const TYPE_TO_VARIANT = {
  MOST_POPULAR: 'DAMAGE',
  RECOMMENDED: 'DAMAGE',
  OPTIONAL: 'SAFETY',
  ALTERNATIVE: 'UTILITY',
};
const MIN_ARAM_WINS = 25;

const SHARD_MAP = {
  5001: 'Health Scaling', 5002: 'Armor', 5003: 'Magic Resist',
  5005: 'Attack Speed', 5007: 'Ability Haste', 5008: 'Adaptive Force',
  5010: 'Move Speed', 5011: 'Health Scaling',
};

const SPELL_MAP = {
  1: 'Cleanse', 3: 'Exhaust', 4: 'Flash', 6: 'Ghost', 7: 'Heal',
  11: 'Smite', 12: 'Teleport', 14: 'Ignite', 21: 'Barrier', 32: 'Snowball',
};

const SKILL_LETTERS = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };
const BOOT_IDS = new Set(['3005', '3006', '3009', '3013', '3020', '3047', '3111', '3117', '3158']);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const singleIdx = args.indexOf('--champion');
const SINGLE_CHAMP = singleIdx >= 0 ? args[singleIdx + 1] : null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripTags(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/@\w+(?:\*\d+)?@/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tierFromRarity(rarity) {
  if (rarity === 2 || rarity === '2') return 'Prismatic';
  if (rarity === 1 || rarity === '1') return 'Gold';
  return 'Silver';
}

async function gqlQuery(query) {
  const res = await fetch(MOBALYTICS_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GQL HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '));
  return data;
}

async function fetchDDragon() {
  const vRes = await fetch(`${DDRAGON_BASE}/api/versions.json`);
  const versions = await vRes.json();
  const version = versions[0];
  const patch = version.split('.').slice(0, 2).join('.');

  const [champRes, itemRes, runeRes] = await Promise.all([
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`),
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/item.json`),
    fetch(`${DDRAGON_BASE}/cdn/${version}/data/en_US/runesReforged.json`),
  ]);

  const champData = await champRes.json();
  const itemData = await itemRes.json();
  const runeData = await runeRes.json();

  const champions = Object.values(champData.data).map(c => ({
    id: c.id,
    name: c.name,
    slug: c.id.toLowerCase(),
  }));

  const itemMap = {};
  for (const [id, item] of Object.entries(itemData.data)) itemMap[id] = item.name;

  const perkMap = {};
  const treeMap = {};
  for (const tree of runeData) {
    treeMap[tree.id] = tree.name;
    for (const slot of tree.slots) {
      for (const rune of slot.runes) perkMap[rune.id] = { name: rune.name, tree: tree.name };
    }
  }

  return { version, patch, champions, itemMap, perkMap, treeMap };
}

async function fetchArenaAugmentMap() {
  const res = await fetch(CDRAGON_ARENA);
  if (!res.ok) throw new Error(`CommunityDragon HTTP ${res.status}`);
  const data = await res.json();
  const byId = new Map();
  for (const aug of data.augments || []) {
    byId.set(Number(aug.id), {
      id: Number(aug.id),
      name: aug.name,
      apiName: aug.apiName,
      tier: tierFromRarity(aug.rarity),
      effect: stripTags(aug.tooltip || aug.desc),
      iconSmall: aug.iconSmall || '',
      iconLarge: aug.iconLarge || '',
    });
  }
  return byId;
}

const BUILD_FIELDS = `
  id role type name
  stats { wins }
  perks { IDs style subStyle }
  items { type items }
  spells
  skillOrder
`;

const ARENA_FIELDS = `
  id role type name
  stats { wins }
  augmentOptions { augments { id pickRate wins matches } }
`;

async function fetchChampionModes(slug) {
  const query = `{
    lol {
      aram: champion(filters: { slug: "${slug}", gameMode: ARAM }) {
        buildsOptions { options { ${BUILD_FIELDS} } }
      }
      arena: champion(filters: { slug: "${slug}", gameMode: ARENA }) {
        buildsOptions { options { ${ARENA_FIELDS} } }
      }
    }
  }`;
  const data = await gqlQuery(query);
  return data.data?.lol || {};
}

function resolvePerks(build, dd) {
  const ids = build.perks?.IDs || [];
  if (ids.length < 9) return null;
  return {
    primaryTree: dd.treeMap[build.perks.style] || `Unknown(${build.perks.style})`,
    primaryKeystone: dd.perkMap[ids[0]]?.name || `Perk(${ids[0]})`,
    primarySlots: [ids[1], ids[2], ids[3]].map(id => dd.perkMap[id]?.name || `Perk(${id})`),
    secondaryTree: dd.treeMap[build.perks.subStyle] || `Unknown(${build.perks.subStyle})`,
    secondarySlots: [ids[4], ids[5]].map(id => dd.perkMap[id]?.name || `Perk(${id})`),
    statShards: [ids[6], ids[7], ids[8]].map(id => SHARD_MAP[id] || `Shard(${id})`),
  };
}

function resolveItems(build, dd) {
  const groups = {};
  for (const g of (build.items || [])) {
    groups[g.type] = (g.items || []).filter(Boolean).map(id => ({
      id: String(id),
      name: dd.itemMap[String(id)] || `Item(${id})`,
    }));
  }

  const startingItems = groups.Starter || [];
  const coreRaw = groups.Core || [];
  const fullRaw = groups.FullBuild || [];
  const situationalItems = groups.Situational || [];

  let bootChoice = null;
  const coreItems = [];
  for (const item of [...coreRaw, ...fullRaw]) {
    if (!bootChoice && BOOT_IDS.has(item.id)) bootChoice = item;
    else coreItems.push(item);
  }

  return { startingItems, coreItems: coreItems.slice(0, 5), bootChoice, situationalItems };
}

function resolveSkillOrder(build) {
  const order = build.skillOrder || [];
  if (order.length < 3) return null;
  const first3 = order.slice(0, 3).map(s => SKILL_LETTERS[s] || '?');
  const counts = { 1: 0, 2: 0, 3: 0 };
  const maxOrder = [];
  for (const s of order) {
    if (s === 4) continue;
    counts[s]++;
    if (counts[s] === 5 && !maxOrder.includes(SKILL_LETTERS[s])) maxOrder.push(SKILL_LETTERS[s]);
  }
  for (const s of [1, 2, 3]) if (!maxOrder.includes(SKILL_LETTERS[s])) maxOrder.push(SKILL_LETTERS[s]);
  return { first3, maxOrder };
}

function buildVariant(mobalyticsBuild, dd, label) {
  const runes = resolvePerks(mobalyticsBuild, dd);
  const items = resolveItems(mobalyticsBuild, dd);
  return {
    label,
    sourceType: mobalyticsBuild.type,
    wins: mobalyticsBuild.stats?.wins || 0,
    runes: runes || undefined,
    summonerSpells: (mobalyticsBuild.spells || []).map(id => SPELL_MAP[id] || `Spell(${id})`),
    skillOrder: resolveSkillOrder(mobalyticsBuild) || undefined,
    startingItems: items.startingItems,
    coreItems: items.coreItems,
    bootChoice: items.bootChoice || undefined,
    situationalItems: items.situationalItems,
  };
}

function selectBuilds(options) {
  const kept = (options || []).filter(b => KEEP_TYPES.includes(b.type));
  const mostPopular = kept.find(b => b.type === 'MOST_POPULAR') || kept.find(b => b.type === 'RECOMMENDED');
  if (!mostPopular || (mostPopular.stats?.wins || 0) < MIN_ARAM_WINS) return [];
  return kept;
}

function resolveAugment(augment, augmentMap) {
  const base = augmentMap.get(Number(augment.id));
  return {
    id: Number(augment.id),
    name: base?.name || `Augment ${augment.id}`,
    tier: base?.tier || 'Unknown',
    effect: base?.effect || '',
    pickRate: Number(augment.pickRate || 0),
    wins: Number(augment.wins || 0),
    matches: Number(augment.matches || 0),
    iconSmall: base?.iconSmall || '',
    iconLarge: base?.iconLarge || '',
  };
}

function buildAugmentTemplate(arenaOptions, augmentMap) {
  const source = (arenaOptions || []).find(o => o.type === 'MOST_POPULAR')
    || (arenaOptions || []).find(o => o.type === 'RECOMMENDED')
    || (arenaOptions || [])[0];
  if (!source?.augmentOptions?.length) return null;

  const byId = new Map();
  const rounds = source.augmentOptions.map((option, index) => {
    const resolved = (option.augments || [])
      .map(aug => resolveAugment(aug, augmentMap))
      .sort((a, b) => (b.pickRate - a.pickRate) || (b.matches - a.matches))
      .slice(0, 12);
    for (const aug of resolved) {
      const existing = byId.get(aug.id) || { ...aug, appearances: 0, bestPickRate: 0, totalMatches: 0, totalWins: 0 };
      existing.appearances++;
      existing.bestPickRate = Math.max(existing.bestPickRate, aug.pickRate);
      existing.totalMatches += aug.matches;
      existing.totalWins += aug.wins;
      byId.set(aug.id, existing);
    }
    return {
      pick: index + 1,
      recommended: resolved,
    };
  });

  const recommended = [...byId.values()]
    .sort((a, b) => (b.appearances - a.appearances) || (b.bestPickRate - a.bestPickRate) || (b.totalMatches - a.totalMatches))
    .slice(0, 16)
    .map(({ appearances, bestPickRate, totalMatches, totalWins, ...rest }) => ({
      ...rest,
      appearances,
      bestPickRate,
      matches: totalMatches,
      wins: totalWins,
    }));

  return { sourceBuildType: source.type, rounds, recommended };
}

async function main() {
  console.log('\n========================================');
  console.log('  DraftCoach Mobalytics Mode Sync');
  console.log('========================================\n');

  const [dd, augmentMap] = await Promise.all([fetchDDragon(), fetchArenaAugmentMap()]);
  const champList = SINGLE_CHAMP
    ? dd.champions.filter(c => c.slug === SINGLE_CHAMP.toLowerCase())
    : dd.champions;

  if (!champList.length) {
    console.error(`Champion not found: ${SINGLE_CHAMP}`);
    process.exit(1);
  }

  const aramBuilds = { meta: {}, data: {} };
  const mayhemBuilds = { meta: {}, data: {} };
  const aramRunes = { meta: {}, data: {} };
  const mayhemRunes = { meta: {}, data: {} };
  const augmentTemplates = { meta: {}, data: {} };

  let aramCount = 0;
  let mayhemCount = 0;
  let augmentCount = 0;
  const failed = [];

  for (let i = 0; i < champList.length; i++) {
    const champ = champList[i];
    const pct = ((i / champList.length) * 100).toFixed(0).padStart(3);
    process.stdout.write(`  [${pct}%] ${champ.id.padEnd(16)} `);

    try {
      const modes = await fetchChampionModes(champ.slug);
      const aramOptions = selectBuilds(modes.aram?.buildsOptions?.options || []);
      const arenaOptions = modes.arena?.buildsOptions?.options || [];

      if (aramOptions.length) {
        const variants = {};
        for (const b of aramOptions) {
          const label = TYPE_TO_VARIANT[b.type];
          if (!label || variants[label]) continue;
          variants[label] = buildVariant(b, dd, label);
        }
        if (Object.keys(variants).length) {
          aramBuilds.data[champ.id] = { championId: champ.id, role: 'ARAM', mode: 'aram', variants };
          mayhemBuilds.data[champ.id] = { championId: champ.id, role: 'ARAM_MAYHEM', mode: 'aram-mayhem', variants };
          for (const [label, variant] of Object.entries(variants)) {
            if (!variant.runes) continue;
            aramRunes.data[`${champ.id}_ARAM_${label}`] = { championId: champ.id, role: 'ARAM', label, ...variant.runes };
            mayhemRunes.data[`${champ.id}_ARAM_MAYHEM_${label}`] = { championId: champ.id, role: 'ARAM_MAYHEM', label, ...variant.runes };
          }
          aramCount++;
          mayhemCount++;
        }
      }

      const augments = buildAugmentTemplate(arenaOptions, augmentMap);
      if (augments) {
        augmentTemplates.data[champ.id] = {
          championId: champ.id,
          mode: 'aram-mayhem',
          ...augments,
        };
        augmentCount++;
      }

      console.log(`ARAM=${aramOptions.length ? 'yes' : 'no'} augments=${augments ? 'yes' : 'no'}`);
    } catch (err) {
      failed.push(champ.slug);
      console.log(`failed: ${err.message}`);
    }

    if (i + 1 < champList.length) await sleep(BATCH_DELAY_MS);
  }

  const masterAugments = [...augmentMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const meta = {
    patch: dd.patch,
    source: 'mobalytics-gql+cdragon',
    generatedAt: new Date().toISOString(),
    buildHash: `moba-modes-${Date.now()}`,
    stats: {
      champions: champList.length,
      aramBuilds: aramCount,
      mayhemBuilds: mayhemCount,
      augmentChampions: augmentCount,
      augmentMasterCount: masterAugments.length,
      failed: failed.length,
    },
  };
  for (const file of [aramBuilds, mayhemBuilds, aramRunes, mayhemRunes, augmentTemplates]) file.meta = meta;

  const master = {
    patch: dd.patch,
    source: 'communitydragon-arena',
    generatedAt: meta.generatedAt,
    augments: masterAugments,
  };

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would write:');
    console.log(`  build-templates-aram.json: ${Object.keys(aramBuilds.data).length}`);
    console.log(`  build-templates-aram-mayhem.json: ${Object.keys(mayhemBuilds.data).length}`);
    console.log(`  augment-templates.json: ${Object.keys(augmentTemplates.data).length}`);
    console.log(JSON.stringify({
      aramSample: Object.entries(aramBuilds.data)[0],
      augmentSample: Object.entries(augmentTemplates.data)[0],
    }, null, 2).slice(0, 3000));
  } else {
    fs.mkdirSync(KB_DIR, { recursive: true });
    fs.writeFileSync(path.join(KB_DIR, 'build-templates-aram.json'), JSON.stringify(aramBuilds, null, 4));
    fs.writeFileSync(path.join(KB_DIR, 'build-templates-aram-mayhem.json'), JSON.stringify(mayhemBuilds, null, 4));
    fs.writeFileSync(path.join(KB_DIR, 'rune-templates-aram.json'), JSON.stringify(aramRunes, null, 4));
    fs.writeFileSync(path.join(KB_DIR, 'rune-templates-aram-mayhem.json'), JSON.stringify(mayhemRunes, null, 4));
    fs.writeFileSync(path.join(KB_DIR, 'augment-templates.json'), JSON.stringify(augmentTemplates, null, 4));
    fs.writeFileSync(path.join(KB_DIR, 'augments-master.json'), JSON.stringify(master, null, 4));
  }

  console.log('\n========================================');
  console.log('  Mode Sync Summary');
  console.log('========================================');
  console.log(`  Patch:             ${dd.patch}`);
  console.log(`  Champions:         ${champList.length}`);
  console.log(`  ARAM builds:       ${aramCount}`);
  console.log(`  Mayhem builds:     ${mayhemCount}`);
  console.log(`  Augment champions: ${augmentCount}`);
  console.log(`  Master augments:   ${masterAugments.length}`);
  console.log(`  Failed:            ${failed.length}${failed.length ? ' -> ' + failed.join(', ') : ''}`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
