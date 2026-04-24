/**
 * Billing Server Entry Point
 * 
 * ⚠️  PRIVATE ADMIN-ONLY SERVICE
 * Do NOT expose to public internet without authentication!
 * 
 * Access dashboard at: http://localhost:3211
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import usageRouter from './routes/usage';
import { initBillingDb } from './services/tracker';

const app = express();
const PORT = parseInt(process.env.BILLING_PORT || '3211', 10);

app.use(cors());
app.use(express.json());

// Serve admin dashboard at root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Routes
app.use('/api/billing', usageRouter);

// Health check
app.get('/health', async (_req, res) => {
  try {
    await initBillingDb();
    res.json({ status: 'ok', service: 'billing', mongodb: 'connected' });
  } catch (e: any) {
    res.json({ status: 'ok', service: 'billing', mongodb: 'disconnected' });
  }
});

// Start server
async function start() {
  try {
    await initBillingDb();
    console.log('[Billing] MongoDB initialized');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🔒 Admin Billing Dashboard: http://localhost:${PORT}`);
      console.log(`   API Endpoint: http://localhost:${PORT}/api/billing\n`);
    });
  } catch (e) {
    console.error('[Billing] Failed to start:', e);
    process.exit(1);
  }
}

start();