import { timeoutSignal } from "./timeout";

type EventProperties = Record<string, string | number | boolean | undefined>;
type AnalyticsConfig = { projectApiKey: string; apiHost: string };

let initialized = false;
let starting: Promise<void> | null = null;
let posthog: (typeof import("posthog-js"))["default"] | null = null;
const queuedEvents: Array<{ event: string; properties: EventProperties }> = [];
const featureFlagListeners = new Map<string, Set<(enabled: boolean) => void>>();

type AnalyticsPlayer = { id: string; nickname: string };
let analyticsPlayer: AnalyticsPlayer | null = null;
let resolveIdentity: () => void;
const identityReady = new Promise<void>(resolve => { resolveIdentity = resolve; });

/** Auth is resolved separately from the optional SDK, including failed/disabled auth. */
export function setAnalyticsPlayer(player: AnalyticsPlayer | null): void {
  if (analyticsPlayer && analyticsPlayer.id !== player?.id) queuedEvents.length = 0;
  analyticsPlayer = player;
  resolveIdentity();
  if (initialized) applyAnalyticsIdentity();
}

function applyAnalyticsIdentity(): void {
  if (!posthog) return;
  try {
    const desired = analyticsPlayer ? `player:${analyticsPlayer.id}` : undefined;
    const previous = posthog.get_distinct_id();
    // Old versions explicitly identified a browser UUID. Never merge that shared
    // browser's history into an account. Migrate once to genuine anonymous IDs.
    if (posthog.get_property('nodoku_identity_version') !== 2
      || (previous.startsWith('player:') && previous !== desired)) posthog.reset(true);
    if (analyticsPlayer) posthog.identify(desired!, { name: analyticsPlayer.nickname });
    posthog.register({ app: 'nodoku', nodoku_identity_version: 2 });
  } catch { /* Optional analytics must never break sign-in or sign-out. */ }
}

/** Capture this at the action, so retries cannot inherit a later account. */
export function getAnalyticsDistinctId(): string | undefined {
  try {
    return initialized ? posthog?.get_distinct_id()
      : analyticsPlayer ? `player:${analyticsPlayer.id}` : undefined;
  } catch { return undefined; }
}

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
      await identityReady;
      posthog = instance;
      instance.init(config.projectApiKey, {
        api_host: config.apiHost,
        // The ingestion endpoint is proxied, while PostHog UI links and toolbar
        // integrations must still point at the US Cloud application.
        ui_host: "https://us.posthog.com",
        autocapture: false,
        // Capture a pageview after resolving account identity and registering the app.
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
      initialized = true;
      applyAnalyticsIdentity();
      instance.capture("$pageview");
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
