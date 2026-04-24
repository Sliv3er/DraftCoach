import mongoose, { Schema, Document } from 'mongoose';

export interface IApiUsage extends Document {
  userId: string;
  apiProvider: 'gemini' | 'ddragon' | 'elasticsearch' | 'riot';
  endpoint: string;
  tokensIn: number;
  tokensOut: number;
  tokensMetadata: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  sessionId?: string;
  createdAt: Date;
}

const ApiUsageSchema = new Schema<IApiUsage>({
  userId: { type: String, required: true, index: true },
  apiProvider: { 
    type: String, 
    required: true, 
    enum: ['gemini', 'ddragon', 'elasticsearch', 'riot'] 
  },
  endpoint: { type: String, required: true },
  tokensIn: { type: Number, default: 0 },
  tokensOut: { type: Number, default: 0 },
  tokensMetadata: { type: Number, default: 0 },
  latencyMs: { type: Number, required: true },
  success: { type: Boolean, default: true },
  error: { type: String },
  sessionId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

// Compound index for efficient queries
ApiUsageSchema.index({ userId: 1, createdAt: -1 });
ApiUsageSchema.index({ apiProvider: 1, createdAt: -1 });

export const ApiUsage = mongoose.model<IApiUsage>('ApiUsage', ApiUsageSchema);

// ── Pricing Constants (as of April 2026) ──
export const PRICING = {
  gemini: {
    // Gemini 2.0 Flash pricing
    inputTokens: 0.075 / 1_000_000,    // $0.075 per 1M input tokens
    outputTokens: 0.30 / 1_000_000,    // $0.30 per 1M output tokens
  },
  ddragon: {
    // Free for non-commercial use
    perCall: 0,
  },
  elasticsearch: {
    // Estimate: $0.05 per 1K requests (cloud pricing varies)
    perCall: 0.00005,
  },
  riot: {
    // Rate limited, estimate cost
    perCall: 0.0001,
  }
};

export function calculateCost(
  provider: 'gemini' | 'ddragon' | 'elasticsearch' | 'riot',
  tokensIn: number = 0,
  tokensOut: number = 0
): number {
  switch (provider) {
    case 'gemini':
      return (tokensIn * PRICING.gemini.inputTokens) + 
             (tokensOut * PRICING.gemini.outputTokens);
    case 'ddragon':
      return PRICING.ddragon.perCall;
    case 'elasticsearch':
      return PRICING.elasticsearch.perCall;
    case 'riot':
      return PRICING.riot.perCall;
    default:
      return 0;
  }
}