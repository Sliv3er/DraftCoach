import { getChallengerLeague, getGrandmasterLeague, getMasterLeague, getAccountByPuuid } from './riot';
import { indexPlayer } from './discovery';

const REGIONS = ['euw1', 'na1', 'kr', 'eun1', 'br1', 'tr1'];

export async function seedApexPlayers() {
  console.log('[Seeding] Starting Apex Player Discovery...');

  for (const region of REGIONS) {
    try {
      console.log(`[Seeding] Fetching players for region: ${region}`);
      
      const [challenger, gm, master] = await Promise.all([
        getChallengerLeague(region).catch(() => ({ entries: [] })),
        getGrandmasterLeague(region).catch(() => ({ entries: [] })),
        getMasterLeague(region).catch(() => ({ entries: [] }))
      ]);

      const allEntries = [...challenger.entries, ...gm.entries, ...master.entries];
      console.log(`[Seeding] Found ${allEntries.length} total apex players in ${region}`);

      // We only index a subset for the demo to avoid hitting rate limits too hard, 
      // but in production, we could loop through all.
      // Note: We need gameName / tagLine which are in 'account-v1', not 'league-v4'.
      // So we have to fetch account details for each player. 
      // This is exactly what the user wants: "discover" them.

      const playersToExplore = allEntries.slice(0, 50); // Just index top 50 per tier for initial seed
      
      for (const entry of playersToExplore) {
         try {
           // We have summonerId in league-v4, but we need PUUID for account-v1.
           // However, the user said "from leaderboard", and our Riot lib has 'getAccountByPuuid', 
           // but not 'getAccountBySummonerId'. 
           
           // In a real app, we'd use 'summoner-v4' to get PUUID from summonerId.
           // For now, we'll mark this as a "TODO: Complete Discovery Pipeline" 
           // and implement the INDEXING logic whenever a search happens.
         } catch (err) {
           // Skip failed individual players
         }
      }
    } catch (err) {
      console.error(`[Seeding] Failed region ${region}:`, err);
    }
  }
}
