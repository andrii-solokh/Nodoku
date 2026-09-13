import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { FILL_NOTE_INTERVAL_MS, GameAudio } from "../src/sound.ts";
import { MELODIES, melodyCompletionCount, melodyNote, melodyStepMs, midiToFrequency, type MelodyName } from "../src/melodies.ts";

class Parameter {
  value = 0;
  events: { value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { return this.setValueAtTime(value, time); }
  exponentialRampToValueAtTime(value: number, time: number) { return this.setValueAtTime(value, time); }
  cancelScheduledValues() { return this; }
}
class AudioNodeMock {
  connect() {}
  disconnect() {}
}
class Source extends AudioNodeMock {
  buffer?: unknown;
  frequency = new Parameter();
  startTime = 0;
  stopTimes: number[] = [];
  onended: (() => void) | null = null;
  ended = false;
  type = "sine";
  start(time: number) { this.startTime = time; }
  stop(time: number) { this.stopTimes.push(time); }
}
class Context extends EventTarget {
  static instances: Context[] = [];
  static resumeResult?: Promise<void>;
  static initialState: "running" | "suspended" = "running";
  currentTime = 0;
  state: "running" | "suspended" | "closed" = Context.initialState;
  sampleRate = 48000;
  destination = new AudioNodeMock();
  oscillators: Source[] = [];
  sources: Source[] = [];
  failOscillator = false;
  decodeInputs: ArrayBuffer[] = [];
  decodedBuffer = { duration: .25 };
  decodeResult?: Promise<{ duration: number }>;
  failDecode = false;
  constructor() { super(); Context.instances.push(this); }
  createGain() { return Object.assign(new AudioNodeMock(), { gain: new Parameter() }); }
  createOscillator() {
    if (this.failOscillator) throw new Error("Device unavailable");
    const source = new Source(); this.oscillators.push(source); this.sources.push(source); return source;
  }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  decodeAudioData(bytes: ArrayBuffer) {
    this.decodeInputs.push(bytes);
    if (this.failDecode) throw new Error("Decoder unavailable");
    return this.decodeResult ?? Promise.resolve(this.decodedBuffer);
  }
  resume() {
    const pending = Context.resumeResult;
    if (pending) return pending.then(() => { this.state = "running"; this.dispatchEvent(new Event("statechange")); });
    this.state = "running"; this.dispatchEvent(new Event("statechange")); return Promise.resolve();
  }
  close() { this.state = "closed"; this.dispatchEvent(new Event("statechange")); return Promise.resolve(); }
  suspend() { this.state = "suspended"; this.dispatchEvent(new Event("statechange")); }
  advance(seconds: number) {
    this.currentTime += seconds;
    for (const source of this.sources) if (!source.ended && source.stopTimes.at(-1)! <= this.currentTime) {
      source.ended = true; source.onended?.();
    }
  }
}
const config = {
  connectionMelody: "odeToJoy" as const, noteDurationMs: 320, melodyVolume: .7,
  completionSound: true, completionNoteIntervalMs: 240,
};
function setup(t: TestContext, rotationSampleUrl?: string, initialState: "running" | "suspended" = "running") {
  const oldWindow = globalThis.window;
  Context.instances = [];
  Context.resumeResult = undefined;
  Context.initialState = initialState;
  Object.assign(globalThis, { window: { AudioContext: Context } });
  const audio = new GameAudio(rotationSampleUrl);
  audio.setConfig(config);
  audio.setEnabled(true);
  t.after(() => { audio.dispose(); Object.assign(globalThis, { window: oldWindow }); });
  return { audio, context: () => Context.instances[0] };
}
const fundamentals = (context: Context) => context.oscillators.filter((_source, index) => index % 2 === 0);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const recordingResponse = () => new Response(new Uint8Array([1, 2, 3, 4]));

test("verified themes expose their openings, octave frequencies, and repeat boundaries", () => {
  assert.deepEqual(MELODIES.odeToJoy.notes.slice(0, 8), [64, 64, 65, 67, 67, 65, 64, 62]);
  assert.deepEqual(MELODIES.furElise.notes.slice(0, 9), [76, 75, 76, 75, 76, 71, 74, 72, 69]);
  for (const name of Object.keys(MELODIES) as MelodyName[]) {
    assert.equal(melodyNote(name, MELODIES[name].notes.length), MELODIES[name].notes[0]);
    assert.equal(melodyNote(name, -1), MELODIES[name].notes[0]);
  }
  assert.equal(midiToFrequency(69), 440);
  assert.equal(midiToFrequency(81), 880);
});

test("paced connections play the requested melody notes in order without internal progression", t => {
  const { audio, context } = setup(t);
  for (const index of [0, 1, 2, 3, 0]) { audio.play("connect", { melodyIndex: index }); context().advance(.5); }
  assert.deepEqual(fundamentals(context()).map(source => source.frequency.events[0].value), [64, 64, 65, 67, 64].map(midiToFrequency));
});

test("the first mobile connection plays after an asynchronous gesture resume", async t => {
  const resume = deferred<void>();
  const { audio, context } = setup(t, undefined, "suspended");
  Context.resumeResult = resume.promise;
  audio.play("connect", { melodyIndex: 0 });
  assert.equal(context().oscillators.length, 0, "The note waits for the gesture-owned resume");
  resume.resolve();
  await flush();
  assert.deepEqual(
    fundamentals(context()).map(source => source.frequency.events[0].value),
    [midiToFrequency(MELODIES.odeToJoy.notes[0])],
  );
});

test("a later gesture retries an unresolved iPhone audio unlock", async t => {
  const first = deferred<void>();
  const second = deferred<void>();
  const { audio, context } = setup(t, undefined, "suspended");
  Context.resumeResult = first.promise;
  audio.play("connect", { melodyIndex: 2 });
  Context.resumeResult = second.promise;
  audio.unlock();
  second.resolve();
  await flush();
  assert.equal(context().state, "running");
  assert.deepEqual(fundamentals(context()).map(note => note.frequency.events[0].value), [midiToFrequency(65)]);
  first.resolve();
  await flush();
  assert.equal(fundamentals(context()).length, 1, "A stale resume never replays the gesture");
});

test("optional playback audio session is requested only when SFX are enabled", t => {
  const { audio, context } = setup(t);
  const session = { type: "auto" };
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "audioSession");
  Object.defineProperty(navigator, "audioSession", { configurable: true, value: session });
  t.after(() => {
    if (descriptor) Object.defineProperty(navigator, "audioSession", descriptor);
    else Reflect.deleteProperty(navigator, "audioSession");
  });
  audio.setEnabled(false);
  audio.unlock();
  assert.equal(session.type, "auto");
  audio.setEnabled(true);
  audio.play("connect");
  assert.equal(session.type, "playback");
  assert.equal(fundamentals(context()).length, 1);
  Object.defineProperty(session, "type", { get() { return "auto"; }, set() { throw new Error("Unsupported"); } });
  context().advance(1);
  assert.doesNotThrow(() => audio.play("connect"));
  assert.equal(fundamentals(context()).length, 2, "Session API failures leave regular Web Audio available");
});

