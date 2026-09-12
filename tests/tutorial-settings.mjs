import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readAdminToken } from '../scripts/admin-api.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const control = key => page.locator(`#config-tutorial-${key}`);
const ring = page.locator('.onboarding-cue-start');
try {
  await page.goto(`${url}/?admin=1#admin-token=${readAdminToken(process.cwd())}`);
  await page.locator('#admin-settings').waitFor();
  await page.getByText('Tutorial visuals', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview tutorial', exact: true }).click();
  assert.equal((await state()).mode, 'onboarding');
  await control('color').fill('#cc4466');
  await control('ringWidth').fill('4');
  await control('ringScale').fill('1.2');
  await control('ringOpacity').fill('0.5');
  assert.equal(await ring.evaluate(e => getComputedStyle(e).borderColor), 'rgb(204, 68, 102)');
  assert.equal(await ring.evaluate(e => getComputedStyle(e).borderWidth), '4px');
  assert.equal(await ring.evaluate(e => getComputedStyle(e).opacity), '0.5');
  await control('focusCircles').uncheck();
  assert.equal(await ring.isVisible(), false);
  await control('focusCircles').check();
  await control('dragCue').uncheck();
  assert.equal(await page.locator('.onboarding-cue-hand').isVisible(), false);
  await control('dragCue').check();
  await control('enabled').uncheck();
  assert.equal(await page.locator('#onboarding-cue').isVisible(), false);
  await control('enabled').check();
  await control('gestureCycleMs').fill('4800');
  assert.equal(await page.locator('.onboarding-cue-hand').evaluate(e => getComputedStyle(e).animationDuration), '4.8s');
  await mkdir('output/web-game/tutorial-settings', { recursive: true });
  await page.screenshot({ path: 'output/web-game/tutorial-settings/admin-desktop.png' });
  await page.locator('#admin-close').click();
  assert.equal(await page.locator('#admin-open').isVisible(), true, 'Studio can reopen during the tutorial');
  const ids = await page.locator('.onboarding-cue-node').evaluateAll(es => es.map(e => Number(e.dataset.nodeId)));
  let nodes = (await state()).nodes;
  for (const id of ids) {
    const node = nodes.find(n => n.id === id);
    await page.mouse.click(node.screen.x, node.screen.y);
  }
  await page.waitForFunction(() => document.querySelector('#onboarding-step').textContent === '2 of 7');
  const edges = (await state()).edges;
  assert.ok((await state()).removalCue);
  await page.locator('#admin-open').click();
  await control('removalCue').uncheck();
  assert.equal((await state()).removalCue, null);
  assert.deepEqual((await state()).edges, edges);
  await control('removalCue').check();
  assert.ok((await state()).removalCue);
  await control('enabled').uncheck();
  assert.equal((await state()).removalCue, null);
  await control('enabled').check();
  await page.locator('#admin-close').click();
  nodes = (await state()).nodes;
  for (const id of ids) {
    const node = nodes.find(n => n.id === id);
    await page.mouse.click(node.screen.x, node.screen.y);
  }
  await page.waitForFunction(() => document.querySelector('#onboarding-step').textContent === '3 of 7');
  await page.locator('#admin-open').click();
  await control('doubleTapCue').uncheck();
  assert.equal(await page.locator('#onboarding-cue').isVisible(), false);
  await control('doubleTapCue').check();
  assert.equal(await page.locator('#onboarding-cue').isVisible(), true);
  assert.equal(await ring.evaluate(e => getComputedStyle(e).animationDuration), '2.4s', 'Double-tap rhythm stays quick');
  await page.locator('#admin-reset').click();
  assert.equal((await state()).config.tutorial.color, '#8870bd');
  await page.setViewportSize({ width: 390, height: 844 });
  await control('enabled').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/web-game/tutorial-settings/admin-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#admin-close').click();
  await page.locator('#admin-open').click();
  assert.equal(await page.locator('#admin-panel').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('Tutorial visual controls: live styles, visibility, removal cleanup, fixed ping rhythm, reset, desktop/mobile passed.');
} finally {
  await browser.close();
}
