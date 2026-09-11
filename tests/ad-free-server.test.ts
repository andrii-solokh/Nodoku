import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import Stripe from 'stripe';
import { handleApi } from '../server/api.ts';
import { LocalStore } from '../server/local-store.ts';
import { UnavailableStore } from '../server/store.ts';

const env = { APP_ORIGIN: 'http://localhost:5173', STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_WEBHOOK_SECRET: 'whsec_mock', REMOVE_ADS_AMOUNT: '500' };
const requestId = 'a4444444-4444-4444-8444-444444444444';
const sponsorPayload = { requestId, planId: 'spotlight', brand: 'Acme', tagline: 'Useful tools.', url: 'https://example.com/' };
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
function sessionFrom(params: URLSearchParams, index: number) {
  const amount = Number(params.get('line_items[0][price_data][unit_amount]'));
  return {
    id: `cs_test_adfree${index.toString().padStart(8, '0')}`, object: 'checkout.session',
    client_reference_id: params.get('client_reference_id'),
    metadata: { order_id: params.get('metadata[order_id]'), order_token: params.get('metadata[order_token]') },
    mode: 'payment', amount_total: amount, currency: 'usd', payment_status: 'unpaid', status: 'open',
    url: `https://checkout.stripe.com/c/pay/session${index}`,
    line_items: { object: 'list', has_more: false, data: [{ quantity: 1, amount_total: amount,
      price: { id: `price_inline${index}`, unit_amount: amount, currency: 'usd', type: 'one_time', active: true },
    }] },
  };
}
type FakeSession = ReturnType<typeof sessionFrom>;
function stripeMock(t: TestContext, store: LocalStore) {
  const sessions = new Map<string, FakeSession>();
  const byKey = new Map<string, FakeSession>();
  const creates: { params: URLSearchParams; key: string }[] = [];
  let reads = 0, failNext = false;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'api.stripe.com', 'No real network calls');
    const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Request-Id': 'req_mock' } });
    if (url.pathname === '/v1/checkout/sessions' && init?.method === 'POST') {
      const params = new URLSearchParams(String(init.body));
      const key = new Headers(init.headers).get('Idempotency-Key')!;
      creates.push({ params, key });
      assert.ok(await store.getOrder(params.get('client_reference_id')!), 'Order stored before checkout');
      if (failNext) { failNext = false; return respond({ error: { type: 'invalid_request_error', message: 'private sk_test_mock' } }, 400); }
      let session = byKey.get(key);
      if (!session) { session = sessionFrom(params, sessions.size + 1); sessions.set(session.id, session); byKey.set(key, session); }
      return respond(session);
    }
    reads++;
    const session = sessions.get(url.pathname.split('/').pop()!);
    return session ? respond(session) : respond({ error: { type: 'invalid_request_error', message: 'No such checkout session' } }, 404);
  });
  return { sessions, creates, reads: () => reads, failCreate: () => { failNext = true; } };
}
async function checkout(store: LocalStore, configuration = env) {
  const result = await handleApi(request('/api/ad-free/checkout', { requestId }), configuration, store);
  assert.equal(result.status, 200, await result.clone().text());
  return result.json();
}
function webhook(session: FakeSession, type = 'checkout.session.completed', corrupt = false): Request {
  const body = JSON.stringify({ id: 'evt_adfree', object: 'event', type, data: { object: session } });
  const signature = new Stripe(env.STRIPE_SECRET_KEY).webhooks.generateTestHeaderString({ payload: body, secret: env.STRIPE_WEBHOOK_SECRET });
  return new Request(`${env.APP_ORIGIN}/api/stripe-webhook`, { method: 'POST', headers: { 'Stripe-Signature': signature }, body: body + (corrupt ? ' ' : '') });
}
const status = (session: FakeSession) => request(`/api/ad-free/status?session_id=${session.id}`);
const entitlement = (receipt: string) => request('/api/ad-free/entitlement', { receipt });

