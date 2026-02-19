import fetch from 'node-fetch';

let cachedVersion: string | null = null;
let versionFetchedAt = 0;
const VERSION_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchDDragonVersion(): Promise<string> {
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
