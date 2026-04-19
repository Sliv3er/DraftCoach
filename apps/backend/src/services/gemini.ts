import { GoogleGenerativeAI } from '@google/generative-ai';
import { BuildRequest } from '../../../../shared/types';
import { fetchDDragonVersion } from './ddragon';
import { getLocalRagContext, getRagStatus } from './rag-updater';

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

You will receive RAG context containing verified patch data. Use it as your PRIMARY knowledge source. Only use Google Search grounding to supplement if the RAG context is insufficient.

CRITICAL: The following items have been REMOVED from the game and MUST NEVER be suggested:
${REMOVED_ITEMS.join(', ')}
If you are unsure whether an item still exists, use Google Search grounding to verify BEFORE suggesting it.

FIRST, output this analysis section to reason about the matchup before building:

ANALYSIS
Matchup Type: <poke/all-in/sustain/scaling — describe the lane dynamic>
Enemy Damage Split: <AP-heavy / AD-heavy / mixed>
Key Threats: <1-2 enemy champions that are most dangerous and why>
Build Priority: <What stats/passives does my champion need MOST vs THIS specific enemy team?>

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
- THINK THEN BUILD: Your ANALYSIS section must directly influence your item choices.
- PLAY LIKE A GRANDMASTER: Analyze the lane matchup and enemy team composition's damage split.
- ADAPTIVE KEYSTONES: Choose Keystones based on the lane matchup.
- ADAPTIVE ITEMS: Build defensive items earlier if the enemy comp dictates it.
- RUNE-ITEM COHERENCE: Keystone and items must form a coherent identity:
  Conqueror → sustained trade items (BotRK, Death's Dance, Black Cleaver)
  Lethal Tempo → attack speed items (Nashor's Tooth, Wit's End, Runaan's Hurricane)
  Electrocute → burst items (Luden's, Shadowflame, Stormsurge)
  Fleet Footwork → sustain/kiting items (Bloodthirster, Rapid Firecannon)
  Grasp → bruiser/tank items (Sundered Sky, Sterak's Gage, Heartsteel)
- CORE BUILD must ALWAYS have exactly 6 items (7 items if the role is Bottom/ADC).
- SITUATIONAL ITEMS must ALWAYS have at least 4 items with clear conditions.
- Boots are mandatory. ONE pair of upgraded boots MUST be in CORE BUILD as item 1 or 2.
- NEVER suggest any item from the removed items list above. Double-check every item name.
- Adapt to enemy comp.
- For jungle, include jungle companion start.
- Keep names exactly as in-game (current patch ${patch}).
- Do NOT add explanations or extra text outside the sections.
- If role is Jungle, you MUST include a JUNGLE PATH section.
- ALWAYS include ENEMY POWER SPIKES, YOUR POWER SPIKES, and WIN CONDITION.
- Only output NEED_RETRY if the champion name or role is completely invalid/nonsensical.

COMMON MISTAKES — NEVER DO THESE:
❌ Do NOT put boots as item 5 or 6 — boots MUST be item 1 or 2 in CORE BUILD
❌ Do NOT suggest the same item twice in CORE BUILD
❌ Do NOT put starting items (Doran's, potions) in CORE BUILD
❌ Do NOT pick secondary runes from the SAME tree as primary
❌ Do NOT suggest 2 pairs of boots
❌ Do NOT output a generic cookie-cutter build — you MUST adapt to the enemy team
✅ ALWAYS adapt at least 1-2 items specifically to the enemy team composition
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

  // ── Build user message with RAG context injected ──
  const userMessage = `${ragContext}

Champion: ${req.myChampion}, Role: ${req.role}, Allies: ${req.allies.join(', ') || 'none'}, Enemies: ${req.enemies.join(', ') || 'none'}, Patch: ${patchDisplay} (Season 2026). This role has ${itemSlots} item slots — CORE BUILD must list exactly ${itemSlots} items. Make sure to place upgraded boots as the 1st or 2nd item in the CORE BUILD. Generate optimized build. Output the ANALYSIS section first, then all other sections.`;

  const result = await model.generateContent(userMessage);
  const response = result.response;
  const text = response.text();

  return {
    text,
    patchUsed: patchDisplay,
  };
}
