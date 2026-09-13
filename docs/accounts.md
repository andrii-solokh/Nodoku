# Google accounts and leaderboard

Guest play stays available. Accounts use Google Identity Services to verify identity and Nodoku's existing SQLite/D1 backend for profiles, sessions and ranked results. New profiles default to the verified ID token's `name`, then `given_name`, then the local part of an `email` with `email_verified: true`. Missing usable values fall back to a generated player name. The resulting nickname and a validated HTTPS Google avatar URL are stored; the full email, image bytes, access token, and refresh token are not stored. The avatar refreshes on sign-in and is returned only with the signed-in player profile, not in public leaderboard entries. The browser loads it without a Referer header, falling back to the person icon if unavailable. Players can edit this name and optionally add one public website link. Bare domains are normalized to HTTPS; HTTP/HTTPS links are accepted, credential-bearing URLs and other schemes are rejected, and clearing the field removes the link. Linked player names open the website in a new tab from the leaderboard, without giving the destination access to the opener. Google sign-in preserves the saved link. Apply the additive `player_links` table before deploying this feature. All signed-in players participate in public ranking once they have a recorded solve. Signing in again preserves saved nicknames. Older accounts still using their exact generated `Player <id prefix>` name pick up a verified Google name on their next sign-in. Explicit profile saves are recorded separately so even a deliberately retained generated name is preserved. Apply the additive `player_custom_nicknames` table with the account schema before deploying this behavior. Account identity continues to use Google's stable `sub`, never a name or email.

## Account popups

Profile and leaderboard open as separate, nonmodal popups under their own header buttons on desktop and mobile. Escape, outside clicks and keyboard focus leaving the popup dismiss it; opening one closes the other. The page remains interactive and popup keystrokes do not activate game shortcuts. The profile loads the official Google Identity Services button on demand. Its popup callback signs in and updates the profile/avatar without navigating or resetting the puzzle. Closing Google leaves the game in place; loading or verification failures can be retried from the profile. Login challenges refresh after nine minutes while the menu stays open.

## Google Cloud setup

Create an OAuth **Web application** client in Google Auth Platform. Configure branding, support contact, the homepage and your published privacy policy; the standard sign-in scopes are sufficient.

Authorized JavaScript origins (one per entry):

- `https://nodoku.solokh.com`
- `http://localhost`
- `http://localhost:5173`
- `http://localhost:4173`

Leave authorized redirect URIs empty. The profile uses the GIS popup JavaScript callback to POST the credential to `/api/auth/google`; it is not an OAuth redirect endpoint. Use **localhost**, not 127.0.0.1, when testing Google locally. The Google client ID ends in `.apps.googleusercontent.com` and is public. This flow does not require a client secret.

