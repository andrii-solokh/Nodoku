import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';
import { Puzzle } from '../src/puzzle.ts';

const source = stripTypeScriptTypes(readFileSync('src/accounts.ts', 'utf8')).replace(/^import .*;\n/gm, '').replace(/export /g, '');
const prefix = 'nodoku.ranked-attempt.v1.';
const settings = { size: 3, depth: 1, difficulty: 'easy' as const, seed: 17 };

test('ranked client keeps original tickets on reload and refreshes account before starting another puzzle', async () => {
  const storage = new Map<string, string>();
  let playerId = 'player-a', issues = 0;
  const runtime = () => {
    const context = createContext({
      setAnalyticsPlayer: () => {},
      URLSearchParams,
      timeoutSignal: () => undefined,
      localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
      fetch: async (url: string) => {
        if (url === '/api/auth/config') return Response.json({ enabled: true });
        if (url === '/api/auth/me') return Response.json({ player: { id: playerId } });
        if (url.startsWith('/api/leaderboard?')) return Response.json({ entries: [], me: { rank: null } });
        assert.equal(url, '/api/ranked-attempts'); issues++;
        return Response.json({ ticket: (playerId === 'player-a' ? 'a' : 'b').repeat(64), playerId });
      },
    });
    runInContext(source, context); return context;
  };
  const first = runtime();
  const board = new Puzzle(settings);
  first.prepareRankedAttempt(board, 'attempt-a');
  assert.equal(await first.getRankedTicket('attempt-a'), 'a'.repeat(64));
  assert.equal(issues, 1);
  playerId = 'player-b';
  // Pending completion uploads retain original attribution, irrespective of current login.
  const reloaded = runtime();
  assert.equal(await reloaded.getRankedTicket('attempt-a'), 'a'.repeat(64));
  // A resumed ranked puzzle by the same player reuses its ticket.
  playerId = 'player-a'; board.toggle(...board.solution[0]);
  reloaded.prepareRankedAttempt(board, 'attempt-a');
  assert.equal(await reloaded.getRankedTicket('attempt-a'), 'a'.repeat(64));
  assert.equal(issues, 1);
  playerId = 'player-b';
  reloaded.prepareRankedAttempt(new Puzzle({ ...settings, seed: 18 }), 'attempt-b');
  assert.equal(await reloaded.getRankedTicket('attempt-b'), 'b'.repeat(64));
  assert.equal(issues, 2);
  reloaded.prepareRankedAttempt(board, 'old-guest-puzzle');
  assert.equal(await reloaded.getRankedTicket('old-guest-puzzle'), undefined, 'Unranked partial puzzles cannot claim old progress');
  assert.equal(issues, 2);
  reloaded.forgetRankedTicket('attempt-a');
  assert.equal(storage.has(prefix + 'attempt-a'), false);
  storage.set(prefix + 'expired', JSON.stringify({ ticket: 'a'.repeat(64), expires: 0 }));
  assert.equal(await reloaded.getRankedTicket('expired'), undefined);
});

function rankRuntime(storage = new Map<string, string>()) {
  let now = 1000;
  let ranks: { solved: number | null; time: number | null } = { solved: 18, time: 42 };
  let playerId = 'player-a';
  let failing = false;
  const context = createContext({
      setAnalyticsPlayer: () => {},
    URLSearchParams, Event, Date: { now: () => now }, timeoutSignal: () => undefined,
    window: { dispatchEvent: () => {} },
    localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    fetch: async (url: string) => {
      if (url === '/api/auth/config') return Response.json({ enabled: true });
      if (url === '/api/auth/me') return Response.json({ player: { id: playerId } });
      if (url === '/api/ranked-attempts') return Response.json({ ticket: 'a'.repeat(64), playerId });
      const params = new URL(url, 'https://nodoku.test').searchParams;
      assert.equal(params.get('perspective'), '3d');
      assert.equal(params.get('size'), '3');
      assert.equal(params.get('difficulty'), 'easy');
      if (failing) throw new Error('Offline');
      return Response.json({ entries: [], me: { rank: ranks[params.get('metric') as 'solved' | 'time'] } });
    },
  });
  runInContext(source, context);
  return {
    context, storage,
    setRanks: (next: typeof ranks) => { ranks = next; now += 1000; },
    switchPlayer: () => { playerId = 'player-b'; },
    fail: () => { failing = true; },
    state: () => JSON.parse(runInContext('JSON.stringify(completionRank)', context)),
    async start() {
      context.prepareRankedAttempt(new Puzzle({ ...settings, depth: 3 }), 'rank-attempt');
      await context.getRankedTicket('rank-attempt');
      await runInContext("rankBaselines.get('rank-attempt')", context);
    },
    async finish() {
      context.showCompletionRanking({ ...settings, depth: 3 }, 'rank-attempt');
      const done = context.refreshCompletionRanking('rank-attempt');
      context.forgetRankedTicket('rank-attempt');
      await done;
    },
  };
}

test('completion compares both category ranks and preserves the starting snapshot on reload', async () => {
  const first = rankRuntime(); await first.start();
  const reloaded = rankRuntime(first.storage); await reloaded.start();
  reloaded.setRanks({ solved: 15, time: 42 });
  await reloaded.finish();
  assert.deepEqual(reloaded.state().before, { solved: 18, time: 42 });
  assert.deepEqual(reloaded.state().after, { solved: 15, time: 42 });
  assert.equal(reloaded.state().pending, false);
});

test('completion distinguishes first ranking, unchanged ranking and a worse rank', async () => {
  const runtime = rankRuntime(); runtime.setRanks({ solved: null, time: null }); await runtime.start();
  runtime.setRanks({ solved: 10001, time: 80 }); await runtime.finish();
  assert.deepEqual(runtime.state().before, { solved: null, time: null });
  assert.deepEqual(runtime.state().after, { solved: 10001, time: 80 });
  const worse = rankRuntime(); await worse.start(); worse.setRanks({ solved: 19, time: 42 }); await worse.finish();
  assert.deepEqual(worse.state().after, { solved: 19, time: 42 });
});

test('failed ranking fetch or switched account never publishes a misleading change', async () => {
  for (const change of ['fail', 'switchPlayer'] as const) {
    const runtime = rankRuntime(); await runtime.start(); runtime.setRanks({ solved: 1, time: 1 });
    runtime[change](); await runtime.finish();
    assert.equal(runtime.state().after, undefined);
    assert.equal(runtime.state().pending, false);
  }
});

test('a snapshot captured at completion is not presented as the earlier ranking', async () => {
  const runtime = rankRuntime(); await runtime.start(); await runtime.finish();
  assert.equal(runtime.state().before, undefined);
  assert.deepEqual(runtime.state().after, { solved: 18, time: 42 });
});


test('verified account refresh reaches analytics and stale responses cannot restore a signed-out player', async () => {
  const identified: any[] = [];
  let respond: (response: Response) => void;
  const ctx = createContext({
    setAnalyticsPlayer: (player: any) => identified.push(player),
    timeoutSignal: () => undefined,
    fetch: () => new Promise<Response>(resolve => { respond = resolve; }),
  });
  runInContext(source, ctx);
  const refreshing = ctx.refreshPlayer();
  ctx.setPlayer(null);
  respond!(Response.json({ player: { id: 'old-player', nickname: 'Old player' } }));
  await refreshing;
  assert.deepEqual(identified, [null]);
  const next = ctx.refreshPlayer();
  respond!(Response.json({ player: { id: 'new-player', nickname: 'New player' } }));
  await next;
  assert.equal(identified.at(-1).id, 'new-player');
});
