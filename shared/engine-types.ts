// ─── DraftCoach Hybrid Engine Types ─────────────────────────────────
// All core interfaces for the local decision engine, comp profiler,
// build recommendations, and LLM enhancement layer.

// ─── Roles ───────────────────────────────────────────────────────────
export type EngineRole = 'TOP' | 'JUNGLE' | 'MID' | 'BOT' | 'SUPPORT';

// ─── Draft State ─────────────────────────────────────────────────────
export interface EngineDraftState {
  patch: string;
  phase: 'PLANNING' | 'BAN' | 'PICK' | 'FINALIZE' | 'MANUAL';
  myRole: EngineRole;
  myChampionId: string | null;
  allies: EngineDraftSlot[];
  enemies: EngineDraftSlot[];
  bans: string[];
  timeLeftMs: number;
}

export interface EngineDraftSlot {
  role: EngineRole;
  championId: string | null;
  isHover: boolean;
}

// ─── Champion KB Entry ───────────────────────────────────────────────
export interface ChampionKBEntry {
  id: string;
  name: string;
  roles: EngineRole[];
  tags: ChampionTags;
  laneStrengths: Partial<Record<EngineRole, LaneStrengths>>;
}

export interface ChampionTags {
  engage: number;      // 0-100
  peel: number;
  frontline: number;
  burst: number;
  sustained: number;
  poke: number;        // 0-100, long-range harassment capability
  healShield: number;
  splitpush: number;   // 0-100, split push threat
  ccDensity: number;   // approx seconds of hard CC
  mobility: number;
  range: number;       // 0-100 (melee=10, mid=40, long=80)
  damageType: 'AD' | 'AP' | 'MIXED' | 'TRUE';
  scalingCurve: 'EARLY' | 'MID' | 'LATE';
  threatWindow: { start: 'EARLY' | 'MID' | 'LATE'; end: 'EARLY' | 'MID' | 'LATE' };
}

export interface LaneStrengths {
  poke: number;
  allIn: number;
  sustain: number;
}

// ─── Item KB Entry ───────────────────────────────────────────────────
export interface ItemKBEntry {
  id: string;
  name: string;
  tags: string[];
  cost: number;
  spikeTiming: 'EARLY' | 'MID' | 'LATE';
  statProfile: Record<string, number>;
  passiveKeywords: string[];
}

// ─── Matchup KB Entry ────────────────────────────────────────────────
export interface MatchupKBEntry {
  champion: string;
  enemy: string;
  role: string;
  score: number;
  tip: string;
  earlyGame: string;
}

// ─── Rune Set ────────────────────────────────────────────────────────
export interface RuneSet {
  primaryTree: string;
  primaryKeystone: string;
  primarySlots: string[];
  secondaryTree: string;
  secondarySlots: string[];
  statShards: string[];
}

// ─── Skill Order ─────────────────────────────────────────────────────
export type Ability = 'Q' | 'W' | 'E';

export interface SkillOrder {
  first3: Ability[];
  maxOrder: Ability[];
}

// ─── Build Plan ──────────────────────────────────────────────────────
export type BuildLabel = 'DAMAGE' | 'SAFETY' | 'UTILITY';

export type ConditionTag =
  | 'IF_BEHIND'
  | 'IF_AHEAD'
  | 'IF_ASSASSINS_FED'
  | 'IF_ENEMY_MR_STACKING'
  | 'IF_ENEMY_ARMOR_STACKING'
  | 'IF_HEAVY_HEAL_SHIELD'
  | 'IF_HEAVY_AD'
  | 'IF_HEAVY_AP'
  | 'IF_POKE_COMP'
  | 'IF_DIVE_COMP';

export interface SituationalItem {
  itemId: string;
  itemName: string;
  reason: string;
  triggerTag: string;
}

export interface ConditionalFork {
  condition: ConditionTag;
  itemSwaps: { remove: string; add: string; reason: string }[];
}

export interface BuildPlan {
  label: BuildLabel;
  score: number;
  runes: RuneSet;
  summonerSpells: [string, string];
  skillOrder: SkillOrder;
  startingItems: { id: string; name: string }[];
  coreItems: { id: string; name: string; reason: string }[];
  bootChoice: { id: string; name: string };
  situationalItems: SituationalItem[];
  conditionalForks: ConditionalFork[];
}

// ─── Comp Profile ────────────────────────────────────────────────────
export interface CompProfile {
  allyEngageScore: number;
  allyPeelScore: number;
  allyFrontlineScore: number;
  allyPokeScore: number;
  allyBurstScore: number;
  allySustainedDmgScore: number;
  allyHealShieldScore: number;
  allySplitScore: number;
  allyCCDensity: number;
  allyMobilityScore: number;
  allyRangeScore: number;

  enemyEngageScore: number;
  enemyPickScore: number;
  enemyBurstScore: number;
  enemyDiveScore: number;
  enemyPokeScore: number;
  enemySustainedDmgScore: number;
  enemyHealShieldScore: number;
  enemyCCDensity: number;
  enemyMobilityScore: number;
  enemyRangeScore: number;

