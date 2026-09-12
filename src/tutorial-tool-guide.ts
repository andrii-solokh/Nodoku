/** Stationary, hand-drawn curves that grow toward a tool and its shortcut. */
export class TutorialToolGuide {
  private animations: Animation[] = [];
  private button: HTMLElement | null = null;
  private shortcut: HTMLElement | null = null;
  private duration = 3600;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private svg: SVGSVGElement) {
    window.addEventListener('resize', () => this.render());
    this.reducedMotion.addEventListener('change', () => this.render());
    void document.fonts.ready.then(() => this.render());
  }

  show(button: HTMLElement | null, shortcut: HTMLElement | null, color: string, cycleMs: number) {
    this.button = button;
    this.shortcut = shortcut;
    this.duration = Math.max(2400, cycleMs * 1.5);
    this.svg.style.color = color;
    this.render();
  }

  private draw(target: string, x: number, y: number, angle: number, scale: number, delay: number) {
    const group = this.svg.querySelector<SVGGElement>(`[data-target="${target}"]`)!;
    group.style.display = 'block';
    group.setAttribute('transform', `translate(${x} ${y}) rotate(${angle}) scale(${scale})`);
    if (this.reducedMotion.matches) return;
    const timing = { duration: this.duration, iterations: Infinity, delay, fill: 'both' as const };
    this.animations.push(
      group.querySelector('.tool-arrow-shaft')!.animate([
        { strokeDashoffset: '1', opacity: 0, offset: 0 },
        { strokeDashoffset: '1', opacity: 1, offset: .08 },
        { strokeDashoffset: '0', opacity: 1, offset: .45 },
        { strokeDashoffset: '0', opacity: 1, offset: .76 },
        { strokeDashoffset: '1', opacity: 0, offset: 1 },
      ], { ...timing, easing: 'ease-in-out' }),
      group.querySelector('.tool-arrow-head')!.animate([
        { opacity: 0, offset: 0 }, { opacity: 0, offset: .4 },
        { opacity: 1, offset: .48 }, { opacity: 1, offset: .76 },
        { opacity: 0, offset: .83 }, { opacity: 0, offset: 1 },
      ], timing),
      group.querySelector('g')!.animate([
        { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' },
        { transform: 'rotate(-3deg)' }, { transform: 'rotate(-4deg)' },
      ], { ...timing, easing: 'ease-in-out' }),
    );
  }

  private render() {
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.svg.style.display = this.button ? 'block' : 'none';
    this.svg.querySelectorAll<SVGGElement>('[data-target]').forEach(group => { group.style.display = 'none'; });
    if (!this.button) return;
    const tool = this.button.getBoundingClientRect();
    if (!tool.width || !tool.height) { this.svg.style.display = 'none'; return; }
    const mobile = matchMedia('(pointer: coarse)').matches;
    const above = mobile && this.button.id !== 'onboarding-hint';
    this.draw('tool', above ? tool.x + tool.width / 2 : tool.right + 14,
      above ? tool.top - 6 : tool.y + tool.height / 2, above ? 90 : 180, above ? .3 : mobile ? .7 : 1, 0);
    const caps = [...(this.shortcut?.querySelectorAll('kbd') ?? [])].map(key => key.getBoundingClientRect()).filter(box => box.width);
    this.svg.dataset.tool = this.button.id;
    this.svg.dataset.shortcut = String(caps.length > 0);
    if (caps.length) {
      const left = Math.min(...caps.map(box => box.left));
      const top = Math.min(...caps.map(box => box.top)), bottom = Math.max(...caps.map(box => box.bottom));
      const scale = Math.min(.7, Math.max(.15, (left - 20) / 76));
      this.draw('keys', left - 12, (top + bottom) / 2, 0, scale, this.duration * .45);
    }
  }
}
