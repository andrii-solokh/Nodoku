import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/dot-animations';
await fs.mkdir(out, { recursive: true });
const originalConfig = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
const settings = { size: 4, depth: 1, difficulty: 'easy', seed: 123 };
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const click = (page, selector) => page.locator(selector).evaluate(element => element.click());
async function ready(page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { polling: 25 });
  await page.locator('#admin-settings').waitFor();
  // Fixtures freeze requestAnimationFrame so animation state can be advanced manually.
  // Dismiss the production splash, whose normal two-frame exit cannot run in that mode.
  await page.locator('#app-loader').evaluate(element => element.remove());
}
async function fixture({ style = 'glide', duration = 800, edges = [], reduced = false } = {}) {
  let savedConfig = structuredClone(originalConfig);
  savedConfig.scene.dotAnimation = style;
  savedConfig.scene.dotAnimationMs = duration;
  let revision = 'fixture-1';
  const writes = [];
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ settings, edges }) => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    if (!sessionStorage.getItem('dot-animation-fixture')) {
      sessionStorage.setItem('dot-animation-fixture', 'set');
      localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'playing', settings, game: { version: 1, settings, edges, history: [] } }));
    }
  }, { settings, edges });
  await page.route('**/api/admin/config', async route => {
    assert.equal(route.request().headers().authorization, `Bearer ${'a'.repeat(64)}`);
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      assert.equal(body.revision, revision);
      savedConfig = body.config;
      writes.push(structuredClone(body.config));
      revision = `fixture-${writes.length + 1}`;
    }
    await route.fulfill({ json: { config: savedConfig, revision } });
  });
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/completions', route => route.fulfill({ json: { recorded: true } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { scope: 'local', period: 'all', trackingSince: null, totals: { visitors: 1, puzzlesSolved: 0, nodesFilled: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.goto(`${url}/?admin=1#admin-token=${'a'.repeat(64)}`);
  await ready(page);
  await click(page, '#admin-close');
  return { page, writes };
}
function pair(s) {
  const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
  const a = [...s.nodes].sort((a, b) => b.remaining - a.remaining).find(node => node.remaining >= 3 && node.screen.pickable && s.nodes.some(other => other.remaining > 0 && other.screen.pickable && adjacent(node, other)));
  assert.ok(a, 'fixture includes a node that must rearrange multiple dots');
  return [a, s.nodes.find(node => node.remaining > 0 && node.screen.pickable && adjacent(a, node))];
}
async function connect(page, [a, b]) {
  await page.mouse.click(a.screen.x, a.screen.y);
  await page.mouse.click(b.screen.x, b.screen.y);
}

