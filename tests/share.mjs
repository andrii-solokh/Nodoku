import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/share';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const state = async page => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const share = page => page.locator('#completion-share');
const status = page => share(page).locator('.completion-share-status');
const native = page => share(page).locator('.share-native');
const copy = page => share(page).locator('.share-copy');
const fallback = page => share(page).locator('.completion-share-fallback');
const message = page => share(page).locator('.completion-share-message');

async function fixture({ nativeSupported = true, clipboardSupported = true, settings = { size: 4, depth: 1, difficulty: 'easy', seed: 123 } } = {}) {
  const solved = new Puzzle(settings);
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route('**/api/analytics-config', route => route.fulfill({ json: { projectApiKey: null } }));
  await page.route('**/api/completions', route => route.fulfill({ json: { recorded: true } }));
  await page.addInitScript(({ settings, edges, nativeSupported, clipboardSupported }) => {
    localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', settings, game: { version: 1, settings, edges, history: [] } }));
    window.__sharing = { nativeCalls: [], copyCalls: [], nativeMode: 'success', copyMode: 'success', pending: null };
    const outcome = mode => {
      if (mode === 'defer') return new Promise((resolve, reject) => { window.__sharing.pending = { resolve, reject }; });
      if (mode === 'abort') return Promise.reject(new DOMException('Share canceled', 'AbortError'));
      if (mode === 'reject') return Promise.reject(new DOMException('Unavailable in this browser', 'NotAllowedError'));
      return Promise.resolve();
    };
    Object.defineProperty(navigator, 'share', { configurable: true, value: nativeSupported ? data => {
      window.__sharing.nativeCalls.push(data);
      return outcome(window.__sharing.nativeMode);
    } : undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboardSupported ? { writeText(text) {
      window.__sharing.copyCalls.push(text);
      return outcome(window.__sharing.copyMode);
    } } : undefined });
  }, { settings, edges: solved.solution.slice(0, -1), nativeSupported, clipboardSupported });
  await page.goto(url);
  // Change the address after boot so payment/admin return handling cannot consume the fixture.
  await page.evaluate(() => history.replaceState(null, '', '/play/share-check?admin=private-admin-token&session_id=private-payment-id&ad_free=success#private-fragment'));
  await page.locator('#resume-button').click();
  assert.deepEqual(await page.evaluate(() => [window.__sharing.nativeCalls, window.__sharing.copyCalls]), [[], []], 'Loading and resuming never invoke sharing or copy');
  return { page, last: solved.solution.at(-1) };
}

async function complete(page, last) {
  const current = await state(page);
  const [a, b] = last.map(id => current.nodes.find(node => node.id === id));
  if (a.screen.pickable && b.screen.pickable) {
    await page.mouse.click(a.screen.x, a.screen.y);
    await page.waitForTimeout(320);
    await page.mouse.click(b.screen.x, b.screen.y);
  } else {
    // A hidden cube edge remains reachable through the existing hint control.
    await page.locator('#hint-button').click();
  }
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).dialog === 'completion-dialog');
  assert.equal((await state(page)).solved, true, 'Real gameplay opens completion');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'next-button', 'Completion focuses the existing continuation action');
  assert.match((await page.locator('#next-button').textContent()) ?? '', /Solve another puzzle/, 'Completion offers another puzzle without implying a daily mode');
  assert.equal((await page.locator('#completion-home').textContent())?.trim(), 'Return home', 'Completion uses a clear home action');
}

