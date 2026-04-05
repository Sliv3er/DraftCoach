#!/usr/bin/env node
// Meta Builder CLI — KB Patch Automation Tool
//
// Commands:
//   validate --dir <kbDir>                    Validate a KB directory
//   diff --old <dir> --new <dir>              Compare two KB versions
//   rollback --to <patch> --data <kbDir>      Rollback KB to a specific patch
//   generate --patch <ver> --notes <file>     Generate KB from patch notes (requires LLM)

const fs = require('fs');
const path = require('path');

// ─── Parse CLI Arguments ────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function getArg(flag) {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

function printUsage() {
    console.log(`
DraftCoach Meta Builder CLI

Commands:
  validate --dir <kbDir>                   Validate KB JSON files
  diff --old <oldDir> --new <newDir>       Diff two KB directories
  rollback --to <patch> --data <kbDir>     Rollback to archived patch
  generate --patch <ver> --notes <file>    Generate KB (requires --model flag)

Options:
  --dir <path>       KB data directory
  --old <path>       Old KB directory for diff
  --new <path>       New KB directory for diff
  --to <patch>       Target patch for rollback
  --data <path>      KB data directory for rollback
  --patch <version>  Target patch version
  --notes <file>     Patch notes file (markdown)
  --model <name>     LLM model name (optional for generate)
  --canary           Run in canary mode (validate before promoting)
`);
}

// ─── Validate Command ───────────────────────────────────────────────

function runValidate() {
    const dir = getArg('--dir');
    if (!dir) { console.error('Error: --dir required'); process.exit(1); }

    const absDir = path.resolve(dir);
    if (!fs.existsSync(absDir)) { console.error(`Error: Directory not found: ${absDir}`); process.exit(1); }

    // Import the validator (compiled JS)
    let validateKBDirectory;
    try {
        const validatorPath = path.resolve(__dirname, '../../shared/engine/dist/kb/kb-validator.js');
        validateKBDirectory = require(validatorPath).validateKBDirectory;
    } catch {
        // Fallback: try direct TS require
        try {
            require('ts-node/register');
            validateKBDirectory = require('../../shared/kb/kb-validator').validateKBDirectory;
        } catch {
            console.error('Error: Cannot load validator. Run "npm run build:engine" first.');
            process.exit(1);
        }
    }

    console.log(`Validating KB at: ${absDir}`);
    const result = validateKBDirectory(absDir);

    console.log(`\nPatch: ${result.patch || 'unknown'}`);
    console.log(`Files checked: ${result.filesChecked}`);
    console.log(`Valid: ${result.valid ? '✅ YES' : '❌ NO'}`);

    if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        for (const err of result.errors) {
            console.log(`  ❌ ${err.file} ${err.field}: ${err.message}`);
        }
    }

    if (result.warnings.length > 0) {
        console.log(`\nWarnings (${result.warnings.length}):`);
        for (const warn of result.warnings) {
            console.log(`  ⚠️  ${warn.file} ${warn.field}: ${warn.message}`);
        }
    }

    process.exit(result.valid ? 0 : 1);
}

// ─── Diff Command ───────────────────────────────────────────────────

