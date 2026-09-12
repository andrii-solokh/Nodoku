import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { handleAdminApi, readAdminToken, type AdminContext } from "../scripts/admin-api.ts";
import { validateConfig, TUTORIAL_DEFAULTS, SELECTION_DEFAULTS } from "../src/config-schema.ts";

const baseline = validateConfig(JSON.parse(readFileSync(new URL("../config/game-config.json", import.meta.url), "utf8")));
const origin = "http://localhost:5173";

function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(resolve(tmpdir(), "nodoku-admin-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, "config"));
  const path = resolve(root, "config/game-config.json");
  writeFileSync(path, `${JSON.stringify(baseline)}\n`);
  const token = readAdminToken(root);
  const context: AdminContext = { root, remoteAddress: "127.0.0.1" };
  const call = (method = "GET", body?: unknown, headers: Record<string, string> = {}, url = `${origin}/api/admin/config`) => {
    return handleAdminApi(new Request(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(method === "PUT" ? { origin, "content-type": "application/json" } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }), context);
  };
  return { root, path, token, context, call };
}

test("admin token is random, persistent, and owner-readable only", t => {
  const { root, token } = fixture(t);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(readAdminToken(root), token);
  const tokenPath = resolve(root, ".nodoku-data/admin-token");
  assert.equal(statSync(tokenPath).mode & 0o777, 0o600);
  chmodSync(tokenPath, 0o644);
  assert.equal(readAdminToken(root), token);
  assert.equal(statSync(tokenPath).mode & 0o777, 0o600);
  const other = fixture(t);
  assert.notEqual(other.token, token);
});

test("authenticated GET returns validated config and exact file revision without credentials", async t => {
  const { call, path, token } = fixture(t);
  const result = await call();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  const text = await result.text();
  assert.ok(!text.includes(token));
  const body = JSON.parse(text);
  assert.deepEqual(body.config, baseline);
  assert.equal(body.revision, createHash("sha256").update(readFileSync(path)).digest("hex"));
  assert.deepEqual(Object.keys(body).sort(), ["config", "revision"]);
});

test("missing, malformed, and incorrect credentials are rejected", async t => {
  const { call } = fixture(t);
  for (const authorization of ["", "Basic test", "Bearer short", `Bearer ${"0".repeat(64)}`]) {
    assert.equal((await call("GET", undefined, { authorization })).status, 401);
  }
});

test("only loopback sockets and local URL hosts can reach admin", async t => {
  const { call, context } = fixture(t);
  assert.equal((await call("GET", undefined, {}, "http://evil.example/api/admin/config")).status, 403);
  assert.equal((await call("GET", undefined, { host: "evil.example" })).status, 403);
  for (const remoteAddress of ["192.168.1.3", "8.8.8.8", undefined]) {
    context.remoteAddress = remoteAddress;
    assert.equal((await call()).status, 403);
  }
  for (const remoteAddress of ["::1", "::ffff:127.0.0.1"]) {
    context.remoteAddress = remoteAddress;
    assert.equal((await call()).status, 200);
  }
  assert.equal((await call("GET", undefined, {}, "http://[::1]:5173/api/admin/config")).status, 200);
});

test("cross-site reads and nonmatching write origins are rejected", async t => {
  const { call } = fixture(t);
  for (const site of ["cross-site", "same-site", "none"]) {
    assert.equal((await call("GET", undefined, { "sec-fetch-site": site })).status, 403);
  }
  assert.equal((await call("GET", undefined, { "sec-fetch-site": "same-origin" })).status, 200);
  for (const badOrigin of ["", "null", "http://evil.example", "http://localhost:9999"]) {
    assert.equal((await call("PUT", {}, { origin: badOrigin })).status, 403);
  }
  assert.equal((await call("PUT", {}, { "sec-fetch-site": "cross-site" })).status, 403);
});

test("PUT validates envelope, strict config schema, JSON type, and body length before touching disk", async t => {
  const { call, path } = fixture(t);
  const before = readFileSync(path, "utf8");
  const { revision } = await (await call()).json();
  for (const body of ["{", null, [], {}, { config: baseline, revision: "bad" }, { config: baseline, revision, path: "/tmp/escape" }, { config: { ...baseline, unknown: true }, revision }, { config: {}, revision }]) {
    assert.equal((await call("PUT", body)).status, 400);
  }
  assert.equal((await call("PUT", { config: baseline, revision }, { "content-type": "text/plain" })).status, 415);
  assert.equal((await call("PUT", "x".repeat(16 * 1024 + 1))).status, 413);
  assert.equal((await call("PUT", "{}", { "content-length": "16385" })).status, 413);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("PUT atomically replaces the file and returns a matching new revision", async t => {
  const { call, path } = fixture(t);
  const { revision } = await (await call()).json();
  const oldInode = statSync(path).ino;
  const result = await call("PUT", { config: baseline, revision });
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert.notEqual(saved.revision, revision);
  assert.notEqual(statSync(path).ino, oldInode, "rename installs a new complete file");
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), saved.config);
  assert.equal(saved.revision, createHash("sha256").update(readFileSync(path)).digest("hex"));
  assert.deepEqual(readdirSync(resolve(path, "..")), ["game-config.json"]);
  assert.deepEqual(await (await call()).json(), saved);
});

const dragDefaults = {
  dragMaxLength: 1.15, dragThickness: 1.15, dragMinThickness: .3, dragTipSize: .05,
  dragFollowMs: 90, dragMagnetRange: .45, dragMagnetStrength: .7,
  dragMagnetResponseMs: 120, dragReturnMs: 520, dragElasticity: .55,
};
const dragBounds = {
  dragMaxLength: [1, 3], dragThickness: [.5, 3], dragMinThickness: [.1, 1], dragTipSize: [.015, .15],
  dragFollowMs: [0, 400], dragMagnetRange: [0, 1], dragMagnetStrength: [0, 1.5],
  dragMagnetResponseMs: [0, 500], dragReturnMs: [0, 1500], dragElasticity: [0, 1],
};

test("legacy drag settings gain defaults on read and persist only on explicit save", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  for (const key of Object.keys(dragDefaults)) delete legacy.scene[key];
  const original = `${JSON.stringify(legacy)}\n\n`;
  writeFileSync(path, original);
  const current = await (await call()).json();
  const expected = { ...legacy, scene: { ...legacy.scene, ...dragDefaults } };
  assert.deepEqual(current.config, expected);
  assert.equal(readFileSync(path, "utf8"), original, "previewing a legacy file leaves its bytes untouched");
  const response = await call("PUT", { config: legacy, revision: current.revision });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved.config, expected);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected);
  assert.deepEqual(await (await call()).json(), saved, "subsequent loads retain canonical saved defaults");
});

