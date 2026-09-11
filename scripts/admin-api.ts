import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateConfig, type GameConfig } from "../src/config-schema";

export interface AdminContext { root: string; remoteAddress: string | undefined }
const MAX_BODY = 16 * 1024;
const writes = new Map<string, Promise<unknown>>();

function regularFile(path: string): number {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  if (!fstatSync(fd).isFile()) {
    closeSync(fd);
    throw new Error("Expected a regular file.");
  }
  return fd;
}

/** A local filesystem credential, never included in API responses or client builds. */
export function readAdminToken(root: string): string {
  const directory = resolve(root, ".nodoku-data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink()) throw new Error("Invalid admin directory.");
  const path = resolve(directory, "admin-token");
  try {
    const fd = openSync(path, "wx", 0o600);
    try { writeFileSync(fd, Buffer.from(randomBytes(32)).toString("hex")); } finally { closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const fd = regularFile(path);
  try {
    fchmodSync(fd, 0o600);
    const token = readFileSync(fd, "utf8").trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid admin token file.");
    return token;
  } finally { closeSync(fd); }
}

function response(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function readConfig(path: string): { config: GameConfig; revision: string } {
  // Refuse both a redirected config directory and a symlink at the final file.
  if (lstatSync(dirname(path)).isSymbolicLink()) throw new Error("Invalid config directory.");
  const fd = regularFile(path);
  try {
    const bytes = readFileSync(fd);
    return {
      config: validateConfig(JSON.parse(Buffer.from(bytes).toString("utf8"))),
      revision: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally { closeSync(fd); }
}

async function bodyText(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_BODY) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

function saveConfig(path: string, config: GameConfig, revision: string): Response {
  const current = readConfig(path);
  if (current.revision !== revision) return response(409, { error: "Configuration changed. Reload before saving." });
  const bytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  const temporary = `${path}.${Buffer.from(randomBytes(12)).toString("hex")}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return response(200, { config, revision: createHash("sha256").update(bytes).digest("hex") });
}

/** Mounted only by the local Vite adapter; production Pages has no admin write API. */
export async function handleAdminApi(request: Request, context: AdminContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/config") return response(404, { error: "Not found." });
  const localSocket = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(context.remoteAddress ?? "");
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const hostHeader = request.headers.get("host");
  if (!localSocket || !localHost || (hostHeader !== null && hostHeader.toLowerCase() !== url.host) || !["http:", "https:"].includes(url.protocol)) return response(403, { error: "Local access only." });
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return response(403, { error: "Same-origin access required." });
  if (request.method === "PUT" && request.headers.get("origin") !== url.origin) return response(403, { error: "Same-origin access required." });
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = /^Bearer ([a-f0-9]{64})$/.exec(authorization)?.[1];
    if (!supplied || !timingSafeEqual(Buffer.from(supplied), Buffer.from(readAdminToken(context.root)))) return response(401, { error: "Admin authentication required." });
    const path = resolve(context.root, "config/game-config.json");
    if (request.method === "GET") return response(200, readConfig(path));
    if (request.method !== "PUT") return response(405, { error: "Method not allowed." });
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return response(415, { error: "JSON required." });
    const text = await bodyText(request);
    if (text === null) return response(413, { error: "Configuration is too large." });
    let config: GameConfig;
    let revision: string;
    try {
      const body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2 || !Object.hasOwn(body, "config") || typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision)) throw new Error("Invalid update.");
      config = validateConfig(body.config);
      revision = body.revision;
    } catch { return response(400, { error: "Invalid configuration or revision." }); }
    const pending = (writes.get(path) ?? Promise.resolve()).catch(() => {}).then(() => saveConfig(path, config, revision));
    writes.set(path, pending);
    try { return await pending; } finally { if (writes.get(path) === pending) writes.delete(path); }
  } catch { return response(500, { error: "The local configuration could not be accessed." }); }
}
