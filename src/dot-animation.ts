export type DotAnimationStyle = "glide" | "spring" | "orbit" | "fade";
export type DotState = { id: number; x: number; y: number; scale: number; opacity: number };
type Position = { x: number; y: number };
type Transition = { from: DotState; to: DotState; exiting: boolean };
type Options = { style: DotAnimationStyle; durationMs: number; animate?: boolean };

const PIPS: [number, number][][] = [
  [], [[0, 0]], [[-1, 1], [1, -1]], [[-1, 1], [0, 0], [1, -1]],
  [[-1, 1], [1, 1], [-1, -1], [1, -1]],
  [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
  [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
];
const clampCount = (count: number): number => Number.isFinite(count) ? Math.max(0, Math.min(6, Math.round(count))) : 0;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function dotLayout(count: number): Position[] {
  count = clampCount(count);
  const spacing = count > 3 ? .066 : .071;
  return PIPS[count].map(([x, y]) => ({ x: x * spacing, y: y * spacing }));
}

// Six dots at most: an exact matching keeps the nearest visible dots in place
// without the crossing and sudden identity swaps of an array-index mapping.
function matchDots(dots: DotState[], targets: Position[]): number[] {
  let best: number[] = [], bestCost = Infinity;
  const visit = (chosen: number[], used: number, cost: number): void => {
    if (cost >= bestCost) return;
    if (chosen.length === targets.length) { best = [...chosen]; bestCost = cost; return; }
    const target = targets[chosen.length];
    for (let i = 0; i < dots.length; i++) {
      if (used & (1 << i)) continue;
      const dot = dots[i];
      const distance = (dot.x - target.x) ** 2 + (dot.y - target.y) ** 2;
      chosen.push(i);
      visit(chosen, used | (1 << i), cost + distance + (1 - dot.opacity) * .002);
      chosen.pop();
    }
  };
  visit([], 0, 0);
  return best;
}

/** A small, renderer-independent transition for one node's remaining dots. */
export class DotAnimation {
  private current: DotState[];
  private transitions: Transition[] = [];
  private nextId = 0;
  private elapsed = 0;
  private count: number;
  private style: DotAnimationStyle;
  private duration: number;

  constructor(count: number, options: Options = { style: "glide", durationMs: 460 }) {
    this.count = clampCount(count);
    this.style = options.style;
    this.duration = options.durationMs;
    this.current = dotLayout(this.count).map(position => ({ ...position, id: this.nextId++, scale: 1, opacity: 1 }));
  }

  get active(): boolean { return this.transitions.length > 0; }
  get dots(): readonly DotState[] { return this.current; }

  retarget(count: number, options: Options): DotState[] {
    count = clampCount(count);
    if (count === this.count) {
      if (options.animate === false || options.durationMs <= 0) this.finish();
      return [];
    }
    this.count = count;
    this.style = options.style;
    this.duration = Math.max(0, options.durationMs);
    this.elapsed = 0;
    const targets = dotLayout(count);
    // Reuse even departing dots when a rapid undo brings them back. This bounds
    // the live meshes to six and starts every new transition at its live state.
    while (this.current.length < count) this.current.push({
      id: this.nextId++, x: 0, y: -.022, scale: this.style === "fade" ? 1 : 0, opacity: 0,
    });
    const assignments = matchDots(this.current, targets);
    this.transitions = this.current.map((dot, index) => {
      const target = targets[assignments.indexOf(index)];
      const exiting = !target;
      return {
        from: { ...dot }, exiting,
        to: target
          ? { ...dot, ...target, scale: 1, opacity: 1 }
          : { ...dot, x: dot.x * .35, y: dot.y * .35 + .02, scale: this.style === "fade" ? dot.scale : 0, opacity: 0 },
      };
    });
    const released = this.transitions
      .filter(transition => transition.exiting && transition.from.opacity > .001 && transition.from.scale > .001)
      .map(transition => ({ ...transition.from }));
    if (options.animate === false || this.duration <= 0) this.finish();
    return released;
  }

  advance(ms: number): void {
    if (!this.active) return;
    this.elapsed += Number.isFinite(ms) ? Math.max(0, ms) : 0;
    if (this.elapsed >= this.duration) { this.finish(); return; }
    const t = this.elapsed / this.duration;
    const smooth = t * t * (3 - 2 * t);
    const spring = 1 + 2.15 * (t - 1) ** 3 + 1.15 * (t - 1) ** 2;
    const movement = this.style === "spring" ? spring : smooth;
    this.current = this.transitions.map(({ from, to, exiting }) => {
      let x = lerp(from.x, to.x, movement), y = lerp(from.y, to.y, movement);
      let scale = Math.max(0, lerp(from.scale, to.scale, movement));
      let opacity = lerp(from.opacity, to.opacity, smooth);
      if (this.style === "orbit") {
        const dx = to.x - from.x, dy = to.y - from.y;
        const distance = Math.hypot(dx, dy);
        if (distance > .0001) {
          const bend = Math.sin(Math.PI * t) * Math.min(.035, distance * .55) * (from.id % 2 ? 1 : -1);
          x += -dy / distance * bend;
          y += dx / distance * bend;
        }
      } else if (this.style === "fade") {
        if (!exiting && from.opacity > 0) opacity *= 1 - .88 * Math.sin(Math.PI * t) ** 2;
      } else if (this.style === "spring" && !exiting && from.scale > 0) {
        scale += .075 * Math.sin(Math.PI * t) * (1 - t);
      }
      return { id: from.id, x, y, scale, opacity };
    });
  }

  finish(): void {
    if (!this.active) return;
    this.current = this.transitions.filter(dot => !dot.exiting).map(dot => ({ ...dot.to }));
    this.transitions = [];
    this.elapsed = this.duration;
  }

  snapshot() {
    return {
      count: this.count, active: this.active, style: this.style,
      progress: this.active ? Math.min(1, this.elapsed / this.duration) : 1, durationMs: this.duration,
      dots: this.current.map((dot, index) => ({
        ...dot, targetX: this.transitions[index]?.to.x ?? dot.x,
        targetY: this.transitions[index]?.to.y ?? dot.y, exiting: this.transitions[index]?.exiting ?? false,
      })),
    };
  }
}