test("drag tuning saves boundary values and partially missing fields without resetting owner settings", async t => {
  const { call, path } = fixture(t);
  let current = await (await call()).json();
  for (const boundary of [0, 1]) {
    const tuning = Object.fromEntries(Object.entries(dragBounds).map(([key, bounds]) => [key, bounds[boundary]]));
    const next = { ...current.config, scene: { ...current.config.scene, ...tuning } };
    const response = await call("PUT", { config: next, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
    const other = structuredClone(next);
    for (const key of Object.keys(dragDefaults)) other.scene[key] = baseline.scene[key];
    assert.deepEqual(other, baseline, "drag tuning leaves every unrelated owner setting intact");
  }
  const tuned = { ...baseline, scene: { ...baseline.scene, ...Object.fromEntries(Object.entries(dragBounds).map(([key, bounds]) => [key, bounds[0]])) } };
  for (const [key, fallback] of Object.entries(dragDefaults)) {
    const partial = structuredClone(tuned);
    delete partial.scene[key];
    const original = `${JSON.stringify(partial)}\n`;
    writeFileSync(path, original);
    current = await (await call()).json();
    const expected = { ...tuned, scene: { ...tuned.scene, [key]: fallback } };
    assert.deepEqual(current.config, expected, `only absent ${key} gains a default, including when other controls are zero`);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal((await call("PUT", { config: partial, revision: current.revision })).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected);
  }
  const missingRequired = structuredClone(tuned);
  delete missingRequired.scene.rodRadius;
  assert.throws(() => validateConfig(missingRequired), "drag migration never invents pre-existing scene fields");
});

test("drag validation rejects supplied invalid values and unknown fields without touching disk", async t => {
  const { call, path } = fixture(t);
  const current = await (await call()).json();
  const original = readFileSync(path, "utf8");
  for (const [key, [minimum, maximum]] of Object.entries(dragBounds)) {
    const invalid = [minimum - .001, maximum + .001, null, false, "0", {}, NaN, Infinity];
    if (key.endsWith("Ms")) invalid.push(12.5);
    for (const value of invalid) {
      const config = { ...current.config, scene: { ...current.config.scene, [key]: value } };
      assert.throws(() => validateConfig(config), `${key} rejects a supplied invalid value instead of defaulting it`);
      assert.equal((await call("PUT", { config, revision: current.revision })).status, 400);
      assert.equal(readFileSync(path, "utf8"), original);
    }
    assert.throws(() => validateConfig({ ...current.config, scene: { ...current.config.scene, [key]: undefined } }), "an explicitly undefined value is not treated as absent");
  }
  const unknown = { ...current.config, scene: { ...current.config.scene, dragSurprise: true } };
  assert.equal((await call("PUT", { config: unknown, revision: current.revision })).status, 400);
  assert.equal(readFileSync(path, "utf8"), original);
});

test("legacy demo timing gains melody defaults and saves both modes without changing owner tuning", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.demo.timingMode;
  delete legacy.demo.tempoBpm;
  legacy.demo.stepDelayMs = 70;
  legacy.demo.revealDelayMs = 0;
  legacy.scene.connectionMs = 420;
  legacy.sound.completionNoteIntervalMs = 360;
  const original = `${JSON.stringify(legacy)}\n`;
  writeFileSync(path, original);
  let current = await (await call()).json();
  assert.deepEqual(current.config, {
    ...legacy, demo: { ...legacy.demo, timingMode: "melody", tempoBpm: 96 },
  });
  assert.equal(readFileSync(path, "utf8"), original, "reading legacy timing never rewrites the owner file");
  for (const [timingMode, tempoBpm] of [["fixed", 40], ["melody", 180], ["fixed", 113]]) {
    const next = { ...current.config, demo: { ...current.config.demo, timingMode, tempoBpm } };
    const response = await call("PUT", { config: next, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
    const { timingMode: _mode, tempoBpm: _tempo, ...demo } = next.demo;
    assert.deepEqual({ ...next, demo }, legacy, "timing edits preserve the fixed pause, completion spacing and every other owner value");
  }
});

test("partial demo timing migrations preserve an explicit Fixed delay choice", async t => {
  const { call, path } = fixture(t);
  const complete = { ...baseline, demo: { ...baseline.demo, timingMode: "fixed", tempoBpm: 113 } };
  assert.deepEqual(validateConfig(complete), complete, "an existing fixed mode and tempo are never defaulted");
  for (const [key, fallback] of Object.entries({ timingMode: "melody", tempoBpm: 96 })) {
    const partial = structuredClone(complete);
    delete partial.demo[key];
    const original = JSON.stringify(partial);
    writeFileSync(path, original);
    const current = await (await call()).json();
    const expected = { ...complete, demo: { ...complete.demo, [key]: fallback } };
    assert.deepEqual(current.config, expected, `only absent ${key} receives its default`);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal((await call("PUT", { config: partial, revision: current.revision })).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected);
  }
  const incomplete = structuredClone(complete);
  delete incomplete.demo.stepDelayMs;
  assert.throws(() => validateConfig(incomplete), "legacy migration does not invent missing pre-existing settings");
});

test("demo timing rejects unknown modes and invalid tempos without touching disk", async t => {
  const { call, path } = fixture(t);
  const current = await (await call()).json();
  const original = readFileSync(path, "utf8");
  const invalidValues = {
    timingMode: ["unknown", "Melody", "", null, false, 0, {}],
    tempoBpm: [39, 181, 96.5, "96", null, false, {}, NaN, Infinity],
  };
  for (const [key, values] of Object.entries(invalidValues)) {
    for (const value of values) {
      const config = { ...current.config, demo: { ...current.config.demo, [key]: value } };
      assert.throws(() => validateConfig(config), "supplied invalid timing values never receive migration defaults");
      assert.equal((await call("PUT", { config, revision: current.revision })).status, 400);
      assert.equal(readFileSync(path, "utf8"), original);
    }
    assert.throws(() => validateConfig({ ...current.config, demo: { ...current.config.demo, [key]: undefined } }), "present undefined timing fields remain invalid");
  }
});

test("legacy configuration gains dot defaults and saves every dot style without changing other settings", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.scene.dotAnimation;
  delete legacy.scene.dotAnimationMs;
  const original = `${JSON.stringify(legacy)}\n`;
  writeFileSync(path, original);
  let current = await (await call()).json();
  assert.deepEqual(current.config, {
    ...legacy, scene: { ...legacy.scene, dotAnimation: "glide", dotAnimationMs: 460 },
  });
  assert.equal(readFileSync(path, "utf8"), original, "reading older settings does not write the file");
  for (const [index, dotAnimation] of ["glide", "spring", "orbit", "fade"].entries()) {
    const next = { ...current.config, scene: { ...current.config.scene, dotAnimation, dotAnimationMs: index * 600 } };
    const saved = await call("PUT", { config: next, revision: current.revision });
    assert.equal(saved.status, 200);
    current = await saved.json();
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
    const { dotAnimation: _style, dotAnimationMs: _duration, ...scene } = next.scene;
    assert.deepEqual({ ...next, scene }, legacy, "existing owner settings stay unchanged");
  }
  for (const invalid of [
    { dotAnimation: "unknown" }, { dotAnimation: null },
    { dotAnimationMs: -1 }, { dotAnimationMs: 2001 }, { dotAnimationMs: 12.5 },
    { dotAnimationMs: "460" }, { surprise: true },
  ]) {
    const before = readFileSync(path, "utf8");
    const config = { ...current.config, scene: { ...current.config.scene, ...invalid } };
    assert.equal((await call("PUT", { config, revision: current.revision })).status, 400);
    assert.equal(readFileSync(path, "utf8"), before);
  }
});

test("external file edits and concurrent saves cannot overwrite a stale revision", async t => {
  const { call, path } = fixture(t);
  const { revision } = await (await call()).json();
  const changedBytes = `${JSON.stringify(baseline)}\n\n`;
  writeFileSync(path, changedBytes);
  assert.equal((await call("PUT", { config: baseline, revision })).status, 409);
  assert.equal(readFileSync(path, "utf8"), changedBytes);
  const latest = await (await call()).json();
  const outcomes = await Promise.all([call("PUT", latest), call("PUT", latest)]);
  assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
});

test("legacy configs gain sound defaults and save every melody without changing owner settings", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.sound;
  const original = `${JSON.stringify(legacy)}\n`;
  writeFileSync(path, original);
  let current = await (await call()).json();
  assert.deepEqual(current.config, {
    ...legacy, sound: { connectionMelody: "odeToJoy", noteDurationMs: 320, melodyVolume: .7, completionSound: true, completionNoteIntervalMs: 240, showAmbientMusic: false, ambientVolume: .18 },
  });
  assert.equal(readFileSync(path, "utf8"), original, "loading a legacy config does not rewrite the file");
  for (const [index, connectionMelody] of ["odeToJoy", "furElise", "classic"].entries()) {
    const next = {
      ...current.config,
      sound: { ...current.config.sound, connectionMelody, noteDurationMs: 100 + index * 450, melodyVolume: index / 2 },
    };
    const response = await call("PUT", { config: next, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
    const { sound: _sound, ...otherSettings } = next;
    assert.deepEqual(otherSettings, legacy, "melody changes preserve all existing owner settings");
  }
  for (const sound of [
    null, [], "odeToJoy", {}, { connectionMelody: "odeToJoy" },
    ...[
      { connectionMelody: "unknown" }, { connectionMelody: null },
      { noteDurationMs: 99 }, { noteDurationMs: 1001 }, { noteDurationMs: 320.5 }, { noteDurationMs: "320" },
      { melodyVolume: -.01 }, { melodyVolume: 1.01 }, { melodyVolume: "0.7" }, { melodyVolume: null },
      { ambientVolume: -.01 }, { ambientVolume: 1.01 }, { ambientVolume: "0.18" }, { ambientVolume: null },
      { surprise: true },
    ].map(invalid => ({ ...current.config.sound, ...invalid })),
  ]) {
    const before = readFileSync(path, "utf8");
    assert.equal((await call("PUT", { config: { ...current.config, sound }, revision: current.revision })).status, 400, "an explicitly provided invalid sound section is rejected");
    assert.equal(readFileSync(path, "utf8"), before);
  }
});

test("ambient visibility defaults hidden in legacy files and saves explicit choices without changing other settings", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.sound.showAmbientMusic;
  const original = JSON.stringify(legacy);
  writeFileSync(path, original);
  let current = await (await call()).json();
  assert.deepEqual(current.config, { ...legacy, sound: { ...legacy.sound, showAmbientMusic: false } });
  assert.equal(readFileSync(path, "utf8"), original, "reading a legacy file does not rewrite it");
  for (const showAmbientMusic of [true, false]) {
    const next = { ...current.config, sound: { ...current.config.sound, showAmbientMusic } };
    const response = await call("PUT", { config: next, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
  }
  for (const showAmbientMusic of [0, 1, "false", "true", null, [], {}]) {
    const before = readFileSync(path, "utf8");
    const config = { ...current.config, sound: { ...current.config.sound, showAmbientMusic } };
    assert.equal((await call("PUT", { config, revision: current.revision })).status, 400);
    assert.equal(readFileSync(path, "utf8"), before);
  }
  assert.throws(() => validateConfig({ ...current.config, sound: { ...current.config.sound, showAmbientMusic: undefined } }));
});

test("existing sound configs gain ambient volume while preserving saved melody and owner settings", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.sound.ambientVolume;
  legacy.sound.connectionMelody = "furElise";
  legacy.sound.noteDurationMs = 650;
  legacy.sound.melodyVolume = .42;
  const original = JSON.stringify(legacy);
  writeFileSync(path, original);
  let current = await (await call()).json();
  assert.deepEqual(current.config, { ...legacy, sound: { ...legacy.sound, ambientVolume: .18 } });
  assert.equal(readFileSync(path, "utf8"), original, "migration does not rewrite the file on read");
  for (const ambientVolume of [0, 1]) {
    const next = { ...current.config, sound: { ...current.config.sound, ambientVolume } };
    const response = await call("PUT", { config: next, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
  }
});

test("legacy sound configs gain completion defaults and save their bounds without changing owner tuning", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.sound.completionSound;
  delete legacy.sound.completionNoteIntervalMs;
  legacy.sound.connectionMelody = "furElise";
  legacy.sound.noteDurationMs = 810;
  legacy.sound.melodyVolume = .75;
  legacy.demo.stepDelayMs = 70;
  legacy.demo.revealDelayMs = 0;
  const original = `${JSON.stringify(legacy)}\n`;
  writeFileSync(path, original);
  let current = await (await call()).json();
  assert.deepEqual(current.config, {
    ...legacy, sound: { ...legacy.sound, completionSound: true, completionNoteIntervalMs: 240 },
  });
  assert.equal(readFileSync(path, "utf8"), original, "reading completion defaults does not rewrite the owner file");
  for (const [completionSound, completionNoteIntervalMs] of [[false, 80], [true, 1000], [false, 137]]) {
    const next = { ...current.config, sound: { ...current.config.sound, completionSound, completionNoteIntervalMs } };
    const response = await call("PUT", { config: next, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
    const { completionSound: _enabled, completionNoteIntervalMs: _interval, ...sound } = next.sound;
    assert.deepEqual({ ...next, sound }, legacy, "saving completion controls preserves every other tuning value");
  }
});

test("completion migration fills only absent fields and retains an explicit disabled ending", async t => {
  const { call, path } = fixture(t);
  const complete = { ...baseline, sound: { ...baseline.sound, completionSound: false, completionNoteIntervalMs: 640 } };
  assert.deepEqual(validateConfig(complete), complete, "a disabled completion ending is preserved");
  for (const [key, fallback] of Object.entries({ completionSound: true, completionNoteIntervalMs: 240 })) {
    const partial = structuredClone(complete);
    delete partial.sound[key];
    const original = JSON.stringify(partial);
    writeFileSync(path, original);
    const current = await (await call()).json();
    const expected = { ...complete, sound: { ...complete.sound, [key]: fallback } };
    assert.deepEqual(current.config, expected, `only absent ${key} receives its default`);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal((await call("PUT", { config: partial, revision: current.revision })).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected);
  }
});

test("completion controls reject invalid booleans and intervals without touching disk", async t => {
  const { call, path } = fixture(t);
  const current = await (await call()).json();
  const original = readFileSync(path, "utf8");
  const invalidValues = {
    completionSound: [0, 1, "true", "false", null, {}, [], NaN, Infinity],
    completionNoteIntervalMs: [79, 1001, 240.5, "240", null, false, {}, NaN, Infinity],
  };
  for (const [key, values] of Object.entries(invalidValues)) {
    for (const value of values) {
      const config = { ...current.config, sound: { ...current.config.sound, [key]: value } };
      assert.throws(() => validateConfig(config), "a supplied invalid completion value never receives a fallback");
      assert.equal((await call("PUT", { config, revision: current.revision })).status, 400);
      assert.equal(readFileSync(path, "utf8"), original);
    }
    assert.throws(() => validateConfig({ ...current.config, sound: { ...current.config.sound, [key]: undefined } }), "present undefined values are rejected");
  }
});

test("legacy completion counts migrate to a boolean and canonical saves remove only the retired key", async t => {
  const { call, path } = fixture(t);
  for (const completionNotes of [0, 1, 10, 32]) {
    const legacy = structuredClone(baseline);
    delete legacy.sound.completionSound;
    legacy.sound.completionNotes = completionNotes;
    legacy.sound.completionNoteIntervalMs = 640;
    const original = `${JSON.stringify(legacy)}\n`;
    writeFileSync(path, original);
    const current = await (await call()).json();
    const { completionNotes: _count, ...sound } = legacy.sound;
    const expected = { ...legacy, sound: { ...sound, completionSound: completionNotes > 0 } };
    assert.deepEqual(current.config, expected);
    assert.equal(Object.hasOwn(current.config.sound, "completionNotes"), false);
    assert.equal(readFileSync(path, "utf8"), original, "reading an old count does not rewrite the file");
    assert.equal((await call("PUT", { config: legacy, revision: current.revision })).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected, "saving removes the count without changing other settings");
    assert.deepEqual((await (await call()).json()).config, expected);
  }
});

test("an explicit completion toggle wins over a valid legacy count", async t => {
  const { call, path } = fixture(t);
  let current = await (await call()).json();
  for (const [completionSound, completionNotes] of [[true, 0], [false, 32]]) {
    const config = { ...baseline, sound: { ...baseline.sound, completionSound, completionNotes } };
    const { completionNotes: _count, ...sound } = config.sound;
    const expected = { ...config, sound };
    assert.deepEqual(validateConfig(config), expected);
    const response = await call("PUT", { config, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual(current.config, expected);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected);
  }
});

test("legacy completion counts still validate when the new toggle is supplied", async t => {
  const { call, path } = fixture(t);
  const current = await (await call()).json();
  const original = readFileSync(path, "utf8");
  for (const completionNotes of [-1, 33, .5, "10", null, false, {}, [], NaN, Infinity]) {
    for (const newToggle of [undefined, false, true]) {
      const sound = { ...current.config.sound, completionNotes };
      if (newToggle === undefined) delete sound.completionSound;
      else sound.completionSound = newToggle;
      const config = { ...current.config, sound };
      assert.throws(() => validateConfig(config), /Invalid value for completion notes/);
      assert.equal((await call("PUT", { config, revision: current.revision })).status, 400);
      assert.equal(readFileSync(path, "utf8"), original);
    }
  }
  assert.throws(() => validateConfig({ ...current.config, sound: { ...current.config.sound, completionNotes: undefined } }));
  for (const completionSound of [0, "false", null, undefined]) {
    assert.throws(() => validateConfig({ ...current.config, sound: { ...current.config.sound, completionNotes: 0, completionSound } }), "a valid legacy count does not replace an invalid explicit toggle");
  }
  const unknown = { ...current.config, sound: { ...current.config.sound, completionNotes: 0, completionSounds: false } };
  assert.throws(() => validateConfig(unknown), /Configuration fields/);
  assert.equal((await call("PUT", { config: unknown, revision: current.revision })).status, 400, "migration does not silently remove unknown sound fields");
  assert.equal(readFileSync(path, "utf8"), original);
});

test("older configs gain shape duration without rewriting and validated saves persist its value", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.scene.shapeTransitionMs;
  const bytes = JSON.stringify(legacy);
  writeFileSync(path, bytes);
  const current = await (await call()).json();
  assert.equal(current.config.scene.shapeTransitionMs, 700);
  assert.equal(readFileSync(path, "utf8"), bytes);
  const next = { ...current.config, scene: { ...current.config.scene, shapeTransitionMs: 1200 } };
  const response = await call("PUT", { config: next, revision: current.revision });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
  assert.deepEqual((await (await call()).json()).config, next);
  for (const value of [-1, 2001, 12.5, "700", null]) {
    const invalid = { ...next, scene: { ...next.scene, shapeTransitionMs: value } };
    assert.equal((await call("PUT", { config: invalid, revision: saved.revision })).status, 400);
  }
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
});

test("older configs gain floating defaults and persist validated motion settings", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.scene.nodeFloatAmplitude;
  delete legacy.scene.nodeFloatPeriodMs;
  const bytes = JSON.stringify(legacy);
  writeFileSync(path, bytes);
  const current = await (await call()).json();
  assert.deepEqual(current.config, {
    ...legacy, scene: { ...legacy.scene, nodeFloatAmplitude: .025, nodeFloatPeriodMs: 6000 },
  });
  assert.equal(readFileSync(path, "utf8"), bytes, "loading does not overwrite the owner's file");
  const next = { ...current.config, scene: { ...current.config.scene, nodeFloatAmplitude: 0, nodeFloatPeriodMs: 9000 } };
  const response = await call("PUT", { config: next, revision: current.revision });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual((await (await call()).json()).config, next);
  for (const invalid of [
    { nodeFloatAmplitude: -.001 }, { nodeFloatAmplitude: .081 }, { nodeFloatAmplitude: "0.025" },
    { nodeFloatPeriodMs: 1999 }, { nodeFloatPeriodMs: 15001 }, { nodeFloatPeriodMs: 6000.5 }, { nodeFloatPeriodMs: null },
  ]) {
    assert.equal((await call("PUT", { config: { ...next, scene: { ...next.scene, ...invalid } }, revision: saved.revision })).status, 400);
  }
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
});


test("legacy sponsor settings gain the global placement toggle", () => {
  const legacy = structuredClone(baseline);
  delete legacy.sponsors.enabled;
  assert.deepEqual(validateConfig(legacy), { ...baseline, sponsors: { ...baseline.sponsors, enabled: true } });
  assert.deepEqual(validateConfig({ ...baseline, sponsors: { ...baseline.sponsors, enabled: false } }), { ...baseline, sponsors: { ...baseline.sponsors, enabled: false } });
  assert.throws(() => validateConfig({ ...baseline, sponsors: { ...baseline.sponsors, enabled: "false" } }), /show sponsor placements/i);
});

test("legacy configs gain gum defaults and both material styles save without changing owner values", async t => {
  const { call, path } = fixture(t);
  const legacy = structuredClone(baseline);
  delete legacy.scene.materialStyle;
  delete legacy.scene.gooStretch;
  delete legacy.scene.gooGloss;
  legacy.scene.connectionMs = 780;
  legacy.scene.nodeColor = "#e8d7ab";
  legacy.demo.stepDelayMs = 950;
  legacy.sound.connectionMelody = "furElise";
  legacy.sound.melodyVolume = .42;
  legacy.sponsors.showOnHome = false;
  const original = `${JSON.stringify(legacy)}\n`;
  writeFileSync(path, original);
  let current = await (await call()).json();
  assert.deepEqual(current.config, {
    ...legacy, scene: { ...legacy.scene, materialStyle: "gum", gooStretch: .65, gooGloss: .7 },
  });
  assert.equal(readFileSync(path, "utf8"), original, "reading a legacy file never writes the migration");
  for (const materials of [
    { materialStyle: "classic", gooStretch: 0, gooGloss: 0 },
    { materialStyle: "gum", gooStretch: 1, gooGloss: 1 },
    { materialStyle: "classic", gooStretch: .35, gooGloss: .85 },
  ]) {
    const next = { ...current.config, scene: { ...current.config.scene, ...materials } };
    const response = await call("PUT", { config: next, revision: current.revision });
    assert.equal(response.status, 200);
    current = await response.json();
    assert.deepEqual(current.config, next);
    assert.deepEqual((await (await call()).json()).config, next);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next);
    const { materialStyle: _style, gooStretch: _stretch, gooGloss: _gloss, ...scene } = next.scene;
    assert.deepEqual({ ...next, scene }, legacy, "material changes preserve every unrelated owner value");
  }
});

test("partial gum migrations fill only absent keys and preserve Classic and zero settings", async t => {
  const { call, path } = fixture(t);
  const complete = { ...baseline, scene: { ...baseline.scene, materialStyle: "classic", gooStretch: 0, gooGloss: 0 } };
  assert.deepEqual(validateConfig(complete), complete, "existing values are never replaced by trial defaults");
  for (const [key, fallback] of Object.entries({ materialStyle: "gum", gooStretch: .65, gooGloss: .7 })) {
    const partial = structuredClone(complete);
    delete partial.scene[key];
    const original = JSON.stringify(partial);
    writeFileSync(path, original);
    const current = await (await call()).json();
    const expected = { ...complete, scene: { ...complete.scene, [key]: fallback } };
    assert.deepEqual(current.config, expected, `only absent ${key} receives a default`);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal((await call("PUT", { config: partial, revision: current.revision })).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), expected, "saving canonicalizes only the missing field");
  }
});

test("gum validation rejects invalid supplied values without replacing defaults or touching disk", async t => {
  const { call, path } = fixture(t);
  const current = await (await call()).json();
  const original = readFileSync(path, "utf8");
  for (const invalid of [
    { materialStyle: "unknown" }, { materialStyle: "Gum" }, { materialStyle: "" }, { materialStyle: null }, { materialStyle: false },
    ...["gooStretch", "gooGloss"].flatMap(key => [-.01, 1.01, "0.65", null, false, {}, NaN, Infinity].map(value => ({ [key]: value }))),
    { unknownGumSetting: true },
  ]) {
    const config = { ...current.config, scene: { ...current.config.scene, ...invalid } };
    assert.throws(() => validateConfig(config), "an explicitly supplied invalid field must never be defaulted");
    assert.equal((await call("PUT", { config, revision: current.revision })).status, 400);
    assert.equal(readFileSync(path, "utf8"), original);
  }
  for (const key of ["materialStyle", "gooStretch", "gooGloss"]) {
    assert.throws(() => validateConfig({ ...current.config, scene: { ...current.config.scene, [key]: undefined } }), "a present undefined field is invalid rather than absent");
  }
});

test("config and token symlinks are refused without modifying their targets", async t => {
  const { call, path, root } = fixture(t);
  const target = resolve(root, "target.json");
  const before = readFileSync(path, "utf8");
  writeFileSync(target, before);
  rmSync(path);
  symlinkSync(target, path);
  assert.equal((await call()).status, 500);
  assert.equal((await call("PUT", { config: baseline, revision: createHash("sha256").update(before).digest("hex") })).status, 500);
  assert.equal(readFileSync(target, "utf8"), before);
  const tokenPath = resolve(root, ".nodoku-data/admin-token");
  rmSync(tokenPath);
  symlinkSync(target, tokenPath);
  assert.throws(() => readAdminToken(root));
  assert.equal(readFileSync(target, "utf8"), before);
});

test("fixed endpoint and allowed methods prevent alternate filesystem paths", async t => {
  const { call, root } = fixture(t);
  assert.equal((await call("GET", undefined, {}, `${origin}/api/admin/other`)).status, 404);
  assert.equal((await call("DELETE")).status, 405);
  assert.ok(!existsSync(resolve(root, "other")));
});


test("tutorial settings migrate missing fields and validate explicit tuning", () => {
  const legacy = structuredClone(baseline);
  delete legacy.tutorial;
  assert.deepEqual(validateConfig(legacy).tutorial, TUTORIAL_DEFAULTS);
  legacy.tutorial = { enabled: false, ringOpacity: .25, gestureCycleMs: 6000 };
  assert.deepEqual(validateConfig(legacy).tutorial, { ...TUTORIAL_DEFAULTS, doubleTapOpacity: .25, ...legacy.tutorial });
  for (const [key, value] of Object.entries({ enabled: "false", color: "purple", ringWidth: 0, ringScale: 2,
    ringOpacity: 1.1, gestureCycleMs: 0, unknown: true })) {
    assert.throws(() => validateConfig({ ...baseline, tutorial: { ...baseline.tutorial, [key]: value } }));
  }
});

test("tutorial visual tuning survives saving and reloading", async t => {
  const { call } = fixture(t);
  const snapshot = await (await call()).json();
  snapshot.config.tutorial = { ...snapshot.config.tutorial, color: "#123456", focusCircles: false, gestureCycleMs: 4000, doubleTapColor: "#aabbcc", doubleTapPulseMs: 600, doubleTapGapMs: 400, doubleTapPauseMs: 6000, doubleTapEasing: "ease-out" };
  const saved = await call("PUT", snapshot);
  assert.equal(saved.status, 200);
  assert.deepEqual((await (await call()).json()).config.tutorial, snapshot.config.tutorial);
});


test("drag trail tuning preserves zeros and rejects invalid values", () => {
  const config = structuredClone(baseline);
  config.tutorial.dragLineWidth = 0;
  config.tutorial.dragLineOpacity = 0;
  config.tutorial.dragDotSize = 24;
  config.tutorial.dragEasing = "linear";
  assert.deepEqual(validateConfig(config), config);
  for (const [key, value] of Object.entries({ dragLineWidth: -1, dragLineOpacity: 2, dragDotSize: 25,
    dragDotOpacity: 0, dragColor: "purple", dragEasing: "fast" })) {
    assert.throws(() => validateConfig({ ...config, tutorial: { ...config.tutorial, [key]: value } }));
  }
});


test("selection styling migrates old accents and validates tuning", () => {
  const legacy = structuredClone(baseline);
  delete legacy.selection;
  legacy.scene.connectionColor = "#123456";
  assert.deepEqual(validateConfig(legacy).selection, { ...SELECTION_DEFAULTS, ringColor: "#123456", guideColor: "#123456" });
  legacy.selection = { ringEnabled: false, guidesEnabled: false, ringOpacity: .2 };
  assert.equal(validateConfig(legacy).selection.ringEnabled, false);
  assert.equal(validateConfig(legacy).selection.guidesEnabled, false);
  assert.equal(validateConfig(legacy).selection.ringOpacity, .2);
  for (const [key, value] of Object.entries({ ringEnabled: "yes", ringSize: .5, ringThickness: 0, ringOpacity: 2,
    guideColor: "red", guideThickness: 5, guideOpacity: -.1 })) {
    assert.throws(() => validateConfig({ ...baseline, selection: { ...SELECTION_DEFAULTS, [key]: value } }));
  }
});


test("double-tap tuning migrates the shared ring style and validates independent controls", () => {
  const legacy = structuredClone(baseline);
  for (const key of Object.keys(legacy.tutorial)) if (key.startsWith("doubleTap") && key !== "doubleTapCue") delete legacy.tutorial[key];
  Object.assign(legacy.tutorial, { color: "#123456", ringWidth: 5, ringScale: 1.2, ringOpacity: .4 });
  const migrated = validateConfig(legacy);
  assert.equal(migrated.tutorial.doubleTapColor, "#123456");
  assert.equal(migrated.tutorial.doubleTapWidth, 5);
  assert.equal(migrated.tutorial.doubleTapScale, 1.2);
  assert.equal(migrated.tutorial.doubleTapOpacity, .4);
  migrated.tutorial.doubleTapWidth = 2;
  assert.equal(validateConfig(migrated).tutorial.doubleTapWidth, 2);
  for (const [key, value] of Object.entries({ doubleTapColor: "red", doubleTapWidth: 0,
    doubleTapScale: 2, doubleTapOpacity: 2, doubleTapPulseMs: 0, doubleTapGapMs: 0,
    doubleTapPauseMs: 0, doubleTapEasing: "unknown" })) {
    assert.throws(() => validateConfig({ ...baseline, tutorial: { ...baseline.tutorial, [key]: value } }));
  }
});
