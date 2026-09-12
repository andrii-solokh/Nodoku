import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/shape-transition';
await fs.mkdir(out, { recursive: true });
const originalConfig = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const depth = (page, value) => page.locator(`[data-depth="${value}"]`).click();
const resizeGrid = (page, value) => page.locator(`[data-size="${value}"]`).click();
const surfaceCount = (size, depth) => depth === 1 ? size * size : size ** 3 - Math.max(0, size - 2) ** 3;

async function fixture({ duration = 800, reduced = false, mobile = false, size = 4 } = {}) {
  const config = structuredClone(originalConfig);
  config.scene.shapeTransitionMs = duration;
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(size => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', settings: { size, depth: size, difficulty: 'easy', seed: 123 } }));
  }, size);
  await page.route('**/api/admin/config', route => {
    assert.equal(route.request().method(), 'GET', 'visual fixtures never save the user config');
    return route.fulfill({ json: { config, revision: 'shape-fixture' } });
  });
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: {
    scope: 'local', period: 'all', trackingSince: '2026-09-10T00:00:00Z',
    totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [],
  } }));
  await page.goto(`${url}/?admin=1#admin-token=${'a'.repeat(64)}`);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { polling: 25 });
  await page.locator('#config-scene-shapeTransitionMs').waitFor({ state: 'attached' });
  // This fixture freezes animation frames so it can advance the scene exactly.
  // Remove the production splash, whose normal two-frame dismissal cannot run.
  await page.locator('#app-loader').evaluate(element => element.remove());
  await page.locator('#admin-close').evaluate(button => button.click());
  assert.equal((await state(page)).config.scene.shapeTransitionMs, duration);
  return page;
}

function cameraUnchanged(before, after) {
  for (const key of ['direction', 'up']) assert.deepEqual(after.view[key], before.view[key], `retarget preserves camera ${key}`);
  assert.ok(Math.abs(after.view.distance - before.view.distance) < 1e-6, 'retarget preserves camera distance');
}
function settled(s, targetDepth, size = 4) {
  assert.equal(s.shapeTransition, null, 'finished shape transition releases its transient state');
  assert.equal(s.settings.depth, targetDepth);
  assert.equal(s.settings.size, size);
  const expected = surfaceCount(size, targetDepth);
  assert.equal(s.nodes.length, expected, 'settled board contains exactly its surface nodes');
  assert.ok(s.nodes.every(node => node.screen && Number.isFinite(node.screen.x) && Number.isFinite(node.screen.y)), 'settled node projection is valid');
  if (targetDepth === 1) assert.ok(s.nodes.every(node => node.z === 0), 'flat board has one logical layer');
}
function active(s, targetDepth, targetSize = 4, maxNodes = 56) {
  assert.ok(s.shapeTransition, 'shape has a visible transition');
  assert.equal(s.shapeTransition.toDepth, targetDepth);
  assert.equal(s.shapeTransition.toSize, targetSize);
  assert.equal(s.shapeTransition.durationMs, 800);
  assert.ok(s.shapeTransition.progress >= 0 && s.shapeTransition.progress < 1);
  assert.ok(s.shapeTransition.nodes.length <= maxNodes, 'transition retains a bounded set of surface spheres');
  assert.equal(new Set(s.shapeTransition.nodes.map(node => node.key)).size, s.shapeTransition.nodes.length, 'each spatial sphere has one stable identity');
  assert.equal(s.shapeTransition.nodes.filter(node => node.nodeId !== null).length, surfaceCount(targetSize, targetDepth), 'only destination nodes belong to the logical puzzle');
  for (const node of s.shapeTransition.nodes) {
    assert.ok(node.position.every(Number.isFinite));
    assert.ok(node.opacity >= 0 && node.opacity <= 1);
    assert.ok(node.scale.every(value => Math.abs(value - node.scale[0]) < 1e-6), 'node remains spherical throughout the shape change');
  }
}
function geometryUnchanged(before, after) {
  for (const node of before.shapeTransition.nodes.filter(node => node.opacity > 0)) {
    const next = after.shapeTransition.nodes.find(candidate => candidate.key === node.key);
    assert.ok(next, 'reversal keeps each visible sphere identity');
    for (const key of ['position', 'scale']) assert.deepEqual(next[key], node[key], `reversal preserves sphere ${key}`);
    assert.ok(Math.abs(next.opacity - node.opacity) < 1e-6, 'reversal preserves sphere opacity');
  }
}

