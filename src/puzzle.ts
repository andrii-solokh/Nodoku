export type Difficulty = "easy" | "medium" | "hard";

export interface PuzzleSettings {
  size: number;
  depth: number;
  difficulty: Difficulty;
  seed: number;
}

export interface PuzzleNode {
  id: number;
  x: number;
  y: number;
  z: number;
  required: number;
}

export type Edge = [number, number];
interface Move {
  edge: Edge;
  added: boolean;
}
interface Change {
  changed: boolean;
  reason?: string;
}

export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function canonical(a: number, b: number): Edge {
  return a < b ? [a, b] : [b, a];
}

function validSettings(value: unknown): value is PuzzleSettings {
  if (!value || typeof value !== "object") return false;
  const s = value as PuzzleSettings;
  return (
    Number.isInteger(s.size) &&
    s.size >= 2 &&
    s.size <= 7 &&
    (s.depth === 1 || s.depth === s.size) &&
    ["easy", "medium", "hard"].includes(s.difficulty) &&
    Number.isInteger(s.seed) &&
    s.seed >= 0 &&
    s.seed <= 0xffffffff
  );
}

// Mulberry32 keeps generation stable across reloads and platforms, including seed 0.
function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A UTC date gives every player the same puzzle, regardless of local timezone. */
export function dailyPuzzleSeed(date = new Date()): number {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid daily puzzle date");
  const day = date.toISOString().slice(0, 10);
  let hash = 0x811c9dc5;
  for (const character of `nodoku.daily.v1:${day}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  return hash;
}

/** A puzzle accepts every connected network matching its clues, not just its seed solution. */
export class Puzzle {
  readonly settings: PuzzleSettings;
  readonly nodes: PuzzleNode[] = [];
  readonly solution: Edge[] = [];
  edges: Edge[] = [];
  private readonly adjacency = new Map<number, number[]>();
  private readonly nodeById = new Map<number, PuzzleNode>();
  private history: Move[][] = [];
  private redoHistory: Move[][] = [];
  private batch: Move[] | null = null;
  private batchDepth = 0;

  constructor(settings: PuzzleSettings) {
    if (!validSettings(settings))
      throw new RangeError("Invalid puzzle settings");
    this.settings = { ...settings };
    const { size, depth, difficulty, seed } = settings;
    for (let z = 0; z < depth; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (
            depth > 1 &&
            x > 0 &&
            x < size - 1 &&
            y > 0 &&
            y < size - 1 &&
            z > 0 &&
            z < depth - 1
          )
            continue;
          const node = { id: x + size * (y + size * z), x, y, z, required: 0 };
          this.nodes.push(node);
          this.nodeById.set(node.id, node);
        }
      }
    }
    for (const node of this.nodes) {
      const neighbors: number[] = [];
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        const x = node.x + dx,
          y = node.y + dy,
          z = node.z + dz;
        if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= depth)
          continue;
        const id = x + size * (y + size * z);
        if (this.nodeById.has(id)) neighbors.push(id);
      }
      this.adjacency.set(node.id, neighbors);
    }

    const random = randomGenerator(seed);
    const visited = new Set<number>();
    const stack = [this.nodes[Math.floor(random() * this.nodes.length)].id];
    visited.add(stack[0]);
    const used = new Set<string>();
    const addSolution = (a: number, b: number) => {
      this.solution.push(canonical(a, b));
      used.add(edgeKey(a, b));
      this.nodeById.get(a)!.required++;
      this.nodeById.get(b)!.required++;
    };
    // Iterative DFS guarantees a connected starting network without retry loops.
    while (stack.length) {
      const current = stack[stack.length - 1];
      const options = this.adjacency
        .get(current)!
        .filter((id) => !visited.has(id));
      if (!options.length) {
        stack.pop();
        continue;
      }
      const next = options[Math.floor(random() * options.length)];
      visited.add(next);
      addSolution(current, next);
      stack.push(next);
    }
    const extraChance = { easy: 0.7, medium: 0.35, hard: 0.08 }[difficulty];
    for (const node of this.nodes) {
      for (const next of this.adjacency.get(node.id)!) {
        if (
          node.id < next &&
          !used.has(edgeKey(node.id, next)) &&
          random() < extraChance
        )
          addSolution(node.id, next);
      }
    }
  }

  remaining(id: number): number {
    const node = this.nodeById.get(id);
    if (!node) return 0;
    return (
      node.required -
      this.edges.reduce(
        (sum, edge) => sum + Number(edge[0] === id || edge[1] === id),
        0,
      )
    );
  }

  neighbors(id: number): number[] {
    return [...(this.adjacency.get(id) ?? [])];
  }

  toggle(a: number, b: number): Change {
    if (!this.adjacency.get(a)?.includes(b))
      return { changed: false, reason: "Connect neighboring nodes." };
    if (this.batch && this.batch.length >= 2048)
      return {
        changed: false,
        reason: "Finish this stroke before adding more connections.",
      };
    const key = edgeKey(a, b);
    const index = this.edges.findIndex((edge) => edgeKey(...edge) === key);
    if (index >= 0) {
      const [edge] = this.edges.splice(index, 1);
      this.record({ edge, added: false });
      return { changed: true };
    }
    if (this.remaining(a) <= 0 || this.remaining(b) <= 0)
      return { changed: false, reason: "One of these nodes is already full." };
    const edge = canonical(a, b);
    this.edges.push(edge);
    this.record({ edge, added: true });
    return { changed: true };
  }

  /** Capture editable state so an immediate click can be replaced by a double-tap. */
  checkpoint(): () => void {
    const copyGroup = (group: Move[]): Move[] => group.map((move) => ({
      added: move.added,
      edge: [...move.edge],
    }));
    const edges = this.edges.map((edge): Edge => [...edge]);
    const history = this.history.map(copyGroup);
    const redoHistory = this.redoHistory.map(copyGroup);
    const batchIndex = this.batch ? this.history.indexOf(this.batch) : -1;
    const batch = this.batch ? copyGroup(this.batch) : null;
    const batchDepth = this.batchDepth;
    return () => {
      this.edges = edges.map((edge): Edge => [...edge]);
      this.history = history.map(copyGroup);
      this.redoHistory = redoHistory.map(copyGroup);
      // A nonempty active batch is also the final history group; keep that alias.
      this.batch = batchIndex >= 0
        ? this.history[batchIndex]
        : batch ? copyGroup(batch) : null;
      this.batchDepth = batchDepth;
    };
  }

  /** Nested batches join the outer gesture; empty batches never consume undo. */
  beginBatch(): void {
    if (this.batchDepth++ === 0) this.batch = [];
  }

  endBatch(): void {
    if (this.batchDepth > 0 && --this.batchDepth === 0) this.batch = null;
  }

  toggleNode(id: number): Change & { removed: boolean; count: number } {
    const node = this.nodeById.get(id);
    if (!node || node.required <= 0)
      return {
        changed: false,
        removed: false,
        count: 0,
        reason: "Choose an active node.",
      };
    const removed = this.remaining(id) === 0;
    let count = 0;
    this.beginBatch();
    try {
      if (removed) {
        const incident = this.edges.filter(([a, b]) => a === id || b === id);
        for (const edge of incident) if (this.toggle(...edge).changed) count++;
      } else {
        const placed = new Set(this.edges.map((edge) => edgeKey(...edge)));
        const available = (candidate: number) =>
          this.neighbors(candidate).filter(
            (other) =>
              this.remaining(other) > 0 &&
              !placed.has(edgeKey(candidate, other)),
          ).length;
        const candidates = this.neighbors(id)
          .filter(
            (other) =>
              this.remaining(other) > 0 && !placed.has(edgeKey(id, other)),
          )
          // Fewer spare choices means a more constrained neighbor; IDs break ties.
          .sort(
            (a, b) =>
              available(a) -
                this.remaining(a) -
                (available(b) - this.remaining(b)) || a - b,
          );
        for (const other of candidates) {
          if (this.remaining(id) === 0) break;
          if (this.toggle(id, other).changed) count++;
        }
      }
    } finally {
      this.endBatch();
    }
    return count > 0
      ? { changed: true, removed, count }
      : {
          changed: false,
          removed,
          count,
          reason: "No neighboring nodes have room for a connection.",
        };
  }

  private record(move: Move): void {
    this.redoHistory = [];
    if (this.batch) {
      if (!this.batch.length) this.history.push(this.batch);
      this.batch.push(move);
    } else {
      this.history.push([move]);
    }
    // Drop entire old gestures, never leave a partially undoable gesture.
    let length = this.history.reduce((sum, group) => sum + group.length, 0);
    while (length > 2048) length -= this.history.shift()!.length;
  }

  undo(): boolean {
    this.batch = null;
    this.batchDepth = 0;
    const group = this.history.pop();
    if (!group) return false;
    this.redoHistory.push(group);
    for (let i = group.length - 1; i >= 0; i--) {
      const move = group[i];
      if (move.added) {
        const key = edgeKey(...move.edge);
        this.edges = this.edges.filter((edge) => edgeKey(...edge) !== key);
      } else {
        this.edges.push([...move.edge]);
      }
    }
    return true;
  }

  redo(): boolean {
    this.batch = null;
    this.batchDepth = 0;
    const group = this.redoHistory.pop();
    if (!group) return false;
    for (const move of group) {
      if (move.added) {
        this.edges.push([...move.edge]);
      } else {
        const key = edgeKey(...move.edge);
        this.edges = this.edges.filter((edge) => edgeKey(...edge) !== key);
      }
    }
    this.history.push(group);
    return true;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }
  get canRedo(): boolean {
    return this.redoHistory.length > 0;
  }

  reset(): void {
    this.edges = [];
    this.history = [];
    this.redoHistory = [];
    this.batch = null;
    this.batchDepth = 0;
  }

  /** Suggest a move without changing connections, progress or history. */
  hint(): { edge?: Edge; remove?: boolean; reason?: string } {
    if (this.solved)
      return { reason: "This network is complete." };
    const solutionKeys = new Set(this.solution.map((edge) => edgeKey(...edge)));
    const incompatible = this.edges.find(
      (edge) => !solutionKeys.has(edgeKey(...edge)),
    );
    if (incompatible) {
      const edge: Edge = [...incompatible];
      return { edge, remove: true };
    }
    const currentKeys = new Set(this.edges.map((edge) => edgeKey(...edge)));
    const missing = this.solution.find(
      (edge) => !currentKeys.has(edgeKey(...edge)),
    );
    if (!missing) return { reason: "No hint available." };
    const edge: Edge = [...missing];
    return { edge, remove: false };
  }

  get progress(): number {
    const total = this.nodes.reduce((sum, node) => sum + node.required, 0);
    return total === 0 ? 0 : Math.min(1, (this.edges.length * 2) / total);
  }

  private get degreesComplete(): boolean {
    return this.nodes.every((node) => this.remaining(node.id) === 0);
  }

  /** Placed networks, with isolated required nodes included and smaller groups first. */
  get connectionGroups(): number[][] {
    const links = new Map<number, number[]>(
      this.nodes.filter((node) => node.required > 0).map((node) => [node.id, []]),
    );
    for (const [a, b] of this.edges) {
      if (!links.has(a) || !links.has(b)) continue;
      links.get(a)!.push(b);
      links.get(b)!.push(a);
    }
    const visited = new Set<number>();
    const groups: number[][] = [];
    for (const id of links.keys()) {
      if (visited.has(id)) continue;
      visited.add(id);
      const stack = [id];
      const group: number[] = [];
      while (stack.length) {
        const current = stack.pop()!;
        group.push(current);
        for (const neighbor of links.get(current)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            stack.push(neighbor);
          }
        }
      }
      groups.push(group.sort((a, b) => a - b));
    }
    return groups.sort((a, b) => a.length - b.length || a[0] - b[0]);
  }

  private get connected(): boolean {
    return this.connectionGroups.length === 1;
  }

  get solved(): boolean {
    return this.degreesComplete && this.connected;
  }
  get disconnected(): boolean {
    return this.degreesComplete && !this.connected;
  }

  serialize(): object {
    const serializeGroups = (groups: Move[][]) => groups.flatMap((group, index) =>
      group.map((move) => ({
        added: move.added,
        edge: [...move.edge],
        ...(group.length > 1 ? { batch: index + 1 } : {}),
      })),
    );
    return {
      version: 1,
      settings: { ...this.settings },
      edges: this.edges.map((edge) => [...edge]),
      history: serializeGroups(this.history),
      // Store the next redo first, with each gesture's moves in replay order.
      redo: serializeGroups([...this.redoHistory].reverse()),
    };
  }

  static restore(data: unknown): Puzzle | null {
    if (!data || typeof data !== "object") return null;
    const saved = data as Record<string, unknown>;
    if (
      saved.version !== 1 ||
      !validSettings(saved.settings) ||
      !Array.isArray(saved.edges)
    )
      return null;
    const puzzle = new Puzzle(saved.settings);
    const validEdge = (edge: unknown): edge is Edge =>
      Array.isArray(edge) &&
      edge.length === 2 &&
      edge.every(Number.isInteger) &&
      !!puzzle.adjacency.get(edge[0])?.includes(edge[1]);
    if (saved.edges.length > puzzle.solution.length) return null;
    const seen = new Set<string>();
    for (const edge of saved.edges) {
      if (!validEdge(edge) || seen.has(edgeKey(...edge))) return null;
      if (!puzzle.toggle(...edge).changed) return null;
      seen.add(edgeKey(...edge));
    }
    const parseGroups = (data: unknown): Move[][] | null => {
      if (data === undefined) return [];
      if (!Array.isArray(data) || data.length > 2048) return null;
      const groups: Move[][] = [];
      let previousBatch: number | undefined;
      let highestBatch = 0;
      for (const value of data) {
        if (
          !value ||
          typeof value !== "object" ||
          typeof value.added !== "boolean" ||
          !validEdge(value.edge)
        )
          return null;
        const batch = value.batch;
        if (batch !== undefined && (!Number.isSafeInteger(batch) || batch < 1))
          return null;
        if (
          batch !== undefined &&
          batch !== previousBatch &&
          batch <= highestBatch
        )
          return null;
        if (batch !== undefined) highestBatch = batch;
        const move: Move = {
          added: value.added,
          edge: canonical(value.edge[0], value.edge[1]),
        };
        if (batch !== undefined && batch === previousBatch)
          groups[groups.length - 1].push(move);
        else groups.push([move]);
        previousBatch = batch;
      }
      return groups;
    };
    const history = parseGroups(saved.history);
    const redo = parseGroups(saved.redo);
    if (!history || !redo) return null;
    if ([...history, ...redo].reduce((sum, group) => sum + group.length, 0) > 2048)
      return null;
    // Validate both directions independently from the current board, including
    // intermediate moves within a gesture, before trusting either history stack.
    const validSequence = (moves: Move[], undo: boolean): boolean => {
      const edges = new Set(seen);
      const degrees = new Map(
        puzzle.nodes.map((node) => [
          node.id,
          node.required - puzzle.remaining(node.id),
        ]),
      );
      for (const move of moves) {
        const {
          edge: [a, b],
          added,
        } = move;
        const key = edgeKey(a, b);
        const adding = undo ? !added : added;
        if (adding === edges.has(key)) return false;
        if (adding) edges.add(key);
        else edges.delete(key);
        for (const id of [a, b]) {
          const degree = degrees.get(id)! + (adding ? 1 : -1);
          if (degree < 0 || degree > puzzle.nodeById.get(id)!.required)
            return false;
          degrees.set(id, degree);
        }
      }
      return true;
    };
    if (!validSequence(history.flat().reverse(), true) || !validSequence(redo.flat(), false))
      return null;
    puzzle.history = history;
    puzzle.redoHistory = redo.reverse();
    return puzzle;
  }
}
