import { followHint } from './helpers/follow-hint.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const out = 'output/web-game/statistics';
await fs.mkdir(out, { recursive: true });
const browser = await (process.env.TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
const errors = [];
const settings = { size: 3, depth: 1, difficulty: 'easy', seed: 54127 };
const attemptId = 'e1111111-1111-4111-8111-111111111111';
const source = new Puzzle(settings);
const game = { version: 1, settings, edges: source.solution.slice(0, -1), history: [] };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const waitFor = async (check, label) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail(label);
};
const days = [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10));
const stats = (period = 'all', solved = 213) => ({
  scope: 'local', period, trackingSince: `${days[0]}T00:00:00.000Z`,
  totals: { visitors: 1529, puzzlesSolved: solved, nodesFilled: 16320, connectionsCompleted: 8160 },
  daily: days.map((date, i) => ({ date, visitors: 13 + i * 4, puzzlesSolved: 4 + i * 2, nodesFilled: 132 + i * 8 })),
  sizes: [{ size: 3, depth: 1, count: 80 }, { size: 3, depth: 3, count: 100 }, { size: 4, depth: 4, count: 33 }],
  difficulties: [{ difficulty: 'easy', count: 103 }, { difficulty: 'medium', count: 65 }, { difficulty: 'hard', count: 45 }],
});
const geography = period => ({
  period,
  countries: [{ country: 'UA', visitors: 812, pageviews: 1934 }, { country: 'US', visitors: 421, pageviews: 991 }, { country: 'Unknown', visitors: 3, pageviews: 4 }],
});

async function fixture(save = null) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1529, scope: 'local' } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 12, scope: 'local' } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  const requests = [];
  const geoRequests = [];
  await page.route('**/api/statistics?*', route => {
    const period = new URL(route.request().url()).searchParams.get('period');
    requests.push(period);
    return route.fulfill({ json: stats(period) });
  });
  await page.route('**/api/statistics/geo?*', route => {
    const period = new URL(route.request().url()).searchParams.get('period');
    geoRequests.push(period);
    return route.fulfill({ json: geography(period) });
  });
  if (save) await page.addInitScript(save => {
    if (!sessionStorage.getItem('stats-fixture')) {
      sessionStorage.setItem('stats-fixture', '1');
      localStorage.setItem('nodoku.astra.v1', JSON.stringify(save));
    }
  }, save);
  return { page, requests, geoRequests };
}

