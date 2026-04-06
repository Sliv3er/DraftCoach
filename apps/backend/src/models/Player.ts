import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayer extends Document {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  rank: string;
  lp: number;
  lastSeen: Date;
}

const PlayerSchema: Schema = new Schema({
  puuid: { type: String, required: true, unique: true },
  gameName: { type: String, required: true },
  tagLine: { type: String, required: true },
  region: { type: String, required: true },
  rank: { type: String, default: 'Unranked' },
  lp: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now }
});

// Index for unique identity across regions
PlayerSchema.index({ gameName: 1, tagLine: 1, region: 1 }, { unique: true });

export default mongoose.model<IPlayer>('Player', PlayerSchema);
