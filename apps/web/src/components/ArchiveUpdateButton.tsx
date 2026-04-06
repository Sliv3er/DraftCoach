"use client";

import React, { useState } from 'react';
import { Button } from './ui/Button';
import { refreshSummonerData } from '@/app/actions';
import { useRouter } from 'next/navigation';

interface ArchiveUpdateButtonProps {
  region: string;
  gameName: string;
  tagLine: string;
}

export const ArchiveUpdateButton = ({ region, gameName, tagLine }: ArchiveUpdateButtonProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await refreshSummonerData(region, gameName, tagLine);
      // Trigger a server-side refresh of the current page data
      router.refresh();
    } catch (err) {
      console.error('Failed to refresh summoner:', err);
      alert('Failed to sync with Riot Archive. Please try again later.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button 
      variant="primary" 
      size="sm" 
      className="px-10 min-w-[160px] relative overflow-hidden"
      onClick={handleRefresh}
      disabled={isRefreshing}
    >
      <span className={`transition-all duration-300 flex items-center gap-2 ${isRefreshing ? 'opacity-0' : 'opacity-100'}`}>
        Archive Update
      </span>
      {isRefreshing && (
        <div className="absolute inset-0 flex items-center justify-center bg-hextech-gold">
          <svg className="animate-spin h-5 w-5 text-hextech-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="ml-2 text-xs font-bold text-hextech-blue uppercase tracking-tighter">Syncing</span>
        </div>
      )}
    </Button>
  );
};