try {
  if (!process.argv.includes('--view-only')) {
  const { page } = await fixture({ settings, screen: 'playing', game, attemptId });
  const completions = [];
  const counted = new Set();
  await page.route('**/api/completions', route => {
    const payload = route.request().postDataJSON();
    completions.push(payload);
    const recorded = !counted.has(payload.attemptId);
    counted.add(payload.attemptId);
    return route.fulfill({ json: { recorded } });
  });
  await page.goto(url);
  await followHint(page);
  await page.locator('#completion-dialog').waitFor();
  await waitFor(() => completions.length === 1, 'A real solve records a completion');
  assert.equal(completions[0].attemptId, attemptId);
  assert.ok(Puzzle.restore(completions[0].game)?.solved, 'Submitted final graph satisfies every clue and connectivity');
  assert.deepEqual(completions[0].game.history, [], 'Analytics sends the final board, not input history');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).attemptId), attemptId);
  await page.locator('#completion-dialog').evaluate(dialog => dialog.close());
  await page.keyboard.press('Control+z');
  assert.equal((await state(page)).solved, false);
  await page.keyboard.press('Control+Shift+z');
  await page.locator('#completion-dialog').waitFor();
  assert.equal(completions.length, 1, 'Undo and re-solving do not resubmit in the same session');
  await page.reload();
  await page.locator('#completion-dialog').waitFor();
  await waitFor(() => completions.length === 2, 'Reload can safely confirm an already-counted completion');
  assert.equal(completions[1].attemptId, attemptId, 'Refresh retains the same attempt identity');
  assert.equal(counted.size, 1, 'Server deduplication keeps one achievement');
  await page.locator('#next-button').click();
  assert.notEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).attemptId), attemptId, 'A new puzzle receives a new attempt');
  await page.close();

  const offline = await fixture({ settings, screen: 'playing', game, attemptId });
  let available = false;
  const delivered = [];
  await offline.page.route('**/api/completions', route => {
    if (!available) return route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
    delivered.push(route.request().postDataJSON());
    return route.fulfill({ json: { recorded: true } });
  });
  await offline.page.goto(url);
  await followHint(offline.page);
  await offline.page.locator('#completion-dialog').waitFor();
  await waitFor(() => offline.page.evaluate(id => localStorage.getItem(`nodoku.completion.pending.v1.${id}`) !== null, attemptId), 'Failed completions are durably queued');
  await offline.page.locator('#next-button').click();
  available = true;
  await offline.page.reload();
  await waitFor(() => delivered.length === 1, 'The queued solve survives moving to another puzzle and refreshing');
  assert.equal(delivered[0].attemptId, attemptId);
  await waitFor(() => offline.page.evaluate(id => localStorage.getItem(`nodoku.completion.pending.v1.${id}`) === null, attemptId), 'Successful delivery clears the pending record');
  assert.equal((await state(offline.page)).solved, false, 'Queue delivery does not alter the fresh board');
  await offline.page.close();

  const home = await fixture();
  let demoCompletions = 0;
  await home.page.route('**/api/completions', route => { demoCompletions++; return route.fulfill({ json: { recorded: true } }); });
  await home.page.goto(url);
  await home.page.waitForFunction(() => typeof window.advanceTime === 'function');
  await home.page.evaluate(() => window.advanceTime(60_000));
  assert.equal(demoCompletions, 0, 'Home auto-solving never records player achievements');
  await home.page.close();

  }

  const view = await fixture({ settings, screen: 'playing', game, attemptId });
  await view.page.goto(url);
  await view.page.waitForFunction(() => typeof window.advanceTime === 'function');
  await view.page.evaluate(() => window.advanceTime(1000));
  const original = await state(view.page);
  await view.page.locator('.visitor-game .audience-link').click();
  const dialog = view.page.locator('#statistics-dialog');
  await dialog.waitFor();
  assert.equal(await dialog.locator('.statistics-brand').getAttribute('href'), '/', 'Statistics logo returns to Nodoku');
  await waitFor(async () => await dialog.locator('[data-total=puzzlesSolved]').textContent() === '213', 'Statistics loads server aggregates');
  assert.equal(await dialog.locator('[data-total=nodesFilled]').textContent(), '16,320');
  assert.deepEqual(await dialog.locator('[data-total]').evaluateAll(elements => elements.map(el => el.dataset.total)), ['visitors', 'puzzlesSolved', 'nodesFilled', 'connectionsCompleted']);
  assert.equal(await dialog.locator('[data-total=visitors]').textContent(), '1,529');
  assert.equal(await dialog.locator('.statistics-histogram').count(), 3);
  for (const metric of ['puzzlesSolved', 'visitors', 'nodesFilled']) assert.equal(await dialog.locator(`#statistics-chart-${metric} .statistics-bar`).count(), 7);
  assert.equal(await dialog.locator('#statistics-sizes .statistics-ranking-bar').count(), 3);
  assert.equal(await dialog.locator('#statistics-difficulties .statistics-ranking-bar').count(), 3);
  assert.equal(await dialog.locator('#statistics-difficulties .statistics-complexity-icon').count(), 3, 'Difficulty rankings use the home-page complexity symbols');
  await waitFor(async () => await dialog.locator('#statistics-geo').isVisible(), 'Country statistics load separately from the main totals');
  assert.equal(await dialog.locator('#statistics-geo-values tr').count(), 3);
  const countryRows = await dialog.locator('#statistics-geo-values tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)));
  assert.deepEqual(countryRows.map(row => row.slice(1)), [['812', '1,934'], ['421', '991'], ['3', '4']]);
  assert.equal(countryRows[2][0], 'Unknown location');
  for (const ranking of ['#statistics-sizes', '#statistics-difficulties']) {
    const offsets = await dialog.locator(`${ranking} li`).evaluateAll(rows => rows.map(row => {
      const bar = row.querySelector('.statistics-ranking-bar').getBoundingClientRect();
      const label = row.querySelector('.statistics-ranking-label').getBoundingClientRect();
      return Math.abs((bar.left + bar.width / 2) - (label.left + label.width / 2));
    }));
    assert.ok(offsets.every(offset => offset <= 1), `${ranking} labels stay centered beneath their bars`);
  }
  await view.page.evaluate(() => window.dispatchEvent(new CustomEvent('nodoku:sponsorship-config', { detail: { enabled: false } })));
  assert.equal(await dialog.locator('#statistics-report').isVisible(), false, 'Hiding sponsor placements also hides private sponsor reports');
  await view.page.evaluate(() => window.dispatchEvent(new CustomEvent('nodoku:sponsorship-config', { detail: { enabled: true } })));
  assert.equal(await dialog.locator('#statistics-report').isVisible(), true, 'Restoring sponsor placements restores private sponsor reports');
  await view.page.keyboard.press('ArrowRight');
  assert.deepEqual((await state(view.page)).view, original.view, 'Statistics input cannot rotate the puzzle');
  for (const period of ['today', '7d', '30d', 'all']) {
    await dialog.locator(`[data-period="${period}"]`).click();
    await waitFor(() => view.requests.at(-1) === period, `Filter requests ${period}`);
    await waitFor(() => view.geoRequests.at(-1) === period, `Country filter requests ${period}`);
    await waitFor(async () => await dialog.locator('#statistics-content').isVisible(), `Filter ${period} finishes loading`);
    assert.equal(await dialog.locator(`[data-period="${period}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await dialog.locator('#statistics-activity').isVisible(), period !== 'today', `${period} only shows activity charts when the period spans multiple days`);
    if (period !== 'today') {
      const boxes = await dialog.locator('.statistics-histogram').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y));
      assert.ok(boxes.every((top, index) => index === 0 || top > boxes[index - 1]), `${period} histograms stack one per row`);
    }
  }
  assert.match(await dialog.locator('#statistics-chart-note').textContent(), /last 30 days/i);
  await dialog.locator('#statistics-chart-visitors .statistics-bar').first().focus();
  assert.match(await dialog.locator('#statistics-chart-value-visitors').textContent(), /13/);
  assert.match(await dialog.locator('#statistics-chart-nodesFilled .statistics-bar').first().getAttribute('aria-label'), /132 nodes filled/);

  if (process.argv.includes('--view-only')) {
    for (const width of [1440, 390, 320]) {
      await view.page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
      await dialog.evaluate(element => { element.scrollTop = 0; });
      assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Statistics fits ${width}px`);
      const numberSize = await dialog.locator('[data-total=nodesFilled] .rolling-counter-reel').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(numberSize >= 24, 'Reel digits retain the large card typography');
      await view.page.screenshot({ path: `${out}/statistics-${width}.png`, fullPage: true });
    }
  } else {
  const reports = [];
  await view.page.route('**/api/sponsor-report', route => {
    const payload = route.request().postDataJSON(); reports.push(payload);
    return route.fulfill({ json: { brand: 'Gentle Studio <safe>', period: payload.period, totals: { views: 45, clicks: 3, ctr: 6.67 }, daily: [{ date: days.at(-1), views: 45, clicks: 3 }] } });
  });
  const receipt = 'cs_test_privateReport0123456789';
  await dialog.locator('#statistics-report-code').fill(receipt);
  await dialog.locator('.statistics-report-submit').click();
  await waitFor(async () => await dialog.locator('#statistics-report-result').isVisible(), 'Private report loads');
  assert.deepEqual(reports[0], { receipt, period: 'all' });
  assert.equal(await dialog.locator('#statistics-report-brand').textContent(), 'Gentle Studio <safe>');
  assert.equal(await dialog.locator('[data-report=ctr]').textContent(), '6.67%');
  assert.equal(view.page.url().includes(receipt), false, 'Sponsor credential never enters the page URL');
  for (const width of [1440, 390, 320]) {
    await view.page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    await dialog.evaluate(element => { element.scrollTop = 0; });
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Statistics fits ${width}px`);
    await view.page.screenshot({ path: `${out}/statistics-${width}.png`, fullPage: true });
    await dialog.locator('#statistics-report-code').scrollIntoViewIfNeeded();
    const box = await dialog.locator('#statistics-report-code').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `Report input fits ${width}px`);
  }
  await dialog.locator('#statistics-close').click();
  await dialog.waitFor({ state: 'hidden' });
  await waitFor(async () => await view.page.locator('#statistics-report-code').inputValue() === '', 'Leaving clears the sponsor credential');
  assert.deepEqual((await state(view.page)).edges, original.edges, 'Leaving preserves the current game');
  await view.page.goForward();
  await dialog.waitFor();
  assert.equal(await dialog.locator('#statistics-report-result').isVisible(), false, 'History does not restore a private report');
  await view.page.reload();
  await view.page.locator('#statistics-dialog').waitFor();
  assert.deepEqual((await state(view.page)).edges, original.edges, 'Refreshing statistics preserves the puzzle');
  await view.page.locator('#statistics-report-code').fill(receipt);
  await view.page.locator('.statistics-report-submit').click();
  await waitFor(async () => await view.page.locator('#statistics-report-result').isVisible(), 'Private report reloads on explicit request');
  await view.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  assert.equal(await view.page.locator('#statistics-report-code').inputValue(), '', 'Page navigation clears the private credential before bfcache');
  assert.equal(await view.page.locator('#statistics-report-brand').textContent(), '', 'Private report content is removed from the DOM');
  await view.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await waitFor(async () => await view.page.locator('#statistics-content').isVisible(), 'Returning from bfcache refreshes public data');

  await view.page.route('**/api/statistics?*', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await view.page.locator('[data-period=today]').click();
  await waitFor(async () => await view.page.locator('#statistics-retry').isVisible(), 'An API failure offers a retry');
  assert.equal(await view.page.locator('#statistics-content').isVisible(), false, 'A failed period never displays stale totals');
  await view.page.route('**/api/statistics?*', route => {
    const period = new URL(route.request().url()).searchParams.get('period');
    return route.fulfill({ json: { ...stats(period, 0), totals: { visitors: 0, puzzlesSolved: 0, nodesFilled: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } });
  });
  await view.page.locator('#statistics-retry').click();
  await waitFor(async () => await view.page.locator('#statistics-content').isVisible(), 'Retry recovers');
  assert.equal(await view.page.locator('[data-total=puzzlesSolved]').textContent(), '0', 'Real zero totals are shown');
  assert.match(await view.page.locator('#statistics-sizes').textContent(), /No completed puzzles/);
  assert.equal(await view.page.locator('.statistics-chart-empty').count(), 3);
  assert.equal(await view.page.locator('#statistics-activity').isVisible(), false, 'Today keeps the summary cards without duplicate charts');
  }
  await view.page.close();

  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log(process.argv.includes('--view-only') ? 'Passed: statistics card order, node totals, filters, histograms and desktop/mobile counter layout.' : 'Passed: solve tracking, offline queue, statistics, private reports, mobile layout and game preservation.');
} finally { await browser.close(); }
