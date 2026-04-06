import axios from 'axios';
import Summoner from '../models/Summoner';
import Match from '../models/Match';
import { indexMatchParticipants } from './discovery';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

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

export function getRoutingRegion(platform: string) {
  return platformToRegionMap[platform.toLowerCase()] || "americas";
}

// Helper to get axios instance with latest API key
function getRiotRequest() {
  const key = process.env.RIOT_API_KEY;
  if (!key) {
    console.warn("[Riot Service] WARNING: RIOT_API_KEY is not defined in process.env");
  }
  return axios.create({
    headers: { "X-Riot-Token": key }
  });
}

export async function getSummoner(region: string, gameName: string, tagLine: string) {
  const routingRegion = getRoutingRegion(region);
  
  // 1. Check MongoDB Cache
  const cached = await Summoner.findOne({ 
    gameName: { $regex: new RegExp(`^${gameName}$`, 'i') }, 
    tagLine: { $regex: new RegExp(`^${tagLine}$`, 'i') }, 
    region 
  });

  if (cached && (Date.now() - cached.lastUpdated.getTime() < 24 * 60 * 60 * 1000)) {
    console.log(`[Summoner] Cache Hit: ${gameName}#${tagLine}`);
    return cached;
  }

  // 2. Fetch from Riot
  console.log(`[Summoner] Cache Miss: ${gameName}#${tagLine}`);
  const accountUrl = `https://${routingRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const accRes = await getRiotRequest().get(accountUrl);
  const { puuid } = accRes.data;

  const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const sumRes = await getRiotRequest().get(summonerUrl);

  // 3. Update Cache
  const summonerData = {
    puuid,
    gameName: accRes.data.gameName,
    tagLine: accRes.data.tagLine,
    region,
    profileIconId: sumRes.data.profileIconId,
    summonerLevel: sumRes.data.summonerLevel,
    lastUpdated: new Date()
  };

  return await Summoner.findOneAndUpdate({ puuid }, summonerData, { upsert: true, new: true });
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
  const res = await getRiotRequest().get(url);
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
  const res = await getRiotRequest().get(url);
  return res.data;
}

export async function getLeagueEntries(puuid: string, region: string) {
  const url = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  const res = await getRiotRequest().get(url);
  return res.data;
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
  const res = await getRiotRequest().get(url);
  return res.data;
}

export async function getGrandmasterLeague(region: string) {
  const url = `https://${region}.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5`;
  const res = await getRiotRequest().get(url);
  return res.data;
}

export async function getMasterLeague(region: string) {
  const url = `https://${region}.api.riotgames.com/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5`;
  const res = await getRiotRequest().get(url);
  return res.data;
}

export async function getAccountByPuuid(puuid: string, routingRegion: string) {
  const url = `https://${routingRegion}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`;
  const res = await getRiotRequest().get(url);
  return res.data;
}

export async function getTopChampionMasteries(puuid: string, region: string, count: number = 3) {
  const url = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;
  const res = await getRiotRequest().get(url);
  return res.data;
}
