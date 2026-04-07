"use client";

import React from 'react';
import Image from 'next/image';
import { getDDragonRuneIcon, RuneMap } from '@/lib/riot';

import { RuneTooltip } from './RuneTooltip';

interface RuneIconProps {
  runeId: number;
  runeMap?: RuneMap;
  size?: number;
  className?: string;
  showTooltip?: boolean;
}

export const RuneIcon: React.FC<RuneIconProps> = ({ 
  runeId, 
  runeMap, 
  size = 24, 
  className,
  showTooltip = true
}) => {
  const runeData = runeMap ? runeMap[runeId] : null;
  const iconUrl = runeData ? getDDragonRuneIcon(runeData.icon) : `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/${runeId}.png`;
  
  const content = (
    <div 
      className={`relative rounded-full bg-black/40 overflow-hidden ${className}`} 
      style={{ width: size, height: size }}
    >
      <Image
        src={iconUrl}
        alt="Rune"
        fill
        className="object-contain p-0.5"
      />
    </div>
  );

  if (showTooltip && runeData) {
    return (
      <RuneTooltip runeId={runeId} runeData={runeData}>
        {content}
      </RuneTooltip>
    );
  }

  return content;
};
