import axios from 'axios';
import Player from '../models/Player';
import Match from '../models/Match';
import { indexMatchParticipants } from './discovery';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

// Global Rate Limiter Queue for Riot API
class RiotRateLimiter {
  private queue: Array<{
    fn: () => Promise<any>,
    resolve: (val: any) => void,
    reject: (err: any) => void
  }> = [];
  private processing = false;
  private pauseUntil = 0;
  private minDelay = 60; // Safe gap at 15-18 req/sec

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      if (Date.now() < this.pauseUntil) {
        const ms = this.pauseUntil - Date.now();
        console.warn(`[RateLimiter] Queue Paused. Resuming in ${ms}ms...`);
        await new Promise(r => setTimeout(r, ms));
      }

      const item = this.queue.shift();
      if (item) {
        try {
          const result = await item.fn();
          item.resolve(result);
        } catch (err: any) {
          if (axios.isAxiosError(err) && err.response?.status === 429) {
            const retryAfter = parseInt(err.response.headers['retry-after'] || '2') * 1000 + 500;
            this.pauseUntil = Date.now() + retryAfter;
            // Put it back at the front of the queue
            this.queue.unshift(item);
            console.warn(`[RateLimiter] 429 Block. Paused for ${retryAfter}ms.`);
          } else {
            item.reject(err);
          }
        }
        // Artificial delay to stay well below the 20/sec burst limit
        await new Promise(r => setTimeout(r, this.minDelay));
      }
    }

    this.processing = false;
  }
}

const limiter = new RiotRateLimiter();

// Request dispatcher that passes through the rate limiter
async function riotGet(url: string) {
  return limiter.execute(async () => {
    const key = process.env.RIOT_API_KEY;
    return axios.get(url, { headers: { "X-Riot-Token": key } });
  });
}

export async function getSummoner(region: string, gameName: string, tagLine: string) {
  const routingRegion = getRoutingRegion(region);

  // 1. Check Player Cache
  const cached = await Player.findOne({
    gameName: { $regex: new RegExp(`^${gameName}$`, 'i') },
    tagLine: { $regex: new RegExp(`^${tagLine}$`, 'i') },
    region
  });

  if (cached && (Date.now() - cached.lastUpdated.getTime() < 24 * 60 * 60 * 1000)) {
    console.log(`[Player Cache] Hit: ${gameName}#${tagLine}`);
    return cached;
  }

  // 2. Fetch from Riot
  console.log(`[Player Cache] Miss: ${gameName}#${tagLine}`);
  const accountUrl = `https://${routingRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const accRes = await riotGet(accountUrl);
  const { puuid } = accRes.data;

  const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const sumRes = await riotGet(summonerUrl);

  // 3. Update Cache (Player model)
  const playerData = {
    puuid,
    summonerId: sumRes.data.id,
    gameName: accRes.data.gameName,
    tagLine: accRes.data.tagLine,
    region,
    profileIconId: sumRes.data.profileIconId,
    summonerLevel: sumRes.data.summonerLevel,
    lastUpdated: new Date()
  };

  return await Player.findOneAndUpdate({ puuid }, playerData, { upsert: true, new: true });
}

export async function getSummonerBySummonerId(summonerId: string, region: string) {
  // Bridge function to resolve summonerId (from leaderboard) to PUUID
  // 1. Check local cache first
  const cached = await Player.findOne({ summonerId, region });
  if (cached && cached.puuid && (Date.now() - cached.lastUpdated.getTime() < 24 * 60 * 1000)) {
    console.log(`[Summoner Cache] Hit: ${summonerId} -> ${cached.puuid}`);
    return {
      puuid: cached.puuid,
      id: cached.summonerId,
      profileIconId: cached.profileIconId,
      summonerLevel: cached.summonerLevel
    };
  }

  // 2. Fetch from Riot
  console.log(`[Summoner Cache] Miss: ${summonerId}`);
  const url = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/${summonerId}`;
  const res = await riotGet(url);
  const data = res.data;

  // 3. Update Cache (Partial sync)
  await Player.findOneAndUpdate(
    { puuid: data.puuid },
    {
      summonerId: data.id,
      puuid: data.puuid,
      region,
      lastUpdated: new Date()
    },
    { upsert: true }
  ).catch(err => console.error('[Discovery] Partial player upsert error:', err));

  return data;
}