test("rapid separate connections and bulk fill keep consecutive notes with a bounded queue", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { melodyIndex: 0 });
  audio.play("connect", { melodyIndex: 1 });
  audio.play("connect", { melodyIndex: 2, count: 4 });
  const notes = fundamentals(context());
  assert.equal(notes.length, 6, "No 40ms connection cooldown loses a normal quick stroke");
  assert.deepEqual(notes.map(source => source.frequency.events[0].value), MELODIES.odeToJoy.notes.slice(0, 6).map(midiToFrequency));
  assert.ok(notes.every((source, index) => Math.abs(source.startTime - index * .075) < 1e-9));
  for (let index = 6; index < 100; index++) audio.play("connect", { melodyIndex: index, count: 999 });
  assert.ok(fundamentals(context()).length <= 9);
  assert.ok(context().oscillators.every(source => source.startTime <= .6 + 1e-9));
});

test("fast fills retain full note tails at 100ms spacing and hand completion off after the last beat", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, noteDurationMs: 1000 });
  audio.play("connect", { melodyIndex: 20, count: 6, sequenceNoteIntervalMs: FILL_NOTE_INTERVAL_MS });
  context().advance(.02);
  audio.play("connect", { melodyIndex: 26, count: 2, sequenceNoteIntervalMs: FILL_NOTE_INTERVAL_MS });
  const notes = fundamentals(context());
  assert.equal(notes.length, 8);
  for (const [index, note] of notes.entries()) {
    assert.ok(Math.abs(note.startTime - index * .1) < 1e-9);
    assert.equal(note.frequency.events[0].value, midiToFrequency(melodyNote("odeToJoy", 20 + index)));
    assert.ok(Math.abs(note.stopTimes[0] - note.startTime - 1.015) < 1e-9, "Fast attacks preserve the configured one-second decay and release");
    assert.equal(note.stopTimes.length, 1, "Another fill does not cut an earlier note short");
  }
  audio.play("complete", { melodyIndex: 28 });
  assert.ok(Math.abs(fundamentals(context())[8].startTime - .8) < 1e-9);
  assert.ok(notes.every(note => note.stopTimes.length === 1), "Completion lets the existing tails ring out");
  audio.stop();
  assert.ok(context().oscillators.every(note => note.stopTimes.at(-1) <= .028));
});

test("a scored fill retains every dotted, short, and held note beyond the rapid-input queue limit", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { melodyIndex: 12, count: 4, sequenceTempoBpm: 96 });
  const notes = fundamentals(context());
  assert.deepEqual(notes.map(source => source.startTime), [0, .9375, 1.25, 2.5]);
  assert.deepEqual(notes.map(source => source.frequency.events[0].value), [64, 62, 62, 64].map(midiToFrequency));
  assert.ok(Math.abs(notes[1].stopTimes[0] - notes[1].startTime - (.3125 * .9 + .015)) < 1e-9);
  assert.ok(notes.every(source => source.stopTimes.length === 1));
  assert.ok(notes.at(-1)!.startTime > .6, "A legitimate fill is never truncated by the normal drag/input backlog cap");
  audio.play("connect", { count: 0, sequenceTempoBpm: 96 });
  audio.play("rotate");
  assert.equal(context().oscillators.length, 8);
  assert.ok(notes.every(source => source.stopTimes.length === 1), "No-op additions and silent rotations leave the phrase alone");
});

test("scored fills preserve Elise rest intervals, wrap pitches, and retain a full six-note batch", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, connectionMelody: "furElise" });
  for (const index of [6, 33]) {
    audio.stop();
    const before = context()?.oscillators.length ?? 0;
    audio.play("connect", { melodyIndex: index, count: 99, sequenceTempoBpm: 96 });
    const notes = context().oscillators.slice(before).filter((_source, index) => index % 2 === 0);
    assert.equal(notes.length, 6);
    const starts = index === 6 ? [0, .15625, .3125, .78125, .9375, 1.09375] : [0, .15625, .78125, .9375, 1.09375, 1.25];
    assert.deepEqual(notes.map(source => source.startTime), starts);
    assert.deepEqual(notes.map(source => source.frequency.events[0].value), Array.from({ length: 6 }, (_, offset) => midiToFrequency(melodyNote("furElise", index + offset))));
  }
});

