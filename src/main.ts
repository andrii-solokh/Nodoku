import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "./style.css";
import { Puzzle, dailyPuzzleSeed, edgeKey, type Difficulty, type PuzzleSettings } from "./puzzle";
import { BoardScene } from "./scene";
import { HomeDemo } from "./demo";
import { mountSponsorship, setSponsorshipConfig } from "./sponsorship";
import { getConfig, subscribeConfig } from "./config";
import { GameAudio } from "./sound";
import { AmbientAudio } from "./ambient";
import moonlightUrl from "./assets/moonlight-scott-buckley.mp3?url";
import { mountCompletionShare } from "./share";
import { recordCompletion, restoreAttemptId, startCompletionTracking } from "./completions";
import { captureAnalytics, startAnalytics, subscribeFeatureFlag } from "./analytics";

const paths: Record<string, string> = {
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  flat: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 4v16M4 12h16"/>',
  play: '<path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 5v14M15 5v14" stroke-width="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2M12 16h.01"/>',
  sound:
    '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
  music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(0 -2)"/>',
  redo: '<path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14" transform="translate(0 -2)"/>',
  restart: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  hint: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  orbit:
    '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><path d="M12 2v3m0 14v3"/><circle cx="12" cy="12" r="2"/>',
  link: '<circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><path d="M8 12h8"/>',
  network:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h10M5 7v10M7 19h10"/>',
  home: '<path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
const complexityIcon = (level: number) =>
  `<svg class="complexity-icon" viewBox="0 0 40 20" aria-hidden="true"><path class="complexity-track" d="M6 10h28"/>${level > 1 ? `<path class="complexity-link" d="M6 10h${(level - 1) * 14}"/>` : ""}${[1, 2, 3].map(dot => `<circle class="complexity-dot${dot <= level ? " filled" : ""}" cx="${6 + (dot - 1) * 14}" cy="10" r="3.5"/>`).join("")}</svg>`;
const logo =
  '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M8 9h18v17H8Z" fill="none" stroke="#8270bd" stroke-width="3"/><g fill="#a9cbbd"><circle cx="8" cy="9" r="4.7"/><circle cx="26" cy="9" r="4.7"/><circle cx="8" cy="26" r="4.7"/></g><circle cx="26" cy="26" r="5" fill="#fcfaf5" stroke="#d7d2df" stroke-width="1"/></svg>';
const labels: Record<Difficulty, string> = {
  easy: "Gentle",
  medium: "Focused",
  hard: "Intricate",
};
const storageKey = "nodoku.astra.v1";
let settings: PuzzleSettings = {
  size: 3,
  depth: 3,
  difficulty: "easy",
  seed: 1,
};
let soundEnabled = true;
let musicEnabled = false;
let onboardingCompleted = false;
let showOnboarding = new URLSearchParams(location.search).has("onboarding");
let melodyStep = 0;
let savedPuzzle: Puzzle | null = null;
let savedView: unknown = null;
let savedSelection: number | null = null;
let attemptId: string | null = null;
let resumeOnLoad = false;
let puzzle: Puzzle | null = null;
let selected: number | null = null;
let mode: "home" | "playing" | "onboarding" = "home";
const tutorialDirections = ["left", "right", "up", "down"] as const;
type TutorialDirection = typeof tutorialDirections[number];
const tutorialKeys = { left: "← / A", right: "→ / D", up: "↑ / W", down: "↓ / S" };
const touchInput = window.matchMedia("(pointer: coarse)");
let onboardingRotation = 0;
let onboardingStep = 0;
let onboardingToolsComplete = false;
let onboardingConnection: [number, number] | null = null;
let onboardingCue: OnboardingCue = { kind: "none" };
let completionMomentTimer: ReturnType<typeof setTimeout> | undefined;
let completionMomentRevision = 0;
let toastTimer: ReturnType<typeof setTimeout>;
let completionShown = false;
let keyboardIndex = -1;
let networkGroups: number[][] = [];
let networkSignature = "";
let highlightedGroup = 0;
let nextGroupToShow = 0;
let firstConnectionTracked = false;
let viewRotationTracked = false;
let gameStartedAt = 0;
let puzzleSessionStats = {
  actions: 0,
  connectionsAdded: 0,
  connectionsRemoved: 0,
  hints: 0,
  undos: 0,
  redos: 0,
  rotations: 0,
};
const gameAudio = new GameAudio();
const ambientAudio = new AmbientAudio(moonlightUrl);
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (stored) {
    onboardingCompleted = stored.onboardingCompleted === true;
    savedPuzzle = Puzzle.restore(stored.game);
    if (savedPuzzle) settings = { ...savedPuzzle.settings };
    if (stored.settings) {
      try {
        const validated = new Puzzle(stored.settings);
        settings = { ...validated.settings };
      } catch {
        // Invalid menu preferences must not discard a valid saved puzzle.
      }
    }
    if (typeof stored.sound === "boolean") soundEnabled = stored.sound;
    musicEnabled = stored.music === true;
    if (savedPuzzle?.solved && stored.screen !== "playing") savedPuzzle = null;
    if (savedPuzzle) {
      melodyStep = Number.isSafeInteger(stored.melodyStep) && stored.melodyStep >= 0
        && stored.melodyStep < 1_000_000_000 ? stored.melodyStep : savedPuzzle.edges.length;
      attemptId = restoreAttemptId(stored.attemptId);
      // Earlier saves did not record the screen; resume their unfinished board.
      resumeOnLoad = stored.screen === "playing" || stored.screen === undefined;
      savedView = stored.view ?? null;
      savedSelection = Number.isInteger(stored.selected)
        && savedPuzzle.nodes.some(node => node.id === stored.selected)
        ? stored.selected : null;
    }
  } else showOnboarding = showOnboarding || !navigator.webdriver;
} catch {
  /* A fresh game remains available when stored settings are invalid. */
}

