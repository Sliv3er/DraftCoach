import fetch from 'node-fetch';

let cachedVersion: string | null = null;
let versionFetchedAt = 0;
const VERSION_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchDDragonVersion(): Promise<string> {
  if (process.env.MOCK_LIVE_PATCH) {
    return process.env.MOCK_LIVE_PATCH;
  }

  if (cachedVersion && Date.now() - versionFetchedAt < VERSION_TTL) {
    return cachedVersion;
  }
  const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  if (!res.ok) throw new Error(`DDragon versions fetch failed: ${res.status}`);
  const versions: string[] = await res.json() as string[];
  cachedVersion = versions[0];
  versionFetchedAt = Date.now();
  return cachedVersion;
}

let cachedItems: any = null;
let cachedRunes: any = null;
let dataFetchedAt = 0;
const DATA_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchDDragonData(version: string) {
  if (cachedItems && cachedRunes && Date.now() - dataFetchedAt < DATA_TTL) {
    return { items: cachedItems, runes: cachedRunes };
  }

  console.log(`[DDragon] Fetching data for version ${version}...`);
  
  const [itemsRes, runesRes] = await Promise.all([
    fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`),
    fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`)
  ]);

  if (!itemsRes.ok || !runesRes.ok) throw new Error('Failed to fetch DDragon data');

  const itemsJson: any = await itemsRes.json();
  const runesJson: any = await runesRes.json();

  cachedItems = itemsJson.data;
  cachedRunes = runesJson;
  dataFetchedAt = Date.now();

  return { items: cachedItems, runes: cachedRunes };
}

export function getItemIconUrl(version: string, itemId: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

export function getRuneIconUrl(iconPath: string) {
  return `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`;
}
