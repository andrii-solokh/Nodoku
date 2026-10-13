import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';
import defaults from '../config/game-config.json' with { type: 'json' };
import { followHint } from './helpers/follow-hint.mjs';

const gameUrl = new URL(process.env.TEST_URL || 'http://127.0.0.1:4173');
if (gameUrl.hostname === 'localhost') gameUrl.hostname = '127.0.0.1';
const out = 'output/web-game/embed';
await fs.mkdir(out, { recursive: true });
const editions = [
  { path: '/', name: 'Nodoku', key: 'nodoku.astra.v1', background: defaults.scene.background },
  { path: '/dots/', name: 'Dots', key: 'nodoku.dots.v1', background: '#07070b' },
  { path: '/groks/', name: 'Groks', key: 'nodoku.groks.v1', background: '#0e0f10' },
];
const sizes = [[640, 480], [480, 360], [432, 324], [320, 240]];
const topSettings = { size: 4, depth: 1, difficulty: 'easy', seed: 321 };
const topSave = JSON.stringify({ screen: 'playing', settings: topSettings, game: new Puzzle(topSettings).serialize(), sound: true });
const errors = [];

// localhost and 127.0.0.1 are different origins. These sandbox and allow
// attributes match the nested player iframe observed on X on 2026-10-13.
const server = http.createServer((request, response) => {
  const params = new URL(request.url, 'http://localhost').searchParams;
  if (!params.has('src')) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html><head><title>Player card host</title><style>html,body{margin:0}iframe{display:block;border:0}</style></head><body><iframe title="Nodoku player" width="${Number(params.get('width'))}" height="${Number(params.get('height'))}" src="${params.get('src').replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" sandbox="allow-popups allow-same-origin allow-scripts allow-presentation" allow="autoplay; fullscreen; web-share"></iframe></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const harnessUrl = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const state = frame => frame.evaluate(() => JSON.parse(window.render_game_to_text()));
const settle = async frame => {
  await frame.evaluate(() => window.advanceTime(1200));
  await frame.page().waitForTimeout(350);
};
const ready = async frame => {
  await frame.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await frame.locator('#app-loader').waitFor({ state: 'detached' });
  await settle(frame);
};

async function fixture(edition, [width, height], { game = null, denyStorage = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 650 } });
  page.on('pageerror', error => errors.push(`${edition.name} ${width}×${height}: ${error.message}`));
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    const json = pathname === '/api/auth/config' ? { enabled: false }
      : pathname === '/api/visitors' ? { count: 1, scope: 'local' }
        : pathname === '/api/sponsorship' ? { available: false, sponsors: [] }
          : pathname === '/api/completions' ? { recorded: true } : {};
    return route.fulfill({ json });
  });
  await page.addInitScript(({ origin, key, topSave, game, denyStorage }) => {
    if (location.origin !== origin || new URLSearchParams(location.search).get('embed') !== '1') return;
    if (denyStorage) {
      for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, {
        get() { throw new DOMException('Third-party storage is unavailable', 'SecurityError'); },
      });
      return;
    }
    if (sessionStorage.getItem('embed-regression-fixture')) return;
    sessionStorage.setItem('embed-regression-fixture', 'set');
    localStorage.setItem(key, topSave);
    if (game) localStorage.setItem(`${key}.embed`, JSON.stringify({ screen: 'playing', settings: game.settings, game, sound: false }));
  }, { origin: gameUrl.origin, key: edition.key, topSave, game, denyStorage });
  const src = new URL(`${edition.path}?embed=1`, gameUrl).href;
  const params = new URLSearchParams({ src, width: String(width), height: String(height) });
  await page.goto(`${harnessUrl}/?${params}`);
  const iframe = page.locator('iframe');
  const frame = await iframe.elementHandle().then(handle => handle.contentFrame());
  await ready(frame);
  assert.notEqual(new URL(page.url()).origin, new URL(frame.url()).origin, 'Player really runs across origins');
  assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument), null, 'Host cannot inspect the player document');
  assert.equal(await frame.locator('html').evaluate(el => el.classList.contains('embedded-player')), true);
  assert.equal((await state(frame)).mode, 'playing', 'Card opens directly into a playable puzzle');
  assert.equal(await frame.locator('.home-main').isHidden(), true, 'Puzzle setup stays hidden while playing');
  assert.equal(await frame.locator('#account-button, #leaderboard-button').count(), 0, 'Player directs account actions to the full game');
  assert.equal((await state(frame)).config.scene.background, edition.background, 'Edition keeps its theme');
  assert.equal(await frame.locator('#home-button').getAttribute('aria-label'), `${edition.name} home`);
  const open = frame.locator('.embed-open');
  assert.equal(await open.getAttribute('href'), edition.path, 'Full-game link leaves player mode');
  assert.equal(await open.getAttribute('target'), '_blank');
  return { page, frame, iframe };
}

async function layout(frame, label) {
  const overflow = await frame.evaluate(() => ({
    width: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight - innerHeight,
  }));
  assert.ok(overflow.width <= 1 && overflow.height <= 1, `${label}: player has no page overflow (${JSON.stringify(overflow)})`);
  for (const selector of ['#game-stage', '#undo-button', '#hint-button', '[data-rotate="right"]', '#help-button', '.embed-open']) {
    const rect = await frame.locator(selector).evaluate(el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0
      && rect.x + rect.width <= rect.viewportWidth + 1 && rect.y + rect.height <= rect.viewportHeight + 1,
    `${label}: ${selector} stays inside the player (${JSON.stringify(rect)})`);
  }
}

async function clickNode({ page, iframe }, node) {
  const offset = await iframe.boundingBox();
  await page.mouse.click(offset.x + node.screen.x, offset.y + node.screen.y);
}

