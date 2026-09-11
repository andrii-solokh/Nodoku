import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const output = path.resolve("static/og-image.png");
await mkdir(path.dirname(output), { recursive: true });

const nodes = [
  [790, 194, 38, "#fcfaf5"], [930, 158, 48, "#a9cbbd"], [1080, 216, 36, "#fcfaf5"],
  [754, 332, 46, "#a9cbbd"], [920, 308, 34, "#fcfaf5"], [1086, 350, 50, "#a9cbbd"],
  [810, 468, 35, "#fcfaf5"], [960, 450, 50, "#a9cbbd"], [1100, 494, 38, "#fcfaf5"],
];
const links = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [3, 6], [4, 7], [5, 8], [6, 7], [7, 8]];
const link = ([from, to], index) => {
  const [x1, y1] = nodes[from];
  const [x2, y2] = nodes[to];
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#link${index})" stroke-width="16" stroke-linecap="round"/>`;
};
const node = ([x, y, radius, color], index) => `
  <g filter="url(#nodeShadow)">
    <circle cx="${x}" cy="${y}" r="${radius}" fill="url(#node${index})"/>
    <circle cx="${x - radius * .28}" cy="${y - radius * .3}" r="${Math.max(3, radius * .11)}" fill="#ffffff" opacity=".78"/>
  </g>`;
const linkDefs = links.map(([from, to], index) => {
  const start = nodes[from][3], end = nodes[to][3];
  return `<linearGradient id="link${index}" gradientUnits="userSpaceOnUse" x1="${nodes[from][0]}" y1="${nodes[from][1]}" x2="${nodes[to][0]}" y2="${nodes[to][1]}">
    <stop offset="0" stop-color="${start}"/><stop offset=".5" stop-color="#8170c9"/><stop offset="1" stop-color="${end}"/>
  </linearGradient>`;
}).join("");
const nodeDefs = nodes.map(([, , , color], index) => `<radialGradient id="node${index}" cx="31%" cy="25%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".58" stop-color="${color}"/><stop offset="1" stop-color="#${color.slice(1)}"/></radialGradient>`).join("");

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${linkDefs}
    ${nodeDefs}
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f5f3fa"/><stop offset="1" stop-color="#e7e5f0"/></linearGradient>
    <filter id="nodeShadow" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="13" stdDeviation="12" flood-color="#443861" flood-opacity=".17"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="28"/></filter>
  </defs>
  <rect width="1200" height="630" fill="url(#paper)"/>
  <circle cx="1020" cy="250" r="280" fill="#dcd8ee" opacity=".36" filter="url(#soft)"/>
  <path d="M0 518 C222 448 392 647 632 557" fill="none" stroke="#d7d2e5" stroke-width="1" opacity=".7"/>
  <path d="M0 560 C222 490 392 689 632 599" fill="none" stroke="#d7d2e5" stroke-width="1" opacity=".5"/>
  <g transform="translate(76 68)">
    <path d="M0 0H34V34H0Z" fill="none" stroke="#8170c9" stroke-width="7" stroke-linejoin="round"/>
    <circle cx="0" cy="0" r="9" fill="#8170c9"/><circle cx="34" cy="0" r="9" fill="#8170c9"/><circle cx="0" cy="34" r="9" fill="#8170c9"/><circle cx="34" cy="34" r="9" fill="#a9cbbd"/>
  </g>
  <text x="132" y="95" fill="#302b48" font-family="Arial, sans-serif" font-size="38" font-weight="700" letter-spacing="-1">nodoku</text>
  <text x="76" y="236" fill="#302b48" font-family="Arial, sans-serif" font-size="72" font-weight="700" letter-spacing="-4">A little space</text>
  <text x="76" y="314" fill="#302b48" font-family="Arial, sans-serif" font-size="72" font-weight="700" letter-spacing="-4">to connect.</text>
  <text x="80" y="382" fill="#746d87" font-family="Arial, sans-serif" font-size="26">Turn the puzzle. Follow the dots.</text>
  <text x="80" y="420" fill="#746d87" font-family="Arial, sans-serif" font-size="26">Bring it all together.</text>
  <g opacity=".94">${links.map(link).join("")}${nodes.map(node).join("")}</g>
  <text x="80" y="558" fill="#8170c9" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="1.4">A TACTILE 3D CONNECTION PUZZLE</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
console.log(`Wrote ${output}`);
