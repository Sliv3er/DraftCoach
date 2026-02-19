import fs from 'fs';
import path from 'path';
import { CacheEntry } from '../../../shared/types';

const CACHE_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'DraftCoach')
  : path.join(require('os').homedir(), '.draftcoach');

const CACHE_FILE = path.join(CACHE_DIR, 'build-cache.json');

function ensureDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readAll(): Record<string, CacheEntry> {
  ensureDir();
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, CacheEntry>): void {
  ensureDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getCache(key: string): CacheEntry | null {
  const all = readAll();
  return all[key] || null;
}

export function setCache(key: string, text: string, patchDetected: string): void {
  const all = readAll();
  all[key] = {
    key,
    timestamp: Date.now(),
    text,
    patchDetected,
    source: 'grounded',
  };
  writeAll(all);
}
