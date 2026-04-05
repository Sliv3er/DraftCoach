// KB Schema Validation
// Validates all KB JSON files for structural correctness, range checks,
// referential integrity, and patch consistency.

import * as path from 'path';
import * as fs from 'fs';

export interface ValidationError {
    file: string;
    field: string;
    message: string;
    severity: 'error' | 'warning';
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    filesChecked: number;
    patch: string | null;
}

// ─── Range Check Helpers ────────────────────────────────────────────

function inRange(val: unknown, min: number, max: number): boolean {
    return typeof val === 'number' && val >= min && val <= max;
}

function isString(val: unknown): val is string {
    return typeof val === 'string' && val.length > 0;
}

function isOneOf<T>(val: unknown, options: T[]): val is T {
    return options.includes(val as T);
}

// ─── Individual File Validators ─────────────────────────────────────

function validateChampions(data: any, errors: ValidationError[]): void {
    if (!data || typeof data !== 'object') {
        errors.push({ file: 'champions.json', field: 'data', message: 'Missing or invalid data object', severity: 'error' });
        return;
    }

    const ROLES = ['TOP', 'JUNGLE', 'MID', 'BOT', 'SUPPORT'];
    const DMG_TYPES = ['AD', 'AP', 'MIXED', 'TRUE'];
    const PHASES = ['EARLY', 'MID', 'LATE'];
    const TAG_FIELDS_100 = ['engage', 'peel', 'frontline', 'burst', 'sustained', 'poke', 'healShield', 'splitpush', 'mobility', 'range'];

    for (const [id, champ] of Object.entries(data) as [string, any][]) {
        const ctx = `champions[${id}]`;

        if (!isString(champ.id)) errors.push({ file: 'champions.json', field: `${ctx}.id`, message: 'Missing id', severity: 'error' });
        if (!isString(champ.name)) errors.push({ file: 'champions.json', field: `${ctx}.name`, message: 'Missing name', severity: 'error' });

        if (!Array.isArray(champ.roles) || champ.roles.length === 0) {
            errors.push({ file: 'champions.json', field: `${ctx}.roles`, message: 'Missing or empty roles array', severity: 'error' });
        } else {
            for (const r of champ.roles) {
                if (!isOneOf(r, ROLES)) errors.push({ file: 'champions.json', field: `${ctx}.roles`, message: `Invalid role: ${r}`, severity: 'error' });
            }
        }

        if (!champ.tags || typeof champ.tags !== 'object') {
            errors.push({ file: 'champions.json', field: `${ctx}.tags`, message: 'Missing tags object', severity: 'error' });
            continue;
        }

        for (const field of TAG_FIELDS_100) {
            if (!inRange(champ.tags[field], 0, 100)) {
                errors.push({ file: 'champions.json', field: `${ctx}.tags.${field}`, message: `Out of range [0-100]: ${champ.tags[field]}`, severity: 'error' });
            }
        }

        if (typeof champ.tags.ccDensity !== 'number' || champ.tags.ccDensity < 0) {
            errors.push({ file: 'champions.json', field: `${ctx}.tags.ccDensity`, message: `Invalid ccDensity: ${champ.tags.ccDensity}`, severity: 'error' });
        }

        if (!isOneOf(champ.tags.damageType, DMG_TYPES)) {
            errors.push({ file: 'champions.json', field: `${ctx}.tags.damageType`, message: `Invalid damageType: ${champ.tags.damageType}`, severity: 'error' });
        }

        if (!isOneOf(champ.tags.scalingCurve, PHASES)) {
            errors.push({ file: 'champions.json', field: `${ctx}.tags.scalingCurve`, message: `Invalid scalingCurve: ${champ.tags.scalingCurve}`, severity: 'error' });
        }

        if (!champ.tags.threatWindow || !isOneOf(champ.tags.threatWindow.start, PHASES) || !isOneOf(champ.tags.threatWindow.end, PHASES)) {
            errors.push({ file: 'champions.json', field: `${ctx}.tags.threatWindow`, message: 'Invalid threatWindow', severity: 'error' });
        }
    }
}

function validateItems(data: any, errors: ValidationError[]): void {
    if (!data || typeof data !== 'object') {
        errors.push({ file: 'items.json', field: 'data', message: 'Missing data', severity: 'error' });
        return;
    }

    for (const [id, item] of Object.entries(data) as [string, any][]) {
        const ctx = `items[${id}]`;
        if (!isString(item.id)) errors.push({ file: 'items.json', field: `${ctx}.id`, message: 'Missing id', severity: 'error' });
        if (!isString(item.name)) errors.push({ file: 'items.json', field: `${ctx}.name`, message: 'Missing name', severity: 'error' });
        if (!Array.isArray(item.tags)) errors.push({ file: 'items.json', field: `${ctx}.tags`, message: 'Missing tags array', severity: 'error' });
        if (typeof item.cost !== 'number' || item.cost < 0) errors.push({ file: 'items.json', field: `${ctx}.cost`, message: `Invalid cost: ${item.cost}`, severity: 'error' });
        if (!isOneOf(item.spikeTiming, ['EARLY', 'MID', 'LATE'])) errors.push({ file: 'items.json', field: `${ctx}.spikeTiming`, message: `Invalid spikeTiming`, severity: 'warning' });
    }
}

