import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/drag-preview';
await fs.mkdir(out, { recursive: true });
const defaults = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
const browser = await chromium.launch();
const errors = [];
const observations = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const click = (page, selector) => page.locator(selector).evaluate(element => element.click());
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const between = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const key = edge => [...edge].sort((a, b) => a - b).join(':');
const savedEdges = page => page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).game.edges);

async function fixture({ depth = 1, mobile = false, reduced = false, connectionMs = 420, materialStyle = 'gum', edges = [],
  dragReturnMs = 520, dragFollowMs = 0, dragMagnetResponseMs = 0, dragElasticity = .55, dragTipSize = .05, difficulty = 'easy' } = {}) {
  const config = structuredClone(defaults);
  Object.assign(config.scene, {
    materialStyle, nodeFloatAmplitude: 0, connectionMs, nodeScale: 1.1, rodRadius: .035,
    dragMaxLength: 1.15, dragThickness: 1.15, dragMinThickness: .3, dragTipSize,
    dragMagnetRange: .45, dragMagnetStrength: .7, dragElasticity,
    dragReturnMs, dragFollowMs, dragMagnetResponseMs,
  });
  const settings = { size: 4, depth, difficulty, seed: 123 };
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ settings, edges }) => {
    // Advance only when the test requests it, including while the pointer is held.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({
      screen: 'playing', settings, selected: null,
      game: { version: 1, settings, edges, history: [] },
    }));
  }, { settings, edges });
  await page.route('**/api/admin/config', route => {
    assert.equal(route.request().method(), 'GET', 'the fixture never saves to the project');
    return route.fulfill({ json: { config, revision: 'drag-fixture' } });
  });
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/completions', route => route.fulfill({ json: { recorded: true } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: {
    scope: 'local', period: 'all', trackingSince: null,
    totals: { visitors: 1, puzzlesSolved: 0, nodesFilled: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [],
  } }));
  await page.goto(`${url}/?admin=1#admin-token=${'a'.repeat(64)}`);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { polling: 25 });
  await page.locator('#config-scene-materialStyle-gum').waitFor({ state: 'attached' });
  await click(page, '#admin-close');
  await advance(page, 1);
  assert.equal((await state(page)).mode, 'playing');
  assert.equal((await state(page)).dragConnection, null);
  return page;
}

async function pointer(page, touch = false) {
  if (touch) {
    const client = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      window.__dragTouchEvents = {};
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, event => {
        if (event.pointerType === 'touch') window.__dragTouchEvents[type] = (window.__dragTouchEvents[type] || 0) + 1;
      });
    });
    const eventTypes = { touchStart: 'pointerdown', touchMove: 'pointermove', touchEnd: 'pointerup', touchCancel: 'pointercancel' };
    const dispatch = async (type, point) => {
      const eventType = eventTypes[type];
      const before = await page.evaluate(type => window.__dragTouchEvents[type] || 0, eventType);
      await client.send('Input.dispatchTouchEvent', {
        type, touchPoints: point ? [{ id: 0, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 }] : [],
      });
      // CDP can acknowledge a touchMove before the compositor delivers it.
      await page.waitForFunction(({ type, before }) => (window.__dragTouchEvents[type] || 0) > before,
        { type: eventType, before }, { polling: 10 });
    };
    return {
      down: point => dispatch('touchStart', point),
      move: point => dispatch('touchMove', point),
      up: () => dispatch('touchEnd'),
      cancel: () => dispatch('touchCancel'),
    };
  }
  return {
    down: async point => { await page.mouse.move(point.x, point.y); await page.mouse.down(); },
    move: point => page.mouse.move(point.x, point.y, { steps: 1 }),
    up: () => page.mouse.up(),
    cancel: async () => {
      await page.locator('canvas').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true });
      await page.mouse.up();
    },
  };
}

function path(s) {
  const visible = s.nodes.filter(node => node.screen.pickable && node.remaining > 0);
  // Prefer an interior horizontal row so the preview is easy to inspect.
  const ordered = [...visible].sort((a, b) => Math.abs(a.y - 1) - Math.abs(b.y - 1) || a.x - b.x);
  for (const a of ordered) {
    const b = visible.find(node => node.x === a.x + 1 && node.y === a.y && node.z === a.z && node.remaining >= 2);
    const c = visible.find(node => node.x === a.x + 2 && node.y === a.y && node.z === a.z);
    if (b && c) return [a, b, c];
  }
  assert.fail('fixture has a three-node front-facing horizontal path');
}

