import defaults from "../config/game-config.json";
import { validateConfig, type GameConfig } from "./config-schema";
import { DOTS_SCENE_COLORS, DOTS_SELECTION_COLORS, DOTS_THEME } from "./dots-theme";
import { GROKS_SCENE_COLORS, GROKS_SELECTION_COLORS, GROKS_THEME } from "./groks-theme";
export type { GameConfig } from "./config-schema";

let current = validateConfig(DOTS_THEME ? {
  ...defaults,
  scene: { ...defaults.scene, ...DOTS_SCENE_COLORS },
  selection: { ...defaults.selection, ...DOTS_SELECTION_COLORS },
} : GROKS_THEME ? {
  ...defaults,
  scene: { ...defaults.scene, ...GROKS_SCENE_COLORS },
  selection: { ...defaults.selection, ...GROKS_SELECTION_COLORS },
} : defaults);
const listeners = new Set<(config: GameConfig) => void>();
export const getConfig = (): GameConfig => structuredClone(current);
export function applyConfig(config: unknown): void {
  current = validateConfig(config);
  for (const listener of listeners) listener(getConfig());
}
export function subscribeConfig(listener: (config: GameConfig) => void): () => void {
  listeners.add(listener);
  listener(getConfig());
  return () => listeners.delete(listener);
}
