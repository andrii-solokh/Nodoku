import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const url = process.env.TEST_URL || "http://127.0.0.1:4173";
const out = "output/web-game/sponsorship";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const pages = [];
const plan = { id: "spotlight", name: "Sponsored placement", days: 30, amount: 10000, currency: "usd" };
const waitFor = async (check, message) => {
  for (let i = 0; i < 80; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(message);
};
const pageFor = async (options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, ...options });
  pages.push(page);
  page.on("pageerror", error => errors.push(error.message));
  return page;
};
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const offer = (page, body = {}) => page.route("**/api/sponsorship", route => json(route, { available: true, plan, sponsors: [], ...body }));
const openForm = async page => {
  await page.locator("#sponsor-slot-home .sponsor-advertise").first().click();
  await page.locator("#sponsor-brand").fill("Kind Studio");
  await page.locator("#sponsor-tagline").fill("Thoughtful things for everyday life.");
  await page.locator("#sponsor-website").fill("https://example.com/studio");
};
const gameState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));

try {
  const local = await pageFor();
  const visitorIds = [];
  local.on("request", request => {
    if (new URL(request.url()).pathname === "/api/visitors" && request.method() === "POST") visitorIds.push(request.postDataJSON().visitorId);
  });
  await local.goto(url);
  await waitFor(async () => (await local.locator("#visitor-count").textContent()) !== "—", "real local visitor API responds");
  assert.equal(await local.locator(".visitor-home .visitor-scope").textContent(), "Preview");
  assert.equal(await local.locator(".visitor-home .visitor-scope").isVisible(), true);
  assert.ok(Number((await local.locator("#visitor-count").textContent()).replaceAll(",", "")) >= 1);
  await local.screenshot({ path: `${out}/home-desktop.png`, fullPage: true });
  await local.reload();
  await waitFor(() => visitorIds.length === 2, "reload records visitor request");
  assert.equal(visitorIds[0], visitorIds[1], "same browser retains its visitor identity on reload");
  await openForm(local);
  await waitFor(async () => /not available/.test(await local.locator("#sponsor-status").textContent()), "unconfigured checkout explained");
  assert.equal(await local.locator("#sponsor-submit").isDisabled(), true);
  assert.match(await local.locator("#sponsor-plan-price").textContent(), /100/);
  assert.match(await local.locator("#sponsor-plan-duration").textContent(), /30 days/);
  assert.equal(await local.locator("#sponsor-preview-brand").textContent(), "Kind Studio");
  await local.screenshot({ path: `${out}/form-desktop.png` });
  await local.keyboard.press("Escape");
  await local.locator("#start-button").click();
  await local.evaluate(() => window.advanceTime(400));
  const canvas = await local.locator("#game-stage canvas").boundingBox();
  assert.ok(canvas.height >= 890, "game keeps all vertical space below header");
  assert.equal(await local.locator("#sponsor-slot-game").isVisible(), true);
  await local.screenshot({ path: `${out}/game-desktop.png` });
  await local.locator("#sponsor-slot-game .sponsor-advertise").first().click();
  const before = await gameState(local);
  await local.locator("#sponsor-brand").fill("wasdhz");
  await local.keyboard.press("ArrowRight");
  const after = await gameState(local);
  assert.deepEqual(after.view, before.view, "form typing cannot rotate game");
  assert.deepEqual(after.edges, before.edges, "form typing cannot hint or undo game");
  await local.keyboard.press("Escape");

  const mobile = await pageFor({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto(url);
  await openForm(mobile);
  assert.equal(await mobile.locator("#sponsor-preview-brand").textContent(), "Kind Studio");
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile page fits horizontally");
  assert.ok(await mobile.locator("#sponsor-dialog").evaluate(el => el.scrollWidth <= el.clientWidth), "mobile form fits horizontally");
  await mobile.screenshot({ path: `${out}/form-mobile.png` });
  await mobile.keyboard.press("Escape");
  await mobile.locator("#start-button").tap();
  assert.equal(await mobile.locator("#sponsor-slot-game").isVisible(), false, "narrow screens keep gameplay clear");
  assert.ok((await mobile.locator("#game-stage canvas").boundingBox()).height >= 774);
  await mobile.screenshot({ path: `${out}/game-mobile.png` });

  const checkout = await pageFor();
  await offer(checkout);
  const payloads = [];
  let checkoutResponse = { url: "https://not-stripe.example/pay" };
  await checkout.route("**/api/checkout", async route => {
    payloads.push(route.request().postDataJSON());
    await new Promise(resolve => setTimeout(resolve, 120));
    await json(route, checkoutResponse);
  });
  let stripeRequests = 0;
  await checkout.route("https://checkout.stripe.com/**", route => {
    stripeRequests++;
    return route.fulfill({ contentType: "text/html", body: "<p>Intercepted Stripe redirect — no network payment request.</p>" });
  });
  await checkout.goto(url);
  await openForm(checkout);
  await waitFor(async () => !(await checkout.locator("#sponsor-submit").isDisabled()), "configured offer enables checkout");
  await checkout.locator("#sponsor-website").fill("http://example.com");
  await checkout.locator("#sponsor-submit").click();
  assert.equal(payloads.length, 0, "HTTP destination is rejected before checkout");
  await checkout.locator("#sponsor-website").fill("https://example.com/studio");
  await checkout.locator("#sponsor-submit").click();
  await waitFor(async () => /invalid payment address/.test(await checkout.locator("#sponsor-status").textContent()), "non-Stripe redirect rejected");
  assert.equal(new URL(checkout.url()).origin, new URL(url).origin);
  assert.deepEqual(Object.keys(payloads[0]).sort(), ["brand", "planId", "requestId", "tagline", "url"], "browser sends no price or payment status");
  checkoutResponse = { url: "https://checkout.stripe.com/c/pay/cs_test_intercepted" };
  await checkout.locator("#sponsor-form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await checkout.waitForURL("https://checkout.stripe.com/**");
  assert.equal(stripeRequests, 1);
  assert.equal(payloads.length, 2, "duplicate submit creates only one request");
  assert.equal(payloads[0].requestId, payloads[1].requestId, "retry reuses stable idempotency ID");

  const status = await pageFor();
  await offer(status);
  let paymentStatus = "pending";
  await status.route("**/api/checkout-status?*", route => json(route, { status: paymentStatus }));
  await status.goto(`${url}/?sponsorship=success&session_id=cs_test_referencetest`);
  await waitFor(async () => await status.locator("#sponsor-payment-status").getAttribute("data-status") === "pending", "return page waits for server confirmation");
  assert.equal(await status.locator("#sponsor-form").isVisible(), false);
  assert.doesNotMatch(await status.locator("#sponsor-payment-title").textContent(), /Payment confirmed/);
  await status.reload();
  await waitFor(async () => await status.locator("#sponsor-payment-status").getAttribute("data-status") === "pending", "pending confirmation survives reload");
  paymentStatus = "unavailable";
  await status.locator("#sponsor-retry-status").click();
  await waitFor(async () => await status.locator("#sponsor-payment-status").getAttribute("data-status") === "unavailable", "payment outage does not confirm payment");
  await status.reload();
  await waitFor(async () => await status.locator("#sponsor-payment-status").getAttribute("data-status") === "unavailable", "unavailable confirmation survives reload");
  paymentStatus = "paid";
  await status.locator("#sponsor-retry-status").click();
  await waitFor(async () => await status.locator("#sponsor-payment-status").getAttribute("data-status") === "paid", "verified paid response confirms payment");
  assert.equal(await status.locator("#sponsor-payment-title").textContent(), "Payment confirmed");
  assert.equal(await status.evaluate(() => sessionStorage.getItem("nodoku.sponsor.draft.v1")), null);
  await status.screenshot({ path: `${out}/payment-confirmed.png` });
  await status.locator("#sponsor-new-placement").click();
  assert.equal(await status.locator("#sponsor-form").isVisible(), true, "a paid advertiser can create another placement");
  assert.equal(await status.locator("#sponsor-brand").inputValue(), "");
  assert.equal(await status.locator("#sponsor-payment-status").isVisible(), false);

  const expired = await pageFor();
  await offer(expired);
  const expiredIds = [];
  await expired.route("**/api/checkout", route => {
    expiredIds.push(route.request().postDataJSON().requestId);
    return json(route, { code: "checkout_expired", error: "This checkout has expired." }, 409);
  });
  await expired.goto(url);
  await openForm(expired);
  await expired.locator("#sponsor-submit").click();
  await expired.locator("#sponsor-restart-checkout").waitFor({ state: "visible" });
  assert.equal(await expired.locator("#sponsor-submit").isDisabled(), true);
  await expired.locator("#sponsor-restart-checkout").click();
  assert.equal(await expired.locator("#sponsor-brand").inputValue(), "Kind Studio");
  await expired.locator("#sponsor-submit").click();
  await waitFor(() => expiredIds.length === 2, "expired checkout can restart");
  assert.notEqual(expiredIds[0], expiredIds[1], "explicit restart of confirmed expired session uses a new ID");

  const canceled = await pageFor();
  await offer(canceled);
  let releaseCheckout;
  let sentCheckout = false;
  await canceled.route("**/api/checkout", async route => {
    sentCheckout = true;
    await new Promise(resolve => { releaseCheckout = resolve; });
    await json(route, { url: "https://checkout.stripe.com/c/pay/cs_test_closed" });
  });
  let closedRedirect = false;
  await canceled.route("https://checkout.stripe.com/**", route => { closedRedirect = true; return route.fulfill({ body: "Unexpected navigation" }); });
  await canceled.goto(url);
  await openForm(canceled);
  await canceled.locator("#sponsor-submit").click();
  await waitFor(() => sentCheckout, "checkout request pending");
  assert.equal(await canceled.locator("#sponsor-brand").isDisabled(), true, "draft cannot change during checkout request");
  await canceled.keyboard.press("Escape");
  const closedResponse = canceled.waitForResponse("**/api/checkout");
  releaseCheckout();
  await closedResponse;
  await canceled.waitForTimeout(200);
  assert.equal(closedRedirect, false, "closing form prevents a delayed payment redirect");
  assert.equal(new URL(canceled.url()).origin, new URL(url).origin);

  const forged = await pageFor();
  await forged.goto(`${url}/?sponsorship=success`);
  assert.equal(await forged.locator("#sponsor-payment-title").textContent(), "Payment status is unavailable");
  assert.equal(await forged.locator("#sponsor-form").isVisible(), false, "missing reference never confirms payment");

  const ads = await pageFor();
  const expires = new Date(Date.now() + 86400000).toISOString();
  await offer(ads, { sponsors: [
    { id: "invalid", brand: "Untrusted destination", tagline: "No", url: "javascript:alert(1)", endsAt: expires },
    { id: "expired", brand: "Expired", tagline: "No", url: "https://example.com", endsAt: "2000-01-01T00:00:00Z" },
    { id: "active", brand: "<img src=x onerror=alert(1)>", tagline: "Text stays text.", url: "https://example.com", endsAt: expires },
  ] });
  await ads.goto(url);
  await waitFor(async () => await ads.locator("#sponsor-slot-home .sponsor-link:not([hidden])").isVisible(), "active sponsor rendered");
  assert.equal(await ads.locator("#sponsor-slot-home .sponsor-link:not([hidden]) strong").textContent(), "<img src=x onerror=alert(1)>");
  assert.equal(await ads.locator("#sponsor-slot-home img").count(), 0, "sponsor copy cannot inject HTML");
  assert.equal(await ads.locator("#sponsor-slot-home .sponsor-link:not([hidden])").getAttribute("rel"), "sponsored noopener noreferrer");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("Passed: real visitor API and reload identity, placeholders, unavailable checkout, live preview, mobile/full-height game, modal input isolation, server-owned price payload, retry/double-submit, safe Stripe redirect, verified return status, expired/unsafe ads, and escaped sponsor text. Stripe navigation intercepted; no live payment attempted.");
} finally {
  await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
}
