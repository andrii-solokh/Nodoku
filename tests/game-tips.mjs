import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('output/web-game/game-tips', { recursive: true });
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 850 }, hasTouch: mobile });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      await page.addInitScript(mobile => {
        const settings = { size: 3, depth: mobile ? 1 : 3, difficulty: 'easy', seed: 17 };
        localStorage.setItem('nodoku.astra.v1', JSON.stringify({ settings, screen: 'playing', game: { version: 1, settings, edges: [], history: [] } }));
      }, mobile);
      await page.clock.install();
      await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
      await page.locator('#app-loader').waitFor({ state: 'hidden' });
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      const tip = page.locator('#game-tip');
      assert.equal(await tip.isVisible(), true);
      assert.match(await tip.innerText(), mobile ? /Tap one node/ : /Click one node/);
      const board = await page.locator('#game-stage').boundingBox();
      const bounds = await tip.boundingBox();
      assert.ok(board.y + board.height <= bounds.y, 'Tip sits below the board');
      for (const selector of ['.tools-group', '.rotation-tools']) {
        if (!(await page.locator(selector).isVisible())) continue;
        const controls = await page.locator(selector).boundingBox();
        assert.ok(bounds.y + bounds.height <= controls.y || controls.y + controls.height <= bounds.y || bounds.x + bounds.width <= controls.x || controls.x + controls.width <= bounds.x, 'Tip stays clear of controls');
      }
      const tips = [await tip.innerText()];
      for (let index = 0; index < 7; index++) {
        await page.clock.fastForward(7000);
        tips.push(await tip.innerText());
        assert.deepEqual(await page.locator('#game-stage').boundingBox(), board, 'Text changes never move the board');
        assert.ok((await tip.evaluate(el => el.scrollHeight <= el.clientHeight)), 'Tip fits its reserved height');
      }
      assert.ok(tips.some(text => /existing connection/.test(text)));
      assert.ok(tips.some(text => /Hint|hint/.test(text)));
      assert.ok(tips.some(text => /Shift|Double-tap/.test(text)));
      if (mobile) {
        assert.equal(await tip.locator('kbd').count(), 0);
        assert.ok(tips.every(text => !/Shift|Ctrl|Press|rotate/.test(text)), 'Flat touch games show no keyboard or rotation tips');
      } else assert.ok(tips.some(text => /W A S D/.test(text)));
      await page.clock.runFor(400);
      await page.screenshot({ path: `output/web-game/game-tips/${name}-${mobile ? 'mobile' : 'desktop'}.png` });
      await page.evaluate(() => document.querySelector('#keyboard-dialog').showModal());
      const before = await tip.innerText();
      await page.clock.fastForward(14000);
      assert.equal(await tip.innerText(), before, 'Open dialogs pause tips');
      await page.evaluate(() => document.querySelector('#keyboard-dialog').close());
      await page.locator('#home-button').click();
      assert.equal(await tip.isVisible(), false);
      await page.clock.fastForward(14000);
      assert.equal(await tip.isVisible(), false);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`${name}: tip rotation, device/flat copy, stable layout, dialog pause and home cleanup passed`);
  } finally { await browser.close(); }
}
