import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchDDragonVersion } from './ddragon';

export interface PlayerSnapshot {
    championName: string;
    summonerName: string;
    team: 'ORDER' | 'CHAOS';
    level: number;
    kills: number;
    deaths: number;
    assists: number;
    creepScore: number;
    currentGold: number;
    items: { itemID: number; displayName: string; count: number }[];
    isDead: boolean;
}

export interface GameSnapshot {
    gameTime: number;        // seconds
    mapName: string;
    gameMode: string;
    myChampion: string;
    myTeam: 'ORDER' | 'CHAOS';
    players: PlayerSnapshot[];
    activePlayerLevel: number;
    activePlayerGold: number;
    originalBuildText: string;  // the pre-game AI build
}

export interface LiveAdvice {
    triggered: boolean;
    triggerReason: string;
    gameTime: number;
    summary: string;
    changes: { currentItem: string; recommendedItem: string; reason: string }[];
    rawText: string;
}

function buildLiveAdvisorPrompt(patch: string): string {
    return `You are a League of Legends Live Game Advisor for Patch ${patch}.

You are given a real-time snapshot of an active game: all 10 players' champions, items, levels, KDA, gold, and the current game time. You also receive the ORIGINAL pre-game recommended build. A PRE-COMPUTED GAME STATE SUMMARY is also provided with threat analysis already calculated for you.

Use this decision framework to determine build adjustments:

1. THREAT CHECK:
   - If the PRE-COMPUTED PRIMARY THREAT has 5+ kills → build to counter their damage type FIRST
   - If they are AP → prioritize MR (Wit's End, Maw, Kaenic Rookern, Mercury's Treads)
   - If they are AD → prioritize Armor (Plated Steelcaps, Randuin's, Frozen Heart)

2. DAMAGE SPLIT CHECK:
   - If ENEMY DAMAGE SPLIT shows 3+ AP → your team needs MR items
   - If ENEMY DAMAGE SPLIT shows 3+ AD → your team needs Armor items
   - If only 1 enemy is fed → don't over-invest in resistances, focus on core build

3. GOLD EFFICIENCY:
   - NEVER suggest selling an item worth 2500g+ unless the replacement DIRECTLY counters the PRIMARY THREAT
   - If player gold < 1000g → suggest only component items they can buy NOW
   - If player gold > 2500g → suggest completed items
   - If player has components for a specific item → recommend finishing it, DON'T pivot

4. ANTI-HEAL CHECK:
   - If any enemy has strong healing (check items: Bloodthirster, Blade of the Ruined King, or healing-heavy champions) AND player has no Grievous Wounds item → suggest anti-heal
   - If player already has anti-heal → skip

5. BOOT CHECK:
   - If player has no boots at 10+ minutes → recommend boots
   - If player has Boots of Speed but not upgraded at 15+ minutes → recommend upgrade

6. ON-TRACK CHECK:
   - Compare player's current items to the ORIGINAL RECOMMENDED BUILD
   - If player is following the build and winning → say "on track" with no changes
   - If player deviated but the deviation makes sense for the game state → acknowledge it

Return ONLY this format:

ASSESSMENT
<One sentence: Is the current build on track or does it need changes?>

CHANGES
<ItemToReplace> → <NewItem>: <reason referencing a specific enemy or game state>
<ItemToReplace> → <NewItem>: <reason>

NEXT ITEM
<ItemName>: <why this should be your next purchase — reference current gold and game phase>

THREAT
<EnemyChampion> (<KDA>): <what makes them dangerous right now and how to counter>

Rules:
- If no changes are needed, still provide ASSESSMENT and NEXT ITEM sections, but write "None needed" under CHANGES.
- Keep item names exactly as in-game.
- Be concise — this is real-time advice, not an essay.
- Maximum 2-3 item changes. Don't suggest replacing completed items unless critical.
- Consider gold efficiency: don't suggest selling a 3000g item for a 3000g item unless the switch is critical.
- If the player has component items (e.g., Pickaxe, Long Sword), recognize they may be building toward a specific item.`;
}

