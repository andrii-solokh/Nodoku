import assert from 'node:assert/strict';

/** Solving fixtures must make the suggested move themselves: Hint never plays it. */
export async function followHint(page) {
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && JSON.parse(window.render_game_to_text()).mode === 'playing');
  const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.locator('#hint-button').click();
  await page.evaluate(() => window.advanceTime(1200));
  const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.deepEqual(state.edges, before.edges, 'Hint leaves the graph unchanged');
  assert.equal(state.solved, before.solved, 'Hint cannot finish the puzzle');
  if (!state.hint) throw new Error('Expected a playable hint');
  const [a, b] = state.hint.edge.map(id => state.nodes.find(node => node.id === id));
  await page.mouse.click(a.screen.x, a.screen.y);
  await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).selected === id, a.id);
  await page.mouse.click(b.screen.x, b.screen.y);
  await page.waitForFunction(count => JSON.parse(window.render_game_to_text()).edges.length !== count, state.edges.length);
}
