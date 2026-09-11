import assert from "node:assert/strict";
import test from "node:test";
import {
  Puzzle,
  edgeKey,
  type Difficulty,
  type Edge,
  type PuzzleSettings,
} from "../src/puzzle.ts";

const settings: PuzzleSettings = {
  size: 4,
  depth: 4,
  difficulty: "medium",
  seed: 42,
};
const keys = (edges: Edge[]) => edges.map((edge) => edgeKey(...edge)).sort();

test("all board sizes, shapes, difficulties, and seeds generate connected solvable surface networks", () => {
  for (let size = 3; size <= 7; size++) {
    for (const depth of [1, size]) {
      for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
        for (const seed of [0, 1, 42, 1776, 0xffffffff]) {
          const puzzle = new Puzzle({ size, depth, difficulty, seed });
          assert.equal(
            puzzle.nodes.length,
            depth === 1 ? size * size : size ** 3 - (size - 2) ** 3,
          );
          assert.equal(puzzle.edges.length, 0);
          assert.equal(puzzle.progress, 0);
          assert.equal(puzzle.solved, false);
          assert.equal(puzzle.disconnected, false);
          for (const node of puzzle.nodes) {
            assert.equal(node.id, node.x + size * (node.y + size * node.z));
            assert.ok(node.required >= 1 && node.required <= 4);
            assert.ok(node.required <= puzzle.neighbors(node.id).length);
            if (depth > 1)
              assert.ok(
                [node.x, node.y, node.z].some(
                  (value) => value === 0 || value === size - 1,
                ),
              );
            for (const id of puzzle.neighbors(node.id)) {
              const neighbor = puzzle.nodes.find((node) => node.id === id)!;
              assert.equal(
                Math.abs(node.x - neighbor.x) +
                  Math.abs(node.y - neighbor.y) +
                  Math.abs(node.z - neighbor.z),
                1,
              );
            }
          }
          assert.equal(
            new Set(keys(puzzle.solution)).size,
            puzzle.solution.length,
          );
          for (const edge of puzzle.solution)
            assert.equal(puzzle.toggle(...edge).changed, true);
          assert.equal(puzzle.progress, 1);
          assert.equal(puzzle.solved, true);
          assert.equal(puzzle.disconnected, false);
        }
      }
    }
  }
});

test("generation is deterministic, seed sensitive, and difficulty changes clue density", () => {
  const a = new Puzzle(settings),
    b = new Puzzle(settings);
  assert.deepEqual(a.nodes, b.nodes);
  assert.deepEqual(a.solution, b.solution);
  assert.notDeepEqual(
    a.solution,
    new Puzzle({ ...settings, seed: 43 }).solution,
  );
  const easy = new Puzzle({ ...settings, difficulty: "easy" });
  const medium = new Puzzle({ ...settings, difficulty: "medium" });
  const hard = new Puzzle({ ...settings, difficulty: "hard" });
  assert.ok(easy.solution.length > medium.solution.length);
  assert.ok(medium.solution.length > hard.solution.length);
});

test("toggle enforces adjacency and available degrees, allows removing full edges, and undo reverses both directions", () => {
  const puzzle = new Puzzle(settings);
  assert.equal(puzzle.toggle(0, 0).changed, false);
  assert.equal(puzzle.toggle(0, 2).changed, false);
  assert.equal(puzzle.toggle(-1, 0).changed, false);
  assert.equal(puzzle.toggle(0, NaN).changed, false);
  const edge = puzzle.solution[0];
  const required = puzzle.remaining(edge[0]);
  assert.equal(puzzle.toggle(...edge).changed, true);
  assert.equal(puzzle.remaining(edge[0]), required - 1);
  assert.equal(puzzle.toggle(edge[1], edge[0]).changed, true);
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.undo(), true);
  assert.deepEqual(keys(puzzle.edges), [edgeKey(...edge)]);
  assert.equal(puzzle.undo(), true);
  assert.equal(puzzle.undo(), false);
  for (const solutionEdge of puzzle.solution) puzzle.toggle(...solutionEdge);
  const solutionKeys = new Set(keys(puzzle.solution));
  const missing = puzzle.nodes
    .flatMap((node) =>
      puzzle.neighbors(node.id).map((id) => [node.id, id] as Edge),
    )
    .find((edge) => !solutionKeys.has(edgeKey(...edge)))!;
  assert.equal(puzzle.toggle(...missing).changed, false);
  assert.equal(puzzle.toggle(...edge).changed, true);
  puzzle.reset();
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.undo(), false);
  assert.equal(puzzle.progress, 0);
});

