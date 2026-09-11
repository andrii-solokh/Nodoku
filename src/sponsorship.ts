import "./sponsorship.css";
import { mountAdFree } from "./ad-free";
import { mountAudience } from "./audience";
import { getVisitorId } from "./visitor";
import { mountSponsorMetrics } from "./sponsor-metrics";
import { openStatistics } from "./statistics";

type Sponsor = { id: string; brand: string; tagline: string; url: string; endsAt: string };
type Draft = { brand: string; tagline: string; url: string; requestId: string };
type Plan = { id: "spotlight"; name: string; days: number; amount: number; currency: "usd" };
const DEFAULT_PLAN: Plan = { id: "spotlight", name: "Sponsored placement", days: 30, amount: 10000, currency: "usd" };
const DRAFT_KEY = "nodoku.sponsor.draft.v1";
let mounted = false;
type SponsorshipConfig = { slots: number; showOnHome: boolean; showInGame: boolean };
let sponsorshipConfig: SponsorshipConfig = { slots: 6, showOnHome: true, showInGame: true };
let applySponsorshipConfig: (() => void) | null = null;

export function setSponsorshipConfig(config: SponsorshipConfig): void {
  sponsorshipConfig = {
    slots: Number.isFinite(config.slots) ? Math.max(1, Math.min(6, Math.round(config.slots))) : 6,
    showOnHome: config.showOnHome !== false,
    showInGame: config.showInGame !== false,
  };
  applySponsorshipConfig?.();
}

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function secureUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url : null;
  } catch { return null; }
}

async function request(path: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", ...init?.headers } });
    const body: unknown = await response.json();
    return { ok: response.ok, body: body && typeof body === "object" ? body as Record<string, unknown> : {} };
  } finally { window.clearTimeout(timer); }
}

