import { toggleDemoSuspension } from './helpers/demo-suspension.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/node-floating';
await fs.mkdir(out, { recursive: true });
const defaults = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const closeEnough = (a, b, message) => assert.ok(a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) < 1e-6), `${message}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

async function fixture({ amplitude = .025, reduced = false, mobile = false } = {}) {
  const config = structuredClone(defaults);
  config.scene.nodeFloatAmplitude = amplitude;
  config.scene.nodeFloatPeriodMs = 6000;
  config.scene.shapeTransitionMs = 800;
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', settings: { size: 3, depth: 3, difficulty: 'easy', seed: 123 } }));
  });
  await page.route('**/api/admin/config', route => {
    assert.equal(route.request().method(), 'GET', 'test never writes the user config');
    return route.fulfill({ json: { config, revision: 'float-fixture' } });
  });
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { scope: 'local', period: 'all', trackingSince: '2026-09-10T00:00:00Z', totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.goto(`${url}/?admin=1#admin-token=${'a'.repeat(64)}`);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { polling: 25 });
  await page.locator('#config-scene-nodeFloatAmplitude').waitFor({ state: 'attached' });
  await page.locator('#admin-close').evaluate(button => button.click());
  assert.equal((await state(page)).config.scene.nodeFloatAmplitude, amplitude);
  return page;
}

const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
function frontPath(s) {
  const candidates = s.nodes.filter(node => node.screen.pickable && node.remaining > 0);
  for (const middle of candidates.filter(node => node.remaining >= 2)) {
    const ends = candidates.filter(node => adjacent(middle, node));
    if (ends.length >= 2) return [ends[0], middle, ends[1]];
  }
  assert.fail('fixture has a drawable path on the visible face');
}

function attached(s) {
  const f = s.floating;
  assert.ok(f && f.nodes.length > 0, 'floating debug state exposes actual scene nodes');
  for (const node of f.nodes) {
    assert.ok(Math.hypot(...node.offset) <= f.amplitude + 1e-6, 'float stays inside its small configured radius');
    closeEnough(node.visual, node.base.map((value, axis) => value + node.offset[axis]), 'visual position is canonical position plus the bounded offset');
    closeEnough(node.pips, node.visual, 'dot group stays attached to its sphere');
  }
  for (const rod of f.rods) {
    // A zero-progress rod is hidden and keeps a tiny nonzero cylinder scale.
    if (rod.progress === 0) continue;
    closeEnough(rod.start, rod.targetStart, 'rod starts at the floating endpoint');
    closeEnough(rod.end, rod.targetEnd, 'rod growth ends at its current floating endpoint');
  }
  if (f.selection) {
    const node = f.nodes.find(node => node.nodeId === f.selection.nodeId);
    assert.ok(node);
    closeEnough(f.selection.position, node.visual, 'selection ring follows the floating sphere');
  }
  assert.ok(f.guideCount > 0);
  assert.ok(f.guideMaxError < 1e-6, 'neighbor guides remain attached to floating nodes');
}

function changed(before, after) {
  assert.notEqual(after.floating.phase, before.floating.phase, 'idle time advances the float phase');
  assert.ok(after.floating.nodes.some(node => {
    const previous = before.floating.nodes.find(candidate => candidate.key === node.key);
    return previous && node.offset.some((value, axis) => Math.abs(value - previous.offset[axis]) > .001);
  }), 'at least one sphere visibly changes its offset');
  assert.ok(new Set(after.floating.nodes.map(node => JSON.stringify(node.offset))).size > 1, 'nodes have varied offsets rather than moving as one rigid board');
}