const app = document.querySelector<HTMLDivElement>("#app")!;
const loadingScreen = document.getElementById("app-loader");
let loadingScreenDismissed = false;
function finishLoading() {
  if (!loadingScreen || loadingScreenDismissed) return;
  loadingScreenDismissed = true;
  // Wait for the first canvas frame, then let the loading mark dissolve into the board.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    loadingScreen.classList.add("is-ready");
    window.setTimeout(() => loadingScreen.remove(), 460);
  }));
}
app.className = "home";
app.innerHTML = `
<header class="site-header">
  <button class="brand" id="home-button" aria-label="Nodoku home">${logo}<span class="brand-name">nodoku</span></button>
  <div class="game-header-info">
    <div class="game-title" id="game-title"></div>
    <div class="progress-wrap"><div class="progress-track" role="progressbar" aria-label="Dots connected" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill" id="progress-fill"></div></div><span id="progress-value">0%</span></div>
  </div>
  <div class="game-activity" id="game-activity"></div>
  <div class="home-activity" id="home-activity"></div>
  <nav class="header-actions" aria-label="Game help, controls and sound">
    <button class="text-button" id="help-button">${icon("help")}How to play</button>
    <button class="icon-button" id="keyboard-button" aria-label="Keyboard controls" title="Keyboard controls">${icon("keyboard")}</button>
    <button class="icon-button" id="music-button" aria-label="Music and credits" title="Music and credits" aria-haspopup="dialog" hidden>${icon("music")}</button>
    <button class="icon-button" id="sound-button" aria-label="Turn sound effects on" aria-pressed="false">${icon("mute")}</button>
  </nav>
</header>
<main id="main-content">
<section class="home-main" aria-labelledby="home-title">
  <section class="intro" aria-label="Set up a puzzle">
    <h1 id="home-title">3D Spatial Reasoning Puzzle</h1>
    <p class="intro-copy">Connect every node and complete the network.<br>Each node shows how many connections it needs.</p>
    <div class="puzzle-options">
      <div class="setting-row"><span class="setting-label" id="shape-label">Your perspective</span><div class="setting-control"><div class="segmented" role="group" aria-labelledby="shape-label"><button class="segment" data-depth="3d">${icon("cube")}3D</button><button class="segment" data-depth="flat">${icon("flat")}Flat</button></div></div></div>
      <div class="setting-row"><span class="setting-label" id="size-label">Grid size</span><div class="setting-control"><div class="sizes" role="group" aria-labelledby="size-label">${[3, 4, 5].map((n) => `<button class="size-button" data-size="${n}" aria-label="${n} by ${n} grid">${n}</button>`).join("")}</div></div></div>
      <div class="setting-row"><span class="setting-label" id="difficulty-label">Complexity</span><div class="setting-control"><div class="difficulty-group" role="group" aria-labelledby="difficulty-label">${Object.entries(
        labels,
      )
        .map(
          ([value, label], index) =>
            `<button class="difficulty-button" data-difficulty="${value}" aria-label="${["Low", "Medium", "High"][index]} complexity — ${label}" title="${["Low", "Medium", "High"][index]} complexity — ${label}">${complexityIcon(index + 1)}</button>`,
        )
        .join("")}</div></div></div>
      <div class="start-actions"><button class="start-button" id="start-button">${icon("play")}Start connecting</button><button class="resume-button" id="resume-button" hidden>Continue your puzzle</button></div>
    </div>
  </section>
  <div class="home-stage-wrap"><div id="home-stage" class="stage home-stage"></div><div class="preview-caption"><button class="demo-toggle" id="demo-toggle" aria-label="Pause demo" aria-pressed="false" title="Pause demo"><span class="demo-toggle-option"><span class="demo-toggle-icon" id="demo-toggle-icon">${icon("pause")}</span><span id="preview-caption">Solving</span></span></button></div></div>
</section>
<section class="game-main" aria-label="Puzzle board">
  <div id="game-stage" class="stage game-stage"></div>
  <aside class="network-status" id="network-status" aria-label="Network status" hidden>
    <div role="status" aria-live="polite" aria-atomic="true"><strong id="network-status-title"></strong><p>All dots are cleared. Swap connections to join the groups.</p><span class="network-group-detail" id="network-group-detail"></span></div>
    <button id="network-group-button" type="button">Show group 1</button>
  </aside>
  <div class="game-toolbar">
    <div class="tools-group"><button class="tool-button" id="undo-button" disabled>${icon("undo")}Undo</button><button class="tool-button" id="redo-button" disabled>${icon("redo")}Redo</button><button class="tool-button" id="restart-button">${icon("restart")}Restart</button><button class="tool-button hint" id="hint-button">${icon("hint")}Hint</button></div>
    <div class="rotation-tools" role="group" aria-label="Board view"><button class="icon-button" data-rotate="left" aria-label="Rotate left">${icon("left")}</button><button class="icon-button" data-rotate="up" aria-label="Rotate up">${icon("up")}</button><button class="icon-button view-reset" id="view-button">${icon("cube")}Reset view</button><button class="icon-button" data-rotate="down" aria-label="Rotate down">${icon("down")}</button><button class="icon-button" data-rotate="right" aria-label="Rotate right">${icon("right")}</button></div>
  </div>
</section>
<section class="onboarding-main" aria-labelledby="onboarding-title">
  <div id="onboarding-stage" class="stage onboarding-stage"></div>
  <div class="onboarding-cue" id="onboarding-cue" aria-hidden="true" hidden>
    <span class="onboarding-cue-line"></span>
    <span class="onboarding-cue-node onboarding-cue-start"></span>
    <span class="onboarding-cue-node onboarding-cue-end"></span>
    <span class="onboarding-cue-hand"></span>
    <span class="onboarding-cue-turn"><svg viewBox="0 0 220 64" fill="none" aria-hidden="true">
      <path class="rotation-arrow-track" d="M18 48 Q110 2 202 48" />
      <path class="rotation-arrow-motion" d="M18 48 Q110 2 202 48" />
      <path class="rotation-arrow-head" d="M188 51 L202 48 L199 34" />
    </svg></span>
  </div>
  <div class="onboarding-turn-controls" id="onboarding-turn-controls" role="group" aria-label="Turn the 3D puzzle" hidden>
    <span aria-hidden="true"></span>
    <button class="icon-button" type="button" data-onboarding-rotate="up" aria-label="Turn up">${icon("up")}</button>
    <span aria-hidden="true"></span>
    <button class="icon-button" type="button" data-onboarding-rotate="left" aria-label="Turn left">${icon("left")}</button>
    <span class="onboarding-turn-center" aria-hidden="true">${icon("cube")}</span>
    <button class="icon-button" type="button" data-onboarding-rotate="right" aria-label="Turn right">${icon("right")}</button>
    <span aria-hidden="true"></span>
    <button class="icon-button" type="button" data-onboarding-rotate="down" aria-label="Turn down">${icon("down")}</button>
    <span aria-hidden="true"></span>
  </div>
  <aside class="game-toolbar onboarding-toolbar" id="onboarding-control-lesson" aria-label="Puzzle controls" hidden>
    <div class="tools-group">
      <button class="tool-button" type="button" id="onboarding-undo">${icon("undo")}Undo</button>
      <button class="tool-button" type="button" id="onboarding-redo">${icon("redo")}Redo</button>
      <button class="tool-button" type="button" id="onboarding-restart">${icon("restart")}Restart</button>
      <button class="tool-button hint" type="button" id="onboarding-hint">${icon("hint")}Hint</button>
    </div>
  </aside>
  <section class="onboarding-copy" aria-live="polite">
    <span class="onboarding-step" id="onboarding-step">1 of 9</span>
    <h2 id="onboarding-title">Make one connection.</h2>
    <p id="onboarding-message">Drag from one node to a neighboring node.</p>
    <div class="onboarding-rotation-keys" id="onboarding-rotation-keys" aria-label="Rotation keys" hidden></div>
    <button class="onboarding-next" id="onboarding-next" hidden>Show me 3D${icon("right")}</button>
  </section>
  <button class="onboarding-skip" id="onboarding-skip">Skip tutorial</button>
</section>
<div class="completion-moment" id="completion-moment" role="status" aria-live="assertive" hidden>
  <div class="completion-moment-glow" aria-hidden="true"></div>
  <div class="completion-moment-emblem" aria-hidden="true">${icon("check")}</div>
  <strong>All connected</strong>
</div>
</main>
<div id="toast" class="status-toast" role="status" aria-live="polite"></div>
<div id="node-announcement" class="sr-only" aria-live="polite"></div>
<dialog class="dialog" id="help-dialog" aria-labelledby="help-title">
  <div class="dialog-header"><h2 id="help-title">Clear every dot.</h2><button class="icon-button close" data-close="help-dialog" aria-label="Close help">${icon("close")}</button></div>
  <p class="help-summary">Each dot is one connection a node still needs.</p>
  <p class="help-rule">3 dots = 3 links to neighboring nodes.</p>
  <p class="help-instructions">Tap or drag between neighbors to connect. Double-tap a node to connect all available neighbors. Clear every dot and join all nodes into one network. Swipe empty space to turn the puzzle.</p>
  <button class="start-button" data-close="help-dialog">Got it</button>
</dialog>
<dialog class="dialog" id="keyboard-dialog" aria-labelledby="keyboard-title">
  <div class="dialog-header"><h2 id="keyboard-title">Keyboard controls</h2><button class="icon-button close" data-close="keyboard-dialog" aria-label="Close keyboard controls">${icon("close")}</button></div>
  <div class="keyboard-help">
    <div class="shortcut-rotation">
      <span>Rotate view</span>
      <div class="shortcut-layouts">
        <span class="sr-only">Arrow keys or W A S D</span>
        <span class="shortcut-keypad" aria-hidden="true"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span>
        <span class="shortcut-or" aria-hidden="true">or</span>
        <span class="shortcut-keypad" aria-hidden="true"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
      </div>
    </div>
    <dl class="shortcut-list">
      <div><dt>Undo</dt><dd><kbd>Ctrl / <span aria-hidden="true">⌘</span><span class="sr-only">Command</span></kbd><span class="shortcut-join">+</span><kbd>Z</kbd></dd></div>
      <div><dt>Redo</dt><dd><kbd>Ctrl / <span aria-hidden="true">⌘</span><span class="sr-only">Command</span></kbd><span class="shortcut-join">+</span><kbd>Shift</kbd><span class="shortcut-join">+</span><kbd>Z</kbd></dd></div>
      <div><dt>Hint</dt><dd><kbd>H</kbd></dd></div>
      <div><dt>Fullscreen</dt><dd><kbd>F</kbd></dd></div>
    </dl>
  </div>
</dialog>
<dialog class="dialog completion-dialog" id="completion-dialog" aria-labelledby="completion-title">
  <div class="completion-emblem">${icon("check")}</div>
  <h2 id="completion-title">All connected.</h2>
  <p>You cleared every dot.<br>Invite a friend to find their own moment of calm.</p>
  <div id="completion-share"></div>
  <button class="start-button" id="next-button" autofocus>Solve another puzzle${icon("play")}</button>
  <button class="secondary-button" id="completion-home">Return home</button>
</dialog>
<dialog class="dialog music-dialog" id="music-dialog" aria-labelledby="music-title">
  <div class="dialog-header"><h2 id="music-title">Ambient music</h2><button class="icon-button close" data-close="music-dialog" aria-label="Close music and credits">${icon("close")}</button></div>
  <div class="music-track">
    <div class="music-emblem">${icon("music")}</div>
    <div><h3>Moonlight</h3><p>Scott Buckley</p></div>
  </div>
  <button class="start-button music-toggle" id="music-toggle" aria-pressed="false">${icon("play")}Play music</button>
  <p class="music-note">Piano and strings, while you connect.<br>Music and sound effects have separate controls.</p>
  <div class="music-credit">
    <h3>Music credit</h3>
    <p>'Moonlight' by Scott Buckley - released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC-BY 4.0</a>. <a href="https://www.scottbuckley.com.au" target="_blank" rel="noopener noreferrer">www.scottbuckley.com.au</a></p>
    <a class="music-source" href="https://www.scottbuckley.com.au/library/moonlight/" target="_blank" rel="noopener noreferrer">About the track ↗</a>
  </div>
</dialog>
<dialog class="dialog" id="confirm-dialog" aria-labelledby="confirm-title"><div class="dialog-header"><h2 id="confirm-title">Start this puzzle over?</h2></div><p id="confirm-description">Your connections will be cleared. The puzzle stays the same.</p><div class="dialog-actions"><button data-close="confirm-dialog">Keep playing</button><button class="confirm-button" id="confirm-button">Restart puzzle</button></div></dialog>
`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const completionShare = mountCompletionShare(el("completion-share"), channel =>
  captureAnalytics("puzzle_shared", { channel, ...puzzleAnalyticsProperties() }),
);
app.querySelectorAll<HTMLButtonElement>(".game-toolbar button").forEach((button) => {
  button.title = button.getAttribute("aria-label") || button.textContent!.trim();
});
let scene: BoardScene;
let strokePuzzle: Puzzle | null = null;
let strokeChanged = false;
let strokeAdded = 0;
let strokeRemoved = 0;
const strokeEdges = new Set<string>();
try {
  scene = new BoardScene(el("home-stage"), onTap, () => selectNode(null), {
    onDoubleTap: onDoubleTap,
    onTapSettled: maybeComplete,
    onStrokeStart: onStrokeStart,
    onStrokeEdge: onStrokeEdge,
    onStrokeEnd: onStrokeEnd,
    onRotate: () => {
      if (mode === "playing" && !viewRotationTracked) {
        viewRotationTracked = true;
        captureAnalytics("puzzle_rotated", puzzleAnalyticsProperties());
        trackPuzzleAction("rotate", "gesture");
      }
    },
    onViewChange: () => {
      if (mode === "playing") persist();
    },
  });
} catch (error) {
  el("home-stage").innerHTML =
    '<div class="webgl-error"><strong>The 3D view couldn’t start.</strong>Enable hardware acceleration in your browser, then reload to play Nodoku.</div>';
  el<HTMLButtonElement>("start-button").disabled = true;
  finishLoading();
  throw error;
}
function demoSoundOptions(kind: "connect" | "complete") {
  const config = getConfig();
  const connections = demo.puzzle?.edges.length ?? 0;
  return {
    unlock: false,
    melodyIndex: Math.max(0, connections - (kind === "connect" ? 1 : 0)),
    rhythmTempoBpm: config.demo.timingMode === "melody" ? config.demo.tempoBpm : undefined,
  };
}
const demo = new HomeDemo(scene, kind => {
  if (mode === "home" && soundEnabled && !demo.paused && !demoSuspended()) {
    gameAudio.play(kind, demoSoundOptions(kind));
  }
}, () => soundEnabled && !demoSuspended() ? gameAudio.getCompletionDurationMs(demoSoundOptions("complete")) : 0);
let activeMelody = getConfig().sound.connectionMelody;
let tutorialSettings = getConfig().tutorial;
subscribeConfig(config => {
  scene.setConfig(config);
  const cues = el<HTMLElement>("onboarding-cue");
  const tutorial = tutorialSettings = config.tutorial;
  cues.dataset.focus = String(tutorial.focusCircles);
  cues.dataset.drag = String(tutorial.dragCue);
  cues.dataset.removal = String(tutorial.removalCue);
  for (const [name, value] of Object.entries({
    color: tutorial.color, "ring-width": `${tutorial.ringWidth}px`,
    "ring-scale": tutorial.ringScale, "ring-opacity": tutorial.ringOpacity,
    cycle: `${tutorial.gestureCycleMs}ms`,
  })) cues.style.setProperty(`--cue-${name}`, String(value));
  scene.setRemovalCue(mode === "onboarding" && onboardingStep === 1 && tutorial.enabled && tutorial.removalCue ? onboardingConnection : null);
  requestAnimationFrame(() => { renderOnboardingCue(); if (mode === "onboarding") { renderOnboardingTools(); renderRotationGuidance(); } });
  demo.setConfig(config);
  gameAudio.setConfig(config.sound);
  ambientAudio.setVolume(config.sound.ambientVolume);
  updateMusic();
  if (activeMelody !== config.sound.connectionMelody) {
    activeMelody = config.sound.connectionMelody;
    melodyStep = 0;
    persist();
  }
  setSponsorshipConfig(config.sponsors);
  document.documentElement.style.backgroundColor = config.scene.background;
  document.documentElement.style.setProperty("--paper", config.scene.background);
});
let demoFrame = 0;
function demoSuspended() {
  return document.hidden || !!document.querySelector("dialog[open]");
}
function runDemo() {
  if (demoFrame) cancelAnimationFrame(demoFrame);
  let last = performance.now();
  const tick = (now: number) => {
    demoFrame = 0;
    if (mode !== "home") return;
    // No catch-up burst when returning from a background tab.
    demo.advanceTime(Math.min(100, now - last), demoSuspended());
    last = now;
    demoFrame = requestAnimationFrame(tick);
  };
  demoFrame = requestAnimationFrame(tick);
}