export async function generateLiveAdvice(snapshot: GameSnapshot): Promise<LiveAdvice> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    let livePatch: string;
    try {
        livePatch = await fetchDDragonVersion();
    } catch {
        livePatch = 'unknown';
    }
    const patchDisplay = livePatch.split('.').slice(0, 2).join('.');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',  // Use flash for speed — this is real-time
        systemInstruction: buildLiveAdvisorPrompt(patchDisplay),
        generationConfig: {
            temperature: 0.3,
            topP: 0.85,
            topK: 40,
        },
    });

    // Build the game state description
    const gameMinutes = Math.floor(snapshot.gameTime / 60);
    const gameSeconds = Math.floor(snapshot.gameTime % 60);

    const myPlayer = snapshot.players.find(p => p.championName === snapshot.myChampion && p.team === snapshot.myTeam);
    const allies = snapshot.players.filter(p => p.team === snapshot.myTeam);
    const enemies = snapshot.players.filter(p => p.team !== snapshot.myTeam);

    // Pre-compute game state analysis so Flash doesn't have to
    const gamePhase = gameMinutes < 15 ? 'EARLY GAME' : gameMinutes < 25 ? 'MID GAME' : 'LATE GAME';
    const fedEnemies = enemies.filter(e => e.kills >= 5 || (e.kills - e.deaths >= 4));
    const primaryThreat = enemies.reduce((a, b) =>
        (b.kills - b.deaths) > (a.kills - a.deaths) ? b : a, enemies[0]
    );

    // Estimate enemy damage types from champion names (rough heuristic based on common classes)
    const myItemCount = myPlayer?.items.filter(i => i.displayName).length || 0;

    const precomputed = `
PRE-COMPUTED GAME STATE SUMMARY:
Phase: ${gamePhase} (${gameMinutes}:${gameSeconds.toString().padStart(2, '0')})
Primary Threat: ${primaryThreat?.championName || 'Unknown'} (${primaryThreat?.kills || 0}/${primaryThreat?.deaths || 0}/${primaryThreat?.assists || 0})
Fed Enemies: ${fedEnemies.length > 0 ? fedEnemies.map(e => `${e.championName} ${e.kills}/${e.deaths}`).join(', ') : 'None'}
My Completed Items: ${myItemCount}
My Available Gold: ${snapshot.activePlayerGold}g
Can Afford: ${snapshot.activePlayerGold >= 3000 ? 'Full completed items' : snapshot.activePlayerGold >= 1500 ? 'Mid-tier items or large components' : snapshot.activePlayerGold >= 800 ? 'Components only' : 'Small components or consumables only'}`;

    const formatPlayer = (p: PlayerSnapshot) => {
        const items = p.items.map(i => i.displayName).filter(Boolean).join(', ') || 'No items';
        return `  ${p.championName} (Lv${p.level}) — ${p.kills}/${p.deaths}/${p.assists} — Gold: ${p.currentGold} — Items: [${items}]`;
    };

    const userMessage = `GAME TIME: ${gameMinutes}:${gameSeconds.toString().padStart(2, '0')}
${precomputed}

MY CHAMPION: ${snapshot.myChampion}
MY STATS: Level ${myPlayer?.level ?? '?'}, ${myPlayer?.kills ?? 0}/${myPlayer?.deaths ?? 0}/${myPlayer?.assists ?? 0}, Gold: ${snapshot.activePlayerGold}
MY ITEMS: [${myPlayer?.items.map(i => i.displayName).filter(Boolean).join(', ') || 'None'}]

MY TEAM:
${allies.map(formatPlayer).join('\n')}

ENEMY TEAM:
${enemies.map(formatPlayer).join('\n')}

ORIGINAL RECOMMENDED BUILD (pre-game):
${snapshot.originalBuildText}

Analyze the current game state using the decision framework and provide live build advice.`;

    const result = await model.generateContent(userMessage);
    const text = result.response.text();

    // Parse the response
    const changes: { currentItem: string; recommendedItem: string; reason: string }[] = [];
    let summary = '';
    const lines = text.split('\n');

    let inChanges = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ASSESSMENT')) continue;
        if (trimmed === 'CHANGES') { inChanges = true; continue; }
        if (trimmed === 'NEXT ITEM' || trimmed === 'THREAT') { inChanges = false; continue; }

        if (!summary && !inChanges && trimmed && !trimmed.startsWith('CHANGES') && !trimmed.startsWith('NEXT ITEM') && !trimmed.startsWith('THREAT')) {
            summary = trimmed;
        }

        if (inChanges && trimmed.includes('→')) {
            const arrowIdx = trimmed.indexOf('→');
            const colonIdx = trimmed.indexOf(':', arrowIdx);
            const currentItem = trimmed.substring(0, arrowIdx).trim();
            const recommendedItem = colonIdx > arrowIdx
                ? trimmed.substring(arrowIdx + 1, colonIdx).trim()
                : trimmed.substring(arrowIdx + 1).trim();
            const reason = colonIdx > arrowIdx ? trimmed.substring(colonIdx + 1).trim() : '';
            if (currentItem && recommendedItem && recommendedItem.toLowerCase() !== 'none needed') {
                changes.push({ currentItem, recommendedItem, reason });
            }
        }
    }

    return {
        triggered: true,
        triggerReason: '',  // filled by caller
        gameTime: snapshot.gameTime,
        summary: summary || 'Build analysis complete.',
        changes,
        rawText: text,
    };
}