test("hints remove incompatible edges, support undo, and always reach a solution", () => {
  const puzzle = new Puzzle(settings);
  const solutionKeys = new Set(keys(puzzle.solution));
  const wrong = puzzle.nodes
    .flatMap((node) =>
      puzzle.neighbors(node.id).map((id) => [node.id, id] as Edge),
    )
    .find((edge) => !solutionKeys.has(edgeKey(...edge)))!;
  puzzle.toggle(...wrong);
  const hint = puzzle.hint();
  assert.equal(hint.changed, true);
  assert.equal(hint.removed, true);
  assert.equal(edgeKey(...hint.edge!), edgeKey(...wrong));
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.undo(), true);
  assert.deepEqual(keys(puzzle.edges), [edgeKey(...wrong)]);
  let hints = 0;
  while (!puzzle.solved && hints++ <= puzzle.solution.length + 1)
    assert.equal(puzzle.hint().changed, true);
  assert.equal(puzzle.solved, true);
  assert.equal(puzzle.hint().changed, false);
  assert.equal(puzzle.undo(), true);
  assert.equal(puzzle.solved, false);
});

test("redo restores both additions and removals, and new moves discard the redo branch", () => {
  const puzzle = new Puzzle(settings);
  const first = puzzle.solution[0],
    second = puzzle.solution[1];
  assert.equal(puzzle.canUndo, false);
  assert.equal(puzzle.canRedo, false);
  assert.equal(puzzle.redo(), false);
  puzzle.toggle(...first);
  puzzle.toggle(...first);
  assert.equal(puzzle.canUndo, true);
  assert.equal(puzzle.canRedo, false);
  puzzle.undo();
  puzzle.undo();
  assert.equal(puzzle.canUndo, false);
  assert.equal(puzzle.canRedo, true);
  assert.equal(puzzle.redo(), true);
  assert.deepEqual(keys(puzzle.edges), [edgeKey(...first)]);
  assert.equal(puzzle.redo(), true);
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.canRedo, false);
  puzzle.undo();
  // Rejected input does not discard a valid redo branch.
  assert.equal(puzzle.toggle(0, 0).changed, false);
  assert.equal(puzzle.canRedo, true);
  puzzle.toggle(...second);
  assert.equal(puzzle.canRedo, false);
  assert.equal(puzzle.redo(), false);
  puzzle.undo();
  puzzle.hint();
  assert.equal(puzzle.canRedo, false);
  puzzle.undo();
  puzzle.reset();
  assert.equal(puzzle.canRedo, false);
  assert.equal(puzzle.canUndo, false);
  assert.equal(puzzle.redo(), false);
  assert.equal(puzzle.edges.length, 0);
});

test("undo and redo transition solved state after saving and restoring", () => {
  const puzzle = new Puzzle(settings);
  for (const edge of puzzle.solution) puzzle.toggle(...edge);
  assert.equal(puzzle.solved, true);
  puzzle.undo();
  assert.equal(puzzle.solved, false);
  assert.equal(puzzle.canRedo, true);
  const restored = Puzzle.restore(puzzle.serialize())!;
  assert.equal(restored.canUndo, true);
  assert.equal(restored.canRedo, true);
  assert.deepEqual(keys(restored.edges), keys(puzzle.edges));
  assert.equal(restored.redo(), true);
  assert.equal(restored.solved, true);
  assert.equal(puzzle.redo(), true);
  assert.equal(puzzle.solved, true);
  assert.equal(puzzle.progress, 1);
});

