import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { LocalStore } from '../server/local-store.ts';
import { handleApi } from '../server/api.ts';
import { verifyGoogleCredential, randomToken, tokenHash } from '../server/accounts-api.ts';
import { Puzzle } from '../src/puzzle.ts';

const origin = 'https://nodoku.solokh.com';
const clientId = '123-test.apps.googleusercontent.com';
const env = { APP_ORIGIN: origin, ACCOUNTS_ENABLED: 'true', GOOGLE_CLIENT_ID: clientId };
const settings = { size: 3, depth: 1, difficulty: 'easy' as const, seed: 17 };
const req = (path: string, value?: unknown, cookie = '', from = origin) => new Request(origin + path, {
  method: value === undefined ? 'GET' : 'POST',
  headers: { Origin: from, Cookie: cookie, 'Content-Type': 'application/json' },
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});
const puzzle = (seed = 17, depth = 1) => {
  const board = new Puzzle({ ...settings, seed, depth });
  for (const edge of board.solution) board.toggle(...edge);
  return board;
};

// Real cryptographic signatures exercise the same verifier used in production.
test('Google credentials require trusted signature, audience, issuer, expiry, nonce and authorized party', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (overrides: Record<string, unknown> = {}) => new SignJWT({ nonce: 'nonce', sub: 'google-player', aud: clientId,
    iss: 'https://accounts.google.com', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
  assert.deepEqual(await verifyGoogleCredential(await sign(), clientId, 'nonce', keys), { sub: 'google-player', nickname: undefined, avatarUrl: undefined });
  const profiles: [Record<string, unknown>, string | undefined][] = [
    [{ name: '  Mira   O’Connor ', given_name: 'Mira', email: 'other@example.com', email_verified: true }, "Mira O'Connor"],
    [{ name: 'Андрій Солох', given_name: 'Andrii' }, 'Андрій Солох'],
    [{ name: '李' }, '李'],
    [{ name: 'अनन्या' }, 'अनन्या'],
    [{ name: '   ', given_name: 'Mira' }, 'Mira'],
    [{ name: 42, email: 'mira.smith@example.com', email_verified: true }, 'mira.smith'],
    [{ email: 'unverified@example.com', email_verified: false }, undefined],
    [{ email: 'unverified@example.com', email_verified: 'true' }, undefined],
    [{ email: '@example.com', email_verified: true }, undefined],
    [{ name: '💜', given_name: {} }, undefined],
    [{ name: 'A'.repeat(40) }, 'A'.repeat(24)],
  ];
  for (const [claims, nickname] of profiles) {
    assert.deepEqual(await verifyGoogleCredential(await sign(claims), clientId, 'nonce', keys), { sub: 'google-player', nickname, avatarUrl: undefined });
  }
  const avatar = 'https://lh3.googleusercontent.com/a/test-photo';
  assert.equal((await verifyGoogleCredential(await sign({ picture: avatar }), clientId, 'nonce', keys)).avatarUrl, avatar);
  for (const picture of ['http://lh3.googleusercontent.com/a/photo', 'https://googleusercontent.com.evil.example/photo', 'javascript:alert(1)', 'https://user:pass@lh3.googleusercontent.com/photo', 42]) {
    assert.equal((await verifyGoogleCredential(await sign({ picture }), clientId, 'nonce', keys)).avatarUrl, undefined);
  }
  for (const override of [{ aud: 'other-client' }, { iss: 'https://evil.example' }, { nonce: 'other' }, { exp: 1 }, { sub: '' }, { azp: 'other-client' }, { iat: 1 }]) {
    await assert.rejects(verifyGoogleCredential(await sign(override), clientId, 'nonce', keys));
  }
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(other.privateKey);
  await assert.rejects(verifyGoogleCredential(forged, clientId, 'nonce', keys));
});

test('Google sign-in sets private session cookies, returns a stable account, and protects mutation routes', async t => {
  const store = new LocalStore(':memory:'); t.after(() => store.close());
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'api-test', alg: 'RS256' };
  t.mock.method(globalThis, 'fetch', async input => {
    assert.equal(String(input), 'https://www.googleapis.com/oauth2/v3/certs');
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
  });
  const login = async (name = 'Google Player', picture: string | undefined = 'https://lh3.googleusercontent.com/a/first') => {
    const challenge = await handleApi(req('/api/auth/challenge', {}), env, store);
    const nonce = (await challenge.json()).nonce;
    const cookie = challenge.headers.getSetCookie()[0].split(';')[0];
    const credential = await new SignJWT({ nonce, name, picture, email: 'private@example.com', email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: 'api-test' })
      .setSubject('same-google-user').setAudience(clientId).setIssuer('https://accounts.google.com').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    assert.equal((await handleApi(req('/api/auth/google', { credential }), env, store)).status, 401);
    const response = await handleApi(req('/api/auth/google', { credential }, cookie), env, store);
    assert.equal(response.status, 200, await response.clone().text());
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies[0], /__Host-nodoku_session=.*HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
    return { player: (await response.json()).player, cookie: cookies[0].split(';')[0] };
  };
  const first = await login(), second = await login();
  assert.equal(first.player.id, second.player.id);
  assert.equal('listed' in first.player, false, 'Accounts have no private-ranking state');
  assert.equal(first.player.nickname, 'Google Player');
  assert.equal(first.player.avatarUrl, 'https://lh3.googleusercontent.com/a/first');
  assert.equal((await (await handleApi(req('/api/auth/me', undefined, first.cookie), env, store)).json()).player.avatarUrl, first.player.avatarUrl);
  assert.doesNotMatch(JSON.stringify(first.player), /google_sub|email|same-google/);
  assert.equal((await (await handleApi(req('/api/auth/me', undefined, first.cookie), env, store)).json()).player.id, first.player.id);
  assert.equal((await handleApi(req('/api/auth/profile', { nickname: 'Player', listed: true }, first.cookie, 'https://evil.example'), env, store)).status, 403);
  assert.equal((await handleApi(req('/api/auth/profile', { nickname: '<script>', listed: true }, first.cookie), env, store)).status, 400);
  assert.equal((await handleApi(req('/api/auth/profile', { nickname: 'Mira' }, first.cookie), env, store)).status, 200);
  const returning = await login('Changed Google Name', 'https://lh3.googleusercontent.com/a/updated');
  assert.equal(returning.player.avatarUrl, 'https://lh3.googleusercontent.com/a/updated');
  assert.equal(returning.player.nickname, 'Mira', 'Repeat sign-in preserves the player’s saved nickname');
  assert.equal(returning.player.id, first.player.id, 'Profile changes do not change account identity');
  assert.equal((await handleApi(req('/api/auth/profile', { nickname: '李', listed: false }, returning.cookie), env, store)).status, 200);
  const withoutPicture = await login('Changed Google Name', 'invalid');
  assert.equal(withoutPicture.player.avatarUrl, undefined, 'Missing or invalid Google photos clear the old avatar');
  await handleApi(req('/api/auth/logout', {}, first.cookie), env, store);
  assert.equal((await (await handleApi(req('/api/auth/me', undefined, first.cookie), env, store)).json()).player, null);
  assert.equal((await handleApi(req('/api/auth/delete', { confirm: 'delete' }, second.cookie), env, store)).status, 200);
  assert.equal((await (await handleApi(req('/api/auth/me', undefined, second.cookie), env, store)).json()).player, null);
});

