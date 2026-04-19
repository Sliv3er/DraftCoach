import { ipcInvoke, ipcSend, ipcOn, ipcRemoveListener } from './bridge';
import React, { useState, useEffect, useCallback } from 'react';

// ─── Cooldown data for name resolution ───────────────────────────
let cd: any = null;
try { cd = window.require('../../../../shared/cooldowns/cooldown-data'); } catch {}

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn';
const DDRAGON_VER = '15.1.1';
const SPELL_ICONS: Record<string, string> = {
    'Flash': 'SummonerFlash', 'Ignite': 'SummonerDot', 'Exhaust': 'SummonerExhaust',
    'Heal': 'SummonerHeal', 'Teleport': 'SummonerTeleport', 'Ghost': 'SummonerHaste',
    'Barrier': 'SummonerBarrier', 'Cleanse': 'SummonerBoost', 'Smite': 'SummonerSmite',
    'Mark': 'SummonerSnowball', 'Clarity': 'SummonerMana', 'Unleashed Teleport': 'SummonerTeleport',
};

function champIcon(name: string, ver: string): string {
    const key = cd ? cd.champToDdragonKey(name) : name.replace(/[\s'.\/\-&]/g, '');
    return `${DDRAGON}/${ver}/img/champion/${key}.png`;
}

function spellIcon(name: string, ver: string): string {
    const n = cd ? cd.normalizeSpellName(name) : name;
    const key = cd?.SPELL_DDRAGON_KEY?.[n] || SPELL_ICONS[n] || SPELL_ICONS[name];
    return key ? `${DDRAGON}/${ver}/img/spell/${key}.png` : '';
}

function fmtCD(s: number): string {
    if (s <= 0) return '✓';
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}:${(s % 60).toString().padStart(2, '0')}` : `${Math.ceil(s)}`;
}

// ─── Types ───────────────────────────────────────────────────────
interface Timer {
    id: string;
    championName: string;
    ability: string;
    totalDuration: number;
    remaining: number;
}

// ─── Main Component ─────────────────────────────────────────────
export function TrackerPanel() {
    const [enemies, setEnemies] = useState<any[]>([]);
    const [timers, setTimers] = useState<Timer[]>([]);
    const [ver, setVer] = useState(DDRAGON_VER);

    useEffect(() => {
        // Get DDragon version
        ipcInvoke('get-ddragon-version').then((v: string) => {
            if (v) setVer(v);
        }).catch(() => {});

        const sbHandler = (_e: any, payload: any) => {
            if (payload?.players && payload?.myTeam) {
                setEnemies(payload.players.filter((p: any) => p.team !== payload.myTeam));
            }
        };
        const cdHandler = (_e: any, t: Timer[]) => setTimers(t || []);

        ipcOn('scoreboard-data', sbHandler);
        ipcOn('cooldown-tick', cdHandler);

        return () => {
            ipcRemoveListener('scoreboard-data', sbHandler);
            ipcRemoveListener('cooldown-tick', cdHandler);
        };
    }, []);

    const getTimer = useCallback((champ: string, ability: string) =>
        timers.find(t => t.id === `${champ}-${ability}`), [timers]);

    const handleClick = useCallback((championName: string, ability: string) => {
        const timerId = `${championName}-${ability}`;
        const existing = timers.find(t => t.id === timerId);
        if (existing && existing.remaining > 0) {
            ipcInvoke('cooldown-reset', { timerId });
        } else {
            ipcInvoke('cooldown-start', { championName, ability });
        }
    }, [timers]);

    if (enemies.length === 0) {
        return (
            <div className="tp-root">
                <div className="tp-wait">Waiting...</div>
            </div>
        );
    }

    return (
        <div className="tp-root">
            {enemies.map((e, i) => {
                const s1 = e.summonerSpells?.one?.displayName || 'Flash';
                const s2 = e.summonerSpells?.two?.displayName || 'Ignite';
                const t1 = getTimer(e.championName, s1);
                const t2 = getTimer(e.championName, s2);
                const tR = getTimer(e.championName, 'Ultimate');

                return (
                    <div key={e.riotId || i} className="tp-row">
                        {/* Champion */}
                        <img className="tp-champ" src={champIcon(e.championName, ver)} alt=""
                            onError={ev => { (ev.target as HTMLImageElement).style.opacity = '0.3'; }} />

                        {/* Spell 1 */}
                        <SpellBtn
                            icon={spellIcon(s1, ver)}
                            timer={t1}
                            onClick={() => handleClick(e.championName, s1)}
                            title={s1}
                        />

                        {/* Spell 2 */}
                        <SpellBtn
                            icon={spellIcon(s2, ver)}
                            timer={t2}
                            onClick={() => handleClick(e.championName, s2)}
                            title={s2}
                        />

                        {/* Ultimate */}
                        <div
                            className={`tp-spell tp-ult ${tR && tR.remaining > 0 ? 'tp-cd' : ''} ${tR && tR.remaining <= 0 && tR.remaining > -5 ? 'tp-up' : ''}`}
                            onClick={() => handleClick(e.championName, 'Ultimate')}
                            title={`${e.championName} R`}
                        >
                            <span className="tp-r-label">R</span>
                            {tR && tR.remaining > 0 && <span className="tp-cd-text">{fmtCD(tR.remaining)}</span>}
                            {tR && tR.remaining <= 0 && tR.remaining > -5 && <span className="tp-up-text">✓</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Spell Button ───────────────────────────────────────────────
function SpellBtn({ icon, timer, onClick, title }: { icon: string; timer?: Timer; onClick: () => void; title: string }) {
    const onCD = timer && timer.remaining > 0;
    const justUp = timer && timer.remaining <= 0 && timer.remaining > -5;

    return (
        <div
            className={`tp-spell ${onCD ? 'tp-cd' : ''} ${justUp ? 'tp-up' : ''}`}
            onClick={onClick}
            title={title}
        >
            {icon && <img src={icon} alt="" className="tp-spell-img" style={onCD ? { filter: 'grayscale(1) brightness(0.35)' } : {}} />}
            {onCD && timer && <span className="tp-cd-text">{fmtCD(timer.remaining)}</span>}
            {justUp && <span className="tp-up-text">✓</span>}
        </div>
    );
}
