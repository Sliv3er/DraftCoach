import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ChampSelectSession {
  myChampion: number | null;
  myTeam: number[];
  enemyTeam: number[];
  role: string | null;
  phase: string;
}

export function useLCUPolling(enabled: boolean = true) {
  const [session, setSession] = useState<ChampSelectSession | null>(null);
  const [isInChampSelect, setIsInChampSelect] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollLCU = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await invoke<any>('ipc_proxy', {
        channel: 'get-champ-select',
        args: [],
      });

      if (data && data.myChampion) {
        setIsInChampSelect(true);
        setSession({
          myChampion: data.myChampion,
          myTeam: data.myTeam || [],
          enemyTeam: data.enemyTeam || [],
          role: data.role || null,
          phase: data.phase || 'unknown',
        });
      } else {
        setIsInChampSelect(false);
        setSession(null);
      }
    } catch (e: any) {
      // LCU not available - not an error, just not in champ select
      if (!e.toString().includes('LCU')) {
        setError(e.message || 'Failed to poll LCU');
      }
      setIsInChampSelect(false);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start/stop polling based on enabled flag
  useEffect(() => {
    if (enabled) {
      // Initial poll
      pollLCU();
      
      // Poll every 2 seconds
      pollRef.current = setInterval(pollLCU, 2000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [enabled, pollLCU]);

  const refresh = useCallback(() => {
    pollLCU();
  }, [pollLCU]);

  return {
    session,
    isInChampSelect,
    isLoading,
    error,
    refresh,
  };
}