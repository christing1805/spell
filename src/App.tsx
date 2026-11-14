import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  Lock,
  Mic,
  Play,
  RotateCcw,
  ScrollText,
  Skull,
  Volume2,
  VolumeX,
} from 'lucide-react';
import heroBanner from './assets/images/hogwarts_pixel_banner_1794636433150.jpg';
import AchievementsView from './components/AchievementsView';
import GameCanvas, { RunResultSummary } from './components/GameCanvas';
import PixelCharacterPreview from './components/PixelCharacterPreview';
import SpellbookView from './components/SpellbookView';
import WardrobeView from './components/WardrobeView';
import { ACHIEVEMENTS } from './data/achievements';
import { COSTUME_MAP } from './data/costumes';
import { LEVELS } from './data/levels';
import { SPELLS, SPELL_MAP } from './data/spells';
import {
  CostumeDef,
  CostumeId,
  LevelDef,
  PlayerProgress,
  SpellDef,
  SpellId,
} from './types/game';
import { soundEngine, speakSpellPronunciation } from './utils/sound';
import {
  createInitialProgress,
  evaluateAchievements,
  loadProgress,
  saveProgress,
} from './utils/storage';

type TabId = 'home' | 'spellbook' | 'wardrobe' | 'achievements';

interface ToastItem {
  id: number;
  title: string;
  subtitle: string;
}

