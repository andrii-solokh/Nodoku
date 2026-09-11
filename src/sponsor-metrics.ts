type Kind = "view" | "click";
type CardState = { id: string; ratio: number; timer?: number; since: number };
const STORAGE_KEY = "nodoku.sponsor-events.v1";
const day = () => new Date().toISOString().slice(0, 10);

/** Track browser/day events only for paid cards the player can actually see. */
export function mountSponsorMetrics(slots: HTMLElement[], visitorId: string): void {
  if (typeof IntersectionObserver !== "function") return;
  const completed = new Set<string>();
  const clicked = new Set<string>();
  const pending = new Map<string, Promise<boolean>>();
  const retryAfter = new Map<string, number>();
  const cards = new Map<HTMLElement, CardState>();
  let away = false;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.visitorId === visitorId && saved.day === day() && Array.isArray(saved.events))
      for (const value of saved.events) if (typeof value === "string") completed.add(`${saved.day}|${value}`);
  } catch { /* Server deduplication still applies without browser storage. */ }

  const key = (id: string, kind: Kind) => `${day()}|${id}|${kind}`;
  const persist = () => {
    try {
      const today = day();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ visitorId, day: today,
        events: [...completed].filter(value => value.startsWith(`${today}|`)).map(value => value.slice(11)) }));
    } catch { /* Tracking must not interfere with gameplay. */ }
  };
  const send = (id: string, kind: Kind): Promise<boolean> => {
    const eventKey = key(id, kind);
    if (completed.has(eventKey)) return Promise.resolve(true);
    const inflight = pending.get(eventKey);
    if (inflight) return inflight;
    if ((retryAfter.get(eventKey) ?? 0) > Date.now()) return Promise.resolve(false);
    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch("/api/sponsor-events", { method: "POST", keepalive: true,
          headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ visitorId, sponsorId: id, kind }) });
        const result = await response.json();
        if (!response.ok || typeof result?.recorded !== "boolean") throw new Error("Event unavailable");
        completed.add(eventKey);
        retryAfter.delete(eventKey);
        persist();
        return true;
      } catch {
        retryAfter.set(eventKey, Date.now() + 5_000);
        return false;
      } finally { window.clearTimeout(timeout); pending.delete(eventKey); }
    })();
    pending.set(eventKey, request);
    return request;
  };
  const visible = (card: HTMLElement) => !away && !document.hidden && !document.querySelector("dialog[open]") && card.isConnected && card.getClientRects().length > 0;
  const cancel = (state: CardState) => { window.clearTimeout(state.timer); state.timer = undefined; state.since = 0; };
  const check = (card: HTMLElement, state: CardState) => {
    const id = card.dataset.sponsorId || "";
    if (id !== state.id) { cancel(state); state.id = id; }
    if (!id || state.ratio < .5 || !visible(card)) { cancel(state); return; }
    if (state.timer !== undefined) return;
    if (!state.since) state.since = performance.now();
    const nextKind: Kind = completed.has(key(id, "view")) && clicked.has(key(id, "click")) ? "click" : "view";
    const delay = completed.has(key(id, nextKind))
      ? Math.max(1000, Date.parse(`${day()}T00:00:00Z`) + 86_400_000 - Date.now())
      : Math.max(0, 1000 - (performance.now() - state.since), (retryAfter.get(key(id, nextKind)) ?? 0) - Date.now());
    state.timer = window.setTimeout(async () => {
      state.timer = undefined;
      if (cards.get(card) !== state || state.id !== id || card.dataset.sponsorId !== id || state.ratio < .5 || !visible(card)) { cancel(state); return; }
      if (await send(id, "view")) {
        if (clicked.has(key(id, "click"))) await send(id, "click");
      }
      if (cards.get(card) === state && state.id === id) check(card, state);
    }, delay);
  };
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      const state = cards.get(card);
      if (state) { state.ratio = entry.intersectionRatio; check(card, state); }
    }
  }, { threshold: [0, .5, 1] });
  const reconcile = () => {
    const current = new Set(slots.flatMap(slot => [...slot.querySelectorAll<HTMLElement>(".sponsor-card")]));
    for (const [card, state] of cards) if (!current.has(card)) { cancel(state); intersection.unobserve(card); cards.delete(card); }
    for (const card of current) {
      let state = cards.get(card);
      if (!state) { state = { id: card.dataset.sponsorId || "", ratio: 0, since: 0 }; cards.set(card, state); intersection.observe(card); }
      check(card, state);
    }
  };
  new MutationObserver(reconcile).observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["class", "hidden", "open", "data-sponsor-id"] });
  document.addEventListener("visibilitychange", reconcile);
  window.addEventListener("pagehide", () => { away = true; reconcile(); });
  window.addEventListener("pageshow", () => { away = false; reconcile(); });
  for (const slot of slots) {
    const activate = (event: MouseEvent) => {
      if (event.type === "auxclick" ? event.button !== 1 : event.button !== 0) return;
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a.sponsor-link[data-sponsor-id]");
      const card = link?.closest<HTMLElement>(".sponsor-card");
      const id = link?.dataset.sponsorId;
      if (!id || !card || !slot.contains(link) || link.hidden || !link.href || !visible(card)) return;
      // Clicking is explicit proof the placement was seen, including before one second.
      // Keep normal target=_blank navigation; no preventDefault or delayed redirect.
      clicked.add(key(id, "click"));
      void (async () => {
        if (await send(id, "view")) await send(id, "click");
        const state = cards.get(card);
        if (state) { window.clearTimeout(state.timer); state.timer = undefined; check(card, state); }
      })();
    };
    slot.addEventListener("click", activate);
    slot.addEventListener("auxclick", activate);
  }
  reconcile();
}
