# Cloudflare Pages

The production domain is **https://nodoku.solokh.com**. The Cloudflare Pages project is `nodoku`, with the default hostname `nodoku.pages.dev`. The [GitHub Actions workflow](migrations.md) validates changes, applies tracked D1 migrations, and publishes direct uploads on `main`. The older Git-connected `dotcon` project is separate. The application uses Vite for the game and Cloudflare Pages Functions with D1 for sponsorship and visitor counts. Build settings are:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 24 (pinned by `.node-version`; set `NODE_VERSION=24` if configuring it in the dashboard)

Run `npm ci` and `npm run build` locally to verify. The production bundle contains the application and locally hosted fonts; it does not use the old Godot WASM export or require cross-origin isolation headers.

`wrangler.jsonc` defines `dist`, the Workers compatibility settings, the production `nodoku` database as `DB`, and `APP_ORIGIN=https://nodoku.solokh.com`. The production database was created and the complete `server/schema.sql` applied on 2026-09-11. Counters and statistics work without Stripe credentials. Leave payment secrets and `REMOVE_ADS_AMOUNT` unset until pricing and payment setup are complete. To enable PostHog, configure `POSTHOG_PROJECT_API_KEY` as a Pages secret; the app retrieves the public project key through its same-origin analytics configuration endpoint.

To deploy a later build to this project's production branch:

```sh
npm run build
npm run db:migrate:production
npx wrangler pages deploy dist --project-name nodoku --branch main
```

Wrangler includes the Pages Functions beside `dist`. Publishing does not commit or push source code. The GitHub workflow supplies automatic deployment for this direct-upload project; configure its Cloudflare API token as described in [CI/CD setup](migrations.md).

## Custom domain

1. Create or select the intended Pages project and deploy the built game together with its Functions.
2. In that project's **Custom domains**, add `nodoku.solokh.com`.
3. At the authoritative DNS provider for `solokh.com`, add a **CNAME** named `nodoku` pointing to **`nodoku.pages.dev`**. Associate the domain with Pages before adding the DNS record. A subdomain does not require moving the parent domain's nameservers to Cloudflare.
4. Wait for Cloudflare to report the domain active, then verify HTTPS, game loading, and the visitor/statistics APIs on `https://nodoku.solokh.com`.

The production API accepts write requests from `APP_ORIGIN`; use the custom domain for end-to-end checks. The default Pages hostname can serve the game but is not an alternative write origin. When Stripe is configured, use `https://nodoku.solokh.com/api/stripe-webhook` for its live webhook endpoint.

See Cloudflare's [custom domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/).

The catch-all `functions/api/[[path]].ts` handles `/api/*`; static game files remain in `dist`. It passes the original request directly to the shared server API, preserving Stripe webhook signatures. Cloudflare documents [file-based Function routing](https://developers.cloudflare.com/pages/functions/routing/) and [D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/).

Use `npx wrangler pages dev dist --port 8788` to test the built game together with Pages Functions and local D1. This project's `npm run dev` and `npm run preview` both install the shared Node API adapter, with persistent SQLite storage at `.nodoku-data/local.sqlite`; those APIs work locally but do not exercise the Pages runtime. Local database and webhook setup commands are in [sponsorship setup](sponsorship.md).

Preview deployments have no D1 binding by default. To enable a payment preview, configure a separate preview database, its schema, a preview origin, and Stripe test credentials. Keep production and preview settings separate. The Wrangler file becomes the source of truth when deployed; reconcile its project name and settings with any existing Pages project before publishing. See [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

The separate legacy `dotcon` integration targets `public/` and is not used by this workflow. No deployment is performed by `npm run build` or `npm run release:web` alone.

The old export remains in `public/` for reference. `npm run release:godot` invokes the previous Godot export/release script; see that script before using it.