function persist() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        settings,
        sound: soundEnabled,
        music: musicEnabled,
        onboardingCompleted,
        melodyStep,
        screen: mode,
        game: (puzzle || savedPuzzle)?.serialize() ?? null,
        view: puzzle ? scene.serializeView() : savedView,
        selected: puzzle ? selected : savedSelection,
        attemptId: (puzzle || savedPuzzle) ? attemptId : null,
      }),
    );
  } catch {
    /* Gameplay also works without browser storage. */
  }
}
function toast(message: string) {
  clearTimeout(toastTimer);
  el("toast").textContent = message;
  toastTimer = setTimeout(() => {
    el("toast").textContent = "";
  }, 3400);
}
function clearCompletionMoment() {
  completionMomentRevision++;
  if (completionMomentTimer !== undefined) clearTimeout(completionMomentTimer);
  completionMomentTimer = undefined;
  const moment = el("completion-moment");
  moment.classList.remove("is-active");
  moment.hidden = true;
}
function playCompletionMoment(onComplete: () => void) {
  clearCompletionMoment();
  const revision = completionMomentRevision;
  const moment = el("completion-moment");
  moment.hidden = false;
  requestAnimationFrame(() => {
    if (revision === completionMomentRevision) moment.classList.add("is-active");
  });
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
  completionMomentTimer = setTimeout(() => {
    if (revision !== completionMomentRevision) return;
    completionMomentTimer = undefined;
    moment.classList.remove("is-active");
    moment.hidden = true;
    onComplete();
  }, duration);
}
function tone(
  kind: "connect" | "disconnect" | "complete",
  count = 1,
  sequenceTempoBpm?: number,
  rhythmTempoBpm?: number,
) {
  const melodyIndex = melodyStep;
  if (kind === "connect") melodyStep += count;
  if (soundEnabled && !document.hidden)
    gameAudio.play(kind, { melodyIndex, count, sequenceTempoBpm, rhythmTempoBpm });
}
function updateSound() {
  gameAudio.setEnabled(soundEnabled && !document.hidden);
  const button = el("sound-button");
  button.innerHTML = icon(soundEnabled ? "sound" : "mute");
  button.setAttribute("aria-pressed", String(soundEnabled));
  button.setAttribute(
    "aria-label",
    soundEnabled ? "Turn sound effects off" : "Turn sound effects on",
  );
  button.title = soundEnabled ? "Sound effects on" : "Sound effects off";
}
function updateMusic() {
  const available = getConfig().sound.showAmbientMusic;
  const enabled = available && musicEnabled;
  ambientAudio.setEnabled(enabled);
  el("music-button").hidden = !available;
  el("music-button").classList.toggle("music-enabled", enabled);
  const button = el<HTMLButtonElement>("music-toggle");
  button.disabled = !available;
  button.innerHTML = `${icon(enabled ? "pause" : "play")}${enabled ? "Pause music" : "Play music"}`;
  button.setAttribute("aria-pressed", String(enabled));
  const dialog = el<HTMLDialogElement>("music-dialog");
  if (!available && dialog.open) dialog.close();
}
function limitNewPuzzleSize() {
  // Keep older saved puzzles resumable; restrict only new games and previews.
  const flat = settings.depth === 1;
  const size = Math.max(flat ? 4 : 3, Math.min(5, settings.size));
  if (size !== settings.size)
    settings = { ...settings, size, depth: flat ? 1 : size };
}
function updateOptions(animateShape = false) {
  limitNewPuzzleSize();
  document
    .querySelectorAll<HTMLButtonElement>("[data-size]")
    .forEach((button) => {
      button.hidden = settings.depth === 1 && Number(button.dataset.size) < 4;
      button.disabled = button.hidden;
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.size) === settings.size),
      );
    });
  document
    .querySelectorAll<HTMLElement>("[data-depth]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String((button.dataset.depth === "flat") === (settings.depth === 1)),
      ),
    );
  document
    .querySelectorAll<HTMLElement>("[data-difficulty]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.difficulty === settings.difficulty),
      ),
    );
  el("resume-button").hidden = !savedPuzzle;
  demo.start(settings, animateShape);
  runDemo();
  persist();
}
function moveCanvas(target: string) {
  scene.mount(el(target));
  requestAnimationFrame(() => scene.resize());
}
function selectNode(id: number | null) {
  selected = id;
  scene.setSelection(id);
  const remaining = id === null ? 0 : (puzzle?.remaining(id) ?? 0);
  if (id !== null)
    el("node-announcement").textContent =
      `Node ${id + 1}, ${remaining} ${remaining === 1 ? "dot" : "dots"} remaining. Choose a neighbor.`;
}
function onTap(id: number): (() => void) | void {
  if (!puzzle || document.querySelector("dialog[open]")) return;
  if (mode === "onboarding") return onOnboardingTap(id);
  if (mode !== "playing") return;
  const active = puzzle;
  const restore = active.checkpoint();
  const restoreMelodyStep = melodyStep;
  onNode(id);
  return () => {
    if (puzzle === active) {
      restore();
      melodyStep = restoreMelodyStep;
    }
  };
}
function onOnboardingTap(id: number): (() => void) | void {
  if (!puzzle || onboardingStep === 4 || onboardingStep > 5) return;
  const active = puzzle;
  const restore = active.checkpoint();
  const previousSelection = selected;
  const rollback = () => {
    if (puzzle !== active) return;
    restore();
    scene.refresh();
    selectNode(previousSelection);
  };
  // Node-fill is taught as a deliberate double-tap. A single tap still gives
  // the player immediate feedback while the second tap performs the fill.
  if (onboardingStep === 2 || onboardingStep === 3) {
    selectNode(id);
    return rollback;
  }
  if (selected === id) {
    selectNode(null);
    return rollback;
  }
  if (selected === null) {
    selectNode(id);
    return rollback;
  }
  if (!scene.getScreenNodes().some(node => node.id === selected && node.pickable)) {
    selectNode(id);
    return rollback;
  }
  const source = selected;
  if (!active.neighbors(source).includes(id)) {
    selectNode(id);
    return rollback;
  }
  const key = edgeKey(source, id);
  if (onboardingStep === 0 && onboardingConnection) return rollback;
  if (
    onboardingStep === 1 &&
    (!onboardingConnection || edgeKey(...onboardingConnection) !== key)
  )
    return rollback;
  const count = active.edges.length;
  const result = active.toggle(source, id);
  if (!result.changed) {
    toast("A node has no dots left. Remove a connection to make room.");
    return rollback;
  }
  const added = active.edges.length > count;
  if (onboardingStep === 0 && added) onboardingConnection = [source, id];
  selectNode(null);
  scene.refresh();
  if (onboardingStep === 0 && added) {
    onboardingStep = 1;
    renderOnboarding();
  } else if (onboardingStep === 1 && !added) {
    onboardingConnection = null;
    onboardingStep = 2;
    renderOnboarding();
  } else if (onboardingStep === 5) {
    onboardingStep = 6;
    renderOnboarding();
  }
  return rollback;
}
function onNode(id: number) {
  if (mode !== "playing" || !puzzle || document.querySelector("dialog[open]"))
    return;
  if (selected === id) {
    selectNode(null);
    return;
  }
  if (selected === null) {
    selectNode(id);
    return;
  }
  // A selected node may have moved behind the board after a turn.
  if (!scene.getScreenNodes().some(node => node.id === selected && node.pickable)) {
    selectNode(id);
    return;
  }
  const previous = selected;
  if (!puzzle.neighbors(previous).includes(id)) {
    selectNode(id);
    return;
  }
  const count = puzzle.edges.length;
  const result = puzzle.toggle(previous, id);
  if (!result.changed) {
    toast("A node has no dots left. Remove a connection to make room.");
    return;
  }
  const added = puzzle.edges.length > count;
  trackFirstConnection("tap");
  trackPuzzleAction("connection", "tap", 1, added ? 1 : 0, added ? 0 : 1);
  tone(added ? "connect" : "disconnect");
  selectNode(null);
  updateGame();
}
function onDoubleTap(id: number) {
  if (!puzzle || document.querySelector("dialog[open]"))
    return;
  if (mode === "onboarding") {
    if (onboardingStep !== 2 && onboardingStep !== 3) return;
    const result = puzzle.toggleNode(id);
    if (!result.changed) return;
    if (onboardingStep === 2 && result.removed) return;
    if (onboardingStep === 2) onboardingStep = 3;
    scene.refresh();
    if (!completeOnboarding2dIfSolved()) renderOnboarding();
    return;
  }
  if (mode !== "playing") return;
  const result = puzzle.toggleNode(id);
  el("toast").textContent = "";
  selectNode(null);
  if (result.changed) {
    trackFirstConnection("double_tap");
    trackPuzzleAction(
      "node_fill",
      "double_tap",
      result.count,
      result.removed ? 0 : result.count,
      result.removed ? result.count : 0,
    );
    tone(result.removed ? "disconnect" : "connect", result.count,
      result.removed ? undefined : getConfig().demo.tempoBpm);
  }
  updateGame();
  if (!result.changed)
    toast(
      result.reason ||
        "The neighboring nodes have no room for another connection.",
    );
}
type OnboardingCueKind = "drag" | "remove" | "double-tap" | "turn" | "none";
type OnboardingCue = {
  kind: OnboardingCueKind;
  start?: number;
  end?: number;
};