export function mountSponsorship(options: { beforeOpen: () => void }): void {
  if (mounted || document.getElementById("sponsor-dialog")) return;
  mounted = true;
  const visitorId = getVisitorId();
  let draft: Draft = { brand: "", tagline: "", url: "", requestId: uuid() };
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null") as Partial<Draft> | null;
    if (saved && typeof saved === "object") {
      draft.brand = typeof saved.brand === "string" ? saved.brand.slice(0, 60) : "";
      draft.tagline = typeof saved.tagline === "string" ? saved.tagline.slice(0, 120) : "";
      draft.url = typeof saved.url === "string" ? saved.url.slice(0, 2048) : "";
      if (typeof saved.requestId === "string" && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(saved.requestId)) draft.requestId = saved.requestId;
    }
  } catch { /* The form remains usable when session storage is unavailable. */ }
  let plan = DEFAULT_PLAN;
  let available = false;
  let loading = true;
  let submitting = false;
  let checkoutAttempt = 0;
  let checkoutExpired = false;
  let paymentAttempt = 0;
  let returnFocus: HTMLElement | null = null;
  let statusSession: string | null = null;
  let statusTimer: number | null = null;
  let checkingStatus = false;
  let paymentConfirmed = false;

  const makeSlot = (location: "home" | "game") => {
    const slot = document.createElement("aside");
    slot.className = `sponsorship-slot sponsorship-${location}`;
    slot.id = `sponsor-slot-${location}`;
    slot.setAttribute("aria-label", "Sponsored placements");
    slot.innerHTML = `<div class="sponsor-collection-header"><span>Space for our supporters</span>${location === "game" ? '<button class="remove-ads" type="button">Remove ads</button>' : ""}</div><div class="sponsor-grid"></div>`;
    return slot;
  };
  const homeSlot = makeSlot("home");
  const gameSlot = makeSlot("game");
  document.querySelector(".home-main")?.appendChild(homeSlot);
  document.querySelector(".game-main")?.appendChild(gameSlot);
  let adFree = false;
  const updateAdVisibility = () => {
    homeSlot.hidden = adFree || !sponsorshipConfig.showOnHome;
    gameSlot.hidden = adFree || !sponsorshipConfig.showInGame;
  };
  const adFreePurchase = mountAdFree({
    beforeOpen: options.beforeOpen,
    onVerified: () => { adFree = true; updateAdVisibility(); },
  });
  updateAdVisibility();
  const visitorWidgets = ["home", "game"].map(location => {
    const widget = document.createElement("div");
    widget.className = `visitor-widget visitor-${location}`;
    return widget;
  });
  document.querySelector("#home-activity")?.appendChild(visitorWidgets[0]);
  document.querySelector("#game-activity")?.appendChild(visitorWidgets[1]);
  mountAudience(visitorWidgets, visitorId, options);
  mountSponsorMetrics([homeSlot, gameSlot], visitorId);

  const dialog = document.createElement("dialog");
  dialog.id = "sponsor-dialog";
  dialog.className = "dialog sponsorship-dialog";
  dialog.setAttribute("aria-labelledby", "sponsor-title");
  dialog.innerHTML = `
    <div class="dialog-header"><div><span class="sponsor-eyebrow">A little space for your brand</span><h2 id="sponsor-title">Connect with players.</h2></div><button class="icon-button close" id="sponsor-close" type="button" aria-label="Close sponsorship">✕</button></div>
    <div class="sponsor-offer"><div><strong id="sponsor-plan-name">Sponsored placement</strong><span>One-time placement · no automatic renewal</span></div><p><strong id="sponsor-plan-price">$100 USD</strong><span id="sponsor-plan-duration">for 30 days</span></p></div>
    <p class="sponsor-placement">Rotating text sponsorship on the home screen and larger game screens. No guaranteed impressions.</p>
    <div id="sponsor-payment-status" class="sponsor-payment-status" role="status" aria-live="polite" hidden><strong id="sponsor-payment-title"></strong><p id="sponsor-payment-message"></p><button id="sponsor-retry-status" type="button" hidden>Check payment status</button></div>
    <div id="sponsor-report-access" hidden>
      <label class="sponsor-field" for="sponsor-report-code"><span>Your private placement report code</span><input id="sponsor-report-code" type="text" readonly autocomplete="off" spellcheck="false" /><small>Save this code to view your placement report. Anyone with it can access the report.</small></label>
      <button id="sponsor-copy-code" class="sponsor-status-action" type="button">Copy report code</button>
      <button id="sponsor-view-report" class="sponsor-status-action" type="button">View placement report</button>
      <p id="sponsor-copy-status" class="sponsor-form-status" role="status" aria-live="polite"></p>
    </div>
    <form id="sponsor-form">
      <label class="sponsor-field" for="sponsor-brand"><span>Brand <small>60 characters max</small></span><input id="sponsor-brand" name="brand" autocomplete="organization" maxlength="60" required placeholder="Your brand" /></label>
      <label class="sponsor-field" for="sponsor-tagline"><span>Short introduction <small>120 characters max</small></span><textarea id="sponsor-tagline" name="tagline" maxlength="120" rows="2" required placeholder="A thoughtful introduction to what you do."></textarea></label>
      <label class="sponsor-field" for="sponsor-website"><span>Website</span><input id="sponsor-website" name="url" type="url" inputmode="url" autocomplete="url" maxlength="2048" required placeholder="https://example.com" aria-describedby="sponsor-website-help" /><small id="sponsor-website-help">Use your public website, beginning with https://.</small></label>
      <div class="sponsor-preview-label">Your placement preview</div><div class="sponsor-live-preview"><span class="sponsor-eyebrow">Sponsored</span><strong id="sponsor-preview-brand">Your brand</strong><span id="sponsor-preview-tagline">A little space to connect.</span><span id="sponsor-preview-url">yourwebsite.com <span aria-hidden="true">↗</span></span></div>
      <p id="sponsor-status" class="sponsor-form-status" role="status" aria-live="polite">Checking checkout availability…</p>
      <button id="sponsor-restart-checkout" class="sponsor-status-action" type="button" hidden>Start a new checkout</button>
      <button id="sponsor-submit" class="start-button sponsor-submit" type="submit" disabled>Continue to Stripe <span aria-hidden="true">↗</span></button>
      <p class="sponsor-payment-note">Payment details are entered securely on Stripe.</p>
    </form>
    <button class="sponsor-status-action sponsor-new-placement" id="sponsor-new-placement" type="button" hidden>Create another placement</button>
    <button class="secondary-button" id="sponsor-back" type="button">Back to the puzzle</button>`;
  document.body.appendChild(dialog);
  const element = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const form = element<HTMLFormElement>("sponsor-form");
  const brand = element<HTMLInputElement>("sponsor-brand");
  const tagline = element<HTMLTextAreaElement>("sponsor-tagline");
  const website = element<HTMLInputElement>("sponsor-website");
  const submit = element<HTMLButtonElement>("sponsor-submit");
  const status = element("sponsor-status");
  const paymentPanel = element("sponsor-payment-status");
  const retry = element<HTMLButtonElement>("sponsor-retry-status");
  const restartCheckout = element<HTMLButtonElement>("sponsor-restart-checkout");
  const newPlacement = element<HTMLButtonElement>("sponsor-new-placement");
  const reportAccess = element("sponsor-report-access");
  const reportCode = element<HTMLInputElement>("sponsor-report-code");
  element("sponsor-copy-code").addEventListener("click", async () => {
    if (!paymentConfirmed || !reportCode.value) return;
    const code = reportCode.value;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      if (paymentConfirmed && reportCode.value === code) element("sponsor-copy-status").textContent = "Report code copied.";
    } catch {
      if (!paymentConfirmed || reportCode.value !== code) return;
      element("sponsor-copy-status").textContent = "Select and copy the report code above.";
      if (dialog.open) { reportCode.focus(); reportCode.select(); }
    }
  });
  element("sponsor-view-report").addEventListener("click", () => {
    if (!paymentConfirmed) return;
    dialog.close();
    openStatistics({ report: true });
  });
  brand.value = draft.brand;
  tagline.value = draft.tagline;
  website.value = draft.url;

  const saveDraft = () => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* Storage is optional. */ } };
  const updatePreview = () => {
    element("sponsor-preview-brand").textContent = brand.value.trim() || "Your brand";
    element("sponsor-preview-tagline").textContent = tagline.value.trim() || "A little space to connect.";
    element("sponsor-preview-url").textContent = secureUrl(website.value)?.hostname || "yourwebsite.com";
  };
  const updateAvailability = () => {
    submit.disabled = loading || !available || submitting || checkoutExpired;
    for (const field of [brand, tagline, website]) field.disabled = submitting;
    submit.textContent = submitting ? "Opening Stripe…" : "Continue to Stripe ↗";
    if (loading) status.textContent = "Checking checkout availability…";
    else if (!available) status.textContent = "Sponsorship checkout is not available yet. You can still preview your placement.";
    else if (!submitting) status.textContent = `Your placement runs for ${plan.days} days. You'll review the payment on Stripe.`;
  };
  const close = () => dialog.close();
  element("sponsor-close").addEventListener("click", close);
  element("sponsor-back").addEventListener("click", close);
  dialog.addEventListener("close", () => {
    if (submitting) { checkoutAttempt++; submitting = false; updateAvailability(); }
    if (statusTimer !== null) window.clearTimeout(statusTimer);
    statusTimer = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  const open = (trigger?: HTMLElement) => {
    if (dialog.open) return;
    returnFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    options.beforeOpen();
    dialog.showModal();
    if (paymentPanel.hidden) brand.focus({ preventScroll: true });
  };
  for (const slot of [homeSlot, gameSlot]) {
    slot.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".sponsor-advertise") : null;
      if (button && slot.contains(button)) open(button);
    });
  }
  for (const field of [brand, tagline, website]) field.addEventListener("input", () => {
    website.setCustomValidity("");
    draft = { brand: brand.value, tagline: tagline.value, url: website.value, requestId: uuid() };
    checkoutExpired = false;
    restartCheckout.hidden = true;
    updateAvailability();
    saveDraft();
    updatePreview();
  });
  updatePreview();

  let sponsorItems: Sponsor[] = [];
  let rotation = 0;
  const formatPrice = () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(plan.amount / 100);
  const visibleCardCount = () => {
    const filled = Math.min(sponsorshipConfig.slots, sponsorItems.length);
    // Paid placements stay visible; only one card invites the next sponsor.
    return filled + (filled < sponsorshipConfig.slots ? 1 : 0);
  };
  const buildCards = () => {
    for (const slot of [homeSlot, gameSlot]) {
      const grid = slot.querySelector(".sponsor-grid")!;
      grid.replaceChildren();
      for (let index = 0; index < visibleCardCount(); index++) {
        const card = document.createElement("article");
        card.className = "sponsor-card";
        card.dataset.slot = String(index + 1);
        card.setAttribute("aria-label", `Sponsored placement ${index + 1}`);
        card.innerHTML = `<div class="sponsor-copy"><span class="sponsor-eyebrow">Placement ${String(index + 1).padStart(2, "0")}</span><p class="sponsor-placeholder">A little space for your brand.</p><a class="sponsor-link" target="_blank" rel="sponsored noopener noreferrer" hidden><strong></strong><span></span></a></div><div class="sponsor-slot-footer"><span class="sponsor-slot-price"></span><button class="sponsor-advertise" type="button">Advertise <span aria-hidden="true">↗</span></button></div>`;
        grid.appendChild(card);
      }
    }
  };
  const renderSponsors = () => {
    const sponsors = sponsorItems.filter(sponsor => Date.parse(sponsor.endsAt) > Date.now());
    const hash = [...visitorId].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
    const offset = sponsors.length ? (hash + rotation) % sponsors.length : 0;
    const selected = Array.from({ length: Math.min(sponsors.length, sponsorshipConfig.slots) }, (_, index) => sponsors[(offset + index) % sponsors.length]);
    for (const slot of [homeSlot, gameSlot]) {
      slot.querySelectorAll<HTMLElement>(".sponsor-card").forEach((card, index) => {
        const sponsor = selected[index] ?? null;
        const link = card.querySelector<HTMLAnchorElement>(".sponsor-link")!;
        const placeholder = card.querySelector<HTMLElement>(".sponsor-placeholder")!;
        link.hidden = !sponsor;
        placeholder.hidden = !!sponsor;
        card.dataset.filled = String(!!sponsor);
        card.querySelector(".sponsor-eyebrow")!.textContent = sponsor ? "Sponsored" : `Placement ${String(index + 1).padStart(2, "0")}`;
        const price = card.querySelector<HTMLElement>(".sponsor-slot-price")!;
        price.hidden = !!sponsor;
        price.textContent = `${formatPrice()} / ${plan.days} days`;
        if (sponsor) {
          card.dataset.sponsorId = sponsor.id;
          link.dataset.sponsorId = sponsor.id;
          link.href = secureUrl(sponsor.url)!.href;
          link.querySelector("strong")!.textContent = sponsor.brand;
          link.querySelector("span")!.textContent = sponsor.tagline;
          link.title = `${sponsor.brand} — ${sponsor.tagline}`;
        } else {
          delete card.dataset.sponsorId;
          delete link.dataset.sponsorId;
          link.removeAttribute("href");
          link.removeAttribute("title");
          link.querySelector("strong")!.textContent = "";
          link.querySelector("span")!.textContent = "";
        }
      });
    }
  };
  const receiveSponsors = (items: unknown) => {
    const valid = Array.isArray(items) ? items.slice(0, 500).filter((item): item is Sponsor =>
      item && typeof item === "object" && typeof item.id === "string" && typeof item.brand === "string" && item.brand.trim().length > 0 && item.brand.length <= 60 && typeof item.tagline === "string" && item.tagline.length <= 120 && secureUrl(item.url) !== null && typeof item.endsAt === "string" && Date.parse(item.endsAt) > Date.now(),
    ) : [];
    sponsorItems = [...new Map(valid.map(sponsor => [sponsor.id, sponsor])).values()];
    buildCards();
    renderSponsors();
  };
  applySponsorshipConfig = () => { buildCards(); renderSponsors(); updateAdVisibility(); };
  applySponsorshipConfig();
  window.setInterval(() => {
    if (document.hidden || dialog.open || [homeSlot, gameSlot].some(slot => slot.contains(document.activeElement))) return;
    rotation += 1;
    renderSponsors();
  }, 30000);
  const loadSponsors = async () => {
    try {
      const result = await request("/api/sponsorship");
      available = result.ok && result.body.available === true;
      const candidate = result.body.plan as Partial<Plan> | undefined;
      if (candidate?.id === "spotlight" && candidate.currency === "usd" && Number.isSafeInteger(candidate.amount) && candidate.amount! > 0 && Number.isInteger(candidate.days) && candidate.days! > 0) {
        plan = { id: "spotlight", name: typeof candidate.name === "string" ? candidate.name : DEFAULT_PLAN.name, amount: candidate.amount!, days: candidate.days!, currency: "usd" };
      }
      receiveSponsors(result.body.sponsors);
      adFreePurchase.setOffer(result.body.adFree);
    } catch { available = false; adFreePurchase.setOffer(null); }
    loading = false;
    const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(plan.amount / 100);
    element("sponsor-plan-name").textContent = plan.name;
    element("sponsor-plan-price").textContent = `${price} USD`;
    element("sponsor-plan-duration").textContent = `for ${plan.days} days`;
    renderSponsors();
    updateAvailability();
  };

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting || !available || checkoutExpired || paymentConfirmed || !form.reportValidity()) return;
    const url = secureUrl(website.value.trim());
    if (!url) {
      website.setCustomValidity("Use a website address beginning with https://.");
      website.reportValidity();
      return;
    }
    if (!brand.value.trim() || !tagline.value.trim()) { status.textContent = "Add your brand and a short introduction."; return; }
    saveDraft();
    submitting = true;
    const attempt = ++checkoutAttempt;
    updateAvailability();
    status.textContent = "Preparing your secure checkout…";
    try {
      const result = await request("/api/checkout", { method: "POST", body: JSON.stringify({ planId: "spotlight", brand: brand.value.trim(), tagline: tagline.value.trim(), url: url.href, requestId: draft.requestId }) });
      if (attempt !== checkoutAttempt) return;
      if (!result.ok) {
        if (result.body.code === "checkout_expired") {
          checkoutExpired = true;
          restartCheckout.hidden = false;
        }
        const message = typeof result.body.message === "string" ? result.body.message : typeof result.body.error === "string" ? result.body.error : "Checkout could not be started. Please try again.";
        throw new Error(message);
      }
      const checkout = secureUrl(result.body.url);
      if (!checkout || checkout.hostname !== "checkout.stripe.com" || (checkout.port && checkout.port !== "443")) throw new Error("Checkout returned an invalid payment address. Please try again.");
      window.location.assign(checkout.href);
    } catch (error) {
      if (attempt !== checkoutAttempt) return;
      submitting = false;
      updateAvailability();
      status.textContent = error instanceof Error && error.name !== "AbortError" ? error.message : "Checkout could not be reached. Please try again.";
    }
  });

  restartCheckout.addEventListener("click", () => {
    if (!checkoutExpired || submitting) return;
    draft.requestId = uuid();
    checkoutExpired = false;
    restartCheckout.hidden = true;
    saveDraft();
    updateAvailability();
    status.textContent = "Ready to start a new checkout with your existing draft.";
  });
  newPlacement.addEventListener("click", () => {
    paymentAttempt++;
    checkingStatus = false;
    statusSession = null;
    paymentConfirmed = false;
    reportAccess.hidden = true;
    reportCode.value = "";
    element("sponsor-copy-status").textContent = "";
    checkoutExpired = false;
    if (statusTimer !== null) window.clearTimeout(statusTimer);
    statusTimer = null;
    draft = { brand: "", tagline: "", url: "", requestId: uuid() };
    brand.value = tagline.value = website.value = "";
    website.setCustomValidity("");
    saveDraft();
    updatePreview();
    paymentPanel.hidden = true;
    newPlacement.hidden = true;
    restartCheckout.hidden = true;
    form.hidden = false;
    updateAvailability();
    brand.focus({ preventScroll: true });
  });

  const clearPaymentQuery = () => {
    const current = new URL(window.location.href);
    current.searchParams.delete("sponsorship");
    current.searchParams.delete("session_id");
    history.replaceState(history.state, "", current.pathname + current.search + current.hash);
  };

  const checkPayment = async (attempt = 0): Promise<void> => {
    if (!statusSession || checkingStatus) return;
    checkingStatus = true;
    const sequence = ++paymentAttempt;
    retry.disabled = true;
    paymentPanel.hidden = false;
    element("sponsor-payment-title").textContent = "Checking your payment";
    element("sponsor-payment-message").textContent = "Waiting for confirmation from the payment service.";
    let resultStatus = "unavailable";
    try {
      const result = await request(`/api/checkout-status?session_id=${encodeURIComponent(statusSession)}`);
      if (result.ok && ["paid", "pending", "expired", "unavailable"].includes(String(result.body.status))) resultStatus = String(result.body.status);
    } catch { /* A failed status check is never a payment confirmation. */ }
    if (sequence !== paymentAttempt) return;
    checkingStatus = false;
    retry.disabled = false;
    retry.hidden = resultStatus === "paid" || resultStatus === "expired";
    const messages: Record<string, [string, string]> = {
      paid: ["Payment confirmed", "Thank you for supporting Nodoku. Your sponsorship payment has been received."],
      pending: ["Payment is being confirmed", "Payment confirmation is still pending. You can check again shortly."],
      expired: ["This checkout has expired", "Your draft is still here. You can start a new checkout when you're ready."],
      unavailable: ["Payment status is unavailable", "We couldn't confirm your payment yet. Check again before starting another checkout."],
    };
    element("sponsor-payment-title").textContent = messages[resultStatus][0];
    element("sponsor-payment-message").textContent = messages[resultStatus][1];
    paymentPanel.dataset.status = resultStatus;
    // Keep the checkout reference reloadable until the server gives a terminal
    // result; a delayed webhook or temporary outage must not lose verification.
    if (resultStatus === "paid" || resultStatus === "expired") clearPaymentQuery();
    paymentConfirmed = resultStatus === "paid";
    newPlacement.hidden = !paymentConfirmed;
    reportAccess.hidden = !paymentConfirmed;
    reportCode.value = paymentConfirmed ? statusSession || "" : "";
    form.hidden = paymentConfirmed || resultStatus === "pending" || resultStatus === "unavailable";
    if (paymentConfirmed) {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Optional storage. */ }
      void loadSponsors();
    }
    if (resultStatus === "expired") { draft.requestId = uuid(); saveDraft(); }
    if (resultStatus === "pending" && attempt < 2 && dialog.open) {
      statusTimer = window.setTimeout(() => { statusTimer = null; void checkPayment(attempt + 1); }, 1800 * (attempt + 1));
    }
  };
  retry.addEventListener("click", () => { if (statusTimer !== null) window.clearTimeout(statusTimer); statusTimer = null; void checkPayment(); });
  void loadSponsors();

  const current = new URL(window.location.href);
  const paymentReturn = current.searchParams.get("sponsorship");
  if (paymentReturn) {
    const session = current.searchParams.get("session_id");
    const validSuccess = paymentReturn === "success" && session && /^[A-Za-z0-9_-]{1,255}$/.test(session);
    if (!validSuccess) clearPaymentQuery();
    if (paymentReturn === "success") {
      form.hidden = true;
      paymentPanel.hidden = false;
      open();
      if (session && /^[A-Za-z0-9_-]{1,255}$/.test(session)) { statusSession = session; void checkPayment(); }
      else {
        paymentPanel.hidden = false;
        element("sponsor-payment-title").textContent = "Payment status is unavailable";
        element("sponsor-payment-message").textContent = "The checkout reference is missing. We can't confirm a payment from this link.";
      }
    } else if (["cancelled", "canceled", "cancel"].includes(paymentReturn)) {
      open();
      paymentPanel.hidden = false;
      element("sponsor-payment-title").textContent = "Checkout cancelled";
      element("sponsor-payment-message").textContent = "Your draft is still here. You haven't received a payment confirmation.";
    }
  }
}