test('ranked solves require issued puzzle tickets and stay with their original account across retries', async t => {
  const store = new LocalStore(':memory:'); t.after(() => store.close());
  const aToken = randomToken(), bToken = randomToken();
  const a = await store.accounts.signIn('a', await tokenHash(aToken)), b = await store.accounts.signIn('b', await tokenHash(bToken));
  await store.accounts.profile(a.id, 'Ada'); await store.accounts.profile(b.id, 'Bea');
  const aCookie = `__Host-nodoku_session=${aToken}`, bCookie = `__Host-nodoku_session=${bToken}`;
  const getTicket = async (cookie: string, seed = 17) => {
    const response = await handleApi(req('/api/ranked-attempts', { settings: { ...settings, seed } }, cookie), env, store);
    assert.equal(response.status, 200); return (await response.json()).ticket;
  };
  assert.equal((await handleApi(req('/api/ranked-attempts', { settings }), env, store)).status, 401);
  assert.equal((await handleApi(req('/api/ranked-attempts', { settings: { ...settings, size: 2 } }, aCookie), env, store)).status, 400);
  const ticket = await getTicket(aCookie);
  const submit = (ticket: string, board = puzzle(), cookie = '') => handleApi(req('/api/completions', {
    visitorId: crypto.randomUUID(), attemptId: crypto.randomUUID(), game: board.serialize(), rankedTicket: ticket,
  }, cookie), env, store);
  const incomplete = puzzle(); incomplete.undo();
  assert.equal((await submit(ticket, incomplete)).status, 400);
  await submit(ticket, puzzle(18)); // A valid, different board cannot redeem the ticket.
  let ranks = await store.accounts.leaderboard({ period: 'all', perspective: 'all', size: null, difficulty: null }, a.id);
  assert.equal(ranks.me!.solved, 0);
  await Promise.all(Array.from({ length: 8 }, () => submit(ticket, puzzle(), bCookie)));
  ranks = await store.accounts.leaderboard({ period: 'all', perspective: 'all', size: null, difficulty: null }, a.id);
  assert.equal(ranks.me!.solved, 1);
  assert.equal(ranks.entries[0].id, a.id, 'A queued completion cannot be reassigned by the current login');
  await submit(await getTicket(aCookie));
  assert.equal((await store.accounts.leaderboard({ period: 'all', perspective: 'all', size: null, difficulty: null }, a.id)).me!.solved, 1, 'New attempts and devices cannot recount the same puzzle');
  await submit(await getTicket(bCookie));
  const publicResult = await (await handleApi(req('/api/leaderboard?period=all'), env, store)).json();
  assert.deepEqual(publicResult.entries.map((row: { rank: number }) => row.rank), [1, 1]);
  assert.doesNotMatch(JSON.stringify(publicResult), /google_sub|email|token|visitor/);
  // Old stored visibility flags no longer exclude players or their past solves.
  await store.accounts.profile(a.id, 'Ada');
  ranks = await store.accounts.leaderboard({ period: 'all', perspective: 'all', size: null, difficulty: null }, a.id);
  assert.equal(ranks.entries.length, 2); assert.equal(ranks.me!.solved, 1); assert.equal(ranks.me!.rank, 1); assert.ok(ranks.me!.bestTimeMs !== null);
  await store.accounts.remove(a.id);
  await submit(ticket);
  assert.equal((await store.accounts.leaderboard({ period: 'all', perspective: 'all', size: null, difficulty: null }, a.id)).me!.solved, 0);
});

