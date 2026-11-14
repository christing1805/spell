export type SpellId =
  | 'lumos'
  | 'alohomora'
  | 'expelliarmus'
  | 'protego'
  | 'stupefy'
  | 'wingardium'
  | 'incendio'
  | 'aguamenti'
  | 'patronum'
  | 'reducto'
  | 'petrificus'
  | 'arresto'
  | 'bombarda'
  | 'episkey'
  | 'riddikulus'
  | 'sectumsempra'
  | 'confringo'
  | 'diffindo'
  | 'glacius'
  | 'depulso'
  | 'accio'
  | 'impedimenta'
  | 'salvio'
  | 'vulnera'
  | 'flipendo'
  | 'piertotum'
  | 'ascendio'
  | 'obliviate';

export type SpellCategory = 'attack' | 'defense' | 'utility' | 'healing';

export type ObstacleType =
  | 'devils_snare'
  | 'locked_gate'
  | 'stone_pillar'
  | 'fiendfyre'
  | 'dark_mist'
  | 'crystal_wall'
  | 'boggart_chest'
  | 'low_spike';

export interface SpellDef {
  id: SpellId;
  nameZh: string;
  incantation: string;
  phoneticZh: string;
  category: SpellCategory;
  descriptionZh: string;
  counteredTargetsZh: string;
  counteredObstacleTypes: ObstacleType[];
  manaCost: number;
  cooldownMs: number;
  damage: number;
  color: string;
  glowColor: string;
  voiceAliases: string[];
  starter: boolean;
  unlockCostGalleons: number;
  unlockCostScrolls: number;
  wandMovement: 'line' | 'wave' | 'circle' | 'zig' | 'triangle' | 'star';
}

export type CostumeId =
  | 'novice_robe'
  | 'gryffindor_quidditch'
  | 'slytherin_emerald'
  | 'ravenclaw_starlight'
  | 'hufflepuff_herb'
  | 'auror_trench'
  | 'triwizard_champion'
  | 'invisibility_cloak';

export interface CostumePalette {
  robeMain: string;
  robeShade: string;
  trim: string;
  scarfPrimary: string;
  scarfSecondary: string;
  hatOrHair: string;
  hasWizardHat: boolean;
  hasGlasses: boolean;
  hasGoggles: boolean;
  cloakSparkle: boolean;
  skin: string;
  wandGlow: string;
}

export interface CostumeModifiers {
  maxHpBonus: number;
  manaRegenMult: number;
  cooldownMult: number;
  bossDmgMult: number;
  scrollDropBonus: number;
  shieldDurMult: number;
  dodgeChance: number;
  jumpBoost: number;
}

export interface CostumeDef {
  id: CostumeId;
  nameZh: string;
  originZh: string;
  descriptionZh: string;
  bonusTextZh: string;
  unlockType: 'starter' | 'galleons' | 'achievement';
  costGalleons: number;
  requiredAchievementId?: string;
  palette: CostumePalette;
  modifiers: CostumeModifiers;
}

export type BossId = 'lucius' | 'bellatrix' | 'dolohov' | 'voldemort';

export interface BossDef {
  id: BossId;
  nameZh: string;
  titleZh: string;
  maxHp: number;
  weaknessSpells: SpellId[];
  signatureMoveZh: string;
  descriptionZh: string;
  primaryColor: string;
}

export interface LevelDef {
  id: number;
  nameZh: string;
  subtitleZh: string;
  descriptionZh: string;
  environment: 'forest' | 'castle' | 'ministry' | 'greathall';
  backdropImage: string;
  distanceGoal: number;
  baseSpeed: number;
  obstaclePool: ObstacleType[];
  recommendedSpells: SpellId[];
  boss: BossDef;
  rewardGalleons: number;
  skyTop: string;
  skyBottom: string;
  groundColor: string;
  groundAccent: string;
}

export type AchievementCategory = 'voice' | 'combat' | 'exploration' | 'collection';

export interface AchievementDef {
  id: string;
  titleZh: string;
  descriptionZh: string;
  category: AchievementCategory;
  statKey: keyof PlayerStats;
  target: number;
  rewardGalleons: number;
  rewardScrolls: number;
  rewardCostumeId?: CostumeId;
}

export interface PlayerStats {
  totalRuns: number;
  voiceCasts: number;
  totalCasts: number;
  deathEatersDefeated: number;
  bossesDefeated: number;
  scrollsCollected: number;
  obstaclesCleared: number;
  noDamageBossWins: number;
  spellsLearnedCount: number;
  costumesUnlockedCount: number;
  prioriClashesWon: number;
  perfectPractices: number;
}

export interface PlayerProgress {
  galleons: number;
  scrollFragments: number;
  learnedSpells: SpellId[];
  spellMastery: Record<SpellId, number>; // 1 to 5
  equippedHotbar: SpellId[]; // 6 slots
  unlockedCostumes: CostumeId[];
  equippedCostume: CostumeId;
  unlockedLevelMax: number;
  completedLevels: number[];
  bestScores: Record<number, number>;
  achievementsUnlocked: string[];
  stats: PlayerStats;
  voiceLanguage: 'zh-CN' | 'en-US';
  soundEnabled: boolean;
}
