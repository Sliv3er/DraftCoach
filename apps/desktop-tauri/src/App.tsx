import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BuildResponse, Role, AiModel, GameMode } from './types';
import { ChampionPicker } from './components/ChampionPicker';
import { BuildOutput } from './components/BuildOutput';
import { ipcInvoke, ipcSend, ipcOn, ipcRemoveListener, minimizeCurrentWindow, closeCurrentWindow, hideCurrentWindow, toggleMaximizeCurrentWindow, backendReady, registerGlobalHotkey, unregisterAllHotkeys } from './bridge';

const API_BASE = 'http://127.0.0.1:3210';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const GAME_MODES: GameMode[] = ['sr', 'aram', 'aram-mayhem'];
const GAME_MODE_META: Record<GameMode, { label: string; shortLabel: string; badge?: string }> = {
  sr: { label: "Summoner's Rift", shortLabel: 'SR' },
  aram: { label: 'ARAM', shortLabel: 'ARAM' },
  'aram-mayhem': { label: 'ARAM Mayhem', shortLabel: 'Mayhem', badge: 'AUG' },
};

function ModeIcon({ mode, compact = false }: { mode: GameMode; compact?: boolean }) {
  return (
    <span className={`mode-glyph mode-glyph-${mode} ${compact ? 'mode-glyph-compact' : ''}`} aria-hidden="true">
      <span className="mode-glyph-stack mode-glyph-stack-back" />
      <span className="mode-glyph-stack mode-glyph-stack-mid" />
      <span className="mode-glyph-core">
        {mode === 'sr' ? (
          <>
            <span className="mode-glyph-rift mode-glyph-rift-a" />
            <span className="mode-glyph-rift mode-glyph-rift-b" />
          </>
        ) : (
          <span className="mode-glyph-bridge" />
        )}
      </span>
      {mode === 'aram-mayhem' && <span className="mode-glyph-augment" />}
    </span>
  );
}

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