test("saved redo replays mixed drag groups in order and preserves independent copies", () => {
  const puzzle = new Puzzle(settings);
  const [first, second, third] = puzzle.solution;
  puzzle.toggle(...first);
  puzzle.beginBatch();
  puzzle.toggle(...first);
  puzzle.toggle(...second);
  puzzle.endBatch();
  puzzle.toggle(...third);
  puzzle.undo();
  puzzle.undo();
  puzzle.undo();
  const save = JSON.parse(JSON.stringify(puzzle.serialize()));
  let restored = Puzzle.restore(save)!;
  assert.ok(restored);
  assert.equal(restored.canUndo, false);
  assert.equal(restored.canRedo, true);
  // Mutating the source object cannot alter a restored redo action.
  save.redo[0].edge[0] = -1;
  assert.equal(restored.redo(), true);
  assert.deepEqual(keys(restored.edges), [edgeKey(...first)]);
  restored = Puzzle.restore(restored.serialize())!;
  assert.equal(restored.redo(), true);
  assert.deepEqual(keys(restored.edges), [edgeKey(...second)]);
  assert.equal(restored.redo(), true);
  assert.deepEqual(keys(restored.edges), keys([second, third]));
  assert.equal(restored.canRedo, false);
  restored.undo();
  restored.undo();
  assert.deepEqual(keys(restored.edges), [edgeKey(...first)]);
});

test("restored redo keeps double-tap fill and clear as single actions", () => {
  const puzzle = new Puzzle(settings);
  const node = puzzle.nodes.find(node => node.required > 1)!;
  const fill = puzzle.toggleNode(node.id);
  assert.equal(fill.count, node.required);
  const filled = keys(puzzle.edges);
  puzzle.undo();
  const restoredFill = Puzzle.restore(puzzle.serialize())!;
  assert.equal(restoredFill.redo(), true);
  assert.deepEqual(keys(restoredFill.edges), filled);
  assert.equal(restoredFill.canRedo, false);
  assert.equal(restoredFill.toggleNode(node.id).removed, true);
  assert.equal(restoredFill.edges.length, 0);
  restoredFill.undo();
  const restoredClear = Puzzle.restore(restoredFill.serialize())!;
  assert.equal(restoredClear.redo(), true);
  assert.equal(restoredClear.edges.length, 0);
  restoredClear.undo();
  assert.deepEqual(keys(restoredClear.edges), filled);
});

test("new moves discard saved redo while version1 saves without redo remain valid", () => {
  const puzzle = new Puzzle(settings);
  puzzle.toggle(...puzzle.solution[0]);
  puzzle.toggle(...puzzle.solution[1]);
  puzzle.undo();
  const save = JSON.parse(JSON.stringify(puzzle.serialize()));
  const restored = Puzzle.restore(save)!;
  assert.equal(restored.toggle(0, 0).changed, false);
  assert.equal(restored.canRedo, true);
  restored.toggle(...puzzle.solution[2]);
  assert.equal(restored.canRedo, false);
  const afterNewMove = Puzzle.restore(restored.serialize())!;
  assert.equal(afterNewMove.redo(), false);
  assert.deepEqual(keys(afterNewMove.edges), keys(restored.edges));
  delete save.redo;
  const legacy = Puzzle.restore(save)!;
  assert.ok(legacy);
  assert.equal(legacy.canRedo, false);
  assert.deepEqual(keys(legacy.edges), keys(puzzle.edges));
  assert.equal(legacy.undo(), true);
  assert.equal(legacy.edges.length, 0);
});

test("restoration rejects malformed redo structure and invalid intermediate replay states", () => {
  const puzzle = new Puzzle(settings);
  const edge = puzzle.solution[0];
  const add = { edge, added: true };
  const remove = { edge, added: false };
  for (const redo of [
    null,
    "bad",
    [null],
    [{ edge, added: "yes" }],
    [{ edge: [0, 2], added: true }],
    [{ edge: [0, 1, 2], added: true }],
    [{ edge: [-1, 0], added: true }],
    [{ edge: [NaN, 1], added: true }],
    [remove],
    [add, add],
    [add, { edge: [...edge].reverse(), added: true }],
    [add, remove, remove],
    Array(2049).fill(add),
  ]) {
    const save = { ...puzzle.serialize(), redo };
    assert.equal(Puzzle.restore(save), null);
  }
  // A replay may be valid overall but still overfill a node along the way.
  for (const solutionEdge of puzzle.solution) puzzle.toggle(...solutionEdge);
  const placed = new Set(keys(puzzle.edges));
  const extra = puzzle.nodes.flatMap(node => puzzle.neighbors(node.id)
    .map(neighbor => [node.id, neighbor] as Edge))
    .find(candidate => !placed.has(edgeKey(...candidate)))!;
  const overfilled = {
    ...puzzle.serialize(),
    redo: [
      { edge: extra, added: true, batch: 1 },
      { edge: extra, added: false, batch: 1 },
    ],
  };
  assert.equal(Puzzle.restore(overfilled), null);
});

