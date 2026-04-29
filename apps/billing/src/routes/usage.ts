/**
 * Billing & Usage API Routes
 */

import { Router, Request, Response } from 'express';
import { trackGeminiCall, getUserUsage, getAllUsage, getPricingInfo } from '../services/tracker';

const router = Router();

// ── Track a Gemini call (called from the Gemini service) ──
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { userId, model, tokensIn, tokensOut, latencyMs, success, error, sessionId } = req.body;
    
    if (!userId || !model) {
      res.status(400).json({ error: 'userId and model required' });
      return;
    }

    const record = await trackGeminiCall({
      userId,
      model,
      tokensIn: tokensIn || 0,
      tokensOut: tokensOut || 0,
      latencyMs: latencyMs || 0,
      success: success !== false,
      error,
      sessionId,
    });

    res.json({ ok: true, id: record._id });
  } catch (e: any) {
    console.error('[Billing] Track error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Get current user's usage ──
router.get('/me', async (req: Request, res: Response) => {
  try {
    // Get user from auth header or session
    const userId = req.headers['x-user-id'] as string || req.query.userId as string || 'anonymous';
    const days = parseInt(req.query.days as string) || 30;

    // Special userId __all__ returns aggregate of ALL users
    if (userId === '__all__') {
      const allUsers = await getAllUsage(days);
      // Aggregate daily data across all users
      const totalCalls = allUsers.reduce((s, u) => s + (u.totalCalls || 0), 0);
      const totalTokensIn = allUsers.reduce((s, u) => s + (u.totalTokensIn || 0), 0);
      const totalTokensOut = allUsers.reduce((s, u) => s + (u.totalTokensOut || 0), 0);
      const totalCost = allUsers.reduce((s, u) => s + (u.totalCost || 0), 0);
      res.json({
        totalCalls,
        totalTokensIn,
        totalTokensOut,
        totalCost,
        byModel: {},
        daily: [],
      });
      return;
    }

    const usage = await getUserUsage(userId, days);
    res.json(usage);
  } catch (e: any) {
    console.error('[Billing] Get usage error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Get all users' usage (admin only) ──
router.get('/admin/all', async (req: Request, res: Response) => {
  try {
    // TODO: Add admin auth check
    const days = parseInt(req.query.days as string) || 30;
    const usage = await getAllUsage(days);
    res.json(usage);
  } catch (e: any) {
    console.error('[Billing] Admin usage error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Get pricing info ──
router.get('/pricing', async (_req: Request, res: Response) => {
  try {
    const info = await getPricingInfo();
    res.json(info);
  } catch (e: any) {
    console.error('[Billing] Pricing error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ──
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;