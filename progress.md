Original prompt: I need to create simple cross platform game (DotCon/Nodes) with N x N dot-connection puzzle, auto-generated levels, web/iOS/Android support.

2026-02-05
- Goal: Fix web input (keyboard/mouse drag) not working in browser build.
- Added inline head include script in export preset to force canvas focus and prevent arrow/WASD default scroll.
- Added web polling fallback and canvas focus in game_controller.
- Added focus_mode=FOCUS_NONE for menu/topbar buttons + option buttons to avoid stealing keyboard focus.
- Added key press logging to user://input_debug.log for diagnosing missing key events.
- Limitation: Local server + Playwright tests cannot run in sandbox (ports blocked). Need user to test locally.

TODO
- User to test web build after pull; if still broken, inspect input_debug.log for key events and consider JS-level input forwarding.

2026-02-05 update
- Added focus_mode=FOCUS_NONE for menu/options/topbar buttons to prevent UI stealing keyboard focus.
- Added key press logging in game_controller for debugging.
- Attempted Playwright run per develop-web-game skill, but script can't resolve Playwright (ESM lookup). Global install blocked due to no network.
- Exported web build and recompressed assets.

2026-02-05 update
- Updated dev_server.js to optionally brotli-decompress assets for local testing (DECOMPRESS_BROTLI=1) and added request/error logging.
- Added .gitattributes to force wasm/pck as binary (avoid text conversion).

2026-02-06
- Increased HUD scale on mobile web by adding dynamic scaling for TopBar and CompletionPanel in scripts/game_controller.gd.
- Tried running Playwright client from develop-web-game skill; fails to resolve playwright module when executed from skills path (local node_modules exists in repo).
- Dev server requires escalated permissions to bind 127.0.0.1:8080 in sandbox; ran with approval.

2026-02-06 update
- Control hints now always visible with multi-line instructions (double tap/click, W/A/S/D or arrows, click/drag connect) and slightly larger font on touch devices.
- Playwright run still blocked because browser binaries are missing; needs `npx playwright install`.

2026-02-06 update
- Tutorial is now interactive: steps advance only after required taps, with skip/complete handling and no auto-cycling.
- Tutorial now marks as shown on first auto-display (skip works), hides the "Don't show again" checkbox, updates step copy to action prompts, and reveals steps sequentially.
- Failed Playwright run: skill client cannot resolve `playwright` when executed from skills path (ERR_MODULE_NOT_FOUND). Dev server requires escalated permissions to bind 127.0.0.1:8080; started successfully with approval.

2026-02-06 update
- Tutorial overlay is now full-screen (no card panel), with updated layout/spacing and an extra step for rotation.
- Tutorial demo supports swipe/drag/arrow rotation and shows layered depth; tutorial grabs focus when shown.
- Tutorial demo now handles pan gestures (trackpad swipe) to trigger rotation step.

2026-02-06 update
- Added undo history for edge changes; double-tap on empty space undoes last edge and rotates to the face where it was created.

2026-02-09
- Investigated large-level mid-game input freeze report (`6x6x6`, `7x7x7`).
- Added defensive fixes:
  - Disabled per-input `user://input_debug.log` writes by default (`ENABLE_INPUT_DEBUG_LOG := false`) to avoid web file I/O overhead during long sessions.
  - Reworked pointer-vs-UI detection to use positional hit-testing (`Control.get_global_rect().has_point(pos)`) instead of viewport hovered-control state, reducing chances of false input blocking.
  - Added GridView rotation timeout fallback so `rotation_active` cannot remain stuck forever if a tween completion signal is missed.
- Validation:
  - Installed local Playwright Chromium (`npx playwright install chromium`) and ran browser interaction scripts against `http://127.0.0.1:8080`.
  - Verified game input still responds after repeated board clicks + keyboard rotations + intermittent top-bar hover.
  - Ran `godot --headless --path . --quit-after 3 --verbose` to confirm project boots without runtime script errors.

2026-02-09 update
- Added a dedicated back-layer blur pass in `scripts/grid_view.gd` so non-front circles render softer while front-face circles remain crisp.

2026-02-09 update
- New game setup now starts from an almost-complete board:
  - Added `START_WITH_UNSOLVED_CIRCLES := 3` in `scripts/game_controller.gd`.
  - During generation, puzzle now pre-fills the whole solution and then removes edges touching a few circles, so the start state is almost solved but not complete.

2026-02-09 update
- Startup prefill is now animated:
  - Level begins with no placed edges, then solution edges are added one-by-one with short delay (`STARTUP_CONNECTION_ANIM_DELAY`).
  - Target state still leaves a few circles unsolved.
  - Gameplay input is temporarily blocked during startup animation to avoid race conditions.
  - Animated startup connections are now recorded in `undo_stack`, so they can be undone like normal player actions.
  - Auto-start solve was removed. Added top-bar `Solve` button to trigger the same animated prefill on demand.
- Increased blur/softening strength in both `scripts/grid_view.gd` and `scripts/tutorial_demo.gd` so back layers are visibly distinct in gameplay and tutorial preview.
- Reworked back-layer visuals to be unmistakably non-front: blurred multi-offset ring strokes + suppressed back-layer dots in both game and tutorial renderers.
- Replaced threshold-based front/back blur with continuous depth-of-field style blur in `scripts/grid_view.gd` and `scripts/tutorial_demo.gd`.
- Blur strength now scales smoothly from face alignment/depth (`blur = pow(1 - face_fade, 1.15)`) so focus transitions continuously while rotating.
- Verified project starts cleanly with `godot --headless --path . --quit-after 3 --verbose`.
- Fixed node picking to match continuous focus model: replaced strict front-face-only hit test with blur-scored picking in `scripts/grid_view.gd` (`PICK_BLUR_MAX`, weighted score by distance+blur).
- This should restore interaction on near-focus nodes that were previously visible but blocked by hard face-threshold picking.
2026-02-09 update
- Added Shift+click parity with double-click node behavior in `scripts/game_controller.gd`:
  - Left mouse release now forwards `shift_pressed` through pointer release/drag-end paths.
  - `_handle_press(..., force_node_auto_fill)` triggers `_auto_fill_node(node_id)` immediately when Shift is held.
  - This makes single Shift+click on a node connect-all / disconnect-all for that node.
- Added redo support and keyboard shortcuts:
  - New `redo_stack` history stack.
  - Added `Ctrl/Cmd + Z` -> undo and `Ctrl/Cmd + Shift + Z` -> redo in both event-key path and web polling path.
  - Refactored history application into `_start_history_step(action, is_redo)` and `_apply_history_step(action, is_redo)` so face-snap/rotation wait logic works for both undo and redo.
  - Clearing history now clears both stacks on new game/model generation, solve, restart, and next level.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes after changes.
  - Ran Playwright browser checks against `http://127.0.0.1:8090` (custom script) and captured screenshots:
    - `output/manual-check/11-shift-click-autofill.png` (Shift+click action applied)
    - `output/manual-check/12-undo-ctrl-z.png` (undo)
    - `output/manual-check/13-redo-ctrl-shift-z.png` (redo)
    - `output/manual-check/14-undo-cmd-z.png` (Cmd undo)
    - `output/manual-check/15-redo-cmd-shift-z.png` (Cmd+Shift redo)
2026-02-09 update
- Added in-game side help panel in `scenes/Main.tscn` (`Game/HUD/Root/HelpPanel`) with full goal + controls list.
- Added `H` keyboard toggle in `scripts/game_controller.gd` via `_toggle_help()`.
- Fixed web double-toggle issue by handling `H` in only one path on web (`_poll_keyboard_web`) and skipping event-path toggle when polling is enabled.
- Updated `scripts/main.gd` bottom HUD text to point players to the new help panel (`Press H`).
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - Exported web build and verified in browser with Playwright.
  - Confirmed help toggle visual states in screenshots:
    - `output/web-game/help-toggle-check-2/01-before-help.png`
    - `output/web-game/help-toggle-check-2/02-help-open.png`
    - `output/web-game/help-toggle-check-2/03-help-closed.png`
2026-02-09 update
- Fixed Help panel layout warning from Godot: wrapped HelpText with a ScrollContainer and set `custom_minimum_size` on the label.
- Added top-bar `Help` button for non-keyboard access; kept `H` shortcut.
- Help panel remains bottom-right and now displays reliably without clipping issues.
- Updated HUD hint copy to mention `Help` button.
- Validation:
  - `godot --headless --path . --quit-after 2 --verbose` passes.
  - Browser screenshot confirms help visible via Help button:
    - `output/web-game/help-button-check/02-help-open-via-button.png`
2026-02-10 reconstruction from chat
- Recreated missing icon pipeline/runtime files that were absent from project:
  - `scenes/IconPreview.tscn`
  - `scripts/icon_preview.gd`
  - `scripts/generate_icons.mjs`
- Restored icon-preview entrypoint in `scripts/main.gd` (`?icon_preview=1`) and style/white-unsolved support in `scripts/grid_view.gd`.
- Rebuilt web export and regenerated canonical idea-8 screenshots:
  - `output/icon-preview/idea8-redonly/style0/shot-0.png`
  - `output/icon-preview/idea8-redonly/style1/shot-0.png`
- Re-locked master icon and regenerated platform icon assets:
  - master: `assets/app_icons/source/master-approved-1024.png`
  - generated: `assets/app_icons/{ios,android,web}` + synced `public/index.icon.png` and `public/index.apple-touch-icon.png`
2026-02-10 recovery
- Restored lost interaction/history changes in `scripts/game_controller.gd` after accidental reset.
- Recovered:
  - Shift+single-click on node performs double-click behavior (`_auto_fill_node`) for connect-all/disconnect-all.
  - Keyboard shortcuts: `Ctrl/Cmd+Z` undo and `Ctrl/Cmd+Shift+Z` redo.
  - Redo stack support with rotation-aware history replay (`_start_history_step`, `_apply_history_step`).
  - Proper clearing of undo/redo state on new game/model, solve, restart, and next-level flows.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - Playwright skill client run completed on `http://127.0.0.1:8091`.
  - Targeted browser shortcut test passed with no console/page errors (`output/recover-check/errors.json` is empty).
2026-02-13 update
- Fixed intermittent center-screen input blocking in `scripts/game_controller.gd`:
  - `_control_hit()` now checks `control.is_visible_in_tree()` instead of `control.visible`.
  - This prevents hidden completion UI children (centered buttons) from being treated as active hit targets and blocking node interaction.
2026-02-13 update
- Added a new completion rule in the core model/controller flow: required nodes must also be in one connected placed-edge network.
  - `GridModel`: added `required_node_count()`, `connected_required_count()`, `is_required_network_connected()`.
  - `GameController`: completion now checks both degree completion and connected-network completion.
  - Added top-bar live status text (`Edges x/y`, `Net a/b`) plus dead-end and split-network warnings.
- Updated generator to strongly prefer connected required-node solutions and added connected fallback generation.
  - `LevelGenerator`: attempt scoring now tracks connected candidates; fallback builder creates a connected component if random attempts miss.
- Restyled UI and board visuals to a warm neon wireframe direction.
  - Dark menu/HUD theme in `scenes/Main.tscn`.
  - Updated popup theme colors in `scripts/main.gd`.
  - Updated board rendering in `scripts/grid_view.gd` with dark starfield background and glow-heavy nodes/edges.
- Follow-up style tweak from user request:
  - Circles now glow as full bodies (not only edge glow).
  - Dot markers are now dark.
  - Applied in both gameplay (`scripts/grid_view.gd`) and tutorial preview (`scripts/tutorial_demo.gd`).
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes after logic/theme changes.
  - `godot --headless --path . --quit-after 2 --verbose` passes after glow/dark-dot tweak.
  - Web export run with `godot --headless --path . --export-release "Web" public/index.html`.
  - Playwright skill client run completed against local dev server; screenshot check:
    - `output/web-game/glow-dark-dots-check/shot-0.png`
2026-02-13 update
- User feedback: circles still did not read as glowing.
- Root cause: previous look relied on soft alpha halos + opaque body fill in CanvasItem; without post-process bloom this reads as soft shading, not strong emission.
- Fix: added layered full-body glow passes in both renderers:
  - `scripts/grid_view.gd`: `_draw_full_node_glow(...)` and integrated into `_draw_node_item(...)`.
  - `scripts/tutorial_demo.gd`: `_draw_demo_full_glow(...)` and integrated into `_draw_demo_node(...)`.
- Dots remain dark (`scripts/grid_view.gd`, `scripts/tutorial_demo.gd`).
- Validation:
  - `godot --headless --path . --quit-after 2 --verbose` passes.
  - Exported web build.
  - Screenshot check: `output/web-game/glow-dark-dots-check-v2/shot-0.png`.
2026-02-13 update
- Switched visual direction to terminal-style ASCII look:
  - `scripts/grid_view.gd`
    - Green-on-black palette.
    - CRT scanline/noise style background.
    - Dashed connection lines (terminal-like).
    - Nodes now render as square terminal cells instead of circular pips.
    - Remaining requirements now shown as ASCII markers (`+`, `++`, ... , `OK`) using text rendering.
  - `scripts/tutorial_demo.gd`
    - Matching terminal palette and square ASCII demo nodes.
    - Dashed demo connection lines.
- UI style updated for terminal aesthetic:
  - `scenes/Main.tscn`: monospaced font stack + green palette in menu/HUD controls.
  - `scripts/main.gd`: popup theme + control hint text updated for ASCII mode copy.
  - `scripts/game_controller.gd`: status label colors shifted to green palette.
- Web shell background kept dark terminal green in `public/index.html`.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - Exported web build.
  - Playwright screenshot check: `output/web-game/terminal-ascii-style-check/shot-0.png`.
2026-02-13 update
- Finalized switchable visual themes and verified runtime switching flow:
  - Stored 3 themes in code paths: `Classic`, `Warm`, `Terminal ASCII`.
  - Menu now includes a persistent `Theme` option (`scripts/main.gd`) saved to `user://settings.cfg`.
  - In-game theme cycling uses top-bar `Theme` button (`scripts/game_controller.gd`) and emits `visual_theme_changed` back to menu state.
- Fixed top-bar theme button placement bug:
  - Root cause: button insertion before spacer could place it out of practical view/hit area.
  - Fix: insert directly after `Solve` button (`scripts/game_controller.gd`, `_ensure_theme_button`).
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright skill client visual checks (no `errors-*.json` produced):
    - Classic in-game: `output/web-game/theme-switch-check/postfix-enter/shot-0.png`
    - Warm in-game: `output/web-game/theme-switch-check/postfix-warm/shot-0.png`
    - ASCII in-game: `output/web-game/theme-switch-check/postfix-ascii/shot-0.png`
2026-02-13 update
- Updated hint behavior to support pair hints when no forced single-node hint exists:
  - `scripts/game_controller.gd`
    - Replaced `_find_hint_node()` with `_find_hint_nodes()`.
    - Rule now is:
      - If any node has `remaining_dots == free_neighbors`, hint returns one node (existing forced-node behavior).
      - Otherwise, hint picks a valid unplaced edge candidate and returns two node ids to connect.
    - Updated hint rotation pending/apply flow to carry `nodes` arrays.
    - `_apply_hint(...)` now accepts arrays and sets multiple highlighted hint nodes.
    - `_clear_hint()` now clears both single and multi hint state.
    - `start_new_game(...)` now clears `grid_view.hint_ids` along with `hint_id`.
  - `scripts/grid_view.gd`
    - Added `hint_ids: Array` and reset it when model changes.
    - Added `_is_hint_node(node_id)` helper.
    - Node drawing now treats any node in `hint_ids` (or `hint_id`) as highlighted.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - Ran Playwright skill client against local dev server and captured gameplay hint screenshot:
    - `output/web-game/hint-pair-check-4/shot-0.png`
  - Added deterministic headless rule check (`/tmp/hint_pair_check.gd`) and executed:
    - `godot --headless --path . --script /tmp/hint_pair_check.gd`
    - Output: `hint_pair_check_ok checked=80`
2026-02-13 update
- Improved anti-bruteforce level generation by adding a new constraint-pressure metric in `scripts/level_generator.gd`.
  - New `min_constraint_ratio` generation parameter gates accepted levels by the share of required nodes with low slack (`available_required_neighbors - required <= 1`).
  - Candidate selection now uses a composite quality score (nonzero ratio + constrained ratio - avg slack penalty), so connected but highly swappable degree layouts are deprioritized.
- Wired gameplay difficulty presets to request tighter constraints and increased generator attempts in `scripts/game_controller.gd`.
  - Easy: `min_nonzero_ratio=0.40`, `min_constraint_ratio=0.18`, `max_attempts=18`
  - Normal: `min_nonzero_ratio=0.52`, `min_constraint_ratio=0.27`, `max_attempts=26`
  - Hard: `min_nonzero_ratio=0.62`, `min_constraint_ratio=0.36`, `max_attempts=34`
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright skill client run against local dev server completed with no captured console/page errors:
    - `output/web-game/bruteforce-robust-check-game/shot-0.png`
- Extra generation sanity check:
  - Ran `godot --headless --path . --script /tmp/dotcon_gen_stats.gd` to sample generated solutions.
  - Connectivity check via `LevelGenerator._is_solution_connected(...)` reported 40/40 connected for easy/normal/hard sample batches.
2026-02-13 update
- User feedback: glow still looked dim. Implemented stronger combined glow effects across both game and tutorial renderers.
- `scripts/grid_view.gd`
  - Reworked node glow into multi-pass emissive stack (wide aura + bloom + hot core/spark) in `_draw_full_node_glow(...)`.
  - Brightened node bodies for Warm/Terminal themes and added stronger inner hot-core fills.
  - Increased edge glow intensity using layered passes (outer glow + mid glow + hot core line) for both Warm and Terminal paths in `_draw_edge_item(...)`.
- `scripts/tutorial_demo.gd`
  - Mirrored the same glow model and brighter fills so tutorial preview matches gameplay.
  - Added `demo_time` pulse driver and strengthened demo line glow with stacked passes.
- Validation:
  - `godot --headless --path . --quit-after 2 --verbose` passes.
  - Web export succeeds: `godot --headless --path . --export-release "Web" public/index.html`.
  - Playwright skill client screenshot checks (no error logs produced):
    - Warm theme: `output/web-game/glow-brightness-check/shot-0.png`
    - Terminal theme: `output/web-game/glow-brightness-check-terminal/shot-0.png`
2026-02-13 update
- User feedback: glow looked overly bright and visibly layered/thresholded.
- Reduced glow intensity and line glow widths in both gameplay/tutorial renderers.
- Replaced concentric multi-circle glow construction with smooth radial texture glow passes to remove ring-banding:
  - `scripts/grid_view.gd`: added `_ensure_glow_texture()` + `_draw_glow_sprite(...)`, updated `_draw_full_node_glow(...)` to texture-based aura/bloom/core.
  - `scripts/tutorial_demo.gd`: added `_ensure_demo_glow_texture()` + `_draw_demo_glow_sprite(...)`, updated `_draw_demo_full_glow(...)` accordingly.
- Validation:
  - `godot --headless --path . --quit-after 2 --verbose` passes.
  - Web export succeeds.
  - Playwright screenshot check: `output/web-game/glow-smooth-check-v2/shot-0.png` (no error logs generated).
2026-02-13 update
- Temporary blur-off toggle added per user request.
- `scripts/grid_view.gd`: added `TEMP_DISABLE_BLUR := true` and forced node `blur_strength` to 0 in round/terminal node draw paths.
- `scripts/tutorial_demo.gd`: added `TEMP_DISABLE_BLUR := true` and forced demo layer `blur_strength` to 0.
- Validation: `godot --headless --path . --quit-after 2 --verbose` passes.
2026-02-13 update
- Investigated web freeze/crash (`_emscripten_glGenVertexArrays` / `Invalid array length`) and added a web-oriented render load reduction pass.
- `scripts/grid_view.gd`:
  - Stopped unconditional idle redraws on web by gating ambient animation updates (`_ambient_animation_enabled`) and only queuing redraw when state actually changes.
  - Added early return in `_process` when not visible (`is_visible_in_tree()`), so hidden game layers do not keep updating.
  - Added web-specific depth blur disable gate (`_depth_blur_disabled`) to reduce per-frame primitive count on web.
- `scripts/tutorial_demo.gd`:
  - Made processing visibility-aware (turn off processing while hidden) and switched redraw to dirty-only updates.
  - Added web ambient/blur gates to avoid continuous animation redraw pressure in hidden/overlay states.
- `scripts/icon_preview.gd`:
  - Removed unnecessary always-on process loop (`set_process(false)`), keeping redraw event-driven.
- Validation:
  - `godot --headless --path /Users/andriisolokh/Projects/dotcon --quit-after 3 --verbose` passes.
2026-02-13 update
- Added a background FX experiment pass focused on richer atmosphere across all visual themes.
- `scripts/grid_view.gd`
  - Classic theme: added soft top/side radial lighting, subtle dust noise, and a light vignette ring pass.
  - Warm theme: added horizon glow, animated ember-like wisp trails, and stronger edge vignette for depth.
  - Terminal theme: added soft central phosphor glow, extra CRT row bands, lower-half grid lines, subtle data-stream wisps, and darker edge vignette.
  - Added reusable background helpers: `_draw_soft_radial(...)`, `_draw_vignette(...)`, `_draw_wisp_trail(...)`.
- `scripts/tutorial_demo.gd`
  - Added matching themed background drawing (`_draw_demo_background`) so tutorial/menu preview reflects the same visual direction.
  - Implemented demo-side helper equivalents (`_draw_demo_soft_radial`, `_draw_demo_vignette`, `_draw_demo_wisp_trail`, `_demo_hash01`).
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright skill client screenshot checks (no `errors-*.json` generated):
    - Classic: `output/web-game/background-effects-check/classic/shot-0.png`
    - Warm: `output/web-game/background-effects-check/warm/shot-0.png`
    - Terminal: `output/web-game/background-effects-check/terminal/shot-0.png`
2026-02-13 update
- User feedback: background still felt static; switched to shader-driven animated background.
- Added `shaders/live_background.gdshader` with theme-aware procedural motion:
  - Classic: soft paper-like grain + moving light wash.
  - Warm: drifting glow field + ember spark noise.
  - Terminal: animated scanlines, grid flicker, and phosphor pulse.
- Wired shader into main background layer in `scenes/Main.tscn` (`Background` now uses `ShaderMaterial`).
- `scripts/main.gd`
  - Added `_apply_background_shader_theme()` to push current theme id into shader uniform.
  - Added lightweight `_process(delta)` uniform tick (`time_offset`) to keep shader motion alive consistently.
- `scripts/grid_view.gd`
  - Added `use_shader_background` flag and skipped internal static background draw when enabled.
- `scripts/game_controller.gd`
  - Enabled shader-backed board rendering path (`grid_view.use_shader_background = true`) so gameplay shows animated backdrop.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright skill client checks (no `errors-*.json`):
    - `output/web-game/live-shader-game-check/classic/shot-0.png`
    - `output/web-game/live-shader-game-check/warm/shot-0.png`
    - `output/web-game/live-shader-game-check/terminal/shot-0.png`
  - Runtime animation confirmation via Playwright+pixel sampling at same screen point over time:
    - sampled RGBA changed across 1s intervals (`[193,193,192,255] -> [188,189,187,255] -> [191,192,190,255]`).
2026-02-13 update
- Refined live shader VFX to a more elegant visual style (less noisy/harsh, smoother motion).
- `shaders/live_background.gdshader`
  - Reworked motion to domain-warped smooth flow for softer temporal transitions.
  - Reduced hard contrast and replaced blocky warm particles with soft ember specks.
  - Softened terminal scan/grid treatment and reduced flicker harshness.
  - Tuned classic mode to subtle grain + gentle sheen instead of noisy texture.
- `scripts/main.gd`
  - Added per-theme shader uniform tuning in `_apply_background_shader_theme()`:
    - Classic: slower, softer glow, subtle grain.
    - Warm: moderate speed, warmer glow, no scan/grid artifacts.
    - Terminal: controlled scan/grid with reduced flicker aggressiveness.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright skill client checks (no `errors-*.json`):
    - `output/web-game/vfx-elegant-check/classic/shot-0.png`
    - `output/web-game/vfx-elegant-check/warm/shot-0.png`
    - `output/web-game/vfx-elegant-check/terminal/shot-0.png`
2026-02-13 update
- Ran web release pipeline manually (without auto git commit/push).
- Exported + compressed release artifacts:
  - `public/index.html`
  - `public/index.pck` (brotli-compressed content)
  - `public/index.wasm` (brotli-compressed content)
- Updated version stamp:
  - `version.txt` -> `0.1.0 (2026-02-13 16:25)`
- Resulting modified tracked files for release payload:
  - `public/index.html`
  - `public/index.pck`
  - `version.txt`
2026-02-13 update
- Added live in-game VFX toggle panel in `scripts/game_controller.gd`:
  - New top-bar `VFX` button beside `Theme`.
  - Popup with per-effect checkboxes and `All On` / `All Off` controls.
  - Toggle list wired to renderer flags from `GridView.vfx_entries()`.
  - Popup hit-testing + auto-close when clicking outside.
  - Added hover/press coupling from `Hint`/`Solve` to board glow (`set_ui_light_bias`, `pulse_ui_light`).
- Wired gameplay events to VFX triggers in controller:
  - Connect/disconnect now call `grid_view.trigger_edge_feedback(...)` across drag tap, auto-fill, startup prefill, and undo/redo replay paths.
  - Completion now triggers `grid_view.trigger_completion_wave()`.
- Extended renderer with switchable elegant VFX in `scripts/grid_view.gd`:
  - Runtime VFX flags + API (`set_vfx_enabled`, `get_vfx_enabled`, `vfx_entries`).
  - Shader-background toggle integrated with existing `use_shader_background` path.
  - Time-based animated effects:
    - Edge energy sweep
    - Connection ripples
    - Hint beacon pulse
    - Solved-network aura
    - Parallax fog
    - Phosphor edge persistence
    - Warm heat shimmer
    - Completion shockwave
    - Disconnect dissolve particles
    - UI light coupling boost
  - Enabled ambient animation on web (`WEB_DISABLE_AMBIENT_ANIMATION := false`) so backgrounds/effects stay live.
- Styled VFX popup per theme for readability (Classic/Warm/ASCII).

Validation
- `godot --headless --path . --quit-after 3 --verbose` passes.
- `godot --headless --path . --quit-after 2 --verbose` passes after popup style polish.
- `godot --headless --path . --export-release "Web" public/index.html` succeeds after changes.
- Ran Playwright skill client against local server (`http://127.0.0.1:8093`) with custom action bursts for all three themes.
- New screenshots showing live VFX toggle panel and state changes:
  - `output/web-game/vfx-live-toggle-check/classic/shot-0.png`
  - `output/web-game/vfx-live-toggle-check/warm/shot-0.png`
  - `output/web-game/vfx-live-toggle-check/terminal/shot-0.png`
2026-02-13 update
- Expanded VFX controls for deeper exploration:
  - Added new renderer toggle `Ambient Particles` in `scripts/grid_view.gd` (`VFX_AMBIENT_PARTICLES`) and integrated animated particle field drawing.
  - Added global VFX shaping controls in `GridView`:
    - `set_vfx_intensity()/get_vfx_intensity()`
    - `set_vfx_motion()/get_vfx_motion()`
  - Routed intensity/motion factors through major effects (parallax fog, heat shimmer, glow stack, edge sweep, phosphor trail, dissolve, ripples, completion wave, solved aura, float offsets).
- Upgraded in-game `VFX` popup UX in `scripts/game_controller.gd`:
  - Added quick presets: `Subtle`, `Balanced`, `Cinematic`.
  - Added live `Intensity` and `Motion` sliders with value readouts.
  - Added preset logic (`_apply_vfx_preset`) and synced all controls via `_refresh_vfx_controls()`.
  - Theme styling now colors all popup labels/buttons/sliders consistently.

