import type { GameConfig } from "./config";
import { MELODIES, melodyCompletionCount, melodyNote, melodyStepMs, midiToFrequency } from "./melodies";

export type GameSound = "rotate" | "connect" | "disconnect" | "complete";
export type SoundOptions = { unlock?: boolean; melodyIndex?: number; count?: number; rhythmTempoBpm?: number; sequenceTempoBpm?: number };
type EffectsConfig = Pick<GameConfig["sound"], "connectionMelody" | "noteDurationMs" | "melodyVolume" | "completionSound" | "completionNoteIntervalMs">;

type Voice = {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  ended: number;
  kind: GameSound;
  start: number;
};

const COOLDOWN: Record<GameSound, number> = {
  rotate: 0.16,
  connect: 0.04,
  disconnect: 0.04,
  complete: 1.2,
};
const NOTE_GAP = .075;
const MAX_NOTE_LEAD = .6;
const MAX_VOICES = 12;
const MAX_BURST = 6;
const melodyIndex = (options: SoundOptions) => Number.isSafeInteger(options.melodyIndex) && options.melodyIndex! >= 0 ? options.melodyIndex! : 0;
const scoreTempo = (value?: number) => Number.isFinite(value) ? Math.max(40, Math.min(180, value!)) : undefined;

/** Small game sounds. Only gesture-unlocked, current events are played. */
export class GameAudio {
  private context?: AudioContext;
  private rotationSample?: AudioBuffer;
  private rotationBytes?: ArrayBuffer;
  private rotationLoad?: AbortController;
  private enabled = false;
  private disposed = false;
  private resuming = false;
  private resumePromise?: Promise<void>;
  private pendingSound?: { kind: GameSound; options: SoundOptions };
  private warmed = false;
  private voices = new Set<Voice>();
  private lastPlayed: Partial<Record<GameSound, number>> = {};
  private nextMelodyAt = 0;
  private lastConnectionAt = -Infinity;
  private connectionSequence: { voice: Voice; end: number } | null = null;
  private config: EffectsConfig = {
    connectionMelody: "odeToJoy", noteDurationMs: 320, melodyVolume: .7,
    completionSound: true, completionNoteIntervalMs: 240,
  };

  constructor(rotationSampleUrl?: string) {
    if (!rotationSampleUrl) return;
    const controller = new AbortController();
    this.rotationLoad = controller;
    try {
      void fetch(rotationSampleUrl, { signal: controller.signal })
        .then(response => {
          if (!response.ok) throw new Error("Rotation sound unavailable");
          return response.arrayBuffer();
        })
        .then(bytes => {
          if (this.disposed) return;
          this.rotationBytes = bytes;
          this.decodeRotationSample();
        })
        .catch(() => {})
        .finally(() => { this.rotationLoad = undefined; });
    } catch {
      this.rotationLoad = undefined;
    }
  }

  private decodeRotationSample(): void {
    const context = this.context, bytes = this.rotationBytes;
    if (!context || !bytes || this.disposed) return;
    this.rotationBytes = undefined;
    try {
      void context.decodeAudioData(bytes).then(buffer => {
        if (!this.disposed && this.context === context) this.rotationSample = buffer;
      }).catch(() => {});
    } catch { /* The other sounds still work if this recording cannot decode. */ }
  }

  setConfig(config: EffectsConfig): void {
    const next: EffectsConfig = {
      connectionMelody: ["odeToJoy", "furElise", "classic"].includes(config.connectionMelody) ? config.connectionMelody : "odeToJoy",
      noteDurationMs: Number.isFinite(config.noteDurationMs) ? Math.max(100, Math.min(1000, config.noteDurationMs)) : 320,
      melodyVolume: Number.isFinite(config.melodyVolume) ? Math.max(0, Math.min(1, config.melodyVolume)) : .7,
      completionSound: config.completionSound !== false,
      completionNoteIntervalMs: Number.isFinite(config.completionNoteIntervalMs) ? Math.max(80, Math.min(1000, Math.floor(config.completionNoteIntervalMs))) : 240,
    };
    if (Object.entries(next).some(([key, value]) => this.config[key as keyof typeof next] !== value)) {
      this.cancelVoices(voice => voice.kind === "connect" || voice.kind === "complete");
      this.nextMelodyAt = 0;
      this.lastConnectionAt = -Infinity;
      this.connectionSequence = null;
      delete this.lastPlayed.connect;
      delete this.lastPlayed.complete;
    }
    this.config = next;
  }