function firstAvailableConnection(): [number, number] | null {
  if (!puzzle) return null;
  const connected = new Set(puzzle.edges.map(([a, b]) => edgeKey(a, b)));
  for (const source of puzzle.nodes) {
    if (puzzle.remaining(source.id) === 0) continue;
    const target = puzzle.neighbors(source.id).find(id =>
      puzzle!.remaining(id) > 0 && !connected.has(edgeKey(source.id, id)),
    );
    if (target !== undefined) return [source.id, target];
  }
  return null;
}

function onboardingCueForStep(): OnboardingCue {
  if (!puzzle) return { kind: "none" };
  if (onboardingStep === 0) {
    const [start, end] = puzzle.solution[0] ?? [];
    return Number.isInteger(start) && Number.isInteger(end)
      ? { kind: "drag", start, end }
      : { kind: "none" };
  }
  if (onboardingStep === 1 && onboardingConnection)
    return { kind: "remove", start: onboardingConnection[0], end: onboardingConnection[1] };
  if (onboardingStep === 2 || onboardingStep === 3) {
    const [start, end] = firstAvailableConnection() ?? [];
    return Number.isInteger(start) && Number.isInteger(end)
      ? { kind: "double-tap", start, end }
      : { kind: "none" };
  }
  if (onboardingStep === 4) return { kind: "turn" };
  if (onboardingStep === 5) {
    const screen = scene.getScreenNodes().filter(node => node.pickable);
    for (const source of screen) {
      const target = screen.find(node => puzzle!.neighbors(source.id).includes(node.id));
      if (target) return { kind: "drag", start: source.id, end: target.id };
    }
  }
  return { kind: "none" };
}

function renderOnboardingCue() {
  if (mode !== "onboarding") return;
  const cue = el<HTMLElement>("onboarding-cue");
  const line = cue.querySelector<HTMLElement>(".onboarding-cue-line")!;
  const hand = cue.querySelector<HTMLElement>(".onboarding-cue-hand")!;
  const startRing = cue.querySelector<HTMLElement>(".onboarding-cue-start")!;
  const endRing = cue.querySelector<HTMLElement>(".onboarding-cue-end")!;
  const turn = cue.querySelector<HTMLElement>(".onboarding-cue-turn")!;
  const settings = tutorialSettings;
  if (!settings.enabled || puzzle?.solved || scene.isViewMoving) {
    cue.hidden = true;
    return;
  }
  // Keep the chosen target stable, but choose a new visible pair after a turn.
  if (onboardingStep === 5 && (onboardingCue.kind === "none" ||
      !scene.projectNode(onboardingCue.start!)?.front || !scene.projectNode(onboardingCue.end!)?.front))
    onboardingCue = onboardingCueForStep();
  const gesture = onboardingCue;
  cue.className = `onboarding-cue is-${gesture.kind}`;
  cue.hidden = gesture.kind === "none" || (gesture.kind === "double-tap" && !settings.doubleTapCue)
    || (gesture.kind === "turn" && !settings.rotationCue);
  if (cue.hidden) return;

  if (gesture.kind === "turn") {
    const nodes = puzzle!.nodes.map(node => scene.projectNode(node.id)).filter(node => node !== null);
    if (!nodes.length) { cue.hidden = true; return; }
    const left = Math.min(...nodes.map(node => node.x - node.radius));
    const right = Math.max(...nodes.map(node => node.x + node.radius));
    const top = Math.min(...nodes.map(node => node.y - node.radius));
    const direction = tutorialDirections[onboardingRotation];
    const vertical = direction === "up" || direction === "down";
    const bottom = Math.max(...nodes.map(node => node.y + node.radius));
    turn.dataset.direction = direction;
    turn.style.left = `${vertical ? Math.max(40, left - 40) : (left + right) / 2}px`;
    turn.style.top = `${vertical ? (top + bottom) / 2 : Math.max(80, top - 14)}px`;
    turn.style.width = `${Math.min(220, (right - left) * .65)}px`;
    turn.style.transform = vertical ? `translate(-50%, -50%) rotate(${direction === "up" ? -90 : 90}deg)`
      : `translate(-50%, -100%) scaleX(${direction === "left" ? -1 : 1})`;
    return;
  }
  const start = scene.projectNode(gesture.start!);
  const end = scene.projectNode(gesture.end!);
  if (!start || !end) {
    cue.hidden = true;
    return;
  }
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  for (const [ring, node] of [[startRing, start], [endRing, end]] as const) {
    ring.dataset.nodeId = String(node.id);
    ring.style.left = `${node.x}px`;
    ring.style.top = `${node.y}px`;
    ring.style.width = ring.style.height = `${node.radius * 2 + 3}px`;
  }
  const dx = (end.x - start.x) / (distance || 1);
  const dy = (end.y - start.y) / (distance || 1);
  const fromX = start.x + dx * start.radius;
  const fromY = start.y + dy * start.radius;
  const length = Math.max(0, distance - start.radius - end.radius);
  line.style.left = `${fromX}px`;
  line.style.top = `${fromY}px`;
  line.style.width = `${length}px`;
  line.style.transform = `rotate(${angle}deg)`;
  line.style.setProperty("--cue-label-angle", `${-angle}deg`);
  hand.style.left = `${fromX}px`;
  hand.style.top = `${fromY}px`;
  hand.style.setProperty("--cue-dx", `${dx * length}px`);
  hand.style.setProperty("--cue-dy", `${dy * length}px`);
}