test("a scored fill follows queued rapid notes without cancelling them", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { melodyIndex: 0, count: 3 });
  const previous = fundamentals(context());
  context().advance(.02);
  audio.play("connect", { melodyIndex: 3, count: 2, sequenceTempoBpm: 96 });
  assert.ok(previous.every(source => source.stopTimes.length === 1));
  const fill = fundamentals(context()).slice(3);
  assert.ok(Math.abs(fill[0].startTime - .225) < 1e-9);
  assert.ok(Math.abs(fill[1].startTime - .85) < 1e-9);
});

test("rapid fills and single connections append every note at the existing tempo", t => {
  const { audio, context } = setup(t);
  let end = 0;
  for (let batch = 0; batch < 20; batch++) {
    const index = batch * 4;
    audio.play("connect", { melodyIndex: index, count: 4, sequenceTempoBpm: batch === 0 ? 96 : 140 });
    const notes = fundamentals(context()).slice(index);
    for (let offset = 0; offset < 4; offset++) {
      assert.ok(Math.abs(notes[offset].startTime - end) < 1e-9, "Queued notes retain the original tempo and order");
      assert.equal(notes[offset].frequency.events[0].value, midiToFrequency(melodyNote("odeToJoy", index + offset)));
      end += melodyStepMs("odeToJoy", index + offset, 96) / 1000;
    }
    context().advance(.02);
  }
  audio.play("connect", { melodyIndex: 80 });
  assert.ok(Math.abs(fundamentals(context()).at(-1)!.startTime - end) < 1e-9, "A single connection joins the pending melody");
  assert.ok(context().oscillators.every(source => source.stopTimes.length === 1), "No earlier fill is cut off, even beyond the voice limit");
  context().advance(end + 1);
  assert.ok(context().oscillators.every(source => source.ended));
  audio.play("connect", { melodyIndex: 81, count: 2, sequenceTempoBpm: 96 });
  assert.equal(fundamentals(context()).at(-2)!.startTime, context().currentTime, "A drained queue starts immediately");
});

test("a later standalone connection controls completion after a fill queue drains", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { melodyIndex: 0, count: 2, sequenceTempoBpm: 96 });
  context().advance(2);
  audio.play("connect", { melodyIndex: 24 });
  audio.play("complete", { melodyIndex: 25 });
  assert.equal(fundamentals(context())[3].startTime, 2.24, "Completion follows the new connection, not the old queue end");
});

test("removal cancels pending fills and clears their reserved beats", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { melodyIndex: 0, count: 4, sequenceTempoBpm: 96 });
  audio.play("connect", { melodyIndex: 4, count: 4, sequenceTempoBpm: 96 });
  const queued = [...context().oscillators];
  context().advance(.02);
  audio.play("disconnect");
  assert.ok(queued.every(source => source.stopTimes.at(-1)! <= .028));
  context().advance(.01);
  audio.play("connect", { melodyIndex: 8, count: 4, sequenceTempoBpm: 96 });
  assert.equal(fundamentals(context()).at(-4)!.startTime, .03);
});

test("queued fill completion waits for all batches and preserves silent beats", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, noteDurationMs: 100 });
  audio.play("connect", { melodyIndex: 24, count: 1, sequenceTempoBpm: 96 });
  context().advance(.2);
  assert.ok(context().oscillators.every(source => source.ended));
  audio.play("connect", { melodyIndex: 25, count: 3, sequenceTempoBpm: 96 });
  assert.equal(fundamentals(context())[1].startTime, .625, "Keep the rest of the beat after the oscillator ends");
  const duration = audio.getCompletionDurationMs({ melodyIndex: 28 });
  audio.play("complete", { melodyIndex: 28 });
  assert.equal(fundamentals(context())[4].startTime, 2.8125);
  assert.ok(context().currentTime + duration / 1000 > fundamentals(context()).at(-1)!.stopTimes[0]);
});

test("completion preserves the scored fill and waits its full last beat before scored continuation", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { melodyIndex: 24, count: 4, sequenceTempoBpm: 96 });
  const fill = [...context().oscillators];
  const originalStops = fill.map(source => [...source.stopTimes]);
  const options = { melodyIndex: 28 };
  const duration = audio.getCompletionDurationMs(options);
  audio.play("complete", options);
  const continuation = fundamentals(context()).slice(4);
  assert.equal(continuation.length, 2);
  assert.ok(Math.abs(continuation[0].startTime - 2.8125) < 1e-9, "The last dotted beat finishes before the continuation attack");
  assert.ok(Math.abs(continuation[1].startTime - continuation[0].startTime - .12) < 1e-9, "The short cadence note lasts half the configured base interval");
  assert.deepEqual(fill.map(source => source.stopTimes), originalStops);
  assert.equal(duration, 3372.5);
  assert.ok(duration / 1000 > continuation.at(-1)!.stopTimes[0]);
});

