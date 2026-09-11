# Nodoku browser flow

## Home

Choose a 3D cube (sizes 3–5) or flat board (sizes 4–5), and Complexity. Switching from a size 3 cube to Flat selects size 4; size 3 becomes available again in 3D. One, two or three filled dots indicate low, medium or high complexity; tooltips and accessible labels include the Gentle / Focused / Intricate level names. The live preview can be rotated. Start connecting creates a new empty puzzle. Continue your puzzle resumes a locally saved unfinished game. Previously saved boards outside the current size choices remain resumable. Replacing a game with connections asks for confirmation.

The home preview animates grid-size changes and switches between 3D and Flat. The demo waits for this transition, then starts each connection and its note together with the turn that brings it into view. Melody rhythm mode times the next connection from the score at the chosen BPM, with turns shortened to fit the beat and overlapping connection animations when needed. Fixed delay mode waits for current animations before its configured pause. Shape transitions and user pauses suspend both modes. Solving continues the melody through its next musical ending, with no extra notes when the final connection already lands on one. Home completion follows the selected timing mode and the demo holds the finished puzzle until that sequence ends. Studio → Sound offers a Play completion ending toggle and the interval used by player completion and Fixed delay demos. The speaker toggle also controls demo connection and completion sounds. Rotations are silent. Sound starts muted; a remembered enabled preference waits for a page interaction before playback.

## Play

The board fills the viewport below a compact header. On wide screens, game actions sit on the left and the directional view controls sit on the right. Narrow or portrait screens use a single floating control row at the bottom. Hovering an icon shows its action name.

Tap a node and an orthogonal neighbor to toggle a link. Drag from a node through successive neighbors to add missing links or remove existing ones. A live strand follows the pointer from the current node, thins as it stretches, and stops at its maximum reach. Eligible nearby nodes reach toward the tip with a small gummy nub; each reached neighbor becomes the new anchor. Studio → Drag feel tunes stretch, magnetic response, follow lag and return motion. Full nodes cannot produce a new strand; dragging across their existing links still removes them. Releasing in empty space springs the unfinished strand back while retaining links already changed during the stroke. Reduced motion and zero return duration clear the preview immediately. Each link changes only once per stroke, so backtracking within that stroke keeps the change; a new stroke can toggle it again. Double-tap a node to fill available links, or clear its links if it is already complete. Each stroke or double-tap is a single undo/redo action. The selected node gains a ring, and guides show available connections. Pips show remaining connections; completed nodes turn sage. All nodes must meet their degrees and belong to a single network.

When every dot is cleared but separate groups remain, a persistent notice below the board shows their count. The smallest group turns amber and faint neighbor guides hide, making the actual connections easier to trace. Show group brings that group into view; subsequent clicks cycle through the others without editing the puzzle. The notice and highlight clear when a connection is removed, and return if undo or refresh restores the disconnected state. Replacing links to join the groups triggers normal completion once all dots are cleared again.

Dots animate into their new arrangement when the remaining connection count changes. Rapid edits continue from the dots' current positions. The local Studio's Node dots section chooses Glide, Spring, Orbit or Fade and the duration; reduced motion and zero duration show the final arrangement immediately.

Nodes also drift gently around their grid positions in both the preview and gameplay. Their dots and connections move with them. Studio controls the floating amount and cycle duration; zero amount or reduced motion keeps nodes still.

The perspective camera shows depth while keeping the active face square. Clicking and dragging target only the face toward the player; rear nodes visible through gaps cannot receive input. A stroke stays on its starting face. Swipe empty space to turn one face; longer drags orbit and snap on release. Starting on an eligible front-face node draws instead of rotating. Arrow buttons and arrows/WASD turn 90° to an adjacent face, including top and bottom. Scroll, pinch, or −/+ zoom. Reset view returns to the front face. Flat boards stay front-facing, with all nodes available.

Undo / Redo reverse changes. Use Ctrl / Cmd + Z to undo and Ctrl / Cmd + Shift + Z to redo. Restart clears the same puzzle after confirmation. Hint applies one reversible correction or connection. The header logo returns home and retains progress. The header's keyboard icon opens the separate keyboard controls guide. How to play contains only puzzle instructions; ad removal is available above the in-game sponsors.

## Completion

The completion dialog celebrates clearing every dot and offers a shareable invitation with the solved grid size, difficulty, and number of connections. Compact icon buttons offer WhatsApp, Telegram, X, copy message, and the device's share menu when available, with descriptive tooltips and accessible names. Sharing is optional and only starts when the player chooses an action. If copying is unavailable, a selectable message appears inside the dialog.

Invitations link to the game home page at the current site address, without admin, payment, or other query parameters or fragments. They invite friends to play a new puzzle rather than reproduce the completed board. Local previews use the local address; deployed builds automatically use their deployed address.

Another puzzle starts a fresh board with the same settings; Back to the beginning returns home. Both remain available alongside sharing. The dialog remains open until a game navigation action is selected.

## Statistics

Online stays visible beside a community statistic that rotates every ten seconds: puzzles solved, dots cleared and visitors. Hovering, focusing, hiding the tab or choosing reduced motion pauses rotation. Clicking the counts opens the full Statistics view at `#statistics`, with Today / 7 days / 30 days / All time filters, an interactive daily chart, popular grids and difficulty breakdowns. Back/Escape/browser navigation restores the existing game. Sponsors can open a private placement report using the code from their verified purchase confirmation; the code and report clear on exit.

## Persistence

The current screen, settings, sound preference, puzzle seed, placed edges, camera orientation, zoom, selection, and grouped undo/redo history save locally. Refreshing during play restores that puzzle directly; a solved board reopens its completion dialog. Returning home explicitly is remembered, with Continue your puzzle retaining the unfinished board and its view.

Earlier saves containing an unfinished game also resume automatically. Invalid puzzle data falls back to home; an invalid saved view keeps the valid puzzle and uses the default camera. View commands and committed moves save as they happen, with a final save when the page is hidden or left. No account or server is required.
