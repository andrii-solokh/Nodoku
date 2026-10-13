import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

for (const [path, name, url] of [
  ["index.html", "Nodoku", "https://nodoku.solokh.com/"],
  ["dots/index.html", "Dots", "https://nodoku.solokh.com/dots/"],
  ["groks/index.html", "Groks", "https://nodoku.solokh.com/groks/"],
]) {
  test(`${name} publishes Open Graph fallback and playable social-card metadata`, async () => {
    const content = await readFile(new URL(`../${path}`, import.meta.url), "utf8");

    for (const [attribute, property, value] of [
      ["property", "og:type", "website"],
      ["property", "og:site_name", name],
      ["property", "og:url", url],
      ["property", "og:title", `${name} — 3D Spatial Reasoning Puzzle`],
      ["property", "og:image", "https://nodoku.solokh.com/og-image.png?v=3d-safe-v2"],
      ["property", "og:image:secure_url", "https://nodoku.solokh.com/og-image.png?v=3d-safe-v2"],
      ["property", "og:image:width", "1200"],
      ["property", "og:image:height", "630"],
      ["name", "twitter:card", "player"],
      ["name", "twitter:player", `${url}?embed=1`],
      ["name", "twitter:player:width", "640"],
      ["name", "twitter:player:height", "480"],
      ["name", "twitter:title", `${name} — 3D Spatial Reasoning Puzzle`],
      ["name", "twitter:image", "https://nodoku.solokh.com/og-image.png?v=3d-safe-v2"],
    ]) {
      assert.ok(content.includes(`<meta ${attribute}="${property}" content="${value}"`), `missing ${property}`);
    }
    assert.ok(content.includes(`<link rel="canonical" href="${url}"`));
  });
}

test("Open Graph image uses the captured Three.js board and has large social-card dimensions", async () => {
  const generator = await readFile(new URL("../scripts/generate-og-image.mjs", import.meta.url), "utf8");
  assert.match(generator, /og-scene\.png/);
  assert.match(generator, /actual Three\.js home board/);
  assert.doesNotMatch(generator, /Complete one network\.|A TACTILE 3D PUZZLE/);
  assert.match(generator, /M8 9h18v17H8Z/);
  assert.match(generator, /g fill="#a9cbbd"/);
  assert.match(generator, /fill="#fcfaf5" stroke="#d7d2df"/);
  assert.doesNotMatch(generator, /M0 0H34V34H0Z/);
  const image = await sharp(new URL("../static/og-image.png", import.meta.url).pathname).metadata();
  assert.equal(image.format, "png");
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  const capture = await sharp(new URL("../static/og-scene.png", import.meta.url).pathname).metadata();
  assert.equal(capture.hasAlpha, true, "the Three.js board capture has no opaque canvas background");
});
