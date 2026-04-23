import esClient from './elasticsearch';
import Player from '../models/Player';

export async function indexPlayer(playerData: {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  rank?: string;
  lp?: number;
}) {
  const { puuid, gameName, tagLine, region, rank, lp } = playerData;

  // 1. Update/Create in MongoDB (Transactional Source of Truth)
  const player = await Player.findOneAndUpdate(
    { puuid },
    { 
      gameName, 
      tagLine, 
      region, 
      rank: rank || 'Unranked', 
      lp: lp || 0,
      lastSeen: new Date()
    },
    { upsert: true, new: true }
  );

  // 2. Index in Elasticsearch (Search Engine)
  // v8: body is replaced by top-level properties. 'id' and 'document' are used for index.
  try {
    await esClient.index({
      index: 'players',
      id: puuid,
      document: {
        gameName,
        tagLine,
        puuid,
        region,
        rank: rank || 'Unranked',
        lp: lp || 0,
        lastSeen: new Date().toISOString(),
      },
      refresh: true, 
    });
  } catch (err) {
    console.error('[Elasticsearch] Index error:', err);
  }

  return player;
}

export async function searchPlayers(query: string, region?: string) {
  const should: any[] = [
    // Exact name match (boosted)
    {
      term: {
        'gameName.keyword': {
          value: query,
          boost: 5,
        },
      },
    },
    // Prefix match
    {
      match_phrase_prefix: {
        gameName: {
          query,
          max_expansions: 50,
        },
      },
    },
  ];

  const filter: any[] = [];
  if (region) {
    filter.push({ term: { region: region.toLowerCase() } });
  }

  try {
    const result = await esClient.search({
      index: 'players',
      query: {
        bool: {
          should,
          minimum_should_match: 1,
          filter,
        },
      },
      size: 20,
    });

    return result.hits.hits.map((hit: any) => hit._source);
  } catch (err) {
    console.error('[Elasticsearch] Search failed:', err);
    return [];
  }
}

/**
 * Indexes all participants from a match for discovery.
 */
export async function indexMatchParticipants(matchData: any, region: string) {
  try {
    const participants = matchData.info.participants.map((p: any) => ({
      puuid: p.puuid,
      gameName: p.riotIdGameName || p.summonerName,
      tagLine: p.riotIdTagline || 'Unknown',
      region: region,
      rank: 'Elite', // We can update this when we fetch league data
      lp: 0
    }));

    // Batch index to MongoDB/Elasticsearch
    await Promise.all(participants.map((p: any) => indexPlayer(p)));
    console.log(`[Discovery] Indexed ${participants.length} subjects from match ${matchData.metadata.matchId}`);
  } catch (err: any) {
    console.error('[Discovery] Match participants indexing failed:', err.message);
  }
}
