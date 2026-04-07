import mongoose, { Schema, Document } from 'mongoose';

export interface ILeaderboardEntry {
  summonerId: string;
  summonerName: string; // Deprecated but from Riot
  leaguePoints: number;
  rank: string;
  wins: number;
  losses: number;
  puuid?: string;
  gameName?: string;
  tagLine?: string;
}

export interface ILeaderboard extends Document {
  region: string;
  tier: string; // CHALLENGER, GRANDMASTER, MASTER
  entries: ILeaderboardEntry[];
  lastUpdated: Date;
}

const LeaderboardSchema: Schema = new Schema({
  region: { type: String, required: true },
  tier: { type: String, required: true },
  entries: { type: Array, default: [] },
  lastUpdated: { type: Date, default: Date.now }
});

// Cache TTL: 1 hour (3600 seconds)
LeaderboardSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 3600 });
LeaderboardSchema.index({ region: 1, tier: 1 }, { unique: true });

export default mongoose.models.Leaderboard || mongoose.model<ILeaderboard>('Leaderboard', LeaderboardSchema);
