import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { webkit, chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await (process.env.TEST_BROWSER === 'chromium' ? chromium : webkit).launch();
await mkdir('output/web-game/accounts', { recursive: true });
try {
  for (const width of (process.env.TEST_WIDTHS || '1440,390,320').split(',').map(Number)) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let player = { id: 'a4444444-4444-4444-8444-444444444444', nickname: 'Mira', avatarUrl: 'https://lh3.googleusercontent.com/a/avatar-fixture' };
    await page.route('https://lh3.googleusercontent.com/a/avatar-fixture', route => route.fulfill({
      contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#8470b6"/><circle cx="40" cy="29" r="14" fill="#eae6f1"/><ellipse cx="40" cy="70" rx="28" ry="25" fill="#eae6f1"/></svg>',
    }));
    let enabled = true, challengeFails = true, credentialFails = true;
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
      window.google = { accounts: { id: {
        initialize(options) { window.googleOptions = options; },
        renderButton(host, options) { window.googleRenderOptions = options;
          window.googleRenderCount = (window.googleRenderCount || 0) + 1;
          const button = document.createElement('button');
          button.style.width = options.width + 'px'; button.style.height = '40px';
          button.innerHTML = '<img src="/google-g.png" width="20" height="20" alt="">Continue with Google';
          button.onclick = () => { if (!window.cancelGoogle) window.googleOptions.callback({ credential: 'inline-test-credential' }); };
          host.replaceChildren(button); }
      } } };` }));
    const calls = [];
    await page.addInitScript(() => { if (!localStorage.getItem('nodoku.astra.v1')) localStorage.setItem('nodoku.astra.v1', JSON.stringify({ onboardingCompleted: true, screen: 'home', sound: false })); });
    await page.route('**/api/**', route => {
      const u = new URL(route.request().url()), path = u.pathname;
      calls.push({ path, search: u.search, body: route.request().postDataJSON() });
      const reply = json => route.fulfill({ json });
      if (path === '/api/auth/config') return reply({ enabled, clientId: '123-test.apps.googleusercontent.com' });
      if (path === '/api/auth/challenge') {
        if (challengeFails) return route.fulfill({ status: 503, json: { error: 'Sign-in unavailable in fixture.' } });
        return reply({ nonce: 'inline-test-nonce' });
      }
      if (path === '/api/auth/google') {
        if (credentialFails) return route.fulfill({ status: 401, json: { error: 'Please try signing in again.' } });
        player = { id: 'signed-in-player', nickname: 'Mira Google', avatarUrl: 'https://lh3.googleusercontent.com/a/avatar-fixture' };
        return reply({ player });
      }
      if (path === '/api/auth/me') return reply({ player });
      if (path === '/api/auth/profile') { player = { ...player, ...route.request().postDataJSON() }; return reply({ player }); }
      if (path === '/api/auth/logout' || path === '/api/auth/delete') { player = null; return reply({ ok: true }); }
      if (path === '/api/leaderboard' && u.searchParams.get('size') === '4') return reply({
        entries: [{ ...player, solved: 3, rank: 1, bestTimeMs: u.searchParams.get('perspective') === 'flat' ? 30000 : 50000 }],
        me: { solved: 3, rank: 1, bestTimeMs: u.searchParams.get('perspective') === 'flat' ? 30000 : 50000 },
      });
      if (path === '/api/leaderboard') return reply({ entries: u.searchParams.get('size') === '5' ? [] : [
        { id: 'other', nickname: 'Juniper', profileUrl: 'https://github.com/juniper', solved: 18, rank: 1, bestTimeMs: 65000 },
        ...(player ? [{ ...player, solved: 12, rank: 2, bestTimeMs: 125000 }] : []),
        { id: 'third', nickname: 'Player <b>safe</b>', profileUrl: 'javascript:alert(1)', solved: 12, rank: 2, bestTimeMs: null },
      ], me: player ? { solved: 12, rank: 2, bestTimeMs: 125000 } : null });
      if (path === '/api/ranked-attempts') return reply({ ticket: 'a'.repeat(64), playerId: player.id });
      if (path === '/api/analytics-config') return reply({});
      if (path === '/api/sponsorship') return reply({ available: false, sponsors: [] });
      if (path === '/api/visitors') return reply({ count: 20, scope: 'local' });
      if (path === '/api/presence') return reply({ online: 1, scope: 'local' });
      if (path === '/api/statistics') return reply({ period: u.searchParams.get('period') || '30d', scope: 'local', trackingSince: '2026-09-01T00:00:00Z', totals: { visitors: 20, puzzlesSolved: 0, nodesFilled: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] });
      return reply({});
    });
    await page.goto(url);
    await page.locator('#leaderboard-button').waitFor();
    await page.locator('#app-loader').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#account-button img')?.naturalWidth > 0);
    assert.equal(await page.locator('#account-button img').getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(await page.locator('#account-button svg').count(), 0);
    await page.screenshot({ path: `output/web-game/accounts/header-${width}.png` });
    const header = await page.locator('.site-header').boundingBox();
    const sound = await page.locator('#account-button').boundingBox();
    assert.ok(sound.x + sound.width <= header.x + header.width, 'Account navigation fits the header');
    await page.locator('#leaderboard-button').click();
    const dialog = page.locator('#leaderboard-popup');
    await page.locator('.ranking-table .is-you').waitFor();
    assert.equal(await page.locator('dialog:modal').count(), 0, 'Popup does not make the page modal');
    assert.equal(await page.locator('#profile-popup').isHidden(), true);
    assert.equal(await page.locator('[data-tab]').count(), 0, 'Profile and ranking have no shared tabs');
    const popupBounds = await dialog.boundingBox(), triggerBounds = await page.locator('#leaderboard-button').boundingBox();
    assert.ok(popupBounds.y >= triggerBounds.y + triggerBounds.height);
    assert.ok(popupBounds.x >= 0 && popupBounds.x + popupBounds.width <= width);
    assert.equal(await page.locator('.ranking-table b').count(), 0, 'Public nicknames are rendered as text');
    const website = dialog.locator('.ranking-player-link');
    assert.equal(await website.count(), 1, 'Unsafe website schemes stay plain text');
    assert.equal(await website.getAttribute('href'), 'https://github.com/juniper');
    assert.equal(await website.getAttribute('target'), '_blank');
    assert.match(await website.getAttribute('rel'), /noopener noreferrer/);
    assert.deepEqual(await page.locator('.ranking-personal td').allTextContents(), ['2', 'You', '12', '2:05']);
    await page.screenshot({ path: `output/web-game/accounts/leaderboard-${width}.png`, fullPage: true });
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await dialog.locator('select').count(), 0, 'Categories use the matrix rather than dropdowns');
    assert.ok(calls.some(call => call.path === '/api/leaderboard' && call.search === '?period=all&perspective=3d'));
    assert.deepEqual(await page.locator('.ranking-table th').allTextContents(), ['Rank', 'Player', 'Solved', 'Best time']);
    assert.deepEqual(await dialog.locator('.ranking-table tbody td:last-child').allTextContents(), ['1:05', '2:05', '—']);
    assert.equal(await dialog.locator('[data-ranking-size]').count(), 9);
    const category = dialog.locator('[data-ranking-size="4"][data-ranking-difficulty="medium"]');
    await category.click();
    await page.waitForFunction(() => document.querySelector('.ranking-personal td:last-child')?.textContent === '0:50');
    assert.ok(calls.some(call => call.search === '?period=all&perspective=3d&size=4&difficulty=medium'));
    assert.equal(await category.getAttribute('aria-pressed'), 'true');
    assert.equal(await dialog.locator('[data-ranking-perspective="3d"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await dialog.locator('[data-ranking-perspective]').allTextContents(), ['3D', 'Flat']);
    assert.doesNotMatch(await dialog.innerText(), /Gentle|Focused|Intricate|All puzzles/);
    assert.deepEqual(await dialog.locator('.ranking-table tbody td').allTextContents(), ['1', 'Mira', '3', '0:50']);
    const corners = await dialog.locator('.ranking-table').evaluate(table => ({
      table: getComputedStyle(table).borderTopLeftRadius,
      left: getComputedStyle(table.querySelector('.is-you td:first-child')).borderTopLeftRadius,
      right: getComputedStyle(table.querySelector('.is-you td:last-child')).borderTopRightRadius,
    }));
    assert.deepEqual(corners, { table: '12px', left: '12px', right: '12px' });
    await page.waitForTimeout(250); // Let the selected-button color transition finish for the visual check.
    await page.screenshot({ path: `output/web-game/accounts/matrix-${width}.png`, fullPage: true });
    await dialog.locator('[data-ranking-perspective="flat"]').click();
    await page.waitForFunction(() => document.querySelector('.ranking-personal td:last-child')?.textContent === '0:30');
    assert.ok(calls.some(call => call.search === '?period=all&perspective=flat&size=4&difficulty=medium'));
    assert.equal(await dialog.locator('[data-ranking-size]:visible').count(), 6);
    assert.equal(await dialog.locator('[data-ranking-size-label="3"]').isHidden(), true);
    assert.equal(await dialog.locator('[data-ranking-size="3"]:enabled').count(), 0);
    await dialog.locator('[data-ranking-size="5"][data-ranking-difficulty="hard"]').click();
    await dialog.locator('.ranking-empty').waitFor();
    assert.equal(await dialog.locator('.ranking-table').isHidden(), true);
    await dialog.locator('[data-ranking-perspective="3d"]').click();
    assert.equal(await dialog.locator('[data-ranking-size]:visible').count(), 9);
    await dialog.locator('[data-ranking-size="3"][data-ranking-difficulty="easy"]').click();
    await dialog.locator('.ranking-table .is-you').waitFor();
    assert.equal(await dialog.locator('[data-ranking-size][aria-pressed="true"]').count(), 1);
    assert.deepEqual(await dialog.locator('.ranking-personal td').allTextContents(), ['2', 'You', '12', '2:05']);
    await dialog.locator('[data-ranking-perspective="flat"]').click();
    await page.waitForFunction(() => document.querySelector('.ranking-personal td:last-child')?.textContent === '0:30');
    assert.equal(await dialog.locator('[data-ranking-size="4"][data-ranking-difficulty="easy"]').getAttribute('aria-pressed'), 'true');
    assert.equal(calls.some(call => call.path === '/api/leaderboard' && call.search.includes('perspective=flat&size=3')), false);
    await page.locator('#account-button').click();
    assert.equal(await dialog.isHidden(), true, 'Opening profile closes the leaderboard');
    await page.locator('[name="nickname"]').fill('Mira Nova');
    await page.locator('[name="profileUrl"]').fill('https://www.linkedin.com/in/mira/');
    assert.equal(await page.locator('[name="listed"]').count(), 0);
    await page.locator('.player-profile [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#profile-popup .player-status').textContent === 'Profile saved.');
    assert.equal(player.nickname, 'Mira Nova');
    assert.equal(player.profileUrl, 'https://www.linkedin.com/in/mira/');
    await page.locator('#profile-popup .player-close').click();
    await page.locator('#account-button').click();
    assert.equal(await page.locator('[name="profileUrl"]').inputValue(), player.profileUrl);
    await page.screenshot({ path: `output/web-game/accounts/profile-${width}.png`, fullPage: true });
    await page.locator('.player-popup:not([hidden]) .player-close').click();
    await page.locator('#start-button').click();
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).mode === 'playing');
    await page.waitForTimeout(100);
    assert.equal(calls.filter(call => call.path === '/api/ranked-attempts').length, 1);
    const bounds = await page.locator('#game-stage').boundingBox();
    await page.route('https://lh3.googleusercontent.com/a/broken-avatar', route => route.fulfill({ status: 404, body: '' }));
    player.avatarUrl = 'https://lh3.googleusercontent.com/a/broken-avatar';
    await page.locator('#account-button').click();
    await page.waitForFunction(() => !document.querySelector('#account-button img') && document.querySelector('#account-button svg'));
    await page.locator('.player-logout').click();
    await page.locator('.player-guest').waitFor();
    assert.equal(await page.locator('#account-button img').count(), 0, 'Signing out removes the avatar');
    assert.equal(await page.locator('#account-button').getAttribute('aria-label'), 'Sign in');
    await page.locator('.player-popup:not([hidden]) .player-close').click();
    assert.deepEqual(await page.locator('#game-stage').boundingBox(), bounds, 'Opening accounts does not resize gameplay');
    await page.locator('#account-button').click();
    await page.locator('.player-signin img').waitFor();
    assert.equal(await page.locator('.player-signin img').evaluate(img => img.complete && img.naturalWidth > 0), true, 'Google logo loads');
    await page.screenshot({ path: `output/web-game/accounts/signin-popup-${width}.png` });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#profile-popup').isHidden(), true, 'Escape dismisses the profile');
    assert.equal(await page.locator('#account-button').evaluate(el => el === document.activeElement), true);
    await page.locator('#account-button').click();
    await page.mouse.click(4, 4);
    assert.equal(await page.locator('#profile-popup').isHidden(), true, 'Outside click dismisses the popup');
    await page.locator('#account-button').click();
    const gameUrl = page.url();
    await page.locator('.player-signin:enabled').waitFor();
    challengeFails = false;
    const signInBounds = await page.locator('.player-google-slot').boundingBox();
    await page.locator('.player-signin').click();
    const google = page.locator('.player-google-button button');
    await google.waitFor();
    assert.equal(await page.evaluate(() => window.googleRenderOptions.width), Math.floor(signInBounds.width), 'Google receives the visible slot width');
    assert.deepEqual(await page.locator('.player-google-slot').boundingBox(), signInBounds, 'Loading and ready buttons occupy the same space');
    assert.equal(await page.locator('.player-signin').isHidden(), true);
    const challengeCount = calls.filter(call => call.path === '/api/auth/challenge').length;
    const renderCount = await page.evaluate(() => { window.savedGoogleButton = document.querySelector('.player-google-button button'); return window.googleRenderCount; });
    await page.locator('#profile-popup .player-close').click();
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/me')),
      page.locator('#account-button').click(),
    ]);
    assert.equal(await page.evaluate(() => document.querySelector('.player-google-button button') === window.savedGoogleButton), true, 'Reopening retains the loaded Google button');
    assert.equal(await page.evaluate(() => window.googleRenderCount), renderCount);
    assert.equal(calls.filter(call => call.path === '/api/auth/challenge').length, challengeCount, 'Reopening reuses the unexpired challenge');
    assert.equal(await page.locator('.player-signin').isHidden(), true, 'Reopening never shows the loading placeholder');
    await page.locator('#profile-popup .player-close').click();
    await page.evaluate(() => { window.originalNow = Date.now; Date.now = () => window.originalNow() + 10 * 60 * 1000; });
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/challenge')),
      page.locator('#account-button').click(),
    ]);
    await page.waitForFunction(() => !document.querySelector('.player-google-button').inert);
    assert.equal(calls.filter(call => call.path === '/api/auth/challenge').length, challengeCount + 1, 'Expired challenges are refreshed before reuse');
    assert.equal(await page.evaluate(() => window.googleRenderCount), renderCount + 1, 'The refreshed widget receives the new challenge configuration');
    await page.evaluate(() => { Date.now = window.originalNow; });
    // Sign-in helpers can mount outside our popup and take focus without a click.
    await page.evaluate(() => {
      const helper = document.createElement('button');
      helper.id = 'signin-helper'; helper.textContent = 'Sign-in options';
      document.body.append(helper); helper.focus();
    });
    assert.equal(await page.locator('#profile-popup').isVisible(), true, 'External sign-in focus does not dismiss the profile');
    assert.equal(await page.locator('#account-button').getAttribute('aria-expanded'), 'true');
    await page.locator('#signin-helper').evaluate(el => el.remove());
    assert.deepEqual(await page.evaluate(() => ({ mode: window.googleOptions.ux_mode, nonce: window.googleOptions.nonce, clientId: window.googleOptions.client_id })),
      { mode: 'popup', nonce: 'inline-test-nonce', clientId: '123-test.apps.googleusercontent.com' });
    await page.evaluate(() => { window.cancelGoogle = true; window.originalCanvas = document.querySelector('canvas'); });
    await google.click();
    assert.equal(page.url(), gameUrl, 'Cancelling Google leaves the game page open');
    assert.equal(await page.locator('.player-guest').isVisible(), true);
    await page.evaluate(() => { window.cancelGoogle = false; });
    await google.click();
    await page.waitForFunction(() => document.querySelector('#profile-popup .player-status').textContent === 'Please try signing in again.');
    await google.waitFor();
    credentialFails = false;
    await google.click();
    await page.locator('.player-profile').waitFor();
    assert.equal(await page.locator('[name="nickname"]').inputValue(), 'Mira Google');
    await page.waitForFunction(() => document.querySelector('#account-button img')?.naturalWidth > 0);
    assert.equal(page.url(), gameUrl, 'Successful sign-in never navigates');
    assert.equal(await page.evaluate(() => document.querySelector('canvas') === window.originalCanvas), true, 'Same game canvas survives sign-in');
    assert.deepEqual(await page.locator('#game-stage').boundingBox(), bounds, 'Sign-in does not move the puzzle');
    assert.ok(calls.some(call => call.path === '/api/auth/google' && call.body.credential === 'inline-test-credential'));
    await page.locator('#profile-popup .player-close').click();
    enabled = false;
    await page.reload();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#account-button').isHidden(), true, 'Disabled rollout hides account navigation');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: all-time rankings, public text safety, profile/privacy, ranked start, sign-out, cancellation and disabled rollout passed`);
  }
  const signin = await browser.newPage({ viewport: { width: 390, height: 850 } });
  await signin.addInitScript(() => sessionStorage.setItem('nodoku.signin.return', '/?from=signin'));
  const credentials = [];
  await signin.route('**/api/auth/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/config')) return route.fulfill({ json: { enabled: true, clientId: '123-test.apps.googleusercontent.com' } });
    if (path.endsWith('/challenge')) return route.fulfill({ json: { nonce: 'test-nonce' } });
    if (path.endsWith('/google')) { credentials.push(route.request().postDataJSON()); return route.fulfill({ json: { player: { id: 'player-a' } } }); }
    return route.fulfill({ json: { player: null } });
  });
  await signin.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: {
      initialize(options) { window.googleOptions = options; },
      renderButton(host) { const button = document.createElement('button'); button.textContent = 'Continue with Google';
        button.onclick = () => window.googleOptions.callback({ credential: 'test-credential' }); host.append(button); }
    } } };` }));
  await signin.goto(url + '/signin.html');
  await signin.getByRole('button', { name: 'Continue with Google' }).waitFor();
  assert.deepEqual(await signin.evaluate(() => ({ clientId: window.googleOptions.client_id, nonce: window.googleOptions.nonce })),
    { clientId: '123-test.apps.googleusercontent.com', nonce: 'test-nonce' });
  await signin.screenshot({ path: 'output/web-game/accounts/signin-390.png' });
  await signin.getByRole('button', { name: 'Continue with Google' }).click();
  await signin.waitForURL('**/?from=signin');
  assert.deepEqual(credentials, [{ credential: 'test-credential' }]);
  await signin.close();
  console.log('Sign-in page: configured client/nonce, credential callback and safe return passed (Google UI mocked).');
} finally { await browser.close(); }
