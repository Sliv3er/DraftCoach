// src/lib/riot.ts

const getHeaders = () => {
  const API_KEY = process.env.RIOT_API_KEY;
  if (!API_KEY) {
    throw new Error("RIOT_API_KEY is not defined in environment variables.");
  }
  return {
    "X-Riot-Token": API_KEY,
  };
};

// Mapping standard regions to API subdomains
const platformToRegionMap: Record<string, string> = {
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  kr: "asia",
  jp1: "asia",
  eun1: "europe",
  euw1: "europe",
  tr1: "europe",
  ru: "europe",
  oc1: "sea",
  ph2: "sea",
  sg2: "sea",
  th2: "sea",
  tw2: "sea",
  vn2: "sea",
};

// UI dropdown region to Riot Platform ID
export const uIRegionToPlatform: Record<string, string> = {
  NA: "na1",
  EUW: "euw1",
  KR: "kr",
  EUNE: "eun1",
};

export const getRoutingRegion = (platform: string) => {
  return platformToRegionMap[platform] || "americas";
};

// --- TYPES ---

export interface Summoner {
  id: string;
  accountId: string;
  puuid: string;
  name?: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
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
  puuid?: string; // Added to support Riot ID migration
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
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
}

export interface Match {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameDuration: number;
    gameMode: string;
    participants: MatchParticipant[];
  };
}

// --- DATA DRAGON & CDrAGON ASSETS ---

export async function getLatestDDragonVersion() {
  const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error('Failed to fetch DDragon versions');
  const versions = await res.json();
  return versions[0];
}

export async function getChampions(version: string): Promise<ChampionMap> {
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error('Failed to fetch champions from DDragon');
  const data = await res.json();
  return data.data;
}

/**
 * Community Dragon (CDragon) Asset Helpers
 * Use these for high-quality, up-to-date icons and splashes.
 */
export const getCDragonChampionIcon = (championId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;

export const getCDragonItemIcon = (itemId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items/${itemId}.png`;

export const getCDragonSplash = (championId: number | string) => 
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/${championId}/${championId}000.png`;

export const getDDragonSplash = (championName: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championName}_0.jpg`;

// --- ACCOUNT & SUMMONER ---

export async function getAccountByRiotId(gameName: string, tagLine: string, routingRegion: string = "americas"): Promise<Account | null> {
  const url = `https://${routingRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 3600 } });
  
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Riot ID Fetch Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getAccountByPuuid(puuid: string, platformId: string): Promise<Account | null> {
  const routingRegion = platformToRegionMap[platformId] || "americas";
  const url = `https://${routingRegion}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 86400 } });
  
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Account by PUUID Fetch Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getSummonerById(summonerId: string, platformId: string): Promise<Summoner | null> {
  const url = `https://${platformId}.api.riotgames.com/lol/summoner/v4/summoners/${summonerId}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 3600 } });
  
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Summoner by ID Fetch Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getSummonerByPuuid(puuid: string, platformId: string): Promise<Summoner | null> {
  const url = `https://${platformId}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 3600 } });
  
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Summoner Fetch Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// --- LEAGUE & RANKINGS ---

export async function getLeagueEntries(puuid: string, platformId: string): Promise<LeagueEntry[]> {
  const url = `https://${platformId}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 300 } });
  
  if (!res.ok) {
    throw new Error(`League Fetch Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getChallengerLeague(platformId: string, queue: string = 'RANKED_SOLO_5x5'): Promise<LeagueList> {
  const url = `https://${platformId}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/${queue}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`Challenger League Fetch Error: ${res.status}`);
  return res.json();
}

// --- CHAMPION MASTERY ---

export async function getTopChampionMasteries(puuid: string, platformId: string, count: number = 5): Promise<ChampionMastery[]> {
  const url = `https://${platformId}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Champion Mastery Fetch Error: ${res.status}`);
  return res.json();
}

// --- MATCHES ---

export async function getRecentMatchIds(puuid: string, routingRegion: string, count: number = 5): Promise<string[]> {
  const url = `https://${routingRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 300 } });
  
  if (!res.ok) {
    throw new Error(`Match IDs Fetch Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getMatchDetails(matchId: string, routingRegion: string): Promise<Match> {
  const url = `https://${routingRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 86400 } });
  
  if (!res.ok) {
    throw new Error(`Match Detail Fetch Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