function validateBuildTemplates(data: any, championIds: Set<string>, errors: ValidationError[]): void {
    if (!data || typeof data !== 'object') {
        errors.push({ file: 'build-templates.json', field: 'data', message: 'Missing data', severity: 'error' });
        return;
    }

    for (const [key, template] of Object.entries(data) as [string, any][]) {
        const ctx = `build-templates[${key}]`;
        if (!isString(template.championId)) errors.push({ file: 'build-templates.json', field: `${ctx}.championId`, message: 'Missing championId', severity: 'error' });

        // Referential integrity: champion must exist
        if (template.championId && !championIds.has(template.championId)) {
            errors.push({ file: 'build-templates.json', field: `${ctx}.championId`, message: `Champion not in champions.json: ${template.championId}`, severity: 'warning' });
        }

        if (!template.variants || typeof template.variants !== 'object') {
            errors.push({ file: 'build-templates.json', field: `${ctx}.variants`, message: 'Missing variants', severity: 'error' });
        }
    }
}

function validateWeights(data: any, errors: ValidationError[]): void {
    if (!data || typeof data !== 'object') {
        errors.push({ file: 'weights.json', field: 'data', message: 'Missing data', severity: 'error' });
        return;
    }

    const REQUIRED = ['laneMatchup', 'teamNeeds', 'teamDmgBalance', 'enemyThreat', 'synergy', 'scalingMatch', 'ccDensity', 'rangeAdvantage', 'mobilityGap'];
    let total = 0;

    for (const key of REQUIRED) {
        if (typeof data[key] !== 'number') {
            errors.push({ file: 'weights.json', field: `data.${key}`, message: `Missing weight: ${key}`, severity: 'error' });
        } else {
            total += data[key];
        }
    }

    if (Math.abs(total - 1.0) > 0.01) {
        errors.push({ file: 'weights.json', field: 'data', message: `Weights sum to ${total.toFixed(3)}, expected 1.0`, severity: 'warning' });
    }
}

// ─── Main Validation Entry Point ────────────────────────────────────

export function validateKBDirectory(kbDir: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let filesChecked = 0;
    let patch: string | null = null;

    const requiredFiles = ['champions.json', 'items.json', 'matchups.json', 'rune-templates.json', 'build-templates.json', 'synergy-counters.json', 'weights.json'];

    // Check all files exist
    for (const file of requiredFiles) {
        const filePath = path.join(kbDir, file);
        if (!fs.existsSync(filePath)) {
            errors.push({ file, field: '', message: `File not found: ${filePath}`, severity: 'error' });
        }
    }

    // Parse and validate each
    function loadJson(file: string): any {
        try {
            const content = fs.readFileSync(path.join(kbDir, file), 'utf-8');
            filesChecked++;
            return JSON.parse(content);
        } catch (err: any) {
            errors.push({ file, field: '', message: `JSON parse error: ${err.message}`, severity: 'error' });
            return null;
        }
    }

    // Validate meta + patch consistency
    const patches = new Set<string>();
    for (const file of requiredFiles) {
        const parsed = loadJson(file);
        if (!parsed) continue;
        if (parsed.meta?.patch) {
            patches.add(parsed.meta.patch);
            if (!patch) patch = parsed.meta.patch;
        } else {
            errors.push({ file, field: 'meta.patch', message: 'Missing meta.patch', severity: 'error' });
        }
    }

    if (patches.size > 1) {
        errors.push({ file: 'ALL', field: 'meta.patch', message: `Inconsistent patches: ${[...patches].join(', ')}`, severity: 'error' });
    }

    // Structural validation
    const champFile = loadJson('champions.json');
    const itemFile = loadJson('items.json');
    const buildFile = loadJson('build-templates.json');
    const weightFile = loadJson('weights.json');

    if (champFile?.data) validateChampions(champFile.data, errors);
    if (itemFile?.data) validateItems(itemFile.data, errors);

    const championIds = new Set<string>(Object.keys(champFile?.data || {}));
    if (buildFile?.data) validateBuildTemplates(buildFile.data, championIds, errors);
    if (weightFile?.data) validateWeights(weightFile.data, errors);

    // Split errors/warnings
    const errs = errors.filter(e => e.severity === 'error');
    const warns = errors.filter(e => e.severity === 'warning');

    return {
        valid: errs.length === 0,
        errors: errs,
        warnings: warns,
        filesChecked,
        patch,
    };
}
