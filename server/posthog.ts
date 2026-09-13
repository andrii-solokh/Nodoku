type Properties = Record<string, string | number | boolean>;

/** Optional attribution must never invalidate an otherwise verified completion. */
export function completionAnalytics(value: unknown): { sessionId: string; timestamp: string } | undefined {
  if (!value || typeof value !== 'object') return;
  const { sessionId, timestamp } = value as Record<string, unknown>;
  if (typeof sessionId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(sessionId)
    || typeof timestamp !== 'string') return;
  const time = Date.parse(timestamp);
  const sessionStart = Number.parseInt(sessionId.replaceAll('-', '').slice(0, 12), 16);
  if (!Number.isFinite(time) || time < sessionStart || time >= sessionStart + 86_400_000 || time > Date.now() + 300_000) return;
  return { sessionId: sessionId.toLowerCase(), timestamp: new Date(time).toISOString() };
}

/**
 * Sends verified server-side events without affecting the player-facing API.
 * The project API key is public by design, but lives in the runtime
 * configuration so it is never committed to the repository.
 */
export async function capturePostHog(
  env: Record<string, string | undefined>,
  event: string,
  distinctId: string,
  properties: Properties,
  timestamp?: string,
): Promise<void> {
  const apiKey = env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) return;
  try {
    await fetch("https://us.i.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        ...(timestamp ? { timestamp } : {}),
        properties: { distinct_id: distinctId, $lib: "nodoku-server", ...properties },
      }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Analytics must never prevent a valid game completion from being saved.
  }
}
