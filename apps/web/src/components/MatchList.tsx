"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Match, MatchParticipant, ItemMap, SpellMap, RuneMap } from '@/lib/riot';
import { Card } from '@/components/ui/Card';
import { fetchMoreMatches } from '@/app/actions';
import { MatchCard } from './MatchCard';

interface MatchListProps {
  initialMatches: Match[];
  puuid: string;
  region: string;
  version: string;
  items: ItemMap;
  spellMap: SpellMap;
  runeMap: RuneMap;
}

export const MatchList: React.FC<MatchListProps> = ({ 
  initialMatches, 
  puuid, 
  region,
  version, 
  items,
  spellMap,
  runeMap
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
      {matches.map((matchData) => (
        <MatchCard 
          key={matchData.metadata.matchId}
          match={matchData}
          puuid={puuid}
          version={version}
          items={items}
          spellMap={spellMap}
          runeMap={runeMap}
        />
      ))}

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
