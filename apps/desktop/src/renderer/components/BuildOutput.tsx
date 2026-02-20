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
    const trimmed = line.trim();
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
  const n = name.toLowerCase().trim();
  return map.get(n);
}

function renderRunes(content: string, lookups: IconLookups | null) {
  const lines = content.split('\n').filter(l => l.trim());
  const elements: React.ReactNode[] = [];
  let currentTree: 'primary' | 'secondary' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^primary:/i.test(line)) {
      const treeName = line.replace(/^primary:\s*/i, '').trim();
      currentTree = 'primary';
      elements.push(
        <div key={`pt-${i}`} className="rune-tree">
          <div className="rune-tree-label">
            <IconImg src={findIcon(treeName, lookups?.runes)} alt={treeName} className="rune-icon" />
            {' '}Primary: {treeName}
          </div>
        </div>
      );
      continue;
    }

    if (/^secondary:/i.test(line)) {
      const treeName = line.replace(/^secondary:\s*/i, '').trim();
      currentTree = 'secondary';
      elements.push(
        <div key={`st-${i}`} className="rune-tree" style={{ marginTop: 12 }}>
          <div className="rune-tree-label">
            <IconImg src={findIcon(treeName, lookups?.runes)} alt={treeName} className="rune-icon" />
            {' '}Secondary: {treeName}
          </div>
        </div>
      );
      continue;
    }

    if (/^shards?:/i.test(line)) {
      const shards = line.replace(/^shards?:\s*/i, '').split(',').map(s => s.trim());
      elements.push(
        <div key={`sh-${i}`} className="rune-shards">
          {shards.map((s, j) => <span key={j} className="rune-shard">{s}</span>)}
        </div>
      );
      continue;
    }

    // Keystone or regular rune
    const isKeystone = /^keystone:/i.test(line);
    let runeName = line;
    let reason = '';

    if (isKeystone) runeName = line.replace(/^keystone:\s*/i, '');
    const parenMatch = runeName.match(/^([^(]+)\((.+)\)\s*$/);
    if (parenMatch) { runeName = parenMatch[1].trim(); reason = parenMatch[2].trim(); }

    // Clean leading markers like "Legend: Tenacity"
    const cleanName = runeName.replace(/^(Legend|Rune):\s*/i, '').trim();
    const displayName = runeName.trim();

    elements.push(
      <div key={`r-${i}`} className={`rune-row ${isKeystone ? 'keystone' : ''}`}>
        <IconImg src={findIcon(cleanName, lookups?.runes) || findIcon(displayName, lookups?.runes)} alt={displayName} className="rune-icon" />
        <span>{displayName}</span>
        {reason && <span className="reason">({reason})</span>}
      </div>
    );
  }

  return <div>{elements}</div>;
}

function renderSummoners(content: string, lookups: IconLookups | null) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div>
      {lines.map((line, i) => {
        const match = line.match(/^([A-Za-z\s]+?)(?:\s*\((.+)\))?\s*$/);
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
        let text = line.trim();
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
    <div>
      {lines.map((line, i) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx < 40) {
          const name = line.slice(0, colonIdx).trim();
          const condition = line.slice(colonIdx + 1).trim();
          return (
            <div key={i} className="item-row">
              <IconImg src={findIcon(name, lookups?.items)} alt={name} className="item-icon" />
              <span className="sit-name" style={{ fontWeight: 600, color: 'var(--gold)' }}>{name}:</span>
              <span className="sit-condition" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{condition}</span>
            </div>
          );
        }
        return <div key={i} className="item-row" style={{ fontSize: 13 }}>{line}</div>;
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