test("a short final fill beat is authoritative even when completion base spacing is longer", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, connectionMelody: "furElise" });
  audio.play("connect", { melodyIndex: 8, count: 3, sequenceTempoBpm: 96 });
  const options = { melodyIndex: 11 };
  const duration = audio.getCompletionDurationMs(options);
  audio.play("complete", options);
  const notes = fundamentals(context()).slice(3);
  assert.equal(notes[0].startTime, .78125, "The final sixteenth lasts 156.25ms, not the later continuation's 240ms spacing");
  assert.ok(Math.abs(notes[1].startTime - notes[0].startTime - .24) < 1e-9);
  assert.equal(duration, 5781.25);
});

test("the final score interval stays reserved after its short oscillator ends, while an exact cadence adds nothing", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, noteDurationMs: 100 });
  audio.play("connect", { melodyIndex: 27, count: 1, sequenceTempoBpm: 96 });
  context().advance(.2);
  assert.ok(context().oscillators.every(source => source.ended));
  audio.play("complete", { melodyIndex: 28 });
  assert.equal(fundamentals(context())[1].startTime, .9375, "Natural source cleanup does not discard the remaining scored beat");
  audio.stop();
  const before = context().oscillators.length;
  audio.play("connect", { melodyIndex: 26, count: 4, sequenceTempoBpm: 96 });
  const fill = context().oscillators.slice(before);
  const stops = fill.map(source => [...source.stopTimes]);
  audio.play("complete", { melodyIndex: 30 });
  assert.equal(context().oscillators.length, before + 8);
  assert.deepEqual(fill.map(source => source.stopTimes), stops);
  assert.equal(audio.getCompletionDurationMs({ melodyIndex: 30 }), 0);
});

test("scored fill tails cancel on mute, stop, suspension, configuration changes, and disposal", t => {
  const { audio, context } = setup(t);
  for (const cancel of ["mute", "stop", "suspend", "config", "dispose"]) {
    audio.setEnabled(true);
    audio.setConfig(config);
    audio.unlock();
    audio.play("connect", { melodyIndex: 12, count: 6, sequenceTempoBpm: 40, unlock: false });
    audio.play("connect", { melodyIndex: 18, count: 4, sequenceTempoBpm: 40, unlock: false });
    const scheduled = context().oscillators.slice(-20);
    if (cancel === "mute") audio.setEnabled(false);
    if (cancel === "stop") audio.stop();
    if (cancel === "suspend") context().suspend();
    if (cancel === "config") audio.setConfig({ ...config, noteDurationMs: 200 });
    if (cancel === "dispose") audio.dispose();
    assert.ok(scheduled.every(source => source.stopTimes.at(-1)! <= context().currentTime + .008), `${cancel} cancels the entire scored fill`);
    const count = context().oscillators.length;
    audio.setEnabled(true);
    audio.unlock();
    assert.equal(context().oscillators.length, count, `${cancel} does not replay a cancelled phrase`);
  }
});

test("mute and stop cancel pending notes, and unmute has no stale scheduling backlog", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { count: 6 });
  const old = [...context().oscillators];
  audio.setEnabled(false);
  assert.ok(old.every(source => source.stopTimes.at(-1)! <= .008));
  audio.play("connect", { melodyIndex: 8 });
  assert.equal(context().oscillators.length, old.length);
  audio.setEnabled(true);
  context().advance(.02);
  audio.play("connect", { melodyIndex: 9 });
  assert.equal(context().oscillators.at(-2)!.startTime, context().currentTime);
  audio.stop();
  assert.ok(context().oscillators.at(-2)!.stopTimes.at(-1)! <= context().currentTime + .008);
});

test("demo calls never unlock audio, and suspension drops queued notes", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { unlock: false });
  assert.equal(Context.instances.length, 0);
  audio.unlock();
  audio.play("connect", { count: 6, unlock: false });
  context().suspend();
  assert.ok(context().oscillators.every(source => source.stopTimes.at(-1) === 0));
  const count = context().oscillators.length;
  audio.play("connect", { unlock: false });
  assert.equal(context().oscillators.length, count);
  audio.unlock();
  audio.play("connect", { melodyIndex: 6, unlock: false });
  assert.equal(context().oscillators.at(-2)!.startTime, 0);
});

test("melody changes clear pending connection notes and zero volume schedules none", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { count: 3 });
  const old = [...context().oscillators];
  audio.setConfig({ ...config, connectionMelody: "furElise" });
  assert.ok(old.every(source => source.stopTimes.at(-1) === .008));
  audio.play("connect", { melodyIndex: 0 });
  assert.equal(context().oscillators.at(-2)!.frequency.events[0].value, midiToFrequency(76));
  audio.setConfig({ ...config, melodyVolume: 0 });
  const count = context().oscillators.length;
  audio.play("connect", { count: 6 });
  assert.equal(context().oscillators.length, count);
});

test("completion finishes the current phrase after a final fill without stopping any connection", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { count: 6 });
  const notes = [...context().oscillators];
  const originalStops = notes.map(source => [...source.stopTimes]);
  const hold = audio.getCompletionDurationMs({ melodyIndex: 6 });
  audio.play("complete", { melodyIndex: 6 });
  assert.deepEqual(notes.map(source => source.stopTimes), originalStops);
  const continuation = fundamentals(context()).slice(6);
  assert.equal(continuation.length, 24, "A phrase ends at its cadence, unaffected by the six-note input burst cap");
  assert.deepEqual(continuation.map(source => source.frequency.events[0].value), MELODIES.odeToJoy.notes.slice(6, 30).map(midiToFrequency));
  assert.ok(continuation[0].startTime >= notes.at(-2)!.startTime + .24 - 1e-9);
  let elapsed = 0;
  for (const [offset, source] of continuation.entries()) {
    assert.ok(Math.abs(source.startTime - continuation[0].startTime - elapsed) < 1e-9);
    elapsed += MELODIES.odeToJoy.beats[6 + offset] * .24;
  }
  assert.ok(hold / 1000 >= continuation.at(-1)!.stopTimes[0], "The home hold covers the queued handoff and full last note");
  audio.stop();
  assert.ok(context().oscillators.every(source => source.stopTimes.at(-1)! <= .008));
});

