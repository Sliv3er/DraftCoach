import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { buildRouter } from './routes/build';
import summonersRouter from "./routes/summoners";
import matchesRouter from "./routes/matches";
import leaderboardRouter from "./routes/leaderboards";
import playersRouter from "./routes/players";
import { championsRouter } from './routes/champions';
import { checkAndSyncRagPipeline, getRagStatus } from './services/rag-updater';
import { initElasticsearch } from './services/elasticsearch';
import { initDb } from './services/db';

const app = express();
const PORT = parseInt(process.env.BACKEND_PORT || '3210', 10);

app.use(cors());
app.use(express.json());

// Initialize DB and Elasticsearch
initDb().catch(console.error);
initElasticsearch().catch(console.error);

app.use('/api', buildRouter);
app.use('/api/players', playersRouter);
app.use('/api/summoner', summonersRouter);
app.use('/api/match', matchesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/champions', championsRouter);

// Initialize the local patch architecture — auto-sync on boot
checkAndSyncRagPipeline().catch(console.error);

// ── RAG Status Endpoint — polled by frontend every 3s ──
app.get('/api/rag/status', (_req, res) => {
  const status = getRagStatus();
  res.json(status);
});

// ── RAG Force Sync Endpoint — manual override ──
app.post('/api/rag/sync', async (_req, res) => {
  try {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DraftCoach backend running on http://localhost:${PORT}`);
});
