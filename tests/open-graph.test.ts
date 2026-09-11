import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

test("home page publishes complete Open Graph and social-card metadata", async () => {
  const content = await readFile(new URL("../index.html", import.meta.url), "utf8");

  for (const [attribute, property, value] of [
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Nodoku"],
    ["property", "og:url", "https://nodoku.solokh.com/"],
    ["property", "og:title", "Nodoku — 3D Spatial Reasoning Puzzle"],
    ["property", "og:image", "https://nodoku.solokh.com/og-image.png"],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["name", "twitter:card", "summary_large_image"],
  ]) {
    assert.ok(content.includes(`<meta ${attribute}="${property}" content="${value}"`));
  }
  assert.match(content, /<link rel="canonical" href="https:\/\/nodoku\.solokh\.com\/"/);
});

test("Open Graph image uses the captured Three.js board and has large social-card dimensions", async () => {
  const generator = await readFile(new URL("../scripts/generate-og-image.mjs", import.meta.url), "utf8");
  assert.match(generator, /og-scene\.png/);
  assert.match(generator, /actual Three\.js home board/);
  const image = await sharp(new URL("../static/og-image.png", import.meta.url).pathname).metadata();
  assert.equal(image.format, "png");
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
});
