import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { MELODIES } from '../src/melodies.ts';
const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/melody-library';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(seed => {
      if (localStorage.getItem('nodoku.astra.v1')) return;
      const settings = {size: 4, depth: 1, difficulty: 'easy', seed};
      localStorage.setItem('nodoku.astra.v1', JSON.stringify({ settings, screen: 'playing', melodyStep: 5, game: {version:1, settings, edges:[], history:[]} }));
    }, width === 390 ? 124 : 125);
    await page.goto(url);
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const tune = 'odeToJoy';
    assert.equal((await state()).melody, tune);
    assert.equal(await page.locator('#puzzle-melody-name').textContent(), MELODIES[tune].title);
    assert.equal(await page.locator('#puzzle-melody-composer').textContent(), MELODIES[tune].composer);
    const bounds = await page.locator('.puzzle-melody-credit').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Long composer credit fits the viewport');
    const link = page.locator('.puzzle-melody-credit');
    await link.click({ trial: true });
    assert.equal(await link.getAttribute('target'), '_blank');
    await page.screenshot({path:`${out}/credit-${width}.png`});
    await page.reload();
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
    assert.equal((await state()).melody, tune);
    assert.equal((await state()).melodyStep, 5, 'Resuming preserves position in the melody');
    await page.locator('#home-button').click();
    assert.equal((await state()).melody, 'odeToJoy', 'Home preview returns to its own tune');
    await page.locator('#resume-button').click();
    assert.equal((await state()).melody, tune);
    assert.equal((await state()).melodyStep, 5);
    await page.goto(`${url}/music-credits.html#summerGarden`);
    assert.equal(await page.locator('article').count(), 11);
    assert.match(await page.locator('#summerGarden').textContent(), /C. J. Brown/);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Ode to Joy stays selected across puzzle seeds, desktop/mobile, reload, and home/resume.');
} finally { await browser.close(); }
