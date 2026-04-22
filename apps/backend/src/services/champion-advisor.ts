
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchDDragonVersion, fetchDDragonData, getItemIconUrl, getRuneIconUrl } from './ddragon';
import ChampionDetail from '../models/ChampionDetail';

export async function getChampionDetails(championId: string) {
  const livePatch = await fetchDDragonVersion();
  const patchDisplay = livePatch.split('.').slice(0, 2).join('.');

  // 1. Check Cache first
  try {
    const cached = await ChampionDetail.findOne({ 
      championId: { $regex: new RegExp(`^${championId}$`, 'i') }, 
      patch: patchDisplay 
    });
    
    if (cached) {
      console.log(`[ChampionAdvisor] Cache hit for ${championId} on patch ${patchDisplay}`);
      // Even if cached, we might want to ensure icons are there if we just updated the logic
      // But for now, we'll just return it.
      return cached;
    }
  } catch (err) {
    console.error('[ChampionAdvisor] Cache lookup failed:', err);
  }

  // 2. If not cached, generate with Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  console.log(`[ChampionAdvisor] Cache miss for ${championId}. Generating fresh intel for patch ${patchDisplay}...`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-pro-preview',
    systemInstruction: `You are a League of Legends Analytics Engine. 
    Provide current, accurate data for the requested champion in Patch ${patchDisplay}.
    Use Google Search to find the latest winrates and best builds from reputable sources (u.gg, op.gg, lolalytics).
    
    Output exactly in this JSON format:
    {
      "championId": "${championId}",
      "winRate": "51.2%",
      "tier": "S+",
      "pickRate": "8.5%",
      "roles": {
        "top": {
          "winRate": "50.1%",
          "runes": {
            "primary": "Precision",
            "keystone": "Conqueror",
            "runes": ["Triumph", "Legend: Alacrity", "Last Stand"],
            "secondary": "Inspiration",
            "secondaryRunes": ["Magical Footwear", "Cosmic Insight"]
          },
          "items": {
            "starting": ["Doran's Blade", "Health Potion"],
            "core": ["Trinity Force", "Plated Steelcaps", "Sundered Sky"],
            "situational": ["Hullbreaker", "Sterak's Gage", "Guardian Angel"]
          }
        }
      },
      "summary": "Champion summary and current meta state"
    }`,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    },
    tools: [{ googleSearch: {} } as any],
  });

  const prompt = `Provide current analytics for ${championId} in League of Legends Patch ${patchDisplay}. Include winrates, tier, and best builds for ALL viable roles (top, jungle, mid, bottom, support).`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const data = JSON.parse(response.text());

  // 3. Enrich with DDragon Icons
  try {
    const { items, runes } = await fetchDDragonData(livePatch);
    
    // Create lookup maps
    const itemMap = new Map();
    Object.entries(items).forEach(([id, item]: [string, any]) => {
      itemMap.set(item.name.toLowerCase(), id);
    });

    const runeMap = new Map();
    runes.forEach((tree: any) => {
      runeMap.set(tree.name.toLowerCase(), getRuneIconUrl(tree.icon));
      tree.slots.forEach((slot: any) => {
        slot.runes.forEach((rune: any) => {
          runeMap.set(rune.name.toLowerCase(), getRuneIconUrl(rune.icon));
        });
      });
    });

    // Enrich roles
    for (const role in data.roles) {
      const r = data.roles[role];
      
      // Items
      if (r.items) {
        r.items.startingIcons = r.items.starting.map((name: string) => {
          const id = itemMap.get(name.toLowerCase());
          return id ? getItemIconUrl(livePatch, id) : null;
        });
        r.items.coreIcons = r.items.core.map((name: string) => {
          const id = itemMap.get(name.toLowerCase());
          return id ? getItemIconUrl(livePatch, id) : null;
        });
        r.items.situationalIcons = r.items.situational.map((name: string) => {
          const id = itemMap.get(name.toLowerCase());
          return id ? getItemIconUrl(livePatch, id) : null;
        });
      }

      // Runes
      if (r.runes) {
        r.runes.keystoneIcon = runeMap.get(r.runes.keystone.toLowerCase());
        r.runes.primaryIcon = runeMap.get(r.runes.primary.toLowerCase());
        r.runes.secondaryIcon = runeMap.get(r.runes.secondary.toLowerCase());
        r.runes.runeIcons = r.runes.runes.map((name: string) => runeMap.get(name.toLowerCase()));
        r.runes.secondaryRuneIcons = r.runes.secondaryRunes.map((name: string) => runeMap.get(name.toLowerCase()));
      }
    }
  } catch (err) {
    console.error('[ChampionAdvisor] Enrichment failed:', err);
  }

  // 4. Save to Cache
  try {
    await ChampionDetail.findOneAndUpdate(
      { championId: data.championId, patch: patchDisplay },
      { ...data, patch: patchDisplay, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
    console.log(`[ChampionAdvisor] Cached fresh intel for ${championId}`);
  } catch (err) {
    console.error('[ChampionAdvisor] Failed to save to cache:', err);
  }

  return data;
}

