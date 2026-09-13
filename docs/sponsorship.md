# Sponsorship setup

The current offer is a **one-time $100 USD payment for 30 days** of a public text sponsorship. It is not an automatically renewing subscription. The server owns the amount (`10000` cents), currency (`usd`), and duration; changing browser input cannot change the offer. No pre-created Stripe Product or Price ID is required.

The browser sends the sponsor's brand, short message, and public website URL to the API. Stripe Checkout collects payment information. A verified paid Checkout session activates the text ad, which rotates with other active sponsors and expires automatically. Returning from Checkout alone does not establish payment. Duplicate delivery of a paid event must preserve the original campaign dates. Stripe's [Checkout fulfillment guide](https://docs.stripe.com/checkout/fulfillment) explains signed webhook delivery, delayed payment methods, and repeat delivery.

## Online and visitors

The top center of the home page and the game header keep Online visible and rotate between puzzles solved, dots cleared and visitors. Clicking the figures opens the Statistics page with date filters, activity charts and private placement reports. See [statistics and counting rules](statistics.md).

Audience counts work as follows:

- **Online:** distinct browser IDs seen in the last 90 seconds. A visible tab sends `POST /api/presence` every 30 seconds. Hidden tabs and pages that have been left stop sending heartbeats; returning to the page refreshes immediately. Multiple tabs share an ID and count once. Departures expire naturally, so closing one tab cannot disconnect another.
- **Visitors:** cumulative unique browser IDs in the persistent `visitors` table. The browser registers with `POST /api/visitors` once per page load and again at UTC day rollover, then refreshes community totals once per minute while visible. Refreshing does not add another visitor. Separate daily records support unique visitors within the selected date range.

Both approximate browsers using a random UUID saved in local storage. They do not identify people, use IP fingerprinting, or guarantee sponsor impressions. Clearing storage, another browser/device, automated requests, and shared browsers affect the counts. Local development counts belong to that development database and show **Preview**; production counts use shared D1. Unavailable counts show a dash and retry automatically.

Presence uses the separate indexed `visitor_presence` table, server timestamps, and an atomic upsert/expiry/count operation. The 90-second cutoff determines the count; stale rows are removed on the next heartbeat. Total visitors remain in their own table and do not expire. The older Godot app on `origin/main` has neither counter; these APIs belong to the Astra implementation.

Local Vite servers create the table on startup. For an existing D1 deployment, apply the updated `server/schema.sql` before publishing the new app. Its additive `CREATE TABLE/INDEX IF NOT EXISTS` statements preserve existing visitor totals and sponsor orders. The checked-in D1 database ID still needs to be configured for production. The online endpoint adds regular Function requests and indexed writes; account for active browsers when sizing the Cloudflare plan. [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) describe the current allowances.

## Run locally

For ordinary development, `npm run dev` serves the game and the local server adapter. `npm run preview` also runs this adapter against the built game. Both use persistent SQLite storage at `.nodoku-data/local.sqlite`. For a deployment-equivalent check, use Pages Functions with local D1:

```sh
npm ci
npm run build
npm run db:migrate:local
```

Create a local `.dev.vars` file in the project root. Set `APP_ORIGIN` to the origin you actually open; for the Pages command below it is `http://localhost:8788`. Add your Stripe sandbox secret key as `STRIPE_SECRET_KEY`. Use `.env.local` instead when desired for the Vite development adapter. Keep credentials out of Git and out of `VITE_*` variables, which are exposed in frontend bundles.

In another terminal, authenticate the Stripe CLI to the same sandbox and start forwarding:

```sh
stripe login
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded --forward-to http://localhost:8788/api/stripe-webhook
```

Copy the listener's signing secret into `.dev.vars` as `STRIPE_WEBHOOK_SECRET`, then start or restart Pages:

```sh
npx wrangler pages dev dist --port 8788
```

Keep the listener running and open [the local app](http://localhost:8788). To test the Vite server instead, use its actual origin consistently in `APP_ORIGIN` and the forwarding URL. Cloudflare supports local [Pages Functions](https://developers.cloudflare.com/pages/functions/local-development/) and [D1 storage](https://developers.cloudflare.com/d1/best-practices/local-development/) through Wrangler; local D1 does not write to the remote database.

## Verify the payment flow in a sandbox

1. Submit a text sponsorship in the app. Confirm Checkout displays **$100.00 USD**, a single payment, and the 30-day offer.
2. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, and any three-digit CVC. Never use a real card for this check. See [Stripe's test instructions](https://docs.stripe.com/testing).
3. Confirm the CLI forwards the event successfully and the returned app eventually displays the active sponsor. Closing the success page must not prevent webhook activation.
4. Resend that same Checkout event from Stripe's event destination and confirm there is still one campaign with unchanged dates. A generic `stripe trigger` fixture does not represent an order created by this app.
5. A canceled or unpaid Checkout session must leave the sponsor inactive. For delayed methods, fulfillment waits for `checkout.session.async_payment_succeeded` and a paid session.
6. Check that the stored expiry is 30 days after activation and that expired entries are omitted from the active sponsor feed. Do not alter a production campaign to test expiry; use a local/test record.

The required webhook events are `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Checkout currently offers cards; the handler also recognizes delayed-payment success events. The endpoint is **`/api/stripe-webhook`**. Preserve its raw request body: parsing and re-encoding JSON before signature verification changes the signed bytes. The Pages adapter performs no body parsing. The shared API uses the Stripe SDK's Fetch transport and asynchronous Web Crypto signature verification for Workers compatibility; see the [Stripe SDK](https://github.com/stripe/stripe-node) and its [webhook signing guidance](https://github.com/stripe/stripe-node#webhook-signing).

## Provision production when ready

These commands create resources or publish changes; they are setup instructions and have not been executed by adding this integration.

```sh
npx wrangler login
npx wrangler d1 create nodoku
```

Copy the returned database ID into `wrangler.jsonc`, retaining the binding name `DB`. Set `name` to the existing Pages project name, or create a project if there is none:

```sh
npx wrangler pages project create nodoku --production-branch main
```

Replace the empty top-level `vars` object in `wrangler.jsonc` with `APP_ORIGIN` set to the site's actual HTTPS origin, without a path or trailing slash. Use the origin visitors will browse, whether a custom domain or the project's Pages hostname. No public origin is guessed by this configuration.

Apply the schema explicitly to the remote database:

```sh
npm run db:migrate:production
```

The project uses [numbered D1 migrations and CI/CD](migrations.md). Use `npm run db:migrate:production` for production upgrades; `server/schema.sql` is the current schema reference. Do not assume re-running the reference file upgrades existing columns. Cloudflare documents [D1 creation and SQL execution](https://developers.cloudflare.com/workers/wrangler/commands/d1/).

In Stripe's live environment, register an HTTPS webhook destination at your actual origin followed by `/api/stripe-webhook`, selecting the two events above. Store the live secret key and that destination's signing secret using prompted input:

```sh
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name nodoku
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name nodoku
```

Use the real Pages project name if different. The deployed endpoint's signing secret differs from the Stripe CLI listener's secret. Secrets belong to the server runtime; there is no browser publishable key requirement for this hosted Checkout redirect. [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/) document project creation, secrets, and deployment.

After reviewing the configuration and verifying the sandbox flow, publish through the existing Pages Git integration or explicitly deploy the built application:

```sh
npm run build
npx wrangler pages deploy dist --project-name nodoku --branch main
```

Deploy from the repository root so Wrangler includes `functions/`. The production binding must point to the initialized database, `APP_ORIGIN` must match the public site, and both Stripe secrets must use the same live environment. Without the required database or payment configuration, checkout remains unavailable while the game continues to work.

The checked-in preview configuration has no database or origin. To enable previews, add an `env.preview` D1 binding for a separate test database, initialize it, set that preview's actual origin, and configure Stripe sandbox secrets for the Pages preview environment. Never reuse live payment credentials for previews. Review the [Pages environment configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#environment-specific-overrides) when changing these overrides.


## Paid ad removal

The six placements are visible by default. Players no longer have a free hide setting. **Remove ads** opens a separate one-time Stripe purchase for permanent ad removal. Its price is intentionally unset until the owner chooses it: set `REMOVE_ADS_AMOUNT` to the chosen integer amount in USD cents in `.dev.vars` locally or Cloudflare environment variables in production. Restart the local server after changing it. Do not prefix it with `VITE_`. Existing verified purchases still restore if new purchases are disabled.

Ad removal shares the configured Stripe account, webhook endpoint, and order database. Ad-free orders are excluded from the public sponsor feed. The browser receives a restore code only after the server confirms a paid session with the correct amount, currency, line item and order identity. It stores that code and verifies it on each load. A success URL, the old hide preference, or an unverified local value cannot grant ad removal.

After buying, save the restore code with **Copy restore code** in the purchase confirmation. On another browser, start a puzzle and use **Remove ads** above the in-game sponsors, then **Restore a purchase**. Treat this code as a private purchase credential; anyone holding it can restore the purchase. There is no account login or email-based recovery in this implementation. If verification is temporarily unavailable, sponsorships remain visible and the saved purchase offers a retry before another checkout can be started.

Sandbox verification should include a completed ad-removal purchase, page reload, restoration in another browser, an unpaid return, an invalid code, and an unavailable verification service. `npm test` exercises these backend states with mocked Stripe calls and actual signed webhook payloads; `npm run test:ad-free` covers the browser flow without making real payments. No live or sandbox payment has been performed by adding this code.
