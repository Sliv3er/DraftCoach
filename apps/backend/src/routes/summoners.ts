import { Router, Request, Response } from "express";
import axios from "axios";
import { getSummoner, getRecentMatchIds, getLeagueEntries, getTopChampionMasteries, uIRegionToPlatform, getAccountByPuuid, getRoutingRegion } from "../services/riot";

const summonerRouter = Router();

// GET /api/summoner/account/:region/:puuid
summonerRouter.get("/account/:region/:puuid", async (req: Request, res: Response) => {
  try {
    const { region, puuid } = req.params;
    const platformId = uIRegionToPlatform[region.toUpperCase()] || region;
    const routingRegion = getRoutingRegion(platformId);
    
    const account = await getAccountByPuuid(puuid, routingRegion);
    res.json(account);
  } catch (err: any) {
    console.error("[Account Route] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch account info" });
  }
});

// GET /api/summoner/:region/:gameName-:tagLine
summonerRouter.get("/:region/:riotId", async (req: Request, res: Response) => {
  try {
    const { region, riotId } = req.params;
    const [gameName, tagLine] = riotId.split("-");

    const platformId = uIRegionToPlatform[region.toUpperCase()] || region;

    if (!gameName || !tagLine) {
      res.status(400).json({ error: "Invalid Riot ID format (must be gameName-tagLine)" });
      return;
    }

    const summoner = await getSummoner(platformId, gameName, tagLine);
    if (!summoner) {
      res.status(404).json({ error: "Summoner not found" });
      return;
    }

    // Fetch league entries
    const leagues = await getLeagueEntries(summoner.puuid, platformId);

    res.json({ summoner, leagues });
  } catch (err: any) {
    console.error("[Summoner Route] Error details:");
    console.error("Message:", err.message);
    if (err.response) {
      console.error("Riot API Status:", err.response.status);
      console.error("Riot API Data:", err.response.data);
    } else {
      console.error("Error Stack:", err.stack);
    }
    res.status(500).json({ error: "Failed to fetch summoner profile" });
  }
});

// GET /api/summoner/:region/:puuid/matches
summonerRouter.get("/:region/:puuid/matches", async (req: Request, res: Response) => {
  try {
    const { region, puuid } = req.params;
    const platformId = uIRegionToPlatform[region.toUpperCase()] || region;
    const count = parseInt(req.query.count as string) || 20;
    const start = parseInt(req.query.start as string) || 0;

    const matchIds = await getRecentMatchIds(puuid, platformId, count, start);
    res.json({ matchIds });
  } catch (err: any) {
    console.error("[Summoner Matches Route] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch match IDs" });
  }
});

// GET /api/summoner/:region/:puuid/mastery
summonerRouter.get("/:region/:puuid/mastery", async (req: Request, res: Response) => {
  try {
    const { region, puuid } = req.params;
    const platformId = uIRegionToPlatform[region.toUpperCase()] || region;
    const count = parseInt(req.query.count as string) || 3;

    const mastery = await getTopChampionMasteries(puuid, platformId, count);
    res.json(mastery);
  } catch (err: any) {
    console.error("[Summoner Mastery Route] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch champion mastery" });
  }
});

summonerRouter.get("/by-id/:region/:summonerId", async (req, res) => {
  const { region, summonerId } = req.params;
  try {
    const url = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/${summonerId}`;
    const key = process.env.RIOT_API_KEY;
    const response = await axios.get(url, { headers: { "X-Riot-Token": key } });
    res.json(response.data);
  } catch (err) {
    console.error("[Backend] Failed to fetch summoner by ID:", err);
    res.status(500).json({ error: "Failed to fetch summoner by ID" });
  }
});

export default summonerRouter;
