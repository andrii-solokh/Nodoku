type TipState = { active: boolean; flat: boolean; touch: boolean; paused: boolean };

/** A quiet reminder, never a live-region announcement or an input blocker. */
export function mountGameTips(element: HTMLElement, state: () => TipState, modifier: string) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let index = 0;
  let layout = "";
  const render = () => {
    const { flat, touch } = state();
    const tips = [
      touch ? "Tap one node, then a neighbor to connect them." : "Click one node, then a neighbor to connect them.",
      "Drag between neighboring nodes to connect them.",
      "Drag across an existing connection to remove it.",
      touch ? "Double-tap a node to fill its available connections." : "Hold <kbd>Shift</kbd> and click a node to fill its available connections.",
      "Each dot needs a connection. Clear them all in one connected network.",
      touch ? "Stuck? Tap Hint to highlight a connection to try." : "Press <kbd>H</kbd> for a hint. You make the connection.",
      touch ? "Made a mistake? Tap Undo to take back your last move." : `Press <kbd>${modifier}</kbd> + <kbd>Z</kbd> to undo your last move.`,
      ...(!flat ? [touch ? "Drag empty space or use the arrows to rotate the puzzle." : "Use the arrow keys or <kbd>W A S D</kbd> to rotate the puzzle."] : []),
    ];
    const nextLayout = `${flat}/${touch}`;
    if (nextLayout !== layout) { layout = nextLayout; index = 0; }
    element.innerHTML = `<span class="game-tip-copy">${tips[index % tips.length]}</span>`;
  };
  return {
    update() {
      const { active } = state();
      element.hidden = !active;
      if (!active) {
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
        index = 0;
        return;
      }
      if (timer !== undefined) {
        if (layout !== `${state().flat}/${state().touch}`) render();
        return;
      }
      render();
      timer = setInterval(() => {
        if (document.hidden || state().paused) return;
        index++;
        render();
      }, 7000);
    },
  };
}
