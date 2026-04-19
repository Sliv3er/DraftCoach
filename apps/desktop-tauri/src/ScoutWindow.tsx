import { ipcInvoke, ipcSend, ipcOn, ipcRemoveListener } from './bridge';
import React, { useState, useEffect, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────
interface RecentMatch {
  champion: string; win: boolean; kills: number; deaths: number; assists: number;
  cs: number; csPerMin: string; gameDuration: number; role: string;
}
interface PlayerData {
  riotId: string; championName: string; team: string; isMe: boolean;
  level: number; tier: string; rank: string; lp: number;
  wins: number; losses: number; winRate: number; totalGames: number;
  hotStreak: boolean; recentMatches: RecentMatch[];
  recentAvgKDA: number; recentWinRate: number; recentAvgCS: string;
  rating: number; note: string; laneNote: string;
  smurfProbability: number; mentalState: string; approach: string;
  soloQ?: { tier: string; rank: string; lp: number; winRate: number; wins: number; losses: number; hotStreak: boolean; totalGames: number } | null;
  flexQ?: { tier: string; rank: string; winRate: number; totalGames: number } | null;
}
interface Strategy {
  keyThreat?: string; weakLink?: string; focus?: string; avoid?: string;
  laningPhase?: string; teamfightPlan?: string; objectivePriority?: string;
  winCondition?: string; dangerLevel?: string;
}
interface LaneMatchup {
  myChamp: string; enemyChamp: string; earlyGame: string;
  powerSpikes: string; playTip: string; dangerWindows: string;
}
interface ScoutReport {
  players: PlayerData[]; strategy: Strategy; gamePlan: string;
  coachBriefing: string; winProbability: number;
  laneMatchup: LaneMatchup | null;
  rawText: string; timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────────
const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/15.1.1/img/champion/';

function champIcon(name: string): string {
  return DDRAGON + (name || '').replace(/[\s'.]/g, '') + '.png';
}

function tierColor(tier: string): string {
  const c: Record<string, string> = {
    CHALLENGER: '#f4c874', GRANDMASTER: '#e74c3c', MASTER: '#9b59b6',
    DIAMOND: '#4894ef', EMERALD: '#2ecc71', PLATINUM: '#1abc9c',
    GOLD: '#f1c40f', SILVER: '#95a5a6', BRONZE: '#cd7f32', IRON: '#7f8c8d',
  };
  return c[tier] || '#666';
}

function threatColor(r: number): string {
  if (r >= 9) return '#e74c3c';
  if (r >= 7) return '#e67e22';
  if (r >= 5) return '#f1c40f';
  if (r >= 3) return '#2ecc71';
  return '#3498db';
}

function mentalTag(state: string): { label: string; color: string } | null {
  switch (state) {
    case 'ON FIRE': return { label: 'ON FIRE', color: '#f1c40f' };
    case 'LOCKED IN': return { label: 'FOCUSED', color: '#2ecc71' };
    case 'SHAKY': return { label: 'SHAKY', color: '#e67e22' };
    case 'TILTED': return { label: 'TILTED', color: '#e74c3c' };
    case 'MENTAL BOOM': return { label: 'MENTAL BOOM', color: '#e74c3c' };
    default: return null; // Don't show STABLE — it's the default
  }
}

function formatRank(tier: string, rank: string): string {
  if (!tier || tier === 'UNRANKED' || tier === 'HIDDEN') return tier || '—';
  return `${tier[0]}${tier.slice(1).toLowerCase()} ${rank}`;
}

function wrClass(wr: number): string {
  return wr >= 55 ? 'wr-good' : wr < 45 ? 'wr-bad' : '';
}

function kdaClass(kda: number): string {
  return kda >= 4 ? 'kda-good' : kda < 2 ? 'kda-bad' : '';
}

// ─── Component ───────────────────────────────────────────────────
export function ScoutWindow() {
  const [report, setReport] = useState<ScoutReport | null>(null);
  const [status, setStatus] = useState<{ phase: string; message: string }>({ phase: 'idle', message: '' });
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debugRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ipcOn('scout-report', (_e: any, d: ScoutReport) => setReport(d));
    ipcOn('scout-status', (_e: any, d: any) => setStatus(d));
    ipcOn('scout-debug', (_e: any, l: string) => setDebugLog(p => [...p.slice(-80), l]));
    ipcInvoke('scout-get-cached').then((c: ScoutReport | null) => {
      if (c) { setReport(c); setStatus({ phase: 'done', message: '' }); }
    });
    return () => { ipcRemoveListener('scout-report'); ipcRemoveListener('scout-status'); ipcRemoveListener('scout-debug'); };
  }, []);

  useEffect(() => { if (debugRef.current) debugRef.current.scrollTop = debugRef.current.scrollHeight; }, [debugLog]);

  const s = report?.strategy || {} as Strategy;
  const myPlayer = report?.players.find(p => p.isMe);
  const myTeamId = myPlayer?.team;
  const enemies = report?.players.filter(p => p.team !== myTeamId) || [];
  const allies = report?.players.filter(p => p.team === myTeamId) || [];
  const wp = report?.winProbability ?? 50;
  const lm = report?.laneMatchup;

  // ─── Loading ────────────────────────────────────────────────────
  if (!report) {
    return (
      <div className="sc">
        <div className="sc-bar"><span className="sc-title">Live Scouting</span>
          <button className="sc-dbg-btn" onClick={() => setShowDebug(!showDebug)}>{showDebug ? '×' : 'Debug'}</button>
        </div>
        <div className="sc-center">
          {status.phase === 'fetching' || status.phase === 'analyzing' ? (
            <><div className="sc-spinner" /><div className="sc-msg">{status.message}</div></>
          ) : (
            <><div className="sc-msg">Waiting for game</div><div className="sc-sub">Report auto-generates during loading screen</div></>
          )}
        </div>
        {showDebug && <div className="sc-debug" ref={debugRef}>{debugLog.map((l,i) => <div key={i}>{l}</div>)}</div>}
      </div>
    );
  }

  return (
    <div className="sc">
      {/* Title Bar */}
      <div className="sc-bar">
        <span className="sc-title">Live Scouting</span>
        <div className="sc-bar-right">
          {s.dangerLevel && (
            <span className={`sc-danger sc-danger-${s.dangerLevel?.toLowerCase()}`}>{s.dangerLevel}</span>
          )}
          <span className={`sc-wp ${wp >= 55 ? 'wp-high' : wp < 45 ? 'wp-low' : 'wp-mid'}`}>
            {wp}% Win
          </span>
          <button className="sc-dbg-btn" onClick={() => setShowDebug(!showDebug)}>{showDebug ? '×' : 'Debug'}</button>
        </div>
      </div>

      <div className="sc-body">
        {/* Coach Briefing — clean banner */}
        {report.coachBriefing && (
          <div className="sc-briefing">{report.coachBriefing}</div>
        )}

        {/* Lane Matchup — compact inline */}
        {lm && (
          <div className="sc-matchup">
            <div className="sc-mu-vs">
              <img className="sc-mu-icon" src={champIcon(lm.myChamp)} alt="" />
              <span className="sc-mu-name">{lm.myChamp}</span>
              <span className="sc-mu-sep">vs</span>
              <span className="sc-mu-name sc-mu-enemy-name">{lm.enemyChamp}</span>
              <img className="sc-mu-icon" src={champIcon(lm.enemyChamp)} alt="" />
            </div>
            <div className="sc-mu-grid">
              <div className="sc-mu-cell"><span className="sc-mu-lbl">Early</span><span className="sc-mu-val">{lm.earlyGame}</span></div>
              <div className="sc-mu-cell"><span className="sc-mu-lbl">Spikes</span><span className="sc-mu-val">{lm.powerSpikes}</span></div>
              <div className="sc-mu-cell"><span className="sc-mu-lbl">Tip</span><span className="sc-mu-val sc-mu-tip">{lm.playTip}</span></div>
              <div className="sc-mu-cell"><span className="sc-mu-lbl">Danger</span><span className="sc-mu-val sc-mu-warn">{lm.dangerWindows}</span></div>
            </div>
          </div>
        )}

        {/* Strategy Row */}
        <div className="sc-strat-row">
          {s.winCondition && <div className="sc-strat"><span className="sc-strat-lbl">Win Con</span><span className="sc-strat-val">{s.winCondition}</span></div>}
          {s.focus && <div className="sc-strat"><span className="sc-strat-lbl">Focus</span><span className="sc-strat-val">{s.focus}</span></div>}
          {s.avoid && <div className="sc-strat"><span className="sc-strat-lbl">Avoid</span><span className="sc-strat-val sc-strat-warn">{s.avoid}</span></div>}
        </div>

        {/* Enemy Team */}
        <div className="sc-section">
          <div className="sc-sec-head sc-sec-enemy">Enemy Team</div>
          {enemies.sort((a, b) => b.rating - a.rating).map((p, i) => (
            <PlayerRow key={p.riotId + i} p={p} isEnemy expanded={expandedId === p.riotId} toggle={() => setExpandedId(expandedId === p.riotId ? null : p.riotId)} />
          ))}
        </div>

        {/* Your Team */}
        <div className="sc-section">
          <div className="sc-sec-head sc-sec-ally">Your Team</div>
          {allies.sort((a, b) => b.rating - a.rating).map((p, i) => (
            <PlayerRow key={p.riotId + i} p={p} isEnemy={false} expanded={expandedId === p.riotId} toggle={() => setExpandedId(expandedId === p.riotId ? null : p.riotId)} />
          ))}
        </div>
      </div>

      {showDebug && <div className="sc-debug" ref={debugRef}>{debugLog.map((l,i) => <div key={i}>{l}</div>)}</div>}
    </div>
  );
}

// ─── Player Row ──────────────────────────────────────────────────
function PlayerRow({ p, isEnemy, expanded, toggle }: { p: PlayerData; isEnemy: boolean; expanded: boolean; toggle: () => void }) {
  const mental = mentalTag(p.mentalState);
  const recent = p.recentMatches?.slice(0, 5) || [];
  const recentWins = recent.filter(m => m.win).length;

  return (
    <div className={`sc-row ${p.isMe ? 'sc-row-me' : ''}`} onClick={toggle}>
      {/* Threat bar */}
      <div className="sc-threat-bar" style={{ background: threatColor(p.rating), width: `${p.rating * 10}%` }} />

      <div className="sc-row-main">
        {/* Champion icon */}
        <img className="sc-champ-icon" src={champIcon(p.championName)} alt="" />

        {/* Info block */}
        <div className="sc-row-info">
          <div className="sc-row-top">
            <span className="sc-name">{p.championName}</span>
            {p.isMe && <span className="sc-tag sc-tag-you">YOU</span>}
            {p.smurfProbability >= 50 && <span className="sc-tag sc-tag-smurf">SMURF</span>}
            {p.hotStreak && <span className="sc-tag sc-tag-streak">STREAK</span>}
            {mental && <span className="sc-tag" style={{ background: mental.color + '22', color: mental.color }}>{mental.label}</span>}
          </div>
          <div className="sc-row-bot">
            <span className="sc-rank" style={{ color: tierColor(p.tier) }}>{formatRank(p.tier, p.rank)}</span>
            {p.totalGames > 0 && (
              <>
                <span className="sc-dot">·</span>
                <span className={wrClass(p.winRate)}>{p.winRate}%</span>
                <span className="sc-dot">·</span>
                <span className="sc-games">{p.totalGames}G</span>
              </>
            )}
            {p.recentAvgKDA > 0 && (
              <>
                <span className="sc-dot">·</span>
                <span className={kdaClass(p.recentAvgKDA)}>{p.recentAvgKDA.toFixed(1)} KDA</span>
              </>
            )}
          </div>
        </div>

        {/* Threat number */}
        <div className="sc-threat-num" style={{ color: threatColor(p.rating) }}>{p.rating}</div>

        {/* Recent form mini bar */}
        <div className="sc-form">
          {recent.map((m, i) => (
            <div key={i} className={`sc-form-pip ${m.win ? 'pip-w' : 'pip-l'}`} />
          ))}
          {recent.length === 0 && <span className="sc-no-data">—</span>}
        </div>
      </div>

      {/* Note line */}
      {p.note && <div className="sc-row-note">{p.note}{p.laneNote ? ` — ${p.laneNote}` : ''}</div>}

      {/* Expanded: recent matches table */}
      {expanded && recent.length > 0 && (
        <div className="sc-expand">
          <table className="sc-match-tbl">
            <tbody>
              {recent.map((m, i) => (
                <tr key={i} className={m.win ? 'sc-mw' : 'sc-ml'}>
                  <td className="sc-m-res">{m.win ? 'W' : 'L'}</td>
                  <td className="sc-m-champ">{m.champion}</td>
                  <td className="sc-m-kda">{m.kills}/{m.deaths}/{m.assists}</td>
                  <td className="sc-m-cs">{m.csPerMin} cs/m</td>
                  <td className="sc-m-dur">{m.gameDuration}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
