import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.TEST_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
const routes = ["/", "/dots/", "/groks/"];

try {
  const fallback = await browser.newContext({ javaScriptEnabled: false });
  const page = await fallback.newPage();
  for (const route of routes) {
    const response = await page.goto(new URL(route, base).href);
    assert.equal(response?.status(), 200);
    assert.equal(await page.locator("#app-loader").isVisible(), false);
    const navigation = page.getByRole("navigation", { name: "Choose a game edition" });
    assert.equal(await navigation.isVisible(), true);
    assert.deepEqual(await navigation.locator("a").evaluateAll(links =>
      links.map(link => link.getAttribute("href"))), ["/groks/", "/dots/"]);
    assert.equal(await navigation.getByRole("link", { name: "groks", exact: true }).isVisible(), true);
  }
  await page.getByRole("link", { name: "dots", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/dots/");
  await fallback.close();

  const interactive = await browser.newPage();
  const errors: string[] = [];
  interactive.on("pageerror", error => errors.push(error.message));
  const ready = async () => {
    await interactive.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");
    await interactive.locator("#app-loader").waitFor({ state: "detached" });
  };
  await interactive.goto(base);
  await ready();
  await interactive.getByRole("link", { name: "groks", exact: true }).click();
  await ready();
  assert.equal(new URL(interactive.url()).pathname, "/groks/");
  await interactive.getByRole("link", { name: "dots", exact: true }).click();
  await ready();
  assert.equal(new URL(interactive.url()).pathname, "/dots/");
  await interactive.locator("#start-button").click();
  await interactive.locator("#game-stage canvas").waitFor({ state: "visible" });
  await interactive.locator("#home-button").click();
  await interactive.locator("#start-button").waitFor({ state: "visible" });
  assert.deepEqual(errors, []);
  console.log("Passed: all edition links work without JavaScript; runtime navigation and start/home controls work with JavaScript.");
} finally {
  await browser.close();
}
