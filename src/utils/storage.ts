import { ACHIEVEMENTS } from '../data/achievements';
import { SPELLS } from '../data/spells';
import { AchievementDef, PlayerProgress, SpellId } from '../types/game';

const STORAGE_KEY = 'hogwarts_dash_progress_v1';

export function createInitialProgress(): PlayerProgress {
  const starterSpells = SPELLS.filter((s) => s.starter).map((s) => s.id);
  const mastery = {} as Record<SpellId, number>;
  SPELLS.forEach((s) => {
    mastery[s.id] = s.starter ? 1 : 0;
  });

  return {
    galleons: 60,
    scrollFragments: 1,
    learnedSpells: starterSpells,
    spellMastery: mastery,
    equippedHotbar: ['expelliarmus', 'protego', 'lumos', 'alohomora', 'stupefy', 'incendio'],
    unlockedCostumes: ['novice_robe'],
    equippedCostume: 'novice_robe',
    unlockedLevelMax: 1,
    completedLevels: [],
    bestScores: {},
    achievementsUnlocked: [],
    stats: {
      totalRuns: 0,
      voiceCasts: 0,
      totalCasts: 0,
      deathEatersDefeated: 0,
      bossesDefeated: 0,
      scrollsCollected: 0,
      obstaclesCleared: 0,
      noDamageBossWins: 0,
      spellsLearnedCount: starterSpells.length,
      costumesUnlockedCount: 1,
      prioriClashesWon: 0,
      perfectPractices: 0,
    },
    voiceLanguage: 'zh-CN',
    soundEnabled: true,
  };
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    const base = createInitialProgress();
    return {
      ...base,
      ...parsed,
      spellMastery: { ...base.spellMastery, ...(parsed.spellMastery || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
      bestScores: { ...(parsed.bestScores || {}) },
    };
  } catch {
    return createInitialProgress();
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors
  }
}

export function evaluateAchievements(progress: PlayerProgress): {
  nextProgress: PlayerProgress;
  newlyUnlocked: AchievementDef[];
} {
  const syncedStats = {
    ...progress.stats,
    spellsLearnedCount: progress.learnedSpells.length,
    costumesUnlockedCount: progress.unlockedCostumes.length,
  };

  let galleons = progress.galleons;
  let scrollFragments = progress.scrollFragments;
  const unlockedCostumes = [...progress.unlockedCostumes];
  const achievementsUnlocked = [...progress.achievementsUnlocked];
  const newlyUnlocked: AchievementDef[] = [];

  // Run two passes in case unlocking a costume triggers wardrobe achievement
  for (let pass = 0; pass < 2; pass++) {
    syncedStats.costumesUnlockedCount = unlockedCostumes.length;
    for (const ach of ACHIEVEMENTS) {
      if (achievementsUnlocked.includes(ach.id)) continue;
      const currentVal = syncedStats[ach.statKey] ?? 0;
      if (currentVal >= ach.target) {
        achievementsUnlocked.push(ach.id);
        galleons += ach.rewardGalleons;
        scrollFragments += ach.rewardScrolls;
        if (ach.rewardCostumeId && !unlockedCostumes.includes(ach.rewardCostumeId)) {
          unlockedCostumes.push(ach.rewardCostumeId);
        }
        newlyUnlocked.push(ach);
      }
    }
  }

  syncedStats.costumesUnlockedCount = unlockedCostumes.length;

  return {
    nextProgress: {
      ...progress,
      galleons,
      scrollFragments,
      unlockedCostumes,
      achievementsUnlocked,
      stats: syncedStats,
    },
    newlyUnlocked,
  };
}
