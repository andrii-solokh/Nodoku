# Local studio configurator

Run `npm run dev`, then in another terminal run:

```sh
npm run admin -- http://127.0.0.1:5173
```

Open the private link printed by that command. For the production preview on port 4173, run `npm run build`, `npm run preview`, and then `npm run admin` without an address argument. The local server must be running.

The Studio panel floats beside the scene. Changes preview immediately, including while the home puzzle auto-solves. Close the panel and reopen it with **Studio** in the header.

**Gum materials** opens first at the top of Studio. Select the illustrated **Classic** or **Gum** card to preview that look immediately, then adjust stretch and gloss below. **Save to project** keeps the selected look in `config/game-config.json`; **Reset preview** returns to your saved choice.

## Controls

- **Home auto-solve:** choose **Melody rhythm** or **Fixed delay** under Connection timing. Melody tempo ranges from 40–180 BPM, measured in quarter-note beats; the default is 96 BPM. This tempo also controls the scored notes of double-tap fills during gameplay, regardless of the home timing mode. Individual moves retain their own rhythm. The section also controls initial delay, the fixed pause between connections, completed-puzzle hold, replay delay, and pauses after dragging or resuming.
- **Node dots:** choose Glide (smooth rearranging), Spring (a soft bounce), Orbit (curved movement), or Fade (a subtle transition), and set the duration. Glide at 460ms is the default. Remaining dots rearrange when links are added or removed, including undo, redo and the home demo.
- **Gum materials:** choose Gum for soft, glossy nodes and stretchy connections, or Classic for the previous appearance. Gum stretch and Gum gloss range from 0–1, with slider steps of 0.05. The trial defaults are Gum, 0.65 stretch, and 0.7 gloss. Connection draw duration in **Connections and scene** controls the stretch timing.
- **Drag feel:** tune maximum strand reach, starting thickness, thinning as it stretches, tip size, pointer follow lag, the neighboring node's magnet distance and pull, magnet response, return duration, and return bounce. These controls apply to the live strand while playing. See the parameter table below for units and defaults.
- **Connections and scene:** camera turn duration; preview transition duration for grid size and 3D / Flat changes; connection drawing duration and easing; connection thickness; node size; floating amount and cycle duration; depth haze; shadow strength; and background, node, selection-accent, and completed-node colors. Placed connections blend between the unfinished-node and completed-node colors according to the state of their two ends; matching states produce one solid color. The saved `scene.connectionColor` key remains the accent for selection rings and available connections.
- **Sound:** choose Ode to Joy, Für Elise, or Original connection sound. Melody note duration ranges from 100–1000ms; relative melody volume ranges from 0–1. **Play completion ending** continues the melody to its next phrase ending and defaults on. **Completion note interval** ranges from 80–1000ms, defaulting to 240ms during gameplay and in Fixed delay mode. The home Melody rhythm uses its tempo instead. Ambient music volume independently sets Moonlight's playback volume from 0–1, with a migration default of 0.18. Existing saved tuning is preserved.
- **Sponsors:** one to six placements and whether to display them on the home and game screens. Six is the checked-in default. These are owner settings; players can remove sponsorships only through a verified ad-free purchase.

Durations are milliseconds. Zero camera, shape, connection or dot duration makes that animation instant. Reduced-motion preferences also skip these animations. Node selection, game rules and progress still update immediately while the visuals animate. The legacy `demo.revealDelayMs` field remains in saved JSON for compatibility but is hidden from Studio and no longer adds a pause after turning.

**Melody rhythm** follows the score's note lengths at `demo.tempoBpm`: each scheduled note starts its connection and sound together, while camera turns and connection animations can overlap. The home completion continuation follows the same musical rhythm. **Fixed delay** uses `demo.stepDelayMs` as a pause after animations finish. Switching modes preserves this saved pause. The JSON keys are `demo.timingMode` (`melody` or `fixed`) and `demo.tempoBpm`. Older files gain only missing values, defaulting to Melody rhythm at 96 BPM; an explicit Fixed delay choice and every other owner value remain unchanged.

Dot settings use `scene.dotAnimation` and `scene.dotAnimationMs` in the saved JSON. Older configuration files without these two fields load with Glide at 460ms; their other settings are preserved. Saving or downloading includes the new values.

Gum settings use `scene.materialStyle` (`gum` or `classic`), `scene.gooStretch`, and `scene.gooGloss`. Only missing fields receive the new defaults; an existing Classic choice, zero stretch or gloss, and all other owner values stay unchanged. Reading an older file does not rewrite it. Save or Download JSON includes the added fields. Stretch and gloss apply to Gum materials; Classic remains available in the same control.

Changing grid size or switching between 3D and Flat on home reshapes the preview over 700ms by default. **Preview transition duration** (`scene.shapeTransitionMs`) controls this duration; zero and reduced motion switch immediately. Nodes move into place as new ones fade in and departing ones fade out; the camera and floor adjust with them. Auto-solve waits for the reshape to finish. Choosing another size or perspective during the animation redirects it from its current appearance. Starting a game or changing difficulty settles the latest selection immediately.

The cube preview starts and settles near face-on, using the same subtle tilt as auto-solve. Flat previews and the gameplay reset view remain front-facing.

While playing, a live strand follows your pointer from the current node, stops at its maximum reach, and gets thinner as it stretches. A nearby valid neighbor reaches toward the tip. Releasing an unfinished strand springs it back. **Drag feel** controls this movement independently of the timing for completed connections. Reduced motion clears an unfinished strand immediately. Gum uses rounded shoulders that meet the nodes smoothly, matching their colors at the joins. **Gum stretch** adjusts the shoulders and settling motion; Classic retains its original material style.

