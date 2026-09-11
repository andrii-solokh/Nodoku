import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/ambient';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const configFixtures = new WeakMap();
const visibilityOnly = process.argv.includes('--visibility-only');
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')));
const media = page => page.evaluate(() => ({
  contexts: window.__music.contexts,
  elements: window.__music.elements.map(audio => ({
    paused: audio.paused, currentTime: audio.currentTime, duration: audio.duration,
    readyState: audio.readyState, volume: audio.volume, loop: audio.loop,
    src: audio.currentSrc || audio.src, error: audio.error?.code ?? null,
  })),
}));
async function ready(page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  const fixture = configFixtures.get(page);
  if (fixture) {
    await page.locator('#admin-settings').waitFor({ state: 'attached' });
    // Closing the fixture panel must not count as a trusted media gesture.
    if (!fixture.keepOpen) await page.locator('#admin-close').evaluate(button => button.click());
  }
}
const playing = page => page.waitForFunction(() => {
  const audio = window.__music.elements[0];
  return audio && !audio.paused && audio.readyState >= 2 && audio.currentTime > .05 && !audio.error;
}, null, { timeout: 15000 });
const paused = page => page.waitForFunction(() => window.__music.elements[0]?.paused === true);
async function fixture(viewport = { width: 1200, height: 850 }, location = url, options = {}, music = false, showAmbientMusic = true) {
  const page = await browser.newPage({ viewport, ...options });
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/moonlight[^/]*\.mp3(?:\?|$)/i.test(request.url())) requests.push(request.url()); });
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { period: new URL(route.request().url()).searchParams.get('period'), scope: 'local', trackingSince: '2026-09-10T00:00:00Z', totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  const fixtureUrl = new URL(location);
  if (showAmbientMusic !== null) {
    const config = JSON.parse(await fs.readFile(new URL('../config/game-config.json', import.meta.url), 'utf8'));
    config.sound.showAmbientMusic = showAmbientMusic;
    configFixtures.set(page, { keepOpen: fixtureUrl.searchParams.has('admin') });
    fixtureUrl.searchParams.set('admin', '1');
    fixtureUrl.hash = `admin-token=${'a'.repeat(64)}`;
    await page.route('**/api/admin/config', route => {
      assert.equal(route.request().method(), 'GET', 'ambient fixtures never save the owner config');
      return route.fulfill({ json: { config, revision: 'ambient-layout-fixture' } });
    });
  }
  await page.addInitScript(music => {
    if (!sessionStorage.getItem('ambient-fixture')) {
      sessionStorage.setItem('ambient-fixture', 'set');
      // An existing SFX preference must not opt the player into music.
      localStorage.setItem('nodoku.astra.v1', JSON.stringify({ screen: 'home', sound: true, ...(music ? { music: true } : {}),
        settings: { size: 3, depth: 3, difficulty: 'easy', seed: 123 } }));
    }
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    window.__music = { elements: [], contexts: 0 };
    const NativeAudio = window.Audio;
    window.Audio = new Proxy(NativeAudio, { construct(target, args) {
      const audio = Reflect.construct(target, args);
      window.__music.elements.push(audio);
      return audio;
    } });
    // Observe native elements and contexts; playback/decoding remain real.
    const NativeContext = window.AudioContext;
    window.AudioContext = new Proxy(NativeContext, { construct(target, args) {
      window.__music.contexts++;
      return Reflect.construct(target, args);
    } });
  }, music);
  await page.goto(fixtureUrl.href); await ready(page);
  return { page, requests };
}
async function openCredits(page) {
  await page.locator('#music-button').click();
  await page.getByRole('dialog', { name: 'Ambient music', exact: true }).waitFor();
}
async function checkHeader(page, width) {
  const controls = await page.locator('#home-button, .header-actions button').evaluateAll(buttons => buttons.map(button => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { id: button.id, x: box.x, right: box.right, width: box.width, height: box.height,
      clear: hit === button || button.contains(hit) };
  }).filter(button => button.width > 0 && button.height > 0));
  assert.ok(controls.some(button => button.id === 'music-button'), 'Music stays available in the compact header');
  assert.ok(controls.some(button => button.id === 'sound-button'), 'SFX stay available in the compact header');
  assert.ok(controls.every(button => button.x >= 0 && button.right <= width + 1 && button.clear), `Visible header controls fit and remain unobscured at ${width}px`);
}
async function checkCredits(page) {
  const dialog = page.locator('#music-dialog');
  const copy = (await dialog.innerText()).replace(/\s+/g, ' ');
  assert.ok(copy.includes("'Moonlight' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au"), 'The requested credit is visible in full');
  const links = await dialog.locator('a').evaluateAll(anchors => anchors.map(anchor => ({ href: anchor.href, text: anchor.textContent.trim() })));
  assert.ok(links.some(link => new URL(link.href).hostname === 'www.scottbuckley.com.au' && new URL(link.href).pathname.includes('/moonlight')), 'Credits link to the original track');
  assert.ok(links.some(link => new URL(link.href).hostname === 'www.scottbuckley.com.au' && new URL(link.href).pathname === '/'), 'Credits link to the composer');
  assert.ok(links.some(link => link.href.startsWith('https://creativecommons.org/licenses/by/4.0')), 'Credits link to the exact CC BY 4.0 license');
  assert.ok(links.every(link => link.text.length > 0), 'Each credit link has an accessible text label');
}
async function stillPlaying(page, previousTime, label) {
  const current = await media(page);
  assert.equal(current.elements.length, 1, `${label}: reuse one native audio element`);
  assert.equal(current.elements[0].paused, false, `${label}: music keeps playing`);
  assert.equal(current.elements[0].error, null, `${label}: no media error`);
  assert.ok(current.elements[0].currentTime >= previousTime, `${label}: playback position is retained`);
  return current.elements[0].currentTime;
}
async function visibilityChecks() {
  // A plain public load uses the real bundled default, even with music saved on.
  const hidden = await fixture(undefined, url, {}, true, null);
  const page = hidden.page;
  assert.equal((await state(page)).config.sound.showAmbientMusic, false, 'Music is hidden in the bundled default');
  assert.equal(await page.locator('#music-button').isVisible(), false);
  assert.equal(await page.locator('#music-toggle').isDisabled(), true);
  assert.deepEqual(await media(page), { contexts: 0, elements: [] });
  assert.deepEqual(hidden.requests, [], 'A hidden saved-on preference never fetches the recording');
  assert.equal((await stored(page)).music, true, 'The hidden feature preserves the player preference');
  await page.screenshot({ path: `${out}/ambient-hidden-default.png` });
  await page.locator('#start-button').click();
  await page.locator('#music-button').evaluate(button => button.click());
  await page.locator('#music-toggle').evaluate(button => button.click());
  await page.evaluate(() => {
    window.__hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  assert.equal(await page.locator('#music-dialog').isVisible(), false, 'Hidden stale controls cannot reopen credits');
  assert.equal((await media(page)).elements.length, 0, 'Gestures and lifecycle events cannot start hidden music');
  assert.deepEqual(hidden.requests, []);
  assert.equal((await stored(page)).music, true);
  await page.reload(); await ready(page);
  await page.locator('#help-button').click();
  assert.equal((await media(page)).elements.length, 0, 'A hidden preference remains silent after refresh and another gesture');
  assert.deepEqual(hidden.requests, []);
  await page.close();

  const live = await fixture(undefined, url, {}, true);
  await openCredits(live.page); await playing(live.page);
  assert.equal((await media(live.page)).elements.length, 1);
  const toggle = live.page.locator('#config-sound-showAmbientMusic');
  assert.equal(await toggle.getAttribute('type'), 'checkbox');
  assert.equal(await live.page.getByRole('checkbox', { name: 'Show ambient music', exact: true, includeHidden: true }).count(), 1);
  // Apply the actual Studio input event while credits are open, as a live config
  // update could arrive while the native dialog blocks pointer access to Studio.
  await toggle.evaluate(input => { input.checked = false; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await paused(live.page);
  await live.page.locator('#music-dialog').waitFor({ state: 'hidden' });
  assert.equal(await live.page.locator('#music-button').isVisible(), false, 'Live hiding removes the header action');
  assert.equal(await live.page.locator('#music-toggle').isDisabled(), true);
  assert.equal((await state(live.page)).audio.musicEnabled, false, 'Effective playback is off while the option is hidden');
  assert.equal((await stored(live.page)).music, true, 'Live hiding keeps the saved player preference');
  const position = (await media(live.page)).elements[0].currentTime;
  await live.page.waitForTimeout(200);
  assert.ok(Math.abs((await media(live.page)).elements[0].currentTime - position) < .02, 'Live hiding pauses the actual media position');
  await live.page.locator('#admin-open').click();
  const sound = live.page.getByText('Sound', { exact: true });
  if (!await sound.evaluate(summary => summary.parentElement.open)) await sound.click();
  await toggle.scrollIntoViewIfNeeded();
  await live.page.screenshot({ path: `${out}/ambient-admin-hidden.png` });
  await toggle.check();
  await playing(live.page);
  assert.equal(await live.page.locator('#music-button').isVisible(), true);
  assert.equal((await media(live.page)).elements.length, 1, 'Re-showing reuses the existing native recording');
  assert.ok((await media(live.page)).elements[0].currentTime >= position, 'Re-showing resumes from the preserved position');
  assert.equal((await stored(live.page)).music, true);
  await live.page.screenshot({ path: `${out}/ambient-admin-enabled.png` });
  await toggle.uncheck(); await paused(live.page);
  await live.page.close();
}
try {
  if (!process.argv.includes('--mobile-only') && !process.argv.includes('--touch-only')) await visibilityChecks();
  if (!visibilityOnly && !process.argv.includes('--mobile-only') && !process.argv.includes('--touch-only')) {
    const { page, requests } = await fixture();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await media(page), { contexts: 0, elements: [] }, 'Saved SFX does not create music or unlock sound before a gesture');
    assert.deepEqual(requests, [], 'Music is not fetched on initial page load');
    await openCredits(page);
    await checkCredits(page);
    await page.screenshot({ path: `${out}/music-credits-desktop.png` });
    assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'), 'false', 'Music defaults off independently of SFX');
    assert.equal((await media(page)).elements.length, 0, 'Opening credits while muted does not create an audio element');
    assert.deepEqual(requests, [], 'Reading credits does not fetch the track');
    const contextsBeforeMusic = (await media(page)).contexts;
    await page.locator('#music-toggle').click();
    await playing(page);
    await page.waitForFunction(() => Math.abs(window.__music.elements[0].volume - JSON.parse(window.render_game_to_text()).config.sound.ambientVolume) < .001);
    let current = await media(page);
    assert.equal(current.contexts, contextsBeforeMusic, 'Music creates no extra AudioContext');
    assert.equal(current.elements.length, 1);
    assert.equal(current.elements[0].loop, true, 'The licensed recording loops');
    assert.ok(current.elements[0].duration > 30, 'The actual MP3 decoded with a real duration');
    assert.ok(Math.abs(current.elements[0].volume - (await state(page)).config.sound.ambientVolume) < .001, 'Fade-in reaches the configured level');
    assert.ok(current.elements[0].volume > 0 && current.elements[0].volume <= .25, 'The default music level is quiet');
    assert.ok(requests.length > 0, 'Enabling music requests the real track');
    assert.ok(requests.every(request => new URL(request).origin === new URL(url).origin && /\/assets\/moonlight-scott-buckley[^/]*\.mp3$/i.test(new URL(request).pathname)), 'The recording is served as a bundled local asset');
    assert.equal((await stored(page)).music, true, 'Music preference is persisted');
    assert.equal((await stored(page)).sound, true, 'Enabling music preserves the independent SFX preference');
    let time = current.elements[0].currentTime;
    await page.waitForTimeout(200);
    assert.ok((await media(page)).elements[0].currentTime > time + .05, 'Native playback time actually advances');
    await page.keyboard.press('Escape');
    await page.locator('#start-button').click();
    time = await stillPlaying(page, time, 'Starting a puzzle');
    await page.locator('[data-rotate="right"]').click();
    time = await stillPlaying(page, time, 'Turning the board');
    await page.locator('#help-button').click();
    time = await stillPlaying(page, time, 'Reading game help');
    await page.keyboard.press('Escape');
    await page.locator('#sound-button').click();
    assert.equal((await stored(page)).sound, false);
    time = await stillPlaying(page, time, 'Muting SFX');
    await page.locator('#sound-button').click();
    time = await stillPlaying(page, time, 'Enabling SFX');
    await page.locator('#home-button').click();
    await page.locator('[data-size="4"]').click();
    await page.locator('[data-depth="flat"]').click();
    time = await stillPlaying(page, time, 'Home and puzzle settings');
    assert.equal((await media(page)).contexts, contextsBeforeMusic, 'Navigation and music reuse the original SFX context');

    await openCredits(page);
    await page.locator('#music-toggle').click(); await paused(page);
    const pausedTime = (await media(page)).elements[0].currentTime;
    assert.ok(pausedTime >= time, 'Music pauses at its current position');
    await page.waitForTimeout(250);
    assert.ok(Math.abs((await media(page)).elements[0].currentTime - pausedTime) < .02, 'Paused native playback time stays still');
    assert.equal((await stored(page)).music, false);
    await checkCredits(page);
    await page.locator('#music-toggle').click(); await playing(page);
    await page.waitForFunction(previous => window.__music.elements[0].currentTime > previous + .05, pausedTime);
    assert.equal((await media(page)).elements.length, 1, 'Re-enabling music reuses its decoded element');
    await page.keyboard.press('Escape');

    await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await paused(page);
    const hiddenTime = (await media(page)).elements[0].currentTime;
    await page.waitForTimeout(200);
    assert.ok(Math.abs((await media(page)).elements[0].currentTime - hiddenTime) < .02, 'A hidden page stops music playback');
    assert.equal((await stored(page)).music, true, 'Visibility suspension preserves the enabled preference');
    await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await playing(page);
    await page.waitForFunction(previous => window.__music.elements[0].currentTime > previous + .05, hiddenTime);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await paused(page);
    const pagehideTime = (await media(page)).elements[0].currentTime;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await playing(page);
    await page.waitForFunction(previous => window.__music.elements[0].currentTime > previous + .05, pagehideTime);

    requests.length = 0;
    await page.reload(); await ready(page); await page.waitForTimeout(400);
    assert.equal((await stored(page)).music, true, 'Refresh retains the enabled preference');
    assert.deepEqual(await media(page), { contexts: 0, elements: [] }, 'A saved music preference still waits for a new trusted gesture after refresh');
    assert.deepEqual(requests, [], 'Reload does not fetch music before the new gesture');
    await openCredits(page); await playing(page);
    assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'), 'true');
    await page.locator('#music-toggle').click(); await paused(page);
    await page.close();
  }

  if (!visibilityOnly && !process.argv.includes('--touch-only')) {
    for (const width of [320, 390]) {
      const mobile = await fixture({ width, height: width === 320 ? 568 : 844 });
      await checkHeader(mobile.page, width);
      await mobile.page.screenshot({ path: `${out}/music-header-${width}.png` });
      await openCredits(mobile.page);
      await checkCredits(mobile.page);
      assert.deepEqual(mobile.requests, [], 'Mobile credits are available without loading music');
      const box = await mobile.page.locator('#music-dialog').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'Music dialog fits the narrow viewport');
      const pageWidth = await mobile.page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(pageWidth <= width, 'Music credits introduce no horizontal overflow');
      await mobile.page.locator('#music-toggle').scrollIntoViewIfNeeded();
      assert.ok(await mobile.page.locator('#music-toggle').isVisible(), 'Music control stays reachable on a short mobile screen');
      await mobile.page.screenshot({ path: `${out}/music-credits-${width}.png` });
      await mobile.page.keyboard.press('Escape');
      assert.equal(await mobile.page.locator('#music-button').evaluate(button => button === document.activeElement), true, 'Closing credits returns keyboard focus to the music button');
      await mobile.page.close();
    }
    const adminUrl = new URL(url);
    adminUrl.searchParams.set('admin', '1');
    const admin = await fixture({ width: 320, height: 568 }, adminUrl.href);
    await admin.page.locator('#admin-open').waitFor();
    await admin.page.locator('#admin-close').click();
    await checkHeader(admin.page, 320);
    await admin.page.screenshot({ path: `${out}/music-header-admin-320.png` });
    await admin.page.close();
  }
  if (!visibilityOnly) {
  const touch = await fixture({ width: 390, height: 844 }, url, { hasTouch: true, isMobile: true }, true);
  touch.requests.length = 0;
  await touch.page.reload(); await ready(touch.page); await touch.page.waitForTimeout(250);
  assert.equal((await stored(touch.page)).music, true, 'The touch fixture retains its saved music preference through pagehide');
  assert.equal((await media(touch.page)).elements.length, 0, 'Saved music on a touch device remains gesture-gated after reload');
  assert.deepEqual(touch.requests, [], 'Saved music on touch does not fetch before a gesture');
  await touch.page.locator('#start-button').tap();
  await playing(touch.page);
  assert.equal((await state(touch.page)).mode, 'playing', 'The first touch starts the puzzle normally');
  assert.ok((await media(touch.page)).elements[0].currentTime > .05, 'The first touch release unlocks real native music playback');
  await touch.page.close();
  }
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log(visibilityOnly ? 'Passed: hidden bundled default never fetches or plays saved-on music, stale controls stay closed, live Studio hiding stops native playback and closes credits, re-showing preserves the player preference and position.' : process.argv.includes('--touch-only') ? 'Passed: saved music stays gesture-gated after refresh, then plays the real MP3 after the first touch.' : process.argv.includes('--mobile-only')
    ? 'Passed: complete mobile credits, 320/390 controls, authenticated Studio header fit, saved music first-touch native playback.'
    : 'Passed: hidden default and live Studio visibility, preserved preference, lazy local MP3, trusted native playback, quiet looping, independent music/SFX, navigation continuity, pause position, visibility/page lifecycle, refresh gesture gating, complete credits, mobile/Studio header fit and first-touch playback.');
  console.log(`Artifacts: ${out}/music-credits-{desktop,320,390}.png and music-header-{320,390}.png`);
} finally { await browser.close(); await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2)); }
