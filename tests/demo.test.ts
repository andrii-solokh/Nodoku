import assert from "node:assert/strict";
import test from "node:test";
import { melodyStepMs } from "../src/melodies.ts";
import { HomeDemo, type DemoScene } from "../src/demo.ts";
import { getConfig, type GameConfig } from "../src/config.ts";
import { edgeKey, Puzzle, type Difficulty, type Edge, type PuzzleSettings } from "../src/puzzle.ts";

const settings: PuzzleSettings = { size: 3, depth: 3, difficulty: "medium", seed: 9 };
// The state-machine assertions use fixed timings, independent of GUI tuning.
const demoTiming: GameConfig["demo"] = {
  timingMode: "fixed",
  tempoBpm: 96,
  initialDelayMs: 900,
  stepDelayMs: 950,
  revealDelayMs: 240,
  completeHoldMs: 3200,
  restartDelayMs: 1100,
  interactionPauseMs: 1800,
  resumeDelayMs: 600,
};

class FakeScene implements DemoScene {
  puzzle: Puzzle | null = null;
  animating = false;
  growing = false;
  reshaping = false;
  interacting = false;
  revision = 0;
  focused: Edge[] = [];
  previews: Puzzle[] = [];
  refreshes: { puzzle: Puzzle; edges: Edge[]; solved: boolean }[] = [];

  setPuzzle(puzzle: Puzzle, preview: boolean, animateShape = false): void {
    assert.equal(preview, true);
    this.puzzle = puzzle;
    this.previews.push(puzzle);
    this.animating = false;
    this.growing = false;
    this.reshaping = animateShape;
  }
  focusConnection(a: number, b: number): void {
    assert.ok(this.puzzle);
    assert.equal(this.puzzle.edges.some((edge) => edgeKey(...edge) === edgeKey(a, b)), false,
      "The camera is asked to face an edge before that edge appears");
    this.focused.push([a, b]);
    this.animating = true;
  }
  refresh(): void {
    assert.ok(this.puzzle);
    const previous = this.refreshes.at(-1);
    const count = previous?.puzzle === this.puzzle ? previous.edges.length : 0;
    if (this.puzzle.edges.length !== count) this.growing = this.puzzle.edges.length > count;
    this.refreshes.push({ puzzle: this.puzzle, edges: this.puzzle.edges.map((edge) => [...edge]), solved: this.puzzle.solved });
  }
  get hasAnimations(): boolean { return this.animating || this.growing || this.reshaping; }
  getShapeTransitionState(): unknown { return this.reshaping ? {} : null; }
  getViewState(): { animating: boolean } { return { animating: this.animating }; }
  isInteracting(): boolean { return this.interacting; }
  getInteractionRevision(): number { return this.revision; }
}

function setup(nextSettings = settings) {
  const scene = new FakeScene();
  const demo = new HomeDemo(scene);
  demo.setConfig({ ...getConfig(), demo: demoTiming });
  demo.start(nextSettings);
  return { scene, demo };
}

function revealNext(demo: HomeDemo, scene: FakeScene): void {
  scene.growing = false;
  scene.animating = false;
  assert.equal(demo.getState()!.phase, "waiting");
  demo.advanceTime(Math.max(1, demo.getState()!.delayMs));
}

function settleCompletion(demo: HomeDemo, scene: FakeScene): void {
  scene.growing = false;
  scene.animating = false;
  demo.advanceTime(1);
}

test("each due step starts the camera, connection and sound together without a reveal delay", () => {
  const scene = new FakeScene();
  const sounds: string[] = [];
  const demo = new HomeDemo(scene, sound => {
    assert.equal(scene.animating, true, "Connection sound occurs during the camera turn");
    assert.equal(scene.refreshes.at(-1)!.edges.length, 1, "Visible connection is refreshed before its sound");
    sounds.push(sound);
  });
  demo.setConfig({ ...getConfig(), demo: { ...demoTiming, revealDelayMs: 5000 } });
  demo.start(settings);
  const first = [...demo.getState()!.nextEdge!] as Edge;
  demo.advanceTime(899);
  assert.equal(scene.focused.length, 0);
  assert.equal(demo.puzzle!.edges.length, 0);
  demo.advanceTime(1);
  assert.deepEqual(scene.focused, [first]);
  assert.deepEqual(demo.puzzle!.edges, [first]);
  assert.deepEqual(sounds, ["connect"]);
  assert.equal(scene.growing, true);
  assert.equal(demo.getState()!.phase, "waiting");
  assert.equal(demo.getState()!.delayMs, 950);
  const waiting = demo.getState();
  demo.advanceTime(60000);
  assert.deepEqual(demo.getState(), waiting, "Current turn and growth finish before the next step timer runs");
});

