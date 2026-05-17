import fs from 'fs';
import path from 'path';
import { fetchDDragonVersion } from './ddragon';

const RAG_DIR = path.join(__dirname, '../../data/rag');
const META_FILE = path.join(RAG_DIR, 'meta.json');
const DATASET_FILE = path.join(RAG_DIR, 'dataset.json');
const KB_BUILD_TEMPLATES = path.join(__dirname, '../../../../shared/kb/data/build-templates.json');

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

/**
 * Sync RAG pipeline — reads patch info from the U.GG-synced
 * build-templates.json meta field (no more Gemini Search grounding).
 */
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
            console.log(`[RAG] Patch change detected. Live: ${livePatch}, Local: ${localMeta?.patch || 'None'}`);

            // Read meta from U.GG-synced KB data
            let kbPatch = livePatchMajorMinor;
            let kbSource = 'ugg-gql';
            let kbStats = '';
            try {
                if (fs.existsSync(KB_BUILD_TEMPLATES)) {
                    const btData = JSON.parse(fs.readFileSync(KB_BUILD_TEMPLATES, 'utf-8'));
                    kbPatch = btData.meta?.patch || livePatchMajorMinor;
                    kbSource = btData.meta?.source || 'ugg-gql';
                    const entryCount = Object.keys(btData.data || {}).length;
                    kbStats = `${entryCount} build entries available from ${kbSource}.`;
                }
            } catch (err) {
                console.warn('[RAG] Could not read build-templates.json meta:', err);
            }

            const metaContext = `Patch ${kbPatch} is live. Meta build data sourced from U.GG (real match statistics). ${kbStats} Build recommendations are based on actual win rates and pick rates from ranked play.`;

            const newDataset: RagDataset = { metaContext, patch: kbPatch };

            ensureRagDir();
            fs.writeFileSync(DATASET_FILE, JSON.stringify(newDataset, null, 2), 'utf-8');

            saveLocalRagMeta({
                patch: kbPatch,
                updatedAt: new Date().toISOString(),
                source: kbSource,
            });
            console.log(`[RAG] Pipeline complete. Patch ${kbPatch} context saved (source: ${kbSource}).`);
        } else {
            console.log(`[RAG] Dataset up to date (Patch ${localPatchMajorMinor}).`);
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
