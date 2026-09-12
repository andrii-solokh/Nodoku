/** Safari versions without AbortSignal.timeout still support AbortController. */
export function timeoutSignal(milliseconds: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}
