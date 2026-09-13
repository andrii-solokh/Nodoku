import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';
const browser = await webkit.launch();
await mkdir('output/web-game/leaderboard-preview', { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 667 : 900 }, locale: 'en-US' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const rank of [10001, 100]) {
      await page.goto(`http://127.0.0.1:5173/tests/fixtures/leaderboard-preview.html?rank=${rank}`);
      const popup = page.locator('#leaderboard-popup');
      await popup.locator('.ranking-table tbody tr').last().waitFor();
      assert.equal(await popup.locator('.ranking-table tbody tr').count(), 100);
      assert.equal(await popup.locator('.ranking-personal td:first-child').textContent(), rank.toLocaleString('en-US'));
      assert.equal(await popup.locator('.ranking-personal td:nth-child(2)').textContent(), 'You');
      assert.equal(await popup.locator('.ranking-table .is-you').count(), rank === 100 ? 1 : 0);
      const scroll = popup.locator('.ranking-table-scroll');
      assert.equal(await scroll.evaluate(el => el.scrollHeight > el.clientHeight), true);
      for (const column of [1, 3]) {
        assert.equal(await popup.locator(`.ranking-table tbody tr:first-child td:nth-child(${column})`).evaluate(el => getComputedStyle(el).textAlign), 'center');
      }
      const summary = await popup.locator('.ranking-personal').boundingBox();
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(100);
      assert.deepEqual(await popup.locator('.ranking-personal').boundingBox(), summary, 'Your rank stays put while scrolling the top 100');
      const heading = await popup.locator('th').first().boundingBox();
      const viewport = await scroll.boundingBox();
      assert.ok(Math.abs(heading.y - viewport.y) < 1, 'Column headings stay visible while scrolling');
      assert.equal(await popup.evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.screenshot({ path: `output/web-game/leaderboard-preview/${width}-rank-${rank}.png` });
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: 100 rows, rank 10,001, centered numbers, independent scrolling and highlighted rank 100 pass`);
  }
} finally { await browser.close(); }
