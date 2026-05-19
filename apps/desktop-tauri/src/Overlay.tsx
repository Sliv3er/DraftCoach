import React, { useEffect, useState, useRef } from 'react';
import { ipcInvoke, ipcSend, ipcOn, ipcRemoveListener } from './bridge';

// ── Types ──
interface BuildItem {
    name: string;
    iconUrl: string;
    gold: number;
    id: string;
    reason?: string;  // "Why this item?" from AI
}

interface JungleCamp {
    name: string;
    icon: string;
}

interface OverlayData {
    buildItems: BuildItem[];
    junglePath: JungleCamp[];
    championName: string;
}

// ── Colors ──
const C = {
    bg: 'rgba(8, 8, 18, 0.92)',
    cardBg: 'rgba(18, 18, 36, 0.85)',
    border: 'rgba(200, 170, 110, 0.12)',
    gold: '#c8aa6e',
    goldGlow: 'rgba(200, 170, 110, 0.35)',
    green: '#49b04a',
    blue: '#3b82f6',
    textPrimary: '#e2e0ec',
    textSecondary: '#9a98aa',
    textDim: '#5a586b',
    bought: 'rgba(73, 176, 74, 0.25)',
    boughtBorder: '#49b04a',
};

// Minimap coordinate mapping (% from top-left of minimap box)
// Calibrated to match League's actual minimap layout at default scale
const CAMP_COORDS: Record<string, [number, number]> = {
    // Blue side (bottom-left of map)
    'blue': [22, 42],
    'blue buff': [22, 42],
    'gromp': [14, 32],
    'wolves': [22, 52],
    'raptors': [42, 68],
    'red': [48, 78],
    'red buff': [48, 78],
    'krugs': [58, 86],
    // Red side (top-right of map)
    'red (red side)': [52, 22],
    'krugs (red side)': [42, 14],
    'raptors (red side)': [58, 32],
    'wolves (red side)': [78, 48],
    'blue (red side)': [78, 58],
    'gromp (red side)': [86, 68],
    // Neutral objectives
    'scuttle': [35, 35],
    'scuttle crab': [35, 35],
    'rift scuttler': [35, 35],
    'scuttle (bottom)': [65, 65],
    'dragon': [60, 72],
    'rift herald': [40, 28],
    'baron': [40, 28],
    // Gank actions
    'gank top': [18, 18],
    'gank mid': [50, 50],
    'gank bot': [82, 82],
};

