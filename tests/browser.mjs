import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const url = process.env.TEST_URL || "http://127.0.0.1:5173";
const out = "output/web-game/astra-checks";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
};
const state = async (page) =>
  JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const settle = async (page) => {
  await page.evaluate(() => window.advanceTime(400));
};
const checkGameLayout = async (page, label, sideControls = false) => {
  const layout = await page.evaluate(() => {
    const bounds = (element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const groups = [...document.querySelectorAll(".tools-group, .rotation-tools")];
    const controls = [...document.querySelectorAll(
      "#home-button, #help-button, #sound-button, #undo-button, #redo-button, #restart-button, #hint-button, #view-button, [data-rotate]",
    )];
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      canvas: bounds(document.querySelector("#game-stage canvas")),
      items: [...groups, ...controls].map((element) => ({
        name: element.id || element.dataset.rotate || element.className,
        ...bounds(element),
      })),
      groups: groups.map(bounds),
    };
  });
  assert.ok(
    layout.canvas.height >= layout.height - 70,
    `${label}: canvas uses the viewport below the compact header`,
  );
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: no horizontal page scroll`);
  assert.ok(layout.scrollHeight <= layout.height + 1, `${label}: no vertical page scroll`);
  for (const item of layout.items) {
    assert.ok(item.width > 0 && item.height > 0, `${label}: ${item.name} is visible`);
    assert.ok(
      item.x >= -1 && item.y >= -1 &&
      item.x + item.width <= layout.width + 1 &&
      item.y + item.height <= layout.height + 1,
      `${label}: ${item.name} stays inside the viewport`,
    );
  }
  if (sideControls) {
    const centralLeft = layout.canvas.x + layout.canvas.width * 0.25;
    const centralRight = layout.canvas.x + layout.canvas.width * 0.75;
    for (const group of layout.groups)
      assert.ok(
        group.x + group.width <= centralLeft || group.x >= centralRight,
        `${label}: control groups leave the central half of the board clear`,
      );
  }
};
const adjacent = (a, b) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
const pair = (s) => {
  const depth = (node) =>
    [node.x, node.y, node.z].reduce((sum, value, index) => sum + value * s.view.direction[index], 0);
  // Prefer front-face endpoints: a new depth rod can obscure a rear node's center.
  const visible = s.nodes.filter((n) => n.screen.pickable).sort((a, b) => depth(b) - depth(a));
  for (const a of visible) {
    const b = visible.find((n) => adjacent(a, n));
    if (b) return [a, b];
  }
  throw new Error("No visible adjacent pair");
};
const connect = async (page, [a, b]) => {
  await page.mouse.click(a.screen.x, a.screen.y);
  await page.waitForTimeout(320);
  assert.equal(
    (await state(page)).selected,
    a.id,
    "first node picks correctly",
  );
  await page.mouse.click(b.screen.x, b.screen.y);
  await page.waitForTimeout(320);
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  watch(page);
  await page.goto(url);
  await page.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await page.screenshot({ path: `${out}/home-desktop.png`, fullPage: true });
  assert.equal((await state(page)).mode, "home");
  await page.locator("#help-button").click();
  assert.equal((await state(page)).dialog, "help-dialog");
  await page.keyboard.press("Escape");
  assert.equal((await state(page)).dialog, null);
  assert.equal(
    await page.locator("#sound-button").getAttribute("aria-pressed"),
    "true",
    "First-time players start with sound effects enabled",
  );
  await page.locator("#sound-button").click();
  assert.equal(
    await page.locator("#sound-button").getAttribute("aria-pressed"),
    "false",
    "The saved mute choice remains available",
  );
  await page.locator("#sound-button").click();
  await page.locator("#start-button").click();
  await settle(page);
  await checkGameLayout(page, "desktop", true);
  let s = await state(page);
  assert.equal(s.nodes.length, 26);
  assert.equal(s.edges.length, 0);
  assert.equal(s.selected, null, "a fresh puzzle starts with no selected node");
  let nodes = pair(s);
  await connect(page, nodes);
  assert.equal((await state(page)).edges.length, 1);
  await connect(page, nodes);
  assert.equal((await state(page)).edges.length, 0, "pair toggles off");
  await page.locator("#undo-button").click();
  assert.equal((await state(page)).edges.length, 1, "undo removal");
  await page.locator("#undo-button").click();
  assert.equal((await state(page)).edges.length, 0, "undo addition");
  await page.locator("#redo-button").click();
  assert.equal((await state(page)).edges.length, 1, "redo addition");
  const keyboardEdge = (await state(page)).edges;
  for (const modifier of ["Control", "Meta"]) {
    for (const key of ["z", "Shift+z", `${modifier}+y`]) {
      await page.keyboard.press(key);
      assert.deepEqual((await state(page)).edges, keyboardEdge, `${key} does not edit the puzzle`);
    }
    await page.keyboard.press(`${modifier}+z`);
    assert.deepEqual((await state(page)).edges, [], `${modifier}+Z undoes after toolbar focus`);
    for (const key of ["z", "Shift+z", `${modifier}+y`]) {
      await page.keyboard.press(key);
      assert.deepEqual((await state(page)).edges, [], `${key} does not consume redo history`);
    }
    await page.keyboard.press(`${modifier}+Shift+z`);
    assert.deepEqual((await state(page)).edges, keyboardEdge, `${modifier}+Shift+Z restores the same edge`);
  }
  const ignoredShortcuts = async (keys, expected, label) => {
    for (const key of keys) {
      await page.keyboard.press(key);
      assert.deepEqual((await state(page)).edges, expected, `${label}: ${key} leaves puzzle history untouched`);
    }
  };
  const focusInput = () => page.evaluate(() => {
    // Keep the input outside a dialog to independently exercise the input guard.
    const input = document.createElement("input");
    input.id = "shortcut-test-input";
    input.style.cssText = "position:fixed;top:70px;left:10px;width:120px";
    document.body.appendChild(input);
    input.focus();
  });
  const removeInput = () => page.evaluate(() => document.querySelector("#shortcut-test-input").remove());
  for (const undone of [false, true]) {
    if (undone) await page.keyboard.press("Control+z");
    const expected = undone ? [] : keyboardEdge;
    const keys = undone ? ["Control+Shift+z", "Meta+Shift+z"] : ["Control+z", "Meta+z"];
    await focusInput();
    await ignoredShortcuts(keys, expected, "editable input");
    await removeInput();
    await page.locator("#help-button").click();
    await ignoredShortcuts(keys, expected, "open help dialog");
    assert.equal((await state(page)).dialog, "help-dialog");
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Control+Shift+z");
  assert.deepEqual((await state(page)).edges, keyboardEdge, "ignored shortcuts preserve redo history");
  await page.keyboard.press("Control+z");
  await page.locator("#hint-button").click();
  await settle(page);
  assert.equal((await state(page)).edges.length, 1);
  const before = (await state(page)).nodes[0].screen;
  await page.keyboard.press("ArrowRight");
  await settle(page);
  const after = (await state(page)).nodes[0].screen;
  assert.ok(
    Math.abs(before.x - after.x) > 3,
    "keyboard rotation after toolbar click",
  );
  await page.locator("#view-button").click();
  await settle(page);
  s = await state(page);
  const origin = s.nodes[0].screen;
  const canvas = await page.locator("#game-stage canvas").boundingBox();
  await page.mouse.move(canvas.x + 20, canvas.y + 100);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 250, canvas.y + 125, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  assert.ok(
    Math.abs((await state(page)).nodes[0].screen.x - origin.x) > 3,
    "drag rotates",
  );
  await page.locator("#view-button").click();
  await settle(page);
  await page.screenshot({ path: `${out}/game-desktop.png`, fullPage: true });
  await page.locator("#game-stage canvas").focus();
  await page.keyboard.press("]");
  await settle(page);
  await page.keyboard.press("Enter");
  assert.notEqual(
    (await state(page)).selected,
    null,
    "keyboard selects focused node",
  );
  await page.keyboard.press("Escape");
  assert.equal((await state(page)).selected, null, "Escape cancels selection");
  const saved = await state(page);
  await page.reload();
  await page.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  assert.equal((await state(page)).mode, "playing", "refresh returns directly to the active puzzle");
  s = await state(page);
  assert.deepEqual(s.edges, saved.edges);
  assert.deepEqual(s.settings, saved.settings);
  await page.locator("#restart-button").click();
  assert.equal((await state(page)).dialog, "confirm-dialog");
  await page.getByRole("button", { name: "Keep playing", exact: true }).click();
  assert.equal((await state(page)).edges.length, 1);
  await page.locator("#restart-button").click();
  await page.locator("#confirm-button").click();
  assert.equal((await state(page)).edges.length, 0);
  await page.locator("#home-button").click();
  await page.locator('[data-depth="flat"]').click();
  await page.locator('[data-size="4"]').click();
  await page.locator('[data-difficulty="hard"]').click();
  await page.locator("#start-button").click();
  s = await state(page);
  assert.equal(s.nodes.length, 16);
  assert.equal(s.settings.difficulty, "hard");
  await connect(page, pair(s));
  assert.equal((await state(page)).edges.length, 1);
  for (let n = 0; n < 40 && !(await state(page)).solved; n++) {
    await page.locator("#hint-button").click();
    await settle(page);
  }
  s = await state(page);
  assert.equal(s.solved, true);
  assert.equal(s.dialog, "completion-dialog");
  await page.screenshot({ path: `${out}/completed.png`, fullPage: true });
  await page.keyboard.press("Escape");
  assert.equal(
    (await state(page)).dialog,
    "completion-dialog",
    "completion remains actionable",
  );
  const completedSeed = s.settings.seed;
  await page.locator("#next-button").click();
  s = await state(page);
  assert.equal(s.edges.length, 0);
  assert.equal(s.selected, null, "Another puzzle starts with no selected node");
  assert.notEqual(s.settings.seed, completedSeed);
  assert.equal(s.settings.size, 4);
  await page.locator("#home-button").click();
  await page.locator('[data-depth="3d"]').click();
  await page.locator('[data-size="5"]').click();
  await page.locator("#start-button").click();
  s = await state(page);
  assert.equal(s.nodes.length, 98);
  await connect(page, pair(s));
  assert.equal((await state(page)).edges.length, 1, "large cube input");
  await page.locator('[data-rotate="right"]').click();
  await settle(page);
  await page.screenshot({ path: `${out}/large-cube.png`, fullPage: true });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  watch(mobile);
  await mobile.goto(url);
  await mobile.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await mobile.screenshot({ path: `${out}/home-mobile.png`, fullPage: true });
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "mobile has no horizontal overflow",
  );
  await mobile.locator("#start-button").tap();
  await settle(mobile);
  await checkGameLayout(mobile, "mobile portrait");
  s = await state(mobile);
  nodes = pair(s);
  assert.equal(s.selected, null, "a fresh mobile puzzle starts with no selected node");
  await mobile.touchscreen.tap(nodes[0].screen.x, nodes[0].screen.y);
  await mobile.touchscreen.tap(nodes[1].screen.x, nodes[1].screen.y);
  await mobile.waitForTimeout(320);
  assert.equal((await state(mobile)).edges.length, 1, "touch connects");
  await mobile.locator("#hint-button").tap();
  await settle(mobile);
  assert.notEqual(
    (await state(mobile)).edges.length,
    1,
    "mobile hint changes one edge",
  );
  for (let n = 0; n < 4; n++) await mobile.locator("#hint-button").tap();
  await mobile.locator("#view-button").tap();
  await settle(mobile);
  await mobile.screenshot({ path: `${out}/game-mobile.png`, fullPage: true });
  const mobileHint = await mobile.locator("#hint-button").boundingBox();
  assert.ok(
    mobileHint.y + mobileHint.height <= 844,
    "mobile controls fit viewport",
  );
  await mobile.locator("#help-button").tap();
  await mobile.screenshot({ path: `${out}/help-mobile.png`, fullPage: true });
  await mobile.keyboard.press("Escape");
  await mobile.setViewportSize({ width: 844, height: 390 });
  await settle(mobile);
  await checkGameLayout(mobile, "mobile landscape");
  await mobile.screenshot({
    path: `${out}/game-mobile-landscape.png`,
    fullPage: true,
  });
  const landscapeHint = await mobile.locator("#hint-button").boundingBox();
  assert.ok(
    landscapeHint.y + landscapeHint.height <= 390,
    "landscape controls fit viewport",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Passed: desktop/mobile, help, sound, connections, toggling, Control/Meta undo and redo, ignored bare keys and editable/dialog shortcuts, hint, toolbar keyboard, drag, save/resume, restart/cancel, difficulty, completion/next, 5³ input, viewport-filling canvas, visible controls, side controls, no page scroll.",
  );
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
}
