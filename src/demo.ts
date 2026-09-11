import { Puzzle, type Edge, type PuzzleSettings } from "./puzzle";
import { getConfig, type GameConfig } from "./config";
import { melodyStepMs, type ConnectionMelody } from "./melodies";

type DemoDelay = Exclude<keyof GameConfig["demo"], "timingMode" | "tempoBpm">;

export interface DemoScene {
  setPuzzle(puzzle: Puzzle, preview: boolean, animateShape?: boolean): void;
  focusConnection(a: number, b: number, maxDurationMs?: number): void;
  refresh(): void;
  getViewState(): { animating: boolean };
  readonly hasAnimations?: boolean;
  getShapeTransitionState?(): unknown;
}

/** The home preview owns its puzzle; it never edits or saves the player's game. */
export class HomeDemo {
  puzzle: Puzzle | null = null;
  paused = false;
  private phase: "waiting" | "complete" = "waiting";
  private remaining = 900;
  private index = 0;
  private config = getConfig().demo;
  private melody: ConnectionMelody = getConfig().sound.connectionMelody;
  private waitKey: DemoDelay = "initialDelayMs";
  private completionSoundPending = false;
  private completionCueMs: number | null = null;

  constructor(
    private scene: DemoScene,
    private onSound?: (kind: "connect" | "complete") => void,
    private completionDurationMs?: () => number,
  ) {}

  setConfig(config: GameConfig): void {
    const oldDuration = this.waitDuration(this.waitKey);
    const oldBeat = this.beatDuration();
    this.config = { ...config.demo };
    this.melody = config.sound.connectionMelody;
    if (this.completionSoundPending) {
      if (this.usesMelodyRhythm) {
        const fraction = this.completionCueMs !== null && oldBeat > 0 ? Math.min(1, this.completionCueMs / oldBeat) : 1;
        this.completionCueMs = this.beatDuration() * fraction;
      } else this.completionCueMs = null;
    }
    const duration = this.waitDuration(this.waitKey);
    if (duration === oldDuration) return;
    this.remaining = oldDuration > 0
      ? Math.max(0, Math.min(1, this.remaining / oldDuration)) * duration
      : duration;
  }

  private get usesMelodyRhythm(): boolean {
    return this.config.timingMode === "melody" && this.melody !== "classic";
  }

  private beatDuration(): number {
    return this.melody === "classic" ? this.config.stepDelayMs
      : melodyStepMs(this.melody, Math.max(0, this.index - 1), this.config.tempoBpm);
  }

  private waitDuration(key: DemoDelay): number {
    return key === "stepDelayMs" && this.usesMelodyRhythm ? this.beatDuration() : this.config[key];
  }

  private wait(phase: "waiting" | "complete", key: DemoDelay): void {
    this.phase = phase;
    this.waitKey = key;
    this.remaining = this.waitDuration(key);
  }

  start(settings: PuzzleSettings, animateShape = false): void {
    this.cancelPendingSound();
    this.puzzle = new Puzzle({ ...settings, seed: 43 });
    this.scene.setPuzzle(this.puzzle, true, animateShape);
    this.index = 0;
    this.wait("waiting", "initialDelayMs");
  }

  stop(): void { this.puzzle = null; this.cancelPendingSound(); }

  cancelPendingSound(): void { this.completionSoundPending = false; this.completionCueMs = null; }

  togglePaused(): void {
    this.paused = !this.paused;
    if (this.paused) this.cancelPendingSound();
    if (!this.paused && this.phase !== "complete") {
      this.wait("waiting", "resumeDelayMs");
    }
  }

  advanceTime(ms: number, suspended = false): void {
    const puzzle = this.puzzle;
    if (!puzzle || !Number.isFinite(ms) || ms <= 0) return;
    if (this.paused || suspended) { this.cancelPendingSound(); return; }
    if (this.scene.getShapeTransitionState?.()) return;
    const onBeat = this.usesMelodyRhythm && this.phase === "waiting" && this.waitKey === "stepDelayMs";
    const completionOnBeat = this.phase === "complete" && this.completionSoundPending && this.completionCueMs !== null;
    if (!onBeat && !completionOnBeat && (this.scene.hasAnimations || this.scene.getViewState().animating)) return;
    if (this.phase === "complete" && this.completionSoundPending) {
      if (this.completionCueMs !== null) {
        this.completionCueMs -= ms;
        if (this.completionCueMs > 0) return;
      }
      this.completionSoundPending = false;
      this.completionCueMs = null;
      this.onSound?.("complete");
      const duration = this.completionDurationMs?.() ?? 0;
      if (Number.isFinite(duration)) this.remaining = Math.max(this.remaining, duration);
      // The sound starts now; elapsed time from before this tick cannot shorten it.
      return;
    }
    this.remaining -= ms;
    if (this.remaining > 0) return;
    const overshoot = -this.remaining;
    if (this.phase === "complete") {
      puzzle.reset();
      this.cancelPendingSound();
      this.index = 0;
      this.wait("waiting", "restartDelayMs");
      this.scene.refresh();
    } else {
      const edge = puzzle.solution[this.index];
      const beat = this.usesMelodyRhythm && this.melody !== "classic"
        ? melodyStepMs(this.melody, this.index, this.config.tempoBpm) : undefined;
      this.scene.focusConnection(...edge, beat === undefined ? undefined : beat * .8);
      if (!puzzle.toggle(...edge).changed) return;
      this.index++;
      this.scene.refresh();
      this.onSound?.("connect");
      const complete = this.index === puzzle.solution.length;
      this.completionSoundPending = complete;
      this.wait(complete ? "complete" : "waiting", complete ? "completeHoldMs" : "stepDelayMs");
      if (this.usesMelodyRhythm) {
        // Carry sub-frame lateness, but never burst through missed beats after a stall.
        const delay = this.beatDuration();
        const next = delay - (overshoot < delay ? overshoot : 0);
        if (complete) this.completionCueMs = next;
        else this.remaining = next;
      }
    }
  }

  getState(): { phase: string; nextEdge: Edge | null; connected: number; total: number; delayMs: number } | null {
    if (!this.puzzle) return null;
    return {
      phase: this.paused ? "paused" : this.phase,
      nextEdge: this.puzzle.solution[this.index] ?? null,
      connected: this.index,
      total: this.puzzle.solution.length,
      delayMs: Math.max(0, this.remaining),
    };
  }
}