test('ad removal requires an explicit valid server price and durable configured storage', async t => {
  const store = storeFor(t);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('No Stripe request expected'); });
  for (const value of [undefined, '', '0', '-500', '49', '500.5', 'NaN', '1e3', '100000000']) {
    const config = { ...env, REMOVE_ADS_AMOUNT: value };
    const info = await (await handleApi(request('/api/sponsorship'), config, store)).json();
    assert.deepEqual(info.adFree, { amount: null, currency: 'usd', available: false });
    assert.equal((await handleApi(request('/api/ad-free/checkout', { requestId }), config, store)).status, 503);
  }
  const info = await (await handleApi(request('/api/sponsorship'), env, store)).json();
  assert.deepEqual(info.adFree, { amount: 500, currency: 'usd', available: true });
  assert.equal((await handleApi(request('/api/ad-free/checkout', { requestId }), env, new UnavailableStore())).status, 503);
});

test('checkout enforces same origin and server-owned one-time USD pricing', async t => {
  const store = storeFor(t), mock = stripeMock(t, store);
  for (const extra of [{ amount: 1 }, { currency: 'eur' }, { kind: 'sponsor' }, { receipt: 'fake' }]) {
    assert.equal((await handleApi(request('/api/ad-free/checkout', { requestId, ...extra }), env, store)).status, 400);
  }
  assert.equal((await handleApi(request('/api/ad-free/checkout', { requestId }, 'https://evil.example'), env, store)).status, 403);
  assert.equal((await handleApi(request('/api/ad-free/checkout', { requestId: 'bad' }), env, store)).status, 400);
  const result = await checkout(store);
  assert.match(result.url, /^https:\/\/checkout\.stripe\.com\//);
  const { params, key } = mock.creates[0];
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '500');
  assert.equal(params.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(params.get('success_url'), `${env.APP_ORIGIN}/?ad_free=success&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(params.get('cancel_url'), `${env.APP_ORIGIN}/?ad_free=cancelled`);
  assert.equal(key, `nodoku-ad-free-${requestId}`);
  assert.equal((await store.getOrder(requestId))!.kind, 'ad_free');
  assert.equal((await store.getOrder(requestId))!.status, 'pending');
});

test('retries and concurrent clicks reuse the saved order and idempotent checkout', async t => {
  const store = storeFor(t), mock = stripeMock(t, store);
  mock.failCreate();
  const failed = await handleApi(request('/api/ad-free/checkout', { requestId }), env, store);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /sk_test|private/);
  const token = (await store.getOrder(requestId))!.token;
  const [a, b] = await Promise.all([checkout(store), checkout(store)]);
  assert.deepEqual(a, b);
  assert.equal(mock.sessions.size, 1);
  assert.equal((await store.getOrder(requestId))!.token, token);
  assert.equal(new Set(mock.creates.map(item => item.key)).size, 1);
  assert.deepEqual(await checkout(store, { ...env, REMOVE_ADS_AMOUNT: '1000' }), a);
  assert.equal((await store.getOrder(requestId))!.amount, 500, 'Existing purchase keeps its original price');
  assert.equal((await handleApi(request('/api/checkout', sponsorPayload), env, store)).status, 409);
});

test('pending, expired, unknown and forged receipts never grant ad removal', async t => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await checkout(store);
  const session = [...mock.sessions.values()][0];
  assert.deepEqual(await (await handleApi(status(session), env, store)).json(), { status: 'pending' });
  assert.deepEqual(await (await handleApi(entitlement(session.id), env, store)).json(), { status: 'unavailable' });
  session.status = 'expired';
  assert.deepEqual(await (await handleApi(status(session), env, store)).json(), { status: 'expired' });
  const retry = await handleApi(request('/api/ad-free/checkout', { requestId }), env, store);
  assert.equal((await retry.json()).code, 'checkout_expired');
  assert.equal((await handleApi(entitlement('fake'), env, store)).status, 400);
  assert.deepEqual(await (await handleApi(entitlement('cs_test_unknown12345678'), env, store)).json(), { status: 'unavailable' });
  assert.equal((await handleApi(request('/api/ad-free/entitlement', { receipt: session.id }, 'https://evil.example'), env, store)).status, 403);
});

test('only verified paid sessions issue receipts; status recovers missed webhooks', async t => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await checkout(store);
  const session = [...mock.sessions.values()][0];
  session.status = 'complete'; session.payment_status = 'paid';
  const original = structuredClone(session);
  for (const mutate of [
    (s: FakeSession) => { s.amount_total = 1; },
    (s: FakeSession) => { s.currency = 'eur'; },
    (s: FakeSession) => { s.metadata.order_token = 'wrong'; },
    (s: FakeSession) => { s.line_items.data[0].quantity = 2; },
    (s: FakeSession) => { s.line_items.data[0].price.id = 'price_wrong'; },
    (s: FakeSession) => { s.line_items.data[0].price.type = 'recurring'; },
  ]) {
    Object.assign(session, structuredClone(original)); mutate(session);
    assert.deepEqual(await (await handleApi(status(session), env, store)).json(), { status: 'unavailable' });
    assert.equal((await store.getOrder(requestId))!.status, 'pending');
  }
  Object.assign(session, original);
  assert.deepEqual(await (await handleApi(status(session), env, store)).json(), { status: 'paid', receipt: session.id });
  assert.equal((await store.getOrder(requestId))!.status, 'paid');
  assert.deepEqual(await (await handleApi(request(`/api/checkout-status?session_id=${session.id}`), env, store)).json(), { status: 'unavailable' });
});

test('signed webhook grants a permanent entitlement without exposing a sponsor placement', async t => {
  const store = storeFor(t), mock = stripeMock(t, store);
  await checkout(store);
  const session = [...mock.sessions.values()][0];
  session.status = 'complete'; session.payment_status = 'paid';
  assert.equal((await handleApi(webhook(session, 'checkout.session.completed', true), env, store)).status, 400);
  assert.equal((await store.getOrder(requestId))!.status, 'pending');
  assert.equal((await handleApi(webhook(session), env, store)).status, 200);
  const paid = (await store.getOrder(requestId))!;
  await Promise.all(Array.from({ length: 3 }, () => handleApi(webhook(session, 'checkout.session.async_payment_succeeded'), env, store)));
  assert.equal((await store.getOrder(requestId))!.paidAt, paid.paidAt);
  const reads = mock.reads();
  const withoutStripe = { APP_ORIGIN: env.APP_ORIGIN };
  assert.deepEqual(await (await handleApi(entitlement(session.id), withoutStripe, store)).json(), { status: 'paid' });
  assert.deepEqual(await (await handleApi(status(session), withoutStripe, store)).json(), { status: 'paid', receipt: session.id });
  assert.equal(mock.reads(), reads, 'Stored entitlement does not call Stripe');
  assert.deepEqual(await store.activeSponsors('2000-01-01T00:00:00.000Z'), [], 'Even future ends_at cannot expose an ad-free order as a sponsor');
  const info = await (await handleApi(request('/api/sponsorship'), env, store)).json();
  assert.deepEqual(info.sponsors, []);
  assert.ok(!JSON.stringify(info).includes(session.id));
});

test('sponsorship purchases cannot be restored or reported as ad removal', async t => {
  const store = storeFor(t), mock = stripeMock(t, store);
  assert.equal((await handleApi(request('/api/checkout', sponsorPayload), env, store)).status, 200);
  const session = [...mock.sessions.values()][0];
  session.status = 'complete'; session.payment_status = 'paid';
  await handleApi(webhook(session), env, store);
  assert.deepEqual(await (await handleApi(entitlement(session.id), env, store)).json(), { status: 'unavailable' });
  assert.deepEqual(await (await handleApi(status(session), env, store)).json(), { status: 'unavailable' });
  assert.equal((await handleApi(request('/api/ad-free/checkout', { requestId }), env, store)).status, 409);
  assert.equal((await store.activeSponsors(new Date().toISOString())).length, 1);
});

test('ad removal entitlement survives database reopening and does not expire', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'nodoku-ad-free-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'purchases.sqlite');
  let store = new LocalStore(path);
  t.after(() => store.close());
  await store.createOrder({ kind: 'ad_free', id: requestId, fingerprint: 'test', token: 'test', brand: '', tagline: '', url: '', amount: 500, currency: 'usd', days: 0, createdAt: '2000-01-01T00:00:00.000Z', priceId: null, status: 'pending' });
  const receipt = 'cs_test_durable12345678';
  await store.bindSession(requestId, receipt, '', 'price_verified');
  await store.fulfill(requestId, receipt, '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z');
  store.close(); store = new LocalStore(path);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Restoring must not contact Stripe'); });
  assert.deepEqual(await (await handleApi(entitlement(receipt), { APP_ORIGIN: env.APP_ORIGIN }, store)).json(), { status: 'paid' });
});
