import { Router, Request, Response } from "express";
import { getMatch, uIRegionToPlatform } from "../services/riot";

const matchRouter = Router();
export default matchRouter;

// GET /api/match/:region/:matchId
matchRouter.get("/:region/:matchId", async (req: Request, res: Response) => {
  try {
    const { region, matchId } = req.params;
    const platformId = uIRegionToPlatform[region.toUpperCase()] || region;
    const match = await getMatch(platformId, matchId);
    
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    res.json(match);
  } catch (err: any) {
    console.error("[Match Route] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch match details" });
  }
});
