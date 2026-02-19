import { GoogleGenerativeAI } from '@google/generative-ai';
import { BuildRequest } from '../../../shared/types';

const SYSTEM_PROMPT = `You are a League of Legends Draft & Itemization Engine for Season 2026. You MUST use Google Search grounding to verify current live patch data (Patch 26.4). If you cannot confirm current patch-relevant details via grounding, output exactly: NEED_RETRY. Return ONLY these sections: RUNES, SUMMONERS, SKILL ORDER, STARTING ITEMS, CORE BUILD (in order), SITUATIONAL ITEMS (conditional swaps). Rules: Never suggest removed items or removed runes. If unsure, output NEED_RETRY. Adapt to enemy comp. For jungle, include jungle companion start. Keep names exactly as in-game.`;

const SHORT_SYSTEM_PROMPT = `You are a League of Legends build advisor. Return ONLY: RUNES, SUMMONERS, SKILL ORDER, STARTING ITEMS, CORE BUILD, SITUATIONAL ITEMS. Keep names exactly as in-game. Adapt to enemy comp.`;

function getModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
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

  const userMessage = `Champion: ${req.myChampion}, Role: ${req.role}, Allies: ${req.allies.join(', ') || 'none'}, Enemies: ${req.enemies.join(', ') || 'none'}, Patch: 26.4 (Season 2026). Task: Generate optimized build for this specific game. Output only the sections.`;

  const result = await model.generateContent(userMessage);
  const response = result.response;
  const text = response.text();

  return {
    text,
    patchDetected: req.patch || '26.4',
  };
}
