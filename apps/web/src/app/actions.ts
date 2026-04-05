"use server";

import { getRecentMatchIds, getMatchDetails, Match } from "@/lib/riot";

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
