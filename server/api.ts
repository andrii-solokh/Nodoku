import Stripe from 'stripe';
import type { Order, Store } from './store.js';
import type { StatisticsPeriod } from './statistics.js';
import { Puzzle } from '../src/puzzle.js';
import { capturePostHog } from './posthog.js';

type Env = Record<string, string | undefined>;
const PLAN = { id: 'spotlight', name: 'Sponsored placement', days: 30, amount: 10000, currency: 'usd' } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^cs_(?:test_|live_)?[A-Za-z0-9]{8,240}$/;
const DAY = 86400000;
type OrderKind = 'sponsor' | 'ad_free';

function statisticsPeriod(value: unknown): StatisticsPeriod {
  if (value === undefined || value === null) return '30d';
  if (value === 'today' || value === '7d' || value === '30d' || value === 'all') return value;
  throw new ApiError(400, 'Invalid statistics period.');
}

function visitorId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, 'Invalid visitor ID.');
  return value.toLowerCase();
}

async function statisticsStore(store: Store): Promise<void> {
  if (!store.persistent || !await store.health()) throw new ApiError(503, 'Statistics are unavailable.');
}

function adFreeAmount(env: Env): number | null {
  const value = env.REMOVE_ADS_AMOUNT ?? '';
  if (!/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 50 && amount <= 99999999 ? amount : null;
}

class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
  });
}

function appOrigin(env: Env): string | null {
  try {
    const url = new URL(env.APP_ORIGIN ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function configuration(env: Env, store: Store): boolean {
  return store.persistent && !!appOrigin(env)
    && /^(?:sk|rk)_(?:test|live)_/.test(env.STRIPE_SECRET_KEY ?? '')
    && /^whsec_/.test(env.STRIPE_WEBHOOK_SECRET ?? '');
}

function stripeClient(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 1, timeout: 15000,
  });
}

function checkOrigin(request: Request, env: Env): void {
  const expected = appOrigin(env) ?? new URL(request.url).origin;
  if (request.headers.get('Origin') !== expected || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new ApiError(403, 'This request must come from Nodoku.');
  }
}

async function bodyText(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new ApiError(413, 'Request body is too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new ApiError(413, 'Request body is too large.'); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ApiError(400, 'Invalid request encoding.'); }
}

async function bodyJson(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new ApiError(415, 'Send an application/json request.');
  try {
    const value = JSON.parse(await bodyText(request, limit));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Invalid JSON request.');
  }
}

function textField(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new ApiError(400, `Invalid ${name}.`);
  return value.trim();
}

function sponsorUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new ApiError(400, 'Use a public HTTPS website.');
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !host.includes('.') || host.endsWith('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|lan)$/.test(host)) throw new Error();
    return url.href;
  } catch { throw new ApiError(400, 'Use a public HTTPS website.'); }
}

function checkoutPayload(body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !['planId', 'brand', 'tagline', 'url', 'requestId'].includes(key))) throw new ApiError(400, 'Unexpected checkout fields.');
  if (body.planId !== PLAN.id || typeof body.requestId !== 'string' || !UUID.test(body.requestId)) throw new ApiError(400, 'Invalid sponsorship request.');
  return {
    id: body.requestId.toLowerCase(), brand: textField(body.brand, 60, 'brand'),
    tagline: textField(body.tagline, 120, 'tagline'), url: sponsorUrl(body.url),
  };
}

function adFreePayload(body: Record<string, unknown>) {
  if (Object.keys(body).length !== 1 || typeof body.requestId !== 'string' || !UUID.test(body.requestId)) throw new ApiError(400, 'Invalid ad removal request.');
  return { id: body.requestId.toLowerCase(), brand: '', tagline: '', url: '' };
}

async function priceForCheckout(stripe: Stripe, env: Env): Promise<string | null> {
  if (!env.STRIPE_SPONSOR_PRICE_ID) return null;
  const price = await stripe.prices.retrieve(env.STRIPE_SPONSOR_PRICE_ID);
  if (!price.active || price.type !== 'one_time' || price.unit_amount !== PLAN.amount || price.currency !== PLAN.currency) throw new ApiError(503, 'Sponsorship checkout is temporarily unavailable.');
  return price.id;
}

function checkoutLink(value: string | null): string | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function validSession(session: Stripe.Checkout.Session, order: Order): string | null {
  const lines = session.line_items;
  const line = lines?.data[0];
  const price = line?.price;
  if (session.client_reference_id !== order.id || session.metadata?.order_id !== order.id || session.metadata?.order_token !== order.token
    || session.mode !== 'payment' || session.amount_total !== order.amount || session.currency !== order.currency
    || (order.sessionId && session.id !== order.sessionId)
    || !lines || lines.has_more || lines.data.length !== 1 || line?.quantity !== 1
    || line.amount_total !== order.amount || !price || price.unit_amount !== order.amount || price.currency !== order.currency
    || price.type !== 'one_time' || (order.priceId && price.id !== order.priceId)) return null;
  return price.id;
}