test("an existing camera animation holds the initial delay without drawing or sounding", () => {
  const { scene, demo } = setup();
  scene.animating = true;
  demo.advanceTime(60000);
  assert.equal(demo.puzzle!.edges.length, 0);
  assert.equal(demo.getState()!.delayMs, 900);
  scene.animating = false;
  demo.advanceTime(899);
  assert.equal(demo.puzzle!.edges.length, 0);
  demo.advanceTime(1);
  assert.equal(demo.puzzle!.edges.length, 1);
  assert.equal(scene.animating, true);
});

test("pause freezes playback and resuming advances to the next edge after its delay", () => {
  const { scene, demo } = setup();
  revealNext(demo, scene);
  demo.togglePaused();
  const paused = demo.getState();
  scene.animating = false;
  scene.growing = false;
  demo.advanceTime(50000);
  assert.deepEqual(demo.getState(), paused);
  assert.equal(demo.puzzle!.edges.length, 1);
  demo.togglePaused();
  demo.advanceTime(599);
  assert.equal(scene.focused.length, 1);
  demo.advanceTime(1);
  assert.equal(scene.focused.length, 2);
  assert.notDeepEqual(scene.focused[0], scene.focused[1]);
  assert.equal(demo.puzzle!.edges.length, 2);
});

test("manual interaction preserves the in-progress edge and holds the next step until release", () => {
  const { scene, demo } = setup();
  revealNext(demo, scene);
  scene.revision++;
  scene.interacting = true;
  demo.advanceTime(1000);
  assert.equal(demo.getState()!.phase, "waiting");
  assert.equal(demo.getState()!.delayMs, 1800);
  demo.advanceTime(10000);
  assert.equal(demo.getState()!.delayMs, 1800);
  assert.equal(demo.puzzle!.edges.length, 1);
  scene.interacting = false;
  scene.animating = false;
  scene.growing = false;
  demo.advanceTime(1799);
  assert.equal(scene.focused.length, 1);
  demo.advanceTime(1);
  assert.equal(scene.focused.length, 2);
  assert.notDeepEqual(scene.focused[0], scene.focused[1]);
  assert.equal(demo.puzzle!.edges.length, 2);
});

test("suspension freezes initial and subsequent waits without consuming their timers", () => {
  const { scene, demo } = setup();
  for (const expectedCount of [0, 1]) {
    const before = demo.getState();
    demo.advanceTime(99999, true);
    assert.deepEqual(demo.getState(), before);
    assert.equal(demo.puzzle!.edges.length, expectedCount);
    revealNext(demo, scene);
  }
  assert.equal(demo.puzzle!.edges.length, 2);
});

test("settings replacement and stop prevent stale animations from changing old puzzles", () => {
  for (const settled of [false, true]) {
    const { scene, demo } = setup();
    revealNext(demo, scene);
    if (settled) { scene.animating = false; scene.growing = false; }
    const oldPuzzle = demo.puzzle!;
    demo.start({ size: 5, depth: 1, difficulty: "hard", seed: 90 });
    const next = demo.puzzle!;
    assert.notEqual(next, oldPuzzle);
    assert.deepEqual(next.settings, { size: 5, depth: 1, difficulty: "hard", seed: 43 });
    assert.equal(demo.getState()!.phase, "waiting");
    assert.equal(demo.getState()!.delayMs, 900);
    revealNext(demo, scene);
    assert.equal(next.edges.length, 1);
    assert.equal(oldPuzzle.edges.length, 1);
    demo.stop();
    const refreshes = scene.refreshes.length;
    const focused = scene.focused.length;
    scene.animating = false;
    scene.growing = false;
    for (let i = 0; i < 10; i++) demo.advanceTime(10000);
    assert.equal(demo.puzzle, null);
    assert.equal(demo.getState(), null);
    assert.equal(next.edges.length, 1);
    assert.equal(oldPuzzle.edges.length, 1);
    assert.equal(scene.refreshes.length, refreshes);
    assert.equal(scene.focused.length, focused);
  }
});

