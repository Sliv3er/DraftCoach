"use client";


import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Match, MatchParticipant, ItemMap } from '@/lib/riot';
import { Card } from '@/components/ui/Card';
import { ItemTooltip } from '@/components/ItemTooltip';

interface MatchTabsProps {
  match: Match;
  items: ItemMap;
  version: string;
  region: string;
}

export const MatchTabs: React.FC<MatchTabsProps> = ({ match, items, version, region }) => {
  const [activeTab, setActiveTab] = useState<'post' | 'performance' | 'build' | 'timeline'>('post');

  const tabs = [
    { id: 'post', label: 'Post Game' },
    { id: 'performance', label: 'Performance' },
    { id: 'build', label: 'Item Build' },
    { id: 'timeline', label: 'Timeline & Metrics' },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Tab Navigation */}
      <div className="flex gap-12 border-b border-white/5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-4 text-[10px] uppercase font-bold tracking-[0.4em] transition-all relative ${
              activeTab === tab.id ? 'text-hextech-gold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-hextech-gold shadow-[0_0_10px_rgba(196,151,85,0.4)]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'post' && (
          <div className="grid grid-cols-1 gap-4">
            {match.info.participants.map((p: MatchParticipant) => (
              <Card 
                key={p.puuid} 
                variant="glass" 
                className={`p-6 flex items-center gap-8 ${p.win ? 'border-l-4 border-l-hextech-accent-success/40' : 'border-l-4 border-l-hextech-accent-error/40'}`}
              >
                <div className="w-16 h-16 relative rounded-sm overflow-hidden border border-white/10 shrink-0">
                  <Image 
                    src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`}
                    alt={p.championName}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                  <div className="absolute bottom-0 right-0 bg-black/80 px-1.5 py-0.5 text-[8px] font-bold text-white">
                    {p.champLevel}
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <Link 
                      href={`/summoner/${region}/${p.riotIdGameName}-${p.riotIdTagline}`}
                      className="text-sm font-bold text-white hover:text-hextech-gold transition-colors truncate max-w-[120px]"
                    >
                      {p.riotIdGameName}
                    </Link>
                    <span className="text-[10px] text-slate-500 font-bold opacity-40 uppercase tracking-widest">
                       #{p.riotIdTagline}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span className="text-white">{p.kills} / <span className="text-hextech-accent-error">{p.deaths}</span> / {p.assists}</span>
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                    <span>{((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2)} KDA</span>
                  </div>
                </div>

                <div className="hidden md:flex gap-1">
                  {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item, i) => (
                    <div key={i} className="w-8 h-8 bg-black/40 rounded-sm border border-white/5 overflow-hidden">
                      <ItemTooltip item={items[item]} itemId={item} version={version} />
                    </div>
                  ))}
                </div>

                <div className="text-right w-24">
                  <span className="block text-sm font-bold text-white tracking-tighter">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}K</span>
                  <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Dealt</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
             <div className="w-12 h-0.5 bg-hextech-gold/30 mb-6" />
             <h4 className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold mb-2">Metrics Processing</h4>
             <p className="text-sm font-light max-w-sm">Deeper performance heuristics are currently being analyzed from the match data.</p>
          </div>
        )}

        {/* ... Other tabs similarly placeholders with Hextech style ... */}
      </div>
    </div>
  );
};
