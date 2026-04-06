import Image from "next/image";
import { 
  getLatestDDragonVersion,
  getChampions,
  getCDragonChampionIcon,
  getChampionSplash,
  LeagueItem,
  ChampionMastery,
  Champion,
  getItems,
  getSummonerSpellMap,
  getRuneMap,
  uIRegionToPlatform,
  getDDragonProfileIcon,
  getRankEmblem
} from "@/lib/riot";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { MatchList } from "@/components/MatchList";
import { getSummonerFull, getTopMastery, fetchMoreMatches } from "@/app/actions";
import { ArchiveUpdateButton } from "@/components/ArchiveUpdateButton";
import { PastRanks } from "@/components/PastRanks";
import { RecentPlayersSidebar } from "@/components/RecentPlayersSidebar";

interface SummonerPageProps {
  params: Promise<{ region: string; name: string }>;
}

export default async function SummonerProfile({ params }: SummonerPageProps) {
  const resolvedParams = await params;
  const regionInput = resolvedParams.region.toUpperCase();
  const region = uIRegionToPlatform[regionInput] || regionInput.toLowerCase();
  
  const decodedString = decodeURIComponent(resolvedParams.name);
  let gameName = decodedString;
  let tagLine = region;
  
  if (decodedString.includes('-')) {
    const parts = decodedString.split('-');
    gameName = parts[0];
    tagLine = parts.slice(1).join('-');
  }

  try {
    const version = await getLatestDDragonVersion();
    const [profileData, allChampions, items, spellMap, runeMap] = await Promise.all([
      getSummonerFull(region, gameName, tagLine),
      getChampions(version),
      getItems(version),
      getSummonerSpellMap(version),
      getRuneMap(version)
    ]);
    
    if (!profileData || !profileData.summoner) {
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
              No match history found for {gameName}#{tagLine} in the {region} region.
            </p>
            <Link href="/" className="w-full">
               <Button variant="secondary" fullWidth>Initiate Return Trace</Button>
            </Link>
          </Card>
        </div>
      );
    }

    const { summoner, leagues, player } = profileData;
    const puuid = summoner.puuid;

    const [topMastery, matches] = await Promise.all([
      getTopMastery(puuid, region, 3),
      fetchMoreMatches(puuid, region, 0, 10)
    ]);

    const soloQueue = leagues.find((l: LeagueItem) => l.queueType === "RANKED_SOLO_5x5") || null;
    const winRate = soloQueue ? Math.round((soloQueue.wins / (soloQueue.wins + soloQueue.losses)) * 100) : 0;
    
    // Predetermined favorite champ for background based on top mastery
    const favoriteChampId = topMastery[0]?.championId || 421; 
    const favoriteChamp = Object.values(allChampions).find(c => Number(c.key) === favoriteChampId);
    const favoriteChampName = (favoriteChamp as Champion)?.id || "RekSai";

    return (
      <div className="relative min-h-screen bg-surface">
        {/* Dynamic Background Wrapper */}
        <div className="absolute top-0 left-0 right-0 h-[500px] z-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-surface/0 via-surface/80 to-surface z-10" />
          <Image 
            src={getChampionSplash(favoriteChampId)}
            alt="Favorite Champ Background" 
            fill 
            sizes="100vw"
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
                          src={getDDragonProfileIcon(version, summoner.profileIconId)}
                          alt="Profile Icon"
                          fill
                          sizes="160px"
                          className="object-cover group-hover:scale-110 transition-transform duration-700"
                        />
                     </div>
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-hextech-gold text-hextech-blue font-display font-bold text-sm rounded-sm shadow-xl tracking-tighter">
                     LVL {summoner.summonerLevel}
                  </div>
                </div>

                <div className="flex-1 text-center lg:text-left">
                  <div className="editorial-header mb-4">
                     <span>Summoner Found</span>
                     <h1 className="text-4xl md:text-7xl leading-none">
                       {gameName}
                       <span className="text-hextech-gold opacity-40 ml-2">#{tagLine}</span>
                     </h1>
                  </div>
                  
                  <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-4">
                     <ArchiveUpdateButton 
                       region={region} 
                       gameName={gameName} 
                       tagLine={tagLine} 
                     />
                     <Button variant="secondary" size="sm">Signal Trace</Button>
                  </div>
                </div>

                {/* Top Level Stats Pane */}
                <div className="flex gap-16 border-l border-white/5 pl-16 hidden xl:flex h-24 items-end mb-4">
                   <div className="text-right">
                      <span className="block text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mb-3">Win Rate</span>
                      <span className="text-5xl font-display text-white font-bold leading-none">{winRate}<span className="text-hextech-gold">%</span></span>
                   </div>
                   <div className="text-right">
                      <span className="block text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mb-3">Matches Played</span>
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
                 <h3 className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold/40 mb-10">Ranked Stats</h3>
                 
                  <PastRanks rankHistory={player?.rankHistory} />

                  <div className="flex items-center gap-8 mb-10">
                    <div className="w-24 h-24 bg-surface-bright flex items-center justify-center border border-hextech-gold/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
                       {soloQueue ? (
                         <Image 
                           src={getRankEmblem(soloQueue.tier)} 
                           alt={soloQueue.tier} 
                           fill 
                           className="object-contain p-2 group-hover:scale-110 transition-transform duration-500" 
                         />
                       ) : (
                         <span className="text-5xl font-display font-light text-hextech-gold group-hover:scale-110 transition-transform">U</span>
                       )}
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

              {/* Recent Players Sidebar */}
              <RecentPlayersSidebar matches={matches} puuid={puuid} />
            </aside>

            {/* Right Main Content: Logs */}
            <div className="lg:col-span-8 space-y-12">
               <div className="flex items-end justify-between border-b border-white/5 pb-6">
                  <div className="editorial-header">
                     <span>Database Feed</span>
                     <h3 className="text-3xl uppercase">Combat Logs</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Recent Matches</span>
               </div>

               <div className="space-y-4">
                   {matches.length > 0 ? (
                <MatchList 
                  initialMatches={matches} 
                  puuid={puuid} 
                  region={region}
                  version={version}
                  items={items}
                  spellMap={spellMap}
                  runeMap={runeMap}
                />
                   ) : (
                    <div className="p-20 text-center border-2 border-dashed border-white/5 bg-surface/30">
                       <span className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold/20 block mb-4">Integrity Check Failed // Logs Empty</span>
                       <p className="text-slate-600 text-sm font-light max-w-xs mx-auto">We couldn't find any recent matches for this player.</p>
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
          <Button variant="secondary" fullWidth>Retry Trace</Button>
        </Card>
      </div>
    );
  }
}