test("restoration rejects invalid redo grouping and bounds combined undo and redo", () => {
  const puzzle = new Puzzle(settings);
  const edge = puzzle.solution[0];
  for (const tags of [[0], [-1], [1.5], ["1"], [null], [2, 1], [1, undefined, 1], [1, 2, 1]]) {
    const redo = tags.map((batch, index) => ({ edge, added: index % 2 === 0, batch }));
    assert.equal(Puzzle.restore({ ...puzzle.serialize(), redo }), null);
  }
  for (let i = 0; i < 2048; i++) puzzle.toggle(...edge);
  for (let i = 0; i < 1024; i++) puzzle.undo();
  const save = JSON.parse(JSON.stringify(puzzle.serialize()));
  assert.equal(save.history.length + save.redo.length, 2048);
  const restored = Puzzle.restore(save)!;
  assert.ok(restored);
  for (let i = 0; i < 1024; i++) assert.equal(restored.redo(), true);
  assert.equal(restored.canRedo, false);
  assert.deepEqual(keys(restored.edges), keys(puzzle.edges));
  save.redo.push({ edge, added: true }, { edge, added: false });
  assert.equal(Puzzle.restore(save), null);
});

test("connection groups include isolated sparse cube IDs and ignore edge direction", () => {
  const puzzle = new Puzzle({ size: 5, depth: 5, difficulty: "hard", seed: 42 });
  const ids = puzzle.nodes.map((node) => node.id);
  assert.equal(ids.length, 98);
  assert.ok(!ids.includes(31)); // Interior IDs are omitted from the surface array.
  assert.deepEqual(puzzle.connectionGroups, ids.map((id) => [id]));
  const first = puzzle.solution.find(([a]) => a >= 100)!;
  const second = puzzle.solution.find(([a, b]) => !first.includes(a) && !first.includes(b))!;
  assert.ok(first && second);
  for (const edge of [first, second]) assert.equal(puzzle.toggle(...edge).changed, true);
  puzzle.edges = puzzle.edges.map(([a, b]) => [b, a]);
  const pairs = [first, second].map((edge) => [...edge].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  const joined = new Set([...first, ...second]);
  assert.deepEqual(puzzle.connectionGroups, [
    ...ids.filter((id) => !joined.has(id)).map((id) => [id]), ...pairs,
  ]);
  assert.equal(puzzle.connectionGroups.length, 96);
  assert.deepEqual(puzzle.connectionGroups.flat().sort((a, b) => a - b), ids);
  // Returned diagnostics cannot mutate future results or the board.
  puzzle.connectionGroups[0].push(999);
  assert.ok(!puzzle.connectionGroups.flat().includes(999));
  for (const node of puzzle.nodes) node.required = 0;
  puzzle.edges = [];
  assert.deepEqual(puzzle.connectionGroups, []);
  assert.equal(puzzle.solved, false);
});

test("generated full separate groups survive restore and merge with an undoable swap", () => {
  const puzzle = new Puzzle({ size: 3, depth: 1, difficulty: "hard", seed: 517 });
  const edges: Edge[] = [[0, 1], [0, 3], [1, 2], [1, 4], [2, 5], [3, 4], [5, 8], [6, 7]];
  for (const edge of edges) assert.equal(puzzle.toggle(...edge).changed, true);
  const groups = [[6, 7], [0, 1, 2, 3, 4, 5, 8]];
  assert.deepEqual(puzzle.connectionGroups, groups);
  assert.ok(puzzle.nodes.every((node) => puzzle.remaining(node.id) === 0));
  assert.equal(puzzle.disconnected, true);
  assert.equal(puzzle.solved, false);
  const restored = Puzzle.restore(puzzle.serialize())!;
  assert.deepEqual(restored.connectionGroups, groups);
  restored.beginBatch();
  for (const edge of [[3, 4], [6, 7], [3, 6], [4, 7]] as Edge[])
    assert.equal(restored.toggle(...edge).changed, true);
  restored.endBatch();
  assert.deepEqual(restored.connectionGroups, [[0, 1, 2, 3, 4, 5, 6, 7, 8]]);
  assert.equal(restored.solved, true);
  assert.equal(restored.undo(), true);
  assert.deepEqual(restored.connectionGroups, groups);
  const undone = Puzzle.restore(restored.serialize())!;
  assert.deepEqual(undone.connectionGroups, groups);
  assert.equal(undone.redo(), true);
  assert.equal(undone.solved, true);
  assert.equal(undone.connectionGroups.length, 1);
});

test("victory is based on degrees and connectivity, accepting alternative solutions", () => {
  const puzzle = new Puzzle({ size: 4, depth: 1, difficulty: "hard", seed: 4 });
  // Construct two valid degree-two loops, then join them by a degree-preserving swap.
  for (const node of puzzle.nodes) node.required = 2;
  const disconnected: Edge[] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 7],
    [7, 6],
    [6, 5],
    [5, 4],
    [4, 0],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 15],
    [15, 14],
    [14, 13],
    [13, 12],
    [12, 8],
  ];
  for (const edge of disconnected)
    assert.equal(puzzle.toggle(...edge).changed, true);
  assert.equal(puzzle.progress, 1);
  assert.equal(puzzle.solved, false);
  assert.equal(puzzle.disconnected, true);
  assert.deepEqual(puzzle.connectionGroups, [
    [0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15],
  ]);
  for (const edge of [
    [4, 5],
    [8, 9],
    [4, 8],
    [5, 9],
  ] as Edge[])
    assert.equal(puzzle.toggle(...edge).changed, true);
  assert.equal(puzzle.solved, true);
  assert.equal(puzzle.disconnected, false);
  assert.equal(puzzle.connectionGroups.length, 1);
  assert.notDeepEqual(keys(puzzle.edges), keys(puzzle.solution));
  assert.equal(puzzle.hint().changed, false);
});

