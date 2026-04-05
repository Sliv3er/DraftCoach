import Link from 'next/link';
import { MatchTabs } from '@/components/MatchTabs';
import { getMatchDetails, getRoutingRegion, getLatestDDragonVersion, getItems } from '@/lib/riot';

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

    return (
      <div className="min-h-screen bg-[#050507] text-slate-100 p-6 lg:p-12 relative overflow-hidden font-display">
        {/* Background Decorative Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <main className="max-w-7xl mx-auto relative z-10 space-y-12">
          {/* Header Block */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-[1px] bg-hextech-gold/30" />
                <span className="text-[10px] uppercase font-bold tracking-[0.4em] text-hextech-gold/60">
                  Combat Chronology // {matchId}
                </span>
              </div>
              <h1 className="text-5xl lg:text-6xl font-black uppercase tracking-tighter">
                Match <span className="text-hextech-gold text-outline">Registry</span>
              </h1>
              <div className="flex items-center gap-6 text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-hextech-gold shadow-[0_0_8px_rgba(196,151,85,0.4)]" />
                  {match.info.gameMode}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white/10" />
                  {new Date(match.info.gameCreation).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white/10" />
                  {Math.floor(match.info.gameDuration / 60)}m {match.info.gameDuration % 60}s
                </div>
              </div>
            </div>
            <Link 
              href="/" 
              className="group flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/10 rounded-sm text-[10px] uppercase font-bold tracking-[0.3em] text-hextech-gold hover:bg-hextech-gold hover:text-hextech-blue transition-all"
            >
              &lt; Return to Surface
            </Link>
          </div>

          {/* Tabbed Interface */}
          <MatchTabs 
            match={match} 
            items={items} 
            version={version} 
            region={region} 
          />
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