async function verifySession(stripe: Stripe, store: Store, sessionId: string): Promise<{ order: Order; session: Stripe.Checkout.Session } | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price'] });
  const id = session.metadata?.order_id;
  if (!id || !UUID.test(id)) return null;
  let order = await store.getOrder(id);
  if (!order) return null;
  const priceId = validSession(session, order);
  if (!priceId) return null;
  // Recover the rare case where Stripe succeeded but the response/binding was lost.
  // The stored random token and server-fetched line item bind it to this exact order.
  if (!order.sessionId) {
    if (!await store.bindSession(order.id, session.id, checkoutLink(session.url) ?? '', priceId)) return null;
    order = (await store.getOrder(order.id))!;
  }
  if (session.payment_status === 'paid' && session.status === 'complete') {
    const paidAt = new Date().toISOString();
    const endsAt = new Date(Date.parse(paidAt) + order.days * DAY).toISOString();
    order = await store.fulfill(order.id, session.id, paidAt, endsAt) ?? order;
  }
  return { order, session };
}

async function checkout(request: Request, env: Env, store: Store, kind: OrderKind = 'sponsor'): Promise<Response> {
  checkOrigin(request, env);
  const body = await bodyJson(request, 8192);
  const payload = kind === 'ad_free' ? adFreePayload(body) : checkoutPayload(body);
  const amount = kind === 'ad_free' ? adFreeAmount(env) : PLAN.amount;
  if (amount === null || !configuration(env, store) || !await store.health()) throw new ApiError(503, 'Checkout is not configured yet.');
  const stripe = stripeClient(env);
  const fingerprint = kind === 'ad_free' ? JSON.stringify({ kind }) : JSON.stringify({ brand: payload.brand, tagline: payload.tagline, url: payload.url, planId: PLAN.id });
  let order = await store.getOrder(payload.id);
  if (order && (order.fingerprint !== fingerprint || (order.kind ?? 'sponsor') !== kind)) throw new ApiError(409, 'This request ID was already used for another purchase.');
  if (!order) {
    const priceId = kind === 'sponsor' ? await priceForCheckout(stripe, env) : null;
    order = await store.createOrder({
      ...payload, kind, fingerprint, token: crypto.randomUUID(), amount,
      currency: PLAN.currency, days: kind === 'ad_free' ? 0 : PLAN.days, createdAt: new Date().toISOString(), priceId, status: 'pending',
    });
    if (order.fingerprint !== fingerprint || (order.kind ?? 'sponsor') !== kind) throw new ApiError(409, 'This request ID was already used for another purchase.');
  }
  if (order.status === 'paid') throw new ApiError(409, 'This purchase has already been paid.', 'checkout_paid');
  if (order.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(order.sessionId);
    if (session.status === 'expired') throw new ApiError(409, 'This checkout expired. You can start a new purchase request.', 'checkout_expired');
    if (session.payment_status === 'paid') throw new ApiError(409, 'This purchase has already been paid.', 'checkout_paid');
    if (session.status !== 'open' || !checkoutLink(session.url)) throw new ApiError(409, 'This checkout is no longer open. Its payment status could not be confirmed.', 'checkout_unavailable');
    return json({ url: checkoutLink(session.url) });
  }
  // Stripe keeps idempotency keys for at least 24 hours. Never recreate an old uncertain payment.
  if (Date.now() - Date.parse(order.createdAt) >= 23 * 60 * 60 * 1000) throw new ApiError(409, 'This checkout could not be confirmed. Please contact the site owner.', 'checkout_unavailable');
  const origin = appOrigin(env)!;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', payment_method_types: ['card'], client_reference_id: order.id,
    metadata: { order_id: order.id, order_token: order.token, order_kind: kind },
    line_items: [{ quantity: 1, ...(order.priceId ? { price: order.priceId } : { price_data: {
      currency: order.currency, unit_amount: order.amount,
      product_data: { name: kind === 'ad_free' ? 'Nodoku — permanent ad removal' : 'Nodoku sponsorship — 30 days' },
    } }) }],
    success_url: `${origin}/?${kind === 'ad_free' ? 'ad_free' : 'sponsorship'}=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?${kind === 'ad_free' ? 'ad_free' : 'sponsorship'}=cancelled`,
    expand: ['line_items.data.price'],
  }, { idempotencyKey: `nodoku-${kind === 'ad_free' ? 'ad-free' : 'sponsor'}-${order.id}` });
  const url = checkoutLink(session.url);
  const priceId = validSession(session, order);
  if (!url || !priceId || !await store.bindSession(order.id, session.id, url, priceId)) throw new ApiError(503, 'Checkout could not be confirmed. Retry with the same request.');
  return json({ url });
}

