import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

export interface LiveAdvice {
  type: 'buy' | 'sell' | 'swap' | 'warning';
  item: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
}

export function useLiveAdvisor() {
  const [advice, setAdvice] = useState<LiveAdvice[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [gamePhase, setGamePhase] = useState<'champion_select' | 'in_game' | 'post_game'>('champion_select');

  useEffect(() => {
    // Listen for live advisor events from the backend
    const unlisten = listen<any>('live-advisor', (event) => {
      if (!isEnabled) return;
      
      const data = event.payload;
      if (data.type === 'clear') {
        setAdvice([]);
      } else if (data.type === 'phase') {
        setGamePhase(data.phase);
      } else {
        setAdvice(prev => [...prev, {
          type: data.type,
          item: data.item,
          reason: data.reason,
          priority: data.priority || 'medium',
          timestamp: Date.now(),
        }]);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [isEnabled]);

  const clearAdvice = useCallback(() => {
    setAdvice([]);
  }, []);

  const dismissAdvice = useCallback((index: number) => {
    setAdvice(prev => prev.filter((_, i) => i !== index));
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabled(prev => !prev);
    if (!isEnabled) {
      clearAdvice();
    }
  }, [isEnabled, clearAdvice]);

  return {
    advice,
    isEnabled,
    gamePhase,
    clearAdvice,
    dismissAdvice,
    toggleEnabled,
  };
}