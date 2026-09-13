import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:5173';
const cases = [
  { name: 'improved', width: 1440, expected: ['#18 → #15', '#42 → #30'] },
  { name: 'first', width: 390, expected: ['New · #10,001', 'New · #80'] },
  { name: 'unchanged', width: 320, expected: ['#1 · unchanged', '#1 · unchanged'] },
  { name: 'guest', width: 390 },
  { name: 'offline', width: 390 },
];
await mkdir('output/web-game/completion-ranking', { recursive: true });
const browser = await chromium.launch();
try {
  for (const scenario of cases) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/tests/fixtures/completion-ranking-preview.html?case=${scenario.name}`);
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
    await page.locator('#preview-complete').click();
    const panel = page.locator('#completion-dialog');
    const summary = panel.locator('.completion-account');
    const initial = await summary.boundingBox();
    if (scenario.expected) {
      await page.waitForFunction(() => document.querySelectorAll('.completion-rank-row').length === 2);
      assert.deepEqual(await summary.locator('strong').allTextContents(), scenario.expected);
      const area = await summary.boundingBox(), next = await page.locator('#next-button').boundingBox();
      assert.ok(area.y + area.height <= next.y, 'Ranking summary is above the next-puzzle action');
      assert.equal(area.height, initial.height, 'Loading and ready summary reserve equal space');
      assert.ok(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), 'Completion content fits');
    } else if (scenario.name === 'guest') await summary.getByText('Join the leaderboard').waitFor();
    else await summary.getByText('Rankings unavailable for this puzzle').waitFor();
    assert.equal(await panel.getByText('View your ranking', { exact: true }).count(), 0);
    await page.screenshot({ path: `output/web-game/completion-ranking/${scenario.name}.png` });
    if (scenario.expected) {
      await summary.getByRole('button', { name: /^Best time:/ }).click();
      await page.locator('#leaderboard-popup').waitFor();
      await page.waitForFunction(() => document.querySelector('#leaderboard-popup .player-status').textContent === '');
      assert.ok(await page.evaluate(() => window.previewCalls.includes('/api/leaderboard?period=all&perspective=flat&metric=time&size=4&difficulty=easy')));
      assert.equal(await page.locator('[data-ranking-metric="time"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-ranking-size="4"][data-ranking-difficulty="easy"]').getAttribute('aria-pressed'), 'true');
    }
    assert.deepEqual(errors, []); await page.close();
    console.log(`Passed ${scenario.name} (${scenario.width}px)`);
  }
} finally { await browser.close(); }
