"use server";

import { Match, LeagueList, ChampionMastery, Account } from "@/lib/riot";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3210';

export async function getAccountByPuuid(puuid: string, region: string): Promise<Account | null> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/summoner/account/${region}/${puuid}`);
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      console.error('[Action] getAccountByPuuid failed:', err);
      return null;
    }
}

export async function getSummonerById(summonerId: string, region: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/summoner/by-id/${region}/${summonerId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`[Action] getSummonerById failed for ${summonerId}:`, err);
    return null;
  }
}

export async function searchByRiotId(gameName: string, tagLine: string, region: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/summoner/${region}/${gameName}-${tagLine}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Backend error: ${res.statusText}`);
    }
    
    return await res.json();
  } catch (err: any) {
    console.error('[Action] searchByRiotId failed:', err.message);
    throw new Error(err.message);
  }
}

export async function getSummonerFull(region: string, gameName: string, tagLine: string) {
    return searchByRiotId(gameName, tagLine, region);
}

export async function getMatch(region: string, matchId: string): Promise<Match | null> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/match/${region}/${matchId}`);
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      console.error('[Action] getMatch failed:', err);
      return null;
    }
}

export async function getLeaderboard(region: string): Promise<LeagueList | null> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/leaderboard/${region}`);
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      console.error('[Action] getLeaderboard failed:', err);
      return null;
    }
}

export async function getTopMastery(puuid: string, region: string, count: number = 3): Promise<ChampionMastery[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/summoner/${region}/${puuid}/mastery?count=${count}`);
      if (!res.ok) return [];
      return res.json();
    } catch (err) {
      console.error('[Action] getTopMastery failed:', err);
      return [];
    }
}

export async function fetchMoreMatches(
  puuid: string, 
  region: string, 
  start: number, 
  count: number = 10
): Promise<Match[]> {
  try {
    // 1. Get Match IDs from Backend
    const idsRes = await fetch(`${BACKEND_URL}/api/summoner/${region}/${puuid}/matches?start=${start}&count=${count}`);
    if (!idsRes.ok) throw new Error("Failed to fetch match IDs");
    const { matchIds } = await idsRes.json();
    
    if (!matchIds || matchIds.length === 0) return [];

    // 2. Get Match Details (cached in backend)
    const matches = await Promise.all(
        matchIds.map(async (id: string) => {
          return getMatch(region, id);
        })
    );

    return matches.filter((m): m is Match => m !== null);
  } catch (error) {
    console.error("Error fetching more matches:", error);
    return [];
  }
}

export interface SearchResult {
  name: string;
  tag?: string;
  region: string;
  lp: number;
  rank: string;
}

export async function searchElitePlayers(
  query: string,
  region: string
): Promise<SearchResult[]> {
  if (!query || query.length < 1) return [];

  try {
    const localRes = await fetch(`${BACKEND_URL}/api/players/search?q=${encodeURIComponent(query)}&region=${region}`);
    if (!localRes.ok) return [];
    
    const localPlayers = await localRes.json();
    
    return localPlayers.map((p: any) => ({
      name: p.gameName,
      tag: p.tagLine,
      region: p.region,
      rank: p.rank,
      lp: p.lp
    })).slice(0, 5);
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
}
