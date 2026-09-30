/** The geometric bot edition has its own URL and puzzle save. */
export const GROKS_THEME = typeof location !== "undefined"
  && /^\/groks\/?$/.test(location.pathname);

export const GROK_COLORS = [
  "#00a99e", "#ffffff", "#a9c8ff", "#ffc46b",
  "#d6b9ff", "#ff807c", "#b7eb93", "#f6a7d4",
] as const;

export const GROKS_SCENE_COLORS = {
  background: "#0e0f10", nodeColor: GROK_COLORS[0],
  connectionColor: "#67cfc3", completedColor: GROK_COLORS[1],
};
export const GROKS_SELECTION_COLORS = {
  ringColor: "#a8f5e8", guideColor: "#a8f5e8",
};
