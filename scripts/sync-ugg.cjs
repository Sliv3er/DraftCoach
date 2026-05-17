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

const AP_DAMAGE_CHAMPIONS = new Set([
  'Ahri', 'Akali', 'Anivia', 'Annie', 'AurelionSol', 'Aurora', 'Azir', 'Brand', 'Cassiopeia', 'Diana', 'Ekko',
  'Elise', 'Evelynn', 'Fiddlesticks', 'Fizz', 'Galio', 'Gragas', 'Gwen', 'Heimerdinger', 'Hwei',
  'Ivern', 'Karthus', 'Kassadin', 'Katarina', 'Kennen', 'Leblanc', 'LeBlanc', 'Lillia', 'Lissandra',
  'Malzahar', 'Mordekaiser', 'Morgana', 'Neeko', 'Nidalee', 'Orianna', 'Rumble', 'Ryze', 'Seraphine',
  'Singed', 'Swain', 'Sylas', 'Syndra', 'Taliyah', 'Teemo', 'TwistedFate', 'Veigar', 'Velkoz', 'Vex',
  'Viktor', 'Vladimir', 'Xerath', 'Ziggs', 'Zoe', 'Zyra',
]);

const OFF_CLASS_AP_ITEMS = new Set([
  "Zhonya's Hourglass", "Rabadon's Deathcap", 'Shadowflame', 'Malignance', "Luden's Echo",
  'Void Staff', 'Cryptbloom', 'Morellonomicon', "Banshee's Veil", 'Stormsurge', 'Cosmic Drive',
  "Liandry's Torment", "Rylai's Crystal Scepter", "Mejai's Soulstealer",
]);

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
  if (isBoot(item)) return item.gold > 300 && item.id !== '1001';
  return item.gold >= 2000 && item.from?.length > 0 && (!item.into || item.into.length === 0) && item.tags?.length > 0;
}

function itemEntry(id, dd) {
  const item = dd.itemMap[String(id)];
  if (!isCompletedItem(item)) return null;
  return { id: String(id), name: item.name };
}

