const path = require('path');
const { getKB } = require('./shared/engine/dist/kb/kb-loader');
const { buildDraftFromUI, recommend } = require('./shared/engine/dist/engine/engine');

const kbPath = path.resolve(__dirname, 'shared/kb/data');
const kb = getKB(kbPath);

console.log("=== RAW JSON DATA ===");
console.log(kb.getBuildTemplate('Darius', 'JUNGLE').variants.DAMAGE.coreItems);

const draft = buildDraftFromUI('Darius', 'JUNGLE', [], []);
const rec = recommend(draft);

if (rec) {
    console.log("=== PRIMARY BUILD ===");
    console.log("Summoner Spells:", rec.primary.summonerSpells);
    console.log("Starters:", rec.primary.startingItems.map(i => i.name));
    console.log("Core:", rec.primary.coreItems.map(i => i.name));
} else {
    console.log("No recommendation returned.");
}


