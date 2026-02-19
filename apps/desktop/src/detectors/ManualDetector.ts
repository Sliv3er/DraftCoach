import { Detector, DraftState, Role } from '../../../shared/types';

export class ManualDetector implements Detector {
  private state: DraftState | null = null;

  setDraftState(state: DraftState): void {
    this.state = state;
  }

  async getDraftState(): Promise<DraftState | null> {
    return this.state;
  }

  clear(): void {
    this.state = null;
  }
}
