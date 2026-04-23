import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BuildResponse, Role, GeminiModel } from './types';
import { ChampionPicker } from './components/ChampionPicker';
import { BuildOutput } from './components/BuildOutput';
import { ipcInvoke, ipcSend, ipcOn, ipcRemoveListener, minimizeCurrentWindow, closeCurrentWindow, hideCurrentWindow, toggleMaximizeCurrentWindow, backendReady } from './bridge';

const API_BASE = 'http://127.0.0.1:3210';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];

// ── Hotkey settings definitions ─────────────────────────────────────
const HOTKEY_SETTINGS = [
  { key: 'hotkeyToggleOverlay', label: 'Toggle Overlay' },
  { key: 'hotkeyHideOverlay', label: 'Hide Overlay' },
  { key: 'hotkeyFocusMain', label: 'Focus Main Window' },
  { key: 'hotkeyRegenerate', label: 'Regenerate Build' },
] as const;

function electronAccelerator(e: React.KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (parts.length === 0) {
    // Allow F-keys without modifiers
    if (/^F\d+$/.test(e.key)) {
      return e.key;
    }
    return null;
  }
  // Map key names to Electron accelerator names
  let keyName = e.key;
  if (keyName === ' ') keyName = 'Space';
  else if (keyName.length === 1) keyName = keyName.toUpperCase();
  else if (keyName === 'ArrowUp') keyName = 'Up';
  else if (keyName === 'ArrowDown') keyName = 'Down';
  else if (keyName === 'ArrowLeft') keyName = 'Left';
  else if (keyName === 'ArrowRight') keyName = 'Right';
  else if (keyName === 'Escape') keyName = 'Escape';
  parts.push(keyName);
  return parts.join('+');
}

function displayAccelerator(acc: string): string {
  if (!acc || acc === 'none') return 'Not set';
  return acc
    .replace('CommandOrControl', 'Ctrl')
    .replace('Alt', 'Alt')
    .replace('Shift', 'Shift')
    .replace(/\+/g, ' + ');
}

