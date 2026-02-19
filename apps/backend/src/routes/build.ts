import { Router, Request, Response } from 'express';
import { BuildRequest, BuildResponse } from '../../../shared/types';
import { generateBuild } from '../services/gemini';
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

    const cacheKey = buildCacheKey(body);
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
          setCache(cacheKey, retry.text, retry.patchDetected);
          res.json({
            ok: true,
            source: 'grounded',
            patchDetected: retry.patchDetected,
            text: retry.text,
          } as BuildResponse);
          return;
        }

        setCache(cacheKey, result.text, result.patchDetected);
        res.json({
          ok: true,
          source: 'grounded',
          patchDetected: result.patchDetected,
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

function buildCacheKey(req: BuildRequest): string {
  const allies = [...req.allies].sort().join(',');
  const enemies = [...req.enemies].sort().join(',');
  return `${req.patch}|${req.myChampion}|${req.role}|${allies}|${enemies}`;
}
