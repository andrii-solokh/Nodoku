import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const params = page => new URL(page.url()).searchParams;
const errors = [];
await mkdir('output/web-game/onboarding-navigation', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  async function open(query) {
    await page.goto(`${base}/?onboarding=1&${query}`);
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).mode === 'onboarding');
    await page.locator('#app-loader').waitFor({ state: 'hidden' });
  }
  for (let step = 1; step <= 8; step++) {
    await open(`step=${step}&ref=kept`);
    assert.match(await page.locator('#onboarding-step').textContent(), new RegExp(`^${step} of 8`));
    assert.equal(params(page).get('step'), String(step));
    assert.equal(params(page).get('ref'), 'kept');
    const current = await state(page);
    assert.equal(current.nodes.length, step <= 5 ? 4 : 8);
    if (step === 3) {
      assert.deepEqual(current.edges, [[2, 3], [0, 1]], 'Removal preserves the first connection and has the bottom connection ready');
      const [a, b] = current.edges[1].map(id => current.nodes.find(node => node.id === id));
      await page.mouse.move(a.screen.x, a.screen.y);
      await page.mouse.down();
      await page.mouse.move(b.screen.x, b.screen.y, { steps: 8 });
      await page.mouse.up();
      await page.waitForURL(url => url.searchParams.get('step') === '4');
    }
    if (step === 5) assert.ok(current.edges.length > 0 && current.nodes.some(node => node.remaining > 0), 'Clear-dots lesson starts partially connected');
    assert.equal(await page.locator('#onboarding-control-lesson, #onboarding-tool-arrow').count(), 0);
    if (step === 8) {
      assert.equal(await page.locator('#onboarding-title').textContent(), 'Finish the cube.');
      assert.ok(current.edges.length > 0);
      assert.equal(await page.locator('#onboarding-next').isHidden(), true);
    }
  }
  for (const direction of ['left', 'right', 'up', 'down']) {
    await open(`step=6&direction=${direction}`);
    assert.equal((await state(page)).tutorialRotation, direction);
    assert.equal(params(page).get('direction'), direction);
  }
  await page.screenshot({ path: 'output/web-game/onboarding-navigation/direct-down.png' });
  await page.keyboard.press('ArrowDown');
  await page.waitForURL(url => url.searchParams.get('step') === '7');
  assert.equal(params(page).has('direction'), false);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '7 of 8');
  await page.locator('#onboarding-skip').click();
  assert.equal(params(page).has('step'), false);
  assert.equal(params(page).has('onboarding'), false);
  for (const value of ['0', '9', '10', '11', '-1', '2.5', 'nope']) {
    await open(`step=${value}&direction=invalid`);
    assert.equal(params(page).get('step'), '1');
    assert.equal(params(page).has('direction'), false);
  }
  await open('step=6&direction=invalid');
  assert.equal(params(page).get('direction'), 'left');
  assert.deepEqual(errors, []);
  console.log('All eight tutorial step links, prerequisites, progress URLs, reload, exit, and invalid parameters passed');
} finally {
  await browser.close();
}
