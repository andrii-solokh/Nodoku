import { toggleDemoSuspension } from './helpers/demo-suspension.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { melodyStepMs } from '../src/melodies.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/demo-rhythm';
await fs.mkdir(out, { recursive: true });
const config = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
Object.assign(config.demo, { timingMode: 'melody', tempoBpm: 120, initialDelayMs: 100 });
Object.assign(config.scene, { rotationMs: 2000, connectionMs: 1200 });
config.sound.connectionMelody = 'furElise';
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/api/admin/config', route => route.fulfill({ json: { config, revision: 'rhythm-fixture' } }));
  await page.addInitScript(() => {
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', sound: false, settings: { size: 3, depth: 3, difficulty: 'hard', seed: 43 } }));
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
  });
  await page.goto(`${url}/?admin=1#admin-token=rhythm-fixture`);
  await page.locator('#admin-settings').waitFor();
  // This fixture freezes animation frames, including the startup loader fade.
  await page.evaluate(() => document.getElementById("app-loader")?.remove());
  await page.locator('#admin-close').click();
  await advance(page, (await state(page)).demo.delayMs);
  let s = await state(page);
  assert.equal(s.demo.connected, 1);
  assert.equal(s.demo.delayMs, 125, 'The first sixteenth gets its scored interval at 120 quarter beats/min');
  for (let index = 0; index < 17; index++) {
    const wait = s.demo.delayMs;
    const count = s.demo.connected;
    assert.ok(Math.abs(wait - melodyStepMs('furElise', index, 120)) < 1e-6);
    await advance(page, wait - 1);
    s = await state(page);
    assert.equal(s.demo.connected, count, 'No connection arrives ahead of its note');
    assert.equal(s.view.animating, false, 'Even a configured two-second turn fits inside the current beat');
    await advance(page, 1);
    s = await state(page);
    assert.equal(s.demo.connected, count + 1, 'Rod animation cannot delay the next note/connection');
    if (index === 5) {
      assert.ok(s.connectionAnimations.length > 1, 'Several slowly growing links overlap without slowing the score');
      await page.screenshot({ path: `${out}/overlapping-links.png` });
    }
  }
  await toggleDemoSuspension(page);
  const paused = (await state(page)).edges;
  await advance(page, 10000);
  assert.deepEqual((await state(page)).edges, paused);
  await toggleDemoSuspension(page);
  for (let steps = 0; !(await state(page)).solved; steps++) {
    assert.ok(steps < 500, JSON.stringify(await state(page)).slice(0, 1000));
    s = await state(page);
    await advance(page, Math.max(1, s.demo.delayMs));
  }
  await advance(page, 1500);
  s = await state(page);
  assert.equal(s.solved, true);
  assert.ok(s.nodes.every(n => n.remaining === 0));
  await page.screenshot({ path: `${out}/solved.png` });
  assert.deepEqual(errors, []);
  console.log('Passed: scored sixteenth/held/rest intervals, long turns fit each beat, overlapping rods, pause/resume, valid full solution, and no browser errors. Config API mocked; no project file writes.');
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors));
  await browser.close();
}
