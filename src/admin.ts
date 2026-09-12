import "./admin.css";
import { applyConfig, getConfig, type GameConfig } from "./config";
import { CONFIG_RULES, validateConfig } from "./config-schema";

const TOKEN_KEY = "nodoku.admin-session.v1";
type Snapshot = { config: GameConfig; revision: string };

export async function mountAdmin(previewTutorial: () => void): Promise<void> {
  let token = "";
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  token = fragment.get("admin-token") || "";
  fragment.delete("admin-token");
  url.hash = fragment.toString();
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  if (!token) { try { token = sessionStorage.getItem(TOKEN_KEY) || ""; } catch { /* Optional storage. */ } }
  const panel = document.createElement("aside");
  panel.id = "admin-panel";
  panel.setAttribute("aria-label", "Admin configurator");
  panel.innerHTML = `<header class="admin-heading"><div><span>Admin</span><h2>Studio settings</h2></div><button id="admin-close" type="button" aria-label="Close configurator">✕</button></header><div id="admin-content"></div><p id="admin-status" role="status" aria-live="polite">Connecting to your local project…</p>`;
  document.body.appendChild(panel);
  const content = panel.querySelector<HTMLElement>("#admin-content")!;
  const status = panel.querySelector<HTMLElement>("#admin-status")!;
  const launcher = document.createElement("button");
  launcher.id = "admin-open";
  launcher.className = "text-button";
  launcher.textContent = "Studio";
  launcher.hidden = true;
  document.body.appendChild(launcher);
  launcher.addEventListener("click", () => { panel.hidden = false; panel.querySelector<HTMLButtonElement>("#admin-close")!.focus(); });
  panel.querySelector("#admin-close")!.addEventListener("click", () => { panel.hidden = true; if (!launcher.hidden) launcher.focus(); });

  async function api(init?: RequestInit): Promise<Snapshot> {
    const response = await fetch("/api/admin/config", {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(response.status === 404
      ? "The configurator runs on your local development server. Open it with npm run admin."
      : typeof body.error === "string" ? body.error : "Could not access the local configuration.");
    if (typeof body.revision !== "string") throw new Error("Invalid configuration response.");
    return { config: validateConfig(body.config), revision: body.revision };
  }

  function editor(initial: Snapshot) {
    let saved = initial;
    let busy = false;
    applyConfig(saved.config);
    launcher.hidden = false;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* Access works without storage. */ }
    content.innerHTML = `<p class="admin-intro">Tune the scene while it plays. Save the values to your project when they feel right.</p><form id="admin-settings"><fieldset id="admin-fields"></fieldset><div class="admin-actions"><button id="admin-save" class="admin-primary" type="submit">Save to project</button><button id="admin-reset" type="button">Reset preview</button><button id="admin-reload" type="button">Reload file</button><button id="admin-export" type="button">Download JSON</button></div></form><p class="admin-file">config/game-config.json</p>`;
    const form = content.querySelector<HTMLFormElement>("form")!;
    const fields = content.querySelector<HTMLFieldSetElement>("fieldset")!;
    const save = content.querySelector<HTMLButtonElement>("#admin-save")!;
    const reset = content.querySelector<HTMLButtonElement>("#admin-reset")!;
    const reload = content.querySelector<HTMLButtonElement>("#admin-reload")!;
    const exported = content.querySelector<HTMLButtonElement>("#admin-export")!;
    type Group = keyof typeof CONFIG_RULES;
    const dotKeys = ["dotAnimation", "dotAnimationMs"];
    const gumKeys = ["materialStyle", "gooStretch", "gooGloss"];
    const dragKeys = Object.keys(CONFIG_RULES.scene).filter(key => key.startsWith("drag"));
    const sections: { title: string; group: Group; keys: string[] }[] = [
      { title: "Gum materials", group: "scene", keys: gumKeys },
      { title: "Tutorial visuals", group: "tutorial", keys: Object.keys(CONFIG_RULES.tutorial) },
      { title: "Drag feel", group: "scene", keys: dragKeys },
      { title: "Home auto-solve", group: "demo", keys: Object.keys(CONFIG_RULES.demo).filter(key => key !== "revealDelayMs") },
      { title: "Node dots", group: "scene", keys: dotKeys },
      { title: "Connections and scene", group: "scene", keys: Object.keys(CONFIG_RULES.scene).filter(key => !dotKeys.includes(key) && !gumKeys.includes(key) && !dragKeys.includes(key)) },
      { title: "Sound", group: "sound", keys: Object.keys(CONFIG_RULES.sound) },
      { title: "Sponsors", group: "sponsors", keys: Object.keys(CONFIG_RULES.sponsors) },
    ];
    const controls: { group: Group; key: string; inputs: (HTMLInputElement | HTMLSelectElement)[] }[] = [];
    const dirty = () => JSON.stringify(getConfig()) !== JSON.stringify(saved.config);
    const availability = () => {
      fields.disabled = busy;
      save.disabled = busy || !dirty() || !!fields.querySelector(":invalid");
      reset.disabled = reload.disabled = exported.disabled = busy;
    };
    const sync = () => {
      const config = getConfig();
      for (const { group, key, inputs } of controls) {
        const value = (config[group] as unknown as Record<string, unknown>)[key];
        for (const input of inputs) {
          input.setCustomValidity("");
          if (input instanceof HTMLInputElement && input.type === "radio") input.checked = input.value === value;
          else if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = value === true;
          else input.value = String(value);
        }
      }
      availability();
    };
    for (const { title, group, keys } of sections) {
      const section = document.createElement("details");
      section.open = keys.includes("materialStyle");
      const summary = document.createElement("summary");
      summary.textContent = title;
      section.appendChild(summary);
      fields.appendChild(section);
      if (group === "tutorial") {
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "admin-preview";
        preview.textContent = "Preview tutorial";
        preview.addEventListener("click", previewTutorial);
        section.appendChild(preview);
      }
      for (const key of keys) {
        const rule = CONFIG_RULES[group][key];
        const row = document.createElement("div");
        row.className = `admin-control admin-${rule.kind}`;
        const label = document.createElement("label");
        label.htmlFor = `config-${group}-${key}`;
        label.textContent = rule.label + (rule.kind === "number" && rule.unit ? ` (${rule.unit})` : "");
        row.appendChild(label);
        if (group === "scene" && key === "materialStyle") {
          label.id = "admin-material-label";
          label.htmlFor = "config-scene-materialStyle-classic";
          const choices = document.createElement("div");
          choices.className = "admin-material-choices";
          choices.setAttribute("role", "radiogroup");
          choices.setAttribute("aria-labelledby", label.id);
          const radios: HTMLInputElement[] = [];
          for (const [value, name, detail] of [
            ["classic", "Classic", "Matte nodes · straight links"],
            ["gum", "Gum", "Glossy nodes · stretchy links"],
          ] as const) {
            const option = document.createElement("label");
            option.className = "admin-material-option";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "materialStyle";
            radio.id = `config-scene-materialStyle-${value}`;
            radio.value = value;
            const card = document.createElement("span");
            card.className = "admin-material-card";
            card.innerHTML = `<svg viewBox="0 0 120 64" aria-hidden="true"><defs><radialGradient id="admin-surface-${value}" cx="32%" cy="22%" r="80%"><stop stop-color="#fffdf9"/><stop offset="1" stop-color="${value === "gum" ? "#cfc6dd" : "#b8b0c9"}"/></radialGradient><linearGradient id="admin-link-${value}" x2="0" y2="1"><stop stop-color="#c8b4f1"/><stop offset=".4" stop-color="#a18bd4"/><stop offset="1" stop-color="#7964ae"/></linearGradient></defs>${value === "gum" ? `<path d="M25 18 C45 31 75 31 95 18 L95 46 C75 33 45 33 25 46Z"` : `<rect x="25" y="28" width="70" height="8"`} fill="url(#admin-link-${value})"/><circle cx="25" cy="32" r="19" fill="url(#admin-surface-${value})"/><circle cx="95" cy="32" r="19" fill="url(#admin-surface-${value})"/>${value === "gum" ? '<ellipse cx="20" cy="23" rx="5" ry="3" fill="white" opacity=".8"/><ellipse cx="90" cy="23" rx="5" ry="3" fill="white" opacity=".8"/>' : ""}</svg><strong>${name}</strong><span>${detail}</span>`;
            option.append(radio, card);
            choices.appendChild(option);
            radios.push(radio);
            radio.addEventListener("input", () => {
              if (busy || !radio.checked) return;
              const draft = getConfig();
              applyConfig({ ...draft, scene: { ...draft.scene, materialStyle: value } });
              sync();
              status.textContent = dirty() ? "Live preview · unsaved changes" : "Preview matches the saved file.";
            });
          }
          controls.push({ group, key, inputs: radios });
          const description = document.createElement("p");
          description.className = "admin-description";
          description.textContent = "Select a look to preview it on the puzzle. Save to project keeps your choice.";
          row.append(choices, description);
          section.appendChild(row);
          continue;
        }
        const input = rule.kind === "choice" ? document.createElement("select") : document.createElement("input");
        input.id = label.htmlFor;
        if (input instanceof HTMLInputElement) {
          input.type = rule.kind === "number" ? "number" : rule.kind === "boolean" ? "checkbox" : "color";
          if (rule.kind === "number") {
            input.min = String(rule.min); input.max = String(rule.max); input.step = "any"; input.required = true;
          }
        } else if (rule.kind === "choice") {
          for (const [value, text] of Object.entries(rule.options)) input.add(new Option(text, value));
        }
        row.appendChild(input);
        const inputs: (HTMLInputElement | HTMLSelectElement)[] = [input];
        if (rule.kind === "number") {
          const range = document.createElement("input");
          range.type = "range"; range.min = String(rule.min); range.max = String(rule.max); range.step = String(rule.step);
          range.setAttribute("aria-label", rule.label);
          row.appendChild(range);
          inputs.push(range);
        }
        for (const control of inputs) control.addEventListener("input", () => {
          if (busy) return;
          control.setCustomValidity("");
          if (!control.checkValidity()) { status.textContent = "Choose a value within the shown range."; availability(); return; }
          const value = rule.kind === "boolean" ? (control as HTMLInputElement).checked : rule.kind === "number" ? Number(control.value) : control.value;
          const draft = getConfig();
          try {
            applyConfig({ ...draft, [group]: { ...draft[group], [key]: value } });
            sync();
            status.textContent = dirty() ? "Live preview · unsaved changes" : "Preview matches the saved file.";
          } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Invalid setting.";
            control.setCustomValidity(status.textContent);
            save.disabled = true;
          }
        });
        controls.push({ group, key, inputs });
        if (rule.description) {
          const description = document.createElement("p");
          description.className = "admin-description";
          description.id = `${input.id}-description`;
          description.textContent = rule.description;
          inputs.forEach(control => control.setAttribute("aria-describedby", description.id));
          row.appendChild(description);
        }
        section.appendChild(row);
      }
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || !dirty() || !form.reportValidity()) return;
      busy = true; availability(); status.textContent = "Saving to your project…";
      try {
        saved = await api({ method: "PUT", body: JSON.stringify({ config: getConfig(), revision: saved.revision }) });
        applyConfig(saved.config);
        status.textContent = "Saved to config/game-config.json. Ready to commit.";
      } catch (error) { status.textContent = error instanceof Error ? error.message : "Save failed. Your preview is still here."; }
      finally { busy = false; sync(); }
    });
    reset.addEventListener("click", () => { applyConfig(saved.config); sync(); status.textContent = "Preview reset to the saved values."; });
    reload.addEventListener("click", async () => {
      busy = true; availability();
      try { saved = await api(); applyConfig(saved.config); status.textContent = "Loaded the current project file."; }
      catch (error) { status.textContent = error instanceof Error ? error.message : "Could not reload configuration."; }
      finally { busy = false; sync(); }
    });
    exported.addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(getConfig(), null, 2) + "\n"], { type: "application/json" }));
      link.download = "game-config.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    sync();
    status.textContent = "Loaded from your project. Changes preview immediately.";
  }

  async function authenticate() {
    try { editor(await api()); }
    catch (error) {
      content.innerHTML = `<p class="admin-intro">Open the private link printed by <code>npm run admin</code>, or enter your local admin token.</p><form id="admin-login"><label for="admin-token">Admin token</label><input id="admin-token" type="password" autocomplete="off" required /><button class="admin-primary" type="submit">Unlock configurator</button></form>`;
      status.textContent = error instanceof Error ? error.message : "The local configurator is unavailable.";
      content.querySelector("form")!.addEventListener("submit", event => {
        event.preventDefault();
        token = content.querySelector<HTMLInputElement>("#admin-token")!.value.trim();
        void authenticate();
      });
    }
  }
  await authenticate();
}
