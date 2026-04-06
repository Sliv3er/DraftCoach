import { uIRegionToPlatform, LeagueItem, getDDragonSplash } from "@/lib/riot";
import { getLeaderboard, getAccountByPuuid, getSummonerById } from "@/app/actions";
import { Card } from "@/components/ui/Card";
import Image from "next/image";
import Link from "next/link";

export default async function LeaderboardsPage(props: { searchParams: Promise<{ region?: string }> }) {
  const searchParams = await props.searchParams;
  const region = searchParams.region || 'NA';
  const platform = uIRegionToPlatform[region];
  const leagueData = await getLeaderboard(region);

  // Sort by LP and take top 20
  const rawEntries = leagueData?.entries
    ? leagueData.entries
      .sort((a: LeagueItem, b: LeagueItem) => b.leaguePoints - a.leaguePoints)
      .slice(0, 20)
    : [];

  // Fetch Riot Account details (gameName#tagLine) for each entry
  // This is necessary because league-v4 often omits names now.
  const entries = await Promise.all(
    rawEntries.map(async (entry) => {
      try {
        let puuid = entry.puuid;
        const sId = entry.summonerId || (entry as any).summonerID;

        // Fallback: If puuid is missing, resolve it via summonerId
        if (!puuid && sId) {
          const summoner = await getSummonerById(sId, region);
          puuid = summoner?.puuid;
        }

        if (puuid) {
          const account = await getAccountByPuuid(puuid, region);
          return { ...entry, account };
        }
      } catch (err) {
        console.error(`Failed to fetch account for ${entry.summonerId}:`, err);
      }
      return entry;
    })
  );

  return (
    <div className="relative min-h-screen pt-12 pb-24 bg-archive-dark overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-hextech-blue/10 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-[1px] bg-hextech-gold/30" />
              <span className="text-[10px] uppercase font-bold tracking-[0.4em] text-hextech-gold/60">
                Data Stream // {region} Node
              </span>
            </div>
            <h1 className="text-6xl font-black uppercase tracking-tighter text-white">
              Elite <span className="text-hextech-gold text-outline">Vanguard</span>
            </h1>
            <p className="text-slate-400 max-w-xl font-medium leading-relaxed">
              The high-fidelity ranking of the top 20 aspirants within the <span className="text-white">Challenger</span> tier of the local network.
            </p>
          </div>

          {/* Region Selection Interface */}
          <div className="flex p-1 bg-white/5 backdrop-blur-md rounded-lg border border-white/10">
            {['NA', 'EUW', 'KR', 'EUNE'].map((r) => (
              <a
                key={r}
                href={`/leaderboards?region=${r}`}
                className={`
                  px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all
                  ${r === region
                    ? 'bg-hextech-gold text-hextech-blue shadow-[0_0_20px_rgba(196,151,85,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'}
                `}
              >
                {r}
              </a>
            ))}
          </div>
        </div>

        {/* Ranking List */}
        <div className="animate-in fade-in duration-1000 delay-300">
          <Card variant="glass" className="relative overflow-hidden border border-white/5 bg-white/[0.02]">
            <Image
              src={getDDragonSplash('RekSai')}
              alt="Leaderboard Background"
              fill
              sizes="100vw"
              className="object-cover opacity-10 blur-xl scale-110"
              priority
            />
            <div className="relative overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-bold text-hextech-gold/40">#</th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-bold text-hextech-gold/40">Subject Identification</th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-bold text-hextech-gold/40 text-right">Potency [LP]</th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-bold text-hextech-gold/40 text-right">Efficiency Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-display">
                  {entries.map((entry: any, index: number) => {
                    console.log(entry)
                    const winRate = Math.round((entry.wins / (entry.wins + entry.losses)) * 100);
                    const sId = entry.summonerId || entry.summonerID || "";

                    // Priority: Riot ID (gameName#tagLine) > Summoner Name > Fallback ID
                    const riotName = entry.account ? `${entry.account.gameName}#${entry.account.tagLine}` : "";
                    const displayName = riotName || entry.summonerName || (sId ? `Subject // ${sId.slice(0, 12)}...` : 'CLASSIFIED SUBJECT');

                    return (
                      <tr
                        key={sId || index}
                        className="hover:bg-hextech-gold/[0.03] transition-all group duration-300"
                      >
                        <td className="px-8 py-8 w-20">
                          <span className="text-3xl font-black text-slate-700 group-hover:text-hextech-gold/40 transition-colors">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </td>
                        <td className="px-8 py-8">
                          <div className="flex flex-col gap-1">
                            {entry.account ? (
                              <Link
                                href={`/summoner/${region}/${entry.account.gameName}-${entry.account.tagLine}`}
                                className="text-lg font-bold text-white group-hover:text-hextech-gold transition-colors tracking-tight hover:underline underline-offset-4 decoration-hextech-gold/30"
                              >
                                {displayName}
                              </Link>
                            ) : (
                              <span className="text-lg font-bold text-white transition-colors tracking-tight">
                                {displayName}
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              {sId && (
                                <div className="px-1.5 py-0.5 bg-hextech-gold/10 text-hextech-gold/60 text-[10px] font-bold uppercase rounded border border-hextech-gold/20">
                                  Vanguard ID: {sId.slice(0, 8)}
                                </div>
                              )}
                              <span className="px-1.5 py-0.5 bg-silver/10 text-silver/60 text-[10px] font-bold uppercase rounded border border-silver/10">
                                Status: {entry.veteran ? 'VETERAN' : 'ASPIRANT'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-8 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-xl font-bold text-hextech-gold tracking-tight drop-shadow-[0_0_10px_rgba(196,151,85,0.2)]">
                              {entry.leaguePoints} <span className="text-[10px] opacity-60">LP</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Challenger Tier</span>
                          </div>
                        </td>
                        <td className="px-8 py-8 text-right">
                          <div className="flex items-center justify-end space-x-4">
                            <div className="text-right">
                              <span className="text-lg font-bold text-white block leading-none">{winRate}%</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-1">
                                {entry.wins}W <span className="opacity-30">/</span> {entry.losses}L
                              </span>
                            </div>
                            <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                              <div
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-hextech-gold/40 to-hextech-gold transition-all duration-1000 ease-out"
                                style={{ width: `${winRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Footer info */}
        <div className="relative z-10 mt-16 flex items-center justify-between border-t border-white/5 pt-8 animate-in fade-in duration-1000 delay-500">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500 italic">
              Data synchronized with standard Riot Network protocols.
            </span>
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-700 italic">
              Archive Status: <span className="text-green-500">Node Sync Complete</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
