import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';
import { melodyCompletionCount, melodyNote, melodyStepMs, midiToFrequency } from '../src/melodies.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const errors = [];
const rotationRequests = [];
const rotationSmoke = process.argv.includes('--rotation-smoke');
const completionSmoke = process.argv.includes('--completion-smoke');
const doubleTapSmoke = process.argv.includes('--double-tap-smoke');
const settings = { size: 4, depth: 1, difficulty: 'easy', seed: 123 };
const state = async page => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const sounds = page => page.evaluate(() => window.__audio.starts);
const count = (events, frequency) => events.filter(event => event.frequency === frequency).length;
const storage = page => page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')));
const round = frequency => Math.round(frequency * 100) / 100;
// Ode's G3–G4 fundamentals sit below its harmonics and the disconnect sound.
const melodySources = events => events.filter((event, index) => event.frequency > 195 && event.frequency < 450
  && !(index > 0 && event.when === events[index - 1].when && Math.abs(event.frequency - events[index - 1].frequency * 2) < .001));
const melodyNotes = events => melodySources(events).map(event => round(event.frequency));
const ode = [329.63, 329.63, 349.23, 392, 392, 349.23];
const settle = page => page.evaluate(() => window.advanceTime(600));
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
async function fixture(edges = [], melodyStep = 0) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/rotation-pop|humordome/i.test(request.url())) rotationRequests.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { period: new URL(route.request().url()).searchParams.get('period'), scope: 'local', trackingSince: '2026-09-10T00:00:00Z', totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.addInitScript(({ settings, edges, melodyStep }) => {
    if (!sessionStorage.getItem('sound-fixture')) {
      sessionStorage.setItem('sound-fixture', 'set');
      localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', settings, melodyStep, game: { version: 1, settings, edges, history: [] } }));
    }
    window.__audio = { starts: [], stops: [], decodes: [] };
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
    BaseAudioContext.prototype.decodeAudioData = function(bytes, ...args) {
      // Read the WAV header before native decoding transfers its ArrayBuffer.
      const data = new DataView(bytes);
      let input = null;
      for (let offset = 12; offset + 24 <= data.byteLength;) {
        const size = data.getUint32(offset + 4, true);
        if (data.getUint32(offset) === 0x666d7420) {
          input = { channels: data.getUint16(offset + 10, true), sampleRate: data.getUint32(offset + 12, true), bits: data.getUint16(offset + 22, true) };
          break;
        }
        offset += 8 + size + (size % 2);
      }
      return Reflect.apply(decode, this, [bytes, ...args]).then(buffer => {
        window.__audio.decodes.push({ ...bufferInfo(buffer), input });
        return buffer;
      });
    };
    const values = new WeakMap();
    const setValue = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function(value, ...args) {
      values.set(this, value);
      return Reflect.apply(setValue, this, [value, ...args]);
    };
    // Observe native Web Audio calls without replacing its context or nodes.
    // Buffer sources define an overloaded start(), so observe that prototype
    // as well as the inherited start() used by oscillators.
    for (const prototype of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
      const start = Object.getOwnPropertyDescriptor(prototype, 'start')?.value;
      if (!start) continue;
      prototype.start = function(...args) {
        window.__audio.context = this.context;
        window.__audio.starts.push({ sourceId: sourceId(this), buffer: this instanceof AudioBufferSourceNode ? bufferInfo(this.buffer) : null,
          frequency: this instanceof OscillatorNode ? values.get(this.frequency) : null, when: args[0], now: this.context.currentTime,
          state: this.context.state, contextSampleRate: this.context.sampleRate });
        return Reflect.apply(start, this, args);
      };
    }
    const stop = AudioScheduledSourceNode.prototype.stop;
    AudioScheduledSourceNode.prototype.stop = function(...args) {
      window.__audio.stops.push({ sourceId: sourceId(this), buffer: this instanceof AudioBufferSourceNode ? bufferInfo(this.buffer) : null, when: args[0], now: this.context.currentTime });
      return Reflect.apply(stop, this, args);
    };
  }, { settings, edges, melodyStep });
  await page.goto(url);
  await page.locator('#resume-button').click();
  assert.equal((await state(page)).config.sound.connectionMelody, 'odeToJoy', 'Default connection melody is Ode to Joy');
  return page;
}
async function enable(page) {
  if (await page.locator('#sound-button').getAttribute('aria-pressed') !== 'true') {
    await page.locator('#sound-button').click();
    await page.waitForTimeout(300);
  }
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true');
}
async function pairClick(page, a, b) {
  await page.mouse.click(a.screen.x, a.screen.y);
  await page.mouse.click(b.screen.x, b.screen.y);
  await page.waitForTimeout(320);
}
async function restart(page) {
  await page.locator('#restart-button').click();
  if (await page.locator('#confirm-dialog').isVisible()) await page.locator('#confirm-button').click();
  await settle(page);
  assert.equal((await state(page)).edges.length, 0);
  assert.equal((await storage(page)).melodyStep, 0, 'Restart resets the next melody note');
}
function availablePair(s) {
  const a = s.nodes.find(node => node.remaining > 0 && s.nodes.some(other => other.remaining > 0 && adjacent(node, other)));
  return [a, s.nodes.find(node => node.remaining > 0 && adjacent(a, node))];
}
async function silentTurns(page) {
  for (const action of [
    () => page.locator('[data-rotate="right"]').click(),
    () => page.keyboard.press('ArrowLeft'),
    async () => {
      const box = await page.locator('#game-stage canvas').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 12);
      await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + 12); await page.mouse.up();
    },
  ]) {
    const before = await sounds(page), view = (await state(page)).view;
    await action(); await settle(page);
    const turned = (await state(page)).view;
    assert.notDeepEqual([turned.direction, turned.up], [view.direction, view.up], 'The toolbar/key/swipe action really rotates the board');
    assert.deepEqual(await sounds(page), before, 'Toolbar, keyboard, and swipe rotations schedule no audio source');
  }
  assert.deepEqual(await page.evaluate(() => window.__audio.decodes), [], 'Manual turns never decode a rotation recording');
}
function assertScoredFill(events, index, count, tempo, label) {
  const notes = melodySources(events);
  assert.equal(notes.length, count, `${label}: one melody note per added connection`);
  assert.deepEqual(notes.map(note => round(note.frequency)), Array.from({ length: count }, (_, offset) => round(midiToFrequency(melodyNote('odeToJoy', index + offset)))), `${label}: pitches continue from the actual player index`);
  assert.ok(Math.abs(notes[0].when - notes[0].now) < .05, `${label}: the first note starts immediately`);
  let elapsed = 0;
  for (let offset = 0; offset < notes.length; offset++) {
    assert.ok(Math.abs(notes[offset].when - notes[0].when - elapsed) < 1e-6, `${label}: note ${offset + 1} follows the score at the configured tempo`);
    elapsed += melodyStepMs('odeToJoy', index + offset, tempo) / 1000;
  }
  assert.ok(notes.every(note => note.state === 'running'), `${label}: sources use a native running AudioContext`);
  return notes;
}
async function assertFutureCanceled(page, notes, action, label) {
  const snapshot = await page.evaluate(() => ({ now: window.__audio.context.currentTime, stops: window.__audio.stops.length }));
  const future = notes.filter(note => note.when > snapshot.now + .15);
  assert.ok(future.length >= 2, `${label}: the action occurs while at least two scored notes are still pending`);
  await action();
  const stops = await page.evaluate(before => window.__audio.stops.slice(before), snapshot.stops);
  assert.ok(future.every(note => stops.some(stop => stop.sourceId === note.sourceId && stop.when < note.when && stop.when - stop.now <= .01)), `${label}: native future sources stop before their scheduled attacks`);
}
async function doubleTapRhythm() {
  const page = await fixture([], 12);
  await enable(page);
  let current = await state(page);
  const center = current.nodes.find(node => node.id === 5);
  assert.equal(center.remaining, 4, 'The seeded center can add four links in one fill');
  const tempo = current.config.demo.tempoBpm;
  assert.deepEqual([12, 13, 14].map(index => melodyStepMs('odeToJoy', index, tempo) * tempo / 60000), [1.5, .5, 2], 'The fixture crosses dotted, short, and held score values');
  let before = await sounds(page);
  await page.mouse.dblclick(center.screen.x, center.screen.y);
  current = await state(page);
  assert.equal(current.edges.length, 4, 'A real double click updates all four links immediately');
  assert.equal(current.nodes.find(node => node.id === 5).remaining, 0);
  assert.equal(current.selected, null);
  assert.equal((await storage(page)).melodyStep, 16, 'The full fill persists its four-note advance immediately');
  const firstFill = assertScoredFill((await sounds(page)).slice(before.length), 12, 4, tempo, 'Dotted fill');
  const output = 'output/web-game/double-tap-rhythm';
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/filled-state.json`, JSON.stringify(current, null, 2));
  await page.screenshot({ path: `${output}/filled-board.png` });
  const far = current.nodes.find(node => node.id === 15);
  const beforeSelection = await page.evaluate(() => window.__audio.stops.length);
  await page.mouse.click(far.screen.x, far.screen.y);
  assert.equal((await state(page)).selected, 15, 'A selection remains responsive while the fill melody is pending');
  assert.equal((await state(page)).edges.length, 4);
  assert.equal(await page.evaluate(() => window.__audio.stops.length), beforeSelection, 'Selection does not cancel the fill melody');
  await assertFutureCanceled(page, firstFill, () => page.locator('#sound-button').click(), 'Mute');
  assert.equal((await storage(page)).melodyStep, 16, 'Muting does not consume or rewind notes');
  await page.keyboard.press('Escape');
  await enable(page);
  before = await sounds(page);
  const filled = (await state(page)).nodes.find(node => node.id === 5);
  await page.mouse.dblclick(filled.screen.x, filled.screen.y);
  assert.equal((await state(page)).edges.length, 0, 'Double-click removal clears the full group immediately');
  const removed = (await sounds(page)).slice(before.length);
  assert.equal(count(removed, 466.16), 1, 'Double-click removal retains the falling effect');
  assert.deepEqual(melodyNotes(removed), [], 'Removing the group plays no new melody notes');
  assert.equal((await storage(page)).melodyStep, 16);
  await page.waitForTimeout(350);
  before = await sounds(page);
  const empty = (await state(page)).nodes.find(node => node.id === 5);
  await page.mouse.dblclick(empty.screen.x, empty.screen.y);
  const secondFill = assertScoredFill((await sounds(page)).slice(before.length), 16, 4, tempo, 'Second fill');
  assert.equal((await storage(page)).melodyStep, 20);
  current = await state(page);
  const [a, b] = [0, 1].map(id => current.nodes.find(node => node.id === id));
  before = await sounds(page);
  await assertFutureCanceled(page, secondFill, () => pairClick(page, a, b), 'A later connection');
  assert.equal((await state(page)).edges.length, 5, 'A later connection is applied without waiting for the fill audio');
  const next = assertScoredFill((await sounds(page)).slice(before.length), 20, 1, tempo, 'Next manual move');
  assert.equal((await storage(page)).melodyStep, 21, 'A later connection advances once from the completed fill count');
  await writeFile(`${output}/native-audio.json`, JSON.stringify({ tempo, firstFill, secondFill, next, melodyStep: 21 }, null, 2));
  await page.close();
}
try {
  if (doubleTapSmoke) {
    await doubleTapRhythm();
  } else if (completionSmoke) {
    // The near-complete fixture below covers only the continuation contract.
  } else if (rotationSmoke) {
    const page = await fixture();
    await enable(page);
    await silentTurns(page);
    await page.locator('#view-button').click(); await settle(page);
    await page.keyboard.press('Escape');
    const [a, b] = availablePair(await state(page));
    let before = await sounds(page);
    await pairClick(page, a, b);
    assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), ode.slice(0, 1), 'Connection melody still sounds after silent rotations');
    before = await sounds(page);
    await pairClick(page, a, b);
    assert.equal(count(await sounds(page), 466.16) - count(before, 466.16), 1, 'Disconnect still sounds');
    await page.locator('#sound-button').click();
    before = await sounds(page);
    await pairClick(page, a, b);
    assert.deepEqual(await sounds(page), before, 'Muting still silences connections');
    await page.close();
  } else {
  const page = await fixture();
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true', 'SFX default on for a first-time player');
  await page.locator('#sound-button').click();
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false', 'A player can still mute SFX explicitly');
  await page.locator('[data-rotate="right"]').click();
  await settle(page);
  let s = await state(page);
  let a = s.nodes.find(node => node.remaining > 0 && s.nodes.some(other => other.remaining > 0 && adjacent(node, other)));
  let b = s.nodes.find(node => node.remaining > 0 && adjacent(a, node));
  await pairClick(page, a, b);
  assert.deepEqual(await sounds(page), [], 'Muted default schedules no sound for turning or connecting');
  assert.deepEqual(await page.evaluate(() => window.__audio.decodes), [], 'Muted input never starts native sample decoding');
  assert.equal((await storage(page)).melodyStep, 1, 'A successful muted connection advances without leaving audio to replay later');
  await restart(page);
  await enable(page);
  assert.deepEqual(await page.evaluate(() => window.__audio.decodes), [], 'Enabling effects does not decode a rotation recording');
  assert.equal((await storage(page)).melodyStep, 0, 'The speaker preview does not consume a game note');
  s = await state(page);
  [a, b] = availablePair(s);
  let before = await sounds(page);
  await page.mouse.click(a.screen.x, a.screen.y); await page.waitForTimeout(320);
  assert.deepEqual(await sounds(page), before, 'Selecting a node is silent');
  assert.equal((await storage(page)).melodyStep, 0, 'Selecting a node does not consume a melody note');
  await page.mouse.click(a.screen.x, a.screen.y); await page.waitForTimeout(320);
  await pairClick(page, a, b);
  assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), ode.slice(0, 1), 'The first successful connection plays E');
  before = await sounds(page);
  await pairClick(page, a, b);
  assert.equal(count(await sounds(page), 466.16) - count(before, 466.16), 1, 'Removing a connection plays the falling tone');
  assert.equal((await storage(page)).melodyStep, 1, 'Removing a connection leaves the next note unchanged');
  before = await sounds(page);
  await pairClick(page, a, b);
  assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), ode.slice(1, 2), 'The second successful connection repeats E');
  await page.locator('#undo-button').click();
  await page.waitForTimeout(250);
  assert.equal((await storage(page)).melodyStep, 2, 'Undoing an addition does not consume or rewind the melody');
  await silentTurns(page);
  await page.locator('#view-button').click(); await settle(page); await page.waitForTimeout(250);
  s = await state(page);
  const middle = s.nodes.find(node => node.remaining >= 2 && s.nodes.filter(other => other.remaining > 0 && adjacent(node, other)).length >= 2);
  const ends = s.nodes.filter(node => node.remaining > 0 && adjacent(middle, node)).slice(0, 2);
  before = await sounds(page);
  await page.mouse.move(ends[0].screen.x, ends[0].screen.y); await page.mouse.down();
  await page.mouse.move(middle.screen.x, middle.screen.y); await page.waitForTimeout(90);
  await page.mouse.move(ends[1].screen.x, ends[1].screen.y); await page.mouse.up();
  assert.equal((await state(page)).edges.length, 2);
  assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), ode.slice(2, 4), 'A paced two-edge drag plays F then G, with no extra release note');
  assert.equal((await storage(page)).melodyStep, 4, 'The two-edge stroke advances the melody twice');
  await page.waitForTimeout(150);
  before = await sounds(page);
  await page.mouse.move(ends[1].screen.x, ends[1].screen.y); await page.mouse.down();
  await page.mouse.move(middle.screen.x, middle.screen.y); await page.waitForTimeout(90);
  await page.mouse.move(ends[0].screen.x, ends[0].screen.y); await page.mouse.up();
  assert.equal((await state(page)).edges.length, 0);
  assert.equal(count(await sounds(page), 466.16) - count(before, 466.16), 2, 'A paced removal drag sounds each removed edge without an extra release sound');
  assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), [], 'Removal drag plays no melody notes');
  assert.equal((await storage(page)).melodyStep, 4, 'Removing a stroke preserves the next note');
  const speaker = await page.locator('#sound-button').boundingBox();
  await page.waitForTimeout(200);
  // Toggle off/on to preview a connection tone without consuming a game note,
  // then mute immediately while that short melodic voice is still active.
  await page.mouse.click(speaker.x + speaker.width / 2, speaker.y + speaker.height / 2);
  await page.mouse.click(speaker.x + speaker.width / 2, speaker.y + speaker.height / 2);
  const previewSource = melodySources(await sounds(page)).at(-1).sourceId;
  const stopCount = await page.evaluate(() => window.__audio.stops.length);
  await page.mouse.click(speaker.x + speaker.width / 2, speaker.y + speaker.height / 2);
  assert.ok(await page.evaluate(({ before, sourceId }) => window.__audio.stops.slice(before).some(stop => stop.sourceId === sourceId
    && stop.when - stop.now <= .01), { before: stopCount, sourceId: previewSource }), 'Muting fades/stops the active connection preview');
  before = await sounds(page);
  await page.keyboard.press('ArrowLeft'); await settle(page);
  assert.deepEqual(await sounds(page), before, 'Muted manual actions schedule no sources');
  await enable(page);
  assert.equal((await storage(page)).melodyStep, 4, 'Turning sound back on preserves the next note');
  await page.reload();
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await settle(page);
  assert.equal((await state(page)).mode, 'playing');
  assert.equal((await storage(page)).melodyStep, 4, 'Refresh restores the next melody note');
  s = await state(page); [a, b] = availablePair(s);
  // Allow the first trusted gesture to unlock native audio before connecting.
  await page.mouse.click(a.screen.x, a.screen.y); await page.waitForTimeout(320);
  before = await sounds(page);
  await page.mouse.click(b.screen.x, b.screen.y); await page.waitForTimeout(320);
  assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), ode.slice(4, 5), 'The next connection after refresh continues at the fifth note, G');
  await page.locator('#home-button').click();
  before = await sounds(page);
  await page.evaluate(() => window.advanceTime(12000));
  assert.ok((await state(page)).demo.connected > 0, 'Home demo actually advances');
  assert.equal(melodyNotes((await sounds(page)).slice(before.length))[0], ode[0], 'The home demo starts its own melody at E');
  assert.equal((await storage(page)).melodyStep, 5, 'Demo connections do not advance the saved player melody');
  await page.locator('#resume-button').click(); await settle(page); await page.waitForTimeout(300);
  s = await state(page);
  [a, b] = s.edges[0].map(id => s.nodes.find(node => node.id === id));
  await pairClick(page, a, b);
  before = await sounds(page);
  await pairClick(page, a, b);
  assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), ode.slice(5, 6), 'Continue resumes the player melody after an independent demo');
  await page.locator('#home-button').click();
  await page.locator('#start-button').click();
  await page.locator('#confirm-button').click();
  await settle(page); await page.waitForTimeout(300);
  assert.equal((await storage(page)).melodyStep, 0, 'A new puzzle starts a new melody');
  s = await state(page);
  const multi = s.nodes.find(node => node.remaining >= 2 && s.nodes.filter(other => other.remaining > 0 && adjacent(node, other)).length >= 2);
  assert.ok(multi, 'The new puzzle has a node that can make multiple connections');
  before = await sounds(page);
  await page.mouse.dblclick(multi.screen.x, multi.screen.y); await page.waitForTimeout(350);
  const added = (await state(page)).edges.length;
  assert.ok(added >= 2, 'A double tap adds multiple connections');
  assert.deepEqual(melodyNotes((await sounds(page)).slice(before.length)), ode.slice(0, added), 'A double tap schedules the next note for every connection it adds');
  assertScoredFill((await sounds(page)).slice(before.length), 0, added, s.config.demo.tempoBpm, 'Double tap');
  assert.equal((await storage(page)).melodyStep, added, 'Double-tap melody progress matches its actual connection count');
  await page.close();

  const fast = await fixture();
  await enable(fast);
  s = await state(fast);
  const row = [0, 1, 2, 3].map(y => s.nodes.filter(node => node.y === y).sort((a, b) => a.x - b.x))
    .find(nodes => nodes.every((node, index) => node.remaining >= (index === 0 || index === 3 ? 1 : 2)));
  assert.ok(row, 'The fixture supports a fast three-edge stroke');
  before = await sounds(fast);
  await fast.mouse.move(row[0].screen.x, row[0].screen.y); await fast.mouse.down();
  await fast.mouse.move(row[3].screen.x, row[3].screen.y); await fast.mouse.up();
  assert.equal((await state(fast)).edges.length, 3);
  assert.deepEqual(melodyNotes((await sounds(fast)).slice(before.length)), ode.slice(0, 3), 'A single fast pointer move retains all three melody notes');
  assert.equal((await storage(fast)).melodyStep, 3);
  await fast.locator('#undo-button').click();
  assert.equal((await state(fast)).edges.length, 0, 'A fast stroke remains one undo batch');
  assert.equal((await storage(fast)).melodyStep, 3, 'Grouped removal does not rewind melody progress');
  await restart(fast);
  assert.equal((await storage(fast)).melodyStep, 0, 'Restart also resets a melody after every edge has already been removed');
  await fast.close();
  }

  if (!doubleTapSmoke) {
  const solved = new Puzzle(settings);
  const last = solved.solution.at(-1);
  const completing = await fixture(solved.solution.slice(0, -1));
  await enable(completing);
  const s = await state(completing);
  const before = await sounds(completing);
  await pairClick(completing, s.nodes.find(node => node.id === last[0]), s.nodes.find(node => node.id === last[1]));
  await completing.waitForFunction(() => JSON.parse(window.render_game_to_text()).dialog === 'completion-dialog');
  const completed = await sounds(completing);
  const notes = melodySources(completed.slice(before.length));
  const continuationCount = melodyCompletionCount('odeToJoy', 1);
  assert.equal(notes.length, 1 + continuationCount, 'Final connection plus the remaining notes through the next phrase ending are scheduled');
  assert.deepEqual(notes.map(event => round(event.frequency)), Array.from({ length: 1 + continuationCount }, (_, index) => round(midiToFrequency(melodyNote('odeToJoy', index)))), 'Completion starts at the next unplayed melody note and stops on the cadence');
  const continuation = notes.slice(1);
  const interval = (await state(completing)).config.sound.completionNoteIntervalMs / 1000;
  assert.ok(continuation[0].when >= notes[0].when + interval - 1e-6);
  assert.ok(continuation.every((event, index) => Math.abs(event.when - continuation[0].when - index * interval) < 1e-6), 'Continuation follows the configured note spacing');
  assert.equal((await storage(completing)).melodyStep, 1, 'Celebration does not consume player melody progress');
  await completing.keyboard.press('Escape'); await settle(completing);
  assert.deepEqual(await sounds(completing), completed, 'The solved state does not replay its continuation');
  if (completionSmoke) {
    const output = 'output/web-game/phrase-completion';
    await mkdir(output, { recursive: true });
    await completing.screenshot({ path: `${output}/completion.png` });
    await writeFile(`${output}/completion-state.json`, JSON.stringify(await state(completing), null, 2));
  }
  const stopCount = await completing.evaluate(() => window.__audio.stops.length);
  // The completion modal intentionally prevents Escape and blocks the header.
  // Exercise its existing mute handler directly while native scheduled notes are live.
  await completing.locator('#sound-button').evaluate(button => button.click());
  const stopped = await completing.evaluate(before => window.__audio.stops.slice(before), stopCount);
  assert.ok(continuation.slice(1).every(note => stopped.some(stop => stop.sourceId === note.sourceId && stop.when - stop.now <= .01)), 'Mute cancels every future completion note');
  assert.ok(completed.every(event => event.state === 'running'), 'Sounds were scheduled in a real running AudioContext');
  await completing.close();

  const cadence = await fixture(solved.solution.slice(0, -1), 29);
  await enable(cadence);
  const cadenceState = await state(cadence);
  assert.equal((await storage(cadence)).melodyStep, 29);
  const cadenceBefore = await sounds(cadence);
  await pairClick(cadence, cadenceState.nodes.find(node => node.id === last[0]), cadenceState.nodes.find(node => node.id === last[1]));
  await cadence.waitForFunction(() => JSON.parse(window.render_game_to_text()).dialog === 'completion-dialog');
  const finalNote = melodySources((await sounds(cadence)).slice(cadenceBefore.length));
  assert.equal(finalNote.length, 1, 'Solving on Ode index 29 plays its final connection, with no extra completion notes');
  assert.equal(round(finalNote[0].frequency), round(midiToFrequency(melodyNote('odeToJoy', 29))));
  assert.equal((await storage(cadence)).melodyStep, 30, 'An exact cadence does not start or consume the next phrase');
  await cadence.evaluate(() => window.advanceTime(2000));
  assert.equal((await sounds(cadence)).length, cadenceBefore.length + 2, 'An exact cadence never schedules a delayed extra voice');
  const finalStops = await cadence.evaluate(sourceId => window.__audio.stops.filter(stop => stop.sourceId === sourceId), finalNote[0].sourceId);
  assert.equal(finalStops.length, 1, 'Completion does not stop or fade the last connection prematurely');
  assert.ok(Math.abs(finalStops[0].when - finalNote[0].when - cadenceState.config.sound.noteDurationMs / 1000 - .015) < 1e-6, 'The full configured connection envelope remains intact');
  await cadence.close();
  }
  assert.deepEqual(rotationRequests, [], 'No rotation-pop recording is fetched');
  assert.deepEqual(errors, []);
  console.log(doubleTapSmoke
    ? 'Passed: native double-click fills update four links immediately, follow dotted score timing at the saved melody index, persist the full count, cancel future sources on mute/new moves, keep selection responsive, and retain the falling removal effect.'
    : completionSmoke
    ? 'Passed: continuation through the next phrase ending, configured spacing, exact-cadence silence with its last-note tail preserved, no replay or player-index consumption, and mute cancellation.'
    : rotationSmoke
    ? 'Passed: silent toolbar/key/swipe rotations, no rotation recording request/decode, audible connection/disconnect/completion, and mute.'
    : 'Passed: silent rotations without recording requests, native muted default, active melodic mute, E E F G melody, selection/removal/undo, multi-edge inputs, preview/persistence/reset, independent demo, completion once. No page/console errors.');
} finally { await browser.close(); }
