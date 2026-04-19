import { ipcInvoke, ipcSend, ipcOn, ipcRemoveListener } from './bridge';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────
interface PlayerItem {
  itemID: number;
  displayName: string;
  count: number;
  slot: number;
}

interface PlayerSpell {
  displayName: string;
  rawDescription: string;
  rawDisplayName: string;
}

interface PlayerRunes {
  keystone: { id: number; displayName: string };
  primaryRuneTree: { id: number; displayName: string };
  secondaryRuneTree: { id: number; displayName: string };
  generalRunes: { id: number; displayName: string }[];
  statRunes: { id: number; rawDescription: string }[];
}

interface ScoreboardPlayer {
  championName: string;
  team: 'ORDER' | 'CHAOS';
  position: string;  // TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY, or ""
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  currentGold: number;
  items: PlayerItem[];
  summonerSpells: { one: PlayerSpell; two: PlayerSpell };
  runes: PlayerRunes;
  isDead: boolean;
  isLocalPlayer: boolean;
  riotId: string;
  skinID: number;
  // Perk IDs for cooldown calculation
  perkIds: number[];
  // Item IDs for cooldown calculation
  itemIds: number[];
}

interface CooldownTimer {
  id: string;            // unique: "ChampName-Flash"
  championName: string;
  ability: string;       // "Flash", "Ignite", etc. or "Ultimate"
  totalDuration: number; // total seconds
  remaining: number;     // seconds remaining
  startedAt: number;     // timestamp ms
}

interface ScoreboardData {
  gameTime: number;
  mapName: string;
  players: ScoreboardPlayer[];
  myTeam: 'ORDER' | 'CHAOS';
  allyKills: number;
  enemyKills: number;
}

// ─── Constants ───────────────────────────────────────────────────────
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn';

// Import cooldown data for name mappings — handles DDragon mismatches
let cooldownData: any = null;
try {
  cooldownData = window.require('../../../../shared/cooldowns/cooldown-data');
} catch { /* fallback below */ }

// Fallback spell icon map (used if cooldown-data fails to load)
const SPELL_ICON_MAP_FALLBACK: Record<string, string> = {
  'Flash': 'SummonerFlash', 'Ignite': 'SummonerDot', 'Exhaust': 'SummonerExhaust',
  'Heal': 'SummonerHeal', 'Teleport': 'SummonerTeleport', 'Ghost': 'SummonerHaste',
  'Barrier': 'SummonerBarrier', 'Cleanse': 'SummonerBoost', 'Smite': 'SummonerSmite',
  'Mark': 'SummonerSnowball', 'Clarity': 'SummonerMana',
  'Unleashed Teleport': 'SummonerTeleport',
};

