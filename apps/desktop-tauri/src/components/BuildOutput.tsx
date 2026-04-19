import React from 'react';
import { BuildResponse } from '../types';
import { IconLookups } from '../App';
import { ipcInvoke } from '../bridge';

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

const SKILL_COLORS: Record<string, string> = {
  'Q': '#3b82f6',
  'W': '#22c55e',
  'E': '#eab308',
  'R': '#ef4444',
};

function renderSkillOrder(content: string) {
  const parts = content.split('>').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return <div className="build-output">{content}</div>;
  return (
    <div className="skill-order">
      {parts.map((p, i) => {
        const letter = p.trim().toUpperCase();
        const color = SKILL_COLORS[letter];
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="skill-separator">›</span>}
            <span className="skill-key" style={color ? { borderColor: color, color, textShadow: `0 0 8px ${color}40` } : undefined}>{p}</span>
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
                <div className="item-card-icon-missing" title="Item not found in DDragon — may be removed">⚠</div>
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
                <div className="item-card-icon-missing" title="Item not found in DDragon — may be removed">⚠</div>
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
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
        🔴 Updated by Live Advisor
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

function renderJunglePath(content: string) {
  const path = content.trim()
    .replace(/\s*-+>\s*/g, ' ➔ ')
    .replace(/\s*->+\s*/g, ' ➔ ')
    .replace(/\s*→\s*/g, ' ➔ ');
  const camps = path.split(/\s*➔\s*/);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '4px 0' }}>
      {camps.map((camp, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>➔</span>}
          <span style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            padding: '5px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--accent-green)',
          }}>{camp.trim()}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function renderPowerSpikes(content: string) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/\*\*/g, '').replace(/^[-*•]\s*/, '');
        const colonIdx = cleaned.indexOf(':');
        const champName = colonIdx > 0 ? cleaned.slice(0, colonIdx).trim() : '';
        const spike = colonIdx > 0 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
        return (
          <div key={i} style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
            padding: '6px 10px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
          }}>
            <span style={{ color: '#e74c3c', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>⚠</span>
            <div>
              {champName && <span style={{ fontWeight: 600, color: 'var(--gold)', fontSize: '12px' }}>{champName}: </span>}
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{spike}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderWinCondition(content: string) {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%)',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      borderRadius: '8px',
      fontSize: '13px',
      lineHeight: '1.6',
      color: 'var(--text-primary)',
      fontWeight: 500,
    }}>
      {content.replace(/\*\*/g, '').trim()}
    </div>
  );
}

function renderAnalysis(content: string) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div style={{
      padding: '10px 14px',
      background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0.03) 100%)',
      border: '1px solid rgba(168, 85, 247, 0.2)',
      borderRadius: '8px',
      fontSize: '12px',
      lineHeight: '1.7',
      color: 'var(--text-secondary)',
    }}>
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/\*\*/g, '');
        const colonIdx = cleaned.indexOf(':');
        if (colonIdx > 0 && colonIdx < 25) {
          const label = cleaned.slice(0, colonIdx).trim();
          const value = cleaned.slice(colonIdx + 1).trim();
          return (
            <div key={i} style={{ marginBottom: '3px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>{label}: </span>
              <span>{value}</span>
            </div>
          );
        }
        return <div key={i}>{cleaned}</div>;
      })}
    </div>
  );
}

function renderSection(title: string, content: string, lookups: IconLookups | null) {
  switch (title) {
    case 'ANALYSIS': return renderAnalysis(content);
    case 'RUNES': return renderRunes(content, lookups);
    case 'SUMMONERS': return renderSummoners(content, lookups);
    case 'SKILL ORDER': return renderSkillOrder(content);
    case 'STARTING ITEMS': return renderItems(content, lookups, false);
    case 'CORE BUILD': return renderItems(content, lookups, true);
    case 'SITUATIONAL ITEMS': return renderSituational(content, lookups);
    case 'JUNGLE PATH': return renderJunglePath(content);
    case 'ENEMY POWER SPIKES': return renderPowerSpikes(content);
    case 'YOUR POWER SPIKES': return renderPowerSpikes(content);
    case 'WIN CONDITION': return renderWinCondition(content);
    default: return <div className="build-output" style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  }
}

export function BuildOutput({ result, iconLookups, loading, championId, role, liveUpdatedItems }: Props) {
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);

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
        setExportStatus('✓ Items & Runes Exported');
      } else if (itemRes.ok) {
        setExportStatus('✓ Items Exported (Runes failed)');
      } else if (runeRes.ok) {
        setExportStatus('✓ Runes Exported (Items failed)');
      } else {
        setExportStatus('✗ Export failed');
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
        <div className="empty-icon">⚔️</div>
        <div className="empty-text">Select your champion and generate a build</div>
        <div className="empty-hint">Pick a champion from the left panel to get started</div>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="build-section" style={{ borderColor: 'var(--accent-red)' }}>
        <div className="build-section-header">
          <h3 style={{ color: 'var(--accent-red)' }}>Error</h3>
        </div>
        <div style={{ fontSize: 13 }}>{result.message}</div>
        {result.canRetry && <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>You can retry the request.</div>}
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

  const SECTION_ICONS: Record<string, string> = {
    'ANALYSIS': '📊',
    'RUNES': '🔮',
    'SUMMONERS': '⚡',
    'SKILL ORDER': '🎯',
    'STARTING ITEMS': '🛒',
    'CORE BUILD': '⚔️',
    'SITUATIONAL ITEMS': '🔄',
    'JUNGLE PATH': '🌿',
    'ENEMY POWER SPIKES': '⚠️',
    'YOUR POWER SPIKES': '💪',
    'WIN CONDITION': '🏆',
  };

  const renderSectionCard = (s: { title: string; content: string }, i: number) => (
    <div key={i} className="build-section">
      <div className="build-section-header">
        <h3><span className="section-icon">{SECTION_ICONS[s.title] || '📋'}</span>{s.title}</h3>
        <button className="btn-copy" onClick={() => copyToClipboard(`${s.title}\n${s.content}`)}>
          Copy
        </button>
      </div>
      {/* Use live-updated items for CORE BUILD when available (from live advisor) */}
      {s.title === 'CORE BUILD' && liveUpdatedItems && liveUpdatedItems.length > 0
        ? renderLiveUpdatedItems(liveUpdatedItems)
        : renderSection(s.title, s.content, iconLookups)
      }
    </div>
  );

  return (
    <div>
      <div className="build-actions">
        <button className="btn-copy-all" onClick={() => copyToClipboard(result.text)}>
          📋 Copy All
        </button>
        <button className="btn-export" onClick={handleExport}>
          🎮 Export to LoL
        </button>
        {exportStatus && <span className="export-status">{exportStatus}</span>}
      </div>

      {sections.length > 0 ? (
        <>
          {/* 2-column layout: Runes/Skills left, Items right */}
          <div className="build-columns">
            <div className="build-col build-col-left">
              {leftSections.map((s, i) => renderSectionCard(s, i))}
            </div>
            <div className="build-col build-col-right">
              {rightSections.map((s, i) => renderSectionCard(s, i))}
            </div>
          </div>

          {/* Full-width sections below */}
          {bottomSections.length > 0 && (
            <div className="build-bottom">
              {bottomSections.map((s, i) => renderSectionCard(s, i))}
            </div>
          )}
        </>
      ) : (
        <div className="build-section">
          <div className="build-output" style={{ whiteSpace: 'pre-wrap' }}>{result.text}</div>
        </div>
      )}
    </div>
  );
}
