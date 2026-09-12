type Properties = Record<string, string | number | boolean>;

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
        properties: { distinct_id: distinctId, $lib: "nodoku-server", ...properties },
      }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Analytics must never prevent a valid game completion from being saved.
  }
}
