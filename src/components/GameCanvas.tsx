import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Shield,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { COSTUME_MAP } from '../data/costumes';
import { LEVELS } from '../data/levels';
import { SPELLS, SPELL_MAP } from '../data/spells';
import {
  LevelDef,
  ObstacleType,
  PlayerProgress,
  SpellId,
} from '../types/game';
import {
  drawBossSprite,
  drawDeathEaterSprite,
  drawGalleonPickup,
  drawHealPickup,
  drawObstacleSprite,
  drawScrollPickup,
  drawWizardSprite,
} from '../utils/pixelSprites';
import { soundEngine } from '../utils/sound';
import { isSpeechRecognitionSupported, VoiceSpellController } from '../utils/voiceEngine';

export interface RunResultSummary {
  levelId: number;
  victory: boolean;
  score: number;
  distance: number;
  galleonsEarned: number;
  scrollsCollected: number;
  newlyLearnedSpells: SpellId[];
  deathEatersDefeated: number;
  obstaclesCleared: number;
  voiceCasts: number;
  totalCasts: number;
  bossDefeated: boolean;
  noDamageBoss: boolean;
  prioriClashesWon: number;
}

interface GameCanvasProps {
  level: LevelDef;
  progress: PlayerProgress;
  onExit: () => void;
  onCompleteRun: (summary: RunResultSummary) => void;
  onToggleSound: () => void;
  onChangeVoiceLang: (lang: 'zh-CN' | 'en-US') => void;
}

interface Platform {
  x: number;
  y: number;
  w: number;
}

interface ObstacleEntity {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  w: number;
  h: number;
  cleared: boolean;
  liftedOffset: number;
  lifting: boolean;
}

interface DeathEaterEntity {
  id: number;
  variant: 'scout' | 'shielded' | 'flier';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  frozenTimer: number;
  shootTimer: number;
  defeated: boolean;
}

interface Projectile {
  id: number;
  fromPlayer: boolean;
  spellId?: SpellId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  damage: number;
  reflected?: boolean;
}