function runDiff() {
    const oldDir = getArg('--old');
    const newDir = getArg('--new');
    if (!oldDir || !newDir) { console.error('Error: --old and --new required'); process.exit(1); }

    const KB_FILES = ['champions.json', 'items.json', 'matchups.json', 'rune-templates.json',
        'build-templates.json', 'synergy-counters.json', 'weights.json'];

    console.log(`\nDiffing KB:`);
    console.log(`  Old: ${path.resolve(oldDir)}`);
    console.log(`  New: ${path.resolve(newDir)}`);
    console.log('');

    let totalChanges = 0;

    for (const file of KB_FILES) {
        const oldPath = path.join(oldDir, file);
        const newPath = path.join(newDir, file);

        const oldExists = fs.existsSync(oldPath);
        const newExists = fs.existsSync(newPath);

        if (!oldExists && newExists) {
            console.log(`  [NEW]    ${file}`);
            totalChanges++;
            continue;
        }
        if (oldExists && !newExists) {
            console.log(`  [DELETE] ${file}`);
            totalChanges++;
            continue;
        }
        if (!oldExists && !newExists) {
            console.log(`  [SKIP]   ${file} (missing in both)`);
            continue;
        }

        const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
        const newData = JSON.parse(fs.readFileSync(newPath, 'utf-8'));

        // Compare data keys
        const oldKeys = Object.keys(oldData.data || {});
        const newKeys = Object.keys(newData.data || {});
        const added = newKeys.filter(k => !oldKeys.includes(k));
        const removed = oldKeys.filter(k => !newKeys.includes(k));
        const modified = oldKeys.filter(k => newKeys.includes(k) &&
            JSON.stringify(oldData.data[k]) !== JSON.stringify(newData.data[k]));

        if (added.length === 0 && removed.length === 0 && modified.length === 0 &&
            oldData.meta?.patch === newData.meta?.patch) {
            console.log(`  [SAME]   ${file}`);
        } else {
            console.log(`  [CHANGE] ${file}: +${added.length} -${removed.length} ~${modified.length}`);
            if (oldData.meta?.patch !== newData.meta?.patch) {
                console.log(`           Patch: ${oldData.meta?.patch} → ${newData.meta?.patch}`);
            }
            if (added.length > 0) console.log(`           Added: ${added.join(', ')}`);
            if (removed.length > 0) console.log(`           Removed: ${removed.join(', ')}`);
            if (modified.length > 0 && modified.length <= 10) console.log(`           Modified: ${modified.join(', ')}`);
            totalChanges++;
        }
    }

    console.log(`\nTotal files changed: ${totalChanges}/${KB_FILES.length}`);
}

// ─── Rollback Command ───────────────────────────────────────────────

function runRollback() {
    const targetPatch = getArg('--to');
    const dataDir = getArg('--data') || path.resolve(__dirname, '../../shared/kb/data');
    if (!targetPatch) { console.error('Error: --to required'); process.exit(1); }

    const archiveDir = path.resolve(dataDir, '../archive', targetPatch);
    if (!fs.existsSync(archiveDir)) {
        console.error(`Error: No archive for patch ${targetPatch} at ${archiveDir}`);
        // List available archives
        const archiveBase = path.resolve(dataDir, '../archive');
        if (fs.existsSync(archiveBase)) {
            const patches = fs.readdirSync(archiveBase).filter(f =>
                fs.statSync(path.join(archiveBase, f)).isDirectory());
            console.log(`Available patches: ${patches.join(', ') || '(none)'}`);
        }
        process.exit(1);
    }

    console.log(`Rolling back to patch ${targetPatch}...`);
    const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
        fs.copyFileSync(path.join(archiveDir, file), path.join(dataDir, file));
        console.log(`  Restored: ${file}`);
    }
    console.log(`\n✅ Rolled back ${files.length} files to patch ${targetPatch}`);
}

// ─── Generate Command (Stub) ────────────────────────────────────────

