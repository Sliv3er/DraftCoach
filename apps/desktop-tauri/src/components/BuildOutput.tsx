import React, { useState, useEffect } from 'react';
import { BuildResponse } from '../types';
import { IconLookups } from '../App';
import { ipcInvoke } from '../bridge';

interface ChampionSpell {
  id: string;
  name: string;
  key: string;
  iconUrl: string;
}

// Cache champion spell data to avoid re-fetching
const champSpellCache = new Map<string, ChampionSpell[]>();

async function fetchChampionSpells(championId: string, version: string): Promise<ChampionSpell[]> {
  const cacheKey = `${championId}_${version}`;
  if (champSpellCache.has(cacheKey)) return champSpellCache.get(cacheKey)!;

  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${championId}.json`);
    const data = await res.json();
    const champData = data.data[championId];
    if (!champData) {
      console.warn(`[BuildOutput] No champion data found for ${championId} (version ${version})`);
      return [];
    }

    const ABILITY_KEYS = ['Q', 'W', 'E', 'R'];
    const spells: ChampionSpell[] = (champData.spells || []).map((s: any, idx: number) => ({
      id: s.id,
      name: s.name,
      key: ABILITY_KEYS[idx] || s.id,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${s.id}.png`,
    }));

    if (spells.length === 0) {
      console.warn(`[BuildOutput] No spells fetched for ${championId} (version ${version})`);
    }

    champSpellCache.set(cacheKey, spells);
    return spells;
  } catch (err) {
    console.warn(`[BuildOutput] Failed to fetch spells for ${championId}:`, err);
    return [];
  }
}

function getAbilityIcon(championId: string, version: string, abilityKey: string, allSpells: ChampionSpell[]): ChampionSpell | undefined {
  return allSpells.find(s => s.key === abilityKey);
}

interface LiveUpdatedItem {
  name: string;
  iconUrl: string;
  gold: number;
  id: string;
  reason?: string;
}

interface Props {
  result: BuildResponse | null;
  iconLookups: IconLookups | null;
  loading?: boolean;
  championId?: string;
  role?: string;
  liveUpdatedItems?: LiveUpdatedItem[] | null;  // Items updated by live advisor
}

// ipcRenderer replaced by bridge.ts

// Item name resolution and extraction now handled in main process

const SECTION_KEYS = [
  'ANALYSIS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
  'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH',
  'ENEMY POWER SPIKES', 'WIN CONDITION', 'YOUR POWER SPIKES',
];

function parseSections(text: string): { title: string; content: string }[] {
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

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => { });
}

function IconImg({ src, alt, className }: { src?: string; alt: string; className: string }) {
  if (!src) return null;
  return <img src={src} alt={alt} className={className} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
}

// Known bad icon URLs that show as "recall" or placeholder — never return these
const BAD_ICON_PATTERNS = ['/item/0.png', '/item/7050.png', '/item/2010.png'];

function isValidIconUrl(url: string): boolean {
  if (!url) return false;
  for (const bad of BAD_ICON_PATTERNS) {
    if (url.includes(bad)) return false;
  }
  return true;
}

// Aliases for items the AI commonly abbreviates (jungle companions, Doran's, etc.)
const ITEM_ALIASES: Record<string, string> = {
  'hatchling': 'gustwalker hatchling',
  'seedling': 'mosstomper seedling',
  'scorchclaw': 'scorchclaw pup',
  'scorched claw': 'scorchclaw pup',
  'gustwalker': 'gustwalker hatchling',
  'mosstomper': 'mosstomper seedling',
  'jungle companion': 'gustwalker hatchling',
};