interface PickupEntity {
  id: number;
  kind: 'galleon' | 'scroll' | 'heal';
  x: number;
  y: number;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

function getViewportMetrics(compact: boolean) {
  return compact
    ? { w: 560, h: 390, groundY: 320, playerX: 54, bossStopOffset: 122 }
    : { w: 1080, h: 480, groundY: 396, playerX: 148, bossStopOffset: 196 };
}

const OBSTACLE_LABELS: Record<ObstacleType, { name: string; hint: string; color: string }> = {
  devils_snare: { name: '魔鬼网', hint: '火焰熊熊 / 跳', color: '#34D399' },
  locked_gate: { name: '封印铁门', hint: '阿拉霍洞开', color: '#F59E0B' },
  stone_pillar: { name: '巨石柱', hint: '悬浮咒 / 滑铲', color: '#A78BFA' },
  fiendfyre: { name: '厉火墙', hint: '清水如泉', color: '#FB923C' },
  dark_mist: { name: '黑暗迷雾', hint: '荧光闪烁 / 呼神护卫', color: '#94A3B8' },
  crystal_wall: { name: '水晶壁垒', hint: '粉身碎骨 / 霹雳爆炸', color: '#60A5FA' },
  boggart_chest: { name: '博格特箱', hint: '滑稽滑稽 / 跳', color: '#EC4899' },
  low_spike: { name: '黑魔地刺', hint: '跳跃 / 盔甲护身', color: '#CBD5E1' },
};

export default function GameCanvas({
  level,
  progress,
  onExit,
  onCompleteRun,
  onToggleSound,
  onChangeVoiceLang,
}: GameCanvasProps) {
  const costume = COSTUME_MAP[progress.equippedCostume];
  const maxHp = 4 + costume.modifiers.maxHpBonus;

  const [isCompact, setIsCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const vp = getViewportMetrics(isCompact);
  const vpRef = useRef(vp);
  vpRef.current = vp;

  useEffect(() => {
    const onResize = () => {
      setIsCompact(window.innerWidth < 768);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const voiceRef = useRef<VoiceSpellController | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [gameOverState, setGameOverState] = useState<'none' | 'victory' | 'defeat'>('none');
  const [runSummary, setRunSummary] = useState<RunResultSummary | null>(null);

  // Voice HUD state
  const [micActive, setMicActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [lastTranscript, setLastTranscript] = useState('');
  const [micError, setMicError] = useState('');
  const [lastCastBanner, setLastCastBanner] = useState<{
    name: string;
    incantation: string;
    color: string;
    viaVoice: boolean;
  } | null>(null);

  // Synced HUD display state (updated periodically or on events)
  const [hud, setHud] = useState({
    hp: maxHp,
    maxHp,
    mana: 100,
    distance: 0,
    score: 0,
    galleons: 0,
    scrolls: 0,
    bossPhase: false,
    bossHp: level.boss.maxHp,
    bossMaxHp: level.boss.maxHp,
    prioriActive: false,
    prioriProgress: 0,
    shieldActive: false,
    slowActive: false,
    cooldowns: {} as Record<string, number>,
    learnedSpells: [...progress.learnedSpells],
    newlyLearned: [] as SpellId[],
  });

  // Mutable game simulation state inside ref for 60fps loop
  const simRef = useRef({
    frame: 0,
    scrollX: 0,
    distance: 0,
    score: 0,
    hp: maxHp,
    maxHp,
    mana: 100,
    galleons: 0,
    scrollsCollected: 0,
    deathEatersDefeated: 0,
    obstaclesCleared: 0,
    voiceCasts: 0,
    totalCasts: 0,
    prioriClashesWon: 0,
    bossDamageTaken: 0,
    learnedSpells: [...progress.learnedSpells] as SpellId[],
    newlyLearnedSpells: [] as SpellId[],

    // Player physics
    py: vp.groundY - 70,
    vy: 0,
    jumpsLeft: 2,
    isSliding: false,
    slideHold: false,
    invulnTimer: 0,
    shieldTimer: 0,
    slowTimer: 0,
    castAnimTimer: 0,
    castColor: costume.palette.wandGlow,

    // Entities
    nextId: 1,
    platforms: [] as Platform[],
    obstacles: [] as ObstacleEntity[],
    deathEaters: [] as DeathEaterEntity[],
    projectiles: [] as Projectile[],
    pickups: [] as PickupEntity[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    spawnCooldown: 1.2,
    enemyCooldown: 2.8,
    scrollSpawnedCount: 0,

    // Boss state
    bossPhase: false,
    bossHp: level.boss.maxHp,
    bossX: vp.w + 120,
    bossY: vp.groundY - 114,
    bossAttackTimer: 2.0,
    bossCastFlash: 0,
    bossHurtFlash: 0,
    prioriState: 'idle' as 'idle' | 'charging' | 'clash',
    prioriTimer: 0,
    prioriMeter: 50, // 0 = lose, 100 = win

    // Cooldown timestamps (ms)
    spellCooldownUntil: {} as Record<string, number>,
    ended: false,
  });

  // Load backdrop image
  useEffect(() => {
    const img = new Image();
    img.src = level.backdropImage;
    img.onload = () => {
      bgImageRef.current = img;
    };
  }, [level.backdropImage]);

  const spawnBurst = (x: number, y: number, color: string, count = 12) => {
    const s = simRef.current;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 70 + Math.random() * 190;
      s.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        size: 3 + Math.floor(Math.random() * 4),
        color,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
      });
    }
  };

  const addFloatText = (x: number, y: number, text: string, color: string) => {
    simRef.current.floatingTexts.push({ x, y, text, color, life: 1.1 });
  };

  // Core spell casting handler (used by Voice, Hotkeys, and Click Hotbar)
  const castSpell = useCallback(
    (spellId: SpellId, viaVoice: boolean) => {
      const s = simRef.current;
      const curVp = vpRef.current;
      if (s.ended || isPaused) return;
      if (!s.learnedSpells.includes(spellId)) return;

      const spell = SPELL_MAP[spellId];
      const now = performance.now();
      const cdUntil = s.spellCooldownUntil[spellId] || 0;
      if (now < cdUntil) {
        addFloatText(curVp.playerX + 20, s.py - 12, '冷却中', '#94A3B8');
        return;
      }

      const mastery = Math.max(1, progress.spellMastery[spellId] || 1);
      const effectiveCost = Math.max(6, spell.manaCost - (mastery - 1));
      if (s.mana < effectiveCost) {
        addFloatText(curVp.playerX + 20, s.py - 12, '魔力不足', '#38BDF8');
        return;
      }

      // Deduct mana & apply cooldown
      s.mana = Math.max(0, s.mana - effectiveCost);
      const cdMs = spell.cooldownMs * costume.modifiers.cooldownMult * (1 - (mastery - 1) * 0.05);
      s.spellCooldownUntil[spellId] = now + cdMs;
      s.castAnimTimer = 0.35;
      s.castColor = spell.color;
      s.totalCasts += 1;
      if (viaVoice) s.voiceCasts += 1;

      soundEngine.playSpellCast(spell.category);
      spawnBurst(curVp.playerX + 64, s.py + 28, spell.color, 10);

      setLastCastBanner({
        name: spell.nameZh,
        incantation: spell.incantation,
        color: spell.color,
        viaVoice,
      });
      setTimeout(() => {
        setLastCastBanner((prev) => (prev?.incantation === spell.incantation ? null : prev));
      }, 1200);

      // Special Priori Incantatem clash reaction for Expelliarmus!
      if (
        spellId === 'expelliarmus' &&
        s.bossPhase &&
        level.boss.id === 'voldemort' &&
        (s.prioriState === 'charging' || s.prioriState === 'clash')
      ) {
        if (s.prioriState === 'charging') {
          s.prioriState = 'clash';
          s.prioriMeter = 58;
          addFloatText(curVp.w / 2 - 90, 150, '闪回咒对波开启！连击除你武器！', '#FDE047');
        } else {
          s.prioriMeter = Math.min(100, s.prioriMeter + 24);
        }
        return;
      }

      // Immediate spell effects
      if (spellId === 'protego' || spellId === 'salvio') {
        const dur = spellId === 'salvio' ? 3.8 : 2.6;
        s.shieldTimer = dur * costume.modifiers.shieldDurMult;
        if (spellId === 'salvio') {
          s.mana = Math.min(100, s.mana + 12);
        }
        soundEngine.playShieldBlock();
        addFloatText(
          curVp.playerX + 20,
          s.py - 16,
          spellId === 'salvio' ? '平安镇守！强效护盾' : '盔甲护身！',
          spell.color
        );
        return;
      }

      if (spellId === 'episkey' || spellId === 'vulnera') {
        const healAmt = spellId === 'vulnera' ? 2 : 1;
        if (s.hp < s.maxHp) {
          s.hp = Math.min(s.maxHp, s.hp + healAmt);
          if (spellId === 'vulnera') s.invulnTimer = Math.max(s.invulnTimer, 1.2);
          soundEngine.playHeal();
          addFloatText(curVp.playerX + 20, s.py - 16, `+${healAmt} 生命恢复`, spell.color);
        } else {
          s.mana = Math.min(100, s.mana + 15);
          addFloatText(curVp.playerX + 20, s.py - 16, '生命已满 · 魔力回充', spell.color);
        }
        return;
      }

      if (spellId === 'arresto' || spellId === 'impedimenta') {
        s.slowTimer = spellId === 'arresto' ? 4.2 : 3.4;
        addFloatText(
          curVp.playerX + 30,
          s.py - 18,
          spellId === 'arresto' ? '减震止速！全场缓速' : '障碍重重！敌军迟滞',
          spell.color
        );
        if (spellId === 'arresto') return;
      }

      if (spellId === 'accio') {
        let pulled = 0;
        for (const pk of s.pickups) {
          if (!pk.collected) {
            pk.x = curVp.playerX + 12;
            pk.y = s.py + 20;
            pulled += 1;
          }
        }
        addFloatText(
          curVp.playerX + 20,
          s.py - 18,
          pulled > 0 ? `飞来咒！吸取 ${pulled} 个战利品` : '飞来咒！视野内暂无道具',
          spell.color
        );
        return;
      }

      if (spellId === 'ascendio') {
        s.vy = -690 * costume.modifiers.jumpBoost;
        s.jumpsLeft = 2;
        s.isSliding = false;
        soundEngine.playJump();
        spawnBurst(curVp.playerX + 24, s.py + 52, spell.color, 12);
        addFloatText(curVp.playerX + 20, s.py - 18, '腾空而起！', spell.color);
        return;
      }

      if (spellId === 'depulso' || spellId === 'obliviate') {
        s.projectiles = s.projectiles.filter((p) => p.fromPlayer);
        for (const de of s.deathEaters) {
          if (!de.defeated && de.x > curVp.playerX && de.x < curVp.playerX + 520) {
            if (spellId === 'depulso') {
              de.x += 170;
            } else {
              de.frozenTimer = 4.5;
              de.shootTimer = 99;
            }
          }
        }
        if (spellId === 'depulso') {
          addFloatText(curVp.playerX + 30, s.py - 18, '飞来飞去！驱逐弹幕', spell.color);
        } else {
          addFloatText(curVp.playerX + 30, s.py - 18, '一忘皆空！食死徒失神', spell.color);
        }
      }

      if (spellId === 'wingardium') {
        let liftedAny = false;
        for (const obs of s.obstacles) {
          if (!obs.cleared && obs.type === 'stone_pillar' && obs.x > curVp.playerX - 20 && obs.x < curVp.playerX + 520) {
            obs.lifting = true;
            obs.cleared = true;
            s.obstaclesCleared += 1;
            s.score += 65;
            liftedAny = true;
            addFloatText(obs.x, obs.y - 20, '羽加迪姆勒维奥萨！', '#A78BFA');
            break;
          }
        }
        if (liftedAny) return;
      }

      if (spellId === 'lumos' || spellId === 'patronum') {
        for (const obs of s.obstacles) {
          if (
            !obs.cleared &&
            obs.x > curVp.playerX &&
            obs.x < curVp.playerX + 500 &&
            (obs.type === 'dark_mist' || (spellId === 'lumos' && obs.type === 'devils_snare'))
          ) {
            obs.cleared = true;
            s.obstaclesCleared += 1;
            s.score += 70;
            spawnBurst(obs.x + obs.w / 2, obs.y + obs.h / 2, spell.color, 14);
            addFloatText(obs.x, obs.y - 12, '黑暗驱散！', spell.color);
          }
        }
      }

      const dmg =
        spell.damage > 0
          ? Math.round((spell.damage + (mastery - 1) * 5) * (s.bossPhase ? costume.modifiers.bossDmgMult : 1))
          : 12;

      s.projectiles.push({
        id: s.nextId++,
        fromPlayer: true,
        spellId,
        x: curVp.playerX + 64,
        y: s.py + 30,
        vx: spellId === 'stupefy' || spellId === 'sectumsempra' ? 880 : 720,
        vy: 0,
        color: spell.color,
        radius: spellId === 'bombarda' || spellId === 'patronum' ? 14 : 10,
        damage: dmg,
      });
    },
    [costume.modifiers, isPaused, level.boss.id, progress.spellMastery]
  );

  // Voice controller wiring
  useEffect(() => {
    const vc = new VoiceSpellController();
    voiceRef.current = vc;
    return () => {
      vc.stop();
    };
  }, []);

  useEffect(() => {
    const vc = voiceRef.current;
    if (!vc) return;
    vc.setLanguage(progress.voiceLanguage);
    vc.setAllowedSpells(hud.learnedSpells);
    vc.setCallbacks({
      onSpell: (spellId) => {
        castSpell(spellId, true);
      },
      onTranscript: (text) => {
        setLastTranscript(text);
      },
      onStatus: (active, err) => {
        setMicActive(active);
        if (err) setMicError(err);
      },
      onVolume: (vol) => {
        setMicVolume(vol);
      },
    });
  }, [castSpell, hud.learnedSpells, progress.voiceLanguage]);

  const toggleMic = () => {
    const vc = voiceRef.current;
    if (!vc) return;
    setMicError('');
    if (micActive) {
      vc.stop();
    } else {
      vc.start();
    }
  };

  // Player jump & slide triggers
  const triggerJump = useCallback(() => {
    const s = simRef.current;
    const curVp = vpRef.current;
    if (s.ended || isPaused) return;
    if (s.jumpsLeft > 0) {
      s.vy = -615 * costume.modifiers.jumpBoost;
      s.jumpsLeft -= 1;
      s.isSliding = false;
      soundEngine.playJump();
      spawnBurst(curVp.playerX + 24, s.py + 58, '#CBD5E1', 5);
    }
  }, [costume.modifiers.jumpBoost, isPaused]);

  const setSlide = useCallback((active: boolean) => {
    const s = simRef.current;
    const curVp = vpRef.current;
    s.slideHold = active;
    if (active && s.py >= curVp.groundY - 74) {
      if (!s.isSliding) soundEngine.playSlide();
      s.isSliding = true;
    } else if (!active) {
      s.isSliding = false;
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        triggerJump();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        setSlide(true);
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        setIsPaused((p) => !p);
      } else if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1;
        const spellId = progress.equippedHotbar[idx];
        if (spellId) castSpell(spellId, false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        setSlide(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [castSpell, progress.equippedHotbar, setSlide, triggerJump]);

  // Reset function for Play Again
  const resetRun = () => {
    const s = simRef.current;
    const curVp = vpRef.current;
    s.frame = 0;
    s.scrollX = 0;
    s.distance = 0;
    s.score = 0;
    s.hp = maxHp;
    s.maxHp = maxHp;
    s.mana = 100;
    s.galleons = 0;
    s.scrollsCollected = 0;
    s.deathEatersDefeated = 0;
    s.obstaclesCleared = 0;
    s.voiceCasts = 0;
    s.totalCasts = 0;
    s.prioriClashesWon = 0;
    s.bossDamageTaken = 0;
    s.learnedSpells = [...progress.learnedSpells];
    s.newlyLearnedSpells = [];
    s.py = curVp.groundY - 70;
    s.vy = 0;
    s.jumpsLeft = 2;
    s.isSliding = false;
    s.invulnTimer = 0;
    s.shieldTimer = 0;
    s.slowTimer = 0;
    s.castAnimTimer = 0;
    s.platforms = [];
    s.obstacles = [];
    s.deathEaters = [];
    s.projectiles = [];
    s.pickups = [];
    s.particles = [];
    s.floatingTexts = [];
    s.spawnCooldown = 1.1;
    s.enemyCooldown = 2.5;
    s.scrollSpawnedCount = 0;
    s.bossPhase = false;
    s.bossHp = level.boss.maxHp;
    s.bossX = curVp.w + 120;
    s.bossY = curVp.groundY - 114;
    s.bossAttackTimer = 2.0;
    s.prioriState = 'idle';
    s.prioriTimer = 0;
    s.prioriMeter = 50;
    s.spellCooldownUntil = {};
    s.ended = false;
    setGameOverState('none');
    setRunSummary(null);
    setIsPaused(false);
  };

  // Main 60FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();
    let hudSyncAccum = 0;
    let rafId = 0;

    const finishRun = (victory: boolean) => {
      const s = simRef.current;
      if (s.ended) return;
      s.ended = true;
      voiceRef.current?.stop();

      if (victory) {
        soundEngine.playVictory();
      } else {
        soundEngine.playHit();
      }

      const bonusGalleons = victory ? level.rewardGalleons : Math.floor(s.galleons * 0.6);
      const totalGalleons = s.galleons + (victory ? bonusGalleons : 0);

      const summary: RunResultSummary = {
        levelId: level.id,
        victory,
        score: Math.round(s.score + (victory ? 500 : 0)),
        distance: Math.round(s.distance),
        galleonsEarned: totalGalleons,
        scrollsCollected: s.scrollsCollected,
        newlyLearnedSpells: [...s.newlyLearnedSpells],
        deathEatersDefeated: s.deathEatersDefeated,
        obstaclesCleared: s.obstaclesCleared,
        voiceCasts: s.voiceCasts,
        totalCasts: s.totalCasts,
        bossDefeated: victory,
        noDamageBoss: victory && s.bossDamageTaken === 0,
        prioriClashesWon: s.prioriClashesWon,
      };

      setRunSummary(summary);
      setGameOverState(victory ? 'victory' : 'defeat');
      onCompleteRun(summary);
    };

    const damagePlayer = () => {
      const s = simRef.current;
      const curVp = vpRef.current;
      if (s.invulnTimer > 0) return;

      if (s.shieldTimer > 0) {
        s.shieldTimer = 0;
        s.invulnTimer = 0.6;
        soundEngine.playShieldBlock();
        spawnBurst(curVp.playerX + 26, s.py + 30, '#38BDF8', 14);
        addFloatText(curVp.playerX + 20, s.py - 14, '护盾抵挡！', '#38BDF8');
        return;
      }

      if (costume.modifiers.dodgeChance > 0 && Math.random() < costume.modifiers.dodgeChance) {
        s.invulnTimer = 0.7;
        addFloatText(curVp.playerX + 20, s.py - 14, '隐形相位闪避！', '#E2E8F0');
        return;
      }

      s.hp -= 1;
      s.invulnTimer = 1.25;
      if (s.bossPhase) s.bossDamageTaken += 1;
      soundEngine.playHit();
      spawnBurst(curVp.playerX + 24, s.py + 30, '#EF4444', 14);
      addFloatText(curVp.playerX + 20, s.py - 14, '-1 生命', '#EF4444');

      if (s.hp <= 0) {
        finishRun(false);
      }
    };

    const update = (dt: number) => {
      const s = simRef.current;
      const curVp = vpRef.current;
      const LOGICAL_W = curVp.w;
      const LOGICAL_H = curVp.h;
      const GROUND_Y = curVp.groundY;
      const PLAYER_X = curVp.playerX;
      if (s.ended || isPaused) return;

      s.frame += dt * 60;
      const worldMult = s.slowTimer > 0 ? 0.5 : 1;
      const runSpeed = (level.baseSpeed + Math.min(85, s.distance * 0.03)) * (s.bossPhase ? 0.85 : 1);

      s.scrollX += runSpeed * dt * worldMult;
      if (!s.bossPhase) {
        s.distance += (runSpeed * dt) / 14;
        s.score += dt * 15;
      }

      // Mana & timers
      s.mana = Math.min(100, s.mana + 11.5 * costume.modifiers.manaRegenMult * dt);
      if (s.invulnTimer > 0) s.invulnTimer -= dt;
      if (s.shieldTimer > 0) s.shieldTimer -= dt;
      if (s.slowTimer > 0) s.slowTimer -= dt;
      if (s.castAnimTimer > 0) s.castAnimTimer -= dt;
      if (s.bossCastFlash > 0) s.bossCastFlash -= dt;
      if (s.bossHurtFlash > 0) s.bossHurtFlash -= dt;

      // Player physics
      const playerH = s.isSliding ? 38 : 70;
      const playerW = 48;
      const prevBottom = s.py + playerH;
      s.vy += 1550 * dt;
      s.py += s.vy * dt;

      // Platform landing check
      let landed = false;
      for (const plat of s.platforms) {
        plat.x -= runSpeed * dt * worldMult;
        if (
          s.vy >= 0 &&
          PLAYER_X + playerW > plat.x &&
          PLAYER_X < plat.x + plat.w &&
          prevBottom <= plat.y + 8 &&
          s.py + playerH >= plat.y
        ) {
          s.py = plat.y - playerH;
          s.vy = 0;
          s.jumpsLeft = 2;
          landed = true;
        }
      }
      s.platforms = s.platforms.filter((p) => p.x + p.w > -60);

      // Ground landing check
      if (!landed && s.py + playerH >= GROUND_Y) {
        s.py = GROUND_Y - playerH;
        s.vy = 0;
        s.jumpsLeft = 2;
        if (s.slideHold) s.isSliding = true;
      }

      // Check transition to Boss Phase!
      if (!s.bossPhase && s.distance >= level.distanceGoal) {
        s.bossPhase = true;
        s.obstacles = [];
        s.bossX = LOGICAL_W + 90;
        s.bossY = GROUND_Y - 114;
        soundEngine.playBossWarning();
        addFloatText(Math.max(40, LOGICAL_W / 2 - 120), 120, `警告：${level.boss.nameZh} 现身！`, '#F43F5E');
      }

      // Spawning obstacles, platforms, Death Eaters & Spell Study Scrolls (pre-boss)
      if (!s.bossPhase) {
        s.spawnCooldown -= dt * worldMult;
        if (s.spawnCooldown <= 0) {
          s.spawnCooldown = 1.45 + Math.random() * 0.95;

          const type = level.obstaclePool[Math.floor(Math.random() * level.obstaclePool.length)];
          const isTall =
            type === 'locked_gate' ||
            type === 'fiendfyre' ||
            type === 'dark_mist' ||
            type === 'crystal_wall' ||
            type === 'stone_pillar';
          const obsW = type === 'low_spike' ? 56 : 54;
          const obsH = type === 'low_spike' ? 30 : type === 'boggart_chest' ? 48 : isTall ? 94 : 60;

          s.obstacles.push({
            id: s.nextId++,
            type,
            x: LOGICAL_W + 40,
            y: GROUND_Y - obsH,
            w: obsW,
            h: obsH,
            cleared: false,
            liftedOffset: 0,
            lifting: false,
          });

          // Elevated platform with Galleons OR Spell Study Scroll!
          if (Math.random() < 0.55) {
            const platX = LOGICAL_W + 170;
            const platY = GROUND_Y - 122 - Math.random() * 30;
            const platW = 150;
            s.platforms.push({ x: platX, y: platY, w: platW });

            const scrollChance = 0.34 + costume.modifiers.scrollDropBonus;
            if (Math.random() < scrollChance && s.scrollSpawnedCount < 3) {
              s.scrollSpawnedCount += 1;
              s.pickups.push({
                id: s.nextId++,
                kind: 'scroll',
                x: platX + platW / 2 - 18,
                y: platY - 46,
                collected: false,
              });
            } else {
              for (let c = 0; c < 3; c++) {
                s.pickups.push({
                  id: s.nextId++,
                  kind: 'galleon',
                  x: platX + 24 + c * 38,
                  y: platY - 34,
                  collected: false,
                });
              }
            }
          } else if (Math.random() < 0.14 && s.hp < s.maxHp) {
            s.pickups.push({
              id: s.nextId++,
              kind: 'heal',
              x: LOGICAL_W + 200,
              y: GROUND_Y - 90,
              collected: false,
            });
          }
        }

        // Death Eater spawns
        s.enemyCooldown -= dt * worldMult;
        if (s.enemyCooldown <= 0) {
          s.enemyCooldown = Math.max(2.1, 3.6 - level.id * 0.3) + Math.random() * 1.4;
          const roll = Math.random();
          const variant: DeathEaterEntity['variant'] =
            level.id >= 2 && roll > 0.65 ? 'flier' : level.id >= 2 && roll > 0.38 ? 'shielded' : 'scout';
          const ey = variant === 'flier' ? GROUND_Y - 140 : GROUND_Y - 64;
          s.deathEaters.push({
            id: s.nextId++,
            variant,
            x: LOGICAL_W + 60,
            y: ey,
            hp: variant === 'shielded' ? 40 : 22,
            maxHp: variant === 'shielded' ? 40 : 22,
            frozenTimer: 0,
            shootTimer: 0.9 + Math.random() * 0.8,
            defeated: false,
          });
        }
      } else {
        // Boss Phase logic
        const bossTargetX = LOGICAL_W - curVp.bossStopOffset;
        s.bossY = GROUND_Y - 114;
        if (s.bossX > bossTargetX) {
          s.bossX -= 180 * dt;
        } else {
          if (s.prioriState === 'idle') {
            s.bossAttackTimer -= dt * worldMult;
            if (s.bossAttackTimer <= 0) {
              const isVoldemortClash = level.boss.id === 'voldemort' && Math.random() < 0.32;
              if (isVoldemortClash) {
                s.prioriState = 'charging';
                s.prioriTimer = 2.7;
                s.bossAttackTimer = 3.8;
                addFloatText(Math.max(40, s.bossX - 210), s.bossY - 24, '索命咒蓄力！快喊【除你武器】！', '#22C55E');
              } else {
                s.bossCastFlash = 0.35;
                s.bossAttackTimer = Math.max(1.25, 2.2 - level.id * 0.18);
                const pattern = Math.random();
                if (pattern < 0.55) {
                  const targetY = Math.random() < 0.5 ? GROUND_Y - 34 : GROUND_Y - 96;
                  s.projectiles.push({
                    id: s.nextId++,
                    fromPlayer: false,
                    x: s.bossX - 10,
                    y: targetY,
                    vx: -430 - level.id * 25,
                    vy: 0,
                    color: level.boss.primaryColor,
                    radius: 10,
                    damage: 1,
                  });
                } else {
                  s.projectiles.push({
                    id: s.nextId++,
                    fromPlayer: false,
                    x: s.bossX - 10,
                    y: GROUND_Y - 36,
                    vx: -390,
                    vy: 0,
                    color: level.boss.primaryColor,
                    radius: 9,
                    damage: 1,
                  });
                  s.projectiles.push({
                    id: s.nextId++,
                    fromPlayer: false,
                    x: s.bossX - 10,
                    y: GROUND_Y - 120,
                    vx: -420,
                    vy: 50,
                    color: level.boss.primaryColor,
                    radius: 9,
                    damage: 1,
                  });
                }
              }
            }
          } else if (s.prioriState === 'charging') {
            s.prioriTimer -= dt;
            if (s.prioriTimer <= 0) {
              s.prioriState = 'idle';
              damagePlayer();
              addFloatText(PLAYER_X + 40, s.py - 20, '未能及时对波！', '#22C55E');
            }
          } else if (s.prioriState === 'clash') {
            s.prioriMeter -= 13 * dt;
            if (s.prioriMeter >= 100) {
              s.prioriState = 'idle';
              s.prioriClashesWon += 1;
              s.bossHp -= 85;
              s.bossHurtFlash = 0.5;
              s.score += 400;
              soundEngine.playEnemyDefeat();
              spawnBurst(s.bossX + 20, s.bossY + 40, '#FDE047', 24);
              addFloatText(s.bossX - 60, s.bossY - 20, '闪回咒破防 -85!', '#FDE047');
              if (s.bossHp <= 0) {
                finishRun(true);
                return;
              }
            } else if (s.prioriMeter <= 0) {
              s.prioriState = 'idle';
              damagePlayer();
            }
          }
        }
      }

      // Update Obstacles & Check Collisions
      for (const obs of s.obstacles) {
        obs.x -= runSpeed * dt * worldMult;
        if (obs.lifting && obs.liftedOffset < 105) {
          obs.liftedOffset += 220 * dt;
        }
        const effectiveY = obs.y - obs.liftedOffset;
        if (
          !obs.cleared &&
          PLAYER_X + playerW - 8 > obs.x &&
          PLAYER_X + 8 < obs.x + obs.w &&
          s.py + playerH - 4 > effectiveY &&
          s.py + 6 < effectiveY + obs.h
        ) {
          damagePlayer();
          obs.cleared = true;
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > -80);

      // Update Death Eaters
      for (const de of s.deathEaters) {
        de.x -= runSpeed * (de.frozenTimer > 0 ? 1 : 0.72) * dt * worldMult;
        if (de.frozenTimer > 0) {
          de.frozenTimer -= dt;
        } else if (!de.defeated && de.x < LOGICAL_W - 20 && de.x > PLAYER_X + 120) {
          de.shootTimer -= dt * worldMult;
          if (de.shootTimer <= 0) {
            de.shootTimer = 2.1;
            s.projectiles.push({
              id: s.nextId++,
              fromPlayer: false,
              x: de.x - 10,
              y: de.y + 24,
              vx: -430,
              vy: de.variant === 'flier' ? 75 : 0,
              color: '#22C55E',
              radius: 7,
              damage: 1,
            });
          }
        }

        if (
          !de.defeated &&
          de.frozenTimer <= 0 &&
          PLAYER_X + playerW - 8 > de.x &&
          PLAYER_X + 8 < de.x + 48 &&
          s.py + playerH > de.y &&
          s.py < de.y + 64
        ) {
          damagePlayer();
          de.defeated = true;
        }
      }
      s.deathEaters = s.deathEaters.filter((d) => !d.defeated && d.x > -80);

      // Update Pickups (Galleons, Spell Study Scrolls, Heal)
      for (const pk of s.pickups) {
        pk.x -= runSpeed * dt * worldMult;
        if (
          !pk.collected &&
          PLAYER_X + playerW > pk.x &&
          PLAYER_X < pk.x + 38 &&
          s.py + playerH > pk.y &&
          s.py < pk.y + 38
        ) {
          pk.collected = true;
          if (pk.kind === 'galleon') {
            s.galleons += 5;
            s.score += 25;
            soundEngine.playCoin();
            spawnBurst(pk.x + 12, pk.y + 12, '#E5B84B', 6);
            addFloatText(pk.x, pk.y - 10, '+5 加隆', '#E5B84B');
          } else if (pk.kind === 'heal') {
            s.hp = Math.min(s.maxHp, s.hp + 1);
            soundEngine.playHeal();
            spawnBurst(pk.x + 12, pk.y + 12, '#10B981', 10);
            addFloatText(pk.x, pk.y - 10, '+1 生命', '#10B981');
          } else if (pk.kind === 'scroll') {
            s.scrollsCollected += 1;
            s.score += 150;
            soundEngine.playScrollPickup();
            spawnBurst(pk.x + 15, pk.y + 15, '#FDE047', 18);

            const unlearned = SPELLS.filter((sp) => !s.learnedSpells.includes(sp.id));
            if (unlearned.length > 0) {
              const preferred =
                unlearned.find((sp) => level.recommendedSpells.includes(sp.id)) ||
                unlearned[Math.floor(Math.random() * unlearned.length)];
              s.learnedSpells.push(preferred.id);
              s.newlyLearnedSpells.push(preferred.id);
              addFloatText(
                Math.max(20, pk.x - 90),
                pk.y - 16,
                `领悟新咒语：【${preferred.nameZh}】!`,
                '#FDE047'
              );
            } else {
              s.galleons += 25;
              addFloatText(Math.max(20, pk.x - 60), pk.y - 16, '学习单碎片 +1 (+25加隆)', '#38BDF8');
            }
          }
        }
      }
      s.pickups = s.pickups.filter((p) => !p.collected && p.x > -60);

      // Update Projectiles & Spell Interactions
      for (const proj of s.projectiles) {
        const pMult = proj.fromPlayer ? 1 : worldMult;
        proj.x += proj.vx * dt * pMult;
        proj.y += proj.vy * dt * pMult;

        if (proj.fromPlayer && proj.spellId) {
          const spell = SPELL_MAP[proj.spellId];

          // 1. Check obstacles
          for (const obs of s.obstacles) {
            if (obs.cleared) continue;
            if (
              proj.x + proj.radius > obs.x &&
              proj.x - proj.radius < obs.x + obs.w &&
              proj.y + proj.radius > obs.y &&
              proj.y - proj.radius < obs.y + obs.h
            ) {
              const isCounter = spell.counteredObstacleTypes.includes(obs.type);
              const isHeavyBlast =
                proj.spellId === 'bombarda' ||
                proj.spellId === 'reducto' ||
                proj.spellId === 'confringo' ||
                proj.spellId === 'piertotum';
              if (isCounter || isHeavyBlast) {
                obs.cleared = true;
                s.obstaclesCleared += 1;
                s.score += 80;
                if (obs.type === 'boggart_chest' && proj.spellId === 'riddikulus') {
                  s.galleons += 15;
                  addFloatText(obs.x, obs.y - 16, '滑稽爆奖 +15 加隆!', '#EC4899');
                } else {
                  addFloatText(obs.x, obs.y - 14, `${spell.nameZh} 破除！`, spell.color);
                }
                spawnBurst(obs.x + obs.w / 2, obs.y + obs.h / 2, spell.color, 16);
                soundEngine.playEnemyDefeat();
                proj.x = LOGICAL_W + 200;
                break;
              } else {
                addFloatText(obs.x, obs.y - 14, `需【${OBSTACLE_LABELS[obs.type].hint}】`, '#94A3B8');
                proj.x = LOGICAL_W + 200;
                break;
              }
            }
          }

          // 2. Check Death Eaters
          for (const de of s.deathEaters) {
            if (de.defeated) continue;
            if (
              proj.x + proj.radius > de.x &&
              proj.x - proj.radius < de.x + 50 &&
              proj.y + proj.radius > de.y &&
              proj.y - proj.radius < de.y + 66
            ) {
              if (proj.spellId === 'petrificus' || proj.spellId === 'glacius') {
                de.frozenTimer = proj.spellId === 'glacius' ? 5.0 : 4.5;
                s.score += 50;
                addFloatText(
                  de.x,
                  de.y - 12,
                  proj.spellId === 'glacius' ? '冰霜冻结！' : '统统石化！',
                  spell.color
                );
              } else {
                de.hp -= proj.damage;
                if (de.hp <= 0) {
                  de.defeated = true;
                  s.deathEatersDefeated += 1;
                  s.galleons += 8;
                  s.score += 110;
                  soundEngine.playEnemyDefeat();
                  spawnBurst(de.x + 22, de.y + 28, spell.color, 16);
                  addFloatText(de.x, de.y - 14, '击退食死徒 +8加隆', '#E5B84B');
                } else {
                  spawnBurst(de.x + 22, de.y + 28, spell.color, 8);
                }
              }
              proj.x = LOGICAL_W + 200;
              break;
            }
          }

          // 3. Check Boss
          if (
            s.bossPhase &&
            proj.x + proj.radius > s.bossX &&
            proj.x - proj.radius < s.bossX + 86 &&
            proj.y + proj.radius > s.bossY &&
            proj.y - proj.radius < s.bossY + 114
          ) {
            const isWeakness = level.boss.weaknessSpells.includes(proj.spellId);
            const finalDmg = isWeakness ? Math.round(proj.damage * 1.5) : proj.damage;
            s.bossHp -= finalDmg;
            s.bossHurtFlash = 0.25;
            s.score += finalDmg * 3;
            spawnBurst(s.bossX + 30, s.bossY + 45, spell.color, 14);
            soundEngine.playEnemyDefeat();
            addFloatText(
              s.bossX - 24,
              s.bossY - 14,
              isWeakness ? `弱点克制 -${finalDmg}!` : `-${finalDmg}`,
              isWeakness ? '#FDE047' : spell.color
            );
            proj.x = LOGICAL_W + 200;

            if (s.bossHp <= 0) {
              finishRun(true);
              return;
            }
          }
        } else if (!proj.fromPlayer) {
          if (
            proj.x + proj.radius > PLAYER_X + 4 &&
            proj.x - proj.radius < PLAYER_X + playerW - 4 &&
            proj.y + proj.radius > s.py + 4 &&
            proj.y - proj.radius < s.py + playerH - 4
          ) {
            if (s.shieldTimer > 0) {
              s.shieldTimer = Math.max(0.2, s.shieldTimer - 0.8);
              soundEngine.playShieldBlock();
              proj.fromPlayer = true;
              proj.spellId = 'expelliarmus';
              proj.vx = 680;
              proj.vy = 0;
              proj.color = '#38BDF8';
              proj.damage = 28;
              addFloatText(PLAYER_X + 24, s.py - 14, '盔甲弹反！', '#38BDF8');
            } else {
              proj.x = -200;
              damagePlayer();
            }
          }
        }
      }
      s.projectiles = s.projectiles.filter(
        (p) => p.x > -60 && p.x < LOGICAL_W + 80 && p.y > -40 && p.y < LOGICAL_H + 40
      );

      // Particles & Floating text
      for (const pt of s.particles) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 320 * dt;
        pt.life -= dt;
      }
      s.particles = s.particles.filter((pt) => pt.life > 0);

      for (const ft of s.floatingTexts) {
        ft.y -= 36 * dt;
        ft.life -= dt;
      }
      s.floatingTexts = s.floatingTexts.filter((ft) => ft.life > 0);
    };

    const draw = () => {
      const s = simRef.current;
      const curVp = vpRef.current;
      const LOGICAL_W = curVp.w;
      const LOGICAL_H = curVp.h;
      const GROUND_Y = curVp.groundY;
      const PLAYER_X = curVp.playerX;
      ctx.imageSmoothingEnabled = false;

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      skyGrad.addColorStop(0, level.skyTop);
      skyGrad.addColorStop(1, level.skyBottom);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // Parallax pixel art backdrop image
      if (bgImageRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        const bgW = Math.max(LOGICAL_W, 920);
        const offset = (s.scrollX * 0.15) % bgW;
        ctx.drawImage(bgImageRef.current, -offset, 0, bgW, GROUND_Y);
        ctx.drawImage(bgImageRef.current, bgW - offset, 0, bgW, GROUND_Y);
        ctx.restore();
      }

      // Parallax gothic stone pillars / trees silhouette
      ctx.fillStyle = 'rgba(11, 14, 23, 0.55)';
      const midOffset = (s.scrollX * 0.35) % 240;
      for (let px = -midOffset; px < LOGICAL_W + 240; px += 240) {
        ctx.fillRect(Math.round(px), 70, 26, GROUND_Y - 70);
        ctx.fillStyle = '#FDE047';
        ctx.fillRect(Math.round(px + 80), 95 + Math.sin(s.frame * 0.08 + px) * 6, 4, 8);
        ctx.fillStyle = 'rgba(253, 224, 71, 0.25)';
        ctx.fillRect(Math.round(px + 76), 90 + Math.sin(s.frame * 0.08 + px) * 6, 12, 12);
        ctx.fillStyle = 'rgba(11, 14, 23, 0.55)';
      }

      // Ground tiles
      ctx.fillStyle = level.groundColor;
      ctx.fillRect(0, GROUND_Y, LOGICAL_W, LOGICAL_H - GROUND_Y);
      ctx.fillStyle = level.groundAccent;
      ctx.fillRect(0, GROUND_Y, LOGICAL_W, 4);

      const tileOffset = s.scrollX % 48;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      for (let gx = -tileOffset; gx < LOGICAL_W; gx += 48) {
        ctx.fillRect(Math.round(gx), GROUND_Y + 14, 34, 8);
      }

      // Platforms
      for (const plat of s.platforms) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(Math.round(plat.x), Math.round(plat.y), plat.w, 16);
        ctx.fillStyle = '#E5B84B';
        ctx.fillRect(Math.round(plat.x), Math.round(plat.y), plat.w, 4);
      }

      // Pickups (Larger & crisp!)
      for (const pk of s.pickups) {
        if (pk.kind === 'galleon') {
          drawGalleonPickup(ctx, pk.x, pk.y, 4.5, s.frame);
        } else if (pk.kind === 'heal') {
          drawHealPickup(ctx, pk.x, pk.y, 4.5, s.frame);
        } else {
          drawScrollPickup(ctx, pk.x, pk.y, 4.2, s.frame);
          ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
          const textW = ctx.measureText('咒语学习单').width + 12;
          const labelX = Math.max(6, Math.min(LOGICAL_W - textW - 6, Math.round(pk.x + 20 - textW / 2)));
          ctx.fillStyle = 'rgba(11, 14, 23, 0.88)';
          ctx.fillRect(labelX, pk.y - 30, textW, 22);
          ctx.fillStyle = '#FDE047';
          ctx.fillText('咒语学习单', labelX + 6, pk.y - 13);
        }
      }

      // Obstacles + crisp high-contrast overhead hint
      for (const obs of s.obstacles) {
        drawObstacleSprite(ctx, obs.x, obs.y, obs.w, obs.h, obs.type, s.frame, obs.liftedOffset);
        if (!obs.cleared) {
          const info = OBSTACLE_LABELS[obs.type];
          ctx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
          const labelW = ctx.measureText(info.hint).width + 16;
          const bx = Math.max(6, Math.min(LOGICAL_W - labelW - 6, Math.round(obs.x + obs.w / 2 - labelW / 2)));
          const by = Math.max(8, Math.round(obs.y - 34));
          ctx.fillStyle = 'rgba(11, 14, 23, 0.92)';
          ctx.fillRect(bx, by, labelW, 25);
          ctx.strokeStyle = info.color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bx, by, labelW, 25);
          ctx.fillStyle = info.color;
          ctx.fillText(info.hint, bx + 8, by + 18);
        }
      }

      // Death Eaters
      for (const de of s.deathEaters) {
        drawDeathEaterSprite(ctx, de.x, de.y, 3.6, de.variant, s.frame, de.frozenTimer > 0);
        if (de.hp < de.maxHp) {
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(de.x, de.y - 12, 46, 6);
          ctx.fillStyle = '#EF4444';
          ctx.fillRect(de.x, de.y - 12, Math.round((de.hp / de.maxHp) * 46), 6);
        }
      }

      // Boss
      if (s.bossPhase) {
        drawBossSprite(
          ctx,
          s.bossX,
          s.bossY,
          4.4,
          level.boss.id,
          s.frame,
          s.bossCastFlash > 0,
          s.bossHurtFlash > 0
        );

        if (s.prioriState === 'charging') {
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(s.bossX - 18, s.bossY + 46, 18 + Math.sin(s.frame * 0.5) * 5, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.prioriState === 'clash') {
          const startX = PLAYER_X + 64;
          const endX = s.bossX - 14;
          const meetX = startX + ((endX - startX) * s.prioriMeter) / 100;
          const beamY = s.py + 30;
          ctx.fillStyle = '#EF4444';
          ctx.fillRect(startX, beamY - 6, meetX - startX, 12);
          ctx.fillStyle = '#FDE047';
          ctx.fillRect(startX, beamY - 2, meetX - startX, 4);
          ctx.fillStyle = '#16A34A';
          ctx.fillRect(meetX, beamY - 6, endX - meetX, 12);
          ctx.fillStyle = '#86EFAC';
          ctx.fillRect(meetX, beamY - 2, endX - meetX, 4);
          ctx.fillStyle = '#FEF08A';
          ctx.beginPath();
          ctx.arc(meetX, beamY, 16 + Math.sin(s.frame * 0.8) * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Player Wizard (3.5x crisp scale!)
      drawWizardSprite(ctx, PLAYER_X, s.py, 3.5, costume.palette, {
        frame: s.frame,
        isJumping: s.py < GROUND_Y - 74,
        isSliding: s.isSliding,
        isCasting: s.castAnimTimer > 0,
        castColor: s.castColor,
        hasShield: s.shieldTimer > 0,
        hurtFlash: s.invulnTimer > 0,
      });

      // Projectiles
      for (const proj of s.projectiles) {
        ctx.fillStyle = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      // Particles
      for (const pt of s.particles) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      }
      ctx.globalAlpha = 1;

      // Floating texts (Larger 20px crisp text!)
      ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
      for (const ft of s.floatingTexts) {
        ctx.globalAlpha = Math.min(1, ft.life * 1.4);
        const tw = ctx.measureText(ft.text).width;
        const drawX = Math.max(8, Math.min(LOGICAL_W - tw - 8, Math.round(ft.x)));
        const drawY = Math.max(24, Math.round(ft.y));
        ctx.fillStyle = '#0B0E17';
        ctx.fillText(ft.text, drawX + 1.5, drawY + 1.5);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, drawX, drawY);
      }
      ctx.globalAlpha = 1;

      // Slow-motion tint border
      if (s.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, LOGICAL_W - 6, LOGICAL_H - 6);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      update(dt);
      draw();

      hudSyncAccum += dt;
      if (hudSyncAccum >= 0.08) {
        hudSyncAccum = 0;
        const s = simRef.current;
        const cds: Record<string, number> = {};
        for (const sid of s.learnedSpells) {
          const rem = Math.max(0, (s.spellCooldownUntil[sid] || 0) - now);
          if (rem > 0) cds[sid] = rem;
        }
        setHud({
          hp: s.hp,
          maxHp: s.maxHp,
          mana: Math.round(s.mana),
          distance: Math.round(s.distance),
          score: Math.round(s.score),
          galleons: s.galleons,
          scrolls: s.scrollsCollected,
          bossPhase: s.bossPhase,
          bossHp: Math.max(0, s.bossHp),
          bossMaxHp: level.boss.maxHp,
          prioriActive: s.prioriState !== 'idle',
          prioriProgress: s.prioriMeter,
          shieldActive: s.shieldTimer > 0,
          slowActive: s.slowTimer > 0,
          cooldowns: cds,
          learnedSpells: [...s.learnedSpells],
          newlyLearned: [...s.newlyLearnedSpells],
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [costume.modifiers, isPaused, level, onCompleteRun]);

  const distPct = Math.min(100, Math.round((hud.distance / level.distanceGoal) * 100));
  const bossHpPct = Math.max(0, Math.round((hud.bossHp / hud.bossMaxHp) * 100));

  return (
    <div
      className={
        isExpanded
          ? 'fixed inset-0 z-50 overflow-y-auto bg-[#0B0E17] p-3 sm:p-5 space-y-3'
          : 'mx-auto max-w-6xl space-y-3'
      }
    >
      {/* Compact Top Game Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#141928] px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-white/15 bg-[#1B2236] px-3 py-2 text-xs sm:text-sm font-medium text-[#CBD5E1] hover:border-white/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>返回</span>
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm sm:text-base font-bold text-[#F1EDE4]">
              {level.nameZh}
            </div>
            <div className="hidden sm:block truncate text-xs text-[#94A3B8]">
              Boss：{level.boss.nameZh} · 弱点：{level.boss.weaknessSpells.map((id) => SPELL_MAP[id].nameZh).join(' / ')}
            </div>
          </div>
        </div>

        {/* Voice Control + Language + Expand + Sound + Pause */}
        <div className="flex flex-wrap items-center gap-2">
          {isSpeechRecognitionSupported() && (
            <button
              onClick={toggleMic}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                micActive
                  ? 'bg-[#10B981] text-[#052E16]'
                  : 'border border-[#E5B84B]/50 bg-[#1D2438] text-[#FDE68A] hover:bg-[#26304A]'
              }`}
            >
              {micActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              <span>{micActive ? '语音中' : '开启语音'}</span>
              {micActive && (
                <span className="ml-0.5 inline-flex h-2.5 w-6 items-center overflow-hidden rounded-sm bg-[#052E16]/30">
                  <span
                    className="h-full bg-[#052E16] transition-all duration-75"
                    style={{ width: `${Math.round(micVolume * 100)}%` }}
                  />
                </span>
              )}
            </button>
          )}

          <button
            onClick={() =>
              onChangeVoiceLang(progress.voiceLanguage === 'zh-CN' ? 'en-US' : 'zh-CN')
            }
            className="whitespace-nowrap rounded-lg border border-white/10 bg-[#1B2236] px-2.5 py-2 text-xs sm:text-sm font-medium text-[#CBD5E1] hover:border-white/25"
          >
            {progress.voiceLanguage === 'zh-CN' ? '中文' : 'EN'}
          </button>

          <button
            onClick={() => setIsExpanded((e) => !e)}
            aria-label={isExpanded ? '退出全屏' : '放大画布'}
            className="rounded-lg border border-white/10 bg-[#1B2236] p-2 text-[#CBD5E1] hover:border-white/25"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            onClick={onToggleSound}
            aria-label="切换音效"
            className="rounded-lg border border-white/10 bg-[#1B2236] p-2 text-[#CBD5E1] hover:border-white/25"
          >
            {progress.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setIsPaused((p) => !p)}
            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-white/10 bg-[#1B2236] px-3 py-2 text-xs sm:text-sm font-medium text-[#F1EDE4] hover:border-white/25"
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            <span>{isPaused ? '继续' : '暂停'}</span>
          </button>
        </div>
      </div>

      {/* Compact High-Contrast HUD Strip Above Canvas */}
      <div className="space-y-2 rounded-xl border border-white/10 bg-[#141928] px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-[#EF4444]" />
              <span className="font-mono-num text-sm font-bold text-[#F1EDE4]">
                {hud.hp}/{hud.maxHp}
              </span>
              <div className="hidden xs:flex gap-1">
                {Array.from({ length: hud.maxHp }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-3.5 rounded-xs ${
                      i < hud.hp ? 'bg-[#EF4444]' : 'bg-[#252D44]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-[#38BDF8]" />
              <span className="font-mono-num text-sm font-semibold text-[#38BDF8]">
                {hud.mana}%
              </span>
              <div className="h-2 w-16 sm:w-24 overflow-hidden rounded-full bg-[#0B0E17]">
                <div
                  className="h-full bg-[#38BDF8] transition-all duration-100"
                  style={{ width: `${hud.mana}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono-num text-xs sm:text-sm">
            {hud.shieldActive && (
              <span className="flex items-center gap-1 text-[#38BDF8]">
                <Shield className="h-4 w-4" /> 护盾
              </span>
            )}
            <span className="text-[#E5B84B] font-semibold">+{hud.galleons}G</span>
            <span className="flex items-center gap-1 text-[#FDE047] font-semibold">
              <ScrollText className="h-4 w-4" />
              {hud.scrolls}
            </span>
            <span className="text-[#F1EDE4] font-semibold">{hud.score} 分</span>
          </div>
        </div>

        {/* Distance OR Boss HP Progress Bar */}
        {!hud.bossPhase ? (
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs font-medium text-[#94A3B8]">关卡进度</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#0B0E17]">
              <div
                className="h-full bg-[#E5B84B] transition-all duration-150"
                style={{ width: `${distPct}%` }}
              />
            </div>
            <span className="shrink-0 font-mono-num text-xs sm:text-sm font-semibold text-[#CBD5E1]">
              {hud.distance}m / {level.distanceGoal}m
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs sm:text-sm font-bold text-[#F43F5E]">
              BOSS · {level.boss.nameZh}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#0B0E17]">
              <div
                className="h-full bg-[#F43F5E] transition-all duration-150"
                style={{ width: `${bossHpPct}%` }}
              />
            </div>
            <span className="shrink-0 font-mono-num text-xs sm:text-sm font-bold text-[#F43F5E]">
              {hud.bossHp}/{hud.bossMaxHp}
            </span>
          </div>
        )}
      </div>

      {/* Main Pixel Canvas Container */}
      <div className="relative overflow-hidden rounded-xl border border-white/15 bg-[#0B0E17] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={vp.w}
          height={vp.h}
          onClick={triggerJump}
          className="pixelated block h-auto w-full cursor-pointer"
        />

        {/* Spell Cast Flash Banner */}
        {lastCastBanner && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-[#0B0E17]/90 px-3.5 py-1.5 text-center backdrop-blur-xs">
            <span className="text-xs sm:text-sm text-[#94A3B8]">
              {lastCastBanner.viaVoice ? '语音 · ' : ''}
            </span>
            <span className="text-sm sm:text-base font-bold" style={{ color: lastCastBanner.color }}>
              {lastCastBanner.name}
            </span>
            <span className="ml-2 font-display text-xs text-[#CBD5E1]">
              {lastCastBanner.incantation}
            </span>
          </div>
        )}

        {/* Live Voice Transcript Feed */}
        {(micActive || lastTranscript || micError) && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 sm:right-auto rounded-md border border-white/10 bg-[#0B0E17]/88 px-3 py-1.5 text-xs sm:text-sm">
            {micError ? (
              <span className="text-red-300">{micError}</span>
            ) : (
              <span className="text-[#CBD5E1]">
                识别：{lastTranscript || '请念出咒语（如：除你武器、盔甲护身）'}
              </span>
            )}
          </div>
        )}

        {/* Voldemort Priori Clash Reminder */}
        {hud.prioriActive && (
          <div className="pointer-events-none absolute left-1/2 top-14 w-11/12 max-w-md -translate-x-1/2 rounded-lg border border-emerald-400/50 bg-[#052E16]/90 px-4 py-2 text-center">
            <div className="text-xs sm:text-sm font-bold text-emerald-200">
              索命咒来袭！连续喊【除你武器】或点击 [1] 除你武器赢下对波！
            </div>
          </div>
        )}

        {/* Pause Overlay */}
        {isPaused && gameOverState === 'none' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0E17]/85 p-4 backdrop-blur-xs">
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#F1EDE4]">游戏暂停</h3>
            <p className="mt-2 text-center text-xs sm:text-sm text-[#94A3B8]">
              空格 / 点击画面跳跃（二段跳） · S / ↓ 滑铲 · 语音念咒或按键 1–6 施法
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => setIsPaused(false)}
                className="rounded-lg bg-[#E5B84B] px-5 py-2.5 text-sm font-semibold text-[#0B0E17] hover:bg-[#F3C963]"
              >
                继续冒险
              </button>
              <button
                onClick={resetRun}
                className="rounded-lg border border-white/15 bg-[#1C2338] px-5 py-2.5 text-sm font-medium text-[#F1EDE4] hover:border-white/30"
              >
                重新开始
              </button>
              <button
                onClick={onExit}
                className="rounded-lg border border-white/15 bg-[#141928] px-5 py-2.5 text-sm font-medium text-[#CBD5E1] hover:text-white"
              >
                返回主页
              </button>
            </div>
          </div>
        )}

        {/* Victory / Defeat Summary Modal */}
        {gameOverState !== 'none' && runSummary && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B0E17]/90 p-3 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-xl border border-[#E5B84B]/35 bg-[#141928] p-4 sm:p-6 space-y-4">
              <div className="text-center">
                <div className="text-xs font-medium text-[#94A3B8]">{level.nameZh}</div>
                <h3
                  className={`mt-1 font-display text-2xl sm:text-3xl font-bold ${
                    runSummary.victory ? 'text-[#E5B84B]' : 'text-[#EF4444]'
                  }`}
                >
                  {runSummary.victory ? '胜利通关！' : '魔法力竭 · 闯关失败'}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center font-mono-num">
                <div className="rounded-lg border border-white/10 bg-[#0F1320] p-2.5">
                  <div className="text-xs text-[#94A3B8]">本局得分</div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-[#F1EDE4]">
                    {runSummary.score}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#0F1320] p-2.5">
                  <div className="text-xs text-[#94A3B8]">获得金加隆</div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-[#E5B84B]">
                    +{runSummary.galleonsEarned}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#0F1320] p-2.5">
                  <div className="text-xs text-[#94A3B8]">击退食死徒</div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-[#38BDF8]">
                    {runSummary.deathEatersDefeated}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border border-white/10 bg-[#0F1320] p-3 text-xs sm:text-sm text-[#CBD5E1]">
                <div className="flex justify-between">
                  <span>语音施法 / 总施法</span>
                  <span className="font-mono-num">
                    {runSummary.voiceCasts} / {runSummary.totalCasts}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>拾取咒语学习单</span>
                  <span className="font-mono-num text-[#FDE047]">
                    {runSummary.scrollsCollected} 张
                  </span>
                </div>
                {runSummary.newlyLearnedSpells.length > 0 && (
                  <div className="pt-1 text-emerald-300">
                    领悟新咒语：
                    {runSummary.newlyLearnedSpells.map((id) => SPELL_MAP[id].nameZh).join('、')}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={resetRun}
                  className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E5B84B] px-4 py-2.5 text-sm font-semibold text-[#0B0E17] hover:bg-[#F3C963]"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>再玩一次</span>
                </button>
                <button
                  onClick={onExit}
                  className="flex-1 whitespace-nowrap rounded-lg border border-white/15 bg-[#1C2338] px-4 py-2.5 text-sm font-semibold text-[#F1EDE4] hover:border-white/30"
                >
                  返回主页
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls: Large Touch Targets + Clear Readable Hotbar */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Parkour Action Buttons */}
        <div className="flex items-center gap-2.5 lg:col-span-3">
          <button
            onClick={triggerJump}
            className="min-h-[52px] flex-1 whitespace-nowrap rounded-xl border border-white/15 bg-[#141928] py-3.5 text-base font-bold text-[#F1EDE4] active:scale-95 hover:border-[#E5B84B]"
          >
            跳跃 (Space)
          </button>
          <button
            onMouseDown={() => setSlide(true)}
            onMouseUp={() => setSlide(false)}
            onMouseLeave={() => setSlide(false)}
            onTouchStart={() => setSlide(true)}
            onTouchEnd={() => setSlide(false)}
            className="min-h-[52px] flex-1 whitespace-nowrap rounded-xl border border-white/15 bg-[#141928] py-3.5 text-base font-bold text-[#CBD5E1] active:scale-95 hover:border-[#E5B84B]"
          >
            滑铲 (S / ↓)
          </button>
        </div>

        {/* 6-Slot Quick Hotbar */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:col-span-9">
          {progress.equippedHotbar.map((spellId, idx) => {
            const spell = SPELL_MAP[spellId];
            const learned = hud.learnedSpells.includes(spellId);
            const cdMs = hud.cooldowns[spellId] || 0;
            return (
              <button
                key={spellId}
                disabled={!learned || cdMs > 0}
                onClick={() => castSpell(spellId, false)}
                className={`relative flex min-h-[70px] flex-col items-start justify-between overflow-hidden rounded-xl border p-2.5 text-left transition-all ${
                  learned
                    ? 'border-white/15 bg-[#141928] hover:border-[#E5B84B] active:scale-95'
                    : 'cursor-not-allowed border-white/5 bg-[#101420] opacity-50'
                }`}
              >
                <div className="flex w-full items-center justify-between text-xs">
                  <span className="font-mono-num text-[#94A3B8]">[{idx + 1}]</span>
                  <span className="font-mono-num font-semibold text-[#38BDF8]">{spell.manaCost}</span>
                </div>
                <div className="mt-1 truncate w-full text-sm font-bold" style={{ color: spell.color }}>
                  {spell.nameZh}
                </div>
                <div className="truncate w-full font-display text-xs text-[#94A3B8]">
                  {spell.incantation}
                </div>
                {cdMs > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0B0E17]/75 font-mono-num text-sm font-bold text-[#F1EDE4]">
                    {(cdMs / 1000).toFixed(1)}s
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* All Learned Spells Quick Voice Prompt Strip */}
      <div className="rounded-xl border border-white/10 bg-[#141928] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-sm">
          <span className="font-semibold text-[#E5B84B]">
            已掌握咒语（语音或点击释放）：
          </span>
          {hud.learnedSpells.map((sid) => {
            const sp = SPELL_MAP[sid];
            return (
              <button
                key={sid}
                onClick={() => castSpell(sid, false)}
                className="whitespace-nowrap text-[#F1EDE4] underline-offset-4 hover:underline"
              >
                <span style={{ color: sp.color }}>●</span> {sp.nameZh}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
