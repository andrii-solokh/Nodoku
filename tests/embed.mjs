import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { chromium } from 'playwright';
import { Puzzle } from '../src/puzzle.ts';
import defaults from '../config/game-config.json' with { type: 'json' };
import { followHint } from './helpers/follow-hint.mjs';

const gameUrl = new URL(process.env.TEST_URL || 'http://127.0.0.1:4173');
if (gameUrl.hostname === 'localhost') gameUrl.hostname = '127.0.0.1';
const out = 'output/web-game/embed';
await fs.mkdir(out, { recursive: true });
const editions = [
  { path: '/', name: 'Nodoku', key: 'nodoku.astra.v1', background: defaults.scene.background },
  { path: '/dots/', name: 'Dots', key: 'nodoku.dots.v1', background: '#07070b' },
  { path: '/groks/', name: 'Groks', key: 'nodoku.groks.v1', background: '#0e0f10' },
];
const sizes = [[640, 480], [480, 360], [432, 324], [320, 240]];
const topSettings = { size: 4, depth: 1, difficulty: 'easy', seed: 321 };
const topSave = JSON.stringify({ screen: 'playing', settings: topSettings, game: new Puzzle(topSettings).serialize(), sound: true });
const errors = [];

// localhost and 127.0.0.1 are different origins. These sandbox and allow
// attributes match the nested player iframe observed on X on 2026-10-13.
const server = http.createServer((request, response) => {
  const params = new URL(request.url, 'http://localhost').searchParams;
  if (!params.has('src')) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html><head><title>Player card host</title><style>html,body{margin:0}iframe{display:block;border:0}</style></head><body><iframe title="Nodoku player" width="${Number(params.get('width'))}" height="${Number(params.get('height'))}" src="${params.get('src').replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" sandbox="allow-popups allow-same-origin allow-scripts allow-presentation" allow="autoplay; fullscreen; web-share"></iframe></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const harnessUrl = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const startedAt = Date.now();
const state = frame => frame.evaluate(() => JSON.parse(window.render_game_to_text()));
const settle = async frame => {
  await frame.evaluate(() => new Promise(resolve => window.embedTestFrame(() => window.embedTestFrame(resolve))));
  await frame.evaluate(() => window.advanceTime(1200));
  await frame.page().waitForTimeout(350);
};
const ready = async frame => {
  await frame.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await frame.locator('#app-loader').waitFor({ state: 'detached' });
  // Initial startup and loading must use normal rendering. Afterwards, stop
  // continuous decorative WebGL frames while keeping native layout frames,
  // ResizeObserver and real input active. advanceTime settles camera motion.
  await frame.evaluate(() => {
    window.embedTestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
  });
  await settle(frame);
};

async function fixture(edition, [width, height], {
  game = null, denyStorage = false, nativeVisitor = false, onboardingCompleted = false,
  query = '', expectedMode = 'playing',
} = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 650 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(`${edition.name} ${width}×${height}: ${error.message}`));
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    const json = pathname === '/api/auth/config' ? { enabled: false }
      : pathname === '/api/visitors' ? { count: 1, scope: 'local' }
        : pathname === '/api/sponsorship' ? { available: false, sponsors: [] }
          : pathname === '/api/completions' ? { recorded: true } : {};
    return route.fulfill({ json });
  });
  await page.addInitScript(({ origin, key, topSave, game, denyStorage, nativeVisitor, onboardingCompleted }) => {
    if (location.origin !== origin || new URLSearchParams(location.search).get('embed') !== '1') return;
    // Native first visits must take the onboarding path; automation normally
    // bypasses it so the existing gameplay matrix can exercise the player.
    if (nativeVisitor) Object.defineProperty(navigator, 'webdriver', { get: () => false });
    if (denyStorage) {
      for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, {
        get() { throw new DOMException('Third-party storage is unavailable', 'SecurityError'); },
      });
      return;
    }
    if (sessionStorage.getItem('embed-regression-fixture')) return;
    sessionStorage.setItem('embed-regression-fixture', 'set');
    localStorage.setItem(key, topSave);
    if (game || onboardingCompleted) localStorage.setItem(`${key}.embed`, JSON.stringify({
      screen: game ? 'playing' : 'home', settings: game?.settings, game, sound: false, onboardingCompleted,
    }));
  }, { origin: gameUrl.origin, key: edition.key, topSave, game, denyStorage, nativeVisitor, onboardingCompleted });
  const src = new URL(`${edition.path}?embed=1${query ? `&${query}` : ''}`, gameUrl).href;
  const params = new URLSearchParams({ src, width: String(width), height: String(height) });
  await page.goto(`${harnessUrl}/?${params}`, { waitUntil: 'domcontentloaded' });
  const iframe = page.locator('iframe');
  const frame = await iframe.elementHandle().then(handle => handle.contentFrame());
  await ready(frame);
  assert.notEqual(new URL(page.url()).origin, new URL(frame.url()).origin, 'Player really runs across origins');
  assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument), null, 'Host cannot inspect the player document');
  assert.equal(await frame.locator('html').evaluate(el => el.classList.contains('embedded-player')), true);
  assert.equal((await state(frame)).mode, expectedMode, 'Card opens into the expected player lesson or puzzle');
  assert.equal(await frame.locator('.home-main').isHidden(), true, 'Puzzle setup stays hidden while playing');
  assert.equal(await frame.locator('#account-button, #leaderboard-button').count(), 0, 'Player directs account actions to the full game');
  assert.equal((await state(frame)).config.scene.background, edition.background, 'Edition keeps its theme');
  assert.equal(await frame.locator('#home-button').getAttribute('aria-label'), `${edition.name} home`);
  const open = frame.locator('.embed-open');
  assert.equal(await open.getAttribute('href'), edition.path, 'Full-game link leaves player mode');
  assert.equal(await open.getAttribute('target'), '_blank');
  return { page, frame, iframe };
}