async function checkoutStatus(request: Request, env: Env, store: Store, kind: OrderKind = 'sponsor'): Promise<Response> {
  const id = new URL(request.url).searchParams.get('session_id');
  if (!id || !SESSION.test(id)) throw new ApiError(400, 'Invalid checkout session.');
  if (!store.persistent || !await store.health()) return json({ status: 'unavailable' });
  const paid = (order: Order) => kind === 'ad_free'
    ? json({ status: 'paid', receipt: order.sessionId })
    : json({ status: 'paid', brand: order.brand, endsAt: order.endsAt });
  try {
    const stored = await store.getOrderBySession(id);
    if (stored && (stored.kind ?? 'sponsor') !== kind) return json({ status: 'unavailable' });
    if (stored?.status === 'paid') return paid(stored);
    if (!configuration(env, store)) return json({ status: 'unavailable' });
    const verified = await verifySession(stripeClient(env), store, id);
    if (!verified || (verified.order.kind ?? 'sponsor') !== kind) return json({ status: 'unavailable' });
    if (verified.order.status === 'paid') return paid(verified.order);
    return json({ status: verified.session.status === 'expired' ? 'expired' : 'pending' });
  } catch (error) {
    return json({ status: 'unavailable' }, error instanceof Stripe.errors.StripeInvalidRequestError ? 200 : 503);
  }
}

async function adFreeEntitlement(request: Request, env: Env, store: Store): Promise<Response> {
  checkOrigin(request, env);
  const body = await bodyJson(request, 1024);
  if (Object.keys(body).length !== 1 || typeof body.receipt !== 'string' || !SESSION.test(body.receipt)) throw new ApiError(400, 'Invalid ad removal receipt.');
  if (!store.persistent || !await store.health()) return json({ status: 'unavailable' });
  const order = await store.getOrderBySession(body.receipt);
  // No provider request or expiration: only server-verified permanent purchases qualify.
  return json({ status: order?.kind === 'ad_free' && order.status === 'paid' ? 'paid' : 'unavailable' });
}

async function webhook(request: Request, env: Env, store: Store): Promise<Response> {
  if (!configuration(env, store) || !await store.health()) throw new ApiError(503, 'Payment processing is temporarily unavailable.');
  const signature = request.headers.get('Stripe-Signature');
  if (!signature) throw new ApiError(400, 'Missing webhook signature.');
  const stripe = stripeClient(env);
  const body = await bodyText(request, 262144);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET!, undefined, Stripe.createSubtleCryptoProvider());
  } catch { throw new ApiError(400, 'Invalid webhook signature.'); }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === 'paid' && SESSION.test(session.id)) await verifySession(stripe, store, session.id);
  }
  return json({ received: true });
}

