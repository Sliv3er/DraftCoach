"use client";

import React from 'react';
import Image from 'next/image';
import { Match, MatchParticipant, getDDragonChampionIcon, getDDragonItemIcon, getDDragonSpellIcon, SpellMap, RuneMap } from '@/lib/riot';
import { ItemTooltip } from '@/components/ItemTooltip';
import { RuneIcon } from './RuneIcon';
import { SummonerSpellTooltip } from './SummonerSpellTooltip';

interface MatchDetailsProps {
  match: Match;
  puuid: string;
  version: string;
  items: any;
  spellMap: SpellMap;
  runeMap: RuneMap;
}

export const MatchDetails: React.FC<MatchDetailsProps> = ({ 
  match, 
  puuid, 
  version, 
  items,
  spellMap,
  runeMap
}) => {
  const participants = match.info.participants;
  const team1 = participants.slice(0, 5);
  const team2 = participants.slice(5, 10);

  const renderTeam = (team: MatchParticipant[], teamName: string, isWin: boolean) => (
    <div className="flex-1 min-w-[300px]">
      <div className={`flex items-center justify-between px-3 py-1.5 mb-2 rounded-sm border-l-2 ${isWin ? 'bg-hextech-accent-success/5 border-hextech-accent-success/30' : 'bg-hextech-accent-error/5 border-hextech-accent-error/30'}`}>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${isWin ? 'text-hextech-accent-success' : 'text-hextech-accent-error'}`}>
          {isWin ? 'Victory Team' : 'Defeat Team'}
        </span>
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{teamName}</span>
      </div>
      <div className="space-y-px">
        {team.map((p) => {
          const isMe = p.puuid === puuid;
          const kdaRatio = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);
          
          return (
            <div key={p.puuid} className={`flex items-center gap-3 p-2 transition-all hover:bg-white/5 rounded-sm ${isMe ? 'bg-white/10 ring-1 ring-white/10 shadow-lg' : ''}`}>
                <div className="flex gap-1 items-center">
                   <div className="w-8 h-8 relative rounded-full overflow-hidden border border-white/10 bg-surface-bright shrink-0">
                     <Image src={getDDragonChampionIcon(version, p.championName)} alt={p.championName} fill className="object-cover" />
                   </div>
                   <div className="flex flex-col gap-0.5">
                      <div className="flex gap-0.5">
                        {[p.summoner1Id, p.summoner2Id].map((id, i) => {
                          const spellData = spellMap[String(id)];
                          return (
                            <SummonerSpellTooltip key={i} spellId={id} spellData={spellData} version={version}>
                              <div className="w-3.5 h-3.5 relative rounded-[2px] overflow-hidden border border-white/10 shrink-0">
                                  {spellData ? <Image src={getDDragonSpellIcon(version, spellData.image)} alt={spellData.name} fill /> : null}
                              </div>
                            </SummonerSpellTooltip>
                          );
                        })}
                      </div>
                      <div className="flex gap-0.5">
                        <RuneIcon 
                          runeId={p.perks.styles[0].selections[0].perk} 
                          runeMap={runeMap} 
                          size={14} 
                          className="bg-transparent"
                        />
                        <RuneIcon 
                          runeId={p.perks.styles[1].style} 
                          runeMap={runeMap} 
                          size={14} 
                          className="bg-transparent opacity-60"
                        />
                      </div>
                   </div>
                </div>

               {/* Name & KDA */}
               <div className="flex-1 min-w-[80px]">
                 <span className={`text-[11px] font-bold block truncate ${isMe ? 'text-hextech-gold' : 'text-slate-300'}`}>
                   {p.riotIdGameName || p.summonerName}
                 </span>
                 <span className="text-[10px] text-slate-500 font-bold tracking-tighter">
                   {p.kills}/{p.deaths}/{p.assists} <span className="opacity-50 inline-block ml-1">({kdaRatio})</span>
                 </span>
               </div>

               {/* Items */}
               <div className="flex gap-0.5 items-center bg-black/10 p-0.5 rounded-sm overflow-hidden">
                 {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item, i) => (
                    <ItemTooltip 
                      key={i} 
                      itemId={item} 
                      item={items[item] || null} 
                      version={version}
                      className="w-5 h-5"
                    />
                 ))}
               </div>

               {/* Damage Graph Inline */}
               <div className="w-16 hidden xl:block">
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5 text-right font-display">{Math.round(p.totalDamageDealtToChampions / 1000)}K</div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${isMe ? 'bg-hextech-gold' : 'bg-slate-500'}`} 
                      style={{ width: `${Math.min(100, (p.totalDamageDealtToChampions / 60000) * 100)}%` }}
                    />
                  </div>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mt-4 pt-6 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex flex-col lg:flex-row gap-8">
        {renderTeam(team1, "Kinetic Axis", team1[0].win)}
        {renderTeam(team2, "Opposing Vector", team2[0].win)}
      </div>
    </div>
  );
};