function renderOnboarding() {
  const copy = [
    {
      step: "1 of 9",
      title: "Make one connection.",
      message: "Drag from one node to a neighboring node.",
      action: null,
    },
    {
      step: "2 of 9",
      title: "Remove the link.",
      message: "Drag across the same linked pair again to remove it.",
      action: null,
    },
    {
      step: "3 of 9",
      title: "Double-tap a node.",
      message: "Tap twice quickly to connect all available neighbors. With a mouse, double-click.",
      action: null,
    },
    {
      step: "4 of 9",
      title: "Clear every dot.",
      message: "Drag or double-tap nodes until every dot is gone. Double-tap a cleared node to remove its links.",
      action: null,
    },
    {
      step: "5 of 9",
      title: `Turn ${tutorialDirections[onboardingRotation]}.`,
      message: touchInput.matches
        ? `Tap the ${tutorialDirections[onboardingRotation]} arrow in the control panel.`
        : `Press ${tutorialKeys[tutorialDirections[onboardingRotation]]} on your keyboard to turn the puzzle.`,
      action: null,
    },
    {
      step: "6 of 9",
      title: "Make a 3D connection.",
      message: "Drag from one node to a neighboring node. Turn the puzzle whenever you need another side.",
      action: null,
    },
    {
      step: "7 of 9",
      title: "Undo your move.",
      message: "Press Undo to remove your last connection. On desktop: Ctrl / ⌘ + Z.",
      action: null,
    },
    {
      step: "8 of 9",
      title: "Redo your move.",
      message: "Press Redo to restore that connection. On desktop: Ctrl / ⌘ + Shift + Z.",
      action: null,
    },
    {
      step: "9 of 9",
      title: onboardingToolsComplete ? "You’re ready." : "Try a hint.",
      message: onboardingToolsComplete ? "You’ve learned the tools. Finish the tutorial to choose a puzzle."
        : "Press Hint to get help with a connection. On desktop: H.",
      action: onboardingToolsComplete ? "Finish tutorial" : null,
    },
  ][onboardingStep];
  el("onboarding-step").textContent = onboardingStep === 4
    ? `${copy.step} · Direction ${onboardingRotation + 1} of 4` : copy.step;
  el("onboarding-title").textContent = copy.title;
  el("onboarding-message").textContent = copy.message;
  const next = el<HTMLButtonElement>("onboarding-next");
  next.hidden = !copy.action;
  next.innerHTML = copy.action ? `${copy.action}${icon("right")}` : "";
  el("onboarding-turn-controls").hidden = onboardingStep !== 4;
  el("onboarding-control-lesson").hidden = onboardingStep < 6;
  app.classList.toggle("onboarding-controls-active", onboardingStep >= 6);
  renderOnboardingTools();
  renderRotationGuidance();
  onboardingCue = onboardingCueForStep();
  scene.setRemovalCue(onboardingStep === 1 && tutorialSettings.enabled && tutorialSettings.removalCue ? onboardingConnection : null);
  requestAnimationFrame(renderOnboardingCue);
  captureAnalytics("onboarding_lesson_viewed", {
    lesson: ["connection", "remove", "node_fill", "network", "rotation", "3d_connection", "undo", "redo", "hint"][onboardingStep],
    step: onboardingStep + 1,
  });
}
function renderRotationGuidance() {
  const keys = el("onboarding-rotation-keys");
  keys.hidden = onboardingStep !== 4 || touchInput.matches;
  keys.innerHTML = tutorialDirections.map((direction, index) =>
    `<kbd class="${index === onboardingRotation ? "current" : index < onboardingRotation ? "done" : ""}">${tutorialKeys[direction]}</kbd>`,
  ).join("");
  const controls = el("onboarding-turn-controls");
  controls.style.setProperty("--tool-cue-color", tutorialSettings.color);
  controls.querySelectorAll<HTMLButtonElement>("[data-onboarding-rotate]").forEach(button => {
    button.classList.toggle("tutorial-tool-ping", onboardingStep === 4 && tutorialSettings.enabled
      && tutorialSettings.rotationCue && button.dataset.onboardingRotate === tutorialDirections[onboardingRotation]);
  });
}
function rotateOnboarding(direction: TutorialDirection) {
  if (mode !== "onboarding" || onboardingStep !== 4 || scene.isViewMoving) return;
  scene.rotate(direction);
  if (direction !== tutorialDirections[onboardingRotation]) return;
  onboardingRotation++;
  if (onboardingRotation === tutorialDirections.length) {
    onboardingStep = 5;
    onboardingRotation = 0;
  }
  renderOnboarding();
}
touchInput.addEventListener("change", () => {
  if (mode === "onboarding") renderOnboarding();
});
function renderOnboardingTools() {
  const toolbar = el("onboarding-control-lesson");
  toolbar.style.setProperty("--tool-cue-color", tutorialSettings.color);
  const expected = onboardingToolsComplete ? null : ["undo", "redo", "hint"][onboardingStep - 6];
  for (const tool of ["undo", "redo", "restart", "hint"] as const) {
    const button = el<HTMLButtonElement>(`onboarding-${tool}`);
    button.disabled = !puzzle || (tool === "undo" && !puzzle.canUndo)
      || (tool === "redo" && !puzzle.canRedo) || (tool === "hint" && onboardingStep < 8);
    button.classList.toggle("tutorial-tool-ping", tutorialSettings.enabled && tutorialSettings.toolCue && tool === expected);
  }
}
function useOnboardingTool(tool: "undo" | "redo" | "hint" | "restart") {
  if (mode !== "onboarding" || onboardingStep < 6 || !puzzle) return;
  scene.cancelPendingTap();
  onStrokeEnd(false);
  if (tool === "hint" && onboardingStep < 8) return;
  if (tool === "restart") {
    puzzle.reset();
    onboardingStep = 5;
    onboardingToolsComplete = false;
  } else {
    const hintResult = tool === "hint" ? puzzle.hint() : null;
    const changed = hintResult ? hintResult.changed : tool !== "hint" && puzzle[tool]();
    if (!changed) return;
    if (hintResult?.edge) scene.focusNode(hintResult.edge[0]);
    if (tool === "undo" && onboardingStep === 6) onboardingStep = 7;
    else if (tool === "redo" && onboardingStep === 7) onboardingStep = 8;
    else if (tool === "hint" && onboardingStep === 8) onboardingToolsComplete = true;
    tone(tool === "undo" ? "disconnect" : "connect");
  }
  selectNode(null);
  scene.refresh();
  renderOnboarding();
}
function finishOnboarding(completed = false) {
  captureAnalytics(completed ? "onboarding_completed" : "onboarding_skipped", {
    last_step: onboardingStep + 1,
  });
  onboardingCompleted = true;
  showOnboarding = false;
  clearCompletionMoment();
  onStrokeEnd(false);
  puzzle = null;
  selected = null;
  mode = "home";
  app.className = "home";
  moveCanvas("home-stage");
  updateOptions();
  persist();
  el("start-button").focus({ preventScroll: true });
}
function startOnboarding() {
  clearCompletionMoment();
  if (mode === "playing" && puzzle && !puzzle.solved) {
    onStrokeEnd(false);
    savedPuzzle = puzzle;
    savedView = scene.serializeView();
    savedSelection = selected;
  }
  if (demoFrame) cancelAnimationFrame(demoFrame);
  demoFrame = 0;
  demo.stop();
  puzzle = new Puzzle({ size: 3, depth: 1, difficulty: "easy", seed: 17 });
  selected = null;
  onboardingStep = 0;
  onboardingRotation = 0;
  onboardingToolsComplete = false;
  onboardingConnection = null;
  mode = "onboarding";
  app.className = "onboarding";
  moveCanvas("onboarding-stage");
  scene.setPuzzle(puzzle);
  scene.setInteractive(true);
  captureAnalytics("onboarding_started", { grid_size: 3, depth: 1 });
  renderOnboarding();
}
function showOnboarding3d() {
  if (mode !== "onboarding" || onboardingStep !== 3) return;
  onboardingStep = 4;
  puzzle = new Puzzle({ size: 3, depth: 3, difficulty: "easy", seed: 17 });
  // Let the completed flat board open into the first 3D puzzle rather than
  // replacing the scene in a single frame.
  scene.setPuzzle(puzzle, false, true);
  scene.setInteractive(true);
  renderOnboarding();
}
function completeOnboarding2dIfSolved() {
  const active = puzzle;
  if (
    mode !== "onboarding" ||
    onboardingStep !== 3 ||
    !active?.solved
  )
    return false;
  captureAnalytics("onboarding_2d_completed", {
    connections: active.edges.length,
  });
  scene.setInteractive(false);
  playCompletionMoment(() => {
    if (mode === "onboarding" && onboardingStep === 3 && puzzle === active)
      showOnboarding3d();
  });
  return true;
}
function onStrokeStart(id: number) {
  if (!puzzle || document.querySelector("dialog[open]"))
    return;
  if (mode === "onboarding") {
    // During the turn lesson, even drags that begin on a node should rotate,
    // because nodes cover much of the compact 3D board. The following lesson
    // restores node drags so the player can make a real 3D connection.
    if (onboardingStep === 2 || onboardingStep === 4 || onboardingStep > 5) return false;
    onStrokeEnd(false);
    selectNode(id);
    strokePuzzle = puzzle;
    strokeChanged = false;
    strokeAdded = 0;
    strokeRemoved = 0;
    strokeEdges.clear();
    puzzle.beginBatch();
    return;
  }
  if (mode !== "playing") return;
  onStrokeEnd();
  strokePuzzle = puzzle;
  strokeChanged = false;
  strokeAdded = 0;
  strokeRemoved = 0;
  strokeEdges.clear();
  puzzle.beginBatch();
  selectNode(id);
}
function onStrokeEdge(a: number, b: number): boolean {
  if (
    !puzzle ||
    strokePuzzle !== puzzle ||
    document.querySelector("dialog[open]") ||
    !puzzle.neighbors(a).includes(b)
  )
    return false;
  const key = edgeKey(a, b);
  // Crossing back over a link in the same stroke must not toggle it again.
  if (strokeEdges.has(key)) {
    selectNode(b);
    return true;
  }
  const count = puzzle.edges.length;
  if (mode === "onboarding") {
    if (onboardingStep === 0 && onboardingConnection) return false;
    if (
      onboardingStep === 1 &&
      (!onboardingConnection || edgeKey(...onboardingConnection) !== key)
    )
      return false;
  }
  const result = puzzle.toggle(a, b);
  if (!result.changed) return false;
  strokeEdges.add(key);
  strokeChanged = true;
  if (mode === "onboarding") {
    if (onboardingStep === 0 && puzzle.edges.length > count)
      onboardingConnection = [a, b];
    scene.refresh();
    return true;
  }
  trackFirstConnection("drag");
  if (puzzle.edges.length > count) strokeAdded++;
  else strokeRemoved++;
  selectNode(b);
  tone(puzzle.edges.length > count ? "connect" : "disconnect");
  updateGame();
  return true;
}
function onStrokeEnd(showCompletion = true) {
  const active = strokePuzzle;
  if (!active) return;
  active.endBatch();
  const changed = strokeChanged;
  const added = strokeAdded;
  const removed = strokeRemoved;
  strokePuzzle = null;
  strokeChanged = false;
  strokeAdded = 0;
  strokeRemoved = 0;
  strokeEdges.clear();
  if (active === puzzle) {
    selectNode(null);
    if (mode === "onboarding") {
      if (changed && onboardingStep === 0) {
        onboardingStep = 1;
        renderOnboarding();
      }
      const tutorialConnection = onboardingConnection;
      if (
        changed &&
        onboardingStep === 1 &&
        tutorialConnection &&
        !active.edges.some(
          edge =>
            edgeKey(...edge) ===
            edgeKey(tutorialConnection[0], tutorialConnection[1]),
        )
      ) {
        onboardingConnection = null;
        onboardingStep = 2;
        renderOnboarding();
      }
      if (!completeOnboarding2dIfSolved() && changed && onboardingStep === 3) renderOnboarding();
      if (changed && onboardingStep === 5) {
        onboardingStep = 6;
        renderOnboarding();
      }
      return;
    }
    if (changed) {
      trackPuzzleAction("connection_stroke", "drag", added + removed, added, removed);
      updateGame(showCompletion);
    } else if (showCompletion) maybeComplete();
  }
}
function updateGame(showCompletion = true) {
  if (!puzzle) return;
  scene.refresh();
  const percent = Math.round(puzzle.progress * 100);
  el("progress-value").textContent = `${percent}%`;
  el("progress-fill").style.width = `${percent}%`;
  app
    .querySelector('[role="progressbar"]')!
    .setAttribute("aria-valuenow", String(percent));
  el<HTMLButtonElement>("undo-button").disabled = !puzzle.canUndo;
  el<HTMLButtonElement>("redo-button").disabled = !puzzle.canRedo;
  el<HTMLButtonElement>("hint-button").disabled = puzzle.solved;
  updateNetworkStatus();
  if (showCompletion) maybeComplete();
  if (!puzzle.solved) completionShown = false;
  if (!strokePuzzle) persist();
}
function puzzleAnalyticsProperties() {
  const current = puzzle?.settings;
  return current ? {
    grid_size: current.size,
    depth: current.depth,
    perspective: current.depth === 1 ? "flat" : "3d",
    difficulty: current.difficulty,
    puzzle_seed: current.seed,
  } : {};
}
function puzzleProgressProperties() {
  const active = puzzle;
  if (!active) return {};
  return {
    connection_count: active.edges.length,
    dots_remaining: active.nodes.reduce((total, _, id) => total + active.remaining(id), 0),
    progress_percent: Math.round(active.progress * 100),
    network_groups: active.connectionGroups.length,
    elapsed_seconds: Math.max(0, Math.round((performance.now() - gameStartedAt) / 1000)),
  };
}
type PuzzleAction = "connection" | "connection_stroke" | "node_fill" | "hint" | "undo" | "redo" | "rotate";
type PuzzleInput = "tap" | "drag" | "double_tap" | "hint" | "toolbar" | "gesture";
function trackPuzzleAction(
  action: PuzzleAction,
  input: PuzzleInput,
  changedConnections = 0,
  connectionsAdded = 0,
  connectionsRemoved = 0,
) {
  if (mode !== "playing" || !puzzle) return;
  puzzleSessionStats.actions++;
  puzzleSessionStats.connectionsAdded += connectionsAdded;
  puzzleSessionStats.connectionsRemoved += connectionsRemoved;
  if (action === "hint") puzzleSessionStats.hints++;
  if (action === "undo") puzzleSessionStats.undos++;
  if (action === "redo") puzzleSessionStats.redos++;
  if (action === "rotate") puzzleSessionStats.rotations++;
  captureAnalytics("puzzle_action", {
    ...puzzleAnalyticsProperties(),
    ...puzzleProgressProperties(),
    action,
    input,
    changed_connections: changedConnections,
    connections_added: connectionsAdded,
    connections_removed: connectionsRemoved,
  });
}
function trackPuzzleSession(event: "puzzle_session_completed" | "puzzle_session_exited" | "puzzle_progress_snapshot", reason: string) {
  if (mode !== "playing" || !puzzle) return;
  captureAnalytics(event, {
    ...puzzleAnalyticsProperties(),
    ...puzzleProgressProperties(),
    ...puzzleSessionStats,
    reason,
  });
}
function trackFirstConnection(input: "tap" | "drag" | "double_tap" | "hint") {
  if (mode !== "playing" || firstConnectionTracked) return;
  firstConnectionTracked = true;
  captureAnalytics("puzzle_first_connection", { input, ...puzzleAnalyticsProperties() });
}
function updateNetworkStatus() {
  networkGroups = mode === "playing" && puzzle?.disconnected ? puzzle.connectionGroups : [];
  const visible = networkGroups.length > 1;
  el("network-status").hidden = !visible;
  app.classList.toggle("network-separated", visible);
  const signature = JSON.stringify(networkGroups);
  if (signature !== networkSignature) {
    networkSignature = signature;
    highlightedGroup = 0;
    nextGroupToShow = 0;
  }
  scene.setHighlightedGroup(visible ? networkGroups[highlightedGroup] : null);
  if (!visible) return;
  const title = `${networkGroups.length} separate groups`;
  const detail = `Highlighted group ${highlightedGroup + 1} · ${networkGroups[highlightedGroup].length} nodes`;
  if (el("network-status-title").textContent !== title) el("network-status-title").textContent = title;
  if (el("network-group-detail").textContent !== detail) el("network-group-detail").textContent = detail;
  el("network-group-button").textContent = `Show group ${nextGroupToShow + 1}`;
}
function maybeComplete() {
  if (
    mode === "playing" &&
    puzzle?.solved &&
    !completionShown &&
    !strokePuzzle &&
    !scene.hasPendingTap &&
    !document.querySelector("dialog[open]")
  ) {
    completionShown = true;
    if (attemptId) recordCompletion(puzzle, attemptId);
    captureAnalytics("puzzle_completion_viewed", {
      ...puzzleAnalyticsProperties(),
      ...puzzleProgressProperties(),
    });
    trackPuzzleSession("puzzle_session_completed", "completed");
    savedPuzzle = null;
    // The cadence continues the player's score, including its rests and held notes.
    tone("complete", 1, undefined, getConfig().demo.tempoBpm);
    scene.setInteractive(false);
    const completedPuzzle = puzzle;
    playCompletionMoment(() => {
      if (mode !== "playing" || puzzle !== completedPuzzle || !puzzle.solved) return;
      completionShare.update(puzzle.settings, puzzle.edges.length);
      el<HTMLDialogElement>("completion-dialog").showModal();
    });
  }
}
function startGame(
  resume = false,
  seed = dailyPuzzleSeed(),
  puzzleType: "daily" | "new" = "daily",
) {
  clearCompletionMoment();
  if (demoFrame) cancelAnimationFrame(demoFrame);
  demoFrame = 0;
  demo.stop();
  onStrokeEnd();
  const resumedPuzzle = resume ? savedPuzzle : null;
  if (!resumedPuzzle) limitNewPuzzleSize();
  if (!resumedPuzzle || !attemptId) attemptId = restoreAttemptId(null);
  const restoredView = resumedPuzzle ? savedView : null;
  const restoredSelection = resumedPuzzle ? savedSelection : null;
  puzzle =
    resumedPuzzle
      ? resumedPuzzle
      : new Puzzle({ ...settings, seed });
  if (!resumedPuzzle) melodyStep = 0;
  savedPuzzle = null;
  savedView = null;
  savedSelection = null;
  selected = null;
  keyboardIndex = -1;
  completionShown = false;
  firstConnectionTracked = resumedPuzzle ? puzzle.edges.length > 0 : false;
  viewRotationTracked = false;
  gameStartedAt = performance.now();
  puzzleSessionStats = {
    actions: 0,
    connectionsAdded: 0,
    connectionsRemoved: 0,
    hints: 0,
    undos: 0,
    redos: 0,
    rotations: 0,
  };
  mode = "playing";
  app.className = `playing${puzzle.settings.depth === 1 ? " flat-playing" : ""}`;
  el("toast").textContent = "";
  const s = puzzle.settings;
  el("game-title").innerHTML =
    `${s.size} × ${s.size}${s.depth > 1 ? ` × ${s.depth}` : ""}<span>${labels[s.difficulty]}</span>`;
  moveCanvas("game-stage");
  scene.setPuzzle(puzzle);
  if (resumedPuzzle) scene.restoreView(restoredView);
  scene.setInteractive(true);
  selectNode(puzzle.solved ? null : restoredSelection);
  updateGame();
  captureAnalytics("puzzle_started", {
    ...puzzleAnalyticsProperties(),
    puzzle_type: puzzleType,
    resumed: !!resumedPuzzle,
  });
  if (!document.querySelector("dialog[open]"))
    app.querySelector("canvas")?.focus({ preventScroll: true });
}
function goHome() {
  clearCompletionMoment();
  onStrokeEnd();
  if (puzzle && !puzzle.solved) trackPuzzleSession("puzzle_session_exited", "home");
  document
    .querySelectorAll<HTMLDialogElement>("dialog[open]")
    .forEach((dialog) => dialog.close());
  savedPuzzle = puzzle && !puzzle.solved ? puzzle : null;
  savedView = savedPuzzle ? scene.serializeView() : null;
  savedSelection = savedPuzzle ? selected : null;
  puzzle = null;
  mode = "home";
  app.className = "home";
  updateNetworkStatus();
  el("toast").textContent = "";
  moveCanvas("home-stage");
  updateOptions();
  el("start-button").focus({ preventScroll: true });
}
function undo() {
  scene.cancelPendingTap();
  onStrokeEnd(false);
  selectNode(null);
  const previous = new Set(puzzle?.edges.map(edge => edgeKey(...edge)));
  if (!puzzle || !puzzle.undo()) return;
  const added = puzzle.edges.filter(edge => !previous.has(edgeKey(...edge))).length;
  const removed = previous.size - puzzle.edges.length + added;
  trackPuzzleAction("undo", "toolbar", added + removed, added, removed);
  tone(added ? "connect" : "disconnect", added || 1);
  updateGame();
}
function redo() {
  scene.cancelPendingTap();
  onStrokeEnd();
  const previous = new Set(puzzle?.edges.map(edge => edgeKey(...edge)));
  if (!puzzle || !puzzle.redo()) return;
  selectNode(null);
  const added = puzzle.edges.filter(edge => !previous.has(edgeKey(...edge))).length;
  const removed = previous.size - puzzle.edges.length + added;
  trackPuzzleAction("redo", "toolbar", added + removed, added, removed);
  tone(added ? "connect" : "disconnect", added || 1);
  updateGame();
}
function hint() {
  scene.cancelPendingTap();
  onStrokeEnd();
  if (!puzzle || puzzle.solved) return;
  const result = puzzle.hint();
  if (!result.changed) {
    toast(result.reason || "Try removing a connection to make room.");
    return;
  }
  selectNode(null);
  if (result.edge) {
    scene.focusNode(result.edge[0]);
  }
  trackFirstConnection("hint");
  trackPuzzleAction("hint", "hint", 1, result.removed ? 0 : 1, result.removed ? 1 : 0);
  captureAnalytics("puzzle_hint_used", {
    ...puzzleAnalyticsProperties(),
    action: result.removed ? "removed" : "added",
  });
  tone(result.removed ? "disconnect" : "connect");
  updateGame();
  toast(
    result.removed
      ? "One connection removed to open up a path."
      : "A connection to help you along.",
  );
}
let confirmAction: () => void = () => {};
function confirm(
  title: string,
  description: string,
  actionLabel: string,
  action: () => void,
) {
  el("confirm-title").textContent = title;
  el("confirm-description").textContent = description;
  el("confirm-button").textContent = actionLabel;
  confirmAction = action;
  el<HTMLDialogElement>("confirm-dialog").showModal();
}
function startFresh() {
  startGame();
}
el("start-button").addEventListener("click", startFresh);
el("resume-button").addEventListener("click", () => startGame(true));
for (const tool of ["undo", "redo", "restart", "hint"] as const)
  el(`onboarding-${tool}`).addEventListener("click", () => useOnboardingTool(tool));