| Drag feel control | Saved scene key | Range | Default |
| --- | --- | --- | --- |
| Maximum reach | `dragMaxLength` | 1–3 grid steps | 1.15 |
| Starting thickness | `dragThickness` | 0.5–3 × connection thickness | 1.15 |
| Thickness at full reach | `dragMinThickness` | 0.1–1 × starting thickness | 0.3 |
| Tip size | `dragTipSize` | 0.015–0.15 grid steps, as a radius | 0.05 |
| Pointer follow lag | `dragFollowMs` | 0–400ms | 90ms |
| Magnet distance | `dragMagnetRange` | 0–1 grid steps from the neighbor's surface | 0.45 |
| Magnet pull | `dragMagnetStrength` | 0–1.5 × node radius | 0.7 |
| Magnet response | `dragMagnetResponseMs` | 0–500ms | 120ms |
| Return duration | `dragReturnMs` | 0–1500ms | 520ms |
| Return bounce | `dragElasticity` | 0–1 | 0.55 |

A grid step is the distance between neighboring node centers. Tip size also follows **Node size**. A lower **Thickness at full reach** makes the stretched strand thinner; 1 disables thinning. More **Pointer follow lag** feels viscous, while more **Return bounce** feels elastic. Set lag or response to 0 for instant movement, magnet distance or pull to 0 to disable the reaching effect, and bounce to 0 for a return without overshoot. These visual settings do not create new neighbors or change which connections are allowed.

Drag values preview live and use the existing **Save to project**, **Reset preview**, **Reload file**, and **Download JSON** controls. Older files receive defaults only for missing drag fields; explicit zeros and other saved values are preserved. Merely loading an older file does not rewrite it. Save or Download JSON includes the added fields.

Nodes float gently in both the home preview and gameplay. `scene.nodeFloatAmplitude` sets the amount (default 0.025 of the distance between neighboring nodes); zero keeps nodes still. `scene.nodeFloatPeriodMs` sets the cycle duration (default 6000ms). Reduced motion disables floating. Ambient movement does not delay the demo's next connection.

With sound enabled, each successful connection advances the selected melody by one note. Player rhythm follows the player's moves; Melody rhythm controls only the home demo. The public-domain compositions are synthesized in the browser, without recorded performances. Choose **Original connection sound** to retain the original effect. The JSON settings are `sound.connectionMelody`, `sound.noteDurationMs`, and `sound.melodyVolume`. Older files missing the entire `sound` section load with the defaults without changing other owner settings; Save or Download JSON includes the new section.

When a puzzle is solved, **Play completion ending** (`sound.completionSound`) continues to the next musical phrase ending. If the last move already finishes a phrase, no extra notes play. Turn it off to disable completion audio. **Completion note interval** (`sound.completionNoteIntervalMs`) controls the spacing during gameplay and in Fixed delay mode. Player completion spacing is unchanged by the home tempo; the home Melody rhythm continuation follows the score and tempo instead. With **Original connection sound**, enabling the ending retains the existing completion chord.

A double-tap fill's own notes follow the score at Melody tempo. If that fill solves the puzzle, the ending starts only after its final note's full scored interval; subsequent ending notes use the usual completion spacing. Another successful edit replaces pending fill notes, and changing Melody tempo stops an old sequence before the new tempo applies.

Older files with a valid `sound.completionNotes` count migrate to the new toggle: 0 means off, and 1–32 mean on. If both fields exist, an explicit boolean `completionSound` takes precedence, but the retired count must still be valid. Missing both defaults to on; a missing interval defaults to 240ms. Every other saved value remains unchanged. Reading does not rewrite the file; Save or Download JSON replaces the retired count with the toggle. Unknown configuration fields remain invalid.

**Show ambient music** (`sound.showAmbientMusic`) controls whether the header's music button is available. It defaults off, including in older configuration files. Turning it off hides the button, closes its dialog and stops ambient playback; turning it back on restores the player's music preference. **Save to project** stores this choice in `config/game-config.json` for your next build/deployment.

When shown, the music button opens **Ambient music**, where Play music / Pause music controls the licensed **Moonlight** recording by Scott Buckley. Music defaults off, remembers its preference, starts only after a gesture, and pauses while the page is hidden. `sound.ambientVolume` adjusts its volume without changing sound effects. Existing sound sections missing the volume field gain 0.18; saved melody choices and other settings remain unchanged. See [music credits and license](music.md).

## Save and commit

**Save to project** validates and writes `config/game-config.json` directly into this checkout. It does not commit automatically. Review and commit that JSON file along with the implementation when ready.

**Reset preview** discards unsaved adjustments. **Reload file** loads the latest file from disk. If another editor changed the file since it was loaded, Save refuses to overwrite it; reload before applying your changes again. **Download JSON** exports the current preview values separately.

Vite development refreshes when the config file changes. In production-preview mode, the Studio session loads the current file, but ordinary visitors use the values included in the last build. Run `npm run build` again to update that preview or deploy the saved defaults.

## Local access

The private link uses a random token stored at `.nodoku-data/admin-token`, outside Git. The token is removed from the browser address after opening and retained in that tab's session storage. The API accepts only authenticated loopback requests and same-origin writes to the fixed JSON file. Vite denies file access to the token and local secrets. The Cloudflare deployment does not include the local admin API or filesystem token.

`npm run test:admin` exercises live controls, actual file saving, reload, reset, export, animation timing, and mobile layout against the running preview. It restores the config file after its test edits, unless another editor changed it during the test.