test("every size, shape, and difficulty completes legally, holds the solved network, and resets", () => {
  for (let size = 3; size <= 7; size++) {
    for (const depth of [1, size]) {
      for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
        const { scene, demo } = setup({ size, depth, difficulty, seed: 0 });
        const puzzle = demo.puzzle!;
        const count = puzzle.solution.length;
        for (let index = 0; index < count; index++) {
          revealNext(demo, scene);
          assert.equal(puzzle.edges.length, index + 1);
          assert.equal(demo.getState()!.connected, index + 1);
          assert.ok(puzzle.nodes.every((node) => puzzle.remaining(node.id) >= 0));
          const edge = puzzle.edges[index];
          assert.ok(puzzle.neighbors(edge[0]).includes(edge[1]));
        }
        assert.equal(puzzle.solved, true);
        assert.equal(puzzle.progress, 1);
        assert.equal(demo.getState()!.phase, "complete");
        assert.equal(demo.getState()!.nextEdge, null);
        assert.deepEqual(scene.focused, puzzle.solution);
        assert.equal(scene.refreshes.at(-1)!.solved, true);
        settleCompletion(demo, scene);
        demo.advanceTime(3199);
        assert.equal(puzzle.solved, true);
        demo.advanceTime(1);
        assert.equal(demo.puzzle, puzzle);
        assert.equal(puzzle.edges.length, 0);
        assert.equal(puzzle.canUndo, false);
        assert.equal(puzzle.canRedo, false);
        assert.equal(demo.getState()!.phase, "waiting");
        assert.equal(demo.getState()!.delayMs, 1100);
        revealNext(demo, scene);
        assert.deepEqual(puzzle.edges, [puzzle.solution[0]]);
      }
    }
  }
});

test("rod growth holds the next-turn timer until the visual connection finishes", () => {
  const { scene, demo } = setup();
  revealNext(demo, scene);
  const waiting = demo.getState();
  assert.equal(scene.growing, true);
  scene.animating = false;
  demo.advanceTime(50000);
  assert.deepEqual(demo.getState(), waiting, "an idle camera does not let the timer run through active rod growth");
  assert.equal(scene.focused.length, 1);
  scene.growing = false;
  demo.advanceTime(waiting!.delayMs - 1);
  assert.equal(scene.focused.length, 1);
  demo.advanceTime(1);
  assert.equal(scene.focused.length, 2);
  assert.equal(demo.getState()!.phase, "waiting");
});

test("animated shape and size changes hold auto-solve until they settle", () => {
  const { scene, demo } = setup();
  assert.equal(scene.reshaping, false, "initial preview is ready immediately");
  demo.start({ ...settings, depth: 1 }, true);
  assert.equal(scene.reshaping, true);
  const before = demo.getState();
  demo.advanceTime(10000);
  assert.deepEqual(demo.getState(), before);
  assert.equal(scene.focused.length, 0);
  assert.equal(demo.puzzle!.edges.length, 0);
  scene.reshaping = false;
  demo.advanceTime(before!.delayMs);
  assert.equal(scene.focused.length, 1);
  assert.equal(demo.getState()!.phase, "waiting");
  demo.start(settings, true);
  assert.equal(scene.reshaping, true);
  demo.start({ ...settings, size: 4, depth: 4 }, true);
  const resized = demo.getState();
  demo.advanceTime(10000);
  assert.equal(scene.reshaping, true, "a grid-size change also waits for the preview animation");
  assert.deepEqual(demo.getState(), resized);
  assert.equal(demo.puzzle!.settings.size, 4);
  demo.start({ ...settings, size: 4, depth: 4, difficulty: "hard" });
  assert.equal(scene.reshaping, false, "changing difficulty replaces the animated preview immediately");
  assert.equal(demo.getState()!.phase, "waiting");
  assert.equal(demo.puzzle!.edges.length, 0);
});

