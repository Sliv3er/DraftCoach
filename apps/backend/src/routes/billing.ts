/**
 * Billing Routes - Proxies to billing service
 */

import { Router, Request, Response } from 'express';

const router = Router();

const BILLING_PORT = process.env.BILLING_PORT || '3211';
const BILLING_HOST = process.env.BILLING_HOST || 'localhost';

// ── Proxy to billing service ──
async function proxyToBilling(req: Request, res: Response, path: string) {
  try {
    const url = `http://${BILLING_HOST}:${BILLING_PORT}${path}`;
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': req.headers['x-user-id'] as string || '',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    console.error('[Billing Proxy] Error:', e.message);
    res.status(500).json({ error: 'Billing service unavailable', message: e.message });
  }
}

// ── Get current user's usage ──
router.get('/me', async (req: Request, res: Response) => {
  const days = req.query.days || 30;
  try {
    const url = `http://${BILLING_HOST}:${BILLING_PORT}/api/billing/me?days=${days}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get all users' usage (admin) ──
router.get('/admin/all', async (req: Request, res: Response) => {
  const days = req.query.days || 30;
  try {
    const url = `http://${BILLING_HOST}:${BILLING_PORT}/api/billing/admin/all?days=${days}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get pricing info ──
router.get('/pricing', async (_req: Request, res: Response) => {
  try {
    const url = `http://${BILLING_HOST}:${BILLING_PORT}/api/billing/pricing`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ──
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;