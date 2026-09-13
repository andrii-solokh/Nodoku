import type { SqlExecutor } from './store.js';
import type { PuzzleSettings } from '../src/puzzle.js';

export type Player = { id: string; nickname: string; avatarUrl?: string; profileUrl?: string };
export type RankingFilter = { period: '7d' | 'all'; perspective: 'all' | 'flat' | '3d'; size: number | null; difficulty: string | null; metric?: 'solved' | 'time' };
const DAY = 86_400_000;
function player(row: Record<string, unknown> | undefined): Player | null {
  return row ? { id: String(row.id), nickname: String(row.nickname),
    ...(row.profile_url ? { profileUrl: String(row.profile_url) } : {}),
    ...(row.avatar_url ? { avatarUrl: String(row.avatar_url) } : {}) } : null;
}

export class AccountsStore {
  constructor(private readonly sql: SqlExecutor) {}

  async allowSignIn(key: string, now = Date.now()): Promise<boolean> {
    const bucket = Math.floor(now / 60_000);
    const result = await this.sql.transaction([
      { sql: 'DELETE FROM account_rate_limits WHERE bucket < ?', values: [bucket - 1] },
      { sql: `INSERT INTO account_rate_limits (key, bucket, count) VALUES (?, ?, 1)
        ON CONFLICT(key) DO UPDATE SET bucket = excluded.bucket,
        count = CASE WHEN account_rate_limits.bucket = excluded.bucket THEN account_rate_limits.count + 1 ELSE 1 END
        WHERE account_rate_limits.bucket != excluded.bucket OR account_rate_limits.count < 20 RETURNING key`, values: [key, bucket] },
    ]);
    return result[1].length > 0;
  }

  async signIn(sub: string, sessionHash: string, now = Date.now(), defaultNickname?: string, avatarUrl?: string): Promise<Player> {
    const id = crypto.randomUUID();
    const result = await this.sql.transaction([
      { sql: 'INSERT OR IGNORE INTO players (id, google_sub, nickname, created_at) VALUES (?, ?, ?, ?)', values: [id, sub, defaultNickname || `Player ${id.slice(0, 6)}`, now] },
      // Older accounts may predate Google name support. Repair only their exact fallback.
      { sql: `UPDATE players SET nickname = ? WHERE google_sub = ? AND ? IS NOT NULL
        AND nickname = 'Player ' || substr(id, 1, 6)
        AND NOT EXISTS (SELECT 1 FROM player_custom_nicknames WHERE player_id = players.id)`,
        values: [defaultNickname || null, sub, defaultNickname || null] },
      { sql: 'DELETE FROM player_avatars WHERE player_id IN (SELECT id FROM players WHERE google_sub = ?)', values: [sub] },
      { sql: 'INSERT INTO player_avatars (player_id, url) SELECT id, ? FROM players WHERE google_sub = ? AND ? IS NOT NULL', values: [avatarUrl ?? null, sub, avatarUrl ?? null] },
      { sql: 'DELETE FROM player_sessions WHERE expires_at <= ?', values: [now] },
      { sql: 'INSERT INTO player_sessions (token_hash, player_id, expires_at) SELECT ?, id, ? FROM players WHERE google_sub = ?', values: [sessionHash, now + 30 * DAY, sub] },
      { sql: 'SELECT p.id, p.nickname, a.url AS avatar_url, l.url AS profile_url FROM players p LEFT JOIN player_avatars a ON a.player_id = p.id LEFT JOIN player_links l ON l.player_id = p.id WHERE p.google_sub = ?', values: [sub] },
    ]);
    return player(result[result.length - 1][0])!;
  }

  async current(hash: string, now = Date.now()): Promise<Player | null> {
    const rows = await this.sql.execute({ sql: 'SELECT p.id, p.nickname, a.url AS avatar_url, l.url AS profile_url FROM players p JOIN player_sessions s ON s.player_id = p.id LEFT JOIN player_avatars a ON a.player_id = p.id LEFT JOIN player_links l ON l.player_id = p.id WHERE s.token_hash = ? AND s.expires_at > ?', values: [hash, now] });
    return player(rows[0]);
  }
  async logout(hash: string): Promise<void> {
    await this.sql.execute({ sql: 'DELETE FROM player_sessions WHERE token_hash = ?', values: [hash] });
  }
  async profile(id: string, nickname: string, profileUrl?: string): Promise<void> {
    await this.sql.transaction([
      { sql: 'UPDATE players SET nickname = ? WHERE id = ?', values: [nickname, id] },
      ...(profileUrl === undefined ? [] : [
        { sql: 'DELETE FROM player_links WHERE player_id = ?', values: [id] },
        { sql: "INSERT INTO player_links (player_id, url) SELECT id, ? FROM players WHERE id = ? AND ? != ''", values: [profileUrl, id, profileUrl] },
      ]),
      { sql: 'INSERT OR IGNORE INTO player_custom_nicknames (player_id) SELECT id FROM players WHERE id = ?', values: [id] },
    ]);
  }
  async remove(id: string): Promise<void> {
    await this.sql.transaction(['player_sessions', 'player_avatars', 'player_links', 'player_custom_nicknames', 'ranked_attempts', 'ranked_solve_times', 'ranked_completions', 'players'].map(table => ({
      sql: `DELETE FROM ${table} WHERE ${table === 'players' ? 'id' : 'player_id'} = ?`, values: [id],
    })));
  }

