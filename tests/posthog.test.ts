import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { Puzzle } from '../src/puzzle.ts';
import { capturePostHog, completionAnalytics } from '../server/posthog.ts';

test('server analytics is optional and sends only the verified completion summary', async t => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response('', { status: 202 });
  });

  await capturePostHog({}, 'puzzle_completed', 'visitor-id', { grid_size: 3 });
  assert.equal(requests.length, 0, 'a missing key leaves the game server fully self-contained');

  await capturePostHog({ POSTHOG_PROJECT_API_KEY: 'phc_test_key' }, 'puzzle_completed', 'visitor-id', {
    grid_size: 3, depth: 3, difficulty: 'easy', connection_count: 12,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://us.i.posthog.com/capture/');
  assert.deepEqual(requests[0].body, {
    api_key: 'phc_test_key',
    event: 'puzzle_completed',
    properties: {
      distinct_id: 'visitor-id', $lib: 'nodoku-server', grid_size: 3, depth: 3,
      difficulty: 'easy', connection_count: 12,
    },
  });
});

test('session attribution only accepts UUIDv7 sessions with a matching event time', () => {
  const start = Date.now() - 60_000;
  const hex = start.toString(16).padStart(12, '0');
  const sessionId = `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000001`;
  const timestamp = new Date(start + 1000).toISOString();
  assert.deepEqual(completionAnalytics({ sessionId, timestamp }), { sessionId, timestamp });
  for (const value of [null, {}, { sessionId: crypto.randomUUID(), timestamp },
    { sessionId, timestamp: 'bad' }, { sessionId, timestamp: new Date(start - 1).toISOString() },
    { sessionId, timestamp: new Date(start + 86_400_000).toISOString() },
    { sessionId, timestamp: new Date(Date.now() + 600_000).toISOString() }]) {
    assert.equal(completionAnalytics(value), undefined);
  }
});

test('completion queue freezes attribution through offline storage, reload, and retries', async () => {
  const storage = new Map<string, string>();
  const requests: any[] = [];
  const source = stripTypeScriptTypes(readFileSync('src/completions.ts', 'utf8'))
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const visitorId = crypto.randomUUID();
  const firstSession = '0198abc0-0000-7000-8000-000000000001';
  function client(sessionId: string | undefined, online: boolean) {
    const window = Object.assign(new EventTarget(), { clearTimeout() {}, setTimeout() { return 1; } });
    const document = Object.assign(new EventTarget(), { hidden: false });
    const context = createContext({
      window, document, navigator: { onLine: online }, Event, crypto, Puzzle,
      getVisitorId: () => visitorId, getAnalyticsSessionId: () => sessionId,
      getRankedTicket: async () => undefined, forgetRankedTicket: () => {}, refreshCompletionRanking: async () => {},
      timeoutSignal: () => undefined,
      localStorage: {
        get length() { return storage.size; }, key: (i: number) => [...storage.keys()][i],
        getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      fetch: async (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ recorded: true }));
      },
    });
    runInContext(source, context);
    return context;
  }
  const puzzle = new Puzzle({ size: 2, depth: 1, difficulty: 'easy', seed: 7 });
  for (const edge of puzzle.solution) puzzle.toggle(...edge);
  const attempt = crypto.randomUUID();
  const first = client(firstSession, false);
  first.recordCompletion(puzzle, attempt);
  const saved = JSON.parse([...storage.values()][0]);
  assert.equal(saved.analytics.sessionId, firstSession);
  assert.ok(Number.isFinite(Date.parse(saved.analytics.timestamp)));
  assert.equal(requests.length, 0);
  // A later page/session must send the saved solve attribution, not its own ID.
  client('0198abc1-0000-7000-8000-000000000002', true).startCompletionTracking();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].analytics, saved.analytics);
  assert.equal(storage.size, 0);
  const withoutAnalytics = client(undefined, false);
  withoutAnalytics.recordCompletion(puzzle, crypto.randomUUID());
  assert.equal(JSON.parse([...storage.values()][0]).analytics, undefined);
});

test('session getter handles analytics loading and unavailable SDKs without inventing IDs', () => {
  const source = stripTypeScriptTypes(readFileSync('src/analytics.ts', 'utf8'))
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const context = createContext({});
  runInContext(source, context);
  assert.equal(context.getAnalyticsSessionId(), undefined);
  runInContext('initialized = true; posthog = { get_session_id: () => "sdk-session" };', context);
  assert.equal(context.getAnalyticsSessionId(), 'sdk-session');
  runInContext('posthog = { get_session_id: () => { throw new Error("Unavailable"); } };', context);
  assert.equal(context.getAnalyticsSessionId(), undefined);
});
