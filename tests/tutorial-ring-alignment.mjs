import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
await mkdir('output/web-game/ring-alignment', { recursive: true });
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch();
  try {
    for (const viewport of [{ width: 1000, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, hasTouch: true, deviceScaleFactor: 2 });
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', r => r.fulfill({ json: {} }));
      for (const step of [1, 2, 4]) {
        await page.goto(`${base}/?onboarding=1&step=${step}`);
        await page.locator('#app-loader').waitFor({ state: 'hidden' });
        const measurements = await page.evaluate(async () => {
          const cue = document.querySelector('#onboarding-cue');
          const rings = [...cue.querySelectorAll('.onboarding-cue-node')].filter(e => getComputedStyle(e).display !== 'none');
          const samples = [];
          // Thick rings and a large pulse make centering errors especially visible.
          cue.style.setProperty('--cue-ring-width', '12px');
          cue.style.setProperty('--cue-ping-width', '12px');
          cue.style.setProperty('--cue-ring-scale', '1.4');
          cue.style.setProperty('--cue-ping-scale', '1.4');
          for (const box of ['border-box', 'content-box']) {
            for (let frame = 0; frame < 12; frame++) {
              await new Promise(resolve => requestAnimationFrame(resolve));
              const nodes = JSON.parse(window.render_game_to_text()).nodes;
              for (const ring of rings) {
                ring.style.transformBox = box;
                for (const animation of ring.getAnimations()) {
                  animation.pause();
                  animation.currentTime = frame * 60;
                }
                const rect = ring.getBoundingClientRect();
                const node = nodes.find(node => node.id === Number(ring.dataset.nodeId));
                samples.push(Math.hypot(rect.x + rect.width / 2 - node.screen.x, rect.y + rect.height / 2 - node.screen.y));
              }
            }
          }
          return samples;
        });
        assert.ok(measurements.length > 0);
        assert.ok(Math.max(...measurements) < .1, `${engine}, ${viewport.width}px, step ${step}: ring must follow the sphere center; max error ${Math.max(...measurements)}`);
        if (step === 4) {
          await page.locator('.onboarding-cue-start').evaluate(async ring => {
            for (const animation of ring.getAnimations()) {
              animation.pause();
              await animation.ready;
              animation.currentTime = 100;
            }
          });
          await page.screenshot({ path: `output/web-game/ring-alignment/${engine}-${viewport.width}.png` });
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`${engine} ${viewport.width}px: selection, drag and double-tap rings stay centered while spheres float`);
    }
  } finally { await browser.close(); }
}
