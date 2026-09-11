import { defineConfig } from "vite";
import { sponsorshipApi } from "./scripts/sponsorship-api";

export default defineConfig({
  publicDir: false,
  plugins: [sponsorshipApi()],
  server: {
    host: "127.0.0.1", port: 5173,
    fs: { deny: [".env", ".env.*", "*.{crt,pem,key,p12,pfx,cer,der}", ".npmrc", ".yarnrc.yml", "**/.git/**", "**/.nodoku-data/**", "**/.dev.vars*"] },
  },
  build: { outDir: "dist", target: "es2022" },
});