function expectStrand(s, nodeId, label) {
  assert.ok(s.dragConnection, `${label}: strand exists`);
  assert.equal(s.dragConnection.nodeId, nodeId, `${label}: anchored to the expected node`);
  assert.equal(s.dragConnection.visible, true, `${label}: free strand is rendered (${JSON.stringify(s.dragConnection)})`);
  assert.equal(s.dragConnection.returning, false, `${label}: follows the held pointer`);
  assert.ok([...s.dragConnection.start, ...s.dragConnection.end].every(Number.isFinite));
  return s.dragConnection;
}

async function capture(page, label) {
  const s = await state(page);
  observations.push({ label, dragConnection: s.dragConnection, edges: s.edges, view: s.view });
  await page.screenshot({ path: `${out}/${label}.png` });
}

async function interaction({ depth, mobile }) {
  const page = await fixture({ depth, mobile });
  const p = await pointer(page, mobile);
  const label = `${depth === 1 ? 'flat' : 'cube'}-${mobile ? 'touch' : 'mouse'}`;
  let s = await state(page);
  const [a, b, c] = path(s);
  const ab = midpoint(a.screen, b.screen), bc = midpoint(b.screen, c.screen);
  const initialView = s.view.direction;

  await p.down(a.screen);
  assert.equal((await state(page)).dragConnection, null, 'pointerdown alone remains a tap');
  await p.move(ab);
  s = await state(page);
  const held = expectStrand(s, a.id, 'between nodes');
  assert.ok(distance(held.end, [held.start[0] + .5, held.start[1], held.start[2]]) < .02,
    'the free tip tracks the pointer halfway between adjacent front nodes');
  assert.deepEqual(s.edges, [], 'a dangling strand is not a logical connection');
  assert.deepEqual(await savedEdges(page), [], 'a dangling strand is never persisted');
  assert.deepEqual(s.view.direction, initialView, 'node drag holds the view');
  await capture(page, `${label}-held`);

  await p.up();
  s = await state(page);
  assert.equal(s.dragConnection?.returning, true, 'empty release begins spring return');
  assert.deepEqual(s.edges, [], 'empty release does not make a connection');
  await advance(page, 25);
  s = await state(page);
  assert.equal(s.dragConnection?.returning, true, 'return persists across frames');
  assert.ok(s.dragConnection.progress > 0, 'return time advances');
  assert.ok(distance(s.dragConnection.start, s.dragConnection.end) < distance(held.start, held.end), 'free end moves back toward source');
  await capture(page, `${label}-returning`);
  await advance(page, 1000);
  assert.equal((await state(page)).dragConnection, null, 'return disposes the visible strand');

  await p.down(a.screen);
  await p.move(b.screen);
  assert.deepEqual((await state(page)).edges.map(key), [key([a.id, b.id])], 'reaching a neighbor connects immediately');
  await p.move(bc);
  s = await state(page);
  expectStrand(s, b.id, 'after reaching a neighbor');
  assert.equal(s.edges.length, 1, 'next segment stays provisional');
  await advance(page, 600);
  await capture(page, `${label}-joined-and-dragging`);
  await p.up();
  await advance(page, 1000);
  assert.equal((await state(page)).edges.length, 1, 'return keeps the committed segment');

  await p.down(a.screen);
  await p.move(b.screen);
  assert.deepEqual((await state(page)).edges, [], 'a fresh stroke removes the existing connection');
  await p.move(bc);
  expectStrand(await state(page), b.id, 'after removing a connection');
  await p.up();
  await advance(page, 1000);
  assert.deepEqual((await state(page)).edges, []);

  await p.down(a.screen);
  await p.move(c.screen);
  assert.equal((await state(page)).edges.length, 2, 'fast drag still visits intermediate nodes');
  await p.up();
  assert.equal((await state(page)).dragConnection, null, 'release on a node leaves no extra strand');
  await advance(page, 1000);
  await capture(page, `${label}-joined`);
  await p.down(c.screen);
  await p.move(a.screen);
  await p.up();
  assert.deepEqual((await state(page)).edges, [], 'reverse fresh drag removes the full connected path');

  await p.down(a.screen);
  await p.move(ab);
  expectStrand(await state(page), a.id, 'before cancellation');
  await p.cancel();
  assert.equal((await state(page)).dragConnection, null, 'pointer cancellation removes the provisional strand');
  assert.deepEqual((await state(page)).edges, []);

  await p.down(a.screen);
  await p.move(ab);
  await p.up();
  assert.equal((await state(page)).dragConnection?.returning, true);
  await p.down(b.screen);
  assert.equal((await state(page)).dragConnection, null, 'a new pointer replaces an unfinished return');
  await p.move(bc);
  expectStrand(await state(page), b.id, 'replacement strand');
  await p.cancel();

  await p.down(a.screen);
  await p.move(ab);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal((await state(page)).dragConnection, null, 'backgrounding clears the strand');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.move(c.screen);
  await p.up();
  assert.equal((await state(page)).dragConnection, null, 'returning to the tab does not restore the held stroke');
  assert.deepEqual((await state(page)).edges, []);

  await p.down(a.screen);
  await p.move(ab);
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).dragConnection, null, 'rotation cancels the provisional strand');
  await p.move(c.screen);
  await p.up();
  assert.deepEqual((await state(page)).edges, [], 'moving a held pointer after rotation cannot commit');
  await advance(page, 1000);
  await click(page, '#view-button');
  await advance(page, 1000);

  const [resetA, resetB] = path(await state(page));
  await p.down(resetA.screen);
  await p.move(midpoint(resetA.screen, resetB.screen));
  expectStrand(await state(page), resetA.id, 'before new puzzle');
  await click(page, '#home-button');
  assert.equal((await state(page)).dragConnection, null, 'returning home clears drag geometry');
  await click(page, '#start-button');
  await p.up();
  s = await state(page);
  assert.equal(s.mode, 'playing');
  assert.equal(s.dragConnection, null, 'new game has no stale strand');
  assert.deepEqual(s.edges, [], 'new game receives no held-pointer connection');
  await page.close();
}

