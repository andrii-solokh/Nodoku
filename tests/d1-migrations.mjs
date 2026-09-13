import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Exercise Wrangler's real migration runner against isolated local D1 only.
const root = mkdtempSync(join(tmpdir(), 'nodoku-d1-migrations-'));
const names = readdirSync('server/migrations').filter(name => name.endsWith('.sql')).sort();
function wrangler(storage, ...args) {
  return execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'),
    'd1', ...args, '--local', '--persist-to', storage], {
    encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const query = (storage, sql) => JSON.parse(wrangler(storage, 'execute', 'nodoku', '--command', sql, '--json'))[0].results;
try {
  for (const initial of ['fresh', 'legacy']) {
    const storage = join(root, initial);
    if (initial === 'legacy') {
      wrangler(storage, 'execute', 'nodoku', '--file', 'server/migrations/0001_statistics_and_sponsorship.sql');
      query(storage, "INSERT INTO visitors VALUES ('migration-fixture'); INSERT INTO sponsor_orders (id, payload) VALUES ('migration-order', '{}');");
    }
    wrangler(storage, 'migrations', 'apply', 'nodoku');
    const ledger = query(storage, 'SELECT * FROM d1_migrations ORDER BY name');
    assert.deepEqual(ledger.map(row => row.name), names);
    query(storage, "INSERT INTO players (id, google_sub, nickname, created_at) VALUES ('test-player', 'test-subject', 'Mira', 1);");
    query(storage, "INSERT INTO player_links VALUES ('test-player', 'https://example.com/');");
    wrangler(storage, 'migrations', 'apply', 'nodoku');
    assert.deepEqual(query(storage, 'SELECT * FROM d1_migrations ORDER BY name'), ledger);
    assert.equal(query(storage, 'SELECT nickname FROM players')[0].nickname, 'Mira');
    assert.equal(query(storage, 'SELECT url FROM player_links')[0].url, 'https://example.com/');
    if (initial === 'legacy') {
      assert.equal(query(storage, 'SELECT id FROM visitors')[0].id, 'migration-fixture');
      assert.equal(query(storage, 'SELECT id FROM sponsor_orders')[0].id, 'migration-order');
    }
    console.log(`D1 ${initial}: migrations tracked, records preserved, second apply is a no-op`);
  }
} finally { rmSync(root, { recursive: true, force: true }); }