  /** Includes the last connection's queued attack and a quiet tail for the home hold. */
  get completionDurationMs(): number {
    return this.getCompletionDurationMs();
  }

  getCompletionDurationMs(options: SoundOptions = {}): number {
    if (!this.enabled || !this.context || this.context.state !== "running" || this.disposed) return 0;
    const index = melodyIndex(options), tempo = scoreTempo(options.rhythmTempoBpm);
    const count = this.completionCount(index);
    if (!count) return 0;
    const now = this.context.currentTime;
    const handoff = (this.completionStart(now, index, tempo) - now) * 1000;
    if (this.config.connectionMelody === "classic") return handoff + 1100;
    let phraseMs = 0;
    for (let offset = 0; offset < count - 1; offset++) phraseMs += this.noteStepMs(index + offset, tempo);
    return handoff + phraseMs + this.noteDurationMs(index + count - 1, tempo) + 120;
  }

  private completionCount(index: number): number {
    if (!this.config.completionSound) return 0;
    if (this.config.connectionMelody === "classic") return 4;
    return this.config.melodyVolume > 0 ? melodyCompletionCount(this.config.connectionMelody, index) : 0;
  }

  private completionStart(now: number, index: number, tempo?: number): number {
    if (this.config.connectionMelody === "classic") return Math.max(now, Math.min(now + .75, this.lastConnectionAt + .12));
    const previous = index > 0 ? index - 1 : MELODIES[this.config.connectionMelody].notes.length - 1;
    const connectionEnd = this.connectionSequence?.end
      ?? this.lastConnectionAt + this.noteStepMs(previous, tempo) / 1000;
    return Math.max(now, this.nextMelodyAt, connectionEnd);
  }

  private noteStepMs(index: number, tempo?: number): number {
    return tempo !== undefined && this.config.connectionMelody !== "classic"
      ? melodyStepMs(this.config.connectionMelody, index, tempo) : this.config.completionNoteIntervalMs;
  }

  private noteDurationMs(index: number, tempo?: number): number {
    return tempo !== undefined ? Math.min(this.config.noteDurationMs, this.noteStepMs(index, tempo) * .9) : this.config.noteDurationMs;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && !this.disposed;
    if (!this.enabled) {
      this.pendingSound = undefined;
      this.stopAll();
      this.lastPlayed = {};
    }
  }

