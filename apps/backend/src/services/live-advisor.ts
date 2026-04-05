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

You are given a real-time snapshot of an active game: all 10 players' champions, items, levels, KDA, gold, and the current game time. You also receive the ORIGINAL pre-game recommended build that was generated before the game started.

Your job is to analyze the current game state and determine if the player should modify their build. Consider:
- Enemy damage types: Are enemies building AP when expected AD, or vice versa? Should we adjust resistances?
- Fed enemies: Any enemy with 5+ kills or a KDA advantage of 4+ should be specifically countered
- My current items vs the recommended build: Am I on track or have I deviated?
- Component items: The player may be in the middle of building an item (has components but not the full item)
- Game phase: Early (0-15 min), mid (15-25 min), late (25+ min) — build priorities shift
- Team composition needs: Does the team need more tank/damage/utility based on how the game is going?

Return ONLY this format:

ASSESSMENT
<One sentence: Is the current build on track or does it need changes?>

CHANGES
<ItemToReplace> → <NewItem>: <reason>
<ItemToReplace> → <NewItem>: <reason>

NEXT ITEM
<ItemName>: <why this should be your next purchase given the current game state>

THREAT
<EnemyChampion> (<KDA>): <what makes them dangerous right now and how to counter>

Rules:
- If no changes are needed, still provide ASSESSMENT and NEXT ITEM sections, but write "None needed" under CHANGES.
- Keep item names exactly as in-game.
- Be concise — this is real-time advice, not an essay.
- Maximum 2-3 item changes. Don't suggest replacing items the player already completed unless critical.
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
    });

    // Build the game state description
    const gameMinutes = Math.floor(snapshot.gameTime / 60);
    const gameSeconds = Math.floor(snapshot.gameTime % 60);

    const myPlayer = snapshot.players.find(p => p.championName === snapshot.myChampion && p.team === snapshot.myTeam);
    const allies = snapshot.players.filter(p => p.team === snapshot.myTeam);
    const enemies = snapshot.players.filter(p => p.team !== snapshot.myTeam);

    const formatPlayer = (p: PlayerSnapshot) => {
        const items = p.items.map(i => i.displayName).filter(Boolean).join(', ') || 'No items';
        return `  ${p.championName} (Lv${p.level}) — ${p.kills}/${p.deaths}/${p.assists} — Gold: ${p.currentGold} — Items: [${items}]`;
    };

    const userMessage = `GAME TIME: ${gameMinutes}:${gameSeconds.toString().padStart(2, '0')}

MY CHAMPION: ${snapshot.myChampion}
MY STATS: Level ${myPlayer?.level ?? '?'}, ${myPlayer?.kills ?? 0}/${myPlayer?.deaths ?? 0}/${myPlayer?.assists ?? 0}, Gold: ${snapshot.activePlayerGold}
MY ITEMS: [${myPlayer?.items.map(i => i.displayName).filter(Boolean).join(', ') || 'None'}]

MY TEAM:
${allies.map(formatPlayer).join('\n')}

ENEMY TEAM:
${enemies.map(formatPlayer).join('\n')}

ORIGINAL RECOMMENDED BUILD (pre-game):
${snapshot.originalBuildText}

Analyze the current game state and provide live build advice.`;

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
