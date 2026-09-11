import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer, loadConfigFromFile } from 'vite';

test('Vite denies local admin credentials and databases through static and module URLs', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, fileURLToPath(new URL('../vite.config.mts', import.meta.url)));
  assert.ok(loaded?.config.server?.fs?.deny);
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'nodoku-vite-deny-test-')));
  const secret = 'dummy-local-secret-never-use-as-credentials';
  mkdirSync(join(root, '.nodoku-data'));
  const privatePaths = ['.nodoku-data/admin-token', '.nodoku-data/local.sqlite', '.dev.vars', '.dev.vars.local', '.env.local'];
  for (const path of privatePaths) writeFileSync(join(root, path), secret);
  writeFileSync(join(root, 'public-check.txt'), 'public asset remains available');
  const server = await createServer({
    configFile: false, root, publicDir: false, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, fs: { deny: loaded.config.server.fs.deny } },
  });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    for (const path of privatePaths) {
      for (const url of [`/${path}`, `/${path}?raw`, `/${path}?url`, `/@fs${root}/${path}`, `/@fs${root}/${path}?raw`]) {
        const result = await fetch(origin + url);
        assert.equal(result.status, 403, `Private file denied: ${url}`);
        assert.ok(!(await result.text()).includes(secret), 'Response must never contain secret bytes');
      }
    }
    const publicAsset = await fetch(`${origin}/public-check.txt`);
    assert.equal(publicAsset.status, 200);
    assert.equal(await publicAsset.text(), 'public asset remains available');
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
