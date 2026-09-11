import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const errors = [];
const state = async page => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const advance = async (page, ms = 1000) => page.evaluate(value => window.advanceTime(value), ms);
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
function faceOf(s) {
  const axis = s.view.direction.reduce((best, value, index, values) => Math.abs(value) > Math.abs(values[best]) ? index : best, 0);
  const key = ['x', 'y', 'z'][axis];
  const coordinate = s.view.direction[axis] >= 0 ? s.settings.size - 1 : 0;
  return { key, coordinate, includes: node => s.settings.depth === 1 || node[key] === coordinate };
}
function checkEligibility(s, label) {
  const face = faceOf(s);
  const visible = s.nodes.filter(node => node.screen.pickable);
  assert.ok(visible.length > 0, `${label}: front nodes remain pickable`);
  assert.ok(visible.every(face.includes), `${label}: only the dominant face is pickable`);
  return face;
}
async function fixture(depth = 4, mobile = false) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 850 }, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.addInitScript(({ depth }) => {
    // Keep initial oblique orientation and all later motion deterministic.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    const settings = { size: 4, depth, difficulty: 'easy', seed: 123 };
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', settings, game: { version: 1, settings, edges: [], history: [] } }));
  }, { depth });
  await page.goto(url);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { polling: 25 });
  return page;
}
async function drag(page, a, b) {
  await page.mouse.move(a.screen.x, a.screen.y);
  await page.mouse.down();
  await page.mouse.move(b.screen.x, b.screen.y, { steps: 1 });
  await page.mouse.up();
}
function onlyFaceEdges(s, face, label) {
  const nodes = new Map(s.nodes.map(node => [node.id, node]));
  assert.ok(s.edges.every(([a, b]) => face.includes(nodes.get(a)) && face.includes(nodes.get(b))), `${label}: stroke must never connect another face`);
}

