import React, { useMemo } from 'react';
import { BuildResponse } from '../../types';

interface Props {
  result: BuildResponse | null;
}

const SECTION_NAMES = ['RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS'];

function parseSections(text: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const lines = text.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const matchedSection = SECTION_NAMES.find(
      (s) => trimmed.toUpperCase().startsWith(s) || trimmed.toUpperCase().replace(/[:#\-*]/g, '').trim().startsWith(s)
    );

    if (matchedSection) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
      }
      currentTitle = matchedSection;
      // Content after the title on the same line
      const afterTitle = trimmed.replace(/^[#*\-\s]*/g, '').replace(new RegExp(`^${matchedSection}[:\\s]*`, 'i'), '').trim();
      currentContent = afterTitle ? [afterTitle] : [];
    } else if (currentTitle) {
      currentContent.push(trimmed);
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
  }

  return sections;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function BuildOutput({ result }: Props) {
  if (!result) {
    return (
      <div className="empty-state">
        <div>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏰</div>
          <div>Select your champion and generate a build</div>
        </div>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="build-section" style={{ borderColor: '#f44336' }}>
        <div className="build-section-header">
          <h3 style={{ color: '#f44336' }}>Error</h3>
        </div>
        <div>{result.message}</div>
        {result.canRetry && <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>You can retry the request.</div>}
      </div>
    );
  }

  const sections = parseSections(result.text);

  return (
    <div>
      <button className="btn-copy-all" onClick={() => copyToClipboard(result.text)}>
        📋 Copy All
      </button>
      {sections.length > 0 ? (
        sections.map((s, i) => (
          <div key={i} className="build-section">
            <div className="build-section-header">
              <h3>{s.title}</h3>
              <button className="btn-copy" onClick={() => copyToClipboard(`${s.title}\n${s.content}`)}>
                Copy
              </button>
            </div>
            <div className="build-output">{s.content}</div>
          </div>
        ))
      ) : (
        <div className="build-section">
          <div className="build-output">{result.text}</div>
        </div>
      )}
    </div>
  );
}