async function layout(frame, label) {
  const overflow = await frame.evaluate(() => ({
    width: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight - innerHeight,
  }));
  assert.ok(overflow.width <= 1 && overflow.height <= 1, `${label}: player has no page overflow (${JSON.stringify(overflow)})`);
  for (const selector of ['#game-stage', '#undo-button', '#hint-button', '[data-rotate="right"]', '#help-button', '.embed-open']) {
    const rect = await frame.locator(selector).evaluate(el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0
      && rect.x + rect.width <= rect.viewportWidth + 1 && rect.y + rect.height <= rect.viewportHeight + 1,
    `${label}: ${selector} stays inside the player (${JSON.stringify(rect)})`);
  }
}

async function clickNode({ page, iframe }, node) {
  const offset = await iframe.boundingBox();
  await page.mouse.click(offset.x + node.screen.x, offset.y + node.screen.y);
}

async function dragNodes({ page, iframe }, a, b) {
  const offset = await iframe.boundingBox();
  await page.mouse.move(offset.x + a.screen.x, offset.y + a.screen.y);
  await page.mouse.down();
  await page.mouse.move(offset.x + b.screen.x, offset.y + b.screen.y, { steps: 8 });
  await page.mouse.up();
}

async function doubleTapNode({ page, iframe }, node) {
  const offset = await iframe.boundingBox();
  await page.mouse.dblclick(offset.x + node.screen.x, offset.y + node.screen.y, { delay: 40 });
}

async function lesson(frame, step) {
  await frame.waitForFunction(expected => document.querySelector('#onboarding-step')?.textContent.startsWith(`${expected} of 8`)
    && JSON.parse(window.render_game_to_text()).tutorialSuccess === null, step, { polling: 50 });
  await settle(frame);
  const params = new URL(frame.url()).searchParams;
  assert.equal(params.get('embed'), '1', 'Lesson transitions retain embedded mode');
  assert.equal(params.get('onboarding'), '1');
  assert.equal(params.get('step'), String(step), 'Player tutorial URL reflects the current lesson');
}

