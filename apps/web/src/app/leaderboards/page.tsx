import { getChallengerLeague, uIRegionToPlatform, LeagueItem } from "@/lib/riot";
import { Card } from "@/components/ui/Card";

export default async function LeaderboardsPage(props: { searchParams: Promise<{ region?: string }> }) {
  const searchParams = await props.searchParams;
  const region = searchParams.region || 'NA';
  const platform = uIRegionToPlatform[region];
  const leagueData = await getChallengerLeague(platform);

  // Sort by LP and take top 20
  const entries = leagueData.entries
    .sort((a: LeagueItem, b: LeagueItem) => b.leaguePoints - a.leaguePoints)
    .slice(0, 20);

  return (
    <div className="relative min-h-screen pt-12 pb-24 bg-archive-dark overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-hextech-blue/10 to-transparent pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-[url('/grid.svg')] bg-repeat opacity-[0.03] pointer-events-none" />

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
          <Card variant="glass" className="overflow-hidden border border-white/5 bg-white/[0.02]">
            <div className="overflow-x-auto">
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
                  {entries.map((entry: LeagueItem, index: number) => {
                    const winRate = Math.round((entry.wins / (entry.wins + entry.losses)) * 100);
                    return (
                      <tr 
                        key={entry.summonerId} 
                        className="hover:bg-hextech-gold/[0.03] transition-all group duration-300"
                      >
                        <td className="px-8 py-8">
                          <span className="text-3xl font-black text-slate-700 group-hover:text-hextech-gold/40 transition-colors">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </td>
                        <td className="px-8 py-8">
                          <div className="flex flex-col gap-1">
                            <span className="text-lg font-bold text-white group-hover:text-hextech-gold transition-colors tracking-tight">
                              {entry.summonerName || entry.summonerId}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-silver/10 text-silver/60 text-[8px] font-bold uppercase rounded border border-silver/10">
                                Veteran Status: {entry.veteran ? 'ACTIVE' : 'INACTIVE'}
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
        <div className="mt-16 flex items-center justify-between border-t border-white/5 pt-8 animate-in fade-in duration-1000 delay-500">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500 italic">
              Data synchronized with standard Riot Network protocols.
            </span>
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-700 italic">
              Cycle completion: Estimated 120s.
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 opacity-50">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archive Status: Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