const MODEL_OPTIONS: { value: AiModel; label: string; tone: string }[] = [
  { value: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash', tone: 'Best' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', tone: 'Value' },
  { value: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', tone: 'Balanced' },
  { value: 'qwen/qwen3.6-flash', label: 'Qwen3.6 Flash', tone: 'Fast' },
];

// Map LCU position strings to our Role type
const LCU_POSITION_MAP: Record<string, Role> = {
  top: 'top',
  jungle: 'jungle',
  middle: 'mid',
  bottom: 'adc',
  utility: 'support',
};

type Status = 'idle' | 'waiting-roles' | 'fetching' | 'grounded' | 'cache' | 'stale-cache' | 'meta' | 'meta-fallback' | 'error';

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

const BLOCKED_ITEM_IDS = new Set(['6701', '226701']);
const BLOCKED_ITEM_NAMES = new Set(['opportunity']);

function isCurrentStoreLookupItem(id: string, item: any) {
  const name = String(item?.name || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  if (BLOCKED_ITEM_IDS.has(String(id)) || BLOCKED_ITEM_NAMES.has(name)) return false;
  if (item?.inStore === false || item?.hideFromAll === true || item?.gold?.purchasable === false) return false;
  return item?.maps?.['11'] === true || item?.maps?.['12'] === true;
}

// ── Section keys for parsing AI output ──────────────────────────────

const SECTION_KEYS = [
  'ANALYSIS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
  'CORE BUILD', 'AUGMENTS', 'SITUATIONAL ITEMS', 'JUNGLE PATH',
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

function sectionContent(text: string, title: string): string {
  return parseSectionsFromText(text).find(s => s.title === title)?.content || '';
}

function normalizeLineList(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim()
      .replace(/\*\*/g, '')
      .replace(/^\d+[.)\s]+\s*/, '')
      .replace(/^[-*]\s*/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim())
    .filter(Boolean);
}

function diffList(before: string[], after: string[]) {
  const norm = (value: string) => value.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
  const beforeSet = new Set(before.map(norm));
  const afterSet = new Set(after.map(norm));
  return {
    added: after.filter(item => !beforeSet.has(norm(item))),
    removed: before.filter(item => !afterSet.has(norm(item))),
  };
}

function buildRefinementSummary(metaText: string, finalText: string): string[] {
  if (!metaText || !finalText) return [];
  const changes: string[] = [];

  const metaCore = normalizeLineList(sectionContent(metaText, 'CORE BUILD'));
  const finalCore = normalizeLineList(sectionContent(finalText, 'CORE BUILD'));
  const coreDiff = diffList(metaCore, finalCore);
  if (coreDiff.added.length || coreDiff.removed.length) {
    const added = coreDiff.added.slice(0, 3).join(', ');
    const removed = coreDiff.removed.slice(0, 2).join(', ');
    changes.push(`Core adjusted${added ? `: added ${added}` : ''}${removed ? `; removed ${removed}` : ''}`);
  } else if (metaCore.join('|').toLowerCase() !== finalCore.join('|').toLowerCase()) {
    changes.push('Core order refined for this draft');
  }

  const metaStarting = normalizeLineList(sectionContent(metaText, 'STARTING ITEMS'));
  const finalStarting = normalizeLineList(sectionContent(finalText, 'STARTING ITEMS'));
  const startingDiff = diffList(metaStarting, finalStarting);
  if (startingDiff.added.length || startingDiff.removed.length) {
    changes.push(`Start changed to ${finalStarting.slice(0, 2).join(' + ')}`);
  }

  const metaRunes = normalizeLineList(sectionContent(metaText, 'RUNES'));
  const finalRunes = normalizeLineList(sectionContent(finalText, 'RUNES'));
  const runeDiff = diffList(metaRunes, finalRunes);
  if (runeDiff.added.length || runeDiff.removed.length) {
    changes.push('Runes refined for matchup pressure');
  }

  const finalSituational = normalizeLineList(sectionContent(finalText, 'SITUATIONAL ITEMS'));
  if (finalSituational.length) {
    changes.push(`Situational plan added: ${finalSituational.slice(0, 2).join(', ')}`);
  }

  return changes.length ? changes.slice(0, 5) : ['AI validated the meta baseline with no major structural changes'];
}
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
  const [gameMode, setGameMode] = useState<GameMode>('sr');
  const [myChampion, setMyChampion] = useState('');
  const [allies, setAllies] = useState<string[]>([]);
  const [enemies, setEnemies] = useState<string[]>([]);
  const [enemyRoles, setEnemyRoles] = useState<Record<string, Role>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [buildResult, setBuildResult] = useState<BuildResponse | null>(null);
  const [refinementSummary, setRefinementSummary] = useState<string[]>([]);
  const [metaStatus, setMetaStatus] = useState<{ status: 'exact' | 'missing-role' | 'missing-champion'; message: string } | null>(null);
  const [roleConfirmation, setRoleConfirmation] = useState<'unknown' | 'confirmed'>('unknown');
  const [iconLookups, setIconLookups] = useState<IconLookups | null>(null);
  const [selectedModel, setSelectedModel] = useState<AiModel>('deepseek/deepseek-v4-flash');
  const [autoDetect, setAutoDetect] = useState(true);
  const [autoDetectStatus, setAutoDetectStatus] = useState<'off' | 'searching' | 'connected' | 'error'>('off');
  const autoDetectRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const champKeyMapRef = useRef<Map<string, { id: string; name: string }>>(new Map());
  const autoGenKeyRef = useRef<string>(''); // track last auto-generated combo to avoid repeated calls
  const metaPreviewKeyRef = useRef<string>(''); // track last champion/role meta preview
  const buildGeneratedRef = useRef<boolean>(false); // once a build is generated, lock champion detection
  const lastSessionIdRef = useRef<string>(''); // track champ select session to avoid resetting lock every poll tick
  const overlayShownRef = useRef<boolean>(false); // track if overlay is currently shown by polling
  const overlayHasDataRef = useRef<boolean>(false); // ref mirror for use in pollLCU callback
  const statusRef = useRef<Status>('idle');
  const draftCompleteRef = useRef<boolean>(false);
  const enemiesRef = useRef<string[]>([]);
  const enemyRolesRef = useRef<Record<string, Role>>({});
  const gameModeRef = useRef<GameMode>('sr');
  const roleConfirmationRef = useRef<'unknown' | 'confirmed'>('unknown');
  const roleResolvedKeyRef = useRef<string>('');

  // ── New UI state: RAG, overlay, settings ───────────────────────
  const [ragStatus, setRagStatus] = useState<RagStatus>({ isUpdating: false, patch: null, updatedAt: null });
  const [overlayHasData, setOverlayHasData] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState('');
  const [openrouterKeySaveStatus, setOpenrouterKeySaveStatus] = useState<string>('');
  const [runesModel, setRunesModel] = useState('');
  const [buildModel, setBuildModel] = useState('');
  const [metaPreviewLoading, setMetaPreviewLoading] = useState(false);

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

  statusRef.current = status;
  draftCompleteRef.current = Boolean(myChampion && allies.length >= 4 && enemies.length >= 5);
  enemiesRef.current = enemies;
  enemyRolesRef.current = enemyRoles;
  gameModeRef.current = gameMode;
  roleConfirmationRef.current = roleConfirmation;

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
        if (MODEL_OPTIONS.some((m) => m.value === newSettings.aiModel)) {
          setSelectedModel(newSettings.aiModel);
        }
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
      setEnemyRoles({});
      setGameMode('sr');
      setStatus('idle');
      // Clear the auto-generate key so the next draft triggers a fresh build
      autoGenKeyRef.current = '';
      metaPreviewKeyRef.current = '';
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
          if (isCurrentStoreLookupItem(id, item)) {
            items.set(normName, `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`);
            const existing = itemIds.get(normName);
            if (!existing || id.length < existing.length) {
              itemIds.set(normName, id);
            }
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
        const markUrl = spells.get('mark') || `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/SummonerSnowball.png`;
        if (markUrl) {
          for (const alias of ['snowball', 'mark', 'mark/dash', 'mark dash', 'snowball/mark', 'snowball + flash', 'mark + dash', 'dash']) {
            spells.set(alias, markUrl);
          }
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
          if (MODEL_OPTIONS.some((m) => m.value === s?.aiModel)) {
            setSelectedModel(s.aiModel);
          }
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

  // ── Global Hotkey Registration ────────────────────────────────────
  useEffect(() => {
    if (!settings || Object.keys(settings).length === 0) return;

    const registerHotkeys = async () => {
      await unregisterAllHotkeys();

      // Toggle Overlay
      if (settings.hotkeyToggleOverlay) {
        await registerGlobalHotkey(settings.hotkeyToggleOverlay, () => {
          ipcInvoke('overlay-toggle').catch(() => {});
        });
      }
      // Hide Overlay
      if (settings.hotkeyHideOverlay) {
        await registerGlobalHotkey(settings.hotkeyHideOverlay, () => {
          ipcInvoke('overlay-hide').catch(() => {});
        });
      }
      // Focus Main Window
      if (settings.hotkeyFocusMain) {
        await registerGlobalHotkey(settings.hotkeyFocusMain, async () => {
          const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          const win = getCurrentWebviewWindow();
          await win.show();
          await win.setFocus();
        });
      }
      // Regenerate Build
      if (settings.hotkeyRegenerate) {
        await registerGlobalHotkey(settings.hotkeyRegenerate, () => {
          // Trigger re-generate via same mechanism as the Generate button
          document.getElementById('btn-generate')?.click();
        });
      }
    };

    registerHotkeys();

    return () => { unregisterAllHotkeys(); };
  }, [settings.hotkeyToggleOverlay, settings.hotkeyHideOverlay, settings.hotkeyFocusMain, settings.hotkeyRegenerate]);

  const handleForceSync = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/rag/sync`, { method: 'POST' });
      // RAG status will update on next poll (3s)
    } catch { /* ignore */ }
  }, []);

  // Track when overlay data is sent
  const origOverlayHasData = useRef(false);

  const fetchMetaPreview = useCallback(async (championId: string, champRole: Role) => {
    if (!championId || !patchVersion || patchVersion === '...') return;
    const requestBody = {
      patch: patchVersion,
      myChampion: championId,
      role: champRole,
      gameMode,
      allies: [],
      enemies: [],
      model: selectedModel,
      generationMode: 'meta-preview',
    };

    setMetaPreviewLoading(true);
    setBuildResult(null);
    setRefinementSummary([]);
    setMetaStatus(null);

    try {
      const response = await fetch(`${API_BASE}/api/build-dual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.phase === 'meta' && payload.fullText) {
            if (draftCompleteRef.current || statusRef.current === 'fetching') return;
            setMetaStatus({ status: 'exact', message: 'Exact U.GG role baseline loaded.' });
            setStatus('meta');
            setBuildResult({
              ok: true,
              source: 'meta-preview',
              patchDetected: payload.patchUsed || patchVersion,
              text: payload.fullText,
              metaStatus: 'exact',
              metaMessage: 'Exact U.GG role baseline loaded.',
            } as BuildResponse);
            return;
          }
          if (payload.phase === 'meta-status') {
            if (draftCompleteRef.current || statusRef.current === 'fetching') return;
            const statusValue = payload.source === 'meta-missing-role' ? 'missing-role' : 'missing-champion';
            const missingMessage = statusValue === 'missing-role'
              ? `No exact U.GG ${champRole} meta is available for ${championId}.`
              : `No U.GG meta is available for ${championId}.`;
            setMetaStatus({ status: statusValue, message: missingMessage });
            setStatus('meta-fallback');
            setBuildResult(null);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[App] Meta preview failed:', err);
    } finally {
      setMetaPreviewLoading(false);
    }
  }, [patchVersion, selectedModel, gameMode]);

  const handleGenerate = useCallback(async () => {
    if (!myChampion) return;
    const srDraftComplete = gameMode === 'sr' && allies.length >= 4 && enemies.length >= 5;
    const confirmedRoleCount = Object.keys(enemyRoles || {}).length;
    if (autoDetect && srDraftComplete && (roleConfirmationRef.current !== 'confirmed' || confirmedRoleCount < enemies.length)) {
      console.log('[App] Generate held until loading screen confirms enemy roles');
      setBuildResult(null);
      setRefinementSummary([]);
      setMetaStatus(null);
      setStatus('waiting-roles');
      return;
    }
    // Don't generate if DDragon hasn't loaded yet
    if (!patchVersion || patchVersion === '...') {
      console.warn('[App] handleGenerate called before patchVersion is ready, skipping');
      return;
    }
    setStatus('fetching');
    setBuildResult(null);
    setRefinementSummary([]);
    setMetaStatus(null);
    setRunesModel('');
    setBuildModel('');
    // Don't reset buildGeneratedRef here — auto-detect will unlock on new champ select session

    const requestBody = { patch: patchVersion, myChampion, role, gameMode, allies, enemies, enemyRoles, model: selectedModel, generationMode: settings.generationMode || 'flash' };
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
      let fullStreamedText = '';
      let patchUsed = '';
      let source = 'grounded';
      let fullFinalText = '';
      let metaBaselineText = '';
      let currentMetaStatus: { status: 'exact' | 'missing-role' | 'missing-champion'; message: string } | null = null;

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

            if (payload.phase === 'meta-status') {
              const statusValue = payload.source === 'meta-missing-role' ? 'missing-role' : 'missing-champion';
              currentMetaStatus = { status: statusValue, message: payload.message || 'No exact meta baseline is available for this role.' };
              setMetaStatus(currentMetaStatus);
              continue;
            }

            if (payload.phase === 'meta' && payload.fullText) {
              metaBaselineText = payload.fullText;
              currentMetaStatus = { status: 'exact', message: 'Exact U.GG role baseline loaded.' };
              setMetaStatus(currentMetaStatus);
              if (payload.model) setBuildModel(payload.model);
              continue;
            }

            // ── Full build phase (single generation) ──
            if (payload.phase === 'full') {
              if (payload.error && payload.done) {
                setBuildResult({ ok: false, source: 'error', text: '', message: payload.error, canRetry: true } as any);
                setStatus('error');
                return;
              }
              if (payload.error) {
                console.warn('[App] Build generation error:', payload.error);
                continue;
              }
              if (payload.chunk) {
                fullStreamedText += payload.chunk;
              }
              if (payload.corrected) fullFinalText = payload.corrected;
              if (payload.done) {
                fullFinalText = payload.fullText || fullFinalText || fullStreamedText;
                source = payload.source || source;
                if (!fullFinalText.trim() && metaBaselineText) {
                  console.warn('[App] Ignoring empty AI final result; keeping meta baseline visible.');
                  fullFinalText = metaBaselineText;
                  source = 'meta-fallback';
                }
                if (payload.model) setBuildModel(payload.model);
                if (metaBaselineText && fullFinalText && source === 'grounded') {
                  setRefinementSummary(buildRefinementSummary(metaBaselineText, fullFinalText));
                }
                setBuildResult({
                  ok: true,
                  source: source as any,
                  patchDetected: patchUsed,
                  text: fullFinalText,
                  metaStatus: currentMetaStatus?.status,
                  metaMessage: currentMetaStatus?.message,
                } as BuildResponse);
              }
            }

            // Handle non-phased events (cache hit etc)
            if (!payload.phase && payload.chunk) {
              fullStreamedText += payload.chunk;
            }
            if (!payload.phase && payload.done) {
              fullFinalText = payload.fullText || fullStreamedText;
              source = payload.source || source;
            }

            if (payload.error && !payload.phase) {
              setBuildResult({ ok: false, source: 'error', text: fullStreamedText, message: payload.error, canRetry: true } as any);
              setStatus('error');
              return;
            }
          } catch { /* skip malformed lines */ }
        }
      }

      // Final result
      let text = fullFinalText || fullStreamedText;
      if (!text.trim() && metaBaselineText) {
        console.warn('[App] Empty final build after stream; keeping meta baseline.');
        text = metaBaselineText;
        source = 'meta-fallback';
      }
      if (!text.trim()) {
        setBuildResult({ ok: false, source: 'error', text: '', message: 'AI returned an empty build. Please retry.', canRetry: true } as any);
        setStatus('error');
        return;
      }
      const data: BuildResponse = {
        ok: true,
        source: source as any,
        patchDetected: patchUsed,
        text,
        metaStatus: currentMetaStatus?.status,
        metaMessage: currentMetaStatus?.message,
      };
      if (metaBaselineText && text && source === 'grounded') {
        setRefinementSummary(buildRefinementSummary(metaBaselineText, text));
      }
      setBuildResult(data);

      if (data.ok) {
        setStatus(
          data.source === 'grounded' ? 'grounded'
            : data.source === 'cache' ? 'cache'
            : data.source === 'meta' ? 'meta'
            : data.source === 'meta-fallback' ? 'meta-fallback'
            : 'stale-cache'
        );
        buildGeneratedRef.current = true;

        if (data.text) {
          const overlayPayload = extractOverlayData(data.text, role, iconLookups, ddragonVersion, myChampion);
          const overlayPayloadHasData = Boolean(
            overlayPayload.buildItems.length || overlayPayload.junglePath.length
          );
          const sendOverlayPayload = () => ipcSend('overlay-data', overlayPayload);
          ipcInvoke('overlay-ensure').then(() => {
            sendOverlayPayload();
            window.setTimeout(sendOverlayPayload, 250);
            window.setTimeout(sendOverlayPayload, 1000);
            if (overlayPayloadHasData && roleConfirmationRef.current === 'confirmed') {
              overlayShownRef.current = true;
              ipcInvoke('overlay-show');
            }
          });
          setOverlayHasData(overlayPayloadHasData);
          overlayHasDataRef.current = overlayPayloadHasData;
          console.log('[App] 🧠 Build sent to overlay');

          // Store build text for live advisor and auto-start it
          ipcSend('store-original-build', data.text);
          ipcInvoke('live-advisor-start').then(() => setLiveAdvisorActive(true));

          // Auto-export runes + item sets (single export, no duplicate)
          (async () => {
            const currentSettings = await ipcInvoke('get-settings');

            if (currentSettings.autoExportRunes) {
              try {
                await ipcInvoke('export-runes', { championName: myChampion, rawText: data.text });
                console.log('[App] ✅ Rune auto-export succeeded');
              } catch {}
            }

            if (currentSettings.autoExportItemSet && iconLookups?.itemIds) {
              console.log('[App] 🧠 Auto-exporting item set...');
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
  }, [myChampion, role, gameMode, allies, enemies, enemyRoles, selectedModel, iconLookups, patchVersion, settings]);

  // ── Auto-generate when all 10 champions are locked in ──
  useEffect(() => {
    if (!autoDetect) return;
    if (status === 'fetching') return; // Already generating — don't stack duplicate calls
    // Need: 1 myChampion + 4 allies + 5 enemies = 10
    if (!myChampion || allies.length < 4 || enemies.length < 5) return;
    // Don't auto-generate until DDragon data is loaded
    if (!patchVersion || patchVersion === '...') return;
    const confirmedRoleCount = Object.keys(enemyRoles || {}).length;
    if (gameMode === 'sr' && (roleConfirmation !== 'confirmed' || confirmedRoleCount < enemies.length)) {
      const waitKey = `${gameMode}|${myChampion}|${role}|${[...allies].sort().join(',')}|${[...enemies].sort().join(',')}|waiting-loading-roles`;
      if (autoGenKeyRef.current !== waitKey) {
        autoGenKeyRef.current = waitKey;
        setBuildResult(null);
        setRefinementSummary([]);
        setMetaStatus(null);
        setStatus('waiting-roles');
        console.log('[App] Full draft detected - waiting for loading screen enemy roles before AI generation');
      }
      return;
    }
    // Build a key so we don't re-trigger for the same exact draft
    const rolesKey = Object.entries(enemyRoles)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([champ, champRole]) => `${champ}:${champRole}`)
      .join('|');
    const comboKey = `${gameMode}|${myChampion}|${role}|${[...allies].sort().join(',')}|${[...enemies].sort().join(',')}|roles=${rolesKey}`;
    if (autoGenKeyRef.current === comboKey) return;
    autoGenKeyRef.current = comboKey;
    console.log('[App] All 10 champions detected — auto-generating build');
    handleGenerate();
  }, [autoDetect, myChampion, role, gameMode, allies, enemies, enemyRoles, roleConfirmation, status, handleGenerate, patchVersion]);

  useEffect(() => {
    if (!myChampion) {
      if (buildResult?.ok && buildResult.source === 'meta-preview') setBuildResult(null);
      setMetaStatus(null);
      if (status === 'meta' || status === 'meta-fallback') setStatus('idle');
      metaPreviewKeyRef.current = '';
      return;
    }
    if (status === 'fetching' || status === 'waiting-roles' || status === 'grounded' || status === 'cache' || status === 'stale-cache') return;
    if (allies.length >= 4 && enemies.length >= 5) return;
    const previewKey = `${gameMode}|${myChampion}|${role}|${patchVersion}`;
    if (metaPreviewKeyRef.current === previewKey) return;
    const timer = setTimeout(() => {
      metaPreviewKeyRef.current = previewKey;
      fetchMetaPreview(myChampion, role);
    }, 250);
    return () => clearTimeout(timer);
  }, [myChampion, role, allies.length, enemies.length, status, fetchMetaPreview, buildResult, patchVersion]);

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
    setEnemyRoles({});
    setBuildResult(null);
    setRefinementSummary([]);
    setMetaStatus(null);
    setRoleConfirmation('unknown');
    setStatus('idle');
    metaPreviewKeyRef.current = '';
    roleResolvedKeyRef.current = '';
  }, []);

  const resolveDetectedChampion = useCallback((name: string): string | null => {
    const keyMap = champKeyMapRef.current;
    const nameToId = new Map<string, string>();
    for (const [, val] of keyMap) {
      nameToId.set(val.name.toLowerCase(), val.id);
      nameToId.set(val.id.toLowerCase(), val.id);
    }
    const lower = String(name || '').toLowerCase();
    if (nameToId.has(lower)) return nameToId.get(lower)!;
    const stripped = lower.replace(/['.\s]/g, '');
    for (const [key, id] of nameToId) {
      if (key.replace(/['.\s]/g, '') === stripped) return id;
    }
    return null;
  }, []);

  const normalizeDetectedRole = useCallback((value: any): Role | null => {
    const key = String(value || '').toLowerCase();
    const map: Record<string, Role> = {
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
    return map[key] || null;
  }, []);

  const roleSnapshotKey = useCallback((roles: Record<string, Role>) => {
    return Object.entries(roles)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([champ, champRole]) => `${champ}:${champRole}`)
      .join('|');
  }, []);

  const applyConfirmedEnemyRoles = useCallback((snapshot: any) => {
    if (!snapshot?.ok || gameModeRef.current !== 'sr') return false;
    const currentEnemies = enemiesRef.current;
    if (currentEnemies.length < 5) return false;
    const currentEnemySet = new Set(currentEnemies);
    const sourceEnemies: string[] = Array.isArray(snapshot.enemies) ? snapshot.enemies : [];
    const sourceRoles = snapshot.enemyRoles || {};
    const resolvedRoles: Record<string, Role> = {};

    for (const name of sourceEnemies) {
      const id = resolveDetectedChampion(name);
      if (!id || !currentEnemySet.has(id)) continue;
      const rawRole =
        sourceRoles[name] ||
        sourceRoles[id] ||
        sourceRoles[String(name).toLowerCase()] ||
        sourceRoles[String(id).toLowerCase()];
      const mapped = normalizeDetectedRole(rawRole);
      if (mapped) resolvedRoles[id] = mapped;
    }

    if (Object.keys(resolvedRoles).length < currentEnemies.length) return false;
    const nextKey = roleSnapshotKey(resolvedRoles);
    const currentKey = roleSnapshotKey(enemyRolesRef.current);
    if (!nextKey || nextKey === currentKey || nextKey === roleResolvedKeyRef.current) return false;

    roleResolvedKeyRef.current = nextKey;
    setEnemyRoles(resolvedRoles);
    roleConfirmationRef.current = 'confirmed';
    setRoleConfirmation('confirmed');
    setLiveUpdatedItems(null);
    console.log('[App] Confirmed enemy roles from live/loading screen:', nextKey);

    if (buildGeneratedRef.current && draftCompleteRef.current) {
      buildGeneratedRef.current = false;
      autoGenKeyRef.current = '';
      metaPreviewKeyRef.current = '';
      setStatus('idle');
      setRefinementSummary([]);
      setMetaStatus(null);
      console.log('[App] Enemy roles confirmed after draft - regenerating with real lane assignments');
    }
    return true;
  }, [normalizeDetectedRole, resolveDetectedChampion, roleSnapshotKey]);

  // Auto-detect: poll LCU for champ select session, with in-game fallback
  const pollLCU = useCallback(async () => {
    console.log('[Auto-detect] pollLCU tick');
    try {
      // ── Attempt 1: Champ Select (LCU API) ──
      const result = await ipcInvoke('lcu-champ-select');
      console.log('[Auto-detect] lcu-champ-select result:', JSON.stringify(result)?.substring(0, 300));
      if (result?.ok) {
        setAutoDetectStatus('connected');
        try {
          const modeResult = await ipcInvoke('lcu-game-mode');
          if (modeResult?.ok && GAME_MODES.includes(modeResult.mode as GameMode)) {
            const detectedMode = modeResult.mode as GameMode;
            setGameMode(detectedMode);
            if (detectedMode !== 'sr') setRole('mid');
          }
        } catch {}
        const session = result.session;
        const sessionId = `${session.localPlayerCellId}-${session.gameId || session.counter || 'x'}`;
        if (lastSessionIdRef.current !== sessionId) {
          lastSessionIdRef.current = sessionId;
          buildGeneratedRef.current = false;
          autoGenKeyRef.current = '';
          metaPreviewKeyRef.current = '';
          roleResolvedKeyRef.current = '';
          roleConfirmationRef.current = 'unknown';
          setRoleConfirmation('unknown');
          // Clear stale data from previous session
          setMyChampion('');
          setAllies([]);
          setEnemies([]);
          setEnemyRoles({});
          console.log('[App] New champ select session detected — unlocking auto-generate');
        }
        const localCellId = session.localPlayerCellId;
        const keyMap = champKeyMapRef.current;

        // ── Build a map of cellId → confirmed pick championId using the actions array ──
        // The actions array contains phases like [[ban1, ban2,...],[pick1, pick2,...],...]
        // Each action has: type ("ban"|"pick"|"phase_transition"), championId, actorCellId,
        //   completed (bool), isInProgress (bool), isAllyAction (bool)
        // We ONLY want picks (not bans), and only completed or in-progress ones.
        const pickedChampByCellId = new Map<number, number>();
        for (const phase of session.actions || []) {
          for (const action of phase) {
            if (action.type === 'pick' && action.championId && action.championId !== 0) {
              if (action.completed || action.isInProgress) {
                pickedChampByCellId.set(action.actorCellId, action.championId);
              }
            }
          }
        }

        // My champion — from confirmed pick action
        const myPickedChampId = pickedChampByCellId.get(localCellId);
        if (myPickedChampId) {
          const champ = keyMap.get(String(myPickedChampId));
          if (champ) setMyChampion(champ.id);
        }

        // Role from assigned position
        const myTeamEntry = session.myTeam?.find((p: any) => p.cellId === localCellId);
        if (myTeamEntry?.assignedPosition) {
          const mappedRole = LCU_POSITION_MAP[myTeamEntry.assignedPosition.toLowerCase()];
          if (mappedRole) setRole(mappedRole);
        }

        // Allies — only confirmed picks from my team
        const allyIds: string[] = [];
        for (const p of session.myTeam || []) {
          if (p.cellId === localCellId) continue;
          const pickedId = pickedChampByCellId.get(p.cellId);
          if (pickedId) {
            const champ = keyMap.get(String(pickedId));
            if (champ) allyIds.push(champ.id);
          }
        }
        setAllies(allyIds);

        // Enemies — only confirmed picks from their team
        const enemyIds: string[] = [];
        for (const p of session.theirTeam || []) {
          const pickedId = pickedChampByCellId.get(p.cellId);
          if (pickedId) {
            const champ = keyMap.get(String(pickedId));
            if (champ) {
              enemyIds.push(champ.id);
            }
          }
        }
        const previousEnemyKey = [...enemiesRef.current].sort().join('|');
        const nextEnemyKey = [...enemyIds].sort().join('|');
        enemiesRef.current = enemyIds;
        setEnemies(enemyIds);
        if (previousEnemyKey !== nextEnemyKey || roleConfirmationRef.current !== 'confirmed') {
          setEnemyRoles({});
          roleConfirmationRef.current = 'unknown';
          setRoleConfirmation('unknown');
        }
        if (allyIds.length >= 4 && enemyIds.length >= 5) {
          try {
            const roleSnapshot = await ipcInvoke('lcu-role-snapshot');
            if (roleSnapshot?.ok) applyConfirmedEnemyRoles(roleSnapshot);
          } catch {}
        }
        return; // champ select worked, no fallback needed
      }

      // ── Attempt 2: Live Game (port 2999 API) ──
      // IMPORTANT: Once a build is generated, do NOT update champions from live game.
      // Viego's passive changes his championName mid-game, which would trigger re-generation.
      if (buildGeneratedRef.current) {
        // Keep champion identity locked, but accept confirmed enemy roles from live/loading evidence.
        try {
          const liveResult = await ipcInvoke('lcu-role-snapshot').catch(() => ipcInvoke('lcu-live-game'));
          if (liveResult?.ok) {
            setAutoDetectStatus('connected');
            applyConfirmedEnemyRoles(liveResult);
            // Show overlay when in-game (reliable fallback for SSE)
            if (!overlayShownRef.current && overlayHasDataRef.current) {
              overlayShownRef.current = true;
              console.log('[App] Showing overlay (live game detected by poll)');
              ipcInvoke('overlay-ensure').then(() => ipcInvoke('overlay-show'));
            }
          } else if (overlayShownRef.current) {
            // Game ended — hide overlay
            overlayShownRef.current = false;
            console.log('[App] Hiding overlay (game ended, build-locked path)');
            ipcInvoke('overlay-hide');
          }
        } catch {}
        return;
      }

      const liveResult = await ipcInvoke('lcu-live-game');
      console.log('[Auto-detect] lcu-live-game result:', liveResult?.ok ? 'connected' : 'not in game');
      if (liveResult?.ok) {
        setAutoDetectStatus('connected');
        try {
          const modeResult = await ipcInvoke('lcu-game-mode');
          if (modeResult?.ok && GAME_MODES.includes(modeResult.mode as GameMode)) {
            const detectedMode = modeResult.mode as GameMode;
            setGameMode(detectedMode);
            if (detectedMode !== 'sr') setRole('mid');
          }
        } catch {}
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
        const liveEnemyRoles: Record<string, Role> = {};
        for (const name of liveResult.enemies || []) {
          const id = resolveChamp(name);
          if (id) {
            liveEnemies.push(id);
            const liveRole = liveResult.enemyRoles?.[name] || liveResult.enemyRoles?.[id];
            if (liveRole && ROLES.includes(liveRole)) liveEnemyRoles[id] = liveRole;
          }
        }
        if (liveEnemies.length > 0) {
          setEnemies(prev => liveEnemies.length >= prev.length ? liveEnemies : prev);
          if (Object.keys(liveEnemyRoles).length > 0) {
            setEnemyRoles(liveEnemyRoles);
            roleConfirmationRef.current = 'confirmed';
            setRoleConfirmation('confirmed');
          }
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

  const getChampIconUrl = useCallback((champId: string) =>
    ddragonVersion ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champId}.png` : ''
  , [ddragonVersion]);

  const selectedChampionName = champions.find(c => c.id === myChampion)?.name || myChampion || 'No champion';
  const generationStage =
    status === 'fetching' && buildResult?.ok ? 'AI refining'
      : status === 'fetching' ? 'AI generating'
      : status === 'waiting-roles' ? 'Waiting roles'
      : status === 'grounded' ? 'AI validated'
      : status === 'meta' || status === 'meta-fallback' ? 'Meta baseline'
      : status === 'cache' ? 'Saved build'
      : status === 'error' ? 'Needs retry'
      : 'Ready';
  const selectedModelMeta = MODEL_OPTIONS.find((m) => m.value === selectedModel) || MODEL_OPTIONS[0];
  const pipelineSteps = [
    {
      key: 'meta',
      label: 'Meta',
      state: status === 'idle' || status === 'error' ? 'pending' : 'done',
    },
    {
      key: 'draft',
      label: 'Draft',
      state: status === 'waiting-roles' ? 'active' : status === 'fetching' && !buildResult?.ok ? 'done' : status === 'idle' || status === 'error' ? 'pending' : 'done',
    },
    {
      key: 'ai',
      label: 'AI',
      state: status === 'fetching' && buildResult?.ok ? 'active' : status === 'grounded' ? 'done' : 'pending',
    },
  ];
  const advisorGameTime = liveAdvice
    ? `${Math.floor((liveAdvice.gameTime || 0) / 60)}:${String(Math.floor((liveAdvice.gameTime || 0) % 60)).padStart(2, '0')}`
    : '0:00';
  const advisorGetIcon = useCallback((name: string) => {
    if (!iconLookups || !name) return '';
    const norm = name.toLowerCase().trim();
    let url = iconLookups.items.get(norm);
    if (!url) {
      for (const [key, val] of iconLookups.items.entries()) {
        if (key === norm || key.startsWith(norm + ' ') || norm.startsWith(key + ' ')) {
          url = val;
          break;
        }
      }
    }
    return url || '';
  }, [iconLookups]);
  const advisorNextItems = useMemo(() => {
    const raw = liveAdvice?.rawText || '';
    const nextSection = raw.match(/NEXT ITEMS?\n([\s\S]*?)(?=\nTHREAT|\nSELL|\n\n|$)/);
    if (!nextSection) return [];
    return nextSection[1]
      .trim()
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean)
      .map((line: string) => {
        const cleaned = line.replace(/^\d+[.)]\s*/, '').trim();
        const colonIdx = cleaned.indexOf(':');
        const name = colonIdx > 0 ? cleaned.substring(0, colonIdx).trim() : cleaned;
        const reason = colonIdx > 0 ? cleaned.substring(colonIdx + 1).trim() : '';
        return { name, reason, icon: advisorGetIcon(name) };
      })
      .slice(0, 2);
  }, [liveAdvice, advisorGetIcon]);
  const advisorThreatText = useMemo(() => {
    const raw = liveAdvice?.rawText || '';
    return raw.match(/THREAT\n(.+?)(?:\n\n|$)/s)?.[1]?.trim() || '';
  }, [liveAdvice]);

  const handleSettingChange = useCallback(async (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await ipcInvoke('set-setting', key, value);
  }, []);

  return (
    <div className={`app app-state-${status} ${status === 'fetching' ? 'app-generating' : ''}`}>
      <header className="header">
        <div className="header-brand">
          <img src="/logo.png" alt="DraftCoach" className="header-logo" />
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
                const model = e.target.value as AiModel;
                setSelectedModel(model);
                await handleSettingChange('aiModel', model);
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
            <label>Mode</label>
            <div className="mode-picker">
              {GAME_MODES.map((m) => {
                const meta = GAME_MODE_META[m];
                return (
                  <button
                    key={m}
                    className={`mode-btn ${gameMode === m ? 'mode-btn-active' : ''}`}
                    onClick={() => {
                      setGameMode(m);
                      if (m !== 'sr') setRole('mid');
                      metaPreviewKeyRef.current = '';
                    }}
                    title={meta.label}
                  >
                    <span className="mode-icon-wrap">
                      <ModeIcon mode={m} />
                      {meta.badge && <span className="mode-icon-badge">{meta.badge}</span>}
                    </span>
                    <span className="mode-label">{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field-group">
            <label>Role</label>
            <div className="role-picker">
              {ROLES.map((r) => (
                <button
                  key={r}
                  className={`role-btn ${role === r ? 'role-btn-active' : ''} ${gameMode !== 'sr' ? 'role-btn-disabled' : ''}`}
                  onClick={() => gameMode === 'sr' && setRole(r)}
                  disabled={gameMode !== 'sr'}
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
              onSelect={(id) => {
                setEnemies((p) => p.length < 5 ? [...p, id] : p);
                setEnemyRoles({});
                roleConfirmationRef.current = 'unknown';
                setRoleConfirmation('unknown');
              }}
              onRemove={(id) => {
                setEnemies((p) => p.filter((e_) => e_ !== id));
                setEnemyRoles({});
                roleConfirmationRef.current = 'unknown';
                setRoleConfirmation('unknown');
              }}
              max={5} getIconUrl={getChampIconUrl}
            />
          </div>

          <button id="btn-generate" className="btn-generate" onClick={handleGenerate} disabled={!myChampion || status === 'fetching' || status === 'waiting-roles'}>
            {status === 'fetching' ? (
              <><span className="btn-generate-spinner" />Generating...</>
            ) : status === 'waiting-roles' ? (
              <><span className="btn-generate-spinner" />Waiting for roles...</>
            ) : (
              <>
                <svg className="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14L12 4M9 2h5v5M6 10l-2 2 2 2"/></svg>
                Generate Build
              </>
            )}
          </button>
        </div>

        <div className="right-panel">
          <div className="draft-command-bar">
            <div className="draft-command-primary">
              {myChampion && <img src={getChampIconUrl(myChampion)} alt={selectedChampionName} className="draft-command-champ" />}
              <div>
                <div className="draft-command-kicker">Draft Plan</div>
                <div className="draft-command-title">
                  {selectedChampionName}
                  <span className="draft-command-mode">
                    <ModeIcon mode={gameMode} compact />
                    {gameMode === 'sr' ? role.toUpperCase() : GAME_MODE_META[gameMode].shortLabel.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <div className="draft-pipeline" aria-label="Generation pipeline">
              {pipelineSteps.map((step) => (
                <div key={step.key} className={`draft-pipeline-step draft-pipeline-${step.state}`}>
                  <span className="draft-pipeline-node" />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
            <div className="draft-command-metrics">
              <div className="draft-command-metric"><span>Allies</span><strong>{allies.length}/4</strong></div>
              <div className="draft-command-metric"><span>Enemies</span><strong>{enemies.length}/5</strong></div>
              <div className="draft-command-metric"><span>State</span><strong>{generationStage}</strong></div>
              <div className="draft-command-metric draft-command-model"><span>Model</span><strong>{selectedModelMeta.tone}</strong></div>
            </div>
          </div>
          <BuildOutput
            result={buildResult}
            iconLookups={iconLookups}
            loading={status === 'fetching' || status === 'waiting-roles' || metaPreviewLoading}
            loadingMode={status === 'waiting-roles' ? 'roles' : status === 'fetching' ? 'ai' : 'meta'}
            championId={myChampion}
            role={role}
            liveUpdatedItems={liveUpdatedItems}
            enemies={enemies}
            refinementSummary={refinementSummary}
            metaStatus={metaStatus}
          />

          {/* ── Live Advisor Panel ── */}
          <div className="live-advisor-section">
            <div className="live-advisor-header">
              <div className="live-advisor-title-wrap">
                <span className="live-advisor-title">
                  <span className={`live-advisor-dot ${liveAdvisorActive ? 'active' : ''}`} />
                  Live Advisor
                </span>
                <span className="live-advisor-subtitle">
                  {liveAdvisorActive ? `Watching game state with ${selectedModelMeta.label}` : 'Ready when the match starts'}
                </span>
              </div>
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
                <div className="advisor-wait-orbit">
                  <span />
                  <span />
                  <span />
                </div>
                <div>
                  <strong>Monitoring live game</strong>
                  <span>Advice appears when gold, items, threats, or objective state changes enough to matter.</span>
                </div>
              </div>
            )}

            {liveAdvice && (
              <div className="live-advisor-card">
                <div className="advisor-hero">
                  <div className="advisor-hero-main">
                    <span className="advisor-hero-kicker">{liveAdvice.triggerReason || 'Live recommendation'}</span>
                    <strong>{liveAdvice.summary || 'Build path updated from current game state.'}</strong>
                  </div>
                  <div className="advisor-hero-stats">
                    <div><span>Time</span><strong>{advisorGameTime}</strong></div>
                    <div><span>Model</span><strong>{selectedModelMeta.tone}</strong></div>
                  </div>
                </div>

                {liveAdvice.changes && liveAdvice.changes.length > 0 && (
                  <div className="advisor-panel advisor-panel-priority">
                    <div className="live-advisor-changes-title">Item Changes</div>
                    {liveAdvice.changes.map((c: any, i: number) => {
                      const oldIcon = advisorGetIcon(c.currentItem);
                      const newIcon = advisorGetIcon(c.recommendedItem);
                      return (
                        <div key={i} className="advisor-change-row">
                          <div className="advisor-item-slot">
                            {oldIcon ? <img src={oldIcon} className="advisor-item-icon" alt={c.currentItem} title={c.currentItem} /> : <div className="advisor-item-placeholder" />}
                            <span className="advisor-item-name old">{c.currentItem}</span>
                          </div>
                          <span className="advisor-flow-arrow">&gt;</span>
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

                {(advisorNextItems.length > 0 || advisorThreatText) && (
                  <div className="advisor-grid">
                    {advisorNextItems.length > 0 && (
                      <div className="advisor-panel">
                        <div className="live-advisor-changes-title">Next Buy</div>
                        {advisorNextItems.map((item: any, i: number) => (
                          <div key={i} className="advisor-next-row">
                            <span className="advisor-next-index">{i + 1}</span>
                            {item.icon ? <img src={item.icon} className="advisor-item-icon next" alt={item.name} title={item.name} /> : <div className="advisor-item-placeholder" />}
                            <div className="advisor-next-info">
                              <span className="advisor-next-name">{item.name}</span>
                              {item.reason && <span className="advisor-next-reason">{item.reason}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {advisorThreatText && (
                      <div className="advisor-panel advisor-threat">
                        <div className="live-advisor-changes-title">Threat</div>
                        <div className="advisor-threat-text">{advisorThreatText}</div>
                      </div>
                    )}
                  </div>
                )}

                {liveAdvice.rawText && (
                  <details className="live-advisor-raw">
                    <summary>Full response</summary>
                    <pre>{liveAdvice.rawText}</pre>
                  </details>
                )}

                <div className="advisor-card-actions">
                  <button className="live-advisor-dismiss" onClick={() => setLiveAdvice(null)}>Dismiss</button>
                </div>
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
                OpenRouter API Key {settings.openrouterApiKey && <span style={{ color: 'var(--accent-green)', fontSize: 10, marginLeft: 6 }}>● SAVED</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="password"
                  placeholder={settings.openrouterApiKey ? '•••••••••••• (saved — paste to replace)' : 'Paste your OpenRouter API key here'}
                  value={openrouterKeyInput}
                  onChange={e => setOpenrouterKeyInput(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && openrouterKeyInput.trim()) {
                      setOpenrouterKeySaveStatus('Saving...');
                      await ipcInvoke('set-setting', 'openrouterApiKey', openrouterKeyInput.trim());
                      setSettings(prev => ({ ...prev, openrouterApiKey: openrouterKeyInput.trim() }));
                      setOpenrouterKeyInput('');
                      setOpenrouterKeySaveStatus('Saved! Restart the app to apply.');
                      setTimeout(() => setOpenrouterKeySaveStatus(''), 5000);
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
                    if (!openrouterKeyInput.trim()) {
                      setOpenrouterKeySaveStatus('Please enter a key first');
                      setTimeout(() => setOpenrouterKeySaveStatus(''), 3000);
                      return;
                    }
                    setOpenrouterKeySaveStatus('Saving...');
                    const result = await ipcInvoke('set-setting', 'openrouterApiKey', openrouterKeyInput.trim());
                    if (result === null) {
                      setOpenrouterKeySaveStatus('Failed — backend not running');
                      setTimeout(() => setOpenrouterKeySaveStatus(''), 5000);
                      return;
                    }
                    setSettings(prev => ({ ...prev, openrouterApiKey: openrouterKeyInput.trim() }));
                    setOpenrouterKeyInput('');
                    setOpenrouterKeySaveStatus('Saved! Restart app to apply.');
                    setTimeout(() => setOpenrouterKeySaveStatus(''), 5000);
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
              {openrouterKeySaveStatus && (
                <div style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: openrouterKeySaveStatus.includes('Saved') ? 'var(--accent-green)' :
                         openrouterKeySaveStatus.includes('Failed') ? '#E84057' : 'var(--text-secondary)',
                }}>
                  {openrouterKeySaveStatus}
                </div>
              )}
              <div className="settings-desc" style={{ marginTop: 8 }}>
                Get your API key at <span style={{ color: 'var(--gold)' }}>https://openrouter.ai/settings/keys</span>
              </div>
            </div>
            <label className="settings-toggle-row" style={{ marginTop: 10 }}>
              <span>AI Model</span>
              <select
                className="game-mode-select"
                style={{ width: '170px' }}
                value={selectedModel}
                onChange={async (e) => {
                  const model = e.target.value as AiModel;
                  setSelectedModel(model);
                  await handleSettingChange('aiModel', model);
                }}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <div className="settings-desc">
              This model is used for builds, live advisor, scouting, stats, and background data grounding.
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
