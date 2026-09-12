import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
await mkdir('output/web-game/startup', { recursive: true });
for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await browserType.launch();
  try {
    for (const scenario of ['normal', 'no-timeout', 'fetch-throws']) {
      const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      await page.addInitScript(scenario => {
        if (scenario === 'no-timeout') AbortSignal.timeout = undefined;
        if (scenario === 'fetch-throws') {
          const original = window.fetch;
          window.fetch = function (input, options) {
            if (input === '/api/analytics-config') throw new Error('Analytics unavailable');
            return original.call(this, input, options);
          };
        }
      }, scenario);
      await page.goto(`${base}/?onboarding=1`);
      await page.locator('#app-loader').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      assert.equal(state.mode, 'onboarding');
      // Touch both top nodes: startup must leave a playable board, not just hide the loader.
      for (const id of [2, 3]) {
        const node = state.nodes.find(node => node.id === id);
        await page.touchscreen.tap(node.screen.x, node.screen.y);
      }
      await page.waitForURL(url => url.searchParams.get('step') === '2');
      await page.locator('#onboarding-skip').click();
      await page.locator('#start-button').click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
      await page.reload();
      await page.locator('#app-loader').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
      assert.deepEqual(errors, [], `${engine}/${scenario} startup errors`);
      if (scenario === 'no-timeout') await page.screenshot({ path: `output/web-game/startup/${engine}-ipad.png` });
      await page.close();
      console.log(`${engine}/${scenario}: tutorial touch, normal game and resume passed`);
    }
    for (const failure of ['download', 'evaluation', 'stall']) {
      const page = await browser.newPage();
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      if (failure === 'evaluation') await page.route('**/assets/main-*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("startup fixture");' }));
      else await page.route('**/assets/index-*.js', route => failure === 'download' ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: '' }));
      if (failure === 'stall') await page.clock.install();
      await page.goto(base);
      if (failure === 'stall') await page.clock.runFor(21000);
      await page.locator('.loader-recovery').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#reload-app').isEnabled(), true);
      if (failure === 'evaluation') await page.screenshot({ path: `output/web-game/startup/${engine}-recovery.png` });
      await page.close();
      console.log(`${engine}/${failure}: visible startup recovery passed`);
    }
  } finally { await browser.close(); }
}
