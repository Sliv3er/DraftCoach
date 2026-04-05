const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const dataDir = path.resolve(__dirname, '../../shared/kb/data');
const champsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'champions.json'), 'utf-8'));
const itemsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'items.json'), 'utf-8'));

const buildPath = path.join(dataDir, 'build-templates.json');
const matchupsPath = path.join(dataDir, 'matchups.json');

const currentBuilds = JSON.parse(fs.readFileSync(buildPath, 'utf-8'));
const currentMatchups = JSON.parse(fs.readFileSync(matchupsPath, 'utf-8'));

const SYSTEM_PROMPT = `
You are the DraftCoach Meta Analyzer, a League of Legends analyst with 3.1 Pro continuous grounding.
Your job is to generate purely optimal, situationally aware, pro-tier meta data for our Knowledge Base.
You must output strictly typed JSON according to the requested schema.

Guidelines for Builds:
1. All core builds MUST be complete 5-item paths (excluding boots).
2. Summoner spells MUST accurately reflect the role.
3. Reason fields must explain WHY the item is good in professional play.
4. Item IDs must be valid based on standard League of Legends knowledge (e.g. 3089 = Rabadon, 3047 = Plated Steelcaps).

Guidelines for Matchups:
1. Provide highly specific, actionable, mechanical advice.
2. Avoid generic advice like "Poke them" or "Play safe".
3. Mention specific ability interactions and cooldown punishing.
`;

const BATCH_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        builds: {
            type: SchemaType.ARRAY,
            description: "Array of build objects for the requested champions and roles",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    championId: { type: SchemaType.STRING },
                    role: { type: SchemaType.STRING },
                    variants: {
                        type: SchemaType.OBJECT,
                        properties: {
                            DAMAGE: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    summonerSpells: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                                    skillOrder: {
                                        type: SchemaType.OBJECT,
                                        properties: {
                                            first3: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                                            maxOrder: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
                                        }
                                    },
                                    startingItems: {
                                        type: SchemaType.ARRAY,
                                        items: {
                                            type: SchemaType.OBJECT,
                                            properties: { id: { type: SchemaType.STRING }, name: { type: SchemaType.STRING } }
                                        }
                                    },
                                    coreItems: {
                                        type: SchemaType.ARRAY,
                                        items: {
                                            type: SchemaType.OBJECT,
                                            properties: { id: { type: SchemaType.STRING }, name: { type: SchemaType.STRING }, reason: { type: SchemaType.STRING } }
                                        }
                                    },
                                    bootChoice: {
                                        type: SchemaType.OBJECT,
                                        properties: { id: { type: SchemaType.STRING }, name: { type: SchemaType.STRING } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        matchups: {
            type: SchemaType.ARRAY,
            description: "Array of matchup tip objects",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    championId: { type: SchemaType.STRING },
                    enemyId: { type: SchemaType.STRING },
                    role: { type: SchemaType.STRING },
                    score: { type: SchemaType.INTEGER },
                    earlyGame: { type: SchemaType.STRING },
                    tip: { type: SchemaType.STRING }
                }
            }
        }
    }
};

async function runDeepGen() {
    if (!process.env.GEMINI_API_KEY) {
        console.error("Missing GEMINI_API_KEY");
        process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Target champions to replace in the DB this run
    const targets = process.argv.slice(2);
    if (targets.length === 0) {
        console.log("Please provide champion IDs to generate (e.g. node deep-gen.js Darius Shen)");
        process.exit(1);
    }

    console.log(`🤖 Deep Generating AI data for: ${targets.join(', ')}`);

    const prompt = `
        System: ${SYSTEM_PROMPT}
        
        Task: Provide full AI-generated Builds and Matchups for the requested champions.
        
        Target Champions: ${targets.join(', ')}
        
        For BUILDS:
        Generate 1 primary DAMAGE build for EACH target champion in their primary role.
        
        For MATCHUPS:
        Generate highly specific matchup advice for every combination of the requested Target Champions against each other.
        If there are 2 targets (A, B), generate A vs B and B vs A.
    `;

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: BATCH_SCHEMA }
        });

        const output = JSON.parse(result.response.text());

        // Merge Builds
        for (const b of output.builds) {
            const key = b.role === champsData.data[b.championId]?.roles[0]
                ? b.championId
                : `${b.championId}_${b.role}`;

            if (currentBuilds.data[key]) {
                currentBuilds.data[key].variants.DAMAGE = b.variants.DAMAGE;
                console.log(`✅ Merged True AI Build for ${key}`);
            }
        }

        // Merge Matchups
        for (const m of output.matchups) {
            const key = `${m.championId}_vs_${m.enemyId}_${m.role}`;
            if (currentMatchups.data[key]) {
                currentMatchups.data[key].score = m.score;
                currentMatchups.data[key].earlyGame = m.earlyGame;
                currentMatchups.data[key].tip = m.tip;
                console.log(`✅ Merged True AI Matchup for ${m.championId} vs ${m.enemyId} (${m.role})`);
            } else {
                currentMatchups.data[key] = m;
                console.log(`✅ Inserted True AI Matchup for ${m.championId} vs ${m.enemyId} (${m.role})`);
            }
        }

        // Save back to disk
        fs.writeFileSync(buildPath, JSON.stringify(currentBuilds, null, 2));
        fs.writeFileSync(matchupsPath, JSON.stringify(currentMatchups, null, 2));

        console.log("\nSuccess: Knowledge Base updated with pure LLM data.");

    } catch (e) {
        console.error("Generation failed", e);
    }
}

runDeepGen();
