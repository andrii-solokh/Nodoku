import defaults from "../config/game-config.json";
import { validateConfig, type GameConfig } from "./config-schema";
export type { GameConfig } from "./config-schema";

let current = validateConfig(defaults);
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