async function tutorialLayout(frame, label, step) {
  const geometry = await frame.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element || element.hidden || getComputedStyle(element).display === 'none') return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      width: innerWidth, height: innerHeight,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      stage: rect('#onboarding-stage'), copy: rect('.onboarding-copy'), skip: rect('#onboarding-skip'),
      title: rect('#onboarding-title'), message: rect('#onboarding-message'),
      controls: rect('#onboarding-turn-controls'), keys: rect('#onboarding-rotation-keys'),
    };
  });
  assert.ok(geometry.overflowX <= 1 && geometry.overflowY <= 1, `${label}: tutorial has no page overflow`);
  for (const name of ['stage', 'copy', 'skip', 'title', 'message', 'controls', 'keys']) {
    const box = geometry[name];
    if (!box) continue;
    assert.ok(box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0
      && box.x + box.width <= geometry.width + 1 && box.y + box.height <= geometry.height + 1,
    `${label}: ${name} stays in the card (${JSON.stringify(box)})`);
  }
  const { stage, copy, controls } = geometry;
  assert.ok(stage.x + stage.width <= copy.x || stage.y + stage.height <= copy.y,
    `${label}: tutorial text leaves the board unobstructed`);
  if (controls) assert.ok(controls.x + controls.width <= copy.x || controls.y + controls.height <= copy.y,
    `${label}: rotation controls leave lesson text unobstructed`);
  const current = await state(frame);
  for (const node of current.nodes.filter(node => node.screen.pickable)) {
    const { x, y, radius } = node.screen;
    assert.ok(x - radius >= stage.x - 1 && x + radius <= stage.x + stage.width + 1
      && y - radius >= stage.y - 1 && y + radius <= stage.y + stage.height + 1,
    `${label}: node ${node.id} stays inside its board`);
  }
  const expectedCue = ['select', 'drag', 'remove', 'double-tap', 'double-tap', 'turn', 'drag', null][step - 1];
  const cue = frame.locator('#onboarding-cue');
  assert.equal(await cue.isVisible(), expectedCue !== null, `${label}: expected gesture cue is visible`);
  if (expectedCue) assert.equal(await cue.evaluate((node, kind) => node.classList.contains(`is-${kind}`), expectedCue), true);
  if (expectedCue === 'turn') {
    const arrow = await cue.locator('.onboarding-cue-turn').evaluate(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    });
    assert.ok(arrow.x >= stage.x - 1 && arrow.y >= stage.y - 1
      && arrow.x + arrow.width <= stage.x + stage.width + 1 && arrow.y + arrow.height <= stage.y + stage.height + 1,
    `${label}: rotation cue stays in the board, clear of the lesson copy (${JSON.stringify(arrow)})`);
  }
  if (expectedCue && expectedCue !== 'turn') {
    for (const selector of ['.onboarding-cue-start', '.onboarding-cue-end']) {
      const ring = cue.locator(selector);
      if (!await ring.isVisible()) continue;
      const bounds = await ring.boundingBox();
      // boundingBox includes the outer iframe offset; evaluate in its own
      // viewport to compare against the game's public screen coordinates.
      const center = await ring.evaluate(node => {
        const box = node.getBoundingClientRect();
        return { id: Number(node.dataset.nodeId), x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
      const target = current.nodes.find(node => node.id === center.id).screen;
      assert.ok(bounds && Math.abs(center.x - target.x) < 1 && Math.abs(center.y - target.y) < 1,
        `${label}: cue remains centered on its node`);
    }
  }
  assert.equal(await frame.locator('#onboarding-turn-controls').isVisible(), step === 6 || step === 8);
  assert.equal(await frame.locator('#onboarding-next').isHidden(), true, `${label}: completion requires a real solved puzzle`);
}

async function cuePair(frame) {
  const ids = await frame.locator('.onboarding-cue-node').evaluateAll(rings => rings.map(ring => Number(ring.dataset.nodeId)));
  const current = await state(frame);
  return ids.map(id => current.nodes.find(node => node.id === id));
}

async function solveTutorial(test, model) {
  // Mirror real gestures in the model to choose a legal remaining move. The
  // browser receives only pointer/rotation input, never puzzle state changes.
  for (let attempt = 0; attempt < 64 && !(await state(test.frame)).solved; attempt++) {
    const current = await state(test.frame);
    const mirror = new Puzzle(current.settings);
    for (const edge of current.edges) assert.equal(mirror.toggle(...edge).changed, true);
    const move = mirror.hint();
    const pair = move.edge?.map(id => current.nodes.find(node => node.id === id));
    if (pair?.every(node => node.screen.pickable)) {
      await dragNodes(test, ...pair);
      await test.frame.waitForFunction(count => JSON.parse(window.render_game_to_text()).edges.length !== count,
        current.edges.length, { polling: 50 });
    } else {
      await test.frame.locator(`[data-onboarding-rotate="${attempt % 4 === 3 ? 'up' : 'right'}"]`).click();
      await settle(test.frame);
    }
  }
  assert.equal((await state(test.frame)).solved, true, `Real gestures solve the ${model} tutorial puzzle`);
  await test.frame.waitForFunction(() => JSON.parse(window.render_game_to_text()).tutorialSuccess === null, null, { polling: 50 });
  await settle(test.frame);
}

async function fullTutorial(test) {
  const { frame } = test;
  await lesson(frame, 1);
  await tutorialLayout(frame, 'Nodoku 640×480 lesson 1', 1);
  const [tapA, tapB] = await cuePair(frame);
  await clickNode(test, tapA);
  assert.equal((await state(frame)).selected, tapA.id, 'The in-tweet tutorial accepts a real first tap');
  await test.page.waitForTimeout(320);
  await clickNode(test, tapB);
  await lesson(frame, 2);
  assert.equal((await state(frame)).edges.length, 1, 'Two taps create the first tutorial connection');
  const dragPair = await cuePair(frame);
  await dragNodes(test, ...dragPair);
  await lesson(frame, 3);
  assert.equal((await state(frame)).edges.length, 2, 'Dragging creates the tutorial connection');
  await dragNodes(test, ...(await cuePair(frame)));
  await lesson(frame, 4);
  assert.equal((await state(frame)).edges.length, 1, 'Dragging the linked pair removes it');
  await doubleTapNode(test, (await cuePair(frame))[0]);
  await lesson(frame, 5);
  assert.ok((await state(frame)).edges.length > 1, 'Double tapping fills actual neighboring connections');
  await solveTutorial(test, 'flat');
  await lesson(frame, 6);
  for (const direction of ['left', 'right', 'up', 'down']) {
    assert.equal((await state(frame)).tutorialRotation, direction);
    assert.equal(await frame.locator('.onboarding-cue-turn').getAttribute('data-direction'), direction);
    await frame.locator(`[data-onboarding-rotate="${direction}"]`).click();
    await frame.waitForFunction(() => JSON.parse(window.render_game_to_text()).tutorialSuccess === null, null, { polling: 50 });
    await settle(frame);
  }
  await lesson(frame, 7);
  await dragNodes(test, ...(await cuePair(frame)));
  await lesson(frame, 8);
  assert.equal((await state(frame)).edges.length, 1, 'The 3D lesson accepts a real connection');
  await solveTutorial(test, 'cube');
  assert.equal(await frame.locator('#onboarding-next').isVisible(), true, 'A solved cube makes Finish tutorial reachable');
  await frame.locator('#onboarding-next').click();
  assert.equal((await state(frame)).mode, 'playing', 'Finishing an in-tweet tutorial starts the full puzzle directly');
  assert.equal((await state(frame)).settings.size, 3);
  assert.equal((await state(frame)).settings.depth, 3);
  assert.equal(new URL(frame.url()).searchParams.get('embed'), '1');
  assert.equal(new URL(frame.url()).searchParams.has('onboarding'), false);
}

async function connect(fixture) {
  const { frame } = fixture;
  const before = await state(frame);
  const visible = before.nodes.filter(node => node.screen.pickable && node.remaining > 0);
  const neighbors = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
  const a = visible.find(node => visible.some(other => neighbors(node, other)));
  const b = visible.find(node => neighbors(a, node));
  assert.ok(a && b, 'A visible neighboring pair is playable');
  await clickNode(fixture, a);
  assert.equal((await state(frame)).selected, a.id, 'Click selects a real node in the iframe');
  await fixture.page.waitForTimeout(320);
  await clickNode(fixture, b);
  await fixture.page.waitForTimeout(320);
  assert.equal((await state(frame)).edges.length, before.edges.length + 1, 'Second click connects the real graph');
}

try {
  // Exercise real visitor startup in the exact cross-origin X sandbox. A
  // completed tutorial is recorded per edition in the isolated player save.
  for (const edition of editions) {
    const test = await fixture(edition, [640, 480], { nativeVisitor: true, expectedMode: 'onboarding' });
    if (edition === editions[0]) await fullTutorial(test);
    else {
      await lesson(test.frame, 1);
      await tutorialLayout(test.frame, `${edition.name} native first visit`, 1);
      await test.frame.locator('#onboarding-skip').click();
    }
    const playing = await state(test.frame);
    assert.equal(playing.mode, 'playing', 'Skipping or completing the tutorial starts the player puzzle');
    assert.equal(await test.frame.evaluate(key => JSON.parse(localStorage.getItem(`${key}.embed`)).onboardingCompleted, edition.key), true);
    assert.equal(await test.frame.evaluate(key => localStorage.getItem(key), edition.key), topSave, 'Native tutorial leaves the full-game save intact');
    await connect(test);
    const saved = await state(test.frame);
    await test.frame.goto(test.frame.url(), { waitUntil: 'domcontentloaded' });
    await ready(test.frame);
    assert.equal((await state(test.frame)).mode, 'playing', 'Completed native tutorial reload resumes gameplay');
    assert.deepEqual((await state(test.frame)).edges, saved.edges);
    await test.page.close();
    console.log(`${edition.name}: native first-visit tutorial, exit to play, completion persistence and reload passed`);
  }

  const existingPuzzle = new Puzzle({ size: 3, depth: 3, difficulty: 'easy', seed: 91 });
  existingPuzzle.toggle(...existingPuzzle.solution[0]);
  const returning = await fixture(editions[0], [640, 480], {
    nativeVisitor: true, game: existingPuzzle.serialize(), expectedMode: 'onboarding',
  });
  await returning.frame.locator('#onboarding-skip').click();
  assert.deepEqual((await state(returning.frame)).edges, existingPuzzle.edges,
    'Existing player saves without tutorial completion get the lesson and resume the same graph');
  assert.equal((await state(returning.frame)).settings.seed, 91);
  await returning.page.close();

  const interrupted = await fixture(editions[0], [640, 480], {
    nativeVisitor: true, game: existingPuzzle.serialize(), onboardingCompleted: true,
  });
  await interrupted.frame.locator('[data-rotate="right"]').click();
  await settle(interrupted.frame);
  await clickNode(interrupted, (await state(interrupted.frame)).nodes.find(node => node.screen.pickable && node.remaining > 0));
  const original = await state(interrupted.frame);
  const originalSave = await interrupted.frame.evaluate(key => JSON.parse(localStorage.getItem(`${key}.embed`)), editions[0].key);
  await interrupted.frame.locator('#help-button').click();
  await lesson(interrupted.frame, 1);
  const partialPair = await cuePair(interrupted.frame);
  await clickNode(interrupted, partialPair[0]);
  await interrupted.page.waitForTimeout(320);
  await clickNode(interrupted, partialPair[1]);
  await lesson(interrupted.frame, 2);
  await interrupted.frame.goto(interrupted.frame.url(), { waitUntil: 'domcontentloaded' });
  await ready(interrupted.frame);
  await lesson(interrupted.frame, 2);
  const reloadedSave = await interrupted.frame.evaluate(key => JSON.parse(localStorage.getItem(`${key}.embed`)), editions[0].key);
  assert.deepEqual(reloadedSave.game, originalSave.game, 'Reloading a lesson preserves the real saved game instead of the lesson graph');
  assert.deepEqual(reloadedSave.view, originalSave.view, 'Reloading a lesson preserves the real saved puzzle orientation');
  assert.equal(reloadedSave.selected, original.selected, 'Reloading a lesson preserves the real selected node');
  assert.equal(reloadedSave.attemptId, originalSave.attemptId, 'Reloading a lesson preserves the real puzzle attempt');
  await interrupted.frame.locator('#onboarding-skip').click();
  assert.deepEqual((await state(interrupted.frame)).edges, original.edges, 'Skip after an interrupted tutorial restores the real connections');
  assert.deepEqual((await state(interrupted.frame)).view.direction, original.view.direction, 'Skip after an interrupted tutorial restores the real orientation');
  assert.equal((await state(interrupted.frame)).selected, original.selected, 'Skip after an interrupted tutorial restores the real selected node');
  assert.equal((await state(interrupted.frame)).settings.seed, 91);
  await interrupted.frame.locator('#help-button').click();
  await lesson(interrupted.frame, 1);
  await interrupted.frame.goto(new URL('/?embed=1', gameUrl).href, { waitUntil: 'domcontentloaded' });
  await ready(interrupted.frame);
  assert.equal((await state(interrupted.frame)).mode, 'playing', 'A completed visitor reopening a normal embed resumes the real game after an interrupted lesson');
  assert.deepEqual((await state(interrupted.frame)).edges, original.edges);
  assert.deepEqual((await state(interrupted.frame)).view.direction, original.view.direction);
  assert.equal((await state(interrupted.frame)).selected, original.selected);
  assert.equal(await interrupted.frame.evaluate(key => JSON.parse(localStorage.getItem(`${key}.embed`)).attemptId, editions[0].key), originalSave.attemptId);
  await interrupted.page.close();

  const solvedPuzzle = new Puzzle({ size: 3, depth: 3, difficulty: 'easy', seed: 92 });
  for (const edge of solvedPuzzle.solution) solvedPuzzle.toggle(...edge);
  const solvedHelp = await fixture(editions[0], [640, 480], {
    nativeVisitor: true, game: solvedPuzzle.serialize(), onboardingCompleted: true,
  });
  assert.equal((await state(solvedHelp.frame)).solved, true);
  await solvedHelp.frame.locator('#help-button').click();
  await lesson(solvedHelp.frame, 1);
  await solvedHelp.frame.locator('#onboarding-skip').click();
  assert.equal((await state(solvedHelp.frame)).solved, true, 'Help exit preserves an already solved embedded puzzle');
  assert.equal((await state(solvedHelp.frame)).settings.seed, 92);
  assert.deepEqual((await state(solvedHelp.frame)).edges, solvedPuzzle.edges);
  await solvedHelp.frame.locator('#help-button').click();
  await lesson(solvedHelp.frame, 1);
  await solvedHelp.frame.goto(solvedHelp.frame.url(), { waitUntil: 'domcontentloaded' });
  await ready(solvedHelp.frame);
  await lesson(solvedHelp.frame, 1);
  await solvedHelp.frame.locator('#onboarding-skip').click();
  assert.equal((await state(solvedHelp.frame)).solved, true, 'Reload and Skip preserve the completed real puzzle instead of discarding it');
  assert.equal((await state(solvedHelp.frame)).settings.seed, 92);
  assert.deepEqual((await state(solvedHelp.frame)).edges, solvedPuzzle.edges);
  await solvedHelp.page.close();

  for (const edition of editions) for (const size of [[640, 480], [320, 240]]) {
    const test = await fixture(edition, size, {
      query: 'onboarding=1&step=1', onboardingCompleted: true, expectedMode: 'onboarding',
    });
    const lessonSteps = edition.name === 'Nodoku' && size[0] === 320 ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 5, 6, 8];
    for (const step of lessonSteps) {
      if (step !== 1) {
        await test.frame.goto(new URL(`${edition.path}?embed=1&onboarding=1&step=${step}`, gameUrl).href, { waitUntil: 'domcontentloaded' });
        await ready(test.frame);
      }
      await lesson(test.frame, step);
      await tutorialLayout(test.frame, `${edition.name} ${size.join('×')} lesson ${step}`, step);
      if ([1, 6, 8].includes(step)) await test.page.screenshot({ path: `${out}/${edition.name.toLowerCase()}-tutorial-${size[0]}-step-${step}.png` });
      if (step === 6) {
        for (const direction of ['left', 'right', 'up', 'down']) {
          assert.equal((await state(test.frame)).tutorialRotation, direction);
          await tutorialLayout(test.frame, `${edition.name} ${size.join('×')} turn ${direction}`, step);
          await test.frame.locator(`[data-onboarding-rotate="${direction}"]`).click();
          await test.frame.waitForFunction(() => JSON.parse(window.render_game_to_text()).tutorialSuccess === null, null, { polling: 50 });
          await settle(test.frame);
        }
      }
      if (step === 8 && edition.name === 'Groks' && size[0] === 320) {
        await solveTutorial(test, 'compact Groks cube');
        const finish = test.frame.locator('#onboarding-next');
        assert.equal(await finish.isVisible(), true, 'Smallest Groks player makes Finish tutorial reachable after solving');
        const box = await finish.evaluate(node => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        });
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= size[0] && box.y + box.height <= size[1],
          'Smallest player keeps the solved tutorial Finish button inside the viewport');
        await test.page.screenshot({ path: `${out}/groks-tutorial-320-finished.png` });
        await finish.click();
        assert.equal((await state(test.frame)).mode, 'playing', 'Finishing the smallest tutorial opens the real player puzzle');
      }
    }
    if ((await state(test.frame)).mode === 'onboarding') await test.frame.locator('#onboarding-skip').click();
    assert.equal((await state(test.frame)).mode, 'playing', 'Explicit lesson links exit directly into embedded gameplay');
    assert.equal(new URL(test.frame.url()).searchParams.get('embed'), '1');
    await test.page.close();
    console.log(`${edition.name} ${size.join('×')}: tutorial links ${lessonSteps.join(', ')}, cues, board and control layout passed`);
  }

  for (const edition of editions) for (const size of sizes) {
    const test = await fixture(edition, size);
    const { page, frame } = test;
    const label = `${edition.name} ${size.join('×')}`;
    assert.equal((await state(frame)).audio.soundEnabled, false, 'Fresh cards are muted');
    const freshSettings = (await state(frame)).settings;
    assert.deepEqual({ size: freshSettings.size, depth: freshSettings.depth, difficulty: freshSettings.difficulty },
      { size: 3, depth: 3, difficulty: 'easy' }, 'Player ignores the top-level saved puzzle and uses fresh defaults');
    await layout(frame, label);
    await connect(test);
    await frame.locator('#undo-button').click();
    assert.equal((await state(frame)).edges.length, 0, 'Undo remains usable inside the card');
    await frame.locator('#redo-button').click();
    assert.equal((await state(frame)).edges.length, 1);
    const beforeRotation = (await state(frame)).view.direction;
    await frame.locator('[data-rotate="right"]').click();
    await settle(frame);
    assert.notDeepEqual((await state(frame)).view.direction, beforeRotation, 'Rotation is usable inside the card');
    const persisted = await state(frame);
    assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave, 'Player leaves top-level save intact');
    await frame.goto(frame.url(), { waitUntil: 'domcontentloaded' });
    await ready(frame);
    assert.deepEqual((await state(frame)).edges, persisted.edges, 'Card reload restores its connections');
    assert.deepEqual((await state(frame)).view.direction, persisted.view.direction, 'Card reload restores its orientation');
    assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave);
    await frame.locator('#help-button').click();
    await lesson(frame, 1);
    assert.equal((await state(frame)).mode, 'onboarding', 'Help opens the full interactive player tutorial');
    assert.equal(await frame.locator('#help-dialog').isVisible(), false, 'Help uses the guided lesson');
    await frame.locator('#onboarding-skip').click();
    assert.equal((await state(frame)).mode, 'playing');
    assert.deepEqual((await state(frame)).edges, persisted.edges, 'Leaving Help restores the same saved puzzle connections');
    assert.deepEqual((await state(frame)).view.direction, persisted.view.direction, 'Leaving Help restores the saved puzzle orientation');
    await layout(frame, `${label} after help`);
    await page.screenshot({ path: `${out}/${edition.name.toLowerCase()}-${size[0]}.png` });
    if (size[0] === 640) {
      await frame.locator('#home-button').click();
      await frame.locator('[data-depth="flat"]').click();
      await frame.locator('#start-button').click();
      await settle(frame);
      assert.equal((await state(frame)).settings.depth, 1, 'Home setup can start a flat player puzzle');
      assert.equal(await frame.locator('.home-main').isHidden(), true);
      assert.equal(await frame.locator('.rotation-tools').isHidden(), true, 'Flat puzzles keep rotation controls hidden');
      await connect(test);
      assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave, 'Flat setup also preserves the full-game save');
    }
    await page.close();
    console.log(`${label}: sandbox, theme, clicks, undo/redo, rotation, help, reload and isolated save passed`);
  }

  // Use the real puzzle model to get within one move of completion, then make
  // the suggested final move through browser pointer input in the iframe.
  for (const edition of editions) {
    const puzzle = new Puzzle({ size: 3, depth: 3, difficulty: 'easy', seed: 17 });
    for (const edge of puzzle.solution.slice(0, -1)) puzzle.toggle(...edge);
    const test = await fixture(edition, [320, 240], { game: puzzle.serialize() });
    const { page, frame, iframe } = test;
    await followHint({
      waitForFunction: (predicate, arg) => frame.waitForFunction(predicate, arg, { polling: 50 }),
      evaluate: frame.evaluate.bind(frame),
      locator: frame.locator.bind(frame),
      mouse: { click: async (x, y) => {
        const offset = await iframe.boundingBox();
        await page.mouse.click(offset.x + x, offset.y + y);
      } },
    });
    const completion = frame.locator('#completion-dialog');
    await completion.waitFor();
    assert.equal((await state(frame)).solved, true);
    assert.equal(await completion.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Completion does not overflow horizontally');
    await frame.locator('#next-button').click();
    assert.equal((await state(frame)).solved, false, 'Next puzzle is reachable even in the smallest card');
    assert.notEqual((await state(frame)).settings.seed, 17);
    await layout(frame, `${edition.name} after completion`);
    assert.equal(await frame.evaluate(key => localStorage.getItem(key), edition.key), topSave);
    await page.close();
  }

  for (const edition of editions) {
    const test = await fixture(edition, [480, 360], { denyStorage: true });
    await connect(test);
    await test.frame.locator('#undo-button').click();
    assert.equal((await state(test.frame)).edges.length, 0, 'Gameplay works when third-party storage is denied');
    await layout(test.frame, `${edition.name} with denied storage`);
    await test.page.close();
  }
  const deniedTutorial = await fixture(editions[0], [320, 240], {
    denyStorage: true, nativeVisitor: true, expectedMode: 'onboarding',
  });
  await deniedTutorial.frame.locator('#onboarding-skip').click();
  assert.equal((await state(deniedTutorial.frame)).mode, 'playing', 'The native tutorial can exit when third-party storage is denied');
  await connect(deniedTutorial);
  await deniedTutorial.page.close();
  assert.deepEqual(errors, [], 'No uncaught browser errors in player frames');
  console.log(`Passed: completion and next puzzle in all editions; denied third-party storage; no browser errors (${((Date.now() - startedAt) / 1000).toFixed(1)}s).`);
} catch (error) {
  console.error(error);
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    console.error('Player failure:', JSON.stringify(await Promise.all(page.frames().map(async frame => ({
      url: frame.url(), text: await frame.locator('body').innerText().catch(() => ''),
    })))));
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  }
  throw error;
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2)).catch(error => console.error('Could not write browser error artifact:', error.message));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
