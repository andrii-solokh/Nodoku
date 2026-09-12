/** A decorative arrow that alternates between a tool and its keyboard shortcut. */
export class TutorialToolGuide {
  private animation: Animation | null = null;
  private button: HTMLElement | null = null;
  private shortcut: HTMLElement | null = null;
  private duration = 7200;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private arrow: SVGGElement;

  constructor(private svg: SVGSVGElement) {
    this.arrow = svg.querySelector('g')!;
    window.addEventListener('resize', () => this.render());
    this.reducedMotion.addEventListener('change', () => this.render());
    void document.fonts.ready.then(() => this.render());
  }

  show(button: HTMLElement | null, shortcut: HTMLElement | null, color: string, cycleMs: number) {
    this.button = button;
    this.shortcut = shortcut;
    this.duration = Math.max(4800, cycleMs * 3);
    this.svg.style.color = color;
    this.render();
  }

  private render() {
    this.animation?.cancel();
    this.animation = null;
    this.svg.style.display = this.button ? 'block' : 'none';
    if (!this.button) return;
    const tool = this.button.getBoundingClientRect();
    if (!tool.width || !tool.height) { this.svg.style.display = 'none'; return; }
    const mobile = matchMedia('(pointer: coarse)').matches;
    const above = mobile && this.button.id !== 'onboarding-hint';
    const target = { x: tool.x + tool.width / 2, y: tool.y + tool.height / 2 };
    const anchor = above ? { x: target.x, y: tool.top - 6 } : { x: tool.right + 16, y: target.y };
    const keycaps = [...(this.shortcut?.querySelectorAll('kbd') ?? [])].map(key => key.getBoundingClientRect()).filter(box => box.width);
    const left = Math.min(...keycaps.map(box => box.left)), top = Math.min(...keycaps.map(box => box.top));
    const keys = keycaps.length ? new DOMRect(left, top,
      Math.max(...keycaps.map(box => box.right)) - left, Math.max(...keycaps.map(box => box.bottom)) - top) : null;
    const hasKeys = !!keys?.width && !!keys.height;
    this.svg.dataset.tool = this.button.id;
    this.svg.dataset.shortcut = String(hasKeys);
    const ease = (t: number) => t * t * (3 - 2 * t);
    const toolPose = (phase: number) => ({
      x: anchor.x + (above ? Math.sin(phase * Math.PI * 4) * 6 : Math.cos(phase * Math.PI * 4) * 5),
      y: anchor.y + (above ? Math.cos(phase * Math.PI * 4) : Math.sin(phase * Math.PI * 4) * (mobile ? 6 : 12)),
      aim: target,
      scale: above ? .4 : mobile ? .7 : 1,
    });
    const keyPose = (phase: number) => {
      const center = { x: keys!.x + keys!.width / 2, y: keys!.y + keys!.height / 2 };
      // Stay below the keys, away from the lesson copy. Short windows use a side swing.
      if (innerHeight - keys!.bottom < 36)
        return { x: keys!.left - 22, y: center.y + Math.sin(phase * Math.PI * 2) * 8, aim: center, scale: .6 };
      const angle = Math.PI - Math.PI * phase;
      return { x: center.x + (keys!.width / 2 + 24) * Math.cos(angle),
        y: center.y + (keys!.height / 2 + 6) * Math.sin(angle), aim: center, scale: .6 };
    };
    const travel = (from: ReturnType<typeof toolPose>, to: ReturnType<typeof toolPose>, t: number) => {
      const p = ease(t);
      return { x: from.x + (to.x - from.x) * p ** 3,
        y: from.y + (to.y - from.y) * (1 - (1 - p) ** 3),
        scale: from.scale + (to.scale - from.scale) * p,
        aim: { x: from.aim.x + (to.aim.x - from.aim.x) * p, y: from.aim.y + (to.aim.y - from.aim.y) * p } };
    };
    let previousAngle: number | undefined;
    const frames = Array.from({ length: 121 }, (_, index) => {
      const t = index / 120;
      const pose = !hasKeys ? toolPose(t) : t < .28 ? toolPose(t / .28)
        : t < .44 ? travel(toolPose(1), keyPose(0), (t - .28) / .16)
        : t < .78 ? keyPose(ease((t - .44) / .34))
        : travel(toolPose(0), keyPose(1), 1 - (t - .78) / .22);
      let angle = Math.atan2(pose.aim.y - pose.y, pose.aim.x - pose.x) * 180 / Math.PI;
      // Unwrap angles so crossings at ±180° never cause an accidental full spin.
      if (previousAngle !== undefined) {
        while (angle - previousAngle > 180) angle -= 360;
        while (angle - previousAngle < -180) angle += 360;
      }
      previousAngle = angle;
      return { transform: `translate(${pose.x}px, ${pose.y}px) rotate(${angle}deg) scale(${pose.scale})`, offset: t };
    });
    this.arrow.style.transform = frames[0].transform;
    if (!this.reducedMotion.matches)
      this.animation = this.arrow.animate(frames, { duration: this.duration, iterations: Infinity });
  }
}
