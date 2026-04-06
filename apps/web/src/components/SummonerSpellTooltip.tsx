"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { SpellData, getDDragonSpellIcon } from '@/lib/riot';

interface SummonerSpellTooltipProps {
  spellId: number;
  spellData: SpellData | null;
  version: string;
  children: React.ReactNode;
}

export const SummonerSpellTooltip: React.FC<SummonerSpellTooltipProps> = ({ 
  spellId, 
  spellData, 
  version, 
  children 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!spellData) return <>{children}</>;

  return (
    <div 
      className="relative group shrink-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 w-64 pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-[#0a0a0c] border border-hextech-gold/30 p-4 rounded-sm shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-2">
              <div className="w-10 h-10 relative flex-shrink-0 border border-hextech-gold/20 rounded-sm overflow-hidden">
                <Image 
                  src={getDDragonSpellIcon(version, spellData.image)}
                  alt={spellData.name}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-hextech-gold uppercase tracking-wider leading-tight">{spellData.name}</h4>
                <div className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Summoner Spell</div>
              </div>
            </div>
            
            <div 
              className="text-[11px] text-slate-300 leading-relaxed spell-description"
              dangerouslySetInnerHTML={{ 
                __html: spellData.description 
                  .replace(/<br>/g, '\n')
                  .replace(/<attention>/g, '<span class="text-hextech-gold font-bold">')
                  .replace(/<\/attention>/g, '</span>')
                  .replace(/<stats>/g, '<span class="text-slate-100 font-semibold">')
                  .replace(/<\/stats>/g, '</span>')
                  .replace(/<hr>/g, '<div class="my-2 border-t border-white/5" />')
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
