import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import { handleApi } from '../server/api.ts';
import { LocalStore } from '../server/local-store.ts';
import { UnavailableStore, type Order } from '../server/store.ts';
import { Puzzle, type PuzzleSettings } from '../src/puzzle.ts';

const origin = 'http://localhost:5173';
const env = { APP_ORIGIN: origin };
const visitorA = 'a4444444-4444-4444-8444-444444444444';
const visitorB = 'b4444444-4444-4444-8444-444444444444';
const sponsorId = 'c4444444-4444-4444-8444-444444444444';
const receipt = 'cs_test_statisticssponsor123';
const DAY = 86_400_000;
const request = (path: string, body?: unknown, requestOrigin = origin) => new Request(`${origin}${path}`, body === undefined ? undefined : {
  method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
function setup(t: TestContext, date = '2026-08-01T12:00:00.000Z') {
  const store = new LocalStore(':memory:');
  let now = Date.parse(date);
  t.after(() => store.close());
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Statistics must not call external providers'); });
  return { store, time: () => now, at: (date: string | number) => { now = typeof date === 'number' ? date : Date.parse(date); } };
}
function solved(overrides: Partial<PuzzleSettings> = {}): Puzzle {
  const puzzle = new Puzzle({ size: 3, depth: 3, difficulty: 'easy', seed: 7, ...overrides });
  for (const edge of puzzle.solution) assert.equal(puzzle.toggle(...edge).changed, true);
  assert.equal(puzzle.solved, true);
  return puzzle;
}
const completion = (game: object, visitorId = visitorA, attemptId = crypto.randomUUID()) => ({ visitorId, attemptId, game });
async function post(store: LocalStore, path: string, body: unknown) {
  const response = await handleApi(request(path, body), env, store);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function stats(store: LocalStore, period = 'all') {
  const response = await handleApi(request(`/api/statistics?period=${period}`), env, store);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return response.json();
}
async function paidSponsor(store: LocalStore, now: number, overrides: Partial<Order> = {}) {
  const order: Order = {
    kind: 'sponsor', id: sponsorId, fingerprint: 'test', token: 'private-order-token', brand: 'Thoughtful Tools',
    tagline: 'A useful introduction', url: 'https://example.com/', amount: 10000, currency: 'usd', days: 30,
    createdAt: new Date(now).toISOString(), priceId: null, status: 'pending', ...overrides,
  };
  await store.createOrder(order);
  await store.bindSession(order.id, overrides.sessionId ?? receipt, '', 'price_verified');
  await store.fulfill(order.id, overrides.sessionId ?? receipt, new Date(now).toISOString(), new Date(now + 30 * DAY).toISOString());
  return order;
}
const event = (kind: 'view' | 'click', visitorId = visitorA, id = sponsorId) => ({ visitorId, sponsorId: id, kind });

test('empty statistics begin on the real tracking day and reject unsupported periods and methods', async t => {
  const { store } = setup(t);
  const result = await stats(store);
  assert.equal(result.scope, 'local');
  assert.equal(result.period, 'all');
  assert.equal(result.trackingSince, '2026-08-01T12:00:00.000Z');
  assert.deepEqual(result.totals, { visitors: 0, puzzlesSolved: 0, dotsCleared: 0, nodesFilled: 0, connectionsCompleted: 0 });
  assert.deepEqual(result.daily, [{ date: '2026-08-01', visitors: 0, puzzlesSolved: 0, dotsCleared: 0, nodesFilled: 0 }]);
  assert.deepEqual(result.sizes, []);
  assert.deepEqual(result.difficulties, []);
  assert.equal((await (await handleApi(request('/api/statistics'), env, store)).json()).period, '30d');
  assert.equal((await handleApi(request('/api/statistics?period=year'), env, store)).status, 400);
  assert.equal((await handleApi(request('/api/statistics', {}), env, store)).status, 405);
});

test('completions require a truly solved graph and derive counts instead of trusting client totals', async t => {
  const { store } = setup(t);
  const puzzle = solved();
  const valid = completion(puzzle.serialize());
  assert.deepEqual(await post(store, '/api/completions', valid), { recorded: true });
  const result = await stats(store);
  assert.equal(result.totals.puzzlesSolved, 1);
  assert.equal(result.totals.connectionsCompleted, puzzle.edges.length);
  assert.equal(result.totals.nodesFilled, puzzle.nodes.length);
  assert.equal(result.daily[0].nodesFilled, 26, "Only the cube surface has playable nodes");
  assert.equal(result.totals.dotsCleared, puzzle.nodes.reduce((sum, node) => sum + node.required, 0));
  assert.deepEqual(result.sizes, [{ size: 3, depth: 3, count: 1 }]);
  assert.deepEqual(result.difficulties, [{ difficulty: 'easy', count: 1 }]);
  assert.doesNotMatch(JSON.stringify(result), /attemptId|visitorId|seed|session|private-order/);
  const incomplete = solved(); incomplete.undo();
  const duplicated = JSON.parse(JSON.stringify(puzzle.serialize())); duplicated.edges.push(duplicated.edges[0]);
  const disconnected = new Puzzle({ size: 3, depth: 1, difficulty: 'hard', seed: 517 });
  for (const edge of [[0, 1], [0, 3], [1, 2], [1, 4], [2, 5], [3, 4], [5, 8], [6, 7]] as [number, number][])
    assert.equal(disconnected.toggle(...edge).changed, true);
  assert.equal(disconnected.progress, 1);
  assert.equal(disconnected.disconnected, true);
  for (const game of [null, {}, [], incomplete.serialize(), duplicated, disconnected.serialize()])
    assert.equal((await handleApi(request('/api/completions', completion(game as object)), env, store)).status, 400);
  for (const body of [{ ...valid, dotsCleared: 99999 }, { ...valid, completedAt: '2000-01-01' }, { ...valid, visitorId: 'bad' }, { ...valid, attemptId: 'bad' }])
    assert.equal((await handleApi(request('/api/completions', body), env, store)).status, 400);
  assert.equal((await stats(store)).totals.puzzlesSolved, 1);
});

test('concurrent completion retries, refreshes and new attempt IDs cannot recount the same browser puzzle', async t => {
  const { store, at } = setup(t);
  const puzzle = solved();
  const payload = completion(puzzle.serialize());
  const results = await Promise.all(Array.from({ length: 12 }, () => post(store, '/api/completions', payload)));
  assert.equal(results.filter(result => result.recorded).length, 1);
  at('2026-08-02T12:00:00.000Z');
  assert.deepEqual(await post(store, '/api/completions', completion(puzzle.serialize(), visitorA.toUpperCase())), { recorded: false });
  assert.deepEqual(await post(store, '/api/completions', completion(solved({ seed: 9 }).serialize(), visitorB, payload.attemptId)), { recorded: false });
  assert.deepEqual(await post(store, '/api/completions', completion(puzzle.serialize(), visitorB)), { recorded: true });
  const result = await stats(store);
  assert.equal(result.totals.puzzlesSolved, 2);
  assert.deepEqual(result.daily.map((day: { puzzlesSolved: number }) => day.puzzlesSolved), [1, 1], 'The original completion date is immutable');
});

test('verified completions retain browser session attribution on delayed delivery without duplicate events', async t => {
  const { store, time, at } = setup(t);
  const hex = time().toString(16).padStart(12, '0');
  const analytics = { sessionId: `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000001`, timestamp: new Date(time() + 1000).toISOString() };
  const captures: any[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    captures.push(JSON.parse(String(init.body)));
    return new Response('', { status: 202 });
  });
  const analyticsEnv = { ...env, POSTHOG_PROJECT_API_KEY: 'phc_test' };
  const payload = { ...completion(solved().serialize()), analytics };
  at(time() + 2 * DAY);
  for (let i = 0; i < 2; i++) {
    const response = await handleApi(request('/api/completions', payload), analyticsEnv, store);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { recorded: i === 0 });
  }
  assert.equal(captures.length, 1);
  assert.equal(captures[0].event, 'puzzle_completed');
  assert.equal(captures[0].properties.$session_id, analytics.sessionId);
  assert.equal(captures[0].properties.distinct_id, visitorA);
  assert.equal(captures[0].properties.app, 'nodoku');
  assert.equal(captures[0].properties.$host, new URL(env.APP_ORIGIN).host);
  assert.equal(captures[0].properties.$pathname, '/');
  assert.equal(captures[0].properties.$current_url, new URL('/', env.APP_ORIGIN).href);
  assert.equal(captures[0].timestamp, analytics.timestamp);
  assert.equal(captures[0].properties.connection_count, solved().edges.length);
  // Old clients and damaged optional metadata still save verified puzzle results.
  for (const [index, value] of [undefined, { sessionId: 'bad', timestamp: analytics.timestamp }].entries()) {
    const response = await handleApi(request('/api/completions', {
      ...completion(solved({ seed: 30 + index }).serialize()), analytics: value,
    }), analyticsEnv, store);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { recorded: true });
    assert.equal(captures.at(-1).properties.$session_id, undefined);
    assert.equal(captures.at(-1).timestamp, undefined);
  }
  const incomplete = solved({ seed: 99 }); incomplete.undo();
  assert.equal((await handleApi(request('/api/completions', { ...completion(incomplete.serialize()), analytics }), analyticsEnv, store)).status, 400);
  assert.equal(captures.length, 3);
});

