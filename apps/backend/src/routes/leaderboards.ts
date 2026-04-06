import { Router } from "express";
import { getChallengerLeague, getAccountByPuuid, getRoutingRegion, uIRegionToPlatform } from "../services/riot";

const router = Router();

// GET /api/leaderboard/:region - Fetch Challenger league and populate discovery
router.get("/:region", async (req, res) => {
  const { region } = req.params;
  
  try {
    const platformId = uIRegionToPlatform[region.toUpperCase()] || "na1";
    const routingRegion = getRoutingRegion(platformId);
    
    // Fetch from Riot and cache (or return cached)
    const leaderboard = await getChallengerLeague(platformId);
    
    // Enrich with Account details (GameName/TagLine)
    const playersWithNames = await Promise.all(
        leaderboard.entries
          .sort((a: any, b: any) => b.leaguePoints - a.leaguePoints)
          .slice(0, 20)
          .map(async (entry: any) => {
            try {
                // This will also trigger auto-discovery for top players
                const account = await getAccountByPuuid(entry.summonerId, routingRegion);
                return { ...entry, account };
            } catch (err) {
                return { ...entry, account: null };
            }
          })
    );
    
    res.json({
        ...leaderboard,
        entries: playersWithNames
    });
  } catch (error: any) {
    console.error(`[Leaderboard API] Failed for ${region}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
