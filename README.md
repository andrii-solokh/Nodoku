# Nodoku

This is a minimal Godot 4 prototype for the dot-connection puzzle.

## Run
- Open the project folder in Godot 4.
- Run `scenes/Main.tscn`.

## Controls
- Menu: choose grid size (4x4 to 7x7), depth (layers), and difficulty.
- In game: click/tap a circle, then click/tap an orthogonal neighbor to toggle a connection.
- Tap the selected circle again to cancel.
- Drag to rotate in 3D; release to snap to the nearest side.
- Arrow keys or W/A/S/D rotate (web builds too).
- Two-finger trackpad swipe rotates 90° on macOS.

## Web export
- Cloudflare Pages: `docs/cloudflare_pages.md`
- Vercel: `docs/web_export.md`

## Files
- `scripts/grid_model.gd` core data model (2D and 3D).
- `scripts/level_generator.gd` generator (builds a guaranteed solvable level).
- `scripts/grid_view.gd` 3D renderer for surface nodes.
- `scripts/game_controller.gd` input handling and gameplay loop.
- `scripts/main.gd` menu and settings persistence.
