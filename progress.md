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
