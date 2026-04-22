import { getLatestDDragonVersion, getChampions } from "@/lib/riot";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default async function ChampionsPage() {
  const version = await getLatestDDragonVersion();
  const championsData = await getChampions(version);
  const champions = Object.values(championsData);

  // Sort by name
  champions.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="pt-8 pb-20 px-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="editorial-header mb-12">
        <span className="mb-2">DATABASE ACCESS / v{version}</span>
        <h1 className="text-5xl font-extrabold uppercase tracking-tighter mb-4">
          Champion <span className="text-hextech-gold text-outline">Database</span>
        </h1>
        <p className="text-slate-400 max-w-xl">
          Complete intelligence on all frontline combatants. Filter by role, tier, or mechanical difficulty.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {champions.map((champ) => (
          <Link 
            key={champ.id} 
            href={`/champions/${champ.id}`}
            className="block h-full"
          >
            <Card 
              variant="accent" 
              interactive 
              className="group aspect-[3/4] p-0 flex flex-col items-center justify-end overflow-hidden"
            >
              {/* Champion Splash/Loading Image */}
              <div className="absolute inset-0 z-0">
                 <div className="absolute inset-0 bg-gradient-to-t from-hextech-blue via-hextech-blue/20 to-transparent z-10" />
                 <Image 
                   src={`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champ.id}_0.jpg`}
                   alt={champ.name}
                   fill
                   sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
                   className="object-cover group-hover:scale-110 transition-transform duration-500 opacity-80"
                 />
              </div>

              {/* Info Overlay */}
              <div className="relative z-20 w-full p-4 text-center">
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-hextech-gold/60 mb-1 block">
                  {champ.tags[0]}
                </span>
                <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider mb-2">
                  {champ.name}
                </h3>
                
                <div className="flex items-center justify-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-1 h-1 rounded-full ${i < champ.info.difficulty / 2 ? 'bg-hextech-gold' : 'bg-white/10'}`} 
                    />
                  ))}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