async function connect(fixture) {
  const { frame } = fixture;
  const before = await state(frame);
  const visible = before.nodes.filter(node => node.screen.pickable && node.remaining > 0);
  const neighbors = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
  const a = visible.find(node => visible.some(other => neighbors(node, other)));
  const b = visible.find(node => neighbors(a, node));
  assert.ok(a && b, 'A visible neighboring pair is playable');
  await clickNode(fixture, a);
  assert.equal((await state(frame)).selected, a.id, 'Click selects a real node in the iframe');
  await fixture.page.waitForTimeout(320);
  await clickNode(fixture, b);
  await fixture.page.waitForTimeout(320);
  assert.equal((await state(frame)).edges.length, before.edges.length + 1, 'Second click connects the real graph');
}

try {
  for (const edition of editions) for (const size of sizes) {
    const test = await fixture(edition, size);
    const { page, frame } = test;
    const label = `${edition.name} ${size.join('×')}`;
    assert.equal((await state(frame)).audio.soundEnabled, false, 'Fresh cards are muted');
    const freshSettings = (await state(frame)).settings;
    assert.deepEqual({ size: freshSettings.size, depth: freshSettings.depth, difficulty: freshSettings.difficulty },
      { size: 3, depth: 3, difficulty: 'easy' }, 'Player ignores the top-level saved puzzle and uses fresh defaults');
    await layout(frame, label);
    await connect(test);
    await frame.locator('#undo-button').click();
    assert.equal((await state(frame)).edges.length, 0, 'Undo remains usable inside the card');
    await frame.locator('#redo-button').click();
    assert.equal((await state(frame)).edges.length, 1);
    const beforeRotation = (await state(frame)).view.direction;
    await frame.locator('[data-rotate="right"]').click();
    await settle(frame);
    assert.notDeepEqual((await state(frame)).view.direction, beforeRotation, 'Rotation is usable inside the card');
    const persisted = await state(frame);
    assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave, 'Player leaves top-level save intact');
    await frame.goto(frame.url());
    await ready(frame);
    assert.deepEqual((await state(frame)).edges, persisted.edges, 'Card reload restores its connections');
    assert.deepEqual((await state(frame)).view.direction, persisted.view.direction, 'Card reload restores its orientation');
    assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave);
    await frame.locator('#help-button').click();
    await frame.locator('#help-dialog').waitFor();
    assert.equal((await state(frame)).dialog, 'help-dialog', 'Help opens without replacing the puzzle with onboarding');
    await frame.locator('[data-close="help-dialog"]').first().click();
    assert.equal((await state(frame)).mode, 'playing');
    await layout(frame, `${label} after help`);
    await page.screenshot({ path: `${out}/${edition.name.toLowerCase()}-${size[0]}.png` });
    if (size[0] === 640) {
      await frame.locator('#home-button').click();
      await frame.locator('[data-depth="flat"]').click();
      await frame.locator('#start-button').click();
      await settle(frame);
      assert.equal((await state(frame)).settings.depth, 1, 'Home setup can start a flat player puzzle');
      assert.equal(await frame.locator('.home-main').isHidden(), true);
      assert.equal(await frame.locator('.rotation-tools').isHidden(), true, 'Flat puzzles keep rotation controls hidden');
      await connect(test);
      assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave, 'Flat setup also preserves the full-game save');
    }
    await page.close();
    console.log(`${label}: sandbox, theme, clicks, undo/redo, rotation, help, reload and isolated save passed`);
  }

  // Use the real puzzle model to get within one move of completion, then make
  // the suggested final move through browser pointer input in the iframe.
  for (const edition of editions) {
    const puzzle = new Puzzle({ size: 3, depth: 3, difficulty: 'easy', seed: 17 });
    for (const edge of puzzle.solution.slice(0, -1)) puzzle.toggle(...edge);
    const test = await fixture(edition, [320, 240], { game: puzzle.serialize() });
    const { page, frame, iframe } = test;
    await followHint({
      waitForFunction: frame.waitForFunction.bind(frame),
      evaluate: frame.evaluate.bind(frame),
      locator: frame.locator.bind(frame),
      mouse: { click: async (x, y) => {
        const offset = await iframe.boundingBox();
        await page.mouse.click(offset.x + x, offset.y + y);
      } },
    });
    const completion = frame.locator('#completion-dialog');
    await completion.waitFor();
    assert.equal((await state(frame)).solved, true);
    assert.equal(await completion.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Completion does not overflow horizontally');
    await frame.locator('#next-button').click();
    assert.equal((await state(frame)).solved, false, 'Next puzzle is reachable even in the smallest card');
    assert.notEqual((await state(frame)).settings.seed, 17);
    await layout(frame, `${edition.name} after completion`);
    assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave);
    await page.close();
  }

  for (const edition of editions) {
    const test = await fixture(edition, [480, 360], { denyStorage: true });
    await connect(test);
    await test.frame.locator('#undo-button').click();
    assert.equal((await state(test.frame)).edges.length, 0, 'Gameplay works when third-party storage is denied');
    await layout(test.frame, `${edition.name} with denied storage`);
    await test.page.close();
  }
  assert.deepEqual(errors, [], 'No uncaught browser errors in player frames');
  console.log('Passed: completion and next puzzle in all editions; denied third-party storage; no browser errors.');
} catch (error) {
  console.error(error);
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    console.error('Player failure:', JSON.stringify(await Promise.all(page.frames().map(async frame => ({
      url: frame.url(), text: await frame.locator('body').innerText().catch(() => ''),
    })))));
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  }
  throw error;
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2)).catch(error => console.error('Could not write browser error artifact:', error.message));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
