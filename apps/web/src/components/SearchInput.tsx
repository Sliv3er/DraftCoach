'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';

export default function SearchInput({ variant = 'hero' }: { variant?: 'hero' | 'nav' }) {
  const [summonerName, setSummonerName] = useState('');
  const [region, setRegion] = useState('NA');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summonerName.trim()) return;
    
    let gameName = summonerName.trim();
    let tagLine = region;

    if (gameName.includes('#')) {
      const parts = gameName.split('#');
      gameName = parts[0];
      tagLine = parts[1] || tagLine;
    } else {
       if (region === 'NA') tagLine = 'NA1';
       if (region === 'EUW') tagLine = 'EUW';
       if (region === 'KR') tagLine = 'KR1';
       if (region === 'EUNE') tagLine = 'EUNE';
    }

    router.push(`/summoner/${region}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`);
  };

  const isHero = variant === 'hero';

  return (
    <form 
      onSubmit={handleSearch} 
      className={`
        flex items-center space-x-2 bg-hextech-blue-lighter/40 p-1.5 rounded-sm 
        border border-white/10 shadow-2xl backdrop-blur-md transition-all 
        focus-within:border-hextech-gold/30 focus-within:bg-hextech-blue-lighter/60
        ${isHero ? 'w-full max-w-2xl mx-auto py-3 px-4' : 'w-72 py-1 px-2'}
      `}
    >
      <select 
        value={region} 
        onChange={(e) => setRegion(e.target.value)}
        className="bg-transparent text-sm font-bold text-hextech-gold/80 outline-none cursor-pointer hover:text-hextech-gold px-2 py-1 rounded-sm appearance-none flex-shrink-0"
      >
        <option value="NA">NA</option>
        <option value="EUW">EUW</option>
        <option value="KR">KR</option>
        <option value="EUNE">EUNE</option>
      </select>
      <div className="w-px h-6 bg-white/10 mx-2" />
      <input
        type="text"
        placeholder="Riot ID (Hide on bush#KR1)"
        value={summonerName}
        onChange={(e) => setSummonerName(e.target.value)}
        className={`
          bg-transparent flex-1 outline-none text-slate-100 placeholder:text-slate-500 font-medium
          ${isHero ? 'text-lg px-4' : 'text-sm px-2'}
        `}
      />
      <Button 
        type="submit" 
        size={isHero ? 'md' : 'sm'}
        className="shadow-inner"
      >
        .GG
      </Button>
    </form>
  );
}

