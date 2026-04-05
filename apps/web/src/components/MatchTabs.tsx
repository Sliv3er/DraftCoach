'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from './ui/Card';
import { ItemTooltip } from './ItemTooltip';

interface MatchTabsProps {
  match: any;
  items: any;
  version: string;
  region: string;
}

export function MatchTabs({ match, items, version, region }: MatchTabsProps) {
  const [activeTab, setActiveTab] = useState('Post Game');
  
  const tabs = ['Post Game', 'Performance', 'Item Build', 'Timeline', 'Metrics'];
  
  const team100 = match.info.participants.filter((p: any) => p.teamId === 100);
  const team200 = match.info.participants.filter((p: any) => p.teamId === 200);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Primary Navigation Tabs */}
      <div className="flex gap-1 border-b border-white/5 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] transition-all relative
              ${activeTab === tab 
                ? 'bg-white/5 text-hextech-gold' 
                : 'text-slate-500 hover:text-white hover:bg-white/[0.02]'}
            `}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-hextech-gold shadow-[0_0_10px_rgba(196,151,85,0.5)]" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'Post Game' && (
        <div className="space-y-12">
          {[team100, team200].map((team, idx) => {
            const isWin = team[0].win;
            const teamId = team[0].teamId;
            return (
              <div key={teamId} className="space-y-4">
                {/* Team Status Header */}
                <div className="grid grid-cols-[1fr_80px_100px_80px_60px_60px_180px] items-center px-6 py-2 bg-white/[0.02] border-y border-white/5">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-black uppercase tracking-tighter ${isWin ? 'text-hextech-gold' : 'text-red-500/80'}`}>
                      {isWin ? 'Victory' : 'Defeat'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      ({idx === 0 ? 'Blue Team' : 'Red Team'})
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center">KDA</span>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center">Damage</span>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center">Gold</span>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center">CS</span>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center">Wards</span>
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center">Items</span>
                </div>

                <div className="space-y-1">
                  {team.map((p: any) => (
                    <Card 
                      key={p.puuid} 
                      variant="glass" 
                      noOverflow 
                      className={`
                        py-3 px-6 grid grid-cols-[1fr_80px_100px_80px_60px_60px_180px] items-center gap-2
                        border-l-4 transition-all hover:bg-white/[0.02]
                        ${isWin ? 'border-l-hextech-gold/30' : 'border-l-white/5'}
                      `}
                    >
                      {/* Subject Information */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="relative w-10 h-10 rounded-sm overflow-hidden border border-white/10 flex-shrink-0">
                          <Image 
                            src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`}
                            alt="Champion"
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <Link 
                            href={`/summoner/${region}/${p.riotIdGameName}-${p.riotIdTagline}`}
                            className="text-xs font-black text-white uppercase truncate tracking-wider hover:text-hextech-gold transition-colors"
                          >
                            {p.riotIdGameName || p.summonerName}
                          </Link>
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter opacity-60">Level {p.champLevel}</span>
                        </div>
                      </div>

                      {/* KDA */}
                      <div className="text-center">
                        <span className="text-xs font-bold text-white block leading-none">
                          {p.kills}/{p.deaths}/{p.assists}
                        </span>
                        <span className="text-[9px] text-slate-600 font-bold uppercase">
                          {((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2)}
                        </span>
                      </div>

                      {/* Damage */}
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-white block">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</span>
                        <div className="w-12 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                           <div 
                             className="h-full bg-hextech-gold/40" 
                             style={{ width: `${Math.min(100, (p.totalDamageDealtToChampions / 50000) * 100)}%` }} 
                           />
                        </div>
                      </div>

                      {/* Gold */}
                      <div className="text-center">
                        <span className="text-xs font-bold text-hextech-gold/80">{(p.goldEarned / 1000).toFixed(1)}k</span>
                      </div>

                      {/* CS */}
                      <div className="text-center">
                        <span className="text-xs font-bold text-white block">{p.totalMinionsKilled + p.neutralMinionsKilled}</span>
                      </div>

                      {/* Wards */}
                      <div className="text-center">
                        <span className="text-xs font-bold text-white block">{p.visionScore}</span>
                      </div>

                      {/* Items */}
                      <div className="flex gap-1 justify-end">
                        {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item: number, i: number) => (
                          <ItemTooltip key={i} item={items[item]} itemId={item} version={version} />
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab !== 'Post Game' && (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-white/5 rounded-lg bg-white/[0.01]">
          <div className="w-12 h-12 border-2 border-hextech-gold/20 border-t-hextech-gold rounded-full animate-spin mb-6" />
          <h3 className="text-xl font-bold uppercase tracking-widest text-white/40">Analyzing Data Streams...</h3>
          <p className="text-slate-600 text-xs mt-2 uppercase tracking-tighter">Telemetries for {activeTab} are being processed</p>
        </div>
      )}
    </div>
  );
}