test('leaderboard periods, filters, rate limits, ticket expiry, and disabled rollout', async t => {
  const store = new LocalStore(':memory:'); t.after(() => store.close());
  const now = Date.now(), DAY = 86400000;
  const user = await store.accounts.signIn('one', 'hash', now);
  await store.accounts.profile(user.id, 'One');
  for (const [index, age] of [0, 10 * DAY].entries()) {
    const s = { ...settings, seed: index, depth: index ? 3 : 1 };
    await store.accounts.issueAttempt(user.id, `ticket-${index}`, s, now - age);
    await store.accounts.completeAttempt(`ticket-${index}`, s, now - age);
  }
  const filter = { period: 'all' as const, perspective: 'all' as const, size: null, difficulty: null };
  assert.equal((await store.accounts.leaderboard(filter, user.id, now)).me!.solved, 2);
  const defaultRanking = await (await handleApi(req('/api/leaderboard'), env, store)).json();
  assert.equal(defaultRanking.period, 'all');
  assert.equal(defaultRanking.entries[0].solved, 2, 'Default ranking includes solves older than a week');
  assert.equal((await store.accounts.leaderboard({ ...filter, period: '7d' }, user.id, now)).me!.solved, 1);
  assert.equal((await store.accounts.leaderboard({ ...filter, perspective: '3d' }, user.id, now)).me!.solved, 1);
  assert.equal((await store.accounts.leaderboard({ ...filter, size: 4 }, user.id, now)).me!.solved, 0);
  assert.equal((await store.accounts.leaderboard({ ...filter, difficulty: 'hard' }, user.id, now)).me!.solved, 0);
  await store.accounts.issueAttempt(user.id, 'expired', settings, now);
  assert.equal(await store.accounts.completeAttempt('expired', settings, now + 8 * DAY), false);
  for (let i = 0; i < 25; i++) await store.accounts.issueAttempt(user.id, `limit-${i}`, settings, now);
  assert.equal(await store.accounts.issueAttempt(user.id, 'overflow', settings, now), false);
  for (let i = 0; i < 20; i++) assert.equal(await store.accounts.allowSignIn('key', now), true);
  assert.equal(await store.accounts.allowSignIn('key', now), false);
  assert.equal(await store.accounts.allowSignIn('key', now + 60000), true);
  const disabled = { ...env, ACCOUNTS_ENABLED: 'false' };
  assert.deepEqual(await (await handleApi(req('/api/auth/config'), disabled, store)).json(), { enabled: false, clientId: null });
  assert.equal((await handleApi(req('/api/leaderboard'), disabled, store)).status, 503);
  assert.equal((await handleApi(req('/api/leaderboard?size=999'), env, store)).status, 400);
  assert.equal(await store.accounts.current('hash', now + 31 * DAY), null);
});