el("onboarding-skip").addEventListener("click", () => finishOnboarding());
el("onboarding-next").addEventListener("click", () => {
  if (onboardingStep === 8 && onboardingToolsComplete) finishOnboarding(true);
});
document
  .querySelectorAll<HTMLElement>("[data-onboarding-rotate]")
  .forEach(button =>
    button.addEventListener("click", () =>
      rotateOnboarding(button.dataset.onboardingRotate as TutorialDirection),
    ),
  );
el("home-button").addEventListener("click", () => {
  if (mode === "playing") goHome();
});
el("help-button").addEventListener("click", () => {
  scene.cancelPendingTap();
  startOnboarding();
});
for (const name of ["keyboard", "music"])
  el(`${name}-button`).addEventListener("click", () => {
    if (name === "music" && !getConfig().sound.showAmbientMusic) return;
    scene.cancelPendingTap();
    el<HTMLDialogElement>(`${name}-dialog`).showModal();
  });
el("sound-button").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  updateSound();
  persist();
  // The speaker preview never consumes a note from the player's melody.
  if (soundEnabled && !document.hidden) gameAudio.play("connect", { melodyIndex: 0 });
});
el("music-toggle").addEventListener("click", event => {
  if (!getConfig().sound.showAmbientMusic) return;
  musicEnabled = !musicEnabled;
  updateMusic();
  if (event.isTrusted && !document.hidden) ambientAudio.unlock();
  persist();
});
const unlockAudioFromGesture = (input: Event) => {
  if (!input.isTrusted || document.hidden) return;
  // iOS may grant audio permission only on touch release, while other mobile
  // browsers do so on pointerdown. Supporting both keeps SFX dependable.
  gameAudio.unlock();
  ambientAudio.unlock();
};
for (const event of ["pointerdown", "pointerup", "touchend", "keydown", "click"])
  document.addEventListener(event, unlockAudioFromGesture, { capture: true });
