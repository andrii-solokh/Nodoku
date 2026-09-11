import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/gum-materials';
await fs.mkdir(out, { recursive: true });
const defaults = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
const browser = await chromium.launch();
const errors = [];
const uiOnly = process.argv.includes('--ui-only');
const adminSnapshots = new WeakMap();
const materialRadio = (page, style) => page.locator(`#config-scene-materialStyle-${style}`);
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const click = (page, selector) => page.locator(selector).evaluate(element => element.click());
const savedGame = page => page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).game);
const key = edge => [...edge].sort((a, b) => a - b).join(':');
const closeEnough = (a, b) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) < 1e-6);

async function fixture({ depth = 1, partial = false, reduced = false, keepAdminOpen = false } = {}) {
  const settings = { size: 3, depth, difficulty: 'easy', seed: 123 };
  const puzzle = new Puzzle(settings);
  const edges = partial ? puzzle.solution.slice(0, Math.max(1, Math.floor(puzzle.solution.length / 4))) : [];
  const config = structuredClone(defaults);
  Object.assign(config.scene, {
    materialStyle: 'gum', gooStretch: .65, gooGloss: .7,
    connectionMs: 480, dotAnimationMs: 480, rotationMs: 320, nodeFloatAmplitude: 0, shapeTransitionMs: 800,
  });
  Object.assign(config.demo, { initialDelayMs: 100, stepDelayMs: 150, revealDelayMs: 150, resumeDelayMs: 600 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(({ settings, edges }) => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({
      screen: 'playing', settings, selected: null,
      game: { version: 1, settings, edges, history: [] },
    }));
  }, { settings, edges });
  const admin = { config, revision: 'gum-fixture-0', writes: 0 };
  adminSnapshots.set(page, admin);
  await page.route('**/api/admin/config', route => {
    const method = route.request().method();
    assert.ok(method === 'GET' || method === 'PUT', 'only the in-memory configuration endpoint is exercised');
    if (method === 'PUT') {
      const body = route.request().postDataJSON();
      assert.equal(body.revision, admin.revision, 'Save submits the current revision');
      admin.config = body.config;
      admin.revision = `gum-fixture-${++admin.writes}`;
    }
    return route.fulfill({ json: { config: admin.config, revision: admin.revision } });
  });
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/completions', route => route.fulfill({ json: { recorded: true } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: {
    scope: 'local', period: 'all', trackingSince: null,
    totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [],
  } }));
  await page.goto(`${url}/?admin=1#admin-token=${'a'.repeat(64)}`);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { polling: 25 });
  await materialRadio(page, 'gum').waitFor({ state: 'attached' });
  if (!keepAdminOpen) await click(page, '#admin-close');
  assert.equal((await state(page)).mode, 'playing');
  assert.equal((await state(page)).gum.style, 'gum');
  return page;
}

function pair(s) {
  const placed = new Set(s.edges.map(key));
  const candidates = s.nodes.filter(node => node.screen.pickable && node.remaining > 0);
  for (const a of candidates) {
    const b = candidates.find(b => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1 && !placed.has(key([a.id, b.id])));
    if (b) return [a, b];
  }
  assert.fail('fixture has two available front-facing neighbors');
}

async function connect(page) {
  await page.keyboard.press('Escape');
  const before = await state(page), endpoints = pair(before);
  for (const node of endpoints) await page.mouse.click(node.screen.x, node.screen.y);
  const after = await state(page);
  assert.equal(after.edges.length, before.edges.length + 1, 'actual clicks add one immediate logical connection');
  assert.ok(after.edges.some(edge => key(edge) === key(endpoints.map(node => node.id))));
  return { before, after, ids: endpoints.map(node => node.id) };
}

function settled(s) {
  assert.deepEqual(s.gum.pulses, [], 'all finite gum pulses have settled');
  for (const node of s.gum.nodes) {
    const logical = s.nodes.find(candidate => candidate.id === node.id);
    const scale = s.config.scene.nodeScale * (logical.required === 0 ? .52 : 1);
    assert.ok(closeEnough(node.scale, [scale, scale, scale]), 'settled nodes return to their original sphere scale');
  }
}

