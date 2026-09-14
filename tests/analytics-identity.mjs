import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext();
try {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/analytics-config') return route.fulfill({ json: { projectApiKey: 'phc_identity_test', apiHost: 'https://go.nodoku.solokh.com' } });
    if (url.origin === 'http://127.0.0.1:5187') return route.continue();
    // No test events, flags or recordings reach a real service.
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const wait = () => page.waitForFunction(() => window.identityTest?.sdk.get_property('nodoku_identity_version') === 2);
  await page.goto('http://127.0.0.1:5187/tests/fixtures/analytics-identity.html');
  await wait();
  await page.evaluate(() => {
    window.captures = [];
    window.identityTest.sdk.set_config({ opt_out_useragent_filter: true, before_send: event => { window.captures.push(event); return null; } });
  });
  const guest = await page.evaluate(() => window.identityTest.getAnalyticsDistinctId());
  assert.ok(guest && !guest.startsWith('player:'));
  const alice = { id: '11111111-1111-4111-8111-111111111111', nickname: 'Alice' };
  const bob = { id: '22222222-2222-4222-8222-222222222222', nickname: 'Bob' };
  await page.evaluate(player => window.identityTest.player(player), alice);
  assert.equal(await page.evaluate(() => window.identityTest.getAnalyticsDistinctId()), `player:${alice.id}`);
  const identified = await page.evaluate(() => window.captures.find(event => event.event === '$identify'));
  assert.equal(identified.properties.$anon_distinct_id, guest);
  assert.equal(identified.properties.distinct_id, `player:${alice.id}`);
  assert.equal(identified.$set.name, 'Alice');
  const session = await page.evaluate(() => window.identityTest.getAnalyticsSessionId());
  await page.reload(); await wait();
  assert.equal(await page.evaluate(() => window.identityTest.getAnalyticsDistinctId()), `player:${alice.id}`);
  assert.equal(await page.evaluate(() => window.identityTest.getAnalyticsSessionId()), session, 'Reloading the same account preserves the session');
  await page.evaluate(() => window.identityTest.player(null));
  const signedOut = await page.evaluate(() => window.identityTest.getAnalyticsDistinctId());
  assert.notEqual(signedOut, guest);
  assert.ok(!signedOut.startsWith('player:'));
  assert.notEqual(await page.evaluate(() => window.identityTest.getAnalyticsSessionId()), session);
  await page.evaluate(player => window.identityTest.player(player), bob);
  assert.equal(await page.evaluate(() => window.identityTest.getAnalyticsDistinctId()), `player:${bob.id}`);
  await page.evaluate(player => window.identityTest.player(player), alice);
  assert.equal(await page.evaluate(() => window.identityTest.getAnalyticsDistinctId()), `player:${alice.id}`);
  assert.deepEqual(errors, []);
  console.log('Actual PostHog SDK: guest linkage, nickname, sign-out, account switching and reload/session continuity pass.');
} finally {
  await context.close(); await browser.close(); await server.close();
}
