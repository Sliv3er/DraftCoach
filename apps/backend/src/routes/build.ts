import { Router, Request, Response } from 'express';
import { BuildRequest, BuildResponse } from '../../../../shared/types';
import { generateBuild } from '../services/gemini';
import { generateLiveAdvice, GameSnapshot } from '../services/live-advisor';
import { getCache, setCache } from '../services/cache';
import { fetchDDragonVersion } from '../services/ddragon';

export const buildRouter = Router();

buildRouter.get('/version', async (_req: Request, res: Response) => {
  try {
    const version = await fetchDDragonVersion();
    res.json({ version });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

buildRouter.post('/build', async (req: Request, res: Response) => {
  try {
    const body = req.body as BuildRequest;
    if (!body.myChampion || !body.role) {
      res.status(400).json({ ok: false, source: 'error', message: 'Missing required fields', canRetry: false } as BuildResponse);
      return;
    }

    // Use live DDragon patch for cache key (not hardcoded)
    let livePatch: string;
    try {
      livePatch = await fetchDDragonVersion();
    } catch {
      livePatch = body.patch || 'unknown';
    }
    const patchKey = livePatch.split('.').slice(0, 2).join('.');

    const cacheKey = buildCacheKey(body, patchKey);
    const cached = getCache(cacheKey);

    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      res.json({
        ok: true,
        source: 'cache',
        patchDetected: cached.patchDetected,
        text: cached.text,
      } as BuildResponse);
      return;
    }

    // Try AI generation with retries
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await generateBuild(body, false);

        if (result.text.trim() === 'NEED_RETRY') {
          // One more attempt with shorter prompt
          const retry = await generateBuild(body, true);
          if (retry.text.trim() === 'NEED_RETRY') {
            lastError = 'AI returned NEED_RETRY on all attempts';
            break;
          }
          setCache(cacheKey, retry.text, retry.patchUsed);
          res.json({
            ok: true,
            source: 'grounded',
            patchDetected: retry.patchUsed,
            text: retry.text,
          } as BuildResponse);
          return;
        }

        setCache(cacheKey, result.text, result.patchUsed);
        res.json({
          ok: true,
          source: 'grounded',
          patchDetected: result.patchUsed,
          text: result.text,
        } as BuildResponse);
        return;
      } catch (err: any) {
        lastError = err.message || 'Unknown error';
        const isRetryable = err.status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('timeout');
        if (!isRetryable && attempt === 0) break;
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // All attempts failed - return stale cache or error
    if (cached) {
      res.json({
        ok: true,
        source: 'stale-cache',
        patchDetected: cached.patchDetected,
        text: cached.text,
      } as BuildResponse);
      return;
    }

    res.status(500).json({
      ok: false,
      source: 'error',
      message: lastError || 'Failed to generate build',
      canRetry: true,
    } as BuildResponse);
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      source: 'error',
      message: err.message || 'Internal server error',
      canRetry: true,
    } as BuildResponse);
  }
});

// ── Live Game Advisor ──────────────────────────────────────────────
buildRouter.post('/live-advice', async (req: Request, res: Response) => {
  try {
    const snapshot = req.body as GameSnapshot;
    if (!snapshot.myChampion || !snapshot.players || snapshot.players.length === 0) {
      res.status(400).json({ ok: false, error: 'Invalid game snapshot' });
      return;
    }

    const advice = await generateLiveAdvice(snapshot);
    res.json({ ok: true, advice });
  } catch (err: any) {
    console.error('[live-advice] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function buildCacheKey(req: BuildRequest, patchKey: string): string {
  const allies = [...req.allies].sort().join(',');
  const enemies = [...req.enemies].sort().join(',');
  const modelKey = req.model || process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
  return `${patchKey}|${modelKey}|${req.myChampion}|${req.role}|${allies}|${enemies}`;
}
