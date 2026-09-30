import GUI from "three/addons/libs/lil-gui.module.min.js";
import projectConfig from "../config/game-config.json";
import { applyConfig, getConfig, PIP_SHADOW_PRESET_KEY, subscribeConfig, type GameConfig } from "./config";
import { CONFIG_RULES, PIP_SHADOW_DEFAULTS, validateConfig } from "./config-schema";
import { timeoutSignal } from "./timeout";
import "./shadow-gui.css";

const TOKEN_KEY = "nodoku.admin-session.v1";
type ShadowKey = keyof typeof PIP_SHADOW_DEFAULTS;
type ShadowValues = Pick<GameConfig["scene"], ShadowKey>;
type Snapshot = { config: GameConfig; revision: string };
const shadowKeys = Object.keys(PIP_SHADOW_DEFAULTS) as ShadowKey[];

function shadowValues(): ShadowValues {
  const scene = getConfig().scene;
  return {
    pipShadowBlur: scene.pipShadowBlur,
    pipShadowStrength: scene.pipShadowStrength,
    pipShadowOffset: scene.pipShadowOffset,
  };
}

function previewShadow(values: ShadowValues): void {
  const config = getConfig();
  applyConfig({ ...config, scene: { ...config.scene, ...values } });
}

export function mountShadowGui(): void {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  let token = fragment.get("admin-token") || "";
  if (token) {
    fragment.delete("admin-token");
    url.hash = fragment.toString();
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* The current tab can still save. */ }
  } else {
    try { token = sessionStorage.getItem(TOKEN_KEY) || ""; } catch { /* Browser saves still work. */ }
  }

  let loadedBrowserPreset = false;
  try {
    const preset = JSON.parse(localStorage.getItem(PIP_SHADOW_PRESET_KEY) || "null") as ShadowValues | null;
    loadedBrowserPreset = !!preset && shadowKeys.every(key => typeof preset[key] === "number");
  } catch { /* Ignore an invalid or unavailable browser preset. */ }
  const projectScene = validateConfig(projectConfig).scene;
  let projectValues: ShadowValues = {
    pipShadowBlur: projectScene.pipShadowBlur,
    pipShadowStrength: projectScene.pipShadowStrength,
    pipShadowOffset: projectScene.pipShadowOffset,
  };

  const host = document.createElement("aside");
  host.id = "pip-shadow-panel";
  host.setAttribute("aria-label", "Plus shadow controls");
  document.body.appendChild(host);
  const gui = new GUI({ title: "Plus contact shadows", container: host, width: 292 });
  const status = document.createElement("p");
  status.id = "pip-shadow-status";
  status.setAttribute("role", "status");
  status.textContent = loadedBrowserPreset ? "Loaded your browser preset." : "Changes preview immediately.";
  host.appendChild(status);
  const settings = shadowValues();
  const controllers: { updateDisplay(): void }[] = [];
  subscribeConfig(() => {
    Object.assign(settings, shadowValues());
    for (const controller of controllers) controller.updateDisplay();
  });
  for (const key of shadowKeys) {
    const rule = CONFIG_RULES.scene[key];
    if (rule.kind !== "number") continue;
    const controller = gui.add(settings, key, rule.min, rule.max, rule.step).name(rule.label);
    controller.onChange((value: number) => {
      try {
        previewShadow({ ...shadowValues(), [key]: value });
        status.textContent = "Live preview · save when it looks right.";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Invalid shadow setting.";
      }
    });
    controllers.push(controller);
  }

  async function api(init?: RequestInit): Promise<Snapshot> {
    const response = await fetch("/api/admin/config", {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: timeoutSignal(10000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not save to the project.");
    return body as Snapshot;
  }

  const actions = {
    saveBrowser: () => {
      try {
        localStorage.setItem(PIP_SHADOW_PRESET_KEY, JSON.stringify(shadowValues()));
        status.textContent = "Saved in this browser. Use project save to share the look.";
      } catch { status.textContent = "Browser storage is unavailable."; }
    },
    saveProject: async () => {
      if (!token) {
        status.textContent = `For project save, open the private link from: npm run admin -- ${location.origin}${location.pathname}`;
        return;
      }
      status.textContent = "Saving to config/game-config.json…";
      let browserPreset: string | null = null;
      try {
        const saved = await api();
        try {
          browserPreset = localStorage.getItem(PIP_SHADOW_PRESET_KEY);
          localStorage.removeItem(PIP_SHADOW_PRESET_KEY);
        } catch { /* Project saving does not depend on browser storage. */ }
        const result = await api({ method: "PUT", body: JSON.stringify({
          revision: saved.revision,
          config: { ...saved.config, scene: { ...saved.config.scene, ...shadowValues() } },
        }) });
        projectValues = {
          pipShadowBlur: result.config.scene.pipShadowBlur,
          pipShadowStrength: result.config.scene.pipShadowStrength,
          pipShadowOffset: result.config.scene.pipShadowOffset,
        };
        status.textContent = "Saved to config/game-config.json. Ready to commit.";
      } catch (error) {
        if (browserPreset !== null) try { localStorage.setItem(PIP_SHADOW_PRESET_KEY, browserPreset); } catch { /* Keep the live preview. */ }
        status.textContent = error instanceof Error ? error.message : "Project save failed; preview is still here.";
      }
    },
    reset: () => {
      try { localStorage.removeItem(PIP_SHADOW_PRESET_KEY); } catch { /* The preview still resets. */ }
      previewShadow(projectValues);
      status.textContent = "Restored the project settings and cleared the browser preset.";
    },
  };
  gui.add(actions, "saveBrowser").name("Save in browser");
  gui.add(actions, "saveProject").name("Save to project");
  gui.add(actions, "reset").name("Reset to project");
}
