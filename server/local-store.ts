import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqlStore, type Query } from './store.js';
import { applyMigrations } from './migrations.js';

/** Node 24 development storage; production uses the D1 binding instead. */
export class LocalStore extends SqlStore {
  private readonly database: DatabaseSync;

  constructor(path = '.nodoku-data/local.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    try { applyMigrations(db); } catch (error) { db.close(); throw error; }
    const execute = (query: Query) => db.prepare(query.sql).all(...(query.values ?? [])) as Record<string, unknown>[];
    super('local', {
      execute: async (query) => execute(query),
      transaction: async (queries) => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const results = queries.map(execute);
          db.exec('COMMIT');
          return results;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    });
    this.database = db;
  }

  close(): void { this.database.close(); }
}