Google references: [setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

The Vite app uses `same-origin-allow-popups` COOP in development, preview and `static/_headers` to support the Google window. The legacy Godot headers in `public/` are not part of this build. The standalone `/signin.html` remains a fallback for existing direct links; the profile does not navigate there. Configure the same headers in any proxy that overrides Pages headers. Verify the Google button on Safari and Chrome with the actual configured client before release.

## Local setup

In the gitignored `.dev.vars` file:

```dotenv
ACCOUNTS_ENABLED="true"
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
```

Leave `APP_ORIGIN` empty locally so the API uses the current localhost address. Restart Vite after changing server settings. The local SQLite adapter automatically applies the additive schema on startup. Run `npm run build` and `npm run preview -- --port 4173`, then open `http://localhost:4173`.

## Production rollout

1. Configure the [migration/deployment workflow](migrations.md). It records a D1
   recovery point and runs `npm run db:migrate:production` before deployment,
   including the initial account tables and player links.
2. Set `GOOGLE_CLIENT_ID` in the production Pages runtime variables. Keep `APP_ORIGIN=https://nodoku.solokh.com`.
3. Deploy the tested build and Pages Functions. Leave `ACCOUNTS_ENABLED=false` until configuration and sign-in testing are complete.
4. Set `ACCOUNTS_ENABLED=true` to expose account/leaderboard navigation and enable the APIs. This server-controlled rollout flag works independently of PostHog availability. Disabling it hides the feature and preserves stored accounts/results.

Do not use the production D1 database for automated tests. The migrations do not modify historical visitor/completion statistics. Account tables are additive, and old anonymous history cannot be claimed by presenting a browser visitor ID.

## Scoring rules

- Rank by number of distinct completed puzzles. Each `(player, size, depth, difficulty, seed)` counts once across retries, devices and new attempts.
- Best time is the fastest server-measured duration from issuing a ranked puzzle ticket to receiving its first valid solved-board submission. It includes breaks, reloads, hints and offline delivery delays. It is informational across puzzle sizes; rank still depends only on solve count. New replay attempts can improve a time without increasing the distinct-puzzle count, and duplicate delivery never changes a recorded time. Historical completions without timings show “—”; they are not backfilled. Apply the additive `ranked_solve_times` table before deploying this feature.
- Equal totals share competition ranks (1, 1, 3). The leaderboard shows the top 100 and the current player's rank/count even when outside that list.
- The leaderboard defaults to all-time 3D puzzles solved. A size-by-complexity matrix uses the configurator’s difficulty symbols without visible complexity names; 3D and Flat select perspective. Selecting a cell filters ranks, solve counts and best times to that category. Complexity names remain available through accessible labels and tooltips. Rows show rank, player nickname, solve count and best time. There is no time-period selector; the API defaults to all time.
- Only puzzles started while signed in receive ranked tickets. A resumed puzzle can retain its existing ticket; a previously unranked partial puzzle stays unranked. Tutorial and demo never request tickets.
- Tickets are random, server-issued capabilities bound to one player and exact puzzle settings. Only their SHA-256 hashes are stored on the server. They expire after seven days. Pending solves persist the ticket so delivery stays attributed to the original player even after a different account signs in.
- The server restores and validates the complete graph. Browser-supplied totals or account IDs cannot award ranking credit. Invalid/missing tickets still allow ordinary guest statistics.
- Starting while offline, expired tickets, or ranking service outages can leave a puzzle unranked; guest play and anonymous statistics remain available. Delivery time determines the ranking period.
- Hints and normal game tools are allowed. This is an achievement leaderboard, not a timed competition or proof of human play; scripted valid solutions remain possible. Attempt issuance is capped at 20/minute and 200/day per account; sign-in requests are capped at 20/minute per hashed network address.

## Sessions and privacy

The backend verifies RS256 signature, issuer, audience, expiry, issued-at age, nonce and authorized-party claim using `jose` and Google's cached public keys. The Google subject maps to an internal random account ID. Nodoku sessions are random 256-bit credentials stored only in Secure/HttpOnly/SameSite=Lax cookies in production; hashes expire after 30 days. State-changing endpoints require a matching Origin and reject cross-site fetches.

Signing out revokes the current session. Account deletion revokes every session and removes the profile, saved avatar URL, ranked attempts and ranked results. Historical aggregate visitor statistics remain anonymous and separate. Public API responses include the optional player-supplied website link but never Google identity, session cookies or email. Publish the corresponding account/privacy information on the site before enabling production sign-in.

## Checks

- `npm test`: includes real-signature JWT validation, session lifecycle, CSRF, public ranking/data minimization, duplicate counting, filters, expiry, request limits and deletion.
- `npm run test:accounts`: WebKit UI fixtures at desktop/mobile widths, all-time ranking, account forms, cancellation and disabled rollout.
- `npm run build`: browser + server TypeScript checks and production build.

Automated UI fixtures do not sign into a real Google account. Complete one real Google sign-in, refresh, new-puzzle solve, cross-device profile check, logout and deletion with the configured Google client before public rollout.

## Large leaderboard preview

With Vite running, open `/tests/fixtures/leaderboard-preview.html?rank=10001`. This isolated page renders the real account UI with 100 sample players and a position selector (1, 100, or 10,001). Requests stay in memory and do not write real profiles or scores. The top-100 list scrolls beneath fixed column headings while the personal rank summary stays outside the list. Run `node tests/leaderboard-preview.mjs` with Vite on port 5173 to verify desktop/mobile overflow and the far-down ranking case.
