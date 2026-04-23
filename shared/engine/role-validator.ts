// Role-Based Item Validation
// Ensures items are only recommended to appropriate roles.
// Junglers never get support items. Supports never get jungle items. etc.

import { EngineRole } from '../engine-types';

// Define which roles can receive which item tags
// Each role can only receive items from its allowed tags
// Rule tags that any role can receive (from rule engine)
const UNIVERSAL_RULE_TAGS = [
    'ANTI_HEAL', 'ANTI_DIVE', 'ANTI_BURST', 'ANTI_CC', 'PENETRATION',
    'ARMOR', 'MR', 'SITUATIONAL', 'MYTHIC', 'LEGENDARY'
];

const ROLE_ITEM_ALLOWLIST: Record<EngineRole, string[]> = {
    'TOP': [
        'AD', 'AP', 'HEALTH', 'LIFESTEAL', 'CRIT', 
        'ATTACK_SPEED', ...UNIVERSAL_RULE_TAGS
    ],
    'JUNGLE': [
        'AD', 'AP', 'HEALTH', 'LIFESTEAL', 'CRIT',
        'JUNGLE', 'ATTACK_SPEED', ...UNIVERSAL_RULE_TAGS
    ],
    'MID': [
        'AD', 'AP', 'HEALTH', 'LIFESTEAL', 'CRIT',
        'ATTACK_SPEED', ...UNIVERSAL_RULE_TAGS
    ],
    'BOT': [
        'AD', 'AP', 'HEALTH', 'LIFESTEAL', 'CRIT',
        'ATTACK_SPEED', ...UNIVERSAL_RULE_TAGS
    ],
    'SUPPORT': [
        'SUPPORT', 'HEAL_SHIELD', 'UTILITY', 'HEALTH',
        ...UNIVERSAL_RULE_TAGS
    ]
};

// Item tags that are NEVER allowed for specific roles
const ROLE_ITEM_BLOCKLIST: Record<EngineRole, string[]> = {
    'TOP': ['SUPPORT', 'JUNGLE'],
    'JUNGLE': ['SUPPORT'], // Junglers can build support items in rare cases
    'MID': ['SUPPORT', 'JUNGLE'],
    'BOT': ['SUPPORT', 'JUNGLE'],
    'SUPPORT': ['JUNGLE']
};

/**
 * Check if a role can receive an item with the given tag.
 */
export function canRoleReceiveItemTag(role: EngineRole, itemTag: string): boolean {
    const allowed = ROLE_ITEM_ALLOWLIST[role];
    const blocked = ROLE_ITEM_BLOCKLIST[role] || [];
    
    // Check blocked list first
    if (blocked.includes(itemTag)) {
        return false;
    }
    
    // Check allowed list
    if (!allowed) {
        return false;
    }
    
    // SITUATIONAL is always allowed
    if (itemTag === 'SITUATIONAL') {
        return true;
    }
    
    // Check if tag is in allowed list
    return allowed.includes(itemTag);
}

/**
 * Check if an item is valid for a specific role based on its tags.
 */
export function isItemValidForRole(itemTags: string[], role: EngineRole): boolean {
    // If item has no tags, allow it (fallback)
    if (!itemTags || itemTags.length === 0) {
        return true;
    }
    
    // Check each tag - at least one must be allowed
    for (const tag of itemTags) {
        if (canRoleReceiveItemTag(role, tag)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Filter a list of items to only those valid for a role.
 */
export function filterItemsForRole<T extends { tags?: string[] }>(
    items: T[],
    role: EngineRole
): T[] {
    return items.filter(item => isItemValidForRole(item.tags || [], role));
}

/**
 * Get list of disallowed tags for a role.
 */
export function getDisallowedTagsForRole(role: EngineRole): string[] {
    return ROLE_ITEM_BLOCKLIST[role] || [];
}

/**
 * Check if an item is jungle-specific.
 */
export function isJungleItem(tags: string[]): boolean {
    return tags?.includes('JUNGLE') || false;
}

/**
 * Check if an item is support-specific.
 */
export function isSupportItem(tags: string[]): boolean {
    return tags?.includes('SUPPORT') || false;
}

/**
 * Validate starting items for role.
 * Ensures junglers have jungle items, supports have support items, etc.
 */
export function validateStartingItemsForRole(
    startingItems: { id: string; name: string; tags?: string[] }[],
    role: EngineRole,
    kbItems: Map<string, { tags?: string[] }>
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    switch (role) {
        case 'JUNGLE': {
            const hasJungleItem = startingItems.some(item => {
                const kbItem = kbItems.get(item.id);
                return kbItem?.tags?.includes('JUNGLE');
            });
            if (!hasJungleItem) {
                errors.push('Jungler must start with a jungle item');
            }
            break;
        }
        case 'SUPPORT': {
            const hasSupportItem = startingItems.some(item => {
                const kbItem = kbItems.get(item.id);
                return kbItem?.tags?.includes('SUPPORT');
            });
            if (!hasSupportItem) {
                errors.push('Support must start with a support item');
            }
            break;
        }
        default: {
            // Laners should NOT have jungle or support starting items
            const hasJungleItem = startingItems.some(item => {
                const kbItem = kbItems.get(item.id);
                return kbItem?.tags?.includes('JUNGLE');
            });
            if (hasJungleItem) {
                errors.push('Laner cannot start with jungle item');
            }
            
            const hasSupportItem = startingItems.some(item => {
                const kbItem = kbItems.get(item.id);
                return kbItem?.tags?.includes('SUPPORT');
            });
            if (hasSupportItem) {
                errors.push('Non-support cannot start with support item');
            }
            break;
        }
    }
    
    return { valid: errors.length === 0, errors };
}