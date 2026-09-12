# Nodoku

A quiet dot-connection puzzle, rebuilt from scratch with Astra using TypeScript, Three.js and Vite. Ceramic nodes, soft studio lighting and physical connections make the board a small object you can turn in your hands.

## Run

Requires Node.js 24 for the local SQLite API.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. To create and preview a production build:

```sh
npm run build
npm run preview
```

## Tutorial links

Open `/?onboarding=1&step=3` to jump directly to a lesson. Steps are numbered 1–8:

| Step | Lesson |
| --- | --- |
| 1 | Select two nodes |
| 2 | Drag between the bottom nodes |
| 3 | Remove a connection |
| 4 | Double-tap a node |
| 5 | Clear every dot |
| 6 | Rotate the cube |
| 7 | Make a 3D connection |
| 8 | Finish the cube |

For a specific rotation lesson, add `&direction=left`, `right`, `up`, or `down`, for example `/?onboarding=1&step=6&direction=up`. Add `&admin=1` to keep Studio available locally.

Each direct link starts a fresh lesson with its prerequisite connections prepared. The URL follows lesson progress without adding browser history entries; reload restarts that lesson. Exiting the tutorial removes its URL parameters. Invalid steps start at step 1.

## Play

Choose a flat board (sizes 4 or 5) or a 3D cube (sizes 3, 4 or 5), and a complexity level. Each dot on a node represents one remaining connection. Select two orthogonal neighbors to add or remove a link. Use every dot and join the board into one network to finish. Any valid solution is accepted.

A green node has used all its dots, but it can still belong to a separate group. If every dot is cleared and groups remain, the game shows their count and highlights the smallest group in amber. **Show group** brings it into view and cycles through the groups. Faint neighbor guides disappear while highlighting, leaving only actual connections visible. Remove and replace links between groups to finish one network.

The home demo solves the selected board one connection at a time. Each new link and its note start as the camera turns it into view. By default, connections follow the selected melody’s scored note lengths, including longer notes and rests. Studio → Home auto-solve offers Melody rhythm with a tempo in BPM, or Fixed delay to wait for each animation and then pause. In melody mode, turns fit within the next beat and connection animations can overlap. The completed puzzle continues the tune in rhythm before replaying. Use the pause button below the preview to stop or resume it; dragging temporarily pauses playback. Demo moves are separate from your saved puzzle.

The Gum material trial adds soft reflections, glossy nodes and tapered connections that stretch into place. Nodes give a small elastic wobble when links change. In local Studio → **Gum materials**, switch between **Gum** and **Classic** and adjust stretch/gloss. **Connection draw duration** sets the timing. Reduced motion disables the wobble; saved puzzle rules and connections stay the same. Save to project writes the settings to `config/game-config.json`.

Node selection and game state respond immediately to each tap or click. New connections grow into place, with configurable duration and easing.

