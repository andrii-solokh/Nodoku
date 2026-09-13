import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { Puzzle } from '../src/puzzle.ts';
await mkdir('output/web-game/activity', { recursive: true });
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  if (process.env.TEST_BROWSER && process.env.TEST_BROWSER !== name) continue;
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const settings = { size: 2, depth: 1, difficulty: 'easy', seed: 17 };
    const source = new Puzzle(settings);
    const totals = { visitors: 100, puzzlesSolved: 42, nodesFilled: 420, connectionsCompleted: 210 };
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/statistics') return route.fulfill({ json: { scope: 'global', period: 'all', trackingSince: '2026-09-10T00:00:00Z', totals, daily: [], sizes: [], difficulties: [] } });
      if (path === '/api/presence') return route.fulfill({ json: { online: 12, scope: 'global' } });
      if (path === '/api/visitors') return route.fulfill({ json: { count: totals.visitors, scope: 'global' } });
      if (path === '/api/completions') {
        totals.puzzlesSolved++;
        totals.connectionsCompleted += source.solution.length;
        totals.nodesFilled += source.nodes.length;
        return route.fulfill({ json: { recorded: true } });
      }
      return route.fulfill({ json: {} });
    });
    await page.addInitScript(settings => localStorage.setItem('nodoku.astra.v1', JSON.stringify({
      settings, screen: 'playing', game: { version: 1, settings, edges: [], history: [] },
    })), settings);
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
    try {
      await page.waitForFunction(() => document.querySelector('#puzzles-solved-count-game')?.textContent === '42');
    } catch (error) {
      console.log({ errors, page: await page.evaluate(() => document.body.innerText.slice(0, 2000)) });
      throw error;
    }
    await page.evaluate(() => { window.requestAnimationFrame = () => 1; });
    await page.clock.install({ time: new Date('2026-09-12T10:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-12T11:00:00Z'));
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const visible = () => page.locator('.visitor-game .audience-rotating > :not([hidden])').textContent();
    const connect = async (edge) => {
      for (const id of edge) {
        const node = (await state()).nodes.find(node => node.id === id);
        await page.mouse.click(node.screen.x, node.screen.y);
      }
      await page.clock.fastForward(350);
    };
    await page.clock.fastForward(30000);
    assert.match(await visible(), /42Puzzles solved/, 'Idle time does not rotate statistics');
    await connect([0, 1]);
    assert.equal((await state()).edges.length, 1, 'Fixture made a connection');
    assert.match(await visible(), /1Connections/, 'A real connection immediately shows its count');
    await page.clock.fastForward(1000);
    assert.match(await visible(), /1Connections/, 'No delayed secondary metric replaces a connection');
    assert.match(await page.locator('.visitor-game .audience-link').getAttribute('aria-label'), /1 connections in this puzzle/);
    const width = (await page.locator('.visitor-game').boundingBox()).width;
    await page.clock.fastForward(20000);
    assert.match(await visible(), /1Connections/, 'The latest changed metric remains visible');
    await page.keyboard.press('h');
    await page.clock.fastForward(1500);
    assert.match(await visible(), /1Connections/, 'Hint does not change activity counters');
    await page.keyboard.press('Control+z');
    assert.match(await visible(), /0Connections/, 'Undo updates progress rather than inflating all-time totals');
    await page.clock.fastForward(1000);
    assert.match(await visible(), /0Connections/);
    await page.keyboard.press('Control+Shift+z');
    const node = (await state()).nodes.find(node => node.id === 0);
    await page.keyboard.down('Shift');
    await page.mouse.click(node.screen.x, node.screen.y);
    await page.keyboard.up('Shift');
    assert.match(await visible(), /1Nodes filled/, 'Node fill outranks the connection from the same move');
    assert.ok(await page.locator('#nodes-filled-count-game').evaluate(el => el.getAnimations({ subtree: true }).length > 0), 'An increase rolls the number reels');
    await page.clock.fastForward(1000);
    assert.match(await visible(), /1Nodes filled/);
    assert.equal((await page.locator('.visitor-game').boundingBox()).width, width, 'Counter updates do not shift layout');
    await page.screenshot({ path: `output/web-game/activity/${name}.png` });
    const lastNode = (await state()).nodes.find(node => node.id === 3);
    await page.keyboard.down('Shift');
    await page.mouse.click(lastNode.screen.x, lastNode.screen.y);
    await page.keyboard.up('Shift');
    assert.match(await visible(), /Puzzles solved/, 'The final node fill immediately selects only puzzle completion');
    for (let i = 0; i < 50 && !/43Puzzles solved/.test(await visible()); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(await visible(), /43Puzzles solved/, 'A recorded solve selects and increments the community solved count');
    await page.clock.fastForward(2000);
    assert.match(await visible(), /43Puzzles solved/, 'A lower-priority update cannot replace completion');
    assert.equal(totals.puzzlesSolved, 43, 'Completion is counted once');
    await page.locator('#completion-home').click();
    assert.match(await page.locator('.visitor-home .audience-rotating > :not([hidden])').textContent(), /43Puzzles solved/);
    totals.visitors++;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    for (let i = 0; i < 50 && await page.locator('#visitor-count').textContent() !== '101'; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(await page.locator('.visitor-home .audience-rotating > :not([hidden])').textContent(), /101Visitors/, 'Public counters switch only when a total changes');
    assert.deepEqual(errors, []);
    console.log(`${name}: idle stability, connection/node updates, hint, undo/redo, fill, completion priority and public changes passed`);
  } catch (error) { console.error(error); throw error; } finally { await browser.close(); }
}
