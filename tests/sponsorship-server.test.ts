import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import Stripe from 'stripe';
import { handleApi } from '../server/api.ts';
import { LocalStore } from '../server/local-store.ts';
import { D1Store, PRESENCE_TTL_MS, UnavailableStore, type D1Statement, type Order, type SqlValue } from '../server/store.ts';

const env = { APP_ORIGIN: 'http://localhost:5173', STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_WEBHOOK_SECRET: 'whsec_mock' };
const requestId = 'a4444444-4444-4444-8444-444444444444';
const payload = { planId: 'spotlight', brand: 'Acme', tagline: 'Thoughtful tools for curious people.', url: 'https://example.com/', requestId };

function request(path: string, body?: unknown, origin = env.APP_ORIGIN): Request {
  return new Request(`${env.APP_ORIGIN}${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
  });
}

function storeFor(t: TestContext): LocalStore {
  const store = new LocalStore(':memory:');
  t.after(() => store.close());
  return store;
}

function d1StoreFor(t: TestContext) {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  t.after(() => database.close());
  type Statement = D1Statement & { run(): Record<string, unknown>[] };
  const store = new D1Store({
    prepare(sql) {
      let values: SqlValue[] = [];
      const statement: Statement = {
        bind(...bound) { values = bound; return statement; },
        async all<T>() { return { results: statement.run() as T[] }; },
        run() { return database.prepare(sql).all(...values) as Record<string, unknown>[]; },
      };
      return statement;
    },
    async batch<T>(statements: D1Statement[]) {
      database.exec('BEGIN');
      try {
        const result = statements.map(statement => ({ results: (statement as Statement).run() as T[] }));
        database.exec('COMMIT');
        return result;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  });
  return { store, database };
}

function sessionFrom(params: URLSearchParams, index: number) {
  return {
    id: `cs_test_session${index.toString().padStart(8, '0')}`, object: 'checkout.session',
    client_reference_id: params.get('client_reference_id'),
    metadata: { order_id: params.get('metadata[order_id]'), order_token: params.get('metadata[order_token]') },
    mode: 'payment', amount_total: 10000, currency: 'usd', payment_status: 'unpaid', status: 'open',
    url: `https://checkout.stripe.com/c/pay/session${index}`, customer_email: 'private@example.com',
    line_items: { object: 'list', has_more: false, data: [{
      quantity: 1, amount_total: 10000,
      price: { id: params.get('line_items[0][price]') ?? `price_inline${index}`, unit_amount: 10000, currency: 'usd', type: 'one_time', active: true },
    }] },
  };
}
type FakeSession = ReturnType<typeof sessionFrom>;

function stripeMock(t: TestContext, store?: LocalStore) {
  const sessions = new Map<string, FakeSession>();
  const byKey = new Map<string, FakeSession>();
  const creates: { params: URLSearchParams; key: string }[] = [];
  let price = { id: 'price_configured', active: true, type: 'one_time', unit_amount: 10000, currency: 'usd' };
  let rejectNextCreate = false;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'api.stripe.com', 'Tests never make external requests');
    const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Request-Id': 'req_mock' } });
    if (url.pathname.startsWith('/v1/prices/')) return respond(price);
    if (url.pathname === '/v1/checkout/sessions' && init?.method === 'POST') {
      const params = new URLSearchParams(String(init.body));
      const key = new Headers(init.headers).get('Idempotency-Key')!;
      creates.push({ params, key });
      if (store) assert.ok(await store.getOrder(params.get('client_reference_id')!), 'Pending order exists before Stripe is called');
      if (rejectNextCreate) {
        rejectNextCreate = false;
        return respond({ error: { type: 'invalid_request_error', message: 'A private provider error with sk_test_mock' } }, 400);
      }
      let session = byKey.get(key);
      if (!session) {
        session = sessionFrom(params, sessions.size + 1);
        sessions.set(session.id, session);
        byKey.set(key, session);
      }
      return respond(session);
    }
    const session = sessions.get(url.pathname.split('/').pop()!);
    if (session) return respond(session);
    return respond({ error: { type: 'invalid_request_error', message: 'No such checkout session' } }, 404);
  });
  return {
    sessions, creates,
    setPrice: (value: Partial<typeof price>) => { price = { ...price, ...value }; },
    rejectCreate: () => { rejectNextCreate = true; },
  };
}