export async function getMatch(region: string, matchId: string) {
  const routingRegion = getRoutingRegion(region);

  // 1. Check MongoDB Cache
  const cached = await Match.findOne({ matchId, region });
  if (cached) {
    console.log(`[Match] Cache Hit: ${matchId}`);
    return cached.data;
  }

  // 2. Fetch from Riot
  console.log(`[Match] Cache Miss: ${matchId}`);
  const url = `https://${routingRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const res = await riotGet(url);
  const matchData = res.data;

  // 3. Update Cache
  await Match.create({ matchId, region, data: matchData });

  // 4. Auto-Discovery Indexing (Async)
  indexMatchParticipants(matchData, region).catch(err => console.error('[Discovery] match indexing bg error:', err));

  return matchData;
}

export async function getRecentMatchIds(puuid: string, region: string, count: number = 20, start: number = 0) {
  const routingRegion = getRoutingRegion(region);
  const url = `https://${routingRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`;
  const res = await riotGet(url);
  return res.data;
}

export async function getLeagueEntries(puuid: string, region: string) {
  const url = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  const res = await riotGet(url);
  return res.data;
}

export const platformToRegionMap: Record<string, string> = {
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

export function getRoutingRegion(platform: string) {
  return platformToRegionMap[platform.toLowerCase()] || "americas";
}
export const uIRegionToPlatform: Record<string, string> = {
  NA: "na1",
  EUW: "euw1",
  KR: "kr",
  EUNE: "eun1",
  BR: "br1",
  LAN: "la1",
  LAS: "la2",
  OCE: "oc1",
  TR: "tr1",
  RU: "ru",
  JP: "jp1",
  PH: "ph2",
  SG: "sg2",
  TH: "th2",
  TW: "tw2",
  VN: "vn2",
};

export async function getChallengerLeague(region: string) {
  const url = `https://${region}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`;
  const res = await riotGet(url);
  console.log(res.data)
  return res.data;
}

export async function getGrandmasterLeague(region: string) {
  const url = `https://${region}.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5`;
  const res = await riotGet(url);
  return res.data;
}

export async function getMasterLeague(region: string) {
  const url = `https://${region}.api.riotgames.com/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5`;
  const res = await riotGet(url);
  return res.data;
}

export async function getAccountByPuuid(puuid: string, routingRegion: string) {
  // 1. Check Player Cache
  const cached = await Player.findOne({ puuid });
  
  // FIXED: If we have a cached name that is a placeholder (Mark Evans), miss the cache to fetch real from Riot
  const isPlaceholder = cached?.gameName === "Mark Evans";

  if (cached && !isPlaceholder && (Date.now() - cached.lastUpdated.getTime() < 24 * 60 * 60 * 1000)) {
    console.log(`[Account Cache] Hit: ${puuid} -> ${cached.gameName}#${cached.tagLine}`);
    return {
      puuid: cached.puuid,
      gameName: cached.gameName,
      tagLine: cached.tagLine
    };
  }

  // 2. Fetch from Riot
  console.log(`[Account Cache] Miss: ${puuid}${isPlaceholder ? " (Force Refresh for Placeholder)" : ""}`);
  const url = `https://${routingRegion}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`;
  const res = await riotGet(url);
  const { gameName, tagLine } = res.data;

  // 3. Update Player cache for future lookups
  await Player.findOneAndUpdate(
    { puuid },
    { gameName, tagLine, lastUpdated: new Date() },
    { upsert: true }
  ).catch(err => console.error('[Riot Service] Failed to upsert player cache:', err));

  return res.data;
}

export async function getTopChampionMasteries(puuid: string, region: string, count: number = 3) {
  const url = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;
  const res = await riotGet(url);
  return res.data;
}