document.addEventListener("visibilitychange", () => {
  gameAudio.setEnabled(soundEnabled && !document.hidden);
  if (document.hidden) {
    trackPuzzleSession("puzzle_progress_snapshot", "backgrounded");
    ambientAudio.suspend();
    demo.cancelPendingSound();
    onStrokeEnd(false);
    persist();
  } else {
    ambientAudio.resume();
    maybeComplete();
  }
});
el("demo-toggle").addEventListener("click", () => {
  demo.togglePaused();
  el("demo-toggle-icon").innerHTML = icon(demo.paused ? "play" : "pause");
  const label = demo.paused ? "Resume demo" : "Pause demo";
  el("demo-toggle").setAttribute("aria-label", label);
  el("demo-toggle").setAttribute("aria-pressed", String(demo.paused));
  el("demo-toggle").title = label;
  el("preview-caption").textContent = demo.paused
    ? "Continue Solving"
    : "Solving";
});
el("undo-button").addEventListener("click", undo);
el("redo-button").addEventListener("click", redo);
el("network-group-button").addEventListener("click", () => {
  if (mode !== "playing" || !puzzle?.disconnected) return;
  scene.cancelPendingTap();
  onStrokeEnd(false);
  selectNode(null);
  highlightedGroup = nextGroupToShow;
  nextGroupToShow = (nextGroupToShow + 1) % networkGroups.length;
  updateNetworkStatus();
  // Prefer a node already on the front face when part of this group is visible.
  const frontNodes = scene.getScreenNodes();
  const group = networkGroups[highlightedGroup];
  const target = group.find(id => frontNodes.some(node => node.id === id && node.pickable)) ?? group[0];
  scene.focusNode(target);
});
el("completion-dialog").addEventListener("cancel", (event) =>
  event.preventDefault(),
);
for (const id of ["help-dialog", "keyboard-dialog", "music-dialog", "confirm-dialog"])
  el(id).addEventListener("close", maybeComplete);