export default function App() {
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [activeLevel, setActiveLevel] = useState<LevelDef | null>(null);
  const [focusedSpellId, setFocusedSpellId] = useState<SpellId>('expelliarmus');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    soundEngine.enabled = progress.soundEnabled;
    saveProgress(progress);
  }, [progress]);

  const pushToast = useCallback((title: string, subtitle: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, title, subtitle }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const commitProgressWithAchievements = useCallback(
    (updater: (prev: PlayerProgress) => PlayerProgress) => {
      setProgress((prev) => {
        const draft = updater(prev);
        const { nextProgress, newlyUnlocked } = evaluateAchievements(draft);
        newlyUnlocked.forEach((ach) => {
          pushToast(
            `成就达成：${ach.titleZh}`,
            `奖励 +${ach.rewardGalleons} 加隆${ach.rewardScrolls > 0 ? ` · +${ach.rewardScrolls} 学习单` : ''}${
              ach.rewardCostumeId ? ` · 解锁 ${COSTUME_MAP[ach.rewardCostumeId].nameZh}` : ''
            }`
          );
        });
        return nextProgress;
      });
    },
    [pushToast]
  );

  const handleUnlockSpell = useCallback(
    (spell: SpellDef) => {
      commitProgressWithAchievements((prev) => {
        if (prev.learnedSpells.includes(spell.id)) return prev;
        if (
          prev.galleons < spell.unlockCostGalleons ||
          prev.scrollFragments < spell.unlockCostScrolls
        ) {
          return prev;
        }
        const nextLearned = [...prev.learnedSpells, spell.id];
        const nextHotbar =
          prev.equippedHotbar.length < 6
            ? [...prev.equippedHotbar, spell.id]
            : prev.equippedHotbar;
        pushToast(`习得新咒语：${spell.nameZh}`, `${spell.incantation} 已加入咒语库`);
        return {
          ...prev,
          galleons: prev.galleons - spell.unlockCostGalleons,
          scrollFragments: prev.scrollFragments - spell.unlockCostScrolls,
          learnedSpells: nextLearned,
          spellMastery: { ...prev.spellMastery, [spell.id]: 1 },
          equippedHotbar: nextHotbar,
        };
      });
    },
    [commitProgressWithAchievements, pushToast]
  );

  const handlePracticeSuccess = useCallback(
    (spellId: SpellId, viaVoice: boolean) => {
      commitProgressWithAchievements((prev) => {
        const currentLvl = prev.spellMastery[spellId] || 1;
        const nextLvl = Math.min(5, currentLvl + 1);
        return {
          ...prev,
          spellMastery: { ...prev.spellMastery, [spellId]: nextLvl },
          stats: {
            ...prev.stats,
            perfectPractices: prev.stats.perfectPractices + 1,
            voiceCasts: prev.stats.voiceCasts + (viaVoice ? 1 : 0),
          },
        };
      });
    },
    [commitProgressWithAchievements]
  );

  const handleToggleHotbar = useCallback((spellId: SpellId) => {
    setProgress((prev) => {
      if (!prev.learnedSpells.includes(spellId)) return prev;
      if (prev.equippedHotbar.includes(spellId)) {
        if (prev.equippedHotbar.length <= 1) return prev;
        return {
          ...prev,
          equippedHotbar: prev.equippedHotbar.filter((id) => id !== spellId),
        };
      }
      const next = [...prev.equippedHotbar];
      if (next.length >= 6) next.shift();
      next.push(spellId);
      return { ...prev, equippedHotbar: next };
    });
  }, []);

  const handleUnlockCostume = useCallback(
    (costume: CostumeDef) => {
      commitProgressWithAchievements((prev) => {
        if (prev.unlockedCostumes.includes(costume.id)) return prev;
        if (prev.galleons < costume.costGalleons) return prev;
        pushToast(`购入新服装：${costume.nameZh}`, '已自动为你穿戴');
        return {
          ...prev,
          galleons: prev.galleons - costume.costGalleons,
          unlockedCostumes: [...prev.unlockedCostumes, costume.id],
          equippedCostume: costume.id,
        };
      });
    },
    [commitProgressWithAchievements, pushToast]
  );

  const handleEquipCostume = useCallback((costumeId: CostumeId) => {
    setProgress((prev) => {
      if (!prev.unlockedCostumes.includes(costumeId)) return prev;
      return { ...prev, equippedCostume: costumeId };
    });
  }, []);

  const handleCompleteRun = useCallback(
    (summary: RunResultSummary) => {
      commitProgressWithAchievements((prev) => {
        const mergedSpells = Array.from(
          new Set([...prev.learnedSpells, ...summary.newlyLearnedSpells])
        );
        const nextMastery = { ...prev.spellMastery };
        summary.newlyLearnedSpells.forEach((sid) => {
          if (!nextMastery[sid]) nextMastery[sid] = 1;
        });

        const nextCompleted = summary.victory
          ? Array.from(new Set([...prev.completedLevels, summary.levelId]))
          : prev.completedLevels;

        const nextUnlockedLevel = summary.victory
          ? Math.min(LEVELS.length, Math.max(prev.unlockedLevelMax, summary.levelId + 1))
          : prev.unlockedLevelMax;

        const prevBest = prev.bestScores[summary.levelId] || 0;
        const extraScrolls = Math.max(0, summary.scrollsCollected - summary.newlyLearnedSpells.length);

        return {
          ...prev,
          galleons: prev.galleons + summary.galleonsEarned,
          scrollFragments: prev.scrollFragments + extraScrolls,
          learnedSpells: mergedSpells,
          spellMastery: nextMastery,
          unlockedLevelMax: nextUnlockedLevel,
          completedLevels: nextCompleted,
          bestScores: {
            ...prev.bestScores,
            [summary.levelId]: Math.max(prevBest, summary.score),
          },
          stats: {
            ...prev.stats,
            totalRuns: prev.stats.totalRuns + 1,
            voiceCasts: prev.stats.voiceCasts + summary.voiceCasts,
            totalCasts: prev.stats.totalCasts + summary.totalCasts,
            deathEatersDefeated: prev.stats.deathEatersDefeated + summary.deathEatersDefeated,
            bossesDefeated: prev.stats.bossesDefeated + (summary.bossDefeated ? 1 : 0),
            scrollsCollected: prev.stats.scrollsCollected + summary.scrollsCollected,
            obstaclesCleared: prev.stats.obstaclesCleared + summary.obstaclesCleared,
            noDamageBossWins: prev.stats.noDamageBossWins + (summary.noDamageBoss ? 1 : 0),
            prioriClashesWon: prev.stats.prioriClashesWon + summary.prioriClashesWon,
          },
        };
      });
    },
    [commitProgressWithAchievements]
  );

  const handleResetSave = () => {
    const fresh = createInitialProgress();
    setProgress(fresh);
    saveProgress(fresh);
    pushToast('存档已重置', '所有关卡、咒语与服装已恢复初始状态');
  };

  const equippedCostume = COSTUME_MAP[progress.equippedCostume];

  return (
    <div className="min-h-screen bg-[#0B0E17] text-[#F1EDE4]">
      {/* Strict 3-Zone Top Bar Contract (Hidden during active parkour to maximize game viewport) */}
      {!activeLevel && (
        <header className="border-b border-white/10 bg-[#0B0E17]/95 backdrop-blur-xs">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:gap-8 sm:px-6 sm:py-4">
            {/* Zone 1: Single text element wordmark */}
            <button
              onClick={() => {
                setActiveLevel(null);
                setActiveTab('home');
              }}
              className="whitespace-nowrap shrink-0 font-display text-lg font-bold tracking-wide text-[#E5B84B] hover:text-[#FDE68A]"
            >
              Hogwarts Dash
            </button>

            {/* Zone 2: 4 concise single-line nav links */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              {(
                [
                  { id: 'home', label: '冒险主页' },
                  { id: 'spellbook', label: '咒语库' },
                  { id: 'wardrobe', label: '巫师衣柜' },
                  { id: 'achievements', label: '成就殿堂' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveLevel(null);
                    setActiveTab(item.id);
                  }}
                  className={`whitespace-nowrap shrink-0 transition-colors ${
                    activeTab === item.id && !activeLevel
                      ? 'text-[#E5B84B] underline decoration-[#E5B84B] decoration-2 underline-offset-8'
                      : 'text-[#CBD5E1] hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Zone 3: 1 primary action */}
            <div className="shrink-0">
              <button
                onClick={() => {
                  const targetLvl =
                    LEVELS.find((l) => l.id === progress.unlockedLevelMax) || LEVELS[0];
                  setActiveLevel(targetLvl);
                }}
                className="whitespace-nowrap shrink-0 rounded-lg bg-[#E5B84B] px-4 py-2 text-xs sm:text-sm font-semibold text-[#0B0E17] transition-colors hover:bg-[#F3C963]"
              >
                开始跑酷
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Mobile Nav Strip */}
      {!activeLevel && (
        <div className="flex items-center justify-around border-b border-white/10 bg-[#101522] px-2 py-2 md:hidden">
          {(
            [
              { id: 'home', label: '主页' },
              { id: 'spellbook', label: '咒语库' },
              { id: 'wardrobe', label: '衣柜' },
              { id: 'achievements', label: '成就' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === item.id
                  ? 'bg-[#E5B84B] text-[#0B0E17] font-semibold'
                  : 'text-[#CBD5E1]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        {activeLevel ? (
          <GameCanvas
            level={activeLevel}
            progress={progress}
            onExit={() => setActiveLevel(null)}
            onCompleteRun={handleCompleteRun}
            onToggleSound={() =>
              setProgress((p) => ({ ...p, soundEnabled: !p.soundEnabled }))
            }
            onChangeVoiceLang={(lang) =>
              setProgress((p) => ({ ...p, voiceLanguage: lang }))
            }
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <div className="space-y-10">
                {/* Hero Banner + Wizard Loadout Split */}
                <section className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
                  {/* Left: Atmospheric Pixel Art Hero */}
                  <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#141928] lg:col-span-8">
                    <img
                      src={heroBanner}
                      alt="霍格沃茨城堡像素夜景"
                      referrerPolicy="no-referrer"
                      className="pixelated h-56 w-full object-cover sm:h-72 lg:h-full"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E17] via-[#0B0E17]/70 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                      <div className="text-xs font-medium text-[#E5B84B]">
                        平面像素跑酷 · 实时语音施法 · 咒语学习单收集
                      </div>
                      <h1 className="mt-2 max-w-xl text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        用你的声音念出魔咒，穿越黑魔法防线
                      </h1>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#CBD5E1]">
                        在跑酷中跨越魔鬼网、封印门与厉火墙，拾取散落的【咒语学习单】解锁新魔法，击退食死徒并在每关尽头直面黑魔法 Boss！
                      </p>
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                          onClick={() =>
                            setActiveLevel(
                              LEVELS.find((l) => l.id === progress.unlockedLevelMax) || LEVELS[0]
                            )
                          }
                          className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#E5B84B] px-5 py-2.5 text-sm font-semibold text-[#0B0E17] transition-colors hover:bg-[#F3C963]"
                        >
                          <Play className="h-4 w-4" />
                          <span>立即出征</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('spellbook')}
                          className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/20 bg-[#141928]/85 px-4 py-2.5 text-sm font-medium text-[#F1EDE4] hover:border-[#E5B84B]"
                        >
                          <BookOpen className="h-4 w-4 text-[#E5B84B]" />
                          <span>研习咒语库 ({progress.learnedSpells.length}/{SPELLS.length})</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right: Active Wizard Loadout & Wallet */}
                  <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#141928] p-6 lg:col-span-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-[#94A3B8]">当前出战装扮</div>
                        <div className="mt-0.5 font-semibold text-[#F1EDE4]">
                          {equippedCostume.nameZh}
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('wardrobe')}
                        className="whitespace-nowrap text-xs font-medium text-[#E5B84B] hover:underline"
                      >
                        更换服装
                      </button>
                    </div>

                    <div className="my-4 flex justify-center">
                      <PixelCharacterPreview
                        palette={equippedCostume.palette}
                        width={220}
                        height={145}
                        scale={4}
                      />
                    </div>

                    <div className="space-y-3 border-t border-white/10 pt-4 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#94A3B8]">持有金加隆</span>
                        <span className="font-mono-num text-sm font-bold text-[#E5B84B]">
                          {progress.galleons} G
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#94A3B8]">咒语学习单碎片</span>
                        <span className="font-mono-num text-sm font-bold text-[#38BDF8]">
                          {progress.scrollFragments} 张
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#94A3B8]">成就达成</span>
                        <span className="font-mono-num text-sm font-bold text-[#10B981]">
                          {progress.achievementsUnlocked.length} / {ACHIEVEMENTS.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() =>
                            setProgress((p) => ({
                              ...p,
                              voiceLanguage: p.voiceLanguage === 'zh-CN' ? 'en-US' : 'zh-CN',
                            }))
                          }
                          className="flex items-center gap-1.5 text-[#CBD5E1] hover:text-white"
                        >
                          <Mic className="h-3.5 w-3.5 text-[#10B981]" />
                          <span>语音：{progress.voiceLanguage === 'zh-CN' ? '中文咒语' : 'English'}</span>
                        </button>
                        <button
                          onClick={() =>
                            setProgress((p) => ({ ...p, soundEnabled: !p.soundEnabled }))
                          }
                          className="flex items-center gap-1 text-[#CBD5E1] hover:text-white"
                        >
                          {progress.soundEnabled ? (
                            <Volume2 className="h-3.5 w-3.5" />
                          ) : (
                            <VolumeX className="h-3.5 w-3.5" />
                          )}
                          <span>{progress.soundEnabled ? '音效开' : '静音'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 4 Levels & Bosses Selection */}
                <section className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className="font-display text-2xl font-bold text-[#F1EDE4]">
                        魔法关卡与食死徒 Boss 挑战
                      </h2>
                      <p className="mt-1 text-sm text-[#94A3B8]">
                        每关均有大量巡逻/飞行食死徒与专属魔法障碍，抵达终点将与守关 Boss 展开决斗
                      </p>
                    </div>
                    <button
                      onClick={handleResetSave}
                      className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#CBD5E1]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>重置本地存档</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {LEVELS.map((lvl) => {
                      const unlocked = lvl.id <= progress.unlockedLevelMax;
                      const completed = progress.completedLevels.includes(lvl.id);
                      const best = progress.bestScores[lvl.id] || 0;

                      return (
                        <div
                          key={lvl.id}
                          className={`flex flex-col justify-between overflow-hidden rounded-xl border transition-colors ${
                            unlocked
                              ? 'border-white/10 bg-[#141928] hover:border-[#E5B84B]/50'
                              : 'border-white/5 bg-[#101420] opacity-75'
                          }`}
                        >
                          <div className="relative h-36 overflow-hidden">
                            <img
                              src={lvl.backdropImage}
                              alt={lvl.nameZh}
                              referrerPolicy="no-referrer"
                              className="pixelated h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#141928] via-[#141928]/40 to-transparent" />
                            <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between gap-2">
                              <div>
                                <div className="text-xs text-[#E5B84B]">{lvl.subtitleZh}</div>
                                <h3 className="font-display text-lg font-bold text-white">
                                  {lvl.nameZh}
                                </h3>
                              </div>
                              {completed ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                                  <Check className="h-3.5 w-3.5" /> 已通关
                                </span>
                              ) : !unlocked ? (
                                <span className="flex items-center gap-1 text-xs text-[#94A3B8]">
                                  <Lock className="h-3.5 w-3.5" /> 需通关上一关
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                            <p className="text-xs leading-relaxed text-[#94A3B8]">
                              {lvl.descriptionZh}
                            </p>

                            <div className="space-y-2 rounded-lg border border-white/10 bg-[#0F1320] p-3 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-semibold text-[#F43F5E]">
                                  <Skull className="h-3.5 w-3.5" />
                                  守关 Boss：{lvl.boss.nameZh}
                                </span>
                                <span className="font-mono-num text-[#CBD5E1]">
                                  HP {lvl.boss.maxHp}
                                </span>
                              </div>
                              <div className="text-[#94A3B8]">
                                弱点咒语：
                                <span className="text-[#FDE68A]">
                                  {lvl.boss.weaknessSpells
                                    .map((sid) => SPELL_MAP[sid].nameZh)
                                    .join(' · ')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <div className="font-mono-num text-xs text-[#94A3B8]">
                                奖励 +{lvl.rewardGalleons}G · 最高分 {best}
                              </div>
                              <button
                                disabled={!unlocked}
                                onClick={() => setActiveLevel(lvl)}
                                className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                                  unlocked
                                    ? 'bg-[#E5B84B] text-[#0B0E17] hover:bg-[#F3C963]'
                                    : 'cursor-not-allowed bg-[#22293D] text-[#64748B]'
                                }`}
                              >
                                {unlocked ? '进入关卡' : '未解锁'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Homepage Comprehensive Spellbook Showcase */}
                <section className="space-y-4 border-t border-white/10 pt-8">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-2xl font-bold text-[#F1EDE4]">
                        主页咒语库速览 · {SPELLS.length} 大魔法咒语
                      </h2>
                      <p className="mt-1 text-sm text-[#94A3B8]">
                        支持中文念咒与英文发音。点击任意咒语进入咒语库研习室提升熟练度或管理快捷栏
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('spellbook')}
                      className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-[#E5B84B]/50 bg-[#141928] px-4 py-2 text-xs font-semibold text-[#E5B84B] hover:bg-[#1C2338]"
                    >
                      <ScrollText className="h-4 w-4" />
                      <span>打开完整咒语库与语音练习</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    {SPELLS.map((sp) => {
                      const learned = progress.learnedSpells.includes(sp.id);
                      return (
                        <button
                          key={sp.id}
                          onClick={() => {
                            speakSpellPronunciation(sp.incantation, 'en-US');
                            setFocusedSpellId(sp.id);
                            setActiveTab('spellbook');
                          }}
                          className={`flex flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors ${
                            learned
                              ? 'border-white/10 bg-[#141928] hover:border-[#E5B84B]'
                              : 'border-white/5 bg-[#101420] opacity-60 hover:opacity-90'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span
                              className="h-2.5 w-2.5 rounded-xs"
                              style={{ backgroundColor: sp.color }}
                            />
                            <span className="font-mono-num text-xs text-[#94A3B8]">
                              {learned ? `Lv.${progress.spellMastery[sp.id] || 1}` : '待学'}
                            </span>
                          </div>
                          <div className="mt-2 truncate w-full text-sm font-semibold text-[#F1EDE4]">
                            {sp.nameZh}
                          </div>
                          <div className="truncate w-full font-display text-xs text-[#94A3B8]">
                            {sp.incantation}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'spellbook' && (
              <SpellbookView
                progress={progress}
                initialSpellId={focusedSpellId}
                onUnlockSpell={handleUnlockSpell}
                onPracticeSuccess={handlePracticeSuccess}
                onToggleHotbar={handleToggleHotbar}
              />
            )}

            {activeTab === 'wardrobe' && (
              <WardrobeView
                progress={progress}
                onUnlockCostume={handleUnlockCostume}
                onEquipCostume={handleEquipCostume}
              />
            )}

            {activeTab === 'achievements' && <AchievementsView progress={progress} />}
          </>
        )}
      </main>

      {/* Achievement & Unlock Toasts */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2.5">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-3 rounded-xl border border-[#E5B84B]/50 bg-[#141928]/95 px-4 py-3 shadow-xl backdrop-blur-xs"
            >
              <Award className="mt-0.5 h-5 w-5 shrink-0 text-[#E5B84B]" />
              <div>
                <div className="text-sm font-semibold text-[#F1EDE4]">{t.title}</div>
                <div className="text-xs text-[#CBD5E1]">{t.subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
