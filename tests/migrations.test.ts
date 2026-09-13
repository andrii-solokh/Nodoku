import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { applyMigrations } from '../server/migrations.js';

const directory = new URL('../server/migrations/', import.meta.url);
const snapshot = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('0001_statistics_and_sponsorship.sql', directory), 'utf8');
const names = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
const objects = (db: DatabaseSync) => db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY type, name`).all();

test('ordered migrations produce the documented schema on fresh and existing databases', () => {
  assert.ok(names.every(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)));
  assert.equal(new Set(names.map(name => name.slice(0, 4))).size, names.length);
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec(snapshot);
    for (const initial of ['', legacy, snapshot]) {
      const db = new DatabaseSync(':memory:');
      try {
        db.exec(initial);
        if (initial) {
          db.exec("INSERT INTO visitors VALUES ('existing-visitor'); INSERT INTO sponsor_orders (id, payload) VALUES ('existing-order', '{}');");
        }
        if (initial === snapshot) {
          db.exec("INSERT INTO players (id, google_sub, nickname, created_at) VALUES ('existing-player', 'subject', 'Mira', 1); INSERT INTO player_links VALUES ('existing-player', 'https://example.com/');");
        }
        applyMigrations(db);
        assert.deepEqual(objects(db), objects(expected));
        assert.deepEqual(db.prepare('SELECT name FROM d1_migrations ORDER BY name').all().map(row => row.name), names);
        const ledger = db.prepare('SELECT * FROM d1_migrations').all();
        applyMigrations(db);
        assert.deepEqual(db.prepare('SELECT * FROM d1_migrations').all(), ledger, 'reapplying is a no-op');
        if (initial) {
          assert.equal(db.prepare('SELECT id FROM visitors').get()?.id, 'existing-visitor');
          assert.equal(db.prepare('SELECT id FROM sponsor_orders').get()?.id, 'existing-order');
        }
        if (initial === snapshot) {
          assert.equal(db.prepare('SELECT nickname FROM players').get()?.nickname, 'Mira');
          assert.equal(db.prepare('SELECT url FROM player_links').get()?.url, 'https://example.com/');
        }
      } finally { db.close(); }
    }
  } finally { expected.close(); }
});

test('a failed migration rolls back its writes and ledger entry and can be retried', () => {
  const folder = mkdtempSync(join(tmpdir(), 'nodoku-migrations-'));
  const db = new DatabaseSync(':memory:');
  const url = pathToFileURL(`${folder}/`);
  try {
    writeFileSync(join(folder, '0001_initial.sql'), 'CREATE TABLE records (value TEXT);');
    writeFileSync(join(folder, '0002_change.sql'), "INSERT INTO records VALUES ('partial'); INSERT INTO missing_table VALUES (1);");
    assert.throws(() => applyMigrations(db, url), /missing_table/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get()?.n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get()?.n, 1);
    writeFileSync(join(folder, '0002_change.sql'), "INSERT INTO records VALUES ('complete');");
    applyMigrations(db, url);
    applyMigrations(db, url);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get()?.n, 1);
    assert.equal(db.prepare('SELECT value FROM records').get()?.value, 'complete');
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});
