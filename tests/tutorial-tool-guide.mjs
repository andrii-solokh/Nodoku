import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch();
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const errors = [];
await mkdir('output/web-game/tool-arrow', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 850 }, hasTouch: mobile, isMobile: mobile });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    for (const [step, tool] of [[8, 'undo'], [9, 'redo'], [10, 'hint']]) {
      await page.goto(`${base}/?onboarding=1&step=${step}`);
      await page.locator('#app-loader').waitFor({ state: 'hidden' });
      const arrow = page.locator('#onboarding-tool-arrow');
      assert.equal(await arrow.isVisible(), true);
      assert.equal(await arrow.getAttribute('data-tool'), `onboarding-${tool}`);
      assert.equal(await arrow.getAttribute('data-shortcut'), String(!mobile));
      assert.equal(await arrow.evaluate(node => getComputedStyle(node).pointerEvents), 'none');
      const samples = await arrow.locator('g').evaluate(group => {
        const animation = group.getAnimations()[0];
        animation.pause();
        return [0, .2, .5, .65, .9].map(t => {
          animation.currentTime = Number(animation.effect.getTiming().duration) * t;
          const box = group.getBoundingClientRect();
          return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight };
        });
      });
      assert.notDeepEqual(samples[0], samples[1], 'Arrow moves around the targets');
      for (const box of samples) assert.ok(box.x >= 0 && box.y >= 0 && box.right <= box.width && box.bottom <= box.height, `Arrow remains inside viewport (${mobile ? 'mobile' : 'desktop'} ${tool}: ${JSON.stringify(box)})`);
      for (const [name, phase] of [['tool', .12], ['keys', .58]]) {
        await arrow.locator('g').evaluate((group, phase) => {
          const animation = group.getAnimations()[0];
          animation.currentTime = Number(animation.effect.getTiming().duration) * phase;
        }, phase);
        if (!mobile && name === 'keys') {
          const distance = await arrow.locator('g').evaluate(group => {
            const tip = new DOMPoint(0, 0).matrixTransform(group.getScreenCTM());
            const caps = [...document.querySelectorAll('#onboarding-shortcut kbd')].map(node => node.getBoundingClientRect());
            const left = Math.min(...caps.map(box => box.left)), right = Math.max(...caps.map(box => box.right));
            const top = Math.min(...caps.map(box => box.top)), bottom = Math.max(...caps.map(box => box.bottom));
            return Math.hypot(tip.x - Math.max(left, Math.min(right, tip.x)), tip.y - Math.max(top, Math.min(bottom, tip.y)));
          });
          assert.ok(distance < 40, 'The arrow flies beside the actual keycaps, not the wider caption container');
        }
        await page.screenshot({ path: `output/web-game/tool-arrow/${mobile ? 'mobile' : 'desktop'}-${tool}-${name}.png` });
      }
      await page.locator(`#onboarding-${tool}`).evaluate(button => {
        button.addEventListener('click', () => {
          window.arrowHiddenAfterClick = getComputedStyle(document.querySelector('#onboarding-tool-arrow')).display === 'none';
        }, { once: true });
      });
      await page.locator(`#onboarding-${tool}`).click();
      assert.equal(await page.evaluate(() => window.arrowHiddenAfterClick), true, 'Arrow hides during success');
      if (tool === 'hint') {
        await page.waitForFunction(() => document.querySelector('#onboarding-title').textContent === 'You’re ready.');
        assert.equal(await arrow.isVisible(), false, 'Arrow stays hidden after the tool lessons');
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/?onboarding=1&step=8`);
    await page.locator('#app-loader').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#onboarding-tool-arrow').isVisible(), true);
    assert.equal(await page.locator('#onboarding-tool-arrow g').evaluate(node => node.getAnimations().length), 0, 'Reduced motion uses a static pointer');
    await page.locator('#onboarding-skip').click();
    assert.equal(await page.locator('#onboarding-tool-arrow').isVisible(), false);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Tool arrows passed for Undo, Redo and Hint on desktop/mobile, success, exit and reduced motion');
} finally { await browser.close(); }
