import { followHint } from './helpers/follow-hint.mjs';
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const out = "output/web-game/home-demo";
const url = process.env.TEST_URL || "http://127.0.0.1:4173";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const watch = page => {
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
};
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const sameDistance = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, message);
const animating = s => s.view.animating || s.shapeTransition || s.connectionAnimations.length
  || s.dotAnimations.some(node => node.active) || s.gum.pulses.length;
const connection = async page => {
  let s = await state(page);
  const count = s.edges.length;
  const rhythm = s.config.demo.timingMode === "melody" && s.config.sound.connectionMelody !== "classic";
  while (animating(s) && (!rhythm || s.shapeTransition || !count)) {
    await advance(page, 40);
    s = await state(page);
    assert.equal(s.edges.length, count, "the next connection waits for the current animations");
  }
  const edge = s.demo.nextEdge;
  const remainingBefore = new Map(edge.map(id => [id, s.nodes.find(node => node.id === id).remaining]));
  await advance(page, Math.max(1, s.demo.delayMs));
  s = await state(page);
  assert.equal(s.edges.length, count + 1, "the due step connects immediately as its turn starts");
  assert.deepEqual(s.edges.at(-1), edge);
  assert.equal(s.demo.phase, s.solved ? "complete" : "waiting");
  for (const id of edge) {
    assert.equal(s.nodes.find(node => node.id === id).remaining, remainingBefore.get(id) - 1, "clues update in the same step");
  }
  if (rhythm) return s;
  const reducedMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (s.config.scene.connectionMs > 0 && !reducedMotion) {
    const growth = s.connectionAnimations.find(animation => animation.edge.join(":") === edge.join(":"));
    assert.ok(growth, "the connection animates during the turn");
    assert.equal(growth.progress, 0, "rod animation starts immediately with the model connection");
    const waiting = s.demo.delayMs;
    await advance(page, growth.durationMs / 2);
    s = await state(page);
    const midGrowth = s.connectionAnimations.find(animation => animation.edge.join(":") === edge.join(":"));
    assert.ok(midGrowth.progress > 0 && midGrowth.progress < 1, "the rod grows while the camera may still be turning");
    assert.equal(s.demo.delayMs, waiting, "the next step timer stays frozen during these animations");
    assert.equal(s.edges.length, count + 1);
  } else assert.deepEqual(s.connectionAnimations, [], "reduced motion reveals rods immediately");
  while (animating(s)) {
    await advance(page, 40);
    s = await state(page);
    assert.equal(s.edges.length, count + 1, "one connection per step, even during overlapping animations");
  }
  for (const id of edge) assert.equal(s.nodes.find(node => node.id === id).screen.visible, true, `endpoint ${id} is visible after the turn`);
  return s;
};

