"use server";

import { 
  getRecentMatchIds, 
  getMatchDetails, 
  Match, 
  getChallengerLeague, 
  getGrandmasterLeague, 
  getMasterLeague,
  getLeagueEntriesByTier,
  getAccountByRiotId,
  uIRegionToPlatform, 
  LeagueItem 
} from "@/lib/riot";

export async function fetchMoreMatches(
  puuid: string, 
  routingRegion: string, 
  start: number, 
  count: number = 10
): Promise<Match[]> {
  try {
    const matchIds = await getRecentMatchIds(puuid, routingRegion, count, start);
    
    if (!matchIds || matchIds.length === 0) return [];

    const matchDetails = await Promise.all(
      matchIds.map(id => getMatchDetails(id, routingRegion))
    );

    return matchDetails;
  } catch (error) {
    console.error("Error fetching more matches:", error);
    return [];
  }
}

export interface SearchResult {
  name: string;
  tag?: string;
  lp: number;
  rank: string;
}

export async function searchElitePlayers(
  query: string,
  region: string
): Promise<SearchResult[]> {
  if (!query || query.length < 1) return [];

  const platform = uIRegionToPlatform[region] || "na1";
  const results: SearchResult[] = [];
  const normalizedQuery = query.trim().toLowerCase();

  // 1. Check for Exact Riot ID Match (e.g. Name#Tag) or attempt a Regional Guess
  let targetName = "";
  let targetTag = "";

  if (query.includes('#')) {
    const parts = query.split('#');
    targetName = parts[0];
    targetTag = parts[1];
  } else if (normalizedQuery.length >= 3) {
    // If no # is provided, we try to "Best Guess" based on the current region node
    // This allows searching for any random player without knowing their tag
    targetName = query.trim();
    const regionTags: Record<string, string> = {
      'NA': 'NA1',
      'EUW': 'EUW',
      'KR': 'KR1',
      'EUNE': 'EUNE'
    };
    targetTag = regionTags[region] || 'NA1';
  }

  if (targetName && targetTag) {
    try {
      const routing = region === 'KR' ? 'asia' : (region === 'NA' ? 'americas' : 'europe');
      const account = await getAccountByRiotId(targetName, targetTag, routing);
      
      if (account) {
        results.push({
          name: `${account.gameName}#${account.tagLine}`,
          lp: 0,
          rank: 'Verified Subject',
          tag: account.tagLine
        });
      }
    } catch (e) {
      // Fail silently for guesses
    }
  }

  // 2. Search Ranked High-Elo Index (Challenger down to Platinum I)
  try {
    // Fetch Challenger, GM, Master, and top divisions in parallel
    const [challenger, gm, masters, diamond, emerald, platinum] = await Promise.allSettled([
      getChallengerLeague(platform),
      getGrandmasterLeague(platform),
      getMasterLeague(platform),
      getLeagueEntriesByTier(platform, 'DIAMOND', 'I'),
      getLeagueEntriesByTier(platform, 'EMERALD', 'I'),
      getLeagueEntriesByTier(platform, 'PLATINUM', 'I')
    ]);
    
    const allEntries: LeagueItem[] = [];
    if (challenger.status === 'fulfilled') allEntries.push(...challenger.value.entries);
    if (gm.status === 'fulfilled') allEntries.push(...gm.value.entries);
    if (masters.status === 'fulfilled') allEntries.push(...masters.value.entries);
    if (diamond.status === 'fulfilled') allEntries.push(...diamond.value);
    if (emerald.status === 'fulfilled') allEntries.push(...emerald.value);
    if (platinum.status === 'fulfilled') allEntries.push(...platinum.value);

    if (allEntries.length > 0) {
      const normalizedQuery = query.toLowerCase();
      
      const filtered = allEntries
        .filter((entry: LeagueItem) => {
          if (!entry.summonerName) return false;
          const name = entry.summonerName.toLowerCase();
          return name.includes(normalizedQuery);
        })
        .sort((a, b) => (b.leaguePoints || 0) - (a.leaguePoints || 0))
        .slice(0, 15); // Show more results to increase discovery

      filtered.forEach(entry => {
        // Prevent duplicates
        if (!results.some(r => r.name.toLowerCase() === entry.summonerName?.toLowerCase())) {
          // Identify rank for display
          let displayRank = 'Challenger';
          if ('tier' in entry && entry.tier) {
            displayRank = `${entry.tier} ${entry.rank || ''}`.trim();
          } else {
             // Master+ leagues in Riot API don't return 'tier' in the entry itself
             // but we can infer them from the objects if we separate the results
             displayRank = entry.rank === 'I' ? 'Master' : (entry.rank === 'GM' ? 'Grandmaster' : 'Challenger');
          }
          
          results.push({
            name: entry.summonerName!,
            lp: entry.leaguePoints || 0,
            rank: displayRank
          });
        }
      });
    }
  } catch (error) {
    console.error("Apex pool search error:", error);
  }

  return results.slice(0, 5); // Return top 5 most relevant
}