async function payload(page) {
  const current = await state(page);
  const text = await share(page).locator('.completion-share-preview').textContent();
  const dimensions = [current.settings.size, current.settings.size];
  if (current.settings.depth > 1) dimensions.push(current.settings.depth);
  assert.ok(text.includes(dimensions.join(' × ')), 'Message identifies the completed grid dimensions');
  const difficulty = { easy: 'Gentle', medium: 'Focused', hard: 'Intricate' }[current.settings.difficulty];
  assert.ok(text.includes(difficulty), 'Message identifies the completed difficulty');
  assert.ok(text.includes(`${current.edges.length} connections`), 'Message uses the actual completed connection count');
  assert.match(text, /Can you solve one too\?/);
  const cleanUrl = new URL(page.url()).origin + new URL(page.url()).pathname;
  return { text, url: cleanUrl, message: `${text}\n\n${cleanUrl}` };
}

async function checkFallback(page, expected) {
  assert.equal(await fallback(page).isVisible(), true, 'Failure exposes manual copy');
  assert.equal(await message(page).inputValue(), expected);
  assert.equal(await message(page).getAttribute('readonly'), '');
  assert.deepEqual(await message(page).evaluate(element => ({ focused: document.activeElement === element, start: element.selectionStart, end: element.selectionEnd })), { focused: true, start: 0, end: expected.length }, 'Fallback text is focused and selected for copying');
}

