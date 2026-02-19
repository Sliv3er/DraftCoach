import { Detector, DraftState } from '../../../shared/types';

/**
 * Placeholder stub for CS LOL Tools integration.
 * Future implementation will read champ select state from the League client
 * via the LCU API or a compatible tool.
 */
export class CSLOLToolsDetector implements Detector {
  async getDraftState(): Promise<DraftState | null> {
    // Stub: not yet implemented.
    // When implemented, this will connect to the League Client Update (LCU) API
    // and read the current champ select session to extract draft state.
    return null;
  }
}
