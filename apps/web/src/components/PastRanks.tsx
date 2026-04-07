"use client";

import React from "react";
import Image from "next/image";
import { getRankEmblem } from "@/lib/riot";

interface PastRanksProps {
  rankHistory?: {
    season: string;
    tier: string;
    rank: string;
  }[];
}

export const PastRanks: React.FC<PastRanksProps> = ({ rankHistory }) => {
  if (!rankHistory || rankHistory.length === 0) return null;

  return (
    <div className="flex gap-2 mb-4 animate-in fade-in slide-in-from-left-2 duration-500">
      {rankHistory.slice(0, 3).map((h, i) => (
        <div 
          key={i} 
          className="px-2 py-0.5 rounded-[2px] bg-white/5 border border-white/5 flex items-center gap-1.5 transition-all hover:bg-white/10 hover:border-white/10 group cursor-default"
        >
          <div className="w-4 h-4 relative shrink-0">
            <Image 
              src={getRankEmblem(h.tier)} 
              alt={h.tier} 
              fill 
              sizes="16px"
              className="object-contain"
            />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-400">{h.season}</span>
          <span className={`text-[10px] font-black uppercase tracking-tighter ${getTierColor(h.tier)}`}>
            {h.tier.charAt(0)}{h.rank}
          </span>
        </div>
      ))}
    </div>
  );
};

const getTierColor = (tier: string) => {
  const t = tier.toUpperCase();
  if (t === 'CHALLENGER') return 'text-hextech-accent-info';
  if (t === 'GRANDMASTER') return 'text-hextech-accent-error';
  if (t === 'MASTER') return 'text-hextech-gold';
  if (t === 'DIAMOND') return 'text-blue-400';
  if (t === 'EMERALD') return 'text-hextech-accent-success';
  if (t === 'PLATINUM') return 'text-teal-400';
  if (t === 'GOLD') return 'text-yellow-500';
  if (t === 'SILVER') return 'text-slate-400';
  if (t === 'BRONZE') return 'text-orange-900';
  if (t === 'IRON') return 'text-slate-600';
  return 'text-slate-400';
};