try {
  const live = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  watch(live);
  await live.goto(url, { waitUntil: "domcontentloaded" });
  await live.waitForFunction(() => JSON.parse(window.render_game_to_text()).demo?.connected >= 2);
  assert.equal((await state(live)).mode, "home", "actual animation runs on the home page");
  assert.equal(await live.locator('#demo-toggle').count(), 0, 'Preview has no pause/resume button');
  const connected = (await state(live)).demo.connected;
  await live.waitForFunction(count => JSON.parse(window.render_game_to_text()).demo.connected > count, connected);
  await live.screenshot({ path: `${out}/home-autoplay.png` });
  await live.close();

  if (process.argv.includes('--autoplay-smoke')) {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    watch(mobile);
    await mobile.goto(url, { waitUntil: 'domcontentloaded' });
    await mobile.waitForFunction(() => JSON.parse(window.render_game_to_text()).demo?.connected >= 2);
    assert.equal(await mobile.locator('#demo-toggle').count(), 0);
    const connected = (await state(mobile)).demo.connected;
    await mobile.waitForFunction(count => JSON.parse(window.render_game_to_text()).demo.connected > count, connected);
    await mobile.screenshot({ path: `${out}/mobile-autoplay.png`, fullPage: true });
    await mobile.close();
    assert.deepEqual(errors, []);
    console.log('Passed: automatic desktop/mobile preview progresses without pause/resume controls');
  } else {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  watch(page);
  // Drive the app's explicit time hook without competing real-time animation frames.
  await page.addInitScript(() => { window.requestAnimationFrame = () => 1; window.cancelAnimationFrame = () => {}; });
  await page.goto(url);
  // The deterministic fixture freezes the loader dismissal frames too.
  await page.evaluate(() => document.getElementById("app-loader")?.remove());
  assert.equal((await state(page)).edges.length, 0, "preview starts empty");
  let s;
  do { s = await connection(page); } while (!s.solved);
  assert.equal(s.demo.phase, "complete");
  assert.equal(s.progress, 1);
  assert.equal(s.nodes.every(node => node.remaining === 0), true);
  await page.screenshot({ path: `${out}/home-solved.png` });
  while ((await state(page)).connectionAnimations.length || (await state(page)).dotAnimations.some(node => node.active)) await advance(page, 40);
  await advance(page, 1500);
  assert.equal((await state(page)).solved, true, "finished result stays visible");
  await advance(page, (await state(page)).demo.delayMs);
  assert.equal((await state(page)).edges.length, 0, "demo replays from empty");

  await page.locator('#help-button').click();
  const suspended = (await state(page)).demo;
  await advance(page, 5000);
  assert.deepEqual((await state(page)).demo, suspended, "open dialogs suspend the demo");
  await page.keyboard.press("Escape");
  await connection(page);
  const savedBefore = await page.evaluate(() => localStorage.getItem("nodoku.astra.v1"));
  await connection(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("nodoku.astra.v1")), savedBefore, "demo moves never update the player's save");

  const canvas = await page.locator('#home-stage canvas').boundingBox();
  const beforeRotation = await state(page);
  const count = beforeRotation.edges.length;
  const distance = beforeRotation.view.distance;
  await page.locator('#home-stage canvas').hover();
  await page.mouse.wheel(0, -2000);
  sameDistance((await state(page)).view.distance, distance, "the landing preview ignores wheel zoom");
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 80, canvas.y + canvas.height / 2 + 10, { steps: 5 });
  const manuallyRotated = await state(page);
  assert.notDeepEqual(manuallyRotated.view.direction, beforeRotation.view.direction, "the landing preview can still rotate");
  sameDistance(manuallyRotated.view.distance, distance, "rotating the landing preview cannot change its zoom");
  await advance(page, 5000);
  const duringRotation = await state(page);
  sameDistance(duringRotation.view.distance, distance, "rotating the landing preview cannot change its zoom");
  assert.ok(duringRotation.edges.length > count, "held rotation does not suspend auto-solving");
  await page.mouse.up();
  await connection(page);

  await page.locator('[data-size="5"]').click();
  assert.equal((await state(page)).edges.length, 0, "setting change starts a fresh demo");
  for (let i = 0; i < 12; i++) await connection(page);
  await page.screenshot({ path: `${out}/large-demo.png` });
  await page.locator('#start-button').click();
  assert.equal((await state(page)).demo, null);
  await advance(page, 12000);
  assert.equal((await state(page)).edges.length, 0, "home scheduler cannot play the user's game");
  await followHint(page);
  const played = (await state(page)).edges;
  await page.locator('#home-button').click();
  await connection(page);
  await page.locator('#resume-button').click();
  assert.deepEqual((await state(page)).edges, played, "resume keeps only the player's moves");
  await page.locator('#home-button').click();
  await page.locator('[data-depth="flat"]').click();
  await page.locator('[data-size="4"]').click();
  do { s = await connection(page); } while (!s.solved);
  assert.equal(s.nodes.length, 16);
  await page.screenshot({ path: `${out}/flat-solved.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-depth="3d"]').click();
  await connection(page);
  await page.screenshot({ path: `${out}/mobile-demo.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile preview has no horizontal overflow");
  assert.equal(await page.locator('#demo-toggle').count(), 0, 'Mobile preview has no pause/resume button');
  await connection(page);
  const reduced = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" });
  watch(reduced);
  await reduced.addInitScript(() => { window.requestAnimationFrame = () => 1; window.cancelAnimationFrame = () => {}; });
  await reduced.goto(url);
  await connection(reduced);
  assert.deepEqual((await state(reduced)).connectionAnimations, [], "actual reduced-motion scene has no growing rods");
  await reduced.close();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("Passed: automatic real-time demo, simultaneous turn and connection, fixed preview zoom, uninterrupted manual rotation, immediate clues and rod growth, complete hold, reduced motion, visible endpoints, one edge per step, full cube/flat solutions, replay, dialogs, settings changes, player save isolation, start/resume, large cube, mobile layout, and no browser errors.");
  }
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
}
