-- Add accounts alongside anonymous history; preserve any existing accounts.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY NOT NULL,
  google_sub TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  -- Legacy compatibility only: all players now participate in rankings.
  listed INTEGER NOT NULL DEFAULT 0 CHECK (listed IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS player_custom_nicknames (
  player_id TEXT PRIMARY KEY NOT NULL
);
CREATE TABLE IF NOT EXISTS player_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS player_avatars (
  player_id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS player_sessions_player ON player_sessions(player_id);
CREATE TABLE IF NOT EXISTS ranked_attempts (
  token_hash TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  seed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ranked_attempts_player ON ranked_attempts(player_id, created_at);
CREATE TABLE IF NOT EXISTS ranked_completions (
  player_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  seed INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, size, depth, difficulty, seed)
);
CREATE INDEX IF NOT EXISTS ranked_completions_time ON ranked_completions(completed_at);
CREATE TABLE IF NOT EXISTS account_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ranked_solve_times (
  token_hash TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  seed INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  completed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ranked_solve_times_player ON ranked_solve_times(player_id, completed_at);