// Scene debug-state assertions are below; the browser still renders native Three.js meshes.
const nodeDots = (s, id) => {
  const result = s.dotAnimations.find(node => node.nodeId === id);
  assert.ok(result, `node ${id} exposes visual state`);
  return result;
};
const canonical = node => node.dots.map(dot => [dot.x, dot.y, dot.scale, dot.opacity]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
function noJump(before, after) {
  for (const dot of before.dots) {
    if (dot.opacity <= 0 || dot.scale <= 0) continue;
    const next = after.dots.find(candidate => candidate.id === dot.id);
    assert.ok(next, 'visible dot identity survives retarget');
    for (const key of ['x', 'y', 'scale', 'opacity']) assert.ok(Math.abs(next[key] - dot[key]) < 1e-6, `retarget does not jump ${key}`);
  }
}
function settled(s) {
  assert.ok(s.dotAnimations.every(node => !node.active), 'all dot transitions are settled');
  for (const visual of s.dotAnimations) {
    assert.equal(visual.count, s.nodes.find(node => node.id === visual.nodeId).remaining);
    assert.equal(visual.dots.length, visual.count, 'settled visual dot count matches clue');
    for (const dot of visual.dots) {
      assert.equal(dot.exiting, false);
      assert.equal(dot.opacity, 1);
      assert.equal(dot.scale, 1);
      assert.ok(Math.abs(dot.x - dot.targetX) < 1e-6 && Math.abs(dot.y - dot.targetY) < 1e-6, 'dot rests exactly at canonical target');
    }
  }
}
try {
  const midStyles = [];
  const finalStyles = [];
  for (const style of ['glide', 'spring', 'orbit', 'fade']) {
    const { page } = await fixture({ style });
    const initial = await state(page);
    settled(initial);
    const endpoints = pair(initial), id = endpoints[0].id;
    assert.equal(endpoints[0].remaining, 4, 'style fixture exercises four dots rearranging into three');
    await connect(page, endpoints);
    let s = await state(page);
    assert.equal(s.edges.length, 1, 'model connection updates before visual transition');
    assert.equal(s.nodes.find(node => node.id === id).remaining, endpoints[0].remaining - 1);
    const started = nodeDots(s, id);
    assert.equal(started.active, true);
    assert.equal(started.style, style);
    assert.equal(started.durationMs, 800);
    assert.equal(started.progress, 0);
    assert.equal(s.musicNotes.length, 0, 'the experimental music-note particles stay off without their feature flag');
    assert.equal(s.musicScore.enabled, false, 'the music-score feature flag defaults off');
    assert.equal(s.musicScore.visible, false, 'the score stays hidden while the flag is off');
    await advance(page, 400);
    s = await state(page);
    const mid = nodeDots(s, id);
    assert.ok(mid.active && mid.progress > 0 && mid.progress < 1);
    assert.equal(s.musicNotes.length, 0, 'dot transitions do not start experimental score particles while disabled');
    assert.notDeepEqual(canonical(mid), canonical(nodeDots(initial, id)), 'dots move/fade while redistributing');
    const initialDots = nodeDots(initial, id).dots;
    assert.ok(mid.dots.some(dot => {
      const previous = initialDots.find(candidate => candidate.id === dot.id);
      return !dot.exiting && previous && Math.hypot(dot.x - previous.x, dot.y - previous.y) > .001;
    }), 'surviving dots actually move to redistribute the remaining clue');
    midStyles.push(JSON.stringify(canonical(mid)));
    await page.screenshot({ path: `${out}/${style}-mid.png` });
    const center = s.nodes.find(node => node.id === id).screen;
    await page.screenshot({ path: `${out}/${style}-detail.png`, clip: { x: Math.max(0, Math.min(980, center.x - 110)), y: Math.max(0, Math.min(630, center.y - 110)), width: 220, height: 220 } });
    await advance(page, 400);
    s = await state(page);
    settled(s);
    assert.equal(s.musicNotes.length, 0, 'no score particles remain while the feature is disabled');
    assert.equal(s.musicScore.notes.length, 0, 'no notation lands while the feature is disabled');
    finalStyles.push(canonical(nodeDots(s, id)));
    assert.equal(nodeDots(s, id).count, endpoints[0].remaining - 1);
    if (style === 'glide') {
      await click(page, '#undo-button');
      assert.equal(nodeDots(await state(page), id).active, true, 'increased dot count animates too');
      await advance(page, 800);
      settled(await state(page));
      assert.deepEqual(canonical(nodeDots(await state(page), id)), canonical(nodeDots(initial, id)), 'undo settles back to original arrangement');
      await click(page, '#redo-button'); await advance(page, 200);
      const live = nodeDots(await state(page), id);
      await click(page, '#undo-button');
      noJump(live, nodeDots(await state(page), id));
      await click(page, '#redo-button');
      noJump(live, nodeDots(await state(page), id));
      await advance(page, 800);
      settled(await state(page));
      assert.equal((await state(page)).edges.length, 1, 'rapid undo/redo keeps the latest model');
      await click(page, '#undo-button'); await advance(page, 160);
      await page.reload(); await ready(page); await click(page, '#admin-close');
      s = await state(page);
      assert.equal(s.edges.length, 0);
      settled(s);
      assert.deepEqual(canonical(nodeDots(s, id)), canonical(nodeDots(initial, id)), 'reload has canonical dots without replaying entrance');
    }
    await page.close();
  }
  assert.equal(new Set(midStyles).size, 4, 'four styles produce distinct intermediate visuals');
  for (const final of finalStyles) assert.deepEqual(final, finalStyles[0], 'all styles settle at the same canonical arrangement');

  for (const options of [{ duration: 0 }, { reduced: true }]) {
    const { page } = await fixture(options);
    const endpoints = pair(await state(page));
    await connect(page, endpoints);
    const s = await state(page);
    assert.equal(s.edges.length, 1);
    assert.equal(s.musicNotes.length, 0, 'instant and reduced-motion transitions do not create note particles');
    settled(s);
    await page.close();
  }

  const solution = new Puzzle(settings).solution;
  const { page: complete } = await fixture({ edges: solution.slice(0, -1) });
  let s = await state(complete);
  const last = solution.at(-1);
  await connect(complete, last.map(id => s.nodes.find(node => node.id === id)));
  s = await state(complete);
  assert.equal(s.solved, true, 'logical completion is immediate');
  for (const id of last) assert.equal(nodeDots(s, id).count, 0);
  await advance(complete, 400);
  s = await state(complete);
  assert.ok(last.every(id => nodeDots(s, id).active), 'last dots have a disappearance transition');
  await complete.screenshot({ path: `${out}/final-dots-mid.png` });
  await advance(complete, 400);
  s = await state(complete);
  settled(s);
  assert.ok(s.dotAnimations.every(node => node.count === 0 && node.dots.length === 0), 'zero dots leaves no stale visible meshes');
  await complete.close();

  const { page: admin, writes } = await fixture();
  await click(admin, '#admin-open');
  await admin.getByText('Node dots', { exact: true }).evaluate(element => element.click());
  assert.deepEqual(await admin.locator('#config-scene-dotAnimation option').evaluateAll(options => options.map(option => option.value)), ['glide', 'spring', 'orbit', 'fade']);
  await admin.locator('#config-scene-dotAnimation').selectOption('orbit');
  await admin.locator('#config-scene-dotAnimationMs').fill('720');
  assert.equal((await state(admin)).config.scene.dotAnimation, 'orbit');
  assert.equal((await state(admin)).config.scene.dotAnimationMs, 720);
  const downloading = admin.waitForEvent('download');
  await click(admin, '#admin-export');
  const exported = JSON.parse(await fs.readFile(await (await downloading).path(), 'utf8'));
  assert.equal(exported.scene.dotAnimation, 'orbit');
  assert.equal(exported.scene.dotAnimationMs, 720);
  await click(admin, '#admin-save');
  await admin.waitForFunction(() => document.querySelector('#admin-status').textContent.startsWith('Saved to'), null, { polling: 25 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].scene.dotAnimationMs, 720);
  await admin.locator('#config-scene-dotAnimation').selectOption('fade');
  await admin.locator('#config-scene-dotAnimationMs').fill('0');
  await click(admin, '#admin-reset');
  assert.equal((await state(admin)).config.scene.dotAnimation, 'orbit');
  assert.equal((await state(admin)).config.scene.dotAnimationMs, 720);
  await admin.reload(); await ready(admin);
  assert.equal((await state(admin)).config.scene.dotAnimation, 'orbit');
  assert.equal((await state(admin)).config.scene.dotAnimationMs, 720);
  settled(await state(admin));
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.getByText('Node dots', { exact: true }).evaluate(element => element.click());
  await admin.locator('#config-scene-dotAnimation').scrollIntoViewIfNeeded();
  await admin.screenshot({ path: `${out}/admin-mobile.png`, fullPage: true });
  assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile editor has no horizontal overflow');
  await admin.close();
  assert.deepEqual(errors, []);
  console.log('Passed: immediate model updates, feature-flagged music-score visuals, four dot styles and canonical settling, count decrease/increase, interruption continuity, final zero dots, initial/reload no entrance, reduced motion/zero duration, mocked admin live preview/export/save/reset/reload, mobile editor. No page errors.');
} finally { await browser.close(); }
