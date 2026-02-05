# Layered Slice UI Flow (3D-ready)

1. Home
- Start
- Select grid size: 4x4, 5x5, 6x6, 7x7
- Select mode: 2D (z=1) or 3D (z>1)

2. Game Screen
- Centered grid with calm colors
- Remaining dots shown inside each circle
- Tap a circle, then tap a neighbor to connect or disconnect
- No crossings possible because only orthogonal neighbors are allowed

3. 3D Layer Controls (when z>1)
- Layer indicator: "Layer 2 of 4"
- Previous layer button
- Next layer button
- Optional shortcut: [ and ] keys on desktop
- Vertical connections show as small markers on the current layer's node

4. Feedback
- When a circle reaches 0 dots, it looks "quiet" (no dots)
- When all dots are removed, show a subtle completion banner
- Provide Next Level and Replay