// ── HotkeyRecorder Component ────────────────────────────────────────
function HotkeyRecorder({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (newAccelerator: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const acc = electronAccelerator(e);
    if (acc) {
      onChange(acc);
      setRecording(false);
    }
  };

  return (
    <div className="hotkey-config-row">
      <span className="hotkey-config-label">{label}</span>
      <div className="hotkey-config-right">
        {recording ? (
          <input
            className="hotkey-input recording"
            autoFocus
            readOnly
            placeholder="Press keys..."
            onKeyDown={handleKeyDown}
            onBlur={() => setRecording(false)}
          />
        ) : (
          <button
            className="hotkey-input"
            onClick={() => setRecording(true)}
          >
            {displayAccelerator(value)}
          </button>
        )}
        {value && value !== 'none' && (
          <button className="hotkey-clear close-x-btn" onClick={() => onChange('none')} title="Clear shortcut">
            <svg width="8" height="8" viewBox="0 0 8 8"><path stroke="currentColor" strokeWidth="1.5" fill="none" d="M1,1 L7,7 M7,1 L1,7"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── RAG status type ────────────────────────────────────────────────
interface RagStatus {
  isUpdating: boolean;
  patch: string | null;
  updatedAt: string | null;
}
const ROLE_ICON_URLS: Record<Role, string> = {
  top: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png',
  jungle: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png',
  mid: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
  adc: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
  support: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png',
};

const MODEL_OPTIONS: { value: GeminiModel; label: string }[] = [
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
];

// Map LCU position strings to our Role type
const LCU_POSITION_MAP: Record<string, Role> = {
  top: 'top',
  jungle: 'jungle',
  middle: 'mid',
  bottom: 'adc',
  utility: 'support',
};

type Status = 'idle' | 'fetching' | 'grounded' | 'cache' | 'stale-cache' | 'error';

interface ChampionData {
  id: string;
  name: string;
  key: string;
}

export interface IconLookups {
  items: Map<string, string>;    // normalized name -> icon url
  itemIds: Map<string, string>;  // normalized name -> item id
  spells: Map<string, string>;   // normalized name -> icon url
  runes: Map<string, string>;    // normalized name -> icon url (rune trees + rune slots)
  statShards: Map<string, string>; // stat shard name -> icon url
  abilities: Map<string, string>;  // "${championId}_${Q|W|E|R}" -> ability icon url
  version: string;
  /** Full DDragon item data keyed by item ID — used for component path resolution */
  itemFullData: Map<string, { name: string; from?: string[]; gold: { total: number } }>;
}

// ── Section keys for parsing AI output ──────────────────────────────

const SECTION_KEYS = [
  'ANALYSIS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
  'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH',
  'ENEMY POWER SPIKES', 'WIN CONDITION', 'YOUR POWER SPIKES',
];

function parseSectionsFromText(text: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const lines = text.split('\n');
  let curTitle = '';
  let curLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
    if (!trimmed) { if (curTitle) curLines.push(''); continue; }
    const upper = trimmed.toUpperCase().replace(/[#*\-:]/g, '').trim();
    const matched = SECTION_KEYS.find(s => upper.startsWith(s));
    if (matched) {
      if (curTitle) sections.push({ title: curTitle, content: curLines.join('\n').trim() });
      curTitle = matched;
      const rest = trimmed.replace(/^[#*\-\s]*/g, '').replace(new RegExp(`^${matched}[^\\n]*?(?::|\\n|$)`, 'i'), '').trim();
      curLines = rest ? [rest] : [];
    } else if (curTitle) {
      curLines.push(trimmed);
    }
  }
  if (curTitle) sections.push({ title: curTitle, content: curLines.join('\n').trim() });
  return sections;
}

// ── Component Item Path Algorithm ───────────────────────────────────

function resolveComponentPath(
  itemName: string,
  iconLookups: IconLookups | null,
): string {
  if (!iconLookups) return itemName;

  const normName = itemName.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();

  // Find the item ID
  let itemId = iconLookups.itemIds.get(normName);
  if (!itemId) {
    // Strict prefix match only
    for (const [key, id] of iconLookups.itemIds.entries()) {
      if (key === normName || key.startsWith(normName + ' ') || normName.startsWith(key + ' ')) {
        itemId = id;
        break;
      }
    }
  }
  if (!itemId) return itemName;

  const fullData = iconLookups.itemFullData.get(itemId);
  if (!fullData || !fullData.from || fullData.from.length === 0) return itemName;

  // Find the most expensive immediate sub-component
  let bestComponent: string | null = null;
  let bestGold = 0;

  for (const fromId of fullData.from) {
    const fromItem = iconLookups.itemFullData.get(fromId);
    if (fromItem && fromItem.gold && fromItem.gold.total > bestGold) {
      bestGold = fromItem.gold.total;
      bestComponent = fromItem.name;
    }
  }

  if (bestComponent && bestGold > 0) {
    return `${bestComponent} (${bestGold}g) ➔ ${itemName}`;
  }
  return itemName;
}

// ── Extract Overlay Data from Build Text ────────────────────────────

// ── Jungle camp icons (emoji + name) ────────────────────────────────
const CAMP_ICONS: Record<string, string> = {
  'red': '🔴', 'red brambleback': '🔴', 'red buff': '🔴',
  'blue': '🔵', 'blue sentinel': '🔵', 'blue buff': '🔵',
  'gromp': '🐸', 'wolves': '🐺', 'murk wolves': '🐺',
  'raptors': '🐔', 'wraiths': '🐔',
  'krugs': '🪨', 'golems': '🪨',
  'scuttle': '🦀', 'rift scuttle': '🦀', 'scuttle crab': '🦀',
  'dragon': '🐉', 'drake': '🐉',
  'herald': '👁', 'rift herald': '👁',
  'baron': '👾', 'baron nashor': '👾',
  'gank': '⚔', 'gank mid': '⚔', 'gank top': '⚔', 'gank bot': '⚔',
};

function getCampIcon(campName: string): string {
  const lower = campName.toLowerCase().trim();
  for (const [key, icon] of Object.entries(CAMP_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '🌿';
}

interface OverlayBuildItem {
  name: string;
  iconUrl: string;
  gold: number;
  id: string;
  reason?: string;  // "Why this item?" AI reasoning
}

interface JungleCamp {
  name: string;
  icon: string;
}

interface OverlayPayload {
  buildItems: OverlayBuildItem[];
  junglePath: JungleCamp[];
  championName: string;
}

function extractOverlayData(
  text: string,
  role: string,
  iconLookups: IconLookups | null,
  ddragonVer: string,
  championName: string,
): OverlayPayload {
  const sections = parseSectionsFromText(text);

  // 1. Full build item list with icons
  const buildItems: OverlayBuildItem[] = [];
  const CONSUMABLES_TO_IGNORE = new Set([
    'health potion', 'refillable potion', 'corrupting potion',
    'biscuit of total restoration', 'total biscuit of rejuvenation',
    // Jungle companions intentionally NOT excluded — they are real starting items
    'stealth ward', 'oracle lens', 'farsight alteration', 'control ward',
    'wardstone', 'vigilant wardstone', 'watchful wardstone',
  ]);

  const isConsumable = (name: string) => {
    const n = name.toLowerCase().trim();
    return CONSUMABLES_TO_IGNORE.has(n) || n.includes('potion') || n.includes('biscuit') || n.includes('ward') || n.includes('trinket') || n.includes('lens');
  };

  // Starting items are intentionally excluded from the overlay — only core build items shown

  // 1b. Parse CORE BUILD
  const coreBuild = sections.find(s => s.title === 'CORE BUILD');
  if (coreBuild && iconLookups) {
    const lines = coreBuild.content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Capture reason from parentheses, e.g. "1. Item Name (vs heavy AP)"
      const reasonMatch = line.match(/\(([^)]+)\)\s*$/);
      const itemReason = reasonMatch ? reasonMatch[1].trim() : undefined;
      const itemName = line.trim()
        .replace(/\*\*/g, '')
        .replace(/^\d+\.\s*/, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim();
      if (!itemName || isConsumable(itemName)) continue;
      // Resolve aliases (e.g. "Hatchling" → "Gustwalker Hatchling")
      const OVERLAY_ALIASES: Record<string, string> = {
        'hatchling': 'gustwalker hatchling', 'seedling': 'mosstomper seedling',
        'scorchclaw': 'scorchclaw pup', 'scorched claw': 'scorchclaw pup',
        'gustwalker': 'gustwalker hatchling', 'mosstomper': 'mosstomper seedling',
      };
      const rawNorm = itemName.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
      const normName = OVERLAY_ALIASES[rawNorm] || rawNorm;
      let itemId: string | undefined = iconLookups.itemIds.get(normName);
      if (!itemId) {
        // Strict prefix matching only — don't match "luden's companion" to random "luden" items
        for (const [key, id] of iconLookups.itemIds.entries()) {
          if (key === normName || key.startsWith(normName + ' ') || normName.startsWith(key + ' ')) {
            itemId = id;
            break;
          }
        }
      }
      if (itemId) {
        // Prevent duplicate items in overlay (same ID already in list)
        if (buildItems.some(bi => bi.id === itemId)) continue;
        const fullData = iconLookups.itemFullData.get(itemId);
        buildItems.push({
          name: fullData?.name || itemName,
          iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVer}/img/item/${itemId}.png`,
          gold: fullData?.gold?.total || 0,
          id: itemId,
          reason: itemReason,
        });
      } else {
        // Prevent duplicate items by name when ID is unknown
        const normLower = itemName.toLowerCase().trim();
        if (buildItems.some(bi => bi.name.toLowerCase().trim() === normLower)) continue;
        buildItems.push({ name: itemName, iconUrl: '', gold: 0, id: '', reason: itemReason });
      }
    }
  }

  // 2. Jungle Path as camp icons
  const junglePath: JungleCamp[] = [];
  if (role === 'jungle') {
    const jpSection = sections.find(s => s.title === 'JUNGLE PATH');
    if (jpSection && jpSection.content.trim()) {
      const raw = jpSection.content.trim();
      const camps = raw
        .replace(/\s*[-–—]+>\s*/g, '➔')
        .replace(/\s*→\s*/g, '➔')
        .split('➔')
        .map(s => s.trim())
        .filter(Boolean);
      for (const camp of camps) {
        junglePath.push({ name: camp, icon: getCampIcon(camp) });
      }
    }
  }

  // Cap at 7 items max (ADC/bot can build 7)
  return { buildItems: buildItems.slice(0, 7), junglePath, championName };
}

// ── Main App Component ──────────────────────────────────────────────

export function App() {
  const [patchVersion, setPatchVersion] = useState('...');
  const [ddragonVersion, setDdragonVersion] = useState('');
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [role, setRole] = useState<Role>('mid');
  const [myChampion, setMyChampion] = useState('');
  const [allies, setAllies] = useState<string[]>([]);
  const [enemies, setEnemies] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [buildResult, setBuildResult] = useState<BuildResponse | null>(null);
  const [iconLookups, setIconLookups] = useState<IconLookups | null>(null);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-3-flash-preview');
  const [autoDetect, setAutoDetect] = useState(true);
  const [autoDetectStatus, setAutoDetectStatus] = useState<'off' | 'searching' | 'connected' | 'error'>('off');
  const autoDetectRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const champKeyMapRef = useRef<Map<string, { id: string; name: string }>>(new Map());
  const autoGenKeyRef = useRef<string>(''); // track last auto-generated combo to avoid repeated calls
  const buildGeneratedRef = useRef<boolean>(false); // once a build is generated, lock champion detection
  const lastSessionIdRef = useRef<string>(''); // track champ select session to avoid resetting lock every poll tick
  const overlayShownRef = useRef<boolean>(false); // track if overlay is currently shown by polling
  const overlayHasDataRef = useRef<boolean>(false); // ref mirror for use in pollLCU callback

  // ── New UI state: RAG, overlay, settings ───────────────────────
  const [ragStatus, setRagStatus] = useState<RagStatus>({ isUpdating: false, patch: null, updatedAt: null });
  const [overlayHasData, setOverlayHasData] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiKeySaveStatus, setGeminiKeySaveStatus] = useState<string>('');
  const [runesModel, setRunesModel] = useState('');
  const [buildModel, setBuildModel] = useState('');

  // ── Live Advisor state ─────────────────────────────────────────
  const [liveAdvice, setLiveAdvice] = useState<any>(null);
  const [liveAdvisorActive, setLiveAdvisorActive] = useState(false);
  const [advisorDebugLog, setAdvisorDebugLog] = useState<string[]>([]);
  const [liveUpdatedItems, setLiveUpdatedItems] = useState<any[] | null>(null);  // Items updated by live advisor

  // ── Scouting Report state ──────────────────────────────────────
  const [scoutReport, setScoutReport] = useState<any>(null);
  const [scoutStatus, setScoutStatus] = useState<any>(null);
  const [scoutDebugLog, setScoutDebugLog] = useState<string[]>([]);

  // ── Riot API status ────────────────────────────────────────────
  const [riotApiStatus, setRiotApiStatus] = useState<any>({ status: 'unknown', remainingMs: null });

  // ── Ping Monitor state ─────────────────────────────────────────
  const [pingData, setPingData] = useState<any>({ ping: null, jitter: null, packetLoss: 0, status: 'disconnected', history: [] });

  useEffect(() => {
    const handler = (_event: any, advice: any) => { setLiveAdvice(advice); };
    const debugHandler = (_event: any, line: string) => { setAdvisorDebugLog(prev => [...prev.slice(-50), line]); };
    const scoutReportHandler = (_event: any, report: any) => { setScoutReport(report); };
    const scoutStatusHandler = (_event: any, status: any) => { setScoutStatus(status); };
    const scoutDebugHandler = (_event: any, line: string) => { setScoutDebugLog(prev => [...prev.slice(-50), line]); };
    const riotApiHandler = (_event: any, data: any) => { setRiotApiStatus(data); };
    ipcOn('live-advice', handler);
    ipcOn('live-advisor-debug', debugHandler);
    ipcOn('scout-report', scoutReportHandler);
    ipcOn('scout-status', scoutStatusHandler);
    ipcOn('scout-debug', scoutDebugHandler);
    ipcOn('riot-api-status', riotApiHandler);
    const pingHandler = (_event: any, data: any) => { setPingData(data); };
    ipcOn('ping-update', pingHandler);
    const stoppedHandler = () => { setLiveAdvisorActive(false); };
    ipcOn('live-advisor-stopped', stoppedHandler);
    const startedHandler = () => { setLiveAdvisorActive(true); };
    ipcOn('live-advisor-started', startedHandler);
    // Live advisor pushed updated items — sync to App UI CORE BUILD
    const buildItemsHandler = (_event: any, items: any[]) => {
      console.log('[App] Received build-items-updated from live advisor:', items.length, 'items');
      setLiveUpdatedItems(items);
    };
    ipcOn('build-items-updated', buildItemsHandler);

    // ── Overlay visibility — sidecar's game detection tells us when to show/hide ──
    const overlayVisibilityHandler = (_event: any, payload: any) => {
      if (payload?.visible) {
        console.log('[App] Overlay show requested by sidecar');
        ipcInvoke('overlay-ensure').then(() => ipcInvoke('overlay-show'));
      } else {
        console.log('[App] Overlay hide requested by sidecar');
        ipcInvoke('overlay-hide');
      }
    };
    ipcOn('overlay-visibility', overlayVisibilityHandler);

    // ── Settings updates pushed from backend ──
    const settingsUpdateHandler = (_event: any, newSettings: any) => {
      if (newSettings && typeof newSettings === 'object') {
        setSettings(newSettings);
      }
    };
    ipcOn('settings-update', settingsUpdateHandler);

    // When game ends, clear all game-specific UI
    const gameEndedHandler = () => {
      setBuildResult(null);
      setLiveAdvice(null);
      setLiveAdvisorActive(false);
      setAdvisorDebugLog([]);
      setScoutReport(null);
      setScoutStatus(null);
      setScoutDebugLog([]);
      // Reset champion/draft state so auto-detect can re-trigger for next game
      setMyChampion('');
      setAllies([]);
      setEnemies([]);
      setStatus('idle');
      // Clear the auto-generate key so the next draft triggers a fresh build
      autoGenKeyRef.current = '';
      lastSessionIdRef.current = '';
      // Clear live-updated items so next game starts fresh
      setLiveUpdatedItems(null);
      // Reset overlay tracking
      overlayShownRef.current = false;
      overlayHasDataRef.current = false;
      setOverlayHasData(false);
    };
    ipcOn('game-ended', gameEndedHandler);
    return () => {
      ipcRemoveListener('live-advice', handler);
      ipcRemoveListener('live-advisor-debug', debugHandler);
      ipcRemoveListener('scout-report', scoutReportHandler);
      ipcRemoveListener('scout-status', scoutStatusHandler);
      ipcRemoveListener('scout-debug', scoutDebugHandler);
      ipcRemoveListener('riot-api-status', riotApiHandler);
      ipcRemoveListener('ping-update', pingHandler);
      ipcRemoveListener('live-advisor-stopped', stoppedHandler);
      ipcRemoveListener('live-advisor-started', startedHandler);
      ipcRemoveListener('game-ended', gameEndedHandler);
      ipcRemoveListener('build-items-updated', buildItemsHandler);
      ipcRemoveListener('overlay-visibility', overlayVisibilityHandler);
      ipcRemoveListener('settings-update', settingsUpdateHandler);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Wait for Tauri to confirm backend ports are open
        await backendReady;
        console.log('[App] Backend ready signal received, initializing...');

        // Fetch DDragon version from our backend
        let version = '';
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            const vRes = await fetch(`${API_BASE}/api/version`);
            if (vRes.ok) {
              const data = await vRes.json();
              version = data.version;
              break;
            }
          } catch {
            // Backend returned error, retry
          }
          console.log(`[App] Version fetch retry... (${attempt + 1}/10)`);
          await new Promise(r => setTimeout(r, 500));
        }
        if (!version) {
          // Fallback: fetch version directly from DDragon
          try {
            const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
            const versions = await vRes.json();
            version = versions[0];
          } catch {
            console.error('[App] Cannot reach backend or DDragon');
            return;
          }
        }
        setDdragonVersion(version);
        setPatchVersion(version);

        const [cRes, iRes, sRes, rRes] = await Promise.all([
          fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`),
          fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`),
          fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`),
          fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`),
        ]);

        const cData = await cRes.json();
        const list: ChampionData[] = Object.values(cData.data).map((c: any) => ({
          id: c.id, name: c.name, key: c.key,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setChampions(list);

        const keyMap = new Map<string, { id: string; name: string }>();
        for (const c of list) {
          keyMap.set(c.key, { id: c.id, name: c.name });
        }
        champKeyMapRef.current = keyMap;

        // Build item lookup: name -> icon URL + full data for component paths
        const iData = await iRes.json();
        const items = new Map<string, string>();
        const itemIds = new Map<string, string>();
        const itemFullData = new Map<string, { name: string; from?: string[]; gold: { total: number } }>();

        for (const [id, item] of Object.entries<any>(iData.data)) {
          const normName = item.name.toLowerCase();
          items.set(normName, `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`);
          const existing = itemIds.get(normName);
          if (!existing || id.length < existing.length) {
            itemIds.set(normName, id);
          }
          // Store full item data for component path resolution
          itemFullData.set(id, {
            name: item.name,
            from: item.from || undefined,
            gold: { total: item.gold?.total || 0 },
          });
        }

        // Build spell lookup
        const sData = await sRes.json();
        const spells = new Map<string, string>();
        for (const [, spell] of Object.entries<any>(sData.data)) {
          spells.set(spell.name.toLowerCase(), `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.id}.png`);
        }
        // Add common AI-generated spell name aliases that don't match DDragon exactly
        const smiteUrl = spells.get('smite');
        if (smiteUrl) {
          for (const alias of ['attack smite', 'attack-smite', 'unleashed smite', 'primal smite', 'gustwalker smite', 'mosstomper smite', 'scorchclaw smite', 'challenging smite', 'chilling smite', 'smite']) {
            spells.set(alias, smiteUrl);
          }
        }
        const teleportUrl = spells.get('teleport');
        if (teleportUrl) {
          spells.set('unleashed teleport', teleportUrl);
          spells.set('tp', teleportUrl);
        }

        // Build rune lookup
        const rData: any[] = await rRes.json();
        const runes = new Map<string, string>();
        for (const tree of rData) {
          runes.set(tree.name.toLowerCase(), `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`);
          for (const slot of tree.slots) {
            for (const rune of slot.runes) {
              runes.set(rune.name.toLowerCase(), `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`);
            }
          }
        }

        // Add stat shard icons (proper DDragon URLs)
        const statShards = new Map<string, string>();
        const shardIcons: Record<string, string> = {
          'adaptive force': 'perk-images/StatMods/StatModsAdaptiveForceIcon.png',
          'attack speed': 'perk-images/StatMods/StatModsAttackSpeedIcon.png',
          'ability haste': 'perk-images/StatMods/StatModsCDRScalingIcon.png',
          'cooldown reduction': 'perk-images/StatMods/StatModsCDRScalingIcon.png',
          'armor': 'perk-images/StatMods/StatModsArmorIcon.png',
          'magic resist': 'perk-images/StatMods/StatModsMagicResIcon.png',
          'magic resistance': 'perk-images/StatMods/StatModsMagicResIcon.png',
          'health': 'perk-images/StatMods/StatModsHealthScalingIcon.png',
          'health scaling': 'perk-images/StatMods/StatModsHealthScalingIcon.png',
          'move speed': 'perk-images/StatMods/StatModsMovementSpeedIcon.png',
          'movement speed': 'perk-images/StatMods/StatModsMovementSpeedIcon.png',
          'tenacity': 'perk-images/StatMods/StatModsTenacityIcon.png',
          'tenacity and slow resist': 'perk-images/StatMods/StatModsTenacityIcon.png',
          'slow resist': 'perk-images/StatMods/StatModsTenacityIcon.png',
        };
        for (const [name, iconPath] of Object.entries(shardIcons)) {
          const url = `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`;
          statShards.set(name, url);
          runes.set(name, url);
        }

        const abilities = new Map<string, string>();
        setIconLookups({ items, itemIds, spells, runes, statShards, abilities, version, itemFullData });
      } catch (err) {
        console.error('Failed to load DDragon data:', err);
      }
    })();
  }, []);

  // ── Fetch RAG status from backend every 3s ────────────────
  useEffect(() => {
    let ragPoll: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      await backendReady;
      if (cancelled) return;

      const fetchRag = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/rag/status`);
          const data = await res.json();
          setRagStatus(data);
        } catch { /* backend not ready yet */ }
      };
      const fetchSettings = async () => {
        try {
          const s = await ipcInvoke('get-settings');
          setSettings(s);
        } catch { /* ignore */ }
      };

      fetchRag();
      fetchSettings();
      ragPoll = setInterval(fetchRag, 3000);
    })();

    return () => {
      cancelled = true;
      if (ragPoll) clearInterval(ragPoll);
    };
  }, []);

  const handleForceSync = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/rag/sync`, { method: 'POST' });
      // RAG status will update on next poll (3s)
    } catch { /* ignore */ }
  }, []);

  // Track when overlay data is sent
  const origOverlayHasData = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (!myChampion) return;
    // Don't generate if DDragon hasn't loaded yet
    if (!patchVersion || patchVersion === '...') {
      console.warn('[App] handleGenerate called before patchVersion is ready, skipping');
      return;
    }
    setStatus('fetching');
    setBuildResult(null);
    setRunesModel('');
    setBuildModel('');
    // Don't reset buildGeneratedRef here — auto-detect will unlock on new champ select session

    const requestBody = { patch: patchVersion, myChampion, role, allies, enemies, model: selectedModel, generationMode: settings.generationMode || 'flash' };
    console.log('[App] Generate request:', JSON.stringify({ ...requestBody, allies: requestBody.allies?.length, enemies: requestBody.enemies?.length }));

    try {
      const response = await fetch(`${API_BASE}/api/build-dual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'Unknown error' }));
        setBuildResult({ ok: false, source: 'error', text: '', message: errData.message || 'Failed', canRetry: true } as any);
        setStatus('error');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setBuildResult({ ok: false, source: 'error', text: '', message: 'No stream', canRetry: true } as any);
        setStatus('error');
        return;
      }

      const decoder = new TextDecoder();
      let runesStreamedText = '';
      let fullStreamedText = '';
      let patchUsed = '';
      let source = 'grounded';
      let runesFinalText = '';
      let fullFinalText = '';
      let runesAutoImported = false;
      let fullPhaseDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));

            if (payload.patchUsed) patchUsed = payload.patchUsed;
            if (payload.source) source = payload.source;

            // ── Flash: Runes phase ──
            if (payload.phase === 'runes') {
              if (payload.chunk) {
                runesStreamedText += payload.chunk;
                // Show Flash runes until Pro's full build is done
                if (!fullPhaseDone) {
                  setBuildResult({ ok: true, source: 'grounded', patchDetected: patchUsed, text: runesStreamedText } as BuildResponse);
                }
              }
              if (payload.corrected) runesFinalText = payload.corrected;
              if (payload.done) {
                runesFinalText = payload.fullText || runesFinalText || runesStreamedText;
                if (payload.model) setRunesModel(payload.model);
                console.log('[App] Flash runes ready — auto-importing...');

                // Auto-import runes IMMEDIATELY from Flash
                if (!runesAutoImported) {
                  runesAutoImported = true;
                  const runeText = runesFinalText;
                  (async () => {
                    try {
                      const currentSettings = await ipcInvoke('get-settings');
                      if (currentSettings.autoExportRunes) {
                        const runeResult = await ipcInvoke('export-runes', { championName: myChampion, rawText: runeText });
                        if (runeResult?.ok) {
                          console.log('[App] Flash rune auto-import succeeded!');
                        } else {
                          console.warn('[App] Flash rune auto-import failed:', runeResult?.error);
                        }
                      }
                    } catch (err: any) {
                      console.error('[App] Flash rune auto-import error:', err.message);
                    }
                  })();
                }
              }
            }

            // ── Pro: Full build phase ──
            if (payload.phase === 'full') {
              if (payload.error) {
                // Pro model failed — backend will retry with Flash. Reset streamed text.
                console.warn('[App] Pro full build error (retrying with Flash):', payload.error);
                fullStreamedText = '';
              }
              if (payload.chunk) {
                fullStreamedText += payload.chunk;
                // Only start showing Pro's text once it has enough content (RUNES section at minimum)
                if (fullStreamedText.includes('CORE BUILD') || fullStreamedText.length > 500) {
                  setBuildResult({ ok: true, source, patchDetected: patchUsed, text: fullStreamedText } as BuildResponse);
                }
              }
              if (payload.corrected) fullFinalText = payload.corrected;
              if (payload.done) {
                fullPhaseDone = true;
                fullFinalText = payload.fullText || fullFinalText || fullStreamedText;
                source = payload.source || source;
                if (payload.model) setBuildModel(payload.model);
                // Immediately show the final Pro build
                setBuildResult({ ok: true, source: source as any, patchDetected: patchUsed, text: fullFinalText } as BuildResponse);
              }
            }

            // Handle non-phased events (cache hit returns without phase prefix in chunk)
            if (!payload.phase && payload.chunk) {
              fullStreamedText += payload.chunk;
              setBuildResult({ ok: true, source, patchDetected: patchUsed, text: fullStreamedText } as BuildResponse);
            }
            if (!payload.phase && payload.done) {
              fullFinalText = payload.fullText || fullStreamedText;
              source = payload.source || source;
            }

            if (payload.error && !payload.phase) {
              setBuildResult({ ok: false, source: 'error', text: fullStreamedText || runesStreamedText, message: payload.error, canRetry: true } as any);
              setStatus('error');
              return;
            }
          } catch { /* skip malformed lines */ }
        }
      }

      // Use Pro's full build as the final result (it has items, power spikes, win condition, etc.)
      const proComplete = !!(fullFinalText || fullStreamedText);
      const text = fullFinalText || fullStreamedText || runesFinalText || runesStreamedText;
      const data: BuildResponse = { ok: true, source: source as any, patchDetected: patchUsed, text };
      setBuildResult(data);

      if (data.ok) {
        setStatus(data.source === 'grounded' ? 'grounded' : data.source === 'cache' ? 'cache' : 'stale-cache');
        buildGeneratedRef.current = true; // Lock champion detection — no more Viego re-gen

        // Only send overlay/advisor/item-export when Pro's FULL build is available
        if (data.text && proComplete) {
          const overlayPayload = extractOverlayData(data.text, role, iconLookups, ddragonVersion, myChampion);
          // Ensure overlay window exists before sending data
          ipcInvoke('overlay-ensure').then(() => {
            ipcSend('overlay-data', overlayPayload);
          });
          setOverlayHasData(true);
          overlayHasDataRef.current = true;
          console.log('[App] 🧠 Pro full build sent to overlay');

          // Store build text for live advisor (Pro) and auto-start it
          ipcSend('store-original-build', data.text);
          ipcInvoke('live-advisor-start').then(() => setLiveAdvisorActive(true));

          // Auto-export item sets from Pro's full build
          (async () => {
            const currentSettings = await ipcInvoke('get-settings');

            // Re-export runes from Pro's full build (more accurate than Flash)
            if (currentSettings.autoExportRunes) {
              try {
                await ipcInvoke('export-runes', { championName: myChampion, rawText: data.text });
                console.log('[App] 🧠 Pro rune re-export succeeded');
              } catch {}
            }

            if (currentSettings.autoExportItemSet && iconLookups?.itemIds) {
              console.log('[App] 🧠 Auto-exporting item set from Pro build...');
              const itemIdMap: Record<string, string> = {};
              iconLookups.itemIds.forEach((id, name) => { itemIdMap[name] = id; });
              ipcInvoke('export-item-set', {
                championId: myChampion,
                title: `DC: ${myChampion} ${role || ''}`.trim(),
                rawText: data.text,
                itemIdMap,
              });
            }
          })();
        }
      } else {
        setStatus('error');
      }
    } catch (err: any) {
      setBuildResult({ ok: false, source: 'error', message: err.message, canRetry: true });
      setStatus('error');
    }
  }, [myChampion, role, allies, enemies, selectedModel, iconLookups, patchVersion, settings]);

  // ── Auto-generate when all 10 champions are locked in ──
  useEffect(() => {
    if (!autoDetect) return;
    if (status === 'fetching') return; // Already generating — don't stack duplicate calls
    // Need: 1 myChampion + 4 allies + 5 enemies = 10
    if (!myChampion || allies.length < 4 || enemies.length < 5) return;
    // Don't auto-generate until DDragon data is loaded
    if (!patchVersion || patchVersion === '...') return;
    // Build a key so we don't re-trigger for the same exact draft
    const comboKey = `${myChampion}|${role}|${[...allies].sort().join(',')}|${[...enemies].sort().join(',')}`;
    if (autoGenKeyRef.current === comboKey) return;
    autoGenKeyRef.current = comboKey;
    console.log('[App] All 10 champions detected — auto-generating build');
    handleGenerate();
  }, [autoDetect, myChampion, role, allies, enemies, status, handleGenerate, patchVersion]);

  // Listen for force-regenerate from main process (CTRL+SHIFT+G)
  useEffect(() => {
    const handler = () => {
      console.log('[App] Force regenerate received from main');
      handleGenerate();
    };
    ipcOn('force-regenerate', handler);
    return () => {
      ipcRemoveListener('force-regenerate', handler);
    };
  }, [handleGenerate]);

  const handleClearAll = useCallback(() => {
    setMyChampion('');
    setAllies([]);
    setEnemies([]);
    setBuildResult(null);
    setStatus('idle');
  }, []);

  // Auto-detect: poll LCU for champ select session, with in-game fallback
  const pollLCU = useCallback(async () => {
    console.log('[Auto-detect] pollLCU tick');
    try {
      // ── Attempt 1: Champ Select (LCU API) ──
      const result = await ipcInvoke('lcu-champ-select');
      console.log('[Auto-detect] lcu-champ-select result:', JSON.stringify(result)?.substring(0, 300));
      if (result?.ok) {
        setAutoDetectStatus('connected');
        // Only reset lock when a genuinely NEW champ select session starts
        // (not on every 2s poll tick — that was causing 3-4x duplicate builds)
        const session = result.session;
        const sessionId = `${session.localPlayerCellId}-${session.gameId || session.counter || 'x'}`;
        if (lastSessionIdRef.current !== sessionId) {
          lastSessionIdRef.current = sessionId;
          buildGeneratedRef.current = false;
          autoGenKeyRef.current = '';
          console.log('[App] New champ select session detected — unlocking auto-generate');
        }
        const localCellId = session.localPlayerCellId;
        const keyMap = champKeyMapRef.current;

        const myPick = session.myTeam?.find((p: any) => p.cellId === localCellId);
        if (myPick && myPick.championId && myPick.championId !== 0) {
          const champ = keyMap.get(String(myPick.championId));
          if (champ) setMyChampion(champ.id);
        }

        if (myPick?.assignedPosition) {
          const mappedRole = LCU_POSITION_MAP[myPick.assignedPosition.toLowerCase()];
          if (mappedRole) setRole(mappedRole);
        }

        const allyIds: string[] = [];
        for (const p of session.myTeam || []) {
          if (p.cellId === localCellId) continue;
          if (p.championId && p.championId !== 0) {
            const champ = keyMap.get(String(p.championId));
            if (champ) allyIds.push(champ.id);
          }
        }
        // Only update if we have at least as many picks as before
        if (allyIds.length > 0) {
          setAllies(prev => allyIds.length >= prev.length ? allyIds : prev);
        }

        const enemyIds: string[] = [];
        for (const p of session.theirTeam || []) {
          if (p.championId && p.championId !== 0) {
            const champ = keyMap.get(String(p.championId));
            if (champ) enemyIds.push(champ.id);
          }
        }
        if (enemyIds.length > 0) {
          setEnemies(prev => enemyIds.length >= prev.length ? enemyIds : prev);
        }
        return; // champ select worked, no fallback needed
      }

      // ── Attempt 2: Live Game (port 2999 API) ──
      // IMPORTANT: Once a build is generated, do NOT update champions from live game.
      // Viego's passive changes his championName mid-game, which would trigger re-generation.
      if (buildGeneratedRef.current) {
        // Build already generated — just maintain connection status, don't update champs
        try {
          const liveResult = await ipcInvoke('lcu-live-game');
          if (liveResult?.ok) {
            setAutoDetectStatus('connected');
            // Show overlay when in-game (reliable fallback for SSE)
            if (!overlayShownRef.current && overlayHasDataRef.current) {
              overlayShownRef.current = true;
              console.log('[App] Showing overlay (live game detected by poll)');
              ipcInvoke('overlay-ensure').then(() => ipcInvoke('overlay-show'));
            }
          }
        } catch {}
        return;
      }

      const liveResult = await ipcInvoke('lcu-live-game');
      console.log('[Auto-detect] lcu-live-game result:', liveResult?.ok ? 'connected' : 'not in game');
      if (liveResult?.ok) {
        setAutoDetectStatus('connected');
        const keyMap = champKeyMapRef.current;

        // Resolve champion name → DDragon ID (keyMap is keyed by champion key,
        // so we need a reverse name lookup)
        const nameToId = new Map<string, string>();
        for (const [, val] of keyMap) {
          nameToId.set(val.name.toLowerCase(), val.id);
        }
        // Also add exact IDs (e.g. "Aatrox" → "Aatrox")
        for (const [, val] of keyMap) {
          nameToId.set(val.id.toLowerCase(), val.id);
        }

        const resolveChamp = (name: string): string | null => {
          const lower = name.toLowerCase();
          // Try exact name match
          if (nameToId.has(lower)) return nameToId.get(lower)!;
          // Try without spaces/special chars
          const stripped = lower.replace(/['\s]/g, '');
          for (const [key, id] of nameToId) {
            if (key.replace(/['\s]/g, '') === stripped) return id;
          }
          return null;
        };

        // Set my champion
        const myChampId = resolveChamp(liveResult.myChampion);
        if (myChampId) setMyChampion(myChampId);

        // Set role — map 'bottom' → 'adc' for frontend consistency
        if (liveResult.myPosition) {
          const LIVE_ROLE_MAP: Record<string, Role> = {
            top: 'top', jungle: 'jungle', mid: 'mid', bottom: 'adc', support: 'support',
          };
          const mappedRole = LIVE_ROLE_MAP[liveResult.myPosition];
          if (mappedRole) setRole(mappedRole);
        }

        // Set allies
        const liveAllies: string[] = [];
        for (const name of liveResult.allies || []) {
          const id = resolveChamp(name);
          if (id) liveAllies.push(id);
        }
        if (liveAllies.length > 0) {
          setAllies(prev => liveAllies.length >= prev.length ? liveAllies : prev);
        }

        // Set enemies
        const liveEnemies: string[] = [];
        for (const name of liveResult.enemies || []) {
          const id = resolveChamp(name);
          if (id) liveEnemies.push(id);
        }
        if (liveEnemies.length > 0) {
          setEnemies(prev => liveEnemies.length >= prev.length ? liveEnemies : prev);
        }

        // Show overlay when in-game (reliable fallback for SSE)
        if (!overlayShownRef.current && overlayHasDataRef.current) {
          overlayShownRef.current = true;
          console.log('[App] Showing overlay (live game first detection)');
          ipcInvoke('overlay-ensure').then(() => ipcInvoke('overlay-show'));
        }
        return;
      }

      // Neither champ select nor live game available
      // If overlay was shown, hide it (game ended)
      if (overlayShownRef.current) {
        overlayShownRef.current = false;
        console.log('[App] Hiding overlay (no game detected)');
        ipcInvoke('overlay-hide');
      }
      setAutoDetectStatus('searching');
    } catch (err: any) {
      console.warn('[Auto-detect] Poll error:', err?.message || err);
      setAutoDetectStatus('searching');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (autoDetect) {
      setAutoDetectStatus('searching');
      console.log('[App] Auto-detect ON — starting LCU polling');
      // Small initial delay to let bridge initialize, then poll every 2s
      const initialTimer = setTimeout(() => {
        if (cancelled) return;
        pollLCU();
        autoDetectRef.current = setInterval(pollLCU, 2000);
      }, 1500);

      return () => {
        cancelled = true;
        clearTimeout(initialTimer);
        if (autoDetectRef.current) {
          clearInterval(autoDetectRef.current);
          autoDetectRef.current = null;
        }
      };
    } else {
      setAutoDetectStatus('off');
      return () => {
        cancelled = true;
        if (autoDetectRef.current) {
          clearInterval(autoDetectRef.current);
          autoDetectRef.current = null;
        }
      };
    }
  }, [autoDetect, pollLCU]);

  const getChampIconUrl = (champId: string) =>
    ddragonVersion ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champId}.png` : '';

  const handleSettingChange = useCallback(async (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await ipcInvoke('set-setting', key, value);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          {/* Logo removed — sidecar doesn't serve /logo */}
          <h1>DraftCoach</h1>
        </div>
        <div className="header-meta">
          <span className="header-tag">Patch <span className="value"> {patchVersion}</span></span>
          <span className={`rag-badge ${ragStatus.isUpdating ? 'rag-badge-syncing' : ragStatus.patch ? 'rag-badge-ok' : 'rag-badge-idle'}`}>
            <span className="rag-badge-dot" />
            {ragStatus.isUpdating ? 'RAG: Syncing...' : ragStatus.patch ? `RAG: Patch ${ragStatus.patch}` : 'RAG: Idle'}
          </span>
          <span className={`rag-badge ${riotApiStatus.status === 'valid' ? 'riot-badge-ok' : riotApiStatus.status === 'expired' ? 'riot-badge-expired' : riotApiStatus.status === 'checking' ? 'rag-badge-syncing' : 'rag-badge-idle'}`}>
            <span className="rag-badge-dot" />
            {riotApiStatus.status === 'valid'
              ? `Riot API: ${riotApiStatus.remainingMs != null ? (() => { const h = Math.floor(riotApiStatus.remainingMs / 3600000); const m = Math.floor((riotApiStatus.remainingMs % 3600000) / 60000); return `${h}h ${m}m left`; })() : 'Active'}`
              : riotApiStatus.status === 'expired' ? 'Riot API: Expired!'
              : riotApiStatus.status === 'checking' ? 'Riot API: Checking...'
              : riotApiStatus.status === 'no-key' ? 'Riot API: No Key'
              : 'Riot API: Unknown'}
          </span>
          <button className="btn-force-sync" onClick={handleForceSync} title="Force re-sync RAG patch data from the web">
            Force Sync Data
          </button>
          <button className="btn-force-sync" onClick={() => ipcInvoke('open-stats-window')} title="Open your stats profile window">
            My Stats
          </button>
          <div className="model-selector">
            <select
              className="model-select"
              value={selectedModel}
              onChange={async (e) => {
                const model = e.target.value as GeminiModel;
                setSelectedModel(model);
                if (model === 'gemini-3-flash-preview') {
                  await handleSettingChange('generationMode', 'flash');
                } else {
                  await handleSettingChange('generationMode', 'hybrid');
                }
              }}
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <span className="grounding-badge">
            <span className="grounding-dot" />
            Grounding: ON
          </span>
          <div className="ping-monitor" title={`Ping: ${pingData.ping ?? '—'}ms\nAvg: ${pingData.avgPing ?? '—'}ms\nJitter: ${pingData.jitter ?? '—'}ms\nPacket Loss: ${pingData.packetLoss ?? 0}%\nStatus: ${pingData.status}`}>
            <div className={`ping-bar ping-bar-${pingData.status}`}>
              <div className="ping-bar-fill" style={{ width: `${Math.min(100, Math.max(5, pingData.ping ? (1 - pingData.ping / 200) * 100 : 0))}%` }} />
            </div>
            <span className={`ping-value ping-${pingData.status}`}>
              {pingData.ping !== null ? pingData.ping : '—'}
            </span>
            <span className="ping-unit">ms</span>
            {pingData.packetLoss > 0 && (
              <span className="ping-loss">
                <svg className="warn-icon" viewBox="0 0 10 10" style={{width:9,height:9,verticalAlign:'middle',marginRight:2}}><path d="M5 1 L9 9 L1 9 Z" fill="none" stroke="#E84057" strokeWidth="1.2"/><line x1="5" y1="4" x2="5" y2="6" stroke="#E84057" strokeWidth="1.2"/><circle cx="5" cy="7.5" r="0.6" fill="#E84057"/></svg>
                {pingData.packetLoss}%
              </span>
            )}
          </div>
          <button className="btn-settings-toggle" onClick={() => setSettingsOpen(v => !v)} title="Settings">
            <svg className="gear-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4"/>
            </svg>
          </button>
          <div className="window-controls">
            <button className="win-ctrl-btn win-minimize" onClick={minimizeCurrentWindow} title="Minimize">
              <svg width="10" height="1" viewBox="0 0 10 1"><rect fill="currentColor" width="10" height="1"/></svg>
            </button>
            <button className="win-ctrl-btn win-maximize" onClick={toggleMaximizeCurrentWindow} title="Maximize">
              <svg width="10" height="10" viewBox="0 0 10 10"><rect fill="none" stroke="currentColor" strokeWidth="1" width="8" height="8" x="1" y="1"/></svg>
            </button>
            <button className="win-ctrl-btn win-close" onClick={closeCurrentWindow} title="Close">
              <svg width="10" height="10" viewBox="0 0 10 10"><path stroke="currentColor" strokeWidth="1.2" fill="none" d="M1,1 L9,9 M9,1 L1,9"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="main">
        <div className="left-panel">
          <div className="panel-title-row">
            <div className="panel-title">Draft Setup</div>
            <div className="panel-actions">
              <button
                className={`btn-auto-detect ${autoDetect ? 'btn-auto-detect-active' : ''}`}
                onClick={() => setAutoDetect((v) => !v)}
                title="Auto-detect champions from League client"
              >
                <span className={`auto-detect-dot auto-detect-dot-${autoDetectStatus}`} />
                Auto
              </button>
              <button className="btn-clear-all" onClick={handleClearAll} title="Clear all selections">
                <svg className="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9M7 8v4M9 8v4"/></svg>
                Clear
              </button>
            </div>
          </div>

          {autoDetect && (
            <div className={`auto-detect-bar auto-detect-${autoDetectStatus}`}>
              {autoDetectStatus === 'searching' && 'Searching for League client...'}
              {autoDetectStatus === 'connected' && 'Connected — reading champion select'}
              {autoDetectStatus === 'error' && 'Could not connect to League client'}
              {autoDetectStatus === 'off' && ''}
            </div>
          )}

          <div className="field-group">
            <label>Role</label>
            <div className="role-picker">
              {ROLES.map((r) => (
                <button
                  key={r}
                  className={`role-btn ${role === r ? 'role-btn-active' : ''}`}
                  onClick={() => setRole(r)}
                  title={r.charAt(0).toUpperCase() + r.slice(1)}
                >
                  <img src={ROLE_ICON_URLS[r]} alt={r} className="role-icon-img" />
                  <span className="role-label">{r === 'adc' ? 'ADC' : r.charAt(0).toUpperCase() + r.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label>Your Champion</label>
            <ChampionPicker
              champions={champions} selected={myChampion ? [myChampion] : []}
              onSelect={(id) => setMyChampion(id)} onRemove={() => setMyChampion('')}
              max={1} getIconUrl={getChampIconUrl}
            />
          </div>

          <div className="team-section">
            <h3>Allies (up to 4)</h3>
            <ChampionPicker
              champions={champions} selected={allies}
              onSelect={(id) => setAllies((p) => p.length < 4 ? [...p, id] : p)}
              onRemove={(id) => setAllies((p) => p.filter((a) => a !== id))}
              max={4} getIconUrl={getChampIconUrl}
            />
          </div>

          <div className="team-section">
            <h3>Enemies (up to 5)</h3>
            <ChampionPicker
              champions={champions} selected={enemies}
              onSelect={(id) => setEnemies((p) => p.length < 5 ? [...p, id] : p)}
              onRemove={(id) => setEnemies((p) => p.filter((e_) => e_ !== id))}
              max={5} getIconUrl={getChampIconUrl}
            />
          </div>

          <button className="btn-generate" onClick={handleGenerate} disabled={!myChampion || status === 'fetching'}>
            {status === 'fetching' ? (
              <><span className="btn-generate-spinner" />Generating...</>
            ) : (
              <>
                <svg className="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14L12 4M9 2h5v5M6 10l-2 2 2 2"/></svg>
                Generate Build
              </>
            )}
          </button>
        </div>

        <div className="right-panel">
          <BuildOutput result={buildResult} iconLookups={iconLookups} loading={status === 'fetching'} championId={myChampion} role={role} liveUpdatedItems={liveUpdatedItems} enemies={enemies} />

          {/* ── Live Advisor Panel ── */}
          <div className="live-advisor-section">
            <div className="live-advisor-header">
              <span className="live-advisor-title">
                <span className={`live-advisor-dot ${liveAdvisorActive ? 'active' : ''}`} />
                Live Advisor
              </span>
              <button
                className={`live-advisor-toggle ${liveAdvisorActive ? 'active' : ''}`}
                onClick={async () => {
                  if (liveAdvisorActive) {
                    await ipcInvoke('live-advisor-stop');
                    setLiveAdvisorActive(false);
                    setLiveAdvice(null);
                  } else {
                    await ipcInvoke('live-advisor-start');
                    setLiveAdvisorActive(true);
                  }
                }}
              >
                {liveAdvisorActive ? 'Stop' : 'Start'}
              </button>
            </div>

            {liveAdvisorActive && !liveAdvice && (
              <div className="live-advisor-waiting">
                Monitoring game... Advice will appear when triggered.
              </div>
            )}

            {liveAdvice && (
              <div className="live-advisor-card">
                <div className="live-advisor-trigger">
                  {liveAdvice.triggerReason}
                  <span className="live-advisor-time">
                    {Math.floor((liveAdvice.gameTime || 0) / 60)}:{String(Math.floor((liveAdvice.gameTime || 0) % 60)).padStart(2, '0')}
                  </span>
                </div>
                <div className="live-advisor-summary">{liveAdvice.summary}</div>

                {liveAdvice.changes && liveAdvice.changes.length > 0 && (
                  <div className="live-advisor-changes">
                    <div className="live-advisor-changes-title">Item Changes</div>
                    {liveAdvice.changes.map((c: any, i: number) => {
                      const getIcon = (name: string) => {
                        if (!iconLookups) return '';
                        const norm = name.toLowerCase().trim();
                        let url = iconLookups.items.get(norm);
                        if (!url) {
                          for (const [key, val] of iconLookups.items.entries()) {
                            if (key === norm || key.startsWith(norm + ' ') || norm.startsWith(key + ' ')) { url = val; break; }
                          }
                        }
                        return url || '';
                      };
                      const oldIcon = getIcon(c.currentItem);
                      const newIcon = getIcon(c.recommendedItem);
                      return (
                        <div key={i} className="advisor-change-row">
                          <div className="advisor-item-slot">
                            {oldIcon ? <img src={oldIcon} className="advisor-item-icon" alt={c.currentItem} title={c.currentItem} /> : <div className="advisor-item-placeholder" />}
                            <span className="advisor-item-name old">{c.currentItem}</span>
                          </div>
                          <span className="advisor-arrow">→</span>
                          <div className="advisor-item-slot">
                            {newIcon ? <img src={newIcon} className="advisor-item-icon new" alt={c.recommendedItem} title={c.recommendedItem} /> : <div className="advisor-item-placeholder" />}
                            <span className="advisor-item-name new">{c.recommendedItem}</span>
                          </div>
                          {c.reason && <div className="advisor-change-reason">{c.reason}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Next Items visual */}
                {(() => {
                  const raw = liveAdvice.rawText || '';
                  const nextSection = raw.match(/NEXT ITEMS?\n([\s\S]*?)(?=\nTHREAT|\n\n|$)/);
                  if (!nextSection) return null;
                  const itemLines = nextSection[1].trim().split('\n').filter((l: string) => l.trim());
                  if (itemLines.length === 0) return null;
                  const getIcon = (name: string) => {
                    if (!iconLookups) return '';
                    const norm = name.toLowerCase().trim();
                    let url = iconLookups.items.get(norm);
                    if (!url) {
                      for (const [key, val] of iconLookups.items.entries()) {
                        if (key === norm || key.startsWith(norm + ' ') || norm.startsWith(key + ' ')) { url = val; break; }
                      }
                    }
                    return url || '';
                  };
                  const parsed = itemLines.map((line: string) => {
                    const cleaned = line.replace(/^\d+\.\s*/, '').trim();
                    const colonIdx = cleaned.indexOf(':');
                    const name = colonIdx > 0 ? cleaned.substring(0, colonIdx).trim() : cleaned;
                    const reason = colonIdx > 0 ? cleaned.substring(colonIdx + 1).trim() : '';
                    return { name, reason, icon: getIcon(name) };
                  });
                  return (
                    <div className="advisor-next-item">
                      <div className="live-advisor-changes-title">Next Items</div>
                      {parsed.map((item: any, i: number) => (
                        <div key={i} className="advisor-next-row" style={{ marginBottom: i < parsed.length - 1 ? '6px' : 0 }}>
                          {item.icon ? <img src={item.icon} className="advisor-item-icon next" alt={item.name} title={item.name} /> : <div className="advisor-item-placeholder" />}
                          <div className="advisor-next-info">
                            <span className="advisor-item-name new">{i + 1}. {item.name}</span>
                            {item.reason && <span className="advisor-next-reason">{item.reason}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Threat visual */}
                {(() => {
                  const raw = liveAdvice.rawText || '';
                  const threatMatch = raw.match(/THREAT\n(.+?)(?:\n\n|$)/s);
                  if (!threatMatch) return null;
                  const threatLine = threatMatch[1].trim();
                  return (
                    <div className="advisor-threat">
                      <div className="live-advisor-changes-title">
                        <svg className="warn-icon" viewBox="0 0 10 10" style={{width:11,height:11,verticalAlign:'middle',marginRight:3}}><path d="M5 1 L9 9 L1 9 Z" fill="none" stroke="#c8aa6e" strokeWidth="1.2"/><line x1="5" y1="4" x2="5" y2="6" stroke="#c8aa6e" strokeWidth="1.2"/><circle cx="5" cy="7.5" r="0.6" fill="#c8aa6e"/></svg>
                        Threat
                      </div>
                      <div className="advisor-threat-text">{threatLine}</div>
                    </div>
                  );
                })()}

                {liveAdvice.rawText && (
                  <details className="live-advisor-raw">
                    <summary>Full AI Response</summary>
                    <pre>{liveAdvice.rawText}</pre>
                  </details>
                )}

                <button className="live-advisor-dismiss" onClick={() => setLiveAdvice(null)}>Dismiss</button>
              </div>
            )}

            {/* Debug Log */}
            {advisorDebugLog.length > 0 && (
              <details className="live-advisor-raw" style={{ marginTop: '8px' }}>
                <summary>Debug Log ({advisorDebugLog.length} entries)</summary>
                <pre style={{ maxHeight: '200px', overflow: 'auto', fontSize: '10px', lineHeight: '1.6', userSelect: 'text' }}>
{advisorDebugLog.join('\n')}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>

      {/* ── Scouting Report Notification ── */}
      {(scoutReport || (scoutStatus && scoutStatus.phase !== 'done')) && (
        <div className="scout-notification" onClick={() => ipcInvoke('open-scout-window')}>
          <span>
            <svg className="scout-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="6" cy="6" r="4.5"/>
              <line x1="9.5" y1="9.5" x2="13" y2="13"/>
            </svg>
            {scoutStatus && scoutStatus.phase !== 'done' ? scoutStatus.message : 'Scouting Report Ready'}
          </span>
          <button className="scout-open-btn">Open Scout Window</button>
        </div>
      )}




      {/* ── Settings Drawer ── */}
      {settingsOpen && (
        <div className="settings-drawer">
          <div className="settings-header">
            <h2>
              <svg className="gear-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" style={{width:16,height:16,verticalAlign:'middle',marginRight:6}}>
                <circle cx="8" cy="8" r="2.5"/>
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4"/>
              </svg>
              Settings
            </h2>
            <button className="settings-close close-x-btn" onClick={() => setSettingsOpen(false)}>
              <svg width="10" height="10" viewBox="0 0 10 10"><path stroke="currentColor" strokeWidth="1.5" fill="none" d="M1,1 L9,9 M9,1 L1,9"/></svg>
            </button>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">AI & Generation</div>
            <div style={{ padding: '10px 0' }}>
              <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                Gemini API Key {settings.geminiApiKey && <span style={{ color: 'var(--accent-green)', fontSize: 10, marginLeft: 6 }}>● SAVED</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="password"
                  placeholder={settings.geminiApiKey ? '•••••••••••• (saved — paste to replace)' : 'Paste your Gemini API key here'}
                  value={geminiKeyInput}
                  onChange={e => setGeminiKeyInput(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && geminiKeyInput.trim()) {
                      setGeminiKeySaveStatus('Saving...');
                      await ipcInvoke('set-setting', 'geminiApiKey', geminiKeyInput.trim());
                      setSettings(prev => ({ ...prev, geminiApiKey: geminiKeyInput.trim() }));
                      setGeminiKeyInput('');
                      setGeminiKeySaveStatus('Saved! Restart the app to apply.');
                      setTimeout(() => setGeminiKeySaveStatus(''), 5000);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={async () => {
                    if (!geminiKeyInput.trim()) {
                      setGeminiKeySaveStatus('Please enter a key first');
                      setTimeout(() => setGeminiKeySaveStatus(''), 3000);
                      return;
                    }
                    setGeminiKeySaveStatus('Saving...');
                    const result = await ipcInvoke('set-setting', 'geminiApiKey', geminiKeyInput.trim());
                    if (result === null) {
                      setGeminiKeySaveStatus('Failed — backend not running');
                      setTimeout(() => setGeminiKeySaveStatus(''), 5000);
                      return;
                    }
                    setSettings(prev => ({ ...prev, geminiApiKey: geminiKeyInput.trim() }));
                    setGeminiKeyInput('');
                    setGeminiKeySaveStatus('Saved! Restart app to apply.');
                    setTimeout(() => setGeminiKeySaveStatus(''), 5000);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(180deg, #C8AA6E 0%, #785A28 100%)',
                    border: '1px solid #C8AA6E',
                    borderRadius: 4,
                    color: '#010A13',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Save Key
                </button>
              </div>
              {geminiKeySaveStatus && (
                <div style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: geminiKeySaveStatus.includes('Saved') ? 'var(--accent-green)' :
                         geminiKeySaveStatus.includes('Failed') ? '#E84057' : 'var(--text-secondary)',
                }}>
                  {geminiKeySaveStatus}
                </div>
              )}
              <div className="settings-desc" style={{ marginTop: 8 }}>
                Get your API key at <span style={{ color: 'var(--gold)' }}>https://aistudio.google.com/apikey</span>
              </div>
            </div>
            <label className="settings-toggle-row" style={{ marginTop: 10 }}>
              <span>Generation Mode</span>
              <select
                className="game-mode-select"
                style={{ width: '150px' }}
                value={settings.generationMode || 'flash'}
                onChange={e => handleSettingChange('generationMode', e.target.value)}
              >
                <option value="hybrid">Hybrid (Flash & Pro)</option>
                <option value="flash">Speed (Flash Only)</option>
              </select>
            </label>
            <div className="settings-desc">
              Hybrid uses Pro for deeper analysis (~22s). Speed uses Flash for instant results (~7s).
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">General</div>
            <label className="settings-toggle-row">
              <span>LCU Auto-Connect</span>
              <input type="checkbox" checked={!!settings.lcuAutoConnect} onChange={e => handleSettingChange('lcuAutoConnect', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Auto-Export Runes</span>
              <input type="checkbox" checked={!!settings.autoExportRunes} onChange={e => handleSettingChange('autoExportRunes', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Auto-Export Item Set</span>
              <input type="checkbox" checked={!!settings.autoExportItemSet} onChange={e => handleSettingChange('autoExportItemSet', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Show Confidence</span>
              <input type="checkbox" checked={!!settings.showConfidence} onChange={e => handleSettingChange('showConfidence', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Show Threat Timers</span>
              <input type="checkbox" checked={!!settings.showThreatTimers} onChange={e => handleSettingChange('showThreatTimers', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Auto-Open Scout Window</span>
              <input type="checkbox" checked={settings.autoOpenScout !== false} onChange={e => handleSettingChange('autoOpenScout', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Auto-Open Scoreboard</span>
              <input type="checkbox" checked={settings.autoOpenScoreboard !== false} onChange={e => handleSettingChange('autoOpenScoreboard', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Auto-Open Stats (Post-Game)</span>
              <input type="checkbox" checked={settings.autoOpenStats !== false} onChange={e => handleSettingChange('autoOpenStats', e.target.checked)} />
            </label>
            <label className="settings-toggle-row">
              <span>Show Jungle Pathing</span>
              <input type="checkbox" checked={settings.showJunglePathing !== false} onChange={e => handleSettingChange('showJunglePathing', e.target.checked)} />
            </label>
            <div className="settings-toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
              <span>Overlay Opacity: {Math.round((settings.overlayOpacity ?? 0.9) * 100)}%</span>
              <input type="range" min="10" max="100" step="5" value={Math.round((settings.overlayOpacity ?? 0.9) * 100)}
                onChange={e => handleSettingChange('overlayOpacity', parseInt(e.target.value) / 100)}
                style={{ width: '100%', accentColor: '#c8aa6e' }} />
            </div>
            <div className="settings-toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
              <span>Overlay Scale: {Math.round((settings.overlayScale ?? 1) * 100)}%</span>
              <input type="range" min="50" max="200" step="10" value={Math.round((settings.overlayScale ?? 1) * 100)}
                onChange={e => handleSettingChange('overlayScale', parseInt(e.target.value) / 100)}
                style={{ width: '100%', accentColor: '#c8aa6e' }} />
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">
              <svg className="section-title-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="7" cy="7" r="5.5"/>
                <ellipse cx="7" cy="7" rx="2.5" ry="5.5"/>
                <line x1="1.5" y1="7" x2="12.5" y2="7"/>
              </svg>
              Network
            </div>
            <div className="settings-toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
              <span>Server Region</span>
              <select
                className="model-select" style={{ width: '100%' }}
                value={settings.serverRegion || 'EUW1'}
                onChange={e => {
                  handleSettingChange('serverRegion', e.target.value);
                  ipcSend('set-ping-region', e.target.value);
                }}
              >
                <option value="EUW1">EU West (EUW)</option>
                <option value="EUNE">EU Nordic &amp; East (EUNE)</option>
                <option value="NA">North America (NA)</option>
                <option value="KR">Korea (KR)</option>
                <option value="JP">Japan (JP)</option>
                <option value="BR">Brazil (BR)</option>
                <option value="LAN">Latin America North</option>
                <option value="LAS">Latin America South</option>
                <option value="OCE">Oceania (OCE)</option>
                <option value="TR">Turkey (TR)</option>
                <option value="RU">Russia (RU)</option>
                <option value="PH">Philippines (PH)</option>
                <option value="SG">Singapore (SG)</option>
                <option value="TH">Thailand (TH)</option>
                <option value="TW">Taiwan (TW)</option>
                <option value="VN">Vietnam (VN)</option>
              </select>
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">
              <svg className="section-title-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M7 1C4.5 1 2.5 3 2.5 5.5C2.5 7 3.2 8.3 4.3 9.1L2 13h3l1-2h3l1 2h3L10.5 9.1C11.6 8.3 12.3 7 12.3 5.5C12.3 3 10.3 1 7.8 1Z"/>
              </svg>
              API Keys
            </div>
            <div className="settings-path-row">
              <span className="settings-path-label">
                Riot API Key
                <span className={`footer-indicator ${riotApiStatus.status === 'valid' ? 'indicator-ok' : riotApiStatus.status === 'expired' ? 'indicator-expired' : 'indicator-idle'}`} style={{ display: 'inline-block', marginLeft: 6, verticalAlign: 'middle' }} />
              </span>
              <div className="settings-path-input-wrap">
                <input
                  type="password"
                  className="settings-path-input"
                  placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  defaultValue={settings.riotApiKey || ''}
                  id="riot-api-key-input"
                  onKeyDown={async (e: any) => {
                    if (e.key === 'Enter') {
                      const val = e.target.value.trim();
                      await ipcInvoke('set-riot-api-key', val);
                      handleSettingChange('riotApiKey', val);
                    }
                  }}
                />
                <button
                  className="settings-path-browse"
                  onClick={async () => {
                    const input = document.getElementById('riot-api-key-input') as HTMLInputElement;
                    const val = input?.value?.trim() || '';
                    await ipcInvoke('set-riot-api-key', val);
                    handleSettingChange('riotApiKey', val);
                  }}
                >Save</button>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                Get a dev key at <span style={{ color: 'var(--gold)' }}>developer.riotgames.com</span> — expires every 24h
              </span>
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">General</div>

            <div className="settings-path-row">
              <span className="settings-path-label">Game Path</span>
              <div className="settings-path-input-wrap">
                <input
                  type="text"
                  className="settings-path-input"
                  placeholder="C:\Riot Games\League of Legends"
                  value={settings.lolPath || ''}
                  onChange={e => handleSettingChange('lolPath', e.target.value || null)}
                />
                <button
                  className="settings-path-browse"
                  onClick={async () => {
                    try {
                      const { open } = await import('@tauri-apps/plugin-dialog');
                      const dir = await open({
                        directory: true,
                        multiple: false,
                        title: 'Select League of Legends Installation Folder',
                      });
                      if (dir && typeof dir === 'string') {
                        handleSettingChange('lolPath', dir);
                      }
                    } catch (err) {
                      console.error('[App] Browse failed:', err);
                    }
                  }}
                >Browse</button>
              </div>
              <span className="settings-path-hint">
                {settings.lolPath ? (
                  <><span className="sync-check" style={{display:'inline-block',width:10,height:10,marginRight:4,verticalAlign:'middle'}}></span>{settings.lolPath}</>
                ) : 'Auto-detect or set manually'}
              </span>
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">RAG Pipeline</div>
            <div className="rag-status-detail">
              <div className="rag-row">
                <span className="rag-label">Status</span>
                <span className={`rag-value ${ragStatus.isUpdating ? 'rag-updating' : ragStatus.patch ? 'rag-synced' : 'rag-idle'}`}>
                  {ragStatus.isUpdating ? (
                    <><span className="sync-spinner"></span>Syncing...</>
                  ) : ragStatus.patch ? (
                    <><span className="sync-check"></span>Synced</>
                  ) : (
                    <><span className="status-idle-dot"></span>Not synced</>
                  )}
                </span>
              </div>
              {ragStatus.patch && (
                <div className="rag-row">
                  <span className="rag-label">Patch Data</span>
                  <span className="rag-value">{ragStatus.patch}</span>
                </div>
              )}
              {ragStatus.updatedAt && (
                <div className="rag-row">
                  <span className="rag-label">Last Updated</span>
                  <span className="rag-value">{new Date(ragStatus.updatedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">Keyboard Shortcuts</div>
            <p className="settings-hint">Click a shortcut to record a new key combo. Changes apply instantly.</p>
            {HOTKEY_SETTINGS.map(({ key, label }) => (
              <HotkeyRecorder
                key={key}
                label={label}
                value={settings[key] || ''}
                onChange={async (newAcc) => {
                  await handleSettingChange(key, newAcc);
                }}
              />
            ))}
          </div>

          <div className="settings-group">
            <div className="settings-group-title">HUD & Minimap Calibration</div>
            <label className="settings-toggle-row">
              <span>Auto-Detect HUD Settings</span>
              <input
                type="checkbox"
                checked={settings.autoMinimapCalibration}
                onChange={e => handleSettingChange('autoMinimapCalibration', e.target.checked)}
              />
            </label>
            <div className="settings-row" style={{ opacity: settings.autoMinimapCalibration ? 0.5 : 1, pointerEvents: settings.autoMinimapCalibration ? 'none' : 'auto' }}>
              <span>Manual Minimap Size ({settings.minimapSize}px)</span>
              <input
                type="range" min="150" max="400" step="10"
                value={settings.minimapSize || 250}
                onChange={e => handleSettingChange('minimapSize', parseInt(e.target.value))}
              />
            </div>
            <label className="settings-toggle-row" style={{ opacity: settings.autoMinimapCalibration ? 0.5 : 1, pointerEvents: settings.autoMinimapCalibration ? 'none' : 'auto' }}>
              <span>Manual Minimap Side</span>
              <select
                value={settings.minimapPosition || 'bottom-right'}
                onChange={e => handleSettingChange('minimapPosition', e.target.value)}
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px' }}
              >
                <option value="bottom-right">Bottom Right (Default)</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </label>
            {settings.autoMinimapCalibration && (
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', fontStyle: 'italic' }}>
                * Reading resolution and scale from LoL game.cfg
              </div>
            )}
          </div>

          <div className="settings-group">
            <div className="settings-group-title">In-Game Overlay</div>
            <div className="overlay-info">
              <div className="rag-row">
                <span className="rag-label">Data Status</span>
                <span className={`rag-value ${overlayHasData ? 'rag-synced' : 'rag-idle'}`}>
                  {overlayHasData ? (
                    <><span className="sync-check"></span>Build data ready</>
                  ) : (
                    <><span className="status-idle-dot"></span>Generate a build first</>
                  )}
                </span>
              </div>
              <p className="overlay-info-text">
                The overlay appears automatically when League of Legends is running and build data is available. Use <kbd>{displayAccelerator(settings.hotkeyToggleOverlay || 'CommandOrControl+Alt+O')}</kbd> to toggle.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer Status Bar ── */}
      <footer className="footer-bar">
        <div className="footer-section">
          <span className={`footer-indicator ${ragStatus.isUpdating ? 'indicator-updating' : ragStatus.patch ? 'indicator-ok' : 'indicator-idle'}`} />
          <span className="footer-text">
            RAG: {ragStatus.isUpdating ? 'Syncing...' : ragStatus.patch ? `Patch ${ragStatus.patch}` : 'Idle'}
          </span>
        </div>
        <div className="footer-divider" />
        <div className="footer-section">
          <span className={`footer-indicator ${riotApiStatus.status === 'valid' ? 'indicator-ok' : riotApiStatus.status === 'expired' ? 'indicator-expired' : 'indicator-idle'}`} />
          <span className="footer-text">
            Riot: {riotApiStatus.status === 'valid' ? (() => { if (riotApiStatus.remainingMs == null) return 'Active'; const h = Math.floor(riotApiStatus.remainingMs / 3600000); const m = Math.floor((riotApiStatus.remainingMs % 3600000) / 60000); return `${h}h ${m}m`; })() : riotApiStatus.status === 'expired' ? 'Expired' : riotApiStatus.status === 'no-key' ? 'No Key' : '...'}
          </span>
        </div>
        <div className="footer-divider" />
        <div className="footer-section">
          <span className={`footer-indicator ${overlayHasData ? 'indicator-ok' : 'indicator-idle'}`} />
          <span className="footer-text">
            Overlay: {overlayHasData ? 'Ready' : 'No Data'}
          </span>
        </div>
        <div className="footer-divider" />
        <div className="footer-section footer-hotkeys">
          <kbd>{displayAccelerator(settings?.hotkeyToggleOverlay || 'CommandOrControl+Alt+O')}</kbd>
          <span className="footer-text">Overlay</span>
          <kbd>{displayAccelerator(settings?.hotkeyRegenerate || 'CommandOrControl+Alt+G')}</kbd>
          <span className="footer-text">Regen</span>
          <kbd>{displayAccelerator(settings?.hotkeyFocusMain || 'CommandOrControl+Alt+B')}</kbd>
          <span className="footer-text">Focus</span>
        </div>
      </footer>
    </div>
  );
}
