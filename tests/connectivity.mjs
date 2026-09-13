import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/connectivity';
await fs.mkdir(out, { recursive: true });
const settings = { size: 3, depth: 1, difficulty: 'hard', seed: 517 };
const edges = [[0, 1], [0, 3], [1, 2], [1, 4], [2, 5], [3, 4], [5, 8], [6, 7]];
const groups = [[6, 7], [0, 1, 2, 3, 4, 5, 8]];
const game = { version: 1, settings, edges, history: [] };
assert.equal(Puzzle.restore(game)?.disconnected, true, 'The fixture satisfies all degrees but remains disconnected');
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')));
const sortedEdges = edges => edges.map(edge => [...edge].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const advance = page => page.evaluate(() => window.advanceTime(800));
async function ready(page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await advance(page);
}
async function fixture(savedGame = game, viewport = { width: 1200, height: 850 }) {
  const page = await browser.newPage({ viewport });
  const completions = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: {
    period: new URL(route.request().url()).searchParams.get('period'), scope: 'local', trackingSince: '2026-09-10T00:00:00Z',
    totals: { visitors: 1, puzzlesSolved: completions.length, nodesFilled: completions.length * edges.length * 2, connectionsCompleted: completions.length * edges.length },
    daily: [], sizes: [], difficulties: [],
  } }));
  await page.route('**/api/completions', route => {
    completions.push(route.request().postDataJSON());
    return route.fulfill({ json: { recorded: true, scope: 'local' } });
  });
  await page.addInitScript(savedGame => {
    if (sessionStorage.getItem('connectivity-fixture')) return;
    sessionStorage.setItem('connectivity-fixture', 'set');
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'playing', settings: savedGame.settings, game: savedGame, sound: false, music: false }));
  }, savedGame);
  await page.goto(url); await ready(page);
  return { page, completions };
}
function assertHighlight(current, expected, label) {
  const highlight = current.network.highlight;
  assert.deepEqual([...highlight.nodeIds].sort((a, b) => a - b), expected, `${label}: only the requested component is highlighted`);
  const internalEdges = current.edges.filter(([a, b]) => expected.includes(a) && expected.includes(b));
  assert.deepEqual(sortedEdges(highlight.edges), sortedEdges(internalEdges), `${label}: exactly its internal connections are highlighted`);
  assert.equal(highlight.guidesVisible, false, `${label}: possible-neighbor guides do not disguise missing connections`);
  assert.deepEqual(highlight.nodes.filter(node => node.highlighted).map(node => node.id).sort((a, b) => a - b), expected, `${label}: actual node materials match the component`);
  const amber = color => {
    const red = parseInt(color.slice(0, 2), 16), green = parseInt(color.slice(2, 4), 16), blue = parseInt(color.slice(4, 6), 16);
    return red > green && green > blue;
  };
  assert.ok(highlight.nodes.filter(node => node.highlighted).every(node => amber(node.color)), `${label}: highlighted nodes use amber`);
  assert.ok(highlight.rods.filter(rod => rod.highlighted).every(rod => amber(rod.color)), `${label}: highlighted rods use amber`);
  assert.ok(highlight.nodes.filter(node => !expected.includes(node.id)).every(node => !node.highlighted), `${label}: other groups keep their normal materials`);
}
async function assertSeparated(page, expectedGroups = groups) {
  const current = await state(page);
  assert.equal(current.progress, 1, 'Every dot has been cleared');
  assert.ok(current.nodes.every(node => node.remaining === 0));
  assert.equal(await page.locator('#progress-value').textContent(), '100%');
  assert.equal(current.solved, false, 'Complete degrees alone never win');
  assert.equal(current.disconnected, true);
  assert.equal(current.dialog, null);
  assert.deepEqual(current.network.groups, expectedGroups);
  assert.equal(await page.locator('#network-status').isVisible(), true);
  assert.equal(await page.locator('#network-status-title').textContent(), `${expectedGroups.length} separate groups`);
  assert.equal(await page.locator('#network-status [role="status"]').getAttribute('aria-live'), 'polite');
  return current;
}
async function assertCleared(page) {
  const current = await state(page);
  assert.equal(await page.locator('#network-status').isVisible(), false, 'The notice clears when there are dots left to solve');
  assert.deepEqual(current.network.groups, []);
  assert.deepEqual(current.network.highlight.nodeIds, []);
  assert.deepEqual(current.network.highlight.edges, []);
  assert.equal(current.network.highlight.guidesVisible, true, 'Normal guides return after clearing the highlight');
  return current;
}
async function layout(page, label) {
  const result = await page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const button = document.querySelector('#network-group-button');
    const bounds = rect(button);
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      notice: rect(document.querySelector('#network-status')), stage: rect(document.querySelector('#game-stage')), button: bounds,
      toolbar: [...document.querySelectorAll('.game-toolbar button')].map(rect).filter(box => box.width > 0 && box.height > 0),
      hit: hit === button || button.contains(hit),
    };
  });
  await page.screenshot({ path: `${out}/${label}.png` });
  assert.ok(result.scrollWidth <= result.width + 1, `${label}: no horizontal overflow (${JSON.stringify(result)})`);
  assert.ok(result.notice.x >= 0 && result.notice.right <= result.width + 1 && result.notice.y >= 0 && result.notice.bottom <= result.height, `${label}: persistent notice fits the viewport`);
  assert.ok(result.stage.bottom <= result.notice.y + 1, `${label}: the board ends above the notice without overlap`);
  assert.ok(result.hit && result.button.height >= 40, `${label}: group control is visible and usable`);
  const overlap = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  assert.ok(result.toolbar.every(button => !overlap(button, result.notice)), `${label}: notice does not overlap toolbar controls`);
  if (result.width <= 600) assert.ok(result.notice.bottom <= Math.min(...result.toolbar.map(button => button.y)), `${label}: notice stays above the bottom toolbar`);
}
async function toggle(page, aId, bId) {
  let current = await state(page);
  const a = current.nodes.find(node => node.id === aId);
  assert.equal(a.screen.pickable, true, `Node ${aId} remains pickable`);
  await page.mouse.click(a.screen.x, a.screen.y); await page.waitForTimeout(320);
  current = await state(page);
  const b = current.nodes.find(node => node.id === bId);
  assert.equal(b.screen.pickable, true, `Node ${bId} remains pickable`);
  await page.mouse.click(b.screen.x, b.screen.y); await page.waitForTimeout(320);
  await advance(page);
}
try {
  const { page, completions } = await fixture();
  let current = await assertSeparated(page);
  assertHighlight(current, groups[0], 'Automatic smallest group');
  assert.equal(await page.locator('#network-group-detail').textContent(), 'Highlighted group 1 · 2 nodes');
  assert.equal(await page.locator('#network-group-button').textContent(), 'Show group 1');
  await page.waitForTimeout(3800);
  await assertSeparated(page);
  assert.equal(completions.length, 0, 'Disconnected 100% does not count as a solved puzzle');
  await layout(page, 'disconnected-desktop');
  const originalGame = (await stored(page)).game;
  for (const [index, next] of [[0, 2], [1, 1], [0, 2]]) {
    await page.locator('#network-group-button').click(); await advance(page);
    current = await assertSeparated(page);
    assertHighlight(current, groups[index], `Group ${index + 1} focus`);
    assert.equal(await page.locator('#network-group-button').textContent(), `Show group ${next}`);
    assert.ok(current.nodes.some(node => groups[index].includes(node.id) && node.screen.pickable), 'Focused group has a reachable node');
    assert.deepEqual((await stored(page)).game, originalGame, 'Showing a group changes neither connections nor undo history');
  }
  const highlighted = (await state(page)).nodes.find(node => node.id === 6);
  await page.mouse.click(highlighted.screen.x, highlighted.screen.y); await page.waitForTimeout(320);
  current = await state(page);
  assert.equal(current.selected, 6, 'A highlighted dotless node can still be selected');
  assert.equal(current.network.highlight.nodes.find(node => node.id === 6).highlighted, false, 'Selection remains visually distinct from the amber group');
  await page.keyboard.press('Escape'); await advance(page);
  assertHighlight(await state(page), groups[0], 'After deselection');
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await advance(page);
    await layout(page, `disconnected-${width}`);
  }
  await page.setViewportSize({ width: 1200, height: 850 }); await advance(page);
  await toggle(page, 3, 4);
  const opened = await assertCleared(page);
  assert.equal(opened.edges.length, 7);
  await page.locator('#undo-button').click(); await advance(page);
  assertHighlight(await assertSeparated(page), groups[0], 'Undo restores disconnected guidance');
  await page.locator('#redo-button').click(); await advance(page);
  await assertCleared(page);
  await page.reload(); await ready(page);
  assert.deepEqual(sortedEdges((await assertCleared(page)).edges), sortedEdges(opened.edges), 'Refresh retains the edited board');
  await page.locator('#undo-button').click(); await advance(page);
  assertHighlight(await assertSeparated(page), groups[0], 'Persisted undo restores guidance');
  assert.deepEqual(sortedEdges((await state(page)).edges), sortedEdges(edges));
  await page.reload(); await ready(page);
  assertHighlight(await assertSeparated(page), groups[0], 'Disconnected guidance returns after refresh');
  await toggle(page, 3, 4);
  await toggle(page, 6, 7);
  await toggle(page, 3, 6);
  assert.equal((await state(page)).solved, false, 'The repair does not win until every dot is cleared again');
  assert.equal(completions.length, 0);
  await toggle(page, 4, 7);
  await page.locator('#completion-dialog').waitFor();
  current = await assertCleared(page);
  assert.equal(current.solved, true, 'Swapping the four real clicked edges produces one solved network');
  assert.equal(current.progress, 1);
  assert.equal(current.edges.length, 8);
  assert.equal(completions.length, 1, 'The repaired puzzle records one completion');
  assert.equal(Puzzle.restore(completions[0].game)?.solved, true, 'Statistics receives the actual repaired solved board');
  assert.match(await page.locator('.completion-share-preview').textContent(), /3 × 3.*8 connections/);
  assert.equal(await page.locator('.share-copy').isVisible(), true, 'The ordinary completion sharing controls remain available');
  await page.waitForTimeout(500); await advance(page);
  assert.equal(completions.length, 1, 'Settled completed frames do not count the repair again');
  await page.locator('#next-button').click(); await advance(page);
  current = await assertCleared(page);
  assert.equal(current.edges.length, 0);
  assert.equal(current.solved, false);
  await page.close();

  const cubeSettings = { size: 5, depth: 5, difficulty: 'hard', seed: 0 };
  const cubePuzzle = new Puzzle(cubeSettings);
  const removed = new Set(['18:19', '23:24']);
  const cubeEdges = cubePuzzle.solution.filter(edge => !removed.has([...edge].sort((a, b) => a - b).join(':'))).concat([[19, 24], [18, 23]]);
  const cubeGame = { version: 1, settings: cubeSettings, edges: cubeEdges, history: [] };
  const cubeModel = Puzzle.restore(cubeGame);
  assert.equal(cubeModel?.disconnected, true, 'A degree-preserving square swap makes a genuinely disconnected 5-cube');
  const cubeGroups = cubeModel.connectionGroups;
  assert.deepEqual(cubeGroups.map(group => group.length), [8, 90]);
  assert.deepEqual(cubeGroups[0], [19, 24, 44, 49, 69, 74, 99, 124]);
  const cube = await fixture(cubeGame);
  current = await assertSeparated(cube.page, cubeGroups);
  assertHighlight(current, cubeGroups[0], 'Five-cube smallest group');
  await cube.page.locator('#network-group-button').click(); await advance(cube.page);
  current = await assertSeparated(cube.page, cubeGroups);
  assert.ok(current.nodes.some(node => cubeGroups[0].includes(node.id) && node.screen.pickable), 'Show group turns the real cube toward an accessible component node');
  await layout(cube.page, 'disconnected-cube-desktop');
  await cube.page.setViewportSize({ width: 390, height: 844 }); await advance(cube.page);
  await layout(cube.page, 'disconnected-cube-390');
  await cube.page.locator('#network-group-button').click(); await advance(cube.page);
  assertHighlight(await assertSeparated(cube.page, cubeGroups), cubeGroups[1], 'Five-cube second group');
  assert.deepEqual(sortedEdges((await state(cube.page)).edges), sortedEdges(cubeEdges), 'Cube group inspection preserves all connections');
  assert.equal(cube.completions.length, 0);
  await cube.page.locator('#home-button').click(); await advance(cube.page);
  await assertCleared(cube.page);
  await cube.page.locator('#resume-button').click(); await advance(cube.page);
  assertHighlight(await assertSeparated(cube.page, cubeGroups), cubeGroups[0], 'Continue restores cube guidance');
  await cube.page.close();
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log('Passed: persistent disconnected 100%, amber groups/rods, group focus without edits, selectable nodes, mobile fit, removal/undo/redo/refresh, real edge-swap repair, completion/share/statistics once, fresh puzzle cleanup, genuine 5-cube groups and Continue.');
  console.log(`Artifacts: ${out}/disconnected-{desktop,390,320}.png and disconnected-cube-{desktop,390}.png`);
} finally { await browser.close(); }
