import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { buildRouter } from './routes/build';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const PORT = parseInt(process.env.BACKEND_PORT || '3210', 10);

app.use(cors());
app.use(express.json());

app.use('/api', buildRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`DraftCoach backend running on http://127.0.0.1:${PORT}`);
});