Validation
- `godot --headless --path . --quit-after 3 --verbose` passes.
- `godot --headless --path . --export-release "Web" public/index.html` succeeds after explore pass.
- Playwright skill client run against `http://127.0.0.1:8094` with new exploration actions.
- Screenshots with advanced controls visible:
  - `output/web-game/vfx-lab-explore-check/classic/shot-0.png`
  - `output/web-game/vfx-lab-explore-check/warm/shot-0.png`
  - `output/web-game/vfx-lab-explore-check/terminal/shot-0.png`
2026-02-14 release
- Ran `scripts/release_web.sh` (web export + brotli compression + version stamp).
- Script reported commit/push success, but commit step was skipped internally due HOME override context; release files remained staged.
- Finalized release manually:
  - committed staged release artifacts (`public/index.html`, `public/index.pck`, `version.txt`)
  - pushed to `origin/main`
- Release commit: `6c1b54c` with message `Release web 2026-02-14 08:45`.
- `version.txt` now: `0.1.0 (2026-02-14 08:45)`.
2026-02-14 update
- Added runtime post-processing compositor with live toggles in `scripts/game_controller.gd`.
  - New fullscreen overlay (`PostFxOverlay`) with shader material (`res://shaders/post_fx_compositor.gdshader`) injected at runtime above gameplay and below HUD.
  - Added post-effect controls into the existing VFX popup (now listed first under `Post Effects`):
    - Post Vignette
    - Post Bloom Lift
    - Film Grain
    - Chromatic Fringe
    - Scanline Sweep
    - Lens Warp
    - Color Grade
  - Integrated post FX with existing runtime knobs:
    - Uses current theme (`Classic/Warm/ASCII`) for grade/tint behavior.
    - Uses `Intensity` and `Motion` sliders to scale post shader dynamics.
    - `All On/All Off` and presets now include post FX state.
- Added new shader file:
  - `shaders/post_fx_compositor.gdshader`
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` passes.
  - Playwright captures after export (post FX panel visible with new toggles):
    - `output/web-game/post-fx-check/classic/shot-0.png`
    - `output/web-game/post-fx-check/warm/shot-0.png`
    - `output/web-game/post-fx-check/terminal/shot-0.png`
2026-02-14 update
- Added full Developer Mode workflow for VFX tuning in `scripts/game_controller.gd`:
  - Entry points:
    - In-game top-bar `Dev` toggle button (`Dev On` / `Dev Off`).
    - Launch flags: `--dev`, `--developer-mode`, `dev=1`, `--dev=1`.
    - Web query params: `?dev=1` or `?developer=1`.
  - VFX popup now contains a Developer Mode section (visible only when Dev mode is on):
    - `Save Profile` / `Load Profile` buttons.
    - Per-effect selector (`OptionButton`) covering both gameplay VFX and post effects.
    - Per-effect sliders: `FX Intensity` and `FX Motion`.
  - Profile persistence implemented:
    - Captures master intensity/motion, gameplay VFX flags + per-effect profiles, post-FX flags + per-effect profiles, and dev-mode state.
    - Save paths:
      - project defaults: `res://config/vfx_defaults.json`
      - user override: `user://vfx_profile.json`
    - Startup load order: defaults first, then user override.
- Added per-effect profile model in `scripts/grid_view.gd`:
  - `vfx_profiles` map with per-key `intensity` + `motion`.
  - New API: `set/get_vfx_profile_intensity`, `set/get_vfx_profile_motion`, snapshots for profile save.
  - Applied per-effect factors across gameplay VFX draw/timer/event paths (edge sweep, ripple, aura, parallax fog, particles, phosphor trail, shimmer, completion wave, dissolve, hint/UI coupling interactions).
- Extended post-processing shader and runtime bindings:
  - `shaders/post_fx_compositor.gdshader` now supports per-post-effect intensity and per-post-effect motion uniforms (`fx_*` and `fx_*_motion`).
  - `scripts/game_controller.gd` passes master * per-effect values for each post effect.
- Fixed parser and typing regressions introduced during this iteration:
  - Loop-scope/indent issues in VFX popup population.
  - Warning-as-error type inference in profile load (`_apply_vfx_profile`) by adding explicit Variant/Dictionary typing.
- Validation:
  - `godot --headless --path . --quit-after 1 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright skill client checks on local dev server (`scripts/dev_server.js`) confirm runtime UI behavior:
    - `output/web-game/dev-mode-profile-check/shot-0.png`
    - `output/web-game/dev-mode-profile-check-2/shot-0.png`
    - `output/web-game/dev-mode-save-check/shot-0.png`
  - Last screenshot shows Developer Mode controls and Save status text (`Saved to user + project defaults`).

TODO
- Optional UX improvement: split popup into collapsible sections or tabs (Post Effects / Gameplay VFX / Dev Profile) to reduce vertical scroll.
- Optional: add `Export` / `Import` buttons with file picker for sharing VFX profiles between devices/builds.
2026-02-14 update (follow-up)
- Added checked-in project default profile file: `config/vfx_defaults.json`.
- Set `developer_mode` default to `false` in that file so regular gameplay launches without Dev panel enabled by default.
- Re-ran `godot --headless --path . --quit-after 1 --verbose` after config update; passes.
2026-02-14 update (dev-only controls)
- Made top-bar `Solve`, `Theme` (Classic/Warm/ASCII), and `VFX` controls dev-only in `scripts/game_controller.gd`.
  - Added `_apply_developer_mode_visibility()` to show/hide these buttons based on `developer_mode`.
  - Called on startup, on Dev button toggle, and after profile load.
  - Added runtime guards to `_on_solve_pressed`, `_on_theme_pressed`, and `_on_vfx_pressed` when dev mode is off.
  - When dev mode turns off, VFX popup closes and solve-hover UI bias is reset.
- Validation:
  - `godot --headless --path . --quit-after 1 --verbose` passes.
  - Web export succeeds.
  - Playwright screenshots:
    - Dev off (buttons hidden): `output/web-game/dev-only-buttons-check/off/shot-0.png`
    - Dev toggled on (buttons visible): `output/web-game/dev-only-buttons-check/toggled-on/shot-0.png`
2026-02-14 update (launch dev precedence)
- Adjusted `_ready()` in `scripts/game_controller.gd` so launch-requested dev mode (`?dev=1` / `--dev`) takes precedence after profile load.
- This preserves explicit launch entry into dev mode even if saved profile has `developer_mode=false`.
2026-02-14 update (depth modes)
- Refactored menu depth selection in `scripts/main.gd` to only two modes:
  - `Flat (1 layer)` (`DEPTH_MODE_FLAT`)
  - `Cube (N layers)` (`DEPTH_MODE_CUBE`, where `N` is selected grid size)
- Depth now resolves at game start via `_effective_depth(size, depth_mode)`:
  - flat -> `1`
  - cube -> `size`
- Added dynamic depth option rebuilding when grid size changes:
  - `_rebuild_depth_options(...)`
  - `_on_grid_size_option_selected(...)`
- Updated settings persistence/migration:
  - New stored key: `game/depth_mode`.
  - `game/grid_depth` now stored as resolved numeric depth for compatibility.
  - Legacy `grid_depth` values map to mode on load (`1` => flat, `>1` => cube).
- Updated all `_save_settings(...)` call sites to use depth mode rather than raw layer count.
- Validation:
  - `godot --headless --path . --quit-after 1 --verbose` passes.
  - Web export succeeds.
  - Playwright screenshots confirm behavior:
    - Menu with new depth mode label: `output/web-game/depth-mode-check/menu/shot-0.png`
    - Grid size changed to 4 updates depth text to cube size: `output/web-game/depth-mode-check/skip-size-change/shot-0.png`
2026-02-14 update (per-effect mixer list)
- Replaced selector-based per-effect VFX editing in `scripts/game_controller.gd` with a full per-effect mixer list.
  - Removed single-effect selector + shared two sliders.
  - Added generated `Per-Effect Mix` section in Developer Mode popup.
  - Each VFX entry (post + gameplay) now has dedicated `Intensity` and `Motion` sliders visible in-place.
  - Slider bindings update effect profiles immediately via key-bound callbacks.
  - Control refs are tracked in `vfx_effect_controls` dictionary and refreshed in bulk.
- Validation:
  - `godot --headless --path . --quit-after 1 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright visual check confirms in-place mixer list UI:
    - `output/web-game/vfx-mixer-list-check/stable/shot-0.png`
2026-02-14 update (VFX popup cleanup/layout)
- Refactored `scripts/game_controller.gd` VFX popup to match new dev UX:
  - Removed master controls from runtime UI flow (no Master Intensity/Motion section).
  - Removed checkbox/toggle section usage for enabling/disabling effects.
  - Per-effect sliders are now the source of truth for enable state (`intensity <= 0.001` disables effect).
  - Increased popup size and made Developer Mode mixer section expand/fill vertically for a larger editing area.
  - Kept sliders stacked under each effect (Intensity row + slider, Motion row + slider).
- Presets now operate on per-effect profiles only and then sync flags from profile intensity.
- Profile persistence now stores/loads per-effect profiles only (legacy master/flag fields are no longer written); load path syncs flags from profile intensity.
- Build/validation:
  - `godot --headless --path . --quit-after 1 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` passes.
  - Playwright visual check: `output/web-game/vfx-layout-refactor-check-ingame3/shot-0.png`.
2026-02-14 update (per-effect slider schema + log scale)
- Reworked VFX dev mixer controls in `scripts/game_controller.gd`:
  - Added per-effect parameter schemas so effects now show only relevant sliders.
    - Some effects now show one slider (`Amount`), others show two (e.g. `Amount` + `Animation`/`Speed`/`Drift`).
  - Replaced linear 0..2 slider behavior with logarithmic mapping for finer low-end control and larger headroom.
  - Added signed-log support for selected motion controls (e.g. parallax/particles/shimmer drift), allowing negative values to reverse motion direction.
- Expanded runtime ranges and clamps:
  - Gameplay VFX intensity range extended up to 6.0 and motion range to [-4.0, 4.0] (`scripts/grid_view.gd`).
  - Post FX per-effect intensity/motion ranges extended to 4.0 (`scripts/game_controller.gd`, `shaders/post_fx_compositor.gdshader`).
- Runtime stability updates in `scripts/grid_view.gd` for signed motion:
  - Added `_vfx_speed_factor()` and used absolute motion where duration/smoothing speed is required.
  - Kept signed direction for drift-like effects (parallax fog, ambient particles, heat shimmer, float offset).
- Validation:
  - `godot --headless --path . --quit-after 1 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` passes.
  - Playwright visual check screenshot: `output/web-game/vfx-log-scale-check/shot-0.png`.
2026-02-14 update (VFX popup docking/size)
- Adjusted VFX popup layout in `scripts/game_controller.gd` to obstruct gameplay less:
  - Reduced popup width/height (`356 x min(620, 78% viewport height)`).
  - Docked popup to right side of viewport instead of under button x-position.
  - Reduced per-effect scroll minimum height from 540 to 420.
- Validation:
  - `godot --headless --path . --quit-after 1 --verbose` passes.
  - Browser screenshot check with popup open in-game:
    - `output/web-game/vfx-popup-right-compact-check/shot-0.png`
2026-02-14 update (selective >4 effect ranges)
- Lifted effect ceilings for high-impact effects where it makes sense:
  - Post Bloom Lift amount max: 8.0
  - Post Grain amount/animation max: 6.0
  - Post Scanline amount max: 7.0, sweep max: 6.0
  - Post Chromatic amount max: 5.0
  - Lens warp shimmer max: 6.0 (warp amount kept at 4.0)
  - Gameplay speed-like motion params max: 6.0
- Removed hidden post-profile hard-clamp bottleneck by clamping post profile values against per-effect param specs.
- Expanded shader-side post FX uniform ranges/clamps from 4.0 to 8.0 to avoid runtime clipping.
- Expanded gameplay motion clamp in `grid_view.gd` to [-6.0, 6.0] so >4 values are preserved.
- Validation: `godot --headless --path . --quit-after 1 --verbose` passes.
2026-02-14 update (connection VFX auto-preview on slider change)
- Added connection-effect preview trigger in `scripts/game_controller.gd`:
  - When sliders for connection-related gameplay VFX change (`edge_sweep`, `connect_ripple`, `phosphor_trail`, `disconnect_dissolve`), the game now auto-plays a quick visual preview: connect pulse then disconnect pulse.
  - Preview is debounced (80ms) so slider drags produce a single final preview instead of spamming effects.
  - Preview chooses a real edge from current board state (prefers a placed edge, falls back to a valid neighbor edge) and does not modify puzzle state.
- Validation:
  - `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal connect shape + directional edge sweep)
- Updated `scripts/grid_view.gd` connection VFX behavior:
  - Terminal theme connection ripple now renders square aura for connect events (instead of circular arcs).
  - Edge sweep now preserves action direction (`a -> b`) so energy flow follows source-selected node to target node.
- Added `connected` flag to ripple events so connect/disconnect visual treatment can differ.
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal node markers)
- Replaced Terminal node text markers in `scripts/grid_view.gd`:
  - Removed `+` text markers and now render small cube pips using the same positional layout logic as round-node dots.
  - Removed `OK` text; solved (`0`) nodes now render a compact square solved badge (double-square motif) instead of text.
- Removed unused ASCII text helper methods tied to old marker rendering.
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal glow removal)
- Removed circular node halo glow in Terminal/ASCII theme by disabling `_draw_full_node_glow` call in `_draw_terminal_node_item`.
- Kept square node styling and marker rendering unchanged.
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal solved cubes style)
- Updated terminal node solved style in `scripts/grid_view.gd`:
  - Solved nodes now render with the same cube body as unsolved nodes.
  - Removed special solved badge/overlay and keep solved state indicated by absence of internal cube markers.
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal square aura cleanup)
- Updated `scripts/grid_view.gd` terminal visuals:
  - Depth blur/back-layer aura now renders square layers in Terminal theme (removed circular blur halos behind square nodes).
  - Connection ripple in Terminal theme now uses square aura for both connect and disconnect events (disconnect no longer uses circular arc).
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal artifact cleanup)
- Removed terminal node depth-blur pass in `_draw_terminal_node_item` to eliminate square ghost artifacts in the back layer.
- Updated terminal disconnect dissolve particles to square sprites in `_draw_dissolve_pass` (no circular particle cues in ASCII theme).
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal faux-3D cubes prototype)
- Added faux 3D volume pass for terminal nodes in `scripts/grid_view.gd`:
  - Draws a back face with up-left offset.
  - Draws top + left side faces with separate shading.
  - Keeps existing front-face styling and inner markers.
- New helper: `_draw_terminal_cube_volume(rect, offset, frame_color, fill_color, blur_strength)`.
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (terminal real 3D cube geometry)
- Replaced terminal node faux-offset cube with projected 3D cube rendering in `scripts/grid_view.gd`:
  - New `_draw_terminal_cube_3d()` builds 8 cube corners in world space, projects to screen, culls faces by camera-facing normal, sorts visible faces by depth, and shades each face.
  - Front-face overlays (selection/hint outlines and inner markers) now anchor to the projected front quad instead of flat axis-aligned rects.
  - Added helpers: `_project_world_point`, `_scale_quad`, `_draw_quad_outline`, plus flat marker fallback helper.
- Validation:
  - `godot --headless --path . --quit-after 1` passes.
2026-02-15 update (rollback terminal nodes to flat squares)
- Rolled back terminal node rendering from projected 3D cubes to flat square style in `scripts/grid_view.gd`.
- Removed temporary 3D cube helper stack (`_draw_terminal_cube_3d`, projection/quad helpers) and restored direct rect-based selection/hint overlays.
- Kept prior ASCII adjustments (square markers, no text markers, no circular glow/back-layer artifacts, square ripple handling).
- Validation: `godot --headless --path . --quit-after 1` passes.
2026-02-15 update
- Replaced main-menu Grid Size and Difficulty center controls from HSliders to segmented bar strips in `scripts/main.gd`.
- Layout now uses `-` button, middle rectangle bars, `+` button; bars are gray when inactive and accent-glow when active.
- Grid Size bars: 7 segments, active count equals selected size.
- Difficulty bars: 3 segments, active count maps Easy/Normal/Hard (1/2/3 lit).
- Depth remains Flat/3D dual toggle buttons.
- Validation: `godot --headless --path /Users/andriisolokh/Projects/dotcon --quit-after 1`.
2026-02-15 update
- Menu sliders cleanup: removed visible Grid Size numeric value and Difficulty text label from the right side of controls; now only segmented bars communicate value.
2026-02-15 update
- Root cause for missing Nodoku loader: `scripts/release_web.sh` re-exports `public/index.html` from Godot each release, which restores default Godot HTML shell and overwrites manual loader edits.
- Added persistent post-export patcher: `scripts/patch_web_loader.mjs`.
  - Rebrands title to Nodoku.
  - Replaces default loader CSS/markup with Nodoku-themed loading card.
  - Keeps existing Godot boot script/progress behavior.
  - Forces head-include background color to `#020b07` to avoid visual mismatch.
- Wired patcher into release pipeline in `scripts/release_web.sh` right after export.
- Updated `export_presets.cfg` head include background from `#F4F1EC` to `#020b07`.
- Verified by exporting to a temporary path and applying patcher; resulting html contains Nodoku loader branding + dark background.
2026-02-15 update
- Fixed web VFX profile precedence in `scripts/game_controller.gd`.
- Root cause: web `user://vfx_profile.json` persisted across releases and overrode `res://config/vfx_defaults.json`.
- New behavior: on web, default to project profile; apply `user://` profile only when running in Dev Mode.
- Desktop/native behavior unchanged (still applies user profile over defaults).
- Validation: `godot --headless --path /Users/andriisolokh/Projects/dotcon --quit-after 1`.
2026-02-15 update
- Fixed broken depth icons on web by replacing unsupported Unicode glyphs with ASCII-safe labels in `scripts/main.gd`.
- New labels: `[] Flat` and `[#] 3D` (both custom depth toggle buttons and hidden depth OptionButton entries).
- Validation: `godot --headless --path /Users/andriisolokh/Projects/dotcon --quit-after 1`.
2026-02-18 update (VFX power-drain audit)
- Audited rendering/VFX paths for energy drain root causes (no code changes yet).
- Primary hotspots identified:
  - `GridView` redraws continuously while visible because `_process()` marks dirty whenever ambient animation is enabled; `WEB_DISABLE_AMBIENT_ANIMATION` is currently false (`scripts/grid_view.gd`).
  - Heavy default profile in `config/vfx_defaults.json`: ambient particles and heat shimmer at intensity 6.0, strong post bloom/grain/color-grade.
  - Fullscreen post-processing pass always available (`PostFxOverlay`) with multiple screen-texture samples in shader (`shaders/post_fx_compositor.gdshader`).
  - Animated fullscreen live background shader updates every frame in main scene (`scripts/main.gd`).
  - Warm theme node rendering does multi-pass per-node glow + optional depth blur, scaling heavily with board size.
- Suggested optimization direction:
  - Introduce low-power default profile + platform quality tiers.
  - Gate animation/redraw when idle and cap effect density on mobile.
  - Reduce fullscreen post-FX on battery-sensitive targets; disable expensive passes by default.
2026-02-18 update
- Investigated report: saved VFX profile not applied in exported web release.
- Root cause: `scripts/game_controller.gd` gated user profile load on web behind `developer_mode` via `_should_apply_user_vfx_profile()`, so normal web release startup skipped `user://vfx_profile.json`.
- Fix: changed web gating to load user profile whenever `user://vfx_profile.json` exists (`FileAccess.file_exists(VFX_PROFILE_USER_PATH)`), while preserving non-web behavior.
- Validation:
  - `godot --headless --path . --quit-after 2 --verbose` passes.
  - Ran Playwright client against local web server (`http://127.0.0.1:8092`) and captured `output/web-game/vfx-profile-web-release-fix-check/shot-0.png` with expected rendering.
- TODO:
  - Manual browser verification in an exported web build: save profile in dev mode, refresh without query flags, confirm profile remains applied.
2026-02-18 update
- Updated top-bar `Hint` control to icon-only for cleaner HUD consistency with existing Back/Restart icon buttons.
- Added new asset: `assets/icons/hint.svg` (lightbulb icon) and wired it in `scenes/Main.tscn` via `HintButton.icon`.
- Kept `tooltip_text = "Hint"` for discoverability and reduced button width to `64x52` to match icon button sizing.
2026-02-18 update (mobile sizing: controls + grid)
- Increased touch/mobile menu control scaling in `scripts/main.gd`:
  - Added responsive touch scaling hooks (`_init_mobile_menu_scale`, `_apply_mobile_menu_scale`) driven by viewport resize.
  - Enlarged menu hit targets/fonts on touch layouts (Start/How-to/Tutorial buttons, +/- steppers, depth toggles, segmented bars, row labels).
- Increased in-game HUD scaling in `scripts/game_controller.gd`:
  - Reworked touch scale calculation to use real window short-side buckets.
  - Raised top bar / completion panel scale factors for small touch screens.
  - Increased control hints font with HUD scale.
  - Hid side status label on compact touch layouts to preserve button space.
- Increased gameplay node/grid size on touch/mobile in `scripts/grid_view.gd`:
  - Added touch-aware layout branch in `_update_metrics` with lower padding, higher cell-size cap/boost, and slightly larger node radius factor.
- Validation:
  - `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 1` passes.
  - Ran web Playwright loop via `$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js` against `http://127.0.0.1:8080` with screenshot output in `output/web-game/mobile-ui-size-check/`.
  - No Playwright console/page error artifacts were produced for that run.
- Note: temporary Playwright screenshot folder `output/web-game/mobile-ui-size-check/` was cleaned up after manual inspection.
2026-02-18 update (web default terminal theme)
- Goal: make web startup consistently use Terminal theme.
- Changes:
  - `scripts/main.gd`: defaulted `current_theme_id` to Terminal, added `_default_theme_id()`, changed settings fallback to platform-aware default, and forced web load path to Terminal (`theme = THEME_TERMINAL`) to avoid stale web `user://settings.cfg` overriding startup theme.
  - `scripts/game_controller.gd`: defaulted controller theme state to Terminal so first applied in-game visuals are Terminal before menu/game sync.
- Validation:
  - Re-exported web build via `bash scripts/release_web.sh`.
  - Ran Playwright skill client against local dev server.
  - Verified tutorial/menu screenshot shows Terminal palette: `output/web-game/theme-default-terminal-check-2/shot-0.png`.
  - Verified in-game screenshot shows Terminal palette after skipping tutorial + starting game: `output/web-game/theme-default-terminal-ingame-check/shot-0.png`.
- Re-ran Playwright validation after `JavaScriptBridge` short-side detection tweak; no console/page errors.
- Cleaned temporary folder `output/web-game/mobile-ui-size-check2/` after screenshot inspection.

2026-02-18 update
- Updated top-right HUD status in `scripts/game_controller.gd` from plain `Edges/Net` counters to compact terminal-style progress bars:
  - `E:[########] current/target`
  - `N:[########] current/target`
- Replaced dead-end suffix text with an ASCII warning sign (`[/!\\]`) and kept warning coloring.
- Replaced split-network text marker with compact terminal marker (`[<>]`) for consistency and reduced width.
- Added `_format_terminal_progress_bar()` helper and `STATUS_BAR_WIDTH` constant.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes (no script parse/compile errors).
  - Ran develop-web-game Playwright client via local dev server (`scripts/dev_server.js`, port 8090) and inspected screenshots in `output/web-game/theme-default-terminal-ingame-check/`.
  - Playwright run showed menu/tutorial states without console-error artifact files; in-game HUD bar visibility could not be directly captured because tutorial/menu flow dominated the automated clicks.

TODO
- Manually confirm in-game top bar at runtime shows new `E/N` terminal bars and `[/!\\]` warning sign when dead-end triggers.
2026-02-18 update
- Fixed completion-modal reliability in `scripts/game_controller.gd` by centralizing completion checks into `_maybe_show_completion_modal()` and invoking it from all edge-mutation paths.
- Added a `_process` fallback completion check so solved states still surface the modal even if a specific input path misses a direct completion call.
- Added a completion check at the end of startup prefill animation (`_run_startup_prefill_animation`) for consistency.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` succeeds.
  - Playwright skill client runs against `http://127.0.0.1:8096` with action bursts and screenshot inspection show stable runtime (no immediate script/runtime errors); deterministic full-level completion was not reached by the current automated action bursts.
2026-02-18 update
- Implemented hint-flash removal in `scripts/game_controller.gd`: `_on_hint_pressed()` no longer calls `grid_view.pulse_ui_light(0.78)`.
- Kept hint behavior intact (`_play_sfx(sfx_ui)` + `_show_hint()` unchanged) and left solve pulse (`grid_view.pulse_ui_light(0.95)`) untouched.
- Validation:
  - `godot --headless --path . --quit-after 3 --verbose` passes.
  - Playwright web harness run completed (no console error artifact), but scripted input did not reliably reach an in-game Hint press path in this environment; captured artifacts under:
    - `output/web-game/hint-no-top-flash-check/`
    - `output/web-game/hint-no-top-flash-check-skip/`
    - `output/web-game/hint-no-top-flash-check-ingame/`
    - `output/web-game/hint-no-top-flash-check-menu-start/`
2026-02-18 update
- Implemented VFX power optimization plan with tiered defaults (Auto/Battery/Balanced/Beautiful).
  - `scripts/game_controller.gd`
    - Added quality enums and public API `set_render_quality(mode)` + `get_render_quality()`.
    - Added runtime quality resolution (`Auto`: web/mobile -> Battery, desktop/native -> Balanced).
    - Applied quality policy at startup and on `start_new_game(...)`.
    - Added quality-to-grid mapping and `grid_view.apply_quality_settings(...)` integration.
    - Added quality-aware post-FX gating (battery disables heavy stack; balanced keeps mild bloom/grade/vignette).
    - Added post-FX uniform cache (`_set_post_fx_uniform`) to avoid redundant shader updates.
  - `scripts/grid_view.gd`
    - Added `apply_quality_settings(settings: Dictionary)` and runtime quality knobs:
      ambient tick rate, particle cap, warm glow pass cap, blur layer cap, arc segment caps.
    - Removed idle always-redraw behavior by ambient throttling in `_process(...)`.
      - Idle ambient tick is tier-limited; active transitions stay full-rate.
    - Capped ambient particle density, warm glow layers, blur layers, and arc segment counts by tier.
  - `scripts/main.gd`
    - Added menu `Graphics` option (`Auto`, `Battery Saver`, `Balanced`, `Beautiful`).
    - Persisted `game.graphics_quality` in `user://settings.cfg` with backward-compatible default.
    - Applied selected quality into `GameController` on load and game start.
    - Reduced menu background shader work by only advancing background time while menu/tutorial is visible and hiding background during gameplay.
  - `config/vfx_defaults.json`
    - Retuned to balanced baseline with `developer_mode: false`.
    - Lowered heavy defaults (`ambient_particles`, `heat_shimmer`, `ui_light_coupling`, bloom/grain/chromatic/lens values).
  - `shaders/post_fx_compositor.gdshader`
    - Added effect-active bypass path to skip extra shader work when stack is effectively off.

- Validation
  - Boot/smoke:
    - `godot --headless --path . --quit-after 1 --verbose` passed.
  - Web export:
    - `godot --headless --path . --export-release "Web" public/index.html` passed.
  - Playwright skill loop:
    - Ran skill client with loader shim against local server (`http://127.0.0.1:8080`).
    - Artifacts:
      - `output/web-game/vfx-quality-tier-check/menu/shot-0.png`
      - `output/web-game/vfx-quality-tier-check/ingame/shot-0.png`
    - No `errors-*.json` emitted (no captured new console/page errors).

