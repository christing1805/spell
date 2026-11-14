import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Search, BookOpen, Check, Lock, Volume2 } from 'lucide-react';
import { CATEGORY_LABELS, SPELLS, SPELL_MAP } from '../data/spells';
import { PlayerProgress, SpellCategory, SpellDef, SpellId } from '../types/game';
import { isSpeechRecognitionSupported, VoiceSpellController } from '../utils/voiceEngine';
import { soundEngine, speakSpellPronunciation } from '../utils/sound';

interface SpellbookViewProps {
  progress: PlayerProgress;
  initialSpellId?: SpellId;
  onUnlockSpell: (spell: SpellDef) => void;
  onPracticeSuccess: (spellId: SpellId, viaVoice: boolean) => void;
  onToggleHotbar: (spellId: SpellId) => void;
}

function WandGlyph({ movement, color }: { movement: SpellDef['wandMovement']; color: string }) {
  const paths: Record<SpellDef['wandMovement'], string> = {
    line: 'M 10 38 L 54 14',
    wave: 'M 8 34 Q 20 12, 32 28 T 56 16',
    circle: 'M 32 10 A 18 18 0 1 1 31.9 10 Z',
    zig: 'M 10 14 L 26 38 L 38 14 L 54 38',
    triangle: 'M 32 10 L 52 40 L 12 40 Z',
    star: 'M 32 8 L 38 24 L 54 24 L 41 33 L 46 48 L 32 39 L 18 48 L 23 33 L 10 24 L 26 24 Z',
  };

  return (
    <svg viewBox="0 0 64 56" className="h-14 w-16 shrink-0" aria-hidden="true">
      <path
        d={paths[movement]}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="54" cy={movement === 'circle' ? 28 : 16} r="3" fill="#FFFFFF" opacity="0.85" />
    </svg>
  );
}

