import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { Connect, Plugin, ResolvedConfig } from "vite";
import { loadEnv } from "vite";
import { handleApi } from "../server/api";
import { LocalStore } from "../server/local-store";
import { handleAdminApi } from "./admin-api";

const MAX_BODY = 256 * 1024;

/** Same Fetch handler as Cloudflare, with durable local-only development data. */
export function sponsorshipApi(): Plugin {
  let config: ResolvedConfig;

  const install = (
    middlewares: Connect.Server,
    httpServer: { once(event: "close", listener: () => void): unknown } | null,
  ) => {
    const variablesPath = resolve(config.root, ".dev.vars");
    const variables = existsSync(variablesPath)
      ? parseEnv(readFileSync(variablesPath, "utf8"))
      : {};
    const env = {
      ...loadEnv(config.mode, config.root, ""),
      ...variables,
      ...process.env,
    };
    const store = new LocalStore(resolve(config.root, ".nodoku-data/local.sqlite"));
    httpServer?.once("close", () => store.close());

    middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/api/")) return next();
      void serve(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "The local API could not complete this request." }));
        } else res.end();
      });
    });

    async function serve(req: IncomingMessage, res: ServerResponse) {
      const host = req.headers.host || "127.0.0.1";
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const origin = `http://${host}`;
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.length;
        if (length > MAX_BODY) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request body is too large." }));
          return;
        }
        chunks.push(buffer);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, value);
      }
      const method = req.method || "GET";
      const request = new Request(new URL(req.url!, origin), {
        method,
        headers,
        ...(method !== "GET" && method !== "HEAD"
          ? { body: Buffer.concat(chunks) }
          : {}),
      });
      const response = new URL(request.url).pathname.startsWith("/api/admin/")
        ? await handleAdminApi(request, { root: config.root, remoteAddress: req.socket.remoteAddress })
        : await handleApi(request, { ...env, APP_ORIGIN: env.APP_ORIGIN || origin }, store);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }
  };

  return {
    name: "nodoku-sponsorship-api",
    configResolved(resolved) { config = resolved; },
    configureServer(server) { install(server.middlewares, server.httpServer); },
    configurePreviewServer(server) { install(server.middlewares, server.httpServer); },
  };
}
