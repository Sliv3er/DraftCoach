"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Match, MatchParticipant, ItemMap } from '@/lib/riot';
import { Card } from '@/components/ui/Card';
import { ItemTooltip } from '@/components/ItemTooltip';
import { fetchMoreMatches } from '@/app/actions';

interface MatchListProps {
  initialMatches: Match[];
  puuid: string;
  region: string;
  version: string;
  items: ItemMap;
}

export const MatchList: React.FC<MatchListProps> = ({ 
  initialMatches, 
  puuid, 
  region,
  version, 
  items 
}) => {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(initialMatches.length);
  
  const observerTarget = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    
    setIsLoading(true);
    const newMatches = await fetchMoreMatches(puuid, region, offset, 10);
    
    if (newMatches.length === 0) {
      setHasMore(false);
    } else {
      setMatches(prev => [...prev, ...newMatches]);
      setOffset(prev => prev + newMatches.length);
    }
    setIsLoading(false);
  }, [isLoading, hasMore, offset, puuid, region]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div className="space-y-4">
      {matches.map((matchData) => {
        const participant = matchData.info.participants.find((p: MatchParticipant) => p.puuid === puuid);
        if (!participant) return null;
        const isWin = participant.win;
        
        return (
          <Link key={matchData.metadata.matchId} href={`/match/${region}/${matchData.metadata.matchId}`} className="block">
            <Card 
              variant="glass"
              status={isWin ? 'victory' : 'defeat'} 
              interactive 
              noOverflow
              className="p-8 flex flex-wrap md:flex-nowrap items-center gap-10 hover:border-hextech-gold/30 transition-all group"
            >
              {/* Outcome Status Block */}
              <div className="w-24 hidden md:block">
                <span className={`block text-[11px] font-bold uppercase tracking-[0.3em] mb-1 ${isWin ? 'text-hextech-accent-success' : 'text-hextech-accent-error'}`}>
                  {isWin ? 'VIC // SYNC' : 'DEF // DROP'}
                </span>
                <span className="text-[11px] text-slate-500 uppercase font-bold tracking-widest opacity-60">
                  {matchData.info.gameMode === 'CLASSIC' ? 'Draft Pulse' : 'Signal Interference'}
                </span>
              </div>

              {/* Hex Champion Icon */}
              <div className="relative group/champ">
                <div className={`w-20 h-20 rounded-sm border-2 p-1 bg-surface transition-all group-hover:p-0 ${isWin ? 'border-hextech-accent-success/20 group-hover:border-hextech-accent-success/50' : 'border-hextech-accent-error/20 group-hover:border-hextech-accent-error/50'}`}>
                  <div className="w-full h-full relative overflow-hidden rounded-sm bg-surface-bright">
                    <Image 
                      src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${participant.championId}.png`}
                      alt={participant.championName}
                      fill
                      sizes="80px"
                      className="object-cover group-hover:scale-110 transition-transform"
                    />
                  </div>
                </div>
              </div>

              {/* Performance Matrix */}
              <div className="flex-1">
                <div className="flex items-baseline space-x-3 mb-2">
                  <span className="text-2xl font-display font-bold text-white tracking-tighter">{participant.kills}</span>
                  <span className="text-slate-600 text-sm">/</span>
                  <span className="text-2xl font-display font-bold text-hextech-accent-error tracking-tighter">{participant.deaths}</span>
                  <span className="text-slate-600 text-sm">/</span>
                  <span className="text-2xl font-display font-bold text-white tracking-tighter">{participant.assists}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-hextech-gold">
                    {((participant.kills + participant.assists) / Math.max(1, participant.deaths)).toFixed(2)} KDA Ratio
                  </span>
                  <div className="w-1 h-1 rounded-full bg-white/10" />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                    {participant.totalMinionsKilled + participant.neutralMinionsKilled} Kinetic Debris
                  </span>
                </div>
              </div>

              {/* Item Grid */}
              <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-black/20 rounded-sm border border-white/5" onClick={(e) => e.stopPropagation()}>
                {[participant.item0, participant.item1, participant.item2, participant.item6, participant.item3, participant.item4, participant.item5].map((item, i) => (
                  <ItemTooltip key={i} item={items[item]} itemId={item} version={version} />
                ))}
              </div>

              {/* Combat Statistics */}
              <div className="text-right hidden xl:block min-w-[100px]">
                <span className="block text-sm font-display text-white font-bold tracking-tighter">{Math.round(participant.totalDamageDealtToChampions / 1000)}K Output</span>
                <span className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase">Combat Rating</span>
              </div>

              <div className="md:hidden w-full flex justify-between items-center pt-4 border-t border-white/5 mt-4">
                 <span className={`text-[10px] font-bold uppercase tracking-widest ${isWin ? 'text-hextech-accent-success' : 'text-hextech-accent-error'}`}>
                    {isWin ? 'Victory' : 'Defeat'}
                 </span>
                 <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Details &gt;</span>
              </div>
            </Card>
          </Link>
        );
      })}

      {/* Persistence Loader */}
      <div ref={observerTarget} className="py-12 flex flex-col items-center justify-center gap-4">
        {isLoading && (
          <>
            <div className="w-12 h-12 border-2 border-hextech-gold/20 border-t-hextech-gold rounded-full animate-spin" />
            <span className="text-[10px] uppercase font-bold tracking-[0.5em] text-hextech-gold/40 animate-pulse">Syncing Archive...</span>
          </>
        )}
        {!hasMore && matches.length > 0 && (
          <div className="editorial-header opacity-30">
            <span>End of Log</span>
          </div>
        )}
      </div>
    </div>
  );
};
