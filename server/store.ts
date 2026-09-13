import { chartDays, periodStart, utcDay, type Completion, type SponsorEventKind, type SponsorReport, type Statistics, type StatisticsPeriod } from './statistics.js';
import { AccountsStore } from './accounts-store.js';

export interface Sponsor {
  id: string;
  brand: string;
  tagline: string;
  url: string;
  endsAt: string;
}

export interface Order {
  kind?: 'sponsor' | 'ad_free';
  id: string;
  fingerprint: string;
  token: string;
  brand: string;
  tagline: string;
  url: string;
  amount: number;
  currency: string;
  days: number;
  createdAt: string;
  priceId: string | null;
  sessionId?: string;
  checkoutUrl?: string;
  status: 'pending' | 'paid';
  paidAt?: string;
  endsAt?: string;
}

export interface Store {
  readonly accounts?: AccountsStore;
  readonly scope: 'local' | 'global';
  readonly persistent: boolean;
  health(): Promise<boolean>;
  visitorCount(visitorId?: string): Promise<number>;
  presenceCount(visitorId: string, now?: number): Promise<number>;
  recordCompletion(completion: Completion, now?: number): Promise<boolean>;
  statistics(period: StatisticsPeriod, now?: number): Promise<Statistics>;
  recordSponsorEvent(visitorId: string, sponsorId: string, kind: SponsorEventKind, now?: number): Promise<'recorded' | 'duplicate' | 'unavailable' | 'view-required'>;
  sponsorReport(sessionId: string, period: StatisticsPeriod, now?: number): Promise<SponsorReport | null>;
  createOrder(order: Order): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  getOrderBySession(sessionId: string): Promise<Order | null>;
  bindSession(orderId: string, sessionId: string, checkoutUrl: string, priceId: string): Promise<boolean>;
  fulfill(orderId: string, sessionId: string, paidAt: string, endsAt: string): Promise<Order | null>;
  activeSponsors(now: string): Promise<Sponsor[]>;
}

/** Missing deployment bindings must never silently fall back to ephemeral storage. */
export class UnavailableStore implements Store {
  readonly scope = 'global' as const;
  readonly persistent = false;
  async health(): Promise<boolean> { return false; }
  async visitorCount(): Promise<number> { throw new Error('Storage unavailable'); }
  async presenceCount(): Promise<number> { throw new Error('Storage unavailable'); }
  async recordCompletion(): Promise<boolean> { throw new Error('Storage unavailable'); }
  async statistics(): Promise<Statistics> { throw new Error('Storage unavailable'); }
  async recordSponsorEvent(): Promise<'recorded'> { throw new Error('Storage unavailable'); }
  async sponsorReport(): Promise<SponsorReport | null> { throw new Error('Storage unavailable'); }
  async createOrder(): Promise<Order> { throw new Error('Storage unavailable'); }
  async getOrder(): Promise<Order | null> { throw new Error('Storage unavailable'); }
  async getOrderBySession(): Promise<Order | null> { throw new Error('Storage unavailable'); }
  async bindSession(): Promise<boolean> { throw new Error('Storage unavailable'); }
  async fulfill(): Promise<Order | null> { throw new Error('Storage unavailable'); }
  async activeSponsors(): Promise<Sponsor[]> { throw new Error('Storage unavailable'); }
}

export type SqlValue = string | number | null;
export interface Query { sql: string; values?: SqlValue[] }
export interface SqlExecutor {
  execute(query: Query): Promise<Record<string, unknown>[]>;
  transaction(queries: Query[]): Promise<Record<string, unknown>[][]>;
}

export const PRESENCE_TTL_MS = 90_000;

function startTracking(now: number): Query {
  return { sql: "INSERT OR IGNORE INTO statistics_meta (key, value) VALUES ('tracking_since', ?)", values: [new Date(now).toISOString()] };
}

function decode(row: Record<string, unknown> | undefined): Order | null {
  if (!row) return null;
  return {
    ...JSON.parse(String(row.payload)),
    priceId: row.price_id ?? null,
    sessionId: row.session_id ?? undefined,
    checkoutUrl: row.checkout_url ?? undefined,
    status: row.status,
    paidAt: row.paid_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
  } as Order;
}