async function instantReturn(options, label) {
  const page = await fixture(options);
  const p = await pointer(page);
  const [a, b] = path(await state(page));
  await p.down(a.screen);
  await p.move(midpoint(a.screen, b.screen));
  expectStrand(await state(page), a.id, `${label} held`);
  await p.up();
  assert.equal((await state(page)).dragConnection, null, `${label}: return clears immediately`);
  assert.deepEqual((await state(page)).edges, []);
  await page.close();
}

async function redrawCancellation() {
  const page = await fixture({ materialStyle: 'classic' });
  const p = await pointer(page);
  const [a, b] = path(await state(page));
  const gap = b.screen.x - a.screen.x;
  const clip = { x: Math.floor(a.screen.x + gap * .3), y: Math.floor(a.screen.y - 14), width: Math.ceil(gap * .4), height: 28 };
  const pixels = async label => sharp(await page.screenshot({ path: `${out}/${label}.png`, clip })).removeAlpha().raw().toBuffer();
  const changed = (a, b) => {
    assert.equal(a.length, b.length);
    let count = 0;
    for (let i = 0; i < a.length; i += 3)
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) count++;
    return count;
  };
  const clean = await pixels('classic-clean-gap');
  const startReturn = async label => {
    await p.down(a.screen);
    await p.move(midpoint(a.screen, b.screen));
    await p.up();
    assert.equal((await state(page)).dragConnection?.returning, true);
    assert.deepEqual((await state(page)).gum.pulses, [], 'Classic provides no other animation to hide a missed redraw');
    assert.ok(changed(clean, await pixels(label)) > 30, 'the returning strand is actually present in the canvas');
  };

  await startReturn('classic-before-tab-hide');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal((await state(page)).dragConnection, null);
  assert.ok(changed(clean, await pixels('classic-after-tab-resume')) <= 2,
    'tab resume redraws the cleared canvas without an animation frame or advanceTime');

  await startReturn('classic-before-new-pointer');
  await p.down(b.screen);
  assert.equal((await state(page)).dragConnection, null);
  assert.ok(changed(clean, await pixels('classic-after-new-pointer')) <= 2,
    'new pointerdown redraws the cleared canvas before cancelMotion stops its pending frame');
  await p.cancel();
  assert.deepEqual((await state(page)).edges, []);
  await page.close();
}