test("changing completion interval applies to the next ending without shortening note tails", t => {
  const { audio, context } = setup(t);
  audio.unlock();
  for (const interval of [400, 80]) {
    audio.setConfig({ ...config, completionNoteIntervalMs: interval, noteDurationMs: 1000 });
    const before = context().oscillators.length;
    audio.play("complete", { melodyIndex: 1 });
    const notes = context().oscillators.slice(before).filter((_source, index) => index % 2 === 0);
    assert.ok(notes.length > 2);
    let elapsed = 0;
    for (const [offset, note] of notes.entries()) {
      assert.ok(Math.abs(note.startTime - notes[0].startTime - elapsed) < 1e-9);
      elapsed += MELODIES.odeToJoy.beats[1 + offset] * interval / 1000;
    }
    assert.ok(notes.every(note => Math.abs(note.stopTimes[0] - note.startTime - 1.015) < 1e-9), 'Full one-second tails survive faster attacks');
  }
});

test("every melody position across two loops stops at the next phrase ending with exact count and duration", t => {
  const { audio, context } = setup(t);
  audio.unlock();
  for (const name of Object.keys(MELODIES) as MelodyName[]) {
    audio.setConfig({ ...config, connectionMelody: name, completionNoteIntervalMs: 80 });
    const length = MELODIES[name].notes.length;
    const endings: readonly number[] = MELODIES[name].phraseEnds;
    for (let index = 0; index <= length * 2; index++) {
      audio.stop();
      const count = index > 0 && endings.includes((index - 1) % length)
        ? 0 : endings.find(end => end >= index % length)! - index % length + 1;
      const before = context().oscillators.length;
      const options = { melodyIndex: index };
      const duration = audio.getCompletionDurationMs(options);
      audio.play("complete", options);
      const notes = context().oscillators.slice(before).filter((_source, index) => index % 2 === 0);
      assert.equal(notes.length, count, `${name} next index ${index}`);
      assert.deepEqual(notes.map(source => source.frequency.events[0].value), Array.from({ length: count }, (_, offset) => midiToFrequency(melodyNote(name, index + offset))));
      let elapsedMs = 0;
      for (const [offset, source] of notes.entries()) {
        assert.ok(Math.abs(source.startTime - elapsedMs / 1000) < 1e-9);
        if (offset < count - 1) elapsedMs += MELODIES[name].beats[(index + offset) % length] / MELODIES[name].beats[0] * 80;
      }
      assert.ok(notes.every(source => source.stopTimes.length === 1), "All notes in a long phrase remain scheduled");
      assert.ok(Math.abs(duration - (count ? elapsedMs + 320 + 120 : 0)) < 1e-8);
      if (count) assert.ok(endings.includes((index + count - 1) % length), "The final note is a scored stopping point");
    }
  }
  audio.stop();
  audio.setConfig({ ...config, completionNoteIntervalMs: 9000 });
  const before = context().oscillators.length;
  audio.play("complete", { melodyIndex: 31 });
  const notes = context().oscillators.slice(before).filter((_source, index) => index % 2 === 0);
  assert.equal(notes.length, 31, "The longest continuation is still bounded by the next cadence");
  assert.equal(notes[1].startTime - notes[0].startTime, 1);
});

test("an already played cadence adds no voice, cooldown, or context and preserves its connection tail", t => {
  const { audio, context } = setup(t);
  audio.play("complete", { melodyIndex: 30 });
  assert.equal(Context.instances.length, 0, "A resolved phrase does not initialize audio");
  audio.play("connect", { melodyIndex: 29 });
  const final = [...context().oscillators];
  const stops = final.map(source => [...source.stopTimes]);
  audio.play("complete", { melodyIndex: 30 });
  assert.equal(audio.getCompletionDurationMs({ melodyIndex: 30 }), 0);
  assert.equal(context().oscillators.length, final.length);
  assert.deepEqual(final.map(source => source.stopTimes), stops);
  audio.play("complete", { melodyIndex: 31 });
  assert.equal(context().oscillators.length, final.length + 62, "A silent ending did not consume the completion cooldown or occupy a voice");
});

test("scored connection attacks stay immediate and articulate short notes without changing player envelopes", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, connectionMelody: "furElise" });
  audio.play("connect", { melodyIndex: 0, rhythmTempoBpm: 96 });
  context().advance(.02);
  audio.play("connect", { melodyIndex: 1, rhythmTempoBpm: 96 });
  const scored = fundamentals(context());
  assert.deepEqual(scored.map(source => source.startTime), [0, .02], "The demo owns beat timing; audio never delays its current attack");
  assert.ok(scored.every(source => Math.abs(source.stopTimes[0] - source.startTime - (.15625 * .9 + .015)) < 1e-9));
  audio.stop();
  audio.play("connect", { melodyIndex: 2 });
  audio.play("connect", { melodyIndex: 3 });
  const player = fundamentals(context()).slice(2);
  assert.ok(Math.abs(player[1].startTime - player[0].startTime - .075) < 1e-9);
  assert.ok(player.every(source => Math.abs(source.stopTimes[0] - source.startTime - .335) < 1e-9), "Player notes retain the configured envelope and short burst spacing");
  audio.setConfig(config);
  audio.play("connect", { melodyIndex: 14, rhythmTempoBpm: 96 });
  const longBeat = fundamentals(context()).at(-1)!;
  assert.ok(Math.abs(longBeat.stopTimes[0] - longBeat.startTime - .335) < 1e-9, "A held score beat never lengthens the configured note envelope");
});

