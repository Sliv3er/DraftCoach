const { app, BrowserWindow, ipcMain } = require('electron');
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
1. <Item1>
2. <Item2>
3. <Item3>
4. <Item4>
5. <Item5>
6. <Item6>

SITUATIONAL ITEMS
<ItemName>: <when to buy condition>
<ItemName>: <when to buy condition>
<ItemName>: <when to buy condition>
<ItemName>: <when to buy condition>

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
  const isDev = !app.isPackaged;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f1a',
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
