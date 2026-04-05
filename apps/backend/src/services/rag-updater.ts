import fs from 'fs';
import path from 'path';
import { fetchDDragonVersion } from './ddragon';
import { GoogleGenerativeAI } from '@google/generative-ai';

const RAG_DIR = path.join(__dirname, '../../data/rag');
const META_FILE = path.join(RAG_DIR, 'meta.json');
const DATASET_FILE = path.join(RAG_DIR, 'dataset.json');

interface RagMeta {
    patch: string;
    updatedAt: string;
    source: string;
}

interface RagDataset {
    metaContext: string;
    patch: string;
}

function ensureRagDir() {
    if (!fs.existsSync(RAG_DIR)) {
        fs.mkdirSync(RAG_DIR, { recursive: true });
    }
}

function getLocalRagMeta(): RagMeta | null {
    ensureRagDir();
    if (!fs.existsSync(META_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    } catch {
        return null;
    }
}

function saveLocalRagMeta(meta: RagMeta) {
    ensureRagDir();
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

let isUpdating = false;

export function getRagStatus() {
    const meta = getLocalRagMeta();
    return {
        isUpdating,
        patch: meta?.patch || null,
        updatedAt: meta?.updatedAt || null,
    };
}

function validateDataset(data: any): data is RagDataset {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.patch !== 'string' || !data.patch) return false;
    if (typeof data.metaContext !== 'string' || data.metaContext.length < 20) return false;
    return true;
}

export async function checkAndSyncRagPipeline(force: boolean = false): Promise<void> {
    if (isUpdating) {
        console.log('[RAG] Update already in progress, skipping request.');
        return;
    }

    console.log('[RAG] Checking live patch...');
    try {
        isUpdating = true;
        const livePatch = await fetchDDragonVersion();
        const localMeta = getLocalRagMeta();

        const livePatchMajorMinor = livePatch.split('.').slice(0, 2).join('.');
        const localPatchMajorMinor = localMeta?.patch ? localMeta.patch.split('.').slice(0, 2).join('.') : null;

        if (localPatchMajorMinor !== livePatchMajorMinor || force) {
            console.log(`[RAG] Patch mismatch detected. Live: ${livePatch}, Local: ${localMeta?.patch || 'None'}`);
            console.log(`[RAG] Triggering Grounded Pipeline for Patch ${livePatchMajorMinor}...`);

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.error('[RAG] GEMINI_API_KEY missing. Cannot run grounded update.');
                return;
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
                tools: [{ googleSearch: {} } as any],
            });

            const prompt = `Search for the official League of Legends Patch ${livePatchMajorMinor} notes on leagueoflegends.com.

Return ONLY a compact JSON object with this EXACT structure (no markdown, no code blocks, just raw JSON):
{
  "metaContext": "<3-5 sentences summarizing the biggest meta shifts this patch: which champions got buffed/nerfed and why, which items changed, any new items or reworks. Focus on what matters for draft and itemization decisions.>",
  "patch": "${livePatchMajorMinor}"
}

Rules:
- metaContext must be a SINGLE string, 3-5 sentences max
- Mention specific champion names that were buffed or nerfed
- If ANY new items were added or existing items were reworked, mention them by name
- If any champion was reworked, mention it
- Include item cost changes if significant
- Do NOT list every individual change — summarize the overall meta impact
- Do NOT hallucinate changes not in the official notes`;

            console.log(`[RAG] Making Gemini Search request for Patch ${livePatchMajorMinor} notes...`);

            let newDataset: RagDataset;
            try {
                const result = await model.generateContent(prompt);
                const textResponse = result.response.text().trim();

                const cleanJson = textResponse
                    .replace(/^```(json)?[\s\n]*/i, '')
                    .replace(/[\s\n]*```$/i, '')
                    .trim();

                const parsed = JSON.parse(cleanJson);
                parsed.patch = livePatchMajorMinor;

                if (validateDataset(parsed)) {
                    newDataset = { metaContext: parsed.metaContext, patch: parsed.patch };
                    console.log(`[RAG] Validated: metaContext is ${parsed.metaContext.length} chars`);
                } else {
                    console.warn('[RAG] Validation failed, using raw metaContext if available.');
                    newDataset = {
                        metaContext: parsed.metaContext || `Patch ${livePatchMajorMinor} is live. Check official notes for details.`,
                        patch: livePatchMajorMinor,
                    };
                }
            } catch (apiError) {
                console.error('[RAG] Gemini Grounding request failed:', apiError);
                const oldDatasetExists = fs.existsSync(DATASET_FILE);
                if (oldDatasetExists && !force) {
                    console.log('[RAG] Keeping previous dataset as rollback.');
                    saveLocalRagMeta({
                        patch: localMeta?.patch || livePatchMajorMinor,
                        updatedAt: localMeta?.updatedAt || new Date().toISOString(),
                        source: 'rollback-kept'
                    });
                    return;
                }
                newDataset = {
                    metaContext: `Patch ${livePatchMajorMinor} is live. Grounding failed — using minimal context.`,
                    patch: livePatchMajorMinor,
                };
            }

            fs.writeFileSync(DATASET_FILE, JSON.stringify(newDataset, null, 2), 'utf-8');

            saveLocalRagMeta({
                patch: livePatchMajorMinor,
                updatedAt: new Date().toISOString(),
                source: 'gemini-grounding-search'
            });
            console.log(`[RAG] Pipeline complete. Saved dataset for patch ${livePatchMajorMinor}.`);
        } else {
            console.log(`[RAG] Dataset up to date (Patch ${localPatchMajorMinor}). Using instantly.`);
        }
    } catch (error) {
        console.error('[RAG] Failed to sync RAG pipeline:', error);
    } finally {
        isUpdating = false;
    }
}

// ── Build compact RAG context for the Gemini prompt ──
export function getLocalRagContext(champion: string, role: string, enemies: string[]): string {
    const meta = getLocalRagMeta();
    const currentPatch = meta?.patch || 'Unknown';

    if (!fs.existsSync(DATASET_FILE)) {
        return `Patch ${currentPatch}\n${champion} ${role}\nNo local RAG data available.`;
    }

    let ds: RagDataset;
    try {
        ds = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf-8'));
    } catch {
        return `Patch ${currentPatch}\n${champion} ${role}\nRAG data corrupted.`;
    }

    return `Patch ${ds.patch}\n${champion} ${role}\n${ds.metaContext}`;
}
