# Browser production build

```sh
npm ci
npm run build
npm run preview
```

Deploy the generated `dist/` directory. `vercel.json` specifies the Vite build and output directory. Cloudflare Pages settings are documented in [cloudflare_pages.md](cloudflare_pages.md).

The previous Godot web export in `public/` is retained but is not copied into the new Vite build. Native exports remain part of the original Godot project.