test("the completed-network hold starts after the final rod finishes growing", () => {
  const { scene, demo } = setup();
  while (!demo.puzzle!.solved) revealNext(demo, scene);
  const complete = demo.getState();
  assert.equal(scene.growing, true);
  demo.advanceTime(100000);
  assert.deepEqual(demo.getState(), complete);
  assert.equal(demo.puzzle!.solved, true);
  settleCompletion(demo, scene);
  demo.advanceTime(complete!.delayMs);
  assert.equal(demo.puzzle!.edges.length, 0);
  assert.equal(demo.getState()!.phase, "waiting");
});

test("invalid or nonpositive time steps cannot advance playback", () => {
  const { scene, demo } = setup();
  const before = demo.getState();
  for (const ms of [NaN, Infinity, -Infinity, -1, 0]) demo.advanceTime(ms);
  assert.deepEqual(demo.getState(), before);
  assert.equal(scene.focused.length, 0);
  assert.equal(scene.refreshes.length, 0);
});

test("demo camera turns stay silent while connections and final completion sound once per cycle", () => {
  const scene = new FakeScene();
  const sounds: string[] = [];
  const demo = new HomeDemo(scene, sound => sounds.push(sound));
  demo.setConfig({ ...getConfig(), demo: demoTiming });
  demo.start({ size: 3, depth: 1, difficulty: 'hard', seed: 0 });
  for (let cycle = 0; cycle < 2; cycle++) {
    const from = sounds.length;
    while (!demo.puzzle!.solved) revealNext(demo, scene);
    const total = demo.puzzle!.solution.length;
    assert.deepEqual(sounds.slice(from), Array.from({ length: total }, () => 'connect'));
    assert.ok(scene.focused.length >= total, "Silent camera turns still reveal every connection");
    assert.equal(scene.growing, true);
    demo.advanceTime(10000);
    assert.equal(sounds.filter(sound => sound === 'complete').length, cycle);
    settleCompletion(demo, scene);
    assert.equal(sounds.filter(sound => sound === 'complete').length, cycle + 1);
    demo.advanceTime(1000);
    assert.equal(sounds.filter(sound => sound === 'complete').length, cycle + 1, 'Holding a solved preview does not repeat its celebration');
    demo.advanceTime(demo.getState()!.delayMs);
    assert.equal(demo.puzzle!.edges.length, 0);
  }
});

test("stationary focus is silent and paused, suspended, interrupted, or replaced completion has no stale chime", () => {
  for (const interrupt of ['pause', 'suspend', 'interaction', 'replace', 'stop', 'silence']) {
    const scene = new FakeScene();
    const sounds: string[] = [];
    const demo = new HomeDemo(scene, sound => sounds.push(sound));
    demo.setConfig({ ...getConfig(), demo: demoTiming });
    demo.start({ size: 3, depth: 1, difficulty: 'hard', seed: 0 });
    while (!demo.puzzle!.solved) revealNext(demo, scene);
    if (interrupt === 'pause') { demo.togglePaused(); demo.advanceTime(10000); demo.togglePaused(); }
    if (interrupt === 'suspend') demo.advanceTime(10000, true);
    if (interrupt === 'interaction') { scene.revision++; demo.advanceTime(1); }
    if (interrupt === 'replace') demo.start(settings);
    if (interrupt === 'stop') demo.stop();
    if (interrupt === 'silence') demo.cancelPendingSound();
    settleCompletion(demo, scene);
    assert.equal(sounds.includes('complete'), false, `${interrupt} drops a completion whose animation was interrupted`);
  }
  const scene = new FakeScene();
  scene.focusConnection = (a, b) => { scene.focused.push([a, b]); };
  const sounds: string[] = [];
  const demo = new HomeDemo(scene, sound => sounds.push(sound));
  demo.setConfig({ ...getConfig(), demo: demoTiming });
  demo.start(settings);
  demo.advanceTime(900);
  assert.deepEqual(sounds, ['connect'], 'Already-visible connections sound immediately without a rotation sound');
});