function expectMagnet(s, target, label) {
  const magnet = s.dragConnection?.magnet;
  assert.equal(magnet?.nodeId, target.id, `${label}: only the intended neighbor responds`);
  assert.equal(magnet.visible, true, `${label}: target nub is rendered`);
  assert.ok(magnet.strength > 0 && magnet.strength <= 1);
  assert.ok(magnet.extension > 0 && magnet.extension <= .25, 'the magnetic nub remains small');
  assert.ok([...magnet.start, ...magnet.end].every(Number.isFinite));
  assert.ok(distance(magnet.end, s.dragConnection.end) < distance(magnet.start, s.dragConnection.end),
    'the target nub reaches toward the free tip');
  return magnet;
}

async function magneticBehavior({ depth = 1, mobile = false } = {}) {
  const page = await fixture({ depth, mobile });
  const p = await pointer(page, mobile);
  const initial = await state(page);
  const [a, b] = path(initial);
  const label = `magnet-${depth === 1 ? 'flat' : 'cube'}-${mobile ? 'touch' : 'mouse'}`;
  await p.down(a.screen);
  await p.move(between(a.screen, b.screen, .32));
  const short = expectStrand(await state(page), a.id, 'short strand');
  assert.ok(short.length > .25 && short.length < .4);
  assert.ok(short.radius > 0 && short.tipRadius > 0);
  await p.move(between(a.screen, b.screen, .45));
  const farther = expectMagnet(await state(page), b, 'nearby target');
  await p.move(between(a.screen, b.screen, .65));
  let s = await state(page);
  const long = expectStrand(s, a.id, 'stretched strand');
  const closer = expectMagnet(s, b, 'closer target');
  assert.ok(long.length > short.length && long.length < 1, 'exercise normal adjacent-node stretching');
  assert.ok(long.radius < short.radius, 'strand visibly thins before it spans one grid spacing');
  assert.ok(closer.strength > farther.strength && closer.extension > farther.extension,
    'the nub grows as the free tip approaches');
  assert.deepEqual(s.edges, [], 'magnetic attraction alone never commits a connection');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')));
  assert.deepEqual(saved.game.edges, []);
  for (const object of [saved, saved.game]) for (const field of ['dragConnection', 'magnet'])
    assert.equal(Object.hasOwn(object, field), false, 'preview geometry is not persisted');
  await capture(page, `${label}-near`);

  await p.move(between(a.screen, b.screen, .7));
  s = await state(page);
  const nearest = expectMagnet(s, b, 'very near target');
  const gapBetweenSurfaces = distance(nearest.start, s.dragConnection.end)
    - .205 * s.config.scene.nodeScale - nearest.extension - s.dragConnection.tipRadius;
  assert.ok(gapBetweenSurfaces >= .018 * s.config.scene.nodeScale - .0001,
    'the nub and free tip keep a visible gap until actual node contact');
  assert.deepEqual(s.edges, [], 'very close preview tips still do not make an edge');
  await capture(page, `${label}-near-gap`);

  await p.move(between(a.screen, b.screen, .2));
  assert.equal((await state(page)).dragConnection?.magnet, null, 'nub disappears outside the attraction range');
  await p.move(between(a.screen, b.screen, .65));
  expectMagnet(await state(page), b, 're-entered range');
  await p.up();
  assert.equal((await state(page)).dragConnection?.magnet, null, 'release clears attraction while the strand returns');
  await advance(page, 1000);
  assert.equal((await state(page)).dragConnection, null);
  assert.deepEqual((await state(page)).edges, []);

  await p.down(a.screen);
  await p.move(between(a.screen, b.screen, .65));
  expectMagnet(await state(page), b, 'before cancellation');
  await p.cancel();
  assert.equal((await state(page)).dragConnection, null, 'cancel clears both ends');

  await p.down(a.screen);
  await p.move(between(a.screen, b.screen, .65));
  await p.move(b.screen);
  s = await state(page);
  assert.deepEqual(s.edges.map(key), [key([a.id, b.id])], 'actual node contact still commits exactly one edge');
  assert.equal(s.dragConnection?.magnet, null, 'commit removes the former target nub');
  await p.up();
  await advance(page, 1000);
  await capture(page, `${label}-committed`);
  await p.down(a.screen);
  await p.move(between(a.screen, b.screen, .65));
  assert.equal((await state(page)).dragConnection?.magnet, null, 'an already connected neighbor does not attract');
  assert.equal((await state(page)).edges.length, 1);
  await p.move(b.screen);
  await p.up();
  assert.deepEqual((await state(page)).edges, [], 'dragging through that connected node still removes the edge');

  // The diagonal passes between legal neighbors toward a nonadjacent node.
  // Both far pointer positions are beyond the strand's maximum reach.
  const gap = Math.abs(b.screen.x - a.screen.x);
  const viewport = page.viewportSize();
  const diagonal = Math.min(gap * 2.5, viewport.width - a.screen.x - 16, viewport.height - a.screen.y - 16);
  await p.down(a.screen);
  await p.move({ x: a.screen.x + diagonal * .7, y: a.screen.y + diagonal * .7 });
  const capped = expectStrand(await state(page), a.id, 'maximum reach');
  assert.ok(Math.abs(capped.maxLength - 1.15) < .0001, 'fixture uses the default maximum reach');
  assert.ok(Math.abs(capped.length - capped.maxLength) < .001, 'free tip stops at maximum reach');
  await p.move({ x: a.screen.x + diagonal, y: a.screen.y + diagonal });
  s = await state(page);
  assert.ok(s.dragConnection.length <= s.dragConnection.maxLength + .0001);
  assert.ok(distance(capped.end, s.dragConnection.end) < .02, 'moving farther cannot stretch the tip beyond its cap');
  assert.equal(s.dragConnection.magnet, null, 'a nearby diagonal nonneighbor cannot grow a nub');
  assert.deepEqual(s.edges, [], 'moving the free tip toward a nonneighbor creates no illegal edge');
  await capture(page, `${label}-capped`);
  await p.cancel();
  await page.close();
}