el("hint-button").addEventListener("click", hint);
el("view-button").addEventListener("click", () => scene.resetView());
el("restart-button").addEventListener("click", () => {
  scene.cancelPendingTap();
  onStrokeEnd();
  if (!puzzle?.edges.length) {
    puzzle?.reset();
    scene.resetView();
    melodyStep = 0;
    selectNode(null);
    updateGame();
    return;
  }
  confirm(
    "Start this puzzle over?",
    "Your connections will be cleared. The puzzle stays the same.",
    "Restart puzzle",
    () => {
      puzzle?.reset();
      melodyStep = 0;
      selectNode(null);
      updateGame();
      toast("A fresh start on the same puzzle.");
    },
  );
});
el("confirm-button").addEventListener("click", () => {
  el<HTMLDialogElement>("confirm-dialog").close();
  confirmAction();
});
el("next-button").addEventListener("click", () => {
  if (puzzle) settings = { ...puzzle.settings };
  el<HTMLDialogElement>("completion-dialog").close();
  startGame(false, Math.floor(Math.random() * 0x7fffffff) || 1, "new");
});
el("completion-home").addEventListener("click", goHome);
document
  .querySelectorAll<HTMLElement>("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      el<HTMLDialogElement>(button.dataset.close!).close(),
    ),
  );
document
  .querySelectorAll<HTMLElement>("[data-rotate]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      scene.rotate(button.dataset.rotate as "left" | "right" | "up" | "down"),
    ),
  );
document.querySelectorAll<HTMLElement>("[data-size]").forEach((button) =>
  button.addEventListener("click", () => {
    const size = Number(button.dataset.size);
    if (button.hidden) return;
    const flat = settings.depth === 1;
    settings.size = size;
    settings.depth = flat ? 1 : settings.size;
    updateOptions(true);
  }),
);
document.querySelectorAll<HTMLElement>("[data-depth]").forEach((button) =>
  button.addEventListener("click", () => {
    const depth = button.dataset.depth === "flat" ? 1 : settings.size;
    if (depth === settings.depth) return;
    settings.depth = depth;
    updateOptions(true);
  }),
);
document.querySelectorAll<HTMLElement>("[data-difficulty]").forEach((button) =>
  button.addEventListener("click", () => {
    settings.difficulty = button.dataset.difficulty as Difficulty;
    updateOptions();
  }),
);
document.addEventListener("keydown", (event) => {
  if ((mode !== "playing" && mode !== "onboarding") || !puzzle || document.querySelector("dialog[open]"))
    return;
  if (event.target instanceof Element && event.target.closest("#admin-panel")) return;
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("input, select, textarea, [contenteditable=true]")
  )
    return;
  const key = event.key.toLowerCase();
  if (event.altKey) return;
  if ((event.ctrlKey || event.metaKey) && key !== "z") return;
  if (
    key === "enter" &&
    event.target instanceof HTMLElement &&
    event.target.closest("button, summary")
  )
    return;
  if (mode === "onboarding") {
    const direction = ({ arrowleft: "left", a: "left", arrowright: "right", d: "right",
      arrowup: "up", w: "up", arrowdown: "down", s: "down" } as Record<string, TutorialDirection>)[key];
    if (onboardingStep === 4 && direction && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) rotateOnboarding(direction);
    } else if (onboardingStep >= 6 && (event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (!event.repeat) useOnboardingTool(event.shiftKey ? "redo" : "undo");
    } else if (onboardingStep >= 6 && key === "h" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) useOnboardingTool("hint");
    }
    return;
  }
  const rotations: Record<string, "left" | "right" | "up" | "down"> = {
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right",
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
  };
  if (rotations[key]) {
    event.preventDefault();
    if (puzzle.settings.depth !== 1) scene.rotate(rotations[key]);
  } else if (key === "z" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (key === "h") {
    event.preventDefault();
    hint();
  } else if (key === "r") scene.resetView();
  else if (key === "escape") {
    scene.cancelPendingTap();
    selectNode(null);
  } else if (key === "f") {
    event.preventDefault();
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() => toast("Fullscreen isn’t available in this browser."));
  } else if (key === "[" || key === "]") {
    event.preventDefault();
    keyboardIndex =
      (keyboardIndex + (key === "]" ? 1 : -1) + puzzle.nodes.length) %
      puzzle.nodes.length;
    const node = puzzle.nodes[keyboardIndex];
    scene.focusNode(node.id);
    toast(
      `Node ${node.id + 1}: ${puzzle.remaining(node.id)} dots. Press Enter to choose.`,
    );
  } else if (key === "enter" && keyboardIndex >= 0) {
    event.preventDefault();
    scene.cancelPendingTap();
    onNode(puzzle.nodes[keyboardIndex].id);
  }
});
function resizeScene() {
  scene.resize();
  if (mode === "onboarding")
    requestAnimationFrame(() => requestAnimationFrame(renderOnboardingCue));
}
window.addEventListener("resize", resizeScene);
document.addEventListener("fullscreenchange", resizeScene);
window.addEventListener("pagehide", () => {
  ambientAudio.suspend();
  onStrokeEnd();
  persist();
});
window.addEventListener("pageshow", () => {
  if (!document.hidden) ambientAudio.resume();
});

Object.assign(window, {
  render_game_to_text: () => {
    const displayed = mode === "home" ? demo.puzzle : puzzle;
    const screenNodes = new Map(
      scene.getScreenNodes().map((node) => [node.id, node]),
    );
    return JSON.stringify({
      mode,
      coordinates:
        "Node coordinates: x right, y up, z front. Screen coordinates are viewport pixels, origin top-left.",
      settings: displayed?.settings ?? settings,
      selected: mode === "home" ? null : selected,
      view: scene.getViewState(),
      tutorialRotation: mode === "onboarding" && onboardingStep === 4 ? tutorialDirections[onboardingRotation] : null,
      removalCue: scene.getRemovalCueState(),
      progress: displayed?.progress ?? 0,
      solved: displayed?.solved ?? false,
      disconnected: displayed?.disconnected ?? false,
      network: { groups: networkGroups, highlight: scene.getNetworkHighlightState() },
      edges: displayed?.edges ?? [],
      demo: mode === "home" ? demo.getState() : null,
      connectionAnimations: scene.getConnectionAnimationState(),
      dragConnection: scene.getDragConnectionState(),
      connectionColors: scene.getConnectionColorState(),
      shapeTransition: scene.getShapeTransitionState(),
      floating: scene.getFloatingState(),
      gum: scene.getGumState(),
      dotAnimations: scene.getDotAnimationState(),
      musicNotes: scene.getMusicNoteState(),
      musicScore: scene.getMusicScoreState(),
      config: getConfig(),
      audio: { soundEnabled, musicAvailable: getConfig().sound.showAmbientMusic, musicEnabled: musicEnabled && getConfig().sound.showAmbientMusic, ambientTrack: "Moonlight — Scott Buckley" },
      melodyStep: mode === "home" ? (demo.puzzle?.edges.length ?? 0) : melodyStep,
      nodes:
        displayed?.nodes.map((node) => ({
          ...node,
          remaining: displayed!.remaining(node.id),
          screen: screenNodes.get(node.id),
        })) ?? [],
      dialog: document.querySelector("dialog[open]")?.id ?? null,
    });
  },
  advanceTime: (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return;
    if (mode !== "home") { scene.advanceTime(ms); return; }
    for (let remaining = ms; remaining > 0; remaining -= 40) {
      const step = Math.min(40, remaining);
      if (scene.hasAnimations || scene.hasAmbientMotion) scene.advanceTime(step);
      demo.advanceTime(step, demoSuspended());
    }
  },
});
scene.onRender = renderOnboardingCue;
updateSound();
updateMusic();
if (document.hidden) ambientAudio.suspend();
startCompletionTracking();
subscribeFeatureFlag("music-score", enabled => scene.setMusicScoreEnabled(enabled));
startAnalytics();
if (showOnboarding) startOnboarding();
else if (resumeOnLoad) startGame(true);
else updateOptions();
finishLoading();
mountSponsorship({
  beforeOpen: () => {
    scene.cancelPendingTap();
    onStrokeEnd(false);
  },
});
document.addEventListener("close", (event) => {
  if (event.target instanceof HTMLDialogElement && ["sponsor-dialog", "statistics-dialog"].includes(event.target.id))
    maybeComplete();
}, true);
if (new URLSearchParams(location.search).has("admin")) {
  void import("./admin").then(({ mountAdmin }) => mountAdmin(startOnboarding)).catch(() => {
    toast("The configurator could not load. Reload to try again.");
  });
}