  async issueAttempt(id: string, hash: string, settings: PuzzleSettings, now = Date.now()): Promise<boolean> {
    const { size, depth, difficulty, seed } = settings;
    const result = await this.sql.transaction([
      { sql: 'DELETE FROM ranked_attempts WHERE expires_at <= ?', values: [now] },
      { sql: `INSERT INTO ranked_attempts (token_hash, player_id, size, depth, difficulty, seed, created_at, expires_at)
        SELECT ?, id, ?, ?, ?, ?, ?, ? FROM players WHERE id = ?
        AND (SELECT COUNT(*) FROM ranked_attempts WHERE player_id = ? AND created_at > ?) < 20
        AND (SELECT COUNT(*) FROM ranked_attempts WHERE player_id = ? AND created_at > ?) < 200 RETURNING token_hash`,
        values: [hash, size, depth, difficulty, seed, now, now + 7 * DAY, id, id, now - 60_000, id, now - DAY] },
    ]);
    return result[1].length > 0;
  }

  /** The opaque attempt belongs to its original player even during offline retries. */
  async completeAttempt(hash: string, settings: PuzzleSettings, now = Date.now()): Promise<boolean> {
    const { size, depth, difficulty, seed } = settings;
    const valid = `FROM ranked_attempts a JOIN players p ON p.id = a.player_id
      WHERE a.token_hash = ? AND a.expires_at > ? AND a.created_at <= ?
      AND a.size = ? AND a.depth = ? AND a.difficulty = ? AND a.seed = ?`;
    const values = [hash, now, now, size, depth, difficulty, seed];
    const result = await this.sql.transaction([
      { sql: `INSERT OR IGNORE INTO ranked_solve_times (token_hash, player_id, size, depth, difficulty, seed, elapsed_ms, completed_at)
        SELECT a.token_hash, a.player_id, a.size, a.depth, a.difficulty, a.seed, ? - a.created_at, ? ${valid}
        AND NOT EXISTS (SELECT 1 FROM ranked_completions c WHERE c.player_id = a.player_id
          AND c.size = a.size AND c.depth = a.depth AND c.difficulty = a.difficulty AND c.seed = a.seed
          AND c.completed_at >= a.created_at)`, values: [now, now, ...values] },
      { sql: `INSERT OR IGNORE INTO ranked_completions (player_id, size, depth, difficulty, seed, completed_at)
        SELECT a.player_id, a.size, a.depth, a.difficulty, a.seed, ? ${valid} RETURNING player_id`, values: [now, ...values] },
    ]);
    return result[1].length > 0;
  }

  async leaderboard(filter: RankingFilter, currentId?: string, now = Date.now()) {
    const since = filter.period === 'all' ? 0 : Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() - 6);
    const conditions = ['c.completed_at >= ?'];
    const values: (string | number)[] = [since];
    if (filter.perspective !== 'all') conditions.push(filter.perspective === 'flat' ? 'c.depth = 1' : 'c.depth > 1');
    if (filter.size !== null) { conditions.push('c.size = ?'); values.push(filter.size); }
    if (filter.difficulty !== null) { conditions.push('c.difficulty = ?'); values.push(filter.difficulty); }
    const counts = `SELECT p.id, p.nickname, l.url AS profile_url, COUNT(c.player_id) AS solved, MIN(t.best_time_ms) AS best_time_ms FROM players p JOIN ranked_completions c ON c.player_id = p.id
      LEFT JOIN player_links l ON l.player_id = p.id
      LEFT JOIN (SELECT player_id, size, depth, difficulty, seed, MIN(elapsed_ms) AS best_time_ms
        FROM ranked_solve_times GROUP BY player_id, size, depth, difficulty, seed) t
        ON t.player_id = c.player_id AND t.size = c.size AND t.depth = c.depth AND t.difficulty = c.difficulty AND t.seed = c.seed
      WHERE ${conditions.join(' AND ')} GROUP BY p.id, p.nickname, l.url`;
    const byTime = filter.metric === 'time';
    const ranked = `WITH scores AS (${counts}), ranked AS (SELECT id, nickname, profile_url, solved, best_time_ms,
      RANK() OVER (ORDER BY ${byTime ? 'best_time_ms ASC' : 'solved DESC'}) AS rank FROM scores${byTime ? ' WHERE best_time_ms IS NOT NULL' : ''})`;
    const result = await this.sql.transaction([
      { sql: `${ranked} SELECT * FROM ranked ORDER BY rank, nickname COLLATE NOCASE, id LIMIT 100`, values },
      { sql: `${ranked} SELECT * FROM ranked WHERE id = ?`, values: [...values, currentId ?? ''] },
      { sql: `SELECT COUNT(*) AS solved FROM ranked_completions c WHERE c.player_id = ? AND ${conditions.join(' AND ')}`, values: [currentId ?? '', ...values] },
    ]);
    const row = (r: Record<string, unknown>) => ({ id: String(r.id), nickname: String(r.nickname), ...(r.profile_url ? { profileUrl: String(r.profile_url) } : {}), solved: Number(r.solved), rank: Number(r.rank), bestTimeMs: r.best_time_ms == null ? null : Number(r.best_time_ms) });
    return { period: filter.period, entries: result[0].map(row), me: currentId ? { solved: Number(result[2][0].solved), rank: result[1][0] ? Number(result[1][0].rank) : null, bestTimeMs: result[1][0]?.best_time_ms == null ? null : Number(result[1][0].best_time_ms) } : null };
  }
}