async function checkLayout(page, label) {
  const layout = await page.locator('#completion-dialog').evaluate(dialog => {
    const rect = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight }, dialog: rect(dialog),
      pageWidth: document.documentElement.scrollWidth,
      clientWidth: dialog.clientWidth, scrollWidth: dialog.scrollWidth,
      controls: [...dialog.querySelectorAll('a, button, textarea')].filter(element => element.getClientRects().length).map(element => ({ label: element.textContent || element.className, ...rect(element) })),
    };
  });
  assert.ok(layout.pageWidth <= layout.viewport.width + 1, `${label}: no horizontal page overflow`);
  assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${label}: no horizontal dialog overflow`);
  assert.ok(layout.dialog.x >= -1 && layout.dialog.y >= -1 && layout.dialog.x + layout.dialog.width <= layout.viewport.width + 1 && layout.dialog.y + layout.dialog.height <= layout.viewport.height + 1, `${label}: dialog fits the viewport`);
  for (const control of layout.controls) {
    assert.ok(control.width > 0 && control.height >= 30, `${label}: ${control.label} has usable dimensions`);
    assert.ok(control.x >= layout.dialog.x - 1 && control.x + control.width <= layout.dialog.x + layout.dialog.width + 1, `${label}: ${control.label} fits the dialog width`);
  }
  const shareControls = share(page).locator('a[data-network], .share-native, .share-copy');
  for (const control of await shareControls.all()) {
    if (!await control.isVisible()) continue;
    const name = await control.getAttribute('aria-label');
    const bounds = await control.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, `${label}: ${name} has a 44px touch target`);
    assert.ok(await control.getAttribute('title'), `${label}: ${name} has a tooltip`);
    assert.equal(await control.locator('svg').count(), 1, `${label}: ${name} uses one icon`);
    assert.equal(await control.locator('svg').getAttribute('aria-hidden'), 'true', `${label}: decorative icon is hidden from assistive technology`);
  }
  // Short screens may scroll inside the modal; both exit controls must remain reachable.
  for (const selector of ['#next-button', '#completion-home']) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    const bounds = await page.locator(selector).boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= layout.viewport.height + 1, `${label}: ${selector} can be reached`);
  }
  await page.locator('#completion-dialog').evaluate(dialog => { dialog.scrollTop = 0; });
}

async function solveNext(page) {
  await page.locator('#next-button').click();
  const next = await state(page);
  assert.equal(next.mode, 'playing');
  assert.equal(next.dialog, null);
  assert.equal(next.edges.length, 0, 'Another puzzle starts a fresh board');
  const total = new Puzzle(next.settings).solution.length;
  for (let index = 0; index < total; index++) await page.locator('#hint-button').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).dialog === 'completion-dialog');
  return payload(page);
}

try {
  const first = await fixture();
  const page = first.page;
  await complete(page, first.last);
  const expected = await payload(page);
  assert.equal(await share(page).locator('h3').textContent(), 'Share your little victory');
  assert.equal(await status(page).getAttribute('aria-live'), 'polite');
  assert.equal(await native(page).isVisible(), true, 'Native Share is offered when supported');
  assert.equal(await copy(page).isVisible(), true);
  for (const [role, name] of [
    ['link', 'Share on X (opens in a new tab)'],
    ['link', 'Open Instagram to share (opens in a new tab)'],
    ['link', 'Open TikTok to share (opens in a new tab)'],
    ['link', 'Share on WhatsApp (opens in a new tab)'],
    ['link', 'Share on Telegram (opens in a new tab)'],
    ['button', 'Share using your device'],
    ['button', 'Copy message'],
  ]) assert.equal(await share(page).getByRole(role, { name, exact: true }).count(), 1, `Icon control retains accessible name: ${name}`);
  assert.deepEqual(await page.evaluate(() => [window.__sharing.nativeCalls, window.__sharing.copyCalls]), [[], []], 'Completion requires an explicit share action');
  await checkLayout(page, 'desktop');
  await page.screenshot({ path: `${out}/completion-desktop.png` });
  await page.setViewportSize({ width: 320, height: 568 });
  await checkLayout(page, '320px with seven share icons');
  await page.screenshot({ path: `${out}/completion-320-icons.png` });
  await page.setViewportSize({ width: 1200, height: 850 });

  const destinations = {
    x: ['https://x.com/intent/tweet', { text: expected.text, url: expected.url }],
    instagram: ['https://www.instagram.com/', {}],
    tiktok: ['https://www.tiktok.com/', {}],
    whatsapp: ['https://wa.me/', { text: expected.message }],
    telegram: ['https://t.me/share/url', { url: expected.url, text: expected.text }],
  };
  const intercepted = [];
  await page.context().route(/^https:\/\/(x\.com|www\.instagram\.com|www\.tiktok\.com|wa\.me|t\.me)\//, route => {
    intercepted.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<title>Intercepted share destination</title>' });
  });
  for (const [network, [destination, params]] of Object.entries(destinations)) {
    const link = share(page).locator(`[data-network="${network}"]`);
    const href = await link.getAttribute('href');
    const parsed = new URL(href);
    assert.equal(parsed.origin + parsed.pathname, destination);
    assert.deepEqual(Object.fromEntries(parsed.searchParams), params, `${network}: share text and URL round-trip through encoding`);
    assert.ok(!decodeURIComponent(href).includes('private-'), `${network}: private URL information is excluded`);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.match(await link.getAttribute('rel'), /noopener/);
    assert.match(await link.getAttribute('rel'), /noreferrer/);
    const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(), href);
    await popup.close();
  }
  assert.equal(intercepted.length, 5, 'All social navigations are intercepted without contacting a platform');

  await page.evaluate(() => { window.__sharing.nativeMode = 'abort'; });
  await native(page).click();
  await page.waitForFunction(() => !document.querySelector('.share-native').disabled);
  assert.equal(await status(page).textContent(), '', 'Canceling native Share is silent');
  assert.equal(await fallback(page).isVisible(), false);
  assert.deepEqual(await page.evaluate(() => window.__sharing.nativeCalls), [{ title: 'Every dot cleared · Nodoku', text: expected.text, url: expected.url }]);
  assert.deepEqual(await page.evaluate(() => window.__sharing.copyCalls), [], 'Canceling does not copy automatically');

  await page.evaluate(() => { window.__sharing.nativeMode = 'success'; });
  await native(page).click();
  await page.waitForFunction(() => document.querySelector('.completion-share-status').textContent.includes('Thanks'));
  await page.evaluate(() => { window.__sharing.nativeMode = 'reject'; });
  await native(page).click();
  await fallback(page).waitFor({ state: 'visible' });
  await checkFallback(page, expected.message);
  assert.match(await status(page).textContent(), /Copy the message/);

  await copy(page).click();
  await page.waitForFunction(() => document.querySelector('.completion-share-status').textContent.includes('copied'));
  assert.deepEqual(await page.evaluate(() => window.__sharing.copyCalls), [expected.message], 'Copy includes the clean invitation URL');
  assert.equal(await fallback(page).isVisible(), false, 'Successful retry clears manual fallback');
  await page.evaluate(() => { window.__sharing.copyMode = 'reject'; });
  await copy(page).click();
  await fallback(page).waitFor({ state: 'visible' });
  await checkFallback(page, expected.message);

  await page.setViewportSize({ width: 320, height: 568 });
  await checkLayout(page, '320px with native Share and fallback');
  assert.equal(await native(page).isVisible(), true);
  await page.screenshot({ path: `${out}/completion-320-native.png` });
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.evaluate(() => { window.__sharing.copyMode = 'defer'; });
  await copy(page).click();
  assert.equal(await copy(page).isDisabled(), true);
  await solveNext(page);
  assert.equal(await status(page).textContent(), '', 'New completion clears previous status');
  assert.equal(await fallback(page).isVisible(), false, 'New completion clears previous fallback');
  assert.equal(await message(page).inputValue(), '', 'New completion clears previous manual-copy text');
  await page.evaluate(async () => { window.__sharing.pending.resolve(); await Promise.resolve(); });
  assert.equal(await status(page).textContent(), '', 'A previous puzzle copy result cannot change the current completion');
  assert.equal(await copy(page).isEnabled(), true);
  await page.evaluate(() => { window.__sharing.nativeMode = 'defer'; });
  await native(page).click();
  await solveNext(page);
  await page.evaluate(async () => { window.__sharing.pending.reject(new DOMException('Late failure', 'NotAllowedError')); await Promise.resolve(); });
  assert.equal(await status(page).textContent(), '', 'A previous puzzle share failure cannot change the current completion');
  assert.equal(await fallback(page).isVisible(), false);
  await page.locator('#completion-home').click();
  assert.equal((await state(page)).mode, 'home');
  assert.equal((await state(page)).dialog, null);
  assert.equal(await page.locator('#start-button').isVisible(), true, 'Completion can return home');
  await page.close();

  const second = await fixture({ nativeSupported: false, clipboardSupported: false, settings: { size: 3, depth: 3, difficulty: 'hard', seed: 321 } });
  const unsupported = second.page;
  await complete(unsupported, second.last);
  const cube = await payload(unsupported);
  assert.equal(await native(unsupported).isVisible(), false, 'Unsupported browsers hide native Share');
  assert.equal(await copy(unsupported).isVisible(), true, 'Copy is always offered');
  await checkLayout(unsupported, 'desktop without native Share');
  await unsupported.screenshot({ path: `${out}/completion-no-native.png` });
  await unsupported.setViewportSize({ width: 320, height: 568 });
  await checkLayout(unsupported, '320px with six share icons');
  await unsupported.screenshot({ path: `${out}/completion-320-no-native.png` });
  await copy(unsupported).click();
  await fallback(unsupported).waitFor({ state: 'visible' });
  await checkFallback(unsupported, cube.message);
  await checkLayout(unsupported, 'mobile without Clipboard API');
  await unsupported.screenshot({ path: `${out}/completion-mobile-fallback.png` });
  await unsupported.locator('#completion-home').click();
  assert.equal((await state(unsupported)).mode, 'home');
  await unsupported.close();
  assert.deepEqual(errors, [], 'No browser or console errors');
  console.log('Passed: accessible share icons and 44px targets, completed flat/cube board details, clean invite URLs, encoded/intercepted social destinations, native success/cancel/failure, clipboard success/rejection/unavailable, selected fallback, stale async results, next/home, desktop and 320px six/seven-icon layouts. No real shares or messages sent.');
} finally {
  await browser.close();
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
}
