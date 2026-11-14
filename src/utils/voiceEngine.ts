import { SPELLS } from '../data/spells';
import { SpellId } from '../types/game';

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Matches spoken transcript (Chinese or English) against learned spells.
 * Evaluates longest/most specific alias first for accurate detection.
 */
export function matchSpellFromTranscript(
  rawTranscript: string,
  allowedSpells: SpellId[]
): SpellId | null {
  const clean = rawTranscript
    .toLowerCase()
    .replace(/[\s，。！？,.!?'"“”‘’\-·]/g, '');

  if (!clean) return null;

  let bestMatch: { id: SpellId; score: number } | null = null;

  for (const spell of SPELLS) {
    if (!allowedSpells.includes(spell.id)) continue;

    for (const alias of spell.voiceAliases) {
      const normAlias = alias.toLowerCase().replace(/\s+/g, '');
      if (clean.includes(normAlias)) {
        const score = normAlias.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: spell.id, score };
        }
      }
    }
  }

  return bestMatch ? bestMatch.id : null;
}

export class VoiceSpellController {
  private recognition: SpeechRecognitionLike | null = null;
  private isListening = false;
  private shouldKeepAlive = false;
  private lang: 'zh-CN' | 'en-US' = 'zh-CN';
  private allowedSpells: SpellId[] = [];
  private lastMatchedAt: Record<string, number> = {};
  private audioStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private volumeRaf = 0;

  private onSpellCallback: ((spellId: SpellId, transcript: string) => void) | null = null;
  private onTranscriptCallback: ((transcript: string, isFinal: boolean) => void) | null = null;
  private onStatusCallback: ((active: boolean, errorMsg?: string) => void) | null = null;
  private onVolumeCallback: ((level: number) => void) | null = null;

  public setCallbacks(opts: {
    onSpell?: (spellId: SpellId, transcript: string) => void;
    onTranscript?: (transcript: string, isFinal: boolean) => void;
    onStatus?: (active: boolean, errorMsg?: string) => void;
    onVolume?: (level: number) => void;
  }) {
    this.onSpellCallback = opts.onSpell ?? null;
    this.onTranscriptCallback = opts.onTranscript ?? null;
    this.onStatusCallback = opts.onStatus ?? null;
    this.onVolumeCallback = opts.onVolume ?? null;
  }

  public setAllowedSpells(spells: SpellId[]) {
    this.allowedSpells = spells;
  }

  public setLanguage(lang: 'zh-CN' | 'en-US') {
    const changed = this.lang !== lang;
    this.lang = lang;
    if (changed && this.isListening) {
      this.stop();
      setTimeout(() => this.start(), 120);
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  private async startVolumeMeter() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      const source = this.audioCtx.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser || !this.shouldKeepAlive) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 55);
        this.onVolumeCallback?.(normalized);
        this.volumeRaf = requestAnimationFrame(tick);
      };
      this.volumeRaf = requestAnimationFrame(tick);
    } catch {
      // Volume meter is optional; speech recognition may still work or trigger its own permission error
    }
  }

  private stopVolumeMeter() {
    if (this.volumeRaf) {
      cancelAnimationFrame(this.volumeRaf);
      this.volumeRaf = 0;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((t) => t.stop());
      this.audioStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.analyser = null;
    this.onVolumeCallback?.(0);
  }

  public start() {
    if (!isSpeechRecognitionSupported()) {
      this.onStatusCallback?.(false, '当前浏览器不支持 Web Speech 语音识别，请使用快捷键或点击施法');
      return;
    }

    if (this.shouldKeepAlive && this.isListening) return;
    this.shouldKeepAlive = true;

    const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.maxAlternatives = 2;

    rec.onstart = () => {
      this.isListening = true;
      this.onStatusCallback?.(true);
    };

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript?.trim() || '';
        if (!transcript) continue;

        this.onTranscriptCallback?.(transcript, res.isFinal);

        // Check tail of transcript so continuous speech can fire successive spells cleanly
        const snippet = transcript.slice(-18);
        const matchedSpell =
          matchSpellFromTranscript(snippet, this.allowedSpells) ||
          matchSpellFromTranscript(transcript, this.allowedSpells);

        if (matchedSpell) {
          const now = Date.now();
          const lastAt = this.lastMatchedAt[matchedSpell] || 0;
          // 650ms debounce prevents interim + final double-triggering the same utterance
          if (now - lastAt > 650) {
            this.lastMatchedAt[matchedSpell] = now;
            this.onSpellCallback?.(matchedSpell, transcript);
          }
        }
      }
    };

    rec.onerror = (event: { error: string }) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.shouldKeepAlive = false;
        this.isListening = false;
        this.stopVolumeMeter();
        this.onStatusCallback?.(false, '麦克风权限未开启，请允许麦克风或使用快捷键施法');
      } else if (event.error === 'no-speech' || event.error === 'aborted') {
        // Benign errors; onend will handle restart if shouldKeepAlive is true
      } else {
        this.onStatusCallback?.(this.isListening, `语音识别提示: ${event.error}`);
      }
    };

    rec.onend = () => {
      this.isListening = false;
      if (this.shouldKeepAlive) {
        setTimeout(() => {
          if (this.shouldKeepAlive && this.recognition === rec) {
            try {
              rec.start();
            } catch {
              // Ignore already started
            }
          }
        }, 160);
      } else {
        this.onStatusCallback?.(false);
      }
    };

    this.recognition = rec;
    try {
      rec.start();
      this.startVolumeMeter();
    } catch {
      this.onStatusCallback?.(false, '无法启动语音识别');
    }
  }

  public stop() {
    this.shouldKeepAlive = false;
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
    this.stopVolumeMeter();
    this.onStatusCallback?.(false);
  }
}
