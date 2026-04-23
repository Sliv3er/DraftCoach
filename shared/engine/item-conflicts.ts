// Item Conflict Detection System
// Detects items that cannot be built together due to:
// - Grievous Wounds stacking (only one anti-heal allowed)
// - Shared unique passive names
// 
// Uses DDragon descriptions to build conflict map dynamically.

import { isAntiHealItem, getItemUniquePassives, getDDragonData } from '../kb/ddragon';
import { getKB } from '../kb/kb-loader';

export interface ItemConflictCheck {
    canAdd: boolean;
    reason?: string;
    conflictingWith?: string;
}

/**
 * Check if adding a new item would create a conflict with existing items.
 * Checks across ALL sections (core + situational), not just one section.
 */
export function checkItemConflict(
    newItemId: string,
    existingItems: { id: string }[]
): ItemConflictCheck {
    const kb = getKB();
    const existingIds = existingItems.map(i => i.id);

    // Check 1: Grievous Wounds - only one allowed
    if (isAntiHealItem(newItemId)) {
        const hasExistingAntiHeal = existingIds.some(id => isAntiHealItem(id));
        if (hasExistingAntiHeal) {
            const existingName = existingIds.find(id => isAntiHealItem(id));
            const existingItem = existingName ? kb.getItem(existingName) : null;
            return {
                canAdd: false,
                reason: 'Only one Grievous Wounds item allowed',
                conflictingWith: existingItem?.name || existingName
            };
        }
    }

    // Check 2: Unique passive conflicts
    const newPassives = getItemUniquePassives(newItemId);
    if (newPassives.length > 0) {
        for (const existingId of existingIds) {
            const existingPassives = getItemUniquePassives(existingId);
            
            // Check for shared unique passives
            const sharedPassives = newPassives.filter(np => 
                existingPassives.some(ep => 
                    ep.toLowerCase() === np.toLowerCase() ||
                    ep.toLowerCase().includes(np.toLowerCase()) ||
                    np.toLowerCase().includes(ep.toLowerCase())
                )
            );
            
            if (sharedPassives.length > 0) {
                const existingItem = kb.getItem(existingId);
                return {
                    canAdd: false,
                    reason: `Shares unique passive "${sharedPassives[0]}" with ${existingItem?.name || existingId}`,
                    conflictingWith: existingItem?.name || existingId
                };
            }
        }
    }

    return { canAdd: true };
}

/**
 * Validate all items in a build for conflicts.
 * Returns list of conflicts found.
 */
export function validateBuildConflicts(
    items: { id: string }[]
): string[] {
    const kb = getKB();
    const conflicts: string[] = [];
    
    // Check for multiple anti-heal items
    const antiHealItems = items.filter(i => isAntiHealItem(i.id));
    if (antiHealItems.length > 1) {
        const names = antiHealItems.map(i => kb.getItem(i.id)?.name || i.id).join(', ');
        conflicts.push(`Multiple Grievous Wounds items: ${names}`);
    }

    // Check for unique passive conflicts
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const passives = getItemUniquePassives(item.id);
        
        for (let j = i + 1; j < items.length; j++) {
            const otherItem = items[j];
            const otherPassives = getItemUniquePassives(otherItem.id);
            
            const shared = passives.filter(p => 
                otherPassives.some(op => 
                    p.toLowerCase() === op.toLowerCase() ||
                    p.toLowerCase().includes(op.toLowerCase()) ||
                    op.toLowerCase().includes(p.toLowerCase())
                )
            );
            
            if (shared.length > 0) {
                const name1 = kb.getItem(item.id)?.name || item.id;
                const name2 = kb.getItem(otherItem.id)?.name || otherItem.id;
                conflicts.push(`"${shared[0]}" shared by ${name1} and ${name2}`);
            }
        }
    }
    
    return conflicts;
}

/**
 * Get all anti-heal item IDs from DDragon data.
 * This is dynamically derived from descriptions, not hardcoded.
 */
export async function getAntiHealItemIds(): Promise<string[]> {
    const dd = await getDDragonData();
    return Array.from(dd.antiHealItemIds);
}