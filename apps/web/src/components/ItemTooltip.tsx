"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { Item } from '@/lib/riot';

interface ItemTooltipProps {
  item: Item | null;
  itemId: number;
  version: string;
}

export const ItemTooltip: React.FC<ItemTooltipProps> = ({ item, itemId, version }) => {
  const [isHovered, setIsHovered] = useState(false);

  if (itemId === 0) {
    return <div className="w-8 h-8 rounded-sm border border-white/5 bg-surface-bright/50" />;
  }

  return (
    <div 
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`w-8 h-8 rounded-sm border border-white/5 overflow-hidden bg-surface-bright/50 relative transition-transform group-hover:scale-105 group-hover:border-hextech-gold/50`}>
        <Image 
          src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`}
          alt={item?.name || 'Item'}
          fill
          className="object-cover"
        />
      </div>

      {isHovered && item && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 w-64 pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-[#0a0a0c] border border-hextech-gold/30 p-4 rounded-sm shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-2">
              <div className="w-10 h-10 relative flex-shrink-0 border border-hextech-gold/20">
                <Image 
                  src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`}
                  alt={item.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-hextech-gold uppercase tracking-wider leading-tight">{item.name}</h4>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-3 h-3 bg-hextech-gold/80 rounded-full flex items-center justify-center">
                    <span className="text-[7px] text-black font-bold">G</span>
                  </div>
                  <span className="text-[10px] text-hextech-gold/80 font-bold tracking-widest">{item.gold.total} Gold</span>
                </div>
              </div>
            </div>
            
            <div 
              className="text-[11px] text-slate-300 leading-relaxed space-y-2 item-description"
              dangerouslySetInnerHTML={{ 
                __html: item.description 
                  .replace(/<br>/g, '\n')
                  .replace(/<attention>/g, '<span class="text-hextech-gold font-bold">')
                  .replace(/<\/attention>/g, '</span>')
                  .replace(/<stats>/g, '<span class="text-slate-100 font-semibold">')
                  .replace(/<\/stats>/g, '</span>')
                  .replace(/<active>/g, '<span class="text-hextech-accent-success font-bold uppercase tracking-tighter">Active: </span>')
                  .replace(/<\/active>/g, '')
                  .replace(/<passive>/g, '<span class="text-hextech-accent-info font-bold uppercase tracking-tighter">Passive: </span>')
                  .replace(/<\/passive>/g, '')
              }}
            />
          </div>
          {/* Tooltip Arrow */}
          <div className="w-3 h-3 bg-[#0a0a0c] border-r border-b border-hextech-gold/30 absolute left-1/2 -translate-x-1/2 -bottom-1.5 rotate-45" />
        </div>
      )}
    </div>
  );
};
