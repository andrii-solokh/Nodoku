import { defineConfig } from "vite";
import { sponsorshipApi } from "./scripts/sponsorship-api";

export default defineConfig({
  publicDir: "static",
  plugins: [sponsorshipApi()],
  server: {
    host: "127.0.0.1", port: 5173,
    fs: { deny: [".env", ".env.*", "*.{crt,pem,key,p12,pfx,cer,der}", ".npmrc", ".yarnrc.yml", "**/.git/**", "**/.nodoku-data/**", "**/.dev.vars*"] },
  },
  // Lower newer syntax as well as providing runtime API fallbacks for older iPads.
  build: { outDir: "dist", target: ["es2022", "safari15.4"] },
});
