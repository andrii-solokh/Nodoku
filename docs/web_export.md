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
