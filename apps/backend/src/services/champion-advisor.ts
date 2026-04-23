
import { fetchDDragonVersion, fetchDDragonData, getItemIconUrl, getRuneIconUrl } from './ddragon';
import ChampionDetail from '../models/ChampionDetail';
import championsKb from '../../../../shared/kb/data/champions.json';
import buildTemplatesKb from '../../../../shared/kb/data/build-templates.json';

type KbRole = 'TOP' | 'JUNGLE' | 'MID' | 'BOT' | 'SUPPORT';

interface KbChampionEntry {
  id: string;
  name: string;
  roles: KbRole[];
  tags: {
    engage: number;
    peel: number;
    frontline: number;
    burst: number;
    sustained: number;
    poke: number;
    healShield: number;
    splitpush: number;
    ccDensity: number;
    mobility: number;
    range: number;
    damageType: 'AD' | 'AP' | 'MIXED' | 'TRUE';
    scalingCurve: 'EARLY' | 'MID' | 'LATE';
    threatWindow: { start: 'EARLY' | 'MID' | 'LATE'; end: 'EARLY' | 'MID' | 'LATE' };
  };
  laneStrengths: Partial<Record<KbRole, { poke: number; allIn: number; sustain: number }>>;
}

interface KbBuildVariant {
  label?: string;
  runes?: {
    primaryTree: string;
    primaryKeystone: string;
    primarySlots: string[];
    secondaryTree: string;
    secondarySlots: string[];
  };
  startingItems?: Array<{ id: string; name: string }>;
  coreItems?: Array<{ id: string; name: string; reason?: string }>;
  bootChoice?: { id: string; name: string };
}

interface KbBuildTemplate {
  championId: string;
  role: KbRole | string;
  variants: Partial<Record<'DAMAGE' | 'SAFETY' | 'UTILITY', KbBuildVariant>>;
}

interface ChampionDetails {
  championId: string;
  winRate: string;
  tier: string;
  pickRate: string;
  roles: Record<string, {
    winRate: string;
    runes: {
      primary: string;
      primaryIcon?: string;
      keystone: string;
      keystoneIcon?: string;
      runes: string[];
      runeIcons?: (string | null)[];
      secondary: string;
      secondaryIcon?: string;
      secondaryRunes: string[];
      secondaryRuneIcons?: (string | null)[];
    };
    items: {
      starting: string[];
      startingIcons?: (string | null)[];
      core: string[];
      coreIcons?: (string | null)[];
      situational: string[];
      situationalIcons?: (string | null)[];
    };
  }>;
  summary: string;
}

const championsData = (championsKb as any).data as Record<string, KbChampionEntry>;
const buildTemplatesData = (buildTemplatesKb as any).data as Record<string, KbBuildTemplate>;

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTierFromWinRate(winRate: number): string {
  if (winRate >= 53) return 'S+';
  if (winRate >= 51.5) return 'S';
  if (winRate >= 50) return 'A';
  if (winRate >= 48.5) return 'B';
  return 'C';
}

function resolveChampionEntry(championId: string): KbChampionEntry | null {
  if (championsData[championId]) return championsData[championId];

  const normalized = championId.toLowerCase();
  const found = Object.values(championsData).find((entry) => entry.id.toLowerCase() === normalized);
  return found || null;
}

function resolveBuildTemplate(championId: string, role: KbRole): KbBuildTemplate | null {
  const byRoleKey = `${championId}_${role}`;
  if (buildTemplatesData[byRoleKey]) return buildTemplatesData[byRoleKey];

  const direct = buildTemplatesData[championId];
  if (direct?.championId?.toLowerCase() === championId.toLowerCase() && direct.role === role) {
    return direct;
  }

  const found = Object.values(buildTemplatesData).find(
    (entry) => entry.championId.toLowerCase() === championId.toLowerCase() && entry.role === role
  );
  return found || null;
}

function buildRolePayload(championId: string, role: KbRole, damageType: KbChampionEntry['tags']['damageType']) {
  const template = resolveBuildTemplate(championId, role);
  const variant = template?.variants.DAMAGE || template?.variants.SAFETY || template?.variants.UTILITY;

  const fallbackRunes = damageType === 'AP'
    ? {
        primary: 'Sorcery',
        keystone: 'Arcane Comet',
        runes: ['Manaflow Band', 'Transcendence', 'Scorch'],
        secondary: 'Inspiration',
        secondaryRunes: ['Magical Footwear', 'Cosmic Insight']
      }
    : {
        primary: 'Precision',
        keystone: 'Conqueror',
        runes: ['Triumph', 'Legend: Alacrity', 'Last Stand'],
        secondary: 'Resolve',
        secondaryRunes: ['Second Wind', 'Overgrowth']
      };

  const runePayload = variant?.runes
    ? {
        primary: variant.runes.primaryTree,
        keystone: variant.runes.primaryKeystone,
        runes: variant.runes.primarySlots,
        secondary: variant.runes.secondaryTree,
        secondaryRunes: variant.runes.secondarySlots,
      }
    : fallbackRunes;

  const starting = variant?.startingItems?.map((item) => item.name) || ["Health Potion"];
  const templateCore = variant?.coreItems?.map((item) => item.name) || [];
  const withBoot = variant?.bootChoice?.name ? [...templateCore, variant.bootChoice.name] : templateCore;
  const core = withBoot.slice(0, 3);
  const situational = withBoot.slice(3, 6);

  const fallbackItems = damageType === 'AP'
    ? ['Sorcerer\'s Shoes', 'Luden\'s Companion', 'Zhonya\'s Hourglass']
    : ['Plated Steelcaps', 'Trinity Force', 'Sterak\'s Gage'];

  return {
    runes: runePayload,
    items: {
      starting,
      core: core.length > 0 ? core : fallbackItems,
      situational: situational.length > 0 ? situational : ['Guardian Angel', 'Maw of Malmortius', 'Randuin\'s Omen']
    }
  };
}

