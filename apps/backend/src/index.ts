import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { buildRouter } from './routes/build';
import { checkAndSyncRagPipeline, getRagStatus } from './services/rag-updater';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const PORT = parseInt(process.env.BACKEND_PORT || '3210', 10);

app.use(cors());
app.use(express.json());

// Initialize the local patch architecture — auto-sync on boot
checkAndSyncRagPipeline().catch(console.error);

app.use('/api', buildRouter);

// ── RAG Status Endpoint — polled by frontend every 3s ──
app.get('/api/rag/status', (_req, res) => {
  const status = getRagStatus();
  res.json(status);
});

// ── RAG Force Sync Endpoint — manual override ──
app.post('/api/rag/sync', async (_req, res) => {
  try {
    // Don't await — run in background so the response is instant
    checkAndSyncRagPipeline(true).catch(err => {
      console.error('[RAG] Force sync failed:', err);
    });
    res.json({ ok: true, message: 'RAG sync triggered' });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`DraftCoach backend running on http://127.0.0.1:${PORT}`);
});
