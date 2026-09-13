import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/audience';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function waitFor(check, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail(label);
}
async function counts(page, online, visitors) {
  await waitFor(async () => {
    const values = await page.locator('#online-count, #online-count-game, #visitor-count, #visitor-count-game').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.id, element.textContent])));
    const formatted = value => typeof value === 'number' ? value.toLocaleString('en-US') : value;
    return values['online-count'] === formatted(online) && values['online-count-game'] === formatted(online)
      && values['visitor-count'] === formatted(visitors) && values['visitor-count-game'] === formatted(visitors);
  }, `Both home and game show online=${online}, visitors=${visitors}`);
}
async function fixture({ clock = false, deferInitial = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'en-US' });
  page.on('pageerror', error => errors.push(error.message));
  if (clock) await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') });
  await page.addInitScript(() => {
    window.__audienceVisibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__audienceVisibility });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__audienceVisibility === 'hidden' });
  });
  const mock = {
    presence: { body: { online: 12, scope: 'local' }, status: 200 },
    visitors: { body: { count: 1234, scope: 'local' }, status: 200 },
    requests: { presence: [], visitors: [], statistics: [] }, pending: [], initialPending: [],
  };
  for (const name of ['presence', 'visitors']) {
    await page.route(`**/api/${name}`, async route => {
      const request = route.request();
      mock.requests[name].push({ method: request.method(), body: request.postData() ? request.postDataJSON() : null });
      const response = mock[name];
      if (deferInitial && mock.initialPending.length < 2) { mock.initialPending.push(route); return; }
      if (response.defer) { mock.pending.push(route); return; }
      await route.fulfill({ status: response.status, json: response.body });
    });
  }
  await page.route('**/api/statistics?**', route => {
    const period = new URL(route.request().url()).searchParams.get('period');
    mock.requests.statistics.push({ period });
    return route.fulfill({ status: mock.visitors.status, json: {
      scope: mock.visitors.body.scope, period, trackingSince: '2026-09-10T00:00:00Z',
      totals: { visitors: mock.visitors.body.count, puzzlesSolved: 42, nodesFilled: 420, connectionsCompleted: 210 },
      daily: [], sizes: [], difficulties: [],
    } });
  });
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.goto(url);
  if (!deferInitial) await counts(page, 12, 1234);
  return { page, mock };
}
async function layout(page, mode, label) {
  const widget = page.locator(mode === 'playing' ? '.visitor-game' : '.visitor-home');
  assert.equal(await widget.isVisible(), true, `${label}: current-screen audience is visible`);
  assert.equal(await page.locator(mode === 'playing' ? '.visitor-home' : '.visitor-game').isVisible(), false, `${label}: other-screen audience is hidden`);
  assert.match(await widget.textContent(), /Online/);
  assert.match(await widget.textContent(), /Visitors/);
  assert.equal(await page.locator('#game-instruction').count(), 0, 'Old game instructions are removed');
  const boxes = await widget.evaluate(element => {
    const rect = node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      widget: rect(element), header: rect(document.querySelector('.site-header')),
      help: rect(document.querySelector('#help-button')),
      inGameHeader: !!element.closest('.site-header #game-activity'),
      inHomeHeader: !!element.closest('.site-header #home-activity'),
      pieces: [...element.querySelectorAll('strong, .visitor-scope')].filter(node => node.getClientRects().length).map(rect),
      neighbors: [...document.querySelectorAll('.brand, .game-header-info, .header-actions')].filter(node => node.getClientRects().length).map(rect),
    };
  });
  assert.ok(boxes.scrollWidth <= boxes.width + 1, `${label}: no horizontal page overflow`);
  assert.ok(boxes.widget.width > 0 && boxes.widget.height > 0 && boxes.widget.x >= 0 && boxes.widget.x + boxes.widget.width <= boxes.width + 1, `${label}: audience fits horizontally`);
  for (const piece of boxes.pieces) {
    assert.ok(piece.x >= boxes.widget.x - 1 && piece.x + piece.width <= boxes.widget.x + boxes.widget.width + 1, `${label}: audience values fit their widget`);
  }
  if (mode === 'playing') {
    assert.equal(boxes.inGameHeader, true, 'Game audience replaces the instruction area in the header');
    assert.ok(boxes.widget.y >= boxes.header.y - 1 && boxes.widget.y + boxes.widget.height <= boxes.header.y + boxes.header.height + 48, `${label}: game audience stays in the header's responsive instruction area`);
  } else {
    assert.equal(boxes.inHomeHeader, true, 'Home audience is mounted in the header');
    if (boxes.width <= 760) {
      assert.ok(boxes.help.x - boxes.widget.x - boxes.widget.width >= 0 && boxes.help.x - boxes.widget.x - boxes.widget.width <= 12, `${label}: audience sits immediately before How to play`);
      assert.ok(Math.abs(boxes.widget.y + boxes.widget.height / 2 - boxes.help.y - boxes.help.height / 2) <= 1, `${label}: audience aligns with the help control`);
    } else {
      assert.ok(Math.abs(boxes.widget.x + boxes.widget.width / 2 - boxes.width / 2) <= 1, `${label}: home audience is centered in the viewport`);
    }
    assert.ok(boxes.widget.y >= boxes.header.y - 1 && boxes.widget.y + boxes.widget.height <= boxes.header.y + boxes.header.height + 1, `${label}: home audience stays within the header`);
  }
  assert.ok(boxes.widget.y + boxes.widget.height <= boxes.height, `${label}: audience stays on screen`);
  for (const neighbor of boxes.neighbors) {
    const width = Math.min(boxes.widget.x + boxes.widget.width, neighbor.x + neighbor.width) - Math.max(boxes.widget.x, neighbor.x);
    const height = Math.min(boxes.widget.y + boxes.widget.height, neighbor.y + neighbor.height) - Math.max(boxes.widget.y, neighbor.y);
    assert.ok(width <= 1 || height <= 1, `${label}: audience does not overlap other header controls`);
  }
}
async function visibility(page, value) {
  await page.evaluate(value => {
    window.__audienceVisibility = value;
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
const snapshot = mock => ({ presence: mock.requests.presence.length, visitors: mock.requests.visitors.length });

try {
  const loading = await fixture({ deferInitial: true });
  await waitFor(() => loading.mock.initialPending.length === 2, 'Initial presence and totals requests begin together');
  assert.equal(await loading.page.locator('.visitor-home').evaluate(widget => widget.classList.contains('is-loading')), true, 'Audience stays together while initial values load');
  const initialPresence = loading.mock.initialPending.find(route => route.request().url().includes('/api/presence'));
  const initialVisitors = loading.mock.initialPending.find(route => route.request().url().includes('/api/visitors'));
  await initialPresence.fulfill({ json: loading.mock.presence.body });
  await waitFor(async () => await loading.page.locator('#online-count').textContent() === '12', 'Presence result reaches the hidden audience');
  assert.equal(await loading.page.locator('.visitor-home').evaluate(widget => widget.classList.contains('is-loading')), true, 'A first result cannot reveal a partial audience message');
  await initialVisitors.fulfill({ json: loading.mock.visitors.body });
  await waitFor(async () => !(await loading.page.locator('.visitor-home').evaluate(widget => widget.classList.contains('is-loading'))), 'Audience fades in after both initial values settle');
  await counts(loading.page, 12, 1234);
  await loading.page.close();

  const { page, mock } = await fixture();
  assert.equal((await state(page)).mode, 'home');
  const firstId = mock.requests.visitors[0].body.visitorId;
  assert.match(firstId, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  assert.equal(mock.requests.visitors[0].method, 'POST');
  assert.deepEqual(mock.requests.presence[0], { method: 'POST', body: { visitorId: firstId } }, 'Presence and visitor registration share one browser identity');
  assert.equal(await page.evaluate(() => localStorage.getItem('nodoku.visitor.v1')), firstId);
  assert.match(await page.locator('.visitor-home .visitor-scope').textContent(), /Preview/);
  for (const viewport of [{ width: 1440, height: 960 }, { width: 1000, height: 760 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await layout(page, 'home', `home ${viewport.width}px`);
    await page.screenshot({ path: `${out}/home-${viewport.width}.png`, fullPage: true });
  }
  await page.locator('[data-depth="flat"]').click();
  await page.locator('#start-button').click();
  await page.evaluate(() => window.advanceTime(400));
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await layout(page, 'playing', `game ${viewport.width}px`);
    await page.screenshot({ path: `${out}/game-${viewport.width}.png` });
  }
  const board = await state(page);
  const node = board.nodes.find(node => node.screen.pickable && node.remaining > 0);
  await page.mouse.click(node.screen.x, node.screen.y);
  await waitFor(async () => (await state(page)).selected === node.id, 'Real node input selects a node');
  assert.equal(await page.locator('#game-instruction').count(), 0, 'Selecting a node does not restore instructions');
  assert.doesNotMatch(await page.locator('.site-header').textContent(), /Tap a pair|Choose a neighboring node|dots left/);
  await counts(page, 12, 1234);
  await page.reload();
  await counts(page, 12, 1234);
  assert.equal((await state(page)).mode, 'playing', 'Refresh preserves the game beside live counts');
  assert.ok(mock.requests.visitors.filter(request => request.method === 'POST').length >= 2);
  assert.ok(mock.requests.visitors.filter(request => request.method === 'POST').every(request => request.body.visitorId === firstId), 'Refresh reuses the visitor identity');
  assert.ok(mock.requests.presence.every(request => request.body.visitorId === firstId));
  await page.close();

  const timed = await fixture({ clock: true });
  const live = timed.page;
  const control = timed.mock;
  await live.clock.pauseAt(await live.evaluate(() => Date.now() + 1000));
  let before = snapshot(control);
  control.presence.body = { online: 15, scope: 'global' };
  control.visitors.body = { count: 1235, scope: 'global' };
  await live.clock.fastForward(30000);
  await counts(live, 15, 1234);
  assert.equal(control.requests.presence.length, before.presence + 1, 'Presence renews after 30 seconds');
  assert.equal(control.requests.visitors.length, before.visitors, 'Visitor refresh waits for its 60-second interval');
  await live.clock.fastForward(30000);
  await counts(live, 15, 1235);
  assert.equal(control.requests.visitors.at(-1).method, 'GET', 'Visitor polling reads without registering another visit');
  assert.equal(control.requests.visitors.at(-1).body, null);
  assert.equal(await live.locator('.visitor-home .visitor-scope').isVisible(), false, 'Global counts do not carry a preview label');
  assert.ok(control.requests.presence.every(request => request.method === 'POST' && request.body.visitorId === control.requests.visitors[0].body.visitorId));

  control.presence.body = { online: -1, scope: 'global' };
  control.visitors.body = { count: '1235', scope: 'global' };
  await live.clock.fastForward(60000);
  await counts(live, '—', '—');
  control.presence = { body: { online: 16, scope: 'global' }, status: 200 };
  control.visitors = { body: { count: 1236, scope: 'global' }, status: 200 };
  await live.clock.fastForward(60000);
  await counts(live, 16, 1236);
  control.presence = { body: { error: 'Temporarily unavailable' }, status: 503 };
  control.visitors = { body: { error: 'Temporarily unavailable' }, status: 503 };
  await live.clock.fastForward(60000);
  await counts(live, '—', '—');
  control.presence = { body: { online: 17, scope: 'local' }, status: 200 };
  control.visitors = { body: { count: 1237, scope: 'local' }, status: 200 };
  await live.clock.fastForward(60000);
  await counts(live, 17, 1237);

  await visibility(live, 'hidden');
  before = snapshot(control);
  await live.clock.fastForward(180000);
  assert.deepEqual(snapshot(control), before, 'Hidden tabs stop presence and visitor polling');
  control.presence.body = { online: 18, scope: 'local' };
  control.visitors.body = { count: 1238, scope: 'local' };
  await visibility(live, 'visible');
  await counts(live, 18, 1238);
  assert.ok(control.requests.presence.length > before.presence && control.requests.visitors.length > before.visitors, 'Visible tabs refresh both counts immediately');

  await live.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  before = snapshot(control);
  await live.clock.fastForward(180000);
  assert.deepEqual(snapshot(control), before, 'Pagehide stops polling');
  control.presence.body = { online: 19, scope: 'global' };
  control.visitors.body = { count: 1239, scope: 'global' };
  await live.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await counts(live, 19, 1239);

  control.presence.body = { online: 20, scope: 'global' };
  control.visitors.body = { count: 1240, scope: 'global' };
  await live.evaluate(() => window.dispatchEvent(new Event('online')));
  await counts(live, 20, 1240);
  control.presence = { defer: true };
  await live.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => control.pending.length === 1, 'A delayed presence request is in flight');
  const stale = control.pending.shift();
  await live.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  control.presence = { body: { online: 21, scope: 'global' }, status: 200 };
  control.visitors.body = { count: 1241, scope: 'global' };
  await live.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await counts(live, 21, 1241);
  await stale.fulfill({ json: { online: 999, scope: 'local' } });
  await live.evaluate(() => Promise.resolve());
  await counts(live, 21, 1241);
  assert.equal(await live.locator('.visitor-home .visitor-scope').isVisible(), false, 'An old request cannot replace newer scope/count values');
  await live.close();

  const rotating = await fixture({ clock: true });
  const rotatingPage = rotating.page;
  await rotatingPage.clock.pauseAt(await rotatingPage.evaluate(() => Date.now() + 1000));
  const currentMetric = () => rotatingPage.locator('.visitor-home .audience-rotating > :not([hidden])').textContent();
  assert.match(await currentMetric(), /Puzzles solved/, 'Solved puzzles are the initial stat');
  assert.match(await rotatingPage.locator('.visitor-home .audience-link').getAttribute('aria-label'), /12 online, 42 puzzles solved all time\. Open statistics/, 'The button name includes the current audience values');
  const originalWidth = (await rotatingPage.locator('.visitor-home').boundingBox()).width;
  await rotatingPage.clock.fastForward(30000);
  assert.match(await currentMetric(), /Puzzles solved/, 'Idle time never cycles the metric');
  rotating.mock.visitors.body.count = 1235;
  await rotatingPage.evaluate(() => window.dispatchEvent(new Event('online')));
  await counts(rotatingPage, 12, 1235);
  assert.match(await currentMetric(), /Visitors/, 'A changed total becomes the visible metric');
  assert.match(await rotatingPage.locator('.visitor-home .audience-link').getAttribute('aria-label'), /12 online, 1,235 visitors all time\. Open statistics/);
  assert.equal((await rotatingPage.locator('.visitor-home').boundingBox()).width, originalWidth, 'Changed labels do not shift the audience layout');
  await rotatingPage.clock.fastForward(30000);
  assert.match(await currentMetric(), /Visitors/, 'An unchanged refresh keeps the last changed metric');
  await rotatingPage.emulateMedia({ reducedMotion: 'reduce' });
  await rotatingPage.clock.fastForward(60000);
  assert.match(await currentMetric(), /Visitors/, 'Reduced motion keeps event-driven updates');
  const registrationCount = rotating.mock.requests.visitors.filter(request => request.method === 'POST').length;
  await rotatingPage.clock.fastForward(24 * 60 * 60 * 1000);
  // A clock jump can expire an in-flight request; let its retry timer settle.
  await new Promise(resolve => setTimeout(resolve, 100));
  await rotatingPage.clock.fastForward(30000);
  await waitFor(() => rotating.mock.requests.visitors.filter(request => request.method === 'POST').length === registrationCount + 1, 'A continuously open tab registers its browser for the new UTC day');
  assert.ok(rotating.mock.requests.visitors.filter(request => request.method === 'POST').every(request => request.body.visitorId === rotating.mock.requests.visitors[0].body.visitorId), 'New-day registration retains the same browser identity');
  await rotatingPage.close();

  const direct = await browser.newPage();
  direct.on('pageerror', error => errors.push(error.message));
  let registered = false;
  let releaseRegistration;
  let publicLoads = 0;
  let registrationEvents = 0;
  await direct.exposeFunction('recordVisitorRegistration', () => { registrationEvents++; });
  await direct.addInitScript(() => window.addEventListener('nodoku:visitor-registered', () => window.recordVisitorRegistration()));
  await direct.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await direct.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await direct.route('**/api/visitors', async route => {
    if (route.request().method() === 'POST') {
      await new Promise(resolve => { releaseRegistration = resolve; });
      registered = true;
    }
    await route.fulfill({ json: { count: registered ? 1 : 0, scope: 'local' } });
  });
  await direct.route('**/api/statistics?**', route => {
    const period = new URL(route.request().url()).searchParams.get('period');
    if (period === '30d') publicLoads++;
    return route.fulfill({ json: { scope: 'local', period, trackingSince: '2026-09-10T00:00:00Z', totals: { visitors: registered ? 1 : 0, puzzlesSolved: 0, nodesFilled: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } });
  });
  await direct.goto(`${url}#statistics`);
  await waitFor(async () => typeof releaseRegistration === 'function' && await direct.locator('[data-total="visitors"]').textContent() === '0', 'A direct statistics entry can load before new-visitor registration completes');
  releaseRegistration();
  await waitFor(async () => await direct.locator('[data-total="visitors"]').textContent() === '1', 'The open statistics page refreshes after visitor registration');
  assert.equal(publicLoads, 2, 'The registration event refreshes the initial public snapshot once');
  await waitFor(() => registrationEvents === 1, 'Successful POST dispatches the registration event');
  await direct.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitFor(async () => await direct.locator('#online-count').textContent() === '1', 'Ordinary audience refresh finishes');
  assert.equal(registrationEvents, 1, 'GET refreshes do not dispatch registration events');
  assert.equal(publicLoads, 2, 'Ordinary GET polling does not reload the open statistics page');
  await direct.close();
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('Passed: desktop centered activity and mobile activity before help, game header layouts, selected-node UI, refresh identity/counts, 30s presence and 60s statistics polling, validation/error recovery, lifecycle pause/resume, stale responses, stable event-driven stats without idle rotation, and UTC-day visitor registration.');
} finally {
  await browser.close();
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
}
