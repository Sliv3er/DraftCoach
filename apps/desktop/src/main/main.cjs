const { app, BrowserWindow, ipcMain, Menu, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, exec } = require('child_process');
const { setupCrashHandlers, log } = require('./crash-logger.cjs');
const { loadSettings, getSetting, setSetting, SETTINGS_FILE, SENSITIVE_KEYS } = require('./settings.cjs');
// Ã¢â€â‚¬Ã¢â€â‚¬ Intelligence upgrade: centralised prompt builder Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const _prompts = require('./prompt-builder.cjs');

// Load .env from multiple possible locations
// TODO: For production launch, replace with Cloudflare Worker proxy
const _envSearchPaths = [
  path.join(__dirname, '..', '..', '.env'),                    // app root (packaged: resources/app/.env)
  path.join(__dirname, '..', '..', '..', '..', '.env'),        // DraftCoach root (dev: apps/desktop/src/main -> DraftCoach)
  path.join(app.getPath('userData'), '.env'),                  // user data dir
];
for (const envPath of _envSearchPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.trim().startsWith('#')) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
    break;
  }
}

const CACHE_DIR = path.join(app.getPath('userData'), 'icon-cache');
// app.isPackaged is false with electron-packager unpacked builds, so also check dist exists
const _distIndexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
const isDev = !app.isPackaged && !require('fs').existsSync(_distIndexPath);

const BLOCKED_ITEM_IDS = new Set(['6701', '226701']); // Opportunity: present in DDragon metadata, not purchasable in current SR.
const BLOCKED_ITEM_NAMES = new Set(['opportunity']);

function normalizeItemNameKey(name) {
  return String(name || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function isCurrentStoreItem(id, item, mapId = 11) {
  if (!item) return false;
  const key = normalizeItemNameKey(item.name);
  if (BLOCKED_ITEM_IDS.has(String(id)) || BLOCKED_ITEM_NAMES.has(key)) return false;
  const onMap = mapId === 12 ? item.isARAM : item.isSR;
  if (!onMap) return false;
  if (item.inStore === false || item.hideFromAll === true || item.purchasable === false) return false;
  return true;
}

function isCompletedStoreItem(id, item, mapId = 11) {
  if (!isCurrentStoreItem(id, item, mapId)) return false;
  const isBoots = item.tags && item.tags.includes('Boots');
  if (isBoots) return item.gold > 300 && (!item.into || item.into.length === 0);
  if (item.gold < 2000) return false;
  if (!item.from || item.from.length === 0) return false;
  if (item.into && item.into.length > 0) return false;
  if (!item.tags || item.tags.length === 0) return false;
  return true;
}

function isKnownCompletedStoreItemName(name, mapId = 11) {
  if (!ddragonItemCache?.byId) return true;
  const key = normalizeItemNameKey(name);
  for (const [id, item] of ddragonItemCache.byId) {
    if (normalizeItemNameKey(item.name) === key) return isCompletedStoreItem(id, item, mapId);
  }
  return false;
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
//  OPENROUTER / DEEPSEEK V4 FLASH Ã¢â‚¬â€ Universal LLM wrapper
//  Uses OpenRouter API (OpenAI-compatible) for DeepSeek generation.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
const OPENROUTER_MODELS = new Set([
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-pro',
  'qwen/qwen3.6-flash',
  'qwen/qwen3.6-max-preview',
  'openai/gpt-5.4',
  'openai/gpt-5.5',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.1-flash-lite-preview',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.1-pro-preview-customtools',
  'moonshotai/kimi-k2.6',
  'x-ai/grok-4.3',
  'mistralai/mistral-large-2512',
]);
const MODEL_DISPLAY_NAMES = {
  'deepseek/deepseek-v4-flash': 'DeepSeek V4 Flash',
  'deepseek/deepseek-v4-pro': 'DeepSeek V4 Pro',
  'qwen/qwen3.6-flash': 'Qwen3.6 Flash',
  'qwen/qwen3.6-max-preview': 'Qwen3.6 Max',
  'openai/gpt-5.4': 'GPT-5.4',
  'openai/gpt-5.5': 'GPT-5.5',
  'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'anthropic/claude-opus-4.6': 'Claude Opus 4.6',
  'google/gemini-3-flash-preview': 'Gemini 3 Flash',
  'google/gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'google/gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash Lite Preview',
  'google/gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'google/gemini-3.1-pro-preview-customtools': 'Gemini 3.1 Pro Custom Tools',
  'moonshotai/kimi-k2.6': 'Kimi K2.6',
  'x-ai/grok-4.3': 'Grok 4.3',
  'mistralai/mistral-large-2512': 'Mistral Large 3',
};

function getOpenRouterKey() {
  return getSetting('openrouterApiKey')
    || process.env.OPENROUTER_API_KEY
    || '';
}

function getOpenRouterModel(requestedModel) {
  const configured = requestedModel || getSetting('aiModel') || process.env.OPENROUTER_MODEL || OPENROUTER_MODEL;
  return OPENROUTER_MODELS.has(configured) ? configured : OPENROUTER_MODEL;
}

function getModelDisplayName(model) {
  return MODEL_DISPLAY_NAMES[model] || MODEL_DISPLAY_NAMES[OPENROUTER_MODEL];
}

function applyOpenRouterReasoningControls(body, opts = {}) {
  let defaultReasoning = { effort: 'none', exclude: true };
  if (/^google\/gemini-3/i.test(body.model || '')) {
    defaultReasoning = { effort: /pro/i.test(body.model) ? 'medium' : 'low', exclude: true };
  }
  const reasoning = opts.reasoning === undefined ? defaultReasoning : opts.reasoning;
  if (reasoning) body.reasoning = reasoning;
  return body;
}

/**
 * Universal LLM generation via OpenRouter (DeepSeek V4 Flash).
 * @param {string} systemPrompt - System instruction
 * @param {string} userMessage - User message / context
 * @param {object} [opts] - Options: { temperature, maxTokens, jsonMode }
 * @returns {Promise<string>} Generated text
 */
async function llmGenerate(systemPrompt, userMessage, opts = {}) {
  const { temperature = 0.2, maxTokens = 8192, jsonMode = false, topP = 0.85, seed } = opts;
  const apiKey = getOpenRouterKey();
  const model = getOpenRouterModel(opts.model);

  const body = applyOpenRouterReasoningControls({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
  }, opts);
  if (Number.isInteger(seed)) body.seed = seed;

  // If JSON mode requested, ask the model to output JSON
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
    // Also reinforce in system prompt
    body.messages[0].content += '\n\nYou MUST respond with valid JSON only. No markdown, no code fences, no text before or after the JSON.';
  }

  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const url = new URL(OPENROUTER_BASE);
    const reqOpts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://draftcoach.gg',
        'X-Title': 'DraftCoach',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const message = parsed.error.message || JSON.stringify(parsed.error);
            if (/provider returned error|upstream|temporarily|rate limit|overloaded/i.test(message) && !opts.__retriedProviderError) {
              log('WARN', `[openrouter] ${getModelDisplayName(model)} provider error; retrying once without seed/reasoning controls`);
              const retryOpts = {
                ...opts,
                __retriedProviderError: true,
                reasoning: { effort: 'none', exclude: true },
              };
              delete retryOpts.seed;
              llmGenerate(systemPrompt, userMessage, retryOpts).then(resolve, reject);
              return;
            }
            reject(new Error(`OpenRouter error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            return;
          }
          const content = parsed.choices?.[0]?.message?.content || '';
          const reasoningTokens = parsed.usage?.completion_tokens_details?.reasoning_tokens || 0;
          if (!content && Number.isInteger(opts.seed) && !opts.__retriedNoSeed) {
            log('WARN', `[openrouter] ${getModelDisplayName(model)} returned no content; retrying without seed`);
            const retryOpts = { ...opts, __retriedNoSeed: true };
            delete retryOpts.seed;
            llmGenerate(systemPrompt, userMessage, retryOpts).then(resolve, reject);
            return;
          }
          if (!content && reasoningTokens > 0 && !opts.__retriedNoContent) {
            log('WARN', `[openrouter] ${getModelDisplayName(model)} returned reasoning tokens but no content; retrying with reasoning budget disabled`);
            llmGenerate(systemPrompt, userMessage, {
              ...opts,
              __retriedNoContent: true,
              reasoning: model.startsWith('deepseek/') ? { max_tokens: 0, exclude: true } : { effort: 'none', exclude: true },
            }).then(resolve, reject);
            return;
          }
          resolve(content);
        } catch (e) {
          reject(new Error(`OpenRouter parse error: ${e.message} Ã¢â‚¬â€ raw: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`OpenRouter network error: ${e.message}`)));
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('OpenRouter request timed out (120s)')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Stream LLM generation via OpenRouter (DeepSeek V4 Flash).
 * Calls onChunk(text) for each SSE chunk, resolves with full text.
 */
async function llmGenerateStream(systemPrompt, userMessage, opts = {}, onChunk = null) {
  const { temperature = 0.2, maxTokens = 8192, topP = 0.85, seed } = opts;
  const apiKey = getOpenRouterKey();
  const model = getOpenRouterModel(opts.model);

  const body = applyOpenRouterReasoningControls({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    stream: true,
  }, opts);
  if (Number.isInteger(seed)) body.seed = seed;

  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const url = new URL(OPENROUTER_BASE);
    const reqOpts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://draftcoach.gg',
        'X-Title': 'DraftCoach',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    let fullText = '';
    const req = https.request(reqOpts, (res) => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              if (onChunk) onChunk(delta);
            }
          } catch {}
        }
      });
      res.on('end', () => {
        if (!fullText && Number.isInteger(opts.seed) && !opts.__retriedNoSeed) {
          log('WARN', `[openrouter] ${getModelDisplayName(model)} stream returned no content; retrying without seed`);
          const retryOpts = { ...opts, __retriedNoSeed: true };
          delete retryOpts.seed;
          llmGenerateStream(systemPrompt, userMessage, retryOpts, onChunk).then(resolve, reject);
          return;
        }
        if (!fullText && !opts.__retriedNoContent) {
          log('WARN', `[openrouter] ${getModelDisplayName(model)} stream returned no content; retrying with reasoning budget disabled`);
          llmGenerateStream(systemPrompt, userMessage, {
            ...opts,
            __retriedNoContent: true,
            reasoning: model.startsWith('deepseek/') ? { max_tokens: 0, exclude: true } : { effort: 'none', exclude: true },
          }, onChunk).then(resolve, reject);
          return;
        }
        resolve(fullText);
      });
    });

    req.on('error', (e) => reject(new Error(`OpenRouter stream error: ${e.message}`)));
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('OpenRouter stream timed out (120s)')); });
    req.write(payload);
    req.end();
  });
}



let backendProcess = null;
let mainWindow = null;
let overlayWindow = null;
let scoutWindow = null;
let statsWindow = null;
let scoreboardWindow = null;
let trackerWindow = null;
let cachedScoutReport = null;  // Cache for scout window
let overlayData = null;
let overlayGeneration = 0; // Increments on every overlay update Ã¢â‚¬â€ prevents stale renders
let ddragonItemCache = null; // { version, items: Map<normalizedName, {id, name, iconUrl, gold}>, byId: Map<id, {name, from, gold, iconUrl}> }
let ddragonItemCachePromise = null; // Lock to prevent duplicate fetches
let ddragonRuneCache = null; // { version, trees: [{name, keystones, slots}], shardOptions, reference }

// Fetch and cache DDragon runes (runesReforged.json)
async function fetchDdragonRunes() {
  if (ddragonRuneCache) return ddragonRuneCache;
  try {
    const fetch = require('node-fetch');
    const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await versionsRes.json();
    const ver = versions[0];
    const runesRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/runesReforged.json`);
    const runesData = await runesRes.json();
    
    // Build dynamic nameÃ¢â€ â€™ID lookup map (replaces hardcoded PERK_IDS)
    const perkMap = {}; // UPPER_NAME Ã¢â€ â€™ perkId
    const styleMap = {}; // UPPER_TREE_NAME Ã¢â€ â€™ styleId

    const trees = runesData.map(tree => {
      styleMap[tree.name.toUpperCase()] = tree.id;
      const allRunes = [];
      for (const slot of tree.slots) {
        for (const r of slot.runes) {
          perkMap[r.name.toUpperCase()] = r.id;
          allRunes.push({ name: r.name, id: r.id });
        }
      }
      return {
        name: tree.name,
        id: tree.id,
        keystones: tree.slots[0].runes.map(r => ({ name: r.name, id: r.id })),
        slot1: tree.slots[1].runes.map(r => ({ name: r.name, id: r.id })),
        slot2: tree.slots[2].runes.map(r => ({ name: r.name, id: r.id })),
        slot3: tree.slots[3].runes.map(r => ({ name: r.name, id: r.id })),
        allRunes,
      };
    });

    // Add stat shard IDs (Season 2026 Ã¢â‚¬â€ Armor and Magic Resist REMOVED from shards)
    // Row1: [Adaptive Force, Attack Speed, Ability Haste]
    // Row2: [Adaptive Force, Move Speed, Health Scaling]
    // Row3: [Health, Tenacity and Slow Resist, Health Scaling]
    const shardIds = {
      'ADAPTIVE FORCE': 5008, 'ATTACK SPEED': 5005, 'ABILITY HASTE': 5007,
      'HEALTH': 5011, 'HEALTH SCALING': 5001,
      'TENACITY AND SLOW RESIST': 5013, 'MOVEMENT SPEED': 5010,
      // Old shard names that no longer exist Ã¢â‚¬â€ map to closest valid defense shard
      'ARMOR': 5011, 'MAGIC RESIST': 5011,
    };
    Object.assign(perkMap, shardIds);

    // Build a concise reference string for prompt injection
    let ref = 'VALID RUNES (Season 2026):\n';
    for (const tree of trees) {
      ref += `${tree.name}: Keystones=[${tree.keystones.map(r=>r.name).join(', ')}] | Row1=[${tree.slot1.map(r=>r.name).join(', ')}] | Row2=[${tree.slot2.map(r=>r.name).join(', ')}] | Row3=[${tree.slot3.map(r=>r.name).join(', ')}]\n`;
    }
    ref += 'VALID STAT SHARDS: Row1=[Adaptive Force, Attack Speed, Ability Haste] | Row2=[Adaptive Force, Move Speed, Health Scaling] | Row3=[Health, Tenacity and Slow Resist, Health Scaling]\n';
    ref += 'RULES: Primary tree = Keystone + 1 rune from EACH of Row1, Row2, Row3 (3 runes). Secondary tree = 2 runes from ANY 2 different rows (NOT keystones). Shards = 1 from each shard row.\n';
    
    ddragonRuneCache = { version: ver, trees, reference: ref, perkMap, styleMap };
    console.log(`[ddragon] Cached ${trees.length} rune trees, ${Object.keys(perkMap).length} perks from DDragon v${ver}`);
    return ddragonRuneCache;
  } catch (err) {
    console.error('[ddragon] Failed to fetch runes:', err.message);
    return null;
  }
}

// Get valid boots list from item cache
function getValidBootsReference(mapId = 11) {
  if (!ddragonItemCache || !ddragonItemCache.byId) return '';
  const boots = [];
  for (const [id, item] of ddragonItemCache.byId) {
    if (!isCurrentStoreItem(id, item, mapId)) continue;
    // Boots have Boots of Speed (1001) in their recipe tree and cost > 300g (not base boots)
    if (item.from && item.from.includes('1001') && item.gold > 300 && (!item.into || item.into.length === 0)) {
      boots.push(item.name);
    }
  }
  if (boots.length === 0) return '';
  return `VALID BOOTS: ${boots.join(', ')}\n`;
}

// Get full valid item list from DDragon cache, grouped by tag
function getValidItemsReference(mapId = 11) {
  if (!ddragonItemCache || !ddragonItemCache.byId) return '';
  const categories = {};
  for (const [id, item] of ddragonItemCache.byId) {
    if (!isCompletedStoreItem(id, item, mapId)) continue;
    const primaryTag = item.tags[0];
    if (!categories[primaryTag]) categories[primaryTag] = [];
    if (!categories[primaryTag].includes(item.name)) {
      categories[primaryTag].push(item.name);
    }
  }
  if (Object.keys(categories).length === 0) return '';
  const mapLabel = mapId === 12 ? 'ARAM' : 'Season 2026';
  let ref = `VALID COMPLETED ITEMS (${mapLabel}):\n`;
  for (const [tag, items] of Object.entries(categories)) {
    ref += `${tag}: ${items.join(', ')}\n`;
  }
  ref += 'RULE: ONLY suggest items from this list. If an item is not here, it does NOT exist in the game.\n';
  return ref;
}

// Get valid starting items from DDragon cache (items Ã¢â€°Â¤500g, no recipe, base items)
function getValidStartingItemsReference(role, mapId = 11) {
  if (!ddragonItemCache || !ddragonItemCache.byId) return '';

  // ARAM has no starting items in the traditional sense (you start with gold and buy on first death)
  if (mapId === 12) {
    return 'ARAM STARTING RULES: Players start with 1400g. Buy components or full items immediately. No Doran\'s items. No startingItems needed Ã¢â‚¬â€ put everything in coreBuild.\n';
  }

  const EXCLUDED_IDS = new Set([
    '3599', '3600', // Kalista's Black Spear
    '2138', '2139', '2140', // Elixirs (level 9+)
    '3330', '3340', '3363', '3364', // Trinkets
  ]);

  const lanerItems = [];
  const jungleItems = [];
  const supportItems = [];
  const potions = [];

  for (const [id, item] of ddragonItemCache.byId) {
    if (EXCLUDED_IDS.has(id)) continue;
    if (id.length > 4 && id.startsWith('32')) continue; // Duplicate IDs (e.g. 323070)
    if (!isCurrentStoreItem(id, item, 11)) continue;
    if (item.gold > 500) continue;
    if (item.from && item.from.length > 0) continue; // Must be a base item
    if (item.name.includes('Ornn') || item.name === 'Stat Bonus' || item.name === 'Anvil Voucher') continue;

    const tags = item.tags || [];
    const name = item.name;

    if (name.includes('Potion') || name === 'Refillable Potion') {
      potions.push(`${name} (${item.gold}g)`);
    } else if (tags.includes('Jungle')) {
      jungleItems.push(`${name} (${item.gold}g)`);
    } else if (name === 'World Atlas') {
      supportItems.push(`${name} (${item.gold}g)`);
    } else if (tags.includes('Lane') || name.startsWith("Doran's") || name === 'Dark Seal' || name === 'Cull') {
      lanerItems.push(`${name} (${item.gold}g)`);
    }
  }

  // Deduplicate (some items have multiple IDs like Mosstomper)
  const dedupe = arr => [...new Set(arr)];

  let ref = 'VALID STARTING ITEMS (Starting gold = 500g):\n';
  ref += `  Laner: ${dedupe(lanerItems).join(', ')}\n`;
  ref += `  Jungle: ${dedupe(jungleItems).join(', ')}\n`;
  ref += `  Support: ${dedupe(supportItems).join(', ')}\n`;
  ref += `  Potions: ${dedupe(potions).join(', ')}\n`;
  ref += `  RULE: Buy exactly 1 starting item + 1 potion (Health Potion or Refillable Potion). Total must be Ã¢â€°Â¤500g.\n`;
  ref += `  Jungle: Buy 1 companion + 1 Health Potion.\n`;
  ref += `  Support: Buy World Atlas + 1 Health Potion.\n`;
  ref += `  NEVER put starting items (Doran's, companions, potions) in coreBuild.\n`;
  return ref;
}

// Get valid summoner spells reference for prompt injection
async function getSummonerSpellsReference() {
  try {
    const sumData = await fetchDdragonSummoners();
    if (!sumData || !sumData.spellNames || sumData.spellNames.length === 0) return '';
    return `VALID SUMMONER SPELLS: ${sumData.spellNames.join(', ')}\n`;
  } catch { return ''; }
}

// Pre-compute enemy team damage profile from DDragon champion tags
async function computeEnemyProfile(enemies) {
  if (!enemies || enemies.length === 0) return '';
  const champCache = await ensureDdragonChampCache();
  if (!champCache) return '';

  // Fix #5: Champion-specific counter-item hints for common champions
  const CHAMPION_COUNTER_HINTS = {
    'Zed': 'Zed [AD Burst] Ã¢â€ â€™ armor, Guardian Angel, Sterak\'s, or Death\'s Dance',
    'Talon': 'Talon [AD Burst] Ã¢â€ â€™ early armor + Sterak\'s/Guardian Angel',
    'Fizz': 'Fizz [AP Burst] Ã¢â€ â€™ Banshee\'s blocks R, MR rush',
    'Katarina': 'Katarina [AP/AD Hybrid] Ã¢â€ â€™ CC interrupts R, anti-heal',
    'Malzahar': 'Malzahar [AP Suppress] Ã¢â€ â€™ QSS removes R',
    'Mordekaiser': 'Mordekaiser [AP Bruiser] Ã¢â€ â€™ QSS cleanses R',
    'Vayne': 'Vayne [True Dmg] Ã¢â€ â€™ HP stacking > armor, burst < 3 autos',
    'Fiora': 'Fiora [True Dmg] Ã¢â€ â€™ Thornmail + Frozen Heart',
    'Veigar': 'Veigar [AP Scaling] Ã¢â€ â€™ Banshee\'s blocks E cage, MR',
    'Sylas': 'Sylas [AP Bruiser] Ã¢â€ â€™ Anti-heal CRITICAL, MR',
    'Vladimir': 'Vladimir [AP Sustain] Ã¢â€ â€™ Anti-heal MANDATORY',
    'Aatrox': 'Aatrox [AD Drain] Ã¢â€ â€™ Anti-heal MANDATORY',
    'DrMundo': 'Dr. Mundo [HP Tank] Ã¢â€ â€™ Anti-heal + % HP damage',
    'Warwick': 'Warwick [Healing Fighter] Ã¢â€ â€™ Anti-heal, CC interrupts R',
    'Yasuo': 'Yasuo [AD Crit] Ã¢â€ â€™ Randuin\'s (anti-crit)',
    'Yone': 'Yone [AD/AP Hybrid] Ã¢â€ â€™ Needs armor AND MR, Randuin\'s',
    'Irelia': 'Irelia [AD Sustained] Ã¢â€ â€™ Thornmail + Frozen Heart',
    'Tryndamere': 'Tryndamere [AD Crit] Ã¢â€ â€™ Randuin\'s, disengage during R',
    'Kassadin': 'Kassadin [AP Scaling] Ã¢â€ â€™ Punish early (weak pre-6)',
    'Nasus': 'Nasus [AD Scaling] Ã¢â€ â€™ Kite, % armor pen late',
    'Akali': 'Akali [AP Assassin] Ã¢â€ â€™ MR + HP, sweeper for shroud',
    'LeBlanc': 'LeBlanc [AP Burst] Ã¢â€ â€™ Banshee\'s, MR rush',
    'Rengar': 'Rengar [AD Burst] Ã¢â€ â€™ Guardian Angel/Sterak\'s, group up',
    'KhaZix': 'Kha\'Zix [AD Assassin] Ã¢â€ â€™ Stay grouped (isolation = death)',
    'Samira': 'Samira [AD Melee ADC] Ã¢â€ â€™ CC interrupts R',
    'Kayn': 'Kayn [Shadow/Rhaast] Ã¢â€ â€™ Red: anti-heal + armor. Blue: MR + burst',
  };

  let apCount = 0, adCount = 0, tankCount = 0, assassinCount = 0, hasHealing = false;
  const details = [];
  const counterHints = [];
  const healChamps = ['Soraka', 'Yuumi', 'Sona', 'Nami', 'Vladimir', 'Aatrox', 'Warwick', 'DrMundo', 'Swain', 'Fiora', 'Sylas', 'Briar', 'Belveth'];

  for (const enemy of enemies) {
    const data = champCache.get(enemy);
    if (!data) { details.push(`${enemy} [Unknown]`); continue; }
    const tags = data.tags || [];
    if (tags.includes('Mage')) apCount++;
    if (tags.includes('Marksman') || tags.includes('Fighter')) adCount++;
    if (tags.includes('Tank')) tankCount++;
    if (tags.includes('Assassin')) assassinCount++;
    if (healChamps.includes(enemy) || healChamps.includes(data.id)) hasHealing = true;
    details.push(`${enemy} [${tags.join('/')}]`);
    // Add champion-specific counter hint if available
    if (CHAMPION_COUNTER_HINTS[enemy]) counterHints.push(CHAMPION_COUNTER_HINTS[enemy]);
    else if (data.id && CHAMPION_COUNTER_HINTS[data.id]) counterHints.push(CHAMPION_COUNTER_HINTS[data.id]);
  }

  let analysis = '\nENEMY TEAM PROFILE:\n';
  analysis += `Champions: ${details.join(', ')}\n`;
  analysis += `Damage Split: ${apCount} AP / ${adCount} AD / ${tankCount} Tanks / ${assassinCount} Assassins\n`;
  if (apCount >= 3) analysis += 'Ã¢Å¡Â Ã¯Â¸Â HEAVY AP TEAM Ã¢â‚¬â€ Prioritize MR items (Wit\'s End, Maw of Malmortius, Kaenic Rookern, Spirit Visage, Mercury\'s Treads)\n';
  if (adCount >= 3) analysis += 'Ã¢Å¡Â Ã¯Â¸Â HEAVY AD TEAM Ã¢â‚¬â€ Prioritize Armor items (Plated Steelcaps, Randuin\'s Omen, Frozen Heart, Dead Man\'s Plate)\n';
  if (tankCount >= 2) analysis += 'Ã¢Å¡Â Ã¯Â¸Â TANKY TEAM Ã¢â‚¬â€ Prioritize penetration/% HP items (Lord Dominik\'s Regards, Void Staff, Liandry\'s Torment, Black Cleaver)\n';
  if (assassinCount >= 2) analysis += 'Ã¢Å¡Â Ã¯Â¸Â ASSASSIN-HEAVY Ã¢â‚¬â€ Consider class-appropriate defensive items early (Guardian Angel, Sterak\'s Gage, Death\'s Dance, Maw; stasis only for AP champions)\n';
  if (hasHealing) analysis += 'Ã¢Å¡Â Ã¯Â¸Â ENEMY HAS HEALING Ã¢â‚¬â€ Consider anti-heal (Mortal Reminder, Morellonomicon, Thornmail)\n';
  if (counterHints.length > 0) analysis += '\nCHAMPION-SPECIFIC COUNTER TIPS:\n' + counterHints.join('\n') + '\n';
  return analysis;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ DDragon Summoner Spells Cache Ã¢â€â‚¬Ã¢â€â‚¬
let ddragonSummonerCache = null; // { version, spells: Set<string>, spellNames: string[] }

async function fetchDdragonSummoners() {
  if (ddragonSummonerCache) return ddragonSummonerCache;
  try {
    const fetch = require('node-fetch');
    const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await versionsRes.json();
    const ver = versions[0];
    const sumRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/summoner.json`);
    const sumData = await sumRes.json();
    
    const spells = new Set();
    const spellNames = [];
    for (const [key, spell] of Object.entries(sumData.data)) {
      spells.add(spell.name);
      spellNames.push(spell.name);
    }
    if (spells.has('Mark')) {
      for (const alias of ['Snowball', 'Mark/Dash', 'Mark Dash']) {
        spells.add(alias);
        spellNames.push(alias);
      }
    }
    
    ddragonSummonerCache = { version: ver, spells, spellNames };
    console.log(`[ddragon] Cached ${spells.size} summoner spells from DDragon v${ver}`);
    return ddragonSummonerCache;
  } catch (err) {
    console.error('[ddragon] Failed to fetch summoner spells:', err.message);
    return null;
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Cooldown Tracker State Ã¢â€â‚¬Ã¢â€â‚¬
const cooldownData = require('./cooldowns/cooldown-data.cjs');
let cooldownTimers = []; // Array of { id, championName, ability, totalDuration, endTime, startedAt }
let cooldownTickInterval = null;
let scoreboardDataInterval = null;
let lastLiveGameData = null; // Cache for latest /allgamedata response
let champUltCooldowns = {}; // { championName: [rank1cd, rank2cd, rank3cd] }
let ddragonVersion = null; // e.g. '15.1.1'

// Ã¢â€â‚¬Ã¢â€â‚¬ Ping Monitor Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Hybrid approach:
// PRE-GAME: TCP connect to Riot regional endpoints (the only endpoints that
// respond Ã¢â‚¬â€ game server IPs block both ICMP and TCP). The regional API
// endpoints route through Cloudflare's anycast, hitting the nearest edge node.
// IN-GAME:  Read the real ping from /liveclientdata/allgamedata Ã¢â‚¬â€ 100% accurate.

const net = require('net');

// Riot regional endpoints Ã¢â‚¬â€ these respond to TCP on port 443
// (Game server IPs like 104.160.x.x block ALL external connections)
const RIOT_SERVER_ENDPOINTS = {
  'EUW1':  'euw1.api.riotgames.com',
  'EUNE':  'eun1.api.riotgames.com',
  'NA':    'na1.api.riotgames.com',
  'KR':    'kr.api.riotgames.com',
  'JP':    'jp1.api.riotgames.com',
  'BR':    'br1.api.riotgames.com',
  'LAN':   'la1.api.riotgames.com',
  'LAS':   'la2.api.riotgames.com',
  'OCE':   'oc1.api.riotgames.com',
  'TR':    'tr1.api.riotgames.com',
  'RU':    'ru.api.riotgames.com',
  'PH':    'ph2.api.riotgames.com',
  'SG':    'sg2.api.riotgames.com',
  'TH':    'th2.api.riotgames.com',
  'TW':    'tw2.api.riotgames.com',
  'VN':    'vn2.api.riotgames.com',
};
const PING_PORT = 443;
const PING_TIMEOUT = 3000;
const PING_HISTORY_SIZE = 20;
const PING_INTERVAL_MS = 2000;

let pingInterval = null;
let pingHistory = [];
let pingGeneration = 0;       // Incremented on restart to discard stale in-flight pings
let pingUsingLiveClient = false; // True when in-game (using real ping from Live Client API)

/**
 * TCP connect ping Ã¢â‚¬â€ measures time to establish a TCP connection.
 * Returns RTT in ms or null on failure/timeout.
 */
function tcpPing(host, port, timeout) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const socket = new net.Socket();
    let settled = false;

    const finish = (ms) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ms);
    };

    socket.setTimeout(timeout);
    socket.on('connect', () => {
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      finish(Math.round(elapsed));
    });
    socket.on('timeout', () => finish(null));
    socket.on('error', () => finish(null));
    socket.connect(port, host);
  });
}

/**
 * Try to get real in-game ping from the Live Client API.
 * Returns the ping in ms or null if the game isn't running.
 */
async function getLiveClientPing() {
  try {
    const nodeFetch = require('node-fetch');
    const res = await nodeFetch('https://127.0.0.1:2999/liveclientdata/allgamedata', {
      agent: new (require('https').Agent)({ rejectUnauthorized: false }),
      timeout: 1500,
    });
    if (!res.ok) return null;
    const data = await res.json();
    // The Live Client API provides the actual in-game ping
    const ping = data.activePlayer?.connectionInfo?.ping;
    if (typeof ping === 'number' && ping > 0) return Math.round(ping);
    return null;
  } catch (_) {
    return null;
  }
}

function computePingStats() {
  const valid = pingHistory.filter(p => p.ms !== null).map(p => p.ms);
  if (valid.length === 0) {
    return { ping: null, jitter: null, packetLoss: 100, status: 'disconnected', isLive: pingUsingLiveClient };
  }

  const latest = pingHistory[pingHistory.length - 1]?.ms ?? null;
  const avgPing = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);

  let jitter = 0;
  if (valid.length >= 2) {
    let diffs = 0;
    for (let i = 1; i < valid.length; i++) {
      diffs += Math.abs(valid[i] - valid[i - 1]);
    }
    jitter = Math.round(diffs / (valid.length - 1));
  }

  const totalPings = pingHistory.length;
  const lostPings = pingHistory.filter(p => p.ms === null).length;
  const packetLoss = Math.round((lostPings / totalPings) * 100);

  let status = 'good';
  if (latest === null || packetLoss > 20) {
    status = 'disconnected';
  } else if (latest > 150 || jitter > 50 || packetLoss > 5) {
    status = 'unstable';
  } else if (latest > 80 || jitter > 25 || packetLoss > 2) {
    status = 'warning';
  }

  return { ping: latest, avgPing, jitter, packetLoss, status, isLive: pingUsingLiveClient, history: valid.slice(-10) };
}

function startPingMonitor() {
  if (pingInterval) return;
  const settings = loadSettings();
  const region = settings.serverRegion || 'EUW1';
  const serverHost = RIOT_SERVER_ENDPOINTS[region] || RIOT_SERVER_ENDPOINTS['EUW1'];
  const gen = ++pingGeneration;
  log('INFO', `[ping] Starting ping monitor Ã¢â€ â€™ ${region} (${serverHost}:${PING_PORT}) [gen=${gen}]`);
  pingHistory = [];
  pingUsingLiveClient = false;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ping-update', { ping: null, avgPing: null, jitter: null, packetLoss: 0, status: 'connecting', isLive: false, history: [] });
  }

  pingInterval = setInterval(async () => {
    if (gen !== pingGeneration) return;

    // Try Live Client API first (gives real in-game ping)
    const livePing = await getLiveClientPing();

    if (gen !== pingGeneration) return;

    let ms;
    if (livePing !== null) {
      ms = livePing;
      if (!pingUsingLiveClient) {
        log('INFO', '[ping] Switched to Live Client API (real in-game ping)');
        pingUsingLiveClient = true;
      }
    } else {
      // Pre-game: use TCP connect to regional endpoint
      if (pingUsingLiveClient) {
        log('INFO', '[ping] Game ended, switching back to TCP ping');
        pingUsingLiveClient = false;
      }
      ms = await tcpPing(serverHost, PING_PORT, PING_TIMEOUT);
    }

    if (gen !== pingGeneration) return;

    pingHistory.push({ ms, timestamp: Date.now() });
    if (pingHistory.length > PING_HISTORY_SIZE) pingHistory.shift();

    const stats = computePingStats();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ping-update', stats);
    }
  }, PING_INTERVAL_MS);
}

function stopPingMonitor() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
    pingGeneration++;
    log('INFO', '[ping] Ping monitor stopped');
  }
}

function restartPingMonitor() {
  stopPingMonitor();
  setTimeout(() => startPingMonitor(), 200);
}

// IPC: renderer can request region change Ã¢â€ â€™ restart ping with new target
ipcMain.on('set-ping-region', (_event, region) => {
  log('INFO', `[ping] Region changed to: ${region}`);
  try {
    const settings = loadSettings();
    settings.serverRegion = region;
    saveSettings(settings);
    restartPingMonitor();
  } catch (err) {
    log('ERROR', `[ping] Failed to change region: ${err.message}`);
  }
});

async function resolveDdragonItem(itemName) {
  try {
    if (!ddragonItemCache) {
      // Use lock to prevent duplicate concurrent fetches
      if (!ddragonItemCachePromise) {
        ddragonItemCachePromise = (async () => {
          const fetch = require('node-fetch');
          const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
          const versions = await versionsRes.json();
          const ver = versions[0];
          const itemsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`);
          const itemsData = await itemsRes.json();
          const items = new Map();
          const byId = new Map();
          for (const [id, d] of Object.entries(itemsData.data)) {
            const norm = normalizeItemNameKey(d.name);
            const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${ver}/img/item/${id}.png`;
            const isSR = d.maps?.['11'] === true; // Summoner's Rift
            const isARAM = d.maps?.['12'] === true; // Howling Abyss (ARAM)
            // CRITICAL: Only include Summoner's Rift items in the name lookup
            // This prevents Arena/ARAM-only items (Goredrinker, Stridebreaker, etc.) from being resolved
            const itemRecord = {
              name: d.name,
              from: d.from || [],
              into: d.into || [],
              gold: d.gold?.total || 0,
              base: d.gold?.base || 0,
              purchasable: d.gold?.purchasable !== false,
              inStore: d.inStore !== false,
              hideFromAll: d.hideFromAll === true,
              iconUrl,
              tags: d.tags || [],
              isSR,
              isARAM,
            };
            if (isCompletedStoreItem(id, itemRecord, 11)) {
              if (!items.has(norm)) {
                items.set(norm, { id, name: d.name, iconUrl, gold: d.gold?.total || 0 });
              }
            }
            // byId stores ALL items (needed for component resolution) but marks map availability
            byId.set(id, itemRecord);
          }
          console.log(`[ddragon] Cached ${items.size} SR items out of ${byId.size} total`);
          ddragonItemCache = { version: ver, items, byId };
          ddragonItemCachePromise = null;
        })();
      }
      await ddragonItemCachePromise;
    }
    const norm = normalizeItemNameKey(itemName);
    // Exact match (primary Ã¢â‚¬â€ fastest)
    if (ddragonItemCache.items.has(norm)) return ddragonItemCache.items.get(norm);
    // Strict prefix match only Ã¢â‚¬â€ no loose substring matching
    // This prevents removed items (e.g. "Divine Sunderer") from matching existing items (e.g. "Sundered Sky")
    for (const [key, val] of ddragonItemCache.items) {
      // Only match if one is a strict prefix of the other WITH a word boundary (space)
      if ((key.startsWith(norm + ' ') || norm.startsWith(key + ' ')) && Math.abs(key.length - norm.length) <= 15) {
        return val;
      }
    }
    // Apostrophe-tolerant exact match (e.g. "ludens companion" vs "luden's companion")
    const normNoApostrophe = norm.replace(/'/g, '');
    for (const [key, val] of ddragonItemCache.items) {
      if (key.replace(/'/g, '') === normNoApostrophe) return val;
    }
    return null;
  } catch (e) {
    return null;
  }
}
let gameDetectionInterval = null;
let fgMonitorProc = null;
let lastFgTitle = '';
let isGameRunning = false;
let overlayManuallyHidden = false;
let liveClientInterval = null;
let liveAdvisorInterval = null;  // separate from liveClientInterval!

// Ã¢â€â‚¬Ã¢â€â‚¬ LCU Lockfile Reader Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Duplicate getLcuCredentials declaration removed (already defined at line 3003)

// Ã¢â€â‚¬Ã¢â€â‚¬ RAG Pipeline Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const RAG_DIR = path.join(app.getPath('userData'), 'rag');
const RAG_META_FILE = path.join(RAG_DIR, 'meta.json');
const RAG_DATASET_FILE = path.join(RAG_DIR, 'dataset.json');
let isRagUpdating = false;

function ensureRagDir() {
  if (!fs.existsSync(RAG_DIR)) fs.mkdirSync(RAG_DIR, { recursive: true });
}

function getRagMeta() {
  ensureRagDir();
  if (!fs.existsSync(RAG_META_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(RAG_META_FILE, 'utf-8')); }
  catch { return null; }
}

function saveRagMeta(meta) {
  ensureRagDir();
  fs.writeFileSync(RAG_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

function getLocalRagContext(champion, role, enemies) {
  const meta = getRagMeta();
  const currentPatch = meta?.patch || 'Unknown';

  if (!fs.existsSync(RAG_DATASET_FILE)) {
    return `Patch ${currentPatch}\n${champion} ${role}\nNo local RAG data available.`;
  }

  let ds;
  try {
    ds = JSON.parse(fs.readFileSync(RAG_DATASET_FILE, 'utf-8'));
  } catch {
    return `Patch ${currentPatch}\n${champion} ${role}\nRAG data corrupted.`;
  }

  const patchStr = ds.patch || currentPatch;
  const ctx = ds.metaContext || ds.metaSummary || '';

  // #1: Inject champion-specific meta data if available
  let champMeta = '';
  if (ds.championMeta) {
    const champData = ds.championMeta[champion];
    if (champData) {
      const parts = [`CHAMPION META for ${champion}:`];
      if (champData.tier) parts.push(`  Tier: ${champData.tier}`);
      if (champData.winRate) parts.push(`  Win Rate: ${champData.winRate}%`);
      if (champData.pickRate) parts.push(`  Pick Rate: ${champData.pickRate}%`);
      if (champData.banRate) parts.push(`  Ban Rate: ${champData.banRate}%`);
      if (champData.strongInto && champData.strongInto.length > 0) {
        parts.push(`  Strong into: ${champData.strongInto.join(', ')}`);
      }
      if (champData.weakInto && champData.weakInto.length > 0) {
        parts.push(`  Weak into: ${champData.weakInto.join(', ')}`);
      }
      if (champData.patchNotes) parts.push(`  Patch changes: ${champData.patchNotes}`);
      champMeta = parts.join('\n');
    }

    // Also inject enemy matchup data if available
    if (enemies && enemies.length > 0) {
      const enemyParts = [];
      for (const enemyName of enemies) {
        const ed = ds.championMeta[enemyName];
        if (ed) {
          const info = [`${enemyName}: Tier ${ed.tier || '?'}, ${ed.winRate || '?'}% WR`];
          if (ed.patchNotes) info.push(`(${ed.patchNotes})`);
          enemyParts.push(info.join(' '));
        }
      }
      if (enemyParts.length > 0) {
        champMeta += `\nENEMY META:\n  ${enemyParts.join('\n  ')}`;
      }
    }
  }

  return `Patch ${patchStr}\n${champion} ${role}\n${ctx}${champMeta ? '\n' + champMeta : ''}`;
}

async function checkAndSyncRag(livePatch, force = false) {
  if (isRagUpdating) return;
  try {
    isRagUpdating = true;
    const liveMajorMinor = livePatch.split('.').slice(0, 2).join('.');
    const localMeta = getRagMeta();
    const localPatch = localMeta?.patch ? localMeta.patch.split('.').slice(0, 2).join('.') : null;

    if (localPatch === liveMajorMinor && !force) {
      log('INFO', `[RAG] Dataset up to date (Patch ${localPatch})`);
      return;
    }

    log('INFO', `[RAG] Patch mismatch. Live: ${livePatch}, Local: ${localMeta?.patch || 'None'}. Updating...`);
    // DeepSeek V4 Flash via OpenRouter (no Google Search grounding needed)

    const prompt = `Search for the official League of Legends Patch ${liveMajorMinor} notes on leagueoflegends.com.

Return ONLY a compact JSON object with this EXACT structure (no markdown, no code blocks, just raw JSON):
{
  "metaContext": "<3-5 sentences summarizing the biggest meta shifts this patch: which champions got buffed/nerfed and why, which items changed, any new items or reworks. Focus on what matters for draft and itemization decisions.>",
  "championMeta": {
    "ChampionName": { "tier": "S/A/B/C/D", "winRate": 52.1, "pickRate": 8.5, "banRate": 12.0, "strongInto": ["Champ1"], "weakInto": ["Champ2"], "patchNotes": "brief change description or null" }
  },
  "patch": "${liveMajorMinor}"
}

Rules:
- metaContext must be a SINGLE string, 3-5 sentences max
- championMeta: Include ONLY champions that were directly changed (buffed/nerfed/reworked) in this patch
- For each changed champion, provide accurate win rate, pick rate, ban rate, and tier from current meta data
- strongInto/weakInto: list 2-3 champion names each based on current win rate data
- patchNotes: brief 1-sentence description of what changed for that champion
- Mention specific champion names that were buffed or nerfed
- If ANY new items were added or existing items were reworked, mention them by name
- If any champion was reworked, mention it
- Include item cost changes if significant
- Do NOT list every individual change Ã¢â‚¬â€ summarize the overall meta impact
- Do NOT hallucinate changes not in the official notes`;

    let newDataset;
    try {
      const textResponse = (await llmGenerate('Return ONLY valid JSON. No markdown. No code blocks.', prompt, { temperature: 0.2, maxTokens: 4096 })).trim();
      const cleanJson = textResponse.replace(/^```(json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      newDataset = {
        metaContext: parsed.metaContext || parsed.metaSummary || '',
        championMeta: parsed.championMeta || {},
        patch: liveMajorMinor,
      };
    } catch (apiError) {
      log('ERROR', '[RAG] DeepSeek/OpenRouter grounding failed, using fallback:', apiError.message);
      newDataset = { metaContext: `Patch ${liveMajorMinor} is live. Grounding failed Ã¢â‚¬â€ adapt to global changes.`, championMeta: {}, patch: liveMajorMinor };
    }

    ensureRagDir();
    fs.writeFileSync(RAG_DATASET_FILE, JSON.stringify(newDataset, null, 2), 'utf-8');
    saveRagMeta({ patch: liveMajorMinor, updatedAt: new Date().toISOString(), source: 'openrouter-deepseek' });
    log('INFO', `[RAG] Pipeline completed for Patch ${liveMajorMinor}`);
  } catch (err) {
    log('ERROR', '[RAG] Sync failed:', err.message);
  } finally {
    isRagUpdating = false;
  }
}

// Also try to load RAG from bundled app data on first run
function seedRagFromBundle() {
  const meta = getRagMeta();
  if (meta) return; // already have local data
  // Check for bundled RAG data in extraResources
  const bundledDataset = isDev
    ? path.resolve(__dirname, '../../../../apps/backend/data/rag/dataset.json')
    : path.join(process.resourcesPath, 'rag-data', 'dataset.json');
  const bundledMeta = isDev
    ? path.resolve(__dirname, '../../../../apps/backend/data/rag/meta.json')
    : path.join(process.resourcesPath, 'rag-data', 'meta.json');
  try {
    if (fs.existsSync(bundledDataset) && fs.existsSync(bundledMeta)) {
      ensureRagDir();
      fs.copyFileSync(bundledDataset, RAG_DATASET_FILE);
      fs.copyFileSync(bundledMeta, RAG_META_FILE);
      log('INFO', '[RAG] Seeded from bundled data');
    }
  } catch { }
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
//  META BUILD REFERENCE SYSTEM
//  Fetches per-champion popular builds from reference sites via DeepSeek/OpenRouter.
//  Pre-fetched for ALL champions on patch
//  change, cached to disk, injected as guidance into the AI prompt.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

const META_BUILDS_DIR = path.join(RAG_DIR, 'meta-builds');
const META_BUILDS_SR_DIR = path.join(META_BUILDS_DIR, 'sr');
const AUGMENTS_DIR = path.join(RAG_DIR, 'augments');
const KB_DATA_DIR = path.join(RAG_DIR, 'kb-data');
let isMetaSyncing = false;

function ensureMetaBuildDirs() {
  for (const dir of [META_BUILDS_DIR, META_BUILDS_SR_DIR, AUGMENTS_DIR, KB_DATA_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Centralized RAG: Fetch from GitHub data branch Ã¢â€â‚¬Ã¢â€â‚¬
const CDN_BASE = 'https://raw.githubusercontent.com/Sliv3er/DraftCoach/data';

async function syncMetaFromCDN() {
  ensureMetaBuildDirs();
  log('INFO', '[cdn] Checking centralized meta data from GitHub...');
  try {
    // 1. Fetch manifest to check patch version. Prefer the unified KB
    // manifest, but keep the legacy meta-builds manifest as fallback.
    let manifestRes = await fetch(`${CDN_BASE}/data/kb/manifest.json`, { signal: AbortSignal.timeout(10000) });
    if (!manifestRes.ok) {
      manifestRes = await fetch(`${CDN_BASE}/data/meta-builds/manifest.json`, { signal: AbortSignal.timeout(10000) });
    }
    if (!manifestRes.ok) {
      log('WARN', `[cdn] Manifest not available (${manifestRes.status}), skipping CDN sync`);
      return false;
    }
    const manifest = await manifestRes.json();

    // Check if local data is already up-to-date
    const localMeta = getMetaBuildMeta();
    const localKbManifestPath = path.join(KB_DATA_DIR, 'manifest.json');
    let localKbManifest = null;
    try {
      if (fs.existsSync(localKbManifestPath)) localKbManifest = JSON.parse(fs.readFileSync(localKbManifestPath, 'utf-8'));
    } catch {}
    const needsKbManifest = Boolean(manifest.modes);
    if (
      localMeta && localMeta.patch === manifest.patch && localMeta.champCount >= manifest.champCount &&
      (!needsKbManifest || (localKbManifest && localKbManifest.patch === manifest.patch))
    ) {
      log('INFO', `[cdn] Local meta data already up-to-date (patch ${manifest.patch}, ${localMeta.champCount} champs)`);
      return true;
    }

    log('INFO', `[cdn] Downloading ${manifest.fileCount || '?'} champion meta files for patch ${manifest.patch}...`);

    // 2. List files by fetching the GitHub API for the data branch tree
    const treeUrl = `https://api.github.com/repos/Sliv3er/DraftCoach/git/trees/data?recursive=1`;
    const treeRes = await fetch(treeUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!treeRes.ok) {
      log('WARN', `[cdn] GitHub tree API failed (${treeRes.status})`);
      return false;
    }
    const tree = await treeRes.json();
    const metaFiles = tree.tree.filter(f => f.path.startsWith('data/meta-builds/sr/') && f.path.endsWith('.json'));
    const augmentFiles = tree.tree.filter(f => f.path.startsWith('data/augments/') && f.path.endsWith('.json'));
    const kbFiles = tree.tree.filter(f => f.path.startsWith('data/kb/') && f.path.endsWith('.json'));

    // 3. Download meta build files (in parallel batches of 15)
    let downloaded = 0;
    for (let i = 0; i < metaFiles.length; i += 15) {
      const batch = metaFiles.slice(i, i + 15);
      await Promise.all(batch.map(async (file) => {
        try {
          const url = `${CDN_BASE}/${file.path}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const data = await res.text();
            const fileName = path.basename(file.path);
            fs.writeFileSync(path.join(META_BUILDS_SR_DIR, fileName), data, 'utf-8');
            downloaded++;
          }
        } catch {}
      }));
    }

    // 4. Download augment files
    for (const file of augmentFiles) {
      try {
        const url = `${CDN_BASE}/${file.path}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.text();
          const fileName = path.basename(file.path);
          fs.writeFileSync(path.join(AUGMENTS_DIR, fileName), data, 'utf-8');
        }
      } catch {}
    }

    // 5. Download unified KB files used by instant U.GG preview,
    // ARAM baselines, ARAM Mayhem baselines, and augment recommendations.
    let kbDownloaded = 0;
    for (const file of kbFiles) {
      try {
        const url = `${CDN_BASE}/${file.path}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
          const data = await res.text();
          const fileName = path.basename(file.path);
          fs.writeFileSync(path.join(KB_DATA_DIR, fileName), data, 'utf-8');
          kbDownloaded++;
        }
      } catch {}
    }

    // 6. Update local meta
    const metaData = {
      patch: manifest.patch,
      updatedAt: new Date().toISOString(),
      champCount: Math.max(downloaded, manifest.champCount || 0),
      modes: manifest.modes || null,
      source: 'cdn',
    };
    fs.writeFileSync(path.join(META_BUILDS_DIR, 'meta.json'), JSON.stringify(metaData, null, 2), 'utf-8');
    log('INFO', `[cdn] Downloaded ${downloaded} legacy meta builds, ${kbDownloaded} KB files + augments from CDN (patch ${manifest.patch})`);
    return true;
  } catch (err) {
    log('WARN', `[cdn] CDN sync failed: ${err.message}. Will use local DeepSeek/OpenRouter grounding as fallback.`);
    return false;
  }
}

function getMetaBuildMeta() {
  const metaFile = path.join(META_BUILDS_DIR, 'meta.json');
  if (!fs.existsSync(metaFile)) return null;
  try { return JSON.parse(fs.readFileSync(metaFile, 'utf-8')); }
  catch { return null; }
}

function saveMetaBuildMeta(meta) {
  ensureMetaBuildDirs();
  fs.writeFileSync(path.join(META_BUILDS_DIR, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Get cached meta build reference for a champion+role.
 * Returns formatted prompt string or '' if not cached.
 * LEGACY: Kept for fallback if KB data is not available.
 */
function getMetaBuildReference(champion, role) {
  try {
    const exactFile = path.join(META_BUILDS_SR_DIR, `${champion}_${role}.json`);
    if (fs.existsSync(exactFile)) {
      const data = JSON.parse(fs.readFileSync(exactFile, 'utf-8'));
      return formatMetaReference(data);
    }
    const files = fs.readdirSync(META_BUILDS_SR_DIR).filter(f => f.startsWith(`${champion}_`) && f.endsWith('.json'));
    if (files.length > 0) {
      const data = JSON.parse(fs.readFileSync(path.join(META_BUILDS_SR_DIR, files[0]), 'utf-8'));
      return formatMetaReference(data, true);
    }
    return '';
  } catch {
    return '';
  }
}

function formatMetaReference(data, isOffRole = false) {
  if (!data || !data.metaBuild) return '';
  const mb = data.metaBuild;
  const offRoleNote = isOffRole
    ? `\n  Ã¢Å¡Â Ã¯Â¸Â NOTE: No meta data for this exact role. Showing ${data.champion} ${data.role || 'main role'} as reference. Adapt heavily for the actual role.`
    : '';
  let ref = `META REFERENCE (Patch ${data.patch || '?'} popular build Ã¢â‚¬â€ use as baseline, adapt to enemy comp):${offRoleNote}\n`;
  if (mb.winRate) ref += `  Win Rate: ${mb.winRate}% | `;
  if (mb.pickRate) ref += `Pick Rate: ${mb.pickRate}%\n`;
  if (mb.keystone) ref += `  Popular Keystone: ${mb.keystone}${mb.primaryTree ? ` (${mb.primaryTree})` : ''}\n`;
  if (mb.startingItems && mb.startingItems.length > 0) ref += `  Popular Starting: ${mb.startingItems.join(' + ')}\n`;
  if (mb.coreItems && mb.coreItems.length > 0) ref += `  Popular Core: ${mb.coreItems.join(' Ã¢â€ â€™ ')}\n`;
  if (mb.boots) ref += `  Popular Boots: ${mb.boots}\n`;
  if (mb.skillOrder) ref += `  Skill Order: ${mb.skillOrder}\n`;
  ref += `\n  INSTRUCTION: Start from this meta build as your baseline. You MUST strictly adhere to these CORE ITEMS. You may change their build order, but you should ONLY swap out a core item in extreme counter-matchup scenarios. Otherwise, keep the core items exactly as they appear. Adapt RUNES and BOOTS as needed to counter the enemy team.\n`;
  return ref;
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
//  U.GG KB BUILD REFERENCE SYSTEM
//  Reads build-templates.json from shared/kb/data (dev) or
//  kb-data/ (production). Injects all 3 variants as AI baseline.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

const _kbBuildTemplatesCache = new Map();

function kbBuildTemplateFileForMode(gameMode = 'sr') {
  const mode = String(gameMode || 'sr').toLowerCase();
  if (mode === 'aram-mayhem') return 'build-templates-aram-mayhem.json';
  if (mode === 'aram') return 'build-templates-aram.json';
  return 'build-templates.json';
}

function kbDataPaths(fileName) {
  const kbPaths = isDev
    ? [
        path.join(KB_DATA_DIR, fileName),
        path.resolve(__dirname, '../../../../shared/kb/data', fileName),
      ]
    : [
        path.join(KB_DATA_DIR, fileName),
        path.join(process.resourcesPath, 'kb-data', fileName),
        path.join(__dirname, '..', 'kb-data', fileName),
        path.resolve(__dirname, '../../../../shared/kb/data', fileName),
        path.resolve(process.resourcesPath || '', '..', 'shared/kb/data', fileName),
      ];
  return kbPaths;
}

function loadKBBuildTemplates(gameMode = 'sr') {
  const fileName = kbBuildTemplateFileForMode(gameMode);
  if (_kbBuildTemplatesCache.has(fileName)) return _kbBuildTemplatesCache.get(fileName);
  const kbPaths = kbDataPaths(fileName);
  for (const p of kbPaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const data = raw.data || {};
        _kbBuildTemplatesCache.set(fileName, data);
        log('INFO', `[KB] Loaded ${fileName} from: ${p} (${Object.keys(data).length} entries)`);
        return data;
      } catch (e) {
        log('WARN', `[KB] Failed to parse ${p}: ${e.message}`);
      }
    }
  }
  if (fileName !== 'build-templates.json') {
    log('WARN', `[KB] ${fileName} not found; falling back to SR build-templates.json`);
    const fallback = loadKBBuildTemplates('sr');
    _kbBuildTemplatesCache.set(fileName, fallback);
    return fallback;
  }
  log('WARN', `[KB] ${fileName} not found in any search path`);
  return {};
}

/**
 * Get U.GG KB build context for a champion+role.
 * Returns a formatted prompt string with all 3 variants (DAMAGE/SAFETY/UTILITY)
 * that the AI uses as its baseline reference.
 */
function getKBBuildContext(champion, role, gameMode = 'sr') {
  const roleMap = {
    top: 'TOP', jungle: 'JUNGLE', mid: 'MID',
    adc: 'ADC', bot: 'ADC', bottom: 'ADC', support: 'SUPPORT',
  };
  const mode = String(gameMode || 'sr').toLowerCase();
  const isARAMMode = mode === 'aram' || mode === 'aram-mayhem';
  const engineRole = isARAMMode
    ? (mode === 'aram-mayhem' ? 'ARAM_MAYHEM' : 'ARAM')
    : (roleMap[String(role || '').toLowerCase()] || String(role || '').toUpperCase());
  const data = loadKBBuildTemplates(mode);

  // Priority 1: exact role-suffixed key (e.g. "Aatrox_JUNGLE")
  // Priority 2: bare champion key ONLY if its stored role matches the requested role
  // Priority 3: fuzzy match by championId + role
  let template = isARAMMode ? (data[champion] || data[`${champion}_${engineRole}`]) : data[`${champion}_${engineRole}`];
  if (!template) {
    const bareEntry = data[champion];
    if (bareEntry && (bareEntry.role === engineRole || isARAMMode)) {
      template = bareEntry;
    }
  }
  if (!template) {
    template = Object.values(data).find(
      e => e.championId && e.championId.toLowerCase() === champion.toLowerCase() && e.role === engineRole
    );
  }

  if (!template || !template.variants) {
    log('WARN', `[KB] No build data for ${champion} ${engineRole} (${mode}) Ã¢â‚¬â€ falling back to legacy meta`);
    return isARAMMode ? '' : getMetaBuildReference(champion, role);
  }

  const variantKeys = Object.keys(template.variants);
  log('INFO', `[KB] Injecting ${champion} ${engineRole} ${mode}: ${variantKeys.length} variants (${variantKeys.join(', ')})`);

  const modeLabel = mode === 'aram-mayhem' ? 'ARAM: Mayhem' : mode === 'aram' ? 'ARAM' : engineRole;
  const lines = [`\nÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â REFERENCE BUILDS for ${champion} ${modeLabel} (U.GG Patch ${loadKBBuildTemplatesMeta(mode)}) Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â`];
  lines.push(`You MUST use one of these as your base build. State which one you chose in your ANALYSIS.`);
  const variantLabels = {
    DAMAGE: 'BUILD 1 Ã¢â‚¬â€ Most Popular (highest pick rate)',
    SAFETY: 'BUILD 2 Ã¢â‚¬â€ Secondary (alternative popular build)',
    UTILITY: 'BUILD 3 Ã¢â‚¬â€ Alternative (situational build)',
  };

  for (const [vKey, vLabel] of Object.entries(variantLabels)) {
    const v = template.variants[vKey];
    if (!v) continue;

    lines.push(`\n${vLabel}:`);
    if (v.runes) {
      lines.push(`  Keystone: ${v.runes.primaryKeystone} (${v.runes.primaryTree})`);
      if (v.runes.primarySlots) lines.push(`  Primary Runes: ${v.runes.primarySlots.join(', ')}`);
      lines.push(`  Secondary Tree: ${v.runes.secondaryTree}`);
      if (v.runes.secondarySlots) lines.push(`  Secondary Runes: ${v.runes.secondarySlots.join(', ')}`);
      if (v.runes.statShards) lines.push(`  Stat Shards: ${v.runes.statShards.join(', ')}`);
    }
    if (v.summonerSpells) lines.push(`  Summoner Spells: ${v.summonerSpells.join(' + ')}`);
    if (v.skillOrder) {
      const maxOrder = v.skillOrder.maxOrder ? v.skillOrder.maxOrder.join(' > ') : 'N/A';
      const first3 = v.skillOrder.first3 ? v.skillOrder.first3.join(' Ã¢â€ â€™ ') : 'N/A';
      lines.push(`  Skill Max Order: ${maxOrder} (first 3 levels: ${first3})`);
    }
    if (v.startingItems) lines.push(`  Starting Items: ${v.startingItems.map(i => typeof i === 'string' ? i : i.name).join(' + ')}`);
    if (v.bootChoice) lines.push(`  Boots: ${typeof v.bootChoice === 'string' ? v.bootChoice : v.bootChoice.name}`);
    if (v.coreItems) lines.push(`  Core Items (in order): ${v.coreItems.map(i => typeof i === 'string' ? i : i.name).join(' Ã¢â€ â€™ ')}`);
  }

  lines.push(`\nÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â`);
  lines.push(`\nCRITICAL RULES FOR USING REFERENCE BUILDS:`);
  lines.push(`1. You MUST use BUILD 1 (Most Popular) as your default base build.`);
  lines.push(`2. Only switch to BUILD 2 or BUILD 3 if the enemy composition STRONGLY demands it (e.g., BUILD 1 is pure offense but enemy has 4+ assassins).`);
  lines.push(`3. Your CORE BUILD output MUST contain the same core items from your chosen base build.`);
  lines.push(`4. You may reorder items based on the matchup or mode pressure.`);
  lines.push(`5. You may ONLY swap a core item in an extreme scenario. If you swap, you MUST explain why in ANALYSIS.`);
  lines.push(`6. Adapt RUNES, BOOTS, SUMMONER SPELLS, AUGMENTS, and SITUATIONAL ITEMS freely based on the mode and enemy team.`);
  lines.push(`7. In ANALYSIS, state: "Base Build: BUILD X" and explain any adaptations.`);
  return lines.join('\n');
}

function findKBBuildTemplate(champion, role, gameMode = 'sr') {
  const roleMap = {
    top: 'TOP', jungle: 'JUNGLE', mid: 'MID',
    adc: 'ADC', bot: 'ADC', bottom: 'ADC', support: 'SUPPORT',
  };
  const mode = String(gameMode || 'sr').toLowerCase();
  const isARAMMode = mode === 'aram' || mode === 'aram-mayhem';
  const engineRole = isARAMMode
    ? (mode === 'aram-mayhem' ? 'ARAM_MAYHEM' : 'ARAM')
    : (roleMap[String(role || '').toLowerCase()] || String(role || '').toUpperCase());
  const data = loadKBBuildTemplates(mode);

  let template = isARAMMode ? (data[champion] || data[`${champion}_${engineRole}`]) : data[`${champion}_${engineRole}`];
  if (!template) {
    const bareEntry = data[champion];
    if (bareEntry && (bareEntry.role === engineRole || isARAMMode)) template = bareEntry;
  }
  if (!template) {
    template = Object.values(data).find(
      e => e.championId && e.championId.toLowerCase() === String(champion || '').toLowerCase() && e.role === engineRole
    );
  }
  return { template, engineRole };
}

function findAnyKBBuildTemplateForChampion(champion, gameMode = 'sr') {
  const data = loadKBBuildTemplates(gameMode);
  const champ = String(champion || '').toLowerCase();
  const bareEntry = data[champion];
  if (bareEntry && bareEntry.variants) return bareEntry;
  return Object.values(data).find(
    e => e && e.variants && e.championId && e.championId.toLowerCase() === champ
  ) || null;
}

function names(list) {
  return (list || []).map(i => typeof i === 'string' ? i : i.name).filter(Boolean);
}

function normalizeMetaStartingItems(items, engineRole) {
  const entries = items || [];
  const byId = (id) => entries.find(i => i && typeof i !== 'string' && i.id === id);
  const byName = (name) => entries.find(i => (typeof i === 'string' ? i : i?.name || '').toLowerCase().includes(name));

  if (engineRole === 'JUNGLE') {
    const jungleStarter = entries.find(i => {
      const id = typeof i === 'string' ? '' : i?.id || '';
      const name = (typeof i === 'string' ? i : i?.name || '').toLowerCase();
      return /^110[123567]$/.test(id) || name.includes('hatchling') || name.includes('seedling') || name.includes('pup');
    });
    return names([jungleStarter, byId('2003') || byName('health potion') || { name: 'Health Potion' }]).slice(0, 2);
  }

  if (engineRole === 'SUPPORT') {
    const supportStarter = entries.find(i => {
      const id = typeof i === 'string' ? '' : i?.id || '';
      const name = (typeof i === 'string' ? i : i?.name || '').toLowerCase();
      return /^38\d\d$/.test(id) || /^486\d$/.test(id) || name.includes('world atlas');
    });
    return names([supportStarter || { name: 'World Atlas' }, byId('2003') || byName('health potion') || { name: 'Health Potion' }]).slice(0, 2);
  }

  return names(entries.filter(i => {
    const id = typeof i === 'string' ? '' : i?.id || '';
    return id !== '3340';
  })).slice(0, 2);
}

function buildInstantMetaText(body, patchDisplay) {
  const gameMode = body.gameMode || 'sr';
  const { template, engineRole } = findKBBuildTemplate(body.myChampion, body.role, gameMode);
  if (!template || !template.variants) return '';

  const base = template.variants.DAMAGE || Object.values(template.variants)[0];
  if (!base) return '';

  const starting = normalizeMetaStartingItems(base.startingItems, engineRole);
  const core = names(base.coreItems);
  const boots = typeof base.bootChoice === 'string' ? base.bootChoice : base.bootChoice?.name;
  const runes = base.runes || {};
  const maxOrderBase = base.skillOrder?.maxOrder || ['Q', 'E', 'W'];
  const maxOrder = [...maxOrderBase, 'R'].filter((v, i, arr) => arr.indexOf(v) === i).join(' > ');
  const sums = base.summonerSpells || ['Flash', engineRole === 'JUNGLE' ? 'Smite' : 'Teleport'];
  const modeLabel = gameMode === 'aram-mayhem' ? 'ARAM: Mayhem' : gameMode === 'aram' ? 'ARAM' : engineRole;
  const augmentSection = gameMode === 'aram-mayhem' ? buildInstantAugmentsSection(body.myChampion, body) : [];
  const enemyLine = (body.enemies || []).filter(Boolean).length
    ? `Enemy draft detected: ${(body.enemies || []).filter(Boolean).join(', ')}. AI is checking whether the meta base needs defensive swaps, anti-heal, boots changes, or rune adjustments.`
    : 'No full enemy draft yet. AI will refine once more matchup context is available.';

  return [
    'ANALYSIS',
    `Base Build: BUILD 1 from U.GG reference data, shown instantly while AI refines in the background.`,
    `Champion: ${body.myChampion} ${modeLabel}. Patch reference: ${loadKBBuildTemplatesMeta(gameMode)}; live patch: ${patchDisplay}.`,
    enemyLine,
    '',
    'RUNES',
    `Primary: ${runes.primaryTree || 'Primary'}`,
    runes.primaryKeystone ? `Keystone: ${runes.primaryKeystone}` : '',
    ...(runes.primarySlots || []),
    `Secondary: ${runes.secondaryTree || 'Secondary'}`,
    ...(runes.secondarySlots || []),
    runes.statShards?.length ? `Shards: ${runes.statShards.join(', ')}` : '',
    '',
    'SUMMONERS',
    ...sums,
    '',
    'SKILL ORDER',
    maxOrder,
    '',
    'STARTING ITEMS',
    ...(starting.length ? starting : ['Meta starting items pending']),
    '',
    'CORE BUILD',
    ...[boots, ...core].filter(Boolean).map((item, index) => `${index + 1}. ${item}`),
    ...augmentSection,
    '',
    'WIN CONDITION',
    'Use the U.GG core as the stable baseline. Treat this as the instant meta view; final AI output may reorder or adjust only when the draft strongly demands it.',
  ].filter(Boolean).join('\n');
}

function buildAiRefinementBaseline(metaText) {
  if (!metaText) return '';
  return [
    '\nMETA BASELINE ALREADY SHOWN TO THE USER:',
    metaText,
    '\nREFINEMENT TASK:',
    '- Start from the meta baseline above; it is the trusted U.GG plan already visible to the user.',
    '- Write DECISION TRACE first. It is backend-only and must include enemy damage priority, primary threats, win condition, U.GG variant, item swap budget, boots decision, rune decision, and anti-heal/QSS decision.',
    '- This is a refinement pass, not a fresh build generation. Keep the visible baseline as the answer unless a listed enemy threat creates a concrete need.',
    '- You may switch to another listed U.GG reference build when its runes/items are a better matchup fit. If you switch, state the chosen BUILD number and the exact trigger.',
    '- Keep summoners, starting items, and skill order exactly as baseline unless there is a critical role/legality issue.',
    '- Runes may change only when the enemy draft creates a real lane/teamfight need, such as extreme poke, unavoidable hard CC, oppressive burst, or a different U.GG build variant already supports that rune page.',
    '- Do not write "keep baseline", "preserved", or similar shorthand inside build sections. Repeat the exact rune, summoner, skill, and item names so the UI can render icons correctly.',
    '- Keep the core build unless the enemy draft strongly demands a change. Prefer choosing another U.GG variant, reordering, or 1 targeted swap. Use 2 swaps only for extreme cases such as 4+ one damage type, mandatory QSS/suppression, or overwhelming healing.',
    '- Do not change an item merely because another item is also good. If the baseline item is playable, preserve it.',
    '- If changing a baseline choice, state the concrete trigger in ANALYSIS: damage split, fed threat, suppression, heavy healing, or impossible lane survival.',
    '- Never swap to off-class items. Respect champion role, gold economy, and normal item users.',
    '- Output the full final build in the normal DraftCoach section format.',
    '- Do not explain unchanged meta choices unless they matter for the matchup.',
  ].join('\n');
}

function normalizeDraftRole(role) {
  const key = String(role || '').toLowerCase();
  const map = {
    top: 'top',
    jungle: 'jungle',
    jg: 'jungle',
    middle: 'mid',
    mid: 'mid',
    bottom: 'adc',
    bot: 'adc',
    adc: 'adc',
    utility: 'support',
    support: 'support',
  };
  return map[key] || '';
}

function roleLabel(role) {
  return ({ top: 'Top', jungle: 'Jungle', mid: 'Mid', adc: 'ADC', support: 'Support' })[normalizeDraftRole(role)] || 'Unknown';
}

function getConfirmedEnemyRole(body, champion) {
  const roles = body?.enemyRoles || {};
  const direct = roles[champion];
  if (direct) return normalizeDraftRole(direct);
  const matchKey = Object.keys(roles).find(key => key.toLowerCase() === String(champion || '').toLowerCase());
  return matchKey ? normalizeDraftRole(roles[matchKey]) : '';
}

function buildEnemyRoleContext(body) {
  const enemies = body?.enemies || [];
  const confirmed = enemies
    .map(champ => ({ champ, role: getConfirmedEnemyRole(body, champ) }))
    .filter(entry => entry.role);
  const myRole = normalizeDraftRole(body?.role);
  const laneEnemy = confirmed.find(entry => entry.role === myRole);

  if (!confirmed.length) {
    return {
      context: [
        'ENEMY ROLE ASSIGNMENTS: unknown.',
        'Do not infer lane assignments from champion names, pick order, list order, or meta assumptions.',
        `Do not write "${body?.myChampion} vs <enemy> ${roleLabel(myRole)}" unless a confirmed enemy role is provided.`,
        'Use enemy champions as teamfight/threat profiles only until roles are confirmed.',
      ].join('\n'),
      matchupLine: '',
    };
  }

  const roleLines = confirmed.map(entry => `- ${entry.champ}: ${roleLabel(entry.role)}`).join('\n');
  return {
    context: [
      'CONFIRMED ENEMY ROLES from League client assignedPosition:',
      roleLines,
      'Use these roles exactly. Never override them with champion-name guesses or list order.',
      laneEnemy
        ? `CONFIRMED LANE MATCHUP: ${body.myChampion} (${roleLabel(myRole)}) vs ${laneEnemy.champ} (${roleLabel(laneEnemy.role)}).`
        : `No confirmed enemy ${roleLabel(myRole)} opponent yet; do not claim a specific lane matchup.`,
    ].join('\n'),
    matchupLine: laneEnemy
      ? `\nLANE MATCHUP: ${body.myChampion} (${roleLabel(myRole)}) vs ${laneEnemy.champ} (${roleLabel(laneEnemy.role)}) — confirmed by League client assignedPosition.\n`
      : '',
  };
}

function sanitizeEnemyRoleClaims(finalText, body) {
  if (!finalText || !body?.enemyRoles) return finalText;
  let safe = String(finalText);
  for (const enemy of body.enemies || []) {
    const confirmedRole = getConfirmedEnemyRole(body, enemy);
    if (!confirmedRole) continue;
    const roleWords = ['Top', 'Jungle', 'Mid', 'Middle', 'Bot', 'Bottom', 'ADC', 'Support'];
    for (const word of roleWords) {
      if (normalizeDraftRole(word) === confirmedRole) continue;
      const pattern = new RegExp(`\\b${enemy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${word}\\b`, 'gi');
      safe = safe.replace(pattern, `${enemy} (${roleLabel(confirmedRole)})`);
    }
  }
  return safe;
}

function stableHashSeed(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeBuildLine(line) {
  return String(line || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*:\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBuildSection(text, title) {
  const headers = [
    'DECISION TRACE', 'ANALYSIS', 'CONSTRAINTS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
    'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH', 'ENEMY POWER SPIKES',
    'WIN CONDITION', 'YOUR POWER SPIKES',
  ];
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const otherHeaders = headers.filter(h => h !== title).map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = String(text || '').match(new RegExp(`(^|\\n)${escaped}\\s*\\n([\\s\\S]*?)(?=\\n(?:${otherHeaders})\\s*\\n|$)`, 'i'));
  return match ? match[2].trim() : '';
}

function replaceBuildSection(text, title, content) {
  if (!text || !content) return text;
  const headers = [
    'DECISION TRACE', 'ANALYSIS', 'CONSTRAINTS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
    'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH', 'ENEMY POWER SPIKES',
    'WIN CONDITION', 'YOUR POWER SPIKES',
  ];
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const otherHeaders = headers.filter(h => h !== title).map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`(^|\\n)${escaped}\\s*\\n[\\s\\S]*?(?=\\n(?:${otherHeaders})\\s*\\n|$)`, 'i');
  if (!pattern.test(text)) return text;
  return text.replace(pattern, `$1${title}\n${content.trim()}\n`);
}

function sectionItems(text, title) {
  const section = extractBuildSection(text, title);
  return section
    .split('\n')
    .map(normalizeBuildLine)
    .filter(Boolean);
}

function stripDecisionTrace(text) {
  if (!text) return text;
  const headers = [
    'ANALYSIS', 'CONSTRAINTS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
    'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH', 'ENEMY POWER SPIKES',
    'WIN CONDITION', 'YOUR POWER SPIKES',
  ];
  const otherHeaders = headers.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return String(text)
    .replace(new RegExp(`(^|\\n)DECISION TRACE\\s*\\n[\\s\\S]*?(?=\\n(?:${otherHeaders})\\s*\\n|$)`, 'i'), '$1')
    .trim();
}

function hasAnyText(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.some(term => haystack.includes(String(term).toLowerCase()));
}

function judgeReasoningQuality(finalText, body, mechanicsMap = null) {
  const draft = analyzeEnemyDraft(body?.enemies || [], mechanicsMap);
  const trace = extractBuildSection(finalText, 'DECISION TRACE');
  const analysis = extractBuildSection(finalText, 'ANALYSIS');
  const situational = extractBuildSection(finalText, 'SITUATIONAL ITEMS');
  const coreItems = sectionItems(finalText, 'CORE BUILD');
  const coreText = coreItems.join(' | ');
  const reasoningText = `${trace}\n${analysis}\n${situational}`;
  const issues = [];

  const requiredTraceLabels = [
    'Enemy Damage Priority',
    'Primary Threats',
    'Win Condition',
    'U.GG Variant',
    'Item Swap Budget',
    'Boots Decision',
    'Rune Decision',
    'Anti-Heal/QSS Decision',
  ];
  if (!trace) {
    issues.push('missing backend decision trace');
  } else {
    for (const label of requiredTraceLabels) {
      if (!new RegExp(`${label}\\s*:`, 'i').test(trace)) issues.push(`decision trace missing ${label}`);
    }
  }

  const fullAdPressure = draft.heavyAd && draft.effectiveAp < 1.5;
  if (draft.heavyAp) {
    if (!hasAnyText(reasoningText, ['AP', 'magic', 'MR', 'Mercury', 'Kaenic', 'Force of Nature', 'Banshee'])) {
      issues.push('heavy AP draft not acknowledged in reasoning');
    }
    if (!hasAnyText(coreText, ["Mercury's Treads", 'Kaenic Rookern', 'Force of Nature', 'Maw of Malmortius', "Banshee's Veil", 'Spirit Visage'])) {
      issues.push('heavy AP draft lacks MR answer in core');
    }
  }
  if (fullAdPressure) {
    if (!hasAnyText(reasoningText, ['AD', 'armor', 'Steelcaps', 'physical'])) {
      issues.push('full AD draft not acknowledged in reasoning');
    }
    if (!hasAnyText(coreText, ['Plated Steelcaps', "Zhonya's Hourglass", "Randuin's Omen", 'Frozen Heart', "Dead Man's Plate", 'Guardian Angel'])) {
      issues.push('full AD draft lacks armor/physical answer in core');
    }
  }
  if (draft.suppression > 0) {
    const canUseQssItem = championCanUseMercurial(body, mechanicsMap);
    if (!hasAnyText(reasoningText, canUseQssItem ? ['suppression', 'QSS', 'Mercurial', 'cleanse'] : ['suppression', 'cleanse', 'Banshee', 'Zhonya', 'positioning', 'stasis'])) {
      issues.push('suppression not acknowledged in reasoning');
    }
    if (canUseQssItem && !hasAnyText(`${coreText}\n${situational}`, ['Mercurial Scimitar', 'QSS', 'Quicksilver'])) {
      issues.push('suppression draft lacks QSS/Mercurial option');
    } else if (!canUseQssItem && hasAnyText(`${coreText}\n${situational}`, ['Mercurial Scimitar', 'Quicksilver Sash'])) {
      issues.push('AP/non-QSS class received off-class Mercurial option');
    }
  }
  if (draft.enchanterHealing > 0 || draft.selfHealingFrontliners > 0) {
    if (!hasAnyText(reasoningText, ['heal', 'healing', 'Grievous', 'anti-heal'])) {
      issues.push('healing not acknowledged in reasoning');
    }
  }
  if (hasAnyText(coreText, ["Mercury's Treads"]) && /plated steelcaps (?:are|is|provide|reduces|preferred)/i.test(reasoningText)) {
    issues.push('reasoning contradicts Mercury boots');
  }
  if (hasAnyText(coreText, ['Plated Steelcaps']) && /mercury'?s treads (?:are|is|provide|preferred|required)/i.test(reasoningText) && !draft.heavyAp) {
    issues.push('reasoning contradicts Steelcaps boots');
  }

  const score = Math.max(0, 100 - issues.length * 12);
  return { score, issues, trace };
}

function isUsableBuildText(text, role) {
  if (!text || String(text).trim().length < 200) return false;
  const required = ['RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS'];
  if (!required.every(title => extractBuildSection(text, title))) return false;
  const expectedCore = /^(adc|bot|bottom)$/i.test(String(role || '')) ? 7 : 6;
  const coreItems = sectionItems(text, 'CORE BUILD');
  return coreItems.length === expectedCore && coreItems.some(isBootItemName);
}

function fallbackToMetaBuild(instantMetaText, body, mechanicsMap = null) {
  if (!instantMetaText) return '';
  let safe = instantMetaText;
  safe = enforceRoleSafeItems(safe, body);
  safe = repairStartingItems(safe, body);
  safe = dedupeAndPadCoreBuild(safe, body);
  safe = enforceDraftCounterLogic(safe, body, mechanicsMap);
  safe = enforceRoleSafeItems(safe, body);
  safe = dedupeAndPadCoreBuild(safe, body);
  safe = sanitizeNarrativeAgainstFinalItems(safe, body, mechanicsMap);
  safe = sanitizeEnemyRoleClaims(safe, body);
  return safe;
}

function buildEmergencyFallbackText(body, patchDisplay, mechanicsMap = null) {
  const role = String(body?.role || '').toLowerCase();
  const tags = getChampionTags(body?.myChampion);
  const draft = analyzeEnemyDraft(body?.enemies || [], mechanicsMap);
  const isSupport = /support/.test(role);
  const isJungle = /jungle/.test(role);
  const isMarksman = /^(adc|bot|bottom)$/.test(role) || tags.includes('Marksman');
  const champ = body?.myChampion || 'Champion';
  const supportUpgrade = supportQuestUpgradeForChampion(champ, tags, mechanicsMap);
  const boots = draft.heavyAd && draft.effectiveAp < 1.5
    ? 'Plated Steelcaps'
    : (draft.heavyAp || draft.highCc ? "Mercury's Treads" : (isMarksman ? "Berserker's Greaves" : 'Boots of Swiftness'));
  const antiHeal = antiHealItemForChampion(champ, role, mechanicsMap);
  const needsAntiHeal = draft.enchanterHealing > 0 || draft.selfHealingFrontliners > 0;

  const core = [];
  const push = (item) => {
    if (item && !core.some(x => x.toLowerCase() === item.toLowerCase())) core.push(item);
  };
  if (isSupport) push(supportUpgrade);
  push(boots);
  if (tags.includes('Mage')) {
    push('Malignance'); push("Zhonya's Hourglass"); push("Rabadon's Deathcap");
  } else if (isMarksman) {
    push('Infinity Edge'); push('Lord Dominik\'s Regards'); push('Guardian Angel');
  } else {
    push('Stridebreaker'); push('Black Cleaver'); push("Sterak's Gage");
  }
  if (needsAntiHeal) push(antiHeal);
  if (draft.heavyAp) { push('Kaenic Rookern'); push('Force of Nature'); }
  if (draft.heavyAd) { push("Randuin's Omen"); push('Frozen Heart'); }
  if (isSupport) { push('Trailblazer'); push("Knight's Vow"); }
  push('Guardian Angel');

  const expected = isMarksman ? 7 : 6;
  const finalCore = core.slice(0, expected);
  const starting = isSupport
    ? ['World Atlas', 'Health Potion']
    : isJungle
      ? ['Gustwalker Hatchling', 'Health Potion']
      : ["Doran's Blade", 'Health Potion'];

  const text = [
    'ANALYSIS',
    `Matchup Type: Fallback validated plan for ${champ} ${body?.role || role}.`,
    `Enemy Damage Split: ${draft.ap} AP / ${draft.ad} AD / ${draft.hybrid} mixed. ${draft.heavyAp ? 'MR is the first defensive priority.' : draft.heavyAd ? 'Armor is the first defensive priority.' : 'Balanced defenses are acceptable.'}`,
    `Key Threats: ${(body?.enemies || []).slice(0, 2).join(', ') || 'enemy draft'}.`,
    `Survivability Requirement: ${boots} plus ${draft.heavyAp ? 'magic resist' : draft.heavyAd ? 'armor' : 'health and role-safe defenses'}.`,
    `Item Priorities: Base Build: fallback from validated patch data because no exact U.GG role page was usable. ${isSupport ? `${supportUpgrade} is required for support economy.` : ''} ${needsAntiHeal ? `${antiHeal} covers enemy healing.` : ''}`,
    '',
    'RUNES',
    tags.includes('Mage') ? 'Primary: Domination' : 'Primary: Precision',
    tags.includes('Mage') ? 'Keystone: Electrocute' : 'Keystone: Conqueror',
    tags.includes('Mage') ? 'Cheap Shot' : 'Absorb Life',
    tags.includes('Mage') ? 'Eyeball Collection' : 'Triumph',
    tags.includes('Mage') ? 'Ultimate Hunter' : 'Legend: Alacrity',
    'Secondary: Resolve',
    'Conditioning',
    'Overgrowth',
    'Shards: Adaptive Force, Adaptive Force, Health Scaling',
    '',
    'SUMMONERS',
    'Flash',
    isJungle ? 'Smite' : isSupport ? 'Ignite' : 'Teleport',
    '',
    'SKILL ORDER',
    'Q > E > W > R',
    '',
    'STARTING ITEMS',
    ...starting,
    '',
    'CORE BUILD',
    ...finalCore.map((item, index) => `${index + 1}. ${item} (${index === 0 && item === supportUpgrade ? 'support quest upgrade' : 'role-safe validated item'})`),
    '',
    'SITUATIONAL ITEMS',
    'Locket of the Iron Solari: buy when teamwide burst mitigation matters.',
    "Knight's Vow: buy when your carry needs peel.",
    'Trailblazer: buy when engage movement and support utility matter.',
    'Guardian Angel: buy if you are a key engage target and need a second life.',
    '',
    'WIN CONDITION',
    `${champ} ${body?.role || role} should play around controlled engages and protect the carry economy. Do not turn the support slot into a greedy solo-lane build; keep support utility while covering the enemy damage profile.`,
  ].join('\n');

  let safe = enforceRoleSafeItems(text, body);
  safe = repairStartingItems(safe, body);
  safe = dedupeAndPadCoreBuild(safe, body);
  safe = enforceDraftCounterLogic(safe, body, mechanicsMap);
  safe = enforceRoleSafeItems(safe, body);
  safe = dedupeAndPadCoreBuild(safe, body);
  safe = sanitizeNarrativeAgainstFinalItems(safe, body, mechanicsMap);
  safe = sanitizeEnemyRoleClaims(safe, body);
  return stripDecisionTrace(safe);
}

function countChangedItems(baseItems, finalItems) {
  const norm = (value) => String(value || '').toLowerCase().replace(/['']/g, "'").trim();
  const baseSet = new Set(baseItems.map(norm));
  const finalSet = new Set(finalItems.map(norm));
  let added = 0;
  let removed = 0;
  for (const item of finalSet) if (!baseSet.has(item)) added++;
  for (const item of baseSet) if (!finalSet.has(item)) removed++;
  return { added, removed, total: Math.max(added, removed) };
}

const CHAMPION_DAMAGE_CLASS_OVERRIDES = {
  Ahri: 'AP',
  Akali: 'AP',
  Anivia: 'AP',
  Annie: 'AP',
  AurelionSol: 'AP',
  Azir: 'AP',
  Brand: 'AP',
  Cassiopeia: 'AP',
  Diana: 'AP',
  Ekko: 'AP',
  Elise: 'AP',
  Evelynn: 'AP',
  Fiddlesticks: 'AP',
  Fizz: 'AP',
  Galio: 'AP',
  Gragas: 'AP',
  Gwen: 'AP',
  Heimerdinger: 'AP',
  Hwei: 'AP',
  Ivern: 'AP',
  Karthus: 'AP',
  Kassadin: 'AP',
  Katarina: 'AP',
  Kennen: 'AP',
  Leblanc: 'AP',
  LeBlanc: 'AP',
  Lillia: 'AP',
  Lissandra: 'AP',
  Malzahar: 'AP',
  Mordekaiser: 'AP',
  Morgana: 'AP',
  Neeko: 'AP',
  Nidalee: 'AP',
  Orianna: 'AP',
  Rumble: 'AP',
  Ryze: 'AP',
  Seraphine: 'AP',
  Singed: 'AP',
  Swain: 'AP',
  Sylas: 'AP',
  Syndra: 'AP',
  Taliyah: 'AP',
  Teemo: 'AP',
  TwistedFate: 'AP',
  Veigar: 'AP',
  Velkoz: 'AP',
  Vex: 'AP',
  Viktor: 'AP',
  Vladimir: 'AP',
  Xerath: 'AP',
  Ziggs: 'AP',
  Zoe: 'AP',
  Zyra: 'AP',
  Zed: 'AD',
  Talon: 'AD',
  Naafiri: 'AD',
  Qiyana: 'AD',
  Rengar: 'AD',
  Khazix: 'AD',
  KhaZix: 'AD',
  Pyke: 'AD',
  Yasuo: 'AD',
  Yone: 'AD',
  Tryndamere: 'AD',
  Kayn: 'AD',
};

function championDamageOverride(champion) {
  const compact = String(champion || '').replace(/[\s.'-]/g, '');
  return CHAMPION_DAMAGE_CLASS_OVERRIDES[compact] || CHAMPION_DAMAGE_CLASS_OVERRIDES[String(champion || '')] || '';
}

function inferDamageFromTagsAndInfo(champion, mechanicsMap = null) {
  const override = championDamageOverride(champion);
  if (override) return override;
  const mech = mechanicsMap?.get(champion);
  if (mech?.dmg) return mech.dmg;
  const cache = ddragonChampCache || null;
  const data = cache?.get(champion);
  const tags = data?.tags || [];
  const info = data?.info || {};

  if (tags.includes('Mage')) return 'AP';
  if (tags.includes('Marksman')) return 'AD';
  if (tags.includes('Assassin') && info.magic > info.attack + 1) return 'AP';
  if (tags.includes('Support') && !tags.includes('Fighter') && !tags.includes('Marksman')) return 'AP';
  if (info.magic > info.attack + 2) return 'AP';
  if (info.attack > info.magic + 2) return 'AD';
  if (info.magic > 4 && info.attack > 4) return 'HYBRID';
  return 'UNKNOWN';
}

const KNOWN_SUPPRESSION_CHAMPIONS = new Set([
  'Malzahar',
  'Skarner',
  'Urgot',
  'Warwick',
  'Sett',
]);

function analyzeEnemyDraft(enemies, mechanicsMap = null) {
  const result = {
    ap: 0,
    ad: 0,
    hybrid: 0,
    tanks: 0,
    hardCc: 0,
    suppression: 0,
    enchanterHealing: 0,
    selfHealingFrontliners: 0,
  };
  for (const raw of enemies || []) {
    const dmg = inferDamageFromTagsAndInfo(raw, mechanicsMap);
    if (dmg === 'AP') result.ap++;
    else if (dmg === 'AD') result.ad++;
    else if (dmg === 'HYBRID') result.hybrid++;
    const tags = getChampionTags(raw);
    const mech = mechanicsMap?.get(raw);
    const ccList = mech?.cc || [];
    const hasSuppression = ccList.some(c => c.type === 'SUPPRESSION')
      || mech?.ult?.type === 'SUPPRESSION'
      || KNOWN_SUPPRESSION_CHAMPIONS.has(String(raw || '').replace(/\s+/g, ''));
    if (tags.includes('Tank')) result.tanks++;
    if (ccList.some(c => c.type === 'HARD_CC' || c.type === 'SUPPRESSION' || c.type === 'DISPLACEMENT') || hasSuppression) result.hardCc++;
    if (hasSuppression) result.suppression++;
    if (mech?.healThreat && tags.includes('Support')) result.enchanterHealing++;
    if (mech?.healThreat && !tags.includes('Support')) result.selfHealingFrontliners++;
  }
  result.effectiveAp = result.ap + result.hybrid * 0.5;
  result.effectiveAd = result.ad + result.hybrid * 0.5;
  result.heavyAp = result.ap >= 3 || result.effectiveAp >= result.effectiveAd + 1.5;
  result.heavyAd = result.ad >= 4 && !result.heavyAp;
  result.highCc = result.hardCc >= 3;
  return result;
}

function stabilizeAgainstMetaBaseline(finalText, metaText) {
  if (!finalText || !metaText) return finalText;
  let stabilized = finalText;

  for (const title of ['SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS']) {
    const baselineContent = extractBuildSection(metaText, title);
    if (baselineContent) stabilized = replaceBuildSection(stabilized, title, baselineContent);
  }

  const baseCore = sectionItems(metaText, 'CORE BUILD');
  const finalCore = sectionItems(stabilized, 'CORE BUILD');
  const changeCount = countChangedItems(baseCore, finalCore);
  if (baseCore.length && finalCore.length && changeCount.total > 2) {
    stabilized = replaceBuildSection(stabilized, 'CORE BUILD', extractBuildSection(metaText, 'CORE BUILD'));
    const analysis = extractBuildSection(stabilized, 'ANALYSIS');
    if (analysis && !/item stability/i.test(analysis)) {
      stabilized = replaceBuildSection(
        stabilized,
        'ANALYSIS',
        `${analysis}\nItem Stability: Preserved the U.GG core because the draft did not justify more than two baseline swaps.`
      );
    }
  }

  return stabilized;
}

function getChampionTags(champion) {
  try {
    const cache = ddragonChampCache || null;
    const found = cache?.get(champion);
    return found?.tags || [];
  } catch {
    return [];
  }
}

const SUPPORT_QUEST_UPGRADES = ['Bloodsong', 'Celestial Opposition', 'Dream Maker', 'Solstice Sleigh', "Zaz'Zak's Realmspike"];

function supportQuestUpgradeForChampion(champion, tags, mechanicsMap = null) {
  const dmg = inferDamageFromTagsAndInfo(champion, mechanicsMap);
  if (dmg === 'AP' || tags.includes('Mage')) return "Zaz'Zak's Realmspike";
  if (tags.includes('Fighter') || tags.includes('Assassin') || tags.includes('Marksman')) return 'Bloodsong';
  if (tags.includes('Tank')) return 'Celestial Opposition';
  if (tags.includes('Support')) return 'Dream Maker';
  return 'Celestial Opposition';
}

const OFF_CLASS_AP_ITEMS = [
  "Zhonya's Hourglass",
  "Rabadon's Deathcap",
  'Shadowflame',
  'Malignance',
  "Luden's Echo",
  'Void Staff',
  'Morellonomicon',
];

const OFF_CLASS_AD_ITEMS_FOR_AP = [
  'Mercurial Scimitar',
  'Mortal Reminder',
  'Chempunk Chainsword',
  'Black Cleaver',
  "Serylda's Grudge",
  "Lord Dominik's Regards",
  'Terminus',
  'Maw of Malmortius',
  "Death's Dance",
  "Sterak's Gage",
];

function championCanUseMercurial(body, mechanicsMap = null) {
  const role = String(body?.role || '').toLowerCase();
  const tags = getChampionTags(body?.myChampion);
  const dmg = inferDamageFromTagsAndInfo(body?.myChampion, mechanicsMap);
  if (/support/.test(role)) return false;
  if (/^(adc|bot|bottom)$/.test(role) || tags.includes('Marksman')) return true;
  return dmg === 'AD' && !tags.includes('Mage');
}

function apClassDefenseCandidates(body, draft = null) {
  const role = String(body?.role || '').toLowerCase();
  if (/support/.test(role)) return ["Mikael's Blessing", "Banshee's Veil", 'Redemption', 'Locket of the Iron Solari'];
  return ["Banshee's Veil", "Zhonya's Hourglass", 'Cryptbloom', 'Cosmic Drive', "Rabadon's Deathcap"];
}

function replaceFirstCoreMatch(text, matchNames, replacementName, reason) {
  const core = extractBuildSection(text, 'CORE BUILD');
  if (!core) return text;
  const normKey = (value) => String(value || '').toLowerCase().replace(/[â€™']/g, "'").trim();
  const matchSet = new Set(matchNames.map(normKey));
  const existing = sectionItems(text, 'CORE BUILD').map(item => item.toLowerCase());
  if (existing.includes(replacementName.toLowerCase())) return text;

  let changed = false;
  const next = core.split('\n').map(line => {
    const item = normalizeBuildLine(line);
    if (!changed && matchSet.has(normKey(item))) {
      changed = true;
      const prefix = line.match(/^(\s*\d+[.)]\s*)/)?.[1] || '';
      return `${prefix}${replacementName} (${reason})`;
    }
    return line;
  });
  return changed ? replaceBuildSection(text, 'CORE BUILD', next.join('\n')) : text;
}

function replaceFirstCoreMatchWithCandidates(text, matchNames, replacementNames, reason) {
  const existing = sectionItems(text, 'CORE BUILD').map(item => item.toLowerCase());
  const replacement = replacementNames.find(name => !existing.includes(name.toLowerCase()));
  if (!replacement) return text;
  return replaceFirstCoreMatch(text, matchNames, replacement, reason);
}

function replaceAllCoreMatchesWithCandidates(text, matchNames, replacementNames, reason) {
  const core = extractBuildSection(text, 'CORE BUILD');
  if (!core) return text;
  const normKey = (value) => String(value || '').toLowerCase().replace(/[Ã¢â‚¬â„¢']/g, "'").trim();
  const matchSet = new Set(matchNames.map(normKey));
  const used = new Set(sectionItems(text, 'CORE BUILD').map(normKey));
  let changed = false;

  const next = core.split('\n').map(line => {
    const item = normalizeBuildLine(line);
    if (!matchSet.has(normKey(item))) return line;
    const replacement = replacementNames.find(name => !used.has(normKey(name)));
    if (!replacement) return '';
    changed = true;
    used.add(normKey(replacement));
    const prefix = line.match(/^(\s*\d+[.)]\s*)/)?.[1] || '';
    return `${prefix}${replacement} (${reason})`;
  }).filter(line => line.trim());

  return changed ? replaceBuildSection(text, 'CORE BUILD', next.join('\n')) : text;
}

function ensureSupportQuestUpgrade(finalText, body, tags) {
  if (!finalText || !body) return finalText;
  const role = String(body.role || '').toLowerCase();
  if (!/support/.test(role)) return finalText;
  const desired = supportQuestUpgradeForChampion(body.myChampion, tags);
  const coreItems = sectionItems(finalText, 'CORE BUILD');
  if (coreItems.some(item => SUPPORT_QUEST_UPGRADES.some(upgrade => upgrade.toLowerCase() === item.toLowerCase()))) {
    return finalText;
  }

  const replacePriority = [
    "Zhonya's Hourglass", "Rabadon's Deathcap", 'Shadowflame', 'Malignance', "Luden's Echo", 'Void Staff',
    'Banshee\'s Veil', 'Guardian Angel', 'Force of Nature', 'Kaenic Rookern',
  ];
  let safe = replaceFirstCoreMatch(
    finalText,
    replacePriority,
    desired,
    'support quest upgrade for support economy'
  );
  if (safe !== finalText) return safe;

  const core = extractBuildSection(finalText, 'CORE BUILD');
  if (!core) return finalText;
  const lines = core.split('\n').filter(line => line.trim());
  lines.unshift(`1. ${desired} (support quest upgrade for support economy)`);
  const renumbered = lines.slice(0, 6).map((line, index) => {
    const clean = line.replace(/^\s*\d+[.)]\s*/, '').trim();
    return `${index + 1}. ${clean}`;
  }).join('\n');
  return enforceBootInvariant(replaceBuildSection(finalText, 'CORE BUILD', renumbered), body);
}

function enforceRoleSafeItems(finalText, body) {
  if (!finalText || !body) return finalText;
  const role = String(body.role || '').toLowerCase();
  const tags = getChampionTags(body.myChampion);
  const isMarksmanRole = /^(adc|bot|bottom)$/.test(role);
  const isSupportRole = /support/.test(role);
  const isMarksman = isMarksmanRole || tags.includes('Marksman');
  const champDmg = inferDamageFromTagsAndInfo(body.myChampion);
  const isApChampion = champDmg === 'AP' || tags.includes('Mage');
  const utilitySupports = new Set([
    'Alistar', 'Bard', 'Blitzcrank', 'Braum', 'Janna', 'Leona', 'Lulu', 'Milio',
    'Nami', 'Nautilus', 'Rakan', 'Rell', 'Renata', 'RenataGlasc', 'Senna',
    'Sona', 'Soraka', 'TahmKench', 'Taric', 'Thresh', 'Yuumi', 'Zilean',
  ]);
  const isUtilitySupport = isSupportRole && (tags.includes('Support') || utilitySupports.has(body.myChampion));
  let safe = finalText;

  if (!isApChampion) {
    const nonApReplacements = isSupportRole
      ? [supportQuestUpgradeForChampion(body.myChampion, tags), 'Trailblazer', "Knight's Vow", 'Locket of the Iron Solari', 'Redemption']
      : tags.includes('Tank') && !tags.includes('Fighter')
        ? ["Jak'Sho, The Protean", "Randuin's Omen", 'Force of Nature', 'Frozen Heart', "Dead Man's Plate", 'Guardian Angel']
        : tags.includes('Marksman') || isMarksmanRole
          ? ['Guardian Angel', 'Mercurial Scimitar', 'Maw of Malmortius', 'Bloodthirster', 'Rapid Firecannon']
          : ["Death's Dance", "Sterak's Gage", 'Guardian Angel', 'Maw of Malmortius', "Randuin's Omen", 'Force of Nature'];
    safe = replaceAllCoreMatchesWithCandidates(
      safe,
      OFF_CLASS_AP_ITEMS,
      nonApReplacements,
      isSupportRole ? 'support quest upgrade; off-class AP stasis/carry item removed' : 'role-safe defensive item; off-class AP item removed'
    );
  }

  if (isApChampion && !isMarksman) {
    const apFallbacks = apClassDefenseCandidates(body);
    safe = replaceAllCoreMatchesWithCandidates(
      safe,
      OFF_CLASS_AD_ITEMS_FOR_AP,
      apFallbacks,
      'AP class-safe item; off-class AD/QSS item removed'
    );
    safe = rewriteItemsInSection(safe, 'SITUATIONAL ITEMS', (item, line, used) => {
      if (!exactItemMatch(item, OFF_CLASS_AD_ITEMS_FOR_AP)) return line;
      const replacement = firstAvailableItem(apFallbacks, used, OFF_CLASS_AD_ITEMS_FOR_AP);
      return replacement
        ? lineWithReplacement(line, replacement, itemIntentReason(replacement, body, analyzeEnemyDraft(body.enemies || [])))
        : null;
    });
  }

  if (isSupportRole) {
    safe = ensureSupportQuestUpgrade(safe, body, tags);
    safe = replaceFirstCoreMatchWithCandidates(
      safe,
      OFF_CLASS_AP_ITEMS,
      ['Trailblazer', "Knight's Vow", 'Locket of the Iron Solari', 'Celestial Opposition', 'Redemption'],
      'support-role economy item; off-class AP carry item removed'
    );
  }

  if (isMarksman) {
    const coreItems = sectionItems(safe, 'CORE BUILD');
    const illegalForMarksman = new Set(["Zhonya's Hourglass"]);
    if (coreItems.some(item => illegalForMarksman.has(item))) {
      const rewritten = extractBuildSection(safe, 'CORE BUILD')
        .split('\n')
        .map(line => illegalForMarksman.has(normalizeBuildLine(line))
          ? line.replace(/Zhonya's Hourglass/i, coreItems.some(item => item === 'Guardian Angel') ? 'Mercurial Scimitar' : 'Guardian Angel')
          : line)
        .join('\n');
      safe = replaceBuildSection(safe, 'CORE BUILD', rewritten);
    }
  }

  if (isUtilitySupport) {
    const expensiveCarryItems = ["Infinity Edge", "Lord Dominik's Regards", "Bloodthirster", "Mortal Reminder", "Thornmail", "Morellonomicon", "Rabadon's Deathcap", "Youmuu's Ghostblade"];
    const core = extractBuildSection(safe, 'CORE BUILD');
    if (core && expensiveCarryItems.some(item => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(core))) {
      const supportFallbacks = ['Redemption', "Mikael's Blessing", 'Trailblazer', "Knight's Vow", 'Locket of the Iron Solari', 'Dawncore'];
      const used = new Set(sectionItems(safe, 'CORE BUILD').map(item => item.toLowerCase()));
      const filtered = core.split('\n').map(line => {
        const item = normalizeBuildLine(line);
        if (!expensiveCarryItems.some(bad => item.toLowerCase() === bad.toLowerCase())) return line;
        const replacement = supportFallbacks.find(candidate => !used.has(candidate.toLowerCase())) || 'Redemption';
        used.add(replacement.toLowerCase());
        return line.replace(item, replacement);
      }).join('\n');
      safe = replaceBuildSection(safe, 'CORE BUILD', filtered);
    }
  }

  return safe;
}

function dedupeAndPadCoreBuild(finalText, body) {
  if (!finalText || !body) return finalText;
  const role = String(body.role || '').toLowerCase();
  const mapId = body.gameMode === 'aram' || body.gameMode === 'aram-mayhem' ? 12 : 11;
  const coreContent = extractBuildSection(finalText, 'CORE BUILD');
  if (!coreContent) return finalText;

  const isSupportBuild = /support|utility/.test(role)
    || sectionItems(finalText, 'STARTING ITEMS').some(item => /World Atlas/i.test(item));
  const tags = getChampionTags(body.myChampion);
  const champDmg = inferDamageFromTagsAndInfo(body.myChampion);
  const isApChampion = champDmg === 'AP' || tags.includes('Mage');
  const expected = /^(adc|bot|bottom)$/.test(role) ? 7 : 6;
  const fillByRole = isSupportBuild
    ? ['Redemption', "Mikael's Blessing", 'Trailblazer', "Knight's Vow", 'Locket of the Iron Solari', 'Dawncore']
    : /^(adc|bot|bottom)$/.test(role)
      ? ['Guardian Angel', 'Bloodthirster', 'Mercurial Scimitar', 'Maw of Malmortius', "Runaan's Hurricane", 'Rapid Firecannon']
      : /jungle|top/.test(role)
        ? ['Death\'s Dance', 'Sterak\'s Gage', 'Guardian Angel', 'Force of Nature', 'Randuin\'s Omen', 'Frozen Heart']
        : isApChampion
          ? ['Guardian Angel', 'Zhonya\'s Hourglass', 'Banshee\'s Veil', 'Void Staff', 'Rabadon\'s Deathcap']
          : ['Guardian Angel', 'Death\'s Dance', 'Sterak\'s Gage', 'Maw of Malmortius', 'Randuin\'s Omen', 'Force of Nature'];

  let kept = [];
  const used = new Set();
  for (const line of coreContent.split('\n')) {
    const item = normalizeBuildLine(line);
    if (!item) continue;
    if (!isKnownCompletedStoreItemName(item, mapId)) continue;
    const key = item.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    kept.push(line);
  }

  if (isSupportBuild) {
    const supportUpgrade = supportQuestUpgradeForChampion(body.myChampion, tags);
    const illegalSupportCore = isApChampion
      ? new Set()
      : new Set(["zhonya's hourglass", "rabadon's deathcap", 'shadowflame', 'malignance', "luden's echo", 'void staff', 'morellonomicon']);

    kept = kept.filter(line => {
      const item = normalizeBuildLine(line).toLowerCase().replace(/[â€™']/g, "'");
      return !illegalSupportCore.has(item) && !SUPPORT_QUEST_UPGRADES.some(upgrade => upgrade.toLowerCase() === item);
    });
    used.clear();
    for (const line of kept) used.add(normalizeBuildLine(line).toLowerCase());

    kept.unshift(`1. ${supportUpgrade} (support quest upgrade from World Atlas)`);
    used.add(supportUpgrade.toLowerCase());
  }

  if (!isApChampion) {
    const illegalNonAp = new Set(OFF_CLASS_AP_ITEMS.map(item => item.toLowerCase()));
    kept = kept.filter(line => {
      const item = normalizeBuildLine(line).toLowerCase().replace(/[Ã¢â‚¬â„¢']/g, "'");
      return !illegalNonAp.has(item);
    });
    used.clear();
    for (const line of kept) used.add(normalizeBuildLine(line).toLowerCase());
  }

  for (const filler of fillByRole) {
    if (kept.length >= expected) break;
    const key = filler.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    kept.push(`${kept.length + 1}. ${filler} (role-safe completion item)`);
  }

  const renumbered = kept.slice(0, expected).map((line, index) => {
    let clean = line.replace(/^\s*\d+[.)]\s*/, '').trim();
    if (/\b(wait|let'?s|we have|need \d|core is \d|reference has)\b/i.test(clean)) {
      clean = `${clean.split('(')[0].trim()} (role-safe validated item)`;
    }
    clean = clean.replace(
      /Sundered Sky\s*\([^)]*(?:anti-heal|grievous|damage reduction|true damage|%HP|shield)[^)]*\)/i,
      'Sundered Sky (dueling sustain and health for extended fights)'
    );
    clean = clean.replace(/Serylda's Grudge\s*\([^)]*%HP[^)]*\)/i, "Serylda's Grudge (armor penetration and slow utility)");
    return `${index + 1}. ${clean}`;
  }).join('\n');

  return enforceBootInvariant(replaceBuildSection(finalText, 'CORE BUILD', renumbered), body);
}

function sanitizeNarrativeAgainstFinalItems(finalText, body, mechanicsMap = null) {
  if (!finalText || !body) return finalText;
  const role = String(body.role || '').toLowerCase();
  const tags = getChampionTags(body.myChampion);
  const champDmg = inferDamageFromTagsAndInfo(body.myChampion, mechanicsMap);
  const isSupport = /support/.test(role) || sectionItems(finalText, 'STARTING ITEMS').some(item => /World Atlas/i.test(item));
  const isApChampion = champDmg === 'AP' || tags.includes('Mage');
  const allItems = [
    ...sectionItems(finalText, 'CORE BUILD'),
    ...sectionItems(finalText, 'SITUATIONAL ITEMS'),
  ].map(item => item.toLowerCase().replace(/[â€™']/g, "'"));
  const hasItem = (name) => allItems.some(item => item === String(name || '').toLowerCase().replace(/[â€™']/g, "'"));
  const preferredAntiHeal = antiHealItemForChampion(body.myChampion, role, mechanicsMap);
  const supportUpgrade = supportQuestUpgradeForChampion(body.myChampion, tags, mechanicsMap);
  const fallbackDefense = isApChampion
    ? (hasItem("Banshee's Veil") ? "Banshee's Veil" : hasItem("Zhonya's Hourglass") ? "Zhonya's Hourglass" : 'class-appropriate AP defensive itemization')
    : hasItem('Mercurial Scimitar')
    ? 'Mercurial Scimitar'
    : hasItem('Guardian Angel')
    ? 'Guardian Angel'
    : hasItem("Sterak's Gage")
      ? "Sterak's Gage"
      : 'role-safe defensive itemization';

  const itemRewrites = [
    { item: "Zhonya's Hourglass", aliases: ["Zhonya's Hourglass", "Zhonya's"], force: !isApChampion, replacement: !isApChampion ? fallbackDefense : null },
    { item: "Rabadon's Deathcap", aliases: ["Rabadon's Deathcap", "Rabadon's"], force: !isApChampion, replacement: !isApChampion ? (isSupport ? supportUpgrade : fallbackDefense) : null },
    { item: 'Shadowflame', aliases: ['Shadowflame'], force: !isApChampion, replacement: !isApChampion ? (isSupport ? supportUpgrade : fallbackDefense) : null },
    { item: 'Malignance', aliases: ['Malignance'], force: !isApChampion, replacement: !isApChampion ? (isSupport ? supportUpgrade : fallbackDefense) : null },
    { item: "Luden's Echo", aliases: ["Luden's Echo", "Luden's"], force: !isApChampion, replacement: !isApChampion ? (isSupport ? supportUpgrade : fallbackDefense) : null },
    { item: 'Void Staff', aliases: ['Void Staff'], force: !isApChampion, replacement: !isApChampion ? (isSupport ? supportUpgrade : fallbackDefense) : null },
    { item: 'Thornmail', aliases: ['Thornmail'], force: isSupport, replacement: hasItem('Thornmail') && !isSupport ? null : (hasItem(preferredAntiHeal) ? preferredAntiHeal : 'class-appropriate anti-heal') },
    { item: 'Mortal Reminder', aliases: ['Mortal Reminder'], force: isSupport, replacement: hasItem('Mortal Reminder') && !isSupport ? null : (hasItem(preferredAntiHeal) ? preferredAntiHeal : 'class-appropriate anti-heal') },
    { item: 'Morellonomicon', aliases: ['Morellonomicon'], force: isSupport, replacement: hasItem('Morellonomicon') && !isSupport ? null : (hasItem(preferredAntiHeal) ? preferredAntiHeal : 'class-appropriate anti-heal') },
    { item: 'Mercurial Scimitar', aliases: ['Mercurial Scimitar', 'Quicksilver Sash', 'QSS'], force: isApChampion, replacement: isApChampion ? fallbackDefense : null },
  ];

  let safe = finalText;
  for (const section of ['ANALYSIS', 'SITUATIONAL ITEMS', 'ENEMY POWER SPIKES', 'WIN CONDITION', 'YOUR POWER SPIKES']) {
    let content = extractBuildSection(safe, section);
    if (!content) continue;
    for (const { item, aliases, replacement, force } of itemRewrites) {
      if (!replacement || (!force && hasItem(item))) continue;
      const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "[â€™']");
      content = content.replace(new RegExp(escaped, 'gi'), replacement);
      for (const alias of aliases || []) {
        if (alias === item) continue;
        const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "[Ã¢â‚¬â„¢']");
        content = content.replace(new RegExp(aliasEscaped, 'gi'), replacement);
      }
    }
    content = content
      .replace(/Mercurial Scimitar\s+and\s+Mercurial Scimitar/gi, 'Mercurial Scimitar')
      .replace(/Sundered Sky\s+and\s+Serylda's Grudge while kiting with Serylda's slow/gi, "Sundered Sky and Serylda's Grudge for sustain, armor penetration, and slow utility");
    if (isSupport && !/support economy|World Atlas|quest upgrade/i.test(content) && section === 'WIN CONDITION') {
      content += ` Keep the ${supportUpgrade} support upgrade as the automatic World Atlas completion, not as a delayed luxury slot.`;
    }
    safe = replaceBuildSection(safe, section, content);
  }

  const coreSet = new Set(sectionItems(safe, 'CORE BUILD').map(item => item.toLowerCase().replace(/[Ã¢â‚¬â„¢']/g, "'")));
  const situational = extractBuildSection(safe, 'SITUATIONAL ITEMS');
  if (situational) {
    const filtered = situational
      .split('\n')
      .filter(line => {
        const item = normalizeBuildLine(line).toLowerCase().replace(/[Ã¢â‚¬â„¢']/g, "'");
        return item && !coreSet.has(item);
      })
      .join('\n');
    if (filtered.trim()) safe = replaceBuildSection(safe, 'SITUATIONAL ITEMS', filtered);
  }
  return sanitizeItemFactClaims(safe);
}

function repairStartingItems(finalText, body) {
  if (!finalText || !body) return finalText;
  const role = String(body.role || '').toLowerCase();
  if (/support/.test(role)) {
    return replaceBuildSection(finalText, 'STARTING ITEMS', 'World Atlas\nHealth Potion');
  }
  if (/jungle/.test(role)) {
    const starting = sectionItems(finalText, 'STARTING ITEMS');
    if (!starting.some(item => /hatchling|seedling|pup/i.test(item))) {
      return replaceBuildSection(finalText, 'STARTING ITEMS', 'Gustwalker Hatchling\nHealth Potion');
    }
  }
  return finalText;
}

function replaceCoreItemByName(text, fromNames, toName, reason) {
  const core = extractBuildSection(text, 'CORE BUILD');
  if (!core) return text;
  const fromSet = new Set(fromNames.map(name => name.toLowerCase()));
  const lines = core.split('\n');
  const existing = sectionItems(text, 'CORE BUILD').map(item => item.toLowerCase());
  if (existing.includes(toName.toLowerCase())) return text;

  let changed = false;
  const next = lines.map(line => {
    const item = normalizeBuildLine(line).toLowerCase();
    if (!changed && fromSet.has(item)) {
      changed = true;
      const prefix = line.match(/^(\s*\d+[.)]\s*)/)?.[1] || '';
      return `${prefix}${toName} (${reason})`;
    }
    return line;
  });
  return changed ? replaceBuildSection(text, 'CORE BUILD', next.join('\n')) : text;
}

const BOOT_ITEMS = [
  'Plated Steelcaps',
  "Mercury's Treads",
  'Boots of Swiftness',
  "Berserker's Greaves",
  'Ionian Boots of Lucidity',
  "Sorcerer's Shoes",
  'Symbiotic Soles',
];

function isBootItemName(name) {
  return exactItemMatch(name, BOOT_ITEMS);
}

function chooseBootsForBuild(body, mechanicsMap = null) {
  const role = String(body?.role || '').toLowerCase();
  const tags = getChampionTags(body?.myChampion);
  const draft = analyzeEnemyDraft(body?.enemies || [], mechanicsMap);
  const champDmg = inferDamageFromTagsAndInfo(body?.myChampion, mechanicsMap);
  const isMarksman = /^(adc|bot|bottom)$/.test(role) || tags.includes('Marksman');
  const isApChampion = champDmg === 'AP' || tags.includes('Mage');
  const isSupport = /support|utility/.test(role);

  if (draft.heavyAd && draft.effectiveAp < 1.5) return 'Plated Steelcaps';
  if (draft.heavyAp || draft.highCc) return "Mercury's Treads";
  if (draft.ad >= 3) return 'Plated Steelcaps';
  if (isMarksman) return "Berserker's Greaves";
  if (isApChampion) return "Sorcerer's Shoes";
  if (isSupport) return 'Ionian Boots of Lucidity';
  return 'Plated Steelcaps';
}

function enforceBootInvariant(finalText, body, mechanicsMap = null) {
  if (!finalText || !body) return finalText;
  const core = extractBuildSection(finalText, 'CORE BUILD');
  if (!core) return finalText;

  const role = String(body.role || '').toLowerCase();
  const expected = /^(adc|bot|bottom)$/.test(role) ? 7 : 6;
  const desiredBoots = chooseBootsForBuild(body, mechanicsMap);
  const originalLines = core.split('\n').filter(line => line.trim());
  const bootLines = originalLines.filter(line => isBootItemName(normalizeBuildLine(line)));
  const hasDesired = bootLines.some(line => itemKey(normalizeBuildLine(line)) === itemKey(desiredBoots));
  const chosenBoots = hasDesired ? desiredBoots : (bootLines[0] ? normalizeBuildLine(bootLines[0]) : desiredBoots);
  const draft = analyzeEnemyDraft(body?.enemies || [], mechanicsMap);
  const shouldForceCounterBoots = draft.heavyAd || draft.heavyAp || draft.highCc || draft.ad >= 3;
  const finalBoots = shouldForceCounterBoots ? desiredBoots : chosenBoots;
  const bootReason = finalBoots === 'Plated Steelcaps'
    ? 'armor vs physical pressure'
    : finalBoots === "Mercury's Treads"
      ? 'tenacity and magic resist vs AP/CC pressure'
      : finalBoots === "Berserker's Greaves"
        ? 'attack speed for DPS uptime'
        : finalBoots === "Sorcerer's Shoes"
          ? 'magic penetration for AP damage'
          : finalBoots === 'Ionian Boots of Lucidity'
            ? 'haste and spell tempo'
            : 'movement utility';

  const withoutBoots = originalLines.filter(line => !isBootItemName(normalizeBuildLine(line)));
  const insertIndex = /support|utility/.test(role) ? Math.min(1, withoutBoots.length) : Math.min(1, withoutBoots.length);
  withoutBoots.splice(insertIndex, 0, `${finalBoots} (${bootReason})`);

  const renumbered = withoutBoots.slice(0, expected).map((line, index) => {
    const clean = line.replace(/^\s*\d+[.)]\s*/, '').trim();
    return `${index + 1}. ${clean}`;
  }).join('\n');

  return replaceBuildSection(finalText, 'CORE BUILD', renumbered);
}

function ensureCoreItem(text, itemName, reason, insertIndex = 0) {
  const core = extractBuildSection(text, 'CORE BUILD');
  if (!core || !itemName) return text;
  const existing = sectionItems(text, 'CORE BUILD').map(item => item.toLowerCase());
  if (existing.includes(itemName.toLowerCase())) return text;
  const lines = core.split('\n').filter(line => line.trim());
  const safeIndex = Math.max(0, Math.min(insertIndex, lines.length));
  lines.splice(safeIndex, 0, `${itemName} (${reason})`);
  return replaceBuildSection(text, 'CORE BUILD', lines.join('\n'));
}

function replaceSituationalItemByName(text, fromNames, toName, reason) {
  const section = extractBuildSection(text, 'SITUATIONAL ITEMS');
  if (!section) return text;
  const fromSet = new Set(fromNames.map(name => name.toLowerCase()));
  const existing = [
    ...sectionItems(text, 'CORE BUILD'),
    ...sectionItems(text, 'SITUATIONAL ITEMS'),
  ].map(item => item.toLowerCase());
  const lines = section.split('\n');

  let changed = false;
  const next = lines.map(line => {
    const item = normalizeBuildLine(line).toLowerCase();
    if (!changed && fromSet.has(item) && !existing.includes(toName.toLowerCase())) {
      changed = true;
      const prefix = line.match(/^(\s*\d+[.)]\s*)/)?.[1] || '';
      return `${prefix}${toName} (${reason})`;
    }
    if (!changed && fromSet.has(item)) {
      changed = true;
      return '';
    }
    return line;
  }).filter(line => line.trim());

  const renumbered = next.map((line, index) => {
    const clean = line.replace(/^\s*\d+[.)]\s*/, '').trim();
    return `${index + 1}. ${clean}`;
  }).join('\n');
  return changed ? replaceBuildSection(text, 'SITUATIONAL ITEMS', renumbered) : text;
}

function ensureSituationalItem(text, itemName, reason) {
  if (!text || !itemName) return text;
  const allItems = [
    ...sectionItems(text, 'CORE BUILD'),
    ...sectionItems(text, 'SITUATIONAL ITEMS'),
  ].map(item => item.toLowerCase());
  if (allItems.includes(itemName.toLowerCase())) return text;

  const section = extractBuildSection(text, 'SITUATIONAL ITEMS');
  if (!section) return text;
  const lines = section.split('\n').filter(line => line.trim());
  lines.push(`${lines.length + 1}. ${itemName} (${reason})`);
  return replaceBuildSection(text, 'SITUATIONAL ITEMS', lines.join('\n'));
}

function antiHealItemForChampion(champion, role, mechanicsMap = null) {
  const tags = getChampionTags(champion);
  const dmg = inferDamageFromTagsAndInfo(champion, mechanicsMap);
  const roleLower = String(role || '').toLowerCase();
  if (/^(adc|bot|bottom)$/.test(roleLower) || tags.includes('Marksman')) return 'Mortal Reminder';
  if (dmg === 'AP' || tags.includes('Mage')) return 'Morellonomicon';
  if (tags.includes('Tank') && !tags.includes('Fighter') && !tags.includes('Mage') && !tags.includes('Marksman')) return 'Thornmail';
  return 'Chempunk Chainsword';
}

function hasGrievousItem(items) {
  return items.some(item => /Thornmail|Mortal Reminder|Morellonomicon|Chempunk Chainsword/i.test(item));
}

const GRIEVOUS_ITEMS = ['Thornmail', 'Mortal Reminder', 'Morellonomicon', 'Chempunk Chainsword'];
const ARMOR_PEN_EXCLUSIVE_ITEMS = ['Black Cleaver', "Lord Dominik's Regards", 'Mortal Reminder', "Serylda's Grudge", 'Terminus'];

function itemKey(name) {
  return String(name || '').toLowerCase().replace(/[â€™']/g, "'").trim();
}

function exactItemMatch(name, candidates) {
  const key = itemKey(name);
  return candidates.some(candidate => itemKey(candidate) === key);
}

function draftNeedsAntiHeal(draft) {
  return Boolean(draft && (draft.enchanterHealing > 0 || draft.selfHealingFrontliners > 0));
}

function replacementCandidatesForBuild(body, draft, mechanicsMap = null) {
  const role = String(body?.role || '').toLowerCase();
  const tags = getChampionTags(body?.myChampion);
  const champDmg = inferDamageFromTagsAndInfo(body?.myChampion, mechanicsMap);
  const isSupport = /support|utility/.test(role);
  const isMarksman = /^(adc|bot|bottom)$/.test(role) || tags.includes('Marksman');
  const isApChampion = champDmg === 'AP' || tags.includes('Mage');
  if (isSupport) {
    return ['Redemption', "Mikael's Blessing", 'Trailblazer', "Knight's Vow", 'Locket of the Iron Solari', 'Dawncore'];
  }
  if (isMarksman) {
    return draft?.heavyAp
      ? ['Maw of Malmortius', 'Mercurial Scimitar', 'Guardian Angel', 'Bloodthirster', 'Rapid Firecannon', "Runaan's Hurricane"]
      : ['Guardian Angel', 'Bloodthirster', 'Mercurial Scimitar', 'Maw of Malmortius', 'Rapid Firecannon', "Runaan's Hurricane"];
  }
  if (isApChampion) {
    return draft?.heavyAp
      ? ["Banshee's Veil", "Zhonya's Hourglass", "Rabadon's Deathcap", 'Void Staff', 'Cosmic Drive']
      : ["Zhonya's Hourglass", "Banshee's Veil", "Rabadon's Deathcap", 'Void Staff', 'Cosmic Drive'];
  }
  return draft?.heavyAp
    ? ['Maw of Malmortius', 'Kaenic Rookern', 'Force of Nature', "Sterak's Gage", "Death's Dance", 'Guardian Angel', "Randuin's Omen", 'Frozen Heart']
    : ["Death's Dance", "Sterak's Gage", 'Guardian Angel', "Randuin's Omen", 'Frozen Heart', 'Force of Nature', 'Maw of Malmortius'];
}

function firstAvailableItem(candidates, used, blocked = []) {
  const blockedKeys = new Set(blocked.map(itemKey));
  return candidates.find(candidate => !used.has(itemKey(candidate)) && !blockedKeys.has(itemKey(candidate)));
}

function rewriteItemsInSection(text, title, replacer) {
  const section = extractBuildSection(text, title);
  if (!section) return text;
  const used = new Set([
    ...sectionItems(text, 'CORE BUILD'),
    ...sectionItems(text, 'SITUATIONAL ITEMS'),
  ].map(itemKey));
  let changed = false;
  const next = [];

  for (const line of section.split('\n')) {
    const item = normalizeBuildLine(line);
    if (!item) continue;
    const result = replacer(item, line, used);
    if (result === null) {
      changed = true;
      used.delete(itemKey(item));
      continue;
    }
    if (typeof result === 'string' && result !== line) {
      changed = true;
      const replacement = normalizeBuildLine(result);
      if (replacement) used.add(itemKey(replacement));
      next.push(result);
      continue;
    }
    next.push(line);
  }

  if (!changed) return text;
  const renumbered = next
    .filter(line => line.trim())
    .map((line, index) => {
      const clean = line.replace(/^\s*\d+[.)]\s*/, '').trim();
      return `${index + 1}. ${clean}`;
    })
    .join('\n');
  return renumbered ? replaceBuildSection(text, title, renumbered) : text;
}

function lineWithReplacement(line, replacement, reason) {
  const prefix = line.match(/^(\s*\d+[.)]\s*)/)?.[1] || '';
  return `${prefix}${replacement} (${reason})`;
}

function itemIntentReason(item, body, draft) {
  const name = itemKey(item);
  if (name === itemKey('Mortal Reminder')) return 'Grievous Wounds and armor penetration vs healing frontline';
  if (name === itemKey("Lord Dominik's Regards")) return 'armor penetration vs high-health frontline';
  if (name === itemKey("Serylda's Grudge")) return 'armor penetration and slow utility for chasing targets';
  if (name === itemKey('Black Cleaver')) return 'armor shred and haste for extended fights';
  if (name === itemKey('Terminus')) return 'on-hit penetration for extended DPS fights';
  if (name === itemKey('Guardian Angel')) return 'revive safety vs burst and late fights';
  if (name === itemKey('Bloodthirster')) return 'lifesteal shield for safer DPS';
  if (name === itemKey('Mercurial Scimitar')) return 'QSS active vs suppression or dangerous lockdown';
  if (name === itemKey('Maw of Malmortius')) return 'magic shield vs AP burst';
  if (name === itemKey("Randuin's Omen")) return 'armor and crit reduction vs AD carries';
  if (name === itemKey('Frozen Heart')) return 'armor and attack-speed slow vs auto attackers';
  if (name === itemKey("Death's Dance")) return 'physical burst delay for extended fights';
  if (name === itemKey("Sterak's Gage")) return 'burst shield for all-ins';
  if (name === itemKey('Force of Nature')) return 'magic resist and movement vs sustained AP';
  if (name === itemKey('Kaenic Rookern')) return 'large magic shield vs AP poke and burst';
  if (name === itemKey('Rapid Firecannon')) return 'safer range to hit first in fights';
  if (name === itemKey("Runaan's Hurricane")) return 'multi-target DPS in front-to-back fights';
  if (/support/.test(String(body?.role || '').toLowerCase())) return 'support-economy utility for teamfights';
  return draft?.heavyAp ? 'role-safe magic-resist adaptation' : draft?.heavyAd ? 'role-safe armor adaptation' : 'role-safe completion item';
}

function scrubUnneededAntiHealNarrative(text) {
  if (!text) return text;
  return String(text)
    .replace(/(?:mandatory|must-buy|required|non-negotiable)\s+(?:anti-heal|grievous wounds)[^.]*\./gi, '')
    .replace(/(?:anti-heal|grievous wounds)\s+(?:is|are|becomes|remains)\s+(?:mandatory|required|non-negotiable)[^.]*\./gi, '')
    .replace(/Need\s+(?:anti-heal|grievous wounds)[^.]*\./gi, '')
    .replace(/requires\s+(?:anti-heal|grievous wounds)[^.]*\./gi, 'requires sustained-fight discipline.')
    .replace(/[ \t]+\n/g, '\n');
}

function enforceAntiHealClassFit(finalText, body, draft, mechanicsMap = null) {
  if (!finalText || !body) return finalText;
  const role = String(body.role || '').toLowerCase();
  const desired = antiHealItemForChampion(body.myChampion, role, mechanicsMap);
  const desiredReason = desired === 'Morellonomicon'
    ? 'AP Grievous Wounds for enemy healing'
    : desired === 'Mortal Reminder'
      ? 'crit-compatible Grievous Wounds and armor penetration for enemy healing'
      : desired === 'Thornmail'
        ? 'tank Grievous Wounds when enemies hit you'
        : 'fighter Grievous Wounds for enemy healing';
  let safe = finalText;
  const coreItems = sectionItems(safe, 'CORE BUILD');
  const needsAntiHeal = draftNeedsAntiHeal(draft);

  if (!needsAntiHeal) {
    const candidates = replacementCandidatesForBuild(body, draft, mechanicsMap);
    safe = rewriteItemsInSection(safe, 'CORE BUILD', (item, line, used) => {
      if (!exactItemMatch(item, GRIEVOUS_ITEMS)) return line;
      const replacement = firstAvailableItem(candidates, used, GRIEVOUS_ITEMS);
      return replacement
        ? lineWithReplacement(line, replacement, 'no major healing threat; role-safe completion item')
        : null;
    });
    safe = rewriteItemsInSection(safe, 'SITUATIONAL ITEMS', (item, line, used) => {
      if (!exactItemMatch(item, GRIEVOUS_ITEMS)) return line;
      const replacement = firstAvailableItem(candidates, used, GRIEVOUS_ITEMS);
      return replacement
        ? lineWithReplacement(line, replacement, 'situational defense; anti-heal is not forced in this draft')
        : null;
    });
    return scrubUnneededAntiHealNarrative(safe);
  }

  if (coreItems.some(item => /Thornmail|Mortal Reminder|Morellonomicon|Chempunk Chainsword/i.test(item) && item !== desired)) {
    safe = replaceCoreItemByName(
      safe,
      ['Thornmail', 'Mortal Reminder', 'Morellonomicon', 'Chempunk Chainsword'],
      desired,
      desiredReason
    );
  }

  if (needsAntiHeal && !hasGrievousItem(sectionItems(safe, 'CORE BUILD'))) {
    const replaceCandidates = draft.heavyAp
      ? ['Maw of Malmortius', 'Guardian Angel', 'Death\'s Dance', 'Dead Man\'s Plate', 'Randuin\'s Omen', 'Frozen Heart']
      : ['Guardian Angel', 'Death\'s Dance', 'Dead Man\'s Plate', 'Force of Nature'];
    safe = replaceCoreItemByName(
      safe,
      replaceCandidates,
      desired,
      desiredReason
    );
  }

  const wrongGrievous = ['Thornmail', 'Mortal Reminder', 'Morellonomicon', 'Chempunk Chainsword'].filter(item => item !== desired);
  if (sectionItems(safe, 'SITUATIONAL ITEMS').some(item => wrongGrievous.some(bad => bad.toLowerCase() === item.toLowerCase()))) {
    const allItems = [
      ...sectionItems(safe, 'CORE BUILD'),
      ...sectionItems(safe, 'SITUATIONAL ITEMS'),
    ].map(item => item.toLowerCase());
    const situationalFallbacks = draft.heavyAp
      ? ['Spirit Visage', 'Force of Nature', 'Banshee\'s Veil', 'Guardian Angel']
      : draft.heavyAd
        ? ['Randuin\'s Omen', 'Frozen Heart', 'Dead Man\'s Plate', 'Guardian Angel']
        : ['Guardian Angel', 'Spirit Visage', 'Randuin\'s Omen', 'Banshee\'s Veil'];
    const replacement = allItems.includes(desired.toLowerCase())
      ? situationalFallbacks.find(item => !allItems.includes(item.toLowerCase())) || desired
      : desired;
    safe = replaceSituationalItemByName(
      safe,
      wrongGrievous,
      replacement,
      replacement === desired ? desiredReason : 'situational defensive alternative; Grievous Wounds is already covered'
    );
  }

  return safe;
}

function chooseArmorPenKeep(groupItems, body, draft, mechanicsMap = null) {
  const needsAntiHeal = draftNeedsAntiHeal(draft);
  const desiredAntiHeal = antiHealItemForChampion(body?.myChampion, body?.role, mechanicsMap);
  if (needsAntiHeal && exactItemMatch(desiredAntiHeal, ARMOR_PEN_EXCLUSIVE_ITEMS) && exactItemMatch(desiredAntiHeal, groupItems)) {
    return groupItems.find(item => itemKey(item) === itemKey(desiredAntiHeal));
  }

  const role = String(body?.role || '').toLowerCase();
  const tags = getChampionTags(body?.myChampion);
  const champDmg = inferDamageFromTagsAndInfo(body?.myChampion, mechanicsMap);
  const preference = /^(adc|bot|bottom)$/.test(role) || tags.includes('Marksman')
    ? ["Lord Dominik's Regards", 'Terminus', 'Mortal Reminder', "Serylda's Grudge", 'Black Cleaver']
    : tags.includes('Assassin')
      ? ["Serylda's Grudge", 'Black Cleaver', "Lord Dominik's Regards", 'Mortal Reminder', 'Terminus']
      : champDmg === 'AP' || tags.includes('Mage')
        ? []
        : ['Black Cleaver', "Serylda's Grudge", "Lord Dominik's Regards", 'Terminus', 'Mortal Reminder'];

  for (const candidate of preference) {
    const found = groupItems.find(item => itemKey(item) === itemKey(candidate));
    if (found) return found;
  }
  return groupItems[0];
}

function scrubExclusiveItemNarrative(text, keepItem) {
  if (!text) return text;
  const names = ARMOR_PEN_EXCLUSIVE_ITEMS
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const multiPenSentence = new RegExp(`[^.\\n]*(?:${names})[^.\\n]*(?:${names})[^.\\n]*\\.`, 'gi');
  return String(text).replace(multiPenSentence, (sentence) => {
    const mentioned = ARMOR_PEN_EXCLUSIVE_ITEMS.filter(item => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(sentence));
    const unique = [...new Set(mentioned.map(itemKey))];
    if (unique.length <= 1) return sentence;
    return `${keepItem} is the armor-penetration slot here; spend the remaining gold on damage or survivability.`;
  });
}

function enforceExclusiveItemGroups(finalText, body, draft, mechanicsMap = null) {
  if (!finalText || !body) return finalText;
  let safe = finalText;
  const allItems = [
    ...sectionItems(safe, 'CORE BUILD'),
    ...sectionItems(safe, 'SITUATIONAL ITEMS'),
  ];
  const armorPenItems = allItems.filter(item => exactItemMatch(item, ARMOR_PEN_EXCLUSIVE_ITEMS));
  const uniqueArmorPen = [...new Map(armorPenItems.map(item => [itemKey(item), item])).values()];
  if (uniqueArmorPen.length <= 1) {
    return scrubExclusiveItemNarrative(safe, uniqueArmorPen[0] || 'the chosen armor-penetration item');
  }

  const keep = chooseArmorPenKeep(uniqueArmorPen, body, draft, mechanicsMap);
  const candidates = replacementCandidatesForBuild(body, draft, mechanicsMap);
  const blocked = ARMOR_PEN_EXCLUSIVE_ITEMS;
  let promotedKeepInCore = false;

  const core = extractBuildSection(safe, 'CORE BUILD');
  if (core) {
    const lines = core.split('\n').filter(line => line.trim());
    const keepIndex = lines.findIndex(line => itemKey(normalizeBuildLine(line)) === itemKey(keep));
    const used = new Set([
      ...sectionItems(safe, 'CORE BUILD'),
      ...sectionItems(safe, 'SITUATIONAL ITEMS'),
    ].map(itemKey));
    let changed = false;

    for (let index = 0; index < lines.length; index++) {
      const item = normalizeBuildLine(lines[index]);
      if (!exactItemMatch(item, ARMOR_PEN_EXCLUSIVE_ITEMS) || itemKey(item) === itemKey(keep)) continue;

      if (!promotedKeepInCore && keepIndex > index) {
        const replacement = firstAvailableItem(candidates, used, blocked);
        lines[index] = lineWithReplacement(lines[index], keep, itemIntentReason(keep, body, draft));
        if (replacement) {
          lines[keepIndex] = lineWithReplacement(lines[keepIndex], replacement, itemIntentReason(replacement, body, draft));
          used.add(itemKey(replacement));
        } else {
          lines[keepIndex] = '';
        }
        promotedKeepInCore = true;
        changed = true;
        continue;
      }

      const replacement = firstAvailableItem(candidates, used, blocked);
      lines[index] = replacement ? lineWithReplacement(lines[index], replacement, itemIntentReason(replacement, body, draft)) : '';
      if (replacement) used.add(itemKey(replacement));
      changed = true;
    }

    if (changed) {
      const renumbered = lines
        .filter(line => line.trim())
        .map((line, index) => `${index + 1}. ${line.replace(/^\s*\d+[.)]\s*/, '').trim()}`)
        .join('\n');
      safe = replaceBuildSection(safe, 'CORE BUILD', renumbered);
    }
  }
  safe = rewriteItemsInSection(safe, 'SITUATIONAL ITEMS', (item, line, used) => {
    if (!exactItemMatch(item, ARMOR_PEN_EXCLUSIVE_ITEMS) || itemKey(item) === itemKey(keep)) return line;
    const replacement = firstAvailableItem(candidates, used, blocked);
    return replacement ? lineWithReplacement(line, replacement, itemIntentReason(replacement, body, draft)) : null;
  });
  return scrubExclusiveItemNarrative(safe, keep);
}

function normalizeKnownItemTypos(text) {
  if (!text) return text;
  return String(text)
    .replace(/Maw of Malmort\w*/gi, 'Maw of Malmortius')
    .replace(/Guardian'?s Angel/gi, 'Guardian Angel')
    .replace(/Quicksilver Sash/gi, 'Mercurial Scimitar')
    .replace(/Serpant'?s Fangs?/gi, "Serpent's Fang")
    .replace(/Serpent'?s Fangs/gi, "Serpent's Fang");
}

function sanitizeItemFactClaims(text) {
  if (!text) return text;
  return normalizeKnownItemTypos(text)
    .replace(/Eclipse\s*\([^)]*(?:armor|wave clear|sustain)[^)]*\)/gi, 'Eclipse (early burst, dueling, and shield proc)')
    .replace(/^(\s*(?:\d+[.)]\s*)?Eclipse:\s*).*$/gmi, '$1Buy for early burst trades and dueling tempo.')
    .replace(/Plated Steelcaps\s*\([^)]*(?:AD damage|\d+%|15-20|Pantheon Q)[^)]*\)/gi, 'Plated Steelcaps (reduces incoming basic attack damage into heavy AD pressure)')
    .replace(/^(\s*(?:\d+[.)]\s*)?Plated Steelcaps:\s*).*$/gmi, '$1Reduces incoming basic attack damage and is preferred into heavy AD auto-attack pressure.')
    .replace(/Sterak's Gage\s*\([^)]*Tenacity[^)]*\)/gi, "Sterak's Gage (burst shield and survivability for all-ins)")
    .replace(/^(\s*(?:\d+[.)]\s*)?Sterak's Gage:\s*).*Tenacity.*$/gmi, "$1Buy for burst shield and survivability in all-ins.")
    .replace(/Death's Dance\s*\([^)]*true damage[^)]*\)/gi, "Death's Dance (physical burst delay and extended-fight survivability)")
    .replace(/^(\s*(?:\d+[.)]\s*)?Death's Dance:\s*).*true damage.*$/gmi, "$1Buy for physical burst delay and extended-fight survivability.")
    .replace(/true damage from Ahri/gi, 'burst from Ahri')
    .replace(/Sundered Sky\s*\([^)]*(?:anti-heal|grievous|damage reduction|true damage|%HP|shield)[^)]*\)/gi, 'Sundered Sky (dueling sustain and health for extended fights)')
    .replace(/Serylda's Grudge\s*\([^)]*%HP[^)]*\)/gi, "Serylda's Grudge (armor penetration and slow utility)")
    .replace(/^(\s*(?:\d+[.)]\s*)?Mercurial Scimitar:\s*).*stasis.*$/gmi, '$1Buy when QSS/cleanse is needed against suppression or dangerous lockdown.')
    .replace(/Chempunk Chainsword is added as situational/gi, 'Chempunk Chainsword covers healing')
    .replace(/Survivability Requirement:\s*High Armor\s*\([^.\n]*Class-appropriate Grievous Wounds is required for enemy healing\./gi, 'Survivability Requirement: High armor and class-appropriate anti-heal are required against this draft.');
}

function enforceDraftCounterLogic(finalText, body, mechanicsMap = null) {
  if (!finalText || !body) return finalText;
  const role = String(body.role || '').toLowerCase();
  const draft = analyzeEnemyDraft(body.enemies || [], mechanicsMap);
  let safe = normalizeKnownItemTypos(finalText);
  const before = finalText;
  let desiredBoots = null;
  let desiredBootsReason = '';

  const fullAdPressure = draft.heavyAd && draft.effectiveAp < 1.5;
  if (fullAdPressure) {
    desiredBoots = 'Plated Steelcaps';
    desiredBootsReason = 'armor vs AD-heavy enemy team';
    safe = replaceCoreItemByName(
      safe,
      BOOT_ITEMS.filter(item => item !== desiredBoots),
      'Plated Steelcaps',
      'armor vs AD-heavy enemy team'
    );
  } else if (draft.heavyAp || draft.highCc) {
    desiredBoots = "Mercury's Treads";
    desiredBootsReason = draft.highCc ? 'tenacity vs heavy crowd control' : 'magic resist vs AP-heavy enemy team';
    safe = replaceCoreItemByName(
      safe,
      BOOT_ITEMS.filter(item => item !== desiredBoots),
      "Mercury's Treads",
      draft.highCc ? 'tenacity vs heavy crowd control' : 'magic resist vs AP-heavy enemy team'
    );
  } else if (draft.heavyAd) {
    desiredBoots = 'Plated Steelcaps';
    desiredBootsReason = 'armor vs AD-heavy enemy team';
    safe = replaceCoreItemByName(
      safe,
      BOOT_ITEMS.filter(item => item !== desiredBoots),
      'Plated Steelcaps',
      'armor vs AD-heavy enemy team'
    );
  }
  if (desiredBoots) {
    safe = ensureCoreItem(safe, desiredBoots, desiredBootsReason, /support/.test(role) ? 1 : 0);
  }

  if (draft.suppression > 0 && championCanUseMercurial(body, mechanicsMap)) {
    safe = ensureSituationalItem(
      safe,
      'Mercurial Scimitar',
      'QSS active vs suppression/lockdown when cleanse is required'
    );
  } else if (draft.suppression > 0) {
    const answer = apClassDefenseCandidates(body, draft)[0];
    safe = ensureSituationalItem(
      safe,
      answer,
      'class-appropriate defensive answer; avoid off-class QSS completion'
    );
  }

  if (draft.heavyAp) {
    safe = replaceCoreItemByName(
      safe,
      ['Thornmail', 'Randuin\'s Omen', 'Frozen Heart', 'Dead Man\'s Plate'],
      role.includes('adc') || role.includes('bot') ? 'Maw of Malmortius' : 'Kaenic Rookern',
      'high magic resist vs AP-heavy enemy team'
    );
  }

  safe = enforceAntiHealClassFit(safe, body, draft, mechanicsMap);
  safe = enforceExclusiveItemGroups(safe, body, draft, mechanicsMap);

  if (safe !== before) {
    let analysis = extractBuildSection(safe, 'ANALYSIS');
    if (draft.enchanterHealing > 0 && draft.selfHealingFrontliners === 0) {
      const preferredAntiHeal = antiHealItemForChampion(body.myChampion, role, mechanicsMap);
      analysis = analysis
        .replace(/adding Thornmail[^.]*\./i, `using ${preferredAntiHeal} because it applies Grievous Wounds through this champion's normal damage pattern.`)
        .replace(/add Mortal Reminder[^.]*\./i, `use ${preferredAntiHeal} because it fits this champion's damage profile better than crit anti-heal.`)
        .replace(/Mortal Reminder for Nami's healing/gi, `${preferredAntiHeal} for Nami's healing`)
        .replace(/Thornmail for Nami's healing/gi, `${preferredAntiHeal} for Nami's healing`);
    }
    analysis = analysis.replace(/Thornmail[^.]*Grievous Wounds[^.]*\./gi, `${antiHealItemForChampion(body.myChampion, role, mechanicsMap)} is the correct Grievous Wounds item if enemy healing must be answered directly.`);
    if (fullAdPressure) {
      analysis = analysis
        .replace(/Mercury's Treads are required[^.]*\./gi, 'Plated Steelcaps are preferred because the enemy damage profile is overwhelmingly AD.')
        .replace(/Mercury's Treads provide[^.]*\./gi, 'Plated Steelcaps reduce the repeated AD auto-attack and dive damage.');
    } else if (draft.heavyAp || draft.highCc) {
      analysis = analysis
        .replace(/Plated Steelcaps are retained[^.]*\./gi, "Mercury's Treads are required because AP damage and crowd control are the main threats.")
        .replace(/Steelcaps provide better[^.]*\./gi, "Mercury's Treads provide the needed tenacity and magic resist.");
    }
    const note = [
      fullAdPressure ? 'overwhelming AD pressure' : '',
      draft.heavyAp ? 'heavy AP draft' : '',
      draft.highCc && !fullAdPressure ? 'high crowd control' : '',
      draft.suppression > 0 ? 'suppression answer' : '',
      draft.enchanterHealing > 0 && draft.selfHealingFrontliners === 0 ? 'ranged/enchanter healing' : '',
    ].filter(Boolean).join(', ');
    if (analysis && !/Counter Logic:/i.test(analysis)) {
      safe = replaceBuildSection(safe, 'ANALYSIS', `${analysis}\nCounter Logic: Deterministic validation adjusted boots/defense for ${note}.`);
    }
  }

  return safe;
}

function getCompactRefinementReference(role) {
  const isJungle = /jungle/i.test(role || '');
  const isSupport = /support|utility/i.test(role || '');
  const roleGuardrail = isSupport
    ? 'Support economy: prefer baseline support items. For anti-heal, use Ignite timing or Oblivion Orb only for AP supports; otherwise mention ally anti-heal only in ANALYSIS or WIN CONDITION. Do not list Mortal Reminder, Thornmail, Morellonomicon, or expensive carry items in CORE BUILD or SITUATIONAL ITEMS for utility supports unless already present in the baseline.'
    : isJungle
      ? 'Jungle identity: keep Smite and a jungle companion start. Adapt boots/defense only when enemy damage split or CC clearly demands it.'
      : 'Lane identity: keep the champion class intact. Do not turn mages into tanks, marksmen into tanks, or fighters into AP carries unless the baseline already does it.';
  return [
    'COMPACT VALIDATION REFERENCE:',
    'Baseline preservation: keep runes, summoners, starting items, and skill order unless the matchup creates a critical need. Do not change them just because an alternative is also viable. Always repeat exact baseline names; never output "keep baseline" shorthand.',
    `Starting items: ${isJungle ? 'jungle companion + Health Potion' : isSupport ? 'support starter + Health Potion' : 'one lane starter + Health Potion'}.`,
    roleGuardrail,
    'Anti-heal by role: Thornmail for tanks/fighters being hit, Mortal Reminder for ADC/crit users, Morellonomicon for AP/mages, Ignite/Oblivion Orb/ally-callout for supports.',
    'Common defensive/counter items: Plated Steelcaps, Mercury\'s Treads, Ionian Boots of Lucidity, Boots of Swiftness, Thornmail, Mortal Reminder, Morellonomicon, Serpent\'s Fang, Randuin\'s Omen, Frozen Heart, Force of Nature, Spirit Visage, Kaenic Rookern, Maw of Malmortius, Death\'s Dance, Guardian Angel, Zhonya\'s Hourglass, Banshee\'s Veil, Mercurial Scimitar.',
    'If you name an item, use its exact current in-game name. Backend validation will reject invented items.',
  ].join('\n');
}

/** Helper to get the patch from KB meta */
function loadKBBuildTemplatesMeta(gameMode = 'sr') {
  try {
    for (const p of kbDataPaths(kbBuildTemplateFileForMode(gameMode))) {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return raw.meta?.patch || '?';
      }
    }
  } catch {}
  return '?';
}

let _kbAugmentTemplatesCache = null;
let _kbAugmentsMasterCache = null;

function loadKBAugmentTemplates() {
  if (_kbAugmentTemplatesCache) return _kbAugmentTemplatesCache;
  for (const p of kbDataPaths('augment-templates.json')) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      _kbAugmentTemplatesCache = raw;
      return raw;
    } catch (err) {
      log('WARN', `[augments] Failed to parse ${p}: ${err.message}`);
    }
  }
  _kbAugmentTemplatesCache = { data: {} };
  return _kbAugmentTemplatesCache;
}

function loadKBAugmentsMaster() {
  if (_kbAugmentsMasterCache) return _kbAugmentsMasterCache;
  for (const p of [...kbDataPaths('augments-master.json'), path.join(AUGMENTS_DIR, 'augments-master.json')]) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      _kbAugmentsMasterCache = raw;
      return raw;
    } catch (err) {
      log('WARN', `[augments] Failed to parse ${p}: ${err.message}`);
    }
  }
  _kbAugmentsMasterCache = { augments: [] };
  return _kbAugmentsMasterCache;
}

function formatAugmentLine(augment, index) {
  const name = augment?.name || `Augment ${augment?.id || index + 1}`;
  const tier = augment?.tier && augment.tier !== 'Unknown' ? `${augment.tier} ` : '';
  const effect = augment?.effect ? ` - ${cleanAugmentEffect(augment.effect)}` : '';
  return `${index + 1}. ${name} (${tier}Mayhem candidate)${effect}`;
}

function cleanAugmentEffect(effect) {
  return String(effect || '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/@\w+(?:\*\d+)?@/g, '')
    .replace(/%i:[^%\s]+%/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function augmentTierScore(tier) {
  if (/prismatic/i.test(tier || '')) return 18;
  if (/gold/i.test(tier || '')) return 12;
  return 7;
}

function scoreAugmentForDraft(augment, champion, body = {}, mechanicsMap = null) {
  const name = String(augment?.name || '');
  const effect = cleanAugmentEffect(augment?.effect || '');
  const text = `${name} ${effect}`.toLowerCase();
  const tags = getChampionTags(champion);
  const dmg = inferDamageFromTagsAndInfo(champion, mechanicsMap);
  const mech = mechanicsMap?.get(champion);
  const enemies = body?.enemies || [];
  const enemyDraft = analyzeEnemyDraft(enemies, mechanicsMap);

  let score = augmentTierScore(augment?.tier);
  const add = (regex, amount) => { if (regex.test(text)) score += amount; };

  if (tags.includes('Marksman')) {
    add(/attack speed|basic attack|critical|crit|on-hit|range|move speed|dash|kite|lifesteal/, 8);
    add(/ability power|mana|heal and shield/, -5);
  }
  if (tags.includes('Mage') || dmg === 'AP') {
    add(/ability|spell|magic|ability power|haste|cooldown|mana|ultimate|burn/, 8);
    add(/attack speed|basic attack|critical strike|crit chance/, -3);
  }
  if (tags.includes('Fighter')) {
    add(/health|heal|omnivamp|lifesteal|shield|haste|damage|movement|dash|armor|magic resist|tenacity/, 7);
  }
  if (tags.includes('Tank')) {
    add(/health|armor|magic resist|shield|slow|immobil|tenacity|nearby|crowd control|resist/, 8);
    add(/critical|crit|attack speed/, -3);
  }
  if (tags.includes('Assassin')) {
    add(/dash|blink|execute|invisible|stealth|damage|ability haste|movement|lethality|burst/, 8);
  }
  if (tags.includes('Support')) {
    add(/heal|shield|ally|haste|slow|root|immobil|protect|movement speed/, 8);
  }

  if (mech?.dashes >= 2) add(/dash|movement|blink|ability haste|cooldown/, 5);
  if (mech?.resource === 'MANA') add(/mana|spell|ability haste/, 3);
  if (mech?.healThreat) add(/heal|shield|omnivamp|lifesteal/, 4);

  if (enemyDraft.hardCc >= 3 || enemyDraft.suppression > 0) add(/tenacity|unstoppable|cleanse|crowd control|slow resist|movement/, 7);
  if (enemyDraft.ap >= 3) add(/magic resist|spell shield|shield|health/, 5);
  if (enemyDraft.ad >= 3) add(/armor|basic attack|attack speed|shield|health/, 5);
  if (enemyDraft.tanks >= 2) add(/max health|true damage|burn|penetration|shred|damage/, 5);
  if (enemyDraft.enchanterHealing + enemyDraft.selfHealingFrontliners >= 2) add(/wound|anti-heal|damage|execute/, 3);

  if (/404 augment not found|how did you find this|tahm kench|sacrificed to tahm/i.test(`${name} ${effect}`)) score -= 40;
  if (!effect || /\{\{|summary|current conversion/i.test(effect)) score -= 10;
  return score;
}

function getDraftAugmentCandidates(champion, body = {}, mechanicsMap = null, limit = 48) {
  const data = loadKBAugmentsMaster();
  const augments = Array.isArray(data.augments) ? data.augments : [];
  return augments
    .map(augment => ({
      ...augment,
      effect: cleanAugmentEffect(augment.effect),
      draftScore: scoreAugmentForDraft(augment, champion, body, mechanicsMap),
    }))
    .filter(augment => augment.name && augment.effect && augment.draftScore > 0)
    .sort((a, b) => (b.draftScore - a.draftScore) || (augmentTierScore(b.tier) - augmentTierScore(a.tier)) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function extractAugmentsSection(text) {
  const match = String(text || '').match(/(?:^|\n)AUGMENTS\n([\s\S]*?)(?=\n(?:SITUATIONAL ITEMS|JUNGLE PATH|ENEMY POWER SPIKES|WIN CONDITION|YOUR POWER SPIKES|ANALYSIS|RUNES|SUMMONERS|SKILL ORDER|STARTING ITEMS|CORE BUILD)\n|$)/i);
  return match ? match[0].trim() : '';
}

function ensureMayhemAugmentsSection(text, body = {}, mechanicsMap = null) {
  if (!text) return text;
  const champion = body?.myChampion || body?.champion || body;
  const existing = extractAugmentsSection(text);
  if (existing) return normalizeMayhemAugmentsSection(text, body, mechanicsMap);
  const fallback = buildInstantAugmentsSection(champion, body, mechanicsMap);
  if (fallback.length <= 2) return text;

  const augmentText = fallback.join('\n').trim();
  if (/\nSITUATIONAL ITEMS\n/i.test(text)) {
    return text.replace(/\nSITUATIONAL ITEMS\n/i, `\n${augmentText}\n\nSITUATIONAL ITEMS\n`);
  }
  if (/\nWIN CONDITION\n/i.test(text)) {
    return text.replace(/\nWIN CONDITION\n/i, `\n${augmentText}\n\nWIN CONDITION\n`);
  }
  return `${text.trim()}\n\n${augmentText}`;
}

function normalizeMayhemAugmentsSection(text, body = {}, mechanicsMap = null) {
  const section = extractAugmentsSection(text);
  if (!section) return text;

  const master = (loadKBAugmentsMaster().augments || [])
    .filter(aug => !/404 augment not found|how did you find this|tahm kench|sacrificed to tahm/i.test(`${aug?.name || ''} ${aug?.effect || ''}`));
  const champion = body?.myChampion || body?.champion || body;
  const draftCandidates = getDraftAugmentCandidates(champion, body, mechanicsMap, 24);
  const validNames = new Map(master.map(aug => [String(aug.name || '').toLowerCase(), aug]));
  const preferred = new Map(draftCandidates.map(aug => [String(aug.name || '').toLowerCase(), aug]));
  const allNames = master.map(aug => aug.name).filter(Boolean);

  function nearest(name) {
    const target = String(name || '').toLowerCase();
    let best = null;
    let bestScore = Infinity;
    for (const candidate of allNames) {
      const c = String(candidate || '').toLowerCase();
      if (c === target) return candidate;
      if (c.includes(target) || target.includes(c)) {
        const score = Math.abs(c.length - target.length);
        if (score < bestScore) { best = candidate; bestScore = score; }
      }
    }
    return bestScore <= 4 ? best : null;
  }

  const rawLines = section.split('\n').slice(1).map(line => line.trim()).filter(Boolean);
  const normalized = [];
  const seen = new Set();
  for (const [idx, raw] of rawLines.entries()) {
    const withoutNumber = raw.replace(/^\d+[.)]\s*/, '').trim();
    const namePart = withoutNumber.split(/\s+-\s+|:/)[0].replace(/\([^)]*\)/g, '').trim();
    const corrected = validNames.get(namePart.toLowerCase())?.name || preferred.get(namePart.toLowerCase())?.name || nearest(namePart);
    const source = corrected ? (validNames.get(corrected.toLowerCase()) || preferred.get(corrected.toLowerCase())) : null;
    const exact = source?.name || corrected;
    if (!source || !exact) continue;
    if (!exact || seen.has(exact.toLowerCase())) continue;
    seen.add(exact.toLowerCase());
    const tierText = source.tier && !new RegExp(`\\b${source.tier}\\b`, 'i').test(withoutNumber) ? `${source.tier} augment` : '';
    const reason = withoutNumber.includes(' - ')
      ? withoutNumber.split(/\s+-\s+/).slice(1).join(' - ').trim()
      : '';
    const effect = reason || source.effect || 'matchup-aware ARAM Mayhem pick';
    normalized.push(`${normalized.length + 1}. ${exact}${tierText ? ` (${tierText})` : ''} - ${effect}`);
    if (idx > 8 || normalized.length >= 4) break;
  }

  if (normalized.length < 4) {
    const pool = draftCandidates.length ? draftCandidates : master;
    for (const aug of pool) {
      if (normalized.length >= 4) break;
      const key = String(aug.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      normalized.push(formatAugmentLine(aug, normalized.length));
    }
  }

  if (!normalized.length) return text;
  return text.replace(section, ['AUGMENTS', ...normalized].join('\n'));
}

function buildInstantAugmentsSection(champion, body = {}, mechanicsMap = null) {
  const candidates = getDraftAugmentCandidates(champion, body, mechanicsMap, 4);
  if (!candidates.length) return [];
  return [
    '',
    'AUGMENTS',
    ...candidates.map(formatAugmentLine),
  ];
}

/**
 * Load the augments master list and format as prompt reference.
 * Returns empty string if no augment data is cached.
 */
function getAugmentsReference(champion = '', body = {}, mechanicsMap = null) {
  try {
    const data = loadKBAugmentsMaster();
    if (!data.augments || !Array.isArray(data.augments) || data.augments.length === 0) return '';

    const candidates = getDraftAugmentCandidates(champion, body, mechanicsMap, 48);
    let ref = `\n\nARAM MAYHEM AUGMENT KNOWLEDGE (CommunityDragon Patch ${data.patch || '?'}):\n`;
    ref += `U.GG does not provide reliable ARAM Mayhem augment meta. Treat CommunityDragon effect text and tier as the source of truth.\n`;
    ref += `Use ONLY exact augment names from this catalog. NEVER invent augment names.\n`;
    ref += `Total valid augments: ${data.augments.length}\n\n`;

    if (candidates.length) {
      ref += `DRAFT-SCORED AUGMENT CANDIDATES FOR ${champion || 'THIS CHAMPION'}:\n`;
      ref += `These candidates are pre-ranked from champion class, known kit mechanics, enemy draft pressure, tier, and effect text. Prefer this list unless a full-catalog augment is clearly better.\n`;
      for (const aug of candidates) {
        ref += `  - ${aug.name} (${aug.tier || 'Unknown'}, score ${aug.draftScore}): ${aug.effect}\n`;
      }
      ref += `\n`;
    }

    // Group by tier
    const byTier = { Prismatic: [], Gold: [], Silver: [] };
    for (const aug of data.augments) {
      const name = String(aug.name || '');
      const effect = cleanAugmentEffect(aug.effect);
      if (!name || !effect || /404 augment not found|how did you find this/i.test(`${name} ${effect}`)) continue;
      const tier = aug.tier || 'Silver';
      const cleaned = { ...aug, effect };
      if (byTier[tier]) byTier[tier].push(cleaned);
      else byTier.Silver.push(cleaned);
    }

    for (const [tier, augs] of Object.entries(byTier)) {
      if (augs.length === 0) continue;
      ref += `FULL CATALOG - ${tier.toUpperCase()} TIER:\n`;
      for (const aug of augs) {
        ref += `  - ${aug.name}${aug.set ? ` [Set: ${aug.set}]` : ''}: ${aug.effect || ''}\n`;
      }
      ref += `\n`;
    }

    return ref;
  } catch (err) {
    log('WARN', `[augments] Failed to load augments reference: ${err.message}`);
    return '';
  }
}

/**
 * Batch-fetch meta builds for a group of champions via DeepSeek/OpenRouter reference lookup.
 * Returns array of { champion, role, metaBuild } objects.
 */
async function fetchMetaBuildBatch(genAI, champions, patch) {

  const champList = champions.map((c, i) => `${i + 1}. ${c.name} (most popular role)`).join('\n');

  const prompt = `Search u.gg and op.gg for the highest winrate builds on League of Legends Patch ${patch} for these champions:
${champList}

For EACH champion, return the build for their MOST POPULAR role.

Return ONLY a compact JSON array (no markdown, no code blocks, just raw JSON):
[
  {
    "champion": "ChampionName",
    "role": "Top/Jungle/Mid/ADC/Support",
    "metaBuild": {
      "winRate": 52.3,
      "pickRate": 8.5,
      "keystone": "Lethal Tempo",
      "primaryTree": "Precision",
      "secondaryTree": "Domination",
      "startingItems": ["Doran's Blade", "Health Potion"],
      "coreItems": ["Kraken Slayer", "Phantom Dancer", "Infinity Edge"],
      "boots": "Berserker's Greaves",
      "skillOrder": "Q > W > E > R"
    }
  }
]

Rules:
- One entry per champion
- winRate and pickRate as numbers (e.g. 52.3, not "52.3%")
- coreItems: the 3 most popular core items in build order
- startingItems: exactly 2 (1 starting item + 1 potion)
- boots: the most popular boots upgrade
- skillOrder: max priority format "Q > W > E > R"
- Use current patch data, not outdated builds`;

  try {
    const _rawText = await llmGenerate('You are a League of Legends expert analyst. Be concise and accurate.', prompt, { temperature: 0.2, maxTokens: 4096 });
    const text = _rawText.trim();
    const cleanJson = text.replace(/^```(json)?[\s\n]*/i, '').replace(/[\s\n]*```$/i, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    log('ERROR', `[MetaBuild] Batch fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Sync meta builds for ALL champions. Runs in background on patch change.
 * Batches 10 champions per OpenRouter call to minimize API usage.
 */
async function syncAllMetaBuilds(livePatch, force = false) {
  if (isMetaSyncing) {
    log('INFO', '[MetaBuild] Sync already in progress, skipping');
    return;
  }

  const patchMajorMinor = livePatch.split('.').slice(0, 2).join('.');
  const meta = getMetaBuildMeta();

  if (!force && meta && meta.patch === patchMajorMinor) {
    log('INFO', `[MetaBuild] Already synced for Patch ${patchMajorMinor} (${meta.champCount || '?'} champs)`);
    return;
  }

  isMetaSyncing = true;
  log('INFO', `[MetaBuild] Starting full meta build sync for Patch ${patchMajorMinor}...`);

  try {
    // Using DeepSeek V4 Flash via OpenRouter.


    // Get ALL champions from DDragon
    const champCache = await ensureDdragonChampCache();
    if (!champCache || champCache.size === 0) {
      log('ERROR', '[MetaBuild] No champion data available');
      return;
    }

    const allChamps = [];
    for (const [name, data] of champCache) {
      allChamps.push({ name, id: data.id, tags: data.tags });
    }
    log('INFO', `[MetaBuild] Fetching meta builds for ${allChamps.length} champions...`);

    ensureMetaBuildDirs();
    const BATCH_SIZE = 10;
    let totalCached = 0;
    let batchNum = 0;

    for (let i = 0; i < allChamps.length; i += BATCH_SIZE) {
      batchNum++;
      const batch = allChamps.slice(i, i + BATCH_SIZE);
      const batchNames = batch.map(c => c.name).join(', ');
      log('INFO', `[MetaBuild] Batch ${batchNum}: ${batchNames}`);

      try {
        const results = await fetchMetaBuildBatch(genAI, batch, patchMajorMinor);

        if (Array.isArray(results)) {
          for (const entry of results) {
            if (!entry.champion || !entry.role || !entry.metaBuild) continue;

            // Normalize champion name to DDragon ID (e.g. "Dr. Mundo" -> "DrMundo")
            let champId = entry.champion;
            const champData = champCache.get(entry.champion);
            if (champData) champId = champData.id;

            // Normalize role
            const role = entry.role.toLowerCase().replace('bottom', 'adc').replace('bot', 'adc');
            const normalizedRole = ['top', 'jungle', 'mid', 'adc', 'support'].includes(role) ? role : entry.role;

            const outFile = path.join(META_BUILDS_SR_DIR, `${champId}_${normalizedRole}.json`);
            const outData = {
              champion: champId,
              role: normalizedRole,
              patch: patchMajorMinor,
              fetchedAt: new Date().toISOString(),
              metaBuild: entry.metaBuild,
            };
            fs.writeFileSync(outFile, JSON.stringify(outData, null, 2), 'utf-8');
            totalCached++;
          }
        }
      } catch (batchErr) {
        log('ERROR', `[MetaBuild] Batch ${batchNum} failed: ${batchErr.message}`);
      }

      // Rate limit: 2s between batches
      if (i + BATCH_SIZE < allChamps.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    saveMetaBuildMeta({
      patch: patchMajorMinor,
      updatedAt: new Date().toISOString(),
      champCount: totalCached,
      source: 'openrouter-deepseek',
    });

    log('INFO', `[MetaBuild] Sync complete! Cached ${totalCached} champion builds for Patch ${patchMajorMinor}`);
  } catch (err) {
    log('ERROR', '[MetaBuild] Sync failed:', err.message);
  } finally {
    isMetaSyncing = false;
  }
}

function ensureIconCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(dest); });
      } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fs.unlink(dest, () => { });
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      } else {
        fs.unlink(dest, () => { });
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => { });
      reject(err);
    });
  });
}

// SECURITY: getEnvPath() and loadEnv() have been REMOVED.
// In production, API keys come ONLY from encrypted settings.json.
// In dev mode, .env is loaded at startup (see top of file).
// This stub exists to prevent runtime errors if any code still calls loadEnv().
function loadEnv() {
  if (isDev) {
    console.log('[main] DEV: .env already loaded at startup');
  } else {
    console.log('[main] Production: .env loading disabled (security policy)');
  }
}

function startEmbeddedBackend() {
  return new Promise((resolve) => {
    const express = require('express');
    const cors = require('cors');

    const backendApp = express();
    const PORT = parseInt(process.env.BACKEND_PORT || '3210', 10);

    // SECURITY: Restrict CORS to local apps Ã¢â‚¬â€ prevents cross-site attacks
    backendApp.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?$/ }));
    backendApp.use(express.json());

    // DDragon version endpoint
    let cachedDDVersion = null;
    let ddVersionFetchedAt = 0;

    async function fetchDDragonVersion() {
      if (cachedDDVersion && Date.now() - ddVersionFetchedAt < 3600000) {
        return cachedDDVersion;
      }
      const fetch = require('node-fetch');
      const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
      if (!res.ok) throw new Error(`DDragon versions fetch failed: ${res.status}`);
      const versions = await res.json();
      cachedDDVersion = versions[0];
      ddVersionFetchedAt = Date.now();
      return cachedDDVersion;
    }

    backendApp.get('/api/version', async (_req, res) => {
      try {
        const version = await fetchDDragonVersion();
        res.json({ version });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Cache
    const CACHE_FILE_DIR = path.join(app.getPath('userData'), 'cache');
    const BUILD_CACHE_FILE = path.join(CACHE_FILE_DIR, 'build-cache.json');

    function ensureCacheDir() {
      if (!fs.existsSync(CACHE_FILE_DIR)) fs.mkdirSync(CACHE_FILE_DIR, { recursive: true });
    }

    function readCache() {
      ensureCacheDir();
      if (!fs.existsSync(BUILD_CACHE_FILE)) return {};
      try { return JSON.parse(fs.readFileSync(BUILD_CACHE_FILE, 'utf-8')); }
      catch { return {}; }
    }

    function writeCache(data) {
      ensureCacheDir();
      fs.writeFileSync(BUILD_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }

    function getCache(key) {
      return readCache()[key] || null;
    }

    function setCache(key, text, patchDetected) {
      const all = readCache();
      all[key] = { key, timestamp: Date.now(), text, patchDetected, source: 'grounded' };
      writeCache(all);
    }
    // DeepSeek/OpenRouter dynamic patch injection (delegated to prompt-builder.js)
    function buildSystemPrompt(patch) {
      return _prompts.buildSystemPrompt(patch);
    }
    function _buildSystemPromptLEGACY(patch) {
      return `You are a Grandmaster League of Legends Draft & Itemization Engine for Season 2026, Patch ${patch}.

You will receive RAG context containing verified patch data, a VALID ITEMS list, and an ENEMY TEAM PROFILE with pre-computed damage analysis. Use these as your PRIMARY knowledge sources. Only use Google Search grounding to supplement if the provided context is insufficient for a specific matchup detail.

FIRST, output this analysis section to reason about the matchup before building:

ANALYSIS
Matchup Type: <poke/all-in/sustain/scaling Ã¢â‚¬â€ describe the lane dynamic>
Enemy Damage Split: <AP-heavy / AD-heavy / mixed Ã¢â‚¬â€ reference the ENEMY TEAM PROFILE provided>
Key Threats: <1-2 enemy champions that are most dangerous and why>
Build Priority: <What stats/passives does my champion need MOST vs THIS specific enemy team?>

THEN output these sections in this exact format:

RUNES
Primary: <TreeName>
Keystone: <RuneName>
<Rune1>
<Rune2>
<Rune3>
Secondary: <TreeName>
<Rune1>
<Rune2>
Shards: <Shard1>, <Shard2>, <Shard3>

SUMMONERS
<Spell1>
<Spell2>

SKILL ORDER
<Key> > <Key> > <Key> > <Key>

STARTING ITEMS
<Item1>
<Item2>
(These MUST be true level 1 starting items like Doran's Blade, Hatchling, or Health Potion. Do not list core items here.)

CORE BUILD
1. <Item1> (<why this item: explain adaptation to enemy comp>)
2. <Item2> (<why this item: explain adaptation to enemy comp>)
3. <Item3> (<why this item>)
4. <Item4> (<why this item>)
5. <Item5> (<why this item>)
6. <Item6> (<why this item>)

SITUATIONAL ITEMS
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>

JUNGLE PATH (ONLY include this section if the role is Jungle)
Include the full jungle first clear route Ã¢â‚¬â€ list every camp you take in order, from start to first action. Use Ã¢Å¾â€ between camps. Minimum 6 camps.
Example (RED SIDE): Red Ã¢Å¾â€ Krugs Ã¢Å¾â€ Raptors Ã¢Å¾â€ Wolves Ã¢Å¾â€ Blue Ã¢Å¾â€ Gromp Ã¢Å¾â€ Scuttle
Example (BLUE SIDE): Blue Ã¢Å¾â€ Gromp Ã¢Å¾â€ Wolves Ã¢Å¾â€ Raptors Ã¢Å¾â€ Red Ã¢Å¾â€ Krugs Ã¢Å¾â€ Scuttle
Adapt the route to your selected champion and matchup. Do NOT output only 1 or 2 camps.

ENEMY POWER SPIKES
<EnemyChampion>: <Level/Item spike Ã¢â‚¬â€ what to watch for>
<EnemyChampion>: <Level/Item spike Ã¢â‚¬â€ what to watch for>

WIN CONDITION
<One or two sentences describing how to win this specific draft/matchup>

YOUR POWER SPIKES
1-item spike: <ItemName> Ã¢â‚¬â€ <why this is a power spike and how to play around it>
2-item spike: <Item1> + <Item2> Ã¢â‚¬â€ <why this combination is strong and what to do>

EXAMPLE (showing the expected reasoning depth Ã¢â‚¬â€ adapt to the actual request):
ANALYSIS
Matchup Type: Poke lane Ã¢â‚¬â€ Caitlyn outranges Jinx, expect harass with Q and headshots
Enemy Damage Split: 3 AP / 1 AD / 1 Tank Ã¢â‚¬â€ heavy magic damage from mid, jungle, and support
Key Threats: Syndra (burst mage, can one-shot at 6), Amumu (engage tank, R locks entire team)
Build Priority: Need MR to survive AP threats, but also need core crit scaling for Jinx's identity

RUNES
Primary: Precision
Keystone: Lethal Tempo
Presence of Mind
Legend: Bloodline
Cut Down
Secondary: Inspiration
Magical Footwear
Biscuit Delivery
Shards: Attack Speed, Adaptive Force, Health

CORE BUILD
1. Berserker's Greaves (Essential AS boots for auto-attack ADC)
2. Infinity Edge (Core crit multiplier Ã¢â‚¬â€ Jinx rockets scale with AD+crit multiplicatively)
3. Rapid Firecannon (Extended range helps vs Caitlyn's 650 range Ã¢â‚¬â€ safer kiting in lane)
4. Runaan's Hurricane (AOE rockets in teamfights Ã¢â‚¬â€ Jinx's identity item for multi-target DPS)
5. Wit's End (ADAPTED: 3 AP enemies Ã¢â‚¬â€ on-hit MR + damage solves survivability AND DPS simultaneously)
6. Guardian Angel (Late game insurance vs AP burst flanks from Syndra)
7. Bloodthirster (Lifesteal sustain for extended teamfights + overheal shield)
(END OF EXAMPLE Ã¢â‚¬â€ do not copy this example, generate a unique build for the actual request)

Rules:
- THINK THEN BUILD: Your ANALYSIS section must directly influence your item choices. If you identify "3 AP threats" in the analysis, at least 1-2 items in CORE BUILD must address that.
- PLAY LIKE A GRANDMASTER: Do not just output standard high-winrate builds. Analyze the lane matchup and the enemy team composition's damage split.
- ADAPTIVE KEYSTONES: Choose Keystones based on the lane. e.g. Fleet Footwork to survive heavy poke, Conqueror for extended melee trades, Grasp for short trades.
- ADAPTIVE ITEMS: Build defensive items earlier if the enemy comp dictates it. Reference the ENEMY TEAM PROFILE data provided.
- RUNE-ITEM COHERENCE: Your Keystone and items must form a coherent identity:
  Conqueror Ã¢â€ â€™ sustained trade items (Blade of the Ruined King, Death's Dance, Black Cleaver)
  Lethal Tempo Ã¢â€ â€™ attack speed items (Nashor's Tooth, Wit's End, Runaan's Hurricane)
  Electrocute Ã¢â€ â€™ burst items (Luden's, Shadowflame, Stormsurge)
  Fleet Footwork Ã¢â€ â€™ sustain/kiting items (Bloodthirster, Rapid Firecannon)
  Grasp Ã¢â€ â€™ bruiser/tank items (Sundered Sky, Sterak's Gage, Heartsteel)
  Dark Harvest Ã¢â€ â€™ snowball items (Mejai's Soulstealer, Shadowflame)
- ITEMS: Use ONLY items from the VALID COMPLETED ITEMS list provided. NEVER invent item names or use removed items.
- COUNTER-ITEMS: Use the CHAMPION-SPECIFIC COUNTER TIPS from the ENEMY TEAM PROFILE, but keep every item class-legal. Stasis/AP items are only legal for AP/mage champions; AD fighters use Guardian Angel, Sterak's Gage, Death's Dance, Maw, Randuin's, or Mercurial when appropriate.
- CORE BUILD must ALWAYS have exactly 6 items (7 items if the role is Bottom/ADC, since bottom laners have 7 item slots in Season 2026).
- SITUATIONAL ITEMS must ALWAYS have at least 4 items with clear conditions (e.g. "vs heavy AP", "if behind", "vs tanks").
- BOOTS: ONE pair of upgraded boots MUST be in CORE BUILD for all roles. ALWAYS place the upgraded boots as the FIRST or SECOND item in CORE BUILD. If you pick the "Magical Footwear" rune, include the UPGRADED boots. For Bottom/ADC: list 7 items total, placing boots 1st or 2nd.
- RUNES: Use ONLY runes from the VALID RUNES list provided in the user message. NEVER use old/removed rune names.
- SHARDS: Pick 1 from each row. Use ONLY from the VALID STAT SHARDS list.
- For jungle, include jungle companion start.
- Do NOT add explanations or extra text outside the sections.
- If role is Jungle, include JUNGLE PATH with a complete first clear: every camp in order, 6+ camps with Ã¢Å¾â€ arrows.
- ALWAYS include ENEMY POWER SPIKES, YOUR POWER SPIKES, and WIN CONDITION.
- Only output NEED_RETRY if the champion name or role is completely invalid/nonsensical.

COMMON MISTAKES Ã¢â‚¬â€ NEVER DO THESE:
Ã¢ÂÅ’ Do NOT put boots as item 5 or 6 Ã¢â‚¬â€ boots MUST be item 1 or 2 in CORE BUILD
Ã¢ÂÅ’ Do NOT suggest the same item twice in CORE BUILD
Ã¢ÂÅ’ Do NOT put starting items (Doran's, potions) in CORE BUILD
Ã¢ÂÅ’ Do NOT pick secondary runes from the SAME tree as primary
Ã¢ÂÅ’ Do NOT suggest 2 pairs of boots
Ã¢ÂÅ’ Do NOT suggest items that only exist in ARAM/Arena
Ã¢ÂÅ’ Do NOT output a generic cookie-cutter build Ã¢â‚¬â€ you MUST adapt to the enemy team profile
Ã¢Å“â€¦ ALWAYS adapt at least 1-2 items specifically to the enemy team composition
Ã¢Å“â€¦ ALWAYS explain HOW an item counters a specific enemy in the reason`;
    }

    function buildShortPrompt(patch) {
      return _prompts.buildShortPrompt(patch);
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ JSON Structured Output Schema Ã¢â€â‚¬Ã¢â€â‚¬
    // Keeps DeepSeek/OpenRouter output aligned with the expected response shape.
    const BUILD_RESPONSE_SCHEMA = {
      type: "object",
      properties: {
        analysis: {
          type: "object",
          description: "Matchup analysis Ã¢â‚¬â€ threats, damage types, build priorities",
          properties: {
            matchupType: { type: "string", description: "poke, all-in, sustain, or scaling" },
            enemyDamageSplit: { type: "string", description: "e.g. AD-heavy (3 AD: Zed, Yasuo, Caitlyn; 1 AP: Brand)" },
            keyThreats: { type: "string", description: "1-2 most dangerous enemies and why" },
            survivabilityRequirement: { type: "string", description: "Stat thresholds needed e.g. 3500+ HP, 150+ Armor" },
            itemPriorities: { type: "string", description: "1-3 most important item properties" }
          },
          required: ["matchupType", "enemyDamageSplit", "keyThreats"]
        },
        runes: {
          type: "object",
          description: "Complete rune page",
          properties: {
            primaryTree: { type: "string", description: "Precision, Domination, Sorcery, Resolve, or Inspiration" },
            keystone: { type: "string", description: "Keystone rune name" },
            primaryRunes: { type: "array", items: { type: "string" }, description: "Exactly 3 primary runes" },
            secondaryTree: { type: "string", description: "Secondary tree Ã¢â‚¬â€ DIFFERENT from primary" },
            secondaryRunes: { type: "array", items: { type: "string" }, description: "Exactly 2 secondary runes" },
            shards: { type: "array", items: { type: "string" }, description: "Exactly 3 stat shards" }
          },
          required: ["primaryTree", "keystone", "primaryRunes", "secondaryTree", "secondaryRunes", "shards"]
        },
        summoners: {
          type: "array", items: { type: "string" },
          description: "Exactly 2 summoner spell names e.g. Flash, Smite"
        },
        skillOrder: { type: "string", description: "Max priority e.g. Q > W > E > R" },
        startingItems: {
          type: "array", items: { type: "string" },
          description: "Exactly 2 items: 1 starting item + 1 potion. Total cost must be Ã¢â€°Â¤500g. Use ONLY items from the VALID STARTING ITEMS list. Example: ['Doran\\'s Blade', 'Health Potion']. Jungle: ['Scorchclaw Pup', 'Health Potion']. Support: ['World Atlas', 'Health Potion']."
        },
        coreBuild: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Item name from VALID ITEMS list" },
              reason: { type: "string", description: "Brief reason for this item" }
            },
            required: ["name", "reason"]
          },
          description: "6-7 items in buy order including boots"
        },
        situationalItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Item name from VALID ITEMS list" },
              condition: { type: "string", description: "When to buy this item" }
            },
            required: ["name", "condition"]
          },
          description: "At least 4 situational items with buy conditions"
        },
        augments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "ARAM Mayhem augment name exactly from the ARAM MAYHEM AUGMENT KNOWLEDGE catalog" },
              tier: { type: "string", description: "Silver, Gold, or Prismatic" },
              pickAt: { type: "string", description: "Pick 1, Pick 2, Pick 3, Pick 4, or level timing" },
              reason: { type: "string", description: "Why this augment is best for the champion and enemy matchup" }
            },
            required: ["name", "tier", "reason"]
          },
          description: "ARAM Mayhem only: exactly 4 matchup-aware augment recommendations"
        },
        junglePath: { type: "string", description: "First clear route if Jungle (6+ camps with > separator). Empty if not Jungle." },
        enemyPowerSpikes: { type: "string", description: "Key enemy power spikes (level + item)" },
        winCondition: { type: "string", description: "2 sentences: how this champion wins this draft" },
        yourPowerSpikes: { type: "string", description: "1-item and 2-item spike timings" }
      },
      required: ["analysis", "runes", "summoners", "skillOrder", "startingItems", "coreBuild", "situationalItems", "winCondition"]
    };

    /**
     * Convert a JSON build object (from structured output) into the clean text format
     * that the frontend parsers already understand. This means zero frontend changes needed.
     */
    function jsonBuildToText(json) {
      const lines = [];

      if (json.analysis) {
        lines.push('ANALYSIS');
        if (json.analysis.matchupType) lines.push(`Matchup Type: ${json.analysis.matchupType}`);
        if (json.analysis.enemyDamageSplit) lines.push(`Enemy Damage Split: ${json.analysis.enemyDamageSplit}`);
        if (json.analysis.keyThreats) lines.push(`Key Threats: ${json.analysis.keyThreats}`);
        if (json.analysis.survivabilityRequirement) lines.push(`Survivability Requirement: ${json.analysis.survivabilityRequirement}`);
        if (json.analysis.itemPriorities) lines.push(`Item Priorities: ${json.analysis.itemPriorities}`);
        lines.push('');
      }

      if (json.runes) {
        lines.push('RUNES');
        lines.push(`Primary: ${json.runes.primaryTree || ''}`);
        lines.push(`Keystone: ${json.runes.keystone || ''}`);
        if (json.runes.primaryRunes) json.runes.primaryRunes.forEach(r => lines.push(r));
        lines.push(`Secondary: ${json.runes.secondaryTree || ''}`);
        if (json.runes.secondaryRunes) json.runes.secondaryRunes.forEach(r => lines.push(r));
        if (json.runes.shards) lines.push(`Shards: ${json.runes.shards.join(', ')}`);
        lines.push('');
      }

      if (json.summoners) {
        lines.push('SUMMONERS');
        json.summoners.forEach(s => lines.push(s));
        lines.push('');
      }

      if (json.skillOrder) {
        lines.push('SKILL ORDER');
        lines.push(json.skillOrder);
        lines.push('');
      }

      if (json.startingItems) {
        lines.push('STARTING ITEMS');
        json.startingItems.forEach(item => lines.push(item));
        lines.push('');
      }

      if (json.coreBuild) {
        lines.push('CORE BUILD');
        json.coreBuild.forEach((item, i) => {
          lines.push(`${i + 1}. ${item.name}${item.reason ? ` (${item.reason})` : ''}`);
        });
        lines.push('');
      }

      if (json.situationalItems) {
        lines.push('SITUATIONAL ITEMS');
        json.situationalItems.forEach(item => {
          lines.push(`${item.name}: ${item.condition || ''}`);
        });
        lines.push('');
      }

      if (json.augments) {
        lines.push('AUGMENTS');
        json.augments.forEach((aug, i) => {
          const pickAt = aug.pickAt ? `${aug.pickAt}, ` : '';
          const tier = aug.tier ? `${aug.tier} ` : '';
          lines.push(`${i + 1}. ${aug.name} (${pickAt}${tier}augment)${aug.reason ? ` - ${aug.reason}` : ''}`);
        });
        lines.push('');
      }

      if (json.junglePath) {
        lines.push('JUNGLE PATH');
        lines.push(json.junglePath);
        lines.push('');
      }

      if (json.enemyPowerSpikes) {
        lines.push('ENEMY POWER SPIKES');
        lines.push(json.enemyPowerSpikes);
        lines.push('');
      }

      if (json.winCondition) {
        lines.push('WIN CONDITION');
        lines.push(json.winCondition);
        lines.push('');
      }

      if (json.yourPowerSpikes) {
        lines.push('YOUR POWER SPIKES');
        lines.push(json.yourPowerSpikes);
        lines.push('');
      }

      return lines.join('\n');
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Build Validation & Correction Pass Ã¢â€â‚¬Ã¢â€â‚¬
    // Levenshtein distance for fuzzy matching
    function levenshtein(a, b) {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
          );
        }
      }
      return dp[m][n];
    }

    function findClosestMatch(name, validList, maxDist = 5) {
      const norm = name.toLowerCase().trim();
      let best = null, bestDist = maxDist + 1;
      for (const valid of validList) {
        const dist = levenshtein(norm, valid.toLowerCase());
        if (dist < bestDist) {
          bestDist = dist;
          best = valid;
        }
      }
      return bestDist <= maxDist ? best : null;
    }
    /**
     * Normalize messy AI output into the clean format the UI parser expects.
     * Handles all known AI format deviations:
     * - "Primary Tree: X" Ã¢â€ â€™ "Primary: X"
     * - "Row N: RuneName" Ã¢â€ â€™ "RuneName"
     * - "Stat Shards:" + "Row N: X" Ã¢â€ â€™ "Shards: X, Y, Z"
     * - "1. Smite (reason)" Ã¢â€ â€™ "Smite"
     * - Verbose skill order Ã¢â€ â€™ "Q > W > E > R"
     * - "STEP N Ã¢â‚¬â€" sections stripped
     * - "CONSTRAINT:" prefix noise stripped from core build items
     */
    function normalizeAIOutput(text) {
      if (!text) return text;
      let out = text;

      // Ã¢â€â‚¬Ã¢â€â‚¬ Fix RUNES section Ã¢â€â‚¬Ã¢â€â‚¬
      // "Primary Tree: X" Ã¢â€ â€™ "Primary: X"
      out = out.replace(/Primary\s+Tree:\s*/gi, 'Primary: ');
      out = out.replace(/Secondary\s+Tree:\s*/gi, 'Secondary: ');

      // "Keystone: X (reason)" Ã¢â€ â€™ "Keystone: X"
      out = out.replace(/(Keystone:\s*[A-Za-z\s']+?)\s*\(.*?\)/gi, '$1');

      // "Row N: RuneName" Ã¢â€ â€™ "RuneName" (but NOT inside Shards)
      // This handles lines like "Row 1: Triumph" Ã¢â€ â€™ "Triumph"
      // We need to be careful not to strip "Row" from shard lines yet
      const runesMatch = out.match(/RUNES\n([\s\S]*?)(?=\n(?:SUMMONERS|SKILL ORDER|STARTING|CORE BUILD|\n\n))/i);
      if (runesMatch) {
        let runesBlock = runesMatch[1];

        // Detect and fix stat shards: "Stat Shards:" or "Shards:" followed by shard lines
        const blockLines = runesBlock.split('\n');
        let shardsStartIdx = -1;
        for (let i = 0; i < blockLines.length; i++) {
          if (/^(?:Stat\s+)?Shards?:\s*$/i.test(blockLines[i].trim()) || 
              /^(?:Stat\s+)?Shards?:\s*\n/i.test(blockLines[i].trim())) {
            shardsStartIdx = i;
            break;
          }
        }
        if (shardsStartIdx >= 0) {
          // Collect shard lines after the header
          const shardNames = [];
          // Check if the header line itself has inline shards: "Shards: X, Y, Z"
          const inlineMatch = blockLines[shardsStartIdx].match(/Shards?:\s*(.+)/i);
          if (inlineMatch && inlineMatch[1].trim().length > 0 && inlineMatch[1].includes(',')) {
            // Already inline format Ã¢â‚¬â€ leave it
          } else {
            // Collect subsequent lines as individual shard entries
            for (let i = shardsStartIdx + 1; i < blockLines.length; i++) {
              const l = blockLines[i].trim();
              if (!l) break; // Empty line = end of shards
              const shardName = l.replace(/^Row\s*\d+:\s*/i, '').trim();
              if (shardName) shardNames.push(shardName);
            }
            if (shardNames.length > 0) {
              // Replace the shards block with a single line
              const removeCount = shardNames.length + 1; // header + shard lines
              blockLines.splice(shardsStartIdx, removeCount, `Shards: ${shardNames.join(', ')}`);
              runesBlock = blockLines.join('\n');
            }
          }
        }

        // Strip "Row N:" prefix from remaining rune lines
        runesBlock = runesBlock.replace(/^(\s*)Row\s*\d+:\s*/gim, '$1');

        out = out.replace(runesMatch[1], runesBlock);
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Fix SUMMONERS section Ã¢â€â‚¬Ã¢â€â‚¬
      // "1. Smite (Required for Jungle)" Ã¢â€ â€™ "Smite"
      // "2. Ghost (Essential for sticking)" Ã¢â€ â€™ "Ghost"
      const summonersMatch = out.match(/SUMMONERS\n([\s\S]*?)(?=\n(?:SKILL ORDER|STARTING|CORE BUILD|\n\n))/i);
      if (summonersMatch) {
        let sumBlock = summonersMatch[1];
        const sumLines = sumBlock.split('\n');
        const cleanedSums = [];
        for (const line of sumLines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // Strip "1. " or "2. " prefix, and "(reason)" suffix
          const cleaned = trimmed
            .replace(/^\d+[\.\)]\s*/, '')  // Remove "1. " or "1) "
            .replace(/\s*\(.*\)\s*$/, '')  // Remove "(reason)"
            .replace(/\*\*/g, '')           // Remove **bold**
            .trim();
          if (cleaned) cleanedSums.push(cleaned);
        }
        if (cleanedSums.length > 0) {
          out = out.replace(summonersMatch[1], cleanedSums.join('\n') + '\n');
        }
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Fix SKILL ORDER section Ã¢â€â‚¬Ã¢â€â‚¬
      // Various formats: "Level 1: Q\nLevel 2: E\nMax: Q > W > E > R" 
      // or "Q > E > W > R" (already correct)
      // or "Maximum Skill Order: Q > W > E > R\nLevel 1: Q\nLevel 2: W"
      const skillMatch = out.match(/SKILL ORDER\n([\s\S]*?)(?=\n(?:STARTING|ANALYSIS|CORE BUILD|SUMMONERS|RUNES|\n\n))/i);
      if (skillMatch) {
        let skillBlock = skillMatch[1].trim();
        // Look for "Q > W > E > R" pattern anywhere in the block
        const maxOrderMatch = skillBlock.match(/(?:Max(?:imum)?(?:\s+Skill)?\s*(?:Order)?:?\s*)?([QWER])\s*>\s*([QWER])\s*>\s*([QWER])\s*>\s*([QWER])/i);
        if (maxOrderMatch) {
          // Extract just the Q > W > E > R part
          const order = `${maxOrderMatch[1].toUpperCase()} > ${maxOrderMatch[2].toUpperCase()} > ${maxOrderMatch[3].toUpperCase()} > ${maxOrderMatch[4].toUpperCase()}`;
          out = out.replace(skillMatch[1], order + '\n');
        } else {
          // Try to reconstruct from "Level 1: Q" format
          const levelLines = skillBlock.match(/(?:Level|Lv)\s*\d+:\s*([QWER])/gi);
          if (!levelLines) {
            // Try "MAX 1ST: Q" format
            const maxLines = skillBlock.match(/(?:Max|1st|2nd|3rd|4th)[^:]*:\s*([QWER])/gi);
            if (maxLines) {
              const abilities = maxLines.map(l => {
                const m = l.match(/([QWER])\s*$/i);
                return m ? m[1].toUpperCase() : '';
              }).filter(Boolean);
              if (abilities.length >= 3) {
                const allAbilities = ['Q', 'W', 'E', 'R'];
                const missing = allAbilities.filter(a => !abilities.includes(a));
                const fullOrder = [...abilities, ...missing];
                out = out.replace(skillMatch[1], fullOrder.join(' > ') + '\n');
              }
            }
          }
        }
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Strip "STEP N Ã¢â‚¬â€" section headers (AI sometimes outputs these) Ã¢â€â‚¬Ã¢â€â‚¬
      out = out.replace(/^STEP\s+\d+\s*[-Ã¢â‚¬â€:].+$/gm, '');

      // Ã¢â€â‚¬Ã¢â€â‚¬ Strip "(CONSTRAINT: ...)" from CORE BUILD but keep the reason Ã¢â€â‚¬Ã¢â€â‚¬
      // "1. Heartsteel (CONSTRAINT: THREAT_1 Ã¢â‚¬â€ rush HP)" Ã¢â€ â€™ "1. Heartsteel (rush HP)"
      out = out.replace(/\(CONSTRAINT:\s*(?:THREAT_\d+|ANTI_HEAL|BOOTS_CHOICE|KEY_POWERSPIKE)\s*[-Ã¢â‚¬â€]\s*/gi, '(');

      // Ã¢â€â‚¬Ã¢â€â‚¬ Strip "(PRIORITY N)" from item names Ã¢â€â‚¬Ã¢â€â‚¬
      // "2. LICH BANE (PRIORITY 1)" Ã¢â€ â€™ "2. Lich Bane"
      out = out.replace(/\s*\(PRIORITY\s*\d+\)/gi, '');

      // Ã¢â€â‚¬Ã¢â€â‚¬ Remove empty lines that pile up after stripping Ã¢â€â‚¬Ã¢â€â‚¬
      out = out.replace(/\n{4,}/g, '\n\n\n');

      return out;
    }

    async function validateAndCorrectBuild(text) {
      if (!text || text.trim() === 'NEED_RETRY') return text;

      // Step 0: Normalize AI output format (fix Row N:, Primary Tree:, etc.)
      text = normalizeAIOutput(text);

      // Collect all valid rune names from DDragon
      const runeData = await fetchDdragonRunes();
      const allValidRunes = [];
      if (runeData && runeData.trees) {
        for (const tree of runeData.trees) {
          allValidRunes.push(...tree.keystones.map(r => r.name), ...tree.slot1.map(r => r.name), ...tree.slot2.map(r => r.name), ...tree.slot3.map(r => r.name));
        }
      }
      const validTreeNames = runeData ? runeData.trees.map(t => t.name) : [];

      // Valid shards
      const validShards = [
        'Adaptive Force', 'Attack Speed', 'Ability Haste',  // Row 1
        'Adaptive Force', 'Move Speed', 'Health Scaling',     // Row 2
        'Health', 'Tenacity and Slow Resist', 'Health Scaling', // Row 3 (Season 2026: Armor & MR removed)
      ];
      const uniqueShards = [...new Set(validShards)];

      // Collect valid item names from DDragon
      const validItemNames = [];
      if (ddragonItemCache && ddragonItemCache.items) {
        for (const [norm, data] of ddragonItemCache.items) {
          validItemNames.push(data.name);
        }
      }

      // Build exact-match Sets for O(1) lookups (skip Levenshtein when unnecessary)
      const runeSet = new Set(allValidRunes);
      const treeSet = new Set(validTreeNames);
      const shardSet = new Set(uniqueShards);
      const itemSet = new Set(validItemNames.map(n => n.toLowerCase()));

      let corrected = text;
      const corrections = [];

      // Ã¢â€â‚¬Ã¢â€â‚¬ Validate RUNES section Ã¢â€â‚¬Ã¢â€â‚¬
      const runesMatch = text.match(/RUNES\n([\s\S]*?)(?=\n(?:SUMMONERS|SKILL ORDER|\n\n))/);
      if (runesMatch && allValidRunes.length > 0) {
        const runesBlock = runesMatch[1];
        const lines = runesBlock.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('Primary:') || trimmed.startsWith('Secondary:') || trimmed.startsWith('Shards:') || trimmed.startsWith('Keystone:')) {
            // Check tree names in Primary:/Secondary: lines
            const treeMatch = trimmed.match(/^(?:Primary|Secondary):\s*(.+)/);
            if (treeMatch) {
              const treeName = treeMatch[1].trim();
              if (!treeSet.has(treeName)) {
                const closest = findClosestMatch(treeName, validTreeNames, 4);
                if (closest) {
                  corrections.push(`Tree: "${treeName}" Ã¢â€ â€™ "${closest}"`);
                  corrected = corrected.replace(treeName, closest);
                }
              }
            }
            // Check keystone
            const keystoneMatch = trimmed.match(/^Keystone:\s*(.+)/);
            if (keystoneMatch) {
              const ks = keystoneMatch[1].trim();
              const allKeystones = runeData.trees.flatMap(t => t.keystones.map(r => r.name));
              if (!allKeystones.includes(ks)) {
                const closest = findClosestMatch(ks, allKeystones, 5);
                if (closest) {
                  corrections.push(`Keystone: "${ks}" Ã¢â€ â€™ "${closest}"`);
                  corrected = corrected.replace(ks, closest);
                }
              }
            }
            // Check shards
            if (trimmed.startsWith('Shards:')) {
              const shardsStr = trimmed.replace('Shards:', '').trim();
              const shardParts = shardsStr.split(',').map(s => s.trim());
              for (const shard of shardParts) {
                if (shard && !shardSet.has(shard)) {
                  const closest = findClosestMatch(shard, uniqueShards, 4);
                  if (closest) {
                    corrections.push(`Shard: "${shard}" Ã¢â€ â€™ "${closest}"`);
                    corrected = corrected.replace(shard, closest);
                  }
                }
              }
            }
            continue;
          }
          // Regular rune line
          if (trimmed && !runeSet.has(trimmed)) {
            const closest = findClosestMatch(trimmed, allValidRunes, 5);
            if (closest) {
              corrections.push(`Rune: "${trimmed}" Ã¢â€ â€™ "${closest}"`);
              corrected = corrected.replace(trimmed, closest);
            }
          }
        }
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Validate items in CORE BUILD, STARTING ITEMS, SITUATIONAL ITEMS Ã¢â€â‚¬Ã¢â€â‚¬
      if (validItemNames.length > 0) {
        // CORE BUILD: lines like "1. ItemName (reason)" or "1. ItemName"
        const coreMatch = corrected.match(/CORE BUILD\n([\s\S]*?)(?=\n(?:SITUATIONAL|JUNGLE PATH|ENEMY POWER|WIN CONDITION|\n\n))/);
        if (coreMatch) {
          const coreLines = coreMatch[1].split('\n');
          for (const line of coreLines) {
            const itemMatch = line.match(/^\d+[\.\)]\s*(.+?)(?:\s*\(.*\))?$/);
            if (itemMatch) {
              const itemName = itemMatch[1].trim();
              // Check if the item exists (case-insensitive)
              const exists = itemSet.has(itemName.toLowerCase());
              if (!exists) {
                const closest = findClosestMatch(itemName, validItemNames, 5);
                if (closest && closest.toLowerCase() !== itemName.toLowerCase()) {
                  corrections.push(`Item: "${itemName}" Ã¢â€ â€™ "${closest}"`);
                  corrected = corrected.replace(itemName, closest);
                }
              }
            }
          }
        }
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Validate SUMMONERS section Ã¢â€â‚¬Ã¢â€â‚¬
      const summonerData = await fetchDdragonSummoners();
      if (summonerData && summonerData.spells) {
        const summonerMatch = corrected.match(/SUMMONERS\n([\s\S]*?)(?=\n(?:SKILL ORDER|\n\n))/);
        if (summonerMatch) {
          const sumLines = summonerMatch[1].split('\n');
          for (const line of sumLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (!summonerData.spells.has(trimmed)) {
              const closest = findClosestMatch(trimmed, summonerData.spellNames, 5);
              if (closest) {
                corrections.push(`Summoner: "${trimmed}" Ã¢â€ â€™ "${closest}"`);
                corrected = corrected.replace(trimmed, closest);
              }
            }
          }
        }
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Fix #7: Duplicate item dedup in CORE BUILD Ã¢â€â‚¬Ã¢â€â‚¬
      const coreDedupMatch = corrected.match(/CORE BUILD\n([\s\S]*?)(?=\n(?:SITUATIONAL|JUNGLE PATH|ENEMY POWER|WIN CONDITION|YOUR POWER|\n\n))/);
      if (coreDedupMatch) {
        const coreBlock = coreDedupMatch[1];
        const coreItemLines = coreBlock.split('\n');
        const seenItems = new Set();
        const dedupedLines = [];
        let renumber = 1;
        for (const line of coreItemLines) {
          const itemMatch = line.match(/^\d+[\.\\)]\s*(.+?)(?:\s*\(.*\))?$/);
          if (itemMatch) {
            const itemKey = itemMatch[1].trim().toLowerCase();
            if (seenItems.has(itemKey)) {
              corrections.push(`Removed duplicate item: "${itemMatch[1].trim()}"`);
              continue; // Skip duplicate
            }
            seenItems.add(itemKey);
            // Re-number
            dedupedLines.push(line.replace(/^\d+/, String(renumber)));
            renumber++;
          } else {
            dedupedLines.push(line);
          }
        }
        if (dedupedLines.length < coreItemLines.length) {
          corrected = corrected.replace(coreBlock, dedupedLines.join('\n'));
        }
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Fix #8: Secondary tree must differ from primary tree Ã¢â€â‚¬Ã¢â€â‚¬
      const primaryTreeMatch = corrected.match(/Primary:\s*(\w+)/);
      const secondaryTreeMatch = corrected.match(/Secondary:\s*(\w+)/);
      if (primaryTreeMatch && secondaryTreeMatch) {
        const primaryTree = primaryTreeMatch[1].trim().toLowerCase();
        const secondaryTree = secondaryTreeMatch[1].trim().toLowerCase();
        if (primaryTree === secondaryTree && primaryTree !== '') {
          // Pick a different valid tree
          const allTrees = ['Precision', 'Domination', 'Sorcery', 'Resolve', 'Inspiration'];
          const alternatives = allTrees.filter(t => t.toLowerCase() !== primaryTree);
          if (alternatives.length > 0) {
            // Pick the most commonly paired secondary tree based on primary
            const pairings = {
              'precision': 'Domination', 'domination': 'Precision', 'sorcery': 'Inspiration',
              'resolve': 'Precision', 'inspiration': 'Sorcery',
            };
            const replacement = pairings[primaryTree] || alternatives[0];
            corrections.push(`Secondary tree "${secondaryTreeMatch[1]}" same as primary "${primaryTreeMatch[1]}" Ã¢â€ â€™ changed to "${replacement}"`);
            corrected = corrected.replace(/Secondary:\s*\w+/, `Secondary: ${replacement}`);
          }
        }
      }

      if (corrections.length > 0) {
        console.log(`[validation] Corrected ${corrections.length} names in build output:`);
        corrections.forEach(c => console.log(`  ${c}`));
      }

      return corrected;
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Completeness checker: detect missing required sections Ã¢â€â‚¬Ã¢â€â‚¬
    const REQUIRED_SECTIONS = ['RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS', 'WIN CONDITION'];
    const OPTIONAL_SECTIONS = ['SUMMONERS', 'STARTING ITEMS', 'SITUATIONAL ITEMS', 'ENEMY POWER SPIKES', 'YOUR POWER SPIKES'];

    function checkBuildCompleteness(text) {
      if (!text || text.length < 100) return { complete: false, missing: REQUIRED_SECTIONS };
      const missing = [];
      for (const section of REQUIRED_SECTIONS) {
        if (!text.includes(section)) {
          missing.push(section);
        }
      }
      return { complete: missing.length === 0, missing };
    }

    /**
     * If the AI output is incomplete (missing required sections), make a focused
     * follow-up call asking only for the missing sections. Returns the combined text.
     */
    async function completeMissingSections(partialText, genAI, patchDisplay, userMessage, sendSSE) {
      const { complete, missing } = checkBuildCompleteness(partialText);
      if (complete) return partialText;

      log('WARN', `[completeness] Output missing ${missing.length} sections: ${missing.join(', ')} Ã¢â‚¬â€ running completion call`);
      if (sendSSE) sendSSE({ phase: 'full', chunk: '\n\n' }); // Visual separator

      try {

        const completionPrompt = `The following build output was generated but is INCOMPLETE. It is missing these sections: ${missing.join(', ')}

PARTIAL OUTPUT (already generated):
${partialText.slice(-1500)}

Generate ONLY the missing sections: ${missing.join(', ')}
Use the same champion and matchup context. Follow the exact format from the system prompt.

${userMessage.slice(0, 2000)}`;

        const completionFullText = await llmGenerate('You are continuing an incomplete build. Generate only the missing sections. Be concise.', completionPrompt, { temperature: 0.2, maxTokens: 4096 });
        let completionText = completionFullText;
        if (sendSSE) sendSSE({ phase: 'full', chunk: completionText });

        if (completionText.length > 50) {
          const combined = partialText + '\n\n' + completionText;
          log('INFO', `[completeness] Completion call added ${completionText.length} chars Ã¢â‚¬â€ now has ${checkBuildCompleteness(combined).missing.length} missing sections`);
          return combined;
        }
      } catch (err) {
        log('ERROR', `[completeness] Completion call failed: ${err.message}`);
      }

      return partialText; // Return what we have if completion fails
    }

    /**
     * Attempt to repair truncated JSON from structured AI output.
     * Closes unclosed strings, arrays, and objects.
     */
    function repairTruncatedJson(raw) {
      if (!raw || raw.length < 50) return null;
      let s = raw.trim();
      // Close any unclosed string
      const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) s += '"';
      // Walk through to figure out what brackets/braces are unclosed
      const stack = [];
      let inString = false;
      let escape = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') stack.push('}');
        else if (c === '[') stack.push(']');
        else if (c === '}' || c === ']') stack.pop();
      }
      // Close any unclosed structures
      while (stack.length > 0) s += stack.pop();
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    }

    async function fetchRobustJsonBuild(genAI, primaryModelName, systemPrompt, userMessage, isStreaming = false, requestedModel = null) {
      const modelUsed = getOpenRouterModel(requestedModel);
      // Ã¢â€â‚¬Ã¢â€â‚¬ DeepSeek V4 Flash via OpenRouter Ã¢â‚¬â€ plain text, no JSON schema needed Ã¢â€â‚¬Ã¢â€â‚¬
      log('INFO', `[build-fetch] Generating via ${getModelDisplayName(modelUsed)} (OpenRouter)...`);
      const startTime = Date.now();
      try {
        const rawText = await llmGenerate(systemPrompt, userMessage, {
          temperature: 0.12,
          topP: 0.55,
          seed: stableHashSeed(`${modelUsed}|${userMessage}`),
          maxTokens: 8192,
          model: modelUsed,
        });
        const elapsedS = Math.round((Date.now() - startTime) / 1000);

        // Try to parse as JSON (if model outputs JSON despite text prompt)
        let cleanText = rawText;
        try {
          const stripped = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const buildJson = JSON.parse(stripped);
          if (buildJson.coreBuild && buildJson.coreBuild.length >= 5) {
            cleanText = jsonBuildToText(buildJson);
            log('INFO', `[build-fetch] ${getModelDisplayName(modelUsed)} JSON parsed (${cleanText.length} chars, ${elapsedS}s)`);
            return { text: cleanText, modelUsed, rawText };
          }
        } catch {
          // Not JSON Ã¢â‚¬â€ use as plain text (expected)
        }

        log('INFO', `[build-fetch] ${getModelDisplayName(modelUsed)} succeeded (${cleanText.length} chars, ${elapsedS}s)`);
        return { text: cleanText, modelUsed, rawText };
      } catch (e) {
        const elapsedS = Math.round((Date.now() - startTime) / 1000);
        log('ERROR', `[build-fetch] ${getModelDisplayName(modelUsed)} failed after ${elapsedS}s: ${e.message}`);
        return { text: '', modelUsed: 'failed', rawText: '' };
      }
    }

    async function generateBuild(body, shortPrompt) {
      // Get live patch from DDragon (never hardcoded)
      let livePatch;
      try {
        livePatch = await fetchDDragonVersion();
      } catch {
        livePatch = 'unknown';
      }
      const patchDisplay = livePatch.split('.').slice(0, 2).join('.');

      log('INFO', `[backend] Using model: ${getModelDisplayName(getOpenRouterModel(body.model))} (OpenRouter), patch: ${patchDisplay}`);

      const systemPrompt = shortPrompt ? buildShortPrompt(patchDisplay) : buildSystemPrompt(patchDisplay);

      // Inject RAG context into the user message
      const ragContext = getLocalRagContext(body.myChampion, body.role, body.enemies);

      // Fetch valid runes from DDragon for prompt injection
      let runesRef = '';
      try {
        const runeData = await fetchDdragonRunes();
        if (runeData) runesRef = runeData.reference;
      } catch (e) { console.warn('[build] Could not fetch DDragon runes:', e.message); }
      const bootsRef = getValidBootsReference();
      const itemsRef = getValidItemsReference();
      const startingItemsRef = getValidStartingItemsReference(body.role);
      const sumSpellsRef = await getSummonerSpellsReference();
      const enemyProfile = await computeEnemyProfile(body.enemies);

      const isBot = /^(bottom|adc|bot)$/i.test(body.role);
      const itemSlots = isBot ? 7 : 6;

      const enemyRoleContext = buildEnemyRoleContext(body);
      const matchupLine = enemyRoleContext.matchupLine;

      const allChamps = [body.myChampion, ...(body.enemies || [])];
      const mechMap = await _prompts.fetchMultipleChampionMechanics(allChamps);
      const mechContext = _prompts.buildMechanicsContext(body.myChampion, body.role, mechMap);
      const kbContext = getKBBuildContext(body.myChampion, body.role);
      const userMessage = `${ragContext}\n\n${runesRef}${bootsRef}${itemsRef}${startingItemsRef}${sumSpellsRef}${enemyProfile}\n${enemyRoleContext.context}\n${mechContext}\n${kbContext ? '\n' + kbContext + '\n' : ''}${matchupLine}Champion: ${body.myChampion}, Role: ${body.role}, Allies: ${(body.allies || []).join(', ') || 'none'}, Enemies: ${(body.enemies || []).join(', ') || 'none'}, Patch: ${patchDisplay} (Season 2026). This role has ${itemSlots} item slots Ã¢â‚¬â€ CORE BUILD must list exactly ${itemSlots} items (including boots). Use ONLY starting items from the VALID STARTING ITEMS list. startingItems must be exactly 2 items (1 starter + 1 potion).\n\nNEVER invent item names. If Jungle, include jungle path with 6+ camps.`;

      const { text: cleanText } = await fetchRobustJsonBuild(null, null, systemPrompt, userMessage, false, body.model);

      return { text: cleanText, patchUsed: patchDisplay };
    }

    function buildCacheKey(body, patchKey) {
      const allies = [...(body.allies || [])].sort().join(',');
      const enemies = [...(body.enemies || [])].sort().join(',');
      const enemyRoles = Object.entries(body.enemyRoles || {}).sort().map(([champ, role]) => `${champ}:${role}`).join(',');
      const modelKey = body.model || process.env.OPENROUTER_MODEL || OPENROUTER_MODEL;
      return `${patchKey}|${modelKey}|${body.myChampion}|${body.role}|${allies}|${enemies}|roles=${enemyRoles}`;
    }

    backendApp.post('/api/build', async (req, res) => {
      try {
        const body = req.body;
        if (!body.myChampion || !body.role) {
          return res.status(400).json({ ok: false, source: 'error', message: 'Missing required fields', canRetry: false });
        }

        // Use live DDragon patch for cache key (not hardcoded)
        let livePatch;
        try {
          livePatch = await fetchDDragonVersion();
        } catch {
          livePatch = body.patch || 'unknown';
        }
        const patchKey = livePatch.split('.').slice(0, 2).join('.');

        const cacheKey = buildCacheKey(body, patchKey);
        const cached = getCache(cacheKey);

        if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
          return res.json({ ok: true, source: 'cache', patchDetected: cached.patchDetected, text: cached.text });
        }

        let lastError = '';
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            console.log(`[backend] Attempt ${attempt + 1} for ${body.myChampion} ${body.role}`);
            const result = await generateBuild(body, false);

            // Ã¢â€â‚¬Ã¢â€â‚¬ Build Validation & Correction Pass Ã¢â€â‚¬Ã¢â€â‚¬
            result.text = sanitizeEnemyRoleClaims(await validateAndCorrectBuild(result.text), body);

            if (result.text.trim() === 'NEED_RETRY') {
              console.log('[backend] Got NEED_RETRY, trying short prompt...');
              const retry = await generateBuild(body, true);
              if (retry.text.trim() === 'NEED_RETRY') {
                lastError = 'AI returned NEED_RETRY on all attempts';
                break;
              }
              retry.text = sanitizeEnemyRoleClaims(await validateAndCorrectBuild(retry.text), body);
              setCache(cacheKey, retry.text, retry.patchUsed);
              return res.json({ ok: true, source: 'grounded', patchDetected: retry.patchUsed, text: retry.text });
            }

            setCache(cacheKey, result.text, result.patchUsed);
            return res.json({ ok: true, source: 'grounded', patchDetected: result.patchUsed, text: result.text });
          } catch (err) {
            lastError = err.message || 'Unknown error';
            console.error(`[backend] Attempt ${attempt + 1} failed:`, lastError);
            const isRetryable = (err.status && err.status >= 500) || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || (err.message && err.message.includes('timeout'));
            if (!isRetryable && attempt === 0) break;
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(r => setTimeout(r, delay));
          }
        }

        if (cached) {
          return res.json({ ok: true, source: 'stale-cache', patchDetected: cached.patchDetected, text: cached.text });
        }

        res.status(500).json({ ok: false, source: 'error', message: lastError || 'Failed to generate build', canRetry: true });
      } catch (err) {
        console.error('[backend] Unhandled error:', err);
        res.status(500).json({ ok: false, source: 'error', message: err.message || 'Internal server error', canRetry: true });
      }
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬ Streaming Build Endpoint (SSE) Ã¢â€â‚¬Ã¢â€â‚¬
    backendApp.post('/api/build-stream', async (req, res) => {
      try {
        const body = req.body;
        if (!body.myChampion || !body.role) {
          return res.status(400).json({ ok: false, message: 'Missing required fields' });
        }

        // SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

        // Check cache first
        let livePatch;
        try { livePatch = await fetchDDragonVersion(); } catch { livePatch = body.patch || 'unknown'; }
        const patchKey = livePatch.split('.').slice(0, 2).join('.');
        const cacheKey = buildCacheKey(body, patchKey);
        const cached = getCache(cacheKey);

        if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
          sendSSE({ chunk: cached.text, done: true, source: 'cache', patchUsed: cached.patchDetected });
          return res.end();
        }

        // Generate with streaming
        // Using DeepSeek V4 Flash via OpenRouter.


        const patchDisplay = livePatch.split('.').slice(0, 2).join('.');

        const systemPrompt = buildSystemPrompt(patchDisplay);

        const ragContext = getLocalRagContext(body.myChampion, body.role, body.enemies);
        let runesRef = '';
        try {
          const runeData = await fetchDdragonRunes();
          if (runeData) runesRef = runeData.reference;
        } catch (e) { /* ignore */ }
        const bootsRef = getValidBootsReference();
        const itemsRef = getValidItemsReference();
        const sumSpellsRef = await getSummonerSpellsReference();
        const enemyProfile = await computeEnemyProfile(body.enemies);

        const isBot = /^(bottom|adc|bot)$/i.test(body.role);
        const itemSlots = isBot ? 7 : 6;

        // Matchup context injection
        const enemyRoleContext = buildEnemyRoleContext(body);
        const matchupLine = enemyRoleContext.matchupLine;

        // Ã¢â€â‚¬Ã¢â€â‚¬ Ability mechanics context (dynamically fetched from DDragon) Ã¢â€â‚¬Ã¢â€â‚¬
        const allChamps2 = [body.myChampion, ...(body.enemies || [])];
        const mechMap2 = await _prompts.fetchMultipleChampionMechanics(allChamps2);
        const mechContext = _prompts.buildMechanicsContext(body.myChampion, body.role, mechMap2);
        const userMessage = `${ragContext}\n\n${runesRef}${bootsRef}${itemsRef}${sumSpellsRef}${enemyProfile}\n${enemyRoleContext.context}\n${mechContext}\n${matchupLine}Champion: ${body.myChampion}, Role: ${body.role}, Allies: ${(body.allies || []).join(', ') || 'none'}, Enemies: ${(body.enemies || []).join(', ') || 'none'}, Patch: ${patchDisplay} (Season 2026). This role has ${itemSlots} item slots Ã¢â‚¬â€ CORE BUILD must list exactly ${itemSlots} items (including boots). Use ONLY runes and shards from the VALID RUNES list above. Use ONLY items from the VALID COMPLETED ITEMS list above. Generate optimized build. Output DECISION TRACE first, then ANALYSIS and all visible sections.\n\nÃ¢Å¡Â Ã¯Â¸Â FINAL REMINDER: Every item in CORE BUILD and SITUATIONAL ITEMS MUST appear in the VALID COMPLETED ITEMS list above. If you cannot find an item in that list, it does NOT exist in the current patch Ã¢â‚¬â€ pick the closest valid alternative. NEVER invent item names.`;

        sendSSE({ patchUsed: patchDisplay });

        try {
          const fullStreamText = await llmGenerateStream(buildSystemPrompt(patchDisplay), userMessage, {
            temperature: 0.12,
            topP: 0.55,
            seed: stableHashSeed(`${patchDisplay}|${body.myChampion}|${body.role}|${(body.enemies || []).join(',')}|${body.model || ''}`),
            maxTokens: 8192,
            model: body.model,
          }, (chunk) => { sendSSE({ chunk }); });
          let fullText = fullStreamText;

          // Validate & correct
          const corrected = await validateAndCorrectBuild(fullText);

          // Debug: log the raw JUNGLE PATH section before corrections
          const rawJungleMatch = fullText.match(/JUNGLE PATH\n([\s\S]*?)(?=\n(?:ENEMY|YOUR|WIN|\n\n))/);
          if (rawJungleMatch) {
            console.log('[backend] RAW JUNGLE PATH from AI:', JSON.stringify(rawJungleMatch[1].substring(0, 300)));
          } else {
            console.log('[backend] NO JUNGLE PATH section found in AI output. First 300 chars:', JSON.stringify(fullText.substring(0, 300)));
          }

          if (corrected.trim() === 'NEED_RETRY') {
            sendSSE({ error: 'NEED_RETRY Ã¢â‚¬â€ build generation failed' });
            return res.end();
          }

          const judged = judgeReasoningQuality(corrected, body, mechMap2);
          if (judged.issues.length) {
            log('WARN', `[judge] ${body.myChampion} ${body.role}: ${judged.score}/100 - ${judged.issues.join('; ')}`);
          }
          const visibleCorrected = stripDecisionTrace(sanitizeEnemyRoleClaims(corrected, body));

          // If corrections were made, send the corrected version
          if (visibleCorrected !== fullText) {
            sendSSE({ corrected: visibleCorrected });
          }

          setCache(cacheKey, visibleCorrected, patchDisplay);
          sendSSE({ done: true, source: 'grounded', patchUsed: patchDisplay, fullText: visibleCorrected });
        } catch (err) {
          console.error('[stream] Generation error:', err.message);
          // Fallback to stale cache
          if (cached) {
            sendSSE({ chunk: cached.text, done: true, source: 'stale-cache', patchUsed: cached.patchDetected });
          } else {
            sendSSE({ error: err.message });
          }
        }

        res.end();
      } catch (err) {
        console.error('[stream] Unhandled error:', err);
        if (!res.headersSent) {
          res.status(500).json({ ok: false, message: err.message });
        } else {
          res.end();
        }
      }
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬ Dual-Model Build Endpoint (SSE) Ã¢â€â‚¬Ã¢â€â‚¬
    // Now uses DeepSeek V4 Flash via OpenRouter for ALL generation
    backendApp.post('/api/build-dual', async (req, res) => {
      try {
        const body = req.body;
        if (!body.myChampion || !body.role) {
          return res.status(400).json({ ok: false, message: 'Missing required fields' });
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

        // Check cache
        let livePatch;
        try { livePatch = await fetchDDragonVersion(); } catch { livePatch = body.patch || 'unknown'; }
        const patchDisplay = livePatch.split('.').slice(0, 2).join('.');
        const cached = null; // Generation path intentionally runs fresh; no build caching for now.
        let instantMetaText = '';

        if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
          sendSSE({ phase: 'full', chunk: cached.text, done: true, source: 'cache', patchUsed: cached.patchDetected, model: 'cache' });
          return res.end();
        }

        const requestedGameMode = body.gameMode || 'sr';
        if (['sr', 'aram', 'aram-mayhem'].includes(requestedGameMode)) {
          instantMetaText = buildInstantMetaText(body, patchDisplay);
          if (instantMetaText) {
            sendSSE({
              phase: 'meta',
              done: true,
              source: 'meta',
              patchUsed: patchDisplay,
              fullText: instantMetaText,
              model: 'ugg-kb',
            });
            if (body.generationMode === 'meta-preview') {
              sendSSE({ allDone: true });
              return res.end();
            }
          } else {
            const anyRoleTemplate = findAnyKBBuildTemplateForChampion(body.myChampion, requestedGameMode);
            const isModeMeta = requestedGameMode === 'aram' || requestedGameMode === 'aram-mayhem';
            sendSSE({
              phase: 'meta-status',
              source: isModeMeta ? 'meta-missing-champion' : 'meta-missing-role',
              patchUsed: patchDisplay,
              champion: body.myChampion,
              requestedRole: body.role,
              availableRole: anyRoleTemplate?.role || null,
              message: isModeMeta
                ? `No U.GG ${requestedGameMode === 'aram-mayhem' ? 'ARAM Mayhem' : 'ARAM'} meta is available for ${body.myChampion}; AI is building from validated patch data instead.`
                : anyRoleTemplate?.role
                ? `No exact U.GG ${body.role} page is available for ${body.myChampion}; AI is adapting from validated patch data instead.`
                : `No U.GG page is available for ${body.myChampion}; AI is building from validated patch data instead.`,
            });
            if (body.generationMode === 'meta-preview') {
              sendSSE({ allDone: true });
              return res.end();
            }
          }
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬ Game Mode Detection Ã¢â€â‚¬Ã¢â€â‚¬
        const gameMode = body.gameMode || 'sr';
        const mapId = gameMode === 'sr' ? 11 : 12;
        const isARAM = gameMode !== 'sr';

        // Ã¢â€â‚¬Ã¢â€â‚¬ Mode-specific system prompt Ã¢â€â‚¬Ã¢â€â‚¬
        const systemPrompt = gameMode === 'aram-mayhem'
          ? _prompts.buildAramMayhemSystemPrompt(patchDisplay)
          : gameMode === 'aram'
            ? _prompts.buildAramSystemPrompt(patchDisplay)
            : buildSystemPrompt(patchDisplay);

        // Shared context
        const ragContext = getLocalRagContext(body.myChampion, body.role, body.enemies);
        const hasMetaBaseline = Boolean(instantMetaText) && !isARAM;
        let runesRef = '';
        try {
          const rd = await fetchDdragonRunes();
          if (rd) runesRef = hasMetaBaseline ? 'RUNES: use exact current rune names; prefer the meta baseline page unless matchup pressure clearly demands a change.\n' : rd.reference;
        } catch {}
        const compactRef = hasMetaBaseline ? getCompactRefinementReference(body.role) + '\n' : '';
        const bootsRef = hasMetaBaseline ? '' : getValidBootsReference(mapId);
        const itemsRef = hasMetaBaseline ? compactRef : getValidItemsReference(mapId);
        const startingItemsRef = hasMetaBaseline ? '' : getValidStartingItemsReference(body.role, mapId);
        const metaRef = isARAM ? '' : getMetaBuildReference(body.myChampion, body.role);
        const sumSpellsRef = await getSummonerSpellsReference();
        const enemyProfile = isARAM ? '' : await computeEnemyProfile(body.enemies);
        const isBot = !isARAM && /^(bottom|adc|bot)$/i.test(body.role);
        const itemSlots = isBot ? 7 : 6;
        const enemyRoleContext = !isARAM ? buildEnemyRoleContext(body) : { context: '', matchupLine: '' };
        const matchupLine = enemyRoleContext.matchupLine;

        // Ability mechanics context
        const allChamps3 = [body.myChampion, ...(body.enemies || [])];
        const mechMap3 = await _prompts.fetchMultipleChampionMechanics(allChamps3);
        const mechContext = _prompts.buildMechanicsContext(body.myChampion, body.role, mechMap3);
        if (gameMode === 'aram-mayhem') {
          await ensureDdragonChampCache().catch(() => null);
        }
        const refinementBaseline = buildAiRefinementBaseline(instantMetaText);
        const kbContext = refinementBaseline ? '' : getKBBuildContext(body.myChampion, body.role);

        // Build user message
        let fullUserMessage;
        if (isARAM) {
          const modeLabel = gameMode === 'aram-mayhem' ? 'ARAM: Mayhem' : 'ARAM';
          const augmentsRef = gameMode === 'aram-mayhem' ? getAugmentsReference(body.myChampion, body, mechMap3) : '';
          const modeKbContext = getKBBuildContext(body.myChampion, body.role, gameMode);
          const mayhemAugmentTask = gameMode === 'aram-mayhem'
            ? `\n\nARAM MAYHEM AUGMENT TASK:\n- You MUST output an AUGMENTS section with exactly 4 augment recommendations.\n- Choose from DRAFT-SCORED AUGMENT CANDIDATES first; use the FULL CATALOG only when a matchup-specific reason clearly beats a candidate.\n- Each line must include: augment name, tier, pick timing/priority, and a matchup-specific reason.\n- Rank Prismatic/Gold/Silver by actual power, champion synergy, enemy threats, damage profile, and whether the effect solves this draft. Do not blindly choose highest tier if it does not fit.\n- Never invent augment names. Never omit AUGMENTS in ARAM: Mayhem.`
            : '';
          fullUserMessage = `${ragContext}\n\n${runesRef}${bootsRef}${itemsRef}${startingItemsRef}${sumSpellsRef}${augmentsRef}\n${mechContext}\n${modeKbContext ? '\n' + modeKbContext + '\n' : ''}${metaRef ? '\n' + metaRef + '\n' : ''}Champion: ${body.myChampion}, Mode: ${modeLabel}, Allies: ${(body.allies || []).join(', ') || 'none'}, Enemies: ${(body.enemies || []).join(', ') || 'none'}, Patch: ${patchDisplay} (Season 2026). coreBuild must list exactly 6 items (including boots). startingItems should use the U.GG ARAM opener when available; otherwise return []. Use ONLY items from the VALID COMPLETED ITEMS list above. Use ONLY runes from the VALID RUNES list above.${mayhemAugmentTask}\n\nNEVER invent item names. This is ${modeLabel} mode Ã¢â‚¬â€ no Doran's items, no jungle, no lane matchup.`;
        } else {
          const variantContext = hasMetaBaseline ? getKBBuildContext(body.myChampion, body.role) : kbContext;
          const metaGuidance = refinementBaseline
            ? `${refinementBaseline}\n${variantContext ? '\n' + variantContext + '\n' : ''}`
            : (kbContext ? '\n' + kbContext + '\n' : '');
          fullUserMessage = `${ragContext}\n\n${runesRef}${bootsRef}${itemsRef}${startingItemsRef}${sumSpellsRef}${enemyProfile}\n${enemyRoleContext.context}\n${mechContext}\n${metaGuidance}${matchupLine}Champion: ${body.myChampion}, Role: ${body.role}, Allies: ${(body.allies || []).join(', ') || 'none'}, Enemies: ${(body.enemies || []).join(', ') || 'none'}, Patch: ${patchDisplay} (Season 2026). This role has ${itemSlots} item slots Ã¢â‚¬â€ CORE BUILD must list exactly ${itemSlots} items (including boots). Use ONLY starting items from the VALID STARTING ITEMS list. startingItems must be exactly 2 items (1 starter + 1 potion).\n\nNEVER invent item names. If Jungle, include jungle path with 6+ camps.`;
        }

        sendSSE({ patchUsed: patchDisplay, dualMode: false, gameMode });
        const aiModel = getOpenRouterModel(body.model);
        const draftSeed = stableHashSeed([
          patchDisplay,
          gameMode,
          body.myChampion,
          body.role,
          (body.allies || []).join(','),
          (body.enemies || []).join(','),
          aiModel,
        ].join('|'));
        log('INFO', `[dual] Starting ${getModelDisplayName(aiModel)} generation: gameMode=${gameMode} for ${body.myChampion} ${body.role || 'ARAM'}`);

        // Ã¢â€â‚¬Ã¢â€â‚¬ Single DeepSeek call with streaming Ã¢â€â‚¬Ã¢â€â‚¬
        try {
          const fullText = await llmGenerateStream(systemPrompt, fullUserMessage, {
            temperature: hasMetaBaseline ? 0.05 : 0.12,
            topP: hasMetaBaseline ? 0.35 : 0.55,
            seed: draftSeed,
            maxTokens: 8192,
            model: aiModel,
          }, (chunk) => {
            sendSSE({ phase: 'full', chunk });
          });

          let validated = await validateAndCorrectBuild(fullText);
          if (hasMetaBaseline) {
            validated = stabilizeAgainstMetaBaseline(validated, instantMetaText);
          }
          validated = enforceRoleSafeItems(validated, body);
          validated = repairStartingItems(validated, body);
          validated = dedupeAndPadCoreBuild(validated, body);
          if (hasMetaBaseline) {
            validated = stabilizeAgainstMetaBaseline(validated, instantMetaText);
            validated = enforceRoleSafeItems(validated, body);
            validated = repairStartingItems(validated, body);
            validated = dedupeAndPadCoreBuild(validated, body);
          }
          validated = enforceDraftCounterLogic(validated, body, mechMap3);
          if (gameMode === 'aram-mayhem') {
            validated = ensureMayhemAugmentsSection(validated, body, mechMap3);
          }
          validated = enforceRoleSafeItems(validated, body);
          validated = dedupeAndPadCoreBuild(validated, body);
          validated = sanitizeNarrativeAgainstFinalItems(validated, body, mechMap3);
          validated = sanitizeEnemyRoleClaims(validated, body);
          const judged = judgeReasoningQuality(validated, body, mechMap3);
          if (judged.issues.length) {
            log('WARN', `[judge] ${getModelDisplayName(aiModel)} ${body.myChampion} ${body.role}: ${judged.score}/100 - ${judged.issues.join('; ')}`);
          }
          let visibleValidated = stripDecisionTrace(validated);
          if (gameMode === 'aram-mayhem') {
            visibleValidated = ensureMayhemAugmentsSection(visibleValidated, body, mechMap3);
          }
          if (!isUsableBuildText(validated, body.role)) {
            if (instantMetaText) {
              const fallbackText = fallbackToMetaBuild(instantMetaText, body, mechMap3);
              log('WARN', `[dual] ${getModelDisplayName(aiModel)} returned an unusable build; falling back to validated U.GG baseline`);
              sendSSE({ phase: 'full', done: true, source: 'meta-fallback', patchUsed: patchDisplay, fullText: stripDecisionTrace(fallbackText), model: 'ugg-kb' });
              sendSSE({ allDone: true });
              return res.end();
            }
            const fallbackText = buildEmergencyFallbackText(body, patchDisplay, mechMap3);
            if (isUsableBuildText(fallbackText, body.role)) {
              log('WARN', `[dual] ${getModelDisplayName(aiModel)} returned an unusable build; using validated role fallback`);
              sendSSE({ phase: 'full', done: true, source: 'validated-fallback', patchUsed: patchDisplay, fullText: fallbackText, model: 'validated-fallback' });
              sendSSE({ allDone: true });
              return res.end();
            }
            sendSSE({ phase: 'full', done: true, error: 'AI returned an unusable build. Please retry.' });
            sendSSE({ allDone: true });
            return res.end();
          }
          if (visibleValidated !== fullText) {
            sendSSE({ phase: 'full', corrected: visibleValidated });
          }
          sendSSE({ phase: 'full', done: true, source: 'grounded', patchUsed: patchDisplay, fullText: visibleValidated, model: aiModel });
          log('INFO', `[dual] ${getModelDisplayName(aiModel)} build complete (${fullText.length} chars)`);
        } catch (err) {
          log('ERROR', `[dual] ${getModelDisplayName(aiModel)} generation failed: ${err.message}`);
          if (cached) {
            sendSSE({ phase: 'full', chunk: cached.text, done: true, source: 'stale-cache', patchUsed: cached.patchDetected, model: 'cache' });
          } else if (instantMetaText) {
            sendSSE({ phase: 'full', done: true, source: 'meta-fallback', patchUsed: patchDisplay, fullText: stripDecisionTrace(instantMetaText), model: 'ugg-kb' });
          } else {
            sendSSE({ error: err.message });
          }
        }

        sendSSE({ allDone: true });
        res.end();
      } catch (err) {
        console.error('[dual] Unhandled error:', err);
        if (!res.headersSent) {
          res.status(500).json({ ok: false, message: err.message });
        } else {
          res.end();
        }
      }
    });

    backendApp.get('/logo', (_req, res) => {
      const logoPath = isDev
        ? path.resolve(__dirname, '../../../../assets/icon.png')
        : path.join(process.resourcesPath, 'icon.png');
      if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath);
      } else {
        res.status(404).send('Not found');
      }
    });

    backendApp.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // RAG status endpoint
    backendApp.get('/api/rag/status', (_req, res) => {
      const meta = getRagMeta();
      res.json({
        isUpdating: isRagUpdating,
        patch: meta?.patch || null,
        updatedAt: meta?.updatedAt || null,
      });
    });

    // RAG force-sync endpoint
    backendApp.post('/api/rag/sync', async (_req, res) => {
      try {
        const version = await fetchDDragonVersion();
        checkAndSyncRag(version, true); // fire-and-forget
        syncAllMetaBuilds(version, true).catch(err => log('WARN', '[api] Meta sync failed: ' + err.message)); // also sync meta
        res.json({ ok: true, message: 'RAG + Meta Build sync started' });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Meta build status endpoint
    backendApp.get('/api/meta-builds/status', (_req, res) => {
      const meta = getMetaBuildMeta();
      let champCount = 0;
      try {
        if (fs.existsSync(META_BUILDS_SR_DIR)) {
          champCount = fs.readdirSync(META_BUILDS_SR_DIR).filter(f => f.endsWith('.json')).length;
        }
      } catch {}
      res.json({
        isSyncing: isMetaSyncing,
        patch: meta?.patch || null,
        updatedAt: meta?.updatedAt || null,
        champCount,
      });
    });

    const server = backendApp.listen(PORT, '127.0.0.1', () => {
      console.log(`[backend] DraftCoach backend running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('[backend] Server error:', err);
      resolve(null);
    });
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Window Management Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function createWindow() {
  Menu.setApplicationMenu(null);
  const iconPath = isDev
    ? path.resolve(__dirname, '../../../../assets/icon.png')
    : path.join(process.resourcesPath, 'icon.png');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f1a',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  });

  // Disable HTTP cache so builds always load fresh renderer code
  win.webContents.session.clearCache().catch(() => { });

  win.once('ready-to-show', () => {
    win.show();
  });

  if (isDev) {
    win.loadURL('http://localhost:9000');
    win.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    log('INFO', '[main] Loading: ' + indexPath + ' exists: ' + fs.existsSync(indexPath));
    win.loadFile(indexPath);
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] Failed to load:', errorCode, errorDescription);
  });

  mainWindow = win;
  return win;
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  // Fullscreen transparent overlay Ã¢â‚¬â€ elements position themselves at screen edges
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  });

  // Highest always-on-top level Ã¢â‚¬â€ sits above fullscreen/borderless games
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  // Click-through: mouse events pass to the game underneath
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    overlayWindow.loadURL('http://localhost:9000/#/overlay');
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    overlayWindow.loadFile(indexPath, { hash: '/overlay' });
  }

  // Once overlay content loads, send any existing overlay data
  overlayWindow.webContents.on('did-finish-load', () => {
    if (overlayData && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay-data-update', overlayData);
      console.log('[main] Sent cached overlay data to overlay window');
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Crash Recovery (#16) Ã¢â€â‚¬Ã¢â€â‚¬
  overlayWindow.webContents.on('crashed', () => {
    console.error('[overlay] Renderer process crashed! Recreating...');
    overlayWindow = null;
    setTimeout(() => {
      createOverlayWindow();
      // Re-show if it was visible before
      if (overlayData) {
        setTimeout(() => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('overlay-data-update', overlayData);
            overlayWindow.showInactive();
          }
        }, 500);
      }
    }, 1000);
  });

  console.log('[main] Overlay window created (hidden)');
}

function createScoutWindow() {
  if (scoutWindow && !scoutWindow.isDestroyed()) {
    scoutWindow.focus();
    return;
  }

  scoutWindow = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 400,
    minHeight: 400,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1923',
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  });

  if (isDev) {
    scoutWindow.loadURL('http://localhost:9000/#/scout');
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    scoutWindow.loadFile(indexPath, { hash: '/scout' });
  }

  scoutWindow.once('ready-to-show', () => {
    scoutWindow.show();
  });

  // Send cached report when window is ready
  scoutWindow.webContents.on('did-finish-load', () => {
    if (cachedScoutReport && scoutWindow && !scoutWindow.isDestroyed()) {
      scoutWindow.webContents.send('scout-report', cachedScoutReport);
      scoutWindow.webContents.send('scout-status', { phase: 'done', message: 'Scouting report ready!' });
    }
  });

  scoutWindow.on('closed', () => { scoutWindow = null; });
  console.log('[main] Scout window created');
}

function createStatsWindow() {
  if (statsWindow && !statsWindow.isDestroyed()) {
    statsWindow.focus();
    return;
  }

  statsWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 420,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1016',
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  });

  if (isDev) {
    statsWindow.loadURL('http://localhost:9000/#/stats');
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    statsWindow.loadFile(indexPath, { hash: '/stats' });
  }

  statsWindow.once('ready-to-show', () => {
    statsWindow.show();
  });

  statsWindow.on('closed', () => { statsWindow = null; });
  console.log('[main] Stats window created');
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã¢â€â‚¬Ã¢â€â‚¬ SCOREBOARD WINDOW + COOLDOWN TRACKER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

let _scoreboardCreating = false; // Lock to prevent duplicate window creation

function createScoreboardWindow() {
  if (scoreboardWindow && !scoreboardWindow.isDestroyed()) {
    scoreboardWindow.show();
    scoreboardWindow.focus();
    return;
  }
  // Prevent race condition from game detection interval firing twice
  if (_scoreboardCreating) return;
  _scoreboardCreating = true;

  scoreboardWindow = new BrowserWindow({
    width: 900,
    height: 380,
    minWidth: 700,
    minHeight: 300,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#010A13',
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  });

  if (isDev) {
    scoreboardWindow.loadURL('http://localhost:9000/#/scoreboard');
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    scoreboardWindow.loadFile(indexPath, { hash: '/scoreboard' });
  }

  scoreboardWindow.once('ready-to-show', () => {
    scoreboardWindow.show();
    _scoreboardCreating = false;
  });

  scoreboardWindow.on('closed', () => {
    scoreboardWindow = null;
    _scoreboardCreating = false;
    stopScoreboardPolling();
  });

  console.log('[main] Scoreboard window created');
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tracker Window (dedicated clickable panel, right edge) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
let _trackerCreating = false;

function createTrackerWindow() {
  if (trackerWindow && !trackerWindow.isDestroyed()) {
    trackerWindow.show();
    return;
  }
  if (_trackerCreating) return;
  _trackerCreating = true;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.bounds;
  const winW = 140;  // Just enough for champ + 3 spell icons
  const winH = 185;  // 5 enemy rows

  trackerWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: screenW - winW,  // Flush right edge
    y: Math.round((screenH - winH) / 2), // Vertically centered
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,       // Won't steal game focus, BUT still receives clicks
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  });

  trackerWindow.setAlwaysOnTop(true, 'screen-saver');
  // NO setIgnoreMouseEvents Ã¢â‚¬â€ clicks go through normally!

  if (isDev) {
    trackerWindow.loadURL('http://localhost:9000/#/tracker');
  } else {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    trackerWindow.loadFile(indexPath, { hash: '/tracker' });
  }

  trackerWindow.once('ready-to-show', () => {
    trackerWindow.showInactive(); // Show without stealing focus from the game
    _trackerCreating = false;
    console.log('[main] Tracker window shown (right edge)');
  });

  trackerWindow.on('closed', () => {
    trackerWindow = null;
    _trackerCreating = false;
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Scoreboard Data Polling Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function startScoreboardPolling() {
  if (scoreboardDataInterval) return;
  console.log('[main] Starting scoreboard data polling');

  // Ensure DDragon version is available
  ensureDdragonVersion();

  scoreboardDataInterval = setInterval(() => {
    fetchAllGameData();
  }, 2000);

  // Immediate first fetch
  fetchAllGameData();

  // Start cooldown tick interval
  if (!cooldownTickInterval) {
    cooldownTickInterval = setInterval(() => {
      tickCooldowns();
    }, 1000);
  }
}

function stopScoreboardPolling() {
  if (scoreboardDataInterval) {
    clearInterval(scoreboardDataInterval);
    scoreboardDataInterval = null;
  }
  if (cooldownTickInterval) {
    clearInterval(cooldownTickInterval);
    cooldownTickInterval = null;
  }
  cooldownTimers = [];
  lastLiveGameData = null;
  console.log('[main] Scoreboard polling stopped');
}

async function ensureDdragonVersion() {
  if (ddragonVersion) return ddragonVersion;
  try {
    const fetch = require('node-fetch');
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await res.json();
    ddragonVersion = versions[0];
    console.log('[main] DDragon version:', ddragonVersion);
    return ddragonVersion;
  } catch (e) {
    ddragonVersion = '15.1.1'; // fallback
    return ddragonVersion;
  }
}

function fetchAllGameData() {
  const req = https.get('https://127.0.0.1:2999/liveclientdata/allgamedata', {
    rejectUnauthorized: false,
    timeout: 2000,
  }, (res) => {
    let body = '';
    res.on('data', (d) => body += d);
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        lastLiveGameData = data;
        processAndSendScoreboardData(data);
      } catch { /* API not ready */ }
    });
  });
  req.on('error', () => { /* Game API not available */ });
}

function processAndSendScoreboardData(data) {
  // Can run even if scoreboard is closed Ã¢â‚¬â€ overlay also needs this data

  const activePlayer = data.activePlayer;
  const players = data.allPlayers || [];
  const gameTime = data.gameData?.gameTime || 0;
  const gameEvents = data.events?.Events || [];

  // Find the local player to determine team
  const localPlayer = players.find(p => p.riotId === activePlayer?.riotId || p.summonerName === activePlayer?.summonerName);
  const myTeam = localPlayer?.team || 'ORDER';

  // Compute kills per team
  let allyKills = 0, enemyKills = 0;
  for (const p of players) {
    if (p.team === myTeam) allyKills += (p.scores?.kills || 0);
    else enemyKills += (p.scores?.kills || 0);
  }

  // Map players to scoreboard format
  const mappedPlayers = players.map(p => {
    const itemIds = (p.items || []).map(i => i.itemID);
    const perkIds = [];
    if (p.runes) {
      if (p.runes.keystone) perkIds.push(p.runes.keystone.id);
      if (p.runes.primaryRuneTree) perkIds.push(p.runes.primaryRuneTree.id);
      if (p.runes.secondaryRuneTree) perkIds.push(p.runes.secondaryRuneTree.id);
      if (p.runes.generalRunes) {
        for (const r of p.runes.generalRunes) perkIds.push(r.id);
      }
      if (p.runes.statRunes) {
        for (const s of p.runes.statRunes) perkIds.push(s.id);
      }
    }

    return {
      championName: p.championName || p.rawChampionName?.replace('game_character_displayname_', '') || 'Unknown',
      team: p.team,
      position: p.position || '',
      level: p.level || 1,
      kills: p.scores?.kills || 0,
      deaths: p.scores?.deaths || 0,
      assists: p.scores?.assists || 0,
      creepScore: p.scores?.creepScore || 0,
      currentGold: 0,
      items: (p.items || []).map(i => ({
        itemID: i.itemID,
        displayName: i.displayName || '',
        count: i.count || 1,
        slot: i.slot,
      })),
      summonerSpells: {
        one: {
          displayName: p.summonerSpells?.summonerSpellOne?.displayName || 'Unknown',
          rawDescription: p.summonerSpells?.summonerSpellOne?.rawDescription || '',
          rawDisplayName: p.summonerSpells?.summonerSpellOne?.rawDisplayName || '',
        },
        two: {
          displayName: p.summonerSpells?.summonerSpellTwo?.displayName || 'Unknown',
          rawDescription: p.summonerSpells?.summonerSpellTwo?.rawDescription || '',
          rawDisplayName: p.summonerSpells?.summonerSpellTwo?.rawDisplayName || '',
        },
      },
      runes: p.runes || {},
      isDead: p.isDead || false,
      isLocalPlayer: p.riotId === activePlayer?.riotId || p.summonerName === activePlayer?.summonerName || false,
      riotId: p.riotId || p.summonerName || '',
      skinID: p.skinID || 0,
      perkIds,
      itemIds,
    };
  });

  const payload = {
    gameTime,
    mapName: data.gameData?.mapName || '',
    players: mappedPlayers,
    myTeam,
    allyKills,
    enemyKills,
  };

  if (scoreboardWindow && !scoreboardWindow.isDestroyed()) {
    scoreboardWindow.webContents.send('scoreboard-data', payload);
  }
  // Also send to overlay for the in-game enemy spell tracker panel
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('scoreboard-data', payload);
  }
  // Send to dedicated tracker window
  if (trackerWindow && !trackerWindow.isDestroyed()) {
    trackerWindow.webContents.send('scoreboard-data', payload);
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Cooldown Timer Logic Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function startCooldownTimer(championName, ability) {
  if (!lastLiveGameData) {
    console.log('[cooldown] No live game data available');
    return null;
  }

  const players = lastLiveGameData.allPlayers || [];
  const gameTime = lastLiveGameData.gameData?.gameTime || 0;
  const player = players.find(p => p.championName === championName);
  if (!player) {
    console.log(`[cooldown] Player ${championName} not found in game data`);
    return null;
  }

  // Extract ALL perk IDs from the Live Client API rune data
  // The API provides: keystone, primaryRuneTree, secondaryRuneTree, generalRunes[], statRunes[]
  const perkIds = [];
  if (player.runes) {
    if (player.runes.keystone) perkIds.push(player.runes.keystone.id);
    if (player.runes.primaryRuneTree) perkIds.push(player.runes.primaryRuneTree.id);
    if (player.runes.secondaryRuneTree) perkIds.push(player.runes.secondaryRuneTree.id);
    if (player.runes.generalRunes) {
      for (const r of player.runes.generalRunes) perkIds.push(r.id);
    }
    if (player.runes.statRunes) {
      for (const s of player.runes.statRunes) perkIds.push(s.id);
    }
  }
  const itemIds = (player.items || []).map(i => i.itemID);
  const level = player.level || 1;

  // Debug: log detected haste sources
  const hasCosmic = cooldownData.hasCosmicInsight(perkIds);
  const hasIonian = cooldownData.hasIonianBoots(itemIds);
  const hasUH = cooldownData.hasUltimateHunter(perkIds);
  const hasTranscendence = perkIds.includes(cooldownData.TRANSCENDENCE_PERK_ID);
  console.log(`[cooldown] ${championName} haste sources: Cosmic=${hasCosmic}, Ionian=${hasIonian}, UltHunter=${hasUH}, Transcendence=${hasTranscendence}, perkIds=[${perkIds.join(',')}], items=${itemIds.length}`);

  let totalDuration;
  const timerId = `${championName}-${ability}`;

  if (ability === 'Ultimate') {
    // Fetch ult cooldowns from DDragon if not cached
    const ultCDs = await getChampionUltCooldowns(championName);
    if (!ultCDs) {
      console.log(`[cooldown] Could not get ult CDs for ${championName}`);
      return null;
    }
    const result = cooldownData.computeUltTimer(ultCDs, level, itemIds, perkIds, gameTime);
    if (!result) {
      console.log(`[cooldown] ${championName} ult not available at level ${level}`);
      return null;
    }
    totalDuration = result.actualCd;
    console.log(`[cooldown] ${championName} Ultimate: base=${result.baseCd}s, AH=${result.abilityHaste}, actual=${result.actualCd}s`);
  } else {
    // Summoner spell
    const result = cooldownData.computeSummonerSpellTimer(ability, perkIds, itemIds, gameTime, level);
    totalDuration = result.actualCd;
    console.log(`[cooldown] ${championName} ${ability}: base=${result.baseCd}s, haste=${result.hasteApplied}, actual=${result.actualCd}s`);
  }

  // Remove existing timer for this combo if any
  cooldownTimers = cooldownTimers.filter(t => t.id !== timerId);

  const timer = {
    id: timerId,
    championName,
    ability,
    totalDuration,
    endTime: Date.now() + (totalDuration * 1000),
    startedAt: Date.now(),
  };

  cooldownTimers.push(timer);
  console.log(`[cooldown] Timer started: ${timerId} Ã¢â€ â€™ ${totalDuration}s`);

  // Immediate tick to show the timer right away
  tickCooldowns();
  return timer;
}

function tickCooldowns() {
  const now = Date.now();

  // Compute remaining time for each timer
  const activeTimers = cooldownTimers.map(t => ({
    id: t.id,
    championName: t.championName,
    ability: t.ability,
    totalDuration: t.totalDuration,
    remaining: Math.floor((t.endTime - now) / 1000),
    startedAt: t.startedAt,
  }));

  // Remove expired timers (5 seconds after they hit 0, so "UP!" can show)
  cooldownTimers = cooldownTimers.filter(t => (t.endTime - now) > -5000);

  // Send to scoreboard window
  if (scoreboardWindow && !scoreboardWindow.isDestroyed()) {
    scoreboardWindow.webContents.send('cooldown-tick', activeTimers);
  }

  // Send to overlay window
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('cooldown-tick', activeTimers);
  }
  // Send to tracker window
  if (trackerWindow && !trackerWindow.isDestroyed()) {
    trackerWindow.webContents.send('cooldown-tick', activeTimers);
  }
}

async function getChampionUltCooldowns(championName) {
  if (champUltCooldowns[championName]) return champUltCooldowns[championName];

  try {
    const ver = await ensureDdragonVersion();
    const fetch = require('node-fetch');
    // DDragon champion data Ã¢â‚¬â€ use proper name mapping
    const champKey = cooldownData.champToDdragonKey(championName);
    const url = `https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion/${champKey}.json`;
    const res = await fetch(url);
    const data = await res.json();
    const champData = data.data[Object.keys(data.data)[0]];
    if (champData && champData.spells && champData.spells.length >= 4) {
      const ultSpell = champData.spells[3]; // Index 3 = R (ultimate)
      const cooldowns = ultSpell.cooldown || ultSpell.cooldownBurn?.split('/').map(Number) || [120, 100, 80];
      champUltCooldowns[championName] = cooldowns;
      console.log(`[cooldown] Cached ${championName} ult CDs: ${cooldowns.join('/')}`);
      return cooldowns;
    }
  } catch (e) {
    console.log(`[cooldown] Failed to fetch ult CDs for ${championName}:`, e.message);
  }

  // Fallback common ult CDs
  champUltCooldowns[championName] = [120, 100, 80];
  return champUltCooldowns[championName];
}

// Auto-refresh stats (called on game end and startup)
async function autoRefreshStats() {
  try {
    const lcuCreds = getLcuCredentials();
    if (!lcuCreds) {
      log('INFO', '[stats] No LCU detected, skipping auto-refresh');
      return;
    }

    // Open stats window if setting enabled and not already open
    const statsSettings = loadSettings();
    if (statsSettings.autoOpenStats === false) {
      log('INFO', '[stats] Auto-open stats disabled, skipping');
      return;
    }
    if (!statsWindow || statsWindow.isDestroyed()) {
      createStatsWindow();
      // Wait for window to load before sending fetch
      await new Promise(r => setTimeout(r, 2000));
    }

    log('INFO', '[stats] Auto-refreshing stats...');
    const statsData = await fetchMyStats();
    lastStatsData = statsData;
    const aiAnalysis = await analyzeMyStats(statsData);
    statsData.aiAnalysis = aiAnalysis;

    if (statsWindow && !statsWindow.isDestroyed()) {
      statsWindow.webContents.send('stats-data', statsData);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stats-data', statsData);
    }
    log('INFO', '[stats] Auto-refresh complete');
  } catch (err) {
    log('WARN', `[stats] Auto-refresh failed: ${err.message}`);
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Live Client Data API Ã¢â‚¬â€ Item Purchase Detection Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

// Stats window control buttons (frameless)
ipcMain.on('stats-win-minimize', () => { if (statsWindow && !statsWindow.isDestroyed()) statsWindow.minimize(); });
ipcMain.on('stats-win-close', () => { if (statsWindow && !statsWindow.isDestroyed()) statsWindow.close(); });

function startLiveClientPolling() {
  if (liveClientInterval) return;
  console.log('[main] Starting Live Client Data polling for item purchases');

  // ADC quest slot fix: Once boots are detected, NEVER revert.
  // When the ADC quest completes, boots move from inventory to a hidden quest
  // slot and disappear from the Live Client API items[] Ã¢â‚¬â€ this flag persists.
  global.__bootsEverDetected = false;

  // Pre-warm DDragon cache so component data is available immediately
  resolveDdragonItem('_warmup').catch(() => {});

  liveClientInterval = setInterval(() => {
    // The League Live Client Data API runs on localhost:2999 during a game
    const req = https.get('https://127.0.0.1:2999/liveclientdata/activeplayer', {
      rejectUnauthorized: false,
      timeout: 2000,
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          const player = JSON.parse(body);
          const summonerName = player.riotId || player.summonerName || '';
          const currentGold = player.currentGold || 0;
          const gameTime = player.gameTime || 0;
          // Now fetch the full player list to get our items
          fetchPlayerItems(summonerName, currentGold, gameTime);
        } catch {
          // Game API not ready yet
        }
      });
    });
    req.on('error', () => {
      // Game not in an active match or API not available Ã¢â‚¬â€ that's fine
    });
  }, 3000);
}

function fetchPlayerItems(summonerName, currentGold = 0, gameTime = 0) {
  const req = https.get('https://127.0.0.1:2999/liveclientdata/playerlist', {
    rejectUnauthorized: false,
    timeout: 2000,
  }, (res) => {
    let body = '';
    res.on('data', (d) => body += d);
    res.on('end', () => {
      try {
        const players = JSON.parse(body);
        // Find the active player in the list
        const me = players.find((p) =>
          (p.riotId && p.riotId === summonerName) ||
          (p.summonerName && p.summonerName === summonerName) ||
          p.isLocalPlayer
        );
        if (me && me.items) {
          const purchasedItemIds = me.items.map((item) => String(item.itemID));
          const purchasedItemNames = me.items.map((item) => (item.displayName || '').toLowerCase().trim()).filter(Boolean);

          // Ã¢â€â‚¬Ã¢â€â‚¬ Boots detection (handles quest slots + renamed boot variants) Ã¢â€â‚¬Ã¢â€â‚¬
          // Check if player owns ANY upgraded boots by DDragon 'Boots' tag OR name pattern
          const BOOT_NAME_PATTERNS = ['boots', 'greaves', 'treads', 'steelcaps', 'plated', 'mercury', 'berserker', 'sorcerer', 'swiftness', 'lucidity', 'ionian', 'mobility', 'symbiotic', 'slightly magical', 'upgraded boots'];
          const isBootsId = (id) => {
            if (!ddragonItemCache || !ddragonItemCache.byId) return false;
            const d = ddragonItemCache.byId.get(String(id));
            if (!d) return false;
            // Check DDragon 'Boots' tag (standard boots)
            if (d.tags && d.tags.includes('Boots') && d.gold > 300) return true;
            // Check name patterns (catches quest boots, renamed variants)
            const nameLower = (d.name || '').toLowerCase();
            return BOOT_NAME_PATTERNS.some(p => nameLower.includes(p));
          };
          // Also check by purchased item NAMES for boots not in DDragon
          const isBootName = (name) => {
            const lower = (name || '').toLowerCase();
            return BOOT_NAME_PATTERNS.some(p => lower.includes(p));
          };
          const playerHasBootsFromInventory = purchasedItemIds.some(id => isBootsId(id)) || purchasedItemNames.some(n => isBootName(n));
          // ADC quest slot fix: sticky flag Ã¢â‚¬â€ once boots are seen, they stay "seen"
          // (quest slot boots disappear from items[] but player still has them)
          if (playerHasBootsFromInventory) {
            global.__bootsEverDetected = true;
          }
          const playerHasBoots = global.__bootsEverDetected || playerHasBootsFromInventory;
          // Collect boot IDs from the build queue
          const buildBootIds = new Set();
          if (overlayData && overlayData.buildItems) {
            for (const bi of overlayData.buildItems) {
              if (bi.id && isBootsId(bi.id)) buildBootIds.add(bi.id);
            }
          }
          // Ã¢â€â‚¬Ã¢â€â‚¬ Compute next component to buy and remaining gold Ã¢â€â‚¬Ã¢â€â‚¬
          let nextComponent = null; // { name, iconUrl, gold } or null
          let remainingGold = 0; // actual gold needed to finish the next item

          // Build a count map of owned items (handles duplicates like 2x Long Sword)
          const ownedCounts = new Map();
          for (const id of purchasedItemIds) {
            ownedCounts.set(id, (ownedCounts.get(id) || 0) + 1);
          }

          // Compute savings from owned sub-items in a recipe tree
          // Returns total gold value of owned items found (and consumes them from counts)
          const computeSavings = (itemId, counts) => {
            // If player owns this completed item, consume it Ã¢â‚¬â€ savings = its full value
            if ((counts.get(itemId) || 0) > 0) {
              counts.set(itemId, counts.get(itemId) - 1);
              const d = ddragonItemCache.byId.get(itemId);
              return d ? d.gold : 0;
            }
            const data = ddragonItemCache.byId.get(itemId);
            if (!data || !data.from || data.from.length === 0) return 0; // leaf not owned = no savings
            // Recurse into sub-components to find owned sub-items
            let savings = 0;
            for (const subId of data.from) {
              savings += computeSavings(subId, counts);
            }
            return savings;
          };

          if (overlayData && overlayData.buildItems && overlayData.buildItems.length > 0 && ddragonItemCache && ddragonItemCache.byId) {
            // Find the next unbought build item
            let nextBuildItem = null;
            for (const bi of overlayData.buildItems) {
              if (!bi.id || purchasedItemIds.includes(bi.id)) continue;
              // Skip boots if player already owns boots (handles ADC quest slot)
              if (playerHasBoots && bi.id && isBootsId(bi.id)) continue;
              nextBuildItem = bi;
              break;
            }

            if (nextBuildItem && nextBuildItem.id) {
              const itemData = ddragonItemCache.byId.get(nextBuildItem.id);
              const itemTotal = itemData ? itemData.gold : (nextBuildItem.gold || 0);

              // remaining = total item cost - value of owned sub-components
              const countsCopy = new Map(ownedCounts);
              const savings = computeSavings(nextBuildItem.id, countsCopy);
              remainingGold = Math.max(0, itemTotal - savings);

              if (itemData && itemData.from && itemData.from.length > 0) {
                // Find missing DIRECT components for the "buy component" UI
                const missingComponents = [];
                for (const compId of itemData.from) {
                  if ((ownedCounts.get(compId) || 0) > 0) continue;
                  const compData = ddragonItemCache.byId.get(compId);
                  if (compData) {
                    // Compute remaining cost for this component too
                    const compCounts = new Map(ownedCounts);
                    const compSavings = computeSavings(compId, compCounts);
                    missingComponents.push({
                      id: compId,
                      name: compData.name,
                      iconUrl: compData.iconUrl,
                      gold: Math.max(0, compData.gold - compSavings),
                    });
                  }
                }

                if (missingComponents.length > 0) {
                  missingComponents.sort((a, b) => b.gold - a.gold);
                  nextComponent = missingComponents[0];
                }
              }
            } else if (nextBuildItem) {
              remainingGold = nextBuildItem.gold || 0;
            }
          }

          // Debug: log gold computation (remove after verified)
          if (remainingGold > 0) {
            console.log(`[gold-debug] Next item: ${overlayData?.buildItems?.find(bi => !purchasedItemIds.includes(bi.id))?.name || '?'}, total=${remainingGold + (overlayData?.buildItems?.find(bi => !purchasedItemIds.includes(bi.id))?.gold || 0) - remainingGold}, savings=${(overlayData?.buildItems?.find(bi => !purchasedItemIds.includes(bi.id))?.gold || 0) - remainingGold + 'g (from ' + purchasedItemIds.length + ' inv items)'}, remaining=${remainingGold}g, wallet=${currentGold}g`);
          }

          // Send to overlay window (existing payload + new component info)
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('item-purchase-update', {
              purchasedItemIds,
              purchasedItemNames,
              currentGold,
              gameTime,
              nextComponent, // { name, iconUrl, gold } or null
              remainingGold, // actual gold needed to finish the next item
              playerHasBoots, // true if player owns any upgraded boots (incl. quest slot)
              bootItemIds: [...buildBootIds], // boot IDs in the build queue
            });
          }
        }
      } catch {
        // Not ready
      }
    });
  });
  req.on('error', () => { });
}

function stopLiveClientPolling() {
  if (liveClientInterval) {
    clearInterval(liveClientInterval);
    liveClientInterval = null;
    // Reset sticky boots flag for next game
    global.__bootsEverDetected = false;
    console.log('[main] Stopped Live Client Data polling');
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Game Detection Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function checkGameState() {
  // Step 1: check if League of Legends game process is running
  exec('tasklist /FI "IMAGENAME eq League of Legends.exe" /NH /FO CSV', { timeout: 5000, windowsHide: true }, (err, stdout) => {
    const gameProcessRunning = !err && stdout.toLowerCase().includes('league of legends');

    if (!gameProcessRunning) {
      // Game not running Ã¢â‚¬â€ always hide overlay
      if (isGameRunning) {
        console.log('[main] League of Legends game ended');
        isGameRunning = false;
        stopLiveClientPolling();
        // Auto-stop live advisor when game ends
        if (liveAdvisorState.isPolling) {
          stopLiveAdvisor();
          sendAdvisorDebug('[stop] Game process ended Ã¢â‚¬â€ live advisor auto-stopped');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('live-advisor-stopped');
          }
        }
        // Reset advisor state for next game
        liveAdvisorState.lastAdviceTime = 0;
        liveAdvisorState.lastPhase = '';
        liveAdvisorState.lastFedEnemies = [];
        liveAdvisorState.originalBuildText = '';
        // Reset all game-specific data so next game starts fresh
        overlayData = null;
        overlayGeneration = 0;
        cachedScoutReport = null;
        scoutingState.hasRun = false;
        scoutingState.gameId = null;
        // Cleanup scoreboard + cooldowns
        stopScoreboardPolling();
        champUltCooldowns = {};
        if (scoreboardWindow && !scoreboardWindow.isDestroyed()) {
          scoreboardWindow.close();
        }
        if (trackerWindow && !trackerWindow.isDestroyed()) {
          trackerWindow.close();
        }
        console.log('[main] All game state reset for next game');
        // Notify renderer to clear UI (builds, runes, live advice)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('game-ended');
        }

        // Auto-refresh stats after game ends (delay to let Riot update data)
        setTimeout(() => {
          autoRefreshStats();
        }, 5000);
      }
      hideOverlay();
      return;
    }

    // Game IS running
    if (!isGameRunning) {
      console.log('[main] League of Legends game detected!');
      isGameRunning = true;
      overlayManuallyHidden = false; // reset manual hide when a new game starts
      startLiveClientPolling(); // Start polling for item purchases
      // Auto-open scoreboard window and tracker (if setting enabled)
      const gameSettings = loadSettings();
      if (gameSettings.autoOpenScoreboard !== false) {
        createScoreboardWindow();
        createTrackerWindow();
        startScoreboardPolling();
      } else {
        console.log('[main] Auto-open scoreboard disabled in settings');
      }
      // Auto-start live advisor for this game
      if (!liveAdvisorState.isPolling) {
        startLiveAdvisor();
        sendAdvisorDebug('[start] Game detected Ã¢â‚¬â€ live advisor auto-started');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('live-advisor-started');
        }
      }
    }

    // Step 2: check if the game window is in the foreground (alt-tab detection)
    const gameFocused = lastFgTitle.toLowerCase().includes('league of legends');

    if (gameFocused && overlayData && !overlayManuallyHidden) {
      showOverlay();
    } else {
      hideOverlay();
    }
  });
}

function startForegroundMonitor() {
  // Write a PowerShell script that continuously reports the foreground window title
  const scriptContent = [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public class FGMon {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder t, int c);',
    '}',
    '"@',
    'while ($true) {',
    '  $sb = [System.Text.StringBuilder]::new(256)',
    '  [FGMon]::GetWindowText([FGMon]::GetForegroundWindow(), $sb, 256) | Out-Null',
    '  [Console]::Out.WriteLine($sb.ToString())',
    '  [Console]::Out.Flush()',
    '  Start-Sleep -Milliseconds 800',
    '}',
  ].join('\r\n');

  const scriptPath = path.join(app.getPath('temp'), 'dc-fg-monitor.ps1');
  try {
    fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
  } catch (e) {
    console.error('[main] Failed to write foreground monitor script:', e);
    return;
  }

  fgMonitorProc = spawn('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
  ], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });

  let buffer = '';
  fgMonitorProc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const title = line.trim();
      if (title.length > 0) {
        lastFgTitle = title;
      }
    }
  });

  fgMonitorProc.on('error', (err) => {
    console.error('[main] Foreground monitor error:', err.message);
    fgMonitorProc = null;
    // Fallback: if PowerShell fails, treat game as always focused when running
    lastFgTitle = 'League of Legends (fallback)';
  });

  fgMonitorProc.on('exit', (code) => {
    console.log('[main] Foreground monitor exited, code:', code);
    fgMonitorProc = null;
  });

  console.log('[main] Foreground window monitor started');
}

function startGameDetection() {
  startForegroundMonitor();
  // Poll every 2 seconds
  gameDetectionInterval = setInterval(checkGameState, 2000);
  console.log('[main] Game detection started');
}

function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!overlayWindow.isVisible()) {
    overlayWindow.showInactive(); // show without stealing focus from the game
    console.log('[main] Overlay shown');
  }
}

function hideOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
    console.log('[main] Overlay hidden');
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Global Keyboard Shortcuts (Configurable) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

// Shortcut action handlers
const SHORTCUT_ACTIONS = {
  toggleOverlay: () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
      overlayManuallyHidden = true;
      console.log('[main] Overlay toggled OFF (manual)');
    } else if (overlayData) {
      overlayWindow.showInactive();
      overlayManuallyHidden = false;
      console.log('[main] Overlay toggled ON (manual)');
    }
  },
  hideOverlay: () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
      overlayManuallyHidden = true;
      console.log('[main] Overlay hidden (manual)');
    }
  },
  focusMain: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  },
  regenerate: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('force-regenerate');
      console.log('[main] Force regenerate sent to renderer');
    }
  },
};

// Map of setting keys Ã¢â€ â€™ action keys
const HOTKEY_MAP = {
  hotkeyToggleOverlay: { action: 'toggleOverlay', label: 'Toggle Overlay' },
  hotkeyHideOverlay: { action: 'hideOverlay', label: 'Hide Overlay' },
  hotkeyFocusMain: { action: 'focusMain', label: 'Show/Focus Main Window' },
  hotkeyRegenerate: { action: 'regenerate', label: 'Regenerate Build' },
};

function registerShortcuts() {
  // Unregister everything first
  globalShortcut.unregisterAll();

  const settings = loadSettings();
  const results = {};

  for (const [settingKey, meta] of Object.entries(HOTKEY_MAP)) {
    const accelerator = settings[settingKey];
    if (!accelerator || accelerator === 'none') {
      log('INFO', `[shortcuts] Skipped: ${meta.label} (disabled)`);
      results[settingKey] = { key: 'none', ok: false, label: meta.label };
      continue;
    }

    try {
      const ok = globalShortcut.register(accelerator, SHORTCUT_ACTIONS[meta.action]);
      if (ok) {
        log('INFO', `[shortcuts] Ã¢Å“â€œ Registered: ${accelerator} Ã¢â€ â€™ ${meta.label}`);
      } else {
        log('WARN', `[shortcuts] Ã¢Å“â€” FAILED: ${accelerator} Ã¢â€ â€™ ${meta.label} Ã¢â‚¬â€ taken by another app`);
      }
      results[settingKey] = { key: accelerator, ok, label: meta.label };
    } catch (err) {
      log('WARN', `[shortcuts] Ã¢Å“â€” ERROR: ${accelerator} Ã¢â€ â€™ ${meta.label}: ${err.message}`);
      results[settingKey] = { key: accelerator, ok: false, label: meta.label };
    }
  }

  // Notify renderer of registration results
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shortcuts-status', results);
  }

  return results;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ LoL Config Parser Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function parseLolConfig() {
  const settings = loadSettings();
  const possiblePaths = [
    settings.lolPath || null,
    'C:\\Riot Games\\League of Legends',
    'D:\\Riot Games\\League of Legends',
    'C:\\Program Files\\Riot Games\\League of Legends',
    'D:\\Program Files\\Riot Games\\League of Legends',
    'C:\\Games\\Riot Games\\League of Legends',
    'D:\\Games\\Riot Games\\League of Legends',
  ].filter(Boolean);

  let root = possiblePaths.find(p => fs.existsSync(path.join(p, 'Config', 'game.cfg')));
  if (!root) {
    // Fallback search
    root = possiblePaths.find(p => fs.existsSync(path.join(p, 'lockfile')) || fs.existsSync(path.join(p, 'Game', 'League of Legends.exe')));
  }
  if (!root) return null;

  const configPath = path.join(root, 'Config', 'game.cfg');
  if (!fs.existsSync(configPath)) return null;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const sections = {};
    let currentSection = '';
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        sections[currentSection] = {};
      } else if (trimmed.includes('=') && currentSection) {
        const [key, val] = trimmed.split('=');
        sections[currentSection][key.trim()] = val.trim();
      }
    });

    const width = parseInt(sections['General']?.['Width'] || '1920');
    const height = parseInt(sections['General']?.['Height'] || '1080');
    const minimapScale = parseFloat(sections['HUD']?.['MinimapScale'] || '1.0');
    const minimapFlip = sections['HUD']?.['FlipMiniMap'] === '1';

    // Corrected minimap size formula:
    // At 1080p with default MinimapScale=1.0, the League minimap is ~243px.
    // MinimapScale 0.0Ã¢â€ â€™1.0 maps to roughly 70%Ã¢â€ â€™100% of base size.
    // Scale linearly with screen height for other resolutions.
    const baseSize = 243;
    const scaleFactor = 0.7 + 0.3 * minimapScale; // 0.0Ã¢â€ â€™0.7x, 1.0Ã¢â€ â€™1.0x
    const size = baseSize * (height / 1080) * scaleFactor;

    console.log(`[main] Detected Minimap: ${Math.round(size)}px at ${width}x${height} (Scale: ${minimapScale})`);

    return {
      width,
      height,
      minimapSize: Math.round(size),
      minimapPosition: minimapFlip ? 'bottom-left' : 'bottom-right',
      minimapScale
    };
  } catch (err) {
    console.error('[main] Error parsing game.cfg:', err);
    return null;
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ IPC Handlers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬


// Overlay data from renderer Ã¢â€ â€™ forward to overlay window
ipcMain.on('overlay-data', (_event, data) => {
  log('INFO', '[main] Received overlay data from renderer');
  overlayGeneration++;
  data._generation = overlayGeneration;
  overlayData = data;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-data-update', data);
  }
});

// Partial item update Ã¢â‚¬â€ merges new items into existing overlay data
ipcMain.on('update-overlay-items', (_event, newItems) => {
  log('INFO', `[main] Overlay items updated: ${newItems.length} items`);
  overlayGeneration++;
  if (overlayData) {
    overlayData.buildItems = newItems;
    overlayData._generation = overlayGeneration;
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-items-update', newItems, overlayGeneration);
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬ LCU Credentials & Communication Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function getLcuCredentials() {
  const settings = loadSettings();
  const possiblePaths = [
    settings.lolPath ? path.join(settings.lolPath, 'lockfile') : null,
    'C:\\Riot Games\\League of Legends\\lockfile',
    'D:\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
    'D:\\Program Files\\Riot Games\\League of Legends\\lockfile',
    'C:\\Games\\Riot Games\\League of Legends\\lockfile',
    'D:\\Games\\Riot Games\\League of Legends\\lockfile',
  ].filter(Boolean);

  let lockfilePath = possiblePaths.find(p => fs.existsSync(p));
  if (!lockfilePath) return null;

  try {
    const lockContent = fs.readFileSync(lockfilePath, 'utf-8').trim();
    const parts = lockContent.split(':');
    if (parts.length < 5) return null;

    const port = parts[2];
    const password = parts[3];
    const protocol = parts[4] || 'https';
    const auth = Buffer.from(`riot:${password}`).toString('base64');

    return { port, password, protocol, auth };
  } catch (err) {
    console.error('[main] Error reading lockfile:', err);
    return null;
  }
}

async function lcuCall(method, pathStr, body) {
  const creds = getLcuCredentials();
  if (!creds) return null;

  const nodeFetch = require('node-fetch');
  try {
    const res = await nodeFetch(`${creds.protocol}://127.0.0.1:${creds.port}${pathStr}`, {
      method,
      headers: {
        'Authorization': `Basic ${creds.auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      agent: new (require('https').Agent)({ rejectUnauthorized: false }),
      timeout: 5000,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let errorBody = '';
      try { errorBody = await res.text(); } catch { }
      console.error(`[main] LCU ${method} ${pathStr} failed: HTTP ${res.status} Ã¢â‚¬â€ ${errorBody}`);
      return { __lcuError: true, status: res.status, body: errorBody };
    }

    // Handle 204 No Content (e.g. DELETE responses)
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return { __lcuOk: true };
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) {
      return { __lcuOk: true };
    }
    try {
      return JSON.parse(text);
    } catch {
      console.warn(`[main] LCU ${method} ${pathStr}: non-JSON response: ${text.substring(0, 200)}`);
      return { __lcuOk: true };
    }
  } catch (err) {
    console.error(`[main] LCU ${method} ${pathStr} error:`, err.message);
    return null;
  }
}

// LCU auto-detect champion select
ipcMain.handle('lcu-champ-select', async () => {
  const session = await lcuCall('GET', '/lol-champ-select/v1/session');
  if (!session || session.__lcuError || session.__lcuOk) return { ok: false, error: 'No active session or client not connected' };
  return { ok: true, session };
});

// LCU auto-detect game mode from lobby/gameflow
ipcMain.handle('lcu-game-mode', async () => {
  // Queue ID Ã¢â€ â€™ game mode mapping
  // SR queues: 400 (Draft), 420 (Ranked Solo), 430 (Blind), 440 (Flex), 490 (Quickplay)
  // ARAM queues: 450 (ARAM), 930 (Poro King on HA)
  // ARAM Mayhem: queue ID TBD by Riot (we'll detect via gameMode string)
  const QUEUE_MODE_MAP = {
    400: 'sr', 420: 'sr', 430: 'sr', 440: 'sr', 490: 'sr',   // SR queues
    450: 'aram', 930: 'aram',                                    // ARAM queues
  };

  try {
    // Try gameflow session first Ã¢â‚¬â€ more reliable during champ select
    const gameflow = await lcuCall('GET', '/lol-gameflow/v1/session');
    if (gameflow && !gameflow.__lcuError && !gameflow.__lcuOk) {
      const queueId = gameflow.gameData?.queue?.id;
      const gameMode = gameflow.gameData?.queue?.gameMode;

      // Check for ARAM Mayhem via gameMode string (Riot labels it differently)
      if (gameMode && (gameMode.toLowerCase().includes('mayhem') || gameMode.toLowerCase().includes('ultbook'))) {
        return { ok: true, mode: 'aram-mayhem', queueId, source: 'gameflow' };
      }

      if (queueId && QUEUE_MODE_MAP[queueId]) {
        return { ok: true, mode: QUEUE_MODE_MAP[queueId], queueId, source: 'gameflow' };
      }

      // Fallback: check map ID (11 = SR, 12 = HA/ARAM)
      const mapId = gameflow.map?.id || gameflow.gameData?.queue?.mapId;
      if (mapId === 12) return { ok: true, mode: 'aram', queueId, source: 'gameflow-map' };
      if (mapId === 11) return { ok: true, mode: 'sr', queueId, source: 'gameflow-map' };
    }

    // Fallback: try lobby endpoint
    const lobby = await lcuCall('GET', '/lol-lobby/v2/lobby');
    if (lobby && !lobby.__lcuError && !lobby.__lcuOk) {
      const queueId = lobby.gameConfig?.queueId;
      const gameMode = lobby.gameConfig?.gameMode;

      if (gameMode && (gameMode.toLowerCase().includes('mayhem') || gameMode.toLowerCase().includes('ultbook'))) {
        return { ok: true, mode: 'aram-mayhem', queueId, source: 'lobby' };
      }

      if (queueId && QUEUE_MODE_MAP[queueId]) {
        return { ok: true, mode: QUEUE_MODE_MAP[queueId], queueId, source: 'lobby' };
      }

      const mapId = lobby.gameConfig?.mapId;
      if (mapId === 12) return { ok: true, mode: 'aram', queueId, source: 'lobby-map' };
      if (mapId === 11) return { ok: true, mode: 'sr', queueId, source: 'lobby-map' };
    }

    return { ok: false, error: 'No lobby or gameflow session found' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// In-game detection fallback via Live Client API (port 2999)
ipcMain.handle('lcu-live-game', async () => {
  const nodeFetch = require('node-fetch');
  try {
    const res = await nodeFetch('https://127.0.0.1:2999/liveclientdata/allgamedata', {
      agent: new (require('https').Agent)({ rejectUnauthorized: false }),
      timeout: 3000,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (!data.allPlayers || data.allPlayers.length === 0) return { ok: false, error: 'No players' };

    // Find local player
    const activePlayer = data.activePlayer;
    const localName = activePlayer?.riotIdGameName || activePlayer?.summonerName || '';
    const localPlayer = data.allPlayers.find(p =>
      (p.riotIdGameName || p.summonerName || '') === localName
    );
    if (!localPlayer) return { ok: false, error: 'Cannot identify local player' };

    const myTeam = localPlayer.team; // "ORDER" or "CHAOS"

    // Map position strings from Live Client API to our role format
    const posMap = {
      'TOP': 'top', 'JUNGLE': 'jungle', 'MIDDLE': 'mid', 'BOTTOM': 'bottom', 'UTILITY': 'support',
      'top': 'top', 'jungle': 'jungle', 'middle': 'mid', 'bottom': 'bottom', 'utility': 'support',
    };

    const myChampion = localPlayer.championName || '';
    const myPosition = posMap[(localPlayer.position || '').toUpperCase()] || '';
    const allies = [];
    const enemies = [];
    const enemyRoles = {};

    for (const p of data.allPlayers) {
      if (p === localPlayer) continue;
      const champName = p.championName || '';
      if (!champName) continue;
      if (p.team === myTeam) {
        allies.push(champName);
      } else {
        enemies.push(champName);
        const enemyPosition = posMap[(p.position || '').toUpperCase()] || '';
        if (enemyPosition) enemyRoles[champName] = enemyPosition === 'bottom' ? 'adc' : enemyPosition;
      }
    }

    return {
      ok: true,
      source: 'live-game',
      myChampion,
      myPosition,
      allies,
      enemies,
      enemyRoles,
      gameTime: data.gameData?.gameTime || 0,
    };
  } catch {
    return { ok: false, error: 'Game not running' };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Live Game AI Advisor Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
let liveAdvisorState = {
  lastAdviceTime: 0,
  lastPhase: '',            // 'early', 'mid', 'late'
  lastFedEnemies: [],       // track which enemies were flagged
  advisorCooldown: 90000,   // minimum 90s between AI calls
  originalBuildText: '',    // stored from the pre-game generation
  isPolling: false,
  // Ã¢â€â‚¬Ã¢â€â‚¬ Intelligence upgrades Ã¢â€â‚¬Ã¢â€â‚¬
  previousAdvice: '',       // #6: memory Ã¢â‚¬â€ last AI response to prevent flip-flopping
  previousAdviceTime: 0,    // timestamp of last advice
  lastDeaths: 0,            // #2: death trigger
  lastGold: 0,              // #2: gold spike trigger
  lastEnemyItemCounts: {},  // #2: enemy major item completion trigger
};

// Ã¢â€â‚¬Ã¢â€â‚¬ DDragon Champion Cache (for class-based item filtering) Ã¢â€â‚¬Ã¢â€â‚¬
let ddragonChampCache = null; // Map<champName, { tags: string[] }>
let ddragonChampCachePromise = null;

async function ensureDdragonChampCache() {
  if (ddragonChampCache) return ddragonChampCache;
  if (!ddragonChampCachePromise) {
    ddragonChampCachePromise = (async () => {
      try {
        const fetch = require('node-fetch');
        const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        const versions = await versionsRes.json();
        const ver = versions[0];
        const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`);
        const champData = await champRes.json();
        const cache = new Map();
        for (const [key, c] of Object.entries(champData.data)) {
          const entry = { tags: c.tags || [], id: c.id, name: c.name, info: c.info || {}, stats: c.stats || {} };
          cache.set(c.name, entry);
          cache.set(c.id, entry);
          cache.set(key, entry);
        }
        ddragonChampCache = cache;
        ddragonChampCachePromise = null;
        console.log(`[ddragon] Cached ${cache.size} champions for class filtering`);
      } catch (err) {
        console.warn('[ddragon] Failed to fetch champion data:', err.message);
        ddragonChampCachePromise = null;
      }
    })();
  }
  await ddragonChampCachePromise;
  return ddragonChampCache;
}

async function fetchLiveClientData() {
  const nodeFetch = require('node-fetch');
  try {
    const res = await nodeFetch('https://127.0.0.1:2999/liveclientdata/allgamedata', {
      agent: new (require('https').Agent)({ rejectUnauthorized: false }),
      timeout: 3000,
    });
    if (!res.ok) {
      sendAdvisorDebug(`[fetch] HTTP ${res.status} from Live Client API`);
      return null;
    }
    const data = await res.json();
    sendAdvisorDebug(`[fetch] Got game data: ${data.allPlayers?.length || 0} players, time=${Math.floor((data.gameData?.gameTime || 0) / 60)}min`);
    return data;
  } catch (err) {
    // Game not running Ã¢â‚¬â€ this is normal, don't spam
    return null;
  }
}

function sendAdvisorDebug(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log('[live-advisor]', msg);
  try { const _lp = require('path').join(process.env.APPDATA || '', 'DraftCoach', 'advisor.log'); require('fs').appendFileSync(_lp, line + '\n'); } catch(e) {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-advisor-debug', line);
  }
}

function getGamePhase(gameTime) {
  if (gameTime < 900) return 'early';
  if (gameTime < 1500) return 'mid';
  return 'late';
}

function checkLiveAdvisorTriggers(gameData) {
  const now = Date.now();
  if (now - liveAdvisorState.lastAdviceTime < liveAdvisorState.advisorCooldown) return null;

  const gameTime = gameData.gameData?.gameTime || 0;
  const currentPhase = getGamePhase(gameTime);
  const players = gameData.allPlayers || [];
  const activePlayer = gameData.activePlayer;

  if (!activePlayer || players.length === 0) return null;

  // Find my player in the player list
  const myName = activePlayer.summonerName || activePlayer.riotId;
  const myPlayer = players.find(p =>
    (p.summonerName === myName) || (p.riotId === myName)
  );
  if (!myPlayer) return null;

  const myTeam = myPlayer.team;
  const enemies = players.filter(p => p.team !== myTeam);

  // Trigger 1: Phase change
  if (currentPhase !== liveAdvisorState.lastPhase && liveAdvisorState.lastPhase !== '') {
    liveAdvisorState.lastPhase = currentPhase;
    return `Game phase changed to ${currentPhase} (${Math.floor(gameTime / 60)} min)`;
  }
  if (liveAdvisorState.lastPhase === '') liveAdvisorState.lastPhase = currentPhase;

  // Trigger 2: Fed enemy (5+ kills or KDA diff >= 4)
  const fedEnemies = enemies.filter(e => {
    const kda = e.scores;
    return kda && (kda.kills >= 5 || (kda.kills - kda.deaths) >= 4);
  });
  const newFed = fedEnemies.filter(e =>
    !liveAdvisorState.lastFedEnemies.includes(e.championName)
  );
  if (newFed.length > 0) {
    liveAdvisorState.lastFedEnemies = fedEnemies.map(e => e.championName);
    const names = newFed.map(e => `${e.championName} (${e.scores.kills}/${e.scores.deaths}/${e.scores.assists})`).join(', ');
    return `Enemy threat detected: ${names}`;
  }

  // Trigger 3: Player died Ã¢â‚¬â€ best time to rethink build (on fountain with gold)
  const myDeaths = myPlayer.scores?.deaths || 0;
  if (myDeaths > liveAdvisorState.lastDeaths && liveAdvisorState.lastDeaths >= 0) {
    liveAdvisorState.lastDeaths = myDeaths;
    return `Player died (${myDeaths} deaths) Ã¢â‚¬â€ reassess build on respawn`;
  }
  if (liveAdvisorState.lastDeaths < 0) liveAdvisorState.lastDeaths = myDeaths;

  // Trigger 4: Gold spike (>800g increase since last check Ã¢â‚¬â€ can buy a component)
  const currentGold = activePlayer.currentGold || 0;
  if (currentGold > (liveAdvisorState.lastGold || 0) + 800 && gameTime >= 120) {
    liveAdvisorState.lastGold = currentGold;
    return `Gold spike: ${currentGold}g available Ã¢â‚¬â€ check for item purchases`;
  }
  liveAdvisorState.lastGold = currentGold;

  // Trigger 5: Enemy completed a major item (>2500g)
  const enemyItemCounts = {};
  for (const e of enemies) {
    const majorItems = (e.items || []).filter(i => {
      if (!ddragonItemCache || !ddragonItemCache.byId) return false;
      const d = ddragonItemCache.byId.get(String(i.itemID));
      return d && isCompletedStoreItem(String(i.itemID), d, 11) && d.gold >= 2500;
    }).length;
    enemyItemCounts[e.championName] = majorItems;
  }
  const prevCounts = liveAdvisorState.lastEnemyItemCounts || {};
  const enemiesWithNewItems = Object.keys(enemyItemCounts).filter(name =>
    (enemyItemCounts[name] || 0) > (prevCounts[name] || 0)
  );
  liveAdvisorState.lastEnemyItemCounts = enemyItemCounts;
  if (enemiesWithNewItems.length > 0 && Object.keys(prevCounts).length > 0) {
    return `Enemy completed major item: ${enemiesWithNewItems.join(', ')}`;
  }

  // Trigger 6: Every 3 minutes after 5 min mark (periodic check)
  if (gameTime >= 300 && (now - liveAdvisorState.lastAdviceTime) > 180000) {
    return `Periodic build check at ${Math.floor(gameTime / 60)} minutes`;
  }

  return null;
}

async function pollLiveClient() {
  const gameData = await fetchLiveClientData();
  if (!gameData) {
    // API not ready (loading screen) or game not active Ã¢â‚¬â€ just wait
    // Game-end stopping is handled by checkGameState() which detects the process ending
    return;
  }

  // Trigger scouting during loading screen / early game
  const gt = gameData.gameData?.gameTime || 0;
  if (gt < 60 && !scoutingState.hasRun) {
    runScoutingReport(gameData);
  }

  const triggerReason = checkLiveAdvisorTriggers(gameData);
  if (!triggerReason) {
    sendAdvisorDebug(`[poll] No trigger (phase=${liveAdvisorState.lastPhase}, cooldown=${Math.round((liveAdvisorState.advisorCooldown - (Date.now() - liveAdvisorState.lastAdviceTime)) / 1000)}s)`);
    return;
  }

  sendAdvisorDebug(`[trigger] ${triggerReason}`);
  liveAdvisorState.lastAdviceTime = Date.now();

  try {
    const players = gameData.allPlayers || [];
    const activePlayer = gameData.activePlayer;
    const myName = activePlayer.summonerName || activePlayer.riotId || '';
    // Normalize for matching: strip #tag, lowercase, trim
    const normName = (n) => (n || '').split('#')[0].toLowerCase().trim();
    const myNorm = normName(myName);
    const myPlayer = players.find(p =>
      normName(p.summonerName) === myNorm || normName(p.riotId) === myNorm ||
      normName(p.summonerName).includes(myNorm) || myNorm.includes(normName(p.summonerName))
    );
    const myTeam = myPlayer?.team || 'ORDER';
    const allies = players.filter(p => p.team === myTeam);
    const enemies = players.filter(p => p.team !== myTeam);

    const formatP = (p) => {
      const items = (p.items || []).map(i => i.displayName).filter(Boolean).join(', ') || 'No items';
      const kda = p.scores || {};
      return `  ${p.championName} (Lv${p.level || 1}) Ã¢â‚¬â€ ${kda.kills || 0}/${kda.deaths || 0}/${kda.assists || 0} Ã¢â‚¬â€ Gold: ${p.currentGold || 0} Ã¢â‚¬â€ Items: [${items}]`;
    };

    // Ã¢â€â‚¬Ã¢â€â‚¬ Boots detection helper for live advisor (same logic as fetchPlayerItems) Ã¢â€â‚¬Ã¢â€â‚¬
    const advisorIsBootsId = (id) => {
      if (!ddragonItemCache || !ddragonItemCache.byId) return false;
      const d = ddragonItemCache.byId.get(String(id));
      return d && d.tags && d.tags.includes('Boots') && d.gold > 300;
    };
    const isValidOverlayPlanItem = (bi) => {
      if (!bi?.name) return false;
      if (bi.id && ddragonItemCache?.byId) {
        const data = ddragonItemCache.byId.get(String(bi.id));
        return isCompletedStoreItem(String(bi.id), data, 11);
      }
      return isKnownCompletedStoreItemName(bi.name, 11);
    };
    const myItemIds = (myPlayer?.items || []).map(i => String(i.itemID));
    const advisorHasBootsFromInventory = myItemIds.some(id => advisorIsBootsId(id));
    // Also check names for quest boots that might not have standard IDs
    const myItemNames = (myPlayer?.items || []).map(i => (i.displayName || '').toLowerCase().trim()).filter(Boolean);
    const BOOT_PATTERNS_ADV = ['boots', 'greaves', 'treads', 'steelcaps', 'plated', 'mercury', 'berserker', 'sorcerer', 'swiftness', 'lucidity', 'ionian', 'mobility', 'symbiotic', 'slightly magical', 'upgraded boots', 'zephyr', 'magical footwear'];
    const advisorHasBootsFromNames = myItemNames.some(n => BOOT_PATTERNS_ADV.some(p => n.includes(p)));
    // Use sticky flag: once boots are detected, never revert (ADC quest slot fix)
    if (advisorHasBootsFromInventory || advisorHasBootsFromNames) {
      global.__bootsEverDetected = true;
    }
    const advisorHasBoots = global.__bootsEverDetected || advisorHasBootsFromInventory || advisorHasBootsFromNames;

    // Detect which item the player is currently building toward (next unbought in build order)
    let currentlyBuilding = '';
    if (overlayData && overlayData.buildItems && overlayData.buildItems.length > 0) {
      const ownedNames = (myPlayer?.items || []).map(i => (i.displayName || '').toLowerCase().trim()).filter(Boolean);
      for (const bi of overlayData.buildItems) {
        if (!isValidOverlayPlanItem(bi)) continue;
        const bn = bi.name.toLowerCase().trim();
        const owned = ownedNames.some(o => o === bn || o.includes(bn) || bn.includes(o));
        // Skip boots if player already has boots (quest slot)
        const bootsSkip = advisorHasBoots && bi.id && advisorIsBootsId(bi.id);
        if (!owned && !bootsSkip) {
          currentlyBuilding = bi.name;
          break;
        }
      }
    }

    // Build remaining queue from overlay (items not yet purchased)
    let remainingBuildQueue = '';
    if (overlayData && overlayData.buildItems && overlayData.buildItems.length > 0) {
      const ownedNames = (myPlayer?.items || []).map(i => (i.displayName || '').toLowerCase().trim()).filter(Boolean);
      const remaining = overlayData.buildItems.filter(bi => {
        if (!isValidOverlayPlanItem(bi)) return false;
        const bn = bi.name.toLowerCase().trim();
        const owned = ownedNames.some(o => o === bn || o.includes(bn) || bn.includes(o));
        // Skip boots if player already has boots (quest slot)
        const bootsSkip = advisorHasBoots && bi.id && advisorIsBootsId(bi.id);
        return !owned && !bootsSkip;
      });
      if (remaining.length > 0) {
        remainingBuildQueue = remaining.map((bi, idx) => `${idx + 1}. ${bi.name}`).join('\n');
      }
    }
    const validatedBuildPlan = overlayData?.buildItems?.length
      ? (overlayData.buildItems.filter(isValidOverlayPlanItem).map((bi, idx) => `${idx + 1}. ${bi.name}${bi.reason ? ` (${bi.reason})` : ''}`).join('\n') || 'No validated build plan loaded yet.')
      : 'No validated build plan loaded yet.';

    // Ã¢â€â‚¬Ã¢â€â‚¬ Game Phase Detection Ã¢â€â‚¬Ã¢â€â‚¬
    const gameTime = gameData.gameData?.gameTime || 0;
    const gameMinutes = Math.floor(gameTime / 60);
    const gameSecs = Math.floor(gameTime % 60);
    let gamePhase = 'LANING';
    let phaseGuidance = 'Laning phase: prioritize the next completed item in the planned build order, with matchup-driven completed-item swaps only when needed.';
    if (gameTime >= 1500) { // 25+ min
      gamePhase = 'LATE GAME';
      phaseGuidance = 'Late game: prioritize final build optimization, defensive items vs fed enemies, and closing out the game.';
    } else if (gameTime >= 840) { // 14+ min
      gamePhase = 'MID GAME';
      phaseGuidance = 'Mid game: prioritize completed teamfight items, objective control items, and countering the strongest enemy threats.';
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Build Complete Detection Ã¢â€â‚¬Ã¢â€â‚¬
    // ADCs (Marksman) have 7-item builds: 6 regular slots + 1 quest boots slot
    // Quest boots can NEVER be sold, only swapped for other boots
    const myChampInfo = ddragonChampCache?.get(myPlayer?.championName);
    const isADC = myChampInfo?.tags?.includes('Marksman') || false;

    const myCompletedItems = (myPlayer?.items || []).filter(i => {
      const id = String(i.itemID);
      if (!ddragonItemCache || !ddragonItemCache.byId) return true;
      const d = ddragonItemCache.byId.get(id);
      return d && d.gold && (d.gold > 1000 || (d.tags && d.tags.includes('Boots') && d.gold > 300));
    });
    const myItemCount = myCompletedItems.length;
    // ADC quest slot: if boots moved to quest slot, they're not in items[] anymore
    // but the player still has them Ã¢â‚¬â€ count them toward completed items
    const hasBootsInInventory = myCompletedItems.some(i => {
      const d = ddragonItemCache?.byId?.get(String(i.itemID));
      return d && d.tags && d.tags.includes('Boots');
    });
    const questBootsMissing = isADC && global.__bootsEverDetected && !hasBootsInInventory;
    const effectiveItemCount = questBootsMissing ? myItemCount + 1 : myItemCount;
    const myNonBootsCount = myCompletedItems.filter(i => {
      const d = ddragonItemCache?.byId?.get(String(i.itemID));
      return !(d && d.tags && d.tags.includes('Boots'));
    }).length;

    const buildItemsTotal = overlayData?.buildItems?.length || 6;
    const isBuildComplete = !remainingBuildQueue && !currentlyBuilding && effectiveItemCount >= Math.min(buildItemsTotal, isADC ? 7 : 6);
    // For ADCs: full build = 6 non-boots slots filled (quest boots is separate)
    // For non-ADCs: full build = 6 total slots filled
    const isFullBuild = isADC ? myNonBootsCount >= 6 : effectiveItemCount >= 6;
    const isUltraLateGame = gameTime >= 1800; // 30+ min

    let buildCompleteContext = '';
    if (isBuildComplete) {
      const currentBuild = (myPlayer?.items || []).map(i => i.displayName).filter(Boolean).join(', ');
      let bootsAdvice;
      if (isADC) {
        // ADC quest boots can NEVER be sold, only swapped for other boots
        bootsAdvice = `- BOOTS (ADC QUEST SLOT): This champion has a quest boots slot. Quest boots CANNOT be sold Ã¢â‚¬â€ they can only be swapped for a different pair of boots. NEVER suggest selling boots for a non-boots item on this champion.\n` +
          `- If the current boots are suboptimal, suggest SWAPPING them for a different boots (e.g., Berserker's Greaves Ã¢â€ â€™ Mercury's Treads). Use the SELL format: CurrentBoots Ã¢â€ â€™ NewBoots.\n`;
      } else if (isFullBuild && isUltraLateGame) {
        bootsAdvice = `- BOOTS: Since ALL 6 slots are full and it's ultra-late game (${gameMinutes}min), boots CAN be sold for a 6th full item if the movement speed trade-off is worth it.\n`;
      } else {
        bootsAdvice = `- BOOTS: Do NOT suggest selling boots unless ALL 6 item slots are full AND it's 30+ minutes.\n`;
      }
      buildCompleteContext = `\nBUILD STATUS: Ã¢Å“â€¦ COMPLETE Ã¢â‚¬â€ All core items built. Current full build: [${currentBuild}]\n` +
        `Champion type: ${isADC ? 'ADC/Marksman (has quest boots slot Ã¢â‚¬â€ 7 items total)' : 'Non-ADC (6 items total)'}\n` +
        `Evaluate if any item should be REPLACED based on the current game state.\n` +
        `Consider:\n` +
        `- Is an item underperforming against the current enemy composition?\n` +
        `- Would a different defensive/offensive item be more effective now?\n` +
        `- Are there enemy-specific counter items that would be more impactful?\n` +
        bootsAdvice +
        `Only suggest a replacement if it's genuinely impactful. "No replacement needed" is a valid answer.\n`;
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Enemy Items Breakdown (dedicated section) Ã¢â€â‚¬Ã¢â€â‚¬
    const enemyItemBreakdown = enemies.map(e => {
      const items = (e.items || []).map(i => i.displayName).filter(Boolean);
      const kda = e.scores || {};
      const isFed = (kda.kills || 0) >= 5 || ((kda.kills || 0) - (kda.deaths || 0)) >= 4;
      const goldEarned = (kda.kills || 0) * 300 + (kda.assists || 0) * 150;
      return `  ${e.championName} (Lv${e.level || 1}, ${kda.kills || 0}/${kda.deaths || 0}/${kda.assists || 0})${isFed ? ' Ã¢Å¡Â Ã¯Â¸Â FED' : ''}: [${items.join(', ') || 'No items'}]`;
    }).join('\n');

    // Ã¢â€â‚¬Ã¢â€â‚¬ My items summary Ã¢â€â‚¬Ã¢â€â‚¬
    const myItems = (myPlayer?.items || []).map(i => i.displayName).filter(Boolean);
    // Use ID-based boots detection (catches quest slot boots that may not be in displayName list)
    const hasBoots = advisorHasBoots;

    // Ã¢â€â‚¬Ã¢â€â‚¬ #3: Enemy Damage-Type Classification Ã¢â€â‚¬Ã¢â€â‚¬
    const classifyDamageType = (enemy) => {
      const inferred = inferDamageFromTagsAndInfo(enemy.championName);
      if (inferred === 'AP' || inferred === 'AD' || inferred === 'HYBRID') return inferred;
      const champInfo = ddragonChampCache?.get(enemy.championName);
      const tags = champInfo?.tags || [];
      const enemyItems = (enemy.items || []).map(i => {
        const d = ddragonItemCache?.byId?.get(String(i.itemID));
        return d?.tags || [];
      }).flat();
      const hasAPItems = enemyItems.some(t => t === 'SpellDamage');
      const hasADItems = enemyItems.some(t => t === 'Damage' || t === 'CriticalStrike' || t === 'AttackSpeed');
      if (tags.includes('Mage') || (hasAPItems && !hasADItems)) return 'AP';
      if (tags.includes('Marksman') || tags.includes('Assassin') || (hasADItems && !hasAPItems)) return 'AD';
      if (hasAPItems && hasADItems) return 'MIXED';
      if (tags.includes('Tank') || tags.includes('Fighter')) return 'AD';
      return 'MIXED';
    };
    // Pre-warm champion cache
    await ensureDdragonChampCache();
    const enemyDamageProfile = enemies.map(e => ({ name: e.championName, type: classifyDamageType(e) }));
    const adCount = enemyDamageProfile.filter(d => d.type === 'AD').length;
    const apCount = enemyDamageProfile.filter(d => d.type === 'AP').length;
    const mixedCount = enemyDamageProfile.filter(d => d.type === 'MIXED').length;
    let damageVerdict = 'balanced';
    if (adCount >= 4) damageVerdict = 'heavily AD Ã¢â‚¬â€ prioritize armor';
    else if (apCount >= 4) damageVerdict = 'heavily AP Ã¢â‚¬â€ prioritize MR';
    else if (adCount >= 3) damageVerdict = 'AD-leaning Ã¢â‚¬â€ consider armor';
    else if (apCount >= 3) damageVerdict = 'AP-leaning Ã¢â‚¬â€ consider MR';
    const damageProfileStr = enemyDamageProfile.map(d => `${d.name}=${d.type}`).join(', ');
    const damageSection = `ENEMY DAMAGE PROFILE: ${adCount} AD / ${apCount} AP / ${mixedCount} Mixed Ã¢â‚¬â€ ${damageVerdict}\n  [${damageProfileStr}]`;

    // Ã¢â€â‚¬Ã¢â€â‚¬ #4: Gold Efficiency Context Ã¢â€â‚¬Ã¢â€â‚¬
    const currentGold = activePlayer.currentGold || 0;
    let goldContext = '';
    if (currentGold < 800) {
      goldContext = `GOLD CONTEXT: Very low gold (${currentGold}g) - continue toward the next completed item goal.`;
    } else if (currentGold < 1300) {
      goldContext = `GOLD CONTEXT: Low gold (${currentGold}g) - keep the next completed item goal.`;
    } else if (currentGold < 3000) {
      goldContext = `GOLD CONTEXT: Moderate gold (${currentGold}g) - recommend the next completed item goal.`;
    } else {
      goldContext = `GOLD CONTEXT: High gold (${currentGold}g) Ã¢â‚¬â€ can buy a completed item directly.`;
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ #7: Objective Awareness Ã¢â€â‚¬Ã¢â€â‚¬
    goldContext = `GOLD CONTEXT: ${currentGold}g available. NEXT ITEMS must still be completed item goals only; never name components.`;

    let objectiveContext = '';
    try {
      const events = gameData.events?.Events || [];
      const dragonKills = events.filter(e => e.EventName === 'DragonKill');
      const baronKills = events.filter(e => e.EventName === 'BaronKill');
      const heraldKills = events.filter(e => e.EventName === 'HeraldKill');
      const myTeamDragons = dragonKills.filter(e => {
        const killer = players.find(p => p.summonerName === e.KillerName || p.riotId === e.KillerName);
        return killer && killer.team === myTeam;
      }).length;
      const enemyDragons = dragonKills.length - myTeamDragons;
      const objectiveParts = [];
      if (dragonKills.length > 0) {
        objectiveParts.push(`Dragons: My team ${myTeamDragons}, Enemy ${enemyDragons}`);
        // Detect dragon type from last kill
        const lastDragon = dragonKills[dragonKills.length - 1];
        if (lastDragon.DragonType) objectiveParts.push(`Last dragon: ${lastDragon.DragonType}`);
      }
      if (baronKills.length > 0) objectiveParts.push(`Baron kills: ${baronKills.length}`);
      if (objectiveParts.length > 0) {
        objectiveContext = `OBJECTIVES: ${objectiveParts.join(' | ')}`;
      }
    } catch (e) { /* events may not exist in all API versions */ }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Two-Step Prompting Ã¢â€â‚¬Ã¢â€â‚¬
    // Step 1: Quick threat analysis (cached for 60s to reduce latency)
    sendAdvisorDebug('[ai] Step 1: Threat analysis...');
    // Using DeepSeek V4 Flash via OpenRouter.


    sendAdvisorDebug(`[ai] Using model: ${getModelDisplayName(getOpenRouterModel())} (OpenRouter)`);

    // Fix #6: Eliminate Step 1 AI call Ã¢â‚¬â€ use pre-computed threat analysis instead
    // The damage profile (damageSection) + enemy item breakdown is already computed above.
    // No need to waste an AI call asking "what are the threats?" when we've already calculated it.
    const threatAnalysis = `${damageSection}\nKey threat: ${(() => {
      const fedEnemy = enemies.find(e => (e.scores?.kills || 0) >= 5 || ((e.scores?.kills || 0) - (e.scores?.deaths || 0)) >= 4);
      if (fedEnemy) return `${fedEnemy.championName} is FED (${fedEnemy.scores?.kills}/${fedEnemy.scores?.deaths}/${fedEnemy.scores?.assists}) Ã¢â‚¬â€ prioritize countering their damage type`;
      const strongestEnemy = enemies.reduce((a, b) => ((b.scores?.kills || 0) - (b.scores?.deaths || 0)) > ((a.scores?.kills || 0) - (a.scores?.deaths || 0)) ? b : a, enemies[0]);
      return strongestEnemy ? `${strongestEnemy.championName} is the primary threat (${strongestEnemy.scores?.kills || 0}/${strongestEnemy.scores?.deaths || 0}/${strongestEnemy.scores?.assists || 0})` : 'No clear primary threat';
    })()}`;
    sendAdvisorDebug(`[ai] Pre-computed threat: ${threatAnalysis.substring(0, 100)}...`);

    // Build recommendations using pre-computed analysis
    sendAdvisorDebug('[ai] Generating build recommendations...');

    // Ã¢â€â‚¬Ã¢â€â‚¬ #6: Advisor Memory Ã¢â‚¬â€ inject previous advice to prevent flip-flopping Ã¢â€â‚¬Ã¢â€â‚¬
    const prevAdviceSection = liveAdvisorState.previousAdvice
      ? `\nYOUR PREVIOUS ADVICE (${Math.round((Date.now() - liveAdvisorState.previousAdviceTime) / 60000)} min ago):\n${liveAdvisorState.previousAdvice}\nIMPORTANT: Do NOT flip-flop. Only change recommendations if the game state has SIGNIFICANTLY shifted since your last advice. If the same items are still correct, recommend them again.\n`
      : '';

    // Ã¢â€â‚¬Ã¢â€â‚¬ #5: Class-Filtered Valid Items Ã¢â€â‚¬Ã¢â€â‚¬
    const getFilteredValidItems = () => {
      if (!ddragonItemCache || !ddragonItemCache.byId) return 'Loading...';
      const champInfo = ddragonChampCache?.get(myPlayer?.championName);
      const champTags = champInfo?.tags || [];
      const validItems = [];
      const alwaysIncludeTags = ['Health', 'Armor', 'SpellBlock']; // defensive items for everyone
      for (const [id, d] of ddragonItemCache.byId) {
        if (!isCompletedStoreItem(id, d, 11)) continue;
        // Check if item is relevant to champion class
        const itemTags = d.tags || [];
        let relevant = false;
        if (champTags.includes('Marksman')) {
          relevant = itemTags.some(t => ['Damage', 'CriticalStrike', 'AttackSpeed', 'LifeSteal', 'ArmorPenetration'].includes(t));
        } else if (champTags.includes('Mage')) {
          relevant = itemTags.some(t => ['SpellDamage', 'Mana', 'ManaRegen', 'CooldownReduction', 'MagicPenetration'].includes(t));
        } else if (champTags.includes('Assassin')) {
          relevant = itemTags.some(t => ['Damage', 'ArmorPenetration', 'CooldownReduction', 'LifeSteal', 'CriticalStrike'].includes(t));
        } else if (champTags.includes('Tank')) {
          relevant = itemTags.some(t => ['Health', 'Armor', 'SpellBlock', 'CooldownReduction', 'Mana'].includes(t));
        } else if (champTags.includes('Fighter')) {
          relevant = itemTags.some(t => ['Damage', 'Health', 'Armor', 'LifeSteal', 'CooldownReduction', 'AttackSpeed'].includes(t));
        } else if (champTags.includes('Support')) {
          relevant = itemTags.some(t => ['SpellDamage', 'Health', 'Mana', 'ManaRegen', 'CooldownReduction', 'SpellBlock', 'Armor'].includes(t));
        } else {
          relevant = true; // Unknown class Ã¢â‚¬â€ show everything
        }
        // Always include defensive items
        if (!relevant && itemTags.some(t => alwaysIncludeTags.includes(t))) relevant = true;
        // Always include boots
        if (itemTags.includes('Boots')) relevant = true;
        // Always include items already in the build queue
        if (overlayData?.buildItems?.some(bi => bi.id === id)) relevant = true;
        if (relevant) validItems.push(d.name);
      }
      return validItems.sort().join(', ');
    };

    const userMessage = `GAME TIME: ${gameMinutes}:${gameSecs.toString().padStart(2, '0')} Ã¢â‚¬â€ PHASE: ${gamePhase}
${phaseGuidance}

MY CHAMPION: ${myPlayer?.championName || '?'}
MY STATS: Level ${myPlayer?.level || '?'}, ${myPlayer?.scores?.kills || 0}/${myPlayer?.scores?.deaths || 0}/${myPlayer?.scores?.assists || 0}, Gold: ${activePlayer.currentGold || 0}
MY ITEMS: [${myItems.join(', ') || 'None'}]
HAS BOOTS: ${hasBoots ? 'Yes' : 'No'}
${goldContext}
LIVE ADVISOR ITEM-NAMING RULE: NEXT ITEMS are completed item goals for the overlay. Never output components such as Null-Magic Mantle, Kindlegem, Ruby Crystal, Long Sword, Amplifying Tome, Cloth Armor, or Chain Vest.
${currentlyBuilding ? `\nCURRENTLY BUILDING: ${currentlyBuilding} Ã¢â‚¬â€ I have components for this item. This MUST be NEXT ITEM 1.\n` : ''}
VALIDATED LIVE BUILD PLAN:
${validatedBuildPlan}

${remainingBuildQueue ? `REMAINING BUILD QUEUE (in order):\n${remainingBuildQueue}\nFor NEXT ITEMS: Item 1 should be the first item in this queue (the one I'm building). Item 2 should be what comes after.\n` : ''}
${buildCompleteContext}
${damageSection}
${objectiveContext}
ENEMY BUILDS (what they are building):
${enemyItemBreakdown}
${threatAnalysis ? `\nTHREAT ANALYSIS:\n${threatAnalysis}\n` : ''}
${prevAdviceSection}
MY TEAM:
${allies.map(formatP).join('\n')}

ORIGINAL RECOMMENDED BUILD (pre-game):
${liveAdvisorState.originalBuildText || 'No pre-game build available'}

VALID ITEMS (current patch Ã¢â‚¬â€ ONLY suggest items from this list):
${getFilteredValidItems()}

Analyze the current game state and provide live build advice.`;


    const advisorSystemPrompt = `You are a League of Legends live game build advisor. Respond in this EXACT format:

ASSESSMENT
One-line summary of the game state and recommendation.

CHANGES
OldItem â†’ NewItem: reason
(List item swaps from the current build. Write "None needed" if no swaps.)

NEXT ITEMS
1. ItemName: reason
2. ItemName: reason
(List the next 1-2 items to buy. Use exact item names from the VALID ITEMS list.)

SELL
OldItem â†’ NewItem: reason
(Only if build is complete and an item should be replaced. Otherwise omit.)

THREAT
One-line about the biggest enemy threat.

RULES:
- Use EXACT item names from the VALID ITEMS list provided
- Use the â†’ arrow character for item swaps
- Keep each section short (1-3 lines max)
- NEXT ITEMS must be a numbered list of completed item goals only, never components
- Treat VALIDATED LIVE BUILD PLAN as the source of truth.
- Default action is CONTINUE: keep the build plan and list the next 1-2 unowned items from it.
- Only change the build plan by writing an explicit CHANGES line. Do not sneak a new item into NEXT ITEMS unless it also appears as OldItem -> NewItem under CHANGES.
- If CURRENTLY BUILDING is specified, it should remain NEXT ITEM 1 unless CHANGES explicitly swaps that exact item for an emergency counter.
- Preserve the validated build queue unless the current game state creates a clear emergency.
- Be stable across repeated checks. If gold, inventory, enemy threats, and objective state are materially unchanged from PREVIOUS ADVICE, keep the same NEXT ITEMS and write "None needed" under CHANGES.
- Respect champion class and support economy. Do not recommend expensive off-class carry items to utility supports.
- Anti-heal must fit the champion: tanks/fighters use Thornmail only if they are being hit, ADC/crit users use Mortal Reminder, AP/mages use Morellonomicon. Utility supports usually rely on Ignite/Oblivion Orb if AP or ask an ally to cover anti-heal; do not put off-class anti-heal items in CHANGES or NEXT ITEMS for a utility support.
- Ignore current gold for item naming: the UI needs the next completed item goal, not the shop component to buy this recall.`;

    const advisorSeed = stableHashSeed([
      myPlayer?.championName || '?',
      gamePhase,
      myItems.join(','),
      remainingBuildQueue || '',
      currentlyBuilding || '',
      damageSection || '',
      threatAnalysis || '',
    ].join('|'));
    const _rawText = await llmGenerate(advisorSystemPrompt, userMessage, {
      temperature: 0.08,
      topP: 0.4,
      seed: advisorSeed,
      maxTokens: 4096,
    });
    const text = _rawText;
    sendAdvisorDebug(`[ai] Response received (${text.length} chars)`);

    // #6: Save response to memory for next advisor call (prevents flip-flopping)
    liveAdvisorState.previousAdvice = text;
    liveAdvisorState.previousAdviceTime = Date.now();

    // Parse the response
    const changes = [];
    const nextItems = [];
    const sellReplacements = []; // New: SELL section for build-complete replacements
    let summary = '';
    const lines = text.split('\n');
    let inChanges = false;
    let inNextItems = false;
    let inSell = false;
    const parseSwapLine = (value) => {
      const cleaned = String(value || '').replace(/^\d+[.)]\s*/, '').replace(/\*\*/g, '').trim();
      const match = cleaned.match(/^(.*?)\s*(?:\u2192|->|=>|ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢)\s*([^:]+?)(?:\s*:\s*(.*))?$/);
      if (!match) return null;
      return {
        current: match[1].trim(),
        recommended: match[2].trim(),
        reason: (match[3] || '').trim(),
      };
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('ASSESSMENT')) { inChanges = false; inNextItems = false; inSell = false; continue; }
      if (trimmed === 'CHANGES') { inChanges = true; inNextItems = false; inSell = false; continue; }
      if (trimmed === 'NEXT ITEM' || trimmed === 'NEXT ITEMS') { inChanges = false; inNextItems = true; inSell = false; continue; }
      if (trimmed === 'SELL') { inChanges = false; inNextItems = false; inSell = true; continue; }
      if (trimmed === 'THREAT') { inChanges = false; inNextItems = false; inSell = false; continue; }

      if (!summary && !inChanges && !inNextItems && !inSell && trimmed && !trimmed.startsWith('CHANGES') && !trimmed.startsWith('NEXT ITEM') && !trimmed.startsWith('THREAT') && !trimmed.startsWith('SELL')) {
        summary = trimmed;
      }
      if (inChanges && trimmed.includes('Ã¢â€ â€™')) {
        const arrow = trimmed.indexOf('Ã¢â€ â€™');
        const colon = trimmed.indexOf(':', arrow);
        const cur = trimmed.substring(0, arrow).trim();
        const rec = colon > arrow ? trimmed.substring(arrow + 1, colon).trim() : trimmed.substring(arrow + 1).trim();
        const reason = colon > arrow ? trimmed.substring(colon + 1).trim() : '';
        if (cur && rec && rec.toLowerCase() !== 'none needed') {
          changes.push({ currentItem: cur, recommendedItem: rec, reason });
        }
      }
      // Parse SELL section (same format as CHANGES: OldItem Ã¢â€ â€™ NewItem: reason)
      if (inSell && trimmed.includes('Ã¢â€ â€™')) {
        const arrow = trimmed.indexOf('Ã¢â€ â€™');
        const colon = trimmed.indexOf(':', arrow);
        const cur = trimmed.substring(0, arrow).trim();
        const rec = colon > arrow ? trimmed.substring(arrow + 1, colon).trim() : trimmed.substring(arrow + 1).trim();
        const reason = colon > arrow ? trimmed.substring(colon + 1).trim() : '';
        if (cur && rec && !rec.toLowerCase().includes('no replacement') && rec.toLowerCase() !== 'none') {
          sellReplacements.push({ sellItem: cur, buyItem: rec, reason });
        }
      }
      const parsedSwap = parseSwapLine(trimmed);
      if (inChanges && parsedSwap && !changes.some(c => c.currentItem === parsedSwap.current && c.recommendedItem === parsedSwap.recommended)) {
        if (parsedSwap.current && parsedSwap.recommended && parsedSwap.recommended.toLowerCase() !== 'none needed') {
          changes.push({ currentItem: parsedSwap.current, recommendedItem: parsedSwap.recommended, reason: parsedSwap.reason });
        }
      }
      if (inSell && parsedSwap && !sellReplacements.some(s => s.sellItem === parsedSwap.current && s.buyItem === parsedSwap.recommended)) {
        if (parsedSwap.current && parsedSwap.recommended && !parsedSwap.recommended.toLowerCase().includes('no replacement') && parsedSwap.recommended.toLowerCase() !== 'none') {
          sellReplacements.push({ sellItem: parsedSwap.current, buyItem: parsedSwap.recommended, reason: parsedSwap.reason });
        }
      }
      if (inNextItems && trimmed) {
        // Skip "Build complete" lines
        if (trimmed.toLowerCase().includes('build complete')) continue;
        // Parse "1. ItemName: reason" or "1. ItemName" or just "ItemName"
        const itemMatch = trimmed.match(/^\d+[\.\)]\s*(.+?)(?::\s*.+)?$/);
        if (itemMatch) {
          const itemName = itemMatch[1].replace(/\*\*/g, '').trim();
          if (itemName && itemName.toLowerCase() !== 'none' && itemName.toLowerCase() !== 'none needed') {
            nextItems.push(itemName);
          }
        } else if (!trimmed.toLowerCase().includes('none')) {
          // Plain item name without numbering
          const plainName = trimmed.replace(/\*\*/g, '').replace(/:\s*.+$/, '').trim();
          if (plainName) nextItems.push(plainName);
        }
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Validate all AI-suggested items against DDragon Ã¢â€â‚¬Ã¢â€â‚¬
    const validateItem = async (name) => {
      const resolved = await resolveDdragonItem(name);
      if (!resolved) {
        sendAdvisorDebug(`[validation] REJECTED invalid item: "${name}" Ã¢â‚¬â€ not found in DDragon`);
        return false;
      }
      const data = ddragonItemCache?.byId?.get(String(resolved.id));
      if (!data?.isSR) {
        sendAdvisorDebug(`[validation] REJECTED non-SR item: "${resolved.name || name}"`);
        return false;
      }
      if (!isCompletedStoreItem(String(resolved.id), data, 11)) {
        sendAdvisorDebug(`[validation] REJECTED component in live advisor: "${resolved.name || name}"`);
        return false;
      }
      return true;
    };

    // Helper: check if a suggested item is boots
    const isBootsItem = async (name) => {
      const resolved = await resolveDdragonItem(name);
      if (resolved && resolved.id && advisorIsBootsId(resolved.id)) return true;
      const lower = name.toLowerCase();
      return BOOT_PATTERNS_ADV.some(p => lower.includes(p));
    };

    // Validate CHANGES Ã¢â‚¬â€ remove invalid recommendations
    for (let i = changes.length - 1; i >= 0; i--) {
      if (!(await validateItem(changes[i].recommendedItem))) {
        changes.splice(i, 1);
      }
    }

    // Validate NEXT ITEMS Ã¢â‚¬â€ remove invalid items
    for (let i = nextItems.length - 1; i >= 0; i--) {
      if (!(await validateItem(nextItems[i]))) {
        nextItems.splice(i, 1);
      }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Boots dedup: if player already has boots, strip any boots from suggestions Ã¢â€â‚¬Ã¢â€â‚¬
    if (advisorHasBoots) {
      for (let i = nextItems.length - 1; i >= 0; i--) {
        if (await isBootsItem(nextItems[i])) {
          sendAdvisorDebug(`[validation] BOOTS DEDUP: Removed "${nextItems[i]}" from NEXT ITEMS Ã¢â‚¬â€ player already has boots`);
          nextItems.splice(i, 1);
        }
      }
      for (let i = changes.length - 1; i >= 0; i--) {
        if (await isBootsItem(changes[i].recommendedItem)) {
          sendAdvisorDebug(`[validation] BOOTS DEDUP: Removed "${changes[i].recommendedItem}" from CHANGES Ã¢â‚¬â€ player already has boots`);
          changes.splice(i, 1);
        }
      }
    }

    if (nextItems.length === 0) {
      const queueFallback = [
        currentlyBuilding,
        ...String(remainingBuildQueue || '')
          .split('\n')
          .map(line => line.replace(/^\s*\d+[.)]\s*/, '').trim())
          .filter(Boolean),
      ].filter((item, index, arr) => item && arr.findIndex(v => v.toLowerCase() === item.toLowerCase()) === index);
      for (const item of queueFallback.slice(0, 2)) {
        if (await validateItem(item)) nextItems.push(item);
      }
      if (nextItems.length > 0) {
        sendAdvisorDebug(`[validation] Filled NEXT ITEMS from completed build queue: [${nextItems.join(', ')}]`);
      }
    }

    // Validate SELL items
    for (let i = sellReplacements.length - 1; i >= 0; i--) {
      if (!(await validateItem(sellReplacements[i].buyItem))) {
        sellReplacements.splice(i, 1);
      }
    }

    sendAdvisorDebug(`[validation] ${changes.length} valid changes, ${nextItems.length} valid next items, ${sellReplacements.length} valid sell replacements`);

    const advice = {
      triggered: true,
      triggerReason,
      gameTime: gameData.gameData?.gameTime || 0,
      summary: summary || 'Build analysis complete.',
      changes,
      nextItems,
      sellReplacements,
      isBuildComplete,
      rawText: text,
    };

    sendAdvisorDebug(`[advice] ${advice.summary}`);
    sendAdvisorDebug(`[advice] NEXT ITEMS parsed: [${nextItems.join(', ')}]`);
    if (sellReplacements.length > 0) {
      sendAdvisorDebug(`[advice] SELL: ${sellReplacements.map(s => `${s.sellItem} Ã¢â€ â€™ ${s.buyItem}`).join(', ')}`);
    }
    if (isBuildComplete) {
      sendAdvisorDebug(`[advice] Build is COMPLETE Ã¢â‚¬â€ evaluating replacements`);
    }
    // Ã¢â€â‚¬Ã¢â€â‚¬ Apply updates to overlay Ã¢â€â‚¬Ã¢â€â‚¬
    if (overlayData && overlayData.buildItems && overlayData.buildItems.length > 0) {
      const updatedItems = [...overlayData.buildItems];
      let modified = false;
      for (let i = updatedItems.length - 1; i >= 0; i--) {
        if (!isValidOverlayPlanItem(updatedItems[i])) {
          sendAdvisorDebug(`[overlay] Removed unavailable item from build plan: ${updatedItems[i]?.name || 'unknown'}`);
          updatedItems.splice(i, 1);
          modified = true;
        }
      }

      // Figure out which items the player already has (to find the "next" item)
      const ownedItemNames = (myPlayer?.items || []).map(i => (i.displayName || '').toLowerCase().trim()).filter(Boolean);
      let lockIndex = 0; // First unbought item = locked (currently building)
      for (let i = 0; i < updatedItems.length; i++) {
        const bi = updatedItems[i];
        const buildName = bi.name.toLowerCase().trim();
        const owned = ownedItemNames.some(owned => owned === buildName || owned.includes(buildName) || buildName.includes(owned));
        const matchByBoots = advisorHasBoots && bi.id && advisorIsBootsId(bi.id);
        
        if (owned || matchByBoots) {
          lockIndex = i + 1; // This one is bought (or is boots we already own), lock moves forward
        } else {
          break;
        }
      }
      sendAdvisorDebug(`[overlay] Lock index: ${lockIndex} (building: ${lockIndex < updatedItems.length ? updatedItems[lockIndex]?.name : 'end'})`);

      // 1. Apply CHANGES (swap items) Ã¢â‚¬â€ skip lockIndex (currently building)
      const safeChanges = changes.filter(c => Boolean(c.currentItem && c.recommendedItem));

      for (const change of safeChanges) {
        const curName = change.currentItem.toLowerCase().trim();
        // Fix: Check if recommended item already exists in the build (prevent duplicates)
        const recResolved = await resolveDdragonItem(change.recommendedItem);
        if (recResolved && recResolved.id && updatedItems.some(ui => ui.id === recResolved.id)) {
          sendAdvisorDebug(`[overlay] Skipped swap: ${change.recommendedItem} already in build (dedup)`);
          continue;
        }
        for (let i = lockIndex; i < updatedItems.length; i++) {
          if (updatedItems[i].name.toLowerCase().trim() === curName ||
              updatedItems[i].name.toLowerCase().includes(curName) ||
              curName.includes(updatedItems[i].name.toLowerCase())) {
            const resolved = recResolved || await resolveDdragonItem(change.recommendedItem);
            sendAdvisorDebug(`[overlay] Swapping item ${i}: ${updatedItems[i].name} Ã¢â€ â€™ ${change.recommendedItem}${resolved ? ' (icon found)' : ' (no icon)'}`);
            updatedItems[i] = {
              name: resolved?.name || change.recommendedItem,
              iconUrl: resolved?.iconUrl || '',
              gold: resolved?.gold || 0,
              id: resolved?.id || '',
              reason: change.reason || '',
            };
            modified = true;
            break;
          }
        }
      }

      // 2. Apply NEXT ITEMS Ã¢â‚¬â€ update overlay starting at lockIndex
      //    NEXT ITEM 1 Ã¢â€ â€™ lockIndex (the item to build now)
      //    NEXT ITEM 2 Ã¢â€ â€™ lockIndex+1 (the item after that) - UNLESS there's a boots/non-boots mismatch
      const derivePlanNextItems = () => updatedItems
        .slice(lockIndex)
        .filter((bi) => {
          if (!isValidOverlayPlanItem(bi)) return false;
          const buildName = bi.name.toLowerCase().trim();
          const owned = ownedItemNames.some(owned => owned === buildName || owned.includes(buildName) || buildName.includes(owned));
          const bootsSkip = advisorHasBoots && bi.id && advisorIsBootsId(bi.id);
          return !owned && !bootsSkip;
        })
        .slice(0, 2)
        .map(bi => bi.name);
      const aiNextItems = [...nextItems];
      const planNextItems = derivePlanNextItems();
      if (planNextItems.length > 0) {
        nextItems.length = 0;
        nextItems.push(...planNextItems);
        if (aiNextItems.length && aiNextItems.join('|').toLowerCase() !== planNextItems.join('|').toLowerCase()) {
          sendAdvisorDebug(`[validation] Ignored NEXT ITEMS outside validated plan: [${aiNextItems.join(', ')}] -> [${planNextItems.join(', ')}]`);
        }
      }
      if (nextItems.length > 0) {
        let overlayIdx = lockIndex;
        for (let ni = 0; ni < nextItems.length && overlayIdx < updatedItems.length; ni++) {
          const suggestedName = nextItems[ni];
          const suggestedLower = suggestedName.toLowerCase().trim();
          const resolved = await resolveDdragonItem(suggestedName);
          const suggestedIsBoots = resolved && resolved.id ? advisorIsBootsId(resolved.id) : false;

          let targetIdx = overlayIdx;
          let currentId = updatedItems[targetIdx].id;
          let currentIsBoots = currentId ? advisorIsBootsId(currentId) : false;

          // Protect boots: If overlay has boots here, but AI says to build a non-boot,
          // skip the overlay's boot slot and apply the AI's non-boot item to the next slot!
          if (currentIsBoots !== suggestedIsBoots) {
            sendAdvisorDebug(`[overlay] NEXT ITEM ${ni + 1}: Skipping slot ${targetIdx} (${updatedItems[targetIdx].name}) due to Boots mismatch with suggestion (${suggestedName})`);
            overlayIdx++;
            if (overlayIdx >= updatedItems.length) break;
            targetIdx = overlayIdx;
          }

          const currentName = updatedItems[targetIdx].name.toLowerCase().trim();

          // Only update if the AI is suggesting a different item
          if (currentName !== suggestedLower && !currentName.includes(suggestedLower) && !suggestedLower.includes(currentName)) {
            // Fix: Skip if this item already exists elsewhere in the build (prevent duplicates)
            if (resolved && resolved.id && updatedItems.some((ui, idx) => ui.id === resolved.id && idx !== targetIdx)) {
              sendAdvisorDebug(`[overlay] Skipped NEXT ITEM ${ni + 1}: ${suggestedName} already in build at another position (dedup)`);
            } else {
              sendAdvisorDebug(`[overlay] NEXT ITEM ${ni + 1}: replacing ${updatedItems[targetIdx].name} Ã¢â€ â€™ ${suggestedName}${resolved ? ' (icon found)' : ' (no icon)'}`);
              updatedItems[targetIdx] = {
                name: resolved?.name || suggestedName,
                iconUrl: resolved?.iconUrl || '',
                gold: resolved?.gold || 0,
                id: resolved?.id || '',
                reason: `Live advisor: next item`,
              };
              modified = true;
            }
          } else {
            sendAdvisorDebug(`[overlay] NEXT ITEM ${ni + 1}: ${suggestedName} matches queue Ã¢â‚¬â€ no change`);
          }
          
          overlayIdx++; // Advance to the next overlay slot for the next AI suggestion
        }
      }

      // 3. Apply SELL replacements (build-complete item swaps)
      if (isBuildComplete && sellReplacements.length > 0) {
        for (const sell of sellReplacements) {
          const sellName = sell.sellItem.toLowerCase().trim();
          const resolved = await resolveDdragonItem(sell.buyItem);
          if (!resolved) {
            sendAdvisorDebug(`[overlay] SELL: Could not resolve ${sell.buyItem} Ã¢â‚¬â€ skipping`);
            continue;
          }

          // Check if the item being sold is boots
          const isSellItemBoots = (() => {
            for (const bi of updatedItems) {
              if (bi.name.toLowerCase().trim() === sellName && bi.id && advisorIsBootsId(bi.id)) return true;
            }
            return false;
          })();
          const isBuyItemBoots = resolved.id ? advisorIsBootsId(resolved.id) : false;

          // ADC quest boots: can NEVER be sold for a non-boots item
          if (isADC && isSellItemBoots && !isBuyItemBoots) {
            sendAdvisorDebug(`[overlay] SELL: BLOCKED Ã¢â‚¬â€ ADC quest boots cannot be sold for non-boots item (${sell.sellItem} Ã¢â€ â€™ ${sell.buyItem})`);
            continue;
          }

          // Non-ADC boots protection: only allow boots sell if full build + ultra-late game
          if (!isADC && isSellItemBoots && !isBuyItemBoots && (!isFullBuild || !isUltraLateGame)) {
            sendAdvisorDebug(`[overlay] SELL: Blocked boots replacement (need full build + 30min). isFullBuild=${isFullBuild}, isUltraLate=${isUltraLateGame}`);
            continue;
          }

          // Find the item to replace in the overlay
          let replaced = false;
          for (let i = 0; i < updatedItems.length; i++) {
            const biName = updatedItems[i].name.toLowerCase().trim();
            if (biName === sellName || biName.includes(sellName) || sellName.includes(biName)) {
              sendAdvisorDebug(`[overlay] SELL: Replacing ${updatedItems[i].name} Ã¢â€ â€™ ${sell.buyItem} (${sell.reason})`);
              updatedItems[i] = {
                name: resolved.name || sell.buyItem,
                iconUrl: resolved.iconUrl || '',
                gold: resolved.gold || 0,
                id: resolved.id || '',
                reason: sell.reason || '',
              };
              modified = true;
              replaced = true;
              break;
            }
          }
          if (!replaced) {
            sendAdvisorDebug(`[overlay] SELL: Could not find ${sell.sellItem} in build to replace`);
          }
        }
      }

      if (modified) {
        // Fix: Global safety net Ã¢â‚¬â€ deduplicate items by ID before pushing to overlay
        const seenIds = new Set();
        for (let i = updatedItems.length - 1; i >= 0; i--) {
          if (updatedItems[i].id && seenIds.has(updatedItems[i].id)) {
            sendAdvisorDebug(`[overlay] Dedup safety net: removed duplicate ${updatedItems[i].name} at position ${i}`);
            updatedItems.splice(i, 1);
          } else if (updatedItems[i].id) {
            seenIds.add(updatedItems[i].id);
          }
        }
        overlayGeneration++;
        overlayData.buildItems = updatedItems;
        overlayData._generation = overlayGeneration;
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('overlay-items-update', updatedItems, overlayGeneration);
          sendAdvisorDebug(`[overlay] Pushed ${updatedItems.length} items to overlay (gen=${overlayGeneration}, dedup applied)`);
        }
        // CRITICAL: Also push updated items to App UI so CORE BUILD section stays in sync
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('build-items-updated', updatedItems);
          sendAdvisorDebug(`[app-ui] Pushed ${updatedItems.length} updated items to App UI (gen=${overlayGeneration})`);
        }
      }
    }
    advice.nextItems = [...nextItems];
    advice.changes = [...changes];
    advice.sellReplacements = [...sellReplacements];
    advice.planSynced = Boolean(overlayData?.buildItems?.length);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('live-advice', advice);
    }
  } catch (err) {
    sendAdvisorDebug(`[error] ${err.message}`);
  }
}

function startLiveAdvisor() {
  if (liveAdvisorState.isPolling) return;
  sendAdvisorDebug('[start] Live advisor polling started (every 15s)');
  liveAdvisorState.isPolling = true;
  liveAdvisorState.lastAdviceTime = 0;
  liveAdvisorState.lastPhase = '';
  liveAdvisorState.lastFedEnemies = [];
  if (liveAdvisorInterval) clearInterval(liveAdvisorInterval);
  liveAdvisorInterval = setInterval(pollLiveClient, 15000);
  // Do an immediate first poll
  pollLiveClient();
}

function stopLiveAdvisor() {
  if (!liveAdvisorState.isPolling) return;
  console.log('[live-advisor] Stopping live game polling');
  liveAdvisorState.isPolling = false;
  if (liveAdvisorInterval) {
    clearInterval(liveAdvisorInterval);
    liveAdvisorInterval = null;
  }
}

// IPC: store original build text when a build is generated (so live advisor can reference it)
ipcMain.on('store-original-build', (_event, buildText) => {
  liveAdvisorState.originalBuildText = buildText || '';
  console.log('[live-advisor] Stored original build text');
});

// IPC: manually start/stop live advisor
ipcMain.handle('live-advisor-start', async () => {
  startLiveAdvisor();
  return { ok: true };
});

ipcMain.handle('live-advisor-stop', async () => {
  stopLiveAdvisor();
  return { ok: true };
});

ipcMain.handle('live-advisor-status', async () => {
  return { isPolling: liveAdvisorState.isPolling };
});

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã¢â€â‚¬Ã¢â€â‚¬ Loading Screen Scouting Report Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

let scoutingState = {
  hasRun: false,        // only run once per game
  gameId: null,         // track which game we've scouted
};

function sendScoutDebug(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log('[scout]', msg);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scout-debug', line);
  }
  if (scoutWindow && !scoutWindow.isDestroyed()) {
    scoutWindow.webContents.send('scout-debug', line);
  }
}

async function riotApiGet(url) {
  const nodeFetch = require('node-fetch');
  // Settings key takes priority over .env
  const apiKey = getSetting('riotApiKey') || process.env.RIOT_API_KEY;
  // Sync env in case other code reads it
  process.env.RIOT_API_KEY = apiKey;
  const res = await nodeFetch(url, {
    headers: { 'X-Riot-Token': apiKey },
    timeout: 8000,
  });
  if (res.status === 429) {
    sendScoutDebug('[riot] Rate limited, waiting 2s...');
    await new Promise(r => setTimeout(r, 2000));
    return riotApiGet(url);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot API ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json();
}

async function fetchPlayerScoutData(riotId, tagLine, currentChampion) {
  const region = process.env.RIOT_REGION || 'euw1';
  const regionV5 = process.env.RIOT_REGION_V5 || 'europe';

  try {
    // 1. Get account by Riot ID
    const account = await riotApiGet(
      `https://${regionV5}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(riotId)}/${encodeURIComponent(tagLine)}`
    );
    const puuid = account.puuid;

    // 2. Get summoner data
    const summoner = await riotApiGet(
      `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
    );

    // 3. Get ranked stats (SoloQ + FlexQ)
    let rankedStats = [];
    try {
      rankedStats = await riotApiGet(
        `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`
      );
    } catch (e) { sendScoutDebug(`[riot] Ranked fetch fail for ${riotId}: ${e.message}`); }

    const soloQ = rankedStats.find(e => e.queueType === 'RANKED_SOLO_5x5');
    const flexQ = rankedStats.find(e => e.queueType === 'RANKED_FLEX_SR');

    // 4. Get recent match IDs (last 8, any queue)
    let matchIds = [];
    try {
      matchIds = await riotApiGet(
        `https://${regionV5}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=8`
      );
    } catch (e) { sendScoutDebug(`[riot] Match IDs fail for ${riotId}: ${e.message}`); }

    // 5. Get match details (last 5 to get useful data)
    const recentMatches = [];
    for (const mid of matchIds.slice(0, 5)) {
      try {
        const match = await riotApiGet(
          `https://${regionV5}.api.riotgames.com/lol/match/v5/matches/${mid}`
        );
        const participant = match.info.participants.find(p => p.puuid === puuid);
        if (participant) {
          const durMin = Math.max(1, Math.floor(match.info.gameDuration / 60));
          recentMatches.push({
            champion: participant.championName,
            win: participant.win,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            cs: participant.totalMinionsKilled + (participant.neutralMinionsKilled || 0),
            csPerMin: ((participant.totalMinionsKilled + (participant.neutralMinionsKilled || 0)) / durMin).toFixed(1),
            gameDuration: durMin,
            role: participant.individualPosition || participant.teamPosition || '',
            visionScore: participant.visionScore || 0,
            damageDealt: participant.totalDamageDealtToChampions || 0,
            goldEarned: participant.goldEarned || 0,
          });
        }
      } catch (e) { sendScoutDebug(`[riot] Match ${mid} fail: ${e.message}`); }
      await new Promise(r => setTimeout(r, 150));
    }

    // 6. Calculate aggregated stats from recent matches
    let recentAvgKDA = 0, recentWinRate = 0, recentAvgCS = 0;
    if (recentMatches.length > 0) {
      const totalK = recentMatches.reduce((s, m) => s + m.kills, 0);
      const totalD = recentMatches.reduce((s, m) => s + m.deaths, 0);
      const totalA = recentMatches.reduce((s, m) => s + m.assists, 0);
      const totalWins = recentMatches.filter(m => m.win).length;
      recentAvgKDA = totalD > 0 ? ((totalK + totalA) / totalD) : totalK + totalA;
      recentWinRate = Math.round((totalWins / recentMatches.length) * 100);
      recentAvgCS = (recentMatches.reduce((s, m) => s + parseFloat(m.csPerMin), 0) / recentMatches.length).toFixed(1);
    }

    // Build rank info
    const buildRank = (q) => q ? {
      tier: q.tier, rank: q.rank, lp: q.leaguePoints,
      wins: q.wins, losses: q.losses,
      winRate: Math.round((q.wins / (q.wins + q.losses)) * 100),
      hotStreak: q.hotStreak,
      totalGames: q.wins + q.losses,
    } : null;

    const soloRank = buildRank(soloQ);
    const flexRank = buildRank(flexQ);
    const primaryRank = soloRank || flexRank;

    return {
      riotId: `${riotId}#${tagLine}`,
      level: summoner.summonerLevel,
      tier: primaryRank?.tier || 'UNRANKED',
      rank: primaryRank?.rank || '',
      lp: primaryRank?.lp || 0,
      wins: primaryRank?.wins || 0,
      losses: primaryRank?.losses || 0,
      winRate: primaryRank?.winRate || 0,
      totalGames: primaryRank?.totalGames || 0,
      hotStreak: primaryRank?.hotStreak || false,
      soloQ: soloRank,
      flexQ: flexRank,
      recentMatches,
      recentAvgKDA: parseFloat(recentAvgKDA.toFixed(2)),
      recentWinRate,
      recentAvgCS,
      currentChampion,
    };
  } catch (err) {
    sendScoutDebug(`[riot] Error for ${riotId}#${tagLine}: ${err.message}`);
    return {
      riotId: `${riotId}#${tagLine}`,
      level: 0,
      tier: 'UNKNOWN',
      rank: '',
      lp: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalGames: 0,
      hotStreak: false,
      recentMatches: [],
      recentAvgKDA: 0,
      recentWinRate: 0,
      recentAvgCS: '0',
      error: err.message,
    };
  }
}

// Algorithmic fallback rating when AI is unavailable or misses players
function computeFallbackRating(ps) {
  let rating = 5; // default average
  const wr = ps.winRate || 0;
  const totalGames = ps.totalGames || 0;
  const kda = ps.recentAvgKDA || 0;

  if (ps.tier === 'HIDDEN' || ps.tier === 'UNKNOWN') {
    return { rating: 5, note: 'Hidden profile', laneNote: '', smurfProbability: 0, approach: '' };
  }
  if (ps.tier === 'UNRANKED' && totalGames === 0) {
    return { rating: 3, note: 'Unranked unknown', laneNote: '', smurfProbability: 0, approach: '' };
  }

  // WR-based
  if (wr >= 65) rating = 9;
  else if (wr >= 58) rating = 8;
  else if (wr >= 53) rating = 7;
  else if (wr >= 48) rating = 6;
  else if (wr >= 43) rating = 4;
  else if (wr >= 35) rating = 3;
  else rating = 2;

  // KDA modifier
  if (kda >= 5) rating = Math.min(10, rating + 1);
  else if (kda < 1.5) rating = Math.max(1, rating - 1);

  // Hot streak
  if (ps.hotStreak) rating = Math.min(10, rating + 1);

  // High elo floor
  const highTiers = ['MASTER', 'GRANDMASTER', 'CHALLENGER'];
  if (highTiers.includes(ps.tier)) rating = Math.max(7, rating);

  // Detect smurf
  let smurfProbability = 0;
  if (wr >= 65 && totalGames < 80) smurfProbability = 70;
  else if (wr >= 60 && kda >= 4) smurfProbability = 50;

  // Generate note
  let note = '';
  if (smurfProbability >= 50) note = 'Possible smurf, high impact';
  else if (wr >= 58) note = 'Strong consistent player';
  else if (wr >= 50) note = 'Average steady player';
  else if (wr < 45) note = 'Struggling, exploitable';
  else note = 'Standard player';

  return { rating: Math.min(10, Math.max(1, rating)), note, laneNote: '', smurfProbability, approach: '' };
}

async function runScoutingReport(gameData) {
  if (scoutingState.hasRun) return;
  scoutingState.hasRun = true;

  sendScoutDebug('[start] Starting scouting report...');

  // Open the scout window (if setting enabled)
  const scoutSettings = loadSettings();
  if (scoutSettings.autoOpenScout !== false) {
    createScoutWindow();
  }

  const players = gameData.allPlayers || [];
  const activePlayer = gameData.activePlayer;
  const myName = activePlayer?.summonerName || activePlayer?.riotId || '';

  const sendStatus = (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('scout-status', status);
    if (scoutWindow && !scoutWindow.isDestroyed()) scoutWindow.webContents.send('scout-status', status);
  };
  sendStatus({ phase: 'fetching', message: 'Fetching player data from Riot API...' });

  // Fetch stats for all 10 players
  const playerStats = [];
  for (const player of players) {
    const nameRaw = player.riotId || player.summonerName || '';
    const parts = nameRaw.split('#');
    const gameName = (parts[0] || '').trim();
    const tagLine = (parts[1] || 'EUW').trim();

    // Handle privacy/hidden players (empty game name)
    if (!gameName || gameName.length < 2) {
      sendScoutDebug(`[fetch] (hidden player) (${player.championName})...`);
      playerStats.push({
        riotId: `Hidden (${player.championName})`,
        championName: player.championName,
        team: player.team,
        isMe: false,
        level: 0, tier: 'HIDDEN', rank: '', lp: 0,
        wins: 0, losses: 0, winRate: 0, hotStreak: false,
        recentMatches: [],
      });
      continue;
    }

    sendScoutDebug(`[fetch] ${gameName}#${tagLine} (${player.championName})...`);
    const stats = await fetchPlayerScoutData(gameName, tagLine, player.championName);
    stats.championName = player.championName;
    stats.team = player.team;
    // Normalize for matching: strip #tag, lowercase, trim
    const normN = (n) => (n || '').split('#')[0].toLowerCase().trim();
    const myNorm = normN(myName);
    stats.isMe = normN(nameRaw) === myNorm || normN(gameName) === myNorm ||
      normN(player.summonerName) === normN(activePlayer?.summonerName || '') ||
      (myNorm.length >= 3 && (normN(nameRaw).includes(myNorm) || myNorm.includes(normN(nameRaw))));
    playerStats.push(stats);
  }

  sendScoutDebug(`[done] Fetched ${playerStats.length} player stats`);

  sendStatus({ phase: 'analyzing', message: 'AI is analyzing players...' });

  // Build richer AI prompt
  const formatStats = (ps) => {
    const soloLine = ps.soloQ
      ? `SoloQ: ${ps.soloQ.tier} ${ps.soloQ.rank} ${ps.soloQ.lp}LP | ${ps.soloQ.winRate}% WR (${ps.soloQ.wins}W/${ps.soloQ.losses}L)${ps.soloQ.hotStreak ? ' Ã°Å¸â€Â¥STREAK' : ''}`
      : 'SoloQ: Unranked';
    const flexLine = ps.flexQ
      ? `FlexQ: ${ps.flexQ.tier} ${ps.flexQ.rank} | ${ps.flexQ.winRate}% WR (${ps.flexQ.totalGames} games)`
      : '';
    const recentLine = ps.recentMatches.length > 0
      ? ps.recentMatches.map(m =>
          `${m.win ? 'W' : 'L'} ${m.champion} ${m.kills}/${m.deaths}/${m.assists} (${m.csPerMin}cs/m, ${m.gameDuration}min, ${m.role})`
        ).join(' | ')
      : 'No recent matches';
    const avgLine = ps.recentMatches.length > 0
      ? `Recent 5: ${ps.recentWinRate}% WR, ${ps.recentAvgKDA} KDA, ${ps.recentAvgCS} CS/min`
      : '';
    return [
      `${ps.riotId} Ã¢â‚¬â€ PLAYING: ${ps.championName} Ã¢â‚¬â€ Level ${ps.level}`,
      `  ${soloLine}`,
      flexLine ? `  ${flexLine}` : null,
      avgLine ? `  ${avgLine}` : null,
      `  Recent: ${recentLine}`,
    ].filter(Boolean).join('\n');
  };

  const myPlayer = playerStats.find(p => p.isMe);
  const myTeam = playerStats.filter(p => p.team === myPlayer?.team);
  const enemyTeam = playerStats.filter(p => p.team !== myPlayer?.team);

  const scoutPrompt = `You are an elite League of Legends scouting analyst. Analyze the loading screen data and return a STRICT JSON object.

DATA:
MY TEAM (I am ${myPlayer?.riotId || '?'} on ${myPlayer?.championName || '?'}):
${myTeam.map(formatStats).join('\n\n')}

ENEMY TEAM:
${enemyTeam.map(formatStats).join('\n\n')}

Return ONLY a valid JSON object with this EXACT structure (no markdown, no code blocks, just raw JSON):
{
  "players": [
    {
      "riotId": "<exact RiotID#TAG>",
      "threatLevel": <1-10 integer>,
      "playstyleTag": "<3-6 word playstyle, e.g. 'Aggressive all-in diver', 'KDA farmer avoids fights', 'Tilted inter', 'Smurf will 1v9', 'First time champion', 'Safe laner scales well'>",
      "laneNote": "<one-line laning tip if they lane against you, or general warning>",
      "smurfProbability": <0-100 integer>,
      "mentalState": "<MENTAL BOOM / TILTED / SHAKY / STABLE / LOCKED IN / ON FIRE Ã¢â‚¬â€ based on recent W/L pattern, death trends, game durations>"
    }
  ],
  "strategy": {
    "keyThreat": "<champion name + 5-word reason>",
    "weakLink": "<champion name + 5-word reason>",
    "focus": "<who to camp/target, 8 words max>",
    "avoid": "<who NOT to fight, 8 words max>",
    "laningPhase": "<10-word laning strategy>",
    "teamfightPlan": "<10-word teamfight strategy>",
    "objectivePriority": "<drake/baron/herald priority, 8 words max>",
    "winCondition": "<12-word max win condition>",
    "dangerLevel": "<LOW / MEDIUM / HIGH / EXTREME>"
  },
  "coachBriefing": "<3 sentences MAX. Write as a coach talking to the player. Explain THE most important thing about this game: who is the biggest threat, what's the win condition, and what to absolutely avoid. Use player names and champion names. Be direct and confident, like a real analyst. Example: 'Tough game Ã¢â‚¬â€ their Vayne is on a 7-game win streak with 73% WR, likely a smurf. Your best shot is snowballing top where their Garen has a 38% WR. Force early drakes and close before Vayne scales.'>",
  "winProbability": <0-100 integer, your honest estimated pre-game win probability based on all 10 players stats, ranks, winrates, hot streaks, and champion matchups. 50 = even, 20 = very hard, 80 = very easy>,
  "laneMatchup": {
    "myChamp": "${myPlayer?.championName || '?'}",
    "enemyChamp": "<the enemy champion most likely laning against me based on roles>",
    "earlyGame": "<who wins levels 1-6 and why, 10 words max>",
    "powerSpikes": "<key power spike comparison, e.g. 'You spike at 1 item, they spike at 2 items'>",
    "playTip": "<specific actionable tip for this matchup, 15 words max>",
    "dangerWindows": "<when the enemy is strongest, e.g. 'Level 6 all-in, 2-item spike at 20min'>"
  }
}

SCORING RULES for threatLevel (1-10):
- 1-2: Sub-40% WR, high deaths, first-timing, no data = free kill
- 3-4: Below average, 40-48% WR, inconsistent
- 5-6: Average, 48-52% WR, nothing special
- 7-8: Strong, 52-60% WR, good KDA, experienced
- 9-10: Carry threat, 60%+ WR, hot streak, smurf indicators, will 1v9
- Hot streak = +1, losing streak = -1, Challenger/Master = minimum 7
- If profile is hidden/no data, set threatLevel to 5, playstyleTag to "Hidden profile unknown", smurfProbability to 0

MENTAL STATE RULES:
- ON FIRE: 4+ win streak, high KDA, confidence plays
- LOCKED IN: 3 wins in last 4, consistent performance
- STABLE: mix of wins/losses, normal deaths
- SHAKY: 2-3 losses recently, slightly more deaths than usual
- TILTED: 3+ loss streak, increasing deaths per game
- MENTAL BOOM: 4+ loss streak, very high deaths, short game times (likely running it down or giving up)

IMPORTANT: Output ONLY the JSON object. No text before or after it.`;


  try {
    sendScoutDebug('[ai] Sending to DeepSeek via OpenRouter...');
    // Using DeepSeek V4 Flash via OpenRouter.


    const _rawText = await llmGenerate('You are a League of Legends expert analyst. Be concise and accurate.', scoutPrompt, { temperature: 0.2, maxTokens: 4096 });
    const text = _rawText;
    sendScoutDebug(`[ai] Response received (${text.length} chars)`);

    // Parse structured JSON response from AI
    let aiData = null;
    try {
      const cleanJson = text
        .replace(/^```(?:json)?[\s\n]*/i, '')
        .replace(/[\s\n]*```$/i, '')
        .trim();
      aiData = JSON.parse(cleanJson);
      sendScoutDebug(`[ai] Parsed JSON: ${aiData.players?.length || 0} players, strategy keys: ${Object.keys(aiData.strategy || {}).join(', ')}`);
    } catch (parseErr) {
      sendScoutDebug(`[ai] JSON parse failed, falling back to algorithmic scoring: ${parseErr.message}`);
    }

    // Build scout cards by matching AI data to playerStats
    const scoutCards = [];
    if (aiData && aiData.players && Array.isArray(aiData.players)) {
      const usedIndices = new Set();
      for (const aiPlayer of aiData.players) {
        const aiName = (aiPlayer.riotId || '').split('#')[0].toLowerCase().trim();
        let matchIdx = -1;
        if (aiName.length >= 2) {
          matchIdx = playerStats.findIndex((p, i) => {
            if (usedIndices.has(i)) return false;
            const pName = p.riotId.split('#')[0].toLowerCase().trim();
            return pName === aiName || pName.includes(aiName) || aiName.includes(pName);
          });
        }
        // Fallback: match by champion name
        if (matchIdx < 0 && aiPlayer.championName) {
          const aiChamp = aiPlayer.championName.toLowerCase().trim();
          matchIdx = playerStats.findIndex((p, i) => {
            if (usedIndices.has(i)) return false;
            return (p.championName || '').toLowerCase().trim() === aiChamp;
          });
        }
        if (matchIdx >= 0) {
          usedIndices.add(matchIdx);
          scoutCards.push({
            ...playerStats[matchIdx],
            rating: Math.min(10, Math.max(1, aiPlayer.threatLevel || 5)),
            note: aiPlayer.playstyleTag || '',
            laneNote: aiPlayer.laneNote || '',
            smurfProbability: aiPlayer.smurfProbability || 0,
            mentalState: aiPlayer.mentalState || 'STABLE',
            approach: '',
          });
        }
      }
      // Add any unmatched players with fallback scoring
      for (let i = 0; i < playerStats.length; i++) {
        if (!usedIndices.has(i)) {
          scoutCards.push({
            ...playerStats[i],
            ...computeFallbackRating(playerStats[i]),
          });
        }
      }
    } else {
      // Full fallback: no AI data, use algorithmic scoring
      for (const ps of playerStats) {
        scoutCards.push({ ...ps, ...computeFallbackRating(ps) });
      }
    }

    const strategy = aiData?.strategy || {};
    const gamePlan = strategy.winCondition || '';

    const report = {
      players: scoutCards,
      strategy,
      gamePlan: gamePlan || strategy.winCondition,
      coachBriefing: aiData?.coachBriefing || '',
      winProbability: aiData?.winProbability ?? 50,
      laneMatchup: aiData?.laneMatchup || null,
      rawText: text,
      timestamp: Date.now(),
    };

    sendScoutDebug(`[done] Scouting report ready: ${scoutCards.length} players analyzed`);

    cachedScoutReport = report;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scout-report', report);
      mainWindow.webContents.send('scout-status', { phase: 'done', message: 'Scouting report ready!' });
    }
    if (scoutWindow && !scoutWindow.isDestroyed()) {
      scoutWindow.webContents.send('scout-report', report);
      scoutWindow.webContents.send('scout-status', { phase: 'done', message: 'Scouting report ready!' });
    }
  } catch (err) {
    sendScoutDebug(`[error] AI analysis failed: ${err.message}`);
    // Still send the raw stats even if AI fails
    const fallbackReport = {
      players: playerStats.map(p => ({ ...p, ...computeFallbackRating(p) })),
      strategy: {},
      gamePlan: 'AI analysis unavailable',
      rawText: '',
      timestamp: Date.now(),
    };
    cachedScoutReport = fallbackReport;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scout-report', fallbackReport);
      mainWindow.webContents.send('scout-status', { phase: 'done', message: 'Stats loaded (AI unavailable)' });
    }
    if (scoutWindow && !scoutWindow.isDestroyed()) {
      scoutWindow.webContents.send('scout-report', fallbackReport);
      scoutWindow.webContents.send('scout-status', { phase: 'done', message: 'Stats loaded (AI unavailable)' });
    }
  }
}


// IPC: manually trigger scouting
ipcMain.handle('scout-trigger', async () => {
  const gameData = await fetchLiveClientData();
  if (!gameData) return { ok: false, error: 'No game detected' };
  scoutingState.hasRun = false;
  runScoutingReport(gameData);
  return { ok: true };
});

ipcMain.handle('scout-reset', async () => {
  scoutingState.hasRun = false;
  scoutingState.gameId = null;
  cachedScoutReport = null;
  return { ok: true };
});

ipcMain.handle('scout-get-cached', async () => {
  return cachedScoutReport || null;
});

ipcMain.handle('open-scout-window', async () => {
  createScoutWindow();
  return { ok: true };
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Scoreboard & Cooldown IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
ipcMain.handle('open-scoreboard-window', async () => {
  createScoreboardWindow();
  startScoreboardPolling();
  return { ok: true };
});

ipcMain.handle('get-ddragon-version', async () => {
  return await ensureDdragonVersion();
});

ipcMain.handle('cooldown-start', async (_e, { championName, ability }) => {
  const timer = await startCooldownTimer(championName, ability);
  return timer ? { ok: true, timer } : { ok: false, error: 'Could not start timer' };
});

ipcMain.handle('cooldown-reset', async (_e, { timerId }) => {
  cooldownTimers = cooldownTimers.filter(t => t.id !== timerId);
  tickCooldowns(); // Broadcast removal immediately
  return { ok: true };
});

// Scoreboard window controls (from renderer)
ipcMain.on('scoreboard-win-hide', () => {
  if (scoreboardWindow && !scoreboardWindow.isDestroyed()) {
    scoreboardWindow.hide();
  }
});

ipcMain.on('scoreboard-win-minimize', () => {
  if (scoreboardWindow && !scoreboardWindow.isDestroyed()) {
    scoreboardWindow.minimize();
  }
});

// Toggle overlay click-through: renderer tells us when mouse enters/leaves interactive areas
ipcMain.on('overlay-set-ignore-mouse', (_e, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (ignore) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  }
});

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã¢â€â‚¬Ã¢â€â‚¬ Stats/Profile Window Data Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

// Champion name Ã¢â€ â€™ DDragon filename normalization
const CHAMP_NAME_MAP = {
  'Wukong': 'MonkeyKing',
  'FiddleSticks': 'Fiddlesticks',
  'Nunu & Willump': 'Nunu',
  'Renata Glasc': 'Renata',
  'Bel\'Veth': 'Belveth',
  'K\'Sante': 'KSante',
  'Kai\'Sa': 'Kaisa',
  'Kha\'Zix': 'Khazix',
  'Cho\'Gath': 'Chogath',
  'Vel\'Koz': 'Velkoz',
  'Rek\'Sai': 'RekSai',
  'Kog\'Maw': 'KogMaw',
  'LeBlanc': 'Leblanc',
};

function normChampName(name) {
  if (CHAMP_NAME_MAP[name]) return CHAMP_NAME_MAP[name];
  return (name || '').replace(/[\s'.]/g, '');
}

// DDragon version cache
let cachedDdragonVer = '15.1.1';
async function getDdragonVersion() {
  try {
    const fetch = require('node-fetch');
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await res.json();
    if (versions && versions.length > 0) cachedDdragonVer = versions[0];
  } catch (e) { /* keep cached */ }
  return cachedDdragonVer;
}

function champIconUrl(champName) {
  const norm = normChampName(champName);
  return `https://ddragon.leagueoflegends.com/cdn/${cachedDdragonVer}/img/champion/${norm}.png`;
}

async function fetchMyStats() {
  await getDdragonVersion();
  const region = process.env.RIOT_REGION || 'euw1';
  const regionV5 = process.env.RIOT_REGION_V5 || 'europe';

  // Try to get summoner from LCU first
  let summonerName = '', tagLine = '', puuid = '';
  try {
    const lcuCreds = getLcuCredentials();
    if (lcuCreds) {
      const lcuFetch = require('node-fetch');
      const authStr = Buffer.from(`riot:${lcuCreds.password}`).toString('base64');
      const sumRes = await lcuFetch(`https://127.0.0.1:${lcuCreds.port}/lol-summoner/v1/current-summoner`, {
        headers: { 'Authorization': `Basic ${authStr}` },
        agent: new (require('https').Agent)({ rejectUnauthorized: false }),
      });
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        summonerName = sumData.gameName || sumData.displayName || '';
        tagLine = sumData.tagLine || 'EUW';
        log('INFO', `[stats] Got summoner from LCU: ${summonerName}#${tagLine}`);
      }
    }
  } catch (e) {
    log('WARN', `[stats] LCU detection failed: ${e.message}`);
  }

  if (!summonerName) {
    throw new Error('Could not detect summoner. Make sure League Client is running.');
  }

  // Get PUUID
  const account = await riotApiGet(
    `https://${regionV5}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tagLine)}`
  );
  puuid = account.puuid;

  // Get summoner data (may fail with 403 on dev keys)
  let summoner = { summonerLevel: 0, profileIconId: 1, id: '' };
  try {
    summoner = await riotApiGet(`https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  } catch (e) {
    log('WARN', `[stats] Summoner v4 failed (${e.message}) Ã¢â‚¬â€ some features unavailable`);
  }

  // Get ranked data via PUUID (summoner.id is deprecated)
  let soloQ = {}, flexQ = {};
  try {
    const rankedData = await riotApiGet(`https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
    soloQ = rankedData.find(r => r.queueType === 'RANKED_SOLO_5x5') || {};
    flexQ = rankedData.find(r => r.queueType === 'RANKED_FLEX_SR') || {};
  } catch (e) {
    log('WARN', `[stats] League v4 failed (${e.message}) Ã¢â‚¬â€ rank data unavailable`);
  }

  // Get match IDs (last 15)
  let matchIds = [];
  try {
    matchIds = await riotApiGet(
      `https://${regionV5}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=30`
    );
  } catch (e) {
    log('WARN', `[stats] Match history failed: ${e.message}`);
    if (e.message.includes('403')) {
      throw new Error('Your Riot API key does not have access to match history. You need a production key or a key with the right scopes. Dev keys from developer.riotgames.com expire every 24h and may not have match-v5 access.');
    }
    throw e;
  }

  // Fetch each match
  const matches = [];
  const champStats = {}; // { champName: { games, wins, kills, deaths, assists } }

  for (const matchId of matchIds) {
    try {
      const match = await riotApiGet(`https://${regionV5}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
      const info = match.info;
      const me = info.participants.find(p => p.puuid === puuid);
      if (!me) continue;

      const duration = info.gameDuration;
      const durationMin = duration / 60;

      // Team-relative stats
      const myTeamId = me.teamId;
      const myTeam = info.participants.filter(p => p.teamId === myTeamId);
      const enemyTeam = info.participants.filter(p => p.teamId !== myTeamId);

      const teamKills = myTeam.reduce((a, p) => a + p.kills, 0) || 1;
      const teamDmg = myTeam.reduce((a, p) => a + p.totalDamageDealtToChampions, 0) || 1;
      const teamGold = myTeam.reduce((a, p) => a + p.goldEarned, 0) || 1;
      const allDpm = info.participants.map(p => p.totalDamageDealtToChampions / durationMin);
      const avgDpm = allDpm.reduce((a, b) => a + b, 0) / allDpm.length;
      const myDpm = me.totalDamageDealtToChampions / durationMin;

      // Kill Participation, Damage Share, Gold Share
      const kp = Math.round(((me.kills + me.assists) / teamKills) * 100);
      const dmgShare = Math.round((me.totalDamageDealtToChampions / teamDmg) * 100);
      const goldShare = Math.round((me.goldEarned / teamGold) * 100);
      const isTopDmg = myTeam.every(p => me.totalDamageDealtToChampions >= p.totalDamageDealtToChampions);

      // Time ago
      const gameEnd = info.gameEndTimestamp || (info.gameCreation + duration * 1000);
      const hoursAgo = Math.floor((Date.now() - gameEnd) / 3600000);
      const timeAgo = hoursAgo < 1 ? 'Just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`;
      const gameTimestamp = gameEnd;

      const normChamp = normChampName(me.championName);

      // Build all participants data for scoreboard
      const buildPlayer = (p) => {
        const tKills = info.participants.filter(x => x.teamId === p.teamId).reduce((a, x) => a + x.kills, 0) || 1;
        return {
          championName: p.championName,
          champIcon: champIconUrl(p.championName),
          summonerName: p.riotIdGameName || p.summonerName || '?',
          kills: p.kills, deaths: p.deaths, assists: p.assists,
          cs: p.totalMinionsKilled + (p.neutralMinionsKilled || 0),
          csMin: (((p.totalMinionsKilled + (p.neutralMinionsKilled || 0)) / durationMin) || 0).toFixed(1),
          dpm: Math.round(p.totalDamageDealtToChampions / durationMin),
          damage: p.totalDamageDealtToChampions,
          gold: p.goldEarned,
          goldMin: ((p.goldEarned || 0) / durationMin).toFixed(0),
          vision: p.visionScore || 0,
          kp: Math.round(((p.kills + p.assists) / tKills) * 100),
          isMe: p.puuid === puuid,
          teamId: p.teamId,
        };
      };

      const allPlayers = info.participants.map(buildPlayer);
      const myTeamPlayers = allPlayers.filter(p => p.teamId === myTeamId);
      const enemyPlayers = allPlayers.filter(p => p.teamId !== myTeamId);

      const isRemake = me.gameEndedInEarlySurrender || duration < 300;

      matches.push({
        championName: me.championName,
        champIcon: champIconUrl(me.championName),
        win: me.win,
        remake: isRemake,
        kills: me.kills,
        deaths: me.deaths,
        assists: me.assists,
        cs: me.totalMinionsKilled + (me.neutralMinionsKilled || 0),
        csMin: (((me.totalMinionsKilled + (me.neutralMinionsKilled || 0)) / durationMin) || 0).toFixed(1),
        dpm: Math.round(myDpm),
        avgDpm: Math.round(avgDpm),
        visionScore: me.visionScore || 0,
        goldEarned: me.goldEarned || 0,
        goldMin: ((me.goldEarned || 0) / durationMin).toFixed(0),
        duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
        gameMode: info.queueId === 420 ? 'Ranked' : info.queueId === 440 ? 'Flex' : info.queueId === 450 ? 'ARAM' : info.queueId === 400 ? 'Draft' : 'Normal',
        timeAgo,
        kp, dmgShare, goldShare, isTopDmg,
        gameTimestamp,
        queueId: info.queueId,
        myTeam: myTeamPlayers,
        enemyTeam: enemyPlayers,
        aiScore: 0, isMvp: false, isLvp: false,
      });

      // Champion stats aggregation
      const cn = me.championName;
      if (!isRemake) {
        if (!champStats[cn]) champStats[cn] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
        champStats[cn].games++;
        if (me.win) champStats[cn].wins++;
        champStats[cn].kills += me.kills;
        champStats[cn].deaths += me.deaths;
        champStats[cn].assists += me.assists;
      }
    } catch (e) {
      log('WARN', `[stats] Error fetching match ${matchId}: ${e.message}`);
    }
  }

  // Build champion pool
  const champPool = Object.entries(champStats)
    .map(([name, s]) => {
      return {
        name,
        icon: champIconUrl(name),
        games: s.games,
        winRate: Math.round((s.wins / s.games) * 100),
        kda: s.deaths === 0 ? s.kills + s.assists : parseFloat(((s.kills + s.assists) / s.deaths).toFixed(2)),
      };
    })
    .sort((a, b) => b.games - a.games);

  // Get DDragon version for champ icons
  let ver = '15.1.1';
  try {
    const nodeFetch = require('node-fetch');
    const verRes = await nodeFetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await verRes.json();
    ver = versions[0] || ver;
    for (const m of matches) {
      const normName = m.championName.replace(/[\s'.]/g, '');
      m.champIcon = `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${normName}.png`;
    }
    for (const c of champPool) {
      const normName = c.name.replace(/[\s'.]/g, '');
      c.icon = `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${normName}.png`;
    }
  } catch (e) { /* use fallback version */ }

  const rank = {
    tier: soloQ.tier || 'UNRANKED',
    rank: soloQ.rank || '',
    lp: soloQ.leaguePoints || 0,
    wins: soloQ.wins || 0,
    losses: soloQ.losses || 0,
    winRate: (soloQ.wins && (soloQ.wins + soloQ.losses) > 0)
      ? Math.round((soloQ.wins / (soloQ.wins + soloQ.losses)) * 100) : 0,
  };

  const flexRank = {
    tier: flexQ.tier || 'UNRANKED',
    rank: flexQ.rank || '',
    lp: flexQ.leaguePoints || 0,
    wins: flexQ.wins || 0,
    losses: flexQ.losses || 0,
    winRate: (flexQ.wins && (flexQ.wins + flexQ.losses) > 0)
      ? Math.round((flexQ.wins / (flexQ.wins + flexQ.losses)) * 100) : 0,
  };

  // Build LP history from match results (reconstruct backwards from current LP)
  const TIER_LP = { IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 3200, CHALLENGER: 3600 };
  const RANK_LP = { IV: 0, III: 100, II: 200, I: 300 };
  const tierToAbsLP = (tier, rk, lp) => (TIER_LP[tier] || 0) + (RANK_LP[rk] || 0) + (lp || 0);
  const absToTierRank = (absLp) => {
    const tiers = ['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER'];
    const ranks = ['IV','III','II','I'];
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (absLp >= TIER_LP[tiers[i]]) {
        const remaining = absLp - TIER_LP[tiers[i]];
        const ri = Math.min(3, Math.floor(remaining / 100));
        return { tier: tiers[i], rank: ranks[ri], lp: remaining % 100 };
      }
    }
    return { tier: 'IRON', rank: 'IV', lp: 0 };
  };

  // Solo Q LP history
  let currentAbsLP = tierToAbsLP(rank.tier, rank.rank, rank.lp);
  const soloMatches = matches.filter(m => m.queueId === 420).sort((a, b) => b.gameTimestamp - a.gameTimestamp);
  const soloLpHistory = [{ ts: Date.now(), absLp: currentAbsLP, ...absToTierRank(currentAbsLP) }];
  let soloCursor = currentAbsLP;
  for (const m of soloMatches) {
    soloCursor += m.win ? -22 : 18; // reverse: if won, subtract gain; if lost, add loss
    soloCursor = Math.max(0, soloCursor);
    soloLpHistory.push({ ts: m.gameTimestamp, absLp: soloCursor, ...absToTierRank(soloCursor) });
  }
  soloLpHistory.reverse();

  // Flex Q LP history
  let flexCurrentAbsLP = tierToAbsLP(flexRank.tier, flexRank.rank, flexRank.lp);
  const flexMatches = matches.filter(m => m.queueId === 440).sort((a, b) => b.gameTimestamp - a.gameTimestamp);
  const flexLpHistory = [{ ts: Date.now(), absLp: flexCurrentAbsLP, ...absToTierRank(flexCurrentAbsLP) }];
  let flexCursor = flexCurrentAbsLP;
  for (const m of flexMatches) {
    flexCursor += m.win ? -22 : 18;
    flexCursor = Math.max(0, flexCursor);
    flexLpHistory.push({ ts: m.gameTimestamp, absLp: flexCursor, ...absToTierRank(flexCursor) });
  }
  flexLpHistory.reverse();

  return {
    summoner: {
      name: summonerName,
      tag: tagLine,
      level: summoner.summonerLevel || 0,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ver || '15.1.1'}/img/profileicon/${summoner.profileIconId || 1}.png`,
    },
    rank,
    flexRank,
    soloLpHistory,
    flexLpHistory,
    matchHistory: matches,
    champPool,
  };
}

// Fetch another player's stats by name#tag (no AI, no LP history)
async function fetchPlayerStats(name, tag) {
  const region = process.env.RIOT_REGION || 'euw1';
  const regionV5 = process.env.RIOT_REGION_V5 || 'europe';

  log('INFO', `[player-stats] Fetching stats for ${name}#${tag}`);

  const account = await riotApiGet(
    `https://${regionV5}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
  );
  const puuid = account.puuid;

  let summoner = { summonerLevel: 0, profileIconId: 1 };
  try {
    summoner = await riotApiGet(`https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  } catch (e) { log('WARN', `[player-stats] Summoner v4 failed: ${e.message}`); }

  let soloQ = {}, flexQ = {};
  try {
    const rankedData = await riotApiGet(`https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
    soloQ = rankedData.find(r => r.queueType === 'RANKED_SOLO_5x5') || {};
    flexQ = rankedData.find(r => r.queueType === 'RANKED_FLEX_SR') || {};
  } catch (e) { log('WARN', `[player-stats] League v4 failed: ${e.message}`); }

  let matchIds = [];
  try {
    matchIds = await riotApiGet(
      `https://${regionV5}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=30`
    );
  } catch (e) {
    log('WARN', `[player-stats] Match history failed: ${e.message}`);
    throw e;
  }

  const matches = [];
  const champStats = {};

  for (const matchId of matchIds) {
    try {
      const match = await riotApiGet(`https://${regionV5}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
      const info = match.info;
      const me = info.participants.find(p => p.puuid === puuid);
      if (!me) continue;

      const duration = info.gameDuration;
      const durationMin = duration / 60;
      const myTeamId = me.teamId;
      const myTeam = info.participants.filter(p => p.teamId === myTeamId);
      const teamKills = myTeam.reduce((a, p) => a + p.kills, 0) || 1;
      const teamDmg = myTeam.reduce((a, p) => a + p.totalDamageDealtToChampions, 0) || 1;
      const teamGold = myTeam.reduce((a, p) => a + p.goldEarned, 0) || 1;
      const allDpm = info.participants.map(p => p.totalDamageDealtToChampions / durationMin);
      const avgDpm = allDpm.reduce((a, b) => a + b, 0) / allDpm.length;
      const myDpm = me.totalDamageDealtToChampions / durationMin;
      const kp = Math.round(((me.kills + me.assists) / teamKills) * 100);
      const dmgShare = Math.round((me.totalDamageDealtToChampions / teamDmg) * 100);
      const goldShare = Math.round((me.goldEarned / teamGold) * 100);
      const isTopDmg = myTeam.every(p => me.totalDamageDealtToChampions >= p.totalDamageDealtToChampions);
      const gameEnd = info.gameEndTimestamp || (info.gameCreation + duration * 1000);
      const hoursAgo = Math.floor((Date.now() - gameEnd) / 3600000);
      const timeAgo = hoursAgo < 1 ? 'Just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`;
      const normChamp = normChampName(me.championName);

      // Build scoreboard players
      const buildPlayer = (p) => {
        const tKills = info.participants.filter(x => x.teamId === p.teamId).reduce((a, x) => a + x.kills, 0) || 1;
        return {
          championName: p.championName,
          champIcon: champIconUrl(p.championName),
          summonerName: p.riotIdGameName || p.summonerName || '?',
          kills: p.kills, deaths: p.deaths, assists: p.assists,
          cs: p.totalMinionsKilled + (p.neutralMinionsKilled || 0),
          damage: p.totalDamageDealtToChampions,
          gold: p.goldEarned,
          vision: p.visionScore || 0,
          kp: Math.round(((p.kills + p.assists) / tKills) * 100),
          isMe: p.puuid === puuid,
          teamId: p.teamId,
        };
      };
      const allPlayers = info.participants.map(buildPlayer);
      const myTeamPlayers = allPlayers.filter(p => p.teamId === myTeamId);
      const enemyPlayers = allPlayers.filter(p => p.teamId !== myTeamId);

      const isRemake = me.gameEndedInEarlySurrender || duration < 300;

      matches.push({
        championName: me.championName,
        champIcon: champIconUrl(me.championName),
        win: me.win, remake: isRemake, kills: me.kills, deaths: me.deaths, assists: me.assists,
        cs: me.totalMinionsKilled + (me.neutralMinionsKilled || 0),
        csMin: (((me.totalMinionsKilled + (me.neutralMinionsKilled || 0)) / durationMin) || 0).toFixed(1),
        dpm: Math.round(myDpm), avgDpm: Math.round(avgDpm),
        visionScore: me.visionScore || 0, goldEarned: me.goldEarned || 0,
        goldMin: ((me.goldEarned || 0) / durationMin).toFixed(0),
        duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
        gameMode: info.queueId === 420 ? 'Ranked' : info.queueId === 440 ? 'Flex' : info.queueId === 450 ? 'ARAM' : info.queueId === 400 ? 'Draft' : 'Normal',
        timeAgo, kp, dmgShare, goldShare, isTopDmg,
        gameTimestamp: gameEnd, queueId: info.queueId,
        myTeam: myTeamPlayers, enemyTeam: enemyPlayers,
        aiScore: 0, isMvp: false, isLvp: false,
      });

      const cn = me.championName;
      if (!isRemake) {
        if (!champStats[cn]) champStats[cn] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
        champStats[cn].games++;
        if (me.win) champStats[cn].wins++;
        champStats[cn].kills += me.kills;
        champStats[cn].deaths += me.deaths;
        champStats[cn].assists += me.assists;
      }
    } catch (e) {
      log('WARN', `[player-stats] Error fetching match ${matchId}: ${e.message}`);
    }
  }

  const champPool = Object.entries(champStats)
    .map(([cname, s]) => {
      return {
        name: cname,
        icon: champIconUrl(cname),
        games: s.games,
        winRate: Math.round((s.wins / s.games) * 100),
        kda: s.deaths === 0 ? s.kills + s.assists : parseFloat(((s.kills + s.assists) / s.deaths).toFixed(2)),
      };
    })
    .sort((a, b) => b.games - a.games);

  // LP history reconstruction
  const TIER_LP = { IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 3200, CHALLENGER: 3600 };
  const RANK_LP = { IV: 0, III: 100, II: 200, I: 300 };
  const tierToAbsLP = (tier, rk, lp) => (TIER_LP[tier] || 0) + (RANK_LP[rk] || 0) + (lp || 0);
  const absToTierRank = (absLp) => {
    const tiers = ['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER'];
    const ranks = ['IV','III','II','I'];
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (absLp >= TIER_LP[tiers[i]]) { const rem = absLp - TIER_LP[tiers[i]]; const ri = Math.min(3, Math.floor(rem / 100)); return { tier: tiers[i], rank: ranks[ri], lp: rem % 100 }; }
    }
    return { tier: 'IRON', rank: 'IV', lp: 0 };
  };
  const soloRank = { tier: soloQ.tier || 'UNRANKED', rank: soloQ.rank || '', lp: soloQ.leaguePoints || 0, wins: soloQ.wins || 0, losses: soloQ.losses || 0, winRate: (soloQ.wins && (soloQ.wins + soloQ.losses) > 0) ? Math.round((soloQ.wins / (soloQ.wins + soloQ.losses)) * 100) : 0 };
  const flexRankObj = { tier: flexQ.tier || 'UNRANKED', rank: flexQ.rank || '', lp: flexQ.leaguePoints || 0, wins: flexQ.wins || 0, losses: flexQ.losses || 0, winRate: (flexQ.wins && (flexQ.wins + flexQ.losses) > 0) ? Math.round((flexQ.wins / (flexQ.wins + flexQ.losses)) * 100) : 0 };

  let soloLpHistory = [], flexLpHistory = [];
  if (soloRank.tier !== 'UNRANKED') {
    let cur = tierToAbsLP(soloRank.tier, soloRank.rank, soloRank.lp);
    const sm = matches.filter(m => m.queueId === 420).sort((a, b) => b.gameTimestamp - a.gameTimestamp);
    soloLpHistory = [{ ts: Date.now(), absLp: cur, ...absToTierRank(cur) }];
    for (const m of sm) { cur -= (m.win ? 22 : -18); soloLpHistory.unshift({ ts: m.gameTimestamp, absLp: cur, ...absToTierRank(cur) }); }
  }
  if (flexRankObj.tier !== 'UNRANKED') {
    let cur = tierToAbsLP(flexRankObj.tier, flexRankObj.rank, flexRankObj.lp);
    const fm = matches.filter(m => m.queueId === 440).sort((a, b) => b.gameTimestamp - a.gameTimestamp);
    flexLpHistory = [{ ts: Date.now(), absLp: cur, ...absToTierRank(cur) }];
    for (const m of fm) { cur -= (m.win ? 22 : -18); flexLpHistory.unshift({ ts: m.gameTimestamp, absLp: cur, ...absToTierRank(cur) }); }
  }

  // Update DDragon version
  try {
    const nodeFetch = require('node-fetch');
    const verRes = await nodeFetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await verRes.json();
    const ver = versions[0] || '15.1.1';
    for (const m of matches) { m.champIcon = `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${m.championName.replace(/[\s'.]/g, '')}.png`; }
    for (const c of champPool) { c.icon = `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${c.name.replace(/[\s'.]/g, '')}.png`; }
    return {
      summoner: { name, tag, level: summoner.summonerLevel || 0, iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ver}/img/profileicon/${summoner.profileIconId || 1}.png` },
      rank: soloRank, flexRank: flexRankObj,
      soloLpHistory, flexLpHistory,
      matchHistory: matches, champPool,
    };
  } catch (e) {
    return {
      summoner: { name, tag, level: summoner.summonerLevel || 0, iconUrl: `https://ddragon.leagueoflegends.com/cdn/15.1.1/img/profileicon/${summoner.profileIconId || 1}.png` },
      rank: soloRank, flexRank: flexRankObj,
      soloLpHistory, flexLpHistory,
      matchHistory: matches, champPool,
    };
  }
}

ipcMain.handle('fetch-player-stats', async (_e, name, tag) => {
  try {
    return await fetchPlayerStats(name, tag || 'EUW');
  } catch (err) {
    throw new Error(err.message || 'Failed to fetch player stats');
  }
});

async function analyzeMyStats(statsData) {
  try {
    // Using DeepSeek V4 Flash via OpenRouter.



    const matchSummary = statsData.matchHistory.map((m, i) =>
      `${i + 1}. ${m.championName} ${m.win ? 'WIN' : 'LOSS'} | KDA:${m.kills}/${m.deaths}/${m.assists} | KP:${m.kp || '?'}% | CS/m:${m.csMin} | DPM:${m.dpm}(avg:${m.avgDpm}) | DmgShare:${m.dmgShare || '?'}% | GoldShare:${m.goldShare || '?'}% | Vis:${m.visionScore} | ${m.isTopDmg ? 'TOP DMG' : ''} | ${m.duration} ${m.gameMode}`
    ).join('\n');

    const winCount = statsData.matchHistory.filter(m => m.win).length;
    const lossCount = statsData.matchHistory.length - winCount;
    const avgKda = statsData.matchHistory.length > 0
      ? ((statsData.matchHistory.reduce((a, m) => a + m.kills + m.assists, 0)) / Math.max(1, statsData.matchHistory.reduce((a, m) => a + m.deaths, 0))).toFixed(2)
      : '0';

    const prompt = `You are an elite League of Legends performance analyst. Analyze with surgical precision based on the DATA.

PLAYER: ${statsData.rank.tier} ${statsData.rank.rank} (${statsData.rank.lp} LP) | ${statsData.rank.wins}W ${statsData.rank.losses}L (${statsData.rank.winRate}% WR)
RECENT RECORD: ${winCount}W ${lossCount}L in last ${statsData.matchHistory.length} games | Avg KDA: ${avgKda}

MATCH DATA:
${matchSummary}

CHAMPION POOL: ${statsData.champPool.slice(0, 5).map(c => `${c.name}(${c.games}g ${c.winRate}%WR ${c.kda}KDA)`).join(', ')}

Return ONLY a valid JSON object (no markdown, no code blocks, just raw JSON):
{
  "scores": [<score per game, 1-10 integer, in order>],
  "mvpGames": [<game numbers (1-indexed) where player hard-carried>],
  "lvpGames": [<game numbers where player was worst performer>],
  "performanceGrade": "<S+ / S / A / B / C / D / F based on overall recent performance>",
  "gradeExplanation": "<8 words max explaining the grade>",
  "queueHealth": "<Winners Queue / Losers Queue / Coinflip / Stable>",
  "consistency": "<Rock Solid / Steady / Inconsistent / Coinflip / Tilted>",
  "tip": "<one specific, actionable improvement tip, 15 words max>",
  "improvementAreas": ["<area1>", "<area2>"],
  "strengthAreas": ["<strength1>", "<strength2>"],
  "mentalState": "<MENTAL BOOM / TILTED / SHAKY / STABLE / LOCKED IN / ON FIRE Ã¢â‚¬â€ based on recent W/L pattern and death trends>",
  "champRatings": {
    "<championName>": { "grade": "<S+/S/A/B/C/D/F>", "note": "<4-8 word strength/weakness note>" }
  }
}

SCORING CRITERIA per game:
- 9-10: Hard carry, high KP, top damage, low deaths
- 7-8: Strong, good KDA, DmgShare>25%, KP>60%
- 5-6: Average, did your job, nothing special
- 3-4: Below average, high deaths, low KP/DmgShare, got carried
- 1-2: Inted, extremely negative KDA, lowest team impact

GRADE CRITERIA:
- S+: 8+ avg score, dominant carry across all games
- S: 7-8 avg score, consistently strong
- A: 6-7 avg, solid performance with some highs
- B: 5-6 avg, average player doing their job
- C: 4-5 avg, below average, needs improvement
- D: 3-4 avg, consistently underperforming
- F: <3 avg, actively losing games

WIN with bad stats = got carried, not a good score. LOSS with great stats can still be 7-8/10.`;

    const _rawText = await llmGenerate('You are a League of Legends expert analyst. Be concise and accurate.', prompt, { temperature: 0.2, maxTokens: 4096 });
    const text = _rawText;

    // Parse structured JSON
    let aiResult = null;
    try {
      const cleanJson = text.replace(/^\`\`\`(?:json)?[\s\n]*/i, '').replace(/[\s\n]*\`\`\`$/i, '').trim();
      aiResult = JSON.parse(cleanJson);
    } catch {
      // Fallback to regex if JSON fails
      const scoresMatch = text.match(/SCORES:\s*([0-9,\s]+)/i);
      const scores = scoresMatch ? scoresMatch[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
      const getLine = (label) => { const rx = new RegExp('(?:^|\\n)' + label + '[:\\s]*(.+)', 'i'); const m = text.match(rx); return m ? m[1].trim() : ''; };
      aiResult = {
        scores,
        mvpGames: (text.match(/MVP:\s*([0-9,\s]+)/i)?.[1] || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
        lvpGames: (text.match(/LVP:\s*([0-9,\s]+)/i)?.[1] || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
        performanceGrade: getLine('GRADE') || 'B',
        gradeExplanation: '',
        queueHealth: getLine('QUEUE') || 'Unknown',
        consistency: getLine('CONSISTENCY') || 'Unknown',
        tip: getLine('TIP') || '',
        improvementAreas: [],
        strengthAreas: [],
      };
    }

    // Apply scores to matches
    const scores = aiResult.scores || [];
    const mvpGames = aiResult.mvpGames || [];
    const lvpGames = aiResult.lvpGames || [];
    for (let i = 0; i < statsData.matchHistory.length; i++) {
      statsData.matchHistory[i].aiScore = scores[i] || 5;
      statsData.matchHistory[i].isMvp = mvpGames.includes(i + 1);
      statsData.matchHistory[i].isLvp = lvpGames.includes(i + 1);
    }

    const queue = aiResult.queueHealth || 'Unknown';
    const consistency = aiResult.consistency || 'Unknown';
    const queueColor = queue.includes('Winner') ? '#4dc66a' : queue.includes('Loser') ? '#e74c3c' : queue.includes('Coinflip') ? '#e67e22' : '#c8aa6e';
    const consColor = consistency.includes('Solid') || consistency.includes('Steady') ? '#4dc66a' : consistency.includes('Inconsistent') || consistency.includes('Coinflip') ? '#e67e22' : consistency.includes('Tilted') ? '#e74c3c' : '#c8aa6e';

    // Grade color
    const grade = aiResult.performanceGrade || 'B';
    const gradeColor = grade.startsWith('S') ? '#FFD700' : grade === 'A' ? '#4dc66a' : grade === 'B' ? '#5b9ef6' : grade === 'C' ? '#e67e22' : '#e74c3c';

    return {
      queueHealth: queue,
      queueColor,
      consistency,
      consistencyColor: consColor,
      tip: aiResult.tip || '',
      performanceGrade: grade,
      gradeExplanation: aiResult.gradeExplanation || '',
      gradeColor,
      improvementAreas: aiResult.improvementAreas || [],
      strengthAreas: aiResult.strengthAreas || [],
      mentalState: aiResult.mentalState || 'STABLE',
      champRatings: aiResult.champRatings || {},
    };
  } catch (e) {
    log('WARN', `[stats-ai] Error: ${e.message}`);
    return null;
  }
}

// Single-game AI analysis cache
let lastStatsData = null;

ipcMain.handle('fetch-my-stats', async () => {
  const sendStatsLog = (msg) => {
    if (statsWindow && !statsWindow.isDestroyed()) statsWindow.webContents.send('stats-log', msg);
  };
  try {
    sendStatsLog('Fetching summoner data...');
    const statsData = await fetchMyStats();
    lastStatsData = statsData;
    sendStatsLog(`Got ${statsData.matchHistory.length} matches, rank: ${statsData.rank?.tier || 'N/A'}`);
    sendStatsLog('Running AI analysis...');
    const aiAnalysis = await analyzeMyStats(statsData);
    statsData.aiAnalysis = aiAnalysis;
    sendStatsLog('AI analysis complete.');

    if (statsWindow && !statsWindow.isDestroyed()) {
      statsWindow.webContents.send('stats-data', statsData);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stats-data', statsData);
    }
    return statsData;
  } catch (err) {
    const msg = err.message || 'Unknown error';
    if (statsWindow && !statsWindow.isDestroyed()) {
      statsWindow.webContents.send('stats-error', msg);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stats-error', msg);
    }
    throw err;
  }
});

ipcMain.handle('analyze-single-game', async (_event, gameIndex) => {
  try {
    let stats = lastStatsData;
    if (!stats) { stats = await fetchMyStats(); lastStatsData = stats; }

    const m = stats.matchHistory[gameIndex];
    if (!m) return JSON.stringify({ error: 'Game not found.' });

    const prompt = `Analyze this League of Legends game:
Champion: ${m.championName || 'Unknown'} | Role: ${m.individualPosition || m.teamPosition || 'Unknown'}
Result: ${m.win ? 'Victory' : 'Defeat'} | KDA: ${m.kills}/${m.deaths}/${m.assists}
CS: ${m.totalMinionsKilled + (m.neutralMinionsKilled || 0)} | Gold: ${m.goldEarned}
Game Duration: ${Math.round((m.gameDuration || 0) / 60)}min
Damage Dealt: ${m.totalDamageDealtToChampions} | Damage Taken: ${m.totalDamageTaken}
Vision Score: ${m.visionScore || 0}
Items: ${(m.items || []).filter(Boolean).join(', ') || 'N/A'}

Provide a concise analysis (3-5 bullet points) covering:
1. Performance assessment (KDA, CS/min, damage contribution)
2. What went well
3. What could be improved
4. Specific actionable tip for next time`;

    const analysis = await llmGenerate('You are a League of Legends coach. Be concise, specific, and constructive.', prompt, { temperature: 0.3, maxTokens: 2048 });
    return JSON.stringify({ analysis });
  } catch (err) {
    console.error('[analyze-single-game] Error:', err.message);
    return JSON.stringify({ error: err.message });
  }
});

ipcMain.handle('open-stats-window', async () => {
  createStatsWindow();
  return { ok: true };
});

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã¢â€â‚¬Ã¢â€â‚¬ Riot API Key Health Check Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

let riotApiKeyState = {
  status: 'unknown',   // 'valid' | 'expired' | 'checking' | 'no-key' | 'unknown'
  validatedAt: null,    // timestamp when key was confirmed valid
  expiresAt: null,      // estimated expiry (validatedAt + 24h)
  lastCheck: 0,
  keyHash: null,        // last 8 chars of the key to detect changes
};

// Persist state to disk so countdown doesn't reset on restart
const _riotStateFile = path.join(app.getPath('userData'), 'riot-key-state.json');
function loadRiotKeyState() {
  try {
    if (fs.existsSync(_riotStateFile)) {
      const saved = JSON.parse(fs.readFileSync(_riotStateFile, 'utf8'));
      const currentKey = process.env.RIOT_API_KEY || '';
      const currentHash = currentKey.slice(-8);
      // Only restore if same key (last 8 chars match)
      if (saved.keyHash === currentHash && saved.validatedAt && saved.expiresAt) {
        riotApiKeyState.validatedAt = saved.validatedAt;
        riotApiKeyState.expiresAt = saved.expiresAt;
        riotApiKeyState.keyHash = saved.keyHash;
        // Check if already expired
        if (Date.now() > saved.expiresAt) {
          riotApiKeyState.status = 'expired';
          riotApiKeyState.validatedAt = null;
          riotApiKeyState.expiresAt = null;
        }
      }
    }
  } catch {}
}
function saveRiotKeyState() {
  try {
    fs.writeFileSync(_riotStateFile, JSON.stringify({
      validatedAt: riotApiKeyState.validatedAt,
      expiresAt: riotApiKeyState.expiresAt,
      keyHash: riotApiKeyState.keyHash,
    }));
  } catch {}
}
loadRiotKeyState();

// On startup, load Riot API key from persisted settings (overrides .env)
const savedRiotKey = getSetting('riotApiKey');
if (savedRiotKey && savedRiotKey.length > 10) {
  process.env.RIOT_API_KEY = savedRiotKey;
}

// IPC: set Riot API key from UI
ipcMain.handle('set-riot-api-key', async (_event, newKey) => {
  const key = (newKey || '').trim();
  setSetting('riotApiKey', key);
  process.env.RIOT_API_KEY = key;
  // Reset countdown for new key
  riotApiKeyState.validatedAt = null;
  riotApiKeyState.expiresAt = null;
  riotApiKeyState.keyHash = null;
  riotApiKeyState.status = 'unknown';
  saveRiotKeyState();
  // Immediately check the new key
  await checkRiotApiKey();
  return { ok: true, status: riotApiKeyState.status };
});

async function checkRiotApiKey() {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey || apiKey.length < 10) {
    riotApiKeyState.status = 'no-key';
    sendRiotApiStatus();
    return;
  }

  riotApiKeyState.status = 'checking';
  sendRiotApiStatus();

  try {
    const nodeFetch = require('node-fetch');
    const region = process.env.RIOT_REGION || 'euw1';
    const res = await nodeFetch(`https://${region}.api.riotgames.com/lol/status/v4/platform-data`, {
      headers: { 'X-Riot-Token': apiKey },
      timeout: 5000,
    });

    if (res.ok) {
      if (!riotApiKeyState.validatedAt) {
        riotApiKeyState.validatedAt = Date.now();
        riotApiKeyState.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
        riotApiKeyState.keyHash = apiKey.slice(-8);
        saveRiotKeyState();
      }
      riotApiKeyState.status = 'valid';
    } else if (res.status === 403) {
      riotApiKeyState.status = 'expired';
      riotApiKeyState.validatedAt = null;
      riotApiKeyState.expiresAt = null;
      saveRiotKeyState();
    } else if (res.status === 429) {
      // Rate limited but key is still valid
      if (!riotApiKeyState.validatedAt) {
        riotApiKeyState.validatedAt = Date.now();
        riotApiKeyState.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
        riotApiKeyState.keyHash = apiKey.slice(-8);
        saveRiotKeyState();
      }
      riotApiKeyState.status = 'valid';
    } else {
      riotApiKeyState.status = 'expired';
    }
  } catch (err) {
    console.log('[riot-api] Health check error:', err.message);
    // Network error Ã¢â‚¬â€ keep previous status
    if (riotApiKeyState.status === 'checking') {
      riotApiKeyState.status = riotApiKeyState.validatedAt ? 'valid' : 'unknown';
    }
  }

  riotApiKeyState.lastCheck = Date.now();
  sendRiotApiStatus();
}

function sendRiotApiStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const remaining = riotApiKeyState.expiresAt
      ? Math.max(0, riotApiKeyState.expiresAt - Date.now())
      : null;
    mainWindow.webContents.send('riot-api-status', {
      status: riotApiKeyState.status,
      validatedAt: riotApiKeyState.validatedAt,
      expiresAt: riotApiKeyState.expiresAt,
      remainingMs: remaining,
    });
  }
}

// Check on startup, then every 60s
setTimeout(checkRiotApiKey, 3000);
setInterval(checkRiotApiKey, 60000);
// Also send countdown update every 10s (just recalc remaining)
setInterval(sendRiotApiStatus, 10000);

ipcMain.handle('riot-api-check', async () => {
  await checkRiotApiKey();
  return riotApiKeyState;
});

// Export item set to League of Legends
ipcMain.handle('export-item-set', async (_event, { championId, title, rawText, itemIdMap }) => {
  console.log('[export] Starting export for', championId);
  console.log('[export] Raw text length:', rawText?.length);
  console.log('[export] ItemIdMap size:', Object.keys(itemIdMap || {}).length);

  const ITEM_SECTIONS = ['STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS'];
  const ALL_SECTIONS = ['RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH', 'ENEMY POWER SPIKES', 'WIN CONDITION'];

  const blocks = [];
  const lines = rawText.split('\n');
  let currentSection = null;
  let currentItems = [];

  function flushSection() {
    if (currentSection && currentItems.length > 0) {
      const label = currentSection === 'STARTING ITEMS' ? 'Starting Items'
        : currentSection === 'CORE BUILD' ? 'Core Build'
          : 'Situational';
      blocks.push({ type: label, items: [...currentItems] });
      console.log(`[export] Flushed ${label}: ${currentItems.length} items`);
    }
    currentItems = [];
  }

  function resolveItem(name) {
    const searchName = name.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
    if (!searchName || searchName.length < 2) return null;

    if (itemIdMap[searchName]) return itemIdMap[searchName];
    if (itemIdMap[searchName.replace(/s$/, '')]) return itemIdMap[searchName.replace(/s$/, '')];

    let bestId = null;
    let bestScore = 0;
    for (const [key, id] of Object.entries(itemIdMap)) {
      if (key === searchName) return id;
      let score = 0;
      if (key.includes(searchName)) {
        score = searchName.length / key.length;
      } else if (searchName.includes(key) && key.length >= 4) {
        score = key.length / searchName.length * 0.8;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    if (bestId && bestScore > 0.4) return bestId;

    console.log(`[export]   UNRESOLVED: "${name}" (normalized: "${searchName}")`);
    return null;
  }

  for (const rawLine of lines) {
    const stripped = rawLine.trim().replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/^[-*Ã¢â‚¬Â¢]\s*/, '');
    const upperStripped = stripped.toUpperCase().replace(/[^A-Z\s]/g, '').trim();

    const matchedSection = ALL_SECTIONS.find(s => upperStripped === s || upperStripped.startsWith(s));
    if (matchedSection) {
      flushSection();
      currentSection = ITEM_SECTIONS.includes(matchedSection) ? matchedSection : null;
      console.log(`[export] Section: ${matchedSection} (tracking: ${!!currentSection})`);
      continue;
    }

    if (!currentSection) continue;

    let text = stripped;
    if (!text) continue;

    text = text.replace(/^\d+\.\s*/, '');

    if (currentSection === 'SITUATIONAL ITEMS') {
      const ci = text.indexOf(':');
      if (ci > 2 && ci < 45) text = text.substring(0, ci);
    }

    text = text.replace(/\s*\([^)]*\)\s*$/, '').trim();

    if (!text || text.length < 3) continue;

    const itemId = resolveItem(text);
    if (itemId) {
      let realId = String(itemId);
      if (realId.length >= 6) {
        realId = realId.slice(-4);
        if (parseInt(realId) > 7000) realId = String(itemId).slice(-5);
      }
      currentItems.push({ id: realId, count: 1 });
      console.log(`[export]   "${text}" -> ${itemId} (using: ${realId})`);
    }
  }
  flushSection();

  console.log('[export] Total blocks:', blocks.length, 'Total items:', blocks.reduce((s, b) => s + b.items.length, 0));

  if (blocks.length === 0) {
    return { ok: false, error: 'No items could be parsed from the build' };
  }

  const itemSet = {
    title: title || 'DraftCoach Build',
    type: 'custom',
    map: 'any',
    mode: 'any',
    priority: true,
    sortrank: 0,
    blocks,
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ Find League install path (multi-strategy) Ã¢â€â‚¬Ã¢â€â‚¬
  let targetDir = null;

  // Strategy 1: User's custom lolPath setting
  const userSettings = loadSettings();
  if (userSettings.lolPath) {
    const configDir = path.join(userSettings.lolPath, 'Config');
    if (fs.existsSync(configDir)) {
      targetDir = path.join(configDir, 'Champions', championId, 'Recommended');
      console.log('[export] Found League path from user setting:', userSettings.lolPath);
    } else {
      console.log('[export] User lolPath set but Config dir not found:', configDir);
    }
  }

  // Strategy 2: Riot's official RiotClientInstalls.json
  if (!targetDir) {
    try {
      const riotInstalls = path.join('C:\\ProgramData', 'Riot Games', 'RiotClientInstalls.json');
      if (fs.existsSync(riotInstalls)) {
        const data = JSON.parse(fs.readFileSync(riotInstalls, 'utf-8'));
        const entries = data.associated_client || {};
        for (const [, gamePath] of Object.entries(entries)) {
          const gp = String(gamePath).replace(/\//g, '\\').replace(/\\+$/, '');
          const configDir = path.join(gp, 'Config');
          if (fs.existsSync(configDir)) {
            targetDir = path.join(configDir, 'Champions', championId, 'Recommended');
            console.log('[export] Found League path from RiotClientInstalls.json:', gp);
            break;
          }
        }
        if (!targetDir) {
          for (const key of ['rc_default', 'rc_live']) {
            if (data[key]) {
              const rcPath = String(data[key]).replace(/\//g, '\\').replace(/\\+$/, '');
              const leaguePath = path.join(path.dirname(rcPath), 'League of Legends');
              const configDir = path.join(leaguePath, 'Config');
              if (fs.existsSync(configDir)) {
                targetDir = path.join(configDir, 'Champions', championId, 'Recommended');
                console.log('[export] Found League path from Riot Client sibling:', leaguePath);
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('[export] RiotClientInstalls.json parse error:', e.message);
    }
  }

  // Strategy 3: Common install paths (expanded drives + folders)
  if (!targetDir) {
    const drives = ['C', 'D', 'E', 'F', 'G'];
    const subPaths = [
      'Riot Games\\League of Legends',
      'Program Files\\Riot Games\\League of Legends',
      'Program Files (x86)\\Riot Games\\League of Legends',
      'Games\\Riot Games\\League of Legends',
      'Games\\League of Legends',
    ];
    for (const drive of drives) {
      for (const sub of subPaths) {
        const base = drive + ':\\' + sub;
        const configDir = path.join(base, 'Config');
        if (fs.existsSync(configDir)) {
          targetDir = path.join(configDir, 'Champions', championId, 'Recommended');
          console.log('[export] Found League path from common paths:', base);
          break;
        }
      }
      if (targetDir) break;
    }
  }

  if (!targetDir) {
    targetDir = path.join(app.getPath('userData'), 'item-sets', championId);
    console.log('[export] League path not found, falling back to app data:', targetDir);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, 'DraftCoach.json');
  fs.writeFileSync(filePath, JSON.stringify(itemSet, null, 2), 'utf-8');
  console.log('[export] Wrote item set to:', filePath);
  return { ok: true, path: filePath, itemCount: blocks.reduce((s, b) => s + b.items.length, 0) };
});

// Export runes to League of Legends
ipcMain.handle('export-runes', async (_event, { championName, rawText }) => {
  const logFile = path.join(app.getPath('userData'), 'rune-export.log');
  const logFn = (msg) => {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
    } catch (e) { /* ignore log errors */ }
    console.log(`[export-runes] ${msg}`);
  };

  logFn(`Starting export for ${championName}`);
  logFn(`Raw text length: ${rawText?.length}`);

  try {
    // Use dynamic DDragon perk data instead of hardcoded IDs
    // This ensures new/changed runes (like Grisly Mementos) are always recognized
    const runeData = await fetchDdragonRunes();

    // Fallback: hardcoded maps only if DDragon fetch fails
    const STYLE_IDS_FALLBACK = {
      'PRECISION': 8000, 'DOMINATION': 8100, 'SORCERY': 8200, 'RESOLVE': 8400, 'INSPIRATION': 8300
    };
    const PERK_IDS_FALLBACK = {
      // Precision (8000)
      'PRESS THE ATTACK': 8005, 'LETHAL TEMPO': 8008, 'FLEET FOOTWORK': 8021, 'CONQUEROR': 8010,
      'ABSORB LIFE': 9101, 'TRIUMPH': 9111, 'PRESENCE OF MIND': 8009,
      'LEGEND: ALACRITY': 9104, 'LEGEND: HASTE': 9105, 'LEGEND: BLOODLINE': 9103,
      'COUP DE GRACE': 8014, 'CUT DOWN': 8017, 'LAST STAND': 8299,
      // Domination (8100)
      'ELECTROCUTE': 8112, 'DARK HARVEST': 8128, 'HAIL OF BLADES': 9923,
      'CHEAP SHOT': 8126, 'TASTE OF BLOOD': 8139, 'SUDDEN IMPACT': 8143,
      'SIXTH SENSE': 8137, 'GRISLY MEMENTOS': 8140, 'DEEP WARD': 8141,
      'TREASURE HUNTER': 8135, 'RELENTLESS HUNTER': 8105, 'ULTIMATE HUNTER': 8106,
      // Sorcery (8200)
      'SUMMON AERY': 8214, 'ARCANE COMET': 8229, 'PHASE RUSH': 8230,
      'AXIOM ARCANIST': 8224, 'MANAFLOW BAND': 8226, 'NIMBUS CLOAK': 8275,
      'TRANSCENDENCE': 8210, 'CELERITY': 8234, 'ABSOLUTE FOCUS': 8233,
      'SCORCH': 8237, 'WATERWALKING': 8232, 'GATHERING STORM': 8236,
      // Resolve (8400)
      'GRASP OF THE UNDYING': 8437, 'AFTERSHOCK': 8439, 'GUARDIAN': 8465,
      'DEMOLISH': 8446, 'FONT OF LIFE': 8463, 'SHIELD BASH': 8401,
      'CONDITIONING': 8429, 'SECOND WIND': 8444, 'BONE PLATING': 8473,
      'OVERGROWTH': 8451, 'REVITALIZE': 8453, 'UNFLINCHING': 8242,
      // Inspiration (8300)
      'GLACIAL AUGMENT': 8351, 'UNSEALED SPELLBOOK': 8360, 'FIRST STRIKE': 8369,
      'HEXTECH FLASHTRAPTION': 8306, 'MAGICAL FOOTWEAR': 8304, 'CASH BACK': 8321,
      'TRIPLE TONIC': 8313, 'TIME WARP TONIC': 8352, 'BISCUIT DELIVERY': 8345,
      'COSMIC INSIGHT': 8347, 'APPROACH VELOCITY': 8410, 'JACK OF ALL TRADES': 8316,
      // Old names as aliases (AI may still output these)
      'OVERHEAL': 9101, 'LEGEND: TENACITY': 9105, 'NULLIFYING ORB': 8224,
      'ZOMBIE WARD': 8137, 'GHOST PORO': 8141, 'EYEBALL COLLECTION': 8140,
      'INGENIOUS HUNTER': 8134,
      // Shards (Season 2026 Ã¢â‚¬â€ Armor & Magic Resist REMOVED)
      'ADAPTIVE FORCE': 5008, 'ATTACK SPEED': 5005, 'ABILITY HASTE': 5007,
      'HEALTH': 5011, 'HEALTH SCALING': 5001,
      'TENACITY AND SLOW RESIST': 5013, 'MOVEMENT SPEED': 5010,
      // Old shard names Ã¢â€ â€™ map to Health (closest defensive substitute)
      'ARMOR': 5011, 'MAGIC RESIST': 5011,
    };

    // Use DDragon dynamic maps with hardcoded fallback
    const PERK_IDS = runeData?.perkMap || PERK_IDS_FALLBACK;
    const STYLE_IDS = runeData?.styleMap || STYLE_IDS_FALLBACK;

    logFn(`Using ${runeData ? 'DDragon dynamic' : 'hardcoded fallback'} perk map (${Object.keys(PERK_IDS).length} perks, ${Object.keys(STYLE_IDS).length} styles)`);

    // 1. Parsing with section boundary detection
    const lines = rawText.split('\n');
    let primaryTree = '', secondaryTree = '', keystone = '';
    const primarySlots = [], secondarySlots = [], statShards = [];
    let section = null;
    let inRunesSection = false;

    // Section headers that mark the END of the RUNES block
    const NON_RUNE_SECTIONS = [
      'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD',
      'SITUATIONAL ITEMS', 'JUNGLE PATH', 'ENEMY POWER SPIKES',
      'YOUR POWER SPIKES', 'WIN CONDITION',
    ];

    logFn('--- Rune Parsing Start ---');

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim().replace(/\*\*/g, '').replace(/^[-*Ã¢â‚¬Â¢]\s*/, '').replace(/^#+\s*/, '');
      const upper = line.toUpperCase().replace(/[^A-Z\s:,+]/g, '').trim();

      if (!line) continue;

      // Detect the RUNES section header
      if (upper === 'RUNES' || upper === 'RUNES:') {
        inRunesSection = true;
        section = null;
        logFn(`[line ${i}] Entered RUNES section`);
        continue;
      }

      // Detect when we've left the RUNES section entirely
      if (NON_RUNE_SECTIONS.some(s => upper === s || upper.startsWith(s + ' ') || upper.startsWith(s + ':'))) {
        if (inRunesSection) logFn(`[line ${i}] Left RUNES section at: "${upper}"`);
        inRunesSection = false;
        section = null;
        break;
      }

      if (!inRunesSection) continue;

      // Ã¢â€â‚¬Ã¢â€â‚¬ Tree Detection Ã¢â€â‚¬Ã¢â€â‚¬
      // Handle: "Primary: Precision", "Primary Tree: Precision", "Primary (Precision)"
      const primaryMatch = line.match(/^(?:Primary|Primary Tree)\s*[:(]\s*(.+?)[\s)]*$/i);
      if (primaryMatch) {
        primaryTree = primaryMatch[1].trim();
        section = 'primary';
        logFn(`[line ${i}] Primary tree: "${primaryTree}"`);
        continue;
      }

      const secondaryMatch = line.match(/^(?:Secondary|Secondary Tree)\s*[:(]\s*(.+?)[\s)]*$/i);
      if (secondaryMatch) {
        secondaryTree = secondaryMatch[1].trim();
        section = 'secondary';
        logFn(`[line ${i}] Secondary tree: "${secondaryTree}"`);
        continue;
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Keystone Detection Ã¢â€â‚¬Ã¢â€â‚¬
      const keystoneMatch = line.match(/^Keystone\s*:\s*(.+)$/i);
      if (keystoneMatch) {
        keystone = keystoneMatch[1].trim();
        logFn(`[line ${i}] Keystone: "${keystone}"`);
        continue;
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Shard Detection Ã¢â€â‚¬Ã¢â€â‚¬
      // Handle: "Shards: X, Y, Z" or "Stat Shards: X, Y, Z" or multi-line
      const shardsLineMatch = line.match(/^(?:Shards?|Stat Shards?|Offense|Flex|Defense)\s*:\s*(.+)$/i);
      if (shardsLineMatch || upper.includes('SHARDS')) {
        section = 'shards';
        const val = shardsLineMatch ? shardsLineMatch[1] : (line.includes(':') ? line.split(':').slice(1).join(':') : '');
        if (val.trim()) {
          const parts = val.split(/[,/+]/).map(s => s.trim()).filter(Boolean);
          statShards.push(...parts);
          logFn(`[line ${i}] Shards (inline): [${parts.join(', ')}]`);
        }
        continue;
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ Slot Filling Ã¢â€â‚¬Ã¢â€â‚¬
      if (section === 'primary' && line && !primaryTree.toUpperCase().includes(upper)) {
        primarySlots.push(line);
        logFn(`[line ${i}] Primary slot: "${line}"`);
      } else if (section === 'secondary' && line && !secondaryTree.toUpperCase().includes(upper)) {
        secondarySlots.push(line);
        logFn(`[line ${i}] Secondary slot: "${line}"`);
      } else if (section === 'shards' && line && !line.includes(':')) {
        const parts = line.split(/[,/+]/).map(s => s.trim()).filter(Boolean);
        statShards.push(...parts);
        logFn(`[line ${i}] Shards (line): [${parts.join(', ')}]`);
      }
    }

    if (!keystone && primarySlots.length > 0) {
      keystone = primarySlots.shift();
      logFn(`Inferred keystone from first primary slot: "${keystone}"`);
    }

    logFn(`Parsing result: Primary="${primaryTree}" KS="${keystone}" P=[${primarySlots.join(', ')}] S=[${secondarySlots.join(', ')}] Shards=[${statShards.join(', ')}]`);

    // 2. Build Payload
    const findTree = (name) => {
      if (!name) return null;
      const n = name.toUpperCase();
      for (const k of Object.keys(STYLE_IDS)) {
        if (n.includes(k)) return STYLE_IDS[k];
      }
      return null;
    };

    const primaryStyleId = findTree(primaryTree);
    const subStyleId = findTree(secondaryTree);

    logFn(`Tree detection: Primary="${primaryTree}" (${primaryStyleId}), Secondary="${secondaryTree}" (${subStyleId})`);

    if (!primaryStyleId || !subStyleId) {
      throw new Error(`Could not detect rune trees. Primary: "${primaryTree}", Secondary: "${secondaryTree}"`);
    }

    const perkIds = [];
    // Shard aliases Ã¢â‚¬â€ map common AI variants to the exact PERK_IDS keys
    const SHARD_ALIASES = {
      'MOVE SPEED': 'MOVEMENT SPEED',
      'MOVESPEED': 'MOVEMENT SPEED',
      'MS': 'MOVEMENT SPEED',
      'HP SCALING': 'HEALTH SCALING',
      'SCALING HEALTH': 'HEALTH SCALING',
      'HP': 'HEALTH',
      'MR': 'HEALTH',
      'MAGIC RESISTANCE': 'HEALTH',
      'ARMOR': 'HEALTH',
      'CDR': 'ABILITY HASTE',
      'AH': 'ABILITY HASTE',
      'AD': 'ADAPTIVE FORCE',
      'AP': 'ADAPTIVE FORCE',
      'AS': 'ATTACK SPEED',
      'TENACITY': 'TENACITY AND SLOW RESIST',
      'SLOW RESIST': 'TENACITY AND SLOW RESIST',
    };

    const resolve = (name, context) => {
      if (!name) return null;
      let n = name.toUpperCase()
        .replace(/^(LEGEND|RUNE|SHARD|PRIMARY|SECONDARY|OFFENSE|FLEX|DEFENSE):\s*/i, '')
        .replace(/[\(\)].*$/, '') // Remove tooltips in parens
        .replace(/^\d+[.)]\s*/, '') // Remove numbering like "1. "
        .trim();

      // Direct match
      if (PERK_IDS[n]) { logFn(`  Ã¢Å“â€œ ${context}: "${name}" Ã¢â€ â€™ ${PERK_IDS[n]} (direct)`); return PERK_IDS[n]; }

      // Legend prefix
      if (PERK_IDS[`LEGEND: ${n}`]) { logFn(`  Ã¢Å“â€œ ${context}: "${name}" Ã¢â€ â€™ ${PERK_IDS[`LEGEND: ${n}`]} (legend prefix)`); return PERK_IDS[`LEGEND: ${n}`]; }

      // Shard alias
      if (SHARD_ALIASES[n] && PERK_IDS[SHARD_ALIASES[n]]) {
        logFn(`  Ã¢Å“â€œ ${context}: "${name}" Ã¢â€ â€™ ${PERK_IDS[SHARD_ALIASES[n]]} (alias: ${SHARD_ALIASES[n]})`);
        return PERK_IDS[SHARD_ALIASES[n]];
      }

      // Fuzzy match Ã¢â‚¬â€ key contains name or name contains key
      for (const [key, id] of Object.entries(PERK_IDS)) {
        if (key.includes(n) || n.includes(key)) {
          logFn(`  Ã¢Å“â€œ ${context}: "${name}" Ã¢â€ â€™ ${id} (fuzzy: ${key})`);
          return id;
        }
      }

      logFn(`  Ã¢Å“â€” ${context}: "${name}" Ã¢â€ â€™ FAILED TO RESOLVE`);
      return null;
    };

    const ksId = resolve(keystone, 'Keystone');
    if (ksId) perkIds.push(ksId); else logFn(`WARNING: Failed to resolve Keystone: "${keystone}"`);

    // Primary slots: expect 3
    for (let i = 0; i < 3; i++) {
      const slot = primarySlots[i];
      if (slot) {
        const id = resolve(slot, `Primary[${i}]`);
        if (id) perkIds.push(id);
        else logFn(`WARNING: Failed to resolve primary rune ${i}: "${slot}"`);
      } else {
        logFn(`WARNING: Missing primary rune slot ${i}`);
      }
    }

    // Secondary slots: expect 2
    for (let i = 0; i < 2; i++) {
      const slot = secondarySlots[i];
      if (slot) {
        const id = resolve(slot, `Secondary[${i}]`);
        if (id) perkIds.push(id);
        else logFn(`WARNING: Failed to resolve secondary rune ${i}: "${slot}"`);
      } else {
        logFn(`WARNING: Missing secondary rune slot ${i}`);
      }
    }

    // Shards: expect 3, fill missing with safe defaults
    // Season 2026 valid shard IDs per row (from CommunityDragon perkstyles.json):
    const SHARD_ROWS = [
      [5008, 5005, 5007],  // Row 1: Adaptive Force, Attack Speed, Ability Haste
      [5008, 5010, 5001],  // Row 2: Adaptive Force, Move Speed, Health Scaling
      [5011, 5013, 5001],  // Row 3: Health, Tenacity and Slow Resist, Health Scaling
    ];
    const DEFAULT_SHARDS = [5008, 5008, 5011]; // Safe defaults per row
    // Remapping for removed shards (Season 2026)
    const REMOVED_SHARD_REMAP = { 5002: 5011, 5003: 5011 }; // ArmorÃ¢â€ â€™Health, MRÃ¢â€ â€™Health

    for (let i = 0; i < 3; i++) {
      const shard = statShards[i];
      if (shard) {
        let id = resolve(shard, `Shard[${i}]`);
        // Remap removed shards (Armor 5002, MR 5003)
        if (id && REMOVED_SHARD_REMAP[id]) {
          logFn(`  Ã¢Å¡Â  Shard[${i}]: Remapped removed shard ${id} Ã¢â€ â€™ ${REMOVED_SHARD_REMAP[id]} (Season 2026)`);
          id = REMOVED_SHARD_REMAP[id];
        }
        // Validate shard belongs to this row
        if (id && !SHARD_ROWS[i].includes(id)) {
          logFn(`  Ã¢Å¡Â  Shard[${i}]: ID ${id} not valid for row ${i+1} (valid: [${SHARD_ROWS[i]}]), using default ${DEFAULT_SHARDS[i]}`);
          id = DEFAULT_SHARDS[i];
        }
        if (id) perkIds.push(id);
        else {
          logFn(`WARNING: Using default shard for slot ${i} (failed: "${shard}")`);
          perkIds.push(DEFAULT_SHARDS[i]);
        }
      } else {
        logFn(`WARNING: Missing shard slot ${i}, using default ${DEFAULT_SHARDS[i]}`);
        perkIds.push(DEFAULT_SHARDS[i]);
      }
    }

    logFn(`Resolved ${perkIds.length}/9 perks: [${perkIds.join(', ')}]`);

    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // CRITICAL: 9/9 validation gate Ã¢â‚¬â€ NEVER send broken rune pages to LCU
    // A broken page = random runes in game = lost games
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    if (perkIds.length !== 9) {
      logFn(`BLOCKED: Only resolved ${perkIds.length}/9 perks Ã¢â‚¬â€ refusing to send broken rune page to LCU`);
      logFn(`  Keystone: ${keystone ? 'OK' : 'MISSING'}`);
      logFn(`  Primary slots: ${primarySlots.length}/3`);
      logFn(`  Secondary slots: ${secondarySlots.length}/2`);
      logFn(`  Shards: ${statShards.length}/3`);
      return { ok: false, error: `Only resolved ${perkIds.length}/9 perks Ã¢â‚¬â€ rune export aborted to prevent broken rune page` };
    }

    if (!primaryStyleId || !subStyleId) {
      logFn(`BLOCKED: Missing tree IDs Ã¢â‚¬â€ Primary=${primaryStyleId}, Secondary=${subStyleId}`);
      return { ok: false, error: `Missing rune tree Ã¢â‚¬â€ Primary: "${primaryTree}", Secondary: "${secondaryTree}"` };
    }

    if (perkIds.some(id => !id || id === 0)) {
      logFn(`BLOCKED: Found null/zero perk ID in: [${perkIds.join(', ')}]`);
      return { ok: false, error: 'Found null/zero perk ID Ã¢â‚¬â€ rune export aborted' };
    }

    const payload = {
      name: `DC: ${championName}`,
      primaryStyleId,
      subStyleId,
      selectedPerkIds: perkIds,
    };

    logFn(`VALIDATED Ã¢Å“â€œ Ã¢â‚¬â€ Sending 9/9 perks to LCU`);

    // 3. Send to LCU
    logFn(`Payload: ${JSON.stringify(payload)}`);

    const pages = await lcuCall('GET', '/lol-perks/v1/pages');
    if (!pages || pages.__lcuError || !Array.isArray(pages)) {
      logFn(`Failed to fetch rune pages. Response: ${JSON.stringify(pages)}`);
      throw new Error('Could not fetch rune pages from LCU Ã¢â‚¬â€ is the client running?');
    }
    logFn(`Found ${pages.length} existing rune pages`);

    // Find and delete existing DraftCoach pages
    const dcPages = pages.filter(p => (p.name.startsWith('DC: ') || p.name === payload.name) && p.isDeletable);
    for (const p of dcPages) {
      logFn(`Deleting old DC page: ${p.name} (id: ${p.id})`);
      await lcuCall('DELETE', `/lol-perks/v1/pages/${p.id}`);
    }

    // Try to create the new rune page first
    let newPage = await lcuCall('POST', '/lol-perks/v1/pages', payload);
    logFn(`POST /lol-perks/v1/pages initial response: ${JSON.stringify(newPage)}`);

    // If Max pages reached, delete the oldest editable page to make room and retry
    if (newPage && newPage.__lcuError && newPage.status === 400 && typeof newPage.body === 'string' && newPage.body.includes('Max pages reached')) {
      logFn(`Rune page limit reached dynamically for this account. Finding a page to delete...`);
      const refreshedPages = await lcuCall('GET', '/lol-perks/v1/pages');
      if (Array.isArray(refreshedPages)) {
        const deletable = refreshedPages.filter(p => p.isDeletable);
        if (deletable.length > 0) {
          const toDelete = deletable[0];
          logFn(`Deleting oldest page to make room: ${toDelete.name} (id: ${toDelete.id})`);
          await lcuCall('DELETE', `/lol-perks/v1/pages/${toDelete.id}`);

          // Retry the POST
          logFn(`Retrying POST...`);
          newPage = await lcuCall('POST', '/lol-perks/v1/pages', payload);
          logFn(`POST /lol-perks/v1/pages retry response: ${JSON.stringify(newPage)}`);
        } else {
          logFn('WARNING: All slots are full with non-deletable pages.');
        }
      }
    }

    if (!newPage || newPage.__lcuError || newPage.errorCode) {
      const errDetail = newPage?.__lcuError
        ? `HTTP ${newPage.status}: ${newPage.body}`
        : newPage?.errorCode
          ? `${newPage.errorCode}: ${newPage.message}`
          : 'null response';
      logFn(`ERROR creating page: ${errDetail}`);
      throw new Error(`LCU refused to create rune page: ${errDetail}`);
    }

    logFn(`Created new rune page: "${newPage.name}" (id: ${newPage.id})`);

    // Set as current active page
    await lcuCall('PUT', `/lol-perks/v1/currentpage`, newPage.id);
    logFn(`Successfully exported and activated rune page.`);

    return { ok: true };
  } catch (err) {
    logFn(`ERROR: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('get-autodetect-hud', async () => {
  return parseLolConfig();
});

// Settings IPC

ipcMain.handle('get-settings', async () => {
  return loadSettings();
});

ipcMain.handle('set-setting', async (_event, key, value) => {
  setSetting(key, value);
  // Notify windows of settings change
  const settings = loadSettings();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings-update', settings);
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('settings-update', settings);

  // If a hotkey setting changed, re-register all shortcuts
  if (key.startsWith('hotkey')) {
    const results = registerShortcuts();
    return { ok: true, shortcutResults: results };
  }
  return { ok: true };
});

ipcMain.handle('browse-directory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select League of Legends Installation Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Explicit re-register shortcuts from renderer
ipcMain.handle('re-register-shortcuts', async () => {
  return registerShortcuts();
});

// Test if a specific accelerator can be registered
ipcMain.handle('test-shortcut', async (_event, accelerator) => {
  try {
    const ok = globalShortcut.register(accelerator, () => { });
    if (ok) {
      globalShortcut.unregister(accelerator);
      // Re-register our shortcuts since we just unregistered one
      registerShortcuts();
    }
    return { ok, accelerator };
  } catch (err) {
    return { ok: false, accelerator, error: err.message };
  }
});

// RAG IPC
ipcMain.handle('get-rag-status', async () => {
  const meta = getRagMeta();
  return { isUpdating: isRagUpdating, patch: meta?.patch || null, updatedAt: meta?.updatedAt || null };
});

// Fetch and cache icon
ipcMain.handle('get-icon', async (_event, url, cacheKey) => {
  ensureIconCache();
  const ext = path.extname(new URL(url).pathname) || '.png';
  const cached = path.join(CACHE_DIR, `${cacheKey}${ext}`);

  if (fs.existsSync(cached)) {
    const data = fs.readFileSync(cached);
    return `data:image/png;base64,${data.toString('base64')}`;
  }

  try {
    await downloadFile(url, cached);
    const data = fs.readFileSync(cached);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬ App Lifecycle Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

app.whenReady().then(async () => {
  // Initialize crash handlers first
  setupCrashHandlers();

  log('INFO', '[main] App ready, isPackaged: ' + app.isPackaged);
  log('INFO', '[main] __dirname: ' + __dirname);
  log('INFO', '[main] resourcesPath: ' + process.resourcesPath);

  // Load environment variables
  loadEnv();

  // Load user settings
  const settings = loadSettings();
  log('INFO', '[main] Settings loaded from: ' + SETTINGS_FILE);

  // Seed RAG data from bundled resources (first run)
  seedRagFromBundle();

  // Start embedded backend
  await startEmbeddedBackend();

  // Ã¢â€â‚¬Ã¢â€â‚¬ DDragon Cache Warming Ã¢â€â‚¬Ã¢â€â‚¬
  // Pre-cache items, runes, and summoner spells so first build generation is instant
  (async () => {
    try {
      console.log('[cache-warm] Pre-caching DDragon data...');
      await Promise.all([
        resolveDdragonItem('test'),  // triggers item cache build
        fetchDdragonRunes(),         // triggers rune cache build
        fetchDdragonSummoners(),     // triggers summoner spell cache build
      ]);
      console.log('[cache-warm] DDragon data pre-cached successfully');
    } catch (err) {
      console.warn('[cache-warm] Pre-cache failed (will retry on first use):', err.message);
    }
  })();

  // Create windows
  createWindow();
  createOverlayWindow();

  // Register global shortcuts
  registerShortcuts();

  // Start game detection (polls for League of Legends.exe + foreground window)
  startGameDetection();

  // Start ping monitor (TCP-pings Riot servers for latency display)
  startPingMonitor();

  // Auto-open stats if League client is running
  setTimeout(() => {
    try {
      const lcuCreds = getLcuCredentials();
      if (lcuCreds) {
        log('INFO', '[main] League client detected on startup Ã¢â‚¬â€ auto-opening stats');
        autoRefreshStats();
      } else {
        log('INFO', '[main] No League client on startup Ã¢â‚¬â€ stats will open manually');
      }
    } catch (e) {
      log('WARN', '[main] Startup LCU check failed: ' + e.message);
    }
  }, 3000);

  // Run RAG pipeline sync in background (non-blocking)
  (async () => {
    try {
      const fetch = require('node-fetch');
      const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
      const versions = await vRes.json();
      const livePatch = versions[0];
      log('INFO', '[main] Live patch: ' + livePatch);
      await checkAndSyncRag(livePatch);
      // Try centralized CDN first for meta builds + augments
      const cdnOk = await syncMetaFromCDN().catch(() => false);
      if (!cdnOk) {
        // CDN unavailable: fall back to local DeepSeek/OpenRouter grounding.
        log('INFO', '[main] CDN unavailable, using DeepSeek/OpenRouter grounding for meta builds');
        syncAllMetaBuilds(livePatch).catch(err => log('WARN', '[main] Meta build sync failed: ' + err.message));
      }
    } catch (err) {
      log('WARN', '[main] RAG sync on startup failed: ' + err.message);
    }
  })();
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();

  // Stop live client polling
  stopLiveClientPolling();

  // Stop ping monitor
  stopPingMonitor();

  // Kill foreground monitor
  if (fgMonitorProc) {
    try { fgMonitorProc.kill(); } catch { }
    fgMonitorProc = null;
  }

  // Stop game detection polling
  if (gameDetectionInterval) {
    clearInterval(gameDetectionInterval);
    gameDetectionInterval = null;
  }

  // Clean up temp script
  try {
    const scriptPath = path.join(app.getPath('temp'), 'dc-fg-monitor.ps1');
    if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
  } catch { }

  // Force exit after cleanup Ã¢â‚¬â€ backend server keeps event loop alive
  setTimeout(() => process.exit(0), 500);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