function runGenerate() {
    // Top-level async IIFE for the command
    (async () => {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const { SYSTEM_PROMPT, RESPONSE_SCHEMA } = require('./prompts');
        const { execSync } = require('child_process');
        require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

        const patch = getArg('--patch');
        const notesFile = getArg('--notes');
        const model = getArg('--model');

        if (!patch || !notesFile) {
            console.error('Error: --patch and --notes required');
            process.exit(1);
        }

        const absNotesFile = path.resolve(notesFile);
        if (!fs.existsSync(absNotesFile)) {
            console.error(`Error: Patch notes file not found: ${absNotesFile}`);
            process.exit(1);
        }

        const notes = fs.readFileSync(absNotesFile, 'utf-8');
        console.log(`\n======================================`);
        console.log(`🤖 DraftCoach V2 AI Meta Builder 🤖`);
        console.log(`======================================`);
        console.log(`Target Patch: ${patch}`);
        console.log(`Notes File  : ${notesFile} (${notes.length} bytes)`);
        console.log(`Model       : ${model || 'gemini-2.5-flash'}`);

        if (!process.env.GEMINI_API_KEY) {
            console.error('\nERROR: GEMINI_API_KEY environment variable is missing.');
            console.error('Create a .env file in the root directory with your API key.');
            process.exit(1);
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const aiModel = genAI.getGenerativeModel({
            model: model || 'gemini-2.5-flash',
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
                temperature: 0.1
            }
        });

        console.log('\n[1/4] Analyzing Patch Notes via Gemini API...');
        try {
            const result = await aiModel.generateContent(notes);
            const jsonText = result.response.text();
            const aiDiff = JSON.parse(jsonText);

            console.log(`  ✅ Successfully parsed notes! Found changes for ${aiDiff.champion_updates.length} champions.`);

            // Output diff for review
            const diffFile = path.resolve(__dirname, `../../patch-${patch}-diff.json`);
            fs.writeFileSync(diffFile, JSON.stringify(aiDiff, null, 2));
            console.log(`  📝 Saved AI diff to ${diffFile}`);

            console.log('\n[2/4] Applying AI Diff to champions.json...');
            const champsFile = path.resolve(__dirname, '../../shared/kb/data/champions.json');
            const champsData = JSON.parse(fs.readFileSync(champsFile, 'utf-8'));

            let tagsUpdated = 0;
            for (const update of aiDiff.champion_updates) {
                const champId = update.champion_id;
                if (champsData.data[champId]) {
                    for (const [tag, val] of Object.entries(update.tag_updates)) {
                        champsData.data[champId].tags[tag] = val;
                        tagsUpdated++;
                    }
                    console.log(`  → Updated ${champId}: ${update.reason}`);
                } else {
                    console.log(`  ⚠️ Warning: AI suggested updates for unknown champion '${champId}'`);
                }
            }

            // Update Meta
            champsData.meta.patch = patch;
            champsData.meta.buildHash = `kb-ai-${Date.now()}`;
            champsData.meta.source = `ai-meta-builder-${model || 'gemini-2.5-flash'}`;
            fs.writeFileSync(champsFile, JSON.stringify(champsData, null, 4));
            console.log(`  ✅ Successfully applied ${tagsUpdated} tag updates.\n`);

            console.log('[3/4] Running Deterministic Cascade Scripts...');
            console.log('  → Re-calculating Build Templates...');
            execSync('node tools/generate-builds.js', { stdio: 'inherit', cwd: path.resolve(__dirname, '../../') });
            console.log('  → Re-calculating Matchups & Synergies...');
            execSync('node tools/generate-matchups.js', { stdio: 'inherit', cwd: path.resolve(__dirname, '../../') });

            // Sync meta.patch and buildHash across ALL files before validation
            console.log('  → Syncing meta.patch across all KB files...');
            const kbDir = path.resolve(__dirname, '../../shared/kb/data');
            const kbFiles = fs.readdirSync(kbDir).filter(f => f.endsWith('.json'));
            for (const file of kbFiles) {
                const filePath = path.join(kbDir, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                if (data.meta) {
                    data.meta.patch = patch;
                    data.meta.buildHash = champsData.meta.buildHash;
                    data.meta.source = file === 'champions.json' ? champsData.meta.source : 'cascade-generator';
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
                }
            }

            console.log('\n[4/4] Validation...');
            execSync(`node tools/meta-builder/cli.js validate --dir shared/kb/data`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../../') });

            console.log('\n🎉 V2 Generation Complete: The engine is ready with the new meta data! 🎉');

        } catch (err) {
            console.error('\n❌ Generation Pipeline Failed:');
            console.error(err);
            process.exit(1);
        }
    })();
}

// ─── Main Router ────────────────────────────────────────────────────

switch (command) {
    case 'validate':
        runValidate();
        break;
    case 'diff':
        runDiff();
        break;
    case 'rollback':
        runRollback();
        break;
    case 'generate':
        runGenerate();
        break;
    default:
        printUsage();
        process.exit(command ? 1 : 0);
}
