import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Settings {
  [key: string]: any;
}

const DEFAULT_SETTINGS: Settings = {
  autoDetectChampSelect: true,
  autoExportRunes: true,
  autoExportItemSet: true,
  showOverlay: true,
  overlayOpacity: 0.9,
  showTrackerPanel: true,
  showScoreboard: true,
  showLiveAdvisor: true,
  pingRegion: 'na1',
  aiProvider: 'openrouter',
  aiModel: 'deepseek/deepseek-v4-flash',
  hotkeys: {},
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const s = await invoke<Settings>('ipc_proxy', {
          channel: 'get-settings',
          args: [],
        });
        setSettings({ ...DEFAULT_SETTINGS, ...s });
      } catch (e) {
        console.error('[useSettings] Failed to fetch:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const updateSetting = useCallback(async (key: string, value: any) => {
    // Optimistic update
    setSettings(prev => ({ ...prev, [key]: value }));
    
    try {
      await invoke('ipc_proxy', {
        channel: 'set-setting',
        args: [key, value],
      });
    } catch (e) {
      console.error('[useSettings] Failed to save:', e);
      // Revert on error
      setSettings(prev => ({ ...prev, [key]: settings[key] }));
    }
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await invoke('ipc_proxy', {
        channel: 'reset-settings',
        args: [],
      });
    } catch (e) {
      console.error('[useSettings] Failed to reset:', e);
    }
  }, []);

  return {
    settings,
    isLoading,
    updateSetting,
    resetSettings,
  };
}
