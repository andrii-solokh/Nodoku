import { followHint } from './helpers/follow-hint.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { Puzzle, edgeKey } from '../src/puzzle.ts';

const browser = await (process.env.TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
await mkdir('output/web-game/hints', { recursive: true });
try {
  for (const mobile of [false, true]) {
    for (const depth of [1, 4]) {
      const settings = { size: 4, depth, difficulty: 'medium', seed: 123 };
      const puzzle = new Puzzle(settings);
      const solution = new Set(puzzle.solution.map(edge => edgeKey(...edge)));
      const wrong = puzzle.nodes.flatMap(node => puzzle.neighbors(node.id).map(id => [node.id, id]))
        .find(edge => !solution.has(edgeKey(...edge)) && puzzle.toggle(...edge).changed);
      assert.ok(wrong, 'Fixture includes a removable incorrect connection');
      const page = await browser.newPage({ hasTouch: mobile, viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 850 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      await page.addInitScript(({ settings, wrong }) => {
        localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', settings,
          game: { version: 1, settings, edges: [wrong], history: [] } }));
      }, { settings, wrong });
      await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
      await page.locator('#app-loader').waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        window.requestAnimationFrame = () => 1;
        window.cancelAnimationFrame = () => {};
      });
      await page.locator('#resume-button').click();
      for (let index = 0; index < 6; index++) {
        const before = await state(page);
        await page.locator('#hint-button').evaluate(button => button.click());
        await page.evaluate(() => window.advanceTime(1200));
        const after = await state(page);
        assert.deepEqual(after.edges, before.edges, 'Hint must not add or remove connections');
        assert.equal(after.progress, before.progress, 'Hint must not clear dots');
        assert.deepEqual(after.nodes.map(node => node.remaining), before.nodes.map(node => node.remaining));
        const edge = after.hint?.edge;
        assert.ok(edge, 'Hint highlights a suggested connection');
        assert.equal(after.hint.remove, index === 0, 'The first hint suggests removing the incompatible edge');
        assert.equal(await page.locator('#hint-cue').isVisible(), true);
        assert.equal(await page.locator('.hint-cue-node:visible').count(), 2);
        await page.keyboard.press('h');
        await page.evaluate(() => window.advanceTime(1200));
        assert.deepEqual((await state(page)).edges, before.edges, 'Repeated H never plays the suggestion');
        assert.deepEqual((await state(page)).hint, after.hint, 'Repeated hints preserve the suggestion');
        for (const id of edge) {
          const node = after.nodes.find(node => node.id === id);
          assert.equal(node.screen.visible, true, `depth ${depth}, hint ${index}: endpoint ${id} is visible`);
          assert.equal(node.screen.pickable, true, `depth ${depth}, hint ${index}: endpoint ${id} is on the active face`);
        }
        if (depth === 1) assert.deepEqual(after.view.direction, before.view.direction, 'Flat hints do not rotate the board');
        if (index === 2) await page.screenshot({ path: `output/web-game/hints/${mobile ? 'mobile' : 'desktop'}-${depth}.png` });
        await followHint(page);
        assert.equal((await state(page)).hint, null, 'Making the move clears its visual suggestion');
        assert.equal(await page.locator('#hint-cue').isHidden(), true);
        if ((await state(page)).solved) break;
      }
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log('Non-mutating hints, repeated H, visible endpoints, manual moves and cleanup passed on desktop/mobile in 2D/3D');
} finally {
  await browser.close();
}
