import { toggleDemoSuspension } from './helpers/demo-suspension.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { melodyCompletionCount, melodyNote, melodyStepMs, midiToFrequency } from '../src/melodies.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const errors = [];
const rotationRequests = [];
const rotationSmoke = process.argv.includes('--rotation-smoke');
const completionSmoke = process.argv.includes('--completion-smoke');
const smoke = rotationSmoke || completionSmoke;
const settings = { size: 3, depth: 3, difficulty: 'hard', seed: 123 };
const audio = page => page.evaluate(() => window.__audio);
const melodySources = events => events.filter((event, index) => event.frequency > 195 && event.frequency < 450
  && !(index > 0 && event.when === events[index - 1].when && Math.abs(event.frequency - events[index - 1].frequency * 2) < .001));
const round = value => Math.round(value * 100) / 100;
const notes = events => melodySources(events).map(event => round(event.frequency));
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
async function fixture(sound = false) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/rotation-pop|humordome/i.test(request.url())) rotationRequests.push(request.url()); });
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { period: new URL(route.request().url()).searchParams.get('period'), scope: 'local', trackingSince: '2026-09-10T00:00:00Z', totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.addInitScript(({ settings, sound }) => {
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', settings, sound }));
    // The application time hook drives visuals; Web Audio remains native.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    window.__audio = { contexts: 0, resumes: 0, starts: [], decodes: [] };
    const buffers = new WeakMap(), sources = new WeakMap();
    let nextBuffer = 0, nextSource = 0;
    const bufferInfo = buffer => {
      if (!buffer) return null;
      if (!buffers.has(buffer)) {
        let peak = 0;
        for (const value of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(value));
        buffers.set(buffer, { id: ++nextBuffer, duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, peak });
      }
      return buffers.get(buffer);
    };
    const sourceId = source => {
      if (!sources.has(source)) sources.set(source, ++nextSource);
      return sources.get(source);
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function(...args) {
      return Reflect.apply(decode, this, args).then(buffer => {
        window.__audio.decodes.push(bufferInfo(buffer));
        return buffer;
      });
    };
    const OriginalContext = window.AudioContext;
    window.AudioContext = new Proxy(OriginalContext, { construct(target, args) {
      window.__audio.contexts++;
      return Reflect.construct(target, args);
    } });
    const resume = OriginalContext.prototype.resume;
    OriginalContext.prototype.resume = function(...args) {
      window.__audio.resumes++;
      return Reflect.apply(resume, this, args);
    };
    const values = new WeakMap();
    const setValue = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function(value, ...args) {
      values.set(this, value);
      return Reflect.apply(setValue, this, [value, ...args]);
    };
    for (const prototype of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
      const start = Object.getOwnPropertyDescriptor(prototype, 'start')?.value;
      if (!start) continue;
      prototype.start = function(...args) {
        window.__audio.starts.push({ sourceId: sourceId(this), buffer: this instanceof AudioBufferSourceNode ? bufferInfo(this.buffer) : null,
          frequency: this instanceof OscillatorNode ? values.get(this.frequency) : null, when: args[0], now: this.context.currentTime,
          state: this.context.state, contextSampleRate: this.context.sampleRate });
        return Reflect.apply(start, this, args);
      };
    }
  }, { settings, sound });
  await page.goto(url);
  // The fixture freezes RAF, including the loader dismissal callback.
  await page.evaluate(() => document.getElementById("app-loader")?.remove());
  return page;
}
async function reach(page, target) {
  const result = await page.evaluate(target => {
    for (let step = 0; step < 10000; step++) {
      const state = JSON.parse(window.render_game_to_text());
      const matches = typeof target === 'object' ? window.__audio.starts.length > target.audioAfter
        : typeof target === 'number' ? state.demo.connected >= target
        : target === 'turn' ? state.demo.connected > 0 && state.view.animating
        : target === 'edge' ? state.demo.connected > 0
        : target === 'solved' ? state.solved
        : state.solved && state.connectionAnimations.length === 0 && state.dotAnimations.every(node => !node.active);
      if (matches) return true;
      window.advanceTime(40);
    }
    return false;
  }, target);
  assert.equal(result, true, `Demo reaches ${target}`);
}
try {
  if (!smoke) {
  const muted = await fixture();
  assert.equal(await muted.locator('#sound-button').getAttribute('aria-pressed'), 'false');
  await advance(muted, 60000);
  assert.deepEqual(await audio(muted), { contexts: 0, resumes: 0, starts: [], decodes: [] }, 'Muted automatic demo never initializes or decodes audio');
  await muted.close();
  }

  const page = await fixture(true);
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true', 'Saved speaker preference is preserved');
  await advance(page, smoke ? 1000 : 60000);
  assert.deepEqual(await audio(page), { contexts: 0, resumes: 0, starts: [], decodes: [] }, 'Saved sound-on does not create, decode, resume, or play audio before a real gesture');
  await page.locator('[data-size="3"]').click();
  await page.waitForTimeout(300);
  assert.equal((await audio(page)).contexts, 1, 'A trusted gesture unlocks one shared AudioContext');
  assert.deepEqual((await audio(page)).decodes, [], 'A trusted gesture does not decode a rotation recording');
  let before = await audio(page);
  await reach(page, 'edge');
  const turn = (await audio(page)).starts.slice(before.starts.length);
  assert.equal(turn.length, 2, 'The first automatic connection plays only its note and harmonic');
  assert.equal((await state(page)).demo.connected, 1, 'The first automatic connection adds exactly one edge');
  await reach(page, 'edge');
  assert.deepEqual(notes((await audio(page)).starts.slice(before.starts.length)), [329.63], 'The first automatically added edge plays E4');
  await reach(page, 4);
  assert.deepEqual(notes((await audio(page)).starts.slice(before.starts.length)), [329.63, 329.63, 349.23, 392], 'The demo plays the recognizable E E F G opening, one note per added edge');
  const resumed = (await audio(page)).resumes;
  await toggleDemoSuspension(page);
  before = await audio(page);
  await advance(page, 20000);
  assert.deepEqual(await audio(page), before, 'Suspended demo schedules no sounds');
  await toggleDemoSuspension(page);
  await page.waitForTimeout(300);
  before = await audio(page);
  await reach(page, 'solved');
  const finalEdgeAudio = await audio(page);
  const solvedState = await state(page);
  const total = solvedState.demo.total;
  const soundConfig = solvedState.config.sound, demoConfig = solvedState.config.demo;
  assert.equal(demoConfig.timingMode, 'melody', 'The default home preview follows the score');
  const continuationCount = soundConfig.completionSound ? melodyCompletionCount('odeToJoy', total) : 0;
  if (continuationCount) await reach(page, { audioAfter: finalEdgeAudio.starts.length });
  else await advance(page, melodyStepMs('odeToJoy', total - 1, demoConfig.tempoBpm) + 40);
  const continuationEvents = (await audio(page)).starts.slice(finalEdgeAudio.starts.length);
  const continuation = melodySources(continuationEvents);
  assert.equal(continuationEvents.length, continuationCount * 2, 'Only the notes through the next phrase ending and their harmonics follow the final scored beat');
  assert.deepEqual(notes(continuationEvents), Array.from({ length: continuationCount }, (_, index) => round(midiToFrequency(melodyNote('odeToJoy', total + index)))), 'Demo continuation starts at its next unplayed edge index and ends at the cadence');
  const finalAttack = melodySources(finalEdgeAudio.starts).at(-1);
  if (continuation.length) assert.ok(continuation[0].when >= finalAttack.when + melodyStepMs('odeToJoy', total - 1, demoConfig.tempoBpm) / 1000 - 1e-6, 'Completion preserves the last connection’s full scored interval');
  let phraseMs = 0;
  for (let index = 0; index < continuation.length; index++) {
    assert.ok(Math.abs(continuation[index].when - continuation[0].when - phraseMs / 1000) < 1e-6, 'Completion attacks follow cumulative score intervals at the configured tempo');
    if (index < continuation.length - 1) phraseMs += melodyStepMs('odeToJoy', total + index, demoConfig.tempoBpm);
  }
  if (continuation.length) phraseMs += Math.min(soundConfig.noteDurationMs, melodyStepMs('odeToJoy', total + continuation.length - 1, demoConfig.tempoBpm) * .9);
  assert.equal((await state(page)).melodyStep, total, 'Completion does not advance the demo connection counter');
  assert.ok((await state(page)).demo.delayMs >= phraseMs, 'The solved board stays visible for the scored continuation and final envelope');
  before = await audio(page);
  await advance(page, 1000);
  assert.deepEqual(await audio(page), before, 'The solved hold does not replay its continuation');
  assert.equal((await audio(page)).resumes, resumed, 'Automatic playback never attempts another context resume');

  if (!smoke) {
  await page.locator('[data-size="3"]').click();
  before = await audio(page);
  await reach(page, 'edge');
  assert.deepEqual(notes((await audio(page)).starts.slice(before.starts.length)), [329.63], 'Restarting the preview starts its melody at the first note');
  assert.equal((await state(page)).melodyStep, 1, 'The demo exposes its own connection-based melody position');
  await page.locator('#help-button').click();
  before = await audio(page);
  await advance(page, 20000);
  assert.deepEqual(await audio(page), before, 'An open dialog suppresses demo sounds');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  before = await audio(page);
  await advance(page, 20000);
  assert.deepEqual(await audio(page), before, 'A hidden page suppresses demo sounds');
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  await reach(page, 'solved');
  before = await audio(page);
  await page.locator('#start-button').click();
  await advance(page, 20000);
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'playing');
  assert.deepEqual(await audio(page), before, 'Starting a player puzzle discards the demo’s pending completion sound');
  }
  assert.ok((await audio(page)).starts.every(event => event.state === 'running'), 'Every audible event uses a running native AudioContext');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).sound), true, 'Demo audio does not change the saved speaker preference');
  const finalAudio = await audio(page);
  assert.deepEqual(finalAudio.decodes, [], 'Demo cycles never decode a rotation recording');
  assert.equal(finalAudio.starts.filter(event => event.buffer).length, 0, 'The demo never schedules a rotation sample');
  assert.equal(finalAudio.starts.filter(event => event.frequency === 180).length, 0, 'Synthetic rotation is absent throughout the demo');
  await page.close();
  assert.deepEqual(rotationRequests, [], 'The demo never fetches the rotation-pop recording');
  assert.deepEqual(errors, []);
  console.log(smoke
    ? 'Passed: simultaneous silent demo turns and connection notes, E E F G opening, cadence-ending continuation with scored spacing and hold, no replay/index consumption, pause, and preserved preference.'
    : 'Passed: muted/saved-on autoplay policy, silent simultaneous demo rotations without recording requests, E E F G melody, preview restart, cadence-ending completion once, pause/dialog/hidden suppression, no stale playback, preserved preference.');
} finally { await browser.close(); }
