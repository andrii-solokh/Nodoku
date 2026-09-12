import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Puzzle } from "../src/puzzle.ts";

const url = process.env.TEST_URL || "http://127.0.0.1:4173";
const settings = { size: 3, depth: 1, difficulty: "easy", seed: 17 };
const puzzle = new Puzzle(settings);
for (const edge of puzzle.solution.slice(0, -1)) puzzle.toggle(...edge);
const lastEdge = puzzle.solution.at(-1);
assert.ok(lastEdge, "The fixture has a final connection");

const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/visitors", route => route.fulfill({ json: { count: 1, scope: "local" } }));
  await page.route("**/api/presence", route => route.fulfill({ json: { online: 1, scope: "local" } }));
  await page.route("**/api/sponsorship", route => route.fulfill({ json: { available: false, sponsors: [] } }));
  await page.route("**/api/completions", route => route.fulfill({ json: { recorded: true, scope: "local" } }));
  await page.route("**/api/statistics?**", route => route.fulfill({ json: { period: "all", scope: "local", trackingSince: null, totals: { visitors: 1, puzzlesSolved: 0, dotsCleared: 0, connectionsCompleted: 0 }, daily: [], sizes: [], difficulties: [] } }));
  await page.addInitScript(game => {
    localStorage.setItem("nodoku.astra.v1", JSON.stringify({ screen: "playing", settings: game.settings, game, sound: false, music: false }));
  }, puzzle.serialize());
  await page.goto(url);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const initial = await state();
  const source = initial.nodes.find(node => node.id === lastEdge[0]);
  const target = initial.nodes.find(node => node.id === lastEdge[1]);
  assert.ok(source?.screen?.pickable && target?.screen?.pickable, "The final connection endpoints are visible");
  await page.mouse.click(source.screen.x, source.screen.y);
  await page.waitForTimeout(320);
  await page.mouse.click(target.screen.x, target.screen.y);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).solved === true);
  assert.equal(await page.locator("#completion-moment").isVisible(), true, "The game acknowledges a solved board before opening its dialog");
  await page.screenshot({ path: "output/web-game/completion-moment/game-completion-moment.png" });
  await page.locator("#completion-dialog").waitFor();
  assert.equal(await page.locator("#completion-moment").isHidden(), true, "The completion beat clears before the result dialog");
  assert.deepEqual(errors, []);
  await page.close();
  console.log("Passed: solved player puzzle holds an animated completion beat before its dialog.");
} finally {
  await browser.close();
}
