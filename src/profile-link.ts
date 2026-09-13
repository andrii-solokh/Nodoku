/** Optional public website. Bare domains get HTTPS; unsafe schemes are rejected. */
export function normalizeProfileLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return '';
  if (text.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
}