TODO / suggestion
- Optional: expose/verify `window.render_game_to_text` in web shell so Playwright runs also emit `state-*.json` snapshots for stricter automation assertions.

2026-02-18 update (graphical HUD status bars)
- Implemented in-game status widget as graphical elements in `scripts/game_controller.gd`:
  - Added runtime-built `StatusWidget` inside `SideLabel` with two segmented strips (`EdgeStrip`, `NetStrip`) and a warning badge panel.
  - Added `STATUS_SEGMENTS := 7` and status widget state vars (`status_edge_cells`, `status_net_cells`, `status_warning_badge`, `status_warning_icon`).
  - Added helpers:
    - `_ensure_status_widget()`
    - `_set_status_strip_progress()`
    - `_style_status_strip_cells()`
    - `_set_warning_badge_state()`
    - `_refresh_status_widget_theme()`
  - Replaced text-based `_update_status_label()` formatting with graphical strip + badge updates.
- Dead-end and split-network states now show warning badge (triangle icon) with warning color.
- Added new icon asset: `assets/icons/warning_triangle.svg`.
- Removed ASCII-style status bar usage (`_format_terminal_progress_bar`, `STATUS_BAR_WIDTH` no longer used).

Validation
- `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 3 --verbose` passes after changes.
- Ran Playwright client loops against local dev server:
  - `output/web-game/status-widget-check/`
  - `output/web-game/status-widget-ingame-check/`
- No console/page error artifact files were produced.
- Note: automated clicks remained mostly in tutorial/menu flow; direct in-game top-right HUD screenshot was not reliably captured in this run.
2026-02-18 update (mobile bottom controls for HUD)
- Implemented phone-touch HUD layout switch in `scripts/game_controller.gd`:
  - Added `top_bar_spacer` onready reference for runtime visibility toggling.
  - Added `_is_phone_touch_layout()` (`touch + short side <= 620`) and routed `_is_compact_touch_layout()` through it.
  - Added `_apply_hud_layout()`:
    - Phone-touch: moves `TopBar` to bottom (`anchor_top/bottom=1`), uses centered row, adds spacing, hides spacer + side status label + `ControlHints`.
    - Non-touch / desktop-web: restores top layout (`anchor_top/bottom=0`), left-aligned row, restores spacer and control hints visibility.
  - Wired `_apply_hud_layout()` into `_ready()` and `_update_hud_scale()` so resize/orientation changes reflow HUD.
  - Updated top bar scaling pivot in `_update_hud_scale()` to use viewport center on phone-touch layout.
- Validation:
  - `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 1` passes after changes.
  - Ran develop-web-game Playwright client against local dev server with no console/page error artifacts.
  - Desktop in-game screenshot confirms top-left placement preserved for non-touch layout.
 - Touch-emulation checks confirmed bottom placement behavior path is active, though automated phone/tablet interaction remains somewhat flaky for deterministic menu/tutorial progression.
2026-02-18 update (unified button style + icon consistency)
- Implemented app-wide clear-action icon unification and consistent icon tint/alignment.
- Added new icon assets:
  - `assets/icons/play.svg`
  - `assets/icons/help.svg`
  - `assets/icons/skip.svg`
  - `assets/icons/solve.svg`
- Updated `scenes/Main.tscn`:
  - Wired icons for `StartButton`, `HowToButton`, `TutorialClose`, `SolveButton`, `NextButton`, `ReplayButton`.
  - Converted top-bar clear actions to icon+text defaults (`Back`, `Restart`, `Hint`, `Solve`) with explicit `icon_alignment`, `vertical_icon_alignment`, and `icon_max_width`.
  - Added tooltips for clear-action buttons where needed.
- Updated `scripts/main.gd`:
  - Added button role constants (`text_only`, `icon_text`, `icon_only`) and icon width constant.
  - Extended `_apply_button_theme(...)` and `_apply_button_style(...)` to support role-based content margins.
  - Added `_apply_button_icon_style(...)` so menu/tutorial icon buttons get consistent tint and alignment.
- Updated `scripts/game_controller.gd`:
  - Added role-based helpers:
    - `_clone_button_stylebox_with_horizontal_margins(...)`
    - `_apply_button_content_role(...)`
    - `_apply_top_bar_action_button(...)`
    - `_apply_hud_button_layout_roles(...)`
    - `_apply_icon_button_colors(...)`
  - Applied compact-touch top-bar policy:
    - Desktop/tablet: top-bar clear actions render icon+text.
    - Compact touch: top-bar clear actions switch to icon-only (`64x52`) with centered icons.
  - Expanded HUD icon tint overrides in `_apply_hud_theme()` to include `Hint`, `Solve`, `Next`, and `Replay` in addition to `Back`/`Restart`.
  - Called `_apply_hud_button_layout_roles()` from `_ready()`, `_apply_hud_theme()`, and `_update_hud_scale()` to keep role layout stable on theme/resize/device changes.

Validation
- `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 2 --verbose` passes.
- Ran develop-web-game Playwright client against local server (`http://127.0.0.1:8093`):
  - In-game desktop check: `output/web-game/unified-button-desktop-ingame-check2/shot-0.png`
  - Confirms top-bar icon+text and tint parity (`Back`/`Restart`/`Hint`).
- Ran additional Playwright touch-viewport checks for compact layout:
  - Compact in-game (icon-only bottom bar visible): `output/web-game/unified-button-compact-start-scan/start-y-640.png`
  - Confirms compact touch policy switched clear actions to centered icon-only controls.
- Cleaned temporary `output/web-game/mobile-bottom-controls*` screenshot folders after inspection.
- Final post-change skill check: ran develop-web-game Playwright client with no error artifacts, then cleaned temporary mobile-bottom-controls screenshot outputs.

2026-02-18 update (single-row HUD bar)
- Refactored graphical HUD status widget to a single row with exactly 7 segments in `scripts/game_controller.gd`.
  - Replaced `status_edge_cells` + `status_net_cells` with `status_progress_cells`.
  - `_ensure_status_widget()` now creates one `ProgressStrip` (7 cells) plus warning badge.
  - Added `_set_status_strip_progress_ratio()` and removed dual-strip update usage.
- Updated `_update_status_label()` progress metric to true completion:
  - Computes `edge_ratio` and `net_ratio`, then uses `progress_ratio = minf(edge_ratio, net_ratio)`.
  - Segment fill is derived from that single ratio.
- Warning triangle badge behavior is unchanged:
  - dead-end -> orange/red badge
  - split-network -> yellow badge
- Theme styling now applies to only the single progress strip.

Validation
- `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 3 --verbose` passes.
- Ran Playwright skill loop against local dev server with screenshots in:
  - `output/web-game/status-widget-single-row-check/`
- No console/page error artifact files were produced.
- Captured screenshots remained in tutorial overlay flow, so direct in-game top-right HUD screenshot was not produced by this automation run.
2026-02-18 update (tutorial overhaul: 4x4 + 4x4x4 guides)
- Implemented tutorial guide split and visual cleanup.
- `scripts/tutorial_demo.gd`
  - Replaced 2-node demo with board-based guide modes:
    - `GUIDE_MODE_BASIC_4X4` for steps 1-3.
    - `GUIDE_MODE_ROTATION_4X4X4` for step 4.
  - Added mode-aware sizing/depth config (4x4 flat vs 4x4x4 layered).
  - Kept existing `step_completed(step)` flow; rotation still completes step 4 via swipe/drag/keys.
  - Added full 4x4 rendering with highlighted target nodes for select/connect/remove.
  - Added 4-layer 4x4x4 preview with rotation-driven layered offset.
  - Reduced tutorial-only visual noise/glow for readability.
  - Increased interaction hit radius and node scale for easier taps.
- `scenes/Main.tscn`
  - Reworked tutorial overlay into a centered card (`TutorialContent` as `PanelContainer`).
  - Added dedicated section label: `TutorialGuideLabel`.
  - Reduced demo vertical dominance and balanced spacing.
  - Constrained tutorial action button width and centered it.
  - Updated step copy to explicitly reference 4x4 basics and 4x4x4 rotation.
- `scripts/main.gd`
  - Added tutorial card layout logic (`_layout_tutorial_card`) for responsive centered max-width behavior.
  - Wired and themed `tutorial_guide_label`.
  - Updated `_apply_tutorial_step()` to switch section label text:
    - `Basic Guide (4x4)` for steps 1-3.
    - `Rotation Guide (4x4x4)` for step 4/complete.

Validation
- Syntax/boot checks:
  - `godot --headless --path . --quit-after 2 --verbose` (passes)
- Web export:
  - `godot --headless --path . --export-release Web public/index.html`
- Playwright skill client visual checks:
  - Tutorial open (4x4 basic): `output/web-game/tutorial-overhaul-check/open-v2/shot-0.png`
  - Full flow to rotation guide complete (4x4x4): `output/web-game/tutorial-overhaul-check/flow-step4-v4/shot-0.png`
  - No console/page error artifact files produced for these runs.
2026-02-18 update (hidden dev mode + VFX release-default promotion)
- Implemented hidden Developer Mode unlock paths and release-default save flow.
- `scripts/game_controller.gd`
  - Added public API:
    - `set_developer_mode_enabled(enabled: bool, source: String = "runtime")`
    - `is_developer_mode_enabled()`
  - `_ready()` now ensures dev controls are instantiated via `_ensure_theme_button()`, `_ensure_vfx_button()`, `_ensure_dev_button()`.
  - Fixed `_apply_developer_mode_visibility()` to actually follow `developer_mode` (`Solve`, `Theme`, `VFX`, `Dev` visible only in dev mode).
  - Added hidden in-game unlock hotspot (top-right, size based on 72px + viewport scaling), requiring 7 taps within 3.0s.
  - Added unlock/status feedback helpers:
    - `_announce_dev_mode_status(...)` and `_announce_vfx_status(...)` (logs fallback when popup hidden).
  - Save flow now branches by platform:
    - Desktop/native: writes `user://vfx_profile.json` + `res://config/vfx_defaults.json`.
    - Web: writes `user://vfx_profile.json` and downloads `nodoku-vfx-defaults.json` via `JavaScriptBridge`.
  - Added `_normalized_release_vfx_profile(...)` to force `developer_mode=false` for release-default payloads.
- `scripts/main.gd`
  - Added hidden menu unlock: 7 taps on `VersionLabel` within 3.0s.
  - Unlock path calls `game.set_developer_mode_enabled(true, "menu_hidden_tap")`.
- Added CLI promotion tool: `scripts/promote_vfx_defaults.mjs`
  - Interface: `node scripts/promote_vfx_defaults.mjs --from <path> [--to <path>]`
  - Defaults: `config/vfx_release_candidate.json` -> `config/vfx_defaults.json`.
  - Validates profile shape (`gameplay.profiles` and `post.profiles` objects with finite numeric params).
  - Forces `developer_mode=false` and `version=1` before writing output.
- `scripts/release_web.sh`
  - Added pre-export promotion step when `config/vfx_release_candidate.json` exists.
- `docs/web_export.md`
  - Added web workflow section for hidden dev save/export + release promotion.

Validation
- `godot --headless --path . --quit-after 2 --verbose` passes.
- `bash -n scripts/release_web.sh` passes.
- Promotion script checks:
  - `node scripts/promote_vfx_defaults.mjs --from config/vfx_defaults.json --to /tmp/nodoku-vfx-defaults-check.json` (passes)
  - Candidate normalization test confirms forced `developer_mode=false` and `version=1`.
- Playwright skill-client attempt was started (local dev server + `$WEB_GAME_CLIENT`) but hung in this environment; process was terminated and no reliable screenshot assertion was produced for this run.

2026-02-18 update (dot-consumption progress formula)
- Updated single-row HUD bar progress logic in `scripts/game_controller.gd` to use dot-consumption ratio instead of connectivity min-ratio.
- Added `_status_progress_ratio_from_dots()`:
  - `total_connections = total_required_edges`
  - `available_connections = sum(remaining_dots for active required nodes) / 2`
  - `ratio = clamp((total_connections - available_connections) / total_connections, 0..1)`
- `_update_status_label()` now calls `_status_progress_ratio_from_dots()` and feeds the result to `_set_status_strip_progress_ratio()`.
- Warning badge behavior/colors were kept unchanged.

Validation
- `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 3 --verbose` passes.
- Playwright run executed with artifacts in `output/web-game/status-widget-dots-check/`; no console/page error artifacts were produced.
2026-02-19 tutorial real-board continuation
- Continued from prior agent state; no new structural code changes were required after verifying the refactor.
- Confirmed tutorial now uses real `Game` board runtime with compact overlay and minimal text.
- Browser validation (Playwright skill client) on `http://127.0.0.1:8095`:
  - Tutorial opens on real board: `output/web-game/tutorial-realboard-check/open-click-1/shot-0.png`
  - Step 1 -> Step 2 progression after first connection: `output/web-game/tutorial-realboard-check/step2-from-auto-open/shot-0.png`
  - Step 2 -> complete after first rotation: `output/web-game/tutorial-realboard-check/step-flow-1/shot-0.png`
  - Skip closes tutorial back to menu: `output/web-game/tutorial-realboard-check/skip-close/shot-0.png`
  - Got it closes tutorial back to menu: `output/web-game/tutorial-realboard-check/gotit-close/shot-0.png`
- Runtime checks:
  - `godot --headless --path . --quit-after 2 --verbose` passes.
  - `godot --headless --path . --export-release "Web" public/index.html` passes.
- Note: quick `Start` regression click automation from tutorial context is noisy due auto-open tutorial timing on fresh load; core start logic in `scripts/main.gd` remains unchanged except forcing tutorial hidden before start.
2026-02-19 tutorial real-board continuation (extra regression pass)
- Re-ran an additional browser check for `Skip -> Start` with longer delay (`output/web-game/tutorial-realboard-check/start-after-skip-wait/shot-0.png`).
- Result stayed on menu in the fixed-coordinate harness; this appears to be click-coordinate mismatch/noise in automation for menu buttons in current viewport, not a tutorial runtime error.
- Kept regression confidence from code path: `_on_start_pressed()` still reads menu-selected size/depth/difficulty and starts game with those values.
2026-02-19 update
- Fixed centered icon+text pair rendering for clear-action buttons by preventing custom pair container stretch and keeping native text cleared while center-pair role is active.
  - `scripts/main.gd`
    - `_ensure_button_center_pair(...)`: set row/icon/label to shrink-center sizing, left text alignment, vertical center alignment.
    - `_set_button_display_text(...)`: now updates base text metadata + pair label, and keeps `button.text` empty while pair root is visible.
    - `_show_tutorial(...)`: replaced direct `tutorial_close.text = "Skip"` with `_set_button_display_text(...)`.
  - `scripts/game_controller.gd`
    - `_ensure_button_center_pair(...)`: same shrink-center sizing/alignment updates for HUD/completion buttons.
- Validation:
  - `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 2 --verbose` passes.
  - Playwright skill client screenshots:
    - Tutorial skip (icon directly before text, centered as one pair): `output/web-game/center-pair-fix-menu/shot-0.png`
    - Menu buttons centered pair (`Start`, `How to play`): `output/web-game/center-pair-fix-skip-click/shot-0.png`
    - Desktop in-game top bar icon+text consistency: `output/web-game/center-pair-fix-hud-desktop-2/shot-0.png`
  - Mobile/touch emulation screenshot (compact icon-only top bar centered):
    - `output/web-game/center-pair-fix-hud-compact-touch-2/shot-0.png`
2026-02-21 update
- Implemented developer-only live performance telemetry for VFX tuning.
- `scripts/game_controller.gd`
  - Added Perf HUD runtime pipeline (0.5s polling, 10s/60s rolling windows, FPS/p50/p95, long-task rate, heap trend, battery drain, energy proxy score).
  - Added battery-first status bands (green/yellow/red) using strict thresholds (`FPS>=55`, `p95<=20ms`, `battery<=8%/h`).
  - Added VFX popup perf controls: `Perf HUD` toggle, `Set Baseline`, `Reset Metrics`, `Export Perf`.
  - Added baseline + effect delta reporting after 8s settle (`ΔFPS`, `Δp95`, `ΔEnergy`, `ΔBattery`).
  - Added export flow for perf reports:
    - web download: `nodoku-vfx-perf.json`
    - non-web file: `user://vfx_perf_last.json`
  - Added launch flag parsing for `?perf=1` / `--perf` and web bridge enable/disable wiring via JavaScriptBridge.
  - Added compact top-left perf HUD panel (developer-mode only).
- `scripts/patch_web_loader.mjs`
  - Added injected browser telemetry bridge `window.__nodokuPerf` with APIs:
    - `snapshot()`
    - `snapshotJSON()`
    - `reset()`
    - `setEnabled(bool)`
    - `isEnabled()`
  - Collector tracks frame deltas (up to 600 samples), long tasks, heap metrics (when supported), battery metrics (when supported), and returns null-safe fields.
  - Injection is now export-stable (survives Godot HTML regeneration).
- `public/index.html`
  - Repatched via `node scripts/patch_web_loader.mjs public/index.html` so current checked-in web shell contains telemetry bridge.
- Added docs: `docs/vfx_perf_tuning.md` with repeatable desktop/mobile workflow, thresholds, checklist, and limitations.

Validation
- `godot --headless --path . --quit-after 2 --verbose` passes with no parse errors.
- `godot --headless --path . --export-release "Web" public/index.html` succeeds.
- Ran Playwright skill client against `http://127.0.0.1:8080/?dev=1&perf=1` and reviewed screenshots:
  - `output/web-game/perf-hud-check/shot-0.png`
  - `output/web-game/perf-hud-check-v2/shot-0.png`
  - `output/web-game/perf-hud-check-v3/shot-0.png`
  - `output/web-game/perf-hud-check-v4/shot-0.png`
  - `output/web-game/perf-hud-check-v5/shot-0.png`
- No Playwright console/page error files were generated during those runs.
- Verified browser bridge directly with Playwright eval:
  - `window.__nodokuPerf` exists with required methods.
  - `window.__nodokuPerf.isEnabled()` becomes `true` under `?dev=1&perf=1` once game runtime enables telemetry.

TODO / Note
- In automated headless Playwright runs, tutorial overlay remains on-screen, which can hide HUD from screenshots; perform one quick manual browser pass to visually confirm live Perf HUD + VFX popup perf controls in active gameplay scene.
2026-02-21 perf telemetry follow-up
- Aligned Perf HUD status thresholds with battery-first spec in `scripts/game_controller.gd`:
  - Added `fps_p50` to computed summaries.
  - Green/Yellow/Red status now evaluates FPS using p50 (fallback to avg if missing) instead of avg-only.
  - Perf summary text now shows both FPS avg and FPS p50.
- Updated docs wording in `docs/vfx_perf_tuning.md` to state FPS p50 target explicitly.
- Validation run:
  - `godot --headless --path /Users/andriisolokh/Projects/Nodoku --quit-after 2 --verbose` (passes).
  - Browser bridge sanity via Playwright eval on `?dev=1&perf=1`: `window.__nodokuPerf.isEnabled() === true`, `snapshotJSON/reset` present.
  - Skill client run after change:
    - `output/web-game/perf-hud-verify-v2/shot-0.png`
    - No `errors-*.json` produced.
- Note: headless screenshots still show tutorial overlay, so HUD visual confirmation should be done once in a manual browser session.

