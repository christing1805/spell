import { SpellCategory } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'square',
    gainVal = 0.08,
    delay = 0
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playJump() {
    this.playTone(220, 520, 0.14, 'square', 0.06);
  }

  playSlide() {
    this.playTone(240, 110, 0.12, 'triangle', 0.07);
  }

  playSpellCast(category: SpellCategory) {
    if (category === 'attack') {
      this.playTone(580, 980, 0.1, 'sawtooth', 0.06);
      this.playTone(880, 320, 0.18, 'square', 0.05, 0.06);
    } else if (category === 'defense') {
      this.playTone(440, 660, 0.18, 'sine', 0.08);
      this.playTone(660, 880, 0.22, 'triangle', 0.06, 0.08);
    } else if (category === 'healing') {
      this.playTone(523, 659, 0.14, 'sine', 0.08);
      this.playTone(659, 784, 0.16, 'sine', 0.08, 0.1);
      this.playTone(784, 1046, 0.22, 'sine', 0.08, 0.2);
    } else {
      this.playTone(480, 760, 0.12, 'triangle', 0.07);
      this.playTone(720, 960, 0.15, 'sine', 0.06, 0.08);
    }
  }

  playCoin() {
    this.playTone(988, 1318, 0.08, 'square', 0.05);
    this.playTone(1318, 1568, 0.12, 'square', 0.05, 0.07);
  }

  playScrollPickup() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.02, 0.14, 'triangle', 0.08, idx * 0.07);
    });
  }

  playEnemyDefeat() {
    this.playTone(360, 140, 0.18, 'sawtooth', 0.07);
    this.playTone(520, 740, 0.12, 'square', 0.05, 0.05);
  }

  playHit() {
    this.playTone(180, 65, 0.22, 'sawtooth', 0.1);
  }

  playShieldBlock() {
    this.playTone(600, 920, 0.12, 'triangle', 0.08);
  }

  playHeal() {
    this.playTone(523, 659, 0.12, 'sine', 0.08);
    this.playTone(659, 880, 0.16, 'sine', 0.08, 0.09);
  }

  playBossWarning() {
    this.playTone(190, 160, 0.24, 'sawtooth', 0.09);
    this.playTone(190, 160, 0.24, 'sawtooth', 0.09, 0.28);
    this.playTone(220, 140, 0.32, 'sawtooth', 0.1, 0.56);
  }

  playVictory() {
    const fanfare = [523, 659, 784, 1046, 988, 1046];
    const delays = [0, 0.11, 0.22, 0.34, 0.52, 0.66];
    fanfare.forEach((f, i) => {
      this.playTone(f, f * 1.01, i === fanfare.length - 1 ? 0.38 : 0.14, 'triangle', 0.08, delays[i]);
    });
  }
}

export const soundEngine = new SoundEngine();

export function speakSpellPronunciation(
  text: string,
  lang: 'zh-CN' | 'en-US',
  onEnd?: () => void
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    soundEngine.playSpellCast('utility');
    onEnd?.();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = lang === 'en-US' ? 0.88 : 0.94;
    utterance.pitch = 1.02;

    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find((v) =>
      v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase())
    );
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    soundEngine.playSpellCast('utility');
    onEnd?.();
    return false;
  }
}

