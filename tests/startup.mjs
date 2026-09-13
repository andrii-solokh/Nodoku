import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
await mkdir('output/web-game/startup', { recursive: true });
for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
  if (process.env.TEST_BROWSER && process.env.TEST_BROWSER !== engine) continue;
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
    for (const failure of ['download', 'evaluation', 'stall', 'no-webgl']) {
      const page = await browser.newPage();
      await page.route('**/api/**', route => route.fulfill({ json: {} }));
      if (failure === 'no-webgl') await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : getContext.call(this, type, ...args); };
      });
      if (failure === 'evaluation') await page.route('**/assets/main-*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("startup fixture");' }));
      else if (failure !== 'no-webgl') await page.route('**/assets/index-*.js', route => failure === 'download' ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: '' }));
      if (failure === 'stall' || failure === 'evaluation') await page.clock.install();
      await page.goto(base);
      if (failure === 'stall') {
        await page.evaluate(async () => {
          await document.fonts.ready;
          const animation = document.querySelector('.loader-progress').getAnimations({ subtree: true })[0];
          animation.pause(); animation.currentTime = 800;
        });
        for (const [width, height] of [[1200, 850], [390, 844], [820, 1180]]) {
          await page.setViewportSize({ width, height });
          const mark = page.locator('.loader-mark');
          assert.equal(await mark.locator('circle').count(), 4, 'Every logo node remains visible');
          assert.equal(await mark.evaluate(el => el.getAnimations({ subtree: true }).length), 0, 'The brand stays still');
          await page.screenshot({ path: `output/web-game/startup/${engine}-loader-${width}.png` });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('.loader-progress').evaluate(el => getComputedStyle(el, '::after').animationName), 'none');
        await page.clock.runFor(21000);
      }
      await page.locator('.loader-recovery').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#reload-app').isEnabled(), true);
      await page.locator('.loader-diagnostics summary').click();
      const details = page.locator('#startup-error-details');
      assert.match(await details.textContent(), /Browser:/);
      if (failure === 'evaluation') {
        assert.match(await details.textContent(), /startup fixture/);
        await page.clock.runFor(21000);
        assert.match(await details.textContent(), /startup fixture/, 'Timeout never overwrites the original error');
      }
      if (failure === 'no-webgl') assert.match(await details.textContent(), /WebGL context/);
      if (failure === 'stall') assert.match(await details.textContent(), /20 seconds/);
      if (failure === 'evaluation') await page.screenshot({ path: `output/web-game/startup/${engine}-recovery.png` });
      await page.close();
      console.log(`${engine}/${failure}: visible startup recovery passed`);
    }
  } finally { await browser.close(); }
}