export default function SpellbookView({
  progress,
  initialSpellId,
  onUnlockSpell,
  onPracticeSuccess,
  onToggleHotbar,
}: SpellbookViewProps) {
  const [filterCat, setFilterCat] = useState<'all' | SpellCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<SpellId>(initialSpellId || 'expelliarmus');
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [heardText, setHeardText] = useState('');
  const [micError, setMicError] = useState('');
  const [practiceFlash, setPracticeFlash] = useState<string | null>(null);
  const [speakingLang, setSpeakingLang] = useState<'zh' | 'en' | null>(null);
  const voiceRef = useRef<VoiceSpellController | null>(null);

  const selectedSpell = SPELL_MAP[selectedId];
  const isLearned = progress.learnedSpells.includes(selectedSpell.id);
  const mastery = progress.spellMastery[selectedSpell.id] || 0;
  const inHotbar = progress.equippedHotbar.includes(selectedSpell.id);

  const filteredSpells = useMemo(() => {
    return SPELLS.filter((s) => {
      if (filterCat !== 'all' && s.category !== filterCat) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.nameZh.toLowerCase().includes(q) ||
          s.incantation.toLowerCase().includes(q) ||
          s.counteredTargetsZh.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filterCat, searchQuery]);

  useEffect(() => {
    const controller = new VoiceSpellController();
    voiceRef.current = controller;
    return () => {
      controller.stop();
    };
  }, []);

  useEffect(() => {
    const controller = voiceRef.current;
    if (!controller) return;
    controller.setLanguage(progress.voiceLanguage);
    controller.setAllowedSpells([selectedId]);
    controller.setCallbacks({
      onTranscript: (text) => setHeardText(text),
      onStatus: (active, err) => {
        setIsMicTesting(active);
        if (err) setMicError(err);
      },
      onSpell: (matchedId) => {
        if (matchedId === selectedId && progress.learnedSpells.includes(matchedId)) {
          soundEngine.playSpellCast(SPELL_MAP[matchedId].category);
          onPracticeSuccess(matchedId, true);
          setPracticeFlash(`语音识别成功：${SPELL_MAP[matchedId].nameZh}！熟练度提升`);
          setTimeout(() => setPracticeFlash(null), 2200);
        }
      },
    });
  }, [selectedId, progress.voiceLanguage, progress.learnedSpells, onPracticeSuccess]);

  const togglePracticeMic = () => {
    const controller = voiceRef.current;
    if (!controller) return;
    setMicError('');
    if (isMicTesting) {
      controller.stop();
    } else {
      controller.start();
    }
  };

  const handleManualPractice = () => {
    if (!isLearned) return;
    soundEngine.playSpellCast(selectedSpell.category);
    onPracticeSuccess(selectedSpell.id, false);
    setPracticeFlash(`施法研习完成：${selectedSpell.nameZh} 熟练度 +1`);
    setTimeout(() => setPracticeFlash(null), 2000);
  };

  const canAffordUnlock =
    progress.galleons >= selectedSpell.unlockCostGalleons &&
    progress.scrollFragments >= selectedSpell.unlockCostScrolls;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left: Comprehensive Spell Catalog */}
      <div className="lg:col-span-7 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#F1EDE4]">
              霍格沃茨全系咒语库
            </h2>
            <p className="mt-1 text-sm text-[#94A3B8]">
              已掌握 {progress.learnedSpells.length} / {SPELLS.length} 个魔咒 · 跑酷中拾取【咒语学习单】或消耗加隆研习解锁
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索咒语或克制障碍..."
              className="w-full rounded-lg border border-white/10 bg-[#141928] py-2 pl-9 pr-3 text-sm text-[#F1EDE4] placeholder-[#64748B] focus:border-[#E5B84B] focus:outline-none"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-[#121725] p-1">
          {(['all', 'attack', 'defense', 'utility', 'healing'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterCat === cat
                  ? 'bg-[#E5B84B] text-[#0B0E17] font-semibold'
                  : 'text-[#94A3B8] hover:text-[#F1EDE4]'
              }`}
            >
              {cat === 'all' ? '全部咒语' : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Spell Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredSpells.map((spell) => {
            const learned = progress.learnedSpells.includes(spell.id);
            const active = selectedId === spell.id;
            const lvl = progress.spellMastery[spell.id] || 0;
            const equipped = progress.equippedHotbar.includes(spell.id);

            return (
              <button
                key={spell.id}
                onClick={() => setSelectedId(spell.id)}
                className={`group flex flex-col justify-between rounded-lg border p-4 text-left transition-all ${
                  active
                    ? 'border-[#E5B84B] bg-[#1C2338]'
                    : 'border-white/10 bg-[#141928] hover:border-white/20 hover:bg-[#181E30]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: spell.color }}
                      />
                      <span className="truncate text-base font-semibold text-[#F1EDE4]">
                        {spell.nameZh}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-display text-xs tracking-wide text-[#CBD5E1]">
                      {spell.incantation}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs font-mono-num">
                    {learned ? (
                      <span className="text-[#E5B84B]">Lv.{lvl}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[#64748B]">
                        <Lock className="h-3.5 w-3.5" />
                        未习得
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-[#94A3B8]">
                  <span className="truncate">
                    {CATEGORY_LABELS[spell.category]} · 魔力 {spell.manaCost}
                  </span>
                  {equipped && (
                    <span className="shrink-0 text-[#38BDF8]">快捷栏</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Spell Inspector & Voice Practice Studio */}
      <div className="lg:col-span-5">
        <div className="sticky top-6 rounded-xl border border-white/10 bg-[#141928] p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="text-xs text-[#94A3B8]">
                {CATEGORY_LABELS[selectedSpell.category]} · 语音指令：{selectedSpell.voiceAliases.slice(0, 2).join(' / ')}
              </div>
              <h3 className="mt-1 text-2xl font-bold text-[#F1EDE4]">
                {selectedSpell.nameZh}
              </h3>
              <p className="font-display text-base tracking-wider text-[#E5B84B]">
                {selectedSpell.incantation}
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                音译读法：{selectedSpell.phoneticZh}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSpeakingLang('zh');
                    speakSpellPronunciation(selectedSpell.nameZh, 'zh-CN', () =>
                      setSpeakingLang(null)
                    );
                  }}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    speakingLang === 'zh'
                      ? 'border-[#E5B84B] bg-[#E5B84B]/20 text-[#FDE68A]'
                      : 'border-white/15 bg-[#1B2235] text-[#F1EDE4] hover:border-[#E5B84B]/60'
                  }`}
                >
                  <Volume2 className="h-3.5 w-3.5 text-[#E5B84B]" />
                  <span>{speakingLang === 'zh' ? '朗读中...' : '听中文读音'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpeakingLang('en');
                    speakSpellPronunciation(selectedSpell.incantation, 'en-US', () =>
                      setSpeakingLang(null)
                    );
                  }}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    speakingLang === 'en'
                      ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-[#BAE6FD]'
                      : 'border-white/15 bg-[#1B2235] text-[#CBD5E1] hover:border-[#38BDF8]/60'
                  }`}
                >
                  <Volume2 className="h-3.5 w-3.5 text-[#38BDF8]" />
                  <span>{speakingLang === 'en' ? 'Speaking...' : '听英文咒语'}</span>
                </button>
              </div>
            </div>
            <WandGlyph movement={selectedSpell.wandMovement} color={selectedSpell.color} />
          </div>

          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-[#CBD5E1]">
              {selectedSpell.descriptionZh}
            </p>

            <div className="rounded-lg border border-white/10 bg-[#0F1320] p-3.5">
              <div className="text-xs font-medium text-[#94A3B8]">克制目标与效果</div>
              <div className="mt-1 text-sm font-medium text-[#F1EDE4]">
                {selectedSpell.counteredTargetsZh}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-white/10 bg-[#0F1320] p-3">
                <div className="text-xs text-[#94A3B8]">魔力消耗</div>
                <div className="mt-1 font-mono-num text-base font-semibold text-[#38BDF8]">
                  {selectedSpell.manaCost}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0F1320] p-3">
                <div className="text-xs text-[#94A3B8]">冷却时间</div>
                <div className="mt-1 font-mono-num text-base font-semibold text-[#F1EDE4]">
                  {(selectedSpell.cooldownMs / 1000).toFixed(1)}s
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0F1320] p-3">
                <div className="text-xs text-[#94A3B8]">基础威力</div>
                <div className="mt-1 font-mono-num text-base font-semibold text-[#E5B84B]">
                  {selectedSpell.damage > 0 ? selectedSpell.damage + Math.max(0, mastery - 1) * 4 : '辅助'}
                </div>
              </div>
            </div>
          </div>

          {/* Unlock OR Practice Section */}
          {!isLearned ? (
            <div className="space-y-3 rounded-lg border border-[#E5B84B]/30 bg-[#1B2133] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#FDE68A]">尚未学习该咒语</span>
                <span className="font-mono-num text-xs text-[#CBD5E1]">
                  持有：{progress.scrollFragments} 学习单 · {progress.galleons} 加隆
                </span>
              </div>
              <p className="text-xs text-[#94A3B8]">
                在跑酷关卡中拾取闪光【咒语学习单】可免费领悟新咒语，或直接消耗资源在咒语库中研习：
              </p>
              <button
                onClick={() => onUnlockSpell(selectedSpell)}
                disabled={!canAffordUnlock}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  canAffordUnlock
                    ? 'bg-[#E5B84B] text-[#0B0E17] hover:bg-[#F3C963]'
                    : 'cursor-not-allowed bg-[#252D44] text-[#64748B]'
                }`}
              >
                消耗 {selectedSpell.unlockCostScrolls} 学习单 + {selectedSpell.unlockCostGalleons} 加隆 · 立即学习
              </button>
            </div>
          ) : (
            <div className="space-y-4 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#E5B84B]" />
                  <span className="text-sm font-semibold text-[#F1EDE4]">
                    咒语研习室（熟练度 Lv.{mastery} / 5）
                  </span>
                </div>
                <button
                  onClick={() => onToggleHotbar(selectedSpell.id)}
                  className={`whitespace-nowrap shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    inHotbar
                      ? 'border-[#38BDF8]/50 bg-[#38BDF8]/15 text-[#38BDF8]'
                      : 'border-white/15 text-[#CBD5E1] hover:border-white/30'
                  }`}
                >
                  {inHotbar ? '已放入快捷栏' : '加入快捷栏'}
                </button>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-[#0B0E17]">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${(mastery / 5) * 100}%`,
                    backgroundColor: selectedSpell.color,
                  }}
                />
              </div>

              <p className="text-xs text-[#94A3B8]">
                提升熟练度可增加咒语威力并缩短冷却。对战中所有已学咒语均可直接通过语音喊出！
              </p>

              <div className="flex flex-wrap gap-2.5">
                {isSpeechRecognitionSupported() && (
                  <button
                    onClick={togglePracticeMic}
                    className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      isMicTesting
                        ? 'bg-[#10B981] text-[#052E16]'
                        : 'border border-white/15 bg-[#1B2235] text-[#F1EDE4] hover:border-[#E5B84B]/60'
                    }`}
                  >
                    {isMicTesting ? (
                      <>
                        <Mic className="h-4 w-4" />
                        <span>正在聆听：{selectedSpell.nameZh}</span>
                      </>
                    ) : (
                      <>
                        <MicOff className="h-4 w-4" />
                        <span>语音念咒试炼</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={handleManualPractice}
                  className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E5B84B] px-4 py-2.5 text-sm font-semibold text-[#0B0E17] transition-colors hover:bg-[#F3C963]"
                >
                  <Volume2 className="h-4 w-4" />
                  <span>模拟吟唱练习</span>
                </button>
              </div>

              {heardText && (
                <div className="rounded-md bg-[#0F1320] px-3 py-2 text-xs text-[#94A3B8]">
                  识别结果：<span className="text-[#F1EDE4]">{heardText}</span>
                </div>
              )}

              {micError && (
                <div className="rounded-md bg-red-950/50 px-3 py-2 text-xs text-red-300">
                  {micError}
                </div>
              )}

              {practiceFlash && (
                <div className="flex items-center gap-2 rounded-md bg-emerald-950/60 px-3 py-2 text-xs font-medium text-emerald-300">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{practiceFlash}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
