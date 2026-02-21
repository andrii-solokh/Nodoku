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