async function fullTargetDoesNotAttract() {
  // This medium fixture needs one link at node1, leaving its other neighbors free.
  const edges = [[1, 0]];
  const page = await fixture({ edges, difficulty: 'medium' });
  const p = await pointer(page);
  const s = await state(page);
  const source = s.nodes.find(node => node.id === 5), target = s.nodes.find(node => node.id === 1);
  assert.equal(target.remaining, 0);
  assert.ok(source.remaining > 0);
  await p.down(source.screen);
  await p.move(between(source.screen, target.screen, .65));
  assert.equal((await state(page)).dragConnection?.magnet, null, 'a full target does not attract a free tip');
  assert.deepEqual((await state(page)).edges.map(key).sort(), edges.map(key).sort());
  await p.cancel();
  await p.down(target.screen);
  await p.move(between(target.screen, source.screen, .65));
  assert.equal((await state(page)).dragConnection, null, 'a full source cannot pull a new strand or attract a connection');
  await p.cancel();
  await page.close();
}

async function rearTargetDoesNotAttract() {
  const page = await fixture({ depth: 4 });
  const p = await pointer(page);
  const bounds = await page.locator('#game-stage canvas').boundingBox();
  await p.down({ x: bounds.x + bounds.width / 2, y: bounds.y + 10 });
  await p.move({ x: bounds.x + bounds.width / 2 + 70, y: bounds.y + 30 });
  await p.up();
  const s = await state(page);
  const a = s.nodes.find(node => node.screen.pickable && s.nodes.some(other => other.z < 3 && adjacent(node, other)));
  assert.ok(a, 'oblique fixture has a pickable boundary node');
  const rear = s.nodes.find(node => node.z < 3 && adjacent(a, node));
  assert.ok(a && rear, 'oblique fixture exposes a neighbor behind the front face');
  await p.down(a.screen);
  await p.move(between(a.screen, rear.screen, .8));
  const after = await state(page);
  assert.notEqual(after.dragConnection?.magnet?.nodeId, rear.id, 'rear nodes cannot provide a magnetic target');
  assert.deepEqual(after.edges, [], 'dragging toward a rear neighbor makes no rear connection');
  await p.cancel();
  await page.close();
}