function itemEntryByName(name, dd) {
  const key = String(name || '').toLowerCase().replace(/[']/g, "'").trim();
  const found = Object.values(dd.itemMap).find(item => String(item.name || '').toLowerCase().replace(/[']/g, "'").trim() === key);
  return found ? itemEntry(found.id, dd) : null;
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
    tags: c.tags || [],
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

function optionGroups(entry) {
  const groups = [];
  for (const key of ['item_options_1', 'item_options_2', 'item_options_3', 'item_options_4']) {
    const group = (entry?.[key] || [])
      .filter(row => row && row.id)
      .sort((a, b) => (b.matches || 0) - (a.matches || 0) || (b.win_rate || 0) - (a.win_rate || 0));
    if (group.length) groups.push(group);
  }
  return groups;
}

function defaultBootChoice(champ, role, dd) {
  const tags = champ?.tags || [];
  const roleUpper = String(role || '').toUpperCase();
  const candidates = roleUpper === 'SUPPORT'
    ? ['Ionian Boots of Lucidity', 'Boots of Swiftness', "Mercury's Treads", 'Plated Steelcaps']
    : roleUpper === 'ADC' || tags.includes('Marksman')
      ? ["Berserker's Greaves", 'Plated Steelcaps', "Mercury's Treads"]
      : tags.includes('Mage')
        ? ["Sorcerer's Shoes", 'Ionian Boots of Lucidity', "Mercury's Treads", 'Plated Steelcaps']
        : tags.includes('Tank')
          ? ['Plated Steelcaps', "Mercury's Treads", 'Boots of Swiftness']
          : ['Plated Steelcaps', "Mercury's Treads", 'Boots of Swiftness', 'Ionian Boots of Lucidity'];
  return candidates.map(name => itemEntryByName(name, dd)).find(Boolean) || null;
}

function safeCompletionCandidates(champ, role) {
  const tags = champ?.tags || [];
  const roleUpper = String(role || '').toUpperCase();
  if (roleUpper === 'SUPPORT' || tags.includes('Support')) {
    return ['Locket of the Iron Solari', 'Redemption', "Knight's Vow", "Mikael's Blessing", 'Trailblazer', 'Dawncore', "Shurelya's Battlesong", 'Ardent Censer', 'Staff of Flowing Water'];
  }
  if (roleUpper === 'ADC' || tags.includes('Marksman')) {
    return ['Infinity Edge', 'Bloodthirster', "Lord Dominik's Regards", 'Guardian Angel', "Runaan's Hurricane", 'Rapid Firecannon', 'Maw of Malmortius'];
  }
  if (tags.includes('Mage')) {
    const mageCore = ["Zhonya's Hourglass", "Banshee's Veil", "Rabadon's Deathcap", 'Void Staff', 'Shadowflame', 'Cosmic Drive', "Liandry's Torment", "Rylai's Crystal Scepter"];
    if (tags.includes('Tank')) {
      return mageCore.concat(["Jak'Sho, The Protean", "Randuin's Omen", 'Force of Nature', 'Spirit Visage', 'Frozen Heart', 'Thornmail', "Dead Man's Plate"]);
    }
    return mageCore;
  }
  if (tags.includes('Tank') && !tags.includes('Fighter')) {
    return ["Jak'Sho, The Protean", "Randuin's Omen", 'Force of Nature', 'Spirit Visage', 'Frozen Heart', 'Thornmail', "Dead Man's Plate"];
  }
  if (tags.includes('Assassin')) {
    return ['Edge of Night', "Serylda's Grudge", 'Guardian Angel', 'Maw of Malmortius', 'Axiom Arc', "Youmuu's Ghostblade"];
  }
  return ['Spear of Shojin', 'Sundered Sky', "Sterak's Gage", "Death's Dance", 'Black Cleaver', 'Maw of Malmortius', 'Guardian Angel', "Randuin's Omen", 'Force of Nature'];
}

function padCoreItems(coreItems, used, champ, role, dd) {
  for (const name of safeCompletionCandidates(champ, role)) {
    if (coreItems.length >= 5) break;
    const item = itemEntryByName(name, dd);
    if (!item || used.has(item.id) || isBoot(dd.itemMap[item.id]) || !itemAllowedForChampion(item, champ)) continue;
    used.add(item.id);
    coreItems.push(item);
  }
}

function itemAllowedForChampion(item, champ) {
  if (!item) return false;
  if (AP_DAMAGE_CHAMPIONS.has(champ?.id) || (champ?.tags || []).includes('Mage')) return true;
  return !OFF_CLASS_AP_ITEMS.has(item.name);
}

function resolveItems(entry, dd, champ, role) {
  const used = new Set();
  let bootChoice = (entry?.rec_core_items?.ids || [])
    .map(id => itemEntry(id, dd))
    .find(item => item && isBoot(dd.itemMap[item.id])) || null;

  if (!bootChoice) {
    bootChoice = (entry?.t3_boots_options || [])
    .map(row => itemEntry(row.id, dd))
    .filter(Boolean)
    .sort((a, b) => (dd.itemMap[b.id]?.gold || 0) - (dd.itemMap[a.id]?.gold || 0))[0];
  }

  if (!bootChoice) bootChoice = defaultBootChoice(champ, role, dd);
  if (bootChoice) used.add(bootChoice.id);

  const coreItems = [];
  for (const id of (entry?.rec_core_items?.ids || [])) {
    const item = itemEntry(id, dd);
    if (!item || used.has(item.id) || isBoot(dd.itemMap[item.id]) || !itemAllowedForChampion(item, champ)) continue;
    used.add(item.id);
    coreItems.push(item);
    if (coreItems.length >= 5) break;
  }

  for (const group of optionGroups(entry)) {
    if (coreItems.length >= 5) break;
    const item = group
      .map(row => itemEntry(row.id, dd))
      .find(candidate => candidate && !used.has(candidate.id) && !isBoot(dd.itemMap[candidate.id]) && itemAllowedForChampion(candidate, champ));
    if (!item) continue;
    used.add(item.id);
    coreItems.push(item);
  }

  if (coreItems.length < 5) {
    const fallbackPool = optionGroups(entry)
      .flat()
      .sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0) || (b.matches || 0) - (a.matches || 0));
    for (const row of fallbackPool) {
      if (coreItems.length >= 5) break;
      const item = itemEntry(row.id, dd);
      if (!item || used.has(item.id) || isBoot(dd.itemMap[item.id]) || !itemAllowedForChampion(item, champ)) continue;
      used.add(item.id);
      coreItems.push(item);
    }
  }
  if (coreItems.length < 5) padCoreItems(coreItems, used, champ, role, dd);

  return { coreItems, bootChoice };
}

function resolveSpells(entry) {
  return (entry?.rec_summoner_spells?.ids || []).map(id => SPELL_MAP[id] || `Spell(${id})`);
}

function buildVariant(entry, dd, label, champ, role) {
  const items = resolveItems(entry, dd, champ, role);
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
    DAMAGE: buildVariant(rec, dd, 'DAMAGE', champ, role),
    SAFETY: buildVariant(safety, dd, 'SAFETY', champ, role),
    UTILITY: buildVariant(utility, dd, 'UTILITY', champ, role),
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
