import { useState } from 'react';
import { Check, Lock, Sparkles } from 'lucide-react';
import { ACHIEVEMENTS } from '../data/achievements';
import { COSTUMES, COSTUME_MAP } from '../data/costumes';
import { CostumeDef, CostumeId, PlayerProgress } from '../types/game';
import PixelCharacterPreview from './PixelCharacterPreview';

interface WardrobeViewProps {
  progress: PlayerProgress;
  onUnlockCostume: (costume: CostumeDef) => void;
  onEquipCostume: (costumeId: CostumeId) => void;
}

export default function WardrobeView({
  progress,
  onUnlockCostume,
  onEquipCostume,
}: WardrobeViewProps) {
  const [previewId, setPreviewId] = useState<CostumeId>(progress.equippedCostume);
  const [castingDemo, setCastingDemo] = useState(false);

  const previewCostume = COSTUME_MAP[previewId];
  const isUnlocked = progress.unlockedCostumes.includes(previewCostume.id);
  const isEquipped = progress.equippedCostume === previewCostume.id;
  const reqAch = previewCostume.requiredAchievementId
    ? ACHIEVEMENTS.find((a) => a.id === previewCostume.requiredAchievementId)
    : null;

  const triggerPreviewCast = () => {
    setCastingDemo(true);
    setTimeout(() => setCastingDemo(false), 650);
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left: Live Pixel Character Preview & Stats */}
      <div className="lg:col-span-5">
        <div className="rounded-xl border border-white/10 bg-[#141928] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#94A3B8]">摩金夫人长袍专卖店 · 实时试穿</div>
              <h2 className="mt-1 font-display text-xl font-bold text-[#F1EDE4]">
                {previewCostume.nameZh}
              </h2>
            </div>
            <button
              onClick={triggerPreviewCast}
              className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-white/15 bg-[#1C2338] px-3 py-1.5 text-xs font-medium text-[#F1EDE4] hover:border-[#E5B84B]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#E5B84B]" />
              <span>挥杖预览</span>
            </button>
          </div>

          <div className="flex justify-center py-2">
            <PixelCharacterPreview
              palette={previewCostume.palette}
              width={280}
              height={180}
              scale={5}
              isCasting={castingDemo}
            />
          </div>

          <p className="text-sm leading-relaxed text-[#CBD5E1]">
            {previewCostume.descriptionZh}
          </p>

          <div className="rounded-lg border border-white/10 bg-[#0F1320] p-4 space-y-2">
            <div className="text-xs font-medium text-[#94A3B8]">服装魔力加成</div>
            <div className="text-sm font-semibold text-[#E5B84B]">
              {previewCostume.bonusTextZh}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-[#94A3B8] font-mono-num">
              <div>生命加成: +{previewCostume.modifiers.maxHpBonus}</div>
              <div>魔力回复: {Math.round(previewCostume.modifiers.manaRegenMult * 100)}%</div>
              <div>冷却缩减: {Math.round((1 - previewCostume.modifiers.cooldownMult) * 100)}%</div>
              <div>Boss增伤: +{Math.round((previewCostume.modifiers.bossDmgMult - 1) * 100)}%</div>
            </div>
          </div>

          {isEquipped ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 py-2.5 text-sm font-semibold text-emerald-300">
              <Check className="h-4 w-4" />
              <span>当前已穿戴此服装</span>
            </div>
          ) : isUnlocked ? (
            <button
              onClick={() => onEquipCostume(previewCostume.id)}
              className="w-full rounded-lg bg-[#E5B84B] py-2.5 text-sm font-semibold text-[#0B0E17] transition-colors hover:bg-[#F3C963]"
            >
              穿戴此服装
            </button>
          ) : previewCostume.unlockType === 'galleons' ? (
            <button
              onClick={() => onUnlockCostume(previewCostume)}
              disabled={progress.galleons < previewCostume.costGalleons}
              className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                progress.galleons >= previewCostume.costGalleons
                  ? 'bg-[#E5B84B] text-[#0B0E17] hover:bg-[#F3C963]'
                  : 'cursor-not-allowed bg-[#252D44] text-[#64748B]'
              }`}
            >
              花费 {previewCostume.costGalleons} 金加隆购买并穿戴
            </button>
          ) : (
            <div className="rounded-lg border border-white/10 bg-[#0F1320] p-3 text-center text-xs text-[#94A3B8]">
              需达成成就解锁：{reqAch ? `【${reqAch.titleZh}】(${reqAch.descriptionZh})` : '特殊成就'}
            </div>
          )}
        </div>
      </div>

      {/* Right: Costume Collection Grid */}
      <div className="lg:col-span-7 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold text-[#F1EDE4]">巫师衣柜收藏</h3>
            <p className="mt-1 text-sm text-[#94A3B8]">
              已收集 {progress.unlockedCostumes.length} / {COSTUMES.length} 套服装 · 每套服装均会在像素跑酷中实时更换外观与特效
            </p>
          </div>
          <div className="font-mono-num text-sm font-semibold text-[#E5B84B]">
            {progress.galleons} 金加隆
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {COSTUMES.map((costume) => {
            const unlocked = progress.unlockedCostumes.includes(costume.id);
            const equipped = progress.equippedCostume === costume.id;
            const selected = previewId === costume.id;

            return (
              <button
                key={costume.id}
                onClick={() => setPreviewId(costume.id)}
                className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                  selected
                    ? 'border-[#E5B84B] bg-[#1C2338]'
                    : 'border-white/10 bg-[#141928] hover:border-white/20'
                }`}
              >
                {/* Mini Swatch */}
                <div
                  className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-white/15"
                  style={{ backgroundColor: costume.palette.robeMain }}
                >
                  <div
                    className="h-2.5 w-8 rounded-sm"
                    style={{ backgroundColor: costume.palette.scarfPrimary }}
                  />
                  <div
                    className="mt-1 h-1.5 w-8 rounded-sm"
                    style={{ backgroundColor: costume.palette.trim }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-[#F1EDE4]">
                      {costume.nameZh}
                    </span>
                    {equipped ? (
                      <span className="shrink-0 text-xs font-semibold text-emerald-400">
                        已装备
                      </span>
                    ) : unlocked ? (
                      <span className="shrink-0 text-xs text-[#94A3B8]">已拥有</span>
                    ) : (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[#94A3B8]">
                    {costume.originZh}
                  </div>
                  <div className="mt-2 truncate text-xs font-medium text-[#E5B84B]">
                    {costume.unlockType === 'galleons' && !unlocked
                      ? `${costume.costGalleons} 金加隆 · ${costume.bonusTextZh}`
                      : costume.bonusTextZh}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
