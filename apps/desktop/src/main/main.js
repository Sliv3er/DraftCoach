const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

const CACHE_DIR = path.join(app.getPath('userData'), 'icon-cache');
let backendProcess = null;

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
        // Follow redirect
        fs.unlink(dest, () => {});
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      } else {
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function getEnvPath() {
  // In production (asar), .env is in the app root next to package.json
  // In dev, it's at the repo root
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.resolve(__dirname, '../../../../.env');
  }
  // In production, look in userData or app directory
  const userDataEnv = path.join(app.getPath('userData'), '.env');
  if (fs.existsSync(userDataEnv)) return userDataEnv;
  
  // Try next to the exe
  const exeDir = path.dirname(app.getPath('exe'));
  const exeDirEnv = path.join(exeDir, '.env');
  if (fs.existsSync(exeDirEnv)) return exeDirEnv;
  
  // Try in resources
  const resourcesEnv = path.join(process.resourcesPath, '.env');
  if (fs.existsSync(resourcesEnv)) return resourcesEnv;
  
  return null;
}

function loadEnv() {
  const envPath = getEnvPath();
  if (envPath && fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    console.log('[main] Loaded .env from:', envPath);
  } else {
    console.warn('[main] No .env file found');
  }
}

function startEmbeddedBackend() {
  // Instead of spawning a separate process, we embed a simple Express-like server
  // using Node's built-in http module with the Gemini SDK
  return new Promise((resolve) => {
    const express = require('express');
    const cors = require('cors');
    
    const backendApp = express();
    const PORT = parseInt(process.env.BACKEND_PORT || '3210', 10);
    
    backendApp.use(cors());
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
    
    // Gemini
    const SYSTEM_PROMPT = `You are a League of Legends Draft & Itemization Engine for Season 2026. You MUST use Google Search grounding to verify current live patch data (Patch 26.4). If you cannot confirm current patch-relevant details via grounding, output exactly: NEED_RETRY.

Return ONLY these sections in this exact format:

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

CORE BUILD
1. <Item1> (<why this item>)
2. <Item2> (<why this item>)
3. <Item3> (<why this item>)
4. <Item4> (<why this item>)
5. <Item5> (<why this item>)
6. <Item6> (<why this item>)

SITUATIONAL ITEMS
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>

Rules:
- CORE BUILD must ALWAYS have exactly 6 items (7 items if the role is Bottom/ADC, since bottom laners have 7 item slots in Season 2026).
- SITUATIONAL ITEMS must ALWAYS have at least 4 items with clear conditions (e.g. "vs heavy AP", "if behind", "vs tanks").
- Boots count as a core item. Include them in CORE BUILD.
- Never suggest removed items or removed runes.
- If unsure, output NEED_RETRY.
- Adapt to enemy comp.
- For jungle, include jungle companion start.
- Keep names exactly as in-game.
- Do NOT add explanations or extra text outside the sections.`;
    
    const SHORT_SYSTEM_PROMPT = `You are a League of Legends build advisor. Return ONLY: RUNES, SUMMONERS, SKILL ORDER, STARTING ITEMS, CORE BUILD, SITUATIONAL ITEMS. Keep names exactly as in-game. Adapt to enemy comp. CORE BUILD must have exactly 6 items (7 for Bottom/ADC role). SITUATIONAL ITEMS must have at least 4 items with conditions. Boots count as a core item.`;
    
    async function generateBuild(body, shortPrompt) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not set. Place a .env file with GEMINI_API_KEY=your_key next to the exe or in ' + app.getPath('userData'));
      
      const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
      console.log(`[backend] Using model: ${modelName}`);
      
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: shortPrompt ? SHORT_SYSTEM_PROMPT : SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
      });
      
      const isBot = /^(bottom|adc|bot)$/i.test(body.role);
      const itemSlots = isBot ? 7 : 6;
      const userMessage = `Champion: ${body.myChampion}, Role: ${body.role}, Allies: ${(body.allies || []).join(', ') || 'none'}, Enemies: ${(body.enemies || []).join(', ') || 'none'}, Patch: 26.4 (Season 2026). This role has ${itemSlots} item slots — CORE BUILD must list exactly ${itemSlots} items. Generate optimized build. Output only the sections.`;
      
      const result = await model.generateContent(userMessage);
      const response = result.response;
      const text = response.text();
      
      return { text, patchDetected: body.patch || '26.4' };
    }
    
    function buildCacheKey(body) {
      const allies = [...(body.allies || [])].sort().join(',');
      const enemies = [...(body.enemies || [])].sort().join(',');
      return `${body.patch || '26.4'}|${body.myChampion}|${body.role}|${allies}|${enemies}`;
    }
    
    backendApp.post('/api/build', async (req, res) => {
      try {
        const body = req.body;
        if (!body.myChampion || !body.role) {
          return res.status(400).json({ ok: false, source: 'error', message: 'Missing required fields', canRetry: false });
        }
        
        const cacheKey = buildCacheKey(body);
        const cached = getCache(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
          return res.json({ ok: true, source: 'cache', patchDetected: cached.patchDetected, text: cached.text });
        }
        
        let lastError = '';
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            console.log(`[backend] Attempt ${attempt + 1} for ${body.myChampion} ${body.role}`);
            const result = await generateBuild(body, false);
            
            if (result.text.trim() === 'NEED_RETRY') {
              console.log('[backend] Got NEED_RETRY, trying short prompt...');
              const retry = await generateBuild(body, true);
              if (retry.text.trim() === 'NEED_RETRY') {
                lastError = 'AI returned NEED_RETRY on all attempts';
                break;
              }
              setCache(cacheKey, retry.text, retry.patchDetected);
              return res.json({ ok: true, source: 'grounded', patchDetected: retry.patchDetected, text: retry.text });
            }
            
            setCache(cacheKey, result.text, result.patchDetected);
            return res.json({ ok: true, source: 'grounded', patchDetected: result.patchDetected, text: result.text });
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

function createWindow() {
  Menu.setApplicationMenu(null);
  const isDev = !app.isPackaged;
  // Resolve icon path
  const isDev2 = !app.isPackaged;
  const iconPath = isDev2
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

  win.once('ready-to-show', () => {
    win.show();
  });

  if (isDev) {
    win.loadURL('http://localhost:9000');
    win.webContents.openDevTools();
  } else {
    // __dirname is /src/main inside asar, need to go up 2 levels to reach /dist
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    console.log('[main] Loading:', indexPath, 'exists:', fs.existsSync(indexPath));
    win.loadFile(indexPath);
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] Failed to load:', errorCode, errorDescription);
  });
}

// IPC: export item set to League of Legends
// Receives raw build text + itemIds map + championId, does all parsing server-side
ipcMain.handle('export-item-set', async (_event, { championId, title, rawText, itemIdMap }) => {
  // itemIdMap: { "infinity edge": "3031", ... } from renderer's DDragon data
  console.log('[export] Starting export for', championId);
  console.log('[export] Raw text length:', rawText?.length);
  console.log('[export] ItemIdMap size:', Object.keys(itemIdMap || {}).length);

  // Parse sections with simple line-by-line approach
  const ITEM_SECTIONS = ['STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS'];
  const ALL_SECTIONS = ['RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS'];
  
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
    
    // Helper: prefer shortest (real) ID from value
    const preferReal = (id) => id; // IDs already filtered in renderer
    
    // Exact match
    if (itemIdMap[searchName]) return itemIdMap[searchName];
    
    // Try removing "s" at end (plurals)
    if (itemIdMap[searchName.replace(/s$/, '')]) return itemIdMap[searchName.replace(/s$/, '')];
    
    // Score-based fuzzy match: prefer exact substring matches with shortest key
    let bestId = null;
    let bestScore = 0;
    for (const [key, id] of Object.entries(itemIdMap)) {
      if (key === searchName) return id; // exact
      
      let score = 0;
      if (key.includes(searchName)) {
        score = searchName.length / key.length; // higher = more of the key is matched
      } else if (searchName.includes(key) && key.length >= 4) {
        score = key.length / searchName.length * 0.8; // slightly lower priority
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
    const stripped = rawLine.trim().replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/^[-*•]\s*/, '');
    const upperStripped = stripped.toUpperCase().replace(/[^A-Z\s]/g, '').trim();
    
    // Check if this line is a section header
    const matchedSection = ALL_SECTIONS.find(s => upperStripped === s || upperStripped.startsWith(s));
    if (matchedSection) {
      flushSection();
      currentSection = ITEM_SECTIONS.includes(matchedSection) ? matchedSection : null;
      console.log(`[export] Section: ${matchedSection} (tracking: ${!!currentSection})`);
      continue;
    }
    
    // If we're in an item section, try to extract item
    if (!currentSection) continue;
    
    let text = stripped;
    if (!text) continue;
    
    // Remove number prefix: "1. Item"
    text = text.replace(/^\d+\.\s*/, '');
    
    // For situational: take only before colon (but colon must not be in first 2 chars)
    if (currentSection === 'SITUATIONAL ITEMS') {
      const ci = text.indexOf(':');
      if (ci > 2 && ci < 45) text = text.substring(0, ci);
    }
    
    // Remove parenthesized reason at end (greedy from last open paren)
    text = text.replace(/\s*\([^)]*\)\s*$/, '').trim();
    
    if (!text || text.length < 3) continue;
    
    const itemId = resolveItem(text);
    if (itemId) {
      // Ensure we use the real 4-digit item ID, not Ornn upgrade (6-digit 22xxxx/32xxxx)
      let realId = String(itemId);
      if (realId.length >= 6) {
        // Strip prefix: 223031 -> 3031, 226631 -> 6631
        realId = realId.slice(-4);
        // If still not valid (>= 7000 etc), try slice(-5)
        if (parseInt(realId) > 7000) realId = String(itemId).slice(-5);
      }
      currentItems.push({ id: realId, count: 1 });
      console.log(`[export]   "${text}" -> ${itemId} (using: ${realId})`);
    }
  }
  flushSection(); // flush last section
  
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

  // Try common LoL install paths
  const possiblePaths = [
    'C:\\Riot Games\\League of Legends',
    'D:\\Riot Games\\League of Legends',
    'C:\\Program Files\\Riot Games\\League of Legends',
    'D:\\Program Files\\Riot Games\\League of Legends',
    'C:\\Games\\Riot Games\\League of Legends',
    'D:\\Games\\Riot Games\\League of Legends',
  ];

  let targetDir = null;
  for (const base of possiblePaths) {
    const configDir = path.join(base, 'Config');
    if (fs.existsSync(configDir)) {
      targetDir = path.join(configDir, 'Champions', championId, 'Recommended');
      break;
    }
  }

  if (!targetDir) {
    targetDir = path.join(app.getPath('userData'), 'item-sets', championId);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, 'DraftCoach.json');
  fs.writeFileSync(filePath, JSON.stringify(itemSet, null, 2), 'utf-8');
  console.log('[export] Wrote item set to:', filePath);
  return { ok: true, path: filePath, itemCount: blocks.reduce((s, b) => s + b.items.length, 0) };
});

// IPC: fetch and cache icon
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

app.whenReady().then(async () => {
  console.log('[main] App ready, isPackaged:', app.isPackaged);
  console.log('[main] __dirname:', __dirname);
  console.log('[main] resourcesPath:', process.resourcesPath);
  
  // Load environment variables
  loadEnv();
  
  // Start embedded backend
  await startEmbeddedBackend();
  
  // Create window
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
