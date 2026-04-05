import { getChallengerLeague, uIRegionToPlatform, getRoutingRegion, getAccountByPuuid, getLatestDDragonVersion, LeagueItem } from "@/lib/riot";
import { Card } from "@/components/ui/Card";
import Image from "next/image";
import Link from "next/link";

interface LeaderboardPageProps {
  params: Promise<{ region: string }>;
}

export default async function LeaderboardPage({ params }: LeaderboardPageProps) {
  const { region } = await params;
  const platformId = uIRegionToPlatform[region.toUpperCase()] || "na1";
  const routingRegion = getRoutingRegion(platformId);

  try {
    const [league, version] = await Promise.all([
      getChallengerLeague(platformId),
      getLatestDDragonVersion()
    ]);

    const topPlayers = league.entries
      .sort((a, b) => b.leaguePoints - a.leaguePoints)
      .slice(0, 20);

    // Fetch account details for top players to get GameName and TagLine
    const playersWithNames = await Promise.all(
      topPlayers.map(async (entry) => {
        const account = await getAccountByPuuid(entry.summonerId, routingRegion);
        return { ...entry, account };
      })
    );

    return (
      <div className="min-h-screen bg-[#050507] text-slate-100 p-6 lg:p-12 relative overflow-hidden font-display">
        {/* Background Decorative Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <main className="max-w-7xl mx-auto relative z-10">
          <div className="mb-20">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-[1px] bg-hextech-gold/30" />
              <span className="text-[10px] uppercase font-bold tracking-[0.4em] text-hextech-gold/60">
                Data Stream // {region.toUpperCase()} Node
              </span>
            </div>
            <h1 className="text-7xl lg:text-8xl font-black uppercase tracking-tighter mb-8 italic">
              Elite <span className="text-hextech-gold text-outline">Vanguard</span>
            </h1>
            <p className="text-slate-400 max-w-xl text-lg font-light leading-relaxed">
              The high-fidelity ranking of the top 20 aspirants within the <span className="text-white font-bold">Challenger</span> tier of the local network.
            </p>
          </div>

          {/* Region Switcher */}
          <div className="flex justify-end gap-2 mb-12">
            <div className="bg-white/5 p-1 rounded-sm border border-white/10 flex gap-1">
              {['NA', 'EUW', 'KR', 'EUNE'].map((r) => (
                <Link
                  key={r}
                  href={`/leaderboards/${r.toLowerCase()}`}
                  className={`px-6 py-2 text-[10px] uppercase font-bold tracking-widest transition-all rounded-sm ${
                    region.toUpperCase() === r 
                    ? 'bg-hextech-gold text-hextech-blue shadow-lg' 
                    : 'text-slate-500 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {r}
                </Link>
              ))}
            </div>
          </div>

          <Card variant="glass" noOverflow className="border-white/5">
            <div className="grid grid-cols-12 gap-4 px-10 py-6 border-b border-white/5 text-[10px] uppercase font-bold tracking-[0.3em] text-slate-500">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Subject Identification</div>
              <div className="col-span-3 text-right">Potency [LP]</div>
              <div className="col-span-3 text-right">Efficiency Rate</div>
            </div>

            <div className="divide-y divide-white/5">
              {playersWithNames.map((player, index) => (
                <div key={player.summonerId} className="grid grid-cols-12 gap-4 px-10 py-10 hover:bg-white/[0.02] transition-colors group">
                  <div className="col-span-1 flex items-center">
                    <span className="text-4xl font-black text-white/10 group-hover:text-hextech-gold/20 transition-colors">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="col-span-5 flex items-center gap-6">
                    <div className="w-14 h-14 bg-surface-bright border border-hextech-gold/20 group-hover:border-hextech-gold transition-all rounded-sm p-1">
                      <div className="w-full h-full relative overflow-hidden bg-black/40">
                         {/* Placeholder for actual summoner icon if we had the ID */}
                         <div className="flex items-center justify-center h-full text-hextech-gold/20 font-black">?</div>
                      </div>
                    </div>
                    <div>
                      <Link 
                        href={`/summoner/${region}/${player.account?.gameName}-${player.account?.tagLine}`}
                        className="text-xl font-bold text-white group-hover:text-hextech-gold transition-colors block mb-1 hover:underline underline-offset-4 decoration-hextech-gold/50"
                      >
                        {player.account?.gameName}
                        <span className="text-slate-500 opacity-40 ml-1">#{player.account?.tagLine}</span>
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-white/5 text-[8px] border border-white/10 text-slate-500 uppercase font-bold tracking-widest">
                          Status: {player.veteran ? 'Veteran' : 'Newcomer'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3 flex flex-col justify-center items-end">
                    <span className="text-2xl font-bold text-white tracking-tighter">
                      {player.leaguePoints} <span className="text-hextech-gold text-xs">LP</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Challenger Tier</span>
                  </div>
                  <div className="col-span-3 flex flex-col justify-center items-end">
                    <div className="w-32 h-1.5 bg-white/5 rounded-full mb-3 overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-hextech-gold shadow-[0_0_10px_rgba(196,151,85,0.4)]" 
                        style={{ width: `${Math.round((player.wins / (player.wins + player.losses)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-white tracking-tighter">
                        {Math.round((player.wins / (player.wins + player.losses)) * 100)}%
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        {player.wins}W / {player.losses}L
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </main>
      </div>
    );
  } catch (error) {
    console.error(error);
    return <div className="p-20 text-center uppercase tracking-[5px] text-red-500 font-black">Access Denied // Node Error</div>;
  }
}
