export type AiModel =
  | 'deepseek/deepseek-v4-flash'
  | 'qwen/qwen3.6-flash'
  | 'google/gemini-3-flash-preview';

export interface DraftState {
  myChampion: string;
  role: Role;
  allies: string[];
  enemies: string[];
}

export type Role = 'top' | 'jungle' | 'mid' | 'adc' | 'support';
export type GameMode = 'sr' | 'aram' | 'aram-mayhem';

export interface BuildRequest {
  patch: string;
  myChampion: string;
  role: Role;
  allies: string[];
  enemies: string[];
  enemyRoles?: Record<string, Role>;
  gameMode?: GameMode;
  model?: string;
}

export interface BuildSuccessResponse {
  ok: true;
  source: 'grounded' | 'cache' | 'stale-cache' | 'meta' | 'meta-preview' | 'meta-fallback';
  patchDetected: string;
  text: string;
  metaStatus?: 'exact' | 'missing-role' | 'missing-champion';
  metaMessage?: string;
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
  aiProvider: 'openrouter';
  aiModel: AiModel;
  backendPort: number;
}

export interface Detector {
  getDraftState(): Promise<DraftState | null>;
}
