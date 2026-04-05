import SearchInput from "@/components/SearchInput";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import Link from "next/link";
import { getLatestDDragonVersion, getChampions, getCDragonSplash, getCDragonChampionIcon } from "@/lib/riot";

export default async function Home() {
  const version = await getLatestDDragonVersion();
  const championsData = await getChampions(version);
  const champions = Object.values(championsData).slice(0, 4);

  return (
    <div className="relative min-h-screen bg-surface overflow-x-hidden">
      {/* Cinematic Background Layer */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-surface via-surface/80 to-hextech-gold/5 z-10" />
        <Image 
          src="https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Reksai_0.jpg"
          alt="Kinetic Background" 
          fill 
          className="object-cover opacity-20 scale-110 blur-sm"
          priority
        />
      </div>

      <main className="relative z-20 pt-32 pb-24 px-6 max-w-[1400px] mx-auto">
        {/* Hero Section - Asymmetrical & Massive */}
        <section className="flex flex-col lg:flex-row gap-16 items-start mb-32">
          <div className="lg:w-2/3">
            <div className="editorial-header mb-6">
              <span>System Version 2.0.4 // Live</span>
              <h1 className="text-7xl md:text-9xl leading-[0.9] lg:-ml-1">
                The Kinetic <br />
                <span className="text-hextech-gold">Archive</span>
              </h1>
            </div>
            
            <p className="text-slate-400 text-xl md:text-2xl max-w-2xl font-light mb-12 leading-relaxed tracking-tight">
              Precision drafting and real-time analytics. Turn raw data into a 
              <span className="text-slate-200"> tactical advantage</span> with our high-tech game interface.
            </p>

            <div className="max-w-xl">
              <SearchInput variant="hero" />
            </div>

            <div className="mt-12 flex items-center gap-8">
              <div className="flex -space-x-4">
                {champions.map((champ) => (
                  <div key={champ.id} className="w-14 h-14 rounded-full border-2 border-surface overflow-hidden shadow-hextech-ambient relative group transition-transform hover:scale-110 z-10 hover:z-20">
                    <Image 
                      src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.image.full}`} 
                      alt={champ.name} 
                      fill 
                      className="object-cover grayscale group-hover:grayscale-0 transition-all"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold mb-1">Global Stability</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-hextech-accent-success animate-pulse" />
                  <span className="text-sm font-mono text-hextech-accent-success font-bold">16.7.1 Pulse // Nominal</span>
                </div>
              </div>
            </div>
          </div>

          {/* Side Feature Card - Floating & Glass */}
          <div className="lg:w-1/3 w-full lg:mt-32">
            <Card variant="glass" className="p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-hextech-gold/5 rounded-full blur-3xl -mr-16 -mt-16" />
              <div className="relative z-10">
                <div className="text-hextech-gold mb-6">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-4 tracking-tight">NEURAL INJECTION</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-8">
                  Instant pro-meta rune configuration based on specific lane opponents and team synergy analytics. Sync directly to your client.
                </p>
                <Link href="/leaderboards">
                  <Button className="w-full hextech-gold-gradient text-hextech-blue font-bold uppercase tracking-widest text-xs py-4 shadow-lg shadow-hextech-gold/20">
                    Access Rankings
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* Feature Grid - Tonal Depth Definition */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
          <div className="p-10 bg-surface-container hover:bg-surface-container-high transition-colors group cursor-default">
            <span className="text-[10px] uppercase tracking-[0.4em] text-hextech-gold/60 font-bold mb-6 block">Module 01</span>
            <h4 className="text-2xl font-bold mb-4 tracking-tight group-hover:translate-x-2 transition-transform">DYNAMIC HUD</h4>
            <p className="text-slate-400 text-sm leading-relaxed font-light">
              Real-time gold differential, matchup spikes, and objective timers rendered as a seamless technical layer.
            </p>
          </div>

          <div className="p-10 bg-surface-container hover:bg-surface-container-high transition-colors group cursor-default">
            <span className="text-[10px] uppercase tracking-[0.4em] text-hextech-gold/60 font-bold mb-6 block">Module 02</span>
            <h4 className="text-2xl font-bold mb-4 tracking-tight group-hover:translate-x-2 transition-transform">COOLDOWN PULSE</h4>
            <p className="text-slate-400 text-sm leading-relaxed font-light">
              Intelligent prediction of enemy summoner spells. One click to sync with your team and never miss a window.
            </p>
          </div>

          <div className="p-10 bg-surface-container hover:bg-surface-container-high transition-colors group cursor-default lg:col-span-1 md:col-span-2">
            <span className="text-[10px] uppercase tracking-[0.4em] text-hextech-gold/60 font-bold mb-6 block">Module 03</span>
            <h4 className="text-2xl font-bold mb-4 tracking-tight group-hover:translate-x-2 transition-transform">RIOT COMPLIANT</h4>
            <p className="text-slate-400 text-sm leading-relaxed font-light">
              100% Riot Games TOS compliant. Built with official API integrations used by pro players worldwide.
            </p>
          </div>
        </section>

        {/* Live Archive Preview */}
        <section className="mt-40">
           <div className="flex justify-between items-end mb-12">
              <div className="editorial-header">
                <span>Database Feed</span>
                <h2 className="text-4xl md:text-6xl uppercase leading-none">Living <br />Artifacts</h2>
              </div>
              <div className="hidden md:block text-right">
                <span className="text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mb-2 block">Accuracy Rating</span>
                <span className="text-3xl font-display text-hextech-gold">99.8%</span>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="hextech-glass p-6 flex items-center justify-between card-victory group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-800 rounded shadow-inner overflow-hidden relative grayscale group-hover:grayscale-0 transition-all">
                    <Image src={getCDragonChampionIcon(103)} alt="Ahri" fill />
                  </div>
                  <div>
                    <h5 className="font-bold tracking-tight">Hide on bush</h5>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Grandmaster // 452 LP</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-hextech-accent-success font-bold block mb-1">ARCHIVE VICTORY</span>
                  <span className="text-xl font-display group-hover:text-hextech-accent-success transition-colors">6.50 KDA</span>
                </div>
              </div>

              <div className="hextech-glass p-6 flex items-center justify-between card-defeat group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-800 rounded shadow-inner overflow-hidden relative grayscale group-hover:grayscale-0 transition-all">
                    <Image src={getCDragonChampionIcon(81)} alt="Ezreal" fill />
                  </div>
                  <div>
                    <h5 className="font-bold tracking-tight">Doublelift</h5>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Challenger // 1205 LP</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-hextech-accent-error font-bold block mb-1">ARCHIVE DEFEAT</span>
                  <span className="text-xl font-display group-hover:text-hextech-accent-error transition-colors">0.88 KDA</span>
                </div>
              </div>
           </div>
        </section>
      </main>
      
      {/* Footer Branding */}
      <footer className="relative z-20 py-12 px-6 border-t border-white/5 bg-surface-container-lowest">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-hextech-gold rounded-sm rotate-45" />
              <span className="text-sm font-display tracking-[0.2em] font-bold uppercase">DraftCoach Kinetic Archive</span>
           </div>
           <div className="flex items-center gap-12 text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">
              <Link href="#" className="hover:text-hextech-gold transition-colors">Terms</Link>
              <Link href="#" className="hover:text-hextech-gold transition-colors">Privacy</Link>
              <Link href="#" className="hover:text-hextech-gold transition-colors">Discord</Link>
           </div>
           <span className="text-[10px] uppercase tracking-[0.3em] text-slate-600 font-bold">
             © 2024 Kinetic Archive Technology
           </span>
        </div>
      </footer>
    </div>
  );
}
