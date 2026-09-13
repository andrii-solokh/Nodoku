import { timeoutSignal } from "./timeout";
import { Puzzle } from "./puzzle";
import { getVisitorId } from "./visitor";
import { getAnalyticsSessionId } from "./analytics";
import { getRankedTicket, forgetRankedTicket, refreshCompletionRanking } from "./accounts";

const PREFIX = "nodoku.completion.pending.v1.";
const UUID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
type Completion = { visitorId: string; attemptId: string; game: object; rankedTicket?: string; analytics?: { sessionId: string; timestamp: string } };
const pending = new Map<string, Completion>();
const sent = new Set<string>();
let flushing = false;
let started = false;
let retryTimer: number | undefined;

export function restoreAttemptId(value: unknown): string {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : crypto.randomUUID();
}

function readPending(): void {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(PREFIX)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key)!);
        if (!value || !UUID.test(value.attemptId) || !UUID.test(value.visitorId) || key !== PREFIX + value.attemptId) continue;
        if (!sent.has(value.attemptId) && !pending.has(value.attemptId) && Puzzle.restore(value.game)?.solved) pending.set(value.attemptId, value);
      } catch { /* One damaged pending record cannot block other achievements. */ }
    }
  } catch { /* The in-memory queue still works. */ }
}

async function flush(): Promise<void> {
  if (flushing || document.hidden || !navigator.onLine) return;
  window.clearTimeout(retryTimer);
  readPending();
  if (!pending.size) return;
  flushing = true;
  try {
    for (const [id, payload] of pending) {
      if (document.hidden || !navigator.onLine) break;
      try {
        if (!payload.rankedTicket) {
          const ticket = await getRankedTicket(id);
          if (ticket) {
            payload.rankedTicket = ticket;
            try { localStorage.setItem(PREFIX + id, JSON.stringify(payload)); } catch { /* In-memory retries still retain the ticket. */ }
          }
        }
        const response = await fetch("/api/completions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload), signal: timeoutSignal(12_000),
        });
        const body = await response.json();
        if (!response.ok || typeof body?.recorded !== "boolean") {
          // Invalid saved payloads cannot succeed on retry. Service errors can.
          if ([400, 409, 413, 422].includes(response.status)) {
            pending.delete(id);
            try { localStorage.removeItem(PREFIX + id); } catch { /* Optional storage. */ }
            continue;
          }
          break;
        }
        pending.delete(id);
        sent.add(id);
        void refreshCompletionRanking(id);
        forgetRankedTicket(id);
        try { localStorage.removeItem(PREFIX + id); } catch { /* Server deduplication also covers reloads. */ }
        window.dispatchEvent(new Event("nodoku:statistics-updated"));
      } catch { break; }
    }
  } finally {
    flushing = false;
    if (pending.size && !document.hidden) retryTimer = window.setTimeout(() => { void flush(); }, 30_000);
  }
}

export function recordCompletion(puzzle: Puzzle, attemptId: string): void {
  if (!puzzle.solved) return;
  if (sent.has(attemptId)) { void refreshCompletionRanking(attemptId); return; }
  if (pending.has(attemptId)) return;
  const sessionId = getAnalyticsSessionId();
  const payload: Completion = {
    visitorId: getVisitorId(), attemptId,
    // Freeze attribution at the solve, not at a later offline retry or reload.
    ...(sessionId ? { analytics: { sessionId, timestamp: new Date().toISOString() } } : {}),
    // Only the final board is needed to verify its clues and connected network.
    game: { version: 1, settings: { ...puzzle.settings }, edges: puzzle.edges.map(edge => [...edge]), history: [] },
  };
  pending.set(attemptId, payload);
  // Separate keys keep simultaneous completions in different tabs independent.
  try { localStorage.setItem(PREFIX + attemptId, JSON.stringify(payload)); } catch { /* Retry in memory if storage is full or unavailable. */ }
  void flush();
}

export function startCompletionTracking(): void {
  if (started) return;
  started = true;
  const resume = () => { void flush(); };
  window.addEventListener("online", resume);
  window.addEventListener("pageshow", resume);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(retryTimer);
    else resume();
  });
  window.addEventListener("storage", event => { if (event.key?.startsWith(PREFIX) && event.newValue) resume(); });
  resume();
}