test('UTC periods count distinct visitors, keep daily counts nonadditive and bound all-time charts', async t => {
  const { store, at } = setup(t, '2026-08-01T23:59:59.999Z');
  const puzzles = [solved(), solved({ size: 4, depth: 1, difficulty: 'hard' }), solved({ difficulty: 'medium' }), solved({ seed: 8 })];
  await post(store, '/api/visitors', { visitorId: visitorA });
  await post(store, '/api/completions', completion(puzzles[0].serialize()));
  at('2026-08-25T00:00:00.000Z');
  await post(store, '/api/visitors', { visitorId: visitorA });
  await post(store, '/api/visitors', { visitorId: visitorA });
  await post(store, '/api/visitors', { visitorId: visitorB });
  await post(store, '/api/completions', completion(puzzles[1].serialize()));
  at('2026-08-30T23:59:59.999Z');
  await post(store, '/api/visitors', { visitorId: visitorA });
  await post(store, '/api/completions', completion(puzzles[2].serialize()));
  at('2026-08-31T00:00:00.000Z');
  await post(store, '/api/visitors', { visitorId: visitorB });
  await post(store, '/api/completions', completion(puzzles[3].serialize(), visitorB));
  const today = await stats(store, 'today');
  assert.equal(today.totals.visitors, 1);
  assert.equal(today.totals.puzzlesSolved, 1);
  assert.equal(today.daily.length, 1);
  const week = await stats(store, '7d');
  assert.equal(week.totals.visitors, 2);
  assert.equal(week.totals.puzzlesSolved, 3);
  assert.equal(week.daily[0].date, '2026-08-25');
  assert.equal(week.daily.length, 7);
  assert.equal(week.daily.reduce((sum: number, day: { visitors: number }) => sum + day.visitors, 0), 4);
  const month = await stats(store, '30d');
  assert.equal(month.totals.puzzlesSolved, 3);
  const all = await stats(store);
  assert.equal(all.trackingSince, '2026-08-01T23:59:59.999Z');
  assert.equal(all.totals.visitors, 2);
  assert.equal(all.totals.puzzlesSolved, 4);
  assert.equal(all.totals.connectionsCompleted, puzzles.reduce((sum, puzzle) => sum + puzzle.edges.length, 0));
  assert.equal(all.totals.dotsCleared, all.totals.connectionsCompleted * 2);
  assert.equal(all.totals.nodesFilled, puzzles.reduce((sum, puzzle) => sum + puzzle.nodes.length, 0));
  assert.equal(all.daily.find((row: { date: string }) => row.date === "2026-08-25").nodesFilled, 16);
  assert.equal(all.daily.length, 30);
  assert.equal(all.daily[0].date, '2026-08-02');
  assert.deepEqual(all.sizes, [{ size: 3, depth: 3, count: 3 }, { size: 4, depth: 1, count: 1 }]);
  assert.deepEqual(all.difficulties, [{ difficulty: 'easy', count: 2 }, { difficulty: 'hard', count: 1 }, { difficulty: 'medium', count: 1 }]);
});

