import React, { useState, useEffect, useRef, useMemo } from 'react';

// Window controls for frameless window (via IPC)
const { ipcRenderer: ipc } = window.require('electron');
const WinControls = () => (
  <div className="st-win-controls">
    <button className="st-win-btn st-win-min" onClick={() => ipc.send('stats-win-minimize')}>&#x2013;</button>
    <button className="st-win-btn st-win-close" onClick={() => ipc.send('stats-win-close')}>&times;</button>
  </div>
);

// ─── Types ───────────────────────────────────────────────────────
interface MatchPlayer {
  championName: string; champIcon: string; summonerName: string;
  kills: number; deaths: number; assists: number;
  cs: number; csMin: string; dpm: number; damage: number;
  gold: number; goldMin: string; vision: number; kp: number;
  isMe: boolean; teamId: number;
}
interface MatchData {
  championName: string; champIcon: string; win: boolean; remake?: boolean;
  kills: number; deaths: number; assists: number;
  cs: number; csMin: string; dpm: number; avgDpm: number;
  visionScore: number; goldEarned: number; goldMin: string;
  duration: string; gameMode: string; timeAgo: string;
  kp: number; dmgShare: number; goldShare: number; isTopDmg: boolean;
  aiScore: number; isMvp: boolean; isLvp: boolean;
  gameTimestamp: number; queueId: number;
  myTeam: MatchPlayer[]; enemyTeam: MatchPlayer[];
}
interface ChampStats {
  name: string; icon: string; games: number; winRate: number; kda: number;
}
interface LpPoint {
  ts: number; absLp: number; tier: string; rank: string; lp: number;
}
interface RankData {
  tier: string; rank: string; lp: number; wins: number; losses: number; winRate: number;
}
interface StatsData {
  summoner: { name: string; tag: string; level: number; iconUrl: string };
  rank: RankData;
  flexRank: RankData;
  soloLpHistory: LpPoint[];
  flexLpHistory: LpPoint[];
  matchHistory: MatchData[];
  champPool: ChampStats[];
  aiAnalysis?: {
    queueHealth: string; queueColor: string;
    consistency: string; consistencyColor: string;
    tip: string; performanceGrade: string; gradeExplanation: string;
    gradeColor: string; improvementAreas: string[]; strengthAreas: string[];
    mentalState: string;
    champRatings: Record<string, { grade: string; note: string }>;
  } | null;
}
interface GameAnalysis {
  rating: number; verdict: string; rankInGame: number;
  strengths: string; weaknesses: string; deepAnalysis: string; tip: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
const TIERS = ['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER'];
const TIER_ABS: Record<string, number> = { IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 3200, CHALLENGER: 3600 };

function tierColor(tier: string): string {
  const c: Record<string, string> = {
    CHALLENGER: '#f4c874', GRANDMASTER: '#e74c3c', MASTER: '#9b59b6',
    DIAMOND: '#4894ef', EMERALD: '#2ecc71', PLATINUM: '#1abc9c',
    GOLD: '#f1c40f', SILVER: '#95a5a6', BRONZE: '#cd7f32', IRON: '#7f8c8d',
  };
  return c[tier] || '#666';
}

function tierIconUrl(tier: string): string {
  const t = (tier || 'unranked').toLowerCase();
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t}.svg`;
}

function scoreColor(s: number): string {
  if (s >= 9) return '#f1c40f';
  if (s >= 7) return '#2ecc71';
  if (s >= 5) return '#4894ef';
  if (s >= 3) return '#e67e22';
  return '#e74c3c';
}

function kdaColor(kda: number): string {
  if (kda >= 5) return '#f1c40f';
  if (kda >= 3) return '#2ecc71';
  if (kda >= 2) return '#4894ef';
  return '#e74c3c';
}

function gradeColor(grade: string): string {
  if (grade.startsWith('S')) return '#f1c40f';
  if (grade === 'A') return '#2ecc71';
  if (grade === 'B') return '#4894ef';
  if (grade === 'C') return '#e67e22';
  return '#e74c3c';
}

function mentalLabel(state: string): { text: string; color: string } | null {
  switch (state) {
    case 'ON FIRE': return { text: 'ON FIRE', color: '#f1c40f' };
    case 'LOCKED IN': return { text: 'FOCUSED', color: '#2ecc71' };
    case 'SHAKY': return { text: 'SHAKY', color: '#e67e22' };
    case 'TILTED': return { text: 'TILTED', color: '#e74c3c' };
    case 'MENTAL BOOM': return { text: 'MENTAL BOOM', color: '#e74c3c' };
    default: return null;
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ─── LP Chart Component ──────────────────────────────────────────
function LpChart({ soloHistory, flexHistory, period }: { soloHistory: LpPoint[]; flexHistory: LpPoint[]; period: '7d' | '30d' }) {
  const [hover, setHover] = useState<{ x: number; y: number; point: LpPoint; queue: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cutoff = period === '7d' ? Date.now() - 7 * 86400000 : Date.now() - 30 * 86400000;
  const soloFiltered = soloHistory.filter(p => p.ts >= cutoff);
  const flexFiltered = flexHistory.filter(p => p.ts >= cutoff);
  const allPoints = [...soloFiltered, ...flexFiltered];

  if (allPoints.length < 2) return <div className="lp-chart-empty">Not enough ranked data for this period</div>;

  const w = 400, h = 180, padL = 36, padR = 12, padT = 12, padB = 24;
  const chartW = w - padL - padR, chartH = h - padT - padB;

  // Y range from data
  const allLp = allPoints.map(p => p.absLp);
  const minLp = Math.min(...allLp);
  const maxLp = Math.max(...allLp);
  const lpRange = Math.max(150, maxLp - minLp);
  const yPad = lpRange * 0.15;
  const yMin = Math.max(0, minLp - yPad);
  const yMax = maxLp + yPad;

  // X range from ACTUAL data (not cutoff), so line fills the chart
  const allTs = allPoints.map(p => p.ts);
  const tMin = Math.min(...allTs);
  const tMax = Math.max(...allTs);
  const tRange = Math.max(1, tMax - tMin);

  const toX = (ts: number) => padL + ((ts - tMin) / tRange) * chartW;
  const toY = (lp: number) => padT + chartH - ((lp - yMin) / (yMax - yMin)) * chartH;

  // Tier lines within Y range
  const tierLines = TIERS.filter(t => TIER_ABS[t] >= yMin && TIER_ABS[t] <= yMax).map(t => ({
    tier: t, y: toY(TIER_ABS[t]), color: tierColor(t)
  }));

  // Build SVG path string
  const buildPath = (points: LpPoint[]) => {
    if (points.length < 2) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.ts).toFixed(1)},${toY(p.absLp).toFixed(1)}`).join(' ');
  };

  // Build area fill path (line + drop to bottom)
  const buildArea = (points: LpPoint[], color: string, id: string) => {
    if (points.length < 2) return null;
    const linePath = buildPath(points);
    const lastX = toX(points[points.length - 1].ts).toFixed(1);
    const firstX = toX(points[0].ts).toFixed(1);
    const bottom = (padT + chartH).toFixed(1);
    const areaPath = `${linePath} L${lastX},${bottom} L${firstX},${bottom} Z`;
    return (
      <>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${id})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  };

  // Y-axis LP labels
  const yTicks = [yMin, yMin + (yMax - yMin) * 0.5, yMax].map(v => ({ v: Math.round(v), y: toY(v) }));

  // X-axis date labels
  const xLabels: { label: string; x: number }[] = [];
  if (allPoints.length >= 2) {
    const pts = [...allPoints].sort((a, b) => a.ts - b.ts);
    xLabels.push({ label: formatDate(pts[0].ts), x: toX(pts[0].ts) });
    xLabels.push({ label: formatDate(pts[pts.length - 1].ts), x: toX(pts[pts.length - 1].ts) });
  }

  const handleMouse = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * w;
    const my = ((e.clientY - rect.top) / rect.height) * h;

    let best: { dist: number; point: LpPoint; queue: string } | null = null;
    for (const p of soloFiltered) {
      const d = Math.hypot(toX(p.ts) - mx, toY(p.absLp) - my);
      if (!best || d < best.dist) best = { dist: d, point: p, queue: 'Solo' };
    }
    for (const p of flexFiltered) {
      const d = Math.hypot(toX(p.ts) - mx, toY(p.absLp) - my);
      if (!best || d < best.dist) best = { dist: d, point: p, queue: 'Flex' };
    }
    if (best && best.dist < 30) {
      setHover({ x: toX(best.point.ts), y: toY(best.point.absLp), point: best.point, queue: best.queue });
    } else {
      setHover(null);
    }
  };

  const soloArea = buildArea(soloFiltered, '#2ecc71', 'solo-grad');
  const flexArea = buildArea(flexFiltered, '#e67e22', 'flex-grad');

  return (
    <div className="lp-chart" onMouseLeave={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} onMouseMove={handleMouse}>
        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={padL - 4} y={t.y + 3} fontSize="7" fill="#555" textAnchor="end">{t.v}</text>
        ))}

        {/* Tier lines */}
        {tierLines.map(t => (
          <g key={t.tier}>
            <line x1={padL} x2={w - padR} y1={t.y} y2={t.y}
              stroke={t.color} strokeWidth="0.5" strokeDasharray="4,3" opacity="0.4" />
            <text x={padL - 4} y={t.y - 2} fontSize="6.5" fill={t.color} opacity="0.7" textAnchor="end">
              {t.tier.slice(0, 3)}
            </text>
          </g>
        ))}

        {/* Chart area background */}
        <rect x={padL} y={padT} width={chartW} height={chartH} fill="rgba(255,255,255,0.015)" rx="2" />

        {/* Area fills + lines */}
        {soloArea}
        {flexArea}

        {/* Dots */}
        {soloFiltered.map((p, i) => (
          <circle key={`s${i}`} cx={toX(p.ts)} cy={toY(p.absLp)} r="2.5" fill="#2ecc71" opacity="0.85" />
        ))}
        {flexFiltered.map((p, i) => (
          <circle key={`f${i}`} cx={toX(p.ts)} cy={toY(p.absLp)} r="2.5" fill="#e67e22" opacity="0.85" />
        ))}

        {/* X-axis date labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={h - 4} fontSize="7" fill="#444" textAnchor={i === 0 ? 'start' : 'end'}>{l.label}</text>
        ))}

        {/* Hover crosshair */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + chartH} stroke="#fff" strokeWidth="0.5" opacity="0.2" />
            <circle cx={hover.x} cy={hover.y} r="4.5" fill={hover.queue === 'Solo' ? '#2ecc71' : '#e67e22'} stroke="#0f1016" strokeWidth="1.5" />
          </>
        )}
      </svg>

      {/* Tooltip */}

      {hover && (
        <div className="lp-tooltip" style={{ left: `${(hover.x / w) * 100}%`, top: `${(hover.y / h) * 100 - 16}%` }}>
          <div className="lp-tt-date">{formatDate(hover.point.ts)}</div>
          <div className="lp-tt-rank" style={{ color: tierColor(hover.point.tier) }}>
            {hover.point.tier} {hover.point.rank} — {hover.point.lp} LP
          </div>
          <div className="lp-tt-queue">{hover.queue} Q</div>
        </div>
      )}

      {/* Legend */}
      <div className="lp-legend">
        <span className="lp-leg-item"><span className="lp-leg-line" style={{ background: '#2ecc71' }} /> Solo</span>
        <span className="lp-leg-item"><span className="lp-leg-line lp-leg-dash" style={{ background: '#e67e22' }} /> Flex</span>
      </div>
    </div>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────
