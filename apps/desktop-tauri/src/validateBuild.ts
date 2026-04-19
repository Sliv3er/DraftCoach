/**
 * AI Output Validator — sits between streamed AI result and UI rendering.
 * Pure in-memory checks against DDragon data already loaded. No API calls.
 * Must be FAST: <5ms per validation run.
 */

export interface ValidationResult {
    valid: boolean;
    warnings: string[];  // non-critical (item icon not found, etc.)
    errors: string[];    // critical (no runes section, invalid skill order, etc.)
    sections: ParsedSection[];
}

export interface ParsedSection {
    title: string;
    content: string;
}

const SECTION_KEYS = [
    'ANALYSIS', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS',
    'CORE BUILD', 'SITUATIONAL ITEMS', 'JUNGLE PATH',
    'ENEMY POWER SPIKES', 'WIN CONDITION', 'YOUR POWER SPIKES',
];

const VALID_SKILLS = new Set(['Q', 'W', 'E', 'R']);

const RUNE_TREES = new Set([
    'precision', 'domination', 'sorcery', 'resolve', 'inspiration',
]);

function parseSections(text: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = text.split('\n');
    let curTitle = '';
    let curLines: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim().replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^-\s*/, '');
        if (!trimmed) { if (curTitle) curLines.push(''); continue; }
        const upper = trimmed.toUpperCase().replace(/[#*\-:]/g, '').trim();
        const matched = SECTION_KEYS.find(s => upper.startsWith(s));
        if (matched) {
            if (curTitle) sections.push({ title: curTitle, content: curLines.join('\n').trim() });
            curTitle = matched;
            const rest = trimmed.replace(/^[#*\-\s]*/g, '').replace(new RegExp(`^${matched}[^\\n]*?(?::|\\n|$)`, 'i'), '').trim();
            curLines = rest ? [rest] : [];
        } else if (curTitle) {
            curLines.push(trimmed);
        }
    }
    if (curTitle) sections.push({ title: curTitle, content: curLines.join('\n').trim() });
    return sections;
}

function nameInMap(name: string, map: Map<string, string>): boolean {
    const n = name.toLowerCase().trim()
        .replace(/['']/g, "'")
        .replace(/\s+/g, ' ');
    if (map.has(n)) return true;
    // Strict prefix match only — not loose substring
    for (const key of map.keys()) {
        if (key === n || key.startsWith(n + ' ') || n.startsWith(key + ' ')) return true;
    }
    const firstWord = n.split(' ')[0];
    if (firstWord.length >= 5) {
        for (const key of map.keys()) {
            if (key.startsWith(firstWord)) return true;
        }
    }
    return false;
}

export function validateBuild(
    text: string,
    runeMap: Map<string, string>,
    itemMap: Map<string, string>,
    spellMap: Map<string, string>,
): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const sections = parseSections(text);

    if (sections.length === 0) {
        return { valid: false, warnings, errors: ['No sections parsed from AI output'], sections };
    }

    const sectionMap = new Map(sections.map(s => [s.title, s.content]));

    // ─── 1. RUNES Validation ───────────────────────────────────
    const runesContent = sectionMap.get('RUNES');
    if (!runesContent) {
        errors.push('Missing RUNES section');
    } else {
        const runeLines = runesContent.split('\n').filter(l => l.trim());
        // Check Primary tree
        const primaryLine = runeLines.find(l => /primary/i.test(l));
        if (primaryLine) {
            const treeName = primaryLine.replace(/primary\s*:\s*/i, '').trim().toLowerCase();
            if (treeName && !RUNE_TREES.has(treeName)) {
                warnings.push(`Rune tree "${treeName}" not recognized`);
            }
        }
        // Check Keystone exists
        const keystoneLine = runeLines.find(l => /keystone/i.test(l));
        if (keystoneLine) {
            const ksName = keystoneLine.replace(/keystone\s*:\s*/i, '').trim();
            if (ksName && !nameInMap(ksName, runeMap)) {
                warnings.push(`Keystone "${ksName}" not found in DDragon`);
            }
        } else {
            warnings.push('No Keystone line found in RUNES');
        }
        // Check Secondary tree
        const secondaryLine = runeLines.find(l => /secondary/i.test(l));
        if (secondaryLine) {
            const treeName = secondaryLine.replace(/secondary\s*:\s*/i, '').trim().toLowerCase();
            if (treeName && !RUNE_TREES.has(treeName)) {
                warnings.push(`Secondary rune tree "${treeName}" not recognized`);
            }
        }
        // Check Shards
        const shardsLine = runeLines.find(l => /shards/i.test(l));
        if (!shardsLine) {
            warnings.push('No Shards line found in RUNES');
        }
    }

    // ─── 2. ITEMS Validation ───────────────────────────────────
    const coreContent = sectionMap.get('CORE BUILD');
    if (!coreContent) {
        errors.push('Missing CORE BUILD section');
    } else {
        const itemLines = coreContent.split('\n').filter(l => l.trim());
        if (itemLines.length < 5) {
            warnings.push(`Core build has ${itemLines.length} items (expected 6-7)`);
        }

        const seenItems = new Set<string>();
        for (const line of itemLines) {
            // Extract item name: "1. Blade of the Ruined King (reason)" → "Blade of the Ruined King"
            const match = line.replace(/^\d+\.\s*/, '').match(/^([^(]+)/);
            if (match) {
                const itemName = match[1].trim();
                const nameKey = itemName.toLowerCase();

                // Check duplicates
                if (seenItems.has(nameKey)) {
                    warnings.push(`Duplicate item in core build: "${itemName}"`);
                }
                seenItems.add(nameKey);

                // Check item exists
                if (!nameInMap(itemName, itemMap)) {
                    warnings.push(`Item "${itemName}" not found in DDragon`);
                }
            }
        }
    }

    // ─── 3. STARTING ITEMS Validation ──────────────────────────
    const startContent = sectionMap.get('STARTING ITEMS');
    if (!startContent) {
        warnings.push('Missing STARTING ITEMS section');
    } else {
        const startLines = startContent.split('\n').filter(l => l.trim());
        for (const line of startLines) {
            const itemName = line.replace(/^\d+\.\s*/, '').replace(/\(.*\)/, '').trim();
            if (itemName && !nameInMap(itemName, itemMap)) {
                warnings.push(`Starting item "${itemName}" not found in DDragon`);
            }
        }
    }

    // ─── 4. SKILL ORDER Validation ─────────────────────────────
    const skillContent = sectionMap.get('SKILL ORDER');
    if (!skillContent) {
        warnings.push('Missing SKILL ORDER section');
    } else {
        const skills = skillContent.toUpperCase().replace(/[^QWER]/g, ' ').trim().split(/\s+/).filter(Boolean);
        for (const s of skills) {
            if (!VALID_SKILLS.has(s)) {
                warnings.push(`Invalid skill "${s}" in SKILL ORDER`);
            }
        }
        // Check that we have at least 3 unique skills
        const unique = new Set(skills.filter(s => VALID_SKILLS.has(s)));
        if (unique.size < 3) {
            warnings.push(`Skill order only has ${unique.size} unique skills (expected Q, W, E)`);
        }
    }

    // ─── 5. SUMMONERS Validation ───────────────────────────────
    const sumContent = sectionMap.get('SUMMONERS');
    if (!sumContent) {
        warnings.push('Missing SUMMONERS section');
    } else {
        const spellLines = sumContent.split('\n').filter(l => l.trim());
        for (const line of spellLines) {
            const spellName = line.trim();
            if (spellName && !nameInMap(spellName, spellMap)) {
                warnings.push(`Summoner spell "${spellName}" not found in DDragon`);
            }
        }
    }

    // Determine overall validity: errors = hard fail, warnings = pass with notes
    const valid = errors.length === 0;

    return { valid, warnings, errors, sections };
}
