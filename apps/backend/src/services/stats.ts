import { Role } from '../../../../shared/types';
import { getLocalRagContext } from './rag-updater';

export async function fetchChampionContext(championId: string, role: Role, enemies: string[]): Promise<string> {
    return getLocalRagContext(championId, role, enemies);
}