test("scored completion keeps the preceding beat and Ode's dotted, short, and held cadence", t => {
  const { audio, context } = setup(t);
  audio.play("connect", { melodyIndex: 11, rhythmTempoBpm: 96 });
  const lastConnection = context().oscillators[0];
  context().advance(.1);
  const options = { melodyIndex: 12, rhythmTempoBpm: 96 };
  const duration = audio.getCompletionDurationMs(options);
  audio.play("complete", options);
  const notes = fundamentals(context()).slice(1);
  assert.equal(notes.length, 18);
  assert.deepEqual(notes.map(source => source.frequency.events[0].value), MELODIES.odeToJoy.notes.slice(12, 30).map(midiToFrequency));
  assert.deepEqual(notes.slice(0, 4).map(source => source.startTime), [.625, 1.5625, 1.875, 3.125]);
  assert.ok(Math.abs(notes[1].stopTimes[0] - notes[1].startTime - (.3125 * .9 + .015)) < 1e-9);
  assert.equal(duration, 12215, "Hold includes the remaining 525ms handoff, 11250ms of scored onsets, 320ms final tonic, and 120ms tail");
  assert.equal(lastConnection.stopTimes.length, 1, "Completion preserves the final connection");
  assert.ok(context().currentTime + duration / 1000 > notes.at(-1)!.stopTimes[0]);
});

test("scored completion preserves Elise rests, cadence boundaries, loops, and the final note tail", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, connectionMelody: "furElise" });
  audio.unlock();
  for (const [index, count] of [[0, 9], [9, 0], [10, 17], [26, 1], [27, 0], [28, 7], [34, 1], [35, 0], [36, 8], [70, 0]]) {
    audio.stop();
    if (index > 0) audio.play("connect", { melodyIndex: index - 1, rhythmTempoBpm: 96 });
    const before = context().oscillators.length;
    const options = { melodyIndex: index, rhythmTempoBpm: 96 };
    const duration = audio.getCompletionDurationMs(options);
    audio.play("complete", options);
    const notes = context().oscillators.slice(before).filter((_source, index) => index % 2 === 0);
    assert.equal(notes.length, count);
    let elapsed = index > 0 ? melodyStepMs("furElise", index - 1, 96) / 1000 : 0;
    for (let offset = 0; offset < count; offset++) {
      assert.ok(Math.abs(notes[offset].startTime - elapsed) < 1e-9);
      assert.equal(notes[offset].frequency.events[0].value, midiToFrequency(melodyNote("furElise", index + offset)));
      elapsed += melodyStepMs("furElise", index + offset, 96) / 1000;
    }
    if (count) {
      assert.ok(Math.abs(duration / 1000 - notes.at(-1)!.stopTimes[0] - .105) < 1e-9, "The reported hold ends 105ms after the final oscillator is stopped");
      assert.ok(notes.every(source => source.stopTimes.length === 1), "The complete phrase remains one intact voice");
      assert.equal(notes.at(-1)!.frequency.events[0].value, midiToFrequency(69));
    } else assert.equal(duration, 0);
  }
});

test("rhythm tempo bounds are finite and Classic ignores scored timing", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, connectionMelody: "furElise" });
  for (const [tempo, expectedStep] of [[1, .375], [999, 1 / 12], [NaN, .24], [Infinity, .24]]) {
    audio.stop();
    const before = context()?.oscillators.length ?? 0;
    audio.play("complete", { melodyIndex: 0, rhythmTempoBpm: tempo });
    const notes = context().oscillators.slice(before);
    assert.ok(Math.abs(notes[2].startTime - notes[0].startTime - expectedStep) < 1e-9);
  }
  audio.setConfig({ ...config, connectionMelody: "classic" });
  const before = context().oscillators.length;
  audio.play("complete", { melodyIndex: 14, rhythmTempoBpm: 40 });
  const chord = context().oscillators.slice(before).filter((_source, index) => index % 2 === 0);
  assert.deepEqual(chord.map(source => source.startTime), [0, .11, .22, .33]);
  assert.equal(audio.getCompletionDurationMs({ rhythmTempoBpm: 40 }), 1100);
  assert.equal(audio.completionDurationMs, audio.getCompletionDurationMs());
});

test("scored phrase cancellation clears every future note and cannot unlock or replay itself", t => {
  const { audio, context } = setup(t);
  const options = { melodyIndex: 12, rhythmTempoBpm: 40, unlock: false };
  assert.equal(audio.getCompletionDurationMs(options), 0);
  audio.play("complete", options);
  assert.equal(Context.instances.length, 0);
  audio.unlock();
  audio.play("complete", options);
  const scheduled = [...context().oscillators];
  context().advance(1.5);
  audio.play("complete", options);
  assert.equal(context().oscillators.length, scheduled.length, "Duplicate events cannot layer another slow phrase");
  audio.setEnabled(false);
  assert.equal(audio.getCompletionDurationMs(options), 0);
  assert.ok(scheduled.every(source => source.stopTimes.at(-1)! <= 1.508));
  audio.setEnabled(true);
  audio.unlock();
  assert.equal(context().oscillators.length, scheduled.length);
  audio.play("complete", options);
  context().suspend();
  assert.equal(audio.getCompletionDurationMs(options), 0);
  assert.ok(context().oscillators.every(source => source.stopTimes.at(-1)! <= context().currentTime + .008));
});

