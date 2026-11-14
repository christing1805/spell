import { useState } from 'react';
import { Award, CheckCircle2, Lock } from 'lucide-react';
import { ACHIEVEMENTS } from '../data/achievements';
import { COSTUME_MAP } from '../data/costumes';
import { AchievementCategory, PlayerProgress } from '../types/game';

interface AchievementsViewProps {
  progress: PlayerProgress;
}

const CAT_LABELS: Record<'all' | AchievementCategory, string> = {
  all: '全部成就',
  voice: '声控施法',
  combat: '决斗与Boss',
  exploration: '跑酷与探索',
  collection: '收藏与研习',
};

export default function AchievementsView({ progress }: AchievementsViewProps) {
  const [cat, setCat] = useState<'all' | AchievementCategory>('all');

  const visible = ACHIEVEMENTS.filter((a) => cat === 'all' || a.category === cat);
  const completedCount = progress.achievementsUnlocked.length;

  return (
    <div className="space-y-6">
      {/* Stats Summary Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#141928] p-4">
          <div className="text-xs text-[#94A3B8]">成就达成进度</div>
          <div className="mt-1 font-mono-num text-2xl font-bold text-[#E5B84B]">
            {completedCount} / {ACHIEVEMENTS.length}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141928] p-4">
          <div className="text-xs text-[#94A3B8]">语音施法次数</div>
          <div className="mt-1 font-mono-num text-2xl font-bold text-[#38BDF8]">
            {progress.stats.voiceCasts}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141928] p-4">
          <div className="text-xs text-[#94A3B8]">击败食死徒</div>
          <div className="mt-1 font-mono-num text-2xl font-bold text-[#F1EDE4]">
            {progress.stats.deathEatersDefeated}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#141928] p-4">
          <div className="text-xs text-[#94A3B8]">拾取咒语学习单</div>
          <div className="mt-1 font-mono-num text-2xl font-bold text-[#10B981]">
            {progress.stats.scrollsCollected}
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-[#121725] p-1 w-fit">
        {(['all', 'voice', 'combat', 'exploration', 'collection'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              cat === c
                ? 'bg-[#E5B84B] text-[#0B0E17] font-semibold'
                : 'text-[#94A3B8] hover:text-[#F1EDE4]'
            }`}
          >
            {CAT_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Achievement List */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visible.map((ach) => {
          const unlocked = progress.achievementsUnlocked.includes(ach.id);
          const current = Math.min(ach.target, progress.stats[ach.statKey] ?? 0);
          const pct = Math.round((current / ach.target) * 100);
          const rewardCostume = ach.rewardCostumeId ? COSTUME_MAP[ach.rewardCostumeId] : null;

          return (
            <div
              key={ach.id}
              className={`flex flex-col justify-between rounded-xl border p-5 transition-colors ${
                unlocked
                  ? 'border-[#E5B84B]/45 bg-[#182034]'
                  : 'border-white/10 bg-[#141928]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      unlocked
                        ? 'border-[#E5B84B]/50 bg-[#E5B84B]/15 text-[#E5B84B]'
                        : 'border-white/10 bg-[#0F1320] text-[#64748B]'
                    }`}
                  >
                    {unlocked ? <CheckCircle2 className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                  </div>
                  <div>
                    <h4 className="font-semibold text-[#F1EDE4]">{ach.titleZh}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">
                      {ach.descriptionZh}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 font-mono-num text-xs font-semibold">
                  {unlocked ? (
                    <span className="text-emerald-400">已领取</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#94A3B8]">
                      <Lock className="h-3 w-3" />
                      {current}/{ach.target}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0B0E17]">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: unlocked ? '#10B981' : '#E5B84B',
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#CBD5E1]">
                  <span className="text-[#94A3B8]">奖励：</span>
                  <span className="font-mono-num text-[#E5B84B]">+{ach.rewardGalleons} 金加隆</span>
                  {ach.rewardScrolls > 0 && (
                    <span className="font-mono-num text-[#38BDF8]">
                      +{ach.rewardScrolls} 咒语学习单
                    </span>
                  )}
                  {rewardCostume && (
                    <span className="text-amber-300">限定服装：{rewardCostume.nameZh}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
