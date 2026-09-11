const VISITOR_KEY = "nodoku.visitor.v1";
const UUID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
let identity: string | undefined;

export function getVisitorId(): string {
  if (identity) return identity;
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved && UUID.test(saved)) return identity = saved.toLowerCase();
  } catch { /* A session identity works when storage is unavailable. */ }
  identity = crypto.randomUUID();
  try { localStorage.setItem(VISITOR_KEY, identity); } catch { /* Storage is optional. */ }
  return identity;
}