  /** Call synchronously from a pointer or keyboard gesture. */
  unlock(): void {
    if (!this.enabled || this.disposed || typeof window === "undefined") return;
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext
          ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        this.context = new AudioContextClass();
        const context = this.context;
        context.addEventListener("statechange", () => {
          if (context.state !== "running") this.stop();
        });
      }
      if (this.context.state !== "running" && this.context.state !== "closed" && !this.resuming) {
        this.resuming = true;
        // iOS can require an actual source to be started in the trusted gesture
        // which resumes Web Audio. It remains silent and is never a game sound.
        this.warmContext(this.context);
        const resume = Promise.resolve(this.context.resume()).catch(() => {}).then(() => {
          if (this.context?.state === "running") this.flushPendingSound();
          else this.pendingSound = undefined;
        }).finally(() => {
          if (this.resumePromise === resume) this.resumePromise = undefined;
          this.resuming = false;
        });
        this.resumePromise = resume;
      }
      this.decodeRotationSample();
    } catch {
      // Audio is optional: unavailable devices must not interrupt a puzzle.
    }
  }

  play(kind: GameSound, options: SoundOptions = {}): void {
    if (!this.enabled || this.disposed) return;
    try {
      this.playCurrent(kind, options);
    } catch {
      // A device/context failure must never interrupt a successful game move.
      this.stop();
    }
  }

  private playCurrent(kind: GameSound, options: SoundOptions): void {
    const index = melodyIndex(options), tempo = scoreTempo(options.rhythmTempoBpm);
    const completionCount = kind === "complete" ? this.completionCount(index) : 0;
    // An already resolved phrase needs no new sound, context, or cooldown.
    if (kind === "complete" && !completionCount) return;
    if (options.unlock !== false) this.unlock();
    const context = this.context;
    if (!context || context.state !== "running") {
      // The first mobile connection can arrive before resume() settles. Retain
      // one immediate, gesture-triggered sound rather than dropping it.
      if (options.unlock !== false && context && this.resumePromise)
        this.pendingSound = { kind, options: { ...options, unlock: false } };
      else this.stop();
      return;
    }
    const now = context.currentTime;
    const rotationSample = this.rotationSample;
    const count = Number.isFinite(options.count) ? Math.max(0, Math.min(MAX_BURST, Math.floor(options.count!))) : 1;
    // Loading a recording never queues a rotation to replay after the gesture.
    if (kind === "rotate" && !rotationSample) return;
    if (kind === "connect" && (!count || this.config.melodyVolume <= 0)) return;
    if (kind === "complete" && [...this.voices].some(voice => voice.kind === "complete")) return;
    if ((kind === "connect" || kind === "disconnect") && this.connectionSequence) {
      const previous = this.connectionSequence;
      this.cancelVoices(voice => voice === previous.voice);
      this.connectionSequence = null;
      this.nextMelodyAt = 0;
      this.lastConnectionAt = -Infinity;
      delete this.lastPlayed[kind];
    }
    if (kind === "connect" && this.config.connectionMelody !== "classic") {
      const sequenceTempo = scoreTempo(options.sequenceTempoBpm);
      if (sequenceTempo !== undefined) {
        // A fill is one cancellable phrase, not a backlog of input events.
        this.cancelVoices(voice => voice.kind === "connect" && voice.start > now);
        this.nextMelodyAt = 0;
        const voice = this.createVoice(kind, now);
        let elapsedMs = 0;
        for (let offset = 0; offset < count; offset++) {
          const start = now + elapsedMs / 1000;
          const frequency = midiToFrequency(melodyNote(this.config.connectionMelody, index + offset));
          this.melodyTone(voice, start, frequency, this.noteDurationMs(index + offset, sequenceTempo));
          this.lastConnectionAt = start;
          elapsedMs += this.noteStepMs(index + offset, sequenceTempo);
        }
        this.connectionSequence = { voice, end: now + elapsedMs / 1000 };
        return;
      }
      for (let offset = 0; offset < count; offset++) {
        // The home demo already places each scored onset on its beat.
        const start = tempo !== undefined && offset === 0 ? now : Math.max(now, this.nextMelodyAt);
        // Short strokes/fills retain every note. Extreme input is capped to a
        // brief audible phrase rather than leaving seconds of delayed music.
        if (start > now + MAX_NOTE_LEAD + 1e-6) break;
        const voice = this.createVoice(kind, start);
        const frequency = midiToFrequency(melodyNote(this.config.connectionMelody, index + offset));
        this.melodyTone(voice, start, frequency, this.noteDurationMs(index + offset, tempo));
        this.nextMelodyAt = start + NOTE_GAP;
        this.lastConnectionAt = start;
      }
      return;
    }
    if (now - (this.lastPlayed[kind] ?? -Infinity) < COOLDOWN[kind]) return;
    if (kind !== "complete" && this.voices.size >= MAX_VOICES) return;
    this.lastPlayed[kind] = now;
    // Continue after the last connection attack, including a queued drag/fill.
    const start = kind === "complete" ? this.completionStart(now, index, tempo) : now;
    const voice = this.createVoice(kind, start);

    switch (kind) {
      case "rotate":
        if (rotationSample) {
          const source = context.createBufferSource();
          source.buffer = rotationSample;
          voice.gain.gain.value *= .22;
          source.connect(voice.gain);
          this.track(voice, source, now, now + rotationSample.duration);
        }
        break;
      case "connect":
        this.tone(voice, now, 523.25, 523.25, 0.26, 0.12 * this.config.melodyVolume);
        this.tone(voice, now, 1569.75, 1569.75, 0.11, 0.022 * this.config.melodyVolume);
        this.lastConnectionAt = now;
        break;
      case "disconnect":
        this.tone(voice, now, 466.16, 311.13, 0.23, 0.1);
        this.tone(voice, now, 932.32, 622.26, 0.13, 0.015);
        break;
      case "complete":
        if (this.config.connectionMelody !== "classic") {
          let elapsedMs = 0;
          for (let offset = 0; offset < completionCount; offset++) {
            const frequency = midiToFrequency(melodyNote(this.config.connectionMelody, index + offset));
            this.melodyTone(voice, start + elapsedMs / 1000, frequency, this.noteDurationMs(index + offset, tempo));
            elapsedMs += this.noteStepMs(index + offset, tempo);
          }
          break;
        }
        // Classic retains its familiar chord when completion sound is enabled.
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          const noteStart = start + index * 0.11;
          this.tone(voice, noteStart, frequency, frequency, 0.65, 0.095);
          this.tone(voice, noteStart, frequency * 2, frequency * 2, 0.28, 0.012);
        });
        break;
    }
  }

  /** Cancel current sounds without changing the saved speaker preference. */
  stop(): void {
    this.pendingSound = undefined;
    this.stopAll();
    this.lastPlayed = {};
  }

  private flushPendingSound(): void {
    const pending = this.pendingSound;
    this.pendingSound = undefined;
    if (!pending || !this.enabled || this.disposed || this.context?.state !== "running") return;
    this.playCurrent(pending.kind, pending.options);
  }

  private warmContext(context: AudioContext): void {
    if (this.warmed || typeof context.createBuffer !== "function") return;
    this.warmed = true;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = 0;
      source.buffer = context.createBuffer(1, 1, context.sampleRate || 44_100);
      source.connect(gain);
      gain.connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
      source.stop(context.currentTime + .001);
    } catch {
      // Some Web Audio implementations do not need a warm-up source.
    }
  }

  private createVoice(kind: GameSound, start: number): Voice {
    if (this.voices.size >= MAX_VOICES) {
      const oldest = [...this.voices].sort((a, b) => a.start - b.start)[0];
      this.cancelVoices(voice => voice === oldest);
    }
    const voice: Voice = { gain: this.context!.createGain(), sources: [], nodes: [], ended: 0, kind, start };
    voice.gain.gain.value = .65;
    voice.gain.connect(this.context!.destination);
    this.voices.add(voice);
    return voice;
  }

  dispose(): void {
    this.setEnabled(false);
    this.disposed = true;
    const context = this.context;
    this.context = undefined;
    this.rotationLoad?.abort();
    this.rotationLoad = undefined;
    this.rotationBytes = undefined;
    this.rotationSample = undefined;
    try {
      if (context && context.state !== "closed") void context.close().catch(() => {});
    } catch { /* Already unavailable. */ }
  }

  private envelope(voice: Voice, start: number, duration: number, volume: number): GainNode {
    const gain = this.context!.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.gain.linearRampToValueAtTime(0, start + duration + 0.012);
    gain.connect(voice.gain);
    voice.nodes.push(gain);
    return gain;
  }

  private track(voice: Voice, source: AudioScheduledSourceNode, start: number, end: number): void {
    voice.sources.push(source);
    source.onended = () => {
      voice.ended++;
      if (voice.ended === voice.sources.length) {
        voice.sources.forEach(node => node.disconnect());
        voice.nodes.forEach(node => node.disconnect());
        voice.gain.disconnect();
        this.voices.delete(voice);
      }
    };
    source.start(start);
    source.stop(end);
  }

  private tone(
    voice: Voice, start: number, frequency: number, endFrequency: number,
    duration: number, volume: number, type: OscillatorType = "sine",
  ): void {
    const oscillator = this.context!.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (frequency !== endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    oscillator.connect(this.envelope(voice, start, duration, volume));
    this.track(voice, oscillator, start, start + duration + 0.015);
  }

  private melodyTone(voice: Voice, start: number, frequency: number, durationMs: number): void {
    const duration = durationMs / 1000;
    this.tone(voice, start, frequency, frequency, duration, .12 * this.config.melodyVolume);
    this.tone(voice, start, frequency * 2, frequency * 2, Math.min(.18, duration * .55), .018 * this.config.melodyVolume);
  }

  private stopAll(): void {
    this.cancelVoices(() => true);
    this.nextMelodyAt = 0;
    this.lastConnectionAt = -Infinity;
    this.connectionSequence = null;
  }

  private cancelVoices(matches: (voice: Voice) => boolean): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const end = now + (this.context.state === "running" ? 0.008 : 0);
    for (const voice of this.voices) {
      if (!matches(voice)) continue;
      // Fade live audio; silence suspended audio before it can resume later.
      try {
        voice.gain.gain.cancelScheduledValues(now);
        if (end > now) {
          voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
          voice.gain.gain.linearRampToValueAtTime(0, end);
        } else voice.gain.gain.setValueAtTime(0, now);
        if (!voice.sources.length) voice.gain.disconnect();
      } catch { /* A failed audio device is already silent. */ }
      for (const source of voice.sources) {
        try { source.stop(end); } catch { /* Source may already be stopped. */ }
      }
      this.voices.delete(voice);
    }
  }
}