test('returning Google profiles replace generated names but preserve explicitly saved nicknames', async t => {
  const store = new LocalStore(':memory:'); t.after(() => store.close());
  const first = await store.accounts.signIn('legacy-player', 'first-session', 1000);
  assert.equal(first.nickname, `Player ${first.id.slice(0, 6)}`);
  const missing = await store.accounts.signIn('legacy-player', 'missing-name', 2000);
  assert.equal(missing.nickname, first.nickname, 'Missing Google names keep the fallback');
  const updated = await store.accounts.signIn('legacy-player', 'named-session', 3000, 'Andrii Solokh');
  assert.equal(updated.id, first.id);
  assert.equal(updated.nickname, 'Andrii Solokh');
  assert.equal((await store.accounts.current('first-session', 3000))?.nickname, 'Andrii Solokh', 'Existing sessions see the repaired name');
  await store.accounts.profile(first.id, 'My nickname');
  assert.equal((await store.accounts.signIn('legacy-player', 'custom-session', 4000, 'Google Name')).nickname, 'My nickname');
  // Saving even the generated spelling is an explicit choice, not a missing name.
  const explicit = await store.accounts.signIn('explicit-player', 'explicit-session', 1000);
  await store.accounts.profile(explicit.id, explicit.nickname);
  assert.equal((await store.accounts.signIn('explicit-player', 'explicit-return', 3000, 'Other Name')).nickname, explicit.nickname);
  await store.accounts.remove(explicit.id);
  assert.equal((await store.accounts.signIn('explicit-player', 'recreated', 4000, 'Fresh Name')).nickname, 'Fresh Name');
});

test('best solve time uses server elapsed time, survives retries, and improves without recounting puzzles', async t => {
  const store = new LocalStore(':memory:'); t.after(() => store.close());
  const now = Date.now(), filter = { period: 'all' as const, perspective: 'all' as const, size: null, difficulty: null };
  const user = await store.accounts.signIn('speed-player', 'session', now);
  const ranking = () => store.accounts.leaderboard(filter, user.id, now + 600000);
  assert.equal((await ranking()).me!.bestTimeMs, null);
  await store.accounts.issueAttempt(user.id, 'first', settings, now);
  await store.accounts.completeAttempt('first', settings, now + 90500);
  assert.equal((await ranking()).me!.bestTimeMs, 90500);
  await store.accounts.completeAttempt('first', settings, now + 120000);
  assert.equal((await ranking()).me!.bestTimeMs, 90500, 'Delivery retries cannot alter a recorded duration');
  await store.accounts.issueAttempt(user.id, 'faster', settings, now + 200000);
  await store.accounts.completeAttempt('faster', settings, now + 245000);
  assert.deepEqual((await ranking()).me, { solved: 1, rank: 1, bestTimeMs: 45000 });
  await store.accounts.issueAttempt(user.id, 'slower', settings, now + 300000);
  await store.accounts.completeAttempt('slower', settings, now + 400000);
  assert.equal((await ranking()).me!.bestTimeMs, 45000);
  const cube = { ...settings, depth: 3, seed: 18 };
  await store.accounts.issueAttempt(user.id, 'cube', cube, now + 500000);
  await store.accounts.completeAttempt('cube', settings, now + 501000);
  assert.equal((await ranking()).me!.bestTimeMs, 45000, 'A mismatched board cannot add a time');
  await store.accounts.completeAttempt('cube', cube, now + 510000);
  const result = await ranking();
  assert.deepEqual(result.me, { solved: 2, rank: 1, bestTimeMs: 10000 });
  assert.equal(result.entries[0].bestTimeMs, result.me.bestTimeMs);
  assert.equal((await store.accounts.leaderboard({ ...filter, perspective: 'flat' }, user.id, now + 600000)).me!.bestTimeMs, 45000);
  await store.accounts.remove(user.id);
  assert.equal((await ranking()).me!.bestTimeMs, null);
  assert.equal((await ranking()).entries.length, 0);
});

