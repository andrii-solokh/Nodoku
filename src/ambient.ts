/** One optional music player, independent of the puzzle's short sound effects. */
export class AmbientAudio {
  private media?: HTMLAudioElement;
  private enabled = false;
  private unlocked = false;
  private suspended = false;
  private disposed = false;
  private volume = .18;
  private revision = 0;
  private pending: number | null = null;
  private fadeFrame: number | null = null;

  constructor(private url: string) {}

  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.enabled = enabled;
    if (enabled) this.play(); else this.pause();
  }

  setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.media && this.pending === null && this.fadeFrame === null) this.media.volume = this.volume;
  }

  /** Invoke synchronously from a trusted pointer or keyboard gesture. */
  unlock(): void {
    if (this.disposed) return;
    this.unlocked = true;
    this.play();
  }

  suspend(): void {
    if (this.disposed) return;
    this.suspended = true;
    this.pause();
  }

  resume(): void {
    if (this.disposed) return;
    this.suspended = false;
    this.play();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    if (this.media) {
      try {
        this.media.removeAttribute("src");
        this.media.load();
      } catch { /* Already unavailable. */ }
      this.media = undefined;
    }
  }

  private get shouldPlay(): boolean {
    return this.enabled && this.unlocked && !this.suspended && !this.disposed;
  }

  private play(): void {
    if (!this.shouldPlay || this.pending !== null) return;
    try {
      if (!this.media) {
        this.media = new Audio();
        this.media.preload = "none";
        this.media.loop = true;
        this.media.src = this.url;
      }
      const media = this.media;
      if (!media.paused) return;
      this.cancelFade();
      media.volume = 0;
      const revision = ++this.revision;
      this.pending = revision;
      const request = media.play();
      void Promise.resolve(request).then(() => {
        // A late play resolution can follow mute or page suspension. It must
        // neither restart muted music nor pause a newer valid play request.
        if (!this.shouldPlay) { this.quietPause(media); return; }
        if (revision !== this.revision) return;
        this.pending = null;
        this.fadeIn(media, revision);
      }).catch(() => {
        if (revision !== this.revision) return;
        this.pending = null;
        this.quietPause(media);
        // A later gesture/resume may retry; there is no background retry loop.
      });
    } catch {
      this.pending = null;
      if (this.media) this.quietPause(this.media);
    }
  }

  private pause(): void {
    this.revision++;
    this.pending = null;
    this.cancelFade();
    if (this.media) this.quietPause(this.media);
  }

  private quietPause(media: HTMLAudioElement): void {
    try { media.pause(); } catch { /* Music is optional. */ }
  }

  private cancelFade(): void {
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
    this.fadeFrame = null;
  }

  private fadeIn(media: HTMLAudioElement, revision: number): void {
    const start = performance.now();
    const frame = (now: number): void => {
      this.fadeFrame = null;
      if (revision !== this.revision || !this.shouldPlay) return;
      const progress = Math.min(1, Math.max(0, (now - start) / 300));
      media.volume = this.volume * progress * (2 - progress);
      if (progress < 1) this.fadeFrame = requestAnimationFrame(frame);
    };
    this.fadeFrame = requestAnimationFrame(frame);
  }
}
