# VFX Perf Tuning (Battery-First)

This workflow is for live VFX tuning while watching performance and energy impact in real time.

## Quick Start

1. Start local web server:
   - `node /Users/andriisolokh/Projects/Nodoku/scripts/dev_server.js public`
2. Open:
   - `http://127.0.0.1:8080/?dev=1&perf=1`
3. In-game:
   - Open `VFX` popup.
   - Keep `Perf HUD` enabled.
   - Use `Set Baseline`.
   - Change one effect at a time.
   - Wait ~8 seconds to read delta lines.

## Developer Controls

Inside `VFX` popup (Developer Mode):

- `Perf HUD: On/Off` toggles live telemetry panel.
- `Set Baseline` captures current 10s summary.
- `Reset Metrics` clears rolling data and browser telemetry history.
- `Export Perf` writes `nodoku-vfx-perf.json` on web or `user://vfx_perf_last.json` on non-web.

## Metrics

Live summaries are shown for:

- `10s` window: fast response for tuning decisions.
- `60s` window: stability check.

Metrics include:

- FPS average.
- Frame p95 (ms).
- Long task rate (/min).
- Heap usage (MB) when browser supports `performance.memory`.
- Battery drain (%/h) when browser supports `navigator.getBattery`.
- Energy proxy score (`E`, 0-100, lower is better).

## Acceptance Targets (Balanced Strict)

- FPS p50 target: `>= 55`.
- Frame p95 target: `<= 20ms`.
- Battery drain target: `<= 8%/h` (mobile when available).

Status colors:

- `Green`: all target metrics pass.
- `Yellow`: mild regressions.
- `Red`: major regression.

## Repeatable Method

1. Set baseline on a stable scene.
2. Change exactly one slider/preset.
3. Wait for delta output (8s settle).
4. Compare `ΔFPS`, `Δp95`, `ΔEnergy`, `ΔBattery`.
5. Keep only changes that improve battery without unacceptable smoothness loss.
6. Export report for each candidate.

## Desktop + Mobile Validation

Desktop:

- Use Chrome DevTools `FPS meter`, `Performance monitor`, and `Performance` traces while tuning.

Mobile:

- Validate on at least one real phone using remote debugging.
- Prefer battery results from discharging sessions (not charging).

## Limitations

- Battery API is not available in all browsers.
- Heap metrics are Chromium-centric.
- If battery metrics are unavailable, energy impact falls back to proxy scoring from frame/longtask/heap data.