/** Shared parameterized SQL keeps local SQLite and Cloudflare D1 behavior identical. */
export class SqlStore implements Store {
  readonly persistent = true;
  readonly accounts: AccountsStore;
  constructor(readonly scope: 'local' | 'global', private readonly sql: SqlExecutor) { this.accounts = new AccountsStore(sql); }

  async health(): Promise<boolean> {
    try {
      await this.sql.execute({ sql: 'SELECT id FROM visitors LIMIT 1' });
      await this.sql.execute({ sql: 'SELECT id FROM sponsor_orders LIMIT 1' });
      return true;
    } catch { return false; }
  }

  async visitorCount(visitorId?: string, now = Date.now()): Promise<number> {
    const queries: Query[] = [];
    if (visitorId) queries.push(
      startTracking(now),
      { sql: 'INSERT OR IGNORE INTO visitors (id) VALUES (?)', values: [visitorId] },
      { sql: 'INSERT OR IGNORE INTO visitor_days (day, visitor_id) VALUES (?, ?)', values: [utcDay(now), visitorId] },
    );
    queries.push({ sql: 'SELECT COUNT(*) AS count FROM visitors' });
    const results = await this.sql.transaction(queries);
    return Number(results[results.length - 1][0].count);
  }

  async presenceCount(visitorId: string, now = Date.now()): Promise<number> {
    const cutoff = now - PRESENCE_TTL_MS;
    const results = await this.sql.transaction([
      {
        sql: 'INSERT INTO visitor_presence (id, last_seen) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET last_seen = MAX(visitor_presence.last_seen, excluded.last_seen)',
        values: [visitorId, now],
      },
      { sql: 'DELETE FROM visitor_presence WHERE last_seen <= ?', values: [cutoff] },
      { sql: 'SELECT COUNT(*) AS online FROM visitor_presence WHERE last_seen > ?', values: [cutoff] },
    ]);
    return Number(results[2][0].online);
  }

  async recordCompletion(completion: Completion, now = Date.now()): Promise<boolean> {
    const result = await this.sql.transaction([
      startTracking(now),
      {
        sql: 'INSERT OR IGNORE INTO puzzle_completions (attempt_id, visitor_id, size, depth, difficulty, seed, connections, dots, day, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING attempt_id',
        values: [completion.attemptId, completion.visitorId, completion.size, completion.depth, completion.difficulty, completion.seed, completion.connections, completion.dots, utcDay(now), new Date(now).toISOString()],
      },
    ]);
    return result[1].length === 1;
  }

