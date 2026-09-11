import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const url = process.env.TEST_URL || "http://127.0.0.1:4173";
const out = "output/web-game/perspective";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const state = async (page) =>
  JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const settle = async (page) => page.evaluate(() => window.advanceTime(600));
const axis = (v) => v.map((n) => Math.round(n)).join(",");
function checkFace(s) {
  assert.equal(s.view.projection, "perspective");
  assert.equal(s.view.animating, false);
  assert.equal(s.view.snapped, true);
  for (const vector of [s.view.direction, s.view.up]) {
    assert.ok(
      vector.every((n) => Math.abs(n - Math.round(n)) < 1e-6),
      "face directions lie exactly on axes",
    );
    assert.equal(
      vector.reduce((sum, n) => sum + Math.abs(Math.round(n)), 0),
      1,
      "one axis per basis vector",
    );
  }
  assert.ok(
    Math.abs(
      s.view.direction.reduce((sum, n, i) => sum + n * s.view.up[i], 0),
    ) < 1e-6,
    "face is upright and square",
  );
}
function checkFit(s, board, label) {
  for (const node of s.nodes) {
    assert.ok(
      node.screen.x - node.screen.radius >= board.x && node.screen.x + node.screen.radius <= board.x + board.width,
      `${label}: node ${node.id} fits width including its radius`,
    );
    assert.ok(
      node.screen.y - node.screen.radius >= board.y && node.screen.y + node.screen.radius <= board.y + board.height,
      `${label}: node ${node.id} fits height including its radius`,
    );
  }
}
async function emptyBoardPoint(page, s, board) {
  for (const xFraction of [.08, .18, .82, .92, .5]) {
    for (const yFraction of [.1, .22, .78, .9, .5]) {
      const x = board.x + board.width * xFraction;
      const y = board.y + board.height * yFraction;
      const isCanvas = await page.evaluate(({ x, y }) =>
        document.elementFromPoint(x, y) === document.querySelector("#game-stage canvas"), { x, y });
      if (isCanvas && s.nodes.every(node => Math.hypot(node.screen.x - x, node.screen.y - y) > node.screen.radius + 32))
        return { x, y };
    }
  }
  throw new Error("No empty board point available for a rotation gesture");
}
async function checkConstantRotationDistance(page, label) {
  const board = await page.locator("#game-stage canvas").boundingBox();
  const normalDistance = (await state(page)).view.distance;
  const animated = await page.evaluate(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  for (const zoomed of [false, true]) {
    if (zoomed) {
      await page.locator("#game-stage canvas").focus();
      for (let press = 0; press < 16; press++) await page.keyboard.press("+");
    }
    const distance = (await state(page)).view.distance;
    const context = `${label}, ${zoomed ? "user zoom" : "default zoom"}`;
    if (zoomed)
      assert.ok(distance <= normalDistance, `${context}: zoom never moves the camera farther away`);
    const check = (s) => {
      if (!zoomed)
        assert.ok(
          Math.abs(s.view.distance - distance) < 1e-8,
          `${context}: rotation preserves default camera distance (${distance} -> ${s.view.distance})`,
        );
      checkFit(s, board, context);
    };
    check(await state(page));
    // Sample free rotation while the pointer remains down, before face snapping.
    await page.mouse.move(board.x + 8, board.y + 8);
    await page.mouse.down();
    for (const amount of [0.2, 0.35, 0.5]) {
      await page.mouse.move(
        board.x + board.width * amount,
        board.y + 8 + board.height * amount * 0.3,
      );
      const dragging = await state(page);
      assert.equal(dragging.view.snapped, false, `${context}: sample is mid-drag`);
      check(dragging);
    }
    await page.mouse.up();
    await settle(page);
    check(await state(page));
    // Dispatch and advance in one browser task to sample an animated quarter turn.
    const turning = await page.evaluate(() => {
      document.querySelector('[data-rotate="right"]').click();
      window.advanceTime(90);
      return JSON.parse(window.render_game_to_text());
    });
    if (animated) {
      assert.equal(turning.view.animating, true, `${context}: quarter turn is in progress`);
      assert.equal(turning.view.snapped, false, `${context}: quarter-turn sample is between faces`);
    }
    check(turning);
    await settle(page);
    const turned = await state(page);
    checkFace(turned);
    check(turned);
  }
  await page.locator("#view-button").click();
  await settle(page);
}
const newPage = async (options) => {
  const page = await browser.newPage(options);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  return page;
};
try {
  const page = await newPage({ viewport: { width: 1440, height: 960 } });
  await page.screenshot({ path: `${out}/home.png`, fullPage: true });
  await page.locator("#start-button").click();
  await settle(page);
  let s = await state(page);
  checkFace(s);
  const originalDirection = s.view.direction,
    originalUp = s.view.up;
  const visibleFaces = new Set([axis(s.view.direction)]);
  // A real perspective projection makes the near edge larger than the far edge.
  const node = (id) => s.nodes.find((n) => n.id === id).screen;
  assert.ok(
    Math.abs(node(20).x - node(18).x) > Math.abs(node(2).x - node(0).x) * 1.08,
    "near face appears larger than far face",
  );
  for (let n = 0; n < 4; n++) {
    await page.locator('[data-rotate="right"]').click();
    await settle(page);
    s = await state(page);
    checkFace(s);
    visibleFaces.add(axis(s.view.direction));
    await page.screenshot({ path: `${out}/side-${n}.png` });
  }
  assert.equal(
    axis(s.view.direction),
    axis(originalDirection),
    "four horizontal turns restore view",
  );
  assert.equal(axis(s.view.up), axis(originalUp));
  for (let n = 0; n < 4; n++) {
    await page.keyboard.press("ArrowUp");
    await settle(page);
    s = await state(page);
    checkFace(s);
    visibleFaces.add(axis(s.view.direction));
  }
  assert.equal(visibleFaces.size, 6, "all six cube faces are reachable");
  assert.equal(
    axis(s.view.direction),
    axis(originalDirection),
    "four vertical turns restore view",
  );
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await settle(page);
  s = await state(page);
  checkFace(s);
  assert.equal(
    axis(s.view.direction),
    axis(originalDirection),
    "rapid queued turns accumulate",
  );
  const canvas = await page.locator("#game-stage canvas").boundingBox();
  await page.keyboard.press("ArrowRight");
  await page.evaluate(() => window.advanceTime(70));
  await page.mouse.click(canvas.x + 15, canvas.y + 75);
  await settle(page);
  checkFace(await state(page));
  await page.locator("#view-button").click();
  await settle(page);
  const emptyPoint = await emptyBoardPoint(page, await state(page), canvas);
  await page.mouse.move(emptyPoint.x, emptyPoint.y);
  await page.mouse.down();
  await page.mouse.move(emptyPoint.x + 180, emptyPoint.y + 60, { steps: 12 });
  assert.equal(
    (await state(page)).view.snapped,
    false,
    "drag can show intermediate perspective",
  );
  await page.screenshot({ path: `${out}/dragging.png` });
  await page.mouse.up();
  await settle(page);
  s = await state(page);
  checkFace(s);
  assert.notEqual(
    axis(s.view.direction),
    axis(originalDirection),
    "drag crosses onto next face",
  );
  // Picking still reaches the correct visible sphere after camera changes.
  const a = s.nodes.find(
    (n) =>
      n.screen.pickable &&
      s.nodes.some(
        (b) =>
          b.screen.pickable &&
          Math.abs(n.x - b.x) + Math.abs(n.y - b.y) + Math.abs(n.z - b.z) === 1,
      ),
  );
  const b = s.nodes.find(
    (n) =>
      n.screen.pickable &&
      Math.abs(n.x - a.x) + Math.abs(n.y - a.y) + Math.abs(n.z - a.z) === 1,
  );
  await page.mouse.click(a.screen.x, a.screen.y);
  await page.waitForTimeout(320);
  assert.equal((await state(page)).selected, a.id);
  await page.mouse.click(b.screen.x, b.screen.y);
  await page.waitForTimeout(320);
  assert.equal((await state(page)).edges.length, 1);
  await page.locator("#hint-button").click();
  await settle(page);
  checkFace(await state(page));
  await page.locator("#view-button").click();
  await settle(page);
  s = await state(page);
  checkFace(s);
  assert.equal(axis(s.view.direction), axis(originalDirection));
  await page.screenshot({ path: `${out}/front-desktop.png`, fullPage: true });
  await page.locator("#home-button").click();
  await page.locator('[data-depth="flat"]').click();
  await page.locator("#start-button").click();
  if ((await state(page)).dialog === "confirm-dialog")
    await page.locator("#confirm-button").click();
  await page.locator('[data-rotate="up"]').click();
  await settle(page);
  s = await state(page);
  checkFace(s);
  assert.equal(
    axis(s.view.direction),
    axis(originalDirection),
    "flat board never stops edge-on",
  );
  await page.close();
  const desktopCube = await newPage({ viewport: { width: 1440, height: 960 } });
  await desktopCube.locator('[data-size="5"]').click();
  await desktopCube.locator("#start-button").click();
  await settle(desktopCube);
  await checkConstantRotationDistance(desktopCube, "5 cube desktop");
  await desktopCube.close();
  // Fit checks include largest cube and the narrow/short mobile layouts.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const mobile = await newPage({
      viewport,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await mobile.locator('[data-size="5"]').tap();
    await mobile.locator("#start-button").tap();
    s = await state(mobile);
    checkFace(s);
    await checkConstantRotationDistance(mobile, `5 cube mobile ${viewport.width}x${viewport.height}`);
    await mobile.locator('[data-rotate="up"]').tap();
    s = await state(mobile);
    checkFace(s);
    assert.notEqual(axis(s.view.direction), axis(originalDirection));
    await mobile.screenshot({
      path: `${out}/mobile-${viewport.width}.png`,
      fullPage: true,
    });
    await mobile.close();
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Passed: perspective near/far scale, six square faces, 90° steps, rapid turns, free drag/snap, safe maximum zoom through turns, mid-turn desktop/mobile fit, picking, hints, reset, flat mode, reduced motion.",
  );
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
}
