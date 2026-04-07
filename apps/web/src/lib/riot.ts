// src/lib/riot.ts

/**
 * Mapping standard regions to API subdomains.
 * UI dropdown region to Riot Platform ID.
 */
export const uIRegionToPlatform: Record<string, string> = {
  NA: "na1",
  EUW: "euw1",
  KR: "kr",
  EUNE: "eun1",
};

export function getRoutingRegion(platformId: string) {
  const mapping: Record<string, string> = {
    na1: 'americas',
    br1: 'americas',
    la1: 'americas',
    la2: 'americas',
    kr: 'asia',
    jp1: 'asia',
    euw1: 'europe',
    eun1: 'europe',
    tr1: 'europe',
    ru: 'europe',
    oc1: 'sea',
    ph2: 'sea',
    sg2: 'sea',
    th2: 'sea',
    tw2: 'sea',
    vn2: 'sea',
  };
  return mapping[platformId.toLowerCase()] || 'americas';
}

// --- TYPES ---

export interface Summoner {
  id: string;
  accountId: string;
  puuid: string;
  name?: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
  gameName?: string;
  tagLine?: string;
}

export interface Account {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface LeagueEntry {
  leagueId: string;
  summonerId: string;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

export interface LeagueItem {
  summonerId: string;
  summonerName?: string;
  puuid?: string;
  leaguePoints: number;
  rank: string;
  tier: string;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
  queueType?: string;
}

export interface Champion {
  id: string;
  key: string;
  name: string;
  title: string;
  image: {
    full: string;
  };
  tags: string[];
  partype: string;
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
}

export interface ChampionMap {
  [key: string]: Champion;
}

export interface LeagueList {
  leagueId: string;
  entries: LeagueItem[];
  tier: string;
  name: string;
  queue: string;
}

export interface ChampionMastery {
  puuid: string;
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  championPointsSinceLastLevel: number;
  championPointsUntilNextLevel: number;
  chestGranted: boolean;
  tokensEarned: number;
  summonerId: string;
}

export interface MatchParticipant {
  puuid: string;
  summonerName: string;
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  teamPosition: string;
  teamId: number;
  champLevel: number;
  riotIdGameName?: string;
  riotIdTagline?: string;
  perks: {
    statPerks: {
      defense: number;
      flex: number;
      offense: number;
    };
    styles: {
      description: string;
      selections: {
        perk: number;
        var1: number;
        var2: number;
        var3: number;
      }[];
      style: number;
    }[];
  };
}

export interface Match {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameMode: string;
    gameType: string;
    gameVersion: string;
    mapId: number;
    participants: MatchParticipant[];
    queueId: number;
  };
}

export interface Item {
  name: string;
  description: string;
  plaintext: string;
  gold: {
    base: number;
    total: number;
    sell: number;
    purchasable: boolean;
  };
}

export interface ItemMap {
  [key: string]: Item;
}

export interface SpellData {
  id: string;
  name: string;
  description: string;
  image: string;
}

export interface RuneData {
  id: number;
  name: string;
  description: string;
  icon: string;
}

export type SpellMap = Record<string, SpellData>; // spellId -> data
export type RuneMap = Record<number, RuneData>; // perkId -> data

// --- DATA DRAGON & CDrAGON ASSETS ---

export async function getLatestDDragonVersion() {
  const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', { next: { revalidate: 3600 } } as RequestInit & { next: { revalidate: number } });
  if (!res.ok) throw new Error('Failed to fetch DDragon versions');
  const versions = await res.json();
  return versions[0];
}

export async function getChampions(version: string): Promise<ChampionMap> {
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, { next: { revalidate: 86400 } } as RequestInit & { next: { revalidate: number } });
  if (!res.ok) throw new Error('Failed to fetch champions from DDragon');
  const data = await res.json();
  return data.data;
}

export async function getItems(version: string): Promise<ItemMap> {
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`, { next: { revalidate: 86400 } } as RequestInit & { next: { revalidate: number } });
  if (!res.ok) throw new Error('Failed to fetch items from DDragon');
  const data = await res.json();
  return data.data;
}

export async function getSummonerSpellMap(version: string): Promise<SpellMap> {
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`, { next: { revalidate: 86400 } } as RequestInit & { next: { revalidate: number } });
  if (!res.ok) throw new Error('Failed to fetch summoner spells from DDragon');
  const json = await res.json();
  const map: SpellMap = {};
  for (const key in json.data) {
    const spell = json.data[key];
    map[spell.key] = {
      id: spell.key,
      name: spell.name,
      description: spell.description,
      image: spell.image.full
    };
  }
  return map;
}

export async function getRuneMap(version: string): Promise<RuneMap> {
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, { next: { revalidate: 86400 } } as RequestInit & { next: { revalidate: number } });
  if (!res.ok) throw new Error('Failed to fetch runes from DDragon');
  const json = await res.json() as any[];
  const map: RuneMap = {};
  
  const traverse = (items: any[]) => {
    items.forEach(item => {
      if (item.id) {
        map[item.id] = {
          id: item.id,
          name: item.name,
          description: item.longDesc || item.shortDesc || "",
          icon: item.icon
        };
      }
      if (item.slots) {
        item.slots.forEach((s: any) => {
          if (s.runes) {
            s.runes.forEach((rune: any) => {
              if (rune.id) {
                map[rune.id] = {
                  id: rune.id,
                  name: rune.name,
                  description: rune.longDesc || rune.shortDesc || "",
                  icon: rune.icon
                };
              }
            });
          }
        });
      }
    });
  };
  
  traverse(json);
  return map;
}

/**
 * Data Dragon (DDragon) Asset Helpers
 */
export const getDDragonItemIcon = (version: string, itemId: number | string) => 
  `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;

export const getDDragonChampionIcon = (version: string, championName: string) => 
  `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;

export const getDDragonProfileIcon = (version: string, iconId: number | string) => 
  `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;

export const getDDragonSpellIcon = (version: string, filename: string) => 
  `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${filename}`;

export const getDDragonRuneIcon = (iconPath: string) => 
  `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`;

export const getRankEmblem = (tier: string) => {
  const normalizedTier = tier.toLowerCase();
  // Rank emblems are high-fidelity from Community Dragon static assets
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/${normalizedTier}.png`;
};

/**
 * Community Dragon (CDragon) Asset Helpers
 */
export const getCDragonChampionIcon = (championId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;

export const getCDragonItemIcon = (itemId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items/${itemId}.png`;

export const getCDragonRuneIcon = (runeId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/${runeId}.png`;

export const getCDragonSpellIcon = (spellId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-spells/${spellId}.png`;

export const getCDragonProfileIcon = (iconId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;

export const getChampionSplash = (championId: number | string) => {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/uncentered/${championId}/${championId}000.png`;
};

export const getDDragonSplash = (championName: string) => {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championName}_0.jpg`;
};
