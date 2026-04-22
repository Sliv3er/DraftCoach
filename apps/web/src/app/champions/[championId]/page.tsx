"use client";

import { getDDragonSplash } from "@/lib/riot";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { notFound } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, Zap, Shield, Wand2, Info } from "lucide-react";
import { useEffect, useState, use } from "react";


interface RoleData {
  winRate: string;
  runes: {
    primary: string;
    primaryIcon?: string;
    keystone: string;
    keystoneIcon?: string;
    runes: string[];
    runeIcons?: (string | null)[];
    secondary: string;
    secondaryIcon?: string;
    secondaryRunes: string[];
    secondaryRuneIcons?: (string | null)[];
  };
  items: {
    starting: string[];
    startingIcons?: (string | null)[];
    core: string[];
    coreIcons?: (string | null)[];
    situational: string[];
    situationalIcons?: (string | null)[];
  };
}

interface ChampionDetails {
  championId: string;
  winRate: string;
  tier: string;
  pickRate: string;
  roles: Record<string, RoleData>;
  summary: string;
}

interface Champion {
  id: string;
  name: string;
  title: string;
  tags: string[];
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
}

export default function ChampionPage({ params }: { params: Promise<{ championId: string }> }) {
  const { championId } = use(params);
  const [champion, setChampion] = useState<Champion | null>(null);
  const [analytics, setAnalytics] = useState<ChampionDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        const versions = await versionRes.json();
        const v = versions[0];
        
        const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`);
        const champs = await champRes.json();
        const c = champs.data[championId];
        
        if (!c) {
          setLoading(false);
          return;
        }
        setChampion(c);

        const analyticsRes = await fetch(`/api/champions/${championId}`);
        if (analyticsRes.ok) {
          const data = await analyticsRes.json();
          setAnalytics(data.details);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [championId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 border-4 border-hextech-gold border-t-transparent rounded-full animate-spin" />
        <p className="text-hextech-gold font-bold tracking-widest uppercase animate-pulse">Syncing Database...</p>
      </div>
    );
  }

  if (!champion) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-hextech-gold/30 pb-20">
      {/* Hero Section */}
      <div className="relative h-[70vh] w-full overflow-hidden">
        <motion.div 
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.6 }}
          transition={{ duration: 1.5 }}
          className="absolute inset-0"
        >
          <Image 
            src={getDDragonSplash(championId)}
            alt={champion.name}
            fill
            className="object-cover"
            priority
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-transparent to-transparent" />
        
        <div className="absolute top-8 left-8 z-50">
          <Link 
            href="/champions" 
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-widest">Database</span>
          </Link>
        </div>

        <div className="absolute bottom-0 left-0 w-full p-8 md:p-16 max-w-7xl mx-auto">
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <div className="flex flex-wrap items-center gap-3 mb-6">
              {champion.tags.map(tag => (
                <span key={tag} className="px-4 py-1.5 bg-hextech-gold/10 border border-hextech-gold/20 text-hextech-gold text-[10px] font-black uppercase tracking-[0.2em] rounded-full">
                  {tag}
                </span>
              ))}
              {analytics && (
                <span className="px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-full">
                  Tier {analytics.tier}
                </span>
              )}
            </div>
            <h1 className="text-7xl md:text-9xl font-black uppercase tracking-tighter mb-4 text-white leading-none">
              {champion.name}
            </h1>
            <p className="text-xl md:text-3xl text-slate-300 font-medium italic max-w-3xl opacity-80 border-l-4 border-hextech-gold pl-6 py-2">
              "{champion.title}"
            </p>

            {analytics && (
              <div className="flex gap-12 mt-12 pt-12 border-t border-white/10">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] uppercase font-black tracking-[0.3em] mb-2">Win Rate</span>
                  <span className="text-5xl font-black text-hextech-gold tracking-tighter">{analytics.winRate}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] uppercase font-black tracking-[0.3em] mb-2">Pick Rate</span>
                  <span className="text-5xl font-black text-white tracking-tighter">{analytics.pickRate}</span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 -mt-20 relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Left Column: Summary & Info */}
        <motion.div 
          initial={{ x: -50, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true }}
          className="lg:col-span-1 space-y-12"
        >
          <Card variant="glass" className="p-8 space-y-10 border-white/5">
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-hextech-gold mb-6 flex items-center gap-3">
                <Info className="w-4 h-4" /> Strategic Summary
              </h2>
              <p className="text-slate-300 leading-relaxed text-lg font-medium">
                {analytics?.summary || `Master the art of ${champion.name}. Learn the most effective builds, runes, and tactical strategies to dominate the Rift in the current meta.`}
              </p>
            </section>

            <section>
               <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-hextech-gold mb-6">Complexity Index</h2>
              <div className="flex items-center gap-2">
                 {[...Array(3)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-2.5 flex-1 rounded-full ${i < champion.info.difficulty / 3.3 ? 'bg-hextech-gold shadow-[0_0_15px_rgba(196,151,87,0.6)]' : 'bg-slate-800'}`} 
                    />
                  ))}
                  <span className="ml-4 text-xs font-black text-slate-400 uppercase tracking-widest">
                    {champion.info.difficulty > 7 ? 'High' : champion.info.difficulty > 4 ? 'Medium' : 'Low'}
                  </span>
              </div>
            </section>

            <section className="pt-10 border-t border-white/5">
               <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-8">Performance Matrix</h3>
               <div className="space-y-8">
                  <StatBar label="Offensive" value={champion.info.attack} icon={<Zap className="w-3 h-3" />} color="bg-gradient-to-r from-red-500 to-orange-500" />
                  <StatBar label="Defensive" value={champion.info.defense} icon={<Shield className="w-3 h-3" />} color="bg-gradient-to-r from-blue-500 to-cyan-500" />
                  <StatBar label="Magical" value={champion.info.magic} icon={<Wand2 className="w-3 h-3" />} color="bg-gradient-to-r from-purple-500 to-pink-500" />
               </div>
            </section>
          </Card>
        </motion.div>

        {/* Right Column: Roles & Builds */}
        <div className="lg:col-span-2 space-y-16">
          {analytics ? (
            Object.entries(analytics.roles).map(([role, data], idx) => (
              <motion.section 
                key={role} 
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="relative"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4">
                    <span className="text-hextech-gold/30 font-display">0{idx + 1}</span> {role} Meta
                    <span className="text-[10px] bg-hextech-gold/10 text-hextech-gold border border-hextech-gold/20 px-3 py-1 rounded-full font-black uppercase tracking-widest">
                      {data.winRate} WR
                    </span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Runes */}
                  <Card variant="accent" className="p-8 backdrop-blur-xl border-white/5 hover:border-hextech-gold/20 transition-colors group">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-hextech-gold mb-8 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-hextech-gold animate-pulse" /> Rune Configuration
                    </h3>
                    <div className="space-y-8">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(196,151,87,0.2)]">
                          {data.runes.keystoneIcon ? (
                            <Image src={data.runes.keystoneIcon} alt={data.runes.keystone} width={64} height={64} className="w-full h-full object-contain p-2" />
                          ) : (
                            <span className="text-3xl font-black text-hextech-gold">{data.runes.keystone[0]}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xl font-black text-white uppercase tracking-tight">{data.runes.keystone}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {data.runes.primaryIcon && <Image src={data.runes.primaryIcon} alt={data.runes.primary} width={16} height={16} className="w-4 h-4 opacity-60" />}
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{data.runes.primary} Tree</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {data.runes.runes.map((rune, i) => (
                          <div key={rune} className="px-4 py-2 bg-white/5 rounded-lg text-xs font-bold text-slate-300 flex items-center gap-3 hover:bg-white/10 transition-colors">
                            {data.runes.runeIcons?.[i] ? (
                              <Image src={data.runes.runeIcons[i]!} alt={rune} width={24} height={24} className="w-6 h-6" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                            )}
                            {rune}
                          </div>
                        ))}
                      </div>

                      <div className="pt-8 border-t border-white/5">
                        <div className="flex items-center gap-2 mb-4">
                          {data.runes.secondaryIcon && <Image src={data.runes.secondaryIcon} alt={data.runes.secondary} width={14} height={14} className="w-3.5 h-3.5 opacity-50" />}
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Secondary: {data.runes.secondary}</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                           {data.runes.secondaryRunes.map((rune, i) => (
                            <div key={rune} className="px-3 py-1.5 bg-white/5 border border-white/5 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 hover:border-white/20 transition-all">
                              {data.runes.secondaryRuneIcons?.[i] && (
                                <Image src={data.runes.secondaryRuneIcons[i]!} alt={rune} width={16} height={16} className="w-4 h-4" />
                              )}
                              {rune}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>


                  {/* Build */}
                  <Card variant="accent" className="p-8 backdrop-blur-xl border-white/5 hover:border-blue-500/20 transition-colors group">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 mb-8 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Equipment Loadout
                    </h3>
                    <div className="space-y-10">
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Starter Strategy</p>
                        <div className="flex flex-wrap gap-4">
                          {data.items.starting.map((item, i) => (
                            <div key={item} className="flex flex-col items-center gap-2">
                              <div className="w-12 h-12 bg-slate-800 rounded-xl border border-white/5 flex items-center justify-center overflow-hidden hover:border-blue-500/40 transition-colors">
                                {data.items.startingIcons?.[i] ? (
                                  <Image src={data.items.startingIcons[i]!} alt={item} width={48} height={48} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-6 h-6 bg-slate-700 rounded-full" />
                                )}
                              </div>
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter text-center max-w-[60px] truncate">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Core Item Path</p>

                        <div className="grid grid-cols-1 gap-3">
                          {data.items.core.map((item, i) => (
                            <div key={item} className="flex items-center gap-4">
                              <span className="text-[10px] font-black text-blue-500/40 w-4">{i + 1}</span>
                              <div className="flex-1 flex items-center gap-4 px-4 py-3 bg-blue-500/5 border border-blue-500/10 rounded-xl group-hover:translate-x-2 transition-transform">
                                {data.items.coreIcons?.[i] && (
                                  <Image src={data.items.coreIcons[i]!} alt={item} width={32} height={32} className="w-8 h-8 rounded-lg shadow-lg" />
                                )}
                                <span className="text-sm font-black text-blue-300 uppercase tracking-tight">{item}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Tactical Adaptations</p>
                        <div className="flex flex-wrap gap-2">
                          {data.items.situational.map((item, i) => (
                            <div key={item} className="px-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-colors">
                              {data.items.situationalIcons?.[i] && (
                                <Image src={data.items.situationalIcons[i]!} alt={item} width={20} height={20} className="w-5 h-5 rounded-md" />
                              )}
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </motion.section>
            ))
          ) : (

            <div className="flex flex-col items-center justify-center py-40 text-slate-500 space-y-8 border-2 border-dashed border-white/5 rounded-[3rem] bg-slate-900/20 backdrop-blur-sm">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-hextech-gold/20 border-t-hextech-gold rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 bg-hextech-gold/20 rounded-full animate-ping" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-white uppercase tracking-tighter mb-2">Synthesizing Combat Intel</p>
                <p className="text-sm font-medium text-slate-500">Querying global performance benchmarks...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em]">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{icon}</span>
          <span className="text-slate-400">{label}</span>
        </div>
        <span className="text-hextech-gold">{value}/10</span>
      </div>
      <div className="h-2 w-full bg-slate-800/50 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          whileInView={{ width: `${value * 10}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={`h-full ${color} rounded-full relative`}
        >
          <div className="absolute top-0 right-0 h-full w-4 bg-white/20 blur-sm" />
        </motion.div>
      </div>
    </div>
  );
}