function buildChampionDetailsFromKB(championId: string): ChampionDetails {
  const championEntry = resolveChampionEntry(championId);
  if (!championEntry) {
    throw new Error(`Champion not found in KB: ${championId}`);
  }

  const rolesPayload: ChampionDetails['roles'] = {};
  const roleWinRates: number[] = [];

  for (const role of championEntry.roles) {
    const lane = championEntry.laneStrengths[role] || { poke: 35, allIn: 50, sustain: 30 };
    const tags = championEntry.tags;

    const roleScore =
      tags.burst * 0.18 +
      tags.sustained * 0.16 +
      tags.frontline * 0.12 +
      tags.mobility * 0.12 +
      tags.ccDensity * 8 +
      lane.poke * 0.12 +
      lane.allIn * 0.18 +
      lane.sustain * 0.12;

    const roleWinRate = clamp(46 + roleScore / 22, 47.2, 54.6);
    roleWinRates.push(roleWinRate);

    rolesPayload[role] = {
      winRate: fmtPct(roleWinRate),
      ...buildRolePayload(championEntry.id, role, championEntry.tags.damageType),
    };
  }

  const avgWinRate = roleWinRates.length
    ? roleWinRates.reduce((sum, wr) => sum + wr, 0) / roleWinRates.length
    : 49.5;
  const tier = getTierFromWinRate(avgWinRate);
  const pickRate = clamp(2.8 + championEntry.roles.length * 1.4 + championEntry.tags.mobility * 0.03, 3.1, 12.8);

  return {
    championId: championEntry.id,
    winRate: fmtPct(avgWinRate),
    tier,
    pickRate: fmtPct(pickRate),
    roles: rolesPayload,
    summary: `${championEntry.name} trends ${tier} on patch ${championsKb.meta.patch}. Strongest traits: ${championEntry.tags.damageType} damage profile, ${championEntry.tags.scalingCurve.toLowerCase()}-game scaling, and ${championEntry.tags.threatWindow.start.toLowerCase()} to ${championEntry.tags.threatWindow.end.toLowerCase()} impact window.`
  };
}

export async function getChampionDetails(championId: string) {
  const livePatch = await fetchDDragonVersion();
  const patchDisplay = livePatch.split('.').slice(0, 2).join('.');

  // 1. Check Cache first
  try {
    const cached = await ChampionDetail.findOne({ 
      championId: { $regex: new RegExp(`^${championId}$`, 'i') }, 
      patch: patchDisplay 
    });
    
    if (cached) {
      console.log(`[ChampionAdvisor] Cache hit for ${championId} on patch ${patchDisplay}`);
      // Even if cached, we might want to ensure icons are there if we just updated the logic
      // But for now, we'll just return it.
      return cached;
    }
  } catch (err) {
    console.error('[ChampionAdvisor] Cache lookup failed:', err);
  }

  // 2. If not cached, build from local KB files (no scraping)
  console.log(`[ChampionAdvisor] Cache miss for ${championId}. Building intel from KB for patch ${patchDisplay}...`);
  const data = buildChampionDetailsFromKB(championId);

  // 3. Enrich with DDragon Icons
  try {
    const { items, runes } = await fetchDDragonData(livePatch);
    
    // Create lookup maps
    const itemMap = new Map();
    Object.entries(items).forEach(([id, item]: [string, any]) => {
      itemMap.set(item.name.toLowerCase(), id);
    });

    const runeMap = new Map();
    runes.forEach((tree: any) => {
      runeMap.set(tree.name.toLowerCase(), getRuneIconUrl(tree.icon));
      tree.slots.forEach((slot: any) => {
        slot.runes.forEach((rune: any) => {
          runeMap.set(rune.name.toLowerCase(), getRuneIconUrl(rune.icon));
        });
      });
    });

    // Enrich roles
    for (const role in data.roles) {
      const r = data.roles[role];
      
      // Items
      if (r.items) {
        r.items.startingIcons = r.items.starting.map((name: string) => {
          const id = itemMap.get(name.toLowerCase());
          return id ? getItemIconUrl(livePatch, id) : null;
        });
        r.items.coreIcons = r.items.core.map((name: string) => {
          const id = itemMap.get(name.toLowerCase());
          return id ? getItemIconUrl(livePatch, id) : null;
        });
        r.items.situationalIcons = r.items.situational.map((name: string) => {
          const id = itemMap.get(name.toLowerCase());
          return id ? getItemIconUrl(livePatch, id) : null;
        });
      }

      // Runes
      if (r.runes) {
        r.runes.keystoneIcon = runeMap.get(r.runes.keystone.toLowerCase());
        r.runes.primaryIcon = runeMap.get(r.runes.primary.toLowerCase());
        r.runes.secondaryIcon = runeMap.get(r.runes.secondary.toLowerCase());
        r.runes.runeIcons = r.runes.runes.map((name: string) => runeMap.get(name.toLowerCase()));
        r.runes.secondaryRuneIcons = r.runes.secondaryRunes.map((name: string) => runeMap.get(name.toLowerCase()));
      }
    }
  } catch (err) {
    console.error('[ChampionAdvisor] Enrichment failed:', err);
  }

  // 4. Save to Cache
  try {
    await ChampionDetail.findOneAndUpdate(
      { championId: data.championId, patch: patchDisplay },
      { ...data, patch: patchDisplay, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
    console.log(`[ChampionAdvisor] Cached fresh intel for ${championId}`);
  } catch (err) {
    console.error('[ChampionAdvisor] Failed to save to cache:', err);
  }

  return data;
}

