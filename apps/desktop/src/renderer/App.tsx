import React, { useState, useEffect, useCallback } from 'react';
import { BuildResponse, Role } from '../types';
import { ChampionPicker } from './components/ChampionPicker';
import { BuildOutput } from './components/BuildOutput';

const API_BASE = 'http://127.0.0.1:3210';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const ROLE_ICONS: Record<Role, string> = { top: '🗡️', jungle: '🌿', mid: '⚡', adc: '🏹', support: '🛡️' };

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
  runes: Map<string, string>;    // normalized name -> icon url
  version: string;
}

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
  const [modelName] = useState(() => (window as any).__env?.GEMINI_MODEL || 'gemini-2.5-pro-preview-05-06');
  const [groundingOn] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const vRes = await fetch(`${API_BASE}/api/version`);
        const { version } = await vRes.json();
        setDdragonVersion(version);
        setPatchVersion(version);

        // Fetch champions + DDragon data in parallel
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

        // Build item lookup: name -> icon URL
        const iData = await iRes.json();
        const items = new Map<string, string>();
        const itemIds = new Map<string, string>();
        for (const [id, item] of Object.entries<any>(iData.data)) {
          const normName = item.name.toLowerCase();
          items.set(normName, `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`);
          itemIds.set(normName, id);
        }

        // Build spell lookup
        const sData = await sRes.json();
        const spells = new Map<string, string>();
        for (const [, spell] of Object.entries<any>(sData.data)) {
          spells.set(spell.name.toLowerCase(), `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.id}.png`);
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

        // Add stat shard icons (not in runesReforged.json)
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
        };
        for (const [name, iconPath] of Object.entries(shardIcons)) {
          runes.set(name, `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`);
        }

        setIconLookups({ items, itemIds, spells, runes, version });
      } catch (err) {
        console.error('Failed to load DDragon data:', err);
      }
    })();
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!myChampion) return;
    setStatus('fetching');
    setBuildResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: '26.4', myChampion, role, allies, enemies }),
      });
      const data: BuildResponse = await res.json();
      setBuildResult(data);
      if (data.ok) {
        setStatus(data.source === 'grounded' ? 'grounded' : data.source === 'cache' ? 'cache' : 'stale-cache');
      } else {
        setStatus('error');
      }
    } catch (err: any) {
      setBuildResult({ ok: false, source: 'error', message: err.message, canRetry: true });
      setStatus('error');
    }
  }, [myChampion, role, allies, enemies]);

  const getChampIconUrl = (champId: string) =>
    ddragonVersion ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champId}.png` : '';

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <span className="brand-icon">⚔️</span>
          <h1>DraftCoach</h1>
        </div>
        <div className="header-meta">
          <span className="header-tag">Patch <span className="value"> {patchVersion}</span></span>
          <span className="header-tag">Model <span className="value"> {modelName}</span></span>
          <span className="grounding-badge">
            <span className="grounding-dot" />
            Grounding: ON
          </span>
        </div>
      </header>

      <div className="main">
        <div className="left-panel">
          <div className="panel-title">Draft Setup</div>

          <div className="field-group">
            <label>Role</label>
            <select className="role-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_ICONS[r]} {r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
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
            {status === 'fetching' ? '⏳ Generating...' : '⚔️ Generate Build'}
          </button>
        </div>

        <div className="right-panel">
          <div className="status-bar">
            <span className={`status-dot ${status}`} />
            <span>
              {status === 'idle' && 'Ready — select a champion to begin'}
              {status === 'fetching' && 'Generating build with AI...'}
              {status === 'grounded' && '✓ Grounded result'}
              {status === 'cache' && '✓ From cache'}
              {status === 'stale-cache' && '⚠ Stale cache (AI unavailable)'}
              {status === 'error' && '✗ Error'}
            </span>
          </div>

          <BuildOutput result={buildResult} iconLookups={iconLookups} loading={status === 'fetching'} championId={myChampion} role={role} />
        </div>
      </div>
    </div>
  );
}
