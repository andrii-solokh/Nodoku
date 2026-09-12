import assert from 'node:assert/strict';
import test from 'node:test';
import { capturePostHog } from '../server/posthog.ts';

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