async function openMaterials(page) {
  await click(page, '#admin-open');
  assert.equal(await materialRadio(page, 'gum').isVisible(), true, 'material cards remain directly available when Studio reopens');
}

async function materialControls() {
  const page = await fixture({ keepAdminOpen: true });
  const initialGame = await savedGame(page);
  const initialConfig = (await state(page)).config;
  assert.equal(await page.locator('#admin-fields > details > summary').first().textContent(), 'Gum materials', 'Gum materials is the first section on unlock');
  assert.equal(await materialRadio(page, 'gum').evaluate(input => input.closest('details').open), true, 'The material section opens automatically');
  for (const style of ['classic', 'gum']) {
    assert.equal(await materialRadio(page, style).isVisible(), true, `${style} is directly visible on unlock`);
    assert.equal(await materialRadio(page, style).getAttribute('type'), 'radio');
  }
  assert.equal(await materialRadio(page, 'classic').getAttribute('name'), await materialRadio(page, 'gum').getAttribute('name'), 'The cards form one native radio group');
  assert.equal(await materialRadio(page, 'gum').isChecked(), true);
  assert.equal(await materialRadio(page, 'classic').isChecked(), false);
  await page.screenshot({ path: `${out}/admin-gum-cards-desktop.png` });
  await materialRadio(page, 'classic').check();
  assert.equal((await state(page)).gum.style, 'classic', 'Classic immediately changes the rendered material');
  assert.equal(await materialRadio(page, 'gum').isChecked(), false);
  assert.equal(await page.locator('#admin-save').isEnabled(), true);
  await materialRadio(page, 'classic').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await materialRadio(page, 'gum').isChecked(), true, 'Arrow keys select the next native radio card');
  assert.equal((await state(page)).gum.style, 'gum', 'Keyboard selection also updates the live preview');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await materialRadio(page, 'classic').isChecked(), true);
  assert.equal((await state(page)).gum.style, 'classic');
  await page.locator('#admin-reset').click();
  assert.equal((await state(page)).gum.style, 'gum', 'Reset restores the saved preview style');
  assert.equal(await materialRadio(page, 'gum').isChecked(), true, 'Reset synchronizes the selected card');
  assert.equal(await materialRadio(page, 'classic').isChecked(), false);
  assert.equal(await page.locator('#admin-save').isDisabled(), true);

  await materialRadio(page, 'classic').check();
  await page.locator('#config-scene-gooStretch').fill('0.4');
  await page.locator('#config-scene-gooGloss').fill('0.9');
  const draft = (await state(page)).config;
  assert.deepEqual(draft, { ...initialConfig, scene: { ...initialConfig.scene, materialStyle: 'classic', gooStretch: .4, gooGloss: .9 } }, 'Card and numeric edits preserve every other setting');
  const downloadPending = page.waitForEvent('download');
  await page.locator('#admin-export').click();
  const download = await downloadPending;
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  assert.deepEqual(exported, draft, 'Download JSON contains the selected card and numeric controls');
  const savePending = page.waitForResponse(response => response.url().endsWith('/api/admin/config') && response.request().method() === 'PUT');
  await page.locator('#admin-save').click();
  assert.equal((await savePending).status(), 200);
  await page.waitForFunction(() => document.querySelector('#admin-status').textContent.startsWith('Saved to'), null, { polling: 25 });
  assert.equal(adminSnapshots.get(page).writes, 1, 'The save is handled by the in-memory fixture');
  assert.deepEqual(adminSnapshots.get(page).config, draft);
  assert.equal(await materialRadio(page, 'classic').isChecked(), true, 'Save leaves the saved card checked');
  assert.equal(await materialRadio(page, 'gum').isChecked(), false);
  await materialRadio(page, 'gum').check();
  assert.equal((await state(page)).gum.style, 'gum', 'Gum also immediately changes the rendered material');
  await page.locator('#admin-reset').click();
  assert.equal(await materialRadio(page, 'classic').isChecked(), true, 'Reset now restores the newly saved Classic choice');
  assert.equal((await state(page)).gum.style, 'classic');
  await materialRadio(page, 'gum').check();
  await page.locator('#admin-reload').click();
  await page.waitForFunction(() => document.querySelector('#admin-status').textContent === 'Loaded the current project file.', null, { polling: 25 });
  assert.equal(await materialRadio(page, 'classic').isChecked(), true, 'Reload synchronizes the card from the saved response');
  assert.deepEqual((await state(page)).config, draft);
  assert.deepEqual(await savedGame(page), initialGame, 'Preview, save, reset and reload preserve puzzle progress and history');

  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await advance(page, 50);
    await materialRadio(page, 'gum').scrollIntoViewIfNeeded();
    await materialRadio(page, 'gum').check();
    assert.equal((await state(page)).gum.style, 'gum');
    for (const style of ['classic', 'gum']) {
      const box = await materialRadio(page, style).locator('..').boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${width}: ${style} card is fully visible`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal page overflow`);
    await page.screenshot({ path: `${out}/admin-gum-cards-${width}.png` });
    await materialRadio(page, 'classic').check();
    assert.equal((await state(page)).gum.style, 'classic', `${width}: either card works on a narrow screen`);
  }
  await page.close();
  console.log('Passed material cards: visible on unlock, live Classic/Gum selection, numeric edits, in-memory save, reload/reset synchronization, JSON export, unchanged game state, and 320/390 layouts.');
}

