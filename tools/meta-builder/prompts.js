const { SchemaType } = require('@google/generative-ai');

const SYSTEM_PROMPT = `
You are the DraftCoach Meta Analyzer, an expert League of Legends data analyst.
Your job is to read official League of Legends Patch Notes and translate the champion changes into our numerical "Champion Tag" system.

Our tagging system uses 0-100 scores to define what a champion does in the game:
- engage: Ability to start a fight (e.g. Malphite R = 85)
- peel: Ability to protect allies from dive (e.g. Janna R = 90)
- frontline: Tankiness and willingness to absorb damage (e.g. Sion = 85)
- burst: Frontend loaded damage (e.g. Zed = 95)
- sustained: Continuous DPS over time (e.g. Jinx = 90)
- poke: Ranged safe damage (e.g. Xerath = 90)
- healShield: Ability to heal/shield allies (e.g. Soraka = 90)
- splitpush: Ability to threaten sidelanes alone (e.g. Tryndamere = 95)

When given patch notes, you must:
1. Identify every champion that was changed.
2. Provide a 1-sentence reason for how their playstyle shifts.
3. Output the SPECIFIC tag values that need to be adjusted (e.g., if burst goes up by 10, output the new absolute value).
4. If a tag is unaffected, DO NOT include it in the object (we will merge your diff with the base values).

Output strictly according to the required JSON schema.
`;

const RESPONSE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        patch_version: { type: SchemaType.STRING, description: "The patch version being analyzed (e.g. '14.6')" },
        champion_updates: {
            type: SchemaType.ARRAY,
            description: "List of champions whose tags were altered by the patch",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    champion_id: { type: SchemaType.STRING, description: "The strict English PascalCase ID of the champion (e.g., 'MissFortune', 'AurelionSol')" },
                    reason: { type: SchemaType.STRING, description: "1-sentence summary of why their tags shifted" },
                    tag_updates: {
                        type: SchemaType.OBJECT,
                        description: "Only include the tags that actually changed. Values must be 0-100 integers.",
                        properties: {
                            engage: { type: SchemaType.INTEGER },
                            peel: { type: SchemaType.INTEGER },
                            frontline: { type: SchemaType.INTEGER },
                            burst: { type: SchemaType.INTEGER },
                            sustained: { type: SchemaType.INTEGER },
                            poke: { type: SchemaType.INTEGER },
                            healShield: { type: SchemaType.INTEGER },
                            splitpush: { type: SchemaType.INTEGER }
                        }
                    }
                },
                required: ["champion_id", "reason", "tag_updates"]
            }
        }
    },
    required: ["patch_version", "champion_updates"]
};

module.exports = {
    SYSTEM_PROMPT,
    RESPONSE_SCHEMA
};
