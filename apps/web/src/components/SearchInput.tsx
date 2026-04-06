'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { searchElitePlayers, SearchResult } from '@/app/actions';
import { uIRegionToPlatform } from '@/lib/riot';

export default function SearchInput({ variant = 'hero' }: { variant?: 'hero' | 'nav' }) {
  const [summonerName, setSummonerName] = useState('');
  const [region, setRegion] = useState('na1');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<{ name: string, region: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 1. PERSISTENCE: Handle server selection and recent searches from/to localStorage
  useEffect(() => {
    // Initial load
    const savedRegion = localStorage.getItem('draftcoach-region');
    const savedRecent = localStorage.getItem('draftcoach-recent-searches');
    
    if (savedRegion) setRegion(savedRegion);
    if (savedRecent) {
      try {
        setRecentSearches(JSON.parse(savedRecent));
      } catch (e) {
        console.error("Failed to parse recent searches", e);
      }
    }

    // Sync across components/tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'draftcoach-region' && e.newValue) {
        setRegion(e.newValue);
      }
      if (e.key === 'draftcoach-recent-searches' && e.newValue) {
        setRecentSearches(JSON.parse(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleRegionChange = (newRegion: string) => {
    setRegion(newRegion);
    localStorage.setItem('draftcoach-region', newRegion);
    window.dispatchEvent(new Event('storage'));
  };

  const saveRecentSearch = (name: string, region: string) => {
    const newSearch = { name, region };
    const filtered = recentSearches.filter(s => s.name !== name || s.region !== region);
    const updated = [newSearch, ...filtered].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('draftcoach-recent-searches', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  const deleteRecentSearch = (name: string, region: string) => {
    const updated = recentSearches.filter(s => s.name !== name || s.region !== region);
    setRecentSearches(updated);
    localStorage.setItem('draftcoach-recent-searches', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  // 2. SEARCH: Handle real-time suggestions
  useEffect(() => {
    // Reset results if empty
    if (!summonerName.trim()) {
      setResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }

    // Set searching immediately to keep dropdown visible during debounce
    setIsSearching(true);
    setShowResults(false); // Reset show status for new search

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const eliteResults = await searchElitePlayers(summonerName, region);
        if (!active) return;
        
        setResults(eliteResults);
        setShowResults(true);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 1500); // 1.5s debounce to avoid excessive API calls

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [summonerName, region]);

  // Click outside to close results
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowResults(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
       // Fallback logic for regions
       if (region === 'na1') tagLine = 'NA1';
       if (region === 'euw1') tagLine = 'EUW';
       if (region === 'kr') tagLine = 'KR1';
       if (region === 'eun1') tagLine = 'EUNE';
    }

    saveRecentSearch(summonerName.trim(), region);
    router.push(`/summoner/${region}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`);
    setShowResults(false);
    setIsFocused(false);
  };

  const selectPlayer = (player: SearchResult) => {
    const [name, tag] = player.name.includes('#') ? player.name.split('#') : [player.name, player.tag || region];
    saveRecentSearch(player.name, region);
    router.push(`/summoner/${region}/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`);
    setSummonerName(player.name);
    setShowResults(false);
    setIsFocused(false);
  };

  const selectRecent = (recent: { name: string, region: string }) => {
    let gameName = recent.name;
    let tagLine = recent.region;
    
    if (gameName.includes('#')) {
      const parts = gameName.split('#');
      gameName = parts[0];
      tagLine = parts[1] || tagLine;
    } else {
      if (recent.region === 'na1') tagLine = 'NA1';
      if (recent.region === 'euw1') tagLine = 'EUW';
      if (recent.region === 'kr') tagLine = 'KR1';
      if (recent.region === 'eun1') tagLine = 'EUNE';
    }
    
    saveRecentSearch(recent.name, recent.region);
    router.push(`/summoner/${recent.region}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`);
    setIsFocused(false);
    setShowResults(false);
  };

  const isHero = variant === 'hero';
  const showRecent = isFocused && !summonerName && recentSearches.length > 0;
  // Show results section if we're not searching AND we've attempted a search (showResults)
  const showElite = isFocused && summonerName && !isSearching && showResults;
  const showLoading = isFocused && summonerName && isSearching;
  const showDropdown = showRecent || showElite || showLoading;

  return (
    <div className="relative" ref={dropdownRef}>
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
          onChange={(e) => handleRegionChange(e.target.value)}
          className="bg-transparent text-sm font-bold text-hextech-gold/80 outline-none cursor-pointer hover:text-hextech-gold px-2 py-1 rounded-sm appearance-none flex-shrink-0"
        >
          {Object.entries(uIRegionToPlatform).map(([ui, platform]) => (
            <option key={platform} value={platform} className="bg-hextech-blue">{ui}</option>
          ))}
        </select>
      <div className="w-px h-6 bg-white/10 mx-2" />
      <input
        type="text"
        placeholder="Riot ID (Hide on bush#KR1)"
        value={summonerName}
        onChange={(e) => setSummonerName(e.target.value)}
        onFocus={() => setIsFocused(true)}
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
        {isSearching ? <div className="w-4 h-4 border-2 border-hextech-blue border-t-transparent rounded-full animate-spin" /> : '.GG'}
      </Button>
      </form>

      {/* SEARCH RESULTS DROPDOWN */}
      {showDropdown && (
        <div className={`
          absolute left-0 right-0 mt-2 z-[100]
          bg-hextech-blue-lighter/95 border border-hextech-gold/20 shadow-[0_10px_40px_-5px_rgba(0,0,0,0.8)]
          backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200
          ${isHero ? 'max-w-2xl mx-auto translate-y-0' : 'w-full'}
        `}>
          {/* Recent History Section */}
          {showRecent && (
             <>
               <div className="py-2 border-b border-white/5 bg-white/5 px-4 flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-hextech-gold/40">Recent Nodes</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecentSearches([]);
                      localStorage.removeItem('draftcoach-recent-searches');
                      window.dispatchEvent(new Event('storage'));
                    }}
                    className="text-[9px] uppercase font-bold text-slate-500 hover:text-red-400 transition-colors"
                  >
                    Clear All
                  </button>
               </div>
               <div className="max-h-60 overflow-y-auto">
                 {recentSearches.map((search, idx) => (
                   <div key={idx} className="flex items-center group">
                     <button
                       onClick={() => selectRecent(search)}
                       className="flex-1 flex items-center px-4 py-3 hover:bg-hextech-gold/10 transition-colors text-left"
                     >
                       <span className="text-sm font-medium text-slate-300 group-hover:text-hextech-gold transition-colors">{search.name}</span>
                       <span className="ml-2 text-[10px] text-slate-500 font-bold uppercase">{search.region}</span>
                     </button>
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         deleteRecentSearch(search.name, search.region);
                       }}
                       className="px-4 py-3 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                     >
                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                   </div>
                 ))}
               </div>
             </>
          )}

          {/* Elite Results Section */}
          {showElite && (
            <>
              <div className="py-2 border-b border-white/5 bg-white/5 px-4">
                 <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-hextech-gold/40">Identified Subjects</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {results.length > 0 ? (
                  results.map((player, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectPlayer(player)}
                      className="w-full flex items-center justify-between px-4 py-4 hover:bg-hextech-gold/10 transition-colors border-b border-white/5 last:border-0 group text-left"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                           <span className="text-sm font-bold text-slate-100 group-hover:text-hextech-gold transition-colors">{player.name}</span>
                           {player.rank === 'Verified Subject' && (
                             <span className="text-[8px] bg-hextech-gold/20 text-hextech-gold px-1 py-0.5 rounded border border-hextech-gold/30 font-black uppercase">Verified</span>
                           )}
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">{player.rank} {' // '} {region} Node</span>
                      </div>
                      <div className="flex flex-col items-end">
                         {player.lp > 0 && <span className="text-xs font-black text-hextech-gold">{player.lp} LP</span>}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center flex flex-col items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">No Subjects Detected in Local Node</span>
                    
                    {summonerName.includes('#') ? (
                       <Button 
                        onClick={handleSearch}
                        variant="primary"
                        size="sm"
                        className="bg-hextech-gold/20 border-hextech-gold/40 hover:bg-hextech-gold/30 text-hextech-gold"
                       >
                         Initialize Deep Scan for &quot;{summonerName}&quot;
                       </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-600 uppercase font-medium">Try Riot ID (Name#Tag) for direct deep scanning</p>
                        <p className="text-[9px] text-slate-700 italic">Example: Hide on bush#KR1</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Loading State */}
          {showLoading && (
            <div className="p-8 flex flex-col items-center justify-center space-y-3 opacity-60">
              <div className="w-6 h-6 border-2 border-hextech-gold/40 border-t-hextech-gold rounded-full animate-spin" />
              <span className="text-[10px] uppercase tracking-widest text-hextech-gold/40 font-bold">Scanning Server Nodes...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

