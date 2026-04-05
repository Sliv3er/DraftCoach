// Full E2E test — mirrors EXACTLY what fetchMyStats() + analyzeMyStats() do
// Tests: EL Zeni#vbn (EUW) with fresh dev key

const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const RIOT_KEY = 'RGAPI-c57898ca-9e68-4da6-98e3-26bdab7d6c16';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const REGION = 'euw1';
const REGION_V5 = 'europe';
const NAME = 'EL Zeni';
const TAG = 'vbn';

let pass = 0, fail = 0;
const results = [];
function ok(label, val) { const msg = `  OK ${label}: ${val}`; console.log(msg); results.push(msg); pass++; }
function nok(label, val) { const msg = `  FAIL ${label}: ${val}`; console.log(msg); results.push(msg); fail++; }
function check(label, cond, val) { cond ? ok(label, val) : nok(label, val); }

async function riotGet(url) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_KEY }, timeout: 8000 });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 2000)); return riotGet(url); }
  if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t.slice(0,200)}`); }
  return res.json();
}

async function main() {
  console.log('STATS WINDOW E2E TEST');
  console.log('=====================');

  // Step 1: Account
  console.log('[1] Account');
  const account = await riotGet(`https://${REGION_V5}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(NAME)}/${encodeURIComponent(TAG)}`);
  check('gameName', account.gameName === NAME, account.gameName);
  check('puuid', !!account.puuid, 'exists');

  // Step 2: Summoner
  console.log('[2] Summoner');
  let summoner = { summonerLevel: 0, profileIconId: 1, id: '' };
  try {
    summoner = await riotGet(`https://${REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`);
    check('level', summoner.summonerLevel > 0, summoner.summonerLevel);
    check('icon', summoner.profileIconId > 0, summoner.profileIconId);
  } catch (e) { nok('summoner v4', e.message); }

  // Step 3: Ranked
  console.log('[3] Ranked');
  let soloQ = {};
  try {
    const ranked = await riotGet(`https://${REGION}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`);
    check('ranked array', Array.isArray(ranked), ranked.length + ' entries');
    soloQ = ranked.find(r => r.queueType === 'RANKED_SOLO_5x5') || {};
    if (soloQ.tier) {
      check('tier', !!soloQ.tier, `${soloQ.tier} ${soloQ.rank} ${soloQ.leaguePoints}LP ${soloQ.wins}W/${soloQ.losses}L`);
    } else { ok('unranked', 'no SoloQ'); }
  } catch (e) { nok('league v4', e.message); }

  // Step 4: Match IDs
  console.log('[4] Match IDs');
  let matchIds = [];
  try {
    matchIds = await riotGet(`https://${REGION_V5}.api.riotgames.com/lol/match/v5/matches/by-puuid/${account.puuid}/ids?start=0&count=15`);
    check('count', matchIds.length > 0, matchIds.length + ' matches');
    check('format', matchIds[0] && matchIds[0].includes('_'), matchIds[0]);
  } catch (e) { nok('match IDs', e.message); }

  // Step 5: Match Details (first 5)
  console.log('[5] Match Details');
  const matches = [];
  const champStats = {};
  for (let i = 0; i < Math.min(5, matchIds.length); i++) {
    try {
      const match = await riotGet(`https://${REGION_V5}.api.riotgames.com/lol/match/v5/matches/${matchIds[i]}`);
      const info = match.info;
      const me = info.participants.find(p => p.puuid === account.puuid);
      if (!me) { nok(`match${i+1} participant`, 'NOT FOUND'); continue; }

      const dur = info.gameDuration;
      const durMin = dur / 60;
      const allDpm = info.participants.map(p => p.totalDamageDealtToChampions / durMin);
      const avgDpm = allDpm.reduce((a, b) => a + b, 0) / allDpm.length;
      const cs = me.totalMinionsKilled + (me.neutralMinionsKilled || 0);
      const normChamp = (me.championName || '').replace(/[\s'.]/g, '');
      const gameEnd = info.gameEndTimestamp || (info.gameCreation + dur * 1000);
      const hoursAgo = Math.floor((Date.now() - gameEnd) / 3600000);
      const timeAgo = hoursAgo < 1 ? 'Just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`;

      matches.push({
        championName: me.championName,
        champIcon: `https://ddragon.leagueoflegends.com/cdn/15.1.1/img/champion/${normChamp}.png`,
        win: me.win, kills: me.kills, deaths: me.deaths, assists: me.assists,
        cs, csMin: (cs / durMin).toFixed(1),
        dpm: Math.round(me.totalDamageDealtToChampions / durMin),
        avgDpm: Math.round(avgDpm),
        visionScore: me.visionScore || 0,
        goldEarned: me.goldEarned || 0,
        duration: `${Math.floor(dur/60)}:${(dur%60).toString().padStart(2,'0')}`,
        gameMode: info.queueId === 420 ? 'Ranked' : info.queueId === 440 ? 'Flex' : 'Normal',
        timeAgo, aiScore: 0, isMvp: false, isLvp: false,
      });

      const cn = me.championName;
      if (!champStats[cn]) champStats[cn] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      champStats[cn].games++;
      if (me.win) champStats[cn].wins++;
      champStats[cn].kills += me.kills;
      champStats[cn].deaths += me.deaths;
      champStats[cn].assists += me.assists;

      check(`game${i+1}`, true, `${me.championName} ${me.win?'W':'L'} ${me.kills}/${me.deaths}/${me.assists} ${Math.round(me.totalDamageDealtToChampions/durMin)}DPM ${(cs/durMin).toFixed(1)}cs/m`);
    } catch (e) { nok(`match${i+1}`, e.message); }
  }

  // Step 6: Champ pool
  console.log('[6] Champ Pool');
  const champPool = Object.entries(champStats).map(([name, s]) => ({
    name, games: s.games,
    winRate: Math.round((s.wins / s.games) * 100),
    kda: s.deaths === 0 ? s.kills + s.assists : parseFloat(((s.kills + s.assists) / s.deaths).toFixed(2)),
  })).sort((a, b) => b.games - a.games);
  check('pool', champPool.length > 0, champPool.map(c => `${c.name}(${c.games}g ${c.winRate}%WR)`).join(', '));

  // Step 7: Icon check
  console.log('[7] Icon URLs');
  if (matches[0]) {
    const iconRes = await fetch(matches[0].champIcon, { method: 'HEAD' });
    check('champ icon', iconRes.ok, `${matches[0].championName} -> ${iconRes.status}`);
  }
  const profileIcon = `https://ddragon.leagueoflegends.com/cdn/15.1.1/img/profileicon/${summoner.profileIconId || 1}.png`;
  const pRes = await fetch(profileIcon, { method: 'HEAD' });
  check('profile icon', pRes.ok, `icon ${summoner.profileIconId} -> ${pRes.status}`);

  // Step 8: AI Analysis
  console.log('[8] AI Analysis');
  if (GEMINI_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_KEY);
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview' });

      const matchSummary = matches.map((m, i) =>
        `${i+1}. ${m.championName} ${m.win?'W':'L'} ${m.kills}/${m.deaths}/${m.assists} ${m.csMin}cs/m ${m.dpm}dpm ${m.visionScore}vis ${m.duration} ${m.gameMode}`
      ).join('\n');

      const rank_str = `${soloQ.tier || 'UNRANKED'} ${soloQ.rank || ''} (${soloQ.leaguePoints || 0} LP)`;
      const prompt = `Analyze this LoL player. Be concise.
RANK: ${rank_str}
GAMES:
${matchSummary}
CHAMPS: ${champPool.slice(0,5).map(c => `${c.name}(${c.games}g ${c.winRate}%WR ${c.kda}KDA)`).join(', ')}

OUTPUT (concise, no sentences):
SCORES: <comma scores /10 per game>
MVP: <game numbers>
LVP: <game numbers>
QUEUE: <Winners Queue / Normal / Losers Queue / Coinflip>
CONSISTENCY: <Rock Solid / Steady / Inconsistent / Coinflip / Tilted>
TIP: <10 words max>`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      check('AI response', text.length > 10, text.length + ' chars');

      const scoresM = text.match(/SCORES:\s*([0-9,\s]+)/i);
      check('scores parse', !!scoresM, scoresM ? scoresM[1].trim() : 'NONE');

      const queueM = text.match(/QUEUE[:\s]*(.+)/im);
      check('queue parse', !!queueM, queueM ? queueM[1].trim() : 'NONE');

      const tipM = text.match(/TIP[:\s]*(.+)/im);
      check('tip parse', !!tipM, tipM ? tipM[1].trim() : 'NONE');

      console.log('  AI output:');
      text.split('\n').filter(l => l.trim()).forEach(l => console.log('    ' + l.trim()));
    } catch (e) { nok('AI', e.message); }
  } else {
    ok('AI skipped', 'no GEMINI_API_KEY env var');
  }

  // Summary
  console.log('\n=====================');
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  results.filter(r => r.includes('FAIL')).forEach(r => console.log(r));
  if (fail === 0) console.log('ALL TESTS PASSED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