/** Fetch-compatible API shared by Vite development and Cloudflare Pages Functions. */
export async function handleApi(request: Request, env: Env, store: Store): Promise<Response> {
  const path = new URL(request.url).pathname;
  const allowed: Record<string, string[]> = {
    '/api/visitors': ['GET', 'POST'], '/api/presence': ['POST'], '/api/sponsorship': ['GET'], '/api/checkout': ['POST'],
    '/api/statistics': ['GET'], '/api/analytics-config': ['GET'], '/api/completions': ['POST'], '/api/sponsor-events': ['POST'], '/api/sponsor-report': ['POST'],
    '/api/checkout-status': ['GET'], '/api/stripe-webhook': ['POST'],
    '/api/ad-free/checkout': ['POST'], '/api/ad-free/status': ['GET'], '/api/ad-free/entitlement': ['POST'],
  };
  if (!allowed[path]) return json({ error: 'Not found.' }, 404);
  if (!allowed[path].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { Allow: allowed[path].join(', ') });
  try {
    if (path === '/api/visitors') {
      if (!store.persistent || !await store.health()) throw new ApiError(503, 'Visitor count is unavailable.');
      let visitorId: string | undefined;
      if (request.method === 'POST') {
        checkOrigin(request, env);
        const body = await bodyJson(request, 1024);
        if (Object.keys(body).some((key) => key !== 'visitorId') || typeof body.visitorId !== 'string' || !UUID.test(body.visitorId)) throw new ApiError(400, 'Invalid visitor ID.');
        visitorId = body.visitorId.toLowerCase();
      }
      return json({ count: await store.visitorCount(visitorId), scope: store.scope });
    }
    if (path === '/api/presence') {
      checkOrigin(request, env);
      const body = await bodyJson(request, 1024);
      if (Object.keys(body).some((key) => key !== 'visitorId') || typeof body.visitorId !== 'string' || !UUID.test(body.visitorId)) throw new ApiError(400, 'Invalid visitor ID.');
      if (!store.persistent || !await store.health()) throw new ApiError(503, 'Online count is unavailable.');
      return json({ online: await store.presenceCount(body.visitorId.toLowerCase()), scope: store.scope });
    }
    if (path === '/api/statistics') {
      const period = statisticsPeriod(new URL(request.url).searchParams.get('period'));
      await statisticsStore(store);
      return json(await store.statistics(period));
    }
    if (path === '/api/analytics-config') {
      const projectApiKey = env.POSTHOG_PROJECT_API_KEY;
      return json(projectApiKey ? { projectApiKey, apiHost: 'https://us.i.posthog.com' } : { projectApiKey: null });
    }
    if (path === '/api/completions') {
      checkOrigin(request, env);
      const body = await bodyJson(request, 262144);
      if (Object.keys(body).some(key => !['visitorId', 'attemptId', 'game'].includes(key)) || typeof body.attemptId !== 'string' || !UUID.test(body.attemptId)) throw new ApiError(400, 'Invalid completion.');
      const id = visitorId(body.visitorId);
      const puzzle = Puzzle.restore(body.game);
      if (!puzzle?.solved) throw new ApiError(400, 'A completed puzzle is required.');
      await statisticsStore(store);
      const { size, depth, difficulty, seed } = puzzle.settings;
      const recorded = await store.recordCompletion({
        visitorId: id, attemptId: body.attemptId.toLowerCase(), size, depth, difficulty, seed,
        connections: puzzle.edges.length, dots: puzzle.nodes.reduce((sum, node) => sum + node.required, 0),
      });
      if (recorded) await capturePostHog(env, 'puzzle_completed', id, {
        grid_size: size,
        depth,
        perspective: depth === 1 ? 'flat' : '3d',
        difficulty,
        connection_count: puzzle.edges.length,
        dot_count: puzzle.nodes.reduce((sum, node) => sum + node.required, 0),
      });
      return json({ recorded });
    }
    if (path === '/api/sponsor-events') {
      checkOrigin(request, env);
      const body = await bodyJson(request, 1024);
      if (Object.keys(body).some(key => !['visitorId', 'sponsorId', 'kind'].includes(key)) || typeof body.sponsorId !== 'string' || !UUID.test(body.sponsorId) || (body.kind !== 'view' && body.kind !== 'click')) throw new ApiError(400, 'Invalid sponsor event.');
      const id = visitorId(body.visitorId);
      await statisticsStore(store);
      const result = await store.recordSponsorEvent(id, body.sponsorId.toLowerCase(), body.kind);
      if (result === 'unavailable') throw new ApiError(404, 'This sponsorship is not active.');
      if (result === 'view-required') throw new ApiError(409, 'Record a sponsor view before its click.');
      return json({ recorded: result === 'recorded' });
    }
    if (path === '/api/sponsor-report') {
      checkOrigin(request, env);
      const body = await bodyJson(request, 1024);
      if (Object.keys(body).some(key => !['receipt', 'period'].includes(key)) || typeof body.receipt !== 'string' || !SESSION.test(body.receipt)) throw new ApiError(400, 'Invalid sponsorship receipt.');
      const period = statisticsPeriod(body.period);
      await statisticsStore(store);
      const report = await store.sponsorReport(body.receipt, period);
      if (!report) throw new ApiError(404, 'Sponsorship report is unavailable.');
      return json(report);
    }
    if (path === '/api/sponsorship') {
      const healthy = store.persistent && await store.health();
      let available = healthy && configuration(env, store);
      if (available && env.STRIPE_SPONSOR_PRICE_ID) {
        try { await priceForCheckout(stripeClient(env), env); } catch { available = false; }
      }
      const amount = adFreeAmount(env);
      return json({ available, plan: PLAN, adFree: { amount, currency: 'usd', available: amount !== null && healthy && configuration(env, store) }, sponsors: healthy ? await store.activeSponsors(new Date().toISOString()) : [],
        ...(!available ? { message: 'Sponsorship checkout is not configured yet.' } : {}) });
    }
    if (path === '/api/checkout') return await checkout(request, env, store);
    if (path === '/api/checkout-status') return await checkoutStatus(request, env, store);
    if (path === '/api/ad-free/checkout') return await checkout(request, env, store, 'ad_free');
    if (path === '/api/ad-free/status') return await checkoutStatus(request, env, store, 'ad_free');
    if (path === '/api/ad-free/entitlement') return await adFreeEntitlement(request, env, store);
    return await webhook(request, env, store);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
    // Provider/storage details may contain credentials or personal payment data.
    return json({ error: 'This service is temporarily unavailable. Please try again.' }, 503);
  }
}
