import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export async function initDb() {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/draftcoach';
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[MongoDB] Connected to database.');
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err);
    throw err;
  }
}