test("completion holds for the configured pause or the full emitted sound, whichever is longer", () => {
  for (const duration of [0, 1200, 5200, NaN, Infinity, -1]) {
    const scene = new FakeScene();
    let emitted = 0;
    const demo = new HomeDemo(scene, kind => { if (kind === 'complete') emitted++; }, () => {
      assert.equal(emitted, 1, 'Read sound duration after the completion callback schedules it');
      return duration;
    });
    demo.setConfig({ ...getConfig(), demo: demoTiming });
    demo.start({ size: 3, depth: 1, difficulty: 'hard', seed: 0 });
    while (!demo.puzzle!.solved) revealNext(demo, scene);
    demo.advanceTime(99999);
    assert.equal(emitted, 0, 'Final visuals must finish before the chime');
    scene.animating = false;
    scene.growing = false;
    demo.advanceTime(99999);
    const hold = Number.isFinite(duration) ? Math.max(3200, duration) : 3200;
    assert.equal(demo.getState()!.delayMs, hold, 'Elapsed emission tick cannot consume the newly started chime');
    assert.equal(emitted, 1);
    demo.advanceTime(hold - 1);
    assert.equal(demo.puzzle!.solved, true);
    demo.advanceTime(1);
    assert.equal(demo.puzzle!.edges.length, 0);
    assert.equal(demo.getState()!.delayMs, 1100);
    assert.equal(emitted, 1);
  }
});

test("live step timing keeps elapsed progress and changing the legacy reveal delay has no effect", () => {
  const { scene, demo } = setup();
  demo.advanceTime(450);
  demo.setConfig({ ...getConfig(), demo: { ...demoTiming, initialDelayMs: 1000, revealDelayMs: 5000 } });
  assert.equal(demo.getState()!.delayMs, 500);
  demo.advanceTime(499);
  assert.equal(demo.puzzle!.edges.length, 0);
  demo.advanceTime(1);
  assert.equal(demo.puzzle!.edges.length, 1);
  assert.equal(scene.animating, true);
  scene.animating = false;
  scene.growing = false;
  demo.advanceTime(475);
  demo.setConfig({ ...getConfig(), demo: { ...demoTiming, stepDelayMs: 400, revealDelayMs: 0 } });
  assert.equal(demo.getState()!.delayMs, 200);
  demo.advanceTime(200);
  assert.equal(demo.puzzle!.edges.length, 2);
});

test("unrelated live config edits preserve the remaining extended completion hold", () => {
  const scene = new FakeScene();
  let completions = 0;
  const demo = new HomeDemo(scene, kind => { if (kind === 'complete') completions++; }, () => 20000);
  demo.setConfig({ ...getConfig(), demo: demoTiming });
  demo.start({ size: 3, depth: 1, difficulty: 'hard', seed: 0 });
  while (!demo.puzzle!.solved) revealNext(demo, scene);
  settleCompletion(demo, scene);
  demo.advanceTime(5000);
  assert.equal(demo.getState()!.delayMs, 15000);
  const config = getConfig();
  demo.setConfig({ ...config, scene: { ...config.scene, nodeColor: '#abcdef' }, demo: { ...demoTiming, stepDelayMs: 500 } });
  assert.equal(demo.getState()!.delayMs, 15000);
  demo.advanceTime(14999);
  assert.equal(demo.puzzle!.solved, true);
  demo.advanceTime(1);
  assert.equal(demo.puzzle!.edges.length, 0);
  assert.equal(completions, 1);
});


function rhythmDemo(melody: "odeToJoy" | "furElise" | "classic" = "odeToJoy") {
  const scene = new FakeScene();
  const sounds: string[] = [];
  const demo = new HomeDemo(scene, kind => sounds.push(kind), () => 8000);
  const config: GameConfig = { ...getConfig(), demo: { ...demoTiming, timingMode: "melody", tempoBpm: 120 } };
  config.sound.connectionMelody = melody;
  demo.setConfig(config);
  demo.start(settings);
  demo.advanceTime(900);
  return { scene, demo, sounds, config };
}

