import { Router, Request, Response } from 'express';
import { BuildRequest, BuildResponse } from '../../../../shared/types';
import { generateBuild } from '../services/gemini';
import { generateLiveAdvice, GameSnapshot } from '../services/live-advisor';
import { getCache, setCache } from '../services/cache';
import { fetchDDragonVersion } from '../services/ddragon';

export const buildRouter = Router();

// All routes in this router are under /api/build/*
buildRouter.get('/version', async (_req: Request, res: Response) => {
  try {
    const version = await fetchDDragonVersion();
    res.json({ version });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

buildRouter.post('/', async (req: Request, res: Response) => {
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

// ── Build Dual (streaming) ─────────────────────────────────────────
buildRouter.post('/build-dual', async (req: Request, res: Response) => {
  try {
    const body = req.body as BuildRequest;
    if (!body.myChampion || !body.role) {
      res.status(400).json({ ok: false, source: 'error', message: 'Missing required fields', canRetry: false } as BuildResponse);
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Get live patch
    let livePatch: string;
    try {
      livePatch = await fetchDDragonVersion();
    } catch {
      livePatch = body.patch || 'unknown';
    }
    const patchKey = livePatch.split('.').slice(0, 2).join('.');

    // Try Pro model first (gemini-3.1-pro-preview)
    const proModel = 'gemini-3.1-pro-preview';
    try {
      const proResult = await generateBuild({ ...body, model: proModel }, false);
      
      // Stream the Pro result
      res.write(`data: ${JSON.stringify({ phase: 'full', chunk: proResult.text, patchUsed: proResult.patchUsed, source: 'grounded', model: proModel })}\n\n`);
      res.write(`data: ${JSON.stringify({ phase: 'full', done: true, fullText: proResult.text, source: 'grounded', model: proModel })}\n\n`);
    } catch (proErr: any) {
      console.error('[build-dual] Pro model failed:', proErr.message);
      res.write(`data: ${JSON.stringify({ phase: 'full', error: proErr.message })}\n\n`);
      
      // Fall back to Flash model
      const flashModel = 'gemini-3-flash-preview-0514';
      try {
        const flashResult = await generateBuild({ ...body, model: flashModel }, true);
        
        // Stream the Flash result
        res.write(`data: ${JSON.stringify({ phase: 'full', chunk: flashResult.text, patchUsed: flashResult.patchUsed, source: 'grounded', model: flashModel })}\n\n`);
        res.write(`data: ${JSON.stringify({ phase: 'full', done: true, fullText: flashResult.text, source: 'grounded', model: flashModel })}\n\n`);
      } catch (flashErr: any) {
        console.error('[build-dual] Flash model also failed:', flashErr.message);
        res.write(`data: ${JSON.stringify({ phase: 'full', error: flashErr.message, done: true })}\n\n`);
      }
    }

    res.end();
  } catch (err: any) {
    console.error('[build-dual] Error:', err.message);
    res.write(`data: ${JSON.stringify({ phase: 'full', error: err.message, done: true })}\n\n`);
    res.end();
  }
});

// ── Live Game Advisor ──────────────────────────────────────────────
buildRouter.post('/live-advice', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const snapshot = req.body as GameSnapshot;
    if (!snapshot.myChampion || !snapshot.players || snapshot.players.length === 0) {
      res.status(400).json({ ok: false, error: 'Invalid game snapshot' });
      return;
    }

    const advice = await generateLiveAdvice(snapshot);
    
    // Track usage (fire-and-forget)
    const userId = req.body.userId || 'anonymous';
    fetch(`http://localhost:3211/api/billing/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        model: 'gemini-3-flash-preview', // Live advice uses Flash for speed
        tokensIn: 800, // Estimated for live advice
        tokensOut: 400,
        latencyMs: Date.now() - startTime,
        success: true,
      }),
    }).catch(() => {});

    res.json({ ok: true, advice });
  } catch (err: any) {
    // Track failed call
    const userId = req.body.userId || 'anonymous';
    fetch(`http://localhost:3211/api/billing/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        model: 'gemini-3-flash-preview', // Live advice uses Flash for speed
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: err.message,
      }),
    }).catch(() => {});

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