test("serialization preserves state and undo without aliasing", () => {
  const puzzle = new Puzzle(settings);
  for (const edge of puzzle.solution.slice(0, 10)) puzzle.toggle(...edge);
  puzzle.toggle(...puzzle.solution[3]);
  const data = JSON.parse(JSON.stringify(puzzle.serialize()));
  const restored = Puzzle.restore(data)!;
  assert.ok(restored);
  assert.deepEqual(restored.serialize(), puzzle.serialize());
  assert.equal(restored.undo(), true);
  assert.equal(puzzle.undo(), true);
  assert.deepEqual(keys(restored.edges), keys(puzzle.edges));
  data.settings.size = 7;
  data.edges[0][0] = -1;
  assert.equal(restored.settings.size, 4);
  assert.ok(restored.edges.every((edge) => edge.every((id) => id >= 0)));
  const withoutHistory = puzzle.serialize() as Record<string, unknown>;
  delete withoutHistory.history;
  assert.ok(Puzzle.restore(withoutHistory));
});

test("corrupt or unbounded saves are rejected", () => {
  const puzzle = new Puzzle(settings);
  const fresh = () => JSON.parse(JSON.stringify(puzzle.serialize()));
  for (const value of [null, undefined, [], "save", 1, {}])
    assert.equal(Puzzle.restore(value), null);
  for (const [key, value] of [
    ["size", 2],
    ["size", 1000000],
    ["size", 4.5],
    ["depth", 3],
    ["difficulty", "extreme"],
    ["seed", -1],
    ["seed", 0x100000000],
    ["seed", Infinity],
  ]) {
    const save = fresh();
    save.settings[key] = value;
    assert.equal(Puzzle.restore(save), null);
  }
  for (const edges of [
    [[0, 0]],
    [[0, 2]],
    [[0, -1]],
    [[0, 1, 2]],
    [
      [0, 1],
      [1, 0],
    ],
    [[NaN, 1]],
    "bad",
  ]) {
    const save = fresh();
    save.edges = edges;
    assert.equal(Puzzle.restore(save), null);
  }
  for (const history of [
    null,
    "bad",
    [{ added: true, edge: [0, 1] }],
    [{ added: "yes", edge: [0, 1] }],
    Array(2049).fill({ added: true, edge: [0, 1] }),
  ]) {
    const save = fresh();
    save.history = history;
    assert.equal(Puzzle.restore(save), null);
  }
  const save = fresh();
  save.version = 2;
  assert.equal(Puzzle.restore(save), null);
  assert.throws(() => new Puzzle({ ...settings, size: 999 }), RangeError);
});