async function makeCheckout(store: LocalStore) {
  const response = await handleApi(request('/api/checkout', payload), env, store);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

function signedWebhook(session: FakeSession, type = 'checkout.session.completed', mutateBody = false): Request {
  const event = JSON.stringify({ id: 'evt_mock', object: 'event', type, data: { object: session } });
  const sdk = new Stripe(env.STRIPE_SECRET_KEY);
  const signature = sdk.webhooks.generateTestHeaderString({ payload: event, secret: env.STRIPE_WEBHOOK_SECRET });
  return new Request(`${env.APP_ORIGIN}/api/stripe-webhook`, {
    method: 'POST', headers: { 'Stripe-Signature': signature, 'Content-Type': 'application/json' }, body: event + (mutateBody ? ' ' : ''),
  });
}

test('unique visitor count deduplicates concurrent requests and reports local scope', async (t) => {
  const store = storeFor(t);
  const responses = await Promise.all(Array.from({ length: 12 }, () => handleApi(request('/api/visitors', { visitorId: requestId }), env, store)));
  for (const response of responses) assert.deepEqual(await response.json(), { count: 1, scope: 'local' });
  await handleApi(request('/api/visitors', { visitorId: 'b4444444-4444-4444-8444-444444444444' }), env, store);
  assert.deepEqual(await (await handleApi(request('/api/visitors'), env, store)).json(), { count: 2, scope: 'local' });
  assert.equal((await handleApi(request('/api/visitors', { visitorId: 'bad' }), env, store)).status, 400);
});

test('online heartbeats deduplicate concurrent tabs and preserve the separate visitor total', async (t) => {
  const store = storeFor(t);
  await handleApi(request('/api/visitors', { visitorId: requestId }), env, store);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    handleApi(request('/api/presence', { visitorId: index % 2 ? requestId.toUpperCase() : requestId }), env, store)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { online: 1, scope: 'local' });
  }
  const second = await handleApi(request('/api/presence', { visitorId: 'b4444444-4444-4444-8444-444444444444' }), env, store);
  assert.deepEqual(await second.json(), { online: 2, scope: 'local' });
  assert.deepEqual(await (await handleApi(request('/api/visitors'), env, store)).json(), { count: 1, scope: 'local' });
});

test('presence expires exactly at 90 seconds and an expired visitor can rejoin', async (t) => {
  const store = storeFor(t);
  const a = requestId, b = 'b4444444-4444-4444-8444-444444444444';
  const start = 1_000_000;
  assert.equal(await store.presenceCount(a, start), 1);
  assert.equal(await store.presenceCount(b, start + PRESENCE_TTL_MS - 1), 2);
  assert.equal(await store.presenceCount(b, start + PRESENCE_TTL_MS), 1);
  assert.equal(await store.presenceCount(a, start + PRESENCE_TTL_MS + 1), 2);
  assert.equal(await store.presenceCount(b, start + 2 * PRESENCE_TTL_MS + 1), 1);
});

test('out-of-order heartbeats never shorten the latest online lifetime', async (t) => {
  const store = storeFor(t);
  const a = requestId, b = 'b4444444-4444-4444-8444-444444444444';
  const start = 1_000_000;
  await store.presenceCount(a, start);
  await store.presenceCount(a, start + 50_000);
  await store.presenceCount(a, start + 10_000);
  assert.equal(await store.presenceCount(b, start + 100_000), 2);
  assert.equal(await store.presenceCount(b, start + 140_000), 1);
});