test("one completion voice survives intermediate note endings and suppresses duplicate completion calls", t => {
  const { audio, context } = setup(t);
  audio.play("complete", { melodyIndex: 12 });
  const count = context().oscillators.length;
  context().advance(1.5);
  audio.play("complete", { melodyIndex: 12 });
  assert.equal(context().oscillators.length, count, "No second phrase starts after the old 1.2s cooldown while the first is still sounding");
  const pending = context().oscillators.filter(source => source.stopTimes[0] > context().currentTime);
  assert.ok(pending.length > 0);
  assert.ok(pending.every(source => source.stopTimes.length === 1), "Ending an early note does not disconnect the phrase tail");
  context().advance(10);
  audio.play("complete", { melodyIndex: 22 });
  assert.equal(context().oscillators.length, count + melodyCompletionCount("odeToJoy", 22) * 2, "A later genuinely new completion can play once the previous voice ends");
});

test("completion tails cancel on mute, stop, suspension, config changes, and disposal without replay", t => {
  const { audio, context } = setup(t);
  for (const cancel of ["mute", "stop", "suspend", "config", "dispose"]) {
    audio.setEnabled(true);
    audio.setConfig(config);
    audio.unlock();
    const before = context().oscillators.length;
    audio.play("complete", { melodyIndex: 4 });
    const scheduled = context().oscillators.slice(before);
    if (cancel === "mute") audio.setEnabled(false);
    if (cancel === "stop") audio.stop();
    if (cancel === "suspend") context().suspend();
    if (cancel === "config") audio.setConfig({ ...config, completionNoteIntervalMs: 400 });
    if (cancel === "dispose") audio.dispose();
    assert.ok(scheduled.every(source => source.stopTimes.at(-1)! <= context().currentTime + .008), `${cancel} cancels all future note sources`);
    const count = context().oscillators.length;
    context().advance(.02);
    audio.setEnabled(true);
    audio.unlock();
    assert.equal(context().oscillators.length, count, `${cancel} never replays the cancelled tail after enabling audio`);
  }
});

test("silent completion controls and unchanged config do not disturb existing sounds", t => {
  const { audio, context } = setup(t);
  assert.equal(audio.completionDurationMs, 0, "Remembered sound-on does not prolong the demo before gesture unlock");
  audio.setEnabled(false);
  assert.equal(audio.completionDurationMs, 0);
  audio.play("complete");
  assert.equal(Context.instances.length, 0);
  audio.setEnabled(true);
  audio.play("complete", { unlock: false });
  assert.equal(Context.instances.length, 0, "The automatic demo cannot unlock its own completion");
  audio.play("connect");
  assert.ok(audio.completionDurationMs > 0);
  const connection = [...context().oscillators];
  audio.setConfig(config);
  assert.ok(connection.every(source => source.stopTimes.length === 1), "Unrelated GUI refreshes with identical sound settings leave audio intact");
  audio.setConfig({ ...config, melodyVolume: 0 });
  const count = context().oscillators.length;
  audio.play("complete");
  assert.equal(context().oscillators.length, count);
  assert.equal(audio.completionDurationMs, 0);
});

test("completion sound can be disabled for both melodies and the Classic chord", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, completionSound: false });
  audio.play("complete");
  assert.equal(Context.instances.length, 0);
  audio.setConfig({ ...config, connectionMelody: "classic" });
  audio.play("complete", { melodyIndex: 19 });
  assert.deepEqual(fundamentals(context()).map(source => source.frequency.events[0].value), [523.25, 659.25, 783.99, 1046.5]);
  assert.equal(audio.completionDurationMs, 1100);
  audio.setConfig({ ...config, connectionMelody: "classic", completionSound: false });
  const count = context().oscillators.length;
  audio.play("complete");
  assert.equal(context().oscillators.length, count);
  assert.equal(audio.completionDurationMs, 0);
});

test("classic pitches remain intact, absent rotation recording is silent, and device failure is harmless", t => {
  const { audio, context } = setup(t);
  audio.setConfig({ ...config, connectionMelody: "classic" });
  audio.play("connect", { melodyIndex: 20 });
  assert.equal(context().oscillators[0].frequency.events[0].value, 523.25);
  audio.play("disconnect");
  assert.equal(context().oscillators[2].frequency.events[0].value, 466.16);
  audio.play("rotate");
  assert.equal(context().sources.length, 4, "No recording means no synthesized rotation fallback");
  context().advance(2);
  context().failOscillator = true;
  assert.doesNotThrow(() => audio.play("complete"));
  assert.doesNotThrow(() => audio.dispose());
});

test("recorded rotations prefetch silently, decode once, and use fresh sources with the existing cooldown", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => recordingResponse());
  const { audio, context } = setup(t, "/rotation.wav");
  audio.setEnabled(false);
  await flush();
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(Context.instances.length, 0, "Fetching bytes does not unlock or create audio");
  audio.setEnabled(true);
  audio.play("rotate", { unlock: false });
  assert.equal(Context.instances.length, 0, "The demo cannot unlock the sample");
  audio.unlock();
  audio.play("rotate");
  assert.equal(context().sources.length, 0, "A rotation requested during decoding is skipped");
  await flush();
  assert.equal(context().sources.length, 0, "Decoding does not replay an earlier request");
  audio.play("rotate");
  const first = context().sources[0];
  assert.equal(first.buffer, context().decodedBuffer);
  assert.equal(first.stopTimes[0], .25);
  context().advance(.05);
  audio.play("rotate");
  assert.equal(context().sources.length, 1);
  context().advance(.12);
  audio.play("rotate");
  assert.equal(context().sources.length, 2);
  assert.notEqual(context().sources[1], first);
  assert.equal(context().sources[1].buffer, first.buffer);
  assert.equal(context().oscillators.length, 0, "Configured recordings replace both synthetic rotation sounds");
  assert.equal(context().decodeInputs.length, 1);
  assert.equal(fetchMock.mock.callCount(), 1);
  audio.stop();
  assert.ok(context().sources.every(source => source.stopTimes.at(-1)! <= context().currentTime + .008));
});