try {
  await materialControls();
  if (!uiOnly) {
  const flat = await fixture();
  settled(await state(flat));
  const first = await connect(flat);
  assert.deepEqual(first.after.gum.pulses.map(pulse => pulse.id).sort((a, b) => a - b), [...first.ids].sort((a, b) => a - b));
  await advance(flat, 120);
  let s = await state(flat);
  assert.ok(s.gum.pulses.every(pulse => pulse.progress > 0 && pulse.progress < 1));
  assert.ok(first.ids.every(id => {
    const scale = s.gum.nodes.find(node => node.id === id).scale;
    return Math.max(...scale) - Math.min(...scale) > .001;
  }), 'connected spheres visibly squash and stretch during the pulse');
  const liveRod = s.gum.rods.find(rod => key(rod.edge) === key(first.ids));
  assert.ok(liveRod && liveRod.scale.every(value => Number.isFinite(value) && value > 0));
  assert.deepEqual(s.edges, first.after.edges, 'animation never alters logical connections');
  await flat.screenshot({ path: `${out}/gum-flat-pulse.png` });
  await advance(flat, 1200); s = await state(flat); settled(s);
  const restingRod = s.gum.rods.find(rod => key(rod.edge) === key(first.ids));
  assert.ok(Math.abs(liveRod.scale[0] - restingRod.scale[0]) > .00001, 'rod thickness also responds temporarily');
  await connect(flat); await advance(flat, 1200); settled(await state(flat));
  await flat.screenshot({ path: `${out}/gum-flat.png` });

  const game = await savedGame(flat);
  await openMaterials(flat);
  assert.deepEqual((await flat.locator('input[id^="config-scene-materialStyle-"]').evaluateAll(inputs => inputs.map(input => input.value))).sort(), ['classic', 'gum']);
  await flat.locator('#config-scene-gooGloss').fill('0');
  const matte = (await state(flat)).gum;
  await flat.locator('#config-scene-gooGloss').fill('1');
  const glossy = (await state(flat)).gum;
  assert.equal(glossy.gloss, 1);
  assert.ok(glossy.nodeRoughness < matte.nodeRoughness && glossy.rodRoughness < matte.rodRoughness, 'live gloss reduces surface roughness');
  assert.ok(glossy.nodeClearcoat > matte.nodeClearcoat, 'live gloss increases the node clearcoat');
  await materialRadio(flat, 'classic').check();
  assert.equal((await state(flat)).gum.style, 'classic');
  settled(await state(flat));
  assert.deepEqual(await savedGame(flat), game, 'style and gloss edits preserve puzzle topology and undo/redo history');
  await click(flat, '#admin-close');
  await flat.screenshot({ path: `${out}/classic-flat.png` });
  await connect(flat); settled(await state(flat));
  await openMaterials(flat);
  await materialRadio(flat, 'gum').check();
  await flat.locator('#config-scene-gooStretch').fill('0');
  await click(flat, '#admin-close');
  const noStretch = await connect(flat);
  assert.equal(noStretch.after.gum.stretch, 0);
  settled(noStretch.after);
  await openMaterials(flat);
  await flat.locator('#config-scene-gooStretch').fill('0.65');
  await flat.locator('#config-scene-gooGloss').fill('0.7');
  await click(flat, '#admin-close');
  await flat.setViewportSize({ width: 390, height: 844 });
  await advance(flat, 1000); settled(await state(flat));
  await flat.screenshot({ path: `${out}/gum-mobile.png`, fullPage: true });
  assert.ok(await flat.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'gum materials do not widen the mobile layout');
  await flat.close();

  const cube = await fixture({ depth: 3, partial: true });
  s = await state(cube); settled(s);
  assert.ok(s.edges.length > 0 && !s.solved, 'cube snapshot shows actual partial connections');
  await cube.screenshot({ path: `${out}/gum-cube.png` });
  const cubeGame = await savedGame(cube);
  await openMaterials(cube);
  await materialRadio(cube, 'classic').check();
  await click(cube, '#admin-close');
  await cube.screenshot({ path: `${out}/classic-cube.png` });
  assert.deepEqual(await savedGame(cube), cubeGame);
  await openMaterials(cube);
  await materialRadio(cube, 'gum').check();
  await click(cube, '#admin-close');
  await click(cube, '#home-button');
  for (let index = 0; index < 16 && (await state(cube)).edges.length < 2; index++) await advance(cube, 500);
  assert.ok((await state(cube)).edges.length >= 2, 'Gum pulses allow the landing demo to continue solving');
  await click(cube, '#demo-toggle');
  await advance(cube, 800);
  await click(cube, '[data-size="4"]');
  await click(cube, '[data-depth="flat"]');
  await advance(cube, 200);
  const collapsing = await state(cube);
  assert.equal(collapsing.gum.style, 'gum');
  assert.ok(collapsing.shapeTransition?.progress > 0 && collapsing.shapeTransition.progress < 1);
  assert.deepEqual(collapsing.edges, [], 'new shape owns a fresh demo without editing the saved game');
  await cube.screenshot({ path: `${out}/gum-morph.png` });
  await click(cube, '[data-depth="3d"]');
  const reversed = await state(cube);
  assert.equal(reversed.shapeTransition?.toDepth, 4);
  for (const node of collapsing.shapeTransition.nodes) {
    const next = reversed.shapeTransition.nodes.find(candidate => candidate.key === node.key);
    assert.ok(next && closeEnough(next.position, node.position), 'reversal retains the currently visible positions');
  }
  await advance(cube, 1000);
  s = await state(cube);
  assert.equal(s.shapeTransition, null);
  assert.equal(s.gum.style, 'gum');
  assert.equal(s.settings.depth, 4);
  assert.deepEqual(s.edges, []);
  assert.deepEqual(await savedGame(cube), cubeGame, 'preview morphing leaves player connections and history untouched');
  settled(s);
  await cube.close();

  const reduced = await fixture({ reduced: true });
  const still = await connect(reduced);
  assert.equal(still.after.gum.style, 'gum');
  settled(still.after);
  await advance(reduced, 120); settled(await state(reduced));
  await reduced.close();
  console.log('Passed: native Gum rendering, real click pulses and settling, rod response, flat/cube/classic captures, live gloss/stretch controls, unchanged puzzle history, demo progression, morph reversal, reduced motion, and mobile layout.');
  }
  assert.deepEqual(errors, [], 'native material shaders compile and render without console or page errors');
} finally {
  await browser.close();
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
}