function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const w = 100, h = 24, pad = 2;
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
    const y = pad + ((10 - s) / 10) * (h - pad * 2);
    return `${x},${y}`;
  });
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const last3 = scores.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length);
  const first3 = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length);
  const trend = last3 - first3;
  const color = trend > 0.5 ? '#2ecc71' : trend < -0.5 ? '#e74c3c' : '#e67e22';

  return (
    <div className="st-spark">
      <svg viewBox={`0 0 ${w} ${h}`} className="st-spark-svg">
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        {scores.map((s, i) => {
          const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
          const y = pad + ((10 - s) / 10) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r="1.5" fill={scoreColor(s)} />;
        })}
      </svg>
      <span className="st-spark-avg" style={{ color }}>{avg.toFixed(1)}</span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────
export function StatsWindow() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [gameAnalysis, setGameAnalysis] = useState<Record<number, GameAnalysis | null>>({});
  const [analyzingGame, setAnalyzingGame] = useState<number | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [lpPeriod, setLpPeriod] = useState<'7d' | '30d'>('30d');
  const [view, setView] = useState<'home' | 'solo-lp' | 'flex-lp'>('home');
  const [modeFilter, setModeFilter] = useState('All');
  const [playerProfile, setPlayerProfile] = useState<StatsData | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const debugRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.on('stats-data', (_e: any, d: StatsData) => { setStats(d); setLoading(false); setError(''); });
    ipcRenderer.on('stats-error', (_e: any, msg: string) => { setError(msg); setLoading(false); });
    ipcRenderer.on('stats-log', (_e: any, msg: string) => setDebugLog(p => [...p.slice(-50), msg]));
    return () => { ipcRenderer.removeAllListeners('stats-data'); ipcRenderer.removeAllListeners('stats-error'); ipcRenderer.removeAllListeners('stats-log'); };
  }, []);

  useEffect(() => { if (debugRef.current) debugRef.current.scrollTop = debugRef.current.scrollHeight; }, [debugLog]);

  const fetchStats = () => { setLoading(true); setError(''); const { ipcRenderer } = window.require('electron'); ipcRenderer.invoke('fetch-my-stats').catch((e: any) => { setError(e.message); setLoading(false); }); };

  // Auto-load stats on mount
  useEffect(() => { fetchStats(); }, []);

  const analyzeGame = async (idx: number) => {
    if (analyzingGame !== null) return;
    setAnalyzingGame(idx);
    try {
      const { ipcRenderer } = window.require('electron');
      const raw = await ipcRenderer.invoke('analyze-single-game', idx);
      const parsed = JSON.parse(raw);
      setGameAnalysis(prev => ({ ...prev, [idx]: parsed.error ? null : parsed }));
    } catch { setGameAnalysis(prev => ({ ...prev, [idx]: null })); }
    setAnalyzingGame(null);
  };

  const toggleGame = (idx: number) => {
    if (expandedGame === idx) { setExpandedGame(null); return; }
    setExpandedGame(idx);
    if (!gameAnalysis[idx]) analyzeGame(idx);
  };

  const viewPlayerProfile = async (name: string) => {
    if (playerLoading) return;
    setPlayerLoading(true);
    setPlayerError('');
    try {
      const { ipcRenderer } = window.require('electron');
      // Try name#tag split, fallback to name#EUW
      const parts = name.split('#');
      const pName = parts[0];
      const pTag = parts[1] || 'EUW';
      const data = await ipcRenderer.invoke('fetch-player-stats', pName, pTag);
      setPlayerProfile(data);
    } catch (e: any) {
      setPlayerError(e.message || 'Failed to load player');
    }
    setPlayerLoading(false);
  };

  const ai = stats?.aiAnalysis;
  const tc = stats ? tierColor(stats.rank.tier) : '#666';
  const recentW = stats?.matchHistory.filter(m => m.win).length || 0;
  const recentL = (stats?.matchHistory.length || 0) - recentW;
  const mental = ai ? mentalLabel(ai.mentalState || '') : null;

  // Mode filter
  const MODES = ['All', 'Ranked', 'Flex', 'ARAM', 'Draft', 'Normal'];
  const filteredMatches = useMemo(() => {
    if (!stats) return [];
    if (modeFilter === 'All') return stats.matchHistory;
    return stats.matchHistory.filter(m => m.gameMode === modeFilter);
  }, [stats, modeFilter]);

  // Recompute champion pool per mode
  const filteredChampPool = useMemo(() => {
    const champMap: Record<string, { games: number; wins: number; kills: number; deaths: number; assists: number; icon: string }> = {};
    for (const m of filteredMatches) {
      const cn = m.championName;
      if (!champMap[cn]) champMap[cn] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, icon: m.champIcon };
      champMap[cn].games++;
      if (m.win) champMap[cn].wins++;
      champMap[cn].kills += m.kills;
      champMap[cn].deaths += m.deaths;
      champMap[cn].assists += m.assists;
    }
    return Object.entries(champMap)
      .map(([name, s]) => ({
        name,
        icon: s.icon,
        games: s.games,
        winRate: Math.round((s.wins / s.games) * 100),
        kda: s.deaths === 0 ? s.kills + s.assists : parseFloat(((s.kills + s.assists) / s.deaths).toFixed(2)),
      }))
      .sort((a, b) => b.games - a.games);
  }, [filteredMatches]);

  // LP delta calculations
  const soloHist = stats?.soloLpHistory || [];
  const flexHist = stats?.flexLpHistory || [];
  const lpDelta = (hist: LpPoint[], days: number) => {
    if (hist.length < 2) return 0;
    const cutoff = Date.now() - days * 86400000;
    const filtered = hist.filter(p => p.ts >= cutoff);
    if (filtered.length < 2) return 0;
    return filtered[filtered.length - 1].absLp - filtered[0].absLp;
  };
  const solo30d = lpDelta(soloHist, 30);
  const solo7d = lpDelta(soloHist, 7);

  // LP prediction
  const lp = stats?.rank.lp || 0;
  const wr = (stats?.rank.winRate || 50) / 100;
  const expectedLpPerGame = wr * 22 - (1 - wr) * 18;
  const gamesToPromo = expectedLpPerGame > 0 ? Math.ceil((100 - lp) / expectedLpPerGame) : null;

  // ─── Loading / Error / Empty ─────────────────────────────────────
  if (!stats) {
    return (
      <div className="st">
        <div className="st-bar"><span className="st-title">My Stats</span>
          <button className="st-dbg-btn" onClick={() => setShowDebug(!showDebug)}>{showDebug ? '×' : 'Debug'}</button>
          <WinControls />
        </div>
        <div className="st-center">
          {loading ? (<><div className="st-spinner" /><div className="st-msg">Loading stats...</div></>) :
           error ? (<><div className="st-msg st-err">{error}</div><button className="st-btn" onClick={fetchStats}>Retry</button></>) :
           (<><div className="st-msg">View your performance</div><button className="st-btn" onClick={fetchStats}>Load Stats</button></>)}
        </div>
        {showDebug && <div className="st-debug" ref={debugRef}>{debugLog.map((l,i) => <div key={i}>{l}</div>)}</div>}
      </div>
    );
  }

  const champRatings = ai?.champRatings || {};

  // Player profile loading overlay
  if (playerLoading) {
    return (
      <div className="st">
        <div className="st-bar"><button className="st-back-btn" onClick={() => setPlayerLoading(false)}>&larr; Cancel</button><span className="st-title">Loading Player...</span><WinControls /></div>
        <div className="st-center"><div className="st-spinner" /><div className="st-msg">Fetching player data...</div></div>
      </div>
    );
  }

  // Player profile view
  if (playerProfile) {
    const pp = playerProfile;
    const ppTc = tierColor(pp.rank.tier);
    const ppModes = ['All', 'Ranked', 'Flex', 'ARAM', 'Draft', 'Normal'];
    const [ppFilter, setPpFilter] = [modeFilter, setModeFilter];
    const ppFiltered = ppFilter === 'All' ? pp.matchHistory : pp.matchHistory.filter(m => m.gameMode === ppFilter);
    const [ppExpanded, setPpExpanded] = [expandedGame, setExpandedGame];

    // Player LP graph sub-view
    if (view === 'solo-lp' || view === 'flex-lp') {
      const isSolo = view === 'solo-lp';
      const hist = isSolo ? (pp.soloLpHistory || []) : (pp.flexLpHistory || []);
      const rankData = isSolo ? pp.rank : pp.flexRank;
      const rankTc = tierColor(rankData.tier);
      return (
        <div className="st">
          <div className="st-bar">
            <button className="st-back-btn" onClick={() => setView('home')}>&larr; Back</button>
            <span className="st-title">{pp.summoner.name} — {isSolo ? 'Solo' : 'Flex'} LP</span>
            <div className="st-bar-right">
              <div className="st-lp-toggle">
                <button className={`st-lp-btn ${lpPeriod === '7d' ? 'active' : ''}`} onClick={() => setLpPeriod('7d')}>7d</button>
                <button className={`st-lp-btn ${lpPeriod === '30d' ? 'active' : ''}`} onClick={() => setLpPeriod('30d')}>30d</button>
              </div>
            </div>
            <WinControls />
          </div>
          <div className="st-body">
            <div className="st-rank-row">
              <img className="st-rank-icon" src={tierIconUrl(rankData.tier)} alt="" />
              <div className="st-rank-info">
                <div className="st-rank-tier" style={{ color: rankTc }}>{rankData.tier} {rankData.rank} — {rankData.lp} LP</div>
                <div className="st-rank-record">
                  <span className="st-pw">{rankData.wins}W</span> <span className="st-pl">{rankData.losses}L</span>
                  <span className={`st-pwr ${rankData.winRate >= 55 ? 'wr-good' : rankData.winRate < 45 ? 'wr-bad' : ''}`}>({rankData.winRate}%)</span>
                </div>
              </div>
            </div>
            <div className="st-lp-chart-section">
              <LpChart soloHistory={isSolo ? hist : []} flexHistory={isSolo ? [] : hist} period={lpPeriod} />
            </div>
          </div>
        </div>
      );
    }

    // Recompute champ pool for player from filtered matches
    const ppChampMap: Record<string, { games: number; wins: number; kills: number; deaths: number; assists: number; icon: string }> = {};
    for (const m of ppFiltered) {
      const cn = m.championName;
      if (!ppChampMap[cn]) ppChampMap[cn] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, icon: m.champIcon };
      ppChampMap[cn].games++;
      if (m.win) ppChampMap[cn].wins++;
      ppChampMap[cn].kills += m.kills;
      ppChampMap[cn].deaths += m.deaths;
      ppChampMap[cn].assists += m.assists;
    }
    const ppChamps = Object.entries(ppChampMap)
      .map(([name, s]) => ({
        name, icon: s.icon,
        games: s.games, winRate: Math.round((s.wins / s.games) * 100),
        kda: s.deaths === 0 ? s.kills + s.assists : parseFloat(((s.kills + s.assists) / s.deaths).toFixed(2)),
      }))
      .sort((a, b) => b.games - a.games);

    const ppW = ppFiltered.filter(m => m.win).length;
    const ppL = ppFiltered.length - ppW;

    return (
      <div className="st">
        <div className="st-bar">
          <button className="st-back-btn" onClick={() => { setPlayerProfile(null); setModeFilter('All'); setExpandedGame(null); setView('home'); }}>&larr; Back</button>
          <span className="st-title">{pp.summoner.name}#{pp.summoner.tag}</span>
          <WinControls />
        </div>
        <div className="st-body">
          {/* Rank overview with icons */}
          <div className="st-ranked-section">
            <div className="st-ranks-inline">
              <div className="st-rank-compact">
                <img className="st-rank-icon" src={tierIconUrl(pp.rank.tier)} alt="" />
                <div className="st-rank-queue">Solo/Duo</div>
                <div className="st-rank-tier" style={{ color: ppTc }}>{pp.rank.tier} {pp.rank.rank}</div>
                <div className="st-rank-lp">{pp.rank.lp} LP</div>
                <div className="st-rank-record">
                  <span className="st-pw">{pp.rank.wins}W</span>
                  <span className="st-pl">{pp.rank.losses}L</span>
                  <span className={`st-pwr ${pp.rank.winRate >= 55 ? 'wr-good' : pp.rank.winRate < 45 ? 'wr-bad' : ''}`}>{pp.rank.winRate}%</span>
                </div>
              </div>
              {pp.flexRank.tier !== 'UNRANKED' && (
                <div className="st-rank-compact">
                  <img className="st-rank-icon" src={tierIconUrl(pp.flexRank.tier)} alt="" />
                  <div className="st-rank-queue">Flex</div>
                  <div className="st-rank-tier" style={{ color: tierColor(pp.flexRank.tier) }}>{pp.flexRank.tier} {pp.flexRank.rank}</div>
                  <div className="st-rank-lp">{pp.flexRank.lp} LP</div>
                  <div className="st-rank-record">
                    <span className="st-pw">{pp.flexRank.wins}W</span>
                    <span className="st-pl">{pp.flexRank.losses}L</span>
                    <span className={`st-pwr ${pp.flexRank.winRate >= 55 ? 'wr-good' : pp.flexRank.winRate < 45 ? 'wr-bad' : ''}`}>{pp.flexRank.winRate}%</span>
                  </div>
                </div>
              )}
            </div>
            {/* LP Graph buttons */}
            <div className="st-graph-btns">
              {pp.rank.tier !== 'UNRANKED' && <button className="st-lp-graph-btn" onClick={() => setView('solo-lp')}>Solo LP Graph &rarr;</button>}
              {pp.flexRank.tier !== 'UNRANKED' && <button className="st-lp-graph-btn" onClick={() => setView('flex-lp')}>Flex LP Graph &rarr;</button>}
            </div>
          </div>

          {/* Mode tabs */}
          <div className="st-mode-tabs">
            {ppModes.map(mode => {
              const count = mode === 'All' ? pp.matchHistory.length : pp.matchHistory.filter(m => m.gameMode === mode).length;
              if (count === 0 && mode !== 'All') return null;
              return (
                <button key={mode} className={`st-mode-tab ${ppFilter === mode ? 'active' : ''}`} onClick={() => setPpFilter(mode)}>
                  {mode} <span className="st-mode-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Record */}
          <div className="st-insights">
            <div className="st-ins"><span className="st-ins-lbl">Record</span><span className="st-ins-val"><span className="st-pw">{ppW}W</span> <span className="st-pl">{ppL}L</span></span></div>
            <div className="st-ins"><span className="st-ins-lbl">Win Rate</span><span className="st-ins-val" style={{ color: ppFiltered.length > 0 ? (ppW / ppFiltered.length >= 0.55 ? '#2ecc71' : ppW / ppFiltered.length < 0.45 ? '#e74c3c' : '#aaa') : '#aaa' }}>{ppFiltered.length > 0 ? Math.round((ppW / ppFiltered.length) * 100) : 0}%</span></div>
          </div>

          {/* Champ pool */}
          {ppChamps.length > 0 && (
            <div className="st-sec">
              <div className="st-sec-head">Champion Pool{ppFilter !== 'All' ? ` \u2014 ${ppFilter}` : ''}<span className="st-sec-count">{ppChamps.length}</span></div>
              <div className="st-champs">
                {ppChamps.slice(0, 8).map(c => (
                  <div key={c.name} className="st-champ">
                    <img className="st-champ-img" src={c.icon} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="st-champ-data">
                      <span className="st-champ-name">{c.name}</span>
                      <div className="st-champ-stats">
                        <span className={`st-champ-wr ${c.winRate >= 60 ? 'wr-good' : c.winRate < 45 ? 'wr-bad' : ''}`}>{c.winRate}%</span>
                        <span className="st-champ-sep">&middot;</span>
                        <span className="st-champ-meta">{c.games}G</span>
                        <span className="st-champ-sep">&middot;</span>
                        <span className="st-champ-kda" style={{ color: kdaColor(c.kda) }}>{c.kda} KDA</span>
                      </div>
                    </div>
                    <div className="st-champ-bar"><div className="st-champ-bar-fill" style={{ width: `${c.winRate}%`, background: c.winRate >= 50 ? '#2ecc71' : '#e74c3c' }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match history with expandable scoreboard */}
          <div className="st-sec">
            <div className="st-sec-head">Matches{ppFilter !== 'All' ? ` \u2014 ${ppFilter}` : ''}<span className="st-sec-count">{ppFiltered.length}</span></div>
            <div className="st-matches">
              {ppFiltered.map((m, idx) => {
                const kda = m.deaths === 0 ? m.kills + m.assists : parseFloat(((m.kills + m.assists) / m.deaths).toFixed(1));
                const dpmPct = m.avgDpm > 0 ? Math.min(100, Math.round((m.dpm / m.avgDpm) * 50)) : 50;
                const isExp = ppExpanded === idx;
                return (
                  <div key={idx} className={`st-match ${m.remake ? 'st-match-rmk' : m.win ? 'st-match-w' : 'st-match-l'}`}>
                    <div className="st-match-main" onClick={() => setPpExpanded(isExp ? null : idx)}>
                      <img className="st-match-icon" src={m.champIcon} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div className="st-match-col1">
                        <span className={`st-match-res ${m.remake ? 'res-rmk' : m.win ? 'res-w' : 'res-l'}`}>{m.remake ? 'RMK' : m.win ? 'W' : 'L'}</span>
                        <span className="st-match-mode">{m.gameMode}</span>
                        <span className="st-match-ago">{m.timeAgo}</span>
                      </div>
                      <div className="st-match-col2">
                        <span className="st-match-kda" style={{ color: kdaColor(kda) }}>{m.kills}/{m.deaths}/{m.assists}</span>
                        <span className="st-match-ratio" style={{ color: kdaColor(kda) }}>{kda} KDA</span>
                      </div>
                      <div className="st-match-col3">
                        <span>{m.csMin} cs/m</span>
                        <span>{m.kp}% KP</span>
                      </div>
                      <div className="st-match-col4">
                        <div className="st-dpm-bar"><div className="st-dpm-fill" style={{ width: `${dpmPct}%` }} /></div>
                        <span className="st-dpm-val">{m.dpm} DPM</span>
                      </div>
                      <span className={`st-match-arrow ${isExp ? 'open' : ''}`}>&#9662;</span>
                    </div>
                    {isExp && m.myTeam?.length > 0 && (
                      <div className="st-detail">
                        <div className="st-sb">
                          <table className="st-sb-tbl">
                            <thead><tr className="st-sb-head-ally"><th colSpan={7}>{m.win ? 'Victory' : 'Defeat'} — Team</th></tr></thead>
                            <tbody>
                              {m.myTeam.map((p, pi) => (
                                <tr key={pi} className={p.isMe ? 'st-sb-me' : ''}>
                                  <td><img className="st-sb-img" src={p.champIcon} alt="" /></td>
                                  <td className="st-sb-name st-sb-clickable" onClick={(e) => { e.stopPropagation(); viewPlayerProfile(p.summonerName); }}>{p.summonerName}</td>
                                  <td className="st-sb-kda">{p.kills}/{p.deaths}/{p.assists}</td>
                                  <td className="st-sb-cs">{p.cs}</td>
                                  <td className="st-sb-dmg">{(p.damage/1000).toFixed(1)}k</td>
                                  <td className="st-sb-gold">{(p.gold/1000).toFixed(1)}k</td>
                                  <td className="st-sb-vis">{p.vision}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <table className="st-sb-tbl">
                            <thead><tr className="st-sb-head-enemy"><th colSpan={7}>{m.win ? 'Defeat' : 'Victory'} — Enemy</th></tr></thead>
                            <tbody>
                              {m.enemyTeam.map((p, pi) => (
                                <tr key={pi}>
                                  <td><img className="st-sb-img" src={p.champIcon} alt="" /></td>
                                  <td className="st-sb-name st-sb-clickable" onClick={(e) => { e.stopPropagation(); viewPlayerProfile(p.summonerName); }}>{p.summonerName}</td>
                                  <td className="st-sb-kda">{p.kills}/{p.deaths}/{p.assists}</td>
                                  <td className="st-sb-cs">{p.cs}</td>
                                  <td className="st-sb-dmg">{(p.damage/1000).toFixed(1)}k</td>
                                  <td className="st-sb-gold">{(p.gold/1000).toFixed(1)}k</td>
                                  <td className="st-sb-vis">{p.vision}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Solo Q LP Graph Page ──────────────────────────────────────
  if (view === 'solo-lp') {
    return (
      <div className="st">
        <div className="st-bar">
          <button className="st-back-btn" onClick={() => setView('home')}>← Back</button>
          <span className="st-title">Ranked Solo — LP Progress</span>
          <div className="st-bar-right">
            <div className="st-lp-toggle">
              <button className={`st-lp-btn ${lpPeriod === '7d' ? 'active' : ''}`} onClick={() => setLpPeriod('7d')}>7d</button>
              <button className={`st-lp-btn ${lpPeriod === '30d' ? 'active' : ''}`} onClick={() => setLpPeriod('30d')}>30d</button>
            </div>
          </div>
          <WinControls />
        </div>
        <div className="st-body">
          <div className="st-rank-row">
            <img className="st-rank-icon" src={tierIconUrl(stats.rank.tier)} alt="" />
            <div className="st-rank-info">
              <div className="st-rank-tier" style={{ color: tc }}>{stats.rank.tier} {stats.rank.rank} — {stats.rank.lp} LP</div>
              <div className="st-rank-record">
                <span className="st-pw">{stats.rank.wins}W</span> <span className="st-pl">{stats.rank.losses}L</span>
                <span className={`st-pwr ${stats.rank.winRate >= 55 ? 'wr-good' : stats.rank.winRate < 45 ? 'wr-bad' : ''}`}>({stats.rank.winRate}%)</span>
              </div>
            </div>
            <div className="st-rank-deltas">
              <span className="st-delta-label">30d</span>
              <span className={`st-delta-val ${solo30d >= 0 ? 'delta-pos' : 'delta-neg'}`}>{solo30d >= 0 ? '+' : ''}{solo30d} LP</span>
              <span className="st-delta-label">7d</span>
              <span className={`st-delta-val ${solo7d >= 0 ? 'delta-pos' : 'delta-neg'}`}>{solo7d >= 0 ? '+' : ''}{solo7d} LP</span>
            </div>
          </div>
          <div className="st-lp-chart-section">
            <LpChart soloHistory={soloHist} flexHistory={[]} period={lpPeriod} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Flex Q LP Graph Page ──────────────────────────────────────
  if (view === 'flex-lp') {
    const flex7d = lpDelta(flexHist, 7);
    const flex30d = lpDelta(flexHist, 30);
    return (
      <div className="st">
        <div className="st-bar">
          <button className="st-back-btn" onClick={() => setView('home')}>← Back</button>
          <span className="st-title">Ranked Flex — LP Progress</span>
          <div className="st-bar-right">
            <div className="st-lp-toggle">
              <button className={`st-lp-btn ${lpPeriod === '7d' ? 'active' : ''}`} onClick={() => setLpPeriod('7d')}>7d</button>
              <button className={`st-lp-btn ${lpPeriod === '30d' ? 'active' : ''}`} onClick={() => setLpPeriod('30d')}>30d</button>
            </div>
          </div>
          <WinControls />
        </div>
        <div className="st-body">
          <div className="st-rank-row">
            <img className="st-rank-icon" src={tierIconUrl(stats.flexRank.tier)} alt="" />
            <div className="st-rank-info">
              <div className="st-rank-tier" style={{ color: tierColor(stats.flexRank.tier) }}>{stats.flexRank.tier} {stats.flexRank.rank} — {stats.flexRank.lp} LP</div>
              <div className="st-rank-record">
                <span className="st-pw">{stats.flexRank.wins}W</span> <span className="st-pl">{stats.flexRank.losses}L</span>
                <span className={`st-pwr ${stats.flexRank.winRate >= 55 ? 'wr-good' : stats.flexRank.winRate < 45 ? 'wr-bad' : ''}`}>({stats.flexRank.winRate}%)</span>
              </div>
            </div>
            <div className="st-rank-deltas">
              <span className="st-delta-label">30d</span>
              <span className={`st-delta-val ${flex30d >= 0 ? 'delta-pos' : 'delta-neg'}`}>{flex30d >= 0 ? '+' : ''}{flex30d} LP</span>
              <span className="st-delta-label">7d</span>
              <span className={`st-delta-val ${flex7d >= 0 ? 'delta-pos' : 'delta-neg'}`}>{flex7d >= 0 ? '+' : ''}{flex7d} LP</span>
            </div>
          </div>
          <div className="st-lp-chart-section">
            <LpChart soloHistory={[]} flexHistory={flexHist} period={lpPeriod} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Home Page ──────────────────────────────────────────────────
  return (
    <div className="st">
      <div className="st-bar">
        <span className="st-title">My Stats</span>
        <div className="st-bar-right">
          <button className="st-btn-sm" onClick={fetchStats} disabled={loading}>{loading ? '...' : 'Refresh'}</button>
          <button className="st-dbg-btn" onClick={() => setShowDebug(!showDebug)}>{showDebug ? '×' : 'Debug'}</button>
        </div>
        <WinControls />
      </div>

      <div className="st-body">
        {/* ── Compact Ranked Overview ── */}
        <div className="st-ranked-section">
          <div className="st-ranks-inline">
            {/* Solo Q */}
            <div className="st-rank-compact">
              <img className="st-rank-icon" src={tierIconUrl(stats.rank.tier)} alt="" />
              <div className="st-rank-queue">Solo/Duo</div>
              <div className="st-rank-tier" style={{ color: tc }}>{stats.rank.tier} {stats.rank.rank}</div>
              <div className="st-rank-lp">{stats.rank.lp} LP</div>
              <div className="st-rank-record">
                <span className="st-pw">{stats.rank.wins}W</span>
                <span className="st-pl">{stats.rank.losses}L</span>
                <span className={`st-pwr ${stats.rank.winRate >= 55 ? 'wr-good' : stats.rank.winRate < 45 ? 'wr-bad' : ''}`}>{stats.rank.winRate}%</span>
              </div>
            </div>
            {/* Flex Q */}
            {stats.flexRank.tier !== 'UNRANKED' && (
              <div className="st-rank-compact">
                <img className="st-rank-icon" src={tierIconUrl(stats.flexRank.tier)} alt="" />
                <div className="st-rank-queue">Flex</div>
                <div className="st-rank-tier" style={{ color: tierColor(stats.flexRank.tier) }}>{stats.flexRank.tier} {stats.flexRank.rank}</div>
                <div className="st-rank-lp">{stats.flexRank.lp} LP</div>
                <div className="st-rank-record">
                  <span className="st-pw">{stats.flexRank.wins}W</span>
                  <span className="st-pl">{stats.flexRank.losses}L</span>
                  <span className={`st-pwr ${stats.flexRank.winRate >= 55 ? 'wr-good' : stats.flexRank.winRate < 45 ? 'wr-bad' : ''}`}>{stats.flexRank.winRate}%</span>
                </div>
              </div>
            )}
            {/* Grade */}
            {ai && (
              <div className="st-grade" style={{ borderColor: ai.gradeColor }}>
                <span className="st-grade-letter" style={{ color: ai.gradeColor }}>{ai.performanceGrade}</span>
                <span className="st-grade-sub">{ai.gradeExplanation}</span>
              </div>
            )}
          </div>
          {/* Graph buttons */}
          <div className="st-graph-btns">
            <button className="st-lp-graph-btn" onClick={() => setView('solo-lp')}>Solo/Duo LP Graph →</button>
            {stats.flexRank.tier !== 'UNRANKED' && (
              <button className="st-lp-graph-btn" onClick={() => setView('flex-lp')}>Flex LP Graph →</button>
            )}
          </div>
        </div>

        {/* Mode Filter Tabs */}
        <div className="st-mode-tabs">
          {MODES.map(mode => {
            const count = mode === 'All' ? stats.matchHistory.length : stats.matchHistory.filter(m => m.gameMode === mode).length;
            if (count === 0 && mode !== 'All') return null;
            return (
              <button key={mode} className={`st-mode-tab ${modeFilter === mode ? 'active' : ''}`} onClick={() => setModeFilter(mode)}>
                {mode} <span className="st-mode-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Insights Row */}
        {ai && (
          <div className="st-insights">
            <div className="st-ins"><span className="st-ins-lbl">Queue</span><span className="st-ins-val" style={{ color: ai.queueColor }}>{ai.queueHealth}</span></div>
            <div className="st-ins"><span className="st-ins-lbl">Consistency</span><span className="st-ins-val" style={{ color: ai.consistencyColor }}>{ai.consistency}</span></div>
            <div className="st-ins"><span className="st-ins-lbl">Recent</span><span className="st-ins-val"><span className="st-pw">{recentW}W</span> <span className="st-pl">{recentL}L</span></span></div>
            {mental && <div className="st-ins"><span className="st-ins-lbl">Mental</span><span className="st-ins-val" style={{ color: mental.color }}>{mental.text}</span></div>}
            <div className="st-ins st-ins-spark"><span className="st-ins-lbl">Trend</span><Sparkline scores={stats.matchHistory.map(m => m.aiScore)} /></div>
            {ai.tip && <div className="st-ins st-ins-tip"><span className="st-ins-lbl">Tip</span><span className="st-ins-val st-tip">{ai.tip}</span></div>}
          </div>
        )}

        {/* Tags */}
        {ai && (ai.strengthAreas?.length > 0 || ai.improvementAreas?.length > 0) && (
          <div className="st-tags">
            {ai.strengthAreas?.map((s, i) => <span key={i} className="st-tag st-tag-good">{s}</span>)}
            {ai.improvementAreas?.map((s, i) => <span key={i} className="st-tag st-tag-imp">{s}</span>)}
          </div>
        )}

        {/* Champion Pool — per mode */}
        {filteredChampPool.length > 0 && (
          <div className="st-sec">
            <div className="st-sec-head">Champion Pool{modeFilter !== 'All' ? ` — ${modeFilter}` : ''}<span className="st-sec-count">{filteredChampPool.length}</span></div>
            <div className="st-champs">
              {filteredChampPool.slice(0, 8).map((c, i) => {
                const rating = champRatings[c.name];
                return (
                  <div key={c.name} className="st-champ">
                    <img className="st-champ-img" src={c.icon} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="st-champ-data">
                      <div className="st-champ-top">
                        <span className="st-champ-name">{c.name}</span>
                        {rating && (
                          <span className="st-champ-grade" style={{ color: gradeColor(rating.grade), borderColor: gradeColor(rating.grade) }}>
                            {rating.grade}
                          </span>
                        )}
                      </div>
                      <div className="st-champ-stats">
                        <span className={`st-champ-wr ${c.winRate >= 60 ? 'wr-good' : c.winRate < 45 ? 'wr-bad' : ''}`}>{c.winRate}%</span>
                        <span className="st-champ-sep">·</span>
                        <span className="st-champ-meta">{c.games}G</span>
                        <span className="st-champ-sep">·</span>
                        <span className="st-champ-kda" style={{ color: kdaColor(c.kda) }}>{c.kda} KDA</span>
                      </div>
                      {rating?.note && <div className="st-champ-note">{rating.note}</div>}
                    </div>
                    {/* WR bar */}
                    <div className="st-champ-bar"><div className="st-champ-bar-fill" style={{ width: `${c.winRate}%`, background: c.winRate >= 50 ? '#2ecc71' : '#e74c3c' }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Match History */}
        <div className="st-sec">
          <div className="st-sec-head">Match History{modeFilter !== 'All' ? ` — ${modeFilter}` : ''}<span className="st-sec-count">{filteredMatches.length}</span></div>
          <div className="st-matches">
            {filteredMatches.map((m, idx) => {
              const kda = m.deaths === 0 ? m.kills + m.assists : parseFloat(((m.kills + m.assists) / m.deaths).toFixed(1));
              const dpmPct = m.avgDpm > 0 ? Math.min(100, Math.round((m.dpm / m.avgDpm) * 50)) : 50;
              const isExp = expandedGame === idx;
              const analysis = gameAnalysis[idx];

              return (
                <div key={idx} className={`st-match ${m.remake ? 'st-match-rmk' : m.win ? 'st-match-w' : 'st-match-l'}`}>
                  <div className="st-match-main" onClick={() => toggleGame(idx)}>
                    <img className="st-match-icon" src={m.champIcon} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="st-match-col1">
                      <span className={`st-match-res ${m.remake ? 'res-rmk' : m.win ? 'res-w' : 'res-l'}`}>{m.remake ? 'RMK' : m.win ? 'W' : 'L'}</span>
                      <span className="st-match-mode">{m.gameMode}</span>
                      <span className="st-match-ago">{m.timeAgo}</span>
                    </div>
                    <div className="st-match-col2">
                      <span className="st-match-kda" style={{ color: kdaColor(kda) }}>{m.kills}/{m.deaths}/{m.assists}</span>
                      <span className="st-match-ratio" style={{ color: kdaColor(kda) }}>{kda} KDA</span>
                    </div>
                    <div className="st-match-col3">
                      <span>{m.csMin} cs/m</span>
                      <span>{m.kp}% KP</span>
                    </div>
                    <div className="st-match-col4">
                      <div className="st-dpm-bar"><div className="st-dpm-fill" style={{ width: `${dpmPct}%` }} /></div>
                      <span className="st-dpm-val">{m.dpm} DPM</span>
                    </div>
                    <div className="st-match-score" style={{ background: scoreColor(m.aiScore) + '22', borderColor: scoreColor(m.aiScore), color: scoreColor(m.aiScore) }}>
                      {m.aiScore}
                    </div>
                    {m.isMvp && <span className="st-match-badge st-badge-mvp">MVP</span>}
                    {m.isLvp && <span className="st-match-badge st-badge-lvp">LVP</span>}
                    <span className={`st-match-arrow ${isExp ? 'open' : ''}`}>&#9662;</span>
                  </div>

                  {isExp && (
                    <div className="st-detail">
                      {/* Scoreboard */}
                      <div className="st-sb">
                        <table className="st-sb-tbl">
                          <thead><tr className="st-sb-head-ally"><th colSpan={7}>{m.win ? 'Victory' : 'Defeat'} — Your Team</th></tr></thead>
                          <tbody>
                            {m.myTeam.map((p, pi) => (
                              <tr key={pi} className={p.isMe ? 'st-sb-me' : ''}>
                                <td><img className="st-sb-img" src={p.champIcon} alt="" /></td>
                                <td className="st-sb-name st-sb-clickable" onClick={(e) => { e.stopPropagation(); viewPlayerProfile(p.summonerName); }}>{p.summonerName}</td>
                                <td className="st-sb-kda">{p.kills}/{p.deaths}/{p.assists}</td>
                                <td className="st-sb-cs">{p.cs}</td>
                                <td className="st-sb-dmg">{(p.damage/1000).toFixed(1)}k</td>
                                <td className="st-sb-gold">{(p.gold/1000).toFixed(1)}k</td>
                                <td className="st-sb-vis">{p.vision}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <table className="st-sb-tbl">
                          <thead><tr className="st-sb-head-enemy"><th colSpan={7}>{m.win ? 'Defeat' : 'Victory'} — Enemy Team</th></tr></thead>
                          <tbody>
                            {m.enemyTeam.map((p, pi) => (
                              <tr key={pi}>
                                <td><img className="st-sb-img" src={p.champIcon} alt="" /></td>
                                <td className="st-sb-name st-sb-clickable" onClick={(e) => { e.stopPropagation(); viewPlayerProfile(p.summonerName); }}>{p.summonerName}</td>
                                <td className="st-sb-kda">{p.kills}/{p.deaths}/{p.assists}</td>
                                <td className="st-sb-cs">{p.cs}</td>
                                <td className="st-sb-dmg">{(p.damage/1000).toFixed(1)}k</td>
                                <td className="st-sb-gold">{(p.gold/1000).toFixed(1)}k</td>
                                <td className="st-sb-vis">{p.vision}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* AI Analysis */}
                      {analyzingGame === idx ? (
                        <div className="st-analyzing"><div className="st-spinner" /> Analyzing...</div>
                      ) : analysis ? (
                        <div className="st-ai">
                          <div className="st-ai-head">
                            <span className="st-ai-score" style={{ color: scoreColor(analysis.rating) }}>{analysis.rating}/10</span>
                            <span className="st-ai-verdict">{analysis.verdict}</span>
                            <span className="st-ai-rank">#{analysis.rankInGame}/10</span>
                          </div>
                          {analysis.strengths && <div className="st-ai-sec"><span className="st-ai-lbl st-ai-good">Strengths</span><span className="st-ai-txt">{analysis.strengths}</span></div>}
                          {analysis.weaknesses && <div className="st-ai-sec"><span className="st-ai-lbl st-ai-bad">Weaknesses</span><span className="st-ai-txt">{analysis.weaknesses}</span></div>}
                          {analysis.deepAnalysis && <div className="st-ai-deep">{analysis.deepAnalysis}</div>}
                          {analysis.tip && <div className="st-ai-tip">{analysis.tip}</div>}
                        </div>
                      ) : (
                        <button className="st-btn st-btn-analyze" onClick={() => analyzeGame(idx)}>Analyze with AI</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showDebug && <div className="st-debug" ref={debugRef}>{debugLog.map((l,i) => <div key={i}>{l}</div>)}</div>}
    </div>
  );
}
