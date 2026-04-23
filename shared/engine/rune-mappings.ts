// Champion-Specific Rune Mappings
// Curated overrides for champions whose rune paths deviate from class defaults.

import { RuneSet, BuildLabel, EngineRole } from '../engine-types';

// Simple type for champion overrides
type RoleRuneSet = Record<BuildLabel, RuneSet>;
type ChampionOverrides = Record<EngineRole, RoleRuneSet>;

// Champion overrides - specific rune pages for specific roles
export const CHAMPION_RUNE_OVERRIDES: Record<string, ChampionOverrides> = {
    'Aatrox': {
        'TOP': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Sorcery', secondarySlots: ['Nimbus Cloak', 'Transcendence'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'MID': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Sorcery', secondarySlots: ['Nimbus Cloak', 'Transcendence'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'JUNGLE': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Sorcery', secondarySlots: ['Nimbus Cloak', 'Transcendence'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'BOT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'SUPPORT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Guardian', primarySlots: ['Shield Bash', 'Second Wind', 'Unflinching'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Summon Aery', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Cut Down'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        }
    },
    'Darius': {
        'TOP': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'JUNGLE': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'MID': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'BOT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'SUPPORT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Guardian', primarySlots: ['Shield Bash', 'Second Wind', 'Unflinching'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Summon Aery', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Cut Down'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        }
    },
    'Garen': {
        'TOP': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'JUNGLE': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'MID': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'BOT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'SUPPORT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Guardian', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Summon Aery', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Cut Down'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        }
    },
    'Jax': {
        'TOP': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'JUNGLE': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'MID': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'BOT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'SUPPORT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Guardian', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Summon Aery', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Cut Down'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        }
    },
    'Graves': {
        'JUNGLE': {
            'DAMAGE': { primaryTree: 'Domination', primaryKeystone: 'Electrocute', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Alacrity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Domination', primaryKeystone: 'Dark Harvest', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Domination', secondarySlots: ['Sudden Impact', 'Relentless Hunter'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'TOP': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'MID': {
            'DAMAGE': { primaryTree: 'Domination', primaryKeystone: 'Electrocute', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Alacrity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Domination', primaryKeystone: 'Dark Harvest', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Domination', secondarySlots: ['Sudden Impact', 'Relentless Hunter'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'BOT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'SUPPORT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Guardian', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Summon Aery', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Cut Down'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        }
    },
    'Jayce': {
        'TOP': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Legend: Tenacity', 'Last Stand'], secondaryTree: 'Inspiration', secondarySlots: ['Magical Footwear', 'Future\'s Market'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Second Wind'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Arcane Comet', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Alacrity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'MID': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Legend: Tenacity', 'Last Stand'], secondaryTree: 'Inspiration', secondarySlots: ['Magical Footwear', 'Future\'s Market'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Tenacity', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Second Wind'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Arcane Comet', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Alacrity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'JUNGLE': {
            'DAMAGE': { primaryTree: 'Domination', primaryKeystone: 'Electrocute', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Alacrity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Grasp of the Undying', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Domination', secondarySlots: ['Sudden Impact', 'Relentless Hunter'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'BOT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'SUPPORT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Guardian', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Summon Aery', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Cut Down'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        }
    },
    'Kayn': {
        'JUNGLE': {
            'DAMAGE': { primaryTree: 'Domination', primaryKeystone: 'Electrocute', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Domination', primaryKeystone: 'Dark Harvest', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'TOP': {
            'DAMAGE': { primaryTree: 'Domination', primaryKeystone: 'Electrocute', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Domination', primaryKeystone: 'Dark Harvest', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'MID': {
            'DAMAGE': { primaryTree: 'Domination', primaryKeystone: 'Electrocute', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Conqueror', primarySlots: ['Triumph', 'Tenacity', 'Last Stand'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Domination', primaryKeystone: 'Dark Harvest', primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'], secondaryTree: 'Precision', secondarySlots: ['Triumph', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        },
        'BOT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'], secondaryTree: 'Resolve', secondarySlots: ['Shield Bash', 'Revitalize'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Precision', primaryKeystone: 'Fleet Footwork', primarySlots: ['Overheal', 'Legend: Alacrity', 'Cut Down'], secondaryTree: 'Inspiration', secondarySlots: ['Biscuit Delivery', 'Jack of All Trades'], statShards: ['Adaptive Force', 'Attack Speed', 'Health'] }
        },
        'SUPPORT': {
            'DAMAGE': { primaryTree: 'Precision', primaryKeystone: 'Press the Attack', primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'], secondaryTree: 'Domination', secondarySlots: ['Taste of Blood', 'Treasure Hunter'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'SAFETY': { primaryTree: 'Resolve', primaryKeystone: 'Guardian', primarySlots: ['Shield Bash', 'Second Wind'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Legend: Tenacity'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] },
            'UTILITY': { primaryTree: 'Sorcery', primaryKeystone: 'Summon Aery', primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'], secondaryTree: 'Precision', secondarySlots: ['Presence of Mind', 'Cut Down'], statShards: ['Adaptive Force', 'Adaptive Force', 'Health'] }
        }
    },
    // Add more champions as needed
};

// Class-based defaults for champions not in the override map
const CLASS_BASED_DEFAULTS: Record<string, RuneSet> = {
    'Assassin': {
        primaryTree: 'Domination',
        primaryKeystone: 'Electrocute',
        primarySlots: ['Sudden Impact', 'Eyeball Collection', 'Treasure Hunter'],
        secondaryTree: 'Precision',
        secondarySlots: ['Triumph', 'Legend: Tenacity'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
    },
    'Mage': {
        primaryTree: 'Sorcery',
        primaryKeystone: 'Arcane Comet',
        primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'],
        secondaryTree: 'Precision',
        secondarySlots: ['Presence of Mind', 'Legend: Alacrity'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
    },
    'Fighter': {
        primaryTree: 'Precision',
        primaryKeystone: 'Conqueror',
        primarySlots: ['Triumph', 'Tenacity', 'Last Stand'],
        secondaryTree: 'Resolve',
        secondarySlots: ['Shield Bash', 'Revitalize'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
    },
    'Tank': {
        primaryTree: 'Resolve',
        primaryKeystone: 'Aftershock',
        primarySlots: ['Shield Bash', 'Second Wind'],
        secondaryTree: 'Precision',
        secondarySlots: ['Triumph', 'Legend: Tenacity'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
    },
    'Marksman': {
        primaryTree: 'Precision',
        primaryKeystone: 'Press the Attack',
        primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'],
        secondaryTree: 'Domination',
        secondarySlots: ['Taste of Blood', 'Treasure Hunter'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
    },
    'Support': {
        primaryTree: 'Resolve',
        primaryKeystone: 'Guardian',
        primarySlots: ['Shield Bash', 'Second Wind'],
        secondaryTree: 'Precision',
        secondarySlots: ['Triumph', 'Legend: Tenacity'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
    }
};

// Map DDragon champion tags to our class keys
function getChampionClass(tags: string[]): string {
    if (tags.includes('Assassin')) return 'Assassin';
    if (tags.includes('Mage')) return 'Mage';
    if (tags.includes('Fighter')) return 'Fighter';
    if (tags.includes('Tank')) return 'Tank';
    if (tags.includes('Marksman')) return 'Marksman';
    if (tags.includes('Support')) return 'Support';
    return 'Fighter';
}

/**
 * Get rune set for a champion based on role and build label.
 * Priority: Champion override → Class default
 */
export function getRunesForChampion(
    championId: string,
    role: EngineRole,
    buildLabel: BuildLabel,
    championTags: string[]
): RuneSet {
    // First check champion-specific override
    const championOverrides = CHAMPION_RUNE_OVERRIDES[championId];
    if (championOverrides) {
        const roleOverrides = championOverrides[role];
        if (roleOverrides) {
            return roleOverrides[buildLabel];
        }
    }
    
    // Fall back to class-based default
    const champClass = getChampionClass(championTags);
    const defaultRunes = CLASS_BASED_DEFAULTS[champClass];
    
    if (defaultRunes) {
        return defaultRunes;
    }
    
    // Ultimate fallback
    return CLASS_BASED_DEFAULTS['Fighter'];
}