test('historical completions remain untimed until a new timed replay', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'nodoku-timing-'));
  const path = join(dir, 'accounts.sqlite');
  const store = new LocalStore(path);
  const db = new DatabaseSync(path);
  t.after(() => { db.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const now = Date.now(), user = await store.accounts.signIn('historical', 'session', now);
  await store.accounts.issueAttempt(user.id, 'old-ticket', settings, now);
  db.prepare('INSERT INTO ranked_completions (player_id, size, depth, difficulty, seed, completed_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, settings.size, settings.depth, settings.difficulty, settings.seed, now + 10000);
  const filter = { period: 'all' as const, perspective: 'all' as const, size: null, difficulty: null };
  await store.accounts.completeAttempt('old-ticket', settings, now + 50000);
  let result = await store.accounts.leaderboard(filter, user.id);
  assert.equal(result.entries[0].bestTimeMs, null, 'Old upload retries cannot invent a historical time');
  assert.equal(result.me!.bestTimeMs, null);
  await store.accounts.issueAttempt(user.id, 'new-ticket', settings, now + 60000);
  await store.accounts.completeAttempt('new-ticket', settings, now + 90000);
  result = await store.accounts.leaderboard(filter, user.id);
  assert.deepEqual(result.me, { solved: 1, rank: 1, bestTimeMs: 30000 });
});

test('optional profile links normalize, persist, publish, and clear without changing ranks', async t => {
  const store = new LocalStore(':memory:'); t.after(() => store.close());
  const token = randomToken(), hash = await tokenHash(token);
  const person = await store.accounts.signIn('linked-player', hash, Date.now(), 'Mira');
  const cookie = `__Host-nodoku_session=${token}`;
  const save = (profileUrl: unknown) => handleApi(req('/api/auth/profile', { nickname: 'Mira', profileUrl }, cookie), env, store);
  assert.equal((await save('github.com/mira')).status, 200);
  assert.equal((await store.accounts.current(hash))?.profileUrl, 'https://github.com/mira');
  const returning = await store.accounts.signIn('linked-player', 'other-session', Date.now(), 'Google Name');
  assert.equal(returning.profileUrl, 'https://github.com/mira', 'Google login preserves the custom website');
  await handleApi(req('/api/auth/profile', { nickname: 'Mira Nova' }, cookie), env, store);
  assert.equal((await store.accounts.current(hash))?.profileUrl, 'https://github.com/mira', 'Older clients preserve an omitted link');
  for (const invalid of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com', 'https://user:pass@example.com', 'not a link', 'https://example.com/\npath', 'https://example.com/' + 'a'.repeat(2048), null, 42]) {
    assert.equal((await save(invalid)).status, 400);
    assert.equal((await store.accounts.current(hash))?.profileUrl, 'https://github.com/mira');
  }
  for (const [input, expected] of [
    [' x.com/mira ', 'https://x.com/mira'],
    ['https://www.linkedin.com/in/mira/', 'https://www.linkedin.com/in/mira/'],
    ['https://example.org/about?from=nodoku#me', 'https://example.org/about?from=nodoku#me'],
    ['http://example.org', 'http://example.org/'],
  ]) {
    const response = await save(input); assert.equal(response.status, 200);
    assert.equal((await response.json()).player.profileUrl, expected);
  }
  const attempt = randomToken();
  await store.accounts.issueAttempt(person.id, attempt, settings);
  await store.accounts.completeAttempt(attempt, settings);
  const rankings = async () => (await (await handleApi(req('/api/leaderboard'), env, store)).json()).entries;
  const entries = await rankings();
  assert.equal(entries[0].profileUrl, 'http://example.org/');
  assert.equal(entries[0].solved, 1); assert.equal(entries[0].rank, 1);
  assert.equal((await save('   ')).status, 200);
  assert.equal((await store.accounts.current(hash))?.profileUrl, undefined);
  assert.equal((await rankings())[0].profileUrl, undefined);
  assert.equal((await save('https://github.com/mira')).status, 200);
  await store.accounts.remove(person.id);
  assert.equal((await store.accounts.signIn('linked-player', 'new-session')).profileUrl, undefined);
});

test('personal rank remains available at 10001 while only the top 100 are returned', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'nodoku-large-ranking-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'accounts.sqlite');
  const store = new LocalStore(file); t.after(() => store.close());
  const db = new DatabaseSync(file);
  db.exec(`
    WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < 10001)
    INSERT INTO players (id, google_sub, nickname, created_at) SELECT 'player-' || n, 'google-' || n, 'Player ' || n, 1 FROM numbers;
    INSERT INTO ranked_completions (player_id,size,depth,difficulty,seed,completed_at) SELECT id,4,1,'easy',1,1 FROM players;
    INSERT INTO ranked_completions (player_id,size,depth,difficulty,seed,completed_at) SELECT id,4,1,'easy',2,2 FROM players WHERE id != 'player-10001';
  `);
  db.close();
  const ranking = await store.accounts.leaderboard({ period: 'all', perspective: 'flat', size: 4, difficulty: 'easy' }, 'player-10001');
  assert.equal(ranking.entries.length, 100);
  assert.equal(ranking.entries.some(entry => entry.id === 'player-10001'), false);
  assert.deepEqual(ranking.me, { rank: 10001, solved: 1, bestTimeMs: null });
});
