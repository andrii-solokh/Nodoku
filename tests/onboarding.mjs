import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
async function fixture(openOnboarding = true) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { period: 'all', scope: 'local', trackingSince: null, totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.goto(openOnboarding ? `${url}?onboarding=1` : url);
  await page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).mode === expected, openOnboarding ? 'onboarding' : 'home');
  return page;
}
try {
  const page = await fixture();
  assert.equal(await page.locator('.site-header').isVisible(), false, 'Onboarding hides the normal header');
  assert.equal(await page.locator('#onboarding-step').textContent(), '1 of 3');
  const board = await state(page);
  assert.equal(board.nodes.length, 9, 'The first lesson is a 3 by 3 board');
  const a = board.nodes.find(node => board.nodes.some(other => adjacent(node, other)));
  const b = board.nodes.find(node => adjacent(a, node));
  await page.mouse.move(a.screen.x, a.screen.y);
  await page.mouse.down();
  await page.mouse.move(b.screen.x, b.screen.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '2 of 3');
  assert.match(await page.locator('#onboarding-message').textContent(), /Each link clears one dot from both nodes/);
  assert.match(await page.locator('#onboarding-message').textContent(), /Double-tap a node to connect every available neighboring node at once/);
  const afterFirst = await state(page);
  const connected = new Set(afterFirst.edges.map(edge => [...edge].sort((a, b) => a - b).join(':')));
  const source = afterFirst.nodes.find(node => node.remaining > 0 && afterFirst.nodes.some(other =>
    other.remaining > 0 && adjacent(node, other) && !connected.has([node.id, other.id].sort((a, b) => a - b).join(':')),
  ));
  const target = afterFirst.nodes.find(other => source && other.remaining > 0 && adjacent(source, other)
    && !connected.has([source.id, other.id].sort((a, b) => a - b).join(':')));
  assert.ok(source && target, 'the goal lesson keeps another legal connection available');
  await page.mouse.move(source.screen.x, source.screen.y);
  await page.mouse.down();
  await page.mouse.move(target.screen.x, target.screen.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).edges.length === 2);
  assert.equal(await page.locator('#onboarding-step').textContent(), '2 of 3', 'the goal copy stays visible while the board remains playable');
  await page.locator('#onboarding-next').click();
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '3 of 3');
  assert.equal((await state(page)).nodes.length, 26, 'The next lesson switches to a 3D board');
  const rotationNode = (await state(page)).nodes.find(node => node.screen?.pickable);
  assert.ok(rotationNode, 'The 3D lesson has a visible node to turn from');
  await page.mouse.move(rotationNode.screen.x, rotationNode.screen.y);
  await page.mouse.down();
  await page.mouse.move(rotationNode.screen.x + 102, rotationNode.screen.y + 15, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === 'Done');
  await page.locator('#onboarding-next').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'home');
  assert.equal(await page.locator('.site-header').isVisible(), true, 'Finishing returns to the normal home screen');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).onboardingCompleted), true, 'Completion is stored');
  await page.close();

  const portrait = await fixture();
  await portrait.setViewportSize({ width: 390, height: 844 });
  await portrait.waitForTimeout(50);
  const portraitLayout = await portrait.evaluate(() => {
    const canvas = document.querySelector('#onboarding-stage canvas');
    const copy = document.querySelector('.onboarding-copy');
    if (!canvas || !copy) throw new Error('Portrait onboarding elements are missing');
    const canvasBounds = canvas.getBoundingClientRect();
    const copyBounds = copy.getBoundingClientRect();
    return {
      height: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      canvasBottom: canvasBounds.bottom,
      copyTop: copyBounds.top,
    };
  });
  assert.ok(portraitLayout.scrollHeight <= portraitLayout.height + 1, 'portrait onboarding fits without vertical page scroll');
  assert.ok(portraitLayout.canvasBottom <= portraitLayout.copyTop, 'portrait lesson copy stays below the board');
  await portrait.close();

  const skipped = await fixture();
  await skipped.locator('#onboarding-skip').click();
  await skipped.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'home');
  assert.equal(await skipped.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).onboardingCompleted), true, 'Skipping is stored');
  await skipped.close();

  const howToPlay = await fixture(false);
  await howToPlay.locator('#help-button').click();
  await howToPlay.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'onboarding');
  assert.equal(await howToPlay.locator('#help-dialog').isVisible(), false, 'How to play starts the guided tutorial instead of a static dialog');
  await howToPlay.locator('#onboarding-skip').click();
  await howToPlay.close();
  assert.deepEqual(errors, []);
  console.log('Passed: skippable first-run 3 by 3 connection lesson, goal explanation, 3D rotation lesson, How to play entry, and persisted completion.');
} finally {
  await browser.close();
}