test('presence uses server time and never accepts client timestamps', async (t) => {
  const store = storeFor(t);
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  await handleApi(request('/api/presence', { visitorId: requestId }), env, store);
  now += PRESENCE_TTL_MS;
  const expired = await handleApi(request('/api/presence', { visitorId: 'b4444444-4444-4444-8444-444444444444' }), env, store);
  assert.deepEqual(await expired.json(), { online: 1, scope: 'local' });
  const tampered = await handleApi(request('/api/presence', { visitorId: requestId, lastSeen: now + 999999 }), env, store);
  assert.equal(tampered.status, 400);
});

test('presence rejects invalid IDs, cross-origin writes, unsupported methods and oversized bodies', async (t) => {
  const store = storeFor(t);
  for (const body of [{}, [], null, { visitorId: 'bad' }, { visitorId: 1 }, { visitorId: requestId, online: 100 }])
    assert.equal((await handleApi(request('/api/presence', body), env, store)).status, 400);
  assert.equal((await handleApi(request('/api/presence', { visitorId: requestId }, 'https://other.example'), env, store)).status, 403);
  const post = (headers: Record<string, string>, body = JSON.stringify({ visitorId: requestId })) =>
    new Request(`${env.APP_ORIGIN}/api/presence`, { method: 'POST', headers, body });
  assert.equal((await handleApi(post({ 'Content-Type': 'application/json' }), env, store)).status, 403);
  assert.equal((await handleApi(post({ Origin: env.APP_ORIGIN, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }), env, store)).status, 403);
  assert.equal((await handleApi(post({ Origin: env.APP_ORIGIN, 'Content-Type': 'text/plain' }), env, store)).status, 415);
  assert.equal((await handleApi(post({ Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' }, 'invalid json'), env, store)).status, 400);
  assert.equal((await handleApi(request('/api/presence', { visitorId: 'a'.repeat(2048) }), env, store)).status, 413);
  const get = await handleApi(request('/api/presence'), env, store);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('Allow'), 'POST');
  assert.equal(await store.presenceCount(requestId), 1);
});

test('D1 adapter runs the same atomic presence SQL, reports global scope and prunes expired rows', async (t) => {
  const { store, database } = d1StoreFor(t);
  const responses = await Promise.all(Array.from({ length: 6 }, () =>
    handleApi(request('/api/presence', { visitorId: requestId }), env, store)));
  for (const response of responses) assert.deepEqual(await response.json(), { online: 1, scope: 'global' });
  const last = Number(database.prepare('SELECT last_seen FROM visitor_presence WHERE id = ?').get(requestId)!.last_seen);
  assert.equal(await store.presenceCount('b4444444-4444-4444-8444-444444444444', last + PRESENCE_TTL_MS), 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM visitor_presence').get()!.count, 1);
});

test('unavailable presence never returns fake counts and an additive schema repairs old databases', async (t) => {
  const unavailable = await handleApi(request('/api/presence', { visitorId: requestId }), env, new UnavailableStore());
  assert.equal(unavailable.status, 503);
  assert.equal('online' in await unavailable.json(), false);
  const { store, database } = d1StoreFor(t);
  await store.visitorCount(requestId);
  database.exec('DROP TABLE visitor_presence');
  const missingSchema = await handleApi(request('/api/presence', { visitorId: requestId }), env, store);
  assert.equal(missingSchema.status, 503);
  assert.doesNotMatch(await missingSchema.text(), /no such table|visitor_presence|SQLITE/i);
  assert.deepEqual(await (await handleApi(request('/api/visitors'), env, store)).json(), { count: 1, scope: 'global' });
  database.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  assert.deepEqual(await (await handleApi(request('/api/presence', { visitorId: requestId }), env, store)).json(), { online: 1, scope: 'global' });
  assert.equal(await store.visitorCount(), 1);
});

test('unconfigured deployment quotes the real plan and never creates fake checkout', async (t) => {
  const store = new UnavailableStore();
  t.mock.method(globalThis, 'fetch', () => { throw new Error('No provider request expected'); });
  const info = await (await handleApi(request('/api/sponsorship'), {}, store)).json();
  assert.equal(info.available, false);
  assert.deepEqual(info.plan, { id: 'spotlight', name: 'Sponsored placement', days: 30, amount: 10000, currency: 'usd' });
  assert.deepEqual(info.sponsors, []);
  assert.equal((await handleApi(request('/api/visitors'), {}, store)).status, 503);
  assert.equal((await handleApi(request('/api/checkout', payload), {}, store)).status, 503);
  assert.deepEqual(await (await handleApi(request('/api/checkout-status?session_id=cs_test_unavailable123'), {}, store)).json(), { status: 'unavailable' });
});

test('checkout persists before Stripe, fixes amount on the server, and rejects client price tampering', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  for (const field of ['amount', 'price', 'currency', 'days']) {
    assert.equal((await handleApi(request('/api/checkout', { ...payload, [field]: 1 }), env, store)).status, 400);
  }
  assert.equal(mock.creates.length, 0);
  const result = await makeCheckout(store);
  assert.match(result.url, /^https:\/\/checkout\.stripe\.com\//);
  const { params, key } = mock.creates[0];
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '10000');
  assert.equal(params.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('success_url'), `${env.APP_ORIGIN}/?sponsorship=success&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(key, `nodoku-sponsor-${requestId}`);
  assert.equal((await store.getOrder(requestId))!.status, 'pending');
  assert.deepEqual(await store.activeSponsors(new Date().toISOString()), []);
});

test('same request ID reuses checkout and changed payload conflicts, including concurrent starts', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  const [a, b] = await Promise.all([makeCheckout(store), makeCheckout(store)]);
  assert.deepEqual(a, b);
  assert.equal(mock.sessions.size, 1);
  assert.deepEqual(await makeCheckout(store), a);
  const changed = await handleApi(request('/api/checkout', { ...payload, brand: 'Another brand' }), env, store);
  assert.equal(changed.status, 409);
  assert.equal(mock.sessions.size, 1);
});

test('failed Stripe calls preserve retryable orders and never disclose provider secrets', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  mock.rejectCreate();
  const failed = await handleApi(request('/api/checkout', payload), env, store);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /sk_test|private|provider error/i);
  const token = (await store.getOrder(requestId))!.token;
  await makeCheckout(store);
  assert.equal((await store.getOrder(requestId))!.token, token);
  assert.equal(mock.creates[0].key, mock.creates[1].key);
});

test('only a Stripe-confirmed expired checkout advertises a safe new-request action', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await makeCheckout(store);
  const session = [...mock.sessions.values()][0];
  session.status = 'expired';
  const expired = await handleApi(request('/api/checkout', payload), env, store);
  assert.equal(expired.status, 409);
  assert.equal((await expired.json()).code, 'checkout_expired');
  session.status = 'complete'; session.payment_status = 'paid';
  const paid = await handleApi(request('/api/checkout', payload), env, store);
  assert.equal((await paid.json()).code, 'checkout_paid');
  session.payment_status = 'unpaid';
  const uncertain = await handleApi(request('/api/checkout', payload), env, store);
  assert.equal((await uncertain.json()).code, 'checkout_unavailable');
});

test('paid signed webhook publishes once and duplicate/out-of-order delivery cannot extend dates', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await makeCheckout(store);
  const session = [...mock.sessions.values()][0];
  session.status = 'complete'; session.payment_status = 'paid';
  const first = await handleApi(signedWebhook(session), env, store);
  assert.equal(first.status, 200);
  const paid = (await store.getOrder(requestId))!;
  assert.equal(paid.status, 'paid');
  assert.equal(Date.parse(paid.endsAt!) - Date.parse(paid.paidAt!), 30 * 86400000);
  await Promise.all(Array.from({ length: 5 }, () => handleApi(signedWebhook(session, 'checkout.session.async_payment_succeeded'), env, store)));
  await handleApi(signedWebhook(session, 'checkout.session.expired'), env, store);
  assert.equal((await store.getOrder(requestId))!.endsAt, paid.endsAt);
  const info = await (await handleApi(request('/api/sponsorship'), env, store)).json();
  assert.equal(info.available, true);
  assert.deepEqual(info.sponsors, [{ id: requestId, brand: payload.brand, tagline: payload.tagline, url: payload.url, endsAt: paid.endsAt }]);
});

test('webhook requires the unchanged raw body and a valid signature', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await makeCheckout(store);
  const session = [...mock.sessions.values()][0];
  session.status = 'complete'; session.payment_status = 'paid';
  assert.equal((await handleApi(signedWebhook(session, 'checkout.session.completed', true), env, store)).status, 400);
  assert.equal((await handleApi(request('/api/stripe-webhook', { fake: true }), env, store)).status, 400);
  assert.equal((await store.getOrder(requestId))!.status, 'pending');
});

test('unpaid sessions and mismatched amount, currency, price, quantity, or ownership never publish', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await makeCheckout(store);
  const session = [...mock.sessions.values()][0];
  await handleApi(signedWebhook(session), env, store);
  assert.equal((await store.getOrder(requestId))!.status, 'pending');
  session.status = 'complete'; session.payment_status = 'paid';
  const original = structuredClone(session);
  const mutations: ((value: FakeSession) => void)[] = [
    (s) => { s.amount_total = 1; }, (s) => { s.currency = 'eur'; },
    (s) => { s.line_items.data[0].price.id = 'price_wrong'; },
    (s) => { s.line_items.data[0].price.unit_amount = 1; },
    (s) => { s.line_items.data[0].quantity = 2; },
    (s) => { s.metadata.order_token = 'wrong'; },
    (s) => { s.client_reference_id = 'wrong'; },
  ];
  for (const mutate of mutations) {
    Object.assign(session, structuredClone(original)); mutate(session);
    assert.equal((await handleApi(signedWebhook(session), env, store)).status, 200);
    assert.equal((await store.getOrder(requestId))!.status, 'pending');
  }
  assert.deepEqual(await store.activeSponsors(new Date().toISOString()), []);
});

test('checkout status verifies Stripe and can recover fulfillment without trusting success query text', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await makeCheckout(store);
  const session = [...mock.sessions.values()][0];
  const path = `/api/checkout-status?session_id=${session.id}&sponsorship=success`;
  assert.deepEqual(await (await handleApi(request(path), env, store)).json(), { status: 'pending' });
  session.status = 'expired';
  assert.deepEqual(await (await handleApi(request(path), env, store)).json(), { status: 'expired' });
  session.status = 'complete'; session.payment_status = 'paid';
  const paid = await (await handleApi(request(path), env, store)).json();
  assert.equal(paid.status, 'paid');
  assert.equal(paid.brand, payload.brand);
  assert.deepEqual(Object.keys(paid).sort(), ['brand', 'endsAt', 'status']);
  mock.sessions.delete(session.id);
  assert.deepEqual(await (await handleApi(request(path), env, store)).json(), paid, 'Persisted webhook result survives provider unavailability');
  assert.deepEqual(await (await handleApi(request('/api/checkout-status?session_id=cs_test_unknown123'), env, store)).json(), { status: 'unavailable' });
});

test('lost session-binding response is recoverable only with the persisted order token', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  const originalBind = store.bindSession.bind(store);
  t.mock.method(store, 'bindSession', async () => false);
  assert.equal((await handleApi(request('/api/checkout', payload), env, store)).status, 503);
  assert.equal((await store.getOrder(requestId))!.sessionId, undefined);
  t.mock.method(store, 'bindSession', originalBind);
  const session = [...mock.sessions.values()][0];
  session.status = 'complete'; session.payment_status = 'paid';
  assert.equal((await handleApi(signedWebhook(session), env, store)).status, 200);
  assert.equal((await store.getOrder(requestId))!.status, 'paid');
});

test('optional Stripe Price must match the fixed active one-time $100 USD plan', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  const configured = { ...env, STRIPE_SPONSOR_PRICE_ID: 'price_configured' };
  for (const price of [{ active: false }, { active: true, unit_amount: 1 }, { unit_amount: 10000, currency: 'eur' }, { currency: 'usd', type: 'recurring' }]) {
    mock.setPrice(price);
    assert.equal((await handleApi(request('/api/checkout', payload), configured, store)).status, 503);
  }
  mock.setPrice({ type: 'one_time' });
  assert.equal((await handleApi(request('/api/checkout', payload), configured, store)).status, 200);
  assert.equal(mock.creates[0].params.get('line_items[0][price]'), 'price_configured');
});

test('method, origin, input, URL and body-size validation runs before checkout creation', async (t) => {
  const store = storeFor(t), mock = stripeMock(t, store);
  assert.equal((await handleApi(request('/api/checkout'), env, store)).status, 405);
  assert.equal((await handleApi(request('/api/checkout', payload, 'https://evil.example'), env, store)).status, 403);
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://private.local', 'javascript:alert(1)']) {
    assert.equal((await handleApi(request('/api/checkout', { ...payload, url }), env, store)).status, 400);
  }
  for (const body of [{ ...payload, brand: 'x'.repeat(61) }, { ...payload, tagline: 'x'.repeat(121) }, { ...payload, brand: '\u0000' }, { ...payload, requestId: 'no' }, []]) {
    assert.equal((await handleApi(request('/api/checkout', body), env, store)).status, 400);
  }
  assert.equal((await handleApi(request('/api/checkout', { ...payload, brand: 'x'.repeat(9000) }), env, store)).status, 413);
  assert.equal(mock.creates.length, 0);
  assert.equal((await handleApi(request('/api/unknown'), env, store)).status, 404);
});

test('local visitors and campaigns survive reopening; expired ads vanish and fulfillment is atomic', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nodoku-store-'));
  const path = join(dir, 'local.sqlite');
  const order: Order = {
    id: requestId, fingerprint: 'payload', token: 'secret-token', brand: 'Acme', tagline: 'Tools', url: 'https://example.com/',
    amount: 10000, currency: 'usd', days: 30, createdAt: '2026-01-01T00:00:00.000Z', priceId: null, status: 'pending',
  };
  let store = new LocalStore(path);
  try {
    await store.visitorCount(requestId);
    await store.createOrder(order);
    await store.bindSession(order.id, 'cs_test_durable123', 'https://checkout.stripe.com/c/pay/durable', 'price_durable');
    await Promise.all([
      store.fulfill(order.id, 'cs_test_durable123', '2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z'),
      store.fulfill(order.id, 'cs_test_durable123', '2026-01-02T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
    ]);
    store.close(); store = new LocalStore(path);
    assert.equal(await store.visitorCount(requestId), 1);
    assert.equal((await store.getOrder(order.id))!.endsAt, '2026-01-31T00:00:00.000Z');
    assert.equal((await store.activeSponsors('2026-01-15T00:00:00.000Z')).length, 1);
    assert.deepEqual(await store.activeSponsors('2026-01-31T00:00:00.000Z'), []);
    assert.equal(await store.bindSession(order.id, 'cs_test_wrong123', '', 'price_durable'), false);
    assert.equal(await store.fulfill(order.id, 'cs_test_wrong123', '', ''), null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('sponsor response samples at most20 currently active paid placements', async (t) => {
  const store = storeFor(t);
  for (let index = 0; index < 25; index++) {
    const id = crypto.randomUUID();
    await store.createOrder({
      id, fingerprint: id, token: crypto.randomUUID(), brand: `Sponsor ${index}`, tagline: 'Tools', url: 'https://example.com/',
      amount: 10000, currency: 'usd', days: 30, createdAt: '2026-01-01T00:00:00.000Z', priceId: null, status: 'pending',
    });
    await store.bindSession(id, `cs_test_sample${index}`, '', `price_${index}`);
    await store.fulfill(id, `cs_test_sample${index}`, '2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z');
  }
  const sponsors = await store.activeSponsors('2026-01-15T00:00:00.000Z');
  assert.equal(sponsors.length, 20);
  assert.equal(new Set(sponsors.map((sponsor) => sponsor.id)).size, 20);
  assert.ok(sponsors.every((sponsor) => sponsor.endsAt === '2026-01-31T00:00:00.000Z'));
  assert.deepEqual(await store.activeSponsors('2026-01-31T00:00:00.000Z'), []);
});