async function magneticScenarios() {
  await magneticBehavior();
  await magneticBehavior({ depth: 4, mobile: true });
  await fullTargetDoesNotAttract();
  await rearTargetDoesNotAttract();
  const page = await fixture({ dragFollowMs: 90, dragMagnetResponseMs: 120 });
  const p = await pointer(page);
  const [a, b] = path(await state(page));
  await p.down(a.screen);
  await p.move(between(a.screen, b.screen, .65));
  const immediate = (await state(page)).dragConnection;
  await advance(page, 60);
  const midway = (await state(page)).dragConnection;
  assert.ok(midway.length > immediate.length && midway.length < .65 - .02,
    'configured following takes time to reach the pointer');
  await advance(page, 120);
  const approaching = (await state(page)).dragConnection;
  assert.ok(approaching.length > midway.length);
  await advance(page, 480);
  const settled = (await state(page)).dragConnection;
  assert.ok(Math.abs(settled.length - .65) < .01, 'following settles at the requested reach');
  assert.ok(expectMagnet(await state(page), b, 'smoothed attraction').strength > (approaching.magnet?.strength ?? 0),
    'configured magnetic response grows across frames');
  await capture(page, 'magnet-smoothed');
  await p.up();
  await advance(page, 1000);
  assert.equal((await state(page)).dragConnection, null);
  await page.close();
  await returnElasticity();
}

async function returnElasticity() {
  for (const dragElasticity of [0, 1]) {
    const duration = 520;
    const page = await fixture({ materialStyle: 'classic', dragElasticity, dragReturnMs: duration });
    const p = await pointer(page);
    const [a, b] = path(await state(page));
    const gap = Math.abs(b.screen.x - a.screen.x);
    const viewport = page.viewportSize();
    const diagonal = Math.min(gap * 2.5, viewport.width - a.screen.x - 16, viewport.height - a.screen.y - 16);
    await p.down(a.screen);
    await p.move({ x: a.screen.x + diagonal, y: a.screen.y + diagonal });
    const held = expectStrand(await state(page), a.id, 'long return strand');
    assert.ok(Math.abs(held.length - held.maxLength) < .001);
    const direction = held.end.map((value, i) => (value - held.start[i]) / held.length);
    await p.up();
    let elapsed = 0, lastAlong = held.length;
    const samples = [];
    for (const time of [52, 130, 260, 390, 494, 519]) {
      await advance(page, time - elapsed);
      elapsed = time;
      const s = await state(page), strand = s.dragConnection;
      assert.ok(strand?.returning, 'return remains active until its configured duration');
      assert.deepEqual(s.gum.pulses, [], 'Classic has no node pulse affecting the return assertion');
      const along = strand.end.reduce((sum, value, i) => sum + (value - strand.start[i]) * direction[i], 0);
      if (dragElasticity === 0) {
        assert.ok(along >= -1e-6, 'zero bounce stays on the original side of its anchor');
        assert.ok(along <= lastAlong + 1e-6, 'zero bounce retracts monotonically');
      }
      lastAlong = along;
      samples.push({ elapsed, along, visible: strand.visible });
      if (time === 130) await capture(page, `return-bounce-${dragElasticity}`);
    }
    if (dragElasticity === 1) assert.ok(samples.some(sample => sample.along < -.2 && sample.visible),
      'full bounce visibly crosses the anchor with a long strand');
    await advance(page, 1);
    assert.equal((await state(page)).dragConnection, null, 'return finishes at exactly its configured duration');
    assert.deepEqual((await state(page)).edges, [], 'recoil never changes the puzzle');
    observations.push({ label: `return-bounce-${dragElasticity}-trajectory`, samples });
    await page.close();
  }
}

async function tinyTip() {
  const existing = [[0, 1]];
  const page = await fixture({ difficulty: 'medium', edges: existing, dragTipSize: .015 });
  const p = await pointer(page);
  const [a, b] = path(await state(page));
  await p.down(a.screen);
  await p.move(midpoint(a.screen, b.screen));
  const s = await state(page), strand = expectStrand(s, a.id, 'small drag tip');
  assert.ok(strand.tipRadius > 0 && strand.tipRadius < strand.radius,
    'the fixture exercises a tip smaller than the strand neck');
  assert.ok(Math.abs(strand.length - .5) < .01);
  assert.deepEqual(s.edges.map(key), existing.map(key), 'the small-tip preview does not alter existing connections');
  await capture(page, 'tiny-tip-held');
  await p.up();
  assert.equal((await state(page)).dragConnection?.returning, true);
  await advance(page, 1000);
  assert.equal((await state(page)).dragConnection, null, 'the small tip clears after retraction');
  assert.deepEqual((await state(page)).edges.map(key), existing.map(key));
  await p.down(a.screen);
  await p.move(b.screen);
  await p.up();
  await advance(page, 1000);
  assert.equal((await state(page)).edges.length, 2, 'normal connection joins still commit with the small-tip setting');
  assert.equal((await state(page)).dragConnection, null);
  await capture(page, 'tiny-tip-committed');
  await page.close();
}