try {
  const page = await fixture();
  const home = await state(page);
  assert.equal(home.mode, 'home');
  assert.equal(home.view.snapped, false, 'Initial preview is oblique');
  checkEligibility(home, 'initial oblique preview');
  await page.locator('#resume-button').evaluate(element => element.click());
  const directions = [[], ['right'], ['right', 'right'], ['left'], ['up'], ['down']];
  const seen = new Set();
  for (const turns of directions) {
    await page.locator('#view-button').evaluate(element => element.click());
    await advance(page);
    for (const direction of turns) {
      await page.locator(`[data-rotate="${direction}"]`).evaluate(element => element.click());
      await advance(page);
    }
    let s = await state(page);
    console.log("Checking face", turns);
    const face = checkEligibility(s, `face ${turns.join('/') || 'front'}`);
    seen.add(`${face.key}:${face.coordinate}`);
    assert.equal(s.nodes.filter(node => node.screen.pickable).length, 16, 'All sixteen nodes on the empty front face remain selectable');
    // Visible gaps reveal other cube faces. Clicking their projected centers may
    // select an overlapping front node, but must never select a rear node.
    for (const node of s.nodes.filter(node => !face.includes(node)).slice(0, 6)) {
      await page.mouse.click(node.screen.x, node.screen.y);
      const after = await state(page);
      assert.ok(after.selected === null || face.includes(after.nodes.find(candidate => candidate.id === after.selected)), 'Off-face projection cannot select an off-face node');
      await page.keyboard.press('Escape');
    }
    s = await state(page);
    const front = s.nodes.filter(node => face.includes(node) && node.screen.pickable && node.remaining > 0);
    const pairs = front.flatMap(a => front.filter(b => a.id < b.id && adjacent(a, b)).map(b => [a, b]));
    assert.ok(pairs.length > 0);
    // Include boundary nodes: these have adjacent nodes receding behind the face,
    // which used to be caught by dense stroke sampling between intended nodes.
    const boundary = node => ['x', 'y', 'z'].some(key => key !== face.key && (node[key] === 0 || node[key] === 3));
    const candidates = pairs.filter(([a]) => boundary(a)).slice(0, 4);
    for (const [a, b] of candidates) {
      await drag(page, a, b);
      const after = await state(page);
      onlyFaceEdges(after, face, 'fast front-face drag');
      assert.ok(after.edges.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id)), 'Intended neighboring front nodes are connected');
      await drag(page, b, a);
      assert.deepEqual((await state(page)).edges, [], 'Dragging back in a fresh stroke removes the front-face link');
      await page.locator('#undo-button').evaluate(element => element.click());
      assert.deepEqual((await state(page)).edges, after.edges, 'Undo restores the removed front-face link');
      await page.locator('#undo-button').evaluate(element => element.click());
      await advance(page);
      assert.deepEqual((await state(page)).edges, []);
    }
  }
  assert.equal(seen.size, 6, 'Exercise all six coordinate faces');

  await page.locator('#view-button').evaluate(element => element.click());
  await advance(page);
  const board = await page.locator('#game-stage canvas').boundingBox();
  const before = await state(page);
  await page.mouse.move(board.x + board.width / 2, board.y + 10);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width / 2 + 50, board.y + 24);
  await page.mouse.up();
  const oblique = await state(page);
  assert.notDeepEqual(oblique.view.direction, before.view.direction, 'Empty-space drag still rotates the cube');
  assert.equal(oblique.view.snapped, false);
  const face = checkEligibility(oblique, 'manual oblique view');
  const nodes = oblique.nodes.filter(node => face.includes(node) && node.screen.pickable && node.remaining > 0);
  const exposedRear = oblique.nodes.filter(node => !face.includes(node) && node.screen.visible && node.remaining > 0);
  const a = nodes.find(node => nodes.some(other => adjacent(node, other)) && exposedRear.some(rear => adjacent(node, rear)));
  assert.ok(a, 'Fixture includes a front boundary node beside an exposed rear neighbor');
  const b = nodes.find(node => adjacent(a, node));
  const rear = exposedRear.find(node => adjacent(a, node));
  assert.ok(a && b && rear, 'Fixture includes a front boundary node beside an exposed rear neighbor');
  await page.mouse.move(a.screen.x, a.screen.y);
  await page.mouse.down();
  await page.mouse.move(rear.screen.x, rear.screen.y);
  assert.deepEqual((await state(page)).edges, [], 'Dragging directly across an adjacent rear node must not create a rear link');
  await page.mouse.move(b.screen.x, b.screen.y);
  const held = await state(page);
  assert.deepEqual(held.view.direction, oblique.view.direction, 'A node stroke must not jump to an active turn destination');
  assert.ok(held.edges.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id)), 'Continuing past the rear node connects the intended front neighbor');
  onlyFaceEdges(held, face, 'oblique held stroke');
  await mkdir('output/web-game/front-face', { recursive: true });
  await advance(page, 500);
  await page.screenshot({ path: 'output/web-game/front-face/oblique-stroke.png' });
  await page.keyboard.press('ArrowRight');
  await advance(page);
  const turned = await state(page);
  for (const target of turned.nodes.filter(node => node.screen.pickable).slice(0, 4)) {
    await page.mouse.move(target.screen.x, target.screen.y);
  }
  await page.mouse.up();
  assert.deepEqual((await state(page)).edges, held.edges, 'Manual camera changes cancel drawing until the held pointer is released');
  await page.close();

  const flat = await fixture(1);
  await flat.locator('#resume-button').evaluate(element => element.click());
  const flatState = await state(flat);
  assert.equal(flatState.nodes.filter(node => node.screen.pickable).length, flatState.nodes.length, 'Flat board retains all node targets');
  const aFlat = flatState.nodes.find(node => node.remaining > 0 && flatState.nodes.some(other => other.remaining > 0 && adjacent(node, other)));
  const bFlat = flatState.nodes.find(node => node.remaining > 0 && adjacent(aFlat, node));
  await drag(flat, aFlat, bFlat);
  assert.ok((await state(flat)).edges.length > 0, 'Flat drawing remains functional');
  await flat.close();

  const mobile = await fixture(4, true);
  await mobile.locator('#resume-button').evaluate(element => element.click());
  const client = await mobile.context().newCDPSession(mobile);
  const touch = (type, point) => client.send('Input.dispatchTouchEvent', {
    type, touchPoints: point ? [{ id: 0, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 }] : [],
  });
  const mobileBoard = await mobile.locator('#game-stage canvas').boundingBox();
  await touch('touchStart', { x: mobileBoard.width / 2, y: mobileBoard.y + 12 });
  await touch('touchMove', { x: mobileBoard.width / 2 + 45, y: mobileBoard.y + 24 });
  await touch('touchEnd');
  const mobileState = await state(mobile);
  const mobileFace = checkEligibility(mobileState, 'touch oblique view');
  const mobileNodes = mobileState.nodes.filter(node => mobileFace.includes(node) && node.screen.pickable && node.remaining > 0);
  const mobileA = mobileNodes.find(node => mobileNodes.some(other => adjacent(node, other)));
  const mobileB = mobileNodes.find(node => adjacent(mobileA, node));
  assert.ok(mobileA && mobileB);
  await touch('touchStart', mobileA.screen);
  await touch('touchMove', mobileB.screen);
  await touch('touchEnd');
  const mobileAfter = await state(mobile);
  assert.deepEqual(mobileAfter.view.direction, mobileState.view.direction, 'Touch drawing holds the touched orientation');
  assert.ok(mobileAfter.edges.length > 0, 'Touch drawing connects front neighbors');
  onlyFaceEdges(mobileAfter, mobileFace, 'touch oblique stroke');
  await advance(mobile, 500);
  await mobile.screenshot({ path: 'output/web-game/front-face/touch-oblique-stroke.png' });
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Front-face picking passed: six faces, mouse/touch oblique strokes, rejected rear crossing, empty-space rotation, flat board.');
} finally { await browser.close(); }
