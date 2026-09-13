import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { webkit } from 'playwright';

const source = (await readFile('src/rolling-counter.ts', 'utf8')).replace("import './rolling-counter.css';", '').replace('export function', 'function');
const browser = await webkit.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<strong id="counter" style="font: 64px sans-serif"></strong>');
  await page.addStyleTag({ content: await readFile('src/rolling-counter.css', 'utf8') });
  await page.addScriptTag({ content: stripTypeScriptTypes(source) });
  const render = (value, options = { animate: true }) => page.evaluate(({ value, options }) => renderCounter(document.getElementById('counter'), value, value.toLocaleString('en-US'), options), { value, options });
  const animations = () => page.locator('#counter').evaluate(el => el.getAnimations({ subtree: true }).length);
  await render(99);
  assert.equal(await animations(), 0, 'First render does not invent an increment');
  await render(99, { animate: true, from: 98 });
  assert.equal(await animations(), 1, 'A scope change can roll from the actual previous puzzle count');
  await render(100);
  assert.equal(await page.locator('#counter').textContent(), '100', 'Only the final value is readable, without duplicate reel text');
  assert.equal(await animations(), 3, 'All decimal places roll through the carry');
  await page.locator('#counter').evaluate(el => el.getAnimations({ subtree: true }).forEach(a => a.finish()));
  const displayed = await page.locator('.rolling-counter-reel').evaluateAll(reels => reels.map(reel => {
    const rect = reel.getBoundingClientRect();
    return [...reel.querySelectorAll('[data-digit]')].filter(digit => Math.abs(digit.getBoundingClientRect().top - rect.top) < 1).map(digit => digit.dataset.digit).join('');
  }).join(''));
  assert.equal(displayed, '100', 'Reels physically settle on the new value');
  await render(105);
  await render(109);
  assert.equal(await page.locator('#counter').textContent(), '109');
  assert.equal(await animations(), 1, 'Rapid updates replace old reels rather than queuing stale animations');
  await render(98);
  assert.equal(await animations(), 0, 'Undo does not animate an addition');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await render(1000);
  assert.equal(await animations(), 0);
  assert.equal(await page.locator('#counter').textContent(), '1,000');
  console.log('Rolling counter: carry, settled digits, rapid updates, decreases and reduced motion passed');
} finally { await browser.close(); }
