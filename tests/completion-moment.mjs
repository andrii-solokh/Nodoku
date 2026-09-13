import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';
import { followHint } from './helpers/follow-hint.mjs';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
await mkdir('output/web-game/completion-moment', { recursive: true });
const browser = await (process.env.TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  for (const width of (process.env.TEST_WIDTHS || '1440,1200,390,320').split(',').map(Number)) {
    const settings = { size: 3, depth: 3, difficulty: 'easy', seed: 17 };
    const puzzle = new Puzzle(settings);
    for (const edge of puzzle.solution.slice(0, -1)) puzzle.toggle(...edge);
    const page = await browser.newPage({ viewport: { width, height: 850 }, hasTouch: width < 700 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let completions = 0;
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/completions') { completions++; return route.fulfill({ json: { recorded: true } }); }
      return route.fulfill({ json: {} });
    });
    await page.addInitScript(game => localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'playing', settings: game.settings, game, sound: false, music: false })), puzzle.serialize());
    await page.goto(url);
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
    const layout = () => page.evaluate(() => ['#game-stage', '.puzzle-melody', '.game-main .rotation-tools'].map(selector => {
      const el = document.querySelector(selector);
      const { x, y, width, height } = el.getBoundingClientRect();
      return { selector, x, y, width, height };
    }));
    const beforeCompletion = await layout();
    await followHint(page);
    const panel = page.locator('#completion-dialog');
    await panel.waitFor();
    await page.waitForTimeout(400);
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const initial = await state();
    assert.equal(initial.solved, true);
    assert.equal(await page.locator('#toast').textContent(), '', 'Old hints are cleared on completion');
    assert.equal(await panel.evaluate(el => el.matches(':modal')), false, 'Completion never blocks the page');
    assert.equal(await page.locator('#completion-moment').isHidden(), true, 'No celebration covers the puzzle');
    const board = await page.locator('#game-stage').boundingBox();
    const result = await panel.boundingBox();
    assert.deepEqual(await layout(), beforeCompletion, 'Completion never moves or resizes the canvas, melody, or rotation controls');
    if (width >= 1360) {
      const area = await page.locator('.game-main').boundingBox();
      assert.ok(result.width >= 280, 'Desktop result has a wider readable card');
      assert.ok(Math.abs(result.y + result.height / 2 - area.y - area.height / 2) < 1, 'Desktop result is vertically centered');
      const rightmostNode = Math.max(...initial.nodes.map(node => node.screen.x + (node.screen.radius || 50)));
      assert.ok(result.x > rightmostNode, 'Right-side result stays clear of the puzzle');
      const rotation = await page.locator('.game-main .rotation-tools').boundingBox();
      assert.ok(result.y + result.height < rotation.y, 'Rotation controls remain available below the result');
    } else {
      assert.ok(result.y >= board.y + board.height, 'Compact result sits below the board');
    }
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'Solving does not scroll away from the board');
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => window.advanceTime(1200));
    assert.notDeepEqual((await state()).view, initial.view, 'Keyboard rotation still works');
    const beforeDrag = (await state()).view;
    const node = (await state()).nodes.find(node => node.screen.pickable);
    await page.mouse.move(node.screen.x, node.screen.y);
    await page.mouse.down();
    await page.mouse.move(node.screen.x + 80, node.screen.y + 35, { steps: 8 });
    await page.mouse.up();
    assert.notDeepEqual((await state()).view, beforeDrag, 'Dragging even a filled sphere rotates the finished puzzle');
    assert.deepEqual((await state()).edges, initial.edges, 'Review cannot disconnect the solved network');
    await page.locator('[data-rotate="left"]').click();
    await page.evaluate(() => window.advanceTime(1200));
    assert.deepEqual((await state()).edges, initial.edges);
    await page.screenshot({ path: `output/web-game/completion-moment/review-${width}.png`, fullPage: true });
    await panel.locator('summary').click();
    assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Expanded sharing never overflows the card');
    const expanded = await panel.boundingBox();
    if (width >= 1360) {
      const rotation = await page.locator('.game-main .rotation-tools').boundingBox();
      assert.ok(expanded.y + expanded.height < rotation.y, 'Expanded sharing does not cover rotation controls');
    }
    for (const button of await panel.locator('.share-button').all()) {
      const bounds = await button.boundingBox();
      if (!bounds) continue;
      assert.ok(bounds.x >= expanded.x + 20 && bounds.x + bounds.width <= expanded.x + expanded.width - 20, 'Share buttons stay inside the card padding');
      assert.ok(bounds.width >= 44 && bounds.height >= 44, 'Wrapping preserves touch target size');
    }
    await page.screenshot({ path: `output/web-game/completion-moment/share-${width}.png`, fullPage: true });
    assert.equal(completions, 1, 'Review does not record the solve again');
    await page.locator('#next-button').click();
    await panel.waitFor({ state: 'hidden' });
    assert.equal((await state()).solved, false);
    assert.equal(await page.locator('#app').evaluate(el => el.classList.contains('is-complete')), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: side/below panel, rotation, stable solved graph, no scroll/focus trap and next puzzle passed`);
  }
} finally { await browser.close(); }
