import type { Edition } from "./edition-navigation";

export const EDITION_GUIDE_MARKER = "<!-- edition-guide -->";

interface GuideCopy {
  name: string;
  intro: string;
  clue: string;
  finished: string;
  extraQuestion: [string, string];
}

/** Rules are identical in every edition; only the pieces on the board differ. */
const copy: Record<Edition, GuideCopy> = {
  nodoku: {
    name: "Nodoku",
    intro: "Nodoku is a free connection puzzle for the browser, played on a flat board or a 3D cube you turn in your hands. Ceramic nodes sit on a grid and wait to be linked into one network.",
    clue: "Each dot on a node is one connection it still needs. A node with three dots links to exactly three neighbors.",
    finished: "A node turns green when all of its dots are used.",
    extraQuestion: ["Is Nodoku like Hashi?", "It is close to Hashi (Bridges): clues count links and the network must be connected. Here every link is single, joins direct neighbors only, and the board can be a cube, so you also reason about faces you cannot see."],
  },
  dots: {
    name: "Dots",
    intro: "Dots is the character edition of Nodoku: the same 3D connection puzzle on a dark stage, played with four furry characters: a blue cloud in a beret, a green frog, a yellow triangle in tube glasses and a pink heart in sunglasses.",
    clue: "Each character carries small dots, one for every connection it still needs. A character with two dots links to exactly two neighbors.",
    finished: "When a character uses all of its dots, its eyes and accessories appear, so a face means that character is full.",
    extraQuestion: ["Do the shapes or colors change the rules?", "No. Shape and color are just identity and stay fixed at each spot on the grid; only the dots count. Dots keeps its own saved puzzle."],
  },
  groks: {
    name: "Groks",
    intro: "Groks is the bot edition of Nodoku: the same 3D connection puzzle with a crew of geometric bots in eight colors, from the original teal hexagon to round white and pebble-shaped bots.",
    clue: "Instead of dots, each bot shows mint hexagonal sockets, one for every connection it still needs. A bot with three sockets links to exactly three neighbors.",
    finished: "When a bot fills all of its sockets, it opens its capsule eyes, so a bot looking at you is full.",
    extraQuestion: ["Does a bot's shape tell me how many links it needs?", "No. Each bot keeps its silhouette and color at its spot on the grid; only the sockets count. Groks keeps its own saved puzzle."],
  },
};

const editionLinks: Record<Edition, [string, string]> = {
  nodoku: ["/", "Nodoku, the classic edition with ceramic nodes"],
  dots: ["/dots/", "Dots, with furry characters"],
  groks: ["/groks/", "Groks, with geometric bots"],
};

export function editionGuide(edition: Edition): string {
  const { name, intro, clue, finished, extraQuestion } = copy[edition];
  const others = (Object.keys(editionLinks) as Edition[]).filter(other => other !== edition)
    .map(other => `<li><a href="${editionLinks[other][0]}">${editionLinks[other][1]}</a></li>`).join("");
  return `<section class="edition-guide" aria-labelledby="edition-guide-title">
  <div class="edition-guide-inner">
    <h2 id="edition-guide-title">How to play ${name}</h2>
    <p>${intro}</p>
    <ol>
      <li>${clue}</li>
      <li>Connect two neighbors to draw a link; it uses one connection at each end. Neighbors sit directly left, right, above or below, and links wrap around the edges of a cube. Two nodes share at most one link.</li>
      <li>${finished}</li>
      <li>You win when every connection is used and all nodes form one network. If the board splits into groups, the game highlights the smallest so you can swap links to join them. Any valid solution counts.</li>
    </ol>
    <h3>Controls</h3>
    <ul>
      <li>Tap a node, then a neighbor, or drag through neighbors to link them. Drag across a link to remove it. Double-tap a node (or Shift and click) to fill or clear all of its links.</li>
      <li>Turn the cube by swiping empty space, with the arrow buttons, or with the arrow keys or W A S D. You connect nodes on the face toward you.</li>
      <li>Hint highlights one connection to try. Undo, Redo and Restart sit beside it.</li>
    </ul>
    <h3>Questions</h3>
    <dl>
      <dt>Which boards can I play?</dt>
      <dd>A flat 4 by 4 or 5 by 5 board, or a hollow 3D cube of size 3, 4 or 5, at Gentle, Focused or Intricate complexity.</dd>
      <dt>Is ${name} free?</dt>
      <dd>Yes, on phones, tablets and computers, with no account needed. Start connecting opens the daily puzzle, and your progress is saved in the browser.</dd>
      <dt>${extraQuestion[0]}</dt>
      <dd>${extraQuestion[1]}</dd>
    </dl>
    <h3>Same rules, other pieces</h3>
    <ul>${others}</ul>
  </div>
</section>`;
}

export function prerenderEditionGuide(html: string, edition: Edition): string {
  return html.replace(EDITION_GUIDE_MARKER, editionGuide(edition));
}
