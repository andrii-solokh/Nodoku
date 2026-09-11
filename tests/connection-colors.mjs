import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/connection-colors';
await fs.mkdir(out, { recursive: true });
const defaults = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
const settings = { size: 3, depth: 1, difficulty: 'easy', seed: 0 };
const initialEdges = new Puzzle(settings).solution.slice(0, 8);
const custom = { nodeColor: '#e9b86e', completedColor: '#69bea6' };
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const savedGame = page => page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).game);
const key = edge => [...edge].sort((a, b) => a - b).join(':');
const sortedEdges = edges => edges.map(key).sort();
const advance = (page, ms = 2400) => page.evaluate(ms => window.advanceTime(ms), ms);
const rodFor = (current, edge) => current.connectionColors.find(rod => key(rod.edge) === key(edge));
const nodeFor = (current, id) => current.nodes.find(node => node.id === id);
const hex = color => color.replace('#', '').toLowerCase();

async function fixture(game = { version: 1, settings, edges: initialEdges, history: [] }) {
  const config = structuredClone(defaults);
  Object.assign(config.scene, { materialStyle: 'gum', connectionMs: 600, dotAnimationMs: 350, nodeFloatAmplitude: 0, shapeTransitionMs: 800 });
  Object.assign(config.demo, { timingMode: 'fixed', initialDelayMs: 100, stepDelayMs: 100 });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(game => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    if (sessionStorage.getItem('connection-colors-fixture')) return;
    sessionStorage.setItem('connection-colors-fixture', 'set');
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'playing', settings: game.settings, game, selected: null, sound: false, music: false }));
  }, game);
  await page.route('**/api/admin/config', route => {
    assert.equal(route.request().method(), 'GET', 'the test never writes the owner configuration');
    return route.fulfill({ json: { config, revision: 'connection-colors-fixture' } });
  });
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/completions', route => route.fulfill({ json: { recorded: true } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: {
    scope: 'local', period: 'all', trackingSince: '2026-09-11T00:00:00Z',
    totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [],
  } }));
  await page.goto(`${url}/?admin=1#admin-token=${'a'.repeat(64)}`);
  await ready(page);
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { polling: 25 });
  await page.locator('#config-scene-nodeColor').waitFor({ state: 'attached' });
  await page.locator('#admin-close').click();
  await advance(page);
}
function assertColors(current, label) {
  assert.deepEqual(sortedEdges(current.connectionColors.map(rod => rod.edge)), sortedEdges(current.edges), `${label}: every logical connection has one colored rod`);
  const types = new Set();
  for (const rod of current.connectionColors) {
    assert.deepEqual([rod.startNode, rod.endNode].sort((a, b) => a - b), [...rod.edge].sort((a, b) => a - b), `${label}: color orientation uses the actual endpoint nodes`);
    if (rod.highlighted) {
      assert.equal(rod.startColor, rod.endColor, `${label}: a highlighted rod stays solid`);
      const [red, green, blue] = rod.startColor.match(/../g).map(value => parseInt(value, 16));
      assert.ok(red > green && green > blue, `${label}: the disconnected-group override stays amber`);
      continue;
    }
    const startComplete = nodeFor(current, rod.startNode).remaining === 0;
    const endComplete = nodeFor(current, rod.endNode).remaining === 0;
    assert.equal(rod.startColor, hex(startComplete ? current.config.scene.completedColor : current.config.scene.nodeColor), `${label}: actual geometry start matches node ${rod.startNode}`);
    assert.equal(rod.endColor, hex(endComplete ? current.config.scene.completedColor : current.config.scene.nodeColor), `${label}: actual geometry end matches node ${rod.endNode}`);
    assert.equal(rod.centerColor, hex(current.config.scene.connectionColor), `${label}: every link blends through the connection accent`);
    if (startComplete === endComplete) assert.equal(rod.startColor, rod.endColor, `${label}: matching endpoints retain their shared node color`);
    types.add(`${startComplete ? 'C' : 'N'}${endComplete ? 'C' : 'N'}`);
  }
  return types;
}
async function toggle(page, a, b, settle = true) {
  await page.keyboard.press('Escape');
  for (const id of [a, b]) {
    const node = nodeFor(await state(page), id);
    assert.equal(node.screen.pickable, true, `Node ${id} accepts actual input`);
    await page.mouse.click(node.screen.x, node.screen.y);
    await page.waitForTimeout(320);
  }
  if (settle) await advance(page);
  return state(page);
}
async function controls(page, action) {
  await page.locator('#admin-open').click();
  await action();
  await page.locator('#admin-close').click();
  await advance(page);
}
async function setPalette(page, palette) {
  await controls(page, async () => {
    const summary = page.getByText('Connections and scene', { exact: true });
    if (!await summary.evaluate(element => element.parentElement.open)) await summary.click();
    for (const [name, color] of Object.entries(palette)) {
      await page.locator(`#config-scene-${name}`).evaluate((input, color) => {
        input.value = color;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, color);
    }
  });
}
async function setStyle(page, style) {
  await controls(page, () => page.locator(`#config-scene-materialStyle-${style}`).check());
}
async function gradientPixels(page) {
  const current = await state(page);
  const [a, b] = [0, 1].map(id => nodeFor(current, id));
  assert.equal(a.remaining, 0);
  assert.ok(b.remaining > 0);
  const screenshot = await page.screenshot({ path: `${out}/custom-gradient-classic.png` });
  const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const samples = [.33, .67].map(t => {
    const x = Math.round(a.screen.x + (b.screen.x - a.screen.x) * t);
    const y = Math.round(a.screen.y + (b.screen.y - a.screen.y) * t);
    const rgb = [0, 0, 0];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const offset = ((y + dy) * info.width + x + dx) * info.channels;
      for (let channel = 0; channel < 3; channel++) rgb[channel] += data[offset + channel] / 9;
    }
    return { x, y, rgb: rgb.map(Math.round) };
  });
  await fs.writeFile(`${out}/gradient-pixels.json`, JSON.stringify({ edge: [0, 1], samples }, null, 2));
  const [nearComplete, nearIncomplete] = samples.map(sample => sample.rgb[0] - sample.rgb[1]);
  assert.ok(nearIncomplete - nearComplete > 8, 'native rendered pixels become warmer toward the incomplete gold endpoint, not a single solid rod');
}

