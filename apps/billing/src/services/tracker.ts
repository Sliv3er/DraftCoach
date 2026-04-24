/**
 * Usage Tracking Service
 * Uses MongoDB for persistent storage
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { getCurrentModel, calculateRequestCost } from './pricing';

// ── Mongoose Schema ──
interface IApiUsage extends Document {
  userId: string;
  apiProvider: string;
  endpoint: string;
  model?: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  sessionId?: string;
  createdAt: Date;
}

const ApiUsageSchema = new Schema<IApiUsage>({
  userId: { type: String, required: true, index: true },
  apiProvider: { type: String, required: true },
  endpoint: { type: String, required: true },
  model: { type: String },
  tokensIn: { type: Number, default: 0 },
  tokensOut: { type: Number, default: 0 },
  latencyMs: { type: Number, required: true },
  success: { type: Boolean, default: true },
  error: { type: String },
  sessionId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

ApiUsageSchema.index({ userId: 1, createdAt: -1 });
ApiUsageSchema.index({ apiProvider: 1, createdAt: -1 });
ApiUsageSchema.index({ model: 1, createdAt: -1 });

// ── Initialize DB and get model ──
let ApiUsage: Model<IApiUsage>;

export async function initBillingDb(): Promise<void> {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/draftcoach';
  
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      console.log('[Billing] Connected to MongoDB');
    }
    ApiUsage = mongoose.models.ApiUsage || mongoose.model<IApiUsage>('ApiUsage', ApiUsageSchema);
  } catch (err) {
    console.error('[Billing] MongoDB connection error:', err);
    throw err;
  }
}

export interface TrackedCall {
  userId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

// ── Track a single Gemini API call ──
export async function trackGeminiCall(call: TrackedCall): Promise<IApiUsage> {
  // Ensure DB is initialized
  if (!ApiUsage) {
    await initBillingDb();
  }

  const record = new ApiUsage({
    userId: call.userId,
    apiProvider: 'gemini',
    endpoint: `/v1/models/${call.model}:generateContent`,
    model: call.model,
    tokensIn: call.tokensIn,
    tokensOut: call.tokensOut,
    latencyMs: call.latencyMs,
    success: call.success,
    error: call.error,
    createdAt: new Date(),
  });

  const saved = await record.save();
  console.log(`[Billing] Tracked: ${call.model} | ${call.tokensIn} in / ${call.tokensOut} out`);
  
  return saved;
}

// ── Get usage for a specific user ──
export async function getUserUsage(
  userId: string,
  days: number = 30
): Promise<{
  totalCalls: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; cost: number }>;
  daily: Array<{ date: string; calls: number; cost: number }>;
}> {
  if (!ApiUsage) {
    await initBillingDb();
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const results = await ApiUsage.aggregate([
    {
      $match: {
        userId,
        apiProvider: 'gemini',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          model: '$model',
        },
        calls: { $sum: 1 },
        tokensIn: { $sum: '$tokensIn' },
        tokensOut: { $sum: '$tokensOut' },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        byModel: {
          $push: {
            model: '$_id.model',
            calls: '$calls',
            tokensIn: '$tokensIn',
            tokensOut: '$tokensOut',
          },
        },
        totalCalls: { $sum: '$calls' },
        totalTokensIn: { $sum: '$tokensIn' },
        totalTokensOut: { $sum: '$tokensOut' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Calculate costs
  let totalCost = 0;
  const byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; cost: number }> = {};
  const dailyMap: Record<string, { calls: number; cost: number }> = {};

  for (const day of results) {
    let dayCost = 0;
    for (const modelData of day.byModel) {
      const cost = await calculateRequestCost(modelData.model, modelData.tokensIn, modelData.tokensOut);
      
      if (!byModel[modelData.model]) {
        byModel[modelData.model] = { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
      }
      byModel[modelData.model].calls += modelData.calls;
      byModel[modelData.model].tokensIn += modelData.tokensIn;
      byModel[modelData.model].tokensOut += modelData.tokensOut;
      byModel[modelData.model].cost += cost;
      
      dayCost += cost;
    }
    totalCost += dayCost;
    dailyMap[day._id] = { calls: day.totalCalls, cost: dayCost };
  }

  const daily = Object.entries(dailyMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalCalls: results.reduce((sum, d) => sum + d.totalCalls, 0),
    totalTokensIn: results.reduce((sum, d) => sum + d.totalTokensIn, 0),
    totalTokensOut: results.reduce((sum, d) => sum + d.totalTokensOut, 0),
    totalCost,
    byModel,
    daily,
  };
}

// ── Get all users' usage (admin) ──
export async function getAllUsage(
  days: number = 30
): Promise<Array<{
  userId: string;
  totalCalls: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  lastCall: Date;
}>> {
  if (!ApiUsage) {
    await initBillingDb();
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const results = await ApiUsage.aggregate([
    {
      $match: {
        apiProvider: 'gemini',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$userId',
        totalCalls: { $sum: 1 },
        totalTokensIn: { $sum: '$tokensIn' },
        totalTokensOut: { $sum: '$tokensOut' },
        lastCall: { $max: '$createdAt' },
      },
    },
    { $sort: { totalCalls: -1 } },
  ]);

  const users = [];
  for (const r of results) {
    const cost = await calculateRequestCost(
      getCurrentModel(),
      r.totalTokensIn,
      r.totalTokensOut
    );
    users.push({
      userId: r._id,
      totalCalls: r.totalCalls,
      totalTokensIn: r.totalTokensIn,
      totalTokensOut: r.totalTokensOut,
      totalCost: cost,
      lastCall: r.lastCall,
    });
  }

  return users;
}

// ── Get current pricing info ──
export async function getPricingInfo(): Promise<{
  currentModel: string;
  models: Array<{
    model: string;
    displayName: string;
    inputTokens: number;
    outputTokens: number;
    contextWindow: number;
  }>;
}> {
  const currentModel = getCurrentModel();
  const { fetchAllPricing } = await import('./pricing');
  const pricingMap = await fetchAllPricing();
  
  const models: Array<{
    model: string;
    displayName: string;
    inputTokens: number;
    outputTokens: number;
    contextWindow: number;
  }> = [];
  
  for (const [_, pricing] of pricingMap) {
    models.push(pricing);
  }

  return { currentModel, models };
}