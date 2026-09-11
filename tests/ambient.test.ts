import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { AmbientAudio } from "../src/ambient.ts";

class Media {
  static instances: Media[] = [];
  src = "";
  preload = "auto";
  loop = false;
  volume = 1;
  paused = true;
  currentTime = 0;
  pauses = 0;
  loads = 0;
  throwOnPlay = false;
  requests: { resolve: () => void; reject: (reason: Error) => void }[] = [];
  constructor() { Media.instances.push(this); }
  play() {
    if (this.throwOnPlay) throw new Error("Playback unavailable");
    this.paused = false;
    return new Promise<void>((resolve, reject) => this.requests.push({ resolve, reject }));
  }
  pause() { this.paused = true; this.pauses++; }
  load() { this.loads++; }
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  resolve(index = this.requests.length - 1) { this.paused = false; this.requests[index].resolve(); }
  reject(index = this.requests.length - 1) { this.requests[index].reject(new Error("Autoplay blocked")); }
}

function setup(t: TestContext) {
  const originals = { Audio: globalThis.Audio, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Media.instances = [];
  Object.assign(globalThis, {
    Audio: Media,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const audio = new AmbientAudio("/audio/moonlight.mp3");
  t.after(() => { audio.dispose(); Object.assign(globalThis, originals); });
  return {
    audio, media: () => Media.instances[0], frames,
    finishFade: () => {
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(performance.now() + 1000));
    },
  };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("music stays unloaded until both enabled and gesture-unlocked, then creates one looping player", async t => {
  const { audio, media, finishFade } = setup(t);
  audio.setVolume(.18);
  audio.setEnabled(true);
  audio.resume();
  assert.equal(Media.instances.length, 0);
  audio.unlock();
  assert.equal(Media.instances.length, 1);
  assert.equal(media().preload, "none");
  assert.equal(media().src, "/audio/moonlight.mp3");
  assert.equal(media().loop, true);
  assert.equal(media().volume, 0);
  assert.equal(media().loads, 0);
  media().resolve(); await settle(); finishFade();
  assert.equal(media().volume, .18);
  audio.unlock(); audio.resume(); audio.setEnabled(true);
  assert.equal(Media.instances.length, 1);
  assert.equal(media().requests.length, 1);
});

test("a gesture while disabled does not fetch audio, and suspension also gates creation", t => {
  const { audio } = setup(t);
  audio.unlock();
  assert.equal(Media.instances.length, 0);
  audio.suspend();
  audio.setEnabled(true);
  assert.equal(Media.instances.length, 0);
  audio.resume();
  assert.equal(Media.instances.length, 1);
});

test("mute and visibility suspension preserve playback position and reuse the player", async t => {
  const { audio, media, finishFade } = setup(t);
  audio.setEnabled(true); audio.unlock();
  media().resolve(); await settle(); finishFade();
  media().currentTime = 42.5;
  audio.setEnabled(false);
  assert.equal(media().paused, true);
  assert.equal(media().currentTime, 42.5);
  audio.setEnabled(true);
  media().resolve(); await settle();
  audio.suspend();
  assert.equal(media().paused, true);
  assert.equal(media().currentTime, 42.5);
  audio.setEnabled(true);
  assert.equal(media().requests.length, 2);
  audio.resume();
  assert.equal(media().requests.length, 3);
  assert.equal(Media.instances.length, 1);
  assert.equal(media().loads, 0);
});

test("a late play resolution after mute or suspension is paused again", async t => {
  const { audio, media, frames } = setup(t);
  audio.setEnabled(true); audio.unlock();
  audio.setEnabled(false);
  media().resolve(); await settle();
  assert.equal(media().paused, true);
  assert.equal(frames.size, 0);
  audio.setEnabled(true);
  audio.suspend();
  media().resolve(); await settle();
  assert.equal(media().paused, true);
  assert.equal(frames.size, 0);
  audio.resume();
  audio.dispose();
  media().resolve(); await settle();
  assert.equal(media().paused, true);
  assert.equal(frames.size, 0);
});

test("stale play success or failure cannot pause a newer enabled session", async t => {
  const { audio, media, finishFade } = setup(t);
  audio.setEnabled(true); audio.unlock();
  audio.setEnabled(false); audio.setEnabled(true);
  const pauses = media().pauses;
  media().resolve(0); await settle();
  assert.equal(media().pauses, pauses);
  media().resolve(1); await settle(); finishFade();
  assert.equal(media().paused, false);
  assert.equal(media().volume, .18);
  audio.suspend(); audio.resume();
  audio.suspend(); audio.resume();
  const nextPauses = media().pauses;
  media().reject(2); await settle();
  assert.equal(media().pauses, nextPauses);
  media().resolve(3); await settle(); finishFade();
  assert.equal(media().paused, false);
});

test("playback failures are harmless and the next gesture can retry without duplicate players", async t => {
  const { audio, media } = setup(t);
  audio.setEnabled(true); audio.unlock();
  media().reject(); await settle();
  assert.equal(media().paused, true);
  audio.unlock();
  assert.equal(media().requests.length, 2);
  media().reject(); await settle();
  media().throwOnPlay = true;
  assert.doesNotThrow(() => audio.unlock());
  media().throwOnPlay = false;
  audio.unlock();
  assert.equal(media().requests.length, 3);
  assert.equal(Media.instances.length, 1);
});

test("volume is bounded and disposal cancels fading and releases the media source", async t => {
  const { audio, media, frames, finishFade } = setup(t);
  audio.setEnabled(true); audio.unlock();
  audio.setVolume(2);
  media().resolve(); await settle(); finishFade();
  assert.equal(media().volume, 1);
  audio.setVolume(-1);
  assert.equal(media().volume, 0);
  audio.setVolume(Number.NaN);
  assert.equal(media().volume, 0);
  audio.suspend(); audio.resume();
  media().resolve(); await settle();
  assert.equal(frames.size, 1);
  audio.dispose();
  assert.equal(media().paused, true);
  assert.equal(media().src, "");
  assert.equal(media().loads, 1);
  assert.equal(frames.size, 0);
  audio.unlock(); audio.resume(); audio.setEnabled(true);
  assert.equal(media().requests.length, 2);
});
