"use client";

import React from "react";
import { Match, getCDragonChampionIcon } from "@/lib/riot";
import Image from "next/image";

interface RecentPlayersSidebarProps {
  matches: Match[];
  puuid: string;
}

export const RecentPlayersSidebar: React.FC<RecentPlayersSidebarProps> = ({ matches, puuid }) => {
  if (matches.length === 0) return null;

  const playerStats = matches.reduce((acc, match) => {
    // Current player's team
    const me = match.info.participants.find((p) => p.puuid === puuid);
    if (!me) return acc;

    const teammates = match.info.participants.filter(
      (p) => p.teamId === me.teamId && p.puuid !== puuid
    );

    teammates.forEach((t) => {
      const key = t.puuid;
      if (!acc[key]) {
        acc[key] = {
          puuid: t.puuid,
          name: t.riotIdGameName || t.summonerName,
          games: 0,
          wins: 0,
          championId: t.championId,
        };
      }
      acc[key].games++;
      if (t.win) acc[key].wins++;
      // Keep track of most recent champion
      acc[key].championId = t.championId;
    });

    return acc;
  }, {} as Record<string, any>);

  const sortedPlayers = Object.values(playerStats)
    .sort((a: any, b: any) => b.games - a.games)
    .filter((p: any) => p.games >= 2) // Only show people played with at least twice
    .slice(0, 5);

  if (sortedPlayers.length === 0) {
    return (
       <div className="bg-surface-container/20 border border-white/5 rounded-sm p-4">
         <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-4">Signal Integrity</span>
         <span className="text-[11px] text-slate-600 block italic">No persistent signatures detected in recent buffer.</span>
       </div>
    );
  }

  return (
    <div className="bg-surface-container/20 border border-white/5 rounded-sm p-4">
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-4">Kinetic Affiliates</span>
      <div className="space-y-3">
        {sortedPlayers.map((p: any) => (
          <div key={p.puuid} className="flex items-center gap-3 group">
             <div className="w-8 h-8 rounded-sm overflow-hidden border border-white/5 relative bg-surface-bright transition-all group-hover:border-hextech-gold/30">
                <Image 
                  src={getCDragonChampionIcon(p.championId)} 
                  alt={p.name} 
                  fill 
                  className="object-cover transform group-hover:scale-110 transition-transform" 
                />
             </div>
             <div className="flex-1 overflow-hidden">
                <span className="text-[11px] font-bold text-slate-300 block truncate group-hover:text-white transition-colors">{p.name}</span>
                <span className="text-[10px] text-slate-600 font-bold tracking-tighter">
                  {p.wins}W - {p.games - p.wins}L <span className="opacity-50 ml-1">({Math.round((p.wins / p.games) * 100)}%)</span>
                </span>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