test('the additive schema preserves legacy visitors without inventing past daily history', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'nodoku-statistics-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'legacy.sqlite');
  const database = new DatabaseSync(path);
  database.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  database.prepare('INSERT INTO visitors (id) VALUES (?)').run(visitorA);
  database.exec('DROP TABLE statistics_meta; DROP TABLE visitor_days; DROP TABLE puzzle_completions; DROP TABLE sponsor_events;');
  database.close();
  const store = new LocalStore(path);
  t.after(() => store.close());
  t.mock.method(Date, 'now', () => Date.parse('2026-08-31T12:00:00.000Z'));
  const all = await stats(store);
  assert.equal(all.totals.visitors, 1);
  assert.equal(all.daily.length, 1);
  assert.equal(all.daily[0].visitors, 0);
  assert.equal((await stats(store, 'today')).totals.visitors, 0);
  await post(store, '/api/visitors', { visitorId: visitorA });
  assert.equal((await stats(store)).totals.visitors, 1);
  assert.equal((await stats(store, 'today')).totals.visitors, 1);
});

test('sponsor views and clicks are qualified daily uniques and require a same-day view', async t => {
  const { store, time, at } = setup(t);
  await paidSponsor(store, time());
  assert.equal((await handleApi(request('/api/sponsor-events', event('click')), env, store)).status, 409);
  const views = await Promise.all(Array.from({ length: 10 }, () => post(store, '/api/sponsor-events', event('view'))));
  assert.equal(views.filter(result => result.recorded).length, 1);
  const clicks = await Promise.all(Array.from({ length: 10 }, () => post(store, '/api/sponsor-events', event('click'))));
  assert.equal(clicks.filter(result => result.recorded).length, 1);
  await post(store, '/api/sponsor-events', event('view', visitorB));
  let report = await post(store, '/api/sponsor-report', { receipt, period: 'today' });
  assert.deepEqual(report.totals, { views: 2, clicks: 1, ctr: 50 });
  assert.equal(report.brand, 'Thoughtful Tools');
  at('2026-08-02T00:00:00.000Z');
  assert.equal((await handleApi(request('/api/sponsor-events', event('click')), env, store)).status, 409);
  await post(store, '/api/sponsor-events', event('view'));
  await post(store, '/api/sponsor-events', event('click'));
  report = await post(store, '/api/sponsor-report', { receipt, period: 'all' });
  assert.deepEqual(report.totals, { views: 3, clicks: 2, ctr: 66.67 });
  assert.deepEqual(report.daily, [{ date: '2026-08-01', views: 2, clicks: 1 }, { date: '2026-08-02', views: 1, clicks: 1 }]);
  assert.deepEqual((await post(store, '/api/sponsor-report', { receipt, period: 'today' })).totals, { views: 1, clicks: 1, ctr: 100 });
  assert.doesNotMatch(JSON.stringify(report), /cs_test|c4444444|a4444444|b4444444|private-order-token/);
});