  // MAX threat metrics — uses highest single champion, not just averages
  enemyMaxBurstThreat: number;   // max burst from any single enemy
  enemyMaxDiveThreat: number;    // max (engage+mobility)/2 from any enemy
  enemyMaxPickThreat: number;    // max pick threat from any enemy

  teamDamageProfile: { ap: number; ad: number; trueDmg: number };
  enemyDamageProfile: { ap: number; ad: number; trueDmg: number };
}

// ─── Triggered Rule ──────────────────────────────────────────────────
export interface TriggeredRule {
  ruleId: string;
  priority: number;
  condition: string;
  effect: string;
  tags: string[];
}

// ─── Threat Timer ────────────────────────────────────────────────────
export interface ThreatTimer {
  championId: string;
  championName: string;
  windowStart: 'EARLY' | 'MID' | 'LATE';
  windowEnd: 'EARLY' | 'MID' | 'LATE';
  note: string;
}

// ─── Draft Analysis ──────────────────────────────────────────────────
export interface DraftAnalysis {
  winConditions: string[];
  warnings: string[];
  allyStrengths: string[];
  enemyThreats: string[];
  laneMatchupSummary: string;
  threatTimers: ThreatTimer[];
}

// ─── Build Recommendation (Engine Output) ────────────────────────────
export interface BuildRecommendation {
  patch: string;
  generatedAt: number;
  computeTimeMs: number;
  champion: string;
  championName: string;
  role: EngineRole;
  compProfile: CompProfile;
  confidence: number;   // 0-1, based on confirmed picks vs hovers

  primary: BuildPlan;
  variants: [BuildPlan, BuildPlan];

  triggeredRules: TriggeredRule[];
  explanations: string[];
  draftAnalysis: DraftAnalysis;

  llmEnhancement: LLMEnhancement | null;
}

// ─── LLM Enhancement ────────────────────────────────────────────────
export type LLMEnhancementStatus = 'idle' | 'pending' | 'success' | 'failed' | 'cached';

export interface LLMEnhancement {
  status: LLMEnhancementStatus;
  altItem: { itemId: string; itemName: string; reason: string } | null;
  warning: string | null;
  microWinCondition: string | null;
  confidence: number;
  latencyMs: number;
  cacheKey: string;
  source: 'live' | 'cache';
}

// ─── Knowledge Base Versioning ───────────────────────────────────────
export interface KBMeta {
  patch: string;
  buildHash: string;
  createdAt: string;
  source: string;
  checksum: string;
  previousPatch: string;
  rollbackAvailable: boolean;
}

export interface KBFile<T> {
  meta: KBMeta;
  data: T;
}

// ─── Build Template (stored in build-templates.json) ─────────────────
export interface BuildTemplateVariant {
  label: BuildLabel;
  runes: RuneSet;
  summonerSpells: [string, string];
  skillOrder: SkillOrder;
  startingItems: { id: string; name: string }[];
  coreItems: { id: string; name: string; reason: string }[];
  bootChoice: { id: string; name: string };
  situationalPool?: { id: string; name: string; triggerTag: string }[];
  conditionalRules?: { condition: ConditionTag; swap: { remove: string; add: string; addName: string } }[];
}

export interface BuildTemplate {
  championId: string;
  role: EngineRole;
  variants: Record<BuildLabel, BuildTemplateVariant>;
}

// ─── Synergy / Counter ───────────────────────────────────────────────
export interface SynergyEntry {
  champions: [string, string];
  score: number;
  note: string;
  type: string;
}

export interface CounterEntry {
  championId: string;
  severity: string;
  reason: string;
}

export interface SynergyCounterData {
  synergiesWith: SynergyEntry[];
  counters: CounterEntry[];
}

// ─── Weights ─────────────────────────────────────────────────────────
export interface ScoringWeights {
  laneMatchup: number;       // renamed from laneAffinity
  teamNeeds: number;         // NEW
  teamDmgBalance: number;
  enemyThreat: number;       // renamed from antiThreat
  synergy: number;
  scalingMatch: number;
  ccDensity: number;         // NEW
  rangeAdvantage: number;    // NEW
  mobilityGap: number;       // NEW
}

// ─── Rule Definition (used internally by engine) ─────────────────────
export type RuleCategory =
  | 'ANTI_HEAL' | 'ANTI_DIVE' | 'ANTI_BURST' | 'ANTI_CC'
  | 'DAMAGE_BALANCE' | 'VISION_SAFETY'
  | 'WIN_CONDITION' | 'WARNING'
  | 'SNOWBALL' | 'BEHIND_RECOVERY' | 'GREED_BUILD';

export interface RuleContext {
  cp: CompProfile;
  draft: EngineDraftState;
  plan: BuildPlan;
  champNames: { allies: string[]; enemies: string[] };
}

export interface RuleEffect {
  situationalItemTags?: { tag: string; reason: string }[];   // tag-based, not ID-based
  warnings?: string[];
  forks?: { condition: ConditionTag; swapTag: string; reason: string }[];
  strategicNotes?: string[];
}

export interface RuleDefinition {
  id: string;
  priority: number;
  category: RuleCategory;
  tags: string[];
  condition: (ctx: RuleContext) => boolean;
  apply: (ctx: RuleContext) => RuleEffect;
  description: (ctx: RuleContext) => string;
}
