import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch();
const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
await mkdir('output/web-game/tutorial-selection', { recursive: true });
try {
  for (const touch of [false, true]) {
    const page = await browser.newPage({ viewport: touch ? { width: 390, height: 844 } : { width: 1200, height: 850 }, hasTouch: touch });
    await page.goto(`${url}/?onboarding=1`);
    await page.locator('.onboarding-cue.is-select').waitFor();
    await page.locator('#app-loader').waitFor({ state: 'detached' });
    const pings = await page.locator('.onboarding-cue-node').evaluateAll(async nodes => {
      const animations = nodes.map(node => node.getAnimations()[0]);
      for (const animation of animations) { animation.pause(); await animation.ready; }
      const sample = fraction => {
        animations.forEach(animation => { animation.currentTime = animation.effect.getTiming().duration * fraction; });
        return nodes.map(node => Number(getComputedStyle(node).opacity));
      };
      const first = sample(.08);
      const second = sample(.48);
      return { first, second };
    });
    assert.ok(pings.first[0] > 0 && pings.first[1] === 0, 'Only the first node pings first');
    assert.ok(pings.second[1] > 0 && pings.second[0] === 0, 'Only the second node pings next');
    await page.screenshot({ path: `output/web-game/tutorial-selection/${touch ? 'mobile' : 'desktop'}-second-ping.png` });
    const [first, second] = await page.locator('.onboarding-cue-node').evaluateAll(nodes => nodes.map(node => Number(node.dataset.nodeId)));
    const select = async id => {
      const node = (await state(page)).nodes.find(node => node.id === id).screen;
      if (touch) await page.touchscreen.tap(node.x, node.y);
      else await page.mouse.click(node.x, node.y);
    };
    await select(first);
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).selected === id, first);
    assert.equal((await state(page)).edges.length, 0, 'First selection does not connect on its own');
    await select(second);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).tutorialSuccess === 'Connection made');
    assert.equal((await state(page)).edges.length, 1);
    await page.waitForFunction(() => document.querySelector('#onboarding-step').textContent === '2 of 10');
    assert.equal(await page.locator('.onboarding-cue.is-drag').count(), 1);
    await page.close();
  }
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto(`${url}/?onboarding=1`);
  await reduced.locator('.onboarding-cue.is-select').waitFor();
  const rings = await reduced.locator('.onboarding-cue-node').evaluateAll(nodes => nodes.map(node => ({ opacity: Number(getComputedStyle(node).opacity), animations: node.getAnimations().length })));
  assert.ok(rings.every(ring => ring.opacity > 0 && ring.animations === 0), 'Reduced motion keeps both targets visible without pulsing');
  await reduced.close();
  console.log('Selection tutorial: sequential pings, mouse/touch connection, drag transition, and reduced motion passed.');
} finally { await browser.close(); }
