import Image from "next/image";
import { 
  getAccountByRiotId, 
  getSummonerByPuuid, 
  getLeagueEntries, 
  getRoutingRegion, 
  uIRegionToPlatform, 
  getRecentMatchIds, 
  getMatchDetails,
  getLatestDDragonVersion,
  getTopChampionMasteries,
  getChampions,
  getCDragonChampionIcon,
  getCDragonSplash,
  LeagueItem,
  Match,
  MatchParticipant,
  ChampionMastery,
  Champion
} from "@/lib/riot";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface SummonerPageProps {
  params: Promise<{ region: string; name: string }>;
}

export default async function SummonerProfile({ params }: SummonerPageProps) {
  const resolvedParams = await params;
  
  const regionDropdown = resolvedParams.region.toUpperCase();
  const platformId = uIRegionToPlatform[regionDropdown] || "na1";
  const routingRegion = getRoutingRegion(platformId);
  
  const decodedString = decodeURIComponent(resolvedParams.name);
  let gameName = decodedString;
  let tagLine = regionDropdown;
  
  if (decodedString.includes('-')) {
    const parts = decodedString.split('-');
    gameName = parts[0];
    tagLine = parts.slice(1).join('-');
  }

  try {
    const version = await getLatestDDragonVersion();
    const accountRes = await getAccountByRiotId(gameName, tagLine, routingRegion);
    
    if (!accountRes || !accountRes.puuid) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <Card variant="glass" className="max-w-md p-10 border-red-500/20">
            <div className="w-16 h-16 bg-red-500/10 rounded-sm flex items-center justify-center text-red-400 mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-display font-bold uppercase tracking-widest text-white mb-2">Subject Not Found</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              The archive has no record of {gameName}#{tagLine} in the {regionDropdown} cluster.
            </p>
            <Link href="/" className="w-full">
               <Button variant="secondary" fullWidth>Initiate Return Trace</Button>
            </Link>
          </Card>
        </div>
      );
    }

    const puuid = accountRes.puuid;
    const [summonerInfo, leagueInfo, matchIds, topMastery, allChampions] = await Promise.all([
      getSummonerByPuuid(puuid, platformId),
      getLeagueEntries(puuid, platformId),
      getRecentMatchIds(puuid, routingRegion, 10),
      getTopChampionMasteries(puuid, platformId, 3),
      getChampions(version)
    ]);

    if (!summonerInfo) {
      throw new Error("Summoner data could not be retrieved even with a valid PUUID.");
    }

    const matches = await Promise.all(
      matchIds.map((id: string) => getMatchDetails(id, routingRegion))
    );

    const soloQueue = leagueInfo.find((l: LeagueItem) => l.queueType === "RANKED_SOLO_5x5") || null;
    const winRate = soloQueue ? Math.round((soloQueue.wins / (soloQueue.wins + soloQueue.losses)) * 100) : 0;
    
    // Predetermined favorite champ for background based on top mastery
    const favoriteChampId = topMastery[0]?.championId || 421; 

    return (
      <div className="relative min-h-screen bg-surface">
        {/* Dynamic Background Wrapper */}
        <div className="absolute top-0 left-0 right-0 h-[500px] z-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-surface/0 via-surface/80 to-surface z-10" />
          <Image 
            src={getCDragonSplash(favoriteChampId)}
            alt="Favorite Champ Background" 
            fill 
            className="object-cover opacity-20 blur-md scale-110"
            priority
          />
        </div>

        <main className="relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
          {/* Header Profile Identity */}
          <section className="pt-32 pb-12 px-6 max-w-[1400px] mx-auto">
             <div className="flex flex-col lg:flex-row items-center lg:items-end gap-12">
                {/* Profile Icon Container */}
                <div className="relative group">
                  <div className="w-40 h-40 rounded-sm overflow-hidden border-2 border-hextech-gold p-1 bg-surface-container shadow-[0_0_40px_rgba(240,191,92,0.15)] transition-all group-hover:shadow-[0_0_60px_rgba(240,191,92,0.25)]">
                     <div className="w-full h-full relative overflow-hidden rounded-sm bg-surface-bright">
                        <Image 
                          src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${summonerInfo.profileIconId}.png`}
                          alt="Profile Icon"
                          fill
                          className="object-cover group-hover:scale-110 transition-transform duration-700"
                        />
                     </div>
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-hextech-gold text-hextech-blue font-display font-bold text-sm rounded-sm shadow-xl tracking-tighter">
                     LVL {summonerInfo.summonerLevel}
                  </div>
                </div>

                <div className="flex-1 text-center lg:text-left">
                  <div className="editorial-header mb-4">
                     <span>Kinetic Archive Detected // Signal High</span>
                     <h1 className="text-4xl md:text-7xl leading-none">
                       {accountRes.gameName}
                       <span className="text-hextech-gold opacity-40 ml-2">#{accountRes.tagLine}</span>
                     </h1>
                  </div>
                  
                  <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-4">
                     <Button variant="primary" size="sm" className="px-10">Archive Update</Button>
                     <Button variant="secondary" size="sm">Signal Trace</Button>
                  </div>
                </div>

                {/* Top Level Stats Pane */}
                <div className="flex gap-16 border-l border-white/5 pl-16 hidden xl:flex h-24 items-end mb-4">
                   <div className="text-right">
                      <span className="block text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mb-3">Sync Consistency</span>
                      <span className="text-5xl font-display text-white font-bold leading-none">{winRate}<span className="text-hextech-gold">%</span></span>
                   </div>
                   <div className="text-right">
                      <span className="block text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mb-3">Expended Files</span>
                      <span className="text-5xl font-display text-white font-bold leading-none">{soloQueue ? soloQueue.wins + soloQueue.losses : 0}</span>
                   </div>
                </div>
             </div>
          </section>

          {/* Sub-Nav Layout */}
          <div className="border-y border-white/5 bg-surface-container/40 backdrop-blur-md sticky top-[64px] z-40">
             <div className="max-w-[1400px] mx-auto px-6 flex space-x-12 h-16 items-center">
                {['Intelligence Overview', 'Champion Registry', 'Combat Chronology'].map((tab, i) => (
                  <button 
                    key={tab}
                    className={`text-[11px] uppercase font-bold tracking-[0.4em] h-full border-b-2 transition-all ${i === 0 ? 'border-hextech-gold text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                  >
                    {tab}
                  </button>
                ))}
             </div>
          </div>

          {/* Core Content Grid */}
          <div className="max-w-[1400px] mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* Left Sidebar: Mastery & Rank */}
            <aside className="lg:col-span-4 space-y-12">
              {/* Rank Block */}
              <div className="p-10 bg-surface-container relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-hextech-gold/5 blur-3xl -mr-16 -mt-16" />
                 <h3 className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold/40 mb-10">Archive Ranking</h3>
                 
                 <div className="flex items-center gap-8 mb-10">
                    <div className="w-24 h-24 bg-surface-bright flex items-center justify-center border border-hextech-gold/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                       <span className="text-5xl font-display font-light text-hextech-gold group-hover:scale-110 transition-transform">
                          {soloQueue ? soloQueue.tier.charAt(0) : "U"}
                       </span>
                    </div>
                    <div>
                      <h4 className="text-2xl font-bold text-white uppercase tracking-tighter mb-1">
                        {soloQueue ? `${soloQueue.tier} ${soloQueue.rank}` : "UNRANKED"}
                      </h4>
                      <span className="text-hextech-gold font-bold tracking-widest text-sm italic">{soloQueue ? soloQueue.leaguePoints : 0} Pulse LP</span>
                    </div>
                 </div>

                 {soloQueue && (
                   <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-8">
                      <div>
                         <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Recovered</span>
                         <span className="text-xl font-display text-white">{soloQueue.wins} W</span>
                      </div>
                      <div className="text-right">
                         <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Deconstructed</span>
                         <span className="text-xl font-display text-white">{soloQueue.losses} L</span>
                      </div>
                   </div>
                 )}
              </div>

              {/* Mastery Signature Block */}
              <div className="p-10 border border-white/5 bg-surface/50 backdrop-blur-sm">
                 <h3 className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold/40 mb-10">Signature Masteries</h3>
                 <div className="space-y-8">
                    {topMastery.map((m: ChampionMastery) => {
                      const champ = Object.values(allChampions).find((c: Champion) => c.key == String(m.championId));
                      return (
                        <div key={m.championId} className="flex items-center gap-6 group">
                           <div className="w-16 h-16 rounded-sm overflow-hidden border border-white/5 group-hover:border-hextech-gold transition-colors relative bg-surface-bright">
                              <Image 
                                src={getCDragonChampionIcon(m.championId)}
                                alt={champ?.name || 'Champ'}
                                fill
                                className="object-cover grayscale active:grayscale-0 group-hover:grayscale-0 transition-all duration-500"
                              />
                           </div>
                           <div className="flex-1">
                              <span className="block text-sm font-bold text-white uppercase tracking-widest mb-1 group-hover:text-hextech-gold transition-colors">{champ?.name}</span>
                              <div className="flex items-center gap-2">
                                <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                                   <div className="h-full bg-hextech-gold/40 w-[70%]" />
                                </div>
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">LVL {m.championLevel}</span>
                              </div>
                           </div>
                           <div className="text-right">
                              <span className="text-sm font-display text-hextech-gold">{(m.championPoints / 1000).toFixed(0)}K</span>
                           </div>
                        </div>
                      );
                    })}
                 </div>
              </div>
            </aside>

            {/* Right Main Content: Logs */}
            <div className="lg:col-span-8 space-y-12">
               <div className="flex items-end justify-between border-b border-white/5 pb-6">
                  <div className="editorial-header">
                     <span>Database Feed</span>
                     <h3 className="text-3xl uppercase">Combat Logs</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Archive Depth: 10 Matches</span>
               </div>

               <div className="space-y-4">
                  {matches.length > 0 ? matches.map((matchData: Match) => {
                    const participant = matchData.info.participants.find((p: MatchParticipant) => p.puuid === puuid);
                    if (!participant) return null;
                    const isWin = participant.win;
                    
                    return (
                      <Card 
                        key={matchData.metadata.matchId} 
                        variant="glass"
                        status={isWin ? 'victory' : 'defeat'} 
                        interactive 
                        className="p-8 flex flex-wrap md:flex-nowrap items-center gap-10"
                      >
                         {/* Outcome Status Block */}
                         <div className="w-24 hidden md:block">
                            <span className={`block text-[11px] font-bold uppercase tracking-[0.3em] mb-1 ${isWin ? 'text-hextech-accent-success' : 'text-hextech-accent-error'}`}>
                               {isWin ? 'VIC // SYNC' : 'DEF // DROP'}
                            </span>
                            <span className="text-[11px] text-slate-500 uppercase font-bold tracking-widest opacity-60">
                               {matchData.info.gameMode === 'CLASSIC' ? 'Draft Pulse' : 'Signal Interference'}
                            </span>
                         </div>

                         {/* Hex Champion Icon */}
                         <div className="relative group/champ">
                            <div className={`w-20 h-20 rounded-sm border-2 p-1 bg-surface transition-all group-hover:p-0 ${isWin ? 'border-hextech-accent-success/20 group-hover:border-hextech-accent-success/50' : 'border-hextech-accent-error/20 group-hover:border-hextech-accent-error/50'}`}>
                               <div className="w-full h-full relative overflow-hidden rounded-sm bg-surface-bright">
                                  <Image 
                                    src={getCDragonChampionIcon(participant.championId)}
                                    alt={participant.championName}
                                    fill
                                    className="object-cover group-hover:scale-110 transition-transform"
                                  />
                               </div>
                            </div>
                        </div>

                        {/* Performance Matrix */}
                        <div className="flex-1">
                           <div className="flex items-baseline space-x-3 mb-2">
                              <span className="text-2xl font-display font-bold text-white tracking-tighter">{participant.kills}</span>
                              <span className="text-slate-600 text-sm">/</span>
                              <span className="text-2xl font-display font-bold text-hextech-accent-error tracking-tighter">{participant.deaths}</span>
                              <span className="text-slate-600 text-sm">/</span>
                              <span className="text-2xl font-display font-bold text-white tracking-tighter">{participant.assists}</span>
                           </div>
                           <div className="flex items-center gap-3">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-hextech-gold">
                                 {((participant.kills + participant.assists) / Math.max(1, participant.deaths)).toFixed(2)} KDA Ratio
                              </span>
                              <div className="w-1 h-1 rounded-full bg-white/10" />
                              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                 {participant.totalMinionsKilled + participant.neutralMinionsKilled} Kinetic Debris
                              </span>
                           </div>
                        </div>

                        {/* Item Grid */}
                        <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-black/20 rounded-sm border border-white/5">
                           {[participant.item0, participant.item1, participant.item2, participant.item6, participant.item3, participant.item4, participant.item5].map((item, i) => (
                             <div key={i} className={`w-8 h-8 rounded-sm border border-white/5 overflow-hidden bg-surface-bright/50 relative`}>
                               {item !== 0 ? (
                                 <Image 
                                   src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item}.png`}
                                   alt="Item"
                                   fill
                                   className="object-cover"
                                 />
                               ) : null}
                             </div>
                           ))}
                        </div>

                        {/* Combat Statistics */}
                        <div className="text-right hidden xl:block min-w-[100px]">
                           <span className="block text-sm font-display text-white font-bold tracking-tighter">{Math.round(participant.totalDamageDealtToChampions / 1000)}K Output</span>
                           <span className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase">Combat Rating</span>
                        </div>
                      </Card>
                    );
                  }) : (
                    <div className="p-20 text-center border-2 border-dashed border-white/5 bg-surface/30">
                       <span className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold/20 block mb-4">Integrity Check Failed // Logs Empty</span>
                       <p className="text-slate-600 text-sm font-light max-w-xs mx-auto">The kinetic archive returned no active combat records for this subject in the recent cycle.</p>
                    </div>
                  )}
               </div>
            </div>
          </div>
        </main>
      </div>
    );
  } catch (err) {
    const error = err as Error;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <Card variant="glass" className="max-w-md p-10 border-amber-500/20">
          <div className="w-16 h-16 bg-amber-500/10 rounded-sm flex items-center justify-center text-amber-500 mx-auto mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold uppercase tracking-widest text-white mb-2">Signal Interference</h2>
          <p className="text-slate-400 text-sm mb-4 leading-relaxed">External Riot networks are currently unstable or inaccessible from this terminal.</p>
          <code className="text-[10px] text-amber-500/60 uppercase tracking-widest block py-2 px-4 bg-black/20 rounded-sm mb-8">{error.message}</code>
          <Button variant="secondary" fullWidth onClick={() => typeof window !== 'undefined' && window.location.reload()}>Re-Initiate Handshake</Button>
        </Card>
      </div>
    );
  }
}