export function Overlay() {
    const [data, setData] = useState<OverlayData | null>(null);
    const [currentItemIndex, setCurrentItemIndex] = useState(0);
    const [currentGold, setCurrentGold] = useState(0);
    const [gameTime, setGameTime] = useState(0);
    const [nextComponent, setNextComponent] = useState<{ name: string; iconUrl: string; gold: number } | null>(null);
    const [remainingGold, setRemainingGold] = useState(0);
    const [settings, setSettings] = useState<any>({});
    const [autoHUD, setAutoHUD] = useState<any>(null);
    const [cdTimers, setCdTimers] = useState<{id: string, championName: string, ability: string, totalDuration: number, remaining: number}[]>([]);
    const [enemies, setEnemies] = useState<any[]>([]);
    const [trackerOpen, setTrackerOpen] = useState(true);
    const [sbGameTime, setSbGameTime] = useState(0);
    const generationRef = useRef(0); // Track overlay data generation to reject stale updates
    const hasDataRef = useRef(false);

    // Fetch auto-detected HUD periodically if enabled
    useEffect(() => {
        if (!settings.autoMinimapCalibration) return;
        const fetchAuto = async () => {
            const detected = await ipcInvoke('get-autodetect-hud');
            if (detected) setAutoHUD(detected);
        };
        fetchAuto();
        const interval = setInterval(fetchAuto, 10000);
        return () => clearInterval(interval);
    }, [settings.autoMinimapCalibration]);

    // Force transparent backgrounds
    useEffect(() => {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        document.body.style.overflow = 'hidden';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
    }, []);

    // Listen for overlay data
    useEffect(() => {
        const handler = (_event: any, payload: any) => {
            console.log('[Overlay] Received data:', payload);
            const gen = payload._generation || 0;
            generationRef.current = gen;
            hasDataRef.current = true;
            setData(payload);
            setCurrentItemIndex(0);
        };
        const settingsHandler = (_event: any, s: any) => {
            console.log('[Overlay] Received settings:', s);
            setSettings(s);
        };
        ipcOn('overlay-data-update', handler);
        ipcOn('settings-update', settingsHandler);
        const hydrateCachedOverlayData = () => ipcInvoke('get-overlay-data').then((cached: OverlayData | null) => {
            if (cached && ((cached.buildItems && cached.buildItems.length) || (cached.junglePath && cached.junglePath.length))) {
                console.log('[Overlay] Hydrated cached overlay data:', cached);
                generationRef.current = (cached as any)._generation || 0;
                hasDataRef.current = true;
                setData(cached);
                setCurrentItemIndex(0);
            }
        }).catch(() => {});
        hydrateCachedOverlayData();
        let cacheHydrateAttempts = 0;
        const cacheHydrateTimer = window.setInterval(() => {
            cacheHydrateAttempts += 1;
            if (hasDataRef.current || cacheHydrateAttempts > 20) {
                window.clearInterval(cacheHydrateTimer);
                return;
            }
            hydrateCachedOverlayData();
        }, 500);
        // Partial item update — merges into existing data, with generation check
        const itemHandler = (_event: any, newItems: BuildItem[], incomingGen?: number) => {
            // Reject stale updates from earlier generations
            if (incomingGen !== undefined && incomingGen < generationRef.current) {
                console.log(`[Overlay] Rejected stale items update (gen ${incomingGen} < current ${generationRef.current})`);
                return;
            }
            if (incomingGen !== undefined) generationRef.current = incomingGen;
            console.log('[Overlay] Items updated:', newItems.length, 'gen:', incomingGen || 'none');
            hasDataRef.current = true;
            setData(prev => prev ? { ...prev, buildItems: newItems } : { buildItems: newItems, junglePath: [], championName: '' });
            // Don't reset currentItemIndex — preserve purchase progress
            // The item-purchase-update handler will recalculate the correct index
        };
        ipcOn('overlay-items-update', itemHandler);
        ipcInvoke('get-settings').then(setSettings);

        // Cooldown timers
        const cdHandler = (_event: any, timers: any[]) => {
            setCdTimers(timers || []);
        };
        ipcOn('cooldown-tick', cdHandler);

        // Scoreboard data (for enemy spell tracker panel)
        const sbHandler = (_event: any, payload: any) => {
            if (payload && payload.players && payload.myTeam) {
                const enemyPlayers = payload.players.filter((p: any) => p.team !== payload.myTeam);
                setEnemies(enemyPlayers);
                setSbGameTime(payload.gameTime || 0);
            }
        };
        ipcOn('scoreboard-data', sbHandler);

        return () => {
            ipcRemoveListener('overlay-data-update', handler);
            ipcRemoveListener('settings-update', settingsHandler);
            ipcRemoveListener('overlay-items-update', itemHandler);
            ipcRemoveListener('cooldown-tick', cdHandler);
            ipcRemoveListener('scoreboard-data', sbHandler);
            window.clearInterval(cacheHydrateTimer);
        };
    }, []);

    // Listen for item purchase updates and gold from Live Client Data
    useEffect(() => {
        const handler = (_event: any, payload: {
            purchasedItemIds: string[],
            purchasedItemNames?: string[],
            currentGold?: number,
            nextComponent?: { name: string; iconUrl: string; gold: number } | null
        }) => {
            if (typeof payload.currentGold === 'number') {
                setCurrentGold(payload.currentGold);
            }
            if (typeof (payload as any).gameTime === 'number') {
                setGameTime((payload as any).gameTime);
            }
            // Update next component and remaining gold
            setNextComponent(payload.nextComponent || null);
            if (typeof (payload as any).remainingGold === 'number') {
                setRemainingGold((payload as any).remainingGold);
            }
            if (!data || !data.buildItems.length) return;

            const ownedNames = payload.purchasedItemNames || [];
            const hasBoots = !!(payload as any).playerHasBoots;
            const bootIds: string[] = (payload as any).bootItemIds || [];

            // Boot name patterns for matching quest/variant boots
            const BOOT_PATTERNS = ['boots', 'greaves', 'treads', 'steelcaps', 'plated', 'mercury', 'berserker', 'sorcerer', 'swiftness', 'lucidity', 'ionian', 'mobility', 'symbiotic', 'slightly magical', 'upgraded boots'];
            const isBootItem = (name: string) => {
                const lower = name.toLowerCase().trim();
                return BOOT_PATTERNS.some(p => lower.includes(p));
            };

            // Check each item — match by ID, name, or boots-in-quest-slot
            // IMPORTANT: Don't break on unmatched items. Boots in position 1-2 might
            // not match by ID/name if the player has quest boots, but we should still
            // continue scanning past them.
            let nextIdx = 0;
            for (let i = 0; i < data.buildItems.length; i++) {
                const bi = data.buildItems[i];
                const matchById = bi.id && payload.purchasedItemIds.includes(bi.id);
                const matchByName = bi.name && ownedNames.some(n =>
                    n === bi.name.toLowerCase().trim() ||
                    n.includes(bi.name.toLowerCase().trim()) ||
                    bi.name.toLowerCase().trim().includes(n)
                );
                // Boots in quest slot: if player has boots and this build item is ANY kind of boots, mark it bought
                const matchByBoots = hasBoots && bi.name && isBootItem(bi.name);
                // Also match by boot IDs from the build queue
                const matchByBootId = hasBoots && bi.id && bootIds.includes(bi.id);
                if (matchById || matchByName || matchByBoots || matchByBootId) {
                    nextIdx = i + 1;
                } else {
                    break;
                }
            }
            setCurrentItemIndex(Math.min(nextIdx, data.buildItems.length));
        };
        ipcOn('item-purchase-update', handler);
        return () => { ipcRemoveListener('item-purchase-update', handler); };
    }, [data]);

    const currentMinimapPosition = (settings.autoMinimapCalibration && autoHUD) ? autoHUD.minimapPosition : (settings.minimapPosition || 'bottom-right');
    const currentMinimapSize = (settings.autoMinimapCalibration && autoHUD) ? autoHUD.minimapSize : (settings.minimapSize || 243);

    if (!data || (!data.buildItems.length && !data.junglePath.length && cdTimers.length === 0)) {
        // Still show cooldown timers even if no build data
        if (cdTimers.length > 0) {
            return (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif", userSelect: 'none', pointerEvents: 'none' }}>
                    <CooldownTimerStrip timers={cdTimers} />
                </div>
            );
        }
        return <div style={{ width: '100vw', height: '100vh', background: 'transparent' }} />;
    }

    const nextItem = currentItemIndex < data.buildItems.length ? data.buildItems[currentItemIndex] : null;
    const allBought = currentItemIndex >= data.buildItems.length;

    // Resolve camp coordinates with fallback matching
    const resolveCampCoord = (campName: string): [number, number] => {
        const name = campName.toLowerCase().trim();
        if (CAMP_COORDS[name]) return CAMP_COORDS[name];
        // Fuzzy match
        for (const key of Object.keys(CAMP_COORDS)) {
            if (name.includes(key) || key.includes(name)) return CAMP_COORDS[key];
        }
        // Keyword match
        if (name.includes('blue')) return CAMP_COORDS['blue'];
        if (name.includes('red')) return CAMP_COORDS['red'];
        if (name.includes('gromp')) return CAMP_COORDS['gromp'];
        if (name.includes('wolves') || name.includes('wolf')) return CAMP_COORDS['wolves'];
        if (name.includes('raptor') || name.includes('chicken')) return CAMP_COORDS['raptors'];
        if (name.includes('krug')) return CAMP_COORDS['krugs'];
        if (name.includes('scuttle') || name.includes('crab')) return CAMP_COORDS['scuttle'];
        if (name.includes('dragon') || name.includes('drake')) return CAMP_COORDS['dragon'];
        if (name.includes('herald')) return CAMP_COORDS['rift herald'];
        if (name.includes('baron')) return CAMP_COORDS['baron'];
        if (name.includes('gank')) return CAMP_COORDS['gank mid'];
        return [50, 50];
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif",
            userSelect: 'none',
            pointerEvents: 'none',
            color: C.textPrimary,
            opacity: settings.overlayOpacity ?? 0.9,
            transform: `scale(${settings.overlayScale ?? 1})`,
            transformOrigin: 'top left',
        } as React.CSSProperties}>

            {/* ═══ Top-Left: Item Build Tracker ═══ */}
            <div style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                pointerEvents: 'auto',
            }}>
                {/* Current item to buy — large */}
                {nextItem && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: C.bg,
                        border: `1px solid ${C.gold}`,
                        borderRadius: '10px',
                        padding: '8px 12px',
                        boxShadow: `0 0 15px ${C.goldGlow}, 0 2px 8px rgba(0,0,0,0.5)`,
                    }}>
                        {nextItem.iconUrl ? (
                            <img
                                src={nextItem.iconUrl}
                                alt={nextItem.name}
                                style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '6px',
                                    border: `2px solid ${C.gold}`,
                                    boxShadow: `0 0 8px ${C.goldGlow}`,
                                }}
                            />
                        ) : (
                            <div style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '6px',
                                border: `2px solid ${C.gold}`,
                                background: C.cardBg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                            }}>⚔</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                color: C.textDim,
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                            }}>NEXT ITEM</span>
                            <span style={{
                                fontSize: '13px',
                                fontWeight: 700,
                                color: C.gold,
                                lineHeight: 1.2,
                            }}>{nextItem.name}</span>
                            {(() => {
                                const goldNeeded = remainingGold > 0 ? remainingGold : (nextItem.gold || 0);
                                if (goldNeeded <= 0) return null;
                                return (
                                    <span style={{
                                        fontSize: '10px',
                                        color: currentGold >= goldNeeded ? C.green : C.textSecondary,
                                        fontWeight: 700,
                                    }}>
                                        {currentGold >= goldNeeded
                                            ? 'READY TO BUY'
                                            : `${Math.ceil(goldNeeded - currentGold)}g needed`}
                                    </span>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Component to buy — shown below NEXT ITEM */}
                {nextItem && nextComponent && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: C.bg,
                        border: `1px solid ${C.border}`,
                        borderRadius: '8px',
                        padding: '5px 10px',
                    }}>
                        <img
                            src={nextComponent.iconUrl}
                            alt={nextComponent.name}
                            style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '4px',
                                border: `1px solid ${currentGold >= nextComponent.gold ? C.green : C.gold}`,
                            }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span style={{
                                fontSize: '8px',
                                fontWeight: 700,
                                color: C.textDim,
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.5px',
                            }}>BUY COMPONENT</span>
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: currentGold >= nextComponent.gold ? C.green : C.textSecondary,
                            }}>
                                {nextComponent.name}{nextComponent.gold > 0 ? ` (${nextComponent.gold}g)` : ''}
                            </span>
                        </div>
                    </div>
                )}

                {allBought && (
                    <div style={{
                        background: C.bg,
                        border: `1px solid ${C.boughtBorder}`,
                        borderRadius: '10px',
                        padding: '8px 14px',
                        boxShadow: `0 0 10px ${C.bought}`,
                    }}>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: C.green,
                        }}>
                            <svg viewBox="0 0 10 10" style={{width:10,height:10,verticalAlign:'middle',marginRight:3}}><circle cx="5" cy="5" r="4.2" fill="none" stroke="#4bb074" strokeWidth="1.2"/><path d="M3 5.2 L4.6 6.8 L7.2 3.8" fill="none" stroke="#4bb074" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            BUILD COMPLETE
                        </span>
                    </div>
                )}

                {/* Build order strip — small icons */}
                {data.buildItems.length > 1 && (
                    <div style={{
                        display: 'flex',
                        gap: '4px',
                        alignItems: 'center',
                        background: C.bg,
                        borderRadius: '8px',
                        padding: '5px 8px',
                        border: `1px solid ${C.border}`,
                    }}>
                        {data.buildItems.map((item, i) => {
                            const isBought = i < currentItemIndex;
                            const isCurrent = i === currentItemIndex;
                            return (
                                <div
                                    key={i}
                                    title={item.reason ? `${item.name} — ${item.reason}` : item.name}
                                    style={{
                                        position: 'relative',
                                        width: isCurrent ? '30px' : '24px',
                                        height: isCurrent ? '30px' : '24px',
                                        borderRadius: '5px',
                                        overflow: 'hidden',
                                        border: isCurrent
                                            ? `2px solid ${C.gold}`
                                            : isBought
                                                ? `1px solid ${C.boughtBorder}`
                                                : `1px solid ${C.border}`,
                                        opacity: isBought ? 0.4 : isCurrent ? 1 : 0.6,
                                        boxShadow: isCurrent ? `0 0 8px ${C.goldGlow}` : 'none',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {item.iconUrl ? (
                                        <img
                                            src={item.iconUrl}
                                            alt={item.name}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                display: 'block',
                                                filter: isBought ? 'grayscale(0.8)' : 'none',
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            background: C.cardBg,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '10px',
                                        }}>?</div>
                                    )}
                                    {isBought && (
                                        <div style={{
                                            position: 'absolute',
                                            inset: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'rgba(73, 176, 74, 0.4)',
                                        }}>
                                            <svg viewBox="0 0 10 10" style={{width:10,height:10}}><path d="M2 5.2 L4.2 7.5 L8.5 2.8" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══ Bottom: Minimap Jungle Path Overlay ═══ */}
            {data.junglePath.length > 0 && gameTime < 300 && settings.showJunglePathing !== false && (
                <div style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: currentMinimapPosition === 'bottom-left' ? '4px' : 'auto',
                    right: currentMinimapPosition === 'bottom-left' ? 'auto' : '4px',
                    width: `${currentMinimapSize}px`,
                    height: `${currentMinimapSize}px`,
                    pointerEvents: 'none',
                } as React.CSSProperties}>
                    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.9))' }}>
                        <defs>
                            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill={C.green} />
                            </marker>
                        </defs>
                        {data.junglePath.map((camp, i) => {
                            const [x, y] = resolveCampCoord(camp.name);
                            const nextCamp = data.junglePath[i + 1];
                            let nextCoord: [number, number] | null = null;
                            if (nextCamp) {
                                nextCoord = resolveCampCoord(nextCamp.name);
                            }

                            return (
                                <React.Fragment key={i}>
                                    {nextCoord && (
                                        <line
                                            x1={x} y1={y}
                                            x2={nextCoord[0]} y2={nextCoord[1]}
                                            stroke={C.green}
                                            strokeWidth="1.5"
                                            markerEnd="url(#arrow)"
                                            strokeDasharray="2,2"
                                            opacity="0.8"
                                        />
                                    )}
                                    {/* Background circle for contrast */}
                                    <circle cx={x} cy={y} r="4.5" fill="rgba(0,0,0,0.7)" />
                                    <circle cx={x} cy={y} r="3.5" fill={C.bg} stroke={C.green} strokeWidth="1.5" />
                                    <text x={x} y={y + 1.2} fontSize="3.5" fontWeight="900" textAnchor="middle" fill="#fff">
                                        {i + 1}
                                    </text>
                                </React.Fragment>
                            );
                        })}
                    </svg>

                </div>
            )}

            {/* ── Cooldown Timer Strip (top-right) ── */}
            <CooldownTimerStrip timers={cdTimers} />
        </div>
    );
}

// ─── Cooldown Timer Strip Component ─────────────────────────────
let overlayCD: any = null;
try { overlayCD = window.require('../../../../shared/cooldowns/cooldown-data'); } catch {}

const DDRAGON_VER_FALLBACK = '15.1.1';
const SPELL_ICON_MAP_OV: Record<string, string> = {
    'Flash': 'SummonerFlash', 'Ignite': 'SummonerDot', 'Exhaust': 'SummonerExhaust',
    'Heal': 'SummonerHeal', 'Teleport': 'SummonerTeleport', 'Ghost': 'SummonerHaste',
    'Barrier': 'SummonerBarrier', 'Cleanse': 'SummonerBoost', 'Smite': 'SummonerSmite',
    'Mark': 'SummonerSnowball', 'Clarity': 'SummonerMana',
    'Unleashed Teleport': 'SummonerTeleport',
};

function CooldownTimerStrip({ timers }: { timers: { id: string, championName: string, ability: string, totalDuration: number, remaining: number }[] }) {
    if (!timers || timers.length === 0) return null;

    const formatCD = (s: number) => {
        if (s <= 0) return 'UP!';
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
    };

    return (
        <div className="overlay-cd-strip">
            {timers.map(t => {
                const isSoon = t.remaining > 0 && t.remaining <= 30;
                const isUp = t.remaining <= 0;
                // Use champion name map for reliable icon loading
                const champKey = overlayCD ? overlayCD.champToDdragonKey(t.championName) : t.championName.replace(/[\s'.\/\-&]/g, '');
                const champIcon = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER_FALLBACK}/img/champion/${champKey}.png`;
                // Spell icon with normalization
                const normalizedAbility = overlayCD ? overlayCD.normalizeSpellName(t.ability) : t.ability;
                const spellKey = (overlayCD && overlayCD.SPELL_DDRAGON_KEY) 
                    ? overlayCD.SPELL_DDRAGON_KEY[normalizedAbility] 
                    : SPELL_ICON_MAP_OV[normalizedAbility] || SPELL_ICON_MAP_OV[t.ability];
                const spellIcon = spellKey ? `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER_FALLBACK}/img/spell/${spellKey}.png` : null;

                return (
                    <div key={t.id} className={`overlay-cd-timer ${isSoon ? 'cd-soon' : ''} ${isUp ? 'cd-up' : ''}`}>
                        <img className="overlay-cd-champ" src={champIcon} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        {spellIcon && <img className={`overlay-cd-spell ${!isUp ? 'cd-gray' : ''}`} src={spellIcon} alt="" />}
                        {!spellIcon && <span className="overlay-cd-name">{t.ability === 'Ultimate' ? 'R' : t.ability}</span>}
                        <span className={`overlay-cd-text ${isSoon ? 'cd-soon-text' : ''} ${isUp ? 'cd-up-text' : ''}`}>
                            {formatCD(t.remaining)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── In-Game Enemy Spell Tracker Panel ──────────────────────────
interface EnemySpellPanelProps {
    enemies: any[];
    timers: { id: string; championName: string; ability: string; totalDuration: number; remaining: number }[];
    isOpen: boolean;
    onToggle: () => void;
}

function EnemySpellPanel({ enemies, timers, isOpen, onToggle }: EnemySpellPanelProps) {
    const getTimer = (champ: string, ability: string) =>
        timers.find(t => t.id === `${champ}-${ability}`);

    // Interactivity disabled per user request: overlay remains strictly click-through

    const handleClick = (championName: string, ability: string) => {
        const timerId = `${championName}-${ability}`;
        const existing = getTimer(championName, ability);
        if (existing && existing.remaining > 0) {
            ipcInvoke('cooldown-reset', { timerId });
        } else {
            ipcInvoke('cooldown-start', { championName, ability });
        }
    };

    const champKey = (name: string) =>
        overlayCD ? overlayCD.champToDdragonKey(name) : name.replace(/[\s'.\/\-&]/g, '');

    const spellKey = (name: string) => {
        const n = overlayCD ? overlayCD.normalizeSpellName(name) : name;
        return (overlayCD && overlayCD.SPELL_DDRAGON_KEY)
            ? overlayCD.SPELL_DDRAGON_KEY[n]
            : SPELL_ICON_MAP_OV[n] || SPELL_ICON_MAP_OV[name];
    };

    const formatSec = (s: number) => {
        if (s <= 0) return <svg viewBox="0 0 10 10" style={{width:9,height:9}}><path d="M2 5.2 L4.2 7.5 L8.5 2.8" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
        return s > 60 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : `${s}`;
    };

    return (
        <div className="ov-tracker">
            {/* Toggle button */}
            <button className="ov-tracker-toggle" onClick={onToggle} title={isOpen ? 'Hide tracker' : 'Show tracker'}>
                {isOpen ? '▸' : '◂'}
            </button>

            {isOpen && (
                <div className="ov-tracker-panel">
                    {enemies.map((e: any, i: number) => {
                        const cKey = champKey(e.championName);
                        const champUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER_FALLBACK}/img/champion/${cKey}.png`;
                        const s1Name = e.summonerSpells?.one?.displayName || 'Flash';
                        const s2Name = e.summonerSpells?.two?.displayName || 'Ignite';
                        const s1Key = spellKey(s1Name);
                        const s2Key = spellKey(s2Name);
                        const s1Icon = s1Key ? `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER_FALLBACK}/img/spell/${s1Key}.png` : '';
                        const s2Icon = s2Key ? `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER_FALLBACK}/img/spell/${s2Key}.png` : '';

                        const t1 = getTimer(e.championName, s1Name);
                        const t2 = getTimer(e.championName, s2Name);
                        const tR = getTimer(e.championName, 'Ultimate');

                        return (
                            <div key={e.riotId || i} className="ov-tracker-row">
                                {/* Champion icon */}
                                <img className="ov-tracker-champ" src={champUrl} alt=""
                                    onError={ev => { (ev.target as HTMLImageElement).style.opacity = '0.3'; }} />

                                {/* Spell 1 */}
                                <div
                                    className={`ov-tracker-spell ${t1 && t1.remaining > 0 ? 'ov-spell-cd' : ''} ${t1 && t1.remaining <= 0 && t1.remaining > -5 ? 'ov-spell-up' : ''}`}
                                    onClick={() => handleClick(e.championName, s1Name)}
                                    title={`${s1Name} — click to track`}
                                >
                                    {s1Icon && <img src={s1Icon} alt="" className="ov-tracker-spell-img" />}
                                    {t1 && t1.remaining > 0 && <span className="ov-tracker-cd-text">{formatSec(t1.remaining)}</span>}
                                    {t1 && t1.remaining <= 0 && t1.remaining > -5 && <span className="ov-tracker-up-text">{formatSec(0)}</span>}
                                </div>

                                {/* Spell 2 */}
                                <div
                                    className={`ov-tracker-spell ${t2 && t2.remaining > 0 ? 'ov-spell-cd' : ''} ${t2 && t2.remaining <= 0 && t2.remaining > -5 ? 'ov-spell-up' : ''}`}
                                    onClick={() => handleClick(e.championName, s2Name)}
                                    title={`${s2Name} — click to track`}
                                >
                                    {s2Icon && <img src={s2Icon} alt="" className="ov-tracker-spell-img" />}
                                    {t2 && t2.remaining > 0 && <span className="ov-tracker-cd-text">{formatSec(t2.remaining)}</span>}
                                    {t2 && t2.remaining <= 0 && t2.remaining > -5 && <span className="ov-tracker-up-text">{formatSec(0)}</span>}
                                </div>

                                {/* Ultimate R */}
                                <div
                                    className={`ov-tracker-spell ov-tracker-ult ${tR && tR.remaining > 0 ? 'ov-spell-cd' : ''} ${tR && tR.remaining <= 0 && tR.remaining > -5 ? 'ov-spell-up' : ''}`}
                                    onClick={() => handleClick(e.championName, 'Ultimate')}
                                    title={`${e.championName} R — click to track`}
                                >
                                    <span className="ov-tracker-r-label">R</span>
                                    {tR && tR.remaining > 0 && <span className="ov-tracker-cd-text">{formatSec(tR.remaining)}</span>}
                                    {tR && tR.remaining <= 0 && tR.remaining > -5 && <span className="ov-tracker-up-text">{formatSec(0)}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
