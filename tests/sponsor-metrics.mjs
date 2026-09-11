import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const errors = [];
const sponsor = index => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, brand: `Sponsor ${index}`, tagline: 'A useful independent product.', url: `https://sponsor.example/${index}`, endsAt: '2030-01-01T00:00:00Z' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await sleep(40); }
  assert.fail(label);
}
async function fixture({ sponsors = [sponsor(1)], paid = false, fail = false, adFree = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') });
  await page.addInitScript(() => {
    window.__visible = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !window.__visible });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copied = value; } } });
  });
  if (adFree) await page.addInitScript(() => localStorage.setItem("nodoku.ad-free.receipt.v1", "cs_test_adfreefixture"));
  await page.route("**/api/ad-free/entitlement", route => route.fulfill({ json: { status: "paid" } }));
  const requests = [];
  let failures = fail ? 1 : 0;
  await page.route('**/api/sponsor-events', route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (failures-- > 0) return route.fulfill({ status: 503, json: { error: 'Temporary unavailable' } });
    return route.fulfill({ json: { recorded: true } });
  });
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { scope: 'local', period: 'all', trackingSince: null, totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors } }));
  await page.route('**/api/checkout-status?**', route => route.fulfill({ json: { status: paid ? 'paid' : 'unavailable' } }));
  await page.context().route('https://sponsor.example/**', route => route.fulfill({ body: 'Test sponsor destination' }));
  await page.goto(paid ? `${url}/?sponsorship=success&session_id=cs_test_privatereportcode` : url);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  return { page, requests };
}
async function advance(page, ms) { await page.clock.fastForward(ms); await sleep(120); }
async function start(page) { await page.locator('#start-button').click(); await sleep(150); }
async function visible(page, value) { await page.evaluate(value => { window.__visible = value; document.dispatchEvent(new Event('visibilitychange')); }, value); }
async function clickLink(page, keyboard = false, middle = false) {
  const link = page.locator('#sponsor-slot-game .sponsor-link[data-sponsor-id]').first();
  if (middle) {
    await link.click({ button: 'middle' });
    for (const extra of page.context().pages()) if (extra !== page) await extra.close();
    return;
  }
  const popup = page.waitForEvent('popup');
  if (keyboard) { await link.focus(); await link.press('Enter'); } else await link.click({ button: middle ? "middle" : "left" });
  await (await popup).close();
}
try {
  const normal = await fixture();
  await advance(normal.page, 1500);
  assert.equal(normal.requests.length, 0, 'config-hidden home sponsorship and placeholders never count');
  await start(normal.page);
  await advance(normal.page, 1200);
  await waitFor(() => normal.requests.length === 1, 'visible paid card qualifies');
  assert.equal(normal.requests[0].kind, 'view');
  assert.equal(normal.requests[0].visitorId, await normal.page.evaluate(() => localStorage.getItem('nodoku.visitor.v1')));
  await advance(normal.page, 30_000);
  assert.equal(normal.requests.length, 1, 'same sponsor after rerender stays deduplicated');
  await clickLink(normal.page);
  await waitFor(() => normal.requests.length === 2, 'trusted pointer activation records click');
  assert.deepEqual(normal.requests.map(event => event.kind), ['view', 'click']);
  await clickLink(normal.page, true);
  assert.equal(normal.requests.length, 2, 'repeat pointer/keyboard clicks deduplicate per day');
  await normal.page.reload(); await startIfHome(normal.page); await advance(normal.page, 1300);
  assert.equal(normal.requests.length, 2, 'client daily dedup survives refresh');
  await advance(normal.page, 86_400_000);
  await waitFor(() => normal.requests.length === 3, 'a new UTC day permits a fresh view');
  assert.equal(normal.requests[2].kind, 'view');
  await normal.page.close();

  const paused = await fixture(); await start(paused.page);
  await advance(paused.page, 400);
  await paused.page.locator('#help-button').click(); await advance(paused.page, 2000);
  assert.equal(paused.requests.length, 0, 'open modal cancels qualification');
  await paused.page.locator('[data-close="help-dialog"]').first().click();
  await advance(paused.page, 400); await visible(paused.page, false); await advance(paused.page, 2000);
  assert.equal(paused.requests.length, 0, 'background tab cancels qualification');
  await visible(paused.page, true); await advance(paused.page, 500);
  assert.equal(paused.requests.length, 0, 'qualification requires a fresh continuous second');
  await advance(paused.page, 700); await waitFor(() => paused.requests.length === 1, 'visible again qualifies');
  await paused.page.close();

  const clipped = await fixture(); await start(clipped.page);
  await clipped.page.locator('#sponsor-slot-game .sponsor-card[data-sponsor-id]').evaluate(card => { card.style.cssText = 'position:fixed;left:-150px;top:200px;width:200px;height:150px;'; });
  await sleep(200); await advance(clipped.page, 1500);
  assert.equal(clipped.requests.length, 0, 'less than half the card visible does not count');
  await clipped.page.locator('#sponsor-slot-game .sponsor-card[data-sponsor-id]').evaluate(card => { card.style.left = '0px'; });
  await sleep(200); await advance(clipped.page, 1200);
  await waitFor(() => clipped.requests.length === 1, 'half-or-more visible qualifies');
  await clipped.page.close();

  const retry = await fixture({ fail: true }); await start(retry.page); await advance(retry.page, 1200);
  await waitFor(() => retry.requests.length === 1, 'first view attempted');
  await advance(retry.page, 1000); assert.equal(retry.requests.length, 1, 'failed tracking is throttled');
  await advance(retry.page, 4500); await waitFor(() => retry.requests.length === 2, 'qualified view retries');
  await retry.page.close();

  const adFree = await fixture({ adFree: true }); await start(adFree.page); await advance(adFree.page, 1500);
  assert.equal(await adFree.page.locator('#sponsor-slot-game').isVisible(), false);
  assert.equal(adFree.requests.length, 0, 'verified ad-free hidden placements never count');
  await adFree.page.close();

  const early = await fixture(); await start(early.page);
  await early.page.locator('#sponsor-slot-game .sponsor-link[data-sponsor-id]').evaluate(link => {
    link.addEventListener('click', event => { if (!event.isTrusted) event.preventDefault(); }, { once: true });
    link.click();
  });
  assert.equal(early.requests.length, 0, 'programmatic anchor clicks never count');
  await clickLink(early.page, true);
  await waitFor(() => early.requests.length === 2, 'early trusted keyboard click records proof-view then click');
  assert.deepEqual(early.requests.map(event => event.kind), ['view', 'click']);
  await early.page.close();

  const middle = await fixture(); await start(middle.page);
  await clickLink(middle.page, false, true);
  await waitFor(() => middle.requests.length === 2, 'trusted middle-button activation records view then click');
  assert.deepEqual(middle.requests.map(event => event.kind), ['view', 'click']);
  await middle.page.close();

  const rotation = await fixture({ sponsors: Array.from({ length: 12 }, (_, i) => sponsor(i + 1)) });
  await start(rotation.page); await advance(rotation.page, 1200);
  await waitFor(() => rotation.requests.length === 6, 'six visible paid cards qualify');
  await advance(rotation.page, 30_000); await advance(rotation.page, 1200);
  await waitFor(() => rotation.requests.length === 12, 'new rotated sponsors qualify separately');
  assert.equal(new Set(rotation.requests.map(event => event.sponsorId)).size, 12);
  await rotation.page.close();

  const paid = await fixture({ paid: true });
  await paid.page.locator('#sponsor-report-access').waitFor({ state: 'visible' });
  assert.equal(await paid.page.locator('#sponsor-report-code').inputValue(), 'cs_test_privatereportcode');
  assert.equal(new URL(paid.page.url()).searchParams.has('session_id'), false, 'private report code removed from URL');
  await paid.page.locator('#sponsor-copy-code').click();
  assert.equal(await paid.page.evaluate(() => window.__copied), 'cs_test_privatereportcode');
  await paid.page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Denied'); }; });
  await paid.page.locator('#sponsor-copy-code').click();
  assert.match(await paid.page.locator('#sponsor-copy-status').textContent(), /Select and copy/);
  assert.equal(await paid.page.locator('#sponsor-report-code').evaluate(input => input.selectionEnd - input.selectionStart), 'cs_test_privatereportcode'.length);
  await paid.page.locator('#sponsor-view-report').click();
  await paid.page.locator('#statistics-dialog').waitFor({ state: 'visible' });
  assert.equal(await paid.page.locator('#sponsor-dialog').isVisible(), false);
  assert.equal(await paid.page.locator('#statistics-report-code').inputValue(), '', 'private report code never enters public link or URL');
  assert.equal(paid.page.url().includes('privatereportcode'), false);
  await paid.page.close();
  assert.deepEqual(errors, []);
  console.log('Passed: qualified paid views, hidden/placeholder exclusion, continuous modal/visibility threshold, clipping, retries, daily dedup and refresh, trusted pointer/keyboard clicks, rotation, verified private report code and report access. No page errors.');
} finally { await browser.close(); }
async function startIfHome(page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  if (await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode === 'home')) await start(page);
}
