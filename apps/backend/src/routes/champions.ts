import { Router, Request, Response } from 'express';
import { getChampionDetails } from '../services/champion-advisor';

export const championsRouter = Router();

championsRouter.get('/:championId', async (req: Request, res: Response) => {
  try {
    const { championId } = req.params;
    const details = await getChampionDetails(championId);
    res.json({ ok: true, details });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
