#!/usr/bin/env node
/**
 * sync-ugg.cjs - Fetch lane-specific meta builds from U.GG.
 *
 * U.GG exposes decoded SSR data on each champion build page. This sync reads
 * the Emerald+ World "recommended" overview for every champion and stores one
 * build per Summoner's Rift role, so DraftCoach has TOP/JUNGLE/MID/ADC/SUPPORT
 * baselines instead of relying on a single champion page.
 *
 * Usage: node scripts/sync-ugg.cjs [--dry-run] [--champion <slug-or-id>]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const UGG_BASE = 'https://u.gg/lol/champions';
const KB_DIR = path.resolve(__dirname, '../shared/kb/data');
const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const ROLE_TO_UGG = {
  TOP: 'world_emerald_plus_top',
  JUNGLE: 'world_emerald_plus_jungle',
  MID: 'world_emerald_plus_mid',
  ADC: 'world_emerald_plus_adc',
  SUPPORT: 'world_emerald_plus_support',
};
const MIN_ROLE_MATCHES = 1;
const BATCH_DELAY_MS = 250;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const SHARD_MAP = {
  5001: 'Health Scaling',
  5002: 'Armor',
  5003: 'Magic Resist',
  5005: 'Attack Speed',
  5007: 'Ability Haste',
  5008: 'Adaptive Force',
  5010: 'Move Speed',
  5011: 'Health Scaling',
};

const SPELL_MAP = {
  1: 'Cleanse',
  3: 'Exhaust',
  4: 'Flash',
  6: 'Ghost',
  7: 'Heal',
  11: 'Smite',
  12: 'Teleport',
  14: 'Ignite',
  21: 'Barrier',
  32: 'Snowball',
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const singleIdx = args.indexOf('--champion');
const SINGLE_CHAMP = singleIdx >= 0 ? String(args[singleIdx + 1] || '').toLowerCase() : '';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uggSlug(champ) {
  const overrides = {
    MonkeyKing: 'wukong',
  };
  return overrides[champ.id] || champ.id.toLowerCase();
}

function itemMaps(itemData) {
  const byId = {};
  for (const [id, item] of Object.entries(itemData.data)) {
    const maps = item.maps || {};
    const nameKey = String(item.name || '').toLowerCase().replace(/[']/g, "'").trim();
    byId[String(id)] = {
      id: String(id),
      name: item.name,
      gold: item.gold?.total || 0,
      from: item.from || [],
      into: item.into || [],
      tags: item.tags || [],
      isSR: maps['11'] !== false,
      purchasable: item.gold?.purchasable !== false,
      hidden: item.hideFromAll === true || item.inStore === false,
      blocked: id === '6701' || nameKey === 'opportunity',
    };
  }
  return byId;
}

function isBoot(item) {
  return item?.tags?.includes('Boots');
}

function isCurrentStoreItem(item) {
  return Boolean(item && item.isSR && item.purchasable && !item.hidden && !item.blocked);
}

function isCompletedItem(item) {
  if (!isCurrentStoreItem(item)) return false;
  if (isBoot(item)) return item.gold > 300 && (!item.into || item.into.length === 0);
  return item.gold >= 2000 && item.from?.length > 0 && (!item.into || item.into.length === 0) && item.tags?.length > 0;
}

function itemEntry(id, dd) {
  const item = dd.itemMap[String(id)];
  if (!isCompletedItem(item)) return null;
  return { id: String(id), name: item.name };
}

function starterEntry(id, dd) {
  const item = dd.itemMap[String(id)];
  if (!isCurrentStoreItem(item)) return null;
  return { id: String(id), name: item.name };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json,text/html,*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchDDragon() {
  console.log('[DDragon] Fetching latest version...');
  const versions = await fetchJson(`${DDRAGON_BASE}/api/versions.json`);
  const version = versions[0];
  const patch = version.split('.').slice(0, 2).join('.');

  const [champData, itemData, runeData] = await Promise.all([
    fetchJson(`${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`),
    fetchJson(`${DDRAGON_BASE}/cdn/${version}/data/en_US/item.json`),
    fetchJson(`${DDRAGON_BASE}/cdn/${version}/data/en_US/runesReforged.json`),
  ]);

  const champions = Object.values(champData.data).map(c => ({
    id: c.id,
    key: String(c.key),
    name: c.name,
    slug: uggSlug(c),
  }));

  const perkMap = {};
  const treeMap = {};
  for (const tree of runeData) {
    treeMap[tree.id] = tree.name;
    for (let slotIndex = 0; slotIndex < (tree.slots || []).length; slotIndex++) {
      const slot = tree.slots[slotIndex];
      for (const rune of slot.runes || []) perkMap[rune.id] = { name: rune.name, tree: tree.name, treeId: tree.id, slotIndex };
    }
  }

  const itemMap = itemMaps(itemData);
  console.log(`[DDragon] ${version}: ${champions.length} champions, ${Object.keys(itemMap).length} items`);
  return { version, patch, champions, itemMap, perkMap, treeMap };
}

function extractSsrData(html) {
  const match = String(html).match(/window\.__SSR_DATA__ = (\{[\s\S]*?\})\s*window\.__APOLLO_STATE__/);
  if (!match) throw new Error('U.GG SSR payload not found');
  return JSON.parse(match[1]);
}

function overviewPayload(ssr, suffix = 'recommended') {
  const key = Object.keys(ssr).find(k => k.startsWith(`overview_emerald_plus_world_${suffix}::`));
  return key ? ssr[key]?.data || null : null;
}

async function fetchChampionOverviews(champ) {
  const html = await fetchText(`${UGG_BASE}/${champ.slug}/build`);
  const ssr = extractSsrData(html);
  return {
    recommended: overviewPayload(ssr, 'recommended'),
    ct: overviewPayload(ssr, 'ct'),
    tank: overviewPayload(ssr, 'tank'),
    ap: overviewPayload(ssr, 'ap'),
    ad: overviewPayload(ssr, 'ad'),
    crit: overviewPayload(ssr, 'crit'),
    lethality: overviewPayload(ssr, 'lethality'),
    onhit: overviewPayload(ssr, 'onhit'),
  };
}

function resolveRunes(entry, dd) {
  const rune = entry?.rec_runes;
  const shards = entry?.stat_shards?.active_shards || [];
  if (!rune?.active_perks?.length || !rune.primary_style || !rune.sub_style) return null;
  const ids = rune.active_perks;
  const primaryIds = ids.filter(id => dd.perkMap[id]?.treeId === rune.primary_style);
  const secondaryIds = ids.filter(id => dd.perkMap[id]?.treeId === rune.sub_style);
  const keystone = primaryIds[0] || ids[0];
  const bySlot = (a, b) => (dd.perkMap[a]?.slotIndex ?? 99) - (dd.perkMap[b]?.slotIndex ?? 99);
  return {
    primaryTree: dd.treeMap[rune.primary_style] || `Tree(${rune.primary_style})`,
    primaryKeystone: dd.perkMap[keystone]?.name || `Perk(${keystone})`,
    primarySlots: primaryIds.filter(id => id !== keystone).sort(bySlot).slice(0, 3).map(id => dd.perkMap[id]?.name || `Perk(${id})`),
    secondaryTree: dd.treeMap[rune.sub_style] || `Tree(${rune.sub_style})`,
    secondarySlots: secondaryIds.sort(bySlot).slice(0, 2).map(id => dd.perkMap[id]?.name || `Perk(${id})`),
    statShards: shards.slice(0, 3).map(id => SHARD_MAP[id] || `Shard(${id})`),
  };
}

function resolveSkillOrder(entry) {
  const first3 = entry?.rec_skill_path?.slots?.slice(0, 3) || [];
  const maxOrder = entry?.rec_skills?.slots || [];
  if (!first3.length && !maxOrder.length) return undefined;
  return {
    first3: first3.length ? first3 : maxOrder.slice(0, 3),
    maxOrder: maxOrder.length ? maxOrder : first3,
  };
}

function resolveStarting(entry, dd) {
  return (entry?.rec_starting_items?.ids || [])
    .map(id => starterEntry(id, dd))
    .filter(Boolean)
    .slice(0, 3);
}

function optionIds(entry) {
  const ids = [];
  for (const key of ['item_options_1', 'item_options_2', 'item_options_3', 'item_options_4']) {
    const best = (entry?.[key] || [])
      .filter(row => row && row.id)
      .sort((a, b) => (b.matches || 0) - (a.matches || 0) || (b.win_rate || 0) - (a.win_rate || 0))[0];
    if (best) ids.push(best.id);
  }
  return ids;
}

function resolveItems(entry, dd) {
  const used = new Set();
  const bootChoice = (entry?.t3_boots_options || [])
    .map(row => itemEntry(row.id, dd))
    .filter(Boolean)
    .sort((a, b) => (dd.itemMap[b.id]?.gold || 0) - (dd.itemMap[a.id]?.gold || 0))[0];

  if (bootChoice) used.add(bootChoice.id);

  const rawIds = [
    ...(entry?.rec_core_items?.ids || []),
    ...optionIds(entry),
  ];
  const coreItems = [];
  for (const id of rawIds) {
    const item = itemEntry(id, dd);
    if (!item || used.has(item.id) || isBoot(dd.itemMap[item.id])) continue;
    used.add(item.id);
    coreItems.push(item);
    if (coreItems.length >= 5) break;
  }

  return { coreItems, bootChoice };
}

function resolveSpells(entry) {
  return (entry?.rec_summoner_spells?.ids || []).map(id => SPELL_MAP[id] || `Spell(${id})`);
}

function buildVariant(entry, dd, label) {
  const items = resolveItems(entry, dd);
  return {
    label,
    sample: {
      matches: entry?.matches || entry?.rec_core_items?.matches || 0,
      winRate: entry?.win_rate || entry?.rec_core_items?.win_rate || null,
    },
    runes: resolveRunes(entry, dd) || undefined,
    summonerSpells: resolveSpells(entry),
    skillOrder: resolveSkillOrder(entry),
    startingItems: resolveStarting(entry, dd),
    coreItems: items.coreItems,
    bootChoice: items.bootChoice,
  };
}

function chooseUtilityOverview(overviews, roleKey) {
  const candidates = ['ad', 'ap', 'crit', 'lethality', 'onhit']
    .map(key => ({ key, entry: overviews[key]?.[roleKey] }))
    .filter(x => x.entry?.rec_core_items?.ids?.length)
    .sort((a, b) => (b.entry.rec_core_items.matches || 0) - (a.entry.rec_core_items.matches || 0));
  return candidates[0]?.entry || null;
}

function buildRoleTemplate(champ, role, overviews, dd) {
  const roleKey = ROLE_TO_UGG[role];
  const rec = overviews.recommended?.[roleKey]
    || overviews.ct?.[roleKey]
    || overviews.ad?.[roleKey]
    || overviews.lethality?.[roleKey]
    || overviews.tank?.[roleKey]
    || overviews.ap?.[roleKey];
  if (!rec || (rec.matches || 0) < MIN_ROLE_MATCHES || !rec.rec_core_items?.ids?.length) return null;

  const tank = overviews.tank?.[roleKey];
  const tankIsCredible = tank?.rec_core_items?.ids?.length
    && (tank.rec_core_items.matches || 0) >= 100
    && (tank.rec_core_items.win_rate || 0) >= Math.max(0, (rec.rec_core_items.win_rate || rec.win_rate || 0) - 3);
  const safety = tankIsCredible ? tank : rec;
  const utility = chooseUtilityOverview(overviews, roleKey) || rec;
  const variants = {
    DAMAGE: buildVariant(rec, dd, 'DAMAGE'),
    SAFETY: buildVariant(safety, dd, 'SAFETY'),
    UTILITY: buildVariant(utility, dd, 'UTILITY'),
  };

  return {
    championId: champ.id,
    role,
    sourceUrl: `${UGG_BASE}/${champ.slug}/build/${role.toLowerCase()}`,
    roleStats: {
      matches: rec.matches || 0,
      wins: rec.wins || 0,
      winRate: rec.win_rate || null,
      lastUpdated: rec.last_updated || null,
    },
    variants,
  };
}

async function main() {
  console.log('\n========================================');
  console.log('  DraftCoach U.GG Meta Sync');
  console.log('========================================\n');

  const dd = await fetchDDragon();
  const champList = SINGLE_CHAMP
    ? dd.champions.filter(c => c.slug === SINGLE_CHAMP || c.id.toLowerCase() === SINGLE_CHAMP || c.key === SINGLE_CHAMP)
    : dd.champions;

  if (!champList.length) throw new Error(`Champion not found: ${SINGLE_CHAMP}`);

  const buildTemplates = { meta: {}, data: {} };
  const runeTemplates = { meta: {}, data: {} };
  let totalRoles = 0;
  let totalBuilds = 0;
  const failed = [];

  for (let i = 0; i < champList.length; i++) {
    const champ = champList[i];
    process.stdout.write(`  [${String(Math.round((i / champList.length) * 100)).padStart(3)}%] ${champ.id.padEnd(16)} `);

    let overviews;
    try {
      overviews = await fetchChampionOverviews(champ);
    } catch (err) {
      console.log(`failed: ${err.message}`);
      failed.push(champ.slug);
      await sleep(BATCH_DELAY_MS);
      continue;
    }

    const roleTemplates = [];
    for (const role of ROLES) {
      const template = buildRoleTemplate(champ, role, overviews, dd);
      if (template) roleTemplates.push(template);
    }

    if (!roleTemplates.length) {
      console.log('no U.GG role payloads');
      await sleep(BATCH_DELAY_MS);
      continue;
    }

    roleTemplates.sort((a, b) => (b.roleStats.matches || 0) - (a.roleStats.matches || 0));
    const primaryRole = roleTemplates[0].role;
    console.log(roleTemplates.map(t => `${t.role}(${t.roleStats.matches})`).join(' '));

    for (const template of roleTemplates) {
      const key = template.role === primaryRole ? champ.id : `${champ.id}_${template.role}`;
      buildTemplates.data[key] = template;
      totalRoles++;
      for (const [label, variant] of Object.entries(template.variants)) {
        totalBuilds++;
        if (!variant.runes) continue;
        runeTemplates.data[`${champ.id}_${template.role}_${label}`] = {
          championId: champ.id,
          role: template.role,
          label,
          ...variant.runes,
        };
      }
    }

    await sleep(BATCH_DELAY_MS);
  }

  const meta = {
    patch: dd.patch,
    source: 'ugg-ssr',
    generatedAt: new Date().toISOString(),
    buildHash: `ugg-${Date.now()}`,
    stats: { champions: champList.length, roles: totalRoles, builds: totalBuilds, failed: failed.length },
  };
  buildTemplates.meta = meta;
  runeTemplates.meta = meta;

  if (DRY_RUN) {
    console.log('\n[DRY RUN]');
    console.log(JSON.stringify(Object.fromEntries(Object.entries(buildTemplates.data).slice(0, 3)), null, 2).slice(0, 3000));
  } else {
    fs.writeFileSync(path.join(KB_DIR, 'build-templates.json'), JSON.stringify(buildTemplates, null, 4));
    fs.writeFileSync(path.join(KB_DIR, 'rune-templates.json'), JSON.stringify(runeTemplates, null, 4));
    console.log(`\n[Write] build-templates.json -> ${Object.keys(buildTemplates.data).length} entries`);
    console.log(`[Write] rune-templates.json  -> ${Object.keys(runeTemplates.data).length} entries`);
  }

  console.log('\n========================================');
  console.log('  Sync Summary');
  console.log('========================================');
  console.log(`  Patch:     ${dd.patch}`);
  console.log(`  Champions: ${champList.length}`);
  console.log(`  Roles:     ${totalRoles}`);
  console.log(`  Builds:    ${totalBuilds}`);
  console.log(`  Failed:    ${failed.length}${failed.length ? ' -> ' + failed.join(', ') : ''}`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