try {
  const page = await fixture();
  let current = await state(page);
  assert.deepEqual([...assertColors(current, 'Initial owner palette')].sort(), ['CC', 'CN', 'NC', 'NN'], 'the seeded board exercises all four ordered endpoint states');
  await page.screenshot({ path: `${out}/owner-gradient-gum.png` });
  const initialGame = await savedGame(page);
  await setPalette(page, custom);
  current = await state(page);
  assertColors(current, 'Live custom palette');
  assert.deepEqual(await savedGame(page), initialGame, 'live colors leave puzzle history untouched');
  await page.screenshot({ path: `${out}/custom-gradient-gum.png` });
  await setStyle(page, 'classic');
  assertColors(await state(page), 'Classic');
  await gradientPixels(page);
  await setStyle(page, 'gum');

  current = await toggle(page, 0, 1);
  assert.equal(current.edges.length, 7);
  assertColors(current, 'Removal recolors neighboring rods');
  current = await toggle(page, 1, 0, false);
  assert.equal(current.edges.length, 8);
  let reverse = rodFor(current, [0, 1]);
  const accent = hex(defaults.scene.connectionColor);
  assert.equal(reverse.startNode, 1, 'a reverse-direction gesture starts the physical rod at the higher node ID');
  assert.equal(reverse.endNode, 0);
  assert.notEqual(reverse.startColor, accent, 'the new connection keeps the source node color');
  assert.notEqual(reverse.endColor, accent, 'the new connection keeps the target node color');
  assert.equal(reverse.centerColor, accent, 'the new connection immediately carries the accent at its center');
  await advance(page, 200);
  current = await state(page);
  assert.ok(current.connectionAnimations.some(animation => key(animation.edge) === '0:1' && animation.progress > 0 && animation.progress < 1));
  reverse = rodFor(current, [0, 1]);
  assert.equal(reverse.centerColor, accent, 'the growing rod keeps its accent core');
  await page.screenshot({ path: `${out}/reverse-gradient-growing.png` });
  await advance(page);
  assertColors(await state(page), 'Reverse growth settles to its endpoint gradient');
  await page.locator('#undo-button').click(); await advance(page);
  assert.equal((await state(page)).edges.length, 7);
  assertColors(await state(page), 'Undo reverse connection');
  await page.locator('#redo-button').click(); await advance(page);
  assert.equal((await state(page)).edges.length, 8);
  assertColors(await state(page), 'Redo connection');

  const beforeNeighbor = await state(page);
  current = await toggle(page, 1, 4);
  assert.equal(nodeFor(current, 1).remaining, 0);
  assert.equal(nodeFor(current, 4).remaining, 0);
  assertColors(current, 'Completing adjacent nodes updates every existing rod');
  assert.notDeepEqual(rodFor(current, [1, 2]), rodFor(beforeNeighbor, [1, 2]), 'an existing neighboring rod updates without being recreated by an edge edit');
  const stored = await savedGame(page);
  await page.reload(); await ready(page);
  current = await state(page);
  assert.deepEqual(await savedGame(page), stored, 'reload preserves the edited puzzle and undo history');
  assertColors(current, 'Reload with owner colors');
  await page.locator('#undo-button').click(); await advance(page);
  current = await state(page);
  assert.equal(nodeFor(current, 1).remaining, 1);
  assertColors(current, 'Undo neighboring completion after reload');
  await page.locator('#redo-button').click(); await advance(page);
  assertColors(await state(page), 'Redo neighboring completion after reload');

  await page.close();
  assert.deepEqual(errors, [], 'no native shader, console, or page errors');
  console.log('Passed endpoint colors: all four states, native gradient pixels, owner/custom palettes, Gum/Classic, reverse growth, neighboring completion, and undo/redo/reload.');
  console.log(`Artifacts: ${out}`);
} finally {
  await browser.close();
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
}
