import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Puzzle } from "../src/puzzle.ts";

const url = process.env.TEST_URL || "http://127.0.0.1:4173";
const out = "output/web-game/gestures";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const state = async (page) =>
  JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const settle = async (page) => {
  await page.waitForTimeout(330);
  await page.evaluate(() => window.advanceTime(500));
};
const releasedState = async (page) => page.evaluate(() => window.__lastPointerup);
const tap = async (page, node, mobile) => {
  if (mobile) await page.touchscreen.tap(node.screen.x, node.screen.y);
  else await page.mouse.click(node.screen.x, node.screen.y);
};
const neighbors = (a, b) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
const fixtures = async (mobile = false, depth = 1, edges = [], seed = 123) => {
  const p = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1200, height: 850 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.addInitScript(
    ({ depth, edges, seed }) => {
      if (localStorage.getItem("nodoku.astra.v1")) return;
      const settings = { size: 4, depth, difficulty: "easy", seed };
      localStorage.setItem(
        "nodoku.astra.v1",
        JSON.stringify({
          screen: "home",
          settings,
          game: { version: 1, settings, edges, history: [] },
        }),
      );
    },
    { depth, edges, seed },
  );
  await p.goto(url);
  await p.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await p.locator("#resume-button").click();
  await p.evaluate(() => {
    // Registered after the scene handler: this snapshot happens in the same
    // pointerup dispatch, before any timer or subsequent browser task can run.
    document.querySelector("canvas").addEventListener("pointerup", (event) => {
      window.__lastPointerup = {
        ...JSON.parse(window.render_game_to_text()),
        pointerType: event.pointerType,
        progressText: document.querySelector("#progress-value").textContent,
      };
    });
  });
  return p;
};
const touchClient = async (page) => {
  const session = await page.context().newCDPSession(page);
  return async (type, points = []) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((point, index) => ({
        id: index,
        x: point.x,
        y: point.y,
        radiusX: 3,
        radiusY: 3,
        force: 1,
      })),
    });
};
try {
  for (const mobile of [false, true]) {
    const page = await fixtures(mobile);
    const touch = mobile ? await touchClient(page) : null;
    const doubleTap = async (node) => {
      if (mobile) {
        await page.touchscreen.tap(node.screen.x, node.screen.y);
        await page.waitForTimeout(70);
        await page.touchscreen.tap(node.screen.x, node.screen.y);
      } else
        await page.mouse.dblclick(node.screen.x, node.screen.y, { delay: 70 });
      await settle(page);
    };
    const strokePath = async (points, cancel = false) => {
      const [a, ...rest] = points;
      if (mobile) {
        await touch("touchStart", [a]);
        for (const b of rest) await touch("touchMove", [b]);
        await touch(cancel ? "touchCancel" : "touchEnd");
      } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        for (const b of rest) await page.mouse.move(b.x, b.y, { steps: 1 });
        await page.mouse.up();
      }
      await settle(page);
    };
    const stroke = (a, b, cancel = false) => strokePath([a, b], cancel);
    let s = await state(page);
    const originalView = s.view.direction;
    const tapTarget = s.nodes[0];
    await tap(page, tapTarget, mobile);
    assert.equal((await releasedState(page)).selected, tapTarget.id, "first node selects during pointerup");
    assert.equal((await releasedState(page)).pointerType, mobile ? "touch" : "mouse");
    if (!mobile) await page.screenshot({ path: `${out}/instant-selection.png`, fullPage: true });
    await settle(page);
    await tap(page, tapTarget, mobile);
    assert.equal((await releasedState(page)).selected, null, "a separate single tap deselects immediately after the double-tap window");
    await settle(page);
    const pairTarget = s.nodes.find(node => neighbors(tapTarget, node));
    await tap(page, tapTarget, mobile);
    assert.equal((await releasedState(page)).selected, tapTarget.id);
    await tap(page, pairTarget, mobile);
    const immediatePair = await releasedState(page);
    assert.equal(immediatePair.edges.length, 1, "second-node tap connects during the same pointerup event");
    assert.equal(immediatePair.selected, null);
    assert.ok(immediatePair.progress > 0, "progress updates immediately with the connection");
    assert.equal(immediatePair.progressText, `${Math.round(immediatePair.progress * 100)}%`);
    await page.locator("#undo-button").click();
    assert.equal((await state(page)).edges.length, 0);
    for (const key of ["Escape", "Control+z", "Meta+z"]) {
      if (mobile)
        await page.touchscreen.tap(tapTarget.screen.x, tapTarget.screen.y);
      else await page.mouse.click(tapTarget.screen.x, tapTarget.screen.y);
      assert.equal((await releasedState(page)).selected, tapTarget.id, "selection is already applied before the keyboard action");
      await page.keyboard.press(key);
      await settle(page);
      assert.equal(
        (await state(page)).selected,
        null,
        `${key} clears the immediate selection even when there is no move to undo`,
      );
      assert.equal((await state(page)).edges.length, 0);
    }

    const target = s.nodes.find(
      (n) =>
        n.required >= 2 &&
        n.required === s.nodes.filter((b) => neighbors(n, b)).length,
    );
    assert.ok(target, "fixture has a node with all neighbors available");
    await doubleTap(target);
    s = await state(page);
    assert.equal(
      s.nodes.find((n) => n.id === target.id).remaining,
      0,
      "double tap fills node",
    );
    assert.equal(s.edges.length, target.required);
    const neighbor = s.nodes.find((n) => neighbors(n, target));
    if (mobile)
      await page.touchscreen.tap(neighbor.screen.x, neighbor.screen.y);
    else await page.mouse.click(neighbor.screen.x, neighbor.screen.y);
    await settle(page);
    assert.equal((await state(page)).selected, neighbor.id);
    await doubleTap(target);
    assert.equal(
      (await state(page)).edges.length,
      0,
      "double tap full node clears all",
    );
    await page.locator("#undo-button").click();
    assert.equal(
      (await state(page)).edges.length,
      target.required,
      "clear undoes as one action",
    );
    await page.locator("#undo-button").click();
    assert.equal(
      (await state(page)).edges.length,
      0,
      "fill undoes as one action",
    );
    await page.locator("#redo-button").click();
    assert.equal(
      (await state(page)).edges.length,
      target.required,
      "fill redo",
    );
    await page.locator("#undo-button").click();
    s = await state(page);
    const row = [0, 1, 2, 3]
      .map((y) => s.nodes.filter((n) => n.y === y).sort((a, b) => a.x - b.x))
      .find((row) =>
        row.every((n, i) => n.remaining >= (i === 0 || i === 3 ? 1 : 2)),
      );
    assert.ok(row, "fixture has a four-node path");
    await strokePath([row[0].screen, row[3].screen, row[0].screen, row[3].screen]);
    s = await state(page);
    assert.equal(s.edges.length, 3, "fast drag connects intermediate nodes once despite same-stroke retracing");
    assert.deepEqual(s.view.direction, originalView, "node drag never rotates");
    await strokePath([row[3].screen, row[0].screen, row[3].screen]);
    assert.equal(
      (await state(page)).edges.length,
      0,
      "a fresh drag removes existing links and same-stroke retracing does not re-add them",
    );
    await page.screenshot({ path: `${out}/removed-path-${mobile ? "touch" : "mouse"}.png`, fullPage: true });
    await page.locator("#undo-button").click();
    assert.equal((await state(page)).edges.length, 3, "one undo restores every link removed by a stroke");
    await page.locator("#redo-button").click();
    assert.equal((await state(page)).edges.length, 0, "one redo removes the same whole path");
    await page.locator("#undo-button").click();
    await stroke(row[0].screen, row[1].screen);
    assert.equal((await state(page)).edges.length, 2, "a fresh neighboring-node drag removes just that existing link");
    const beforeMixed = (await state(page)).edges;
    await strokePath([row[0].screen, row[3].screen, row[0].screen]);
    const edgeKey = edge => [...edge].sort((a, b) => a - b).join(":");
    assert.deepEqual((await state(page)).edges.map(edgeKey), [edgeKey([row[0].id, row[1].id])], "one mixed stroke adds the missing link and removes existing links without retoggling on retrace");
    await page.locator("#undo-button").click();
    assert.deepEqual((await state(page)).edges.map(edgeKey).sort(), beforeMixed.map(edgeKey).sort(), "mixed additions and removals undo as one batch");
    await page.locator("#redo-button").click();
    assert.deepEqual((await state(page)).edges.map(edgeKey), [edgeKey([row[0].id, row[1].id])], "mixed additions and removals redo as one batch");
    await page.locator("#undo-button").click();
    await page.locator("#undo-button").click();
    assert.equal((await state(page)).edges.length, 3);
    await page.locator("#undo-button").click();
    assert.equal(
      (await state(page)).edges.length,
      0,
      "one undo removes whole path",
    );
    await page.locator("#redo-button").click();
    assert.equal(
      (await state(page)).edges.length,
      3,
      "one redo restores whole path",
    );
    await page.screenshot({
      path: `${out}/path-${mobile ? "touch" : "mouse"}.png`,
      fullPage: true,
    });
    await page.reload();
    await page.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    assert.equal((await state(page)).mode, "playing", "refresh restores the active game");
    assert.equal((await state(page)).edges.length, 3, "stroke persists");
    await page.locator("#undo-button").click();
    assert.equal((await state(page)).edges.length, 0, "grouped undo persists");
    s = await state(page);
    const first = s.nodes.find((n) => n.id === row[0].id),
      last = s.nodes.find((n) => n.id === row[3].id);
    if (mobile) {
      await stroke(first.screen, last.screen, true);
      assert.equal(
        (await state(page)).edges.length,
        3,
        "cancel retains drawn edges",
      );
      await page.locator("#undo-button").click();
      assert.equal(
        (await state(page)).edges.length,
        0,
        "cancel closes undo group",
      );
    }
    await stroke(first.screen, { x: 15, y: first.screen.y });
    assert.deepEqual(
      (await state(page)).view.direction,
      originalView,
      "leaving node for empty space does not orbit",
    );
    await page.close();
  }
  // Node 3 has room, but its only unconnected neighbor is full. Its existing
  // 2–3 edge makes the first click change state before the no-op double tap.
  const blockedEdges = [[1,5],[12,13],[7,11],[4,8],[9,13],[6,7],[1,2],[0,1],[4,5],[5,6],[14,15],[10,14],[13,14],[11,15],[2,3],[0,4],[5,9],[8,9],[10,11],[9,10],[2,6],[8,12]];
  const blocked = await fixtures(false, 1, blockedEdges, 1);
  const blockedBefore = await state(blocked);
  await tap(blocked, blockedBefore.nodes.find(node => node.id === 2), false);
  await tap(blocked, blockedBefore.nodes.find(node => node.id === 3), false);
  assert.equal((await releasedState(blocked)).edges.length, blockedEdges.length - 1, "first click removes its selected-neighbor edge immediately");
  await blocked.waitForTimeout(70);
  await tap(blocked, blockedBefore.nodes.find(node => node.id === 3), false);
  const blockedAfter = await releasedState(blocked);
  assert.deepEqual(blockedAfter.edges, blockedBefore.edges, "no-op double tap restores the pre-click model");
  assert.deepEqual(blockedAfter.nodes.map(node => node.remaining), blockedBefore.nodes.map(node => node.remaining));
  assert.equal(blockedAfter.progressText, `${Math.round(blockedBefore.progress * 100)}%`, "no-op rollback refreshes visible progress");
  await blocked.reload();
  await blocked.waitForFunction(() => typeof window.render_game_to_text === "function");
  assert.equal((await state(blocked)).mode, "playing", "refresh restores the active game");
  assert.deepEqual((await state(blocked)).edges, blockedBefore.edges, "no-op rollback persists the restored edges");
  await blocked.close();

  const solvedFixture = new Puzzle({
    size: 4,
    depth: 1,
    difficulty: "easy",
    seed: 123,
  });
  const missing = solvedFixture.solution.at(-1);
  const partialEdges = solvedFixture.solution.slice(0, -1);
  for (const mobile of [false, true]) {
    const completingPair = await fixtures(mobile, 1, partialEdges);
    const pairState = await state(completingPair);
    const start = pairState.nodes.find(node => node.id === missing[0]);
    const end = pairState.nodes.find(node => node.id === missing[1]);
    await tap(completingPair, start, mobile);
    assert.equal((await releasedState(completingPair)).selected, start.id);
    await tap(completingPair, end, mobile);
    const immediate = await releasedState(completingPair);
    assert.equal(immediate.solved, true, "last pair click solves during pointerup");
    assert.equal(immediate.progress, 1);
    assert.equal(immediate.progressText, "100%");
    assert.equal(immediate.dialog, null, "completion dialog alone waits for double-tap disambiguation");
    await completingPair.waitForTimeout(70);
    await tap(completingPair, end, mobile);
    const doubled = await releasedState(completingPair);
    assert.equal(doubled.solved, true, "second tap fills the originally incomplete node rather than clearing its newly completed state");
    assert.equal(doubled.edges.length, partialEdges.length + 1);
    await completingPair.waitForFunction(() => JSON.parse(window.render_game_to_text()).dialog === "completion-dialog");
    // Completion deliberately has no dismiss control. Close only the modal in
    // test setup so the normal keyboard undo can verify the resulting history.
    await completingPair.evaluate(() => document.querySelector("#completion-dialog").close());
    await completingPair.keyboard.press("Control+z");
    const undone = await state(completingPair);
    assert.equal(undone.solved, false);
    assert.equal(undone.dialog, null);
    assert.deepEqual(undone.edges, partialEdges, "one undo restores exactly the state before the completing double tap");
    assert.equal(await completingPair.locator("#undo-button").isDisabled(), true, "rollback leaves no extra single-click action in undo history");
    await completingPair.close();
  }
  const heldCompletion = await fixtures(false, 1, partialEdges);
  const heldNodes = (await state(heldCompletion)).nodes;
  await tap(heldCompletion, heldNodes.find(node => node.id === missing[0]), false);
  const heldEnd = heldNodes.find(node => node.id === missing[1]);
  await tap(heldCompletion, heldEnd, false);
  assert.equal((await releasedState(heldCompletion)).solved, true);
  await heldCompletion.mouse.move(heldEnd.screen.x, heldEnd.screen.y);
  await heldCompletion.mouse.down();
  await heldCompletion.mouse.move(heldEnd.screen.x + 8, heldEnd.screen.y, { steps: 1 });
  assert.equal((await state(heldCompletion)).dialog, null, "a held no-change stroke still defers completion");
  await heldCompletion.mouse.up();
  await heldCompletion.waitForFunction(() => JSON.parse(window.render_game_to_text()).dialog === "completion-dialog");
  assert.equal((await state(heldCompletion)).edges.length, partialEdges.length + 1, "ending a no-change stroke shows completion without editing the solved puzzle");
  await heldCompletion.close();

  const completing = await fixtures(false, 1, partialEdges);
  let completeState = await state(completing);
  const from = completeState.nodes.find((n) => n.id === missing[0]).screen;
  const to = completeState.nodes.find((n) => n.id === missing[1]).screen;
  await completing.mouse.move(from.x, from.y);
  await completing.mouse.down();
  await completing.mouse.move(to.x, to.y, { steps: 3 });
  completeState = await state(completing);
  assert.equal(
    completeState.solved,
    true,
    "last stroke completes puzzle before release",
  );
  assert.equal(completeState.dialog, null, "completion waits for stroke end");
  await completing.keyboard.press("Control+z");
  completeState = await state(completing);
  assert.equal(
    completeState.solved,
    false,
    "undo reverses held completing stroke",
  );
  assert.equal(
    completeState.dialog,
    null,
    "undo does not leave completion modal open",
  );
  await completing.mouse.up();
  await settle(completing);
  assert.equal((await state(completing)).edges.length, partialEdges.length);
  await completing.close();
  const mobile = await fixtures(true, 4);
  const touch = await touchClient(mobile);
  let s = await state(mobile);
  const initial = s.view.direction;
  const canvas = await mobile.locator("canvas").boundingBox();
  const empty = { x: canvas.x + 20, y: canvas.y + 70 };
  await touch("touchStart", [empty]);
  await touch("touchMove", [{ x: empty.x + 60, y: empty.y + 4 }]);
  await touch("touchEnd");
  await settle(mobile);
  s = await state(mobile);
  assert.equal(s.view.snapped, true);
  assert.notDeepEqual(
    s.view.direction,
    initial,
    "short swipe makes a face turn",
  );
  assert.equal(s.edges.length, 0, "swipe creates no links");
  await touch("touchStart", [empty]);
  await touch("touchMove", [{ x: empty.x + 60, y: empty.y + 4 }]);
  await touch("touchEnd");
  await settle(mobile);
  assert.equal(
    (await state(mobile)).view.snapped,
    true,
    "repeated swipes stay snapped",
  );
  await mobile.locator("#view-button").tap();
  await settle(mobile);
  s = await state(mobile);
  const node = s.nodes.find((n) => n.screen.pickable);
  const distanceBeforePinch = s.view.distance;
  await touch("touchStart", [node.screen]);
  await touch("touchStart", [
    node.screen,
    { x: node.screen.x + 60, y: node.screen.y },
  ]);
  await touch("touchMove", [
    node.screen,
    { x: node.screen.x + 90, y: node.screen.y },
  ]);
  await touch("touchEnd");
  await settle(mobile);
  s = await state(mobile);
  assert.equal(
    s.edges.length,
    0,
    "pinching from a node creates no connections",
  );
  assert.deepEqual(s.view.direction, initial, "pinch does not rotate");
  assert.ok(Math.abs(s.view.distance - distanceBeforePinch) < 1e-8, "pinch cannot zoom the puzzle");
  await mobile.screenshot({ path: `${out}/cube-touch.png`, fullPage: true });
  await mobile.close();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Passed: same-pointerup mouse/touch selection and connections, immediate completion with double-tap rollback, no-op rollback persistence and held-stroke completion, mouse/touch double fill and clear, grouped undo/redo and persistence, fast path additions/removals, mixed strokes and once-per-stroke retracing, cancel, node-vs-space gesture intent, short face swipes, pinch without accidental edits.",
  );
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
}