test("double-tap fills every available connection and clears a full node as one action", () => {
  const puzzle = new Puzzle({ size: 3, depth: 1, difficulty: "hard", seed: 4 });
  for (const node of puzzle.nodes)
    node.required = puzzle.neighbors(node.id).length;
  const filled = puzzle.toggleNode(4);
  assert.deepEqual(filled, { changed: true, removed: false, count: 4 });
  assert.equal(puzzle.remaining(4), 0);
  assert.equal(puzzle.edges.length, 4);
  assert.equal(puzzle.undo(), true);
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.canUndo, false);
  assert.equal(puzzle.redo(), true);
  assert.equal(puzzle.edges.length, 4);
  assert.deepEqual(puzzle.toggleNode(4), {
    changed: true,
    removed: true,
    count: 4,
  });
  assert.equal(puzzle.edges.length, 0);
  puzzle.undo();
  assert.equal(puzzle.edges.length, 4);
  puzzle.redo();
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.toggleNode(-1).changed, false);
});

test("node fill respects blocked neighbors, existing links, and deterministic constraints", () => {
  const puzzle = new Puzzle({ size: 3, depth: 1, difficulty: "hard", seed: 4 });
  for (const node of puzzle.nodes) node.required = 1;
  puzzle.nodes.find((node) => node.id === 4)!.required = 4;
  for (const edge of [
    [0, 1],
    [2, 5],
    [6, 3],
    [8, 7],
  ] as Edge[])
    puzzle.toggle(...edge);
  assert.equal(puzzle.toggleNode(4).changed, false);
  assert.equal(puzzle.remaining(4), 4);
  puzzle.toggle(0, 1);
  assert.deepEqual(puzzle.toggleNode(4), {
    changed: true,
    removed: false,
    count: 1,
  });
  assert.equal(puzzle.remaining(4), 3);
  assert.equal(puzzle.toggleNode(4).changed, false);
  assert.equal(new Set(keys(puzzle.edges)).size, puzzle.edges.length);
  assert.ok(puzzle.nodes.every((node) => puzzle.remaining(node.id) >= 0));
  const other = new Puzzle({ size: 3, depth: 1, difficulty: "hard", seed: 4 });
  for (const node of other.nodes) node.required = 1;
  other.nodes.find((node) => node.id === 5)!.required = 3;
  other.toggleNode(4);
  // Node 5 needs all three choices, while the other neighbors have spare choices.
  assert.deepEqual(other.edges, [[4, 5]]);
});

test("a mixed drag batch and nested batches undo and redo atomically", () => {
  const puzzle = new Puzzle(settings);
  const [first, second, third] = puzzle.solution;
  puzzle.toggle(...first);
  puzzle.beginBatch();
  puzzle.toggle(...first);
  puzzle.toggle(...second);
  puzzle.beginBatch();
  puzzle.toggle(...third);
  puzzle.endBatch();
  puzzle.endBatch();
  const after = keys(puzzle.edges);
  puzzle.undo();
  assert.deepEqual(keys(puzzle.edges), [edgeKey(...first)]);
  puzzle.redo();
  assert.deepEqual(keys(puzzle.edges), after);
  puzzle.undo();
  puzzle.beginBatch();
  puzzle.endBatch();
  assert.equal(puzzle.canRedo, true);
  puzzle.undo();
  assert.equal(puzzle.edges.length, 0);
  puzzle.redo();
  assert.deepEqual(keys(puzzle.edges), [edgeKey(...first)]);
  puzzle.redo();
  assert.deepEqual(keys(puzzle.edges), after);
});

