import SearchInput from "@/components/SearchInput";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import Link from "next/link";
import { getLatestDDragonVersion, getChampions, getDDragonSplash } from "@/lib/riot";

export default async function Home() {
  const version = await getLatestDDragonVersion();
  const championsData = await getChampions(version);
  const champions = Object.values(championsData).slice(0, 4);

  return (
    <div className="relative w-full">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-surface via-surface/80 to-hextech-gold/5 z-10" />
          <Image
            src="https://ddragon.leagueoflegends.com/cdn/img/champion/splash/RekSai_0.jpg"
            alt="Background"
            fill
            sizes="100vw"
            className="object-cover opacity-20 scale-110 blur-sm"
            priority
          />
        </div>

        <div className="relative z-20 max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="space-y-4">
            <span className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold/60 block">
              DraftCoach
            </span>
            <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter text-white leading-[0.85]">
              The Ultimate <br />
              <span className="text-hextech-gold text-outline">Coach</span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
              Precision drafting and real-time analytics. Turn raw data into a tactical advantage with our high-fidelity Vanguard interface.
            </p>
          </div>

          <div className="max-w-xl mx-auto">
            <SearchInput variant="hero" />
          </div>

          <div className="flex items-center justify-center gap-12 pt-8">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl font-black text-white">160+</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Champions Analyzed</span>
            </div>
            <div className="w-[1px] h-12 bg-white/10" />
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl font-black text-white">20k+</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Matches Indexed</span>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Champions Section */}
      <section className="py-32 border-y border-white/5 bg-hextech-blue-lighter/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[url('/grid.svg')] bg-repeat opacity-[0.02]" />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between mb-20 gap-8">
            <div className="space-y-4 text-center md:text-left">
              <h2 className="text-4xl font-display font-black uppercase tracking-tighter text-white sm:text-5xl">
                Elite <span className="text-hextech-gold">Vanguard</span>
              </h2>
              <p className="text-slate-400 max-w-md font-medium leading-relaxed">
                Real-time extraction from the global database. Analyzing the top metadata shards.
              </p>
            </div>
            <Link href="/champions">
              <Button size="lg" className="bg-hextech-gold hover:bg-hextech-gold-bright text-hextech-blue font-bold px-8 shadow-hextech-ambient rounded-none">
                View Champions
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {champions.map((champion, i) => (
              <div key={champion.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both" style={{ animationDelay: `${i * 100}ms` }}>
                <Card variant="glass" className="group overflow-hidden border-white/5 hover:border-hextech-gold/30 transition-all duration-500">
                  <div className="relative h-48 w-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-hextech-blue to-transparent z-10 opacity-60" />
                    <Image
                      src={getDDragonSplash(champion.id)}
                      alt={champion.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 25vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute bottom-4 left-4 z-20">
                      <span className="text-[10px] uppercase font-bold tracking-[0.3em] text-hextech-gold/70">Subject File</span>
                      <h3 className="text-lg font-black uppercase text-white tracking-widest">{champion.name}</h3>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-xs text-slate-400 font-medium leading-relaxed italic opacity-80 line-clamp-2">
                      &quot;{champion.title}&quot;
                    </p>
                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                      <div className="flex gap-2">
                        {champion.tags.slice(0, 1).map((tag) => (
                          <div key={tag} className="px-2 py-1 bg-white/5 rounded-sm border border-white/5 text-[8px] uppercase font-bold tracking-widest text-slate-400">
                            {tag}
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-hextech-gold/50 font-mono">#{champion.key.padStart(4, '0')}</span>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Bricks */}
      <section className="py-32 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="space-y-6">
          <div className="w-12 h-12 bg-hextech-gold/10 flex items-center justify-center rounded-lg border border-hextech-gold/20">
            <span className="text-hextech-gold font-black">01</span>
          </div>
          <h4 className="text-xl font-bold uppercase tracking-widest text-white">Draft Synergy</h4>
          <p className="text-slate-400 text-sm leading-relaxed">Advanced algorithms calculate team compositions based on millions of Challenger-tier matches.</p>
        </div>
        <div className="space-y-6">
          <div className="w-12 h-12 bg-hextech-gold/10 flex items-center justify-center rounded-lg border border-hextech-gold/20">
            <span className="text-hextech-gold font-black">02</span>
          </div>
          <h4 className="text-xl font-bold uppercase tracking-widest text-white">Real-Time Data</h4>
          <p className="text-slate-400 text-sm leading-relaxed">Direct connection to the Vanguard Vanguard network ensures sub-second latency for all profile lookups.</p>
        </div>
        <div className="space-y-6">
          <div className="w-12 h-12 bg-hextech-gold/10 flex items-center justify-center rounded-lg border border-hextech-gold/20">
            <span className="text-hextech-gold font-black">03</span>
          </div>
          <h4 className="text-xl font-bold uppercase tracking-widest text-white">Elite Analytics</h4>
          <p className="text-slate-400 text-sm leading-relaxed">High-fidelity visualization of your performance patterns and neural match predictions.</p>
        </div>
      </section>
    </div>
  );
}