function findIcon(name: string, map?: Map<string, string>): string | undefined {
  if (!map || !name) return undefined;
  let n = name.toLowerCase().trim()
    .replace(/['']/g, "'")  // normalize quotes
    .replace(/-/g, ' ')      // normalize hyphens (e.g. "Attack-Smite" → "attack smite")
    .replace(/\s+/g, ' ');  // normalize spaces

  // Check alias table first (e.g. "Hatchling" → "gustwalker hatchling")
  if (ITEM_ALIASES[n]) n = ITEM_ALIASES[n];

  // Exact match (highest confidence)
  if (map.has(n)) {
    const url = map.get(n)!;
    return isValidIconUrl(url) ? url : undefined;
  }

  // Try without leading markers like "Legend: "
  const colonIdx = n.indexOf(':');
  if (colonIdx > 0 && colonIdx < 15) {
    const afterColon = n.slice(colonIdx + 1).trim();
    if (map.has(afterColon)) {
      const url = map.get(afterColon)!;
      return isValidIconUrl(url) ? url : undefined;
    }
  }

  // For items: only do strict prefix matching, NOT loose substring matching.
  // The old `key.includes(n) || n.includes(key)` was too aggressive and would
  // match "Luden's Companion" to random items containing "luden".
  // Only match if the DDragon key STARTS WITH our search name or vice versa.
  for (const [key, val] of map.entries()) {
    if (key === n || key.startsWith(n + ' ') || n.startsWith(key + ' ')) {
      return isValidIconUrl(val) ? val : undefined;
    }
  }

  // Try matching just the first significant word (at least 5 chars to avoid false matches)
  const words = n.split(' ');
  const firstWord = words[0];
  if (firstWord.length >= 5 && words.length <= 3) {
    for (const [key, val] of map.entries()) {
      if (key.startsWith(firstWord) && key.split(' ').length <= 4) {
        return isValidIconUrl(val) ? val : undefined;
      }
    }
  }

  return undefined;
}

