import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const output = path.resolve("static/og-image.png");
const sceneSource = path.resolve("static/og-scene.png");
await mkdir(path.dirname(output), { recursive: true });

// This transparent Playwright capture shows the actual Three.js home board in
// a partly solved state, rather than using a hand-drawn stand-in. Refresh it
// after a material or camera redesign.
const scene = await sharp(await readFile(sceneSource))
  .extract({ left: 400, top: 18, width: 400, height: 440 })
  .resize({ width: 590, height: 630, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#f8f7fb"/><stop offset="1" stop-color="#eeedf6"/>
    </linearGradient>
    <linearGradient id="copyShield" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f8f7fb" stop-opacity="1"/>
      <stop offset=".76" stop-color="#f4f2f9" stop-opacity=".97"/>
      <stop offset="1" stop-color="#eeedf6" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="38"/></filter>
  </defs>
  <rect width="1200" height="630" fill="url(#paper)"/>
  <circle cx="250" cy="532" r="240" fill="#ded8ed" opacity=".36" filter="url(#soft)"/>
  <circle cx="1010" cy="150" r="210" fill="#dad7ed" opacity=".38" filter="url(#soft)"/>
  <rect width="710" height="630" fill="url(#copyShield)"/>
  <!-- Match the app logo: its paths join the inset node centres, not their outer edges. -->
  <g transform="translate(68 57) scale(1.35)">
    <path d="M8 9h18v17H8Z" fill="none" stroke="#8270bd" stroke-width="3" stroke-linejoin="round"/>
    <g fill="#8270bd"><circle cx="8" cy="9" r="4.7"/><circle cx="26" cy="9" r="4.7"/><circle cx="8" cy="26" r="4.7"/></g>
    <circle cx="26" cy="26" r="5" fill="#a0beaf"/>
  </g>
  <text x="130" y="92" fill="#302b48" font-family="Outfit, Arial, sans-serif" font-size="38" font-weight="700" letter-spacing="-1.3">nodoku</text>
  <text x="74" y="245" fill="#302b48" font-family="Outfit, Arial, sans-serif" font-size="58" font-weight="700" letter-spacing="-3.2">3D spatial</text>
  <text x="74" y="308" fill="#302b48" font-family="Outfit, Arial, sans-serif" font-size="58" font-weight="700" letter-spacing="-3.2">reasoning puzzle.</text>
  <text x="78" y="388" fill="#746d87" font-family="Outfit, Arial, sans-serif" font-size="26" font-weight="500">Connect every node.</text>
</svg>`;

await sharp({
  create: { width: 1200, height: 630, channels: 4, background: "#eeedf6" },
})
  .composite([
    { input: Buffer.from(svg) },
    { input: scene, left: 610, top: 0 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);
console.log(`Wrote ${output}`);
