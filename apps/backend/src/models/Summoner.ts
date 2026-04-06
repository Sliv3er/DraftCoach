import mongoose, { Schema, Document } from 'mongoose';

export interface ISummoner extends Document {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId: number;
  summonerLevel: number;
  lastUpdated: Date;
}

const SummonerSchema: Schema = new Schema({
  puuid: { type: String, required: true, unique: true },
  gameName: { type: String, required: true },
  tagLine: { type: String, required: true },
  region: { type: String, required: true },
  profileIconId: { type: Number, required: true },
  summonerLevel: { type: Number, required: true },
  lastUpdated: { type: Date, default: Date.now }
});

// Cache TTL: 24 hours (86400 seconds)
SummonerSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model<ISummoner>('Summoner', SummonerSchema);
