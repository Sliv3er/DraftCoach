import { GoogleGenerativeAI } from '@google/generative-ai';
import { BuildRequest } from '../../../shared/types';

const SYSTEM_PROMPT = `You are a League of Legends Draft & Itemization Engine for Season 2026. You MUST use Google Search grounding to verify current live patch data (Patch 26.4). If you cannot confirm current patch-relevant details via grounding, output exactly: NEED_RETRY.

Return ONLY these sections in this exact format:

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
1. <Item1> (<why this item>)
2. <Item2> (<why this item>)
3. <Item3> (<why this item>)
4. <Item4> (<why this item>)
5. <Item5> (<why this item>)
6. <Item6> (<why this item>)

SITUATIONAL ITEMS
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>
<ItemName>: <when to buy and why>

Rules:
- CORE BUILD must ALWAYS have exactly 6 items (7 items if the role is Bottom/ADC, since bottom laners have 7 item slots in Season 2026).
- SITUATIONAL ITEMS must ALWAYS have at least 4 items with clear conditions (e.g. "vs heavy AP", "if behind", "vs tanks").
- Boots count as a core item. Include them in CORE BUILD.
- Never suggest removed items or removed runes.
- If unsure, output NEED_RETRY.
- Adapt to enemy comp.
- For jungle, include jungle companion start.
- Keep names exactly as in-game.
- Do NOT add explanations or extra text outside the sections.`;

const SHORT_SYSTEM_PROMPT = `You are a League of Legends build advisor. Return ONLY: RUNES, SUMMONERS, SKILL ORDER, STARTING ITEMS, CORE BUILD, SITUATIONAL ITEMS. Keep names exactly as in-game. Adapt to enemy comp. CORE BUILD must have exactly 6 items (7 for Bottom/ADC role). SITUATIONAL ITEMS must have at least 4 items with conditions. Boots count as a core item.`;

function getModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
}

export async function generateBuild(
  req: BuildRequest,
  shortPrompt: boolean
): Promise<{ text: string; patchDetected: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getModel(),
    systemInstruction: shortPrompt ? SHORT_SYSTEM_PROMPT : SYSTEM_PROMPT,
    tools: [{ googleSearch: {} } as any],
  });

  const isBot = /^(bottom|adc|bot)$/i.test(req.role);
  const itemSlots = isBot ? 7 : 6;
  const userMessage = `Champion: ${req.myChampion}, Role: ${req.role}, Allies: ${req.allies.join(', ') || 'none'}, Enemies: ${req.enemies.join(', ') || 'none'}, Patch: 26.4 (Season 2026). This role has ${itemSlots} item slots — CORE BUILD must list exactly ${itemSlots} items. Generate optimized build. Output only the sections.`;

  const result = await model.generateContent(userMessage);
  const response = result.response;
  const text = response.text();

  return {
    text,
    patchDetected: req.patch || '26.4',
  };
}
