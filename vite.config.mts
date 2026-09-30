import { defineConfig, type Connect, type Plugin } from "vite";
import { sponsorshipApi } from "./scripts/sponsorship-api";

const themedPagesRedirect: Plugin = {
  name: "themed-pages-trailing-slash",
  configureServer(server) { redirect(server.middlewares); },
  configurePreviewServer(server) { redirect(server.middlewares); },
};

function redirect(middlewares: Connect.Server): void {
  middlewares.use((request, response, next) => {
    const path = request.url?.split("?", 1)[0];
    if (path !== "/dots" && path !== "/groks") return next();
    response.writeHead(308, { Location: `${path}/${request.url!.slice(path.length)}` });
    response.end();
  });
}

export default defineConfig({
  publicDir: "static",
  plugins: [themedPagesRedirect, sponsorshipApi()],
  server: {
    host: "127.0.0.1", port: 5173,
    headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" },
    fs: { deny: [".env", ".env.*", "*.{crt,pem,key,p12,pfx,cer,der}", ".npmrc", ".yarnrc.yml", "**/.git/**", "**/.nodoku-data/**", "**/.dev.vars*"] },
  },
  preview: { headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" } },
  // Lower newer syntax as well as providing runtime API fallbacks for older iPads.
  build: {
    outDir: "dist", target: ["es2022", "safari15.4"],
    rolldownOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        dots: new URL("./dots/index.html", import.meta.url).pathname,
        groks: new URL("./groks/index.html", import.meta.url).pathname,
      },
    },
  },
});
