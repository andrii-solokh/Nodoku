import { timeoutSignal } from "./timeout";
import { getVisitorId } from "./visitor";

type EventProperties = Record<string, string | number | boolean | undefined>;
type AnalyticsConfig = { projectApiKey: string; apiHost: string };

let initialized = false;
let starting: Promise<void> | null = null;
let posthog: (typeof import("posthog-js"))["default"] | null = null;
const queuedEvents: Array<{ event: string; properties: EventProperties }> = [];
const featureFlagListeners = new Map<string, Set<(enabled: boolean) => void>>();

function publishFeatureFlags(): void {
  for (const [key, listeners] of featureFlagListeners) {
    const enabled = posthog?.isFeatureEnabled(key, { send_event: false }) === true;
    for (const listener of listeners) listener(enabled);
  }
}

function validConfig(value: unknown): value is AnalyticsConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<AnalyticsConfig>;
  return typeof config.projectApiKey === "string" && /^phc_/.test(config.projectApiKey)
    && config.apiHost === "https://go.nodoku.solokh.com";
}

function send(event: string, properties: EventProperties): void {
  posthog?.capture(event, properties);
}

/** Start optional analytics without ever blocking the game when it is unavailable. */
export function startAnalytics(): void {
  if (starting) return;
  starting = Promise.resolve()
    .then(() => fetch("/api/analytics-config", { cache: "no-store", signal: timeoutSignal(5_000) }))
    .then(async response => response.ok ? response.json() : null)
    .then(async config => {
      if (!validConfig(config)) return;
      const { default: instance } = await import("posthog-js");
      posthog = instance;
      instance.init(config.projectApiKey, {
        api_host: config.apiHost,
        // The ingestion endpoint is proxied, while PostHog UI links and toolbar
        // integrations must still point at the US Cloud application.
        ui_host: "https://us.posthog.com",
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
      instance.onFeatureFlags(() => publishFeatureFlags());
      publishFeatureFlags();
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

/** Use the SDK's existing session; never manufacture one for server events. */
export function getAnalyticsSessionId(): string | undefined {
  try {
    return initialized ? posthog?.get_session_id() || undefined : undefined;
  } catch {
    return undefined;
  }
}

/** Observe a PostHog Boolean flag. Missing analytics or a missing flag stays safely off. */
export function subscribeFeatureFlag(key: string, listener: (enabled: boolean) => void): () => void {
  listener(false);
  const listeners = featureFlagListeners.get(key) ?? new Set<(enabled: boolean) => void>();
  listeners.add(listener);
  featureFlagListeners.set(key, listeners);
  if (initialized) listener(posthog?.isFeatureEnabled(key, { send_event: false }) === true);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) featureFlagListeners.delete(key);
  };
}
