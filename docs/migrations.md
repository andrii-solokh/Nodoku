# Database migrations and CI/CD

`.github/workflows/deploy.yml` validates pull requests and releases `main` to the
**nodoku** Pages project. The old **dotcon** Git integration is separate and is
not the production deployment for `nodoku.solokh.com`.

## One-time GitHub setup

Add the Actions secret `CLOUDFLARE_API_TOKEN` in repository settings (or in the
`production` environment). Use a Cloudflare API token scoped to the configured
account with **D1 Edit** and **Cloudflare Pages Edit** permissions. The account
ID is public and is already configured in the workflow. Never use a developer's
temporary Wrangler OAuth session as a CI credential.

The deployment job fails explicitly if the secret is missing. PR checks do not
receive this token or access production. Google and Stripe runtime secrets stay
in Pages; this workflow does not turn accounts or payments on.

## Release sequence

1. On every PR and push to `main`, install locked dependencies on Node 24, run
   unit tests, validate migrations on fresh and existing local databases, build
   the app, and compile Pages Functions. Existing migration files cannot be edited
   or removed; CI requires a new migration instead.
2. Only on `main`, after validation succeeds, build the same commit and record a
   D1 Time Travel recovery bookmark in the Actions run summary.
3. Apply outstanding numbered migrations to production D1. Wrangler tracks them
   in `d1_migrations`; a failure stops deployment. Previously completed migrations
   remain recorded, so rerunning applies only the remaining files.
4. Upload `dist` and Pages Functions to `nodoku`, then check the home page and
   database-backed visitor endpoint. Production releases run serially and are
   not cancelled mid-migration. Superseded commits are refused before migration.

You can also run the workflow manually against `main` to retry a release. A
manual run on another branch only validates it. Database changes are not
automatically reversed when deployment fails: fixes should normally use a new
forward migration. D1 recovery rewinds data too, so use the recorded bookmark
only after assessing writes made since that point and the Time Travel retention
window. Keep migrations compatible with the running app until deployment finishes.

## Adding a schema change

```sh
npx wrangler d1 migrations create nodoku describe_change
```

Edit the new SQL file in `server/migrations/` and update `server/schema.sql`, which
is the current schema reference used by tests. Do not rewrite a migration that
has been merged. Tests compare the resulting schema with the reference so a
schema-only edit cannot silently miss production.

```sh
npm test
npm run test:migrations:d1
npm run db:migrate:local
```

Vite's Node SQLite adapter applies the same migration files automatically on
startup. The D1 integration test uses temporary local databases, exercises fresh
and pre-account upgrades, verifies data preservation and repeated application,
and deletes its test databases afterward. It never executes remote SQL.

The initial migrations adopt the old statistics/sponsorship tables, add accounts,
then add player links. They use `CREATE ... IF NOT EXISTS` to support both the
existing production database and local databases that already contain accounts.
Future column changes must use explicit migrations; reapplying a schema snapshot
is not an upgrade mechanism.

For a manual release, validate first, then run `npm run db:migrate:production`
before `npx wrangler pages deploy dist --project-name nodoku --branch main`.

References: [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[Pages deployment from CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
