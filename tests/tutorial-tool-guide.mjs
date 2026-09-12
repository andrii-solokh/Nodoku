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
      for (const target of mobile ? ['tool'] : ['tool', 'keys']) {
        const group = arrow.locator(`[data-target="${target}"]`);
        const samples = await group.evaluate(group => {
          const animations = group.getAnimations({ subtree: true });
          animations.forEach(animation => animation.pause());
          return [.32, .6].map(phase => {
            animations.forEach(animation => {
              const timing = animation.effect.getTiming();
              animation.currentTime = Number(timing.delay) + Number(timing.duration) * phase;
            });
            const shaft = group.querySelector('.tool-arrow-shaft');
            const tip = shaft.getPointAtLength(shaft.getTotalLength()).matrixTransform(shaft.getScreenCTM());
            return { tip: { x: tip.x, y: tip.y }, dash: Number.parseFloat(getComputedStyle(shaft).strokeDashoffset), box: group.getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight };
          });
        });
        assert.ok(samples[0].dash > samples[1].dash + .1, 'The curved path grows toward its target');
        assert.ok(Math.hypot(samples[0].tip.x - samples[1].tip.x, samples[0].tip.y - samples[1].tip.y) < .01, 'The arrow tip stays anchored instead of flying');
        for (const { box, width, height } of samples)
          assert.ok(box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height, `The ${target} curve stays onscreen`);
        if (target === 'keys') {
          const left = await page.locator('#onboarding-shortcut kbd').first().evaluate(key => key.getBoundingClientRect().left);
          assert.ok(Math.abs(samples[1].tip.x - left) < 20, 'The curve points beside the actual keycaps');
        }
      }
      for (const [name, phase] of [['growing', .32], ['drawn', .6]]) {
        await arrow.evaluate((svg, phase) => svg.getAnimations({ subtree: true }).forEach(animation => {
          const timing = animation.effect.getTiming();
          animation.currentTime = Number(timing.delay) + Number(timing.duration) * phase;
        }), phase);
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
    assert.equal(await page.locator('#onboarding-tool-arrow').evaluate(node => node.getAnimations({ subtree: true }).length), 0, 'Reduced motion uses a static pointer');
    await page.locator('#onboarding-skip').click();
    assert.equal(await page.locator('#onboarding-tool-arrow').isVisible(), false);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Growing, anchored curves passed for Undo, Redo and Hint on desktop/mobile, success, exit and reduced motion');
} finally { await browser.close(); }
