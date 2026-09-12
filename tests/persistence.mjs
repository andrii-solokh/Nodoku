import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/persistence';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const flat = { size: 4, depth: 1, difficulty: 'easy', seed: 123 };
const cube = { ...flat, depth: 4 };
const saved = (settings, edges = [], screen) => ({ settings, ...(screen ? { screen } : {}), game: { version: 1, settings, edges, history: [] } });
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const storage = page => page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')));
const settle = async page => { await page.evaluate(() => window.advanceTime(1000)); await page.waitForTimeout(350); };
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
async function ready(page) { await page.waitForFunction(() => typeof window.render_game_to_text === 'function'); }
async function reload(page) { await page.reload(); await ready(page); await settle(page); return state(page); }
async function fixture(value) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.addInitScript(value => {
    if (sessionStorage.getItem('persistence-fixture')) return;
    sessionStorage.setItem('persistence-fixture', 'set');
    if (value !== null) localStorage.setItem('nodoku.astra.v1', typeof value === 'string' ? value : JSON.stringify(value));
  }, value ?? null);
  await page.goto(url); await ready(page); await settle(page);
  return page;
}
function equalView(actual, expected, label) {
  assert.deepEqual(actual.direction, expected.direction, `${label}: orientation`);
  assert.deepEqual(actual.up, expected.up, `${label}: camera up`);
  assert.ok(Math.abs(actual.distance - expected.distance) < .01, `${label}: fixed camera distance`);
}
async function connect(page, a, b) {
  await page.mouse.click(a.screen.x, a.screen.y);
  await page.waitForTimeout(320);
  await page.mouse.click(b.screen.x, b.screen.y);
  await page.waitForTimeout(320);
}
try {
  const page = await fixture(saved(cube, [], 'home'));
  assert.equal((await state(page)).mode, 'home');
  await page.locator('#resume-button').click();
  let s = await state(page);
  assert.equal(s.selected, null, 'Continue preserves no selection in a legacy empty save');
  const front = s.nodes.filter(n => n.screen.pickable && n.remaining > 0);
  const a = front.find(n => front.some(other => adjacent(n, other)));
  const b = front.find(n => adjacent(a, n));
  await connect(page, a, b);
  assert.equal((await state(page)).edges.length, 1, 'real clicks connect nodes');
  await page.locator('[data-rotate="right"]').click(); await settle(page);
  const fixedDistance = s.view.distance;
  await page.locator('#game-stage canvas').focus();
  await page.keyboard.press('+'); await page.keyboard.press('+'); await page.mouse.wheel(0, -2000); await settle(page);
  s = await state(page);
  assert.ok(Math.abs(s.view.distance - fixedDistance) < 1e-8, 'saved games keep their fixed framing after zoom inputs');
  const selected = s.nodes.find(n => n.screen.pickable);
  await page.mouse.click(selected.screen.x, selected.screen.y); await page.waitForTimeout(320);
  s = await state(page);
  const restored = await reload(page);
  assert.equal(restored.mode, 'playing', 'refresh directly restores active game');
  assert.deepEqual(restored.settings, s.settings);
  assert.deepEqual(restored.edges, s.edges);
  assert.equal(restored.selected, s.selected, 'selection survives refresh');
  equalView(restored.view, s.view, 'active refresh');
  await page.screenshot({ path: `${out}/restored-active.png` });
  await page.locator('#home-button').click();
  assert.equal((await storage(page)).screen, 'home', 'Home explicitly persists its screen');
  assert.equal((await reload(page)).mode, 'home', 'home refresh stays home');
  await page.locator('#resume-button').click(); await settle(page);
  const continued = await state(page);
  assert.deepEqual(continued.edges, s.edges);
  assert.equal(continued.selected, s.selected, 'Home then Continue preserves the chosen node');
  equalView(continued.view, s.view, 'Home then Continue');
  await page.close();

  const path = await fixture(saved(flat));
  assert.equal((await state(path)).mode, 'playing', 'legacy unfinished save auto-resumes');
  s = await state(path);
  const row = [0, 1, 2, 3].map(y => s.nodes.filter(n => n.y === y).sort((a, b) => a.x - b.x))
    .find(nodes => nodes.every((n, i) => n.remaining >= (i === 0 || i === 3 ? 1 : 2)));
  assert.ok(row, 'fixture supports a three-edge drag');
  await path.mouse.move(row[0].screen.x, row[0].screen.y); await path.mouse.down();
  await path.mouse.move(row[3].screen.x, row[3].screen.y);
  assert.equal((await state(path)).edges.length, 3, 'held stroke contains three edges');
  // Navigate while the pointer is still held: the real pagehide must end/save it.
  const drawn = (await reload(path)).edges;
  await path.mouse.up();
  assert.equal(drawn.length, 3, 'pagehide saves the last held stroke');
  await path.locator('#undo-button').click();
  assert.equal((await state(path)).edges.length, 0, 'one undo removes the complete stroke');
  await reload(path);
  assert.equal(await path.locator('#redo-button').isEnabled(), true, 'redo survives refresh');
  await path.locator('#redo-button').click();
  assert.deepEqual((await state(path)).edges, drawn, 'redo restores the complete stroke');
  await path.close();

  const badView = await fixture({ ...saved(cube, [[0, 1]], 'playing'), view: { orientation: [null], zoom: 'invalid' } });
  assert.equal((await state(badView)).mode, 'playing', 'invalid view does not discard the saved board');
  assert.deepEqual((await state(badView)).edges, [[0, 1]]);
  assert.ok(Number.isFinite((await state(badView)).view.distance));
  await badView.close();

  const badMenu = await fixture({ ...saved(cube, [[0, 1]], 'playing'), settings: { ...cube, size: 2 } });
  const menuRestored = await state(badMenu);
  assert.equal(menuRestored.mode, 'playing', 'invalid menu preferences do not discard a valid game');
  assert.deepEqual(menuRestored.settings, cube);
  assert.deepEqual(menuRestored.edges, [[0, 1]]);
  const menuReloaded = await reload(badMenu);
  assert.equal(menuReloaded.mode, 'playing');
  assert.deepEqual(menuReloaded.settings, cube, 'valid game settings survive a second refresh');
  assert.deepEqual(menuReloaded.edges, [[0, 1]], 'valid game edges survive a second refresh');
  await badMenu.close();

  const empty = await fixture(null);
  await empty.locator('#start-button').click();
  const initial = await state(empty);
  assert.equal(initial.selected, null, 'A fresh empty game starts with no selected node');
  const emptyRestored = await reload(empty);
  assert.equal(emptyRestored.mode, 'playing', 'even a newly started empty game restores');
  assert.deepEqual(emptyRestored.edges, []);
  assert.deepEqual(emptyRestored.settings, initial.settings, 'empty game keeps its seed');
  assert.equal(emptyRestored.selected, null, 'An empty game keeps no selection after refresh');
  await empty.locator('[data-rotate="right"]').click(); await settle(empty);
  const deselected = await state(empty);
  assert.equal(deselected.selected, null);
  const restoredNull = await reload(empty);
  assert.equal(restoredNull.selected, null, 'An empty rotated game keeps no selection after refresh');
  equalView(restoredNull.view, deselected.view, 'Empty game with explicit null selection');
  await empty.locator('#home-button').click(); await reload(empty);
  await empty.locator('#resume-button').click(); await settle(empty);
  const continuedNull = await state(empty);
  assert.equal(continuedNull.selected, null, 'Home then Continue preserves explicit null selection');
  equalView(continuedNull.view, deselected.view, 'Empty game Continue');
  await empty.close();

  const solution = new Puzzle(flat).solution;
  const complete = await fixture(saved(flat, solution.slice(0, -1), 'playing'));
  s = await state(complete);
  await connect(complete, ...solution.at(-1).map(id => s.nodes.find(n => n.id === id)));
  await complete.waitForFunction(() => JSON.parse(window.render_game_to_text()).dialog === 'completion-dialog');
  const completed = await reload(complete);
  assert.equal(completed.solved, true);
  assert.equal(completed.dialog, 'completion-dialog', 'completed puzzle and completion return after refresh');
  assert.deepEqual(completed.edges, solution);
  await complete.screenshot({ path: `${out}/restored-completion.png` });
  await complete.locator('#next-button').click();
  const next = await state(complete);
  assert.notEqual(next.settings.seed, flat.seed);
  assert.equal(next.selected, null, 'Another puzzle starts with no selected node');
  const nextRestored = await reload(complete);
  assert.equal(nextRestored.dialog, null);
  assert.equal(nextRestored.solved, false);
  assert.deepEqual(nextRestored.settings, next.settings, 'Another puzzle becomes the persisted active game');
  assert.equal(nextRestored.selected, null, 'Another puzzle keeps no selection after refresh');
  await complete.close();

  for (const value of ['{broken', { screen: 'playing', game: null }, saved(flat, solution)]) {
    const invalid = await fixture(value);
    assert.equal((await state(invalid)).mode, 'home', 'invalid/missing game and legacy solved save fall back to home');
    await invalid.close();
  }
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('Passed: active board/selection/view refresh, explicit home and Continue view, legacy auto-resume, held stroke pagehide, grouped undo/redo across refresh, empty active game, solved completion refresh, next puzzle, invalid saves. No browser errors.');
  console.log(`Artifacts: ${out}/restored-active.png, ${out}/restored-completion.png`);
} finally { await browser.close(); }
