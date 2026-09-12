import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const swipeRotations = process.env.ONBOARDING_ROTATION_INPUT === 'swipe';
const errors = [];
const settleSuccess = page => page.waitForFunction(() => JSON.parse(window.render_game_to_text()).tutorialSuccess === null);
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function drag(page, source, target) {
  await page.mouse.move(source.screen.x, source.screen.y);
  await page.mouse.down();
  await page.mouse.move(target.screen.x, target.screen.y, { steps: 8 });
  await page.mouse.up();
}
async function swipeTurn(page, direction, { touch = false, distance = 90, cancel = false } = {}) {
  const board = await state(page);
  const node = board.nodes.find(node => node.screen?.pickable);
  const x = node.screen.x, y = node.screen.y;
  const dx = direction === 'left' ? distance : direction === 'right' ? -distance : 0;
  const dy = direction === 'up' ? distance : direction === 'down' ? -distance : 0;
  if (touch) {
    const input = await page.context().newCDPSession(page);
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++)
      await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }] });
    await input.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    await input.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    await page.mouse.up();
  }
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
  await page.addInitScript(() => {
    window.tutorialSuccessMessages = [];
    document.addEventListener('DOMContentLoaded', () => {
      const moment = document.querySelector('#completion-moment');
      let visible = false;
      if (!moment) return;
      new MutationObserver(() => {
        if (!moment.hidden && !visible) window.tutorialSuccessMessages.push(moment.querySelector('strong').textContent);
        visible = !moment.hidden;
      }).observe(moment, { attributes: true, childList: true, subtree: true });
    });
  });
  await page.goto(openOnboarding ? `${url}?onboarding=1` : url);
  await page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).mode === expected, openOnboarding ? 'onboarding' : 'home');
  return page;
}
try {
  const page = await fixture();
  assert.equal(await page.locator('.site-header').isVisible(), false, 'Onboarding hides the normal header');
  assert.equal(await page.locator('#onboarding-step').textContent(), '1 of 8');
  const board = await state(page);
  const tutorial = new Puzzle({ size: 2, depth: 1, difficulty: 'easy', seed: 17 });
  const mirror = new Puzzle({ size: 2, depth: 1, difficulty: 'easy', seed: 17 });
  assert.equal(board.nodes.length, 4, 'The first lesson is a 2 by 2 board');
  assert.equal(await page.locator('#onboarding-cue').isVisible(), true, 'The first lesson includes a visual gesture cue');
  assert.equal(await page.locator('#onboarding-cue').evaluate(node => node.classList.contains('is-select')), true, 'The first cue demonstrates selecting two neighboring nodes');
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
  await tapLesson.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '2 of 8');
  assert.equal((await state(tapLesson)).edges.length, 0, 'The practice connection resets for the drag lesson');
  await tapLesson.close();
  await drag(page, a, b);
  assert.equal(await page.locator('#onboarding-step').textContent(), '1 of 8', 'Dragging cannot skip the selection lesson');
  assert.equal((await state(page)).edges.length, 0);
  const initialStageBounds = await page.locator('#onboarding-stage').boundingBox();
  const pingTiming = await page.locator('.onboarding-cue-node').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationDelay));
  assert.notEqual(pingTiming[0], pingTiming[1], 'The two selection pings play in sequence');
  await page.mouse.click(a.screen.x, a.screen.y);
  await page.waitForFunction(() => document.querySelector('#onboarding-cue').dataset.selected === 'true');
  await page.screenshot({ path: 'output/web-game/onboarding-cues/select-second.png' });
  await page.mouse.click(b.screen.x, b.screen.y);
  const connectedState = await page.waitForFunction(() => {
    const current = JSON.parse(window.render_game_to_text());
    return current.tutorialSuccess === 'Connection made' ? current : false;
  });
  assert.equal((await connectedState.jsonValue()).edges.length, 1, 'Selecting two neighbors makes a real connection');
  await settleSuccess(page);
  assert.equal(await page.locator('#onboarding-step').textContent(), '2 of 8');
  assert.deepEqual(await page.locator('#onboarding-stage').boundingBox(), initialStageBounds, 'The selection-to-drag transition keeps the board stationary');
  assert.equal((await state(page)).edges.length, 0);
  const bottomNodes = (await state(page)).nodes.sort((a, b) => b.screen.y - a.screen.y).slice(0, 2).sort((a, b) => a.screen.x - b.screen.x);
  const [dragA, dragB] = bottomNodes;
  assert.ok(![firstA, firstB].includes(dragA.id) && ![firstA, firstB].includes(dragB.id), 'Drag uses a different pair from the tap lesson');
  assert.match(await page.locator('#onboarding-message').textContent(), /two bottom nodes/);
  for (const [selector, node] of [['.onboarding-cue-start', dragA], ['.onboarding-cue-end', dragB]]) {
    const ring = await page.locator(selector).boundingBox();
    assert.ok(Math.abs(ring.x + ring.width / 2 - node.screen.x) < 8 && Math.abs(ring.y + ring.height / 2 - node.screen.y) < 8,
      'Drag guide targets the bottom spheres');
  }
  await page.screenshot({ path: 'output/web-game/onboarding-cues/drag-bottom-desktop.png' });
  await page.mouse.click(dragA.screen.x, dragA.screen.y);
  await page.mouse.click(dragB.screen.x, dragB.screen.y);
  assert.equal((await state(page)).edges.length, 0, 'The drag lesson requires dragging');
  await page.mouse.move(dragA.screen.x, dragA.screen.y);
  await page.mouse.down();
  // A small drag begins the tutorial stroke without reaching a neighbour.
  await page.mouse.move(dragA.screen.x + 8, dragA.screen.y, { steps: 2 });
  await page.waitForFunction(nodeId => {
    const tutorialState = JSON.parse(window.render_game_to_text());
    return tutorialState.selected === nodeId && tutorialState.floating.selection?.nodeId === nodeId;
  }, dragA.id);
  await page.mouse.move(dragB.screen.x, dragB.screen.y, { steps: 8 });
  await page.mouse.up();
  mirror.toggle(dragA.id, dragB.id);
  assert.equal((await state(page)).tutorialSuccess, 'Connection made');
  assert.equal(await page.locator('#onboarding-step').textContent(), '2 of 8', 'The next instruction waits for the success beat');
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#completion-moment')).opacity) > .9);
  await page.screenshot({ path: 'output/web-game/onboarding-cues/connection-success.png' });
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '3 of 8');
  assert.match(await page.locator('#onboarding-message').textContent(), /same linked pair again to remove it/);
  await page.waitForFunction(() => document.querySelector('#onboarding-cue')?.classList.contains('is-remove'));
  const trail = await page.locator('.onboarding-cue-hand').evaluate(async hand => {
    const animation = hand.getAnimations()[0];
    animation.pause();
    await animation.ready;
    const cycle = animation.effect.getTiming().duration;
    const position = fraction => {
      animation.currentTime = cycle * fraction;
      const box = hand.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const from = position(.2), to = position(.65);
    animation.play();
    return { from, to };
  });
  assert.ok((trail.to.x - trail.from.x) * (dragB.screen.x - dragA.screen.x)
    + (trail.to.y - trail.from.y) * (dragB.screen.y - dragA.screen.y) < 0, 'Removal trail travels opposite the original connection');
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
  await drag(page, dragA, dragB);
  mirror.toggle(dragA.id, dragB.id);
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '4 of 8');
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
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '5 of 8');
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
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent.startsWith('6 of 8'));
  let transition = await state(page);
  assert.ok(transition.shapeTransition?.active, 'The flat tutorial board expands into the 3D lesson');
  assert.equal(transition.shapeTransition.fromDepth, 1);
  assert.equal(transition.shapeTransition.toDepth, 2);
  await page.screenshot({ path: 'output/web-game/onboarding-auto-3d/flat-to-3d-transition.png' });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shapeTransition === null);
  transition = await state(page);
  assert.equal(transition.nodes.length, 8, 'The next lesson switches to a 2 by 2 by 2 cube');
  assert.equal(await page.locator('#onboarding-title').textContent(), 'Turn left.');
  assert.match(await page.locator('#onboarding-message').textContent(), /use either key below/);
  assert.equal(await page.locator('#onboarding-turn-controls').isHidden(), true, 'Desktop rotation uses gestures and keys');
  assert.equal(await page.locator('#onboarding-cue').evaluate(node => node.classList.contains('is-turn')), true, 'The turn lesson shows an animated turning cue on the board');
  assert.equal(await page.locator('.rotation-arrow-head').count(), 1, 'Rotation uses a directional arrow');
  const arrow = page.locator('.onboarding-cue-turn');
  const assertArrowDirection = async direction => {
    if (!await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      const expected = { left: ['←', 'A'], right: ['→', 'D'], up: ['↑', 'W'], down: ['↓', 'S'] }[direction];
      assert.deepEqual(await page.locator('#onboarding-rotation-keys kbd').allTextContents(), expected,
        'Only the current direction has keyboard guidance');
      assert.equal(await page.locator('#onboarding-rotation-keys').evaluate(node => node.classList.contains('onboarding-shortcut')), true,
        'Rotation uses prominent keyboard keycaps');
    }
    const delta = await arrow.locator('.rotation-arrow-track').evaluate(path => {
      const matrix = path.getScreenCTM();
      const start = path.getPointAtLength(0).matrixTransform(matrix);
      const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
      return { x: end.x - start.x, y: end.y - start.y };
    });
    assert.ok(direction === 'left' ? delta.x > 0 : direction === 'right' ? delta.x < 0
      : direction === 'up' ? delta.y > 0 : delta.y < 0, 'Rotation arrow shows the reversed swipe direction');
  };
  await assertArrowDirection('left');
  const assertArrowPosition = async () => {
    const box = await arrow.boundingBox();
    const rendered = (await state(page)).nodes;
    const center = rendered.reduce((sum, node) => sum + node.screen.x, 0) / rendered.length;
    assert.ok(box && Math.abs(box.x + box.width / 2 - center) < 8, 'Arrow is centered over the rendered puzzle');
    assert.ok(box.y >= 0 && box.x >= 0, 'Arrow stays within the viewport');
  };
  await assertArrowPosition();
  await page.screenshot({ path: 'output/web-game/onboarding-cues/rotation-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await assertArrowPosition();
  await page.screenshot({ path: 'output/web-game/onboarding-cues/rotation-mobile.png' });
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.waitForTimeout(250);

  await page.screenshot({ path: 'output/web-game/onboarding-auto-3d/solved-2d-3d.png' });
  // A wrong direction rotates the board but does not complete the requested checkpoint.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(450);
  assert.equal((await state(page)).tutorialRotation, 'left');
  if (swipeRotations) {
    await swipeTurn(page, 'left', { distance: 12 });
    await page.evaluate(() => window.advanceTime(600));
    assert.equal((await state(page)).tutorialSuccess, null, 'A tiny swipe does not complete rotation');
    assert.equal((await state(page)).tutorialRotation, 'left');
    await swipeTurn(page, 'left', { touch: true, cancel: true });
    await page.evaluate(() => window.advanceTime(600));
    assert.equal((await state(page)).tutorialSuccess, null, 'Cancelled touch rotation does not complete the step');
    assert.equal((await state(page)).tutorialRotation, 'left');
    await swipeTurn(page, 'right');
    await page.evaluate(() => window.advanceTime(600));
    assert.equal((await state(page)).tutorialRotation, 'left', 'Wrong-direction swipe does not advance');
    await swipeTurn(page, 'left');
  } else await page.keyboard.press('ArrowLeft');
  await settleSuccess(page);
  assert.equal((await state(page)).tutorialRotation, 'right');
  await assertArrowDirection('right');
  assert.match(await page.locator('#onboarding-step').textContent(), /Direction 2 of 4/);
  if (swipeRotations) await swipeTurn(page, 'right');
  else await page.keyboard.press('d');
  await settleSuccess(page);
  assert.equal((await state(page)).tutorialRotation, 'up');
  await assertArrowDirection('up');
  assert.equal(await page.locator('.onboarding-cue-turn').getAttribute('data-direction'), 'up');
  await page.screenshot({ path: 'output/web-game/onboarding-cues/rotation-up-desktop.png' });
  const device = await page.context().newCDPSession(page);
  await device.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.match(await page.locator('#onboarding-message').textContent(), /tap the up arrow in the control panel/);
  assert.equal(await page.locator('#onboarding-rotation-keys').isHidden(), true);
  assert.equal(await page.locator('#onboarding-turn-controls').isVisible(), true, 'Touch players keep the rotation controller');
  assert.equal(await page.locator('[data-onboarding-rotate="up"].tutorial-tool-ping').count(), 1);
  const upArrow = await arrow.boundingBox();
  assert.ok(upArrow.x >= 0 && upArrow.y >= 0 && upArrow.x + upArrow.width <= 390);
  await page.screenshot({ path: 'output/web-game/onboarding-cues/rotation-up-mobile.png' });
  if (swipeRotations) await swipeTurn(page, 'up', { touch: true });
  else await page.locator('[data-onboarding-rotate="up"]').click();
  await settleSuccess(page);
  assert.equal((await state(page)).tutorialRotation, 'down');
  await assertArrowDirection('down');
  await device.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.waitForFunction(() => !document.querySelector('#onboarding-rotation-keys').hidden);
  await assertArrowDirection('down');
  await page.screenshot({ path: 'output/web-game/onboarding-cues/rotation-down-desktop.png' });
  await device.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector('#onboarding-turn-controls').hidden);
  assert.equal(await page.locator('[data-onboarding-rotate="down"].tutorial-tool-ping').count(), 1);
  const downArrow = await arrow.boundingBox();
  const downBoardRight = Math.max(...(await state(page)).nodes.map(node => node.screen.x + node.screen.radius));
  assert.ok(downArrow.x + downArrow.width / 2 > downBoardRight, 'The turn-down arrow sits to the right of the puzzle');
  assert.ok(downArrow.x + downArrow.width <= 390, 'The turn-down arrow stays inside the mobile viewport');
  await page.screenshot({ path: 'output/web-game/onboarding-cues/rotation-down-mobile.png' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const copy = await page.locator('.onboarding-copy').boundingBox();
    const controls = await page.locator('#onboarding-turn-controls').boundingBox();
    assert.ok(copy.y + copy.height <= controls.y - 8 || copy.x + copy.width <= controls.x - 8,
      'Mobile rotation instructions have a clear gap from the control panel');
    assert.ok(controls.y + controls.height <= viewport.height - 10, 'Rotation controls stay above the screen edge');
    assert.ok(copy.x >= 0 && copy.y >= 0 && copy.y + copy.height <= viewport.height, 'Rotation instructions stay on screen');
    await page.screenshot({ path: `output/web-game/onboarding-cues/rotation-layout-${viewport.width}-${viewport.height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (swipeRotations) await swipeTurn(page, 'down', { touch: true });
  else await page.locator('[data-onboarding-rotate="down"]').click();
  await page.waitForFunction(() => document.querySelector('#onboarding-step')?.textContent === '7 of 8');
  await device.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await device.detach();
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.waitForTimeout(450);
  assert.equal(await page.locator('#onboarding-turn-controls').isHidden(), true, 'The connection lesson replaces turn controls');
  assert.equal(await page.locator('#onboarding-title').textContent(), 'Make a 3D connection.');
  const tutorialCube = new Puzzle({ size: 2, depth: 2, difficulty: 'easy', seed: 17 });
  const threeD = (await state(page)).nodes;
  const first3d = tutorialCube.solution.map(edge => edge.map(id => threeD.find(node => node.id === id)))
    .find(pair => pair.every(node => node.screen?.pickable));
  assert.ok(first3d, 'A valid connection is visible for the 3D lesson');
  await drag(page, first3d[0], first3d[1]);
  await page.waitForFunction(() => document.querySelector('#onboarding-title').textContent === 'Finish the cube.');
  assert.equal(await page.locator('#onboarding-step').textContent(), '8 of 8');
  assert.equal(await page.locator('#onboarding-control-lesson, #onboarding-tool-arrow, #onboarding-shortcut').count(), 0, 'Onboarding contains no tools or tool shortcuts');
  assert.equal(await page.locator('#onboarding-next').isHidden(), true);
  const beforeShortcuts = (await state(page)).edges;
  for (const key of ['Control+z', 'Control+Shift+z', 'h']) await page.keyboard.press(key);
  assert.deepEqual((await state(page)).edges, beforeShortcuts, 'Removed tool shortcuts do not change the tutorial puzzle');
  await page.locator('#onboarding-next').evaluate(button => button.click());
  assert.equal((await state(page)).mode, 'onboarding', 'Finish cannot bypass the cube');
  const mobileInput = await page.context().newCDPSession(page);
  await mobileInput.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector('#onboarding-turn-controls').hidden);
  await page.screenshot({ path: 'output/web-game/onboarding-controls/finish-cube-mobile.png' });
  // Finish the actual puzzle using rotations and node gestures, without tool shortcuts.
  for (let attempt = 0; attempt < 96 && !(await state(page)).solved; attempt++) {
    const current = await state(page);
    const pair = tutorialCube.solution
      .filter(([a, b]) => !current.edges.some(([x, y]) => a === x && b === y))
      .map(edge => edge.map(id => current.nodes.find(node => node.id === id)))
      .find(nodes => nodes.every(node => node.screen?.pickable));
    assert.equal(await page.locator('#onboarding-next').isHidden(), true, 'Finish stays hidden until the last connection');
    if (pair) {
      await drag(page, pair[0], pair[1]);
      await page.waitForFunction(count => JSON.parse(window.render_game_to_text()).edges.length > count, current.edges.length);
    } else {
      await page.keyboard.press(attempt % 4 === 3 ? 'w' : 'd');
      await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).view.animating);
    }
  }
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).solved && !JSON.parse(window.render_game_to_text()).tutorialSuccess);
  assert.equal(await page.locator('#onboarding-title').textContent(), 'All connected.');
  assert.equal(await page.locator('#onboarding-next').isVisible(), true);
  await page.screenshot({ path: 'output/web-game/onboarding-controls/finish-cube-complete.png' });
  assert.deepEqual(await page.evaluate(() => window.tutorialSuccessMessages), [
    'Connection made', 'Connection made', 'Connection removed', 'Neighbors connected', 'All connected',
    'Turned left', 'Turned right', 'Turned up', 'Turned down', '3D connection made', 'All connected',
  ], 'The tutorial finishes without tool lessons');
  await page.locator('#onboarding-next').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'home');
  assert.equal(await page.locator('.site-header').isVisible(), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).onboardingCompleted), true);
  await page.close();

  const portrait = await fixture();
  await portrait.setViewportSize({ width: 390, height: 844 });
  await portrait.waitForTimeout(50);
  const portraitLayout = await portrait.evaluate(() => {
    const canvas = document.querySelector('#onboarding-stage canvas');
    const copy = document.querySelector('.onboarding-copy');
    if (!canvas || !copy) throw new Error('Portrait onboarding elements are missing');
    const copyBounds = copy.getBoundingClientRect();
    return {
      height: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      boardBottom: Math.max(...JSON.parse(window.render_game_to_text()).nodes.map(node => node.screen.y + node.screen.radius)),
      copyTop: copyBounds.top,
    };
  });
  assert.ok(portraitLayout.scrollHeight <= portraitLayout.height + 1, 'portrait onboarding fits without vertical page scroll');
  assert.ok(portraitLayout.boardBottom <= portraitLayout.copyTop, 'portrait lesson copy stays below the visible board');
  const cueBounds = await portrait.locator('#onboarding-cue .onboarding-cue-start').boundingBox();
  assert.ok(cueBounds && cueBounds.x >= 0 && cueBounds.x + cueBounds.width <= 390, 'the visual cue realigns with the board after resizing to mobile');
  await portrait.close();

  const skipped = await fixture();
  await skipped.locator('#onboarding-skip').click();
  await skipped.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'home');
  assert.equal(await skipped.evaluate(() => JSON.parse(localStorage.getItem('nodoku.astra.v1')).onboardingCompleted), true, 'Skipping is stored');
  await skipped.close();

  const reduced = await fixture();
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  const reducedBoard = await state(reduced);
  const reducedA = reducedBoard.nodes.find(n => n.id === firstA);
  const reducedB = reducedBoard.nodes.find(n => n.id === firstB);
  await reduced.mouse.click(reducedA.screen.x, reducedA.screen.y);
  await reduced.mouse.click(reducedB.screen.x, reducedB.screen.y);
  await reduced.waitForFunction(() => JSON.parse(window.render_game_to_text()).tutorialSuccess === 'Connection made');
  await reduced.waitForFunction(() => getComputedStyle(document.querySelector('#completion-moment')).opacity === '1');
  assert.equal(await reduced.locator('#completion-moment').evaluate(node => node.getAnimations().length), 0, 'Reduced-motion success stays visible without animation');
  const lockedEdges = (await state(reduced)).edges;
  await reduced.mouse.dblclick(reducedA.screen.x, reducedA.screen.y, { delay: 40 });
  assert.deepEqual((await state(reduced)).edges, lockedEdges, 'Input cannot alter the puzzle during success');
  await reduced.locator('#onboarding-skip').click();
  await reduced.waitForTimeout(1000);
  assert.equal((await state(reduced)).mode, 'home', 'Skipping cancels pending tutorial advancement');
  assert.equal(await reduced.locator('#completion-moment').isHidden(), true);
  await reduced.close();

  const howToPlay = await fixture(false);
  await howToPlay.locator('#help-button').click();
  await howToPlay.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'onboarding');
  assert.equal(await howToPlay.locator('#help-dialog').isVisible(), false, 'How to play starts the guided tutorial instead of a static dialog');
  await howToPlay.locator('#onboarding-skip').click();
  await howToPlay.close();
  assert.deepEqual(errors, []);
  console.log('Passed: skippable first-run 2 by 2 connection lesson, goal explanation, 3D rotation lesson, How to play entry, and persisted completion.');
} finally {
  await browser.close();
}
