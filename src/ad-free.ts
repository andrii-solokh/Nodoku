const RECEIPT_KEY = "nodoku.ad-free.receipt.v1";
const REQUEST_KEY = "nodoku.ad-free.request.v1";
const SESSION = /^cs_(?:test_|live_)?[A-Za-z0-9]{8,240}$/;

async function request(path: string, body?: unknown) {
  const response = await fetch(path, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not check your purchase. Please retry.");
  return result as Record<string, unknown>;
}

export function mountAdFree(options: { beforeOpen: () => void; onVerified: () => void }) {
  let available = false;
  let purchased = false;
  let busy = false;
  let verifying = 0;
  let attempt = 0;
  let receipt = "";
  let statusSession = "";
  let requestId = crypto.randomUUID();
  try {
    receipt = localStorage.getItem(RECEIPT_KEY) || "";
    const saved = sessionStorage.getItem(REQUEST_KEY);
    if (saved && /^[a-f\d-]{36}$/i.test(saved)) requestId = saved as typeof requestId;
    sessionStorage.setItem(REQUEST_KEY, requestId);
    localStorage.removeItem("nodoku.ads-hidden.v1");
  } catch { /* Receipt can also be restored manually. */ }
  let savedPurchaseUnconfirmed = SESSION.test(receipt);
  const dialog = document.createElement("dialog");
  dialog.id = "ad-free-dialog";
  dialog.className = "dialog sponsorship-dialog";
  dialog.setAttribute("aria-labelledby", "ad-free-title");
  dialog.innerHTML = `<div class="dialog-header"><h2 id="ad-free-title">A little space, just for you.</h2><button class="icon-button close" id="ad-free-close" type="button" aria-label="Close ad removal">✕</button></div><p>Remove sponsored placements from Nodoku with a one-time purchase.</p><p id="ad-free-price">Checking availability…</p><p id="ad-free-status" class="sponsor-form-status" role="status" aria-live="polite"></p><button id="ad-free-buy" class="start-button sponsor-submit" type="button" disabled>Continue to Stripe ↗</button><button id="ad-free-retry" class="sponsor-status-action" type="button" hidden>Check payment status</button><button id="ad-free-new" class="sponsor-status-action" type="button" hidden>Start a new checkout</button><details class="ad-free-restore"><summary>Restore a purchase</summary><p>Enter the restore code saved after your purchase to use it on this browser.</p><form id="ad-free-restore"><label for="ad-free-code">Restore code</label><input id="ad-free-code" type="password" autocomplete="off" required /><button class="secondary-button" type="submit">Restore purchase</button></form></details><div id="ad-free-receipt" hidden><p>Keep your restore code to recover this purchase after clearing browser data or moving to another device.</p><button id="ad-free-copy" class="secondary-button" type="button">Copy restore code</button><input id="ad-free-saved-code" aria-label="Your restore code" readonly hidden /></div>`;
  document.body.appendChild(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const buy = el<HTMLButtonElement>("ad-free-buy");
  const status = el("ad-free-status");
  const retry = el<HTMLButtonElement>("ad-free-retry");
  const restore = el<HTMLFormElement>("ad-free-restore");
  const fresh = el<HTMLButtonElement>("ad-free-new");
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(".remove-ads")];
  const verifySaved = document.createElement("button");
  verifySaved.id = "ad-free-verify-saved";
  verifySaved.className = "sponsor-status-action";
  verifySaved.textContent = "Verify saved purchase";
  verifySaved.hidden = !savedPurchaseUnconfirmed;
  retry.after(verifySaved);
  const controls = () => {
    buy.hidden = purchased || !!statusSession;
    buy.disabled = busy || verifying > 0 || savedPurchaseUnconfirmed || !available;
    retry.disabled = verifySaved.disabled = busy || verifying > 0;
    for (const input of restore.elements) if (input instanceof HTMLInputElement || input instanceof HTMLButtonElement) input.disabled = busy || verifying > 0;
  };
  const clearReturn = () => {
    const url = new URL(location.href);
    if (!url.searchParams.has("ad_free")) return;
    url.searchParams.delete("ad_free"); url.searchParams.delete("session_id");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  };
  const verified = (code: string) => {
    attempt++;
    savedPurchaseUnconfirmed = false;
    receipt = code; purchased = true; statusSession = "";
    try { localStorage.setItem(RECEIPT_KEY, code); sessionStorage.removeItem(REQUEST_KEY); } catch { /* Manual restore remains available. */ }
    options.onVerified();
    status.textContent = "Your purchase is verified. Sponsored placements are removed.";
    el("ad-free-receipt").hidden = false;
    el<HTMLInputElement>("ad-free-saved-code").value = code;
    retry.hidden = fresh.hidden = verifySaved.hidden = true;
    for (const button of buttons) button.textContent = "Ad-free purchase";
    clearReturn(); controls();
  };
  const open = () => {
    if (dialog.open) return;
    options.beforeOpen(); dialog.showModal();
  };
  for (const button of buttons) button.addEventListener("click", open);
  el("ad-free-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { attempt++; busy = false; controls(); });
  buy.addEventListener("click", async () => {
    if (busy || verifying > 0 || savedPurchaseUnconfirmed || !available || purchased || statusSession) return;
    busy = true; const current = ++attempt; controls(); status.textContent = "Preparing your secure checkout…";
    try {
      const result = await request("/api/ad-free/checkout", { requestId });
      if (current !== attempt) return;
      const url = new URL(String(result.url));
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) throw new Error("Checkout could not be confirmed. Please retry.");
      location.assign(url.href);
    } catch (error) {
      if (current === attempt) {
        status.textContent = error instanceof Error ? error.message : "Checkout unavailable. Please retry.";
        if (/expired/i.test(status.textContent)) { available = false; fresh.hidden = false; }
      }
    } finally { if (current === attempt) { busy = false; controls(); } }
  });
  fresh.addEventListener("click", () => {
    requestId = crypto.randomUUID();
    try { sessionStorage.setItem(REQUEST_KEY, requestId); } catch { /* Same-visit retries still reuse the ID. */ }
    statusSession = ""; fresh.hidden = retry.hidden = true; available = offerAvailable;
    clearReturn(); status.textContent = "Ready for a new checkout."; controls();
  });
  const checkStatus = async () => {
    if (busy || verifying > 0 || !SESSION.test(statusSession)) return;
    verifying++; controls(); status.textContent = "Verifying your payment…";
    try {
      const result = await request(`/api/ad-free/status?session_id=${encodeURIComponent(statusSession)}`);
      if (result.status === "paid" && typeof result.receipt === "string" && SESSION.test(result.receipt)) verified(result.receipt);
      else {
        const expired = result.status === "expired";
        status.textContent = expired ? "This checkout expired without a completed payment." : "Payment is not confirmed yet. Retry here after completing checkout.";
        fresh.hidden = !expired; retry.hidden = expired;
      }
    } catch { status.textContent = "Payment verification is unavailable. Your checkout reference is saved in this page address; retry here."; retry.hidden = false; }
    finally { verifying--; controls(); }
  };
  retry.addEventListener("click", () => void checkStatus());
  restore.addEventListener("submit", async event => {
    event.preventDefault(); if (busy || verifying > 0) return;
    const code = el<HTMLInputElement>("ad-free-code").value.trim();
    if (!SESSION.test(code)) { status.textContent = "Enter a valid restore code from your purchase."; return; }
    verifying++; controls(); status.textContent = "Checking your purchase…";
    try {
      const result = await request("/api/ad-free/entitlement", { receipt: code });
      if (result.status === "paid") verified(code);
      else status.textContent = "No verified ad-free purchase was found for this code.";
    } catch { status.textContent = "Could not verify this purchase. Please retry."; }
    finally { verifying--; controls(); }
  });
  el("ad-free-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(receipt); status.textContent = "Restore code copied. Keep it somewhere private."; }
    catch { const input = el<HTMLInputElement>("ad-free-saved-code"); input.hidden = false; input.select(); }
  });
  const returned = new URL(location.href);
  if (returned.searchParams.get("ad_free") === "success") {
    statusSession = returned.searchParams.get("session_id") || "";
    open();
    if (SESSION.test(statusSession)) void checkStatus();
    else { status.textContent = "This payment link is incomplete. Restore your purchase using its saved code."; statusSession = ""; }
  } else if (returned.searchParams.get("ad_free") === "cancelled") {
    open(); status.textContent = "Checkout was cancelled. Sponsored placements remain visible."; clearReturn();
  }
  const checkSaved = async () => {
    if (verifying > 0 || busy || !SESSION.test(receipt)) return;
    const code = receipt;
    verifying++; controls();
    status.textContent = "Verifying your saved purchase…";
    try {
      const result = await request("/api/ad-free/entitlement", { receipt: code });
      if (result.status === "paid") verified(code);
      else status.textContent = "Your saved purchase is not confirmed. Retry verification or restore using another code.";
    } catch { status.textContent = "Your saved purchase could not be verified. Please retry before buying again."; }
    finally { verifying--; controls(); }
  };
  verifySaved.addEventListener("click", () => void checkSaved());
  if (savedPurchaseUnconfirmed && !statusSession) void checkSaved();
  let offerAvailable = false;
  return {
    setOffer(value: unknown) {
      const offer = value && typeof value === "object" ? value as Record<string, unknown> : {};
      offerAvailable = offer.available === true && Number.isSafeInteger(offer.amount) && Number(offer.amount) >= 50 && offer.currency === "usd";
      available = offerAvailable;
      el("ad-free-price").textContent = Number.isSafeInteger(offer.amount) && Number(offer.amount) >= 50
        ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(offer.amount) / 100)} USD · one-time purchase`
        : "Ad-free purchases are not available yet.";
      if (!available && !purchased && !statusSession) status.textContent = "Checkout will open once the site owner enables ad-free purchases.";
      controls();
    },
  };
}