function renderRunes(content: string, lookups: IconLookups | null) {
  const lines = content.split('\n').filter(l => l.trim());

  // Parse into structured data
  let primaryTree = '';
  let secondaryTree = '';
  let keystone = '';
  const primaryRunes: string[] = [];
  const secondaryRunes: string[] = [];
  const shards: string[] = [];
  let section: 'primary' | 'secondary' | 'shards' = 'primary';

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');

    if (/^primary:/i.test(line)) {
      primaryTree = line.replace(/^primary:\s*/i, '').trim();
      section = 'primary';
      continue;
    }
    if (/^secondary:/i.test(line)) {
      secondaryTree = line.replace(/^secondary:\s*/i, '').trim();
      section = 'secondary';
      continue;
    }
    if (/^shards?:/i.test(line)) {
      const s = line.replace(/^shards?:\s*/i, '').split(',').map(x => x.trim()).filter(Boolean);
      shards.push(...s);
      section = 'shards';
      continue;
    }
    if (/^keystone:/i.test(line)) {
      keystone = line.replace(/^keystone:\s*/i, '').replace(/\s*\(.*\)$/, '').trim();
      continue;
    }

    const name = line.replace(/\s*\(.*\)$/, '').trim();
    if (!name) continue;

    if (section === 'primary') primaryRunes.push(name);
    else if (section === 'secondary') secondaryRunes.push(name);
  }

  // If keystone was listed but also in primaryRunes, separate it
  if (!keystone && primaryRunes.length > 0) {
    keystone = primaryRunes.shift()!;
  }

  const RuneCell = ({ name, isKeystone: ks }: { name: string; isKeystone?: boolean }) => {
    const cleanName = name.replace(/^(Legend|Rune):\s*/i, '').trim();
    const src = findIcon(name, lookups?.runes) || findIcon(cleanName, lookups?.runes);
    return (
      <div className={`rune-cell ${ks ? 'rune-cell-keystone' : ''}`}>
        {src ? (
          <img src={src} alt={name} className="rune-cell-icon" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="rune-cell-placeholder" />
        )}
        <span className="rune-cell-name">{name}</span>
      </div>
    );
  };

  const TreeHeader = ({ label, treeName }: { label: string; treeName: string }) => {
    const src = findIcon(treeName, lookups?.runes);
    return (
      <div className="rune-tree-header">
        {src && <img src={src} alt={treeName} className="rune-tree-icon" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <div>
          <div className="rune-tree-label-text">{label}</div>
          <div className="rune-tree-name">{treeName}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="runes-grid">
      {/* Primary tree */}
      <div className="rune-tree-column">
        <TreeHeader label="Primary" treeName={primaryTree} />
        {keystone && <RuneCell name={keystone} isKeystone />}
        {primaryRunes.map((r, i) => <RuneCell key={`p${i}`} name={r} />)}
      </div>
      {/* Secondary tree + Shards underneath (like League client) */}
      <div className="rune-tree-column">
        <TreeHeader label="Secondary" treeName={secondaryTree} />
        {secondaryRunes.map((r, i) => <RuneCell key={`s${i}`} name={r} />)}
        {/* Stat Shards — icon left, stat text right, stacked vertically */}
        {shards.length > 0 && (
          <div className="rune-shards-section">
            {shards.map((s, i) => {
              const shardSrc = findIcon(s, lookups?.runes);
              return (
                <div key={`sh${i}`} className="rune-shard-row">
                  <img
                    src={shardSrc}
                    alt={s}
                    className="rune-shard-icon"
                    title={s}
                    onError={e => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none';
                      const dot = img.nextElementSibling as HTMLElement;
                      if (dot && dot.classList.contains('rune-shard-fallback')) dot.style.display = '';
                    }}
                  />
                  <span className="rune-shard-fallback" style={{ display: shardSrc ? 'none' : '' }} />
                  <span className="rune-shard-text">{s}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function renderSummoners(content: string, lookups: IconLookups | null) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="summoners-row">
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
        const match = cleaned.match(/^([A-Za-z\s]+?)(?:\s*\((.+)\))?\s*$/);
        const name = match ? match[1].trim() : line.trim();
        const reason = match ? match[2] : undefined;
        return (
          <div key={i} className="summoner-card">
            <IconImg src={findIcon(name, lookups?.spells)} alt={name} className="summoner-icon" />
            <div className="summoner-info">
              <span className="summoner-name">{name}</span>
              {reason && <span className="summoner-reason">{reason}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderSkillOrder(
  content: string,
  championSpells: ChampionSpell[],
  version: string,
) {
  const parts = content.split('>').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return <div className="build-output">{content}</div>;

  const PRIORITY_LABELS = ['MAX 1ST', 'MAX 2ND', 'MAX 3RD', 'MAX 4TH'];

  return (
    <div className="skill-order-lol">
      {parts.map((p, i) => {
        const letter = p.trim().toUpperCase();
        const spell = championSpells.find(s => s.key === letter);
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="skill-separator">
              <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><path d="M1 1l5 5-5 5" stroke="#785A28" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>}
            <div className="skill-ability" title={spell ? `${spell.name} (${letter})` : letter}>
              <div className="skill-ability-icon-wrap">
                {spell ? (
                  <img
                    src={spell.iconUrl}
                    alt={spell.name}
                    className="skill-ability-icon"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="skill-ability-placeholder">
                    <span className="skill-ability-key">{letter}</span>
                  </div>
                )}
                <span className="skill-ability-badge">{letter}</span>
              </div>
              <span className="skill-ability-priority">{PRIORITY_LABELS[i] || ''}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function renderItems(content: string, lookups: IconLookups | null, numbered: boolean) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="items-list">
      {lines.map((line, i) => {
        let text = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
        let num = '';
        let reason = '';

        const numMatch = text.match(/^(\d+)\.\s*(.+)$/);
        if (numMatch) { num = numMatch[1]; text = numMatch[2]; }

        // Match reason in parentheses - handle trailing punctuation like ).
        const reasonMatch = text.match(/^([^(]+)\((.+)\)[.),;\s]*$/);
        if (reasonMatch) {
          text = reasonMatch[1].trim();
          // Strip CONSTRAINT: tags from reason text
          reason = reasonMatch[2].trim()
            .replace(/CONSTRAINT:\s*[\w_]+\s*[—–-]\s*/gi, '')
            .replace(/CONSTRAINT:\s*[\w_]+/gi, '')
            .trim();
        }

        const itemName = text.trim();
        const iconSrc = findIcon(itemName, lookups?.items);
        return (
          <div key={i} className="item-card">
            {numbered && num && <span className="item-number">{num}.</span>}
            <div className="item-card-icon-wrap">
              {iconSrc ? (
                <IconImg src={iconSrc} alt={itemName} className="item-card-icon" />
              ) : (
                <div className="item-card-icon-missing" title="Item not found in DDragon — may be removed">
                  <svg viewBox="0 0 10 10" style={{width:10,height:10}}><path d="M5 1 L9 9 L1 9 Z" fill="none" stroke="#E84057" strokeWidth="1.2"/><line x1="5" y1="4" x2="5" y2="6" stroke="#E84057" strokeWidth="1.2"/><circle cx="5" cy="7.5" r="0.6" fill="#E84057"/></svg>
                </div>
              )}
            </div>
            <div className="item-card-info">
              <span className="item-card-name">{itemName}</span>
              {!iconSrc && <span className="item-card-removed-tag">Not found</span>}
              {reason && <span className="item-card-reason">{reason}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Render live-updated items from the advisor (replaces stale CORE BUILD text)
function renderLiveUpdatedItems(items: LiveUpdatedItem[]) {
  return (
    <div className="items-list">
      {items.map((item, i) => {
        const iconSrc = item.iconUrl && item.iconUrl.length > 0 ? item.iconUrl : undefined;
        return (
          <div key={`live-${i}-${item.id || item.name}`} className="item-card">
            <span className="item-number">{i + 1}.</span>
            <div className="item-card-icon-wrap">
              {iconSrc ? (
                <IconImg src={iconSrc} alt={item.name} className="item-card-icon" />
              ) : (
                <div className="item-card-icon-missing" title="Item not found in DDragon — may be removed">
                  <svg viewBox="0 0 10 10" style={{width:10,height:10}}><path d="M5 1 L9 9 L1 9 Z" fill="none" stroke="#E84057" strokeWidth="1.2"/><line x1="5" y1="4" x2="5" y2="6" stroke="#E84057" strokeWidth="1.2"/><circle cx="5" cy="7.5" r="0.6" fill="#E84057"/></svg>
                </div>
              )}
            </div>
            <div className="item-card-info">
              <span className="item-card-name">{item.name}</span>
              {!iconSrc && <span className="item-card-removed-tag">Not found</span>}
              {item.reason && <span className="item-card-reason">{item.reason}</span>}
              {item.gold > 0 && <span className="item-card-reason">{item.gold}g</span>}
            </div>
          </div>
        );
      })}
      <div className="live-updated-tag">
        <span className="live-updated-dot" /> Updated by Live Advisor
      </div>
    </div>
  );
}

function renderSituational(content: string, lookups: IconLookups | null) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="situational-grid">
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '').replace(/^\d+\.\s*/, '');
        const colonIdx = cleaned.indexOf(':');
        if (colonIdx > 0 && colonIdx < 40) {
          const name = cleaned.slice(0, colonIdx).trim();
          const condition = cleaned.slice(colonIdx + 1).trim();
          return (
            <div key={i} className="sit-card">
              <div className="sit-card-icon-wrap">
                <IconImg src={findIcon(name, lookups?.items)} alt={name} className="sit-card-icon" />
              </div>
              <div className="sit-card-info">
                <div className="sit-card-name">{name}</div>
                <div className="sit-card-condition">{condition}</div>
              </div>
            </div>
          );
        }
        return <div key={i} className="sit-card"><div className="sit-card-info"><div className="sit-card-name">{cleaned}</div></div></div>;
      })}
    </div>
  );
}

// Standard jungle camp positions on SR minimap as percentages
// Converted from actual in-game coordinates (14870x14870 map)
// x% = game_x / 14870 * 100, y% = (1 - game_y / 14870) * 100
// Using BLUE SIDE camp positions (standard assumption)
const CAMP_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
  // Blue side camps (blue team's blue-buff quadrant — top-left on minimap)
  'blue': { x: 26, y: 47, label: 'Blue' },
  'blue sentinel': { x: 26, y: 47, label: 'Blue' },
  'blue buff': { x: 26, y: 47, label: 'Blue' },
  'gromp': { x: 15, y: 43, label: 'Gromp' },
  'grom': { x: 15, y: 43, label: 'Gromp' },
  'wolves': { x: 25, y: 57, label: 'Wolves' },
  'murk wolves': { x: 25, y: 57, label: 'Wolves' },
  'wolf': { x: 25, y: 57, label: 'Wolves' },
  // Blue side camps (blue team's red-buff quadrant — bottom-right on minimap)
  'red': { x: 53, y: 73, label: 'Red' },
  'red buff': { x: 53, y: 73, label: 'Red' },
  'red brambleback': { x: 53, y: 73, label: 'Red' },
  'raptor': { x: 47, y: 64, label: 'Raptors' },
  'raptors': { x: 47, y: 64, label: 'Raptors' },
  'raps': { x: 47, y: 64, label: 'Raptors' },
  'krug': { x: 56, y: 82, label: 'Krugs' },
  'krugs': { x: 56, y: 82, label: 'Krugs' },
  'krugs red': { x: 56, y: 82, label: 'Krugs' },
  // River objectives
  'dragon': { x: 66, y: 70, label: 'Dragon' },
  'baron': { x: 33, y: 30, label: 'Baron' },
  'baron nashor': { x: 33, y: 30, label: 'Baron' },
  'herald': { x: 33, y: 30, label: 'Herald' },
  'rift herald': { x: 33, y: 30, label: 'Herald' },
  'scuttle': { x: 50, y: 50, label: 'Scuttle' },
  'scuttle crab': { x: 50, y: 50, label: 'Scuttle' },
  'rift scuttler': { x: 50, y: 50, label: 'Scuttle' },
  // Gank waypoints
  'gank': { x: 50, y: 50, label: 'Gank' },
  'gank mid': { x: 50, y: 50, label: 'Gank Mid' },
  'gank top': { x: 20, y: 30, label: 'Gank Top' },
  'gank bot': { x: 70, y: 75, label: 'Gank Bot' },
  // Exits / paths
  'exit': { x: 50, y: 50, label: 'Exit' },
};

function normalizeCampName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '').trim();
}

function findCampPosition(campName: string): { x: number; y: number; label: string } | null {
  const norm = normalizeCampName(campName);
  // Try exact match first
  for (const [key, pos] of Object.entries(CAMP_POSITIONS)) {
    const normKey = key.replace(/[^a-z]/g, '');
    if (norm === normKey) return pos;
  }
  // Then substring match
  for (const [key, pos] of Object.entries(CAMP_POSITIONS)) {
    const normKey = key.replace(/[^a-z]/g, '');
    if (norm.includes(normKey) || normKey.includes(norm)) {
      return pos;
    }
  }
  return null;
}

// Resolve a camp name to a clean label using CAMP_POSITIONS lookup
function resolveCampLabel(campName: string): string {
  // Handle compound names like "Scuttle/Gank"
  if (campName.includes('/')) {
    return campName.split('/').map(s => {
      const pos = findCampPosition(s.trim());
      return pos ? pos.label : s.trim();
    }).join('/');
  }
  const pos = findCampPosition(campName);
  return pos ? pos.label : campName;
}

function renderJunglePath(content: string, version: string) {
  console.warn('[BuildOutput] Jungle Path raw content:', JSON.stringify(content));

  let raw = content.trim().replace(/\*\*/g, '');

  // Handle multi-line "BLUE SIDE: ... \n RED SIDE: ..." format — take only the first route
  if (/^(BLUE|RED)\s*SIDE\s*:/im.test(raw)) {
    const routeLines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    // Take the first route line and strip the "BLUE SIDE:" / "RED SIDE:" prefix
    raw = routeLines[0].replace(/^(BLUE|RED)\s*SIDE\s*:\s*/i, '').trim();
  }

  // First try: split by arrows (multiple arrow types)
  const ARROW_RE = /\s*(?:➤|➔|->|→|➜|=>)\s*/;
  if (ARROW_RE.test(raw)) {
    const camps = raw.split(ARROW_RE).map(s => s.trim()).filter(Boolean);
    if (camps.length >= 2) {
      const cleaned = camps.map(c => c.replace(/^(\d+[.)]\s*)/, '').replace(/\s*—.*$/, '').trim()).filter(Boolean);
      if (cleaned.length >= 2) {
        return renderJungleCamps(cleaned, version);
      }
    }
  }

  // Second try: split by newlines (one camp per line)
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const cleaned = lines
      .map(l => l.replace(/^(\d+[.)]\s*)/, '').replace(/^[-*•]\s*/, '').replace(/\s*—.*$/, '').trim())
      .filter(Boolean);
    if (cleaned.length >= 2) {
      return renderJungleCamps(cleaned, version);
    }
  }

  // Third try: comma-separated
  if (raw.includes(',')) {
    const cleaned = raw.split(',').map(s => s.trim().replace(/^(\d+[.)]\s*)/, '').replace(/\s*—.*$/, '').trim()).filter(Boolean);
    if (cleaned.length >= 2) {
      return renderJungleCamps(cleaned, version);
    }
  }

  // Fourth try: slash-separated
  if (raw.includes('/')) {
    const cleaned = raw.split('/').map(s => s.trim().replace(/^(\d+[.)]\s*)/, '').replace(/\s*—.*$/, '').trim()).filter(Boolean);
    if (cleaned.length >= 2) {
      return renderJungleCamps(cleaned, version);
    }
  }

  // Single camp: show what we have (may just be "Red")
  const single = raw.replace(/^(\d+[.)]\s*)/, '').replace(/\s*—.*$/, '').trim();
  if (single) {
    return renderJungleCamps([single], version);
  }

  return <div className="build-output">{content}</div>;
}

function renderJungleCamps(campNames: string[], version: string) {
  const resolved = campNames.map((camp, i) => {
    const primaryName = camp.includes('/') ? camp.split('/')[0].trim() : camp;
    const pos = findCampPosition(primaryName);
    const label = resolveCampLabel(camp);
    return { raw: camp, pos, label, num: i + 1 };
  });

  return (
    <div className="jungle-path-container">
      <div className="jungle-minimap">
        <img
          src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/map/map11.png`}
          alt="Summoner's Rift"
          className="jungle-minimap-img"
          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
        />
        {resolved.map((r, i) => {
          if (!r.pos) return null;
          return (
            <div
              key={i}
              className="jungle-path-marker"
              style={{ left: `${r.pos.x}%`, top: `${r.pos.y}%` }}
              title={r.label}
            >
              <span className="jungle-marker-num">{r.num}</span>
            </div>
          );
        })}
      </div>
      <div className="jungle-path-legend">
        {resolved.map((r, i) => (
          <div key={i} className="jungle-mini-camp">
            <span className="jungle-mini-num">{r.num}</span>
            <span className="jungle-mini-name">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderPowerSpikes(content: string) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="power-spikes-list">
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/\*\*/g, '').replace(/^[-*•]\s*/, '');
        const colonIdx = cleaned.indexOf(':');
        const label = colonIdx > 0 ? cleaned.slice(0, colonIdx).trim() : '';
        const desc = colonIdx > 0 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
        // Split description at em-dash for separate detail
        const dashIdx = desc.indexOf(' — ');
        const mainDesc = dashIdx > 0 ? desc.slice(0, dashIdx).trim() : desc;
        const detail = dashIdx > 0 ? desc.slice(dashIdx + 3).trim() : '';
        return (
          <div key={i} className="spike-card">
            <div className="spike-header">
              <span className="spike-indicator" />
              <span className="spike-label">{label || `Spike ${i + 1}`}</span>
            </div>
            <div className="spike-body">
              <span className="spike-main">{mainDesc}</span>
              {detail && <span className="spike-detail">{detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderWinCondition(content: string) {
  const text = content.replace(/\*\*/g, '').trim();
  return (
    <div className="win-condition-box">
      <div className="win-condition-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
      </div>
      <div className="win-condition-text">{text}</div>
    </div>
  );
}

// Human-readable label mapping for AI-generated analysis keys
function cleanAnalysisLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b(NEEDED|VALUE)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderAnalysis(content: string) {
  // Filter out internal prompt scaffolding and separator lines
  const lines = content.split('\n').filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (/^(STEP\s*\d|---+|={3,}|CONSTRAINTS?|THREAT_\d|BUILD CONSTRAINTS|OUTPUT FORMAT|INTERNAL|TEMPLATE|INSTRUCTION)/i.test(t)) return false;
    if (/^[-=]{2,}$/.test(t)) return false;
    // Strip lines that are ONLY separator characters (═══, ───, etc.)
    if (/^[═─━─\-=~_]{2,}$/.test(t)) return false;
    return true;
  });

  const truncIdx = lines.findIndex(l => {
    const t = l.trim().replace(/\*\*/g, '');
    return /^STEP\s*\d/i.test(t) || /^THREAT_/i.test(t) || /^CONSTRAINTS?$/i.test(t) || /^BUILD CONSTRAINTS/i.test(t);
  });
  const cleanLines = truncIdx > 0 ? lines.slice(0, truncIdx) : lines;

  // Parse into structured entries
  type Entry = { label: string; value: string; isTactical: boolean };
  const entries: Entry[] = [];
  for (const line of cleanLines) {
    const cleaned = line.trim().replace(/\*\*/g, '');
    // Skip lines that are just separator chars
    if (/^[═─━\-=~_\s]{2,}$/.test(cleaned)) continue;
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx > 0 && colonIdx < 35) {
      const rawLabel = cleaned.slice(0, colonIdx).trim();
      const value = cleaned.slice(colonIdx + 1).trim();
      if (!value) continue;
      const label = cleanAnalysisLabel(rawLabel);
      // Tactical entries: Yes/No toggles, boots, etc.
      const isTactical = /anti.heal|qss|suppress|zhonya|banshee|boot|powerspike|key.power/i.test(rawLabel);
      entries.push({ label, value, isTactical });
    }
  }

  // Split: overview (matchup info) vs tactical (yes/no decisions)
  const overviewKeys = /matchup|damage|threat|survivab|item prior/i;
  const overview = entries.filter(e => overviewKeys.test(e.label));
  const tactical = entries.filter(e => e.isTactical);
  const other = entries.filter(e => !overviewKeys.test(e.label) && !e.isTactical);

  // Extract Yes/No/High/Low from tactical values for badge coloring
  function getBadge(val: string): { badge: string; color: 'yes' | 'no' | 'high' | 'neutral' } {
    const lower = val.toLowerCase();
    if (/^yes\b/i.test(val)) return { badge: 'YES', color: 'yes' };
    if (/^no\b/i.test(val)) return { badge: 'NO', color: 'no' };
    if (/^high\b/i.test(val)) return { badge: 'HIGH', color: 'yes' };
    if (/^low\b/i.test(val)) return { badge: 'LOW', color: 'no' };
    if (/^mandatory\b/i.test(val)) return { badge: 'YES', color: 'yes' };
    if (/^essential\b/i.test(val)) return { badge: 'YES', color: 'yes' };
    return { badge: '', color: 'neutral' };
  }

  return (
    <div className="analysis-container">
      {/* Overview rows */}
      {overview.length > 0 && (
        <div className="analysis-overview">
          {overview.map((e, i) => (
            <div key={`o${i}`} className="analysis-row">
              <span className="analysis-label">{e.label}</span>
              <span className="analysis-value">{e.value}</span>
            </div>
          ))}
        </div>
      )}
      {/* Tactical badges — compact inline */}
      {tactical.length > 0 && (
        <div className="analysis-badges">
          {tactical.map((e, i) => {
            const { badge, color } = getBadge(e.value);
            // Extract just the reason in parens if present
            const parenMatch = e.value.match(/\(([^)]+)\)/);
            const reason = parenMatch ? parenMatch[1] : e.value.replace(/^(Yes|No|High|Low|Mandatory|Essential)\s*/i, '').replace(/^\(|\)$/g, '').trim();
            return (
              <div key={`b${i}`} className="analysis-badge-item">
                <span className="analysis-badge-label">{e.label}</span>
                {badge && <span className={`analysis-badge analysis-badge-${color}`}>{badge}</span>}
                {reason && <span className="analysis-badge-reason">{reason}</span>}
              </div>
            );
          })}
        </div>
      )}
      {/* Other entries */}
      {other.length > 0 && (
        <div className="analysis-other">
          {other.map((e, i) => (
            <div key={`x${i}`} className="analysis-row">
              <span className="analysis-label">{e.label}</span>
              <span className="analysis-value">{e.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderSection(
  title: string,
  content: string,
  lookups: IconLookups | null,
  championSpells: ChampionSpell[],
  version: string,
) {
  try {
    switch (title) {
      case 'ANALYSIS': return renderAnalysis(content);
      case 'RUNES': return renderRunes(content, lookups);
      case 'SUMMONERS': return renderSummoners(content, lookups);
      case 'SKILL ORDER': return renderSkillOrder(content, championSpells, version);
      case 'STARTING ITEMS': return renderItems(content, lookups, false);
      case 'CORE BUILD': return renderItems(content, lookups, true);
      case 'SITUATIONAL ITEMS': return renderSituational(content, lookups);
      case 'JUNGLE PATH': return renderJunglePath(content, version);
      case 'ENEMY POWER SPIKES': return renderPowerSpikes(content);
      case 'YOUR POWER SPIKES': return renderPowerSpikes(content);
      case 'WIN CONDITION': return renderWinCondition(content);
      default: return <div className="build-output">{content}</div>;
    }
  } catch (err) {
    console.error(`[BuildOutput] renderSection crashed for "${title}":`, err);
    return <div className="build-output">{content}</div>;
  }
}

export function BuildOutput({ result, iconLookups, loading, championId, role, liveUpdatedItems }: Props) {
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);
  const [championSpells, setChampionSpells] = useState<ChampionSpell[]>([]);

  useEffect(() => {
    if (!championId || !iconLookups?.version) return;
    setChampionSpells([]);
    fetchChampionSpells(championId, iconLookups.version).then(setChampionSpells);
  }, [championId, iconLookups?.version]);

  const version = iconLookups?.version || '';

  const handleExport = React.useCallback(async () => {
    if (!result?.ok || !result.text || !championId || !iconLookups?.itemIds) return;

    setExportStatus('Exporting...');

    try {
      // 1. Export Items
      const itemIdMap: Record<string, string> = {};
      iconLookups.itemIds.forEach((id, name) => { itemIdMap[name] = id; });

      const itemRes = await ipcInvoke('export-item-set', {
        championId,
        title: `DC: ${championId} ${role || ''}`.trim(),
        rawText: result.text,
        itemIdMap,
      });

      // 2. Export Runes
      const runeRes = await ipcInvoke('export-runes', {
        championName: championId,
        rawText: result.text,
      });

      if (itemRes.ok && runeRes.ok) {
        setExportStatus('Items & Runes Exported');
      } else if (itemRes.ok) {
        setExportStatus('Items Exported (Runes failed)');
      } else if (runeRes.ok) {
        setExportStatus('Runes Exported (Items failed)');
      } else {
        setExportStatus('Export failed');
      }
    } catch (err: any) {
      setExportStatus(`Export failed: ${err.message}`);
    }
    setTimeout(() => setExportStatus(null), 6000);
  }, [result, championId, role, iconLookups]);
  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
        <div className="loading-text">Generating optimal build...</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M32 4 L52 14 L52 34 C52 46 42 56 32 60 C22 56 12 46 12 34 L12 14 Z"/>
            <path d="M32 18 L32 44 M22 28 L42 28" strokeWidth="2"/>
          </svg>
        </div>
        <div className="empty-text">Select your champion and generate a build</div>
        <div className="empty-hint">Pick a champion from the left panel to get started</div>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="build-section build-section-error">
        <div className="build-section-header">
          <h3 className="error-title">Error</h3>
        </div>
        <div className="error-message">{result.message}</div>
        {result.canRetry && <div className="error-retry-hint">You can retry the request.</div>}
      </div>
    );
  }

  const sections = parseSections(result.text);

  // Split sections into columns for 2-column layout
  const LEFT_COL_KEYS = ['RUNES', 'SKILL ORDER', 'SUMMONERS', 'ANALYSIS'];
  const RIGHT_COL_KEYS = ['STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH'];
  // Everything else goes full-width below

  const leftSections = sections.filter(s => LEFT_COL_KEYS.includes(s.title));
  const rightSections = sections.filter(s => RIGHT_COL_KEYS.includes(s.title));
  const bottomSections = sections.filter(s => !LEFT_COL_KEYS.includes(s.title) && !RIGHT_COL_KEYS.includes(s.title));

  const renderSectionCard = (s: { title: string; content: string }, i: number) => (
    <div key={i} className="build-section">
      <div className="build-section-header">
        <h3>{s.title}</h3>
        <button className="btn-copy" onClick={() => copyToClipboard(`${s.title}\n${s.content}`)}>
          Copy
        </button>
      </div>
      {/* Use live-updated items for CORE BUILD when available (from live advisor) */}
      {s.title === 'CORE BUILD' && liveUpdatedItems && liveUpdatedItems.length > 0
        ? renderLiveUpdatedItems(liveUpdatedItems)
        : renderSection(s.title, s.content, iconLookups, championSpells, version)
      }
    </div>
  );

  const content = sections.length > 0 ? (
    <>
      <div className="build-columns">
        <div className="build-col build-col-left">
          {leftSections.map((s, i) => renderSectionCard(s, i))}
        </div>
        <div className="build-col build-col-right">
          {rightSections.map((s, i) => renderSectionCard(s, i))}
        </div>
      </div>
      {bottomSections.length > 0 && (
        <div className="build-bottom">
          {bottomSections.map((s, i) => renderSectionCard(s, i))}
        </div>
      )}
    </>
  ) : (
    <div className="build-section">
      <div className="build-output">{result.text}</div>
    </div>
  );

  return (
    <div>
      <div className="build-actions">
        <button className="btn-copy-all" onClick={() => copyToClipboard(result.text)}>
          <svg className="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="9" height="10" rx="1"/><path d="M4 4V3a1 1 0 011-1h7a1 1 0 011 1v8"/></svg>
          Copy All
        </button>
        <button className="btn-export" onClick={handleExport}>
          <svg className="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v8m0 0l-3-3m3 3l3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/></svg>
          Export to LoL
        </button>
        {exportStatus && <span className="export-status">{exportStatus}</span>}
      </div>
      {content}
    </div>
  );
}
