# Cloudflare Pages deploy

## 1) Export from Godot
- Install Web export templates (once): Editor → Manage Export Templates → Download & Install
- Project → Export → Add… → Web
- Set Export Path: `public/index.html`
- Export

## 2) Deploy on Cloudflare Pages
- Push this repo to GitHub
- Cloudflare Dashboard → Pages → Create a project
- Connect your GitHub repo
- Build settings:
  - Framework preset: None
  - Build command: (leave empty)
  - Output directory: `public`

## Headers (COOP/COEP)
This repo includes `public/_headers` with COOP/COEP for multithreaded WASM if you enable threads in the Web export preset.
