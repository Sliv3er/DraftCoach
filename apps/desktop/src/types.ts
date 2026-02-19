// Re-export shared types for use in renderer
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

export interface DraftState {
  myChampion: string;
  role: Role;
  allies: string[];
  enemies: string[];
}

export interface Detector {
  getDraftState(): Promise<DraftState | null>;
}
