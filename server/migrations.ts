import { readdirSync, readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

/** Local SQLite uses the same files and ledger format as Wrangler's D1 migrations. */
export function applyMigrations(db: DatabaseSync, directory = new URL('./migrations/', import.meta.url)): void {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').get(name)) {
        db.exec(readFileSync(new URL(name, directory), 'utf8'));
        db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
