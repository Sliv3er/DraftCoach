import { Router } from "express";
import { getChallengerLeague, getAccountByPuuid, getRoutingRegion, uIRegionToPlatform, getSummonerBySummonerId } from "../services/riot";
import Leaderboard from "../models/Leaderboard";

const router = Router();

// GET /api/leaderboard/:region - Fetch Challenger league and populate discovery
router.get("/:region", async (req, res) => {
  const { region } = req.params;
  const tier = "CHALLENGER"; // Standard for this endpoint
  const regionKey = region.toUpperCase();
  
  try {
    // 1. Check Cache
    const cached = await Leaderboard.findOne({ region: regionKey, tier });
    
    const markCount = cached?.entries?.filter((e: any) => e.gameName === "Mark Evans").length || 0;
    const needsEnrichment = cached && (!cached.entries[0]?.gameName || markCount > 2);
    
    console.log(`[Leaderboard API] ${regionKey} cache check: marks=${markCount}, needsEnrichment=${needsEnrichment}`);

    if (cached && !needsEnrichment) {
      console.log(`[Leaderboard Cache] Hit: ${regionKey}`);
      return res.json(cached);
    }

    if (needsEnrichment) {
      console.log(`[Leaderboard Cache] Partial/Corrupted Hit: ${regionKey}. Re-fetching...`);
    } else {
      console.log(`[Leaderboard Cache] Miss: ${regionKey}`);
    }
    const platformId = uIRegionToPlatform[regionKey] || "na1";
    const routingRegion = getRoutingRegion(platformId);
    
    const riotLeaderboard = await getChallengerLeague(platformId);
    
    // Enrich with Account details (GameName/TagLine)
    // We only resolve top 20 for the UI to save on API calls
    const sortedEntries = riotLeaderboard.entries
      .sort((a: any, b: any) => b.leaguePoints - a.leaguePoints)
      .slice(0, 20);

    const playersWithNames = await Promise.all(
        sortedEntries.map(async (entry: any) => {
            try {
                // FIXED: Use entry.puuid directly if available from Riot (modern API includes this)
                const puuid = entry.puuid || (await getSummonerBySummonerId(entry.summonerId, platformId)).puuid;
                
                if (!puuid) throw new Error("PUUID missing");

                const account = await getAccountByPuuid(puuid, routingRegion);
                return { 
                  ...entry, 
                  puuid, 
                  gameName: account.gameName,
                  tagLine: account.tagLine
                };
            } catch (err: any) {
                console.warn(`[Leaderboard enrichment] Failed for ${entry.summonerName || entry.summonerId}:`, err.message);
                return { 
                  ...entry, 
                  gameName: entry.summonerName || "Unknown", 
                  tagLine: "Unknown" 
                };
            }
        })
    );
    
    const enrichedLeaderboard = {
        region: regionKey,
        tier,
        name: riotLeaderboard.name,
        entries: playersWithNames,
        lastUpdated: new Date()
    };

    // 3. Update Cache (ttl handled by mongo index)
    await Leaderboard.findOneAndUpdate(
      { region: regionKey, tier },
      enrichedLeaderboard,
      { upsert: true, new: true }
    );
    
    res.json(enrichedLeaderboard);
  } catch (error: any) {
    console.error(`[Leaderboard API] Failed for ${region}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
