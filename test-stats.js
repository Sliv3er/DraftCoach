// Test Stats Window - fetchMyStats flow
// Summoner: EL Zeni#vbn (EUW)

const fetch = require('node-fetch');

const RIOT_API_KEY = process.env.RIOT_API_KEY || '';
const REGION = 'euw1';
const REGION_V5 = 'europe';
const SUMMONER_NAME = 'EL Zeni';
const TAG = 'vbn';

async function riotGet(url) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': RIOT_API_KEY },
    timeout: 8000,
  });
  if (res.status === 429) {
    console.log('[RATE LIMITED] Waiting 2s...');
    await new Promise(r => setTimeout(r, 2000));
    return riotGet(url);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function test() {
  console.log('=== Testing Stats Window Flow ===\n');

  // Step 1: Get PUUID
  console.log(`[1] Getting account for ${SUMMONER_NAME}#${TAG}...`);
  const account = await riotGet(
    `https://${REGION_V5}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(SUMMONER_NAME)}/${encodeURIComponent(TAG)}`
  );
  console.log(`    PUUID: ${account.puuid.slice(0, 20)}...`);
  console.log(`    Game Name: ${account.gameName}#${account.tagLine}`);

  // Step 2: Get summoner data
  console.log(`\n[2] Getting summoner data...`);
  const summoner = await riotGet(`https://${REGION}.api.riotgames.com/lol-summoner/v4/summoners/by-puuid/${account.puuid}`);
  console.log(`    Level: ${summoner.summonerLevel}`);
  console.log(`    Icon ID: ${summoner.profileIconId}`);

  // Step 3: Get ranked data
  console.log(`\n[3] Getting ranked data...`);
  const rankedData = await riotGet(`https://${REGION}.api.riotgames.com/lol-league/v4/entries/by-summoner/${summoner.id}`);
  const soloQ = rankedData.find(r => r.queueType === 'RANKED_SOLO_5x5');
  if (soloQ) {
    console.log(`    Rank: ${soloQ.tier} ${soloQ.rank} (${soloQ.leaguePoints} LP)`);
    console.log(`    W/L: ${soloQ.wins}W ${soloQ.losses}L (${Math.round(soloQ.wins / (soloQ.wins + soloQ.losses) * 100)}% WR)`);
  } else {
    console.log('    No Solo/Duo rank found');
    console.log('    All queues:', rankedData.map(r => r.queueType).join(', ') || 'None');
  }

  // Step 4: Get match IDs
  console.log(`\n[4] Getting last 5 match IDs...`);
  const matchIds = await riotGet(
    `https://${REGION_V5}.api.riotgames.com/lol-match/v5/matches/by-puuid/${account.puuid}/ids?start=0&count=5`
  );
  console.log(`    Found ${matchIds.length} matches: ${matchIds.join(', ')}`);

  // Step 5: Fetch all 5 matches
  if (matchIds.length > 0) {
    console.log(`\n[5] Fetching match details...`);
    for (let idx = 0; idx < matchIds.length; idx++) {
      const match = await riotGet(`https://${REGION_V5}.api.riotgames.com/lol-match/v5/matches/${matchIds[idx]}`);
      const info = match.info;
      const me = info.participants.find(p => p.puuid === account.puuid);
      if (me) {
        const dur = info.gameDuration;
        const durMin = dur / 60;
        const allDpm = info.participants.map(p => p.totalDamageDealtToChampions / durMin);
        const avgDpm = allDpm.reduce((a, b) => a + b, 0) / allDpm.length;

        console.log(`  [${idx+1}] ${me.championName} ${me.win ? 'W' : 'L'} ${me.kills}/${me.deaths}/${me.assists} | ${((me.totalMinionsKilled + (me.neutralMinionsKilled||0))/durMin).toFixed(1)} cs/m | ${Math.round(me.totalDamageDealtToChampions/durMin)} DPM (avg ${Math.round(avgDpm)}) | vis ${me.visionScore} | ${Math.floor(dur/60)}:${(dur%60).toString().padStart(2,'0')} | Q${info.queueId}`);
      }
    }
  }

  console.log('\n=== ALL TESTS PASSED ===');
}

test().catch(err => {
  console.error('\n=== TEST FAILED ===');
  console.error(err.message);
  process.exit(1);
});
