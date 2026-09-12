import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readAdminToken } from '../scripts/admin-api.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const field = name => page.locator(`#config-tutorial-${name}`);
const sample = time => page.locator('.onboarding-cue-start').evaluate(async (ring, time) => {
  const animation = ring.getAnimations()[0];
  animation.pause();
  await animation.ready;
  animation.currentTime = time;
  const css = getComputedStyle(ring);
  const box = ring.getBoundingClientRect();
  return { opacity: Number(css.opacity), color: css.borderColor, width: css.borderWidth,
    scale: new DOMMatrix(css.transform).a, cycle: animation.effect.getTiming().duration,
    center: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, id: Number(ring.dataset.nodeId) };
}, time);
try {
  await page.goto(`${url}/?admin=1#admin-token=${readAdminToken(process.cwd())}`, { waitUntil: "domcontentloaded" });
  await page.locator('#admin-settings').waitFor();
  await page.getByText('Tutorial visuals', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview double tap', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#onboarding-cue').classList.contains('is-double-tap'));
  const saved = (await state()).config.tutorial;
  for (const [key, value] of Object.entries({ doubleTapColor: '#cc4466', doubleTapWidth: '6',
    doubleTapScale: '1.4', doubleTapOpacity: '0.9', doubleTapPulseMs: '300',
    doubleTapGapMs: '100', doubleTapPauseMs: '1200' })) await field(key).fill(value);
  await field('doubleTapEasing').selectOption('linear');
  let visual = await sample(0);
  assert.equal(visual.cycle, 1900);
  assert.equal(visual.color, 'rgb(204, 68, 102)');
  assert.equal(visual.width, '6px');
  assert.equal(visual.opacity, .9);
  assert.ok(Math.abs((await sample(150)).scale - 1.2) < .001);
  assert.ok(Math.abs((await sample(150)).opacity - .45) < .001);
  assert.equal((await sample(350)).opacity, 0, 'quiet gap after first ping');
  assert.ok(Math.abs((await sample(400)).opacity - .9) < .001, 'second ping');
  assert.equal((await sample(1000)).opacity, 0, 'quiet pause after second ping');
  assert.ok(Math.abs((await sample(1900)).opacity - .9) < .001, 'next pair repeats');
  assert.equal((await state()).config.tutorial.ringWidth, saved.ringWidth, 'focus circles tune independently');
  assert.equal((await state()).edges.length, 0, 'preview does not connect nodes');
  await field('doubleTapEasing').selectOption('ease-out');
  assert.ok((await sample(150)).scale > 1.2, 'easing changes the pulse movement');
  await field('doubleTapCue').uncheck();
  await page.waitForFunction(() => document.querySelector('#onboarding-cue').hidden);
  await field('doubleTapCue').check();
  await page.waitForFunction(() => !document.querySelector('#onboarding-cue').hidden);
  await page.locator('#admin-close').click();
  await sample(80);
  await mkdir('output/web-game/double-tap-settings', { recursive: true });
  await page.screenshot({ path: 'output/web-game/double-tap-settings/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  visual = await sample(80);
  const node = (await state()).nodes.find(node => node.id === visual.id);
  assert.ok(Math.abs(visual.center.x - node.screen.x) < 2 && Math.abs(visual.center.y - node.screen.y) < 2, 'ping remains centered on the floating sphere');
  await page.screenshot({ path: 'output/web-game/double-tap-settings/mobile.png' });
  // Reload to discard the deliberately paused/seeked animations used for timing samples.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('#admin-settings').waitFor();
  await page.getByText('Tutorial visuals', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview double tap', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#onboarding-cue').classList.contains('is-double-tap'));
  await field('doubleTapOpacity').fill('0.9');
  assert.equal(await page.locator('.onboarding-cue-start').evaluate(ring => ring.getAnimations().length), 0);
  assert.equal(await page.locator('.onboarding-cue-start').evaluate(ring => Number(getComputedStyle(ring).opacity)), .9);
  await page.locator('#admin-close').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('.onboarding-cue-start').getAnimations().length === 1);
  const freshNode = (await state()).nodes.find(n => n.id === node.id);
  await page.mouse.dblclick(freshNode.screen.x, freshNode.screen.y, { delay: 40 });
  await page.waitForFunction(() => document.querySelector('#onboarding-title').textContent.includes('Clear'));
  assert.ok((await state()).edges.length > 0, 'actual double tap still connects neighbors and advances the lesson');
  await page.locator('#admin-open').click();
  await page.locator('#admin-reset').click();
  assert.deepEqual((await state()).config.tutorial, saved);
  assert.deepEqual(errors, []);
  console.log('Double tap: live style, two-pulse timing, easing, visibility, centered desktop/mobile preview, reduced motion, action and reset passed.');
} finally {
  await browser.close();
}