test("score rhythm drives short, long and dotted intervals while visual animations continue", () => {
  const { scene, demo, sounds } = rhythmDemo();
  assert.equal(demo.puzzle!.edges.length, 1);
  assert.equal(scene.hasAnimations, true);
  demo.advanceTime(499);
  assert.equal(demo.puzzle!.edges.length, 1);
  demo.advanceTime(1);
  assert.equal(demo.puzzle!.edges.length, 2, "Camera and rod duration cannot postpone a beat");
  while (demo.getState()!.connected < 13) demo.advanceTime(demo.getState()!.delayMs);
  assert.equal(demo.getState()!.delayMs, 750, "The phrase's dotted quarter is held for 1.5 beats");
  demo.advanceTime(750);
  assert.equal(demo.getState()!.delayMs, 250, "The following eighth note is half a beat");
  demo.advanceTime(250);
  assert.equal(demo.getState()!.delayMs, 1000, "The phrase ends with a two-beat note");
  assert.equal(sounds.length, demo.getState()!.connected);
});

test("rhythm carries frame remainder without accumulating drift or catching up in a burst", () => {
  const { demo } = rhythmDemo();
  for (let i = 0; i < 4; i++) demo.advanceTime(128);
  assert.equal(demo.getState()!.connected, 2);
  assert.equal(demo.getState()!.delayMs, 488);
  demo.advanceTime(488);
  assert.equal(demo.getState()!.connected, 3);
  assert.equal(demo.getState()!.delayMs, 500);
  demo.advanceTime(60000);
  assert.equal(demo.getState()!.connected, 4, "A stalled frame emits at most one current connection");
  assert.equal(demo.getState()!.delayMs, 500);
});

test("tempo edits retain beat progress and shape transitions still suspend rhythmic drawing", () => {
  const { scene, demo, config } = rhythmDemo("furElise");
  assert.equal(demo.getState()!.delayMs, 125);
  demo.advanceTime(50);
  demo.setConfig({ ...config, demo: { ...config.demo, tempoBpm: 60 } });
  assert.equal(demo.getState()!.delayMs, 150);
  scene.reshaping = true;
  demo.advanceTime(5000);
  assert.equal(demo.getState()!.delayMs, 150);
  assert.equal(demo.getState()!.connected, 1);
  scene.reshaping = false;
  demo.advanceTime(150);
  assert.equal(demo.getState()!.connected, 2);
  assert.equal(demo.getState()!.delayMs, 250);
});

test("rhythmic completion begins on the next scored onset and still holds the finished board", () => {
  const { scene, demo, sounds } = rhythmDemo("furElise");
  while (!demo.puzzle!.solved) demo.advanceTime(demo.getState()!.delayMs);
  const finalInterval = melodyStepMs("furElise", demo.getState()!.connected - 1, 120);
  assert.equal(sounds.includes("complete"), false);
  demo.advanceTime(finalInterval - 1);
  assert.equal(sounds.includes("complete"), false);
  demo.advanceTime(1);
  assert.equal(sounds.at(-1), "complete", "The melody continues even while the last rod still grows");
  assert.equal(demo.getState()!.delayMs, 8000);
  scene.animating = false;
  scene.growing = false;
  demo.advanceTime(7999);
  assert.equal(demo.puzzle!.solved, true);
  demo.advanceTime(1);
  assert.equal(demo.getState()!.connected, 0);
});

test("Classic falls back to fixed delay and changing modes keeps the current wait fraction", () => {
  const { scene, demo } = rhythmDemo("classic");
  demo.advanceTime(5000);
  assert.equal(demo.getState()!.connected, 1);
  assert.equal(demo.getState()!.delayMs, 950);
  scene.animating = false;
  scene.growing = false;
  demo.advanceTime(950);
  assert.equal(demo.getState()!.connected, 2);
  const melodic = rhythmDemo();
  melodic.demo.advanceTime(250);
  melodic.demo.setConfig({ ...melodic.config, demo: { ...melodic.config.demo, timingMode: "fixed" } });
  assert.equal(melodic.demo.getState()!.delayMs, 475);
  melodic.demo.advanceTime(475);
  assert.equal(melodic.demo.getState()!.connected, 1, "Fixed mode resumes waiting for animations");
});