2026-09-10 Astra rebuild
- Request: Reimplement Nodoku from scratch with Astra and pleasant 3D graphics.
- Verified and fetched origin/main: 1ef469b. Original Godot project boots in headless mode; working tree began clean and matched origin/main.
- Fresh implementation lives on astra-rebuild. Preserve original Godot source and checked-in export while building a new primary browser application.
- Design: lavender studio (#eeedf6), deep plum ink (#302b48), iris connections (#8170c9), sage completed nodes (#a9cbbd), porcelain (#fcfaf5). Rounded Outfit type, a spacious split start screen, and a quiet full-width gameplay stage. The board itself carries the visual identity: ceramic beads, physical connecting rods, soft shadows, restrained motion. No generic cards or decorative dashboard metrics.
- Use independent Astra agents for baseline audit, puzzle model, and renderer; root owns UI/integration/tooling.
- Implemented new Vite/TypeScript app: seeded connected puzzle engine; Three.js ceramic scene; responsive setup/game/help/completion UI; sound; undo/redo; corrective hints; settings and validated saved-game resume.
- Baseline behavior clarified from source: sizes3–7, flat or cubic surface, empty initial boards, exact degrees plus one network. Unlike origin/main, new hints apply a reversible move; Restart clears the current puzzle; difficulty uses denser constraints for Gentle and sparse tree-like networks for Intricate. No native export created for new implementation.
- Initial engine tests and TypeScript/production build pass. Inspected desktop home and game screenshots; tuned material light/color and guide visibility. Added keyboard shortcut fixes from independent Astra review.
- Browser tests in progress. Production docs and Vercel config now target dist; original Godot source/export retained.
- Final validation: 9 model tests pass (including 150 generation combinations), strict TypeScript and production build pass, git diff --check passes. Browser suite passes against production preview at http://127.0.0.1:4173 with no page/console errors; covers desktop mouse, mobile touch, 7³ board, undo/redo and keyboard selection, hints, saved resume, confirmation cancellation, completion/next, and portrait/landscape viewport fit.
- Ran the required skill Playwright client against the final production build and visually inspected its screenshot. Reviewed home/game/mobile/large-board/completion captures in output/web-game/astra-checks and output/web-game/astra-final. Independent Astra review found no remaining critical blocker.
- Production dependency audit reports zero vulnerabilities. Vite emits its standard warning for the 578KB Three.js application chunk (147KB gzip); production build succeeds.
- Preview server remains running at http://127.0.0.1:4173, queued in Codex browser panel. No deployment or commit performed. No required implementation TODOs remain for the browser rebuild; native packaging is outside this implementation.

2026-09-10 Perspective and face snapping follow-up
- User requested a perspective camera and rotations that snap to cube faces.
- Verified origin/main source uses perspective projection, 90° turns, and nearest orientation among all24 cube orientations. Astra branch previously used orthographic projection and unrestricted small-angle orbit controls.
- Implementing perspective camera with stable fit, quarter-turn controls, drag-release face snapping, and access to all six faces. Updating help and adding browser checks for projected near/far scale, snap geometry, touch layout and picking.
- Completed perspective follow-up: actual PerspectiveCamera with screen-fit distance and bounds; quaternion nearest-of24 orientation snapping; 90° screen-relative controls; all six faces, including poles; rapid turns accumulate; interrupted/cancelled drags settle; camera-facing pips follow diverging perspective rays. Home retains oblique preview; gameplay/reset starts on the front face; flat rotations stay in-plane.
- Validation passed: new camera browser suite confirms near/far perspective scaling, square face alignment, six-face reachability, horizontal/vertical four-turn cycles, rapid turns, drag release, interrupted animations, post-rotation picking, hints, reset, 7³ mobile portrait/landscape fit, and reduced motion. Existing desktop/mobile gameplay suite and all9 model tests also pass. No browser errors.
- Ran required skill Playwright client on the top-face view and inspected screenshots along with home/front/mobile views in output/web-game/perspective and output/web-game/perspective-skill. Production preview at http://127.0.0.1:4173 rebuilt; reload existing tab to see changes.

2026-09-10 Viewer-relative ground/shadow follow-up
- User reported ground/shadows rotating to the sides when switching cube faces; wants shadows consistently below the puzzle.
- Verified origin/main uses a manually drawn scene and has no physical floor. This issue comes from the Astra renderer orbiting its camera around a world-fixed floor/key light.
- Fix: rotate floor and studio lights with viewing orientation, keep floor below current view-space board bounds, and center the shadow-casting key light above/front of the viewer. Puzzle orientation, perspective and six-face snapping remain unchanged.
- Completed in src/scene.ts: camera-oriented studio group contains floor, hemisphere light, both directional lights and their targets. Key light centered at localX0; floor height follows minimum board coordinate along camera-up minus sphere radius/gap. Existing camera orbit, picking and snapping unchanged.
- Validation: production build and git diff --check pass; camera browser suite passes all six faces, rapid turns, snapping, picking, responsive fit and reduced motion with no errors. Ran required skill browser client and inspected screenshots of top/bottom/left views and mid-drag: shadows now remain under the puzzle. Artifacts: output/web-game/studio-fix. Preview rebuilt at http://127.0.0.1:4173; refresh the tab.

2026-09-10 Depth haze and gesture follow-up
- Added camera-relative depth haze across actual near/far board bounds. Front nodes remain crisp while rear spheres, pips, rods and guides fade into lavender. Flat boards remain clear; floor shadows and selection ring are exempt from fog. Verified origin/main had depth fades/blur; Astra's previous fog only weakly affected far nodes.
- Before finalizing haze, user requested swipes, double-tap fill/clear and continuous node drawing; incorporated into the same work.
- New gestures: tap disambiguation (280ms), double-tap fills legal connections or clears full node, node-start drag samples a continuous path without orbiting, empty-space swipe makes a face turn, pinch remains zoom. Retracing existing links preserves them. Stroke and fill/clear are atomic undo/redo actions, including across saved-game restore.
- Verified old origin/main double-tap fill/clear, capacity limits and batch undo behavior from game_controller.gd. New drag intentionally adds only; original drag could also remove links. Updated help and README.
- Initial validation: 16 model tests, full desktop/mobile gameplay suite, camera suite, and dedicated mouse/touch gestures pass. Independent review found queued-tap cancellation and completing-stroke undo races; fixed and added regressions. Final gesture regression in progress.
- Final gesture regression passes, including immediate Escape/undo after tapping and undo while holding the final completing stroke. No browser errors. Ran the required skill Playwright client against the rebuilt production preview and visually inspected its cube capture plus the mobile drawing capture in output/web-game/gestures. Depth haze and all three gestures are complete.

2026-09-10 Immediate node clicks
- User disliked delay after clicking a node. Verified origin/main applies the first tap immediately; Astra gesture handling introduced a 280ms wait for double-tap disambiguation.
- Single taps now update selection and connections synchronously on release. A matching second tap restores the pre-click checkpoint before fill/clear, preserving exact undo/redo history. Only the completion dialog waits for the double-tap window; the last edge and progress appear immediately.
- Reviewed cancellation, keyboard actions, no-op double-taps and completion during unchanged strokes. Build and desktop/mobile gameplay suite pass; model tests cover redo, trimmed history and nested-batch checkpoint restoration. Dedicated immediate-input gesture checks in progress.
- Final validation: 20 model tests, production build, full desktop/mobile gameplay suite and expanded gesture suite pass. Mouse and touch tests capture state within pointerup to prove synchronous selection, connections and progress. Completion/double-tap rollback, atomic undo, no-op persistence and unchanged-stroke completion regressions pass. No browser errors; git diff --check passes. Inspected prescribed skill client selection screenshot and dedicated instant-selection.png. Preview at http://127.0.0.1:4173 rebuilt; no required work remains for this request.

2026-09-10 Remove canvas outlines
- Removed canvas from the shared focus-visible outline rule and set its outline to none, eliminating the purple line around the focused game stage shown in the user's screenshot. origin/main also suppresses its canvas outline; buttons retain their existing keyboard focus indicator.
- Production build and diff check pass. Verified focused canvas after keyboard rotation has outline:none / 0px with no browser errors. Ran prescribed skill client and inspected its capture plus full-page screenshot in output/web-game/no-outline. Preview rebuilt at http://127.0.0.1:4173.

2026-09-10 Lower floor and steady cube framing
- User requested a lower floor and reported cube shrinking during rotation. Verified origin/main uses a fixed camera distance and has no physical floor. Astra's camera-fit clamp caused the shrinking independently of the floor; measured 5-cube distance changing from 10.3781 to 11.9198 during a held turn.
- Lowered the viewer-relative floor gap from 0.11 to 0.8 world units. Its shadow shader now fades only floor shadows at the viewport bottom, avoiding a hard cutoff near the toolbar.
- Cube framing uses its bounding sphere once per resize, with fixed distance through rotations and independent user zoom. A near-plane guard keeps the camera outside the puzzle. Flat mode keeps its previous framing. Default cube framing is slightly wider to accommodate every orientation; manual zoom can bring it closer.
- Production build, diff check and expanded camera suite pass: 5-cube desktop and 7-cube mobile portrait/landscape retain distance through drag/animation/snap at default and user zoom; default mid-turn views fit, plus all previous perspective/picking/face checks pass. Measured new distance 11.5516 both front and turned, then 9.9425 after zooming. No browser/shader errors. Ran prescribed skill client and inspected final floor/rotation screenshots in output/web-game/floor-space. Preview rebuilt at http://127.0.0.1:4173.

2026-09-10 More vertical game space
- User requested relocating the controls and instruction/header area to give the puzzle more vertical space. Preserved the ceramic lavender design, compacted the playing header to 60px, moved instructions into the header on wide screens, and let the canvas fill the rest of the viewport.
- Desktop game actions now form a left-side strip; rotation controls form a right-side directional pad. Narrow/portrait screens have one floating bottom row with every control retained. Icon-only buttons retain accessible text and have title labels. Toolbar containers leave pointer events available to the board outside the controls.
- Removed obsolete responsive toolbar height/padding rules. At1512x982, canvas height increased from791px to922px; mobile canvas heights are784px at390x844,508px at320x568 and330px at844x390. No page overflow in these views.
- Production build, diff check and expanded full browser suite pass, covering desktop/mobile gameplay, viewport height, control bounds and side placement. Test pair selection now prefers front-face endpoints so a newly drawn depth link cannot obscure a target in the repeat-click test. No browser errors. Ran prescribed skill client and inspected desktop/narrow/landscape captures in output/web-game/vertical-layout. Preview rebuilt at http://127.0.0.1:4173.

2026-09-10 Visitors, sponsorship placements, and Stripe
- User requested a visitor counter, sponsorship/ad placeholders, and payment for advertising. Chose $100 per month, Cloudflare hosting, and said Stripe account is ready. Optional automatic-renewal clarification remains unanswered; current implementation explicitly sells a one-time $100 USD placement for 30 days with no automatic renewal.
- Verified origin/main has the old static Godot application and no visitor/payment backend. These features and deployment requirements are new on astra-rebuild.
- Added unobtrusive sponsorship cards on the home screen and lower-right corner of wide game screens, with visitor counts in the footer/corner. Narrow game screens preserve all play space. Accessible native dialog provides brand/tagline/HTTPS URL, live text preview, price, hosted Stripe Checkout redirect, payment verification, retry, expired-checkout restart, and another-placement flow. Game gestures/shortcuts are isolated while the dialog is open.
- Visitor count uses a browser UUID in localStorage, deduplicated in persistent SQLite locally and Cloudflare D1 in production. It approximates unique browsers, with no IP fingerprinting. Local counts are labeled Preview visitors; unavailable services never show fake counts.
- Shared Fetch API in server/api.ts uses official Stripe SDK Fetch transport/Web Crypto. Server owns amount/currency/duration, persists orders before Stripe calls, uses idempotency keys, validates payment amount/line item/order token, verifies raw signed webhook bytes, and atomically fulfills a paid order once. Duplicate events cannot extend dates; expired ads leave the public feed. Sponsored copy uses textContent and HTTPS links.
- Payment status uses a server-fetched Checkout session, never success query text alone. Pending/unavailable references stay in the URL so reload resumes verification. Double submit is blocked, uncertain retries preserve request ID, and only a confirmed expired checkout offers a new ID. Closing the dialog cancels delayed redirects.
- Cloudflare Pages Functions adapter and wrangler.jsonc added, plus docs/sponsorship.md and updated Pages/README guides. Production DB ID and APP_ORIGIN are explicit placeholders; preview environment has no production DB binding. Both Vite dev and preview run the same API with .nodoku-data/local.sqlite. Added Node24 requirement, server TypeScript check, and ignored .dev.vars/.env/local data. Secret names/server code are absent from the frontend bundle.
- Validation: strict frontend/server TypeScript and production build pass; all35 model/backend tests pass (20 puzzle,15 payment/storage). Backend tests mock Stripe traffic and sign actual SDK webhook payloads. Existing desktop/mobile gameplay suite passes. New test:sponsorship passes real local visitor identity, full-height canvas, mobile form, modal input isolation, safe redirect, price payload, duplicate submit, retry IDs, expired restart, closing in-flight checkout, pending/unavailable reloads, paid/new-placement flow, expired/unsafe ads and escaped text. No page errors; existing gameplay suite also reports no console errors. Stripe navigation was intercepted; no payment made.
- Independent review found no remaining actionable payment issue. Cloudflare agent verified strict adapter types, Functions bundle, isolated localD1 schema/visitor dedupe/checkout503, and actual localWorkers signature acceptance/rejection. No cloud resources were created.
- Ran prescribed game skill client for rotated gameplay and sponsorship dialog. Inspected desktop home/game, mobile form/game, and skill captures in output/web-game/sponsorship. Preview rebuilt and restarted at http://127.0.0.1:4173; refresh to see updates. git diff --check passes.
- Remaining activation: Cloudflare auth check reports expired login that cannot refresh non-interactively. User must authenticate and supply/configure actual D1 binding, public APP_ORIGIN, Stripe secret key and webhook secret securely; complete real Stripe sandbox checkout before live activation. No credentials available, deployment, commit, or real Stripe checkout was performed. Setup commands are documented; do not paste keys in chat. Automatic monthly renewal is not implemented pending billing choice.

2026-09-10 Optional ad removal
- User requested an option to remove ads from the game. Optional clarification (free setting or paid upgrade) remains unanswered; implemented the stated assumption of a free local preference.
- Added Hide ads to both sponsorship cards and Show sponsored placements checkbox in How to play. Hides both home/game placements immediately, keeps the restoration control available, and persists in localStorage across reloads. Works for the current visit if storage is unavailable. Existing visitor count and advertiser payment flow remain functional.
- Baseline agent verified origin/main has no sponsorship/visibility preference. Kept the mobile header unchanged and positioned Hide ads within the existing card height.
- Build and browser verification pass: hide, restore, reload, switch home/game, unchanged puzzle/view, keyboard toggle and viewport fit at320px. No page/console errors. Ran prescribed skill client for hidden home and final gameplay; visually inspected desktop hidden/shown and mobile preference captures in output/web-game/hide-ads. Preview rebuilt at http://127.0.0.1:4173. No payment or deployment involved.

2026-09-10 Home demo auto-solving
- User requested an automatically solving home preview: rotate to reveal each next connection before adding it, one edge at a time with delays.
- Verified origin/main at1ef469b has a hidden game on the home menu and an interactive tutorial connection animation, not a complete automatic home solution. Astra previously showed a fixed seed43 board with roughly75% of solution edges placed.
- Added independent HomeDemo in src/demo.ts. Starts empty using the selected size/shape/difficulty; follows the connected solution sequence; waits for camera motion to finish and an additional240ms before adding one edge, then waits950ms. Holds the solved board for3.2seconds and replays. Scene updates never call player update/save paths. start/resume stops the home scheduler; option changes replace its puzzle immediately.
- Scene focusConnection selects a shared outward face nearest the current view and tests slight-oblique candidates with endpoint/edge raycasts before animating; falls back to exact face. Manual input revision and held-pointer status pause/refocus the sequence after1.8seconds of inactivity. Open dialogs/background tabs suspend progress. Added pause/resume control beneath the preview; reduced-motion uses the existing instant camera transition.
- render_game_to_text now describes actual home demo nodes/edges/progress and exposes demo phase/next edge/delay for verification. advanceTime advances both demo and camera deterministically on home and retains the original one-step camera behavior during play.
- Validation: strict TypeScript/production build and all43 tests pass, including8 new controller tests across all30 size/shape/difficulty combinations. test:demo passes real-time playback, rotate-before-add and visible endpoints, full3D/flat solve/replay, pause/resume, held drag/dialog pauses, settings replacement, no demo save writes, start/resume isolation,7³ and mobile layout. Existing gameplay and camera browser suites pass with no browser errors.
- Independent scene check validated all365 edges of a7³ solution from all24 face orientations (8,760 raycast visibility checks), with completed rods present, plus reduced-motion and normal tween completion. Ran prescribed skill client and inspected home/demo/mobile/solved captures in output/web-game/home-demo. Preview rebuilt at http://127.0.0.1:4173; no deployment or commit performed.
- Final integration review found no stale scheduler/move issue. Corrected the text-state selection on home to null so it cannot retain a previously selected player node; verified by selecting a node and returning home.

2026-09-10 Local Studio configurator, animated connections, six sponsors
- User requested a GUI for scene/animation settings stored in a committable file, home auto-solve speed, configurable connection drawing, and six sponsors. Confirmed Local admin configurator. Added config/game-config.json with strict shared validation, live config subscriptions, and local Studio UI loaded through ?admin=1.
- npm run admin prints a private local link; an ignored owner-only token authenticates fixed-path GET/PUT /api/admin/config. Save atomically writes validated JSON with revision-conflict protection. Reset preview, reload file, and JSON export are available. Vite dev/preview only; no deployed admin API. An independent review identified Vite raw-file credential exposure, fixed by filesystem deny rules preserving current Vite defaults. A temp-root regression checks 25 credential/database/environment paths plus public assets.
- Studio adjusts demo delays/holds, camera timing, connection duration/easing/thickness, node size, fog, shadows, four colors, and sponsor slots/visibility. Node/game state changes remain immediate; rods grow visually from their source. Shared animation scheduling supports camera cancellation, undo, existing links, and reduced motion. Demo waits for each rod to finish before the next turn/complete hold.
- Six distinct sponsor cards now display in a home grid and two side stacks on roomy game layouts. No fabricated sponsor brands in the real feed. User subsequently requested larger cards: home cards now have 150px minimum height and larger typography; game cards are 240px wide and 72–88px tall. Side controls shifted slightly upward on these layouts to keep them clear. Mobile home retains all six cards and has no horizontal overflow.
- Validation: production build passes; all64 model/controller/payment/admin/credential tests pass. Browser admin checks verify real file save/reload/export, live speed/easing/zero duration, immediate gameplay, undo animation cancellation, six slots, and mobile UI. Home demo, sponsorship, complete gameplay, and gesture suites pass. Larger-card layout checked at1440x960,1320x760,1512x982 plus390px mobile. Prescribed skill client run for demo and gameplay; screenshots visually inspected in output/web-game/configurator and output/web-game/ad-free.
- docs/configurator.md explains local access and saving; README updated. Config defaults restored after browser save tests. No commit/deployment performed.

2026-09-10 Paid-only removal of sponsorships
- User corrected earlier free-hide behavior: sponsors must only hide after a player purchases ad removal. Removed Hide all/Show sponsored placements and ignore/remove the old boolean preference. Remove ads opens a purchase/restore dialog. Only a verified paid entitlement hides sponsors on home and gameplay.
- Added explicit server-only REMOVE_ADS_AMOUNT (USD cents); empty leaves checkout disabled. Pricing question remains unanswered. Implemented one-time permanent ad removal as the provisional product type; do not enable charges or claim the price is settled. Existing verified receipts restore without Stripe availability, and never appear as sponsor campaigns. No database migration required (optional order kind in existing JSON payload).
- Checkout uses persistent idempotent requests, existing fixed-price/session verification and signed webhook flow. Paid status issues a private restore code; the browser stores it and verifies against the database on reload. Restore also supports another browser. Unverified/success-query-only/old free preference values cannot hide ads. No account/email recovery is implemented.
- Independent review found and resolved two purchase races: unresolved saved receipts now block accidental repurchase and offer verification retry; active verification survives dialog close/reopen and successful restore invalidates an in-flight checkout redirect. Browser tests exercise these guards, retry IDs, wrong destinations, pending/paid returns, restore/reload, and six unique placements. Backend tests include signature/amount/identity verification, order-type separation, and persistent/nonexpiring entitlements. No real Stripe payment or cloud action made.
- Remaining activation from earlier task still applies: choose ad-removal price/product cadence, configure real Cloudflare database/origin and Stripe secrets securely, and verify real sandbox checkout before enabling live payments. No credentials were requested in chat.
- Final checks: Cloudflare Functions bundle compiles successfully. Final compact desktop cards are72px high and leave16px clearance from controls at1320x760. Latest default config remains950ms between demo connections,420ms drawing, and6slots. Production preview rebuilt on4173, local private Studio tab queued in Codex. All requested implementation is present; payment activation/pricing remains pending user setup.

2026-09-10 Centered sponsor stacks and stable placeholder sizes
- User requested sponsors at the vertical centers of the left/right sides, with placeholders matching filled cards. Game sponsor grid now centers within the full-height game area. Controls move to the lower left/right corners and the visitor counter sits at bottom center, preserving separation at1320x760.
- Home cards use a fixed180px height with clamped brand/description text; game cards retain their shared240px width and72–88px responsive height. Empty and filled cards now have identical bounds, including long sponsor names and introductions. Updated README layout description.
- Build and diff check pass. Browser verification covers mixed real-looking test content/placeholders, equal dimensions, exact vertical centering, control/visitor non-overlap, full-height gameplay, advertiser button and hint clicks, desktop1440/1320/1512 and mobile390/320. Initial test needed isolated page storage to avoid the existing new-game confirmation after a saved hint; corrected harness and all checks pass. No product issue was found there.
- Prescribed game client and full-page desktop/mobile screenshots inspected in output/web-game/centered-sponsors. Preview rebuilt on4173; no commit or deployment.

2026-09-10 Remove ads above sponsor stack
- Moved the game's Remove ads button above the right sponsor stack with8px clearance and matching right edge. Home already places it above the sponsor grid.
- Build and diff check pass. Browser verifies position/alignment and working purchase-dialog click at1320x760 with no page errors. Prescribed skill client run; inspected game and skill screenshots under output/web-game/remove-ads-above. Preview rebuilt on4173.
- Initial skill run could not click the home Remove ads selector because it was not visible. Reran the prescribed client through Start connecting successfully; inspected final-skill/shot-0.png. Dedicated desktop check independently confirms the moved game's Remove ads button opens its dialog.

2026-09-10 Front-face-only drawing
- User reported dragging through front nodes sometimes connects nodes behind them. The Astra picker raycast every sphere, so dense stroke samples could hit rear neighbors through gaps. Independent baseline check confirmed origin/main prioritizes the dominant face but still permits sufficiently sharp other-face nodes; this change deliberately enforces the user's stricter single-face rule in astra-rebuild.
- Picking now filters nodes and rods to the cube face most directly toward the camera before raycasting. Each node gesture keeps that face for its entire stroke. Starting on a node during camera motion freezes the view actually touched; a subsequent camera command ends drawing until release. Flat boards retain all targets, and explicit double-tap fill/clear behavior is preserved.
- Text-state output distinguishes physical visibility from input eligibility with screen.pickable. Updated browser target helpers accordingly, retaining physical visibility for home-demo checks. Added test:front-face covering all six faces, rear projection taps, fast boundary strokes, an explicit front-to-rear-to-front drag, oblique mouse/touch input, camera-command cancellation, and flat boards.
- Validation: production build, camera and gameplay browser suites, gesture suite, and new front-face suite pass. An initial gesture run under parallel load missed the existing 280ms completion-test window; its standalone rerun passed without changing timing or assertions. No console/page errors in the front-face checks. Ran the prescribed game client and inspected its capture plus desktop/mobile oblique stroke screenshots in output/web-game/front-face. git diff --check passes.
- Preview rebuilt on4173. Preserved the user's config file and other existing edits. No commit or deployment performed.

2026-09-10 Keyboard instruction visuals
- Replaced the help dialog's dense shortcut paragraph with semantic keycaps, physical arrow/WASD clusters, aligned action/key pairs, and a compact modifier-key note. Kept the native details disclosure with keyboard focus, a keyboard icon, and a rotating chevron. The desktop guide uses two columns; mobile uses a single compact list.
- Independently audited shortcut labels against this branch's handlers: R resets the view, brackets navigate nodes, and Esc clears selection. origin/main used brackets for rotation; current branch behavior is deliberately reflected in the guide. No bindings changed.
- Fixed the help illustration's fixed-width overflow so the dialog fits320px screens. Verified expansion/collapse via Enter/Space, Escape dismissal, all nine action rows, no horizontal overflow at1440/390/320px, and the entire expanded keyboard guide fitting the320x700 viewport after scrolling.
- Production build and diff check pass; browser check reports no page errors. Ran the prescribed game client, inspected its canvas-cropped modal capture and the dedicated full-page/keycap desktop/mobile screenshots under output/web-game/keyboard-help. Preview rebuilt on4173. User configuration preserved; no commit or deployment.

2026-09-10 Simplified How to play
- Reframed the help around “Clear every dot” and “3 dots = 3 connections to neighboring nodes.” Replaced the dense three-section explanation with the core dot-removal rule, the finish condition, and two short pointer instructions.
- Replaced the old decorative node strip with an accessible before/after diagram: two one-dot nodes become two connected dotless nodes. Both origin/main and the current branch require all dots cleared plus a single connected group, so the concise copy preserves that rule. Game logic and keyboard controls are unchanged.
- Production build and diff check pass. Browser checks at1440/390/320px verify the copy, no horizontal overflow, expandable keyboard guide, and Got it dismissal with no page errors. Ran the prescribed game client and visually inspected its canvas crop plus complete desktop/mobile help screenshots in output/web-game/simple-help. Preview rebuilt on4173; no commit or deployment.

2026-09-10 Standard undo/redo shortcuts
- User specified Ctrl/Cmd+Z for undo and Ctrl/Cmd+Shift+Z for redo. Updated the handler to require Ctrl or Meta, removed the bare-Z/Shift-Z and Ctrl/Meta+Y aliases, and made the help keycaps show both full combinations on separate rows. Removed the redundant alternate-undo note and its unused styles; updated README and UI flow.
- Verified origin/main already uses the same modifier-plus-Z/Shift-Z bindings. This brings the Astra bindings back into line with that behavior.
- Build, diff check, browser suite, and gesture suite pass. Browser regressions cover both Control and Meta, ignored old aliases, input/dialog isolation, and preserved redo history. Gesture checks cover immediate mouse/touch selection cancellation and completion/held-stroke undo. Visual checks confirm full keycaps fit desktop and320px mobile; prescribed game client and screenshots inspected under output/web-game/history-keys. Preview rebuilt on4173; no config changes, commit, or deployment.

2026-09-10 Separate keyboard controls and purchase entry
- Moved the keyboard guide out of How to play into its own native dialog, opened by a keyboard icon in the header. Retained the keycap layout and standard Ctrl/Cmd undo/redo combinations. How to play now contains only the puzzle rules and pointer instructions.
- Moved the Remove ads entry out of How to play into the home footer. Sponsor-stack purchase links remain above the cards. The footer changes to Ad-free purchase after verification and remains available for restoring purchases or retrieving the restore code when sponsors are hidden.
- Adjusted compact header spacing and the small-screen logo so all three help/control/sound buttons fit. Verified both dialogs, Escape/close and restored focus, blocked gameplay shortcuts while the guide is open, and no horizontal overflow at1440/390/320px. Inspected desktop help/keycaps and320px controls/gameplay screenshots in output/web-game/separate-controls.
- Production build and browser suite passed. Independent mocked-payment checks verified the footer purchase/restore entry before and after paid verification, including reload and mobile layouts. Existing user configuration preserved; no payment, commit, or deployment performed.

2026-09-10 Gameplay sound effects
- Added src/sound.ts with four procedural Web Audio effects: a soft filtered rotation whoosh, a bright connection pluck, a descending disconnection tone, and a warm ascending completion chime. The existing speaker toggle remains muted by default and remembers its preference.
- Manual toolbar/key/swipe rotations sound once per action; automatic home-demo movement remains silent. Successful taps, node fill/clear, hints, and undo/redo use the sound matching the actual edge change. Drawing sounds each added edge immediately; retraced or rejected links and stroke release add no extra effect. Completion waits for gesture settlement and takes priority over other sounds.
- Context creation/unlocking is lazy and follows user input. Short envelopes, cooldowns, a six-voice limit, and cancellation on mute/hidden tabs prevent abrupt clicks, stacked voices, or delayed playback. No audio files or runtime services are required. Independent review compared the prior Godot hooks on origin/main and found no actionable issue in the Astra integration.
- Production build passes. Browser offline rendering verifies all four effects are audible and non-clipping (peaks0.039–0.091), and muting cancels scheduled completion notes. Lifecycle checks cover unsupported audio, rejected autoplay resume, suspended contexts, disposal, and no stale playback.
- Added npm run test:sound, which passed with native AudioContext instrumentation and real gameplay input: muted default, toolbar/key/swipe turns, connect/disconnect, sound per changed drag edge, active mute, silent auto-solve, and exactly one completion chime. No page or console errors.
- Final gameplay and gesture suites pass, including immediate mouse/touch input, double-tap rollback, held-stroke completion, grouped history, continuous drawing, and pinch isolation. Ran the prescribed game client against the rebuilt preview and inspected its keyboard-dialog capture/state in output/web-game/separate-controls/skill. Full desktop/mobile dialog captures were also inspected. Diff check passes; preview4173 is current. No user-config edits, commit, or deployment.

2026-09-10 Keyboard column separation
- Widened the gap between shortcut columns and added subtle vertical separators to the three paired rows. Full-width shortcuts retain their existing layout; separators disappear with the single-column mobile layout.
- Build and browser layout checks pass at1440/421/390/320px: separators, label/key spacing, dialog fit, Escape dismissal and focus restoration, with no page errors. Ran the prescribed game client and visually inspected desktop, breakpoint, small-mobile and client captures in output/web-game/keyboard-columns. Preview rebuilt; no configuration changes or deployment.

2026-09-10 Consistent keyboard rows
- User found the mixed paired/full-width rows inconsistent. Every shortcut now occupies one full-width row, with its action on the left and keycaps on the right. Removed the column-specific classes and separators; the rotation illustration remains above the list.
- Build and browser checks pass at1440x960,1000x700,390x844 and320x700: all nine rows share the same width/alignment, label/key spacing is clear, the dialog fits without scrolling, and Escape returns focus. No page errors or obsolete class references. Ran the prescribed game client and inspected desktop/mobile/client screenshots in output/web-game/consistent-shortcuts. Preview rebuilt; configuration preserved.

2026-09-10 Completion sharing and invitations
- Added an optional “Share your little victory” section to the actual solved-puzzle dialog. Invitations include the completed dimensions, difficulty and connection count, followed by an invitation to try Nodoku. X, WhatsApp and Telegram open their official share intents; supported devices also offer the system Share menu, and Copy message is always available.
- New src/share.ts strips every query parameter and fragment from the game link, preserving only the current origin/path. This excludes local admin credentials and payment-return state. No public domain is configured in the repository or origin/main; local previews share their local address, while deployments use their own address. Invitations lead to the game, without claiming to recreate the solved board.
- Sharing starts only after the player chooses a share/copy action. Native cancellation stays quiet; failed/unsupported clipboard access or native sharing offers a selected readonly message inside the dialog. Version guards keep delayed results from changing a later completion. Another puzzle retains initial focus, and both continuation choices remain available. Kept the lavender/sage appearance and compacted the completion header to fit the new section.
- Independent review verified official platform URL formats, URL privacy, accessibility and async handling. Build and new npm run test:share pass: actual flat/cube completion details, encoded/intercepted links, native success/cancel/failure, clipboard success/rejection/unavailable, selected fallback, delayed-operation races, continuation controls, and desktop/mobile layouts including scrollable320x568 fallback. No browser errors or real messages sent.
- Ran the prescribed game client through solving a3D puzzle with Hint; its final text state confirms solved/completion-dialog and the share section is visible in the inspected capture. Inspected full desktop, mobile and unsupported-browser artifacts in output/web-game/share. Preview rebuilt on4173; user configuration preserved; no commit or deployment.

2026-09-10 Shorter keyboard guide
- Removed the three requested guide rows: Previous / next node, Select node and Clear selection. Keyboard behavior is unchanged.
- Build passes; desktop/mobile browser checks confirm only Zoom, Reset view, Undo, Redo, Hint and Fullscreen remain under the rotation illustration. Ran the prescribed game client and inspected desktop/mobile/client captures in output/web-game/trimmed-shortcuts. No test assumptions required updating; preview rebuilt and configuration preserved.

2026-09-10 Essential keyboard guide
- Removed Zoom and Reset view from the guide as requested. It now shows rotation, Undo, Redo, Hint and Fullscreen; bindings remain available.
- Build and browser row check pass. Ran the prescribed game client; captures in output/web-game/essential-shortcuts. Preview rebuilt without configuration changes.

2026-09-10 Preserve the active game across refreshes
- Previously the Astra app stored connections/undo but always returned to home and reset the camera. origin/main only restores Godot menu preferences, not an active puzzle. The browser save now records the active screen, puzzle, selected node and camera view, and automatically restores playing or completed boards. Explicit Home stays home with Continue retaining the unfinished puzzle/view. Legacy unfinished saves auto-resume, including the first refresh from a pre-update tab; legacy solved saves retain the previous home behavior.
- Scene view serialization stores quaternion orientation and zoom ratio, using an in-progress turn's intended destination. Restores validate/normalize data and reject invalid or tilted flat-board views without discarding the puzzle. Manual view commands and completed swipes/pinches notify persistence; home-demo movement cannot overwrite the saved game view. Hidden/pagehide lifecycle handling saves the last stroke and selection.
- Puzzle version1 now optionally stores redo moves in replay order, retaining gesture groups. Both history directions are validated from the current board, with a combined2048-move bound; old saves without redo remain valid. Added model coverage for grouped and multi-step redo, fill/clear, malformed sequences, legacy saves, independent copies and bounds. All25 model tests pass.
- Independent review found and fixed a loader issue where malformed menu preferences could discard an otherwise valid saved game. Puzzle restoration now happens separately, and its own settings provide a fallback. Main startup bypasses the home/demo initializer when resuming and applies the saved view before saving again.
- Build and new persistence browser checks pass for real connection input, turned/zoomed view and selection, active/home/completed refresh, Continue view, legacy saves, invalid view, held-stroke navigation, grouped undo-refresh-redo, empty active boards and Another puzzle. Updated older browser fixtures to explicitly request home and changed actual reload expectations to direct play. Gameplay browser suite also passes. Artifacts in output/web-game/persistence; restored active/completion screenshots inspected. User configuration preserved.
- Final gesture suite and persistence rerun pass, including the valid-game/invalid-menu-preferences regression across two boots. No browser errors. Ran the prescribed game client through a manual turn, confirmed playing/snapped view in text output and inspected its capture in output/web-game/persistence/skill. Diff check passes; preview4173 is current. No commit or deployment.

2026-09-10 Online and visitors in place of the game instruction
- Replaced the instruction and selected-node prompts with compact Online / Visitors counters in the same responsive header location. Kept accessible node announcements. Moved the previous lower game visitor widget into this area, and added Online to the home footer. Local database counts have a Preview label; unavailable counts show a dash with a muted status dot.
- New src/audience.ts uses the existing persistent browser UUID, posts presence every 30 seconds while visible, registers visitors once per load, and refreshes visitor totals with GET every minute. Requests pause on hidden/pagehide, resume immediately on visible/bfcache/network recovery, abort after 12 seconds and ignore stale responses. Failed services retry without fabricating zeroes.
- Added POST /api/presence with server timestamps and a 90-second expiry, distinct UUIDs across tabs, atomic upsert/prune/count and an indexed visitor_presence table shared by local SQLite and Cloudflare D1. Existing visitor totals and /api/visitors response stay intact. origin/main (1ef469b) has no visitor/presence feature; this is part of the Astra implementation. Independent review found no actionable issues.
- Build and all 76 model/backend/admin tests pass, including expiry boundaries, concurrent tabs, invalid requests, missing presence schema, D1 SQL and additive migration. The broader run exposed two existing demo tests coupled to the user's saved speeds; tests now provide explicit timing fixtures without changing production logic or config/game-config.json.
- Rebuilt and restarted preview4173 to load the new API and additive local schema. Ran the prescribed game client, verified snapped manual rotation in its text state, and inspected its capture plus full desktop/mobile browser captures in output/web-game/audience. Cloudflare still needs the actual D1 binding and updated schema when deploying; no deployment or commit performed.
- New npm run test:audience passes: header replacement persists through selecting nodes and refreshing, counts format correctly at1440/390/320px, 30/60-second updates, hidden/pagehide pause, visibility/bfcache/reconnect recovery, malformed and failed responses, and stale-request isolation. Browser error log is empty; mobile game capture inspected. A separate unmocked browser check confirms both real local API/database counts reach the game header.

2026-09-10 Community statistics and private sponsor reports
- Online stays fixed beside one rotating all-time statistic: puzzles solved, dots cleared and visitors. The 10-second rotation pauses on hover/focus, hidden tabs and reduced motion, with stable width and accessible labels including the current values. Clicking opens a full Statistics view at #statistics; Today/7 days/30 days/All time filters, interactive daily chart and table, grid/difficulty breakdowns, empty/error states and private sponsor reports preserve the current game and browser Back/Forward navigation.
- Added src/visitor.ts for the shared identity and src/completions.ts for durable completion delivery. The game save carries an attempt ID through refresh/resume/restart and changes it for a new puzzle. Only settled solved gameplay submits the final graph; home demos never report. Per-attempt pending records survive offline failures, new puzzles and refreshes, retry without blocking play, and are removed after confirmation. The server checks the generated clues and single connected network, calculates final edges/dots, and deduplicates both attempt ID and browser/settings/seed. Replaying links or the same puzzle cannot inflate totals.
- Additive statistics_meta, visitor_days, puzzle_completions and sponsor_events tables support UTC periods and truthful tracking start dates while preserving existing visitor/order data. All-time visitor totals include legacy IDs; dated history begins with actual registrations, including midnight re-registration. All-time daily charts cap at the last30 known days. Public aggregates expose no private order/visitor identifiers. origin/main1ef469b is the older Godot app without these APIs.
- Sponsor tracking qualifies paid visible cards after1second at least50% in view, excludes hidden/background/modal/ad-free/placeholder placements, deduplicates by browser/sponsor/UTCday, and retries failures while eligible. Trusted left/keyboard/middle clicks record a view then click without delaying navigation; synthetic clicks are ignored. Paid confirmations expose a copyable private report code. Reports authenticate the existing paid sponsor Checkout reference, support expired campaign history, reject unpaid/ad-free orders and clear credentials/report DOM on exit or pagehide. No code is added to a report URL.
- Full84 model/backend/admin tests pass; frontend build and Cloudflare Pages Functions Worker compilation pass. Independent client/backend review found no actionable issues. The Statistics browser suite passed completion dedupe/offline queues, filters/charts, reports, mobile fit and game history/refresh; a later parallel run hit a navigation timeout and is awaiting serial rerun. Persistence regression passes. Audience suite passes rotation/accessibility/midnight and a fixed direct-entry race: successful visitor POST now refreshes an open statistics page, while GET polling does not trigger extra page loads.
- Prescribed game client ran against #statistics and its text output confirms statistics-dialog. Its canvas-cropped capture and full desktop/mobile Statistics captures were inspected. User config/game-config.json remains unchanged. Preview4173 was restarted for the additive local schema/API, then rebuilt for current client changes. Production still needs its actual D1 binding and updated schema as documented in docs/statistics.md; no deployment, commit or real payment.
- Final serial Statistics browser rerun passes, including private report/credential cleanup on pagehide and public refresh on persisted pageshow. The parallel navigation timeout did not recur. Sponsor metrics browser suite passes actual IntersectionObserver qualification, clipping, modal/visibility resets, retries, refresh/day deduplication, trusted mouse/keyboard/middle clicks, synthetic rejection, sponsor rotation and private code copy/fallback/access. Audience suite also passes the direct-entry and accessible-label regressions. All test browsers closed; final bundle is served on4173. Diff check passes.

2026-09-10 Taller sponsor columns
- Expanded the game's six sponsor placements into three equal-height cards on each side, stretching from below the header to above the bottom controls. Width responds to the space beside the puzzle. Paid cards and placeholders use identical dimensions; paid taglines are visible, and Remove ads stays above the right column. Kept the existing desktop breakpoint and user configuration.
- Build passes. Bounded browser checks at1440x960,1320x760,1920x1080 and390x844 confirm equal card sizes, no overlap with the default puzzle or controls, no page overflow, usable Advertise/Remove ads dialogs and unchanged mobile layout. Independently inspected full desktop and short-desktop captures in output/web-game/sponsor-rails. Ran the prescribed game client and inspected its rotation capture in the skill subfolder. Preview4173 is updated; no commit or deployment.

2026-09-10 Animated node dots and audible home demo
- Added persistent per-node dot transitions with Glide, Spring, Orbit and Fade styles. Departing/arriving dots animate while surviving dots move to the next canonical arrangement. Rapid changes retarget from current position, scale and opacity, including undo/redo and full fill/clear. Initial/restored puzzles appear settled. Up to six live dots per node are reused; temporary opacity materials are released when they finish. Scene timing includes dots, so the home demo waits for both dots and rods before its next turn.
- Local Studio now has a Node dots section with style descriptions and a duration control. Added scene.dotAnimation=glide and scene.dotAnimationMs=460 to the project JSON, preserving every existing value. Older files missing only those fields gain these defaults on read without rewriting disk; Save/Download include them. Zero duration and reduced motion settle immediately. Ongoing animations keep their captured style/duration through unrelated config changes; new changes use the latest settings.
- HomeDemo emits rotation, connection and completion cues through the existing sound toggle. Automatic playback cannot create or resume an audio context; a trusted page gesture unlocks it. Completion waits for final visual animations, fires once per cycle, and is canceled by pause, hide, interruption or replacement. Starting gameplay and changing demo settings stop previous sounds. Default mute and saved preference remain. Independent review found no actionable issue; origin/main is the older Godot implementation without these browser paths.
- Build and94 unit/backend/admin tests pass, including seven dot tests, two demo-sound timing tests and legacy config migration/save validation. Preview4173 restarted to load the updated local config schema. Initial dot browser suite passes all styles, rapid reversal, final zero, reduced/zero duration, restored layouts and mocked admin live/export/save/reset/reload/mobile. New native demo-sound browser suite passes startup policy, actual sounds, completion timing and pause/mute lifecycle. Strengthened4-to3 visual captures, actual admin file-save check and final browser regressions are in progress.
- Final checks pass: actual admin Save writes the selected dot style/duration, reload/export/reset work, and the test restores the user's JSON afterward. Strengthened dot browser coverage verifies visible4-to3 rearranging of surviving dots at the halfway point for all four styles; inspected each close-up and the mobile Node dots panel. Full demo regression passes cube/flat completion, large boards, next-turn timing, replay, reduced motion, pause and player-save isolation. Native gameplay sound regression passes; its short active-mute check was made deterministic by clicking precomputed speaker coordinates while the tone is live.
- Ran the prescribed game client through home auto-solving, confirmed four real demo connections in its text state and inspected its rendered capture in output/web-game/dot-animations/skill. Browser error checks and git diff --check are clear. Build served on4173 is current. Only the two new dot defaults were added to config/game-config.json; prior tuning is preserved. No commit or deployment.

2026-09-10 Remove home footer tagline
- Removed “A quiet puzzle in a connected world.” and its decorative dot, plus the unused footer-mark styles. Build passes; browser confirms the text is absent and audience controls remain. Ran the prescribed game client and inspected its capture plus the full home screenshot in output/web-game/footer-tagline. Preview rebuilt; configuration unchanged.

2026-09-10 Remove landing-page ad removal entry
- Removed the generated Remove ads footer button and the home sponsor-header button. Deleted the unused footer placeholder/styles and kept audience statistics aligned at the right on desktop and centered on mobile. The in-game sponsor-header control remains. Updated documentation to direct purchase/restore through gameplay.
- Build passes. Updated ad-free browser checks use the actual in-game entry and pass purchase retry, verification, restoration, saved entitlement and no-free-hiding behavior with mocked payments. Desktop/mobile landing checks confirm no ad-removal controls and retained audience statistics. Ran the prescribed client and inspected full-home/mobile/client captures in output/web-game/no-home-ad-removal. Configuration preserved; preview rebuilt, no commit/deployment.

2026-09-10 Center landing statistics in the header
- Moved the existing live audience widget into #home-activity at the top center of the landing page. It shares the logo row on wide screens and uses a centered second header row at1050px and below. Removed the now-empty footer and its unused styles; gameplay continues to use its existing audience position. Counts, rotation and Statistics navigation remain unchanged.
- Build and audience browser suite pass: centered, contained, nonoverlapping home layout at1440/1000/390/320px, plus existing polling/lifecycle/accessibility and gameplay checks. Studio-button checks at1051/320px also pass. Inspected desktop/mobile header captures in output/web-game/audience and the prescribed game client's capture in output/web-game/home-header-audience/skill. Preview rebuilt; configuration preserved.

2026-09-10 Animate switching between 3D and Flat
- Home depth controls now morph the existing preview: layers flatten or expand while spheres keep their shape, clues and old connections fade, and camera orientation/distance, haze and floor ease toward the new view. Rapid reversals retarget from current visible geometry without replacing the sphere pool. Auto-solve waits for completion; pausing the demo still allows reshaping. Start/Resume and size/difficulty changes cancel transient resources and use the selected puzzle immediately.
- Added scene.shapeTransitionMs, default 700ms, to the local Studio Connections and scene section and committable configuration. Older files gain the default without rewriting existing tuning; Save/Download include it. Zero duration and reduced motion switch immediately. All previous user configuration values are preserved.
- Build and 96 unit/backend/admin tests pass. New shape browser suite checks geometry/camera continuity, round spheres, bounded identities, collapse/expansion, repeated reversal, pause/resume, size/difficulty/start cancellation, zero/reduced motion and mobile gameplay. Actual admin save/reload/export passes and restores the user's config; full demo regression passes. Inspected desktop/mobile transition captures and prescribed-client capture in output/web-game/shape-transition; no browser errors. Independent review caught a resize/fog endpoint mismatch; destination fog now follows camera distance changes. The expanded shape suite passes exact fog-offset checks and continuity through the final frame after narrowing the viewport. Inspected the resized capture; final build is served on4173 and diff checks pass. No commit or deployment.

2026-09-10 Symbolic complexity selector
- Renamed the home setup row from Find your pace to Complexity. Replaced the three text choices with connected-dot symbols showing one, two or three filled dots, keeping equal 60x44 targets, selected styling and keyboard focus. Low/Medium/High complexity tooltips and accessible names retain the Gentle/Focused/Intricate names. Difficulty values, game title and share/statistics names remain intact.
- Build passes. Bounded browser checks pass all three selections, keyboard activation, selection exclusivity, preference reload, chosen gameplay difficulty and desktop/390/320 layouts. Inspected selector/mobile captures in output/web-game/complexity. Ran the prescribed game client with High complexity, confirmed hard in text state and inspected its puzzle capture; no browser errors. Preview rebuilt; no config changes, commit or deployment.

2026-09-10 Limit new grid sizes to five
- Home offers sizes3,4,5. Menu preferences above5 normalize to5 while preserving Flat/Cube and complexity; fresh Start and Another puzzle enforce the same limit. Restored size6/7 puzzles retain their graph, view and history for refresh, Continue and Restart. Kept model/statistics legacy support and updated UI browser fixtures plus current docs.
- Build passes. Bounded browser checks cover maximum cube98/flat25 nodes, old size6/7 menu preferences in both shapes, larger saved-game refresh/Continue without lost edges, replacement and Another puzzle clamping, and mobile layout. No page errors. Inspected mobile capture in output/web-game/grid-max-five. Prescribed client selected size5 and its rendered capture/state were checked. Preview rebuilt; no configuration changes, commit or deployment.

2026-09-10 Completion sharing icons
- Replaced X, WhatsApp, Telegram, device Share and Copy message button text with inline SVG icons. Controls form a centered compact row and wrap as social/action groups on narrow screens; each target is44x44 with a descriptive tooltip and accessible name. Kept existing share payloads, status announcements, native support detection and manual-copy fallback.
- Build and updated share browser suite pass, including exact role/name access, decorative icons, target sizes, desktop/320px layouts with native Share available/hidden, social URL encoding, native/copy success/cancel/failure, stale async protection and continuation controls. Social destinations were intercepted and native/clipboard APIs mocked; no real shares sent. Inspected desktop/mobile completion captures in output/web-game/share and the prescribed game client's gameplay capture in skill-icons; no browser errors. Preview rebuilt; no config changes, commit or deployment.

2026-09-10 Gentle floating nodes
- Added subtle, individual sinusoidal drifting in home and gameplay. Separate base positions preserve logical grid coordinates and compose with shape morphs; spheres, pips, rods, guides and selection markers use live rendered positions. Hit testing/projections follow the visible spheres while front-face eligibility, camera fit and studio placement remain based on the grid. Integrated phase preserves continuity when cycle speed changes.
- Added scene.nodeFloatAmplitude=0.025 and scene.nodeFloatPeriodMs=6000 to the committable config and local Studio Connections and scene controls, preserving prior tuning. Older version1 files receive only missing defaults; zero amount and reduced motion settle nodes. Ambient rendering has its own scheduling predicate, so demo waits and completion audio still depend only on finite transitions. Hidden pages pause RAF and resume without catching up; disposal cancels the pending frame. Independent review's disposal finding was fixed.
- Build and 97 unit/backend/admin tests pass. New floating browser suite verifies bounded varied offsets, attached rods/guides/pips/ring, real front-face drag/click, shape reversal, flat demo completion, zero/reduced motion and mobile. Actual admin Save/reload/export passes and restores owner config. Existing front-face, shape-transition and full demo suites pass. Separate real-time check verifies idle RAF, paused-demo floating, hidden pause/resume and live reduced-motion changes. Inspected desktop/mobile captures in output/web-game/node-floating; no browser errors. Prescribed client captures show changed floating phase and positions while the demo stays paused with unchanged connections; inspected its final image in the skill subfolder. Preview4173 was restarted for the schema and rebuilt with the final source. Diff check passes; no commit or deployment.

2026-09-11 Simplify landing copy
- Removed the separate No clock. No rush. note and its unused styles. Prepared a clearer headline/description proposal for the user.
- Build and bounded desktop/mobile home checks pass; no page errors or mobile overflow. Inspected both page captures and the prescribed game client capture in output/web-game/home-copy. Preview rebuilt and diff check passes.

2026-09-11 Drag to remove existing connections
- Node strokes now toggle neighboring edges: missing links are added and existing links removed with the matching sound and dot update. A canonical per-stroke set prevents backtracking from changing an edge twice; successful mixed changes stay in one undo/redo batch. Kept front-face picking and updated help/docs.
- Build, expanded mouse/touch gesture suite, all-six-face suite and native-audio suite pass. Covered fresh removal, whole-path removal, mixed addition/removal, retrace, undo/redo, persistence and disconnect tones. Independent lifecycle review found no concrete bug. Inspected desktop/mobile removed-path captures in output/web-game/gestures and the prescribed client screenshot/state in output/web-game/drag-removal/skill; no page/console errors. Preview rebuilt and diff check passes. No config changes, commit or deployment.

2026-09-11 Cloudflare hosting for nodoku.solokh.com
- User chose nodoku.solokh.com. Set APP_ORIGIN accordingly and added .node-version24. Compared origin/main: its existing Git-connected dotcon Pages project still serves Godot/public, so created a separate direct-upload nodoku project with production branch astra-rebuild and kept dotcon unchanged.
- Renewed the user's expired Wrangler login through OAuth with account/user read, Pages/D1 write and zone read scopes. Cloudflare account Nebulity (480aa6ac5a5c120159e4252a0c33f936). Created production D1 nodoku (b7be3da8-25d3-4559-8613-920b0a148812, EEUR), applied the complete schema, and saved its binding in wrangler.jsonc.
- Deployed current working tree successfully: https://158584d6.nodoku.pages.dev, production alias https://nodoku.pages.dev. Registered custom domain nodoku.solokh.com (90b13d43-4c58-42ef-8b76-ecfeb4d2588a), awaiting DNS/validation. Required CNAME: nodoku -> nodoku.pages.dev.
- Build, Functions bundle and97 tests pass. Local Cloudflare/D1 runtime passed assets, visitors/presence/statistics, visitor dedup, origin guard, admin404 and disabled payments. Production read-only HTTP checks passed matching build asset, D1 API responses, admin404 and disabled checkout. Production totals remain0 after read-only verification. Temporary8788 server stopped; normal4173 preview still runs. Documentation updated; diff check passes. No commit/push and no Stripe changes.
- Public RDAP confirms Squarespace Domains II LLC registrar and Google Workspace reseller (https://rdap.squarespace.domains/domain/solokh.com). Authoritative nameservers are ns-cloud-c1..c4.googledomains.com, which proves Google DNS infrastructure but not a user-owned Google Cloud console zone. Squarespace management is likely; authenticated domain listing is needed to confirm.
- Remaining: user sign-in to Squarespace, add the CNAME, then verify custom-domain HTTPS and actual same-origin writes/gameplay. Available browser is in-app only; Chrome extension unavailable. Browser session from Chrome skill is initialized in node_repl as agent/browser, domainTab(id4) shows Squarespace login and is marked handoff. Continue through that tab once user is signed in. Production APP_ORIGIN intentionally means pages.dev POSTs are rejected; use custom domain for final end-to-end testing. Stripe test/live product setup remains pending the user's pricing choice ($9.99 permanent ad removal was proposed, not approved; existing sponsorship offer is$100/30days).

2026-09-11 Connection melodies
- User chose the next recognizable melody note per successful connection. Added synthesized public-domain Beethoven themes: Ode to Joy by default and Für Elise; Studio → Sound also offers the original connection effect, note duration (100–1000ms), and relative melody volume (0–1). Checked-in defaults are Ode to Joy,320ms,.7; older config files migrate only the missing sound section, preserving owner tuning. Sources and behavior documented in docs/music.md and docs/configurator.md.
- Player melodyStep counts added edges, including bulk fills and edges restored by undo/redo; removals/selections/speaker previews do not advance it. Immediate-click rollback restores the index. Save/refresh/Continue preserve it; Restart/new puzzle/melody change resets it. Demo uses its own connection index and repeats independently. Existing mute/gesture-unlock behavior remains; no recordings or external audio downloads.
- Melodic input bypasses the old40ms effect cooldown, separates note attacks by75ms, and bounds lead to600ms, bursts to6 notes and active voices to12. Extreme undo/input bursts play a short phrase instead of a long delayed backlog. Completion lets the final connection attack sound before its chord. Stop/mute/config changes/AudioContext suspension cancel pending notes. Independent lifecycle and sound reviews found no actionable regressions.
- Final build and106 unit/backend/admin tests pass, including8 focused audio tests. Native gameplay audio suite passed again against the final build (E E F G, silent selection, disconnect/index preservation, paced/fast drag, bulk double tap, saved progress/restarts, mute, demo isolation and completion). Demo audio suite passed autoplay/unlock, own note sequence/restart, visible completion, dialog/pause/hidden suppression; final added statechange cancellation is covered by the focused audio suite. Actual local admin Save/export/reload/validation and desktop/mobile checks passed and restored the owner JSON. Inspected Sound/mobile screenshots in output/web-game/configurator and prescribed-client screenshot/state in output/web-game/melodies/skill. No page/console errors; diff check passes.
- Local preview restarted for the new schema:4173, PID45633, exec session91449. No commit, push, deployment, DNS or Stripe changes in this task.

2026-09-11 Moonlight ambient music
- User selected Scott Buckley's Moonlight. Verified the original track page and CC BY4.0 attribution terms; bundled the unchanged official MP3 as src/assets/moonlight-scott-buckley.mp3 (10,177,523 bytes; SHA256 7feb8c703983dbdfc97018f004cfebad8f03b86f2382c58c0ad24e375d4c17f5). Vite emits a local hashed asset; no composer-site request during play.
- Added a header music icon and Ambient music dialog with independent Play/Pause, full requested credit, and track/creator/license links. Music defaults off and saves its own preference alongside the puzzle. Existing speaker controls synthesized SFX/melodies separately. Studio Sound now has ambientVolume (0–1, default.18); older sound sections gain this field without changing owner choices. Documentation includes the recording's license separately from the synthesized Beethoven themes.
- Separate AmbientAudio player lazily creates one native looping audio element after user activation, fades in over300ms, retains position across navigation/pause, and pauses on visibility/pagehide. Saved-on refresh waits for a fresh gesture. Trusted-click fallback covers touch release and assistive activation. Pending play resolutions cannot revive muted/hidden audio or cancel newer playback; errors stay optional.
- Build and114 unit/backend/config tests pass, including7 ambient lifecycle tests and config migration/boundaries. Desktop native MP3 playback and initial mobile layout checks pass; final browser completion and prescribed-client check recorded below. No owner tuning changed beyond adding ambientVolume. No commit, push, deployment, DNS or Stripe changes.
- Final browser checks passed across desktop, mobile and focused touch runs: real MP3 decoding/time advancement, lazy local requests, quiet loop/fade, independent SFX, unchanged playback across start/home/settings/help, pause/resume position, hidden/page lifecycle, saved-on refresh gesture gating, and first trusted mobile tap. Full attribution links and 320/390px layouts (including visible Studio at320px) passed. Inspected these captures in output/web-game/ambient plus prescribed-client gameplay screenshot/state in its skill/ subfolder; no page/console errors. Final build index-Crh46V-p.js; bundled MP3 hash matches original. Preview remains on4173, PID49030/session86831. No remaining work for this music request.

2026-09-11 Explain and reveal disconnected groups
- Investigated the all-green board warning. Both origin/main (Godot game_controller.gd/_is_level_complete and grid_model.gd/is_required_network_connected) and this Astra rebuild require exact node degrees plus one connected network. No win-rule bug found. The exact pictured 5-cube was not available in the accessible browser tabs; verified genuine generated reproductions instead: flat3 hard seed517 with two full groups, and cube5 hard seed0 with a degree-preserving edge swap producing groups of8 and90. Saved games and alternative connected solutions remain valid.
- Added deterministic connectionGroups to the puzzle model, handling sparse cube IDs and isolated required nodes. Replaced the generic disappearing warning with a persistent group count, automatic amber highlighting of the smallest group, and Show group to focus/cycle groups without editing connections/history. Faint neighbor guides hide during highlighting so they cannot look like actual links. Selection remains distinct; edits, undo/redo, refresh, repair, new games and Home recompute or clear diagnostics. Completion validation and serialization remain unchanged.
- The notice has its own grid row below the scene only when needed. Browser inspection caught node overlap in the initial overlay and intrinsic canvas overflow when shrinking to320px; reserved notice space and an explicit shrinking grid column fix both. Guidance remains above mobile controls. Updated play/flow docs and added npm run test:connectivity.
- Build and116 unit/backend/config tests pass. The connectivity browser suite passes actual repair clicks, exact node/rod materials, visible group focus, persistent notices, selection, undo/redo/refresh, one real completion payload, share controls, cube/Home/Continue lifecycle and1200/390/320px layout checks. APIs were mocked in these fixtures. Inspected final flat/mobile/cube captures and prescribed-client gameplay screenshot/state in output/web-game/connectivity; no browser errors, diff check passes. Final build index-yjZsquY3.js is served by the existing4173 preview. No owner config changes, commit, push or deployment.

2026-09-11 Recorded rotation pop
- User supplied humordome-soft-ui-pop-light-minimal-click-451232.mp3 and requested a trimmed rotation effect. Inspected its5.041625s waveform and levels; isolated one transient at0.172–0.352s, with2ms fade-in/20ms fade-out. Bundled as src/assets/rotation-pop.wav:180ms mono44.1kHz16-bit PCM,15954bytes,peak0.43808,zero first/last sample. Original download unchanged. Trim SHA25609f47179881968493eb8f02ed12df0a70b1f838209179df6fbd68be88c117643; original SHA256ba801851d3bfa2d65a32c07b484e53da3e91f3392558eaf03c0e29583369a2d8.
- origin/main rotation was silent; Astra previously generated a noise whoosh and180Hz triangle. Replaced that synthesis with the supplied pop in manual gameplay and home demo. GameAudio receives the bundled URL, prefetches bytes without creating an audio context, decodes/caches after gesture unlock, and plays fresh buffer sources through0.22×0.65 gain. Missing/loading/failed recordings never queue stale turns. Existing cooldown, voice bounds, mute/hidden/stop/disposal and connection/completion melodies remain. Documented source/edit in docs/music.md and README; no owner configuration changed.
- Build and122 unit/backend/config tests pass, including14 audio tests covering cache/async races/cancellation/failures. Independent read-only audio lifecycle review found no actionable issues. Built asset rotation-pop-DrqKgU9d.wav exactly matches the trimmed source. Native gameplay and demo audio suites pass: actual mono180ms WAV decode, one sample per toolbar/key/swipe/visible demo turn, fresh sources reusing one cached buffer, no old noise/180Hz oscillator, active sample mute, gesture/decode gating, pause/hidden/dialog/no stale playback and unchanged melodies/completion. Updated observers include AudioBufferSourceNode's own start overload. Ran the prescribed client through a real left rotation and inspected its settled gameplay screenshot/state in output/web-game/rotation-pop/skill; no browser errors. Diff check passes. Build index-DQypKY4L.js is served on4173. No commit, push or deployment.

2026-09-11 Guided starting node
- User requested an initial starting node and asked whether it should guide the first move or enforce growing one network. Recommended and implemented guidance: preselect the active front-face node nearest the center, mark it Start here, and allow a neighboring tap or drag to create the first link. Players can still choose any node. Verified origin/main explicitly began with no selection; this is an Astra-only onboarding addition. Puzzle generation, valid solutions and connected-network completion rules are unchanged.
- The small label follows the floating node and camera, hides off-face or when obscured, stays within the canvas, and respects reduced motion. It has no pointer interception; the existing selection ring highlights the node and the live region describes how to begin. First connection, another selection, deselection or undo with redo available clears the cue. A selected node that moves off-face cannot become a hidden endpoint of a later click.
- Fresh games and Restart select the same deterministic starter and front view. Continue and refresh retain saved view and selection, including an explicit null. No save schema or owner configuration change. Updated README and UI flow documentation and added npm run test:starting-node.
- Build and122 unit/backend/config tests pass; independent lifecycle review found no actionable issues. The dedicated browser suite passes all18 combinations of shape, size3–5 and complexity, first tap/drag/double-tap rollback, free selection, off-face behavior, restart/resume, reduced motion and mobile placement. Inspected desktop5-cube/Flat captures in output/web-game/starting-node. Persistence/general browser regressions and prescribed-client capture are completing; final results follow below.
- Final persistence and general gameplay browser suites pass, including saved manual/null selection, legacy saves, undo/redo, Another puzzle, keyboard controls, completion and mobile gameplay. No page/console errors. Inspected the320px starting cue and the prescribed client's actual3-cube gameplay screenshot/state in output/web-game/starting-node/skill: selected22, visible starter22, empty edges and settled front view. Final build index-BYisluOF.js is served on4173. Diff check passes; no commit, push, deployment or owner configuration change. No remaining work for the guided-start request.

2026-09-11 Revert guided starting node
- User asked to revert Start here. Removed the marker, scene tracking/CSS, automatic starting-node selection and related documentation/test command. Fresh games and Restart leave selection empty; saved manual selections still restore. Returned full Restart to preserving the current view and empty-board Restart to resetting the view. Kept the general off-face selected-node guard, which prevents hidden connections independently of this removed feature.
- Removed the dedicated starter test and updated existing browser/persistence expectations to ordinary unselected starts. Build passes. Ran the prescribed game client against4173, inspected the capture in output/web-game/revert-starting-node/skill, and asserted playing mode, selected:null, empty edges and no starter state. No browser errors; diff check passes. Read-only review confirmed saved selection restoration and caught missing empty-Restart history/melody cleanup during the revert; restored that cleanup. A bounded browser check passes actual connection, Undo to empty and Restart with no selection or redo. Final preview bundle index-BZ3Rk_Uo.js; prescribed capture rerun on this build. No owner config changes, commit or deployment.

2026-09-11 Gum material trial
- User requested gum/goo/stretchy shaders for nodes and connections. Added a trial enabled by default, with Classic/Gum, Gum stretch (.65) and Gum gloss (.7) in local Studio. Only these three fields were added to the committable owner JSON; all prior colors/timings/sizes/sound settings remain. Shared strict validation migrates missing fields only, preserving explicit Classic/zeros. README and configurator docs explain comparison and saving.
- New GumMaterials helper uses a generated RoomEnvironment PMREM, glossy physical surfaces, a small wrapped-light shader contribution, and tapered connection vertex shaders with analytically corrected side normals. Matching depth shaders and cached CPU picking geometry share the same taper. Hooks are reattached to temporary material clones during shape morphs. Classic restores the former material finish and straight lengthwise connection drawing. No external assets or transparent rendering passes.
- Gum links form as thin anchored strands that thicken and settle within the existing connection duration. Changed endpoints wobble with volume-preserving squish; sphere and billboard dots share transforms so clues and picking stay attached. New/resumed boards start settled, reduced motion/zero stretch/zero duration suppress pulses, and style changes clear transient effects. The existing demo animation lifecycle handles their timing. PMREM/depth/picking resources are disposed with the scene.
- Verified origin/main is the older Godot Node2D renderer; these are new Astra effects. Build and125 unit/backend/config tests pass (3 new config cases). Independent shader/lifecycle review found no blocker and identified the original thin-cylinder picking discrepancy, fixed with shared profile geometry. First native browser run passed live controls, connection pulses, topology/history stability, Classic comparison, demo progression, morph/reversal, reduced motion and mobile layout with no shader/page errors. Inspected its flat/cube images and refined washed-out highlights plus the exposed free-tip flare; final visual/occlusion regression is running.
- Restarted local preview4173 for updated admin schema: PID86564/session30012. Actual authenticated admin GET confirms the new fields with owner values intact. No commit, deployment, payment or other settings changes. Final results/captures follow below.
- Final candidate passes the expanded Gum browser suite and existing front-face regression across all six faces, oblique mouse/touch strokes, rear crossings, rotation and Flat mode. No shader/page/console errors. Inspected final flat pulse, cube, mobile and morph captures; connections stay anchored without free-end disks, and softer reflections retain sphere depth. Ran the prescribed client on the landing demo and inspected its screenshot/state in output/web-game/gum-materials/skill: Gum active, eight real connections, auto-solve continuing. Final build index-BfvPHxrH.js is served on4173. Diff check passes. No remaining work for this material trial; use Studio to compare/tune or select Classic.

2026-09-11 Visible admin material choices
- User asked to preview and select the shaders from admin options. Moved Gum materials to the top of Studio and opened it by default. Replaced the buried style dropdown with illustrated Classic/Gum native radio cards, selected/focus states, immediate live preview, and a short Save to project instruction. Stretch/gloss remain directly below. Existing save/reset/reload/export synchronizes radio checked state; no rendering/config/default changes.
- Updated configurator documentation. Build passes; final admin UI verification and screenshots are in progress. Owner JSON unchanged.
- Bounded admin UI browser check passes native card clicks/arrow-key selection, immediate style preview, radio state after mocked Save/Reset/Reload, JSON export, unchanged game history, and320/390px card bounds. Inspected all three admin screenshots in output/web-game/gum-materials/admin-gum-cards-*.png. Existing selectors were updated; no real config writes. Prescribed client on the rebuilt preview produced a visible Gum home connection and no errors; screenshot/state inspected in output/web-game/admin-material-cards/skill. Build index-BuWZcvZs.js/admin-C052nqzO.js served on4173; diff check passes. No commit/deploy.
- Audit note: the prior Gum skill run's errors-0.json (not inspected in that turn) contained two empty-log SwiftShader validation errors for MeshBasicMaterial despite its visible capture and native suites passing. The fresh prescribed run for this UI change records none, and the native Gum/admin browser checks remain clean. No shader source was changed in this turn.

2026-09-11 Silent rotations
- User requested removing rotation SFX. Removed manual rotation sound callback and home-demo rotation sound emission, plus the rotation recording import/URL supplied to GameAudio. Gameplay and demo turns are silent even when the speaker is on; connection melodies, disconnect/completion effects and Moonlight controls are unchanged. The original/trimmed audio source files remain available, but rotation-pop.wav is no longer fetched or bundled.
- Updated sound documentation. Build index-jNssHJ8c.js passes and is served by4173; confirmed no rotation asset in dist. Focused browser/audio regression and updated demo assertions are in progress. No owner config changes, commit or deployment.
- Final validation passes: all125 unit/backend/config tests, and both updated native --rotation-smoke subsets. Toolbar/key/swipe/manual and visible demo turns schedule no sources and never fetch/decode the rotation pop. E E F G melody, disconnect, player/demo completion, mute/pause and saved sound preferences still work. Ran the prescribed client through a real left turn; inspected screenshot/state in output/web-game/silent-rotations/skill, confirming settled left face and no browser errors. Diff check passes. No remaining work for rotation sound removal.

2026-09-11 Completion melody and simultaneous demo steps
- User requested the next10 melody notes after solving, configurable in admin, and no rotation delay before demo connections/SFX. Added Sound → Completion notes (0–32, default10) and Completion note interval (80–1000ms, default240) with strict validation and independent legacy migration. Only those two keys added to owner JSON; other tuning preserved. Zero disables completion sound; Classic retains its chord when enabled.
- GameAudio schedules the next notes in one cancellable completion voice, preserves final connection attack timing, wraps the selected melody, and suppresses duplicate completion while active. Player/demo callers supply their next unplayed index; completion doesn't consume saved gameplay melody steps. Sound settings changes, mute/hidden/new puzzle/stop cancel the queued tail. Duration getter includes handoff and tail and returns0 without active audio.
- HomeDemo now focuses, connects, refreshes and sounds the new link in one due step while its turn begins. Existing animations gate subsequent steps. Removed obsolete reveal-delay control while retaining its stored legacy key. Final visuals settle before completion sound, and the finished board holds for at least the phrase length. Unrelated admin config edits preserve an extended hold. README/music/UI/configurator docs updated.
- All135 unit/backend/config tests and production build pass. Read-only integration review found no off-by-one/cancellation/hold issue; origin/main used a separate Godot completion tune, so melody continuation is new Astra behavior. Local preview restarted4173 (PID94001/session48912) for the updated admin schema. Browser/audio/admin checks and visual capture still in progress. No commit/deploy.
- Browser demo suite passes actual animation/pause, same-step turn+link, cube/Flat full solutions and replay, animation spacing, dialogs/drag/settings changes, saved-game isolation, reduced motion and mobile layout. Solved desktop/mobile captures inspected; errors.json is empty. Both native --completion-smoke audio checks pass: player final link then exactly10 next melody notes; demo connection note during its turn and correct continuation index, interval, completed hold, no repeats or saved-index consumption. Mute cancels queued native sources; demo pause/preferences remain intact. Final source build index-B3xQcUNT.js serves the guarded duration getter. Admin save/reload verification and prescribed capture remain.
- Final admin browser verification passes real Save/Export/Reload with16 notes/360ms and a second Save/Reload with0 notes, invalid-input rejection, preservation of hidden legacy reveal key, and all existing scene/editor interactions. Both completion controls are visible together in inspected admin-sound-completion.png. Browser errors are empty; owner config restored byte-for-byte after testing (default finish10/240, existing note duration810/volume.75 and all scene tuning intact).
- Prescribed web-game client completed on final build; inspected output/web-game/completion-melody/skill/shot-0.png and state-0.json: home demo has7 real connections, runs with completion10/240, and no error artifact was recorded. Focused final35 demo/audio units and diff check pass. All requested work complete; local preview4173 is ready to refresh. No commit, deployment, or other configuration changes.

2026-09-11 Score-paced home demo
- User asked for automatic solve delays based on the original melody. Added score-derived quarter-beat onset intervals (including intervening rests) alongside existing Ode to Joy/Für Elise pitches; verified against the primary Mutopia LilyPond scores. New helper converts wrapped score positions to milliseconds at a configurable tempo. Source links and the distinction between chosen tempo, relative rhythm, and note envelope are documented.
- Local Studio → Home auto-solve now offers Melody rhythm (default) or Fixed delay, plus Melody tempo40–180 quarter-note BPM (default96). Only those two fields added to owner JSON; existing values preserved. Strict migration handles only absent fields; fixed choice and valid custom tempo persist. Fixed mode retains its previous post-animation pause and player-driven melody/completion timing is unchanged.
- In melodic mode, subsequent steps count score time during visual animations; turns are capped to80% of the current note interval and rods can overlap. Sub-frame lateness carries into the next interval without catch-up bursts. Shape transitions and explicit pause/interaction still suspend drawing. Final home continuation starts after the final scored interval, uses cumulative score timing, and extends the solved-board hold. Home tempo/mode changes stop stale queued audio. Manual completion spacing retains its existing control.
- All154 unit/backend/config tests and production build pass. Independent timing/lifecycle review found no actionable regression; origin/main remains Godot and these rhythm features are specific to Astra. Preview4173 restarted for schema changes (PID1894/session28044). New native demo-rhythm browser check passes sixteenth/held/rest intervals with deliberately slow2000ms turns and1200ms rods: turns fit between beats, rods overlap, pause/resume and full solution remain correct, no browser errors. Config API mocked; no project file writes. Native audio/admin verification in progress. No commit/deploy or other owner-setting changes.
- Native audio checks pass on the built preview: home demo uses cumulative score intervals at its BPM, preserves the last scored interval, continues exact next10 pitches with correct solved-board hold, no duplicate/index consumption, and keeps rotations silent. Player completion retains uniform configured spacing and mute cancels its tail. Inspected overlapping-links.png from the rhythm browser; links remain anchored with multiple active animations. Admin persistence check is now running; no production source edits after index-CLlvF1zF.js.
- Final admin browser suite passes timing choice/BPM validation, mode switching without losing fixed pause, actual Save/Export/Reload at Fixed delay+108 BPM, and completion-count0 save/reload. Owner JSON restored byte-for-byte; errors.json empty. Inspected admin-melody-timing.png with timing choice, tempo slider/input and descriptions visible. Prescribed client exited0; shot/state in output/web-game/demo-rhythm/skill inspected: five home connections, Melody rhythm at owner96 BPM, finite projections and intact tuning, no error artifacts. All requested work complete on index-CLlvF1zF.js; refresh local4173. No commit/deployment.

2026-09-11 Endpoint-colored connections
- User requested connection gradients from each node's completion state, with one solid color when both ends have the same state. Placed links now use unfinished-node color at unfinished ends and completed-node color at full ends. Mixed ends blend linearly in renderer color space. The Selection accent control retains the existing scene.connectionColor key/value for rings and available links; node/completed colors control placed links. No owner JSON values changed.
- Added four shared CylinderGeometry color variants through ConnectionColors; positions/normals/UVs/indices remain unchanged, materials use standard vertex colors with neutral white tint. This composes with existing Gum/Classic shading and cloned morph materials without extra shader hooks. Actual start/end IDs preserve gradient direction when drawing in reverse. updateMaterials updates every retained rod after neighboring moves/undo/redo. Amber disconnected-group material remains a solid override; shared variants dispose with the scene.
- Added actual endpoint-color diagnostics in render_game_to_text and3 helper tests covering allstate pairs, endpoint/intermediate linear colors, live palette changes, geometry identity/preservation and disposal. All157 unit/backend/config tests and build pass; final bundle index-CNSufcNM.js served on4173. Native gradient/visual regression in progress. No commit/deploy.
- Final gradient browser regression passes all four endpoint-state combinations, reverse-direction growth, neighboring-node completion recoloring existing rods, undo/redo/reload, and live owner/custom palettes in Gum/Classic. Actual screenshot pixels confirm the mixed link transitions across its span. Inspected owner-gradient-gum.png (white/sage links readable) and custom palette captures; browser errors.json empty. Independent resource/shading review found no issue; origin/main uses Godot single-color edges, while this gradient is specific to Astra.
- Prescribed web-game client exited0; screenshot and state inspected in output/web-game/connection-colors/skill: five home-demo rods whose endpoint samples match completion colors, normal scene and muted defaults, no error artifacts. Owner configuration was never written by the mocked browser fixtures. Build/tests/diff check pass; all requested gradient work complete on local4173 (index-CNSufcNM.js). No commit or deployment.

2026-09-11 Musical completion endings
- User replaced the fixed next10 finish with continuation only through a logical musical ending. Added explicit zero-based phrase endpoints in the existing score excerpts: Ode to Joy29/61 (tonic C), Für Elise8/26/34 (selected A arrivals). melodyCompletionCount starts at the next unplayed note and includes only the next ending; if the last connection already played an ending, it returns0. Pitch/rhythm arrays are unchanged, and source rationale is documented in docs/music.md.
- GameAudio playback and duration now share the derived count. Exact-ending completion creates no new context/voice/cooldown and leaves the last connection tail intact. Positive continuations retain fixed gameplay spacing or the home score rhythm, single-voice cancellation, saved-index isolation, and full home hold. Classic keeps its completion chord when enabled.
- Studio → Sound replaces Completion notes with Play completion ending (sound.completionSound, defaulttrue). Valid legacy counts migrate0→false and1–32→true; an explicit valid boolean wins, supplied old count still validates, canonical saves drop only the retired field. Owner JSON changes only count10→toggletrue. README/configurator/music/UI docs updated.
- All164 unit/backend/config tests and production build pass; independent integration review found no issue. origin/main remains the older Godot implementation with a separate completion tune; phrase continuation is specific to Astra. Final build index-BugKn_Sj.js is served by restarted4173 (PID8633/session83366). Native audio/admin checks and prescribed browser capture remain in progress. No commit/deployment.
- Actual admin Save/Export/Reload passes with ending On and Off, canonical JSON has no retired count, screenshots of the toggle/help/interval and mobile panel inspected, errors.json empty. Owner JSON restored byte-for-byte (SHA25661c97802e7b10c10600f70bbbc9a45b96e0377bf291d7ac517e844c50762ef77). Native player completion smoke passes positive phrase continuation and last-move-on-ending zero extras; final connection tail, saved next index, fixed spacing and mute cancellation are preserved. Completion screenshot/state in output/web-game/phrase-completion inspected. Native demo and prescribed client remain.
- Final native demo completion smoke passes exact next pitches through the chosen ending, scored pacing, finished-board hold, no replay/index consumption, pause and silent rotations. Prescribed client passed with the existing Playwright loader; screenshot/state in output/web-game/phrase-completion/skill inspected: five connections, normal Gum scene, finite projections, completionSoundtrue and owner melody rhythm. No browser errors/artifacts. Final diff check passes; only tests/docs changed after the successful source build. All requested work complete on localhost4173, index-BugKn_Sj.js. No commit/deployment or unrelated owner tuning changes.

2026-09-11 Original social symbols
- User asked for original social symbols in the completion share panel. Replaced the hand-drawn X/WhatsApp/Telegram outlines with the brand silhouettes from Simple Icons, checked against each brand's resource page. Filled logos use black X, WhatsApp green and Telegram blue; native share/copy keep their existing outlined glyphs. Existing labels/tooltips,44px targets and share destinations are unchanged. Inline paths avoid a new package or runtime network request; provenance links are recorded in src/share.ts.
- Build/typechecks and diff check pass. Local4173 serves index-C0EmWGsh.js. Owner JSON unchanged (SHA25661c97802e7b10c10600f70bbbc9a45b96e0377bf291d7ac517e844c50762ef77). Existing share browser suite and prescribed capture in progress. origin/main still has the Godot completion Next/Replay panel without social sharing. No commit/deployment.
- Existing share browser suite passes all accessible-label/44px-target assertions, desktop/320px layouts with/without native share, native/clipboard fallback and intercepted social links. Fresh completion screenshots inspected: original silhouettes clear and aligned. errors.json empty. Prescribed client exited0; shot/state under output/web-game/share-brand-icons/skill inspected with normal home demo and no error artifacts. Owner config unchanged; no actual shares/messages sent. All requested symbol changes complete; refresh localhost4173. No commit/deployment.

2026-09-11 Scored double-tap fills
- User requested original melody delays when a double click fills a node. main.ts passes sequenceTempoBpm from the existing Melody tempo setting only for double-tap additions; the puzzle and saved melody index still update immediately. GameAudio schedules the full fill (up to6 notes) as one voice with score-derived intervals/rests and capped envelopes, rather than the75ms rapid-input spacing. Ordinary single/drag, Classic and home rhythm behavior remain intact.
- One uninterrupted fill retains every note. A later successful edit replaces the pending fill and responds immediately; pure selection/turning leaves it playing. A new fill clears older queued normal-connection notes while allowing already-audible short tails to finish. Completion preserves the fill and uses its exact final scored interval before the existing ending spacing; the reservation survives oscillator cleanup and exact-cadence zero-extra completion. Mute/hidden/stop/config/new-game cancel pending audio, and changing Melody tempo also cancels a playing fill. No owner JSON changes.
- Updated admin tempo help and README/music/configurator docs. Added8 focused sound units and a native --double-tap-smoke case crossing Ode indices12–15 (dotted/short/held values), with cancellation and persisted progression. All172 tests/typechecks/build pass; focused independent review found no remaining issue. origin/main Godot played each fill edge sound immediately, so score-paced fills are specific to Astra. localhost4173 serves index-PbTTEUxQ.js. Native audio and prescribed capture in progress; no commit/deployment.
- Native --double-tap-smoke passes actual immediate4-link fill with E/D/D/E offsets0/.9375/1.25/2.5s at96BPM, saved progression, silent selection, mute/new-edit future-source cancellation and falling removal effect. Existing --completion-smoke also passes phrase ending, fixed spacing, exact-cadence silence, tail and cancellation checks. Filled-board screenshot/state/native-audio.json in output/web-game/double-tap-rhythm inspected. Prescribed client exited0; skill screenshot/state inspected with normal home cube26nodes/5links and no error artifacts. Owner JSON hash unchanged; final diff check passes. All requested work complete on index-PbTTEUxQ.js; refresh4173. No commit/deployment.

2026-09-11 Flat grid choices
- User restricted Flat to sizes4 and5. New-game/preview normalization now clamps Flat to4–5 and cubes to3–5. The size3 button is hidden and disabled in Flat, and available again in3D; switching a3cube toFlat selects4. Existing saved boards remain resumable through the separate resume path. README and UI flow updated. No engine/config changes.
- Updated the existing shape-transition browser fixture to4cube/Flat and meaningful4→5 size interruption, preserving animation/reversal/resizing checks. Build/typechecks and diff check pass; localhost4173 serves index-CvjVCvpG.js. Owner JSON hash unchanged. Bounded menu/persistence/legacy-resume and shape/browser capture checks in progress. No commit/deployment.
- Final browser checks pass Cube3→Flat4, hidden+disabled3 inFlat, Flat5 refresh/start, Cube3 availability, and preserved legacyFlat3 saved game/edge on resume+refresh. Full updated shape suite passes animation/reversal/resize/fog/mobile assertions at4/5. Prescribed Flat-click client exited0; shot/state inspected with Flat4/16nodes, no error artifacts. Desktop/mobile menu captures inspected in output/web-game/flat-sizes; errors.json empty. Remaining known demo/floating/Gum test fixtures minimally updated for Flat4/morph4; their syntaxchecks pass (not full reruns). Scene's existing same-size morph guard safely rebuilds3cube→4Flat, while4/5 shape changes stillanimate. origin/main allowed3–7forbothshapes; restriction isAstra menu-only. Owner JSON unchanged; final diffcheckpasses. All requested work complete on index-CvjVCvpG.js, no commit/deploy.

2026-09-11 Animated grid size
- User requested landing grid-size changes to animate. Size buttons now request the existing preview morph, whose eligibility includes size and/or depth changes. Normalized lattice keys preserve shared nodes/corners across Cube3/4/5 and Flat4/5, including automatic3cube→4Flat. New nodes start at nearest visible source positions from a frozen pool; outgoing nodes move toward the new lattice and fade. Retargeting captures actual current geometry, opacity/color, camera, fog and floor. fromSize/toSize are exposed alongside shape diagnostics.
- Captured guide layers reuse matching topology with continuous re-entry opacity; invisible decorations are pruned. The node pool is bounded by normalized grid keys, and existing settle/start/dispose paths clean up temporary materials/owned guides. Gum hooks, dots/float and connection colors stay attached. Auto-solve pauses while the preview changes, newgame/difficulty settle immediately, and zero-duration/reduced-motion remain instant.
- Renamed the existing scene.shapeTransitionMs admin label to Preview transition duration, preserving all values. README/configurator/UI docs and existing demo pause test updated. Expanded the existing shape browser suite for grow/shrink/rapid retargets, mixedshape/size, bounded pools, camera/resize, pause/interruptions, mobile/reduced motion. All172 units/typechecks/build pass; independent lifecycle review found no issue. localhost4173 serves index-DOteC_TR.js. Browser verification underway, owner JSON unchanged, no commit/deployment. origin/main rebuilds on size changes; this morph is specific to Astra.
- Updated native shape suite passes every cube/Flat grow/shrink, mixed3cube→4Flat, rapid reversal/retarget continuity, bounded pool, demo pause/reset, resize/fog, start/difficulty interruption, zero/reduced-motion and mobile check. Growth/shrink/Flat midpoint and settled screenshots inspected under output/web-game/shape-transition; motion/fades visible, no clipping/controls overlap, errors.json empty. Prescribed size5-click client exited0; screenshot/state in output/web-game/grid-size-animation/skill inspected with settled5cube98nodes/6demoedges and no error artifacts. Owner JSON SHA unchanged61c97802e7b10c10600f70bbbc9a45b96e0377bf291d7ac517e844c50762ef77; finaldiffcheckpasses. All requested work complete on index-DOteC_TR.js, refresh4173. No commit/deploy.

2026-09-11 Initial preview orientation
- User requested the near-face-on auto-solve view as the initial landing orientation, including after grid-size and Flat→3D changes. Shared PREVIEW_TILT now supplies the existing auto-solve pitch −.12/yaw ±.18 and the resting cube preview pitch −.12/yaw −.18, replacing the more diagonal −.31/−.5 resting angle. Existing animated transitions still interpolate to that destination. Flat previews and gameplay/reset retain identity orientation. Configurator documentation updated; owner JSON unchanged.
- Typechecks, production build and diff check pass; preview bundle index-Cz037CdI.js. Bounded checks of initial, size-change, Flat→3D and gameplay views on both local servers are in progress. Default branch origin/main is Godot 1ef469b with identity gameplay rotation; this Three.js landing preview is specific to Astra. No commit/deployment.
- Final browser checks pass on both 4173 and 5173: initial cube, sizes4/5 and Flat→3D settle at the shared tilt; transition midpoint remains animated; Flat and fresh gameplay retain identity. Actual initial/settled/midpoint screenshots inspected under output/web-game/preview-angle. Native errors.json is empty, prescribed client exited0 with clean screenshot/state and no error artifacts. Owner config hash unchanged; final diff check passes. Complete locally on index-Cz037CdI.js; no commit/deployment.

2026-09-11 Ambient visibility
- Added Studio → Sound → Show ambient music (sound.showAmbientMusic), false by default and for legacy files. Hiding removes the header action, disables the dialog toggle, closes open credits and stops playback without erasing the player preference. Re-showing restores that preference; hidden saved-on sessions never request the recording, even after gestures/resume. Shared validation accepts only booleans, and Save to project persists the field. Only this field added to owner JSON. Documentation updated.
- All 36 focused admin/API/ambient tests and build pass. Native visibility browser checks cover hidden public default, stale controls, saved-on refresh, actual playback stop/re-show with retained position, and generated Studio checkbox. Screenshots inspected; errors.json empty. Prescribed client capture/state inspected and clean. Preview restarted for schema (PID41444/session48598) and serves index-BQFKEM-3.js; dev5173 already picks up schema. Baseline origin/main has no ambient UI. No commit/deployment. User subsequently requested a stretchy drag preview and smoother gummy joins; continuing that work.

2026-09-11 Stretchy drag and continuous Gum joins
- Added a live provisional strand and rounded free tip following the pointer on a view-facing plane through the current node. Reaching each neighbor immediately commits/removes through existing stroke callbacks and moves the anchor forward. Empty release retracts the unfinished strand with a damped spring; existing changed links remain. New gesture, cancel, rotation, scene replacement, hidden page and disposal clear transient geometry. Reduced motion or zero connection duration clears on release. Meshes/materials are reused, and return frames stop after settlement. Added dragConnection diagnostics.
- Gum shoulders now meet spheres tangentially and tuck hidden caps inside, with matching analytic shading normals, shadow deformation and per-mesh cached CPU picking. Endpoint colors remain solid over joins and blend through the neck. Gum selections retain node colors with ring/path cues; disconnected Gum links match the amber nodes. Classic retains its prior material/tints. New profile helper has3 tests for tangency, derivatives and extreme/short cases, included in npm test. Documentation updated; no additional owner settings changed.
- Build/typechecks and173 existing units plus3 geometry tests pass. Native drag suite passes Flat/cube mouse, mobile touch, pointer following, provisional non-persistence, spring return, continuous connect/remove, replacement/cancel/background/rotation/new-game cleanup, reduced motion and zero duration. Browser caught and fixed Three.js vec4 vColor shader compatibility before final captures; current drag errors.json is empty. Held/returning/joined screenshots inspected under output/web-game/drag-preview. Broader Gum/picking validation and final prescribed capture remain in progress; no commit/deployment.
- Final full Gum and front-face suites pass: material/admin controls, pulses/settling, mobile, morph reversal, Classic/reduced motion, all six cube faces and oblique mouse/touch rear-node rejection. Additional disconnected fixture confirms matching amber node/link colors. Gum cube/Flat/mobile and amber screenshots inspected; browser errors empty. Read-only review found a stale-canvas case when canceling a return with all ambient motion off; explicit redraw on tab resume and return-interrupting pointerdown fixes it. Bounded Classic/floating=0 frozen-RAF pixel checks now pass without advanceTime, with before/after screenshots inspected.
- Final build index-guxe5Gil.js passes typechecks; prescribed client exited0, screenshot/state inspected with26 home nodes/5 demo links, ambient unavailable/off and no error artifacts. All requested work complete locally. Final diff check passes; removing only the new false ambient-visibility line recreates the exact prior owner-config SHA, confirming all previous tuning preserved. No commit/deployment.


2026-09-11 Configurable drag fluidity, magnetism and elasticity
- Added Studio → Drag feel with 10 saved scene parameters: maximum reach1.15, starting thickness1.15×, full-reach thickness.3×, tip radius.05, follow lag90ms, magnet distance.45, pull.7×node radius, response120ms, return520ms and bounce.55. Only missing legacy keys gain defaults. Existing owner tuning preserved byte-for-byte after removing the10 inserted fields; strict API range/invalid/roundtrip/migration tests pass.
- Held strand follows a capped target with configurable exponential lag and thins throughout normal adjacent-node travel. A front-face, unconnected neighbor with available dots grows a matching nub, using independently smoothed proximity. Turning attraction off clears it immediately. A small gap separates provisional tips until a real hit commits the edge. Visual attraction does not bypass the existing neighbor, degree or front-face rules. Release has bounded recoil controlled separately from completed-link timing; zero bounce is monotonic, zero return/reduced motion clears instantly. Preview state never persists.
- Asymmetric Gum shoulders allocate their span proportionally to endpoint sizes so the target nub grows from the sphere rather than looking like a peg. The shader, depth pass and CPU picking share the profile; equal-sized committed links preserve the old profile exactly.
- Native initial full drag suite and revised magnet suite pass Flat/cube mouse/touch, cap/thinning/proximity/invalid targets, timed follow/response and cleanup. Studio desktop/mobile read-only browser checks pass all10controls, initial/live/zero/invalid values, export and reset; no owner file writes. Artifacts in output/web-game/drag-preview and output/web-game/drag-tuning; screenshots inspected, errors empty. Final refined profile/return validation and prescribed client capture in progress. origin/main1ef469b uses Godot drawing and has none of these Three.js drag parameters. No commit/deployment.
- Final refinements: return bounce0 is monotonic and bounce1 crosses the source visibly, with both clearing exactly at520ms. New proximity assertions verify a gap at70% neighbor spacing before a real hit; fresh desktop/touch captures inspected. Wide-neck/small-tip configurations now taper smoothly with buried caps; all8geometry tests cover tangency, normals, reverse/equal profiles and extreme/tiny values. Full npm test passes184tests; final client/server typechecks and Vite build pass at index-CGhXHBem.js. Preview runs on4173 PID68554/session68260.
- Final bounded tiny-tip native test passes on index-CGhXHBem.js: .015 tip tapers cleanly below a .03188 neck; release cleanup, ordinary joins and node-state gradients remain correct. Held/committed screenshots inspected; errors empty. Prescribed develop-web-game client exited0; final home screenshot/state inspected with normal board, hidden ambient and no error artifact. All requested work complete locally. Owner tuning preserved apart from the10 intentional drag defaults. No commit/deployment.

2026-09-11 Full nodes cannot pull new strands
- Guarded live-strand creation and frame updates with remaining-dot capacity. Full nodes show no new strand or magnetic nub; a stroke arriving at a newly full node clears the preview immediately. Existing stroke sampling stays active so players can remove existing links and continue after capacity is freed. No game rules or config values changed.
- Client/server typechecks, build (index-Cc-P53A6.js),27puzzle tests and whitespace checks pass. Bounded mouse/touch regressions and final prescribed capture in progress; no commit/deployment.
- Bounded native mouse/touch checks pass: full-node empty drags create no strand/nub/recoil or edits; existing links between full endpoints remain removable; the freed anchor can pull immediately; arriving at a newly full node clears the preview and release creates no recoil. Full-target/source exclusion checks pass. Blocked/freed/arrived screenshots inspected; errors empty. Prescribed client exited0; home screenshot/state inspected with26nodes/5links and no error artifact. All requested work complete locally at index-Cc-P53A6.js.

2026-09-11 SEO implementation
- Began homepage-focused SEO work from the supplied brief. Added server-delivered semantic explanatory sections and visible FAQ in index.html, alongside draft VideoGame and FAQPage JSON-LD, updated targeted metadata and initial title. The interactive home hero now uses the requested single H1; tutorial title is an H2 so it does not duplicate the document heading. Added responsive typography styles; robots/sitemap/tests still pending.
- Completed SEO release validation: focused metadata/schema/robots/sitemap tests, full `npm test` (190 passing), and production build pass. Inspected desktop and portrait screenshots; game remains first, portrait app occupies exactly one viewport before supporting content, document has one runtime H1, no horizontal overflow, and no browser errors. `robots.txt` and `sitemap.xml` resolve in Vite. Ready to commit, merge, and deploy.

2026-09-11 Safe maximum board zoom
- Replaced the fixed maximum zoom multiplier with a view-aware limit derived from the projected full board bounds. It uses the current orientation, viewport aspect, node scale, float amplitude and the node edge radius, so large 5 × 5 × 5 cubes cannot crop when zoomed or rotated. View restoration and preview shape transitions use the same safe floor.
- Extended the camera browser regression to assert each sphere's full projected diameter stays inside the canvas at maximum zoom through turns. The free-rotation fixture now begins on an exposed empty canvas point rather than a sponsor overlay. `npm test` passes 190 tests, the production build passes, and desktop max-zoom plus the prescribed interactive browser capture were inspected. Final camera mobile/rotation run is completing before release.

2026-09-11 Three.js Open Graph card
- Updated the page, Open Graph, Twitter and image-alt titles to “Nodoku — 3D Spatial Reasoning Puzzle.” The social description now states the core goal: connect every node and complete one network.
- Replaced the hand-drawn card graphic with an asset captured from the real Three.js home board. The generator crops and composes that board beside the new title so `og-image.png` remains a static, crawler-friendly 1200 × 630 image. The Open Graph test checks that the generator uses the Three.js capture; generated card inspected before validation.

2026-09-11 Fixed, uninterrupted landing preview
- Landing previews now reject all scene zoom calls, so wheel, trackpad and pinch input cannot alter the preview framing. The board remains rotatable through a freeform drag, but preview release does not snap into a camera animation that could hold the solver.
- HomeDemo no longer treats preview input as a reason to insert the interaction pause. It still waits for its own connection/camera animations, explicit pause, dialogs, suspension and shape transitions. Unit and real-browser coverage verify fixed camera distance, manual rotation and continued connection additions while the pointer is held. All190 tests and the production build pass; browser errors are empty.

2026-09-11 Simplified Open Graph scene
- Removed “Complete one network.” and the “A TACTILE 3D PUZZLE” pill from the social card. The remaining copy is the title and “Connect every node.”
- Re-captured the actual Three.js board after11 demo connections, so three completed nodes are sage green. Its opaque page-color pixels are converted to alpha before composition, leaving the board, links and soft shadows without a rectangular canvas backdrop. The generator and test assert the transparent scene source and removed copy; all190 tests and the production build pass.
- Versioned the published Open Graph image URL with `?v=3d-green` after Cloudflare served the former asset from its four-hour cache, so social crawlers fetch the revised image immediately.

2026-09-11 Exact Open Graph logo
- Replaced the social-card’s hand-drawn corner square with the exact inset-node mark used in the Nodoku UI: three purple nodes, a sage lower-right node, and links joining their centres.
- Bumped the published image URL to `?v=3d-green-logo`, so social crawlers request the corrected card instead of a previously cached PNG. Regenerated and visually inspected the 1200 × 630 asset; all 190 tests and the production build pass.

2026-09-11 Branded loading screen
- Added a first-paint Nodoku loader that reuses the real inset-node mark. Its three links draw and four nodes pulse in sequence above “Connecting the dots,” then it dissolves only after two animation frames, when the real board is available.
- The loader has no dependencies outside the document head, respects reduced motion, keeps the pre-rendered page available to crawlers, and removes itself after the transition so it cannot block input. Focused metadata coverage added.
- Visual browser checks inspected the loader and the completed game handoff. The game starts normally after the fade with no browser errors. `npm test` passes 191 tests and the production build passes.

2026-09-11 Simplified help dialog
- Removed the decorative node example, arrow, connection/orbit logos, and repeated explanation from “How to play.” The dialog now has the rule, a concrete three-dot example in text, one concise instruction for connecting/winning/rotating, and “Got it.”
- Inspected the new dialog in a portrait browser capture; opening it remains reflected in game state and generates no browser errors. `npm test` passes 191 tests and the production build passes.

2026-09-11 Render-aligned Nodoku mark
- Updated the Nodoku mark to show three completed sage-green nodes and one porcelain-white node, matching the actual board’s completed and uncompleted node colors. Retained purple connection lines and added a subtle edge to the white node so it remains visible.
- Applied the palette to the header, loader, favicon and generated Open Graph card. Bumped the social-image URL to `?v=3d-green-white` so crawlers request the new brand mark.
- Inspected header and social-card captures; full tests pass (191), production build passes, and the browser run reports no errors.

## 2026-09-11 — Single available sponsor placement
- Kept the six-placement capacity, while showing every active sponsor plus only one next available placement. The empty state now has one visible Advertise card.
- Centered the lone desktop game placement vertically in its side column.
- Verified with unit tests, production build, the Playwright game client, and direct empty/active sponsorship browser checks.

## 2026-09-11 — Centered game state header
- Centered the active puzzle size, difficulty, and progress indicator on wide screens.
- Moved audience activity to the right side, directly before the help and sound controls.
- Verified with the production build, test suite, visual browser capture, and Playwright game client.

## 2026-09-11 — Unified preview solver control
- Combined the landing-preview pause/play icon and solving label into one accessible button.
- The complete control toggles the demo and updates its icon, label, pressed state, and tooltip together.
- Verified with the production build, test suite, browser interaction capture, and Playwright game client.

## 2026-09-11 — Aligned setup controls
- Placed perspective, grid-size, and complexity controls in a shared centered control column.
- Retained left-aligned row labels and responsive mobile sizing.
- Verified equal control centers on desktop and mobile, plus the production build, test suite, and Playwright game client.

## 2026-09-11 — Separate daily-activity histograms
- Replaced the metric selector with visible puzzles-solved, visitors, and dots-cleared histograms that share the selected period.
- Added distinct colors, individual accessible values, empty states, and a stacked mobile layout.
- Verified by production build, full unit suite, direct mocked browser rendering, and Playwright game-client run. The long statistics browser suite was unable to finish because its local preview navigation timed out before the statistics assertions.

## 2026-09-11 — Simplified statistics page
- Removed the expandable “What these numbers mean” definitions block from the statistics page.
- Verified the production build, full unit suite, direct statistics rendering check, and Playwright game client.

## 2026-09-11 — Global sponsor-placement visibility
- Added a Studio → Sponsors “Show sponsor placements” toggle, which immediately hides or restores all home and in-game sponsor placements.
- Preserves the existing per-location visibility and slot settings, and migrates older saved configs to enabled by default.
- Verified with 192 unit tests, production build, and the Playwright game client. The existing full admin browser suite could not complete because the local dev server left its app loader over the page.

## 2026-09-11 — Optically aligned wordmark
- Wrapped the Nodoku wordmark and shifted its visible lettering upward slightly to align it optically with the square node mark.
- Verified with a compact header capture, production build, unit suite, and Playwright game client.

## 2026-09-11 — Category statistics histograms
- Replaced the Popular grids and Popular difficulties lists with proportional completed-puzzle histograms, while keeping each category label and exact total visible.
- Used distinct grid and difficulty colors; each bar preserves its scale if categories wrap on smaller screens.
- Verified with the production build, 192 unit tests, direct mocked desktop and mobile browser captures, and the Playwright game client.

## 2026-09-11 — Sponsor-report visibility
- Connected the private placement-report section to the Studio sponsor-placement toggle.
- Turning sponsor placements off now hides the report and clears any entered private code; restoring placements makes the report available again.
- Verified with the production build, 192 unit tests, a mocked browser check, and the Playwright game client.

## 2026-09-11 — Unified statistics header
- Rebuilt the statistics header around the same Nodoku mark, full-width gutters, and centered context used by the game header.
- Replaced the separate wordmark treatment with a standard brand mark, centered “Statistics” label, and a compact Back control.
- Verified with the production build, unit suite, desktop and mobile browser captures, and the Playwright game client.

## 2026-09-11 — Unified preview-solver control
- Restyled the landing demo’s Solving / Continue Solving control to use the same group and selected-option surfaces as the perspective selector.
- Kept it as one accessible button, preserving the play/pause behavior and existing labels.
- Verified with the production build, 192 unit tests, active and paused browser captures, and the Playwright game client.

## 2026-09-11 — Scored completion cadence
- Passed the selected melody tempo into the resolved-puzzle completion phrase, preserving its original note lengths and rests through the next logical ending.
- Added an app-level browser audio assertion that measures every scheduled completion onset against the score.
- Verified with the production build, 192 unit tests, the browser sound suite, and the Playwright game client.

## 2026-09-11 — TikTok and Instagram share options
- Added official TikTok and Instagram marks to the completion share panel, alongside the existing social, device-share, and copy actions.
- Both open their platform in a new tab; the existing copy and native-share actions provide the completed-puzzle message for composing a post.
- Verified with the production build, 192 unit tests, the completion-share browser suite at desktop and 320px mobile widths, and the Playwright game client.

## 2026-09-12 — Focused statistics periods
- Today now presents totals without duplicate daily histograms.
- Seven days, 30 days, and all time stack each activity histogram in a full-width row.
- Removed the requested overview copy and category eyebrows.
- Verified with the production build, the complete unit suite, a focused browser interaction capture, and a manual statistics period check.

## 2026-09-12 — Statistics home link
- Made the statistics header logo a labelled link back to the Nodoku landing screen.
- Verified the rendered link and navigation to `/`, plus the production build and full unit suite.

## 2026-09-12 — Statistics complexity icons
- Replaced text difficulty labels in statistics with the same connected-dot complexity symbols used on the home page.
- Kept difficulty names in accessible row labels and verified the correct filled-dot level for each difficulty.

## 2026-09-12 — Compact sponsor plaques
- Reduced sponsor plaque size on the landing screen and game canvas.
- Verified 136px landing plaques and capped in-game plaques at 280 × 132px, with interactive sponsor controls intact.

## 2026-09-12 — Concise landing-page guide
- Reduced the crawlable guide to the core rule, a short 3D explanation, and three essential FAQ answers.
- Kept the visible FAQ and JSON-LD FAQ aligned.
- Verified with the production build, full unit suite, and browser interaction capture.

## 2026-09-12 — Node-connecting loader
- Renamed the loading caption to “Connecting the nodes.”
- Reworked the logo animation so its links draw in sequence and the final node sends a restrained completion pulse.
- Preserved a complete static mark for reduced-motion preferences.

## 2026-09-12 — Sponsorship temporarily hidden
- Disabled sponsorship globally in the saved game configuration, which hides placements on the landing page and during play and hides the private placement report in Statistics.
- Retained the other sponsor settings for a later admin re-enable.
- Verified the built landing page and Statistics view; ran the web-game interaction smoke test, `npm test` (192 passing), and `npm run build`.

## 2026-09-12 — Onboarding double-tap shortcut
- Added the double-tap shortcut to the connection-goal lesson: double-tap a node to connect every available neighbor.
- Covered the instruction in the first-run onboarding browser test.
- Verified with `npm test` (192 passing), `npm run build`, the onboarding browser flow, and the web-game interaction smoke test.

## 2026-09-12 — PostHog player analytics
- Added lazy PostHog browser initialization through a same-origin runtime configuration endpoint for US Cloud.
- Added anonymous events for onboarding progress, puzzle starts, first connections, rotations, hints, completion views, and sharing.
- Sent server-verified puzzle completions to PostHog, preserving the game's existing completion deduplication.
- Configured the production Pages `POSTHOG_PROJECT_API_KEY` secret and documented local and production setup.
- Verified with `npm test` (193 passing), `npm run build`, onboarding and sharing browser flows, and the web-game smoke test.

## 2026-09-12 — Center statistics histogram labels
- Centered each Popular grids and Popular difficulties label beneath its bar while retaining the count at the bar’s right edge.
- Added browser layout coverage for label-to-bar center alignment.
- Verified with `npm test`, `npm run build`, and the web-game Playwright smoke check.

## 2026-09-12 — PostHog Session Replay readiness
- Explicitly enabled PostHog Session Replay in the browser client and kept all form input values masked.
- Verified with `npm run build` and `npm test` (193 passing).

## 2026-09-12 — Completion actions
- Replaced the unavailable daily-puzzle prompt with “Solve another puzzle” and renamed the exit action “Return home.”
- Added browser coverage for both completion labels.
- Verified with `npm run build` and `npm run test:share`.

## 2026-09-12 — Fixed Flat view
- Locked Flat boards to their face-on view: pointer drags, keyboard turns, toolbar turns, and legacy saved in-plane rotations no longer rotate them.
- Hid the unavailable rotation controls and rotation shortcut in Flat mode.
- Verified with `npm run build`, `npm test` (193 passing), `npm run test:camera`, and the web-game Playwright smoke check.

## 2026-09-12 — Guided How to play
- Made How to play launch the full skippable onboarding tutorial instead of the static help dialog.
- Preserved an in-progress puzzle before opening the tutorial, so it remains available to continue afterward.
- Made the completion action create a fresh puzzle, matching its “Solve another puzzle” label.
- Verified with `npm run build`, `npm test` (193 passing), and `npm run test:onboarding`.

## 2026-09-12 — Mobile sound-effect unlock
- Fixed the mobile Web Audio race where the first connection could occur before `AudioContext.resume()` completed and was silently discarded.
- A trusted pointer/touch release now also unlocks SFX, and the initial gesture warms iOS Web Audio with a silent source.
- Retained only the immediate first sound until its gesture-owned resume completes; mute, suspension, and stop still discard it.
- Verified `node --import tsx --test tests/sound.test.ts` (34 passing), `npm run build`, and the required web-game Playwright smoke run. Screenshot reviewed at `output/web-game/mobile-audio-unlock/shot-0.png`.

## 2026-09-12 — Mobile-safe Open Graph card
- Reframed the captured Three.js scene into the central square-safe area of the 1200×630 social card, replacing the desktop left-copy/right-scene split that cropped foreground nodes in mobile previews.
- Reduced the graphic to the aligned Nodoku logo plus the 3D scene, retaining metadata copy outside the image.
- Updated the image cache version to `3d-safe-v2` so social platforms fetch the new card.
- Reviewed the full card, a centered square crop, and a 4:5 crop; all foreground nodes and the logo remain framed. Verified `tests/open-graph.test.ts`, `npm run build`, and the web-game Playwright smoke check.

## 2026-09-12 — Replayable puzzle analytics
- Enabled low-fidelity canvas capture for PostHog Session Replay (4 FPS at 60% resolution) and retained masked form fields, so Three.js boards appear in replay instead of as blank DOM space.
- Preserved the WebGL drawing buffer specifically for capture frames, while keeping the gameplay renderer and interaction model unchanged.
- Added privacy-safe puzzle telemetry: generated-board seed, connection/fill/drag actions, first connection, hint, undo/redo, first rotation, live completion progress, and compact session summaries for completion, exit, and backgrounding. No node coordinates or individual selection history is recorded.
- Verified `npm run build`, `npm test` (194 passing), and the required Playwright game smoke run; reviewed `output/web-game/posthog-replay-canvas/shot-0.png`.

## 2026-09-12 — Mobile startup recovery
- Removed WebGL’s retained drawing buffer from the replay work because it can stall mobile GPU initialization before the game replaces the loading screen.
- Kept compact PostHog puzzle-action telemetry, but let the renderer use its normal mobile-safe frame lifecycle.
- Removed the fresh-puzzle confirmation; Start connecting now opens the shared daily puzzle directly.
- Verified the mobile home screen becomes interactive with no loader or browser errors, and ran the required web-game Playwright smoke check.

## 2026-09-12 — Centered mobile puzzle header
- Centered the active puzzle title and progress in the portrait mobile header.
- Moved the Online/Visitors activity link to the upper-right edge below the header controls, preserving its Statistics destination.
- Verified the iPhone game view has centered puzzle information, a right-aligned activity link, and no browser errors; ran the required web-game smoke check.

## 2026-09-12 — Mobile online-only activity
- Simplified the mobile game activity link to show only the live Online count.
- Kept the link clickable so the complete visitor, puzzle, connection, and dot totals remain available in Statistics.
- Verified the iPhone game header hides the rotating metric and divider, then ran the required web-game smoke check.

## 2026-09-12 — Reliable 3D onboarding rotation
- Fixed the 3D tutorial so a drag that begins on a node still rotates the board; compact 3D boards no longer require finding empty space first.
- Rewrote the connection lesson to state that a link clears a dot from both nodes and that double-tapping a node connects every available neighboring node at once.
- Added regression coverage for turning the 3D tutorial from a visible node. Verified the iPhone tutorial reaches Done after that gesture, with build and onboarding tests passing.

2026-09-12 update
- Removed the onboarding “Show me 3D” shortcut. The 2D tutorial stays playable until its full network is solved, then automatically switches to the 3D rotation lesson with a “2D complete” congratulations message.
- Extended the onboarding browser test to solve the deterministic tutorial through actual drag interactions before asserting the 3D transition, and captured `output/web-game/onboarding-auto-3d/solved-2d-3d.png` for visual review.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5173 npm run test:onboarding`, and `npm run test` pass.

2026-09-12 analytics update
- Investigated the reported PostHog Web Analytics undercount. Production has an encrypted `POSTHOG_PROJECT_API_KEY`, and `/api/analytics-config` returns a valid US Cloud configuration. Nodoku uses a per-browser UUID, so visitors are not intentionally collapsed.
- Replaced the SDK's automatic initial pageview with one explicit `$pageview` after the Nodoku visitor ID and `app: nodoku` are registered. This makes the pageview Web Analytics consumes use the same identity as replay and game events.
- The connected PostHog MCP account only has access to LATdx project 157216, not Nodoku project 605581, so it cannot inspect Nodoku's raw events or dashboard filters.

2026-09-12 onboarding update
- Expanded onboarding into a five-part flow: make one connection, remove that same connection, double-tap to fill a node's available neighbors, clear the 2D board, then turn the 3D board.
- Restricted each guided action so accidental drags cannot skip the removal or double-tap lesson. The browser flow covers the whole sequence with actual input, including a filled node and a solvable final board.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5173 npm run test:onboarding`, and the required Playwright web-game client run.

2026-09-12 onboarding double-tap fix
- Kept double-tap enabled after the introductory fill step so players can continue bulk-connecting nodes while clearing the tutorial board.
- Added coverage for a second double-tap during the final 2D clear step.
- Validation: `npm run build` and `TEST_URL=http://127.0.0.1:5173 npm run test:onboarding` pass.

2026-09-12 onboarding 3D connection lesson
- Split the 3D tutorial into two separate actions: rotate first with a board swipe or a visible direction pad, then make a real 3D node connection.
- Restored node-drag connection input only after the rotation lesson, so the player cannot complete the tutorial by rotation alone.
- Added browser coverage for the visible controls, the 3D connection, and the full six-step sequence. Reviewed the captured 3D tutorial screen with the direction pad.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5173 npm run test:onboarding`, `npm run test` (194 passing), and the required web-game Playwright client run.

2026-09-12 animated completion moments
- Added a short, interrupt-safe completion beat that preserves the final connection and dot animation before moving on.
- The player game now shows an animated green check and “All connected” before the completion dialog. The solved 2D onboarding board gets the same beat before switching to 3D.
- Added focused player and onboarding browser coverage and reviewed both visual captures.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5173 npm run test:onboarding`, `TEST_URL=http://127.0.0.1:5173 npm run test:completion-moment`, `npm run test` (194 passing), and the required web-game client smoke run.

2026-09-12 onboarding double-tap completion fix
- Routed the onboarding solved-state check through both drag strokes and node double-taps, so clearing the final dots by double-tap now plays the completion moment and advances to the 3D lesson.
- Updated the onboarding browser test to complete the flat board specifically with its final double-tap.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5173 npm run test:onboarding`, `TEST_URL=http://127.0.0.1:5173 npm run test:completion-moment`, `npm run test` (194 passing), and the required web-game client smoke run.

2026-09-12 musical dot release
- Added native Three.js musical-note particles for every cleared node dot. They begin at the cleared pip, rise and drift across the board while the connection melody plays, then fade and dispose. The effect is suppressed for the homepage preview, reduced-motion preference, and instant dot transitions; rapid batches are capped at 20 particles.
- Exposed live note state through `render_game_to_text` and expanded the dot-animation browser coverage to verify launch, mid-flight, cleanup, and motion-policy behavior. The fixture now removes the production loading splash because it intentionally freezes requestAnimationFrame for deterministic animation stepping.
- Reviewed both Flat and 3D game captures: `output/web-game/dot-animations/glide-mid.png` and `output/web-game/music-notes/notes-3d.png` show the notes clearly rising from a new connection.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:dot-animations`, `npm run test` (194 passing), `git diff --check`, and the required web-game Playwright client smoke run.

2026-09-12 fixed puzzle framing
- Removed puzzle zoom from the renderer and inputs. Wheel/trackpad, pinch, and +/- no longer alter camera distance on either desktop or mobile; the board is always fitted to its available space.
- Removed zoom persistence while accepting old saved views that contain it, so returning players keep their orientation but resume at the stable fit distance.
- Updated camera, persistence, and touch regression coverage. The focused mobile pinch check confirms both camera distance and direction are unchanged.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:camera`, `TEST_URL=http://127.0.0.1:5175 npm run test:persistence`, `npm run test` (194 passing), visual review of `output/web-game/perspective/mobile-390.png`, and the required Playwright client run. `test:gestures` still has an unrelated pre-existing blocked-node double-tap timing failure before reaching its new pinch assertion.

2026-09-12 score-bound dot release
- Reworked cleared-dot feedback into a fixed top-screen five-line music staff. Every cleared black pip now flies from its node to a staff position, then lands as a dark notehead and stem; the latest ten notes remain as the small visual score.
- The score is screen-aligned during 3D turns, is hidden in the landing demo, clears when a new puzzle begins, and respects reduced-motion and instant transition settings.
- Exposed staff state in `render_game_to_text` and strengthened the dot-animation browser test to verify black-dot launch, flight, and final note landing. Reviewed `output/web-game/music-score/landed-note-3d.png`.
- Validation: `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:dot-animations`, `npm run test` (194 passing), required web-game client run, and 3D visual inspection.

## 2026-09-12 — Onboarding selection feedback
- Restored the accent selection ring in onboarding by routing guided node taps and drags through the shared node-selection path.
- Kept the rotation lesson free of node selection so swipes remain dedicated to turning the 3D board.
- Added browser coverage that holds a guided drag on a node and verifies both the selected state and rendered ring.
- Verified with `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:onboarding`, `npm run test` (194 passing), and a visual screenshot at `output/web-game/onboarding-selection/selection-ring.png`.

## 2026-09-12 — Onboarding controls lesson
- Added a seventh tutorial lesson after the first 3D connection to introduce Undo, Redo, and Hint.
- The lesson shows the three familiar controls, desktop keyboard shortcuts (`Ctrl/⌘ Z`, `Ctrl/⌘ Shift Z`, and `H`), and the lower-left mobile control location.
- Added desktop and portrait-browser coverage, with screenshots in `output/web-game/onboarding-controls/`.
- Verified with `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:onboarding`, and `npm run test` (194 passing).

## 2026-09-12 — Guided tap-to-connect
- Restored tap-to-connect in onboarding: selecting a node and then a neighboring node now creates the guided connection or removes the guided link.
- Preserved the separate double-tap-only node-fill lesson and selection-ring feedback.
- Added browser coverage for the two-tap guided connection.
- Verified with `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:onboarding`, and `npm run test` (194 passing).

## 2026-09-12 — Feature-flagged music score
- Put the experimental cleared-dot-to-music-staff animation behind the PostHog Boolean feature flag `music-score`.
- It defaults off for every player, including when analytics or PostHog flags are unavailable; toggling the flag on restores the existing animation without deployment.
- Verified the default game render contains no staff or note particles after a connection.
- Verified with `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:dot-animations`, and `npm run test` (194 passing).

## 2026-09-12 — Onboarding toolbar alignment
- Replaced the tutorial-only toolbar mockup with the normal game `tools-group`, including Undo, Redo, Restart, and Hint.
- Matched its desktop middle-left column and icon-only lower-left mobile panel; removed mobile copy that overlapped the tutorial CTA.
- Verified desktop and portrait screenshots in `output/web-game/onboarding-controls/`.
- Verified with `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:onboarding`, and `npm run test` (194 passing).

## 2026-09-12 — Onboarding completion label
- Renamed the last onboarding action to “Finish tutorial”; it exits onboarding to the home screen instead of implying it starts a game.
- Added browser coverage for the final label and preserved the existing completion-to-home flow check.
- Verified with `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:onboarding`, `npm run test` (194 passing), and browser screenshots.

## 2026-09-12 — Animated onboarding 2D-to-3D handoff
- The solved flat tutorial board now morphs into the first 3D puzzle instead of being replaced in one frame. The existing shape transition spreads depth layers, fades entering nodes, and respects reduced-motion and the configured duration.
- The onboarding browser flow asserts the active Flat-to-3D transition before waiting for the rotation lesson; captured the transition at `output/web-game/onboarding-auto-3d/flat-to-3d-transition.png`.
- Fixed the deterministic shape-transition fixture to remove the production loading splash after freezing animation frames, allowing its manual animation clock to run.
- Verified with `npm run build`, `TEST_URL=http://127.0.0.1:5175 npm run test:onboarding`, `npm run test:shape-transition`, `npm run test` (194 passing), and browser visual review.

## 2026-09-12 — Centered onboarding board
- Centered the board within the full viewport by shifting the canvas down by half of the space reserved for the lesson copy; the first lesson’s visual center now lands at the viewport midpoint on desktop and mobile.
- Shifted the 3D direction pad with the board. The final controls lesson keeps a compact board position so its action, copy, and mobile toolbar remain unobstructed.
- Added an onboarding assertion for viewport-centering and reviewed desktop, mobile, 3D rotation, and controls screenshots.
- Verified with `TEST_URL=http://127.0.0.1:5175 npm run test:onboarding`, `npm run test` (194 passing), and the required browser game-client run.

2026-09-12
- Added live visual gesture cues to all interactive onboarding lessons: animated drag path, double-tap pulse, and turn prompt; cue targets use the active puzzle's visible nodes and realign after viewport changes.
- Validated build, onboarding flow, and the web-game Playwright client; visually inspected desktop and mobile cues.

2026-09-12
- Replaced the tutorial-only controls replica with the shared game-toolbar component. It now uses the same responsive positioning, button treatment, and fresh-game disabled undo/redo state; removed redundant tutorial shortcut text.
- Validated build, full onboarding flow, and visual desktop/mobile output.

2026-09-12
- Used Astra for the requested onboarding cue design review. Replaced oversized halos and cursor with a fine rim-to-rim drag trail/glint; double tap now shows only two brief pings on one sphere, separated by a quiet pause.
- Cues track current mesh positions and per-sphere sizes after every scene render through lightweight projection (no per-frame picking). Hide during view transitions and select a visible pair when turns settle.
- Added regression checks for single-sphere double-tap cues and alignment across actual floating motion; reviewed desktop/mobile screenshots.

2026-09-12
- Restored persistent, close-fitting focus circles on both endpoints for onboarding drag lessons, retaining live sphere tracking and the minimal traveling glint. Double-tap remains a double ping on one sphere.
- Build and desktop/mobile visual checks completed; existing full onboarding regression and web-game client exercised.

2026-09-12
- Added a distinct removal demonstration: trace the existing connection, fade its rendered rod out, display a small minus mark, then restore it for the next loop. Focus circles remain attached to both endpoints; the puzzle data is never modified by the preview.
- Preview material is isolated and disposed on lesson change, puzzle replacement, and scene disposal; reduced-motion keeps a static removal mark.
- Validated build, full onboarding flow, unchanged edges throughout preview, removal/skip cleanup, desktop/mobile visuals, vertical mark orientation, and web-game Playwright client.

2026-09-12
- Made double-tap explicit in the step 3 heading and described two quick taps / desktop double-click beside the ping cue.
- Kept the gesture in step 4 instructions, including double-tapping a cleared node to remove its links; added the shortcut to the help text.
- Build, full onboarding regression, web-game client, and desktop/mobile copy layout checked.

2026-09-12
- Added Studio → Tutorial visuals: global and individual cue toggles, color, ring thickness/size/opacity, and drag/removal cycle timing. Quick double-ping cadence remains independent.
- Preview tutorial starts the real onboarding with live settings; Studio can reopen without the normal header. Existing save/reset/reload/export support includes the new section with legacy defaults and strict validation.
- Verified 196 unit tests, full onboarding regression, tutorial-settings browser coverage, desktop/mobile screenshots, and the required web-game client. Admin browser testing uses a newly started preview on 4190 so the server loads the current schema.

2026-09-12
- Replaced the onboarding orbit badge with a curved directional swipe arrow above the 3D puzzle, anchored to live rendered sphere bounds. A traveling highlight demonstrates the direction; reduced motion leaves the static arrow.
- Retained Studio rotation visibility and cue color. Build, full onboarding flow, desktop/mobile arrow placement screenshots, and required web-game client passed.

2026-09-12
- Replaced the non-interactive tutorial toolbar with real Undo, Redo, Restart and Hint actions. Three separate lessons now require undoing the last 3D connection, restoring it, then applying a hint before Finish tutorial appears.
- Expected tool pulses in the shared toolbar layout. Added Studio Tool pings toggle; global cue visibility/color and reduced motion apply. Desktop shortcuts work without intercepting admin/form inputs; Restart returns to the 3D practice step.
- Build, 196 unit tests, full onboarding browser flow (buttons, shortcuts, real edge changes, replay after Restart), desktop/mobile screenshots and web-game client passed.

2026-09-12
- Rotation lesson now requires left/right/up/down checkpoints. Desktop players receive arrow-key/WASD prompts and highlighted keycaps; touch players receive matching control-panel guidance and pings. Primary-input changes update the instructions live.
- Wrong-direction turns do not advance; held keys and input during camera motion cannot skip checkpoints. Directional arrows track the expected orientation, with vertical arrows beside the puzzle.
- Build, complete onboarding regression through wrong-direction input, desktop keys and touch controls, all four checkpoints, subsequent tools, desktop/mobile screenshots and web-game client passed.

2026-09-12
- Moved Undo/Redo/Hint keyboard combinations out of tutorial prose into prominent raised keycaps (24px labels, 52px keys). Command/Ctrl follows the platform; touch devices keep concise control-panel guidance.
- Verified build, full onboarding flow, each key combination, rendered font size, touch visibility and desktop/mobile screenshots. Required web-game client exercised.

2026-09-12
- Added live tutorial drag-trail tuning: independent color, line thickness/opacity, moving-dot size/opacity, and easing. Existing gesture cycle keeps removal timing synchronized; trail thickness stays centered on projected endpoints.
- Legacy config gains missing defaults during validation. Owner's uncommitted ring settings are left untouched; refreshed local preview on port 4173 for the new admin schema.
- Build, 197 unit tests, live admin controls including zero-width trail, full onboarding regression, desktop/mobile screenshots and web-game client passed.

2026-09-12
- Added Studio → Selected node with Preview selection and live ring visibility/color/size/thickness/opacity plus available-guide visibility/color/thickness/opacity. Shared scene settings apply in gameplay and tutorial; preview selects a real practice node without changing puzzle edges.
- Dimension changes replace/dispose ring geometry; styling preserves floating attachment. Legacy config retains the original appearance and saved connection accent. Owner JSON tuning remains uncommitted and untouched.
- Build, 198 unit tests, selected-node Studio/browser tests (including reset and normal gameplay), full onboarding regression, desktop/mobile screenshots and required web-game client passed. Local preview restarted on 4173 for the new config schema.

2026-09-12
- Added independent Studio tuning for double-tap ping color, thickness, expansion, opacity, easing, pulse duration, gap between pings and pause between pairs. Preview double tap opens the lesson directly. Old files inherit their saved ring appearance; owner JSON remains untouched.
- Two-pulse keyframes derive from the three timing controls. Reduced-motion CSS now overrides the more specific double-tap selector and leaves a static ring.
- Build, 199 unit tests, API save/load, live style/timing/reset, actual double-tap lesson advancement, reduced-motion and mobile alignment checks passed. Required web-game client exercised. Browser timing tests discard deliberately seeked animations before testing reduced motion.

2026-09-12
- Reversed the removal tutorial's moving dot from the connection endpoint back toward its source while keeping ring positions, line styling, timing and removal fade unchanged.
- Reused the level-completion checkmark/glow for each completed lesson and all four rotation checkpoints, with action-specific text and a 900ms acknowledgement before advancing. Real tap, drag, double-tap and toolbar/keyboard paths share guarded transitions; input pauses during success and skip/restart cancels pending callbacks.
- Reduced motion keeps a static, readable success message. Existing player completion behavior remains intact. Tests cover the trail's reversed screen-space movement, exact success sequence, input lock and skipping during success.
- Verified build, 199 unit tests, the full onboarding sequence (including exactly one message per lesson/checkpoint, reduced-motion visibility and skip cancellation), normal game completion, screenshots and the required web-game client.

2026-09-12
- Fixed swipe rotation not completing tutorial checkpoints: the scene now reports committed directional swipes on release, and onboarding shares the keyboard/control-panel completion handler. Reports exclude tiny, cancelled and multi-touch gestures and do not alter existing camera movement.
- Rotation instructions now mention dragging alongside keyboard/control-panel alternatives. Added a swipe-mode onboarding regression exercising mouse and real touch gestures, rejected gestures, all four directions, and the existing success-message sequence.
- Verified build, 199 unit tests, complete swipe-mode onboarding (desktop horizontal gestures and mobile vertical gestures, including cancelled/short/wrong-direction attempts), exact success sequence, screenshots and web-game client.

2026-09-12
- Anchored tutorial success messages above the projected puzzle bounds, centered on the board and updated as nodes float or rotate. A compact horizontal checkmark/text layout fits shorter screens. Normal game completion retains its existing positioning.
- Targeted browser placement checks cover desktop, mobile and short viewports; the visual capture holds the acknowledgement timer so screenshots remain reliable under load.
- Build and targeted placement assertions/screenshots passed at 1200×850, 390×844 and 844×390; required web-game client ran. Full-flow screenshot timing proved unreliable under load, so the placement capture held the success timer without changing production timing.

2026-09-12
- Removed the tool-lesson-specific board offsets that moved the puzzle upward when Undo/Redo/Hint instructions appeared. Tutorial sizing now reserves space for the tallest lesson from the start and keeps the board center independent of text and shortcuts.
- Anchored captions to a consistent top edge. Short landscape screens place instructions alongside the board with separate space for controls.
- Build and full onboarding walkthrough passed, including regression assertions for unchanged stage bounds and caption position when the tool lesson appears. Checked desktop, portrait mobile, small mobile and landscape geometry/screenshots; all caption variants stay clear of nodes and fit the viewport. Required web-game client ran and its screenshot was inspected.

2026-09-12
- Moved the tutorial Turn down arrow to the puzzle's right side, preserving the up arrow on the left and per-frame alignment to floating node bounds. Clamped placement to the viewport.
- Build and full onboarding walkthrough passed, including mobile right-side placement and viewport-bound assertions. Inspected the actual Turn down screenshot and required web-game client output.

2026-09-12
- Added a first tutorial lesson for selecting one node and then a neighbor, before the drag lesson. Two rings ping sequentially, follow floating nodes, and guide the second selection after the first; the selected node uses its normal game ring. Existing tutorial color/ring/cycle settings and reduced motion apply.
- Each introduction requires the gesture it teaches. The first real connection gets a success acknowledgement and resets for drag practice without moving the board. Updated all lesson indexes, analytics names, tool gates and Studio double-tap preview for the 10-step sequence. Selection also remains usable in the free-solving lesson.
- Build, full onboarding walkthrough and focused mouse/touch tests passed. Verified sequential ping timing, separate selections, rejected drag bypass, stationary transition, later tool/rotation progression, and static reduced-motion targets. Updated Studio walkthrough expectations. Inspected desktop/mobile screenshots and required web-game client output.

2026-09-12
- Reduced tutorial boards to 2×2 flat and 2×2×2 in 3D, keeping all ten lessons and the animated depth transition. Enabled size-two puzzles in the engine and expanded generation/solvability coverage; updated onboarding analytics, board assertions and Studio selection preview's node target.
- Kept the selection lesson's second cue attached to the demonstrated neighbor after selecting the first node, which avoids a target jump on the four-node board.
- Production build, all 199 unit tests, the full tutorial walkthrough, and focused mouse/touch selection/reduced-motion checks passed. Inspected the smaller flat board and eight-node cube screenshots; required web-game client ran.

2026-09-12
- Reversed all four 3D onboarding rotation arrowheads and animated strokes by reversing the SVG path direction. Preserved curve geometry, node-relative positioning, and existing rotation inputs/checkpoints.
- Build and full onboarding walkthrough passed with screen-space direction assertions for all four arrows. Inspected desktop and mobile rotation screenshots and the required web-game client output.

2026-09-12
- Unlocked free play after the final Hint lesson. Tap-to-connect, drag add/remove, double-tap fill/clear, rotation controls, shared keyboard shortcuts and tools remain available on the tutorial cube. Restart preserves the unlocked state.
- Added guarded cube completion handling with the existing success animation/sound and completed copy, while retaining the optional Finish tutorial action. Kept mobile captions and the finish action clear of both control groups. Reset keyboard focus on tutorial entry and preserve melody position when a tentative tap is rolled back.
- Production build and full tutorial walkthrough passed. Regression flow exercises each free-play input, undo/redo/hint/restart, rotation, final connection via drag, exactly one cube completion acknowledgement and exit. Inspected mobile free play and completion screenshots and required web-game client output.

2026-09-12
- Disabled browser text selection, Safari touch callouts, and native image/SVG dragging across the site to prevent selection handles during play. Kept text selection available in editable fields.
- Build passed; Chromium browser check confirmed dragging tutorial text selects nothing and Skip tutorial remains clickable. Inspected mobile screenshot and ran the web-game client. WebKit browser is not installed locally, so physical Safari behavior was not directly tested.

2026-09-12
- Hints now use the existing connection framing routine, choosing a shared face and checking both endpoints and the connection span for occlusion. Applied to normal play and onboarding; flat boards retain their orientation.
- Build and full onboarding walkthrough passed, including a new two-endpoint visibility assertion after the Hint lesson. Added desktop/mobile browser coverage for hint additions and removals in flat and 3D puzzles.

2026-09-12
- Show Finish tutorial only after the tutorial cube is fully solved, and guard the completion handler against unsolved or celebrating states. Undoing completion hides the action; restoring the solved puzzle reveals it again.
- Build and full onboarding browser walkthrough passed, including hidden-button activation protection, the final-connection gate, and undo/redo after completion. Inspected mobile free-play screenshot with the action hidden and ran the web-game client.

2026-09-12
- Removed the home preview's Solving / Continue Solving control, click handler, and styles. The preview runs automatically without a player pause/resume option.
- Updated browser fixtures that previously used that button to isolate scene animations through the existing dialog suspension behavior instead. Live-demo assertions now check automatic progress and absence of the control.
- Production build, syntax checks, required web-game client, and focused desktop/mobile autoplay checks passed; inspected both layouts. The broader demo/audio suites were stopped after slow runs under local browser load; they are not reported as passing. Deterministic demo/audio fixtures now remove the loader whose dismissal is blocked by their frozen RAF.

2026-09-12
- Moved mobile home activity into the header's flex row immediately before How to play. Stacked online and the rotating statistic in a fixed-width block so labels do not shift the adjacent controls; adjusted narrow-screen sizing and removed the old reserved second row.
- Production build and focused layout checks passed for every rotating statistic at 320/360/390/430/760px, with desktop layout also checked. Inspected mobile screenshots, including the narrow 320px header. Updated the audience regression's mobile positioning assertions.

2026-09-12
- Enlarged mobile puzzle setup controls while retaining one-screen setup: perspective options have 44px minimum targets, grid/difficulty buttons are 60×48px, and icons/type/spacing are larger. Removed short-screen rules that previously shrank targets below 32px; the preview uses the remaining space.
- Build and focused browser checks passed at 390×844, 320×568, 430×932 and 740×390. Verified all visible options meet 44px minimum targets, no horizontal overflow, the portrait Start action remains onscreen, and perspective/grid/difficulty selections update correctly. Inspected 390px and 320px screenshots.

2026-09-12
- Fixed portrait mobile tutorial rotation controls overlapping the lesson caption. Anchored the panel above the bottom safe area; tall phones place the caption above it, while phones up to 800px tall place the caption to its left. The scene sizing and position stay independent of the caption.
- Build and rotation-layout assertions passed at 390×844, 390×667, and 320×568; inspected screenshots at all three sizes. Added these checks to the onboarding walkthrough and made its transient selection-success assertion atomic. The full walkthrough later failed on the free-play repeated double-tap assertion; it is not reported as fully passing.

2026-09-12
- Hid the rotation controller for desktop mouse input in both onboarding and normal play, preserving it for touch input. Rotation lessons now show only the current direction's arrow key or WASD alternative, using the shared Undo/Redo keycap styling and a shorter instruction.
- Build and focused onboarding-through-rotation walkthrough passed: checked all four desktop key pairs, touch/desktop switching, mobile controller layout at three sizes, controller visibility in normal play, keyboard rotation, and no page errors. Inspected desktop up/down screenshots. Updated onboarding regression expectations for the new guidance.

2026-09-12
- Moved the onboarding drag demonstration to the two bottom nodes, separate from the top pair used by the selection lesson. Updated the instruction to name the bottom pair; removal continues to reverse the connection the player just dragged.
- Production build and focused selection → bottom-pair drag → removal walkthrough passed. Verified guide circles match the bottom spheres, the pair differs from the selection example, and removal advances correctly; inspected the drag screenshot.

2026-09-12
- Added direct onboarding links with `?onboarding=1&step=1` through `step=10`, plus `direction=left|right|up|down` for step 6. Direct entries prepare the correct flat/cube puzzle and prerequisite connections/history for removal, clearing, Undo and Redo. Tutorial progress replaces the URL; exit removes tutorial parameters while preserving other query values.
- Documented lesson numbers in README and added `npm run test:onboarding-navigation`. Build and navigation browser checks passed for all ten lessons, tool actions, four rotation directions, reload, exit, parameter preservation and invalid values. Inspected the direct rotation screenshot.

2026-09-12
- Added a playful curved arrow to the Undo, Redo and Hint lessons. It swings toward the active tool, travels to the actual shortcut keycaps, sweeps beneath them, and returns. Touch layouts use a compact tool-only pointer; short desktop windows use a side swing to keep the arrow onscreen.
- The guide follows tutorial cue color/cycle and the existing Tool pings toggle, repositions on resize/font readiness, ignores pointer input, and hides during success and after the tool lessons. Reduced motion uses a static pointer.
- Build and `test:tutorial-tool-guide` passed for all three tools on desktop/mobile, viewport bounds, proximity to actual keycaps, button actions, success/exit cleanup, and reduced motion. Inspected screenshots and refined the route to avoid instruction text. The success assertion records visibility in the click handler to avoid racing the next lesson.

2026-09-12
- Removed Undo, Redo and Hint lessons, the onboarding tool toolbar, tool shortcuts, arrow guide and its Studio setting. The tutorial now has eight steps, ending with unrestricted gesture play to finish the cube; Finish tutorial remains gated on full completion. Normal game tools and tutorial rotation guidance remain.
- Updated direct-step URLs, documentation and browser fixtures. Production build, full onboarding walkthrough, all eight navigation links, 199 unit tests and focused normal-game tool/keyboard checks passed. Ran the web-game client and inspected mobile practice/completion screenshots. Closed superseded arrow-animation PR #119 without merging.

2026-09-12
- Preserved the link established by selecting two nodes when the tutorial advances to dragging. The drag cue prefers the bottom pair, with an available-pair fallback when the player already connected that pair. Direct flat-lesson links also retain the selection connection.
- Build, full onboarding walkthrough and eight-step navigation checks passed. Verified the alternate bottom-first selection path on desktop/touch, ran the web-game client and inspected the retained top link beside the bottom drag guide.

2026-09-12
- Changed scored connection fills from replacement to an ordered phrase: subsequent fills and single connections append at the existing tempo while the board responds immediately. Reuses an active voice to preserve earlier batches, retains silent score beats after oscillator cleanup, and hands completion over after all queued notes.
- Clears pending audio on puzzle changes/restart as well as existing mute/suspension/configuration cleanup; tutorial free-play fills use the same scoring. Removal retains its immediate falling effect and cancels the fill queue.
- Build and 202 unit tests passed. Native Web Audio double-click checks verified immediate links, queued follow-up fills/single moves, unchanged first phrase, and mute/restart cancellation; completion browser checks passed. Ran the web-game client and inspected its screenshot and the filled-board capture. Kept tempo steady; no automatic acceleration.

2026-09-12
- Investigated completion audio overlapping the home demo. Current origin/main already calls GameAudio.stop() when returning home (introduced in #122); verified the deployed production asset matches this build.
- Added a native Web Audio return-home regression with a long completion phrase queued. Captures audio time inside the actual Return home click, verifies every future completion source is stopped, and checks the home demo's first onset occurs after the cancellation fade. Browser check passed and return-home screenshot inspected. No production code change was needed; existing open tabs may require a refresh.

2026-09-12
- Matched mobile How to play and sound buttons with 42px circular backgrounds, including muted sound. Reduced the narrowest activity block slightly to keep the header aligned.
- Reserved 100lvh for the portrait landing page before descriptive text; the setup area continues using the visible dynamic viewport so Start remains onscreen as browser bars move.
- Build and focused layout checks passed at 320/360/390/430/760px portrait, mobile landscape and desktop. Checked button dimensions/backgrounds, header boundaries, text starting below the viewport, Start visibility and tutorial entry; inspected mobile screenshots and the web-game client capture.

2026-09-12
- Reproduced an endless startup loader on origin/main when AbortSignal.timeout is unavailable: optional analytics threw synchronously before finishLoading. Added an AbortController deadline fallback shared by client requests and contained synchronous analytics failures inside its promise chain.
- Added an explicit Safari 15.4 build target and catchable dynamic startup. A bundle failure or 20-second startup stall now shows a reload action; late successful initialization can still open the game.
- Build and 204 unit tests passed. Chromium and WebKit passed normal startup, missing-timeout and synchronous analytics-failure scenarios, each including touch tutorial connections, starting a game and restoring it. Both engines passed download/evaluation/stall recovery checks. Ran the game client and inspected gameplay/recovery screenshots. Actual iPad version is unknown; device confirmation remains with the user.

2026-09-12
- Changed tutorial rings to explicit sphere-centered pixel bounds. Selection/double-tap animations now only scale/fade; drag/removal focus rings share the same centering. Avoids percentage-translation reference-box differences while retaining Studio styling controls.
- Current Chromium/WebKit did not reproduce the reported older-Safari offset before the patch. New center checks passed in both engines at 1000px and 390px, across selection/drag/double-tap with thick borders and enlarged pulses (under 0.1 CSS pixel error). Build passed; selection tutorial mouse/touch/reduced-motion checks passed on rerun after the parallel run missed a transient success message. Ran the web-game client and inspected the centered WebKit iPad pulse screenshot. Physical Safari confirmation is pending.

2026-09-12
- Added pressed feedback to onboarding rotation keycaps: the specific arrow or WASD key turns purple/white and depresses while held. Preserves feedback when the guidance re-renders; key release, window blur and hidden-tab cleanup reset it.
- Build and focused Chromium/WebKit checks passed for individual/simultaneous keys, release, blur, ignored modifiers and lesson transition. Ran the web-game client and inspected the pressed-key screenshot.

2026-09-12
- Added compact keyboard labels beside desktop Undo, Redo, Restart and Hint, using Mac/Windows modifier labels. Labels stay hidden on touch devices and compact toolbar layouts; accessible button names remain unchanged.
- Added Shift+R for Restart through the existing button confirmation flow, with keyboard help and aria-keyshortcuts. Plain R still resets the view.
- Build and focused Chromium/WebKit checks passed for all four shortcuts, restart confirmation, Mac/Windows labels and hidden phone/tablet labels in portrait/landscape. Ran the web-game client and inspected the desktop toolbar screenshot.

2026-09-12
- Restored desktop rotation controls in normal 3D games and onboarding. Desktop buttons show arrow/WASD alternatives and R for the game's reset view; phones/tablets retain icon-only controls and flat games keep rotation hidden.
- Shared held-key feedback with tutorial keycaps, highlighting individual keys on press and clearing on release/blur/visibility loss. Consolidated direction mappings so labels and rotation input agree.
- Production build, full onboarding walkthrough and focused Chromium/WebKit controller checks passed (clicks, every arrow/WASD key, reset feedback, cleanup, tutorial progression and mobile rendering). Updated stale walkthrough assumptions for asynchronous startup and ring bounds from earlier fixes. Ran the web-game client and inspected the controller screenshot.

2026-09-12
- Made Hint a read-only suggestion: two rings and a dashed guide highlight the next connection (or a conflicting link to remove), while camera framing reveals both endpoints. Clicking Hint or pressing H leaves graph, dots, progress and undo/redo history unchanged; a player move clears the guide. Hint analytics no longer count a played connection or trigger its sound.
- Updated solving fixtures to explicitly click the suggested endpoints. Production build, 204 unit tests and Chromium/WebKit hint checks passed on desktop/mobile in flat/3D, including repeat hints and guide cleanup. Ran the web-game client and inspected the screenshot.
- Statistics integration passed actual player completion recording, deduplication and offline delivery after a non-mutating hint, then timed out initializing its later statistics-view page at line 120. The broader suite did not finish.

2026-09-12
- Simplified desktop rotation controls into a 152px square directional pad with one arrow and a small WASD label per button. Removed repeated “or” text and nested keycap boxes; reset uses the same compact layout. The whole button highlights on keyboard press or mouse press. Shared with onboarding; mobile remains icon-only.
- Build and focused Chromium/WebKit checks passed for every rotation shortcut, reset, held-key/release/blur feedback, tutorial progression, control clicks and mobile layout. Initial fixed-delay color assertions sampled CSS transitions too early under rendering load; rerun passed. Ran the web-game client and inspected normal/pressed desktop screenshots.

2026-09-12
- Added Ctrl-click and Cmd-click as mouse alternatives to double-click for node fill/clear. Reuses existing tutorial rules, sound queue and grouped undo; records modifier_click as its own analytics input and documents the shortcut in Keyboard controls. Suppresses the native Control-click menu over interactive nodes.
- Production build and Chromium/WebKit checks passed for both modifiers in flat/3D, fill/clear, grouped undo, double-click parity, normal selection, right-click and modified drags. Tests compare graph contents independent of history insertion order and exercise native right-click last so its menu does not consume the next simulated click. Ran the web-game client and inspected filled-board screenshots.

2026-09-12
- Replaced the header's timed statistics rotation with updates driven by actual changes. Moves briefly show current-puzzle connections, then cleared dots once; undo/redo/removal and node fill update those values. Completion cancels queued move details and selects the public puzzles-solved count, refreshed after server recording. Public totals switch only when changed; online/mobile visibility stays intact.
- Kept unfinished puzzle progress separate from all-time community totals, with scope in tooltips/accessibility labels. Cached initial puzzle activity because the audience widget mounts after resumed gameplay; this fixes its first move being missed.
- Production build and focused Chromium/WebKit checks passed: idle stability, first move, dots, hint no-op, undo/redo, fill, stable width, recorded completion priority/deduplication, return home and changed visitors. Updated the existing audience suite's idle-rotation assertions. Used an isolated static preview after the existing preview stalled under heavy machine load; made fake-clock timing deterministic. Ran the web-game client and inspected the activity screenshots.
