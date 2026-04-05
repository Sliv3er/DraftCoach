import dotenv from 'dotenv';
import path from 'path';
import { generateBuildStream } from './apps/backend/src/services/gemini';
import { BuildRequest } from './shared/types';
import { performance } from 'perf_hooks';

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

async function runTest() {
    const req: BuildRequest = {
        myChampion: 'Ahri',
        role: 'mid',
        allies: ['Amumu', 'Malphite', 'Jhin', 'Nami'],
        enemies: ['Zed', 'Lee Sin', 'Darius', 'Vayne', 'Lulu'],
        patch: '26.4',
        model: 'gemini-3.1-pro-preview' as any // Assuming 3.1 is defined
    };

    console.log('--- STARTING STREAM TEST ---');
    console.log('Scenario: Ahri Mid vs Zed');
    console.log('Allies:', req.allies.join(', '));
    console.log('Enemies:', req.enemies.join(', '));

    const startTime = performance.now();
    let firstChunkTime = 0;

    try {
        const { stream } = await generateBuildStream(req, false);

        let fullText = '';
        console.log('\n--- STREAM OUTPUT ---');
        for await (const chunk of stream) {
            if (firstChunkTime === 0) {
                firstChunkTime = performance.now() - startTime;
                console.log(`[Time to first token: ${(firstChunkTime / 1000).toFixed(2)}s]`);
            }
            const text = chunk.text();
            fullText += text;
            process.stdout.write(text);
        }

        const totalTime = performance.now() - startTime;
        console.log('\n\n--- TEST RESULTS ---');
        console.log(`Total generation time: ${(totalTime / 1000).toFixed(2)}s`);

        // Auto-evaluate accuracy
        console.log('\n--- ACCURACY CHECK ---');
        const requiredSections = ['WIN CONDITION', 'ENEMY THREATS', 'DRAFT STRATEGY', 'RUNES', 'SUMMONERS', 'SKILL ORDER', 'STARTING ITEMS', 'CORE BUILD', 'SITUATIONAL ITEMS'];
        let allSectionsPresent = true;
        for (const section of requiredSections) {
            if (!fullText.includes(section)) {
                console.log(`❌ Missing section: ${section}`);
                allSectionsPresent = false;
            } else {
                console.log(`✅ Section found: ${section}`);
            }
        }

        if (allSectionsPresent) {
            console.log('Status: PASSED (All goal-oriented sections present)');
        } else {
            console.log('Status: FAILED (Missing required sections)');
        }

    } catch (err) {
        console.error('Test failed with error:', err);
    }
}

runTest();