  async statistics(period: StatisticsPeriod, now = Date.now()): Promise<Statistics> {
    const from = periodStart(period, now), through = utcDay(now);
    const chartFrom = periodStart(period === 'all' ? '30d' : period, now);
    const results = await this.sql.transaction([
      startTracking(now),
      { sql: "SELECT value FROM statistics_meta WHERE key = 'tracking_since'" },
      period === 'all'
        ? { sql: 'SELECT COUNT(*) AS count FROM visitors' }
        : { sql: 'SELECT COUNT(DISTINCT visitor_id) AS count FROM visitor_days WHERE day >= ? AND day <= ?', values: [from, through] },
      { sql: 'SELECT COUNT(*) AS solved, COALESCE(SUM(dots), 0) AS dots, COALESCE(SUM(size * size * depth - MAX(size - 2, 0) * MAX(size - 2, 0) * MAX(depth - 2, 0)), 0) AS nodes, COALESCE(SUM(connections), 0) AS connections FROM puzzle_completions WHERE day >= ? AND day <= ?', values: [from, through] },
      { sql: 'SELECT day, COUNT(*) AS count FROM visitor_days WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day', values: [chartFrom, through] },
      { sql: 'SELECT day, COUNT(*) AS solved, SUM(dots) AS dots, SUM(size * size * depth - MAX(size - 2, 0) * MAX(size - 2, 0) * MAX(depth - 2, 0)) AS nodes FROM puzzle_completions WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day', values: [chartFrom, through] },
      { sql: 'SELECT size, depth, COUNT(*) AS count FROM puzzle_completions WHERE day >= ? AND day <= ? GROUP BY size, depth ORDER BY size, depth', values: [from, through] },
      { sql: 'SELECT difficulty, COUNT(*) AS count FROM puzzle_completions WHERE day >= ? AND day <= ? GROUP BY difficulty ORDER BY difficulty', values: [from, through] },
    ]);
    const trackingSince = String(results[1][0].value);
    const visitorsByDay = new Map(results[4].map(row => [String(row.day), Number(row.count)]));
    const completionsByDay = new Map(results[5].map(row => [String(row.day), row]));
    const totals = results[3][0];
    return {
      scope: this.scope, period, trackingSince,
      totals: { visitors: Number(results[2][0].count), puzzlesSolved: Number(totals.solved), dotsCleared: Number(totals.dots), nodesFilled: Number(totals.nodes), connectionsCompleted: Number(totals.connections) },
      daily: chartDays(period, now, trackingSince).map(date => ({ date, visitors: visitorsByDay.get(date) ?? 0, puzzlesSolved: Number(completionsByDay.get(date)?.solved ?? 0), dotsCleared: Number(completionsByDay.get(date)?.dots ?? 0), nodesFilled: Number(completionsByDay.get(date)?.nodes ?? 0) })),
      sizes: results[6].map(row => ({ size: Number(row.size), depth: Number(row.depth), count: Number(row.count) })),
      difficulties: results[7].map(row => ({ difficulty: String(row.difficulty), count: Number(row.count) })),
    };
  }

  async recordSponsorEvent(visitorId: string, sponsorId: string, kind: SponsorEventKind, now = Date.now()): Promise<'recorded' | 'duplicate' | 'unavailable' | 'view-required'> {
    const time = new Date(now).toISOString(), day = utcDay(now);
    const active = "id = ? AND status = 'paid' AND paid_at <= ? AND ends_at > ? AND COALESCE(json_extract(payload, '$.kind'), 'sponsor') = 'sponsor'";
    const results = await this.sql.transaction([
      startTracking(now),
      { sql: `SELECT id FROM sponsor_orders WHERE ${active}`, values: [sponsorId, time, time] },
      { sql: "SELECT sponsor_id FROM sponsor_events WHERE sponsor_id = ? AND visitor_id = ? AND day = ? AND kind = 'view'", values: [sponsorId, visitorId, day] },
      {
        sql: `INSERT OR IGNORE INTO sponsor_events (sponsor_id, visitor_id, day, kind, recorded_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT id FROM sponsor_orders WHERE ${active}) AND (? = 'view' OR EXISTS (SELECT sponsor_id FROM sponsor_events WHERE sponsor_id = ? AND visitor_id = ? AND day = ? AND kind = 'view')) RETURNING sponsor_id`,
        values: [sponsorId, visitorId, day, kind, time, sponsorId, time, time, kind, sponsorId, visitorId, day],
      },
    ]);
    if (!results[1].length) return 'unavailable';
    if (kind === 'click' && !results[2].length) return 'view-required';
    return results[3].length ? 'recorded' : 'duplicate';
  }

