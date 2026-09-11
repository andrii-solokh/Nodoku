import assert from "node:assert/strict";
import test from "node:test";
import { MELODIES, melodyNote, melodyStepMs, melodyCompletionCount, type MelodyName } from "../src/melodies.ts";

test("score onset intervals cover every pitch and the complete phrase lengths", () => {
  for (const [name, count, quarterBeats] of [["odeToJoy", 62, 64], ["furElise", 35, 12]] as const) {
    const melody = MELODIES[name];
    assert.equal(melody.notes.length, count);
    assert.equal(melody.beats.length, count);
    assert.ok(melody.beats.every(beats => Number.isFinite(beats) && beats > 0));
    assert.equal(melody.beats.reduce<number>((sum, beats) => sum + beats, 0), quarterBeats);
    assert.equal(melody.notes.reduce<number>((sum, _, index) => sum + melodyStepMs(name, index, 60), 0), quarterBeats * 1000);
  }
});

test("Ode preserves quarter-note opening, dotted cadences and the bridge eighths", () => {
  assert.deepEqual(MELODIES.odeToJoy.notes.slice(0, 4), [64, 64, 65, 67]);
  assert.deepEqual([0, 1, 2, 3].map(index => melodyStepMs("odeToJoy", index)), [625, 625, 625, 625]);
  // In the score's last bar of each four-bar phrase: dotted quarter, eighth, half.
  for (const start of [12, 27, 59]) {
    assert.deepEqual([start, start + 1, start + 2].map(index => melodyStepMs("odeToJoy", index, 120)), [750, 250, 1000]);
  }
  // Bars 10 and 11 each contain one pair of eighths between quarter notes.
  for (const start of [34, 39]) {
    assert.deepEqual(MELODIES.odeToJoy.beats.slice(start, start + 5), [1, .5, .5, 1, 1]);
  }
  assert.deepEqual(MELODIES.odeToJoy.notes.slice(-3), [62, 60, 60]);
});

test("Für Elise retains sixteenth pickups, rests after eighth notes and the first-ending cadence", () => {
  assert.deepEqual(MELODIES.furElise.notes.slice(0, 8), [76, 75, 76, 75, 76, 71, 74, 72]);
  assert.deepEqual(MELODIES.furElise.beats.slice(0, 8), Array(8).fill(.25));
  const restingNotes = [8, 12, 16, 26, 30];
  assert.deepEqual(restingNotes.map(index => melodyNote("furElise", index)), [69, 71, 72, 69, 71]);
  for (const index of restingNotes) assert.equal(melodyStepMs("furElise", index, 120), 375);
  for (let index = 0; index < 34; index++) {
    if (!restingNotes.includes(index)) assert.equal(melodyStepMs("furElise", index, 120), 125);
  }
  assert.equal(melodyNote("furElise", 34), 69);
  assert.equal(melodyStepMs("furElise", 34, 120), 500);
  assert.equal(melodyNote("furElise", 35), 76);
  assert.equal(melodyStepMs("furElise", 35, 120), 125);
});

test("tempo scales score intervals and pitch/timing wrap together across both loop seams", () => {
  for (const name of Object.keys(MELODIES) as MelodyName[]) {
    const length = MELODIES[name].notes.length;
    for (const index of [0, 12, length - 1, length, length * 3 + 2]) {
      assert.equal(melodyStepMs(name, index, 120) * 2, melodyStepMs(name, index, 60));
      assert.equal(melodyNote(name, index), melodyNote(name, index % length));
      assert.equal(melodyStepMs(name, index), melodyStepMs(name, index % length));
    }
  }
});

test("invalid indices use the opening note and invalid tempos use the 96 BPM default", () => {
  for (const name of Object.keys(MELODIES) as MelodyName[]) {
    for (const index of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(melodyNote(name, index), melodyNote(name, 0));
      assert.equal(melodyStepMs(name, index), melodyStepMs(name, 0));
    }
    for (const tempo of [0, -60, NaN, Infinity, -Infinity]) {
      assert.equal(melodyStepMs(name, 12, tempo), melodyStepMs(name, 12, 96));
    }
  }
});

test("chosen endings resolve to tonic notes and avoid the intervening open phrases", () => {
  assert.deepEqual(MELODIES.odeToJoy.phraseEnds, [29, 61]);
  assert.deepEqual(MELODIES.odeToJoy.phraseEnds.map(index => melodyNote("odeToJoy", index)), [60, 60]);
  assert.deepEqual(MELODIES.furElise.phraseEnds, [8, 26, 34]);
  assert.deepEqual(MELODIES.furElise.phraseEnds.map(index => melodyNote("furElise", index)), [69, 69, 69]);
  assert.equal(melodyCompletionCount("odeToJoy", 14), 16, "D half cadence is not the chosen resolved ending");
  assert.equal(melodyCompletionCount("odeToJoy", 46), 16, "Continue from the bridge's dominant to tonic");
  assert.equal(melodyCompletionCount("furElise", 16), 11, "The C arrival continues into the next tonic motif ending");
});

test("completion includes the next ending but never starts another section after an ending", () => {
  for (const [name, startCount, maximum] of [["odeToJoy", 30, 31], ["furElise", 9, 17]] as const) {
    const { notes, phraseEnds } = MELODIES[name];
    const endings: readonly number[] = phraseEnds;
    assert.equal(melodyCompletionCount(name, 0), startCount);
    let largest = 0;
    for (let next = 0; next < notes.length * 4; next++) {
      const count = melodyCompletionCount(name, next);
      assert.ok(Number.isInteger(count) && count >= 0 && count <= maximum);
      largest = Math.max(largest, count);
      if (count === 0) {
        assert.ok(next > 0);
        assert.ok(endings.includes((next - 1) % notes.length));
      } else {
        assert.ok(endings.includes((next + count - 1) % notes.length));
        for (let offset = 0; offset < count - 1; offset++)
          assert.ok(!endings.includes((next + offset) % notes.length), "Do not cross an earlier chosen ending");
      }
    }
    assert.equal(largest, maximum);
    for (const ending of endings) {
      assert.equal(melodyCompletionCount(name, ending), 1, "The ending itself is still unplayed");
      assert.equal(melodyCompletionCount(name, ending + 1), 0, "The last actual note already resolved");
      assert.equal(melodyCompletionCount(name, ending + 1 + notes.length * 3), 0);
    }
    assert.equal(melodyCompletionCount(name, notes.length), 0, "A completed loop does not restart the melody");
    assert.equal(melodyCompletionCount(name, notes.length + 1), startCount - 1);
  }
});

test("invalid completion indices use the same opening fallback as pitches and rhythm", () => {
  for (const name of Object.keys(MELODIES) as MelodyName[]) {
    for (const next of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      assert.equal(melodyCompletionCount(name, next), melodyCompletionCount(name, 0));
  }
});
