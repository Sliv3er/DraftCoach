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
    if (!champData) return [];

    const spells: ChampionSpell[] = (champData.spells || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      key: s.key,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${s.id}.png`,
    }));

    champSpellCache.set(cacheKey, spells);
    return spells;
  } catch {
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
      {/* Secondary tree */}
      <div className="rune-tree-column">
        <TreeHeader label="Secondary" treeName={secondaryTree} />
        {secondaryRunes.map((r, i) => <RuneCell key={`s${i}`} name={r} />)}
      </div>
      {/* Shards */}
      {shards.length > 0 && (
        <div className="rune-tree-column rune-shards-column">
          <div className="rune-tree-header">
            <div className="rune-tree-label-text">Shards</div>
          </div>
          {shards.map((s, i) => {
            const shardSrc = findIcon(s, lookups?.runes);
            return (
              <div key={`sh${i}`} className="rune-shard-cell">
                {shardSrc ? (
                  <img src={shardSrc} alt={s} className="rune-shard-icon" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span className="rune-shard-dot" />
                )}
                <span>{s}</span>
              </div>
            );
          })}
        </div>
      )}
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

  return (
    <div className="skill-order-lol">
      {parts.map((p, i) => {
        const letter = p.trim().toUpperCase();
        const spell = championSpells.find(s => s.key === letter);
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="skill-separator">›</span>}
            <div className="skill-ability">
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
              </div>
              <span className="skill-ability-name">{spell?.name || letter}</span>
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

        const reasonMatch = text.match(/^([^(]+)\((.+)\)\s*$/);
        if (reasonMatch) { text = reasonMatch[1].trim(); reason = reasonMatch[2].trim(); }

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

// Standard jungle camp positions on SR minimap (512x512 image) as percentages
const CAMP_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
  'red': { x: 34, y: 22, label: 'Red' },
  'red buff': { x: 34, y: 22, label: 'Red' },
  'red brambleback': { x: 34, y: 22, label: 'Red' },
  'blue': { x: 66, y: 22, label: 'Blue' },
  'blue sentinel': { x: 66, y: 22, label: 'Blue' },
  'blue buff': { x: 66, y: 22, label: 'Blue' },
  'gromp': { x: 56, y: 28, label: 'Gromp' },
  'wolves': { x: 42, y: 28, label: 'Wolves' },
  'murk wolves': { x: 42, y: 28, label: 'Wolves' },
  'raptor': { x: 32, y: 38, label: 'Raptors' },
  'raptors': { x: 32, y: 38, label: 'Raptors' },
  'krug': { x: 26, y: 30, label: 'Krugs' },
  'krugs': { x: 26, y: 30, label: 'Krugs' },
  'dragon': { x: 50, y: 50, label: 'Dragon' },
  'baron': { x: 50, y: 72, label: 'Baron' },
  'baron nashor': { x: 50, y: 72, label: 'Baron' },
  'herald': { x: 32, y: 62, label: 'Herald' },
  'rift herald': { x: 32, y: 62, label: 'Herald' },
};

function normalizeCampName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '').trim();
}

function findCampPosition(campName: string): { x: number; y: number; label: string } | null {
  const norm = normalizeCampName(campName);
  for (const [key, pos] of Object.entries(CAMP_POSITIONS)) {
    if (norm.includes(key.replace(/[^a-z]/g, '')) || key.includes(norm)) {
      return pos;
    }
  }
  return null;
}

function renderJunglePath(content: string) {
  const path = content.trim()
    .replace(/\s*-+>\s*/g, ' ➔ ')
    .replace(/\s*->+\s*/g, ' ➔ ')
    .replace(/\s*→\s*/g, ' ➔ ');
  const camps = path.split(/\s*➔\s*/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="jungle-path-container">
      <div className="jungle-minimap">
        <img
          src="https://static.u.gg/assets/lol/riotLol/maps/11/sr-map-1.2.0.png"
          alt="Summoner's Rift Minimap"
          className="jungle-minimap-img"
          onError={e => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            (target.nextElementSibling as HTMLElement).style.display = 'flex';
          }}
        />
        <div className="jungle-minimap-fallback" style={{ display: 'none' }}>
          {camps.map((camp, i) => (
            <div key={i} className="jungle-mini-camp">
              <span className="jungle-mini-num">{i + 1}</span>
              <span className="jungle-mini-name">{camp}</span>
            </div>
          ))}
        </div>
        {camps.map((camp, i) => {
          const pos = findCampPosition(camp);
          if (!pos) return null;
          return (
            <div
              key={i}
              className="jungle-path-marker"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <span className="jungle-marker-num">{i + 1}</span>
            </div>
          );
        })}
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
        const champName = colonIdx > 0 ? cleaned.slice(0, colonIdx).trim() : '';
        const spike = colonIdx > 0 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
        return (
          <div key={i} className="power-spike-item">
            <span className="power-spike-icon">
              <svg viewBox="0 0 10 10" style={{width:10,height:10,display:'block'}}><path d="M5 1 L9 9 L1 9 Z" fill="none" stroke="#c8aa6e" strokeWidth="1.2"/><line x1="5" y1="4" x2="5" y2="6" stroke="#c8aa6e" strokeWidth="1.2"/><circle cx="5" cy="7.5" r="0.6" fill="#c8aa6e"/></svg>
            </span>
            <div className="power-spike-text">
              {champName && <span className="power-spike-name">{champName}: </span>}
              <span className="power-spike-desc">{spike}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderWinCondition(content: string) {
  return (
    <div className="win-condition-box">
      {content.replace(/\*\*/g, '').trim()}
    </div>
  );
}

function renderAnalysis(content: string) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="analysis-box">
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/\*\*/g, '');
        const colonIdx = cleaned.indexOf(':');
        if (colonIdx > 0 && colonIdx < 25) {
          const label = cleaned.slice(0, colonIdx).trim();
          const value = cleaned.slice(colonIdx + 1).trim();
          return (
            <div key={i} className="analysis-line">
              <span className="analysis-label">{label}: </span>
              <span>{value}</span>
            </div>
          );
        }
        return <div key={i}>{cleaned}</div>;
      })}
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
  switch (title) {
    case 'ANALYSIS': return renderAnalysis(content);
    case 'RUNES': return renderRunes(content, lookups);
    case 'SUMMONERS': return renderSummoners(content, lookups);
    case 'SKILL ORDER': return renderSkillOrder(content, championSpells, version);
    case 'STARTING ITEMS': return renderItems(content, lookups, false);
    case 'CORE BUILD': return renderItems(content, lookups, true);
    case 'SITUATIONAL ITEMS': return renderSituational(content, lookups);
    case 'JUNGLE PATH': return renderJunglePath(content);
    case 'ENEMY POWER SPIKES': return renderPowerSpikes(content);
    case 'YOUR POWER SPIKES': return renderPowerSpikes(content);
    case 'WIN CONDITION': return renderWinCondition(content);
    default: return <div className="build-output">{content}</div>;
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
  const LEFT_COL_KEYS = ['RUNES', 'SKILL ORDER', 'SUMMONERS'];
  const RIGHT_COL_KEYS = ['STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS'];
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
