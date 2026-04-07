import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayer extends Document {
  puuid: string;
  summonerId: string; // Riot's internal ID (per region)
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId: number;
  summonerLevel: number;
  rank: string;
  lp: number;
  rankHistory?: {
    season: string;
    tier: string;
    rank: string;
  }[];
  lastUpdated: Date;
}

const PlayerSchema: Schema = new Schema({
  puuid: { type: String, required: true, unique: true },
  summonerId: { type: String, index: true }, // Not globally unique, but unique per region
  gameName: { type: String, required: true },
  tagLine: { type: String, required: true },
  region: { type: String, required: true },
  profileIconId: { type: Number, default: 0 },
  summonerLevel: { type: Number, default: 0 },
  rank: { type: String, default: 'Unranked' },
  lp: { type: Number, default: 0 },
  rankHistory: [{
    season: { type: String, required: true },
    tier: { type: String, required: true },
    rank: { type: String, required: true }
  }],
  lastUpdated: { type: Date, default: Date.now }
});

// Cache TTL: 24 hours (86400 seconds)
PlayerSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 86400 });

// Index for unique identity across regions
PlayerSchema.index({ gameName: 1, tagLine: 1, region: 1 }, { unique: true });

export default mongoose.model<IPlayer>('Player', PlayerSchema);
