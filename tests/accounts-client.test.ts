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
      timeoutSignal: () => undefined,
      localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
      fetch: async (url: string) => {
        if (url === '/api/auth/config') return Response.json({ enabled: true });
        if (url === '/api/auth/me') return Response.json({ player: { id: playerId } });
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
