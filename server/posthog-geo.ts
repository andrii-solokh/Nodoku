import { periodStart, utcDay, type StatisticsPeriod } from './statistics.js';

type Env = Record<string, string | undefined>;

export interface CountryStatistic {
  country: string;
  visitors: number;
  pageviews: number;
}

export interface GeographicStatistics {
  period: StatisticsPeriod;
  countries: CountryStatistic[];
}

const CACHE_MS = 5 * 60_000;
const ALL_TIME_START = '2020-01-01';
const DAY = 86_400_000;
const countryCode = /^[A-Z]{2}$/;
const projectId = /^[1-9]\d{0,15}$/;
const hostName = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const cache = new Map<string, { expiresAt: number; value: GeographicStatistics }>();

function apiHost(value: string | undefined): string | null {
  try {
    const url = new URL(value || 'https://us.posthog.com');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function integer(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function parseResult(value: unknown, period: StatisticsPeriod): GeographicStatistics {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { results?: unknown }).results)) throw new Error('Invalid PostHog response.');
  const countries: CountryStatistic[] = [];
  const seen = new Set<string>();
  for (const row of (value as { results: unknown[] }).results) {
    if (!Array.isArray(row) || row.length !== 3) throw new Error('Invalid PostHog row.');
    const country = typeof row[0] === 'string' && countryCode.test(row[0]) ? row[0] : 'Unknown';
    const visitors = integer(row[1]), pageviews = integer(row[2]);
    if (visitors === null || pageviews === null || seen.has(country)) throw new Error('Invalid PostHog statistic.');
    seen.add(country);
    countries.push({ country, visitors, pageviews });
  }
  return { period, countries: countries.sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews || a.country.localeCompare(b.country)) };
}

function through(now: number): string {
  return utcDay(now + DAY);
}

function query(period: StatisticsPeriod, now: number, host: string): string {
  const from = period === 'all' ? ALL_TIME_START : periodStart(period, now);
  return `SELECT
    coalesce(nullIf(properties.$geoip_country_code, ''), 'Unknown') AS country,
    uniq(distinct_id) AS visitors,
    count() AS pageviews
  FROM events
  WHERE event = '$pageview'
    AND properties.app = 'nodoku'
    AND properties.$host = '${host}'
    AND timestamp >= toDateTime('${from} 00:00:00')
    AND timestamp < toDateTime('${through(now)} 00:00:00')
  GROUP BY country
  ORDER BY visitors DESC, pageviews DESC, country ASC
  LIMIT 12`;
}

/**
 * Read public, country-level traffic aggregates without exposing a PostHog query
 * key to browsers. Missing configuration intentionally leaves this optional panel
 * unavailable while every D1-backed statistic continues to work.
 */
export async function geographicStatistics(
  env: Env,
  period: StatisticsPeriod,
  origin: string | null,
  now = Date.now(),
): Promise<GeographicStatistics | null> {
  const key = env.POSTHOG_QUERY_API_KEY;
  const id = env.POSTHOG_PROJECT_ID;
  let host: string | null = null;
  try { host = origin ? new URL(origin).hostname : null; } catch { /* Invalid origins are disabled below. */ }
  const endpoint = apiHost(env.POSTHOG_API_HOST);
  if (!key || key.length > 512 || !id || !projectId.test(id) || !host || !hostName.test(host) || !endpoint) return null;

  const cacheKey = `${endpoint}:${id}:${host}:${period}:${period === 'all' ? ALL_TIME_START : periodStart(period, now)}`;
  const existing = cache.get(cacheKey);
  if (existing && existing.expiresAt > now) return existing.value;

  const response = await fetch(`${endpoint}/api/projects/${id}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: query(period, now, host) } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('PostHog country query failed.');
  const value = parseResult(await response.json(), period);
  cache.set(cacheKey, { expiresAt: now + CACHE_MS, value });
  return value;
}
