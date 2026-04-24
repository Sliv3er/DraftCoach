/**
 * Dynamic Pricing Service
 * Fetches real-time pricing from Google's official API
 * and calculates costs based on actual model used.
 */

import https from 'https';

// Cache pricing for 1 hour
let cachedPricing: Map<string, ModelPricing> | null = null;
let pricingCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface ModelPricing {
  model: string;
  displayName: string;
  inputTokens: number;  // price per million tokens
  outputTokens: number; // price per million tokens
  contextWindow: number;
}

export interface UsageRecord {
  id: string;
  userId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

// ── Get current model from environment ──
export function getCurrentModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
}

// ── Get all valid models ──
export function getValidModels(): string[] {
  return [
    'gemini-3-pro-preview',
    'gemini-3.1-pro-preview', 
    'gemini-3-flash-preview',
  ];
}

// ── Fetch real-time pricing from Google ──
export async function fetchModelPricing(model: string): Promise<ModelPricing> {
  const now = Date.now();
  
  // Check cache
  if (cachedPricing && now - pricingCacheTime < CACHE_TTL) {
    const cached = cachedPricing.get(model);
    if (cached) return cached;
  }

  // Default fallback pricing (as of April 2026)
  const fallbackPricing: Record<string, ModelPricing> = {
    'gemini-3.1-pro-preview': {
      model: 'gemini-3.1-pro-preview',
      displayName: 'Gemini 3.1 Pro Preview',
      inputTokens: 1.25,      // $1.25/M input
      outputTokens: 5.00,     // $5.00/M output
      contextWindow: 2000000,
    },
    'gemini-3-pro-preview': {
      model: 'gemini-3-pro-preview',
      displayName: 'Gemini 3 Pro Preview',
      inputTokens: 1.25,
      outputTokens: 5.00,
      contextWindow: 2000000,
    },
    'gemini-3-flash-preview': {
      model: 'gemini-3-flash-preview',
      displayName: 'Gemini 3 Flash Preview',
      inputTokens: 0.075,
      outputTokens: 0.30,
      contextWindow: 1000000,
    },
  };

  // Try to fetch from Google's pricing API
  try {
    const pricing = await fetchGooglePricing();
    cachedPricing = pricing;
    pricingCacheTime = now;
    
    const found = pricing.get(model);
    if (found) return found;
  } catch (e) {
    console.warn('[Billing] Using fallback pricing:', e);
  }

  // Return fallback or default
  return fallbackPricing[model] || fallbackPricing['gemini-3.1-pro-preview'];
}

// ── Fetch all available model pricing ──
export async function fetchAllPricing(): Promise<Map<string, ModelPricing>> {
  const now = Date.now();
  
  if (cachedPricing && now - pricingCacheTime < CACHE_TTL) {
    return cachedPricing;
  }

  try {
    const pricing = await fetchGooglePricing();
    cachedPricing = pricing;
    pricingCacheTime = now;
    return pricing;
  } catch (e) {
    console.warn('[Billing] Failed to fetch pricing, using defaults');
    // Return hardcoded defaults as fallback
    const defaults = new Map<string, ModelPricing>();
    defaults.set('gemini-3.1-pro-preview', {
      model: 'gemini-3.1-pro-preview',
      displayName: 'Gemini 3.1 Pro Preview',
      inputTokens: 1.25,
      outputTokens: 5.00,
      contextWindow: 2000000,
    });
    defaults.set('gemini-3-flash-preview', {
      model: 'gemini-3-flash-preview',
      displayName: 'Gemini 3 Flash Preview',
      inputTokens: 0.075,
      outputTokens: 0.30,
      contextWindow: 1000000,
    });
    return defaults;
  }
}

function fetchGooglePricing(): Promise<Map<string, ModelPricing>> {
  return new Promise((resolve, reject) => {
    // Google's model info API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      reject(new Error('No API key'));
      return;
    }

    const req = https.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const pricing = new Map<string, ModelPricing>();
            
            // Parse Google's response
            if (json.models) {
              for (const m of json.models) {
                const name = m.name?.replace('models/', '');
                if (name && m.versionMetadata) {
                  // Extract pricing from metadata if available
                  pricing.set(name, {
                    model: name,
                    displayName: m.displayName || name,
                    inputTokens: m.priceInfo?.inputTokenPrice || 0,
                    outputTokens: m.priceInfo?.outputTokenPrice || 0,
                    contextWindow: m.contextWindow || 0,
                  });
                }
              }
            }
            
            // If no pricing from API, use our known defaults
            if (pricing.size === 0) {
              const defaults = getDefaultPricing();
              for (const [key, value] of defaults) {
                pricing.set(key, value);
              }
            }
            
            resolve(pricing);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Pricing API timeout'));
    });
  });
}

function getDefaultPricing(): Map<string, ModelPricing> {
  const defaults = new Map<string, ModelPricing>();
  defaults.set('gemini-3.1-pro-preview', {
    model: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro Preview',
    inputTokens: 1.25,
    outputTokens: 5.00,
    contextWindow: 2000000,
  });
  defaults.set('gemini-3-pro-preview', {
    model: 'gemini-3-pro-preview',
    displayName: 'Gemini 3 Pro Preview',
    inputTokens: 1.25,
    outputTokens: 5.00,
    contextWindow: 2000000,
  });
  defaults.set('gemini-3-flash-preview', {
    model: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash Preview',
    inputTokens: 0.075,
    outputTokens: 0.30,
    contextWindow: 1000000,
  });
  return defaults;
}

// ── Calculate cost for a single request ──
export async function calculateRequestCost(
  model: string,
  tokensIn: number,
  tokensOut: number
): Promise<number> {
  const pricing = await fetchModelPricing(model);
  
  const inputCost = (tokensIn / 1_000_000) * pricing.inputTokens;
  const outputCost = (tokensOut / 1_000_000) * pricing.outputTokens;
  
  return inputCost + outputCost;
}