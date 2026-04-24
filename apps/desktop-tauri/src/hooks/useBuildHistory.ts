import { useState, useEffect, useCallback } from 'react';

export interface BuildHistoryItem {
  id: string;
  championId: number;
  championName: string;
  role: string;
  build: {
    runes: any;
    items: string[];
    skillOrder: string;
    text: string;
  };
  timestamp: number;
  isFavorite: boolean;
}

const STORAGE_KEY = 'draftcoach_build_history';
const MAX_HISTORY = 10;

export function useBuildHistory() {
  const [history, setHistory] = useState<BuildHistoryItem[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error('[buildHistory] Failed to load:', e);
    }
  }, []);

  // Save to localStorage whenever history changes
  const saveHistory = useCallback((newHistory: BuildHistoryItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    } catch (e) {
      console.error('[buildHistory] Failed to save:', e);
    }
  }, []);

  const addBuild = useCallback((item: Omit<BuildHistoryItem, 'id' | 'timestamp' | 'isFavorite'>) => {
    const newItem: BuildHistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      isFavorite: false,
    };

    setHistory(prev => {
      // Remove duplicates (same champion + role)
      const filtered = prev.filter(h => !(h.championId === item.championId && h.role === item.role));
      const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  const toggleFavorite = useCallback((id: string) => {
    setHistory(prev => {
      const newHistory = prev.map(item =>
        item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
      );
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  const removeBuild = useCallback((id: string) => {
    setHistory(prev => {
      const newHistory = prev.filter(item => item.id !== id);
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getFavorites = useCallback(() => {
    return history.filter(item => item.isFavorite);
  }, [history]);

  return {
    history,
    addBuild,
    toggleFavorite,
    removeBuild,
    clearHistory,
    getFavorites,
  };
}