export interface DraftState {
  myChampion: string;
  role: Role;
  allies: string[];
  enemies: string[];
}

export type Role = 'top' | 'jungle' | 'mid' | 'adc' | 'support';

export interface BuildRequest {
  patch: string;
  myChampion: string;
  role: Role;
  allies: string[];
  enemies: string[];
}

export interface BuildSuccessResponse {
  ok: true;
  source: 'grounded' | 'cache' | 'stale-cache';
  patchDetected: string;
  text: string;
}

export interface BuildErrorResponse {
  ok: false;
  source: 'error';
  message: string;
  canRetry: boolean;
}

export type BuildResponse = BuildSuccessResponse | BuildErrorResponse;

export interface CacheEntry {
  key: string;
  timestamp: number;
  text: string;
  patchDetected: string;
  source: 'grounded' | 'cache';
}

export interface AppConfig {
  geminiModel: 'gemini-2.0-flash' | 'gemini-2.0-pro';
  backendPort: number;
}

export interface Detector {
  getDraftState(): Promise<DraftState | null>;
}