test("a late recording fetch can cache while muted but never starts old rotations", async t => {
  const request = deferred<Response>();
  t.mock.method(globalThis, "fetch", () => request.promise);
  const { audio, context } = setup(t, "/rotation.wav");
  audio.play("rotate");
  audio.setEnabled(false);
  request.resolve(recordingResponse());
  await flush();
  assert.equal(context().decodeInputs.length, 1);
  assert.equal(context().sources.length, 0);
  audio.setEnabled(true);
  assert.equal(context().sources.length, 0);
  audio.play("rotate");
  assert.equal(context().sources.length, 1, "Only a new enabled rotation uses the cached sample");
});

test("pending sample decode survives stop or mute without replaying old events", async t => {
  t.mock.method(globalThis, "fetch", async () => recordingResponse());
  const { audio, context } = setup(t, "/rotation.wav");
  audio.unlock();
  const decoding = deferred<{ duration: number }>();
  context().decodeResult = decoding.promise;
  await flush();
  for (let index = 0; index < 5; index++) { audio.unlock(); audio.play("rotate"); }
  assert.equal(context().decodeInputs.length, 1);
  audio.stop();
  audio.setEnabled(false);
  decoding.resolve(context().decodedBuffer);
  await flush();
  audio.setEnabled(true);
  await flush();
  assert.equal(context().sources.length, 0);
  audio.play("rotate");
  assert.equal(context().sources.length, 1);
  audio.setEnabled(false);
  assert.equal(context().sources[0].stopTimes.at(-1), .008);
});

test("dispose aborts pending fetch and ignores late fetch or decode resolutions", async t => {
  const request = deferred<Response>();
  const fetchMock = t.mock.method(globalThis, "fetch", () => request.promise);
  const { audio, context } = setup(t, "/rotation.wav");
  audio.unlock();
  audio.dispose();
  const options = fetchMock.mock.calls[0].arguments[1] as RequestInit;
  assert.equal(options.signal?.aborted, true);
  request.resolve(recordingResponse());
  await flush();
  assert.equal(context().decodeInputs.length, 0);
  assert.equal(context().sources.length, 0);

  fetchMock.mock.mockImplementation(async () => recordingResponse());
  const decoding = deferred<{ duration: number }>();
  const other = new GameAudio("/rotation.wav");
  other.setEnabled(true);
  other.unlock();
  const otherContext = Context.instances[1];
  otherContext.decodeResult = decoding.promise;
  await flush();
  assert.equal(otherContext.decodeInputs.length, 1);
  other.dispose();
  decoding.resolve(otherContext.decodedBuffer);
  await flush();
  other.setEnabled(true);
  other.play("rotate");
  assert.equal(otherContext.sources.length, 0);
  assert.equal(otherContext.state, "closed");
});

test("recorded rotation voices respect limits and suspension cancels them without a backlog", async t => {
  t.mock.method(globalThis, "fetch", async () => recordingResponse());
  const { audio, context } = setup(t, "/rotation.wav");
  audio.unlock();
  context().decodedBuffer.duration = 10;
  await flush();
  for (let index = 0; index < 20; index++) { audio.play("rotate"); context().advance(.17); }
  assert.equal(context().sources.length, 12);
  context().suspend();
  assert.ok(context().sources.every(source => source.stopTimes.at(-1) === context().currentTime));
  audio.play("rotate", { unlock: false });
  assert.equal(context().sources.length, 12);
  audio.unlock();
  audio.play("rotate", { unlock: false });
  assert.equal(context().sources.length, 13);
  assert.equal(context().sources[12].startTime, context().currentTime);
});

test("failed sample fetch or decoding remains optional and leaves melodic effects working", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  const { audio, context } = setup(t, "/missing.wav");
  await flush();
  audio.play("rotate");
  assert.equal(context().decodeInputs.length, 0);
  assert.equal(context().sources.length, 0);
  audio.play("connect");
  assert.equal(context().oscillators[0].frequency.events[0].value, midiToFrequency(64));

  for (const failure of ["rejection", "throw"] as const) {
    fetchMock.mock.mockImplementation(async () => recordingResponse());
    const other = new GameAudio("/bad.wav");
    other.setEnabled(true);
    other.unlock();
    const otherContext = Context.instances.at(-1)!;
    if (failure === "throw") otherContext.failDecode = true;
    else {
      const decoding = deferred<{ duration: number }>();
      otherContext.decodeResult = decoding.promise;
      await flush();
      decoding.reject(new Error("Unsupported recording"));
    }
    await flush();
    other.play("rotate");
    assert.equal(otherContext.sources.length, 0);
    assert.equal(otherContext.decodeInputs.length, 1);
    other.play("disconnect");
    assert.equal(otherContext.oscillators[0].frequency.events[0].value, 466.16);
    other.dispose();
  }
});
