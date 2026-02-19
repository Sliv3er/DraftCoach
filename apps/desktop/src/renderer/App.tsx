import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BuildResponse, Role } from '../types';
import { ChampionPicker } from './components/ChampionPicker';
import { BuildOutput } from './components/BuildOutput';

const API_BASE = 'http://127.0.0.1:3210';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];

type Status = 'idle' | 'fetching' | 'grounded' | 'cache' | 'stale-cache' | 'error';

interface ChampionData {
  id: string;
  name: string;
  key: string;
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

  // Fetch DDragon version and champions
  useEffect(() => {
    (async () => {
      try {
        const vRes = await fetch(`${API_BASE}/api/version`);
        const { version } = await vRes.json();
        setDdragonVersion(version);
        setPatchVersion(version);

        const cRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
        const cData = await cRes.json();
        const list: ChampionData[] = Object.values(cData.data).map((c: any) => ({
          id: c.id,
          name: c.name,
          key: c.key,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setChampions(list);
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
        body: JSON.stringify({
          patch: '26.4',
          myChampion,
          role,
          allies,
          enemies,
        }),
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
        <h1>⚔️ DraftCoach</h1>
        <span className="patch">Patch {patchVersion}</span>
      </header>
      <div className="main">
        <div className="left-panel">
          <h2>Draft Setup</h2>

          <div className="field-group">
            <label>Role</label>
            <select
              className="role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label>Your Champion</label>
            <ChampionPicker
              champions={champions}
              selected={myChampion ? [myChampion] : []}
              onSelect={(id) => setMyChampion(id)}
              onRemove={() => setMyChampion('')}
              max={1}
              getIconUrl={getChampIconUrl}
            />
          </div>

          <div className="team-section">
            <h3>Allies (up to 4)</h3>
            <ChampionPicker
              champions={champions}
              selected={allies}
              onSelect={(id) => setAllies((prev) => prev.length < 4 ? [...prev, id] : prev)}
              onRemove={(id) => setAllies((prev) => prev.filter((a) => a !== id))}
              max={4}
              getIconUrl={getChampIconUrl}
            />
          </div>

          <div className="team-section">
            <h3>Enemies (up to 5)</h3>
            <ChampionPicker
              champions={champions}
              selected={enemies}
              onSelect={(id) => setEnemies((prev) => prev.length < 5 ? [...prev, id] : prev)}
              onRemove={(id) => setEnemies((prev) => prev.filter((e) => e !== id))}
              max={5}
              getIconUrl={getChampIconUrl}
            />
          </div>

          <button
            className="btn-generate"
            onClick={handleGenerate}
            disabled={!myChampion || status === 'fetching'}
          >
            {status === 'fetching' ? 'Generating...' : 'Generate Build'}
          </button>
        </div>

        <div className="right-panel">
          <div className="status-bar">
            <span className={`status-dot ${status}`} />
            <span>
              {status === 'idle' && 'Ready'}
              {status === 'fetching' && 'Fetching build...'}
              {status === 'grounded' && 'Grounded result ✓'}
              {status === 'cache' && 'From cache'}
              {status === 'stale-cache' && 'Stale cache (AI unavailable)'}
              {status === 'error' && 'Error'}
            </span>
          </div>

          <BuildOutput result={buildResult} />
        </div>
      </div>
    </div>
  );
}
