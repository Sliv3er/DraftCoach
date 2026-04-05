import React from 'react';
import Image from 'next/image';
import { getMatchDetails, getRoutingRegion, getLatestDDragonVersion, getChampions, getItems, Match, MatchParticipant, ItemMap, ChampionMap } from '@/lib/riot';
import { Card } from '@/components/ui/Card';
import { ItemTooltip } from '@/components/ItemTooltip';
import Link from 'next/link';

interface MatchPageProps {
  params: Promise<{
    region: string;
    matchId: string;
  }>;
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { region, matchId } = await params;
  const routingRegion = getRoutingRegion(region);

  try {
    const match = await getMatchDetails(matchId, routingRegion);
    const version = await getLatestDDragonVersion();
    const items = await getItems(version);

    // Group participants by team
    const team100 = match.info.participants.filter(p => p.teamId === 100);
    const team200 = match.info.participants.filter(p => p.teamId === 200);

    return (
      <div className="min-h-screen bg-[#050507] text-slate-100 p-6 lg:p-12 relative overflow-hidden">
        {/* Background Decorative Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <main className="max-w-7xl mx-auto relative z-10 space-y-10">
          {/* Header Block */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-10">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-[0.3em] text-hextech-gold/60 mb-2 block">Match Terminal</span>
              <h1 className="text-4xl lg:text-5xl uppercase tracking-tighter font-bold mb-2">{matchId}</h1>
              <div className="flex items-center gap-4 text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">
                <span>{match.info.gameMode}</span>
                <span className="w-1 h-1 bg-white/10 rounded-full" />
                <span>{new Date(match.info.gameCreation).toLocaleString()}</span>
                <span className="w-1 h-1 bg-white/10 rounded-full" />
                <span>{Math.floor(match.info.gameDuration / 60)}m {match.info.gameDuration % 60}s</span>
              </div>
            </div>
            <Link href="/" className="text-[10px] uppercase font-bold tracking-widest text-hextech-gold hover:text-white transition-colors">
              &lt; Return to Surface
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {[team100, team200].map((team, idx) => {
              const isWin = team[0].win;
              const teamId = team[0].teamId;
              return (
                <div key={teamId} className="space-y-6">
                  <div className="flex items-end justify-between px-2">
                    <h3 className={`text-xl uppercase font-bold tracking-tight ${isWin ? 'text-hextech-gold' : 'text-slate-500'}`}>
                      {isWin ? 'VIC // Team' : 'DEF // Team'} {idx === 0 ? 'BLUE' : 'RED'}
                    </h3>
                    <div className="flex gap-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                      <span>Kills: {team.reduce((acc, p) => acc + p.kills, 0)}</span>
                      <span>Gold: {(team.reduce((acc, p) => acc + p.goldEarned, 0) / 1000).toFixed(1)}k</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {team.map((p: any) => (
                      <Card key={p.puuid} variant="glass" noOverflow className={`p-4 flex items-center gap-5 border-l-4 ${isWin ? 'border-l-hextech-gold/40' : 'border-l-white/5'}`}>
                        <div className="relative w-12 h-12 rounded-sm overflow-hidden bg-slate-900 flex-shrink-0 border border-white/5">
                          <Image 
                            src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`}
                            alt="Champion"
                            fill
                            className="object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-white uppercase truncate tracking-wider mb-0.5">{p.riotIdGameName || p.summonerName}</span>
                          <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-tighter opacity-70">
                            {p.kills} / <span className="text-red-500">{p.deaths}</span> / {p.assists}
                          </span>
                        </div>

                        <div className="flex gap-1 bg-black/20 p-1 rounded-sm border border-white/5">
                           {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item: number, i: number) => (
                             <ItemTooltip key={i} item={items[item]} itemId={item} version={version} />
                           ))}
                        </div>

                        <div className="text-right w-16 hidden sm:block">
                           <span className="block text-xs font-bold text-white">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</span>
                           <span className="text-[8px] text-slate-500 uppercase tracking-widest leading-none text-nowrap">DMG OUT</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  } catch (error) {
    console.error(error);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl text-red-500 mb-4 uppercase tracking-widest font-bold">Data Link Severed</h2>
        <p className="text-slate-500 max-w-sm font-light">Unable to retrieve combat record from the encrypted archive.</p>
        <Link href="/" className="mt-8 text-hextech-gold uppercase text-[10px] font-bold tracking-[0.5em] hover:text-white transition-colors">Return to Surface</Link>
      </div>
    );
  }
}
