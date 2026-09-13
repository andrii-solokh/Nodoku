CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY NOT NULL
);

CREATE TABLE IF NOT EXISTS visitor_presence (
  id TEXT PRIMARY KEY NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS visitor_presence_last_seen ON visitor_presence(last_seen);

CREATE TABLE IF NOT EXISTS statistics_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitor_days (
  day TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  PRIMARY KEY (day, visitor_id)
);

CREATE TABLE IF NOT EXISTS puzzle_completions (
  attempt_id TEXT PRIMARY KEY NOT NULL,
  visitor_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  seed INTEGER NOT NULL,
  connections INTEGER NOT NULL,
  dots INTEGER NOT NULL,
  day TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE (visitor_id, size, depth, difficulty, seed)
);

CREATE INDEX IF NOT EXISTS puzzle_completions_day ON puzzle_completions(day);

CREATE TABLE IF NOT EXISTS sponsor_events (
  sponsor_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('view', 'click')),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (sponsor_id, day, visitor_id, kind)
);

CREATE TABLE IF NOT EXISTS sponsor_orders (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  price_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TEXT,
  ends_at TEXT
);

CREATE INDEX IF NOT EXISTS sponsors_active ON sponsor_orders(status, ends_at, paid_at);

-- Accounts are separate from anonymous visitor statistics; no historical claims.
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

CREATE TABLE IF NOT EXISTS player_links (
  player_id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL
);
