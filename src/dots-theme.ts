/** The character edition lives at its own page; all other paths use classic Nodoku. */
export const DOTS_THEME = typeof location !== "undefined"
  && /^\/dots\/?$/.test(location.pathname);

export const DOTS_SCENE_COLORS = {
  background: "#07070b", nodeColor: "#0879e8",
  connectionColor: "#f495dc", completedColor: "#77c62c",
};
export const DOTS_SELECTION_COLORS = { ringColor: "#ffd56b", guideColor: "#ffd56b" };
