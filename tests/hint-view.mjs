import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle, edgeKey } from '../src/puzzle.ts';

const browser = await chromium.launch();
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
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 850 } });
      page.on('pageerror', error => errors.push(error.message));
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
      for (let index = 0; index < 20; index++) {
        const before = await state(page);
        await page.locator('#hint-button').evaluate(button => button.click());
        await page.evaluate(() => window.advanceTime(1200));
        const after = await state(page);
        const beforeKeys = new Set(before.edges.map(edge => edgeKey(...edge)));
        const afterKeys = new Set(after.edges.map(edge => edgeKey(...edge)));
        const edge = index === 0 ? before.edges.find(edge => !afterKeys.has(edgeKey(...edge)))
          : after.edges.find(edge => !beforeKeys.has(edgeKey(...edge)));
        assert.ok(edge, 'Hint changes a connection');
        for (const id of edge) {
          const node = after.nodes.find(node => node.id === id);
          assert.equal(node.screen.visible, true, `depth ${depth}, hint ${index}: endpoint ${id} is visible`);
          assert.equal(node.screen.pickable, true, `depth ${depth}, hint ${index}: endpoint ${id} is on the active face`);
        }
        if (depth === 1) assert.deepEqual(after.view.direction, before.view.direction, 'Flat hints do not rotate the board');
        if (index === 8) await page.screenshot({ path: `output/web-game/hints/${mobile ? 'mobile' : 'desktop'}-${depth}.png` });
        if (after.solved) break;
      }
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log('Hint addition/removal shows both endpoints on desktop/mobile in 2D/3D');
} finally {
  await browser.close();
}