- A perspective camera gives the board real depth. Drag to turn and release to snap to the nearest cube face, including top and bottom. View buttons and arrow keys/WASD make 90° turns. Scroll or pinch to zoom.
- Cube rotation keeps the camera at a steady distance. The initial view fits every orientation, and zoom remains under your control.
- Drag through adjacent nodes to add missing links or remove existing ones without rotating. Each link changes once per stroke. Double-tap a node to fill its available links; double-tap a full node to clear them. Each gesture is one undo/redo action.
- A live strand follows your pointer, stops at a maximum reach and gets thinner as it stretches. A nearby eligible neighbor grows a small matching nub toward it. Studio → **Drag feel** controls reach, thickness, thinning, tip size, pointer lag, magnet range/pull/response, and spring return duration/bounce. Full nodes cannot produce a new strand; dragging across their existing links still removes them. Reaching a neighbor commits the link; releasing in empty space returns the unfinished strand without changing earlier links. Reduced motion or zero return duration clears it immediately.
- On a cube, clicking and dragging target only the face toward you. Rotate to reach other faces; rear nodes visible through gaps cannot receive input. A stroke stays on the face where it began.
- Swipe empty space to turn a face.
- Undo and redo reverse connections. Restart clears the same puzzle. Hint adds or removes one connection to help reach a solution.
- R resets the view; F toggles fullscreen; Escape cancels selection.
- Ctrl / Cmd + Z undoes; Ctrl / Cmd + Shift + Z redoes; H provides a hint.
- `[` / `]` focus nodes for keyboard play; Enter selects the focused node.
- Refresh returns directly to your active puzzle with its connections, camera view, zoom, selection and undo/redo history. Completed boards reopen their completion screen. Returning home is also remembered; **Continue your puzzle** resumes your unfinished board from there.
- Placed connections match their endpoint states: unfinished-node color at unfinished ends, completed-node color at finished ends, and a smooth blend between mixed ends. Matching states produce a solid link. Neighboring moves, undo, and redo update the colors. Studio’s node colors control the palette; Selection accent controls rings and possible connections.
- The speaker button enables connection, disconnection, and completion sounds, including the home auto-solve demo. Rotations are silent. Sound starts muted and remembers your preference. A saved sound-on preference takes effect after your first interaction with the page.
- New connections play successive notes of Ode to Joy. Solving continues only to the next musical ending; if your last move already reaches one, no extra notes play. Studio → Sound also offers Für Elise and the original connection effect, plus note duration, melody volume, a Play completion ending toggle, and completion note interval. Classic keeps its original completion chime when enabled. Your moves set the rhythm; phrases repeat. The melody position is saved with your puzzle, and the home demo has its own sequence. See [music sources](docs/music.md).
- Double-tapping a node fills its links immediately, while its notes follow the melody's rhythm at Studio → Home auto-solve → Melody tempo. A later connection or removal replaces the remaining fill audio. A completing fill finishes its scored notes before the completion ending begins.
- Ambient music is hidden by default; enable **Studio → Sound → Show ambient music** to offer it to players. The music button opens Play music / Pause music controls and credits for **Moonlight** by Scott Buckley. Hiding it also stops playback. Music defaults off, remembers your preference, starts after a gesture, and pauses when the page is hidden, independently of sound effects. Studio → Sound adjusts ambient volume (default 0.18); Save to project persists both settings. 'Moonlight' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au. [Track](https://www.scottbuckley.com.au/library/moonlight/) · [Creator](https://www.scottbuckley.com.au/) · [License](https://creativecommons.org/licenses/by/4.0/).
- No account, timer, or external service is required.
- The header's keyboard icon opens a separate controls guide. How to play explains only the puzzle rules.
- After solving a puzzle, share your result and invite friends through WhatsApp, Telegram, X, your device's share menu, or a copied message.

## Visitors and sponsorship

The home screen shows a visitor counter and six sponsorship placements. Wide game screens show three equal-height cards down each side, filling the available space between the header and bottom controls. Column widths adapt to the space around the puzzle; empty and filled placements share the same dimensions. Narrow game screens keep their play area clear. Distinct sponsors fill the available slots, with placeholders for empty ones.

Players can choose **Remove ads** above the in-game sponsors to purchase permanent ad removal through Stripe. Only a server-verified purchase hides sponsorships; the previous free setting is ignored. The purchase is remembered with a restore code, which can also activate another browser through **Remove ads → Restore a purchase**. Save the restore code from the purchase confirmation. New purchases remain disabled until the owner sets `REMOVE_ADS_AMOUNT` in USD cents. Pricing has not been chosen yet.

The current offer is **$100 USD for 30 days, paid once**, with no automatic renewal. Advertisers enter their brand, introduction, and HTTPS website, preview the ad, and continue to hosted Stripe Checkout. The server verifies payment before publishing the ad and removes it from the feed when its term ends. Active sponsors rotate through the six placements.

**Online** stays visible at the top center of the home page and in the game header, alongside a statistic that changes every ten seconds: puzzles solved, dots cleared, and visitors. Click it to open the Statistics page, with Today / 7 days / 30 days / All time filters, daily activity, and popular puzzle sizes and difficulties. Online counts browsers seen in the last 90 seconds; community totals refresh every minute. These counts approximate browsers rather than identifying people.

Completed puzzles are checked by the server and counted once. Dots cleared counts the dots in those completed boards; each finished connection clears two dots. Refreshing, undo/re-solving, restarting the same puzzle and home demos cannot increase the achievement totals. Pending completions retry after a temporary outage. Sponsors can privately view their own placement views, clicks and click-through rate using the sponsor code from their verified payment confirmation. See [statistics and counting rules](docs/statistics.md).

Vite development and preview use a persistent `.nodoku-data/local.sqlite` database and label these counts **Preview**. Cloudflare production uses shared D1 storage. An unavailable service shows a dash. See [sponsorship setup](docs/sponsorship.md#online-and-visitors) for presence storage and deployment setup.

The form works as a preview without credentials; payment stays disabled until its server configuration is complete. See [sponsorship setup](docs/sponsorship.md) for Cloudflare D1, Stripe sandbox testing, secrets, and webhooks. Copy `.dev.vars.example` to `.dev.vars` for local Stripe testing. Never put secrets in `VITE_*` variables.

## Local configurator

With the local preview running, `npm run admin` prints a private link to **Studio settings**. Tune demo speed, connection animation, dot rearranging (Glide, Spring, Orbit or Fade), colors, node size, fog, shadows and sponsor slots live. **Save to project** writes `config/game-config.json`, ready for your review and commit. For the development server, use `npm run admin -- http://127.0.0.1:5173`. See the [configurator guide](docs/configurator.md).

## Check

```sh
npm test
npm run build
npx playwright install chromium
# With npm run dev running in another terminal:
npm run test:browser
```

Browser checks exercise actual mouse/touch input, rotation, help, sound, undo, hints, restart, save/resume, completion, large boards and mobile layouts. With the production preview running on port 4173, `npm run test:camera` also verifies perspective depth, all six face views, 90° turns, drag snapping and picking. Screenshots go to `output/web-game/astra-checks/`. `TEST_URL` can point the browser suite at a production preview.

`npm run test:gestures` checks mouse and touch double-taps, continuous drawing, grouped undo/redo, gesture cancellation, short swipes and pinch zoom against the production preview. Its screenshots go to `output/web-game/gestures/`.

`npm run test:front-face` checks front-face picking across all six cube faces, rear-node exclusion, drawing during camera transitions, and flat-board input.

`npm run test:connectivity` checks fully filled but disconnected flat and cube boards, group highlighting, repair through actual node clicks, undo/redo, refresh, completion counting and desktop/mobile guidance layouts.

`npm run test:gum-materials` checks rendered Gum and Classic materials, live controls, elastic connection feedback, reduced motion, shape transitions and mobile layout.

`npm run test:sound` checks silent turns and actual Web Audio playback when connecting, disconnecting, dragging, muting, and completing, including the home demo and gesture-based audio startup.

`npm run test:dot-animations` checks dot reflow, each style, rapid undo/redo, instant/reduced motion and the Studio controls. `npm run test:shape-transition` checks grid-size changes, 3D / Flat reshaping, interruption, reduced motion and starting a game during the transition. `npm run test:node-floating` checks gentle node movement, attached connections, accurate input, demo playback and motion preferences. `npm run test:demo-sound` checks demo sound timing, pause/mute behavior and startup with a saved sound preference.

`npm run test:share` checks completion invitations, social links, native sharing, cancellation, clipboard fallback, and desktop/mobile completion layouts without posting messages.

`npm run test:persistence` checks refresh restoration, camera/zoom, undo/redo, home and completion screens, legacy saves, and invalid saved data.

`npm run test:demo` checks the live home animation, visible connection endpoints, full solving/replay, pause/drag/dialog behavior, settings changes, saved-game isolation, and mobile layout. Screenshots go to `output/web-game/home-demo/`.

`npm test` also checks the payment backend with mocked Stripe requests and signed webhook payloads. With the preview running, `npm run test:sponsorship` exercises the visitor API, ad preview, checkout retries, payment return states, safe links, and mobile layouts. Its Stripe redirect is intercepted; the automated suites make no real payments. Screenshots go to `output/web-game/sponsorship/`.

`npm run test:admin` verifies the local GUI and actual config-file saving. `npm run test:ad-free` verifies paid-only visibility, restoration, delayed verification, and six distinct sponsors. Their browser payment requests are mocked.

## Structure

- `src/puzzle.ts`: deterministic generation, rules, undo/redo, hints and validated saves.
- `src/scene.ts`: Three.js rendering, picking and gestures. Renders only when a view or state changes.
- `config/game-config.json`: committable scene, animation, demo, and sponsor defaults.
- `src/admin.ts` and `scripts/admin-api.ts`: local Studio editor and authenticated file-saving API.
- `src/ad-free.ts`: paid ad removal and purchase restoration.
- `src/demo.ts`: independent home preview with timed camera turns and solution playback.
- `src/main.ts`: menus, settings, gameplay controls and persistence.
- `src/sound.ts`: gesture-unlocked Web Audio effects and mute handling.
- `src/share.ts`: completion invitations, social share links, native sharing and clipboard fallback.
- `src/style.css`: responsive interface.
- `src/audience.ts` and `src/statistics.ts`: online presence, rotating community totals, and the Statistics page.
- `src/completions.ts` and `src/sponsor-metrics.ts`: completion delivery and qualified sponsor interaction tracking.
- `src/sponsorship.ts` and `src/sponsorship.css`: audience widgets, sponsored placements, and advertiser form.
- `server/`: shared API, payment verification, SQL schema, and D1/local storage.
- `functions/api/[[path]].ts`: Cloudflare Pages API entry point.
- `tests/`: model and browser verification.

Fonts are bundled locally. The build does not depend on a CDN.

## Deploy

The Cloudflare Pages project `nodoku` hosts this build for `https://nodoku.solokh.com`, using `dist`, Node 24 and a production D1 database. Deploy from the repository root to include `functions/`. Stripe pricing and credentials must be configured separately before enabling payments. See [deployment notes](docs/cloudflare_pages.md) for direct-upload commands and domain setup.

Publishing only `dist/`, including through the existing static Vercel configuration, runs the game but does not supply the visitor and payment APIs.

## Original Godot version

The Godot sources (`project.godot`, `scripts/*.gd`, `scenes/`, `shaders/`) and its old export (`public/`) remain available for reference. They are not included in the new browser build. Open `scenes/Main.tscn` in Godot to run that version; `npm run release:godot` invokes its original export pipeline.

The new implementation preserves surface-only 3D topology, node degree limits, connected-network completion and alternative solutions. Generation, hints, visual design and interaction code were rewritten. It has a browser build; native iOS/Android packages have not been recreated. The local Studio panel provides the new scene and animation controls.
