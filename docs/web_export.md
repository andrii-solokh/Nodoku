# Web Export + Vercel

## 1) Install Web export templates (once)
- Godot: Editor → Manage Export Templates → Download & Install

## 2) Add Web export preset
- Project → Export → Add… → Web
- Set Export Path to `public/index.html`
- If you enable threads, COOP/COEP headers are already configured by `vercel.json`.

## 3) Export
- Click Export Project
- Output goes to `public/`:
  - index.html
  - *.wasm
  - *.pck
  - *.js

## 4) Deploy to Vercel
### Option A: GitHub
- Push repo to GitHub
- Import in Vercel
- Framework: Other
- Output Directory: `public`

### Option B: CLI
- `npm i -g vercel`
- `vercel`
- `vercel --prod`

## 5) Promote Hidden Dev VFX Defaults (Web Flow)
1. Unlock hidden Developer Mode in-game (secret tap sequence).
2. Open VFX popup and press `Save Profile`.
3. On web this saves runtime profile and downloads `nodoku-vfx-defaults.json`.
4. Place downloaded file at `config/vfx_release_candidate.json`.
5. Run web release:
   - `bash scripts/release_web.sh`
6. Release script auto-promotes candidate defaults into:
   - `config/vfx_defaults.json`

Manual promote command:
- `node scripts/promote_vfx_defaults.mjs --from config/vfx_release_candidate.json --to config/vfx_defaults.json`
