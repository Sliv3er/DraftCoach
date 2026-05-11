import { GoogleGenerativeAI } from '@google/generative-ai';
import { BuildRequest } from '../../../../shared/types';
import { fetchDDragonVersion } from './ddragon';
import { getLocalRagContext, getRagStatus } from './rag-updater';
import buildTemplatesKb from '../../../../shared/kb/data/build-templates.json';

const buildTemplatesData = (buildTemplatesKb as any).data as Record<string, any>;

// ── KB Build Reference Builder ──
function getKBBuildContext(champion: string, role: string): string {
  // Normalize role for lookup
  const roleMap: Record<string, string> = {
    top: 'TOP', jungle: 'JUNGLE', mid: 'MID',
    adc: 'ADC', bot: 'ADC', bottom: 'ADC', support: 'SUPPORT',
  };
  const engineRole = roleMap[role.toLowerCase()] || role.toUpperCase();

  // Try direct key, then role-suffixed key
  const template = buildTemplatesData[champion]
    || buildTemplatesData[`${champion}_${engineRole}`]
    || Object.values(buildTemplatesData).find(
      (e: any) => e.championId?.toLowerCase() === champion.toLowerCase() && e.role === engineRole
    );

  if (!template?.variants) return '';

  const lines: string[] = ['\n═══ REFERENCE BUILDS (Mobalytics real match stats — use as baseline) ═══'];
  const variantLabels: Record<string, string> = {
    DAMAGE: 'BUILD 1 — Most Popular',
    SAFETY: 'BUILD 2 — Secondary',
    UTILITY: 'BUILD 3 — Alternative',
  };

  for (const [vKey, vLabel] of Object.entries(variantLabels)) {
    const v = template.variants[vKey];
    if (!v) continue;

    lines.push(`\n${vLabel} (${vKey}):`);
    if (v.runes) {
      lines.push(`  Runes: ${v.runes.primaryKeystone} (${v.runes.primaryTree}) / ${v.runes.secondaryTree}`);
      lines.push(`  Primary: ${v.runes.primarySlots?.join(', ') || 'N/A'}`);
      lines.push(`  Secondary: ${v.runes.secondarySlots?.join(', ') || 'N/A'}`);
      if (v.runes.statShards) lines.push(`  Shards: ${v.runes.statShards.join(', ')}`);
    }
    if (v.summonerSpells) lines.push(`  Spells: ${v.summonerSpells.join(' + ')}`);
    if (v.skillOrder) {
      lines.push(`  Skill Order: ${v.skillOrder.maxOrder?.join(' > ') || 'N/A'} (first 3: ${v.skillOrder.first3?.join(' → ') || 'N/A'})`);
    }
    if (v.startingItems) lines.push(`  Starting: ${v.startingItems.map((i: any) => i.name).join(' + ')}`);
    if (v.bootChoice) lines.push(`  Boots: ${v.bootChoice.name}`);
    if (v.coreItems) lines.push(`  Core: ${v.coreItems.map((i: any) => i.name).join(' → ')}`);
  }

  lines.push('═══════════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

type GeminiModel = 'gemini-3-pro-preview' | 'gemini-3.1-pro-preview' | 'gemini-3-flash-preview';

// ── System prompt — NO hardcoded patch. Patch is injected at runtime. ──

// Items that were removed or heavily reworked in Season 2026 — NEVER suggest these
const REMOVED_ITEMS = [
  "Luden's Companion", "Luden's Tempest", "Luden's Echo",
  "Mythic items (all removed)",
  "Rod of Ages", "Turbo Chemtank", "Evenshroud",
  "Goredrinker", "Stridebreaker", "Divine Sunderer",
  "Galeforce", "Kraken Slayer", "Immortal Shieldbow",
  "Crown of the Shattered Queen", "Night Harvester",
  "Riftmaker", "Radiant Virtue", "Iceborn Gauntlet",
  "Locket of the Iron Solari", "Shurelya's Battlesong",
  "Chemtech Putrifier", "Watchful Wardstone", "Vigilant Wardstone",
  "Demonic Embrace", "Horizon Focus", "Axiom Arc",
  "Duskblade of Draktharr", "Prowler's Claw",
  "Umbral Glaive (old)", "Serpent's Fang",
];

function buildSystemPrompt(patch: string): string {
  return `You are a Grandmaster League of Legends Draft & Itemization Engine for Season 2026, Patch ${patch}.

You will receive REFERENCE BUILDS from Mobalytics (real ranked match statistics). These are the proven meta builds — use them as your BASELINE. Your job is to SELECT the best base build for the matchup and make targeted adaptations to counter the specific enemy team.

CRITICAL: The following items have been REMOVED from the game and MUST NEVER be suggested:
${REMOVED_ITEMS.join(', ')}

FIRST, output this analysis section to reason about the matchup before building:

ANALYSIS
Base Build: <Which reference build you chose (BUILD 1/2/3) and why>
Matchup Type: <poke/all-in/sustain/scaling — describe the lane dynamic>
Enemy Damage Split: <AP-heavy / AD-heavy / mixed>
Key Threats: <1-2 enemy champions that are most dangerous and why>
Adaptations: <What changes you made from the base build and why>

THEN output these sections in this exact format:

RUNES
Primary: <TreeName>
Keystone: <RuneName>
<Rune1>
<Rune2>
<Rune3>
Secondary: <TreeName>
<Rune1>
<Rune2>
Shards: <Shard1>, <Shard2>, <Shard3>

SUMMONERS
<Spell1>
<Spell2>

SKILL ORDER
<Key> > <Key> > <Key> > <Key>

STARTING ITEMS
<Item1>
<Item2>

CORE BUILD
1. <Item1> (<why this item: explain adaptation to enemy comp>)
2. <Item2> (<why this item: explain adaptation to enemy comp>)
3. <Item3> (<why this item>)
4. <Item4> (<why this item>)
5. <Item5> (<why this item>)
6. <Item6> (<why this item>)

SITUATIONAL ITEMS
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>

JUNGLE PATH (ONLY include this section if the role is Jungle)
<Camp1> ➔ <Camp2> ➔ <Camp3> ➔ <Camp4> ➔ <Action>

ENEMY POWER SPIKES
<EnemyChampion>: <Level/Item spike — what to watch for>
<EnemyChampion>: <Level/Item spike — what to watch for>

WIN CONDITION
<One or two sentences describing how to win this specific draft/matchup>

YOUR POWER SPIKES
1-item spike: <ItemName> — <why this is a power spike and how to play around it>
2-item spike: <Item1> + <Item2> — <why this combination is strong and what to do>

Rules:
- START FROM THE REFERENCE BUILD: Pick the best base build, then adapt 1-3 items if the enemy comp demands it.
- EXPLAIN ADAPTATIONS: If you change an item from the reference, explain WHY in the item reason.
- If the reference build is already optimal for the matchup, keep it as-is.
- RUNE-ITEM COHERENCE: Keystone and items must form a coherent identity.
- CORE BUILD must ALWAYS have exactly 6 items (7 items if the role is Bottom/ADC).
- SITUATIONAL ITEMS must ALWAYS have at least 4 items with clear conditions.
- Boots are mandatory. ONE pair of upgraded boots MUST be in CORE BUILD as item 1 or 2.
- NEVER suggest any item from the removed items list above.
- Keep names exactly as in-game (current patch ${patch}).
- If role is Jungle, you MUST include a JUNGLE PATH section.
- ALWAYS include ENEMY POWER SPIKES, YOUR POWER SPIKES, and WIN CONDITION.
- Only output NEED_RETRY if the champion name or role is completely invalid/nonsensical.

COMMON MISTAKES — NEVER DO THESE:
❌ Do NOT put boots as item 5 or 6 — boots MUST be item 1 or 2
❌ Do NOT suggest the same item twice in CORE BUILD
❌ Do NOT put starting items (Doran's, potions) in CORE BUILD
❌ Do NOT pick secondary runes from the SAME tree as primary
❌ Do NOT suggest 2 pairs of boots
❌ Do NOT ignore the reference builds — they are real statistical data
✅ ALWAYS start from a reference build and adapt to the enemy team
✅ ALWAYS explain HOW an item counters a specific enemy in the reason`;
}

function buildShortPrompt(patch: string): string {
  return `You are a League of Legends build advisor for Patch ${patch}. Return ONLY: ANALYSIS, RUNES, SUMMONERS, SKILL ORDER, STARTING ITEMS, CORE BUILD, SITUATIONAL ITEMS, JUNGLE PATH (if Jungle), ENEMY POWER SPIKES, WIN CONDITION. ANALYSIS: 2-3 sentences on matchup type, enemy damage split, and build priority. Keep names exactly as in-game. Adapt to enemy comp. CORE BUILD must have exactly 6 items (7 for Bottom/ADC role). ALWAYS place boots as the 1st or 2nd item in CORE BUILD. SITUATIONAL ITEMS must have at least 4 items with conditions. JUNGLE PATH only if role is Jungle. ENEMY POWER SPIKES must have at least one entry per enemy. WIN CONDITION must be a concise 1-2 sentence strategy. NEVER suggest removed items like: ${REMOVED_ITEMS.slice(0, 15).join(', ')}. NEVER suggest the same item twice. Only output NEED_RETRY if champion name or role is invalid.`;
}

const VALID_MODELS: GeminiModel[] = [
  'gemini-3-pro-preview',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
];

function getModel(requested?: string): string {
  if (requested && VALID_MODELS.includes(requested as GeminiModel)) {
    return requested;
  }
  return process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
}

export async function generateBuild(
  req: BuildRequest,
  shortPrompt: boolean
): Promise<{ text: string; patchUsed: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  // ── Get live patch from DDragon (never hardcoded) ──
  let livePatch: string;
  try {
    livePatch = await fetchDDragonVersion();
  } catch {
    livePatch = 'unknown';
  }

  // Parse to major.minor for display (e.g., "26.5.1" → "26.5")
  const patchDisplay = livePatch.split('.').slice(0, 2).join('.');

  // ── Get RAG context for this champion/role/enemies ──
  const ragContext = getLocalRagContext(req.myChampion, req.role, req.enemies);

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemPrompt = shortPrompt ? buildShortPrompt(patchDisplay) : buildSystemPrompt(patchDisplay);

  const model = genAI.getGenerativeModel({
    model: getModel(req.model),
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.3,
      topP: 0.85,
      topK: 40,
    },
    tools: [{ googleSearch: {} } as any],
  });

  const isBot = /^(bottom|adc|bot)$/i.test(req.role);
  const itemSlots = isBot ? 7 : 6;

  // ── Build KB reference context ──
  const kbContext = getKBBuildContext(req.myChampion, req.role);

  // ── Build user message with RAG + KB context injected ──
  const userMessage = `${ragContext}
${kbContext}

Champion: ${req.myChampion}, Role: ${req.role}, Allies: ${req.allies.join(', ') || 'none'}, Enemies: ${req.enemies.join(', ') || 'none'}, Patch: ${patchDisplay} (Season 2026). This role has ${itemSlots} item slots — CORE BUILD must list exactly ${itemSlots} items. Make sure to place upgraded boots as the 1st or 2nd item in the CORE BUILD.

INSTRUCTIONS: Review the REFERENCE BUILDS above. Select the best base build for this matchup. Adapt items/runes as needed to counter the enemy team. Output the ANALYSIS section first (including which base build you chose), then all other sections.`;

  const startTime = Date.now();
  const modelUsed = getModel(req.model);

  try {
    const result = await model.generateContent(userMessage);
    const response = result.response;
    const text = response.text();

    // Track usage - usageMetadata is inside result.response
    const usageMetadata = (result as any).response?.usageMetadata || {};
    const tokensIn = usageMetadata.promptTokenCount || 0;
    const tokensOut = usageMetadata.candidatesTokenCount || 0;
    console.log('[Usage] Tracked:', modelUsed, '|', tokensIn, 'in /', tokensOut, 'out');

    // Fire-and-forget tracking (don't block the response)
    trackGeminiUsage({
      userId: req.userId || 'anonymous',
      model: modelUsed,
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startTime,
      success: true,
    }).catch(err => console.warn('[Usage] Tracking failed:', err));

    return {
      text,
      patchUsed: patchDisplay,
    };
  } catch (error: any) {
    // Track failed call
    trackGeminiUsage({
      userId: req.userId || 'anonymous',
      model: modelUsed,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - startTime,
      success: false,
      error: error.message,
    }).catch(err => console.warn('[Usage] Tracking failed:', err));

    throw error;
  }
}

// ── Track Gemini usage (fire-and-forget) ──
async function trackGeminiUsage(call: {
  userId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}) {
  try {
    const billingPort = process.env.BILLING_PORT || '3211';
    await fetch(`http://localhost:${billingPort}/api/billing/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(call),
    });
  } catch (e) {
    // Silently fail - don't影响主流程
    console.warn('[Usage] Could not reach billing service');
  }
}
