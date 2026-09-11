import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.TEST_URL || "http://127.0.0.1:4173";
const out = "output/web-game/ad-free";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const receipt = "cs_test_verifiedAdFreeReceipt1234";
const respond = (route, body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
const sponsors = Array.from({ length: 8 }, (_, index) => ({ id: `brand-${index}`, brand: `Studio ${index + 1}`, tagline: "A sponsor test placement.", url: "https://example.com", endsAt: new Date(Date.now() + 86400000).toISOString() }));
const pageFor = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/sponsorship", route => respond(route, { available: false, sponsors: [...sponsors, sponsors[0]], adFree: { amount: 500, currency: "usd", available: true } }));
  return page;
};
const enterGame = async page => {
  await page.locator("#start-button").waitFor({ state: "attached" });
  if (await page.locator("#start-button").isVisible()) await page.locator("#start-button").click();
};
const open = async page => {
  await enterGame(page);
  await page.locator("#sponsor-slot-game .remove-ads").click();
};
try {
  const page = await pageFor();
  await page.addInitScript(() => localStorage.setItem("nodoku.ads-hidden.v1", "true"));
  await page.goto(url);
  await page.locator("#start-button").waitFor();
  assert.equal(await page.locator("#ad-free-footer, #sponsor-slot-home .remove-ads").count(), 0, "landing page has no ad-removal controls");
  await enterGame(page);
  await page.waitForFunction(() => document.querySelectorAll("#sponsor-slot-game [data-filled=true]").length === 6);
  assert.equal(await page.locator(".sponsor-hide, #show-ads").count(), 0, "free ad hiding controls are gone");
  assert.equal(await page.locator("#sponsor-slot-game").isVisible(), true, "old free-hide preference does not remove sponsors");
  const ids = await page.locator("#sponsor-slot-game .sponsor-card").evaluateAll(cards => cards.map(card => card.dataset.sponsorId));
  assert.equal(ids.length, 6); assert.equal(new Set(ids).size, 6, "six placements show distinct sponsors");
  await page.screenshot({ path: `${out}/six-sponsors.png`, fullPage: true });
  await open(page);
  let checkoutRequests = [];
  await page.route("**/api/ad-free/checkout", async route => {
    checkoutRequests.push(route.request().postDataJSON());
    await new Promise(resolve => setTimeout(resolve, 120));
    await respond(route, { url: "https://wrong.example/pay" });
  });
  await page.locator("#ad-free-buy").click();
  await page.waitForFunction(() => document.querySelector("#ad-free-status").textContent.includes("could not be confirmed"));
  await page.locator("#ad-free-buy").click();
  await page.waitForFunction(() => document.querySelector("#ad-free-status").textContent.includes("could not be confirmed"));
  assert.equal(checkoutRequests.length, 2);
  assert.deepEqual(checkoutRequests[0], checkoutRequests[1], "uncertain retries keep their request ID");
  assert.deepEqual(Object.keys(checkoutRequests[0]), ["requestId"], "price is controlled by the server");
  assert.equal(await page.locator("#sponsor-slot-game").isVisible(), true, "opening checkout does not remove ads");
  await page.screenshot({ path: `${out}/purchase-dialog.png` });
  await page.close();

  const paid = await pageFor();
  let confirmed = false;
  await paid.route("**/api/ad-free/status?**", route => respond(route, confirmed ? { status: "paid", receipt } : { status: "pending" }));
  await paid.route("**/api/ad-free/entitlement", route => respond(route, { status: route.request().postDataJSON().receipt === receipt ? "paid" : "unavailable" }));
  await paid.goto(`${url}/?ad_free=success&session_id=${receipt}`);
  await paid.waitForFunction(() => document.querySelector("#ad-free-status").textContent.includes("not confirmed"));
  await paid.locator("#ad-free-close").click();
  await open(paid);
  assert.equal(await paid.locator("#sponsor-slot-game").isVisible(), true, "success URL alone grants nothing");
  assert.ok(paid.url().includes("session_id="), "pending payment retains its recovery reference");
  confirmed = true;
  await paid.locator("#ad-free-retry").click();
  await paid.waitForFunction(() => document.querySelector("#sponsor-slot-game").hidden);
  assert.equal(await paid.evaluate(() => localStorage.getItem("nodoku.ad-free.receipt.v1")), receipt);
  assert.equal(new URL(paid.url()).search, "", "verified payment reference is removed from the URL");
  await paid.screenshot({ path: `${out}/verified-purchase.png` });
  await paid.reload();
  await paid.waitForFunction(() => document.querySelector("#sponsor-slot-game").hidden);
  await enterGame(paid);
  assert.equal(await paid.locator("#sponsor-slot-game").isVisible(), false, "verified receipt removes game sponsors too");
  await paid.close();

  const restore = await pageFor();
  let release;
  await restore.route("**/api/ad-free/entitlement", async route => {
    await new Promise(resolve => { release = resolve; });
    await respond(route, { status: "paid" });
  });
  await restore.goto(url); await open(restore);
  await restore.locator(".ad-free-restore summary").click();
  await restore.locator("#ad-free-code").fill(receipt);
  await restore.locator("#ad-free-restore button").click();
  await restore.locator("#ad-free-close").click(); await open(restore);
  assert.equal(await restore.locator("#ad-free-buy").isEnabled(), false, "closing/reopening cannot buy while restore is pending");
  release();
  await restore.waitForFunction(() => document.querySelector("#sponsor-slot-game").hidden);
  await restore.close();

  const stored = await pageFor();
  await stored.addInitScript(code => localStorage.setItem("nodoku.ad-free.receipt.v1", code), receipt);
  let valid = false;
  await stored.route("**/api/ad-free/entitlement", route => respond(route, { status: valid ? "paid" : "unavailable" }));
  await stored.goto(url); await open(stored);
  assert.equal(await stored.locator("#ad-free-buy").isEnabled(), false, "unconfirmed saved purchase prevents accidental repurchase");
  assert.equal(await stored.locator("#sponsor-slot-game").isVisible(), true, "an unverified local receipt cannot hide ads");
  valid = true;
  await stored.locator("#ad-free-verify-saved").click();
  await stored.waitForFunction(() => document.querySelector("#sponsor-slot-game").hidden);
  await stored.close();
  assert.deepEqual(errors, []);
  console.log("Passed: six unique sponsors, no free hiding, retry IDs, server pricing, safe redirects, pending/verified returns, receipt persistence, restoration and delayed-verification purchase guards. No real payment requests.");
} finally { await browser.close(); await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors)); }
