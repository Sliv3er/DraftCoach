import React from 'react';
import { BuildResponse } from '../../types';
import { IconLookups } from '../App';

interface Props {
  result: BuildResponse | null;
  iconLookups: IconLookups | null;
  loading?: boolean;
}

const SECTION_KEYS = [
  'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
  'CORE BUILD', 'SITUATIONAL ITEMS',
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
  navigator.clipboard.writeText(text).catch(() => {});
}

function IconImg({ src, alt, className }: { src?: string; alt: string; className: string }) {
  if (!src) return null;
  return <img src={src} alt={alt} className={className} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
}

function findIcon(name: string, map?: Map<string, string>): string | undefined {
  if (!map || !name) return undefined;
  const n = name.toLowerCase().trim()
    .replace(/['']/g, "'")  // normalize quotes
    .replace(/\s+/g, ' ');  // normalize spaces

  // Exact match
  if (map.has(n)) return map.get(n);

  // Try without leading markers like "Legend: "
  const colonIdx = n.indexOf(':');
  if (colonIdx > 0 && colonIdx < 15) {
    const afterColon = n.slice(colonIdx + 1).trim();
    if (map.has(afterColon)) return map.get(afterColon);
    // Also try full "legend: tenacity" form
    const fullForm = n;
    if (map.has(fullForm)) return map.get(fullForm);
  }

  // Try partial/substring match (find the first key that contains or is contained by the search)
  for (const [key, val] of map.entries()) {
    if (key.includes(n) || n.includes(key)) return val;
  }

  // Try matching just the first word (e.g., "Gustwalker" matches "Gustwalker Hatchling")
  const firstWord = n.split(' ')[0];
  if (firstWord.length >= 4) {
    for (const [key, val] of map.entries()) {
      if (key.startsWith(firstWord)) return val;
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
          {shards.map((s, i) => (
            <div key={`sh${i}`} className="rune-shard-cell">
              <span className="rune-shard-dot" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderSummoners(content: string, lookups: IconLookups | null) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div>
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
        const match = cleaned.match(/^([A-Za-z\s]+?)(?:\s*\((.+)\))?\s*$/);
        const name = match ? match[1].trim() : line.trim();
        const reason = match ? match[2] : undefined;
        return (
          <div key={i} className="spell-row">
            <IconImg src={findIcon(name, lookups?.spells)} alt={name} className="spell-icon" />
            <span style={{ fontWeight: 500 }}>{name}</span>
            {reason && <span className="spell-reason">({reason})</span>}
          </div>
        );
      })}
    </div>
  );
}

function renderSkillOrder(content: string) {
  const parts = content.split('>').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return <div className="build-output">{content}</div>;
  return (
    <div className="skill-order">
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="skill-separator">›</span>}
          <span className="skill-key">{p}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function renderItems(content: string, lookups: IconLookups | null, numbered: boolean) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div>
      {lines.map((line, i) => {
        let text = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
        let num = '';
        let reason = '';

        // Extract number prefix
        const numMatch = text.match(/^(\d+)\.\s*(.+)$/);
        if (numMatch) { num = numMatch[1]; text = numMatch[2]; }

        // Extract parenthesized reason
        const reasonMatch = text.match(/^([^(]+)\((.+)\)\s*$/);
        if (reasonMatch) { text = reasonMatch[1].trim(); reason = reasonMatch[2].trim(); }

        const itemName = text.trim();
        return (
          <div key={i} className="item-row">
            {numbered && num && <span className="item-number">{num}.</span>}
            <IconImg src={findIcon(itemName, lookups?.items)} alt={itemName} className="item-icon" />
            <span className="item-name">{itemName}</span>
            {reason && <span className="item-reason">({reason})</span>}
          </div>
        );
      })}
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

function renderSection(title: string, content: string, lookups: IconLookups | null) {
  switch (title) {
    case 'RUNES': return renderRunes(content, lookups);
    case 'SUMMONERS': return renderSummoners(content, lookups);
    case 'SKILL ORDER': return renderSkillOrder(content);
    case 'STARTING ITEMS': return renderItems(content, lookups, false);
    case 'CORE BUILD': return renderItems(content, lookups, true);
    case 'SITUATIONAL ITEMS': return renderSituational(content, lookups);
    default: return <div className="build-output" style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  }
}

export function BuildOutput({ result, iconLookups, loading }: Props) {
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

  return (
    <div>
      <div className="build-actions">
        <button className="btn-copy-all" onClick={() => copyToClipboard(result.text)}>
          📋 Copy All
        </button>
      </div>

      {sections.length > 0 ? (
        sections.map((s, i) => (
          <div key={i} className="build-section">
            <div className="build-section-header">
              <h3>{s.title}</h3>
              <button className="btn-copy" onClick={() => copyToClipboard(`${s.title}\n${s.content}`)}>
                Copy
              </button>
            </div>
            {renderSection(s.title, s.content, iconLookups)}
          </div>
        ))
      ) : (
        <div className="build-section">
          <div className="build-output" style={{ whiteSpace: 'pre-wrap' }}>{result.text}</div>
        </div>
      )}
    </div>
  );
}
