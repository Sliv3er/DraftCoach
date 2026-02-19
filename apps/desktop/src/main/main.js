const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const CACHE_DIR = path.join(app.getPath('userData'), 'icon-cache');

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

function createWindow() {
  const isDev = !app.isPackaged;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:9000');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
