import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function drag(page, source, target) {
  await page.mouse.move(source.screen.x, source.screen.y);
  await page.mouse.down();
  await page.mouse.move(target.screen.x, target.screen.y, { steps: 8 });
  await page.mouse.up();
}
const adjacent = (a, b) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
async function fixture(openOnboarding = true) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/visitors', route => route.fulfill({ json: { count: 1, scope: 'local' } }));
  await page.route('**/api/presence', route => route.fulfill({ json: { online: 1, scope: 'local' } }));
  await page.route('**/api/statistics?**', route => route.fulfill({ json: { period: 'all', scope: 'local', trackingSince: null, totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.route('**/api/sponsorship', route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.goto(openOnboarding ? `${url}?onboarding=1` : url);
  await page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).mode === expected, openOnboarding ? 'onboarding' : 'home');
  return page;
}
try {
  const page = await fixture();
  assert.equal(await page.locator('.site-header').isVisible(), false, 'Onboarding hides the normal header');
  assert.equal(await page.locator('#onboarding-step').textContent(), '1 of 7');
  const board = await state(page);
  const tutorial = new Puzzle({ size: 3, depth: 1, difficulty: 'easy', seed: 17 });
  const mirror = new Puzzle({ size: 3, depth: 1, difficulty: 'easy', seed: 17 });
  assert.equal(board.nodes.length, 9, 'The first lesson is a 3 by 3 board');
  assert.equal(await page.locator('#onboarding-cue').isVisible(), true, 'The first lesson includes a visual gesture cue');
  assert.equal(await page.locator('#onboarding-cue').evaluate(node => node.classList.contains('is-drag')), true, 'The first cue demonstrates a drag between the highlighted nodes');
  const tutorialCenterY = board.nodes.reduce((sum, node) => sum + node.screen.y, 0) / board.nodes.length;
  assert.ok(Math.abs(tutorialCenterY - 425) < 8, 'The tutorial board is centered in the viewport, not only above the lesson copy');
  const [firstA, firstB] = tutorial.solution[0];
  const a = board.nodes.find(node => node.id === firstA);
  const b = board.nodes.find(node => node.id === firstB);
  assert.ok(a && b, 'The tutorial solution has visible endpoints');
  const tapLesson = await fixture();
  const tapBoard = await state(tapLesson);
  const tapA = tapBoard.nodes.find(node => node.id === firstA);
  const tapB = tapBoard.nodes.find(node => node.id === firstB);
  assert.ok(tapA && tapB, 'The tap lesson has visible endpoints');
  await tapLesson.mouse.click(tapA.screen.x, tapA.screen.y);
  await tapLesson.waitForFunction(nodeId => JSON.parse(window.render_game_to_text()).selected === nodeId, firstA);
  await tapLesson.mouse.click(tapB.screen.x, tapB.screen.y);
  await tapLesson.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '2 of 7');
  assert.equal((await state(tapLesson)).edges.length, 1, 'Selecting neighboring tutorial nodes makes the guided connection');
  await tapLesson.close();
  await page.mouse.move(a.screen.x, a.screen.y);
  await page.mouse.down();
  // A small drag begins the tutorial stroke without reaching a neighbour.
  await page.mouse.move(a.screen.x + 8, a.screen.y, { steps: 2 });
  await page.waitForFunction(nodeId => {
    const tutorialState = JSON.parse(window.render_game_to_text());
    return tutorialState.selected === nodeId && tutorialState.floating.selection?.nodeId === nodeId;
  }, a.id);
  await page.mouse.move(b.screen.x, b.screen.y, { steps: 8 });
  await page.mouse.up();
  mirror.toggle(firstA, firstB);
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '2 of 7');
  assert.match(await page.locator('#onboarding-message').textContent(), /same linked pair again to remove it/);
  await page.waitForFunction(() => document.querySelector('#onboarding-cue')?.classList.contains('is-remove'));
  const removal = await page.evaluate(() => {
    const initial = JSON.parse(window.render_game_to_text());
    window.advanceTime((1900 - initial.removalCue.elapsed + 2400) % 2400);
    const faded = JSON.parse(window.render_game_to_text());
    window.advanceTime(500);
    return { initial, faded, restored: JSON.parse(window.render_game_to_text()) };
  });
  assert.equal(removal.faded.removalCue.opacity, 0, 'The removal demonstration visibly hides the actual rod');
  assert.equal(removal.restored.removalCue.opacity, 1, 'The demonstration restores the rod for another gesture');
  assert.deepEqual(removal.faded.edges, removal.initial.edges, 'The removal cue does not make the move for the player');
  await page.evaluate(() => {
    const cue = JSON.parse(window.render_game_to_text()).removalCue;
    window.advanceTime((1900 - cue.elapsed + 2400) % 2400);
    document.querySelector('.onboarding-cue-line').getAnimations({subtree: true}).forEach(animation => {
      animation.pause(); animation.currentTime = 1900;
    });
  });
  await page.screenshot({path: 'output/web-game/onboarding-cues/remove-desktop.png'});

  assert.equal(await page.locator('#onboarding-next').isHidden(), true, 'The tutorial cannot jump to 3D before the 2D board is solved');
  await drag(page, a, b);
  mirror.toggle(firstA, firstB);
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '3 of 7');
  assert.equal(await page.locator('#onboarding-title').textContent(), 'Double-tap a node.');
  assert.match(await page.locator('#onboarding-message').textContent(), /Tap twice quickly.*double-click/);
  assert.equal((await state(page)).removalCue, null, 'The removal preview is cleared when the player removes the link');
  assert.equal(await page.locator('#onboarding-cue').evaluate(node => node.classList.contains('is-double-tap')), true, 'The fill lesson demonstrates the double-tap gesture');
  for (const selector of ['.onboarding-cue-line', '.onboarding-cue-end', '.onboarding-cue-hand'])
    assert.equal(await page.locator(`#onboarding-cue ${selector}`).isVisible(), false, 'Double tap shows only a ping on one sphere');
  const samples = await page.evaluate(() => {
    const ring = document.querySelector('.onboarding-cue-start');
    const results = [];
    for (const elapsed of [1, 700, 1000]) {
      window.advanceTime(elapsed);
      const board = JSON.parse(window.render_game_to_text());
      const node = board.nodes.find(n => n.id === Number(ring.dataset.nodeId));
      results.push({ x: parseFloat(ring.style.left), y: parseFloat(ring.style.top), node: node.screen });
    }
    return results;
  });
  for (const sample of samples) {
    assert.ok(Math.abs(sample.x - sample.node.x) < .05 && Math.abs(sample.y - sample.node.y) < .05,
      'The ping remains centered on the rendered sphere throughout floating motion');
  }
  assert.ok(Math.hypot(samples[0].x - samples[2].x, samples[0].y - samples[2].y) > .1,
    'The check exercises a sphere that actually moves');
  await page.locator('.onboarding-cue-start').evaluate(node => {
    const animation = node.getAnimations()[0];
    animation.pause();
    animation.currentTime = 20;
  });
  await page.screenshot({ path: 'output/web-game/onboarding-cues/double-ping-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'output/web-game/onboarding-cues/double-ping-mobile.png' });
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.waitForTimeout(100);
  const fillNode = mirror.nodes.find(node => node.required > 0);
  assert.ok(fillNode, 'The tutorial has a node to fill');
  const fillResult = mirror.toggleNode(fillNode.id);
  assert.equal(fillResult.changed, true, 'The tutorial fill action creates connections');
  const fillScreenNode = (await state(page)).nodes.find(node => node.id === fillNode.id);
  assert.ok(fillScreenNode, 'The node to fill is visible');
  await page.mouse.dblclick(fillScreenNode.screen.x, fillScreenNode.screen.y, { delay: 40 });
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '4 of 7');
  assert.match(await page.locator('#onboarding-message').textContent(), /until every dot is gone/);
  const secondFillNode = mirror.nodes.find(node => node.id !== fillNode.id && mirror.remaining(node.id) > 0);
  assert.ok(secondFillNode, 'The remaining tutorial board has another node to fill');
  const secondFillResult = mirror.toggleNode(secondFillNode.id);
  assert.equal(secondFillResult.changed, true, 'Double-tap remains available while clearing the board');
  const secondFillScreenNode = (await state(page)).nodes.find(node => node.id === secondFillNode.id);
  assert.ok(secondFillScreenNode, 'The second node to fill is visible');
  await page.mouse.dblclick(secondFillScreenNode.screen.x, secondFillScreenNode.screen.y, { delay: 40 });
  await page.waitForFunction(expectedEdges => JSON.parse(window.render_game_to_text()).edges.length === expectedEdges, mirror.edges.length);
  while (!mirror.solved) {
    const finishingFill = mirror.nodes.find(node => {
      if (mirror.remaining(node.id) <= 0) return false;
      const trial = Puzzle.restore(mirror.serialize());
      return trial?.toggleNode(node.id).changed && trial.solved;
    });
    if (finishingFill) {
      const screenNode = (await state(page)).nodes.find(node => node.id === finishingFill.id);
      assert.ok(screenNode?.screen, 'The finishing double-tap node is visible');
      const result = mirror.toggleNode(finishingFill.id);
      assert.equal(result.changed, true, 'The final node fill changes the tutorial board');
      assert.equal(mirror.solved, true, 'The chosen node fill completes the tutorial board');
      await page.mouse.dblclick(screenNode.screen.x, screenNode.screen.y, { delay: 40 });
      break;
    }
    const hint = mirror.hint();
    assert.equal(hint.changed, true, 'The tutorial board remains solvable after filling a node');
    assert.ok(hint.edge, 'Every tutorial hint supplies a connection');
    const current = await state(page);
    const source = current.nodes.find(node => node.id === hint.edge[0]);
    const target = current.nodes.find(node => node.id === hint.edge[1]);
    assert.ok(source && target, 'Each solution connection has visible endpoints');
    await drag(page, source, target);
    await page.waitForTimeout(20);
  }
  assert.equal(await page.locator('#completion-moment').isVisible(), true, 'The solved 2D lesson gets a completion beat before changing scenes');
  await page.screenshot({ path: 'output/web-game/onboarding-auto-3d/2d-completion-moment.png' });
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '5 of 7');
  let transition = await state(page);
  assert.ok(transition.shapeTransition?.active, 'The flat tutorial board expands into the 3D lesson');
  assert.equal(transition.shapeTransition.fromDepth, 1);
  assert.equal(transition.shapeTransition.toDepth, 3);
  await page.screenshot({ path: 'output/web-game/onboarding-auto-3d/flat-to-3d-transition.png' });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shapeTransition === null);
  transition = await state(page);
  assert.equal(transition.nodes.length, 26, 'The next lesson switches to a 3D board');
  assert.equal(await page.locator('#onboarding-title').textContent(), 'Turn the puzzle.');
  assert.match(await page.locator('#onboarding-message').textContent(), /Swipe over the board, or use the direction controls/);
  assert.equal(await page.locator('#onboarding-turn-controls').isVisible(), true, 'The turn lesson exposes direction controls');
  assert.equal(await page.locator('#onboarding-cue').evaluate(node => node.classList.contains('is-turn')), true, 'The turn lesson shows an animated turning cue on the board');
  await page.screenshot({ path: 'output/web-game/onboarding-auto-3d/solved-2d-3d.png' });
  await page.locator('[data-onboarding-rotate="right"]').click();
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '6 of 7');
  assert.equal(await page.locator('#onboarding-turn-controls').isHidden(), true, 'The connection lesson replaces turn controls');
  assert.equal(await page.locator('#onboarding-title').textContent(), 'Make a 3D connection.');
  const threeD = await state(page);
  const source = threeD.nodes.find(node =>
    node.screen?.pickable && threeD.nodes.some(other => other.screen?.pickable && adjacent(node, other)),
  );
  const target = source && threeD.nodes.find(node => node.screen?.pickable && adjacent(source, node));
  assert.ok(source && target, 'The 3D lesson has visible neighboring endpoints');
  await drag(page, source, target);
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '7 of 7');
  assert.equal(await page.locator('#onboarding-title').textContent(), 'Use your tools.');
  assert.match(await page.locator('#onboarding-next').textContent(), /Finish tutorial/, 'The final action closes the tutorial instead of starting a game');
  assert.equal(await page.locator('#onboarding-control-lesson').isVisible(), true, 'The final lesson shows the game toolbar');
  assert.equal(await page.locator('#onboarding-control-lesson').evaluate(node => node.classList.contains('game-toolbar')), true, 'The tutorial uses the game toolbar component instead of a separate layout');
  assert.equal(await page.locator('#onboarding-control-lesson .tools-group .tool-button').count(), 4, 'The tutorial uses every normal-game tool');
  assert.equal(await page.locator('#onboarding-control-lesson .tool-button').nth(0).isDisabled(), true, 'The tutorial preserves the fresh-game undo state');
  assert.equal(await page.locator('#onboarding-control-lesson .tool-button').nth(1).isDisabled(), true, 'The tutorial preserves the fresh-game redo state');
  assert.equal(await page.locator('.onboarding-desktop-shortcuts').count(), 0, 'The tutorial does not add a separate controls layout beneath the shared toolbar');
  await page.screenshot({ path: 'output/web-game/onboarding-controls/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#onboarding-control-lesson .tools-group').evaluate(node => getComputedStyle(node).gridTemplateColumns), '42px 42px', 'Mobile uses the same compact two-by-two game toolbar');
  await page.screenshot({ path: 'output/web-game/onboarding-controls/mobile.png' });
  await page.locator('#onboarding-next').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'home');
  assert.equal(await page.locator('.site-header').isVisible(), true, 'Finishing returns to the normal home screen');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).onboardingCompleted), true, 'Completion is stored');
  await page.close();

  const portrait = await fixture();
  await portrait.setViewportSize({ width: 390, height: 844 });
  await portrait.waitForTimeout(50);
  const portraitLayout = await portrait.evaluate(() => {
    const canvas = document.querySelector('#onboarding-stage canvas');
    const copy = document.querySelector('.onboarding-copy');
    if (!canvas || !copy) throw new Error('Portrait onboarding elements are missing');
    const canvasBounds = canvas.getBoundingClientRect();
    const copyBounds = copy.getBoundingClientRect();
    return {
      height: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      canvasBottom: canvasBounds.bottom,
      copyTop: copyBounds.top,
    };
  });
  assert.ok(portraitLayout.scrollHeight <= portraitLayout.height + 1, 'portrait onboarding fits without vertical page scroll');
  assert.ok(portraitLayout.canvasBottom <= portraitLayout.copyTop, 'portrait lesson copy stays below the board');
  const cueBounds = await portrait.locator('#onboarding-cue .onboarding-cue-line').boundingBox();
  assert.ok(cueBounds && cueBounds.x >= 0 && cueBounds.x + cueBounds.width <= 390, 'the visual cue realigns with the board after resizing to mobile');
  await portrait.close();

  const skipped = await fixture();
  await skipped.locator('#onboarding-skip').click();
  await skipped.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'home');
  assert.equal(await skipped.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).onboardingCompleted), true, 'Skipping is stored');
  await skipped.close();

  const howToPlay = await fixture(false);
  await howToPlay.locator('#help-button').click();
  await howToPlay.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'onboarding');
  assert.equal(await howToPlay.locator('#help-dialog').isVisible(), false, 'How to play starts the guided tutorial instead of a static dialog');
  await howToPlay.locator('#onboarding-skip').click();
  await howToPlay.close();
  assert.deepEqual(errors, []);
  console.log('Passed: skippable first-run 3 by 3 connection lesson, goal explanation, 3D rotation lesson, How to play entry, and persisted completion.');
} finally {
  await browser.close();
}