async function fullSource(mobile) {
  const existing = [[1, 0], [0, 4]];
  const page = await fixture({ difficulty: 'medium', edges: existing, mobile });
  const p = await pointer(page, mobile);
  const initial = await state(page);
  const full = initial.nodes.find(node => node.id === 1);
  const connected = initial.nodes.find(node => node.id === 0);
  const available = initial.nodes.find(node => node.id === 5);
  const label = `full-source-${mobile ? 'touch' : 'mouse'}`;
  assert.equal(full.remaining, 0);
  assert.equal(connected.remaining, 0, 'both ends of the removable link start full');

  await p.down(full.screen);
  await p.move(midpoint(full.screen, available.screen));
  let s = await state(page);
  assert.equal(s.dragConnection, null, 'a full node provides neither a free strand nor a magnetic nub');
  assert.deepEqual(s.edges.map(key).sort(), existing.map(key).sort(), 'empty-space dragging from a full node edits nothing');
  await capture(page, `${label}-blocked`);
  await p.up();
  assert.equal((await state(page)).dragConnection, null, 'releasing the blocked pull creates no recoil');

  await p.down(full.screen);
  await p.move(connected.screen);
  s = await state(page);
  assert.deepEqual(s.edges.map(key), [key([0, 4])], 'starting at a full node still removes an existing link');
  assert.equal(s.nodes.find(node => node.id === connected.id).remaining, 1);
  const gap = Math.abs(full.screen.x - connected.screen.x);
  await p.move({ x: connected.screen.x + gap * .34, y: connected.screen.y - gap * .34 });
  expectStrand(await state(page), connected.id, 'newly freed current anchor');
  await capture(page, `${label}-freed`);
  await p.up();
  await advance(page, 1000);
  assert.deepEqual((await state(page)).edges.map(key), [key([0, 4])]);

  await p.down(connected.screen);
  await p.move(midpoint(connected.screen, full.screen));
  expectStrand(await state(page), connected.id, 'before filling the next node');
  await p.move(full.screen);
  s = await state(page);
  assert.equal(s.nodes.find(node => node.id === full.id).remaining, 0);
  assert.equal(s.dragConnection, null, 'arriving at a now-full node immediately ends the provisional strand');
  await p.move(midpoint(full.screen, available.screen));
  assert.equal((await state(page)).dragConnection, null, 'continuing into empty space cannot pull from the full anchor');
  await capture(page, `${label}-arrived-full`);
  await p.up();
  assert.equal((await state(page)).dragConnection, null, 'release after a full-node arrival creates no recoil');
  await advance(page, 1000);
  assert.deepEqual((await state(page)).edges.map(key).sort(), existing.map(key).sort());
  await page.close();
}

async function fullSourceScenarios() {
  await fullSource(false);
  await fullSource(true);
  await fullTargetDoesNotAttract();
}

try {
  const scenarios = {
    'flat-mouse': () => interaction({ depth: 1, mobile: false }),
    'cube-mouse': () => interaction({ depth: 4, mobile: false }),
    'flat-touch': () => interaction({ depth: 1, mobile: true }),
    reduced: () => instantReturn({ reduced: true }, 'reduced motion'),
    instant: () => instantReturn({ dragReturnMs: 0 }, 'zero return duration'),
    redraw: redrawCancellation,
    magnet: magneticScenarios,
    'tiny-tip': tinyTip,
    'full-source': fullSourceScenarios,
  };
  const selected = process.argv.includes('--redraw-only') ? 'redraw' :
    process.argv.includes('--magnet-only') ? 'magnet' : process.env.TEST_DRAG_CASE;
  if (selected) assert.ok(scenarios[selected], 'requested drag scenario exists');
  for (const [name, run] of Object.entries(scenarios)) if (!selected || name === selected) await run();
  assert.deepEqual(errors, [], 'no browser or renderer errors');
  console.log(selected ? `Drag preview passed: ${selected}.` :
    'Drag preview passed: provisional strand, spring return, continuous connect/remove, cancellation, Flat/cube/touch, reduced motion, redraw, capped thinning and magnetic nubs.');
} finally {
  await fs.writeFile(`${out}/observations.json`, JSON.stringify(observations, null, 2));
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
}