test('sponsor event eligibility and private receipts exclude pending, ad-free, unknown and expired campaigns', async t => {
  const { store, time, at } = setup(t);
  const paid = await paidSponsor(store, time());
  const pendingId = crypto.randomUUID(), adFreeId = crypto.randomUUID();
  await store.createOrder({ ...paid, id: pendingId });
  await store.bindSession(pendingId, 'cs_test_statisticspending123', '', 'price_verified');
  await paidSponsor(store, time(), { kind: 'ad_free', id: adFreeId, sessionId: 'cs_test_statisticsadfree123' });
  for (const id of [pendingId, adFreeId, crypto.randomUUID()])
    assert.equal((await handleApi(request('/api/sponsor-events', event('view', visitorA, id)), env, store)).status, 404);
  for (const receipt of ['cs_test_statisticspending123', 'cs_test_statisticsadfree123', 'cs_test_statisticsunknown123'])
    assert.equal((await handleApi(request('/api/sponsor-report', { receipt, period: 'all' }), env, store)).status, 404);
  await post(store, '/api/sponsor-events', event('view'));
  at(time() + 30 * DAY);
  assert.equal((await handleApi(request('/api/sponsor-events', event('view')), env, store)).status, 404);
  const report = await post(store, '/api/sponsor-report', { receipt, period: 'all' });
  assert.equal(report.totals.views, 1, 'A paid sponsor can still read its historical report after expiry');
  assert.equal(report.daily.length, 30);
  assert.equal(report.daily[0].date, '2026-08-02');
});

test('statistics writes and private reports enforce origin, body limits and durable storage', async t => {
  const { store } = setup(t);
  const puzzle = solved();
  const requests: [string, object][] = [
    ['/api/completions', completion(puzzle.serialize())],
    ['/api/sponsor-events', event('view')],
    ['/api/sponsor-report', { receipt, period: 'all' }],
  ];
  for (const [path, body] of requests) {
    assert.equal((await handleApi(request(path, body, 'https://other.example'), env, store)).status, 403);
    assert.equal((await handleApi(request(path), env, store)).status, 405);
    assert.equal((await handleApi(new Request(`${origin}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }), env, store)).status, 415);
    assert.equal((await handleApi(request(path, body), env, new UnavailableStore())).status, 503);
  }
  assert.equal((await handleApi(request('/api/completions', { ...requests[0][1], padding: 'x'.repeat(262144) }), env, store)).status, 413);
  assert.equal((await handleApi(request('/api/sponsor-events', { ...event('view'), at: 'yesterday' }), env, store)).status, 400);
  assert.equal((await handleApi(request('/api/sponsor-events', { ...event('view'), kind: 'purchase' }), env, store)).status, 400);
  assert.equal((await handleApi(request('/api/sponsor-report', { receipt, period: 'year' }), env, store)).status, 400);
  assert.equal((await handleApi(request('/api/sponsor-report', { receipt: 'invalid', period: 'all' }), env, store)).status, 400);
  const unavailable = await handleApi(request('/api/statistics?period=all'), env, new UnavailableStore());
  assert.equal(unavailable.status, 503);
  assert.equal('totals' in await unavailable.json(), false);
});
