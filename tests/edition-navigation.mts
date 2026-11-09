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
    assert.equal(await page.locator(".edition-guide h2").isVisible(), true);
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
  const guide = interactive.locator(".edition-guide");
  const guideBelowFold = () => guide.evaluate(element =>
    getComputedStyle(element).display !== "none" && element.getBoundingClientRect().top >= innerHeight
    && document.documentElement.scrollWidth <= innerWidth);
  assert.equal(await guideBelowFold(), true, "guide renders below the home screen without overflow");
  await interactive.locator("#start-button").click();
  await interactive.locator("#game-stage canvas").waitFor({ state: "visible" });
  assert.equal(await guide.isVisible(), false, "guide stays out of the way during play");
  await interactive.locator("#home-button").click();
  await interactive.locator("#start-button").waitFor({ state: "visible" });
  assert.equal(await guideBelowFold(), true);

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on("pageerror", error => errors.push(error.message));
  for (const route of routes) {
    await phone.goto(new URL(route, base).href);
    await phone.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === "function");
    await phone.locator("#app-loader").waitFor({ state: "detached" });
    const layout = await phone.locator(".edition-guide").evaluate(element => ({
      top: element.getBoundingClientRect().top, overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.ok(layout.top >= 844, `${route} guide starts below the phone fold (${layout.top})`);
    assert.ok(layout.overflow <= 0, `${route} has no horizontal overflow on a phone`);
    if (process.env.GUIDE_SCREENSHOTS) {
      await phone.locator(".edition-guide").scrollIntoViewIfNeeded();
      await phone.screenshot({ path: `${process.env.GUIDE_SCREENSHOTS}/phone${route.replace(/\//g, "-")}guide.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log("Passed: edition links and guides work without JavaScript; runtime navigation, start/home controls and the below-fold guide work with JavaScript and on phones.");
} finally {
  await browser.close();
}
