"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { Match, MatchParticipant, getDDragonChampionIcon, getDDragonItemIcon, SpellMap, RuneMap, getDDragonSpellIcon } from '@/lib/riot';
import { Card } from '@/components/ui/Card';
import { ItemTooltip } from './ItemTooltip';
import { MatchDetails } from './MatchDetails';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RuneIcon } from './RuneIcon';
import { SummonerSpellTooltip } from './SummonerSpellTooltip';

interface MatchCardProps {
  match: Match;
  puuid: string;
  version: string;
  items: any;
  spellMap: SpellMap;
  runeMap: RuneMap;
}

export const MatchCard: React.FC<MatchCardProps> = ({ 
  match, 
  puuid, 
  version, 
  items,
  spellMap,
  runeMap
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const participant = match.info.participants.find((p: MatchParticipant) => p.puuid === puuid);
  
  if (!participant) return null;
  const isWin = participant.win;
  const durationMin = Math.floor(match.info.gameDuration / 60);

  return (
    <Card 
      variant="glass"
      status={isWin ? 'victory' : 'defeat'} 
      noOverflow
      className={`p-6 transition-all border border-white/5 hover:border-hextech-gold/30 ${isExpanded ? 'shadow-2xl shadow-black/50 border-hextech-gold/20' : ''}`}
    >
      <div className="flex flex-wrap md:flex-nowrap items-center gap-6 relative group">
        
        {/* Mobile Expansion Overlay */}
        <div 
          className="absolute inset-0 z-0 cursor-pointer" 
          onClick={() => setIsExpanded(!isExpanded)} 
        />

        {/* Outcome Status Block */}
        <div className="w-20 hidden md:block relative z-10">
          <span className={`block text-[11px] font-bold uppercase tracking-[0.2em] mb-1 ${isWin ? 'text-hextech-accent-success' : 'text-hextech-accent-error'}`}>
            {isWin ? 'Sync' : 'Drop'}
          </span>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest opacity-60">
            {durationMin}m
          </span>
        </div>

        {/* Champion Icon & Spells/Runes */}
        <div className="flex items-center gap-2 relative z-10">
          <div className={`w-16 h-16 rounded-sm border-2 p-1 bg-surface transition-all ${isWin ? 'border-hextech-accent-success/20 group-hover:border-hextech-accent-success/40' : 'border-hextech-accent-error/20 group-hover:border-hextech-accent-error/40'}`}>
            <div className="w-full h-full relative overflow-hidden rounded-sm bg-surface-bright">
              <Image 
                src={getDDragonChampionIcon(version, participant.championName)}
                alt={participant.championName}
                fill
                sizes="80px"
                className="object-cover group-hover:scale-110 transition-transform"
              />
            </div>
          </div>

          {/* Summs & Runes */}
          <div className="flex flex-col gap-1">
             <div className="flex gap-1">
                {[participant.summoner1Id, participant.summoner2Id].map((id, i) => {
                  const spellData = spellMap[String(id)];
                  return spellData ? (
                    <SummonerSpellTooltip key={i} spellId={id} spellData={spellData} version={version}>
                      <div className="w-6 h-6 rounded-sm bg-surface-bright border border-white/5 overflow-hidden relative">
                         <Image 
                           src={getDDragonSpellIcon(version, spellData.image)}
                           alt={spellData.name}
                           fill
                           sizes="24px"
                         />
                      </div>
                    </SummonerSpellTooltip>
                  ) : <div key={i} className="w-6 h-6 bg-surface-bright border border-white/5" />;
                })}
             </div>
             <div className="flex gap-1">
                {participant.perks.styles.map((style, i) => (
                  <RuneIcon 
                    key={i}
                    runeId={i === 0 ? style.selections[0].perk : style.style}
                    runeMap={runeMap}
                    size={24}
                  />
                ))}
             </div>
          </div>
        </div>

        {/* Performance Matrix */}
        <div className="flex-1 min-w-[120px] relative z-10">
          <div className="flex items-baseline space-x-2 mb-1">
            <span className="text-xl font-display font-bold text-white tracking-tighter">{participant.kills}</span>
            <span className="text-slate-600 text-sm">/</span>
            <span className="text-xl font-display font-bold text-hextech-accent-error tracking-tighter">{participant.deaths}</span>
            <span className="text-slate-600 text-sm">/</span>
            <span className="text-xl font-display font-bold text-white tracking-tighter">{participant.assists}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-hextech-gold">
              {((participant.kills + participant.assists) / Math.max(1, participant.deaths)).toFixed(2)} KDA
            </span>
            <div className="w-1 h-1 rounded-full bg-white/10" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
               {participant.totalMinionsKilled + participant.neutralMinionsKilled} CS
            </span>
          </div>
        </div>

        {/* Item Grid */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-black/20 rounded-sm border border-white/5 relative z-20" onClick={(e) => e.stopPropagation()}>
          {[participant.item0, participant.item1, participant.item2, participant.item6, participant.item3, participant.item4, participant.item5].map((item, i) => (
             <ItemTooltip 
               key={i} 
               itemId={item} 
               item={items[item] || null} 
               version={version} 
             />
          ))}
        </div>

        {/* Combat Stats */}
        <div className="text-right hidden xl:block min-w-[80px] relative z-10">
          <span className="block text-sm font-display text-white font-bold tracking-tighter">{Math.round(participant.totalDamageDealtToChampions / 1000)}K Dmg</span>
          <span className="text-[10px] text-slate-500 font-bold tracking-[0.15em] uppercase">Output</span>
        </div>

        {/* Expansion Button */}
        <div className="relative z-20">
          <button 
             onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
             className={`w-10 h-10 rounded-sm flex items-center justify-center transition-all bg-white/5 hover:bg-white/10 ${isExpanded ? 'bg-hextech-gold/20 ring-1 ring-hextech-gold/30' : ''}`}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4 text-hextech-gold" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <MatchDetails 
          match={match} 
          puuid={puuid} 
          version={version} 
          items={items} 
          spellMap={spellMap}
          runeMap={runeMap}
        />
      )}
    </Card>
  );
};