// ─── Helpers ─────────────────────────────────────────────────────────
function champIconUrl(name: string, version: string): string {
  if (!name || !version) return '';
  const key = cooldownData ? cooldownData.champToDdragonKey(name) : name.replace(/[\s'.\/\-&]/g, '');
  return `${DDRAGON_BASE}/${version}/img/champion/${key}.png`;
}

function itemIconUrl(itemId: number, version: string): string {
  if (!itemId || !version) return '';
  return `${DDRAGON_BASE}/${version}/img/item/${itemId}.png`;
}

function spellIconUrl(spellName: string, version: string): string {
  if (!spellName || !version) return '';
  // Normalize the spell name first
  const normalized = cooldownData ? cooldownData.normalizeSpellName(spellName) : spellName;
  const key = (cooldownData && cooldownData.SPELL_DDRAGON_KEY) 
    ? cooldownData.SPELL_DDRAGON_KEY[normalized] 
    : SPELL_ICON_MAP_FALLBACK[normalized] || SPELL_ICON_MAP_FALLBACK[spellName];
  if (!key) return '';
  return `${DDRAGON_BASE}/${version}/img/spell/${key}.png`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function kdaColor(kills: number, deaths: number): string {
  if (deaths === 0) return '#3b82f6';
  const ratio = (kills) / deaths;
  if (ratio >= 3) return '#22c55e';
  if (ratio >= 1.5) return '#eab308';
  if (ratio >= 0.8) return '#9ca3af';
  return '#ef4444';
}

// ─── Scoreboard Window Component ─────────────────────────────────────
export function ScoreboardWindow() {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [timers, setTimers] = useState<CooldownTimer[]>([]);
  const [version, setVersion] = useState('15.1.1');
  const ipcRef = useRef<any>(null);

  useEffect(() => {
    // ipcRef removed — using bridge

    // Get DDragon version
    ipcInvoke('get-ddragon-version').then((v: string) => {
      if (v) setVersion(v);
    }).catch(() => {});

    // Listen for scoreboard data
    const dataHandler = (_e: any, payload: ScoreboardData) => {
      setData(payload);
    };
    ipcOn('scoreboard-data', dataHandler);

    // Listen for cooldown timer ticks
    const timerHandler = (_e: any, activeTimers: CooldownTimer[]) => {
      setTimers(activeTimers);
    };
    ipcOn('cooldown-tick', timerHandler);

    // Window controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        ipcSend('scoreboard-win-hide');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      ipcRemoveListener('scoreboard-data', dataHandler);
      ipcRemoveListener('cooldown-tick', timerHandler);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSpellClick = useCallback((championName: string, spellName: string) => {
    if (!ipcRef.current) return;
    const timerId = `${championName}-${spellName}`;
    // If timer already active → reset it
    const existing = timers.find(t => t.id === timerId);
    if (existing && existing.remaining > 0) {
      ipcRef.current.invoke('cooldown-reset', { timerId });
    } else {
      ipcRef.current.invoke('cooldown-start', { championName, ability: spellName });
    }
  }, [timers]);

  const handleUltClick = useCallback((championName: string) => {
    if (!ipcRef.current) return;
    const timerId = `${championName}-Ultimate`;
    const existing = timers.find(t => t.id === timerId);
    if (existing && existing.remaining > 0) {
      ipcRef.current.invoke('cooldown-reset', { timerId });
    } else {
      ipcRef.current.invoke('cooldown-start', { championName, ability: 'Ultimate' });
    }
  }, [timers]);

  // ─── Loading State ─────────────────────────────────────────────
  if (!data) {
    return (
      <div className="sb">
        <div className="sb-bar">
          <span className="sb-title">Live Scoreboard</span>
          <div className="sb-bar-controls">
            <button className="sb-bar-btn" onClick={() => ipcRef.current?.send('scoreboard-win-minimize')}>—</button>
            <button className="sb-bar-btn sb-bar-close" onClick={() => ipcRef.current?.send('scoreboard-win-hide')}>✕</button>
          </div>
        </div>
        <div className="sb-loading">
          <div className="sb-spinner" />
          <div className="sb-loading-text">Waiting for game data...</div>
          <div className="sb-loading-sub">Scoreboard will populate when the game starts</div>
        </div>
      </div>
    );
  }

  // Split teams
  const allies = data.players.filter(p => p.team === data.myTeam);
  const enemies = data.players.filter(p => p.team !== data.myTeam);
  const gameMin = Math.floor(data.gameTime / 60);
  const gameSec = Math.floor(data.gameTime % 60);

  const getTimer = (championName: string, ability: string): CooldownTimer | undefined => {
    return timers.find(t => t.id === `${championName}-${ability}`);
  };

  return (
    <div className="sb">
      {/* Title Bar (draggable) */}
      <div className="sb-bar">
        <span className="sb-title">Live Scoreboard</span>
        <div className="sb-bar-center">
          <span className="sb-score sb-score-ally">{data.allyKills}</span>
          <span className="sb-game-time">{gameMin}:{gameSec.toString().padStart(2, '0')}</span>
          <span className="sb-score sb-score-enemy">{data.enemyKills}</span>
        </div>
        <div className="sb-bar-controls">
          <button className="sb-bar-btn" onClick={() => ipcRef.current?.send('scoreboard-win-minimize')}>—</button>
          <button className="sb-bar-btn sb-bar-close" onClick={() => ipcRef.current?.send('scoreboard-win-hide')}>✕</button>
        </div>
      </div>

      {/* Scoreboard Body */}
      <div className="sb-body">
        <div className="sb-teams">
          {/* Ally Team */}
          <div className="sb-team sb-team-ally">
            <div className="sb-team-header">
              <span className="sb-team-label">ALLY TEAM</span>
            </div>
            {allies.map((p, i) => (
              <PlayerRow
                key={p.riotId || i}
                player={p}
                version={version}
                isEnemy={false}
                timer1={getTimer(p.championName, p.summonerSpells.one.displayName)}
                timer2={getTimer(p.championName, p.summonerSpells.two.displayName)}
                timerUlt={getTimer(p.championName, 'Ultimate')}
                onSpellClick={handleSpellClick}
                onUltClick={handleUltClick}
              />
            ))}
          </div>

          {/* Enemy Team */}
          <div className="sb-team sb-team-enemy">
            <div className="sb-team-header">
              <span className="sb-team-label sb-team-label-enemy">ENEMY TEAM</span>
            </div>
            {enemies.map((p, i) => (
              <PlayerRow
                key={p.riotId || i}
                player={p}
                version={version}
                isEnemy={true}
                timer1={getTimer(p.championName, p.summonerSpells.one.displayName)}
                timer2={getTimer(p.championName, p.summonerSpells.two.displayName)}
                timerUlt={getTimer(p.championName, 'Ultimate')}
                onSpellClick={handleSpellClick}
                onUltClick={handleUltClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Player Row ──────────────────────────────────────────────────────
interface PlayerRowProps {
  player: ScoreboardPlayer;
  version: string;
  isEnemy: boolean;
  timer1?: CooldownTimer;
  timer2?: CooldownTimer;
  timerUlt?: CooldownTimer;
  onSpellClick: (champion: string, spell: string) => void;
  onUltClick: (champion: string) => void;
}

function PlayerRow({ player, version, isEnemy, timer1, timer2, timerUlt, onSpellClick, onUltClick }: PlayerRowProps) {
  const p = player;

  return (
    <div className={`sb-row ${p.isLocalPlayer ? 'sb-row-me' : ''} ${p.isDead ? 'sb-row-dead' : ''}`}>
      {/* Champion Portrait + Level (clickable for ult tracking) */}
      <div
        className={`sb-champ-wrap ${isEnemy ? 'sb-champ-clickable' : ''}`}
        onClick={isEnemy ? () => onUltClick(p.championName) : undefined}
        title={isEnemy ? `Track ${p.championName} Ultimate` : p.championName}
      >
        <img
          className="sb-champ-icon"
          src={champIconUrl(p.championName, version)}
          alt={p.championName}
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
        />
        <span className="sb-champ-level">{p.level}</span>
        {/* Ult timer overlay on champion portrait */}
        {timerUlt && timerUlt.remaining > 0 && (
          <div className="sb-ult-timer-overlay">
            <span className="sb-ult-timer-text">{formatTime(timerUlt.remaining)}</span>
          </div>
        )}
        {timerUlt && timerUlt.remaining <= 0 && timerUlt.remaining > -5 && (
          <div className="sb-ult-timer-overlay sb-ult-ready">
            <span className="sb-ult-ready-text">R UP!</span>
          </div>
        )}
      </div>

      {/* Summoner Spells */}
      <div className="sb-spells">
        <SpellIcon
          spellName={p.summonerSpells.one.displayName}
          version={version}
          timer={timer1}
          isEnemy={isEnemy}
          onClick={() => isEnemy && onSpellClick(p.championName, p.summonerSpells.one.displayName)}
        />
        <SpellIcon
          spellName={p.summonerSpells.two.displayName}
          version={version}
          timer={timer2}
          isEnemy={isEnemy}
          onClick={() => isEnemy && onSpellClick(p.championName, p.summonerSpells.two.displayName)}
        />
      </div>

      {/* CS */}
      <div className="sb-cs">{p.creepScore}</div>

      {/* KDA */}
      <div className="sb-kda" style={{ color: kdaColor(p.kills, p.deaths) }}>
        <span className="sb-k">{p.kills}</span>
        <span className="sb-slash">/</span>
        <span className="sb-d" style={{ color: p.deaths >= 5 ? '#ef4444' : undefined }}>{p.deaths}</span>
        <span className="sb-slash">/</span>
        <span className="sb-a">{p.assists}</span>
      </div>

      {/* Items */}
      <div className="sb-items">
        {[0, 1, 2, 3, 4, 5].map(slot => {
          const item = p.items.find(it => it.slot === slot);
          return (
            <div key={slot} className="sb-item-slot">
              {item && item.itemID ? (
                <img
                  className="sb-item-icon"
                  src={itemIconUrl(item.itemID, version)}
                  alt={item.displayName}
                  title={item.displayName}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                />
              ) : (
                <div className="sb-item-empty" />
              )}
            </div>
          );
        })}
        {/* Trinket/Ward slot (slot 6) */}
        {(() => {
          const trinket = p.items.find(it => it.slot === 6);
          return (
            <div className="sb-item-slot sb-item-trinket">
              {trinket && trinket.itemID ? (
                <img
                  className="sb-item-icon sb-trinket-icon"
                  src={itemIconUrl(trinket.itemID, version)}
                  alt={trinket.displayName}
                  title={trinket.displayName}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                />
              ) : (
                <div className="sb-item-empty sb-trinket-empty" />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Spell Icon with Cooldown ────────────────────────────────────────
interface SpellIconProps {
  spellName: string;
  version: string;
  timer?: CooldownTimer;
  isEnemy: boolean;
  onClick: () => void;
}

function SpellIcon({ spellName, version, timer, isEnemy, onClick }: SpellIconProps) {
  const isOnCooldown = timer && timer.remaining > 0;
  const justCameUp = timer && timer.remaining <= 0 && timer.remaining > -5;
  const cdPercent = isOnCooldown && timer ? (timer.remaining / timer.totalDuration) * 100 : 0;

  return (
    <div
      className={`sb-spell ${isEnemy ? 'sb-spell-clickable' : ''} ${isOnCooldown ? 'sb-spell-cd' : ''} ${justCameUp ? 'sb-spell-up' : ''}`}
      onClick={onClick}
      title={isEnemy ? `Click to track ${spellName}` : spellName}
    >
      <img
        className="sb-spell-icon"
        src={spellIconUrl(spellName, version)}
        alt={spellName}
        style={{ filter: isOnCooldown ? 'grayscale(1) brightness(0.4)' : 'none' }}
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
      />
      {/* Cooldown sweep overlay */}
      {isOnCooldown && (
        <div
          className="sb-spell-cd-overlay"
          style={{
            background: `conic-gradient(
              rgba(0,0,0,0.7) ${cdPercent}%,
              transparent ${cdPercent}%
            )`,
          }}
        />
      )}
      {/* Timer text */}
      {isOnCooldown && timer && (
        <span className="sb-spell-cd-text">
          {timer.remaining > 60
            ? formatTime(timer.remaining)
            : `${Math.ceil(timer.remaining)}s`
          }
        </span>
      )}
      {/* READY flash */}
      {justCameUp && (
        <div className="sb-spell-ready-flash">
          <span>UP!</span>
        </div>
      )}
    </div>
  );
}
