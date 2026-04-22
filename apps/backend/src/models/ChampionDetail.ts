import mongoose, { Schema, Document } from 'mongoose';

export interface IChampionDetail extends Document {
  championId: string;
  winRate: string;
  tier: string;
  pickRate: string;
  roles: any;
  summary: string;
  patch: string;
  lastUpdated: Date;
}

const ChampionDetailSchema: Schema = new Schema({
  championId: { type: String, required: true, index: true },
  winRate: String,
  tier: String,
  pickRate: String,
  roles: { type: Schema.Types.Mixed },
  summary: String,
  patch: String,
  lastUpdated: { type: Date, default: Date.now }
});

// Primary index for lookup
ChampionDetailSchema.index({ championId: 1, patch: 1 }, { unique: true });

// Optional: Expire after 24 hours to ensure fresh AI insights even if patch doesn't change
ChampionDetailSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model<IChampionDetail>('ChampionDetail', ChampionDetailSchema);
