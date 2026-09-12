import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';
import { mkdir } from 'node:fs/promises';

await mkdir('output/web-game/modifier-click', { recursive: true });
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const errors = [];
  try {
    for (const depth of [1, 2]) {
      const settings = { size: 2, depth, difficulty: 'easy', seed: 17 };
      const expected = new Puzzle(settings);
      const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      await page.addInitScript(settings => localStorage.setItem('nodoku.astra.v1', JSON.stringify({
        settings, screen: 'playing', game: { version: 1, settings, edges: [], history: [] },
      })), settings);
      await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
      await page.locator('#app-loader').waitFor({ state: 'hidden' });
      await page.evaluate(() => { window.requestAnimationFrame = () => 1; });
      const state = () => page.evaluate(() => {
        const value = JSON.parse(window.render_game_to_text());
        value.edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return value;
      });
      const node = (await state()).nodes.find(node => node.screen.pickable && node.remaining > 0);
      const click = async (modifier, button = 'left') => {
        if (modifier) await page.keyboard.down(modifier);
        await page.mouse.click(node.screen.x, node.screen.y, { button });
        if (modifier) await page.keyboard.up(modifier);
      };
      expected.toggleNode(node.id);
      const filled = expected.edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const modifier of ['Control', 'Meta']) {
        await click(modifier);
        assert.deepEqual((await state()).edges, filled, `${name}/${depth}: ${modifier}-click fills immediately`);
        assert.equal((await state()).selected, null, 'The shortcut does not leave a single selection');
        if (modifier === 'Meta') await page.evaluate(() => window.advanceTime(500));
        if (modifier === 'Meta') await page.screenshot({ path: `output/web-game/modifier-click/${name}-${depth}.png` });
        await click(modifier);
        assert.deepEqual((await state()).edges, [], 'A full node clears like double-click');
        await page.keyboard.press('Control+z');
        assert.deepEqual((await state()).edges, filled, 'Undo restores the whole node in one move');
        await page.keyboard.press('Control+z');
        assert.deepEqual((await state()).edges, [], 'Undo removes the whole fill in one move');
      }
      await page.mouse.dblclick(node.screen.x, node.screen.y, { delay: 40 });
      assert.deepEqual((await state()).edges, filled, 'Double-click retains exactly the same behavior');
      await page.keyboard.press('Control+z');
      await click(null);
      assert.equal((await state()).selected, node.id, 'Ordinary click still selects');
      await page.waitForTimeout(300);
      const neighbor = (await state()).nodes.find(other => other.screen.pickable && expected.neighbors(node.id).includes(other.id));
      await page.keyboard.down('Control');
      await page.mouse.move(node.screen.x, node.screen.y);
      await page.mouse.down();
      await page.mouse.move(neighbor.screen.x, neighbor.screen.y, { steps: 8 });
      await page.mouse.up();
      await page.keyboard.up('Control');
      assert.equal((await state()).edges.length, 1, 'Modified drag remains a single connection, not a node fill');
      const beforeRightClick = (await state()).edges;
      await click(null, 'right');
      assert.deepEqual((await state()).edges, beforeRightClick, 'Ordinary right-click does not fill');
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log(`${name}: modifier fill/clear, grouped undo, double-click, selection, right-click and drag passed in flat/3D`);
  } finally { await browser.close(); }
}
