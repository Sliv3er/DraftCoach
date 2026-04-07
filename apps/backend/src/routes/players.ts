import { Router } from 'express';
import { indexPlayer, searchPlayers } from '../services/discovery';

const router = Router();

// Search for players (Prefix / Autocomplete)
router.get('/search', async (req, res) => {
  const { q, region } = req.query;
  try {
    const results = await searchPlayers(q as string, region as string);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Index a single player or multiple
router.post('/index', async (req, res) => {
  const { player, players } = req.body;
  try {
    if (player) {
      const result = await indexPlayer(player);
      return res.json(result);
    }
    
    if (players && Array.isArray(players)) {
       // Index all in parallel/batch
       const results = await Promise.all(players.map(p => indexPlayer(p)));
       return res.json(results);
    }
    
    res.status(400).json({ error: 'Missing player or players in request body' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