  async sponsorReport(sessionId: string, period: StatisticsPeriod, now = Date.now()): Promise<SponsorReport | null> {
    const order = await this.getOrderBySession(sessionId);
    if (!order || order.status !== 'paid' || (order.kind ?? 'sponsor') !== 'sponsor') return null;
    const from = periodStart(period, now), through = utcDay(now);
    const chartFrom = periodStart(period === 'all' ? '30d' : period, now);
    const results = await this.sql.transaction([
      startTracking(now),
      { sql: "SELECT value FROM statistics_meta WHERE key = 'tracking_since'" },
      { sql: 'SELECT kind, COUNT(*) AS count FROM sponsor_events WHERE sponsor_id = ? AND day >= ? AND day <= ? GROUP BY kind', values: [order.id, from, through] },
      { sql: 'SELECT day, kind, COUNT(*) AS count FROM sponsor_events WHERE sponsor_id = ? AND day >= ? AND day <= ? GROUP BY day, kind ORDER BY day', values: [order.id, chartFrom, through] },
    ]);
    const totals = new Map(results[2].map(row => [String(row.kind), Number(row.count)]));
    const byDay = new Map(results[3].map(row => [`${row.day}:${row.kind}`, Number(row.count)]));
    const views = totals.get('view') ?? 0, clicks = totals.get('click') ?? 0;
    return {
      brand: order.brand, period, totals: { views, clicks, ctr: views ? Math.round(clicks / views * 10000) / 100 : 0 },
      daily: chartDays(period, now, String(results[1][0].value), order.paidAt).map(date => ({ date, views: byDay.get(`${date}:view`) ?? 0, clicks: byDay.get(`${date}:click`) ?? 0 })),
    };
  }

  async createOrder(order: Order): Promise<Order> {
    const result = await this.sql.transaction([
      { sql: 'INSERT OR IGNORE INTO sponsor_orders (id, payload, price_id) VALUES (?, ?, ?)', values: [order.id, JSON.stringify(order), order.priceId] },
      { sql: 'SELECT * FROM sponsor_orders WHERE id = ?', values: [order.id] },
    ]);
    return decode(result[1][0])!;
  }

  async getOrder(id: string): Promise<Order | null> {
    return decode((await this.sql.execute({ sql: 'SELECT * FROM sponsor_orders WHERE id = ?', values: [id] }))[0]);
  }

  async getOrderBySession(sessionId: string): Promise<Order | null> {
    return decode((await this.sql.execute({ sql: 'SELECT * FROM sponsor_orders WHERE session_id = ?', values: [sessionId] }))[0]);
  }

  async bindSession(orderId: string, sessionId: string, checkoutUrl: string, priceId: string): Promise<boolean> {
    const rows = await this.sql.execute({
      sql: 'UPDATE sponsor_orders SET session_id = ?, checkout_url = ?, price_id = ? WHERE id = ? AND (session_id IS NULL OR session_id = ?) AND (price_id IS NULL OR price_id = ?) RETURNING id',
      values: [sessionId, checkoutUrl, priceId, orderId, sessionId, priceId],
    });
    return rows.length === 1;
  }

  async fulfill(orderId: string, sessionId: string, paidAt: string, endsAt: string): Promise<Order | null> {
    const results = await this.sql.transaction([
      {
        sql: "UPDATE sponsor_orders SET status = 'paid', paid_at = ?, ends_at = ? WHERE id = ? AND session_id = ? AND status = 'pending'",
        values: [paidAt, endsAt, orderId, sessionId],
      },
      { sql: 'SELECT * FROM sponsor_orders WHERE id = ? AND session_id = ?', values: [orderId, sessionId] },
    ]);
    // A duplicate payment reads the original dates; it can never extend a campaign.
    return decode(results[1][0]);
  }

  async activeSponsors(now: string): Promise<Sponsor[]> {
    const rows = await this.sql.execute({
      sql: "SELECT * FROM sponsor_orders WHERE status = 'paid' AND ends_at > ? AND COALESCE(json_extract(payload, '$.kind'), 'sponsor') = 'sponsor' ORDER BY RANDOM() LIMIT 20",
      values: [now],
    });
    return rows.map((row) => {
      const order = decode(row)!;
      return { id: order.id, brand: order.brand, tagline: order.tagline, url: order.url, endsAt: order.endsAt! };
    });
  }
}

// Structural types let the adapter use Cloudflare bindings without a runtime import.
export interface D1Statement {
  bind(...values: SqlValue[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1Binding {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<{ results: T[] }[]>;
}

export class D1Store extends SqlStore {
  constructor(db: D1Binding) {
    const prepare = (query: Query) => db.prepare(query.sql).bind(...(query.values ?? []));
    super('global', {
      execute: async (query) => (await prepare(query).all()).results,
      transaction: async (queries) => (await db.batch(queries.map(prepare))).map((result) => result.results),
    });
  }
}
