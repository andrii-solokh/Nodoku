import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Store } from './store.js';
import { normalizeProfileLink } from '../src/profile-link.js';
import { Puzzle } from '../src/puzzle.js';
import type { Player, RankingFilter } from './accounts-store.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000 });
const TOKEN = /^[a-f0-9]{64}$/;
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function accountsEnabled(env: Record<string, string | undefined>): boolean {
  return env.ACCOUNTS_ENABLED === 'true' && /^[\w-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID ?? '');
}
type GoogleIdentity = { sub: string; nickname?: string; avatarUrl?: string };
function googleAvatar(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) return url.href;
  } catch { /* Missing or unsupported pictures use the profile icon. */ }
  return undefined;
}
function defaultNickname(payload: Record<string, unknown>): string | undefined {
  const emailName = payload.email_verified === true && typeof payload.email === 'string'
    && /^[^\s@]+@[^\s@]+$/.test(payload.email) ? payload.email.split('@')[0] : undefined;
  for (const candidate of [payload.name, payload.given_name, emailName]) {
    if (typeof candidate !== 'string') continue;
    const name = candidate.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[–—]/g, '-')
      .replace(/[^\p{L}\p{M}\p{N}\s_.'-]/gu, '').replace(/\s+/g, ' ').trim()
      .slice(0, 24).replace(/\p{Cs}/gu, '').trim();
    if (/[\p{L}\p{N}]/u.test(name)) return name;
  }
  return undefined;
}
export async function verifyGoogleCredential(credential: string, clientId: string, nonce: string, keys: JWTVerifyGetKey = googleKeys): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(credential, keys, {
    algorithms: ['RS256'], audience: clientId, issuer: ['https://accounts.google.com', 'accounts.google.com'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce'], maxTokenAge: '10m', clockTolerance: 5,
  });
  if (payload.nonce !== nonce || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
    || (payload.azp !== undefined && payload.azp !== clientId)) throw new Error('Invalid Google identity.');
  return { sub: payload.sub, nickname: defaultNickname(payload), avatarUrl: googleAvatar(payload.picture) };
}
const cookieName = (request: Request, kind: string) => `${new URL(request.url).protocol === 'https:' ? '__Host-' : ''}nodoku_${kind}`;
function cookie(request: Request, kind: string): string | undefined {
  const name = cookieName(request, kind);
  return request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
function setCookie(request: Request, kind: string, value: string, age: number): string {
  return `${cookieName(request, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
function json(value: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(value), { status, headers });
}
class ErrorResponse extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ErrorResponse(415, 'Expected JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new ErrorResponse(400, 'A request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 16_384) { await reader.cancel(); throw new ErrorResponse(413, 'Request is too large.'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ErrorResponse(400, 'Invalid request.'); }
}
async function current(request: Request, store: Store): Promise<Player | null> {
  const token = cookie(request, 'session');
  return token && TOKEN.test(token) ? store.accounts!.current(await tokenHash(token)) : null;
}

export async function handleAccountsApi(request: Request, env: Record<string, string | undefined>, store: Store): Promise<Response> {
  const url = new URL(request.url), path = url.pathname;
  const routes: Record<string, string> = {
    '/api/auth/config': 'GET', '/api/auth/challenge': 'POST', '/api/auth/google': 'POST', '/api/auth/me': 'GET',
    '/api/auth/logout': 'POST', '/api/auth/profile': 'POST', '/api/auth/delete': 'POST',
    '/api/ranked-attempts': 'POST', '/api/leaderboard': 'GET',
  };
  if (!routes[path]) return json({ error: 'Not found.' }, 404);
  if (request.method !== routes[path]) return json({ error: 'Method not allowed.' }, 405);
  const enabled = accountsEnabled(env) && !!store.accounts && store.persistent;
  if (path === '/api/auth/config') return json({ enabled, clientId: enabled ? env.GOOGLE_CLIENT_ID : null });
  if (!enabled) return json({ error: 'Player accounts are not available yet.' }, 503);
  try {
    if (request.method === 'POST' && (request.headers.get('Origin') !== (env.APP_ORIGIN || url.origin)
      || request.headers.get('Sec-Fetch-Site') === 'cross-site')) throw new ErrorResponse(403, 'This request must come from Nodoku.');
    const accounts = store.accounts!;
    if (path === '/api/auth/challenge' || path === '/api/auth/google') {
      const key = await tokenHash(`${Math.floor(Date.now() / 60_000)}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
      if (!await accounts.allowSignIn(key)) throw new ErrorResponse(429, 'Please wait a minute before trying sign-in again.');
    }
    if (path === '/api/auth/challenge') {
      const nonce = randomToken();
      return json({ nonce }, 200, [setCookie(request, 'login', nonce, 600)]);
    }
    if (path === '/api/auth/google') {
      const value = await body(request), nonce = cookie(request, 'login');
      if (!nonce || !TOKEN.test(nonce) || typeof value.credential !== 'string') throw new ErrorResponse(401, 'Please start sign-in again.');
      let identity: GoogleIdentity;
      try { identity = await verifyGoogleCredential(value.credential, env.GOOGLE_CLIENT_ID!, nonce); }
      catch { throw new ErrorResponse(401, 'Google sign-in could not be verified. Please try again.'); }
      const token = randomToken(), previous = cookie(request, 'session');
      const player = await accounts.signIn(identity.sub, await tokenHash(token), Date.now(), identity.nickname, identity.avatarUrl);
      if (previous && TOKEN.test(previous)) await accounts.logout(await tokenHash(previous));
      return json({ player }, 200, [setCookie(request, 'session', token, 30 * 86400), setCookie(request, 'login', '', 0)]);
    }
    if (path === '/api/auth/logout') {
      const token = cookie(request, 'session');
      if (token && TOKEN.test(token)) await accounts.logout(await tokenHash(token));
      return json({ ok: true }, 200, [setCookie(request, 'session', '', 0)]);
    }
    const player = await current(request, store);
    if (path === '/api/auth/me') return json({ player });
    if (path === '/api/leaderboard') {
      const period = url.searchParams.get('period') || 'all', perspective = url.searchParams.get('perspective') || 'all';
      const size = url.searchParams.get('size'), difficulty = url.searchParams.get('difficulty');
      if (!['7d', 'all'].includes(period) || !['all', 'flat', '3d'].includes(perspective)
        || (size !== null && !['3', '4', '5'].includes(size)) || (difficulty !== null && !['easy', 'medium', 'hard'].includes(difficulty))) throw new ErrorResponse(400, 'Invalid leaderboard filter.');
      return json(await accounts.leaderboard({ period, perspective, size: size ? Number(size) : null, difficulty } as RankingFilter, player?.id));
    }
    if (!player) throw new ErrorResponse(401, 'Please sign in first.');
    if (path === '/api/auth/profile') {
      const value = await body(request);
      if (typeof value.nickname !== 'string') throw new ErrorResponse(400, 'Choose a nickname.');
      const nickname = value.nickname.normalize('NFKC').trim();
      if (!/^[\p{L}\p{M}\p{N} _.'-]{1,24}$/u.test(nickname) || !/[\p{L}\p{N}]/u.test(nickname)) throw new ErrorResponse(400, 'Use 1–24 letters, numbers, spaces, or simple punctuation.');
      const profileUrl = value.profileUrl === undefined ? undefined : normalizeProfileLink(value.profileUrl);
      if (profileUrl === null) throw new ErrorResponse(400, 'Enter a valid website link, such as x.com/yourname.');
      await accounts.profile(player.id, nickname, profileUrl);
      return json({ player: { ...player, nickname, ...(profileUrl === undefined ? {} : { profileUrl }) } });
    }
    if (path === '/api/auth/delete') {
      const value = await body(request);
      if (value.confirm !== 'delete') throw new ErrorResponse(400, 'Confirm account deletion.');
      await accounts.remove(player.id);
      return json({ ok: true }, 200, [setCookie(request, 'session', '', 0)]);
    }
    if (path === '/api/ranked-attempts') {
      const value = await body(request), settings = value.settings as Record<string, unknown> | undefined;
      if (!settings || ![3, 4, 5].includes(Number(settings.size)) || ![1, settings.size].includes(settings.depth as number)
        || !['easy', 'medium', 'hard'].includes(String(settings.difficulty)) || !Number.isSafeInteger(settings.seed)
        || Number(settings.seed) < 0 || Number(settings.seed) > 0xffffffff) throw new ErrorResponse(400, 'Invalid puzzle settings.');
      const puzzle = new Puzzle(settings as unknown as import('../src/puzzle.js').PuzzleSettings);
      const ticket = randomToken();
      if (!await accounts.issueAttempt(player.id, await tokenHash(ticket), puzzle.settings)) throw new ErrorResponse(429, 'Please wait before starting another ranked attempt.');
      return json({ ticket, playerId: player.id });
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    return json({ error: error instanceof ErrorResponse ? error.message : 'Player services are temporarily unavailable.' }, error instanceof ErrorResponse ? error.status : 503);
  }
}
