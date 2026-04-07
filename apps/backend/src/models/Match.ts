import mongoose, { Schema, Document } from 'mongoose';

export interface IMatch extends Document {
  matchId: string;
  region: string;
  data: any; // Full Riot Match-v5 JSON
  createdAt: Date;
}

const MatchSchema: Schema = new Schema({
  matchId: { type: String, required: true },
  region: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: '30d' } // Auto-delete after 30 days
});

// Compound index for fast lookup
MatchSchema.index({ matchId: 1, region: 1 }, { unique: true });

export default mongoose.model<IMatch>('Match', MatchSchema);