try {
  const page = await fixture();
  const initial = await state(page);
  settled(initial, 4);
  await depth(page, 'flat');
  let s = await state(page);
  active(s, 1);
  assert.equal(s.shapeTransition.fromDepth, 4);
  assert.equal(s.shapeTransition.progress, 0);
  const collapseStart = s.shapeTransition;
  cameraUnchanged(initial, s);
  const delay = s.demo.delayMs;
  await advance(page, 400);
  s = await state(page);
  active(s, 1);
  assert.ok(s.shapeTransition.progress > 0 && s.shapeTransition.progress < 1);
  assert.equal(s.edges.length, 0, 'demo does not draw while the board changes shape');
  assert.equal(s.demo.delayMs, delay, 'shape animation preserves the demo reveal delay');
  assert.notDeepEqual(s.view.direction, initial.view.direction, 'camera moves smoothly toward the flat view');
  assert.ok(s.shapeTransition.nodes.some(node => Math.abs(node.position[2] - collapseStart.nodes.find(previous => previous.key === node.key).position[2]) > .1), 'depth layers visibly move toward the flat plane');
  assert.ok(s.shapeTransition.nodes.filter(node => node.nodeId === null).every(node => node.opacity > 0 && node.opacity < 1), 'departing cube layers fade during collapse');
  await page.screenshot({ path: `${out}/collapse-mid.png` });
  await advance(page, 400);
  s = await state(page);
  settled(s, 1);
  assert.deepEqual(s.view.direction, [0, 0, 1]);
  await page.screenshot({ path: `${out}/flat-settled.png` });

  await page.locator('#demo-toggle').click();
  const flat = await state(page);
  await depth(page, '3d');
  cameraUnchanged(flat, await state(page));
  await advance(page, 400);
  s = await state(page);
  active(s, 4);
  assert.ok(s.shapeTransition.nodes.some(node => Math.abs(node.position[2]) > .1), 'expansion spreads flat spheres into depth');
  assert.ok(s.shapeTransition.nodes.some(node => node.opacity > 0 && node.opacity < 1), 'new layers fade in during expansion');
  assert.equal(s.demo.phase, 'paused', 'shape changes retain the manual demo pause');
  await page.screenshot({ path: `${out}/expand-mid.png` });
  await depth(page, 'flat');
  const reversed = await state(page);
  active(reversed, 1);
  cameraUnchanged(s, reversed);
  geometryUnchanged(s, reversed);
  await advance(page, 200);
  const midReverse = await state(page);
  await depth(page, '3d');
  const reexpanded = await state(page);
  cameraUnchanged(midReverse, reexpanded);
  geometryUnchanged(midReverse, reexpanded);
  await advance(page, 800);
  settled(await state(page), 4);
  await advance(page, 5000);
  assert.equal((await state(page)).edges.length, 0, 'paused demo cannot add stale connections after a reversal');
  await page.locator('#demo-toggle').click();
  for (let i = 0; i < 50 && (await state(page)).edges.length === 0; i++) await advance(page, 100);
  assert.ok((await state(page)).edges.length > 0, 'demo resumes after shape settles');

  await depth(page, 'flat'); await advance(page, 160);
  const beforeSizeRetarget = await state(page);
  await resizeGrid(page, 5);
  const sizeRetarget = await state(page);
  active(sizeRetarget, 1, 5, 81);
  assert.equal(sizeRetarget.shapeTransition.fromSize, 4);
  cameraUnchanged(beforeSizeRetarget, sizeRetarget);
  geometryUnchanged(beforeSizeRetarget, sizeRetarget);
  await advance(page, 800);
  settled(await state(page), 1, 5);
  await depth(page, '3d'); await advance(page, 160);
  await page.locator('[data-difficulty="medium"]').click();
  settled(await state(page), 5, 5);
  await depth(page, 'flat'); await advance(page, 160);
  await page.locator('#start-button').click();
  s = await state(page);
  assert.equal(s.mode, 'playing');
  settled(s, 1, 5);
  assert.equal(s.demo, null);
  await advance(page, 4000);
  assert.equal((await state(page)).edges.length, 0, 'starting during transition cancels old demo moves');
  const node = (await state(page)).nodes.find(node => node.screen.pickable && node.remaining > 0);
  await page.mouse.click(node.screen.x, node.screen.y);
  assert.equal((await state(page)).selected, node.id, 'the new board accepts real pointer input');
  await page.close();

  const sizing = await fixture({ size: 3 });
  settled(await state(sizing), 3, 3);
  await advance(sizing, 1000);
  assert.ok((await state(sizing)).edges.length > 0, 'the size test starts with a demo that has made progress');
  const beforeGrowth = await state(sizing);
  await resizeGrid(sizing, 4);
  let growing = await state(sizing);
  active(growing, 4, 4, 82);
  assert.equal(growing.shapeTransition.fromSize, 3);
  assert.equal(growing.shapeTransition.fromDepth, 3);
  cameraUnchanged(beforeGrowth, growing);
  assert.equal(growing.edges.length, 0, 'changing size resets previous demo connections immediately');
  const growthStart = growing.shapeTransition;
  const growthDelay = growing.demo.delayMs;
  await advance(sizing, 400);
  growing = await state(sizing);
  active(growing, 4, 4, 82);
  assert.equal(growing.edges.length, 0, 'demo connections wait during a size change');
  assert.equal(growing.demo.delayMs, growthDelay, 'size changes do not consume the next demo delay');
  assert.ok(growing.shapeTransition.nodes.some(node => node.position.some((value, axis) => Math.abs(value - growthStart.nodes.find(previous => previous.key === node.key).position[axis]) > .05)), 'size growth visibly moves spheres');
  assert.ok(growing.shapeTransition.nodes.some(node => node.opacity > 0 && node.opacity < 1), 'size growth fades changing layers');
  await sizing.screenshot({ path: `${out}/cube-size-grow-mid.png` });
  await advance(sizing, 400); settled(await state(sizing), 4, 4);
  await resizeGrid(sizing, 5);
  active(await state(sizing), 5, 5, 154);
  await advance(sizing, 800); settled(await state(sizing), 5, 5);
  await resizeGrid(sizing, 3); await advance(sizing, 400);
  let shrinking = await state(sizing);
  active(shrinking, 3, 3, 124);
  await sizing.screenshot({ path: `${out}/cube-size-shrink-mid.png` });
  // Retarget repeatedly before completion; visible geometry and the camera
  // continue from their current positions instead of snapping to either end.
  for (const target of [5, 4, 3]) {
    const before = await state(sizing);
    await resizeGrid(sizing, target);
    const after = await state(sizing);
    active(after, target, target, 180);
    cameraUnchanged(before, after);
    geometryUnchanged(before, after);
    await advance(sizing, 160);
  }
  await advance(sizing, 800); settled(await state(sizing), 3, 3);
  await sizing.locator('#demo-toggle').click();
  const beforeFlat = await state(sizing);
  await depth(sizing, 'flat');
  let flatSize = await state(sizing);
  active(flatSize, 1, 4, 42);
  assert.equal(flatSize.shapeTransition.fromSize, 3, 'Cube3 to Flat4 animates the automatic size increase');
  assert.equal(flatSize.shapeTransition.fromDepth, 3);
  cameraUnchanged(beforeFlat, flatSize);
  await advance(sizing, 400);
  await sizing.screenshot({ path: `${out}/cube3-flat4-mid.png` });
  await advance(sizing, 400); settled(await state(sizing), 1, 4);
  await resizeGrid(sizing, 5); await advance(sizing, 400);
  flatSize = await state(sizing);
  active(flatSize, 1, 5, 41);
  assert.equal(flatSize.demo.phase, 'paused', 'size changes retain the manual pause');
  await sizing.screenshot({ path: `${out}/flat-size-grow-mid.png` });
  await resizeGrid(sizing, 4);
  const flatReversed = await state(sizing);
  active(flatReversed, 1, 4, 41);
  cameraUnchanged(flatSize, flatReversed);
  geometryUnchanged(flatSize, flatReversed);
  await advance(sizing, 800); settled(await state(sizing), 1, 4);
  await resizeGrid(sizing, 5); await advance(sizing, 800);
  settled(await state(sizing), 1, 5);
  await advance(sizing, 4000);
  assert.equal((await state(sizing)).edges.length, 0, 'paused size changes leave no stale demo connections');
  await resizeGrid(sizing, 4); await advance(sizing, 160);
  await sizing.locator('[data-difficulty="medium"]').click();
  settled(await state(sizing), 1, 4);
  await resizeGrid(sizing, 5); await advance(sizing, 160);
  await sizing.locator('#start-button').click();
  settled(await state(sizing), 1, 5);
  assert.equal((await state(sizing)).mode, 'playing', 'starting interrupts a size transition on the latest board');
  await advance(sizing, 4000);
  assert.deepEqual((await state(sizing)).edges, [], 'interrupted size transitions never resume the demo in a game');
  await sizing.close();

  const resized = await fixture();
  await resized.locator('#demo-toggle').click();
  await depth(resized, 'flat'); await advance(resized, 800);
  await depth(resized, '3d'); await resizeGrid(resized, 5); await advance(resized, 400);
  const beforeResize = (await state(resized)).shapeTransition;
  await resized.setViewportSize({ width: 900, height: 960 });
  // Explicit resize avoids depending on ResizeObserver scheduling with frozen RAF.
  await resized.evaluate(() => window.dispatchEvent(new Event('resize')));
  const afterResize = (await state(resized)).shapeTransition;
  assert.equal(afterResize.progress, beforeResize.progress, 'resize does not advance the transition');
  const distanceShift = afterResize.destinationDistance - beforeResize.destinationDistance;
  assert.ok(Math.abs(distanceShift) > .1, 'narrower viewport meaningfully changes destination camera distance');
  for (const key of ['destinationNear', 'destinationFar']) {
    assert.ok(Math.abs(afterResize.fog[key] - beforeResize.fog[key] - distanceShift) < 1e-6, 'destination fog follows the resized camera distance');
  }
  for (const key of ['near', 'far']) {
    assert.ok(Math.abs(afterResize.fog[key] - afterResize.cameraDistance - (beforeResize.fog[key] - beforeResize.cameraDistance)) < 1e-6, 'mid-transition haze stays consistent relative to the camera after resize');
  }
  await advance(resized, 399);
  const almostFinished = await state(resized);
  assert.ok(almostFinished.shapeTransition);
  await resized.screenshot({ path: `${out}/resized-nearly-finished.png` });
  await advance(resized, 1);
  const finished = await state(resized);
  settled(finished, 5, 5);
  for (const key of ['near', 'far']) {
    assert.ok(Math.abs(finished.view.fog[key] - almostFinished.view.fog[key]) < .001, 'fog has no discontinuity on the final transition frame');
    const destinationKey = key === 'near' ? 'destinationNear' : 'destinationFar';
    assert.ok(Math.abs(finished.view.fog[key] - afterResize.fog[destinationKey]) < 1e-6, 'settled haze matches the resized transition destination');
  }
  await resized.screenshot({ path: `${out}/resized-finished.png` });
  await resized.close();

  for (const options of [{ duration: 0 }, { reduced: true }]) {
    const instant = await fixture(options);
    await resizeGrid(instant, 5); settled(await state(instant), 5, 5);
    await resizeGrid(instant, 4); settled(await state(instant), 4, 4);
    await depth(instant, 'flat'); settled(await state(instant), 1);
    await resizeGrid(instant, 5); settled(await state(instant), 1, 5);
    await resizeGrid(instant, 4); settled(await state(instant), 1, 4);
    await depth(instant, '3d'); settled(await state(instant), 4);
    await instant.close();
  }
  const mobile = await fixture({ mobile: true });
  await depth(mobile, 'flat'); await advance(mobile, 400);
  active(await state(mobile), 1);
  await mobile.screenshot({ path: `${out}/mobile-collapse-mid.png`, fullPage: true });
  await advance(mobile, 400); settled(await state(mobile), 1);
  await resizeGrid(mobile, 5); await advance(mobile, 400);
  active(await state(mobile), 1, 5, 41);
  await mobile.screenshot({ path: `${out}/mobile-size-grow-mid.png`, fullPage: true });
  await advance(mobile, 400); settled(await state(mobile), 1, 5);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile transition does not widen the page');
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Passed: animated Cube3/4/5 and Flat4/5 size changes, Cube3 to Flat4, collapse/expand, camera/visible geometry continuity with bounded rapid retargets, resize/fog continuity, demo reset/wait/pause/resume, difficulty/start cancellation, settled topology, instant/reduced motion, mobile layout, and real game input. No page errors.');
} finally { await browser.close(); await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2)); }