test("add-only strokes can skip crossed existing links and include node fills in their outer batch", () => {
  const puzzle = new Puzzle(settings);
  puzzle.beginBatch();
  for (const edge of [
    ...puzzle.solution.slice(0, 6),
    ...puzzle.solution.slice(0, 6),
  ]) {
    if (!puzzle.edges.some((placed) => edgeKey(...placed) === edgeKey(...edge)))
      puzzle.toggle(...edge);
  }
  puzzle.toggleNode(puzzle.solution[7][0]);
  puzzle.endBatch();
  const after = keys(puzzle.edges);
  assert.equal(new Set(after).size, after.length);
  puzzle.undo();
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.canUndo, false);
  puzzle.redo();
  assert.deepEqual(keys(puzzle.edges), after);
});

test("version1 saves preserve grouped history while legacy moves remain independent", () => {
  const puzzle = new Puzzle(settings);
  puzzle.toggle(...puzzle.solution[0]);
  puzzle.beginBatch();
  for (const edge of puzzle.solution.slice(1, 5)) puzzle.toggle(...edge);
  // Saving an in-progress stroke snapshots it as one completed undo group.
  const save = JSON.parse(JSON.stringify(puzzle.serialize()));
  puzzle.endBatch();
  const restored = Puzzle.restore(save)!;
  assert.ok(restored);
  assert.deepEqual(restored.serialize(), puzzle.serialize());
  restored.undo();
  assert.deepEqual(keys(restored.edges), [edgeKey(...puzzle.solution[0])]);
  restored.redo();
  assert.deepEqual(keys(restored.edges), keys(puzzle.edges));
  for (const move of save.history) delete move.batch;
  const legacy = Puzzle.restore(save)!;
  legacy.undo();
  assert.equal(legacy.edges.length, 4);
  legacy.undo();
  assert.equal(legacy.edges.length, 3);
});

test("restore rejects invalid, reused, or unordered batch identifiers", () => {
  const puzzle = new Puzzle(settings);
  for (const edge of puzzle.solution.slice(0, 4)) puzzle.toggle(...edge);
  for (const tags of [
    [0],
    [-1],
    [1.5],
    [Number.MAX_SAFE_INTEGER + 1],
    ["1"],
    [null],
    [2, 1],
    [1, undefined, 1],
    [1, 2, 1],
  ]) {
    const save = JSON.parse(JSON.stringify(puzzle.serialize()));
    tags.forEach((batch, index) => {
      save.history[index].batch = batch;
    });
    assert.equal(Puzzle.restore(save), null);
  }
  const save = JSON.parse(JSON.stringify(puzzle.serialize()));
  save.history[0].batch = Number.MAX_SAFE_INTEGER;
  const restored = Puzzle.restore(save)!;
  assert.ok(restored);
  restored.beginBatch();
  restored.toggle(...puzzle.solution[4]);
  restored.toggle(...puzzle.solution[5]);
  restored.endBatch();
  assert.ok(Puzzle.restore(restored.serialize()));
});

test("history is bounded without splitting batches, and reset closes an active batch", () => {
  const puzzle = new Puzzle(settings);
  puzzle.toggle(...puzzle.solution[0]);
  puzzle.beginBatch();
  for (let i = 0; i < 2048; i++)
    assert.equal(puzzle.toggle(...puzzle.solution[1]).changed, true);
  assert.equal(puzzle.toggle(...puzzle.solution[1]).changed, false);
  puzzle.endBatch();
  const save = JSON.parse(JSON.stringify(puzzle.serialize()));
  assert.equal(save.history.length, 2048);
  assert.ok(Puzzle.restore(save));
  puzzle.undo();
  assert.deepEqual(keys(puzzle.edges), [edgeKey(...puzzle.solution[0])]);
  assert.equal(puzzle.canUndo, false);
  assert.equal(puzzle.redo(), true);
  puzzle.beginBatch();
  puzzle.reset();
  puzzle.toggle(...puzzle.solution[0]);
  puzzle.toggle(...puzzle.solution[1]);
  puzzle.undo();
  assert.equal(puzzle.edges.length, 1);
});