try {
  const page = await fixture();
  await toggleDemoSuspension(page);
  let s = await state(page);
  assert.equal(s.floating.active, true);
  assert.equal(s.floating.amplitude, .025);
  assert.equal(s.floating.periodMs, 6000);
  const cube = s;
  await advance(page, 1000); s = await state(page);
  attached(s); changed(cube, s);
  assert.deepEqual(s.nodes.map(({ x, y, z }) => [x, y, z]), cube.nodes.map(({ x, y, z }) => [x, y, z]), 'floating never alters the logical puzzle topology');
  assert.deepEqual(s.view.direction, cube.view.direction, 'idle floating does not rotate the camera');
  assert.equal(s.edges.length, 0, 'suspended demo adds no connections while nodes float');
  await page.screenshot({ path: `${out}/cube-floating.png` });

  await page.locator('[data-size="4"]').click();
  await page.locator('[data-depth="flat"]').click();
  await advance(page, 400);
  const morph = await state(page);
  assert.ok(morph.shapeTransition);
  attached(morph);
  await page.locator('[data-depth="3d"]').click();
  const reversed = await state(page);
  for (const node of morph.floating.nodes) {
    const next = reversed.floating.nodes.find(candidate => candidate.key === node.key);
    assert.ok(next, 'morph reversal retains each floating sphere');
    closeEnough(next.visual, node.visual, 'morph reversal does not jump floating positions');
  }
  await advance(page, 800); attached(await state(page));
  assert.equal((await state(page)).shapeTransition, null);
  await page.locator('[data-depth="flat"]').click(); await advance(page, 800);
  const flat = await state(page);
  await advance(page, 1000); s = await state(page);
  changed(flat, s); attached(s);
  assert.equal(s.nodes.length, 16);
  assert.ok(s.nodes.every(node => node.z === 0), 'floating flat board keeps its one-layer topology');
  await page.screenshot({ path: `${out}/flat-floating.png` });
  await toggleDemoSuspension(page);
  for (let i = 0; i < 160 && !(await state(page)).solved; i++) await advance(page, 500);
  assert.equal((await state(page)).solved, true, 'ambient floating does not block demo auto-solving');
  assert.equal((await state(page)).demo.phase, 'complete');

  await page.locator('[data-depth="3d"]').click();
  await page.locator('#start-button').click();
  await advance(page, 1300); s = await state(page);
  const path = frontPath(s);
  await page.mouse.move(path[0].screen.x, path[0].screen.y);
  await page.mouse.down();
  await page.mouse.move(path[1].screen.x, path[1].screen.y, { steps: 6 });
  await advance(page, 200);
  const movedEnd = (await state(page)).nodes.find(node => node.id === path[2].id);
  await page.mouse.move(movedEnd.screen.x, movedEnd.screen.y, { steps: 6 });
  await page.mouse.up();
  s = await state(page);
  assert.equal(s.edges.length, 2, 'real front-face drag connects the intended floating nodes');
  const normalize = edge => [...edge].sort((a, b) => a - b).join(':');
  assert.deepEqual(s.edges.map(normalize).sort(), [[path[0].id, path[1].id], [path[1].id, path[2].id]].map(normalize).sort(), 'floating does not create stray rear-face links');
  attached(s);
  await advance(page, 1000); s = await state(page); attached(s);
  assert.equal(s.floating.rods.length, 2);
  await page.keyboard.press('Escape');
  const selected = s.nodes.find(node => node.id === path[2].id);
  await page.mouse.click(selected.screen.x, selected.screen.y);
  assert.equal((await state(page)).selected, selected.id, 'real click selects a bobbing sphere');
  await advance(page, 250); s = await state(page); attached(s);
  assert.equal(s.floating.selection?.nodeId, selected.id);
  await page.close();

  for (const options of [{ amplitude: 0 }, { reduced: true }]) {
    const still = await fixture(options);
    await toggleDemoSuspension(still);
    const before = await state(still);
    await advance(still, 2000);
    const after = await state(still);
    assert.equal(after.floating.active, false, 'zero/reduced motion disables ambient motion');
    assert.ok(after.floating.nodes.every(node => node.offset.every(value => value === 0)), 'disabled floating rests on canonical coordinates');
    assert.deepEqual(after.floating.nodes, before.floating.nodes, 'disabled floating remains still over time');
    attached(after);
    await still.close();
  }
  const mobile = await fixture({ mobile: true });
  await toggleDemoSuspension(mobile);
  await advance(mobile, 1100); attached(await state(mobile));
  await mobile.screenshot({ path: `${out}/mobile-floating.png`, fullPage: true });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'floating does not widen the mobile page');
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Passed: bounded varied idle cube/flat motion, stable topology, attached dots/rods/guides/selection, morph reversal, demo completion, accurate real drag/click, zero/reduced motion, and mobile layout. No page errors.');
} finally { await browser.close(); await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2)); }
