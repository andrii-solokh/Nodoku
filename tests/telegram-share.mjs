import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { webkit } from 'playwright';

// Exercise the real share component without involving game or payment dialogs.
const source = stripTypeScriptTypes(await readFile('src/share.ts', 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');
const browser = await webkit.launch();
try {
  const page = await browser.newPage();
  await page.route('https://nodoku.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="share"></div>' }));
  await page.goto('https://nodoku.test/a+b?admin=private#secret');
  await page.addScriptTag({ content: source });
  const result = await page.evaluate(() => {
    const component = mountCompletionShare(document.querySelector('#share'));
    component.update({ size: 3, depth: 3, difficulty: 'easy' }, 40);
    return { href: document.querySelector('[data-network="telegram"]').href,
      text: document.querySelector('.completion-share-preview').textContent };
  });
  const query = new URL(result.href).search.slice(1);
  const params = Object.fromEntries(query.split('&').map(pair => {
    const index = pair.indexOf('=');
    return [pair.slice(0, index), decodeURIComponent(pair.slice(index + 1))];
  }));
  assert.ok(query.includes('%20'), 'Spaces must be percent encoded for Telegram');
  assert.ok(!query.includes('+'), 'No form-encoded + signs reach Telegram');
  assert.equal(params.text, result.text, 'Plain URI decoding preserves the full message');
  assert.match(params.text, /3 × 3 × 3/);
  assert.equal(params.url, 'https://nodoku.test/a+b', 'An actual plus sign in the URL survives correctly');
  assert.ok(!result.href.includes('private') && !result.href.includes('secret'), 'Private URL data stays excluded');
  console.log('Telegram share: spaces, Unicode, literal plus signs, and private URL stripping pass. No message sent.');
} finally { await browser.close(); }
