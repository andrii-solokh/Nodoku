import { getVisitorId } from "./visitor";

type EventProperties = Record<string, string | number | boolean | undefined>;
type AnalyticsConfig = { projectApiKey: string; apiHost: string };

let initialized = false;
let starting: Promise<void> | null = null;
let posthog: (typeof import("posthog-js"))["default"] | null = null;
const queuedEvents: Array<{ event: string; properties: EventProperties }> = [];

function validConfig(value: unknown): value is AnalyticsConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<AnalyticsConfig>;
  return typeof config.projectApiKey === "string" && /^phc_/.test(config.projectApiKey)
    && config.apiHost === "https://us.i.posthog.com";
}

function send(event: string, properties: EventProperties): void {
  posthog?.capture(event, properties);
}

/** Start optional analytics without ever blocking the game when it is unavailable. */
export function startAnalytics(): void {
  if (starting) return;
  starting = fetch("/api/analytics-config", { cache: "no-store", signal: AbortSignal.timeout(5_000) })
    .then(async response => response.ok ? response.json() : null)
    .then(async config => {
      if (!validConfig(config)) return;
      const { default: instance } = await import("posthog-js");
      posthog = instance;
      instance.init(config.projectApiKey, {
        api_host: config.apiHost,
        autocapture: false,
        // Capture one explicit pageview once our Nodoku visitor ID and app label are
        // registered. This keeps Web Analytics and replay sessions on the same identity.
        capture_pageview: false,
        capture_pageleave: true,
        person_profiles: "identified_only",
        // The puzzle is rendered by Three.js, so DOM-only replay would otherwise
        // show an empty board. Keep this deliberately low fidelity: it is enough
        // to understand a solve without making replay a rendering workload.
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
          captureCanvas: {
            recordCanvas: true,
            canvasFps: 4,
            canvasQuality: "0.5",
          },
          canvasCapture: { resolutionScale: 0.6 },
        },
      });
      // This UUID is created locally by Nodoku and contains no profile data.
      instance.identify(getVisitorId());
      instance.register({ app: "nodoku" });
      instance.capture("$pageview");
      initialized = true;
      for (const queued of queuedEvents) send(queued.event, queued.properties);
      queuedEvents.length = 0;
      window.addEventListener("error", event => instance.captureException(event.error, { source: "window" }));
      window.addEventListener("unhandledrejection", event => instance.captureException(event.reason, { source: "unhandledrejection" }));
    })
    .catch(() => {
      // A blocked analytics request must not affect the puzzle.
    });
}

export function captureAnalytics(event: string, properties: EventProperties = {}): void {
  if (initialized) {
    send(event, properties);
    return;
  }
  // Keep early interactions, but never retain a growing queue while offline.
  if (queuedEvents.length < 32) queuedEvents.push({ event, properties });
}