test("checkpoint restores a full node before a replacement double-tap and preserves undo", () => {
  const puzzle = new Puzzle(settings);
  for (const edge of puzzle.solution) puzzle.toggle(...edge);
  const before = puzzle.serialize();
  const edge = puzzle.solution[0];
  const restore = puzzle.checkpoint();
  puzzle.toggle(...edge);
  assert.equal(puzzle.remaining(edge[0]), 1);
  assert.equal(puzzle.solved, false);
  restore();
  assert.deepEqual(puzzle.serialize(), before);
  assert.equal(puzzle.solved, true);
  const cleared = puzzle.toggleNode(edge[0]);
  assert.equal(cleared.removed, true);
  assert.equal(cleared.count, puzzle.nodes.find((node) => node.id === edge[0])!.required);
  puzzle.undo();
  assert.equal(puzzle.solved, true);
  puzzle.undo();
  assert.equal(puzzle.edges.length, puzzle.solution.length - 1);
});

test("checkpoint restores redo cleared by a first click and remains independent of later edits", () => {
  const puzzle = new Puzzle(settings);
  puzzle.toggle(...puzzle.solution[0]);
  puzzle.toggle(...puzzle.solution[1]);
  puzzle.undo();
  const before = puzzle.serialize();
  const restore = puzzle.checkpoint();
  puzzle.toggle(...puzzle.solution[2]);
  assert.equal(puzzle.canRedo, false);
  restore();
  assert.deepEqual(puzzle.serialize(), before);
  assert.equal(puzzle.canRedo, true);
  puzzle.redo();
  assert.deepEqual(keys(puzzle.edges), keys(puzzle.solution.slice(0, 2)));
  puzzle.toggle(...puzzle.solution[3]);
  restore();
  assert.deepEqual(puzzle.serialize(), before);
  assert.equal(puzzle.canRedo, true);
});

test("checkpoint recovers the oldest undo action trimmed by an immediate click", () => {
  const puzzle = new Puzzle(settings);
  for (let i = 0; i < 2048; i++) puzzle.toggle(...puzzle.solution[0]);
  const before = puzzle.serialize();
  const restore = puzzle.checkpoint();
  puzzle.toggle(...puzzle.solution[1]);
  restore();
  assert.deepEqual(puzzle.serialize(), before);
  for (let i = 0; i < 2048; i++) assert.equal(puzzle.undo(), true);
  assert.equal(puzzle.canUndo, false);
  assert.equal(puzzle.edges.length, 0);
});

test("checkpoint restores active nested batch ownership and empty batches", () => {
  const puzzle = new Puzzle(settings);
  puzzle.toggle(...puzzle.solution[0]);
  puzzle.beginBatch();
  puzzle.beginBatch();
  puzzle.toggle(...puzzle.solution[1]);
  const restore = puzzle.checkpoint();
  puzzle.toggle(...puzzle.solution[2]);
  puzzle.endBatch();
  puzzle.endBatch();
  restore();
  puzzle.toggle(...puzzle.solution[3]);
  puzzle.endBatch();
  puzzle.toggle(...puzzle.solution[4]);
  puzzle.endBatch();
  puzzle.undo();
  assert.deepEqual(keys(puzzle.edges), [edgeKey(...puzzle.solution[0])]);
  puzzle.redo();
  assert.deepEqual(keys(puzzle.edges), keys([0, 1, 3, 4].map((index) => puzzle.solution[index])));
  puzzle.reset();
  puzzle.beginBatch();
  const restoreEmpty = puzzle.checkpoint();
  puzzle.toggle(...puzzle.solution[0]);
  restoreEmpty();
  puzzle.toggle(...puzzle.solution[1]);
  puzzle.toggle(...puzzle.solution[2]);
  puzzle.endBatch();
  puzzle.undo();
  assert.equal(puzzle.edges.length, 0);
  assert.equal(puzzle.canUndo, false);
});
