import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readRootFile = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage metadata describes Nodoku as a 3D spatial reasoning puzzle", async () => {
  const html = await readRootFile("index.html");

  for (const value of [
    '<title>Nodoku — 3D Spatial Reasoning Puzzle</title>',
    '<meta name="robots" content="index,follow" />',
    '<link rel="canonical" href="https://nodoku.solokh.com/" />',
    '<meta property="og:title" content="Nodoku — 3D Spatial Reasoning Puzzle" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '"@type": "VideoGame"',
    '"@type": "FAQPage"',
    '<h1>3D Spatial Reasoning Puzzle</h1>',
  ]) assert.ok(html.includes(value), `missing ${value}`);
});

test("homepage has visible crawlable rules and an FAQ, while the game owns the single H1", async () => {
  const [html, app, statistics] = await Promise.all([
    readRootFile("index.html"),
    readRootFile("src/main.ts"),
    readRootFile("src/statistics.ts"),
  ]);

  for (const [id, heading] of [
    ["how-to-play-title", "How to Play Nodoku"],
    ["three-d-title", "Why Nodoku Is 3D"],
    ["faq-title", "Frequently Asked Questions"],
  ]) assert.ok(html.includes(`<h2 id="${id}">${heading}</h2>`), `missing H2 for ${heading}`);
  assert.match(html, /Nodoku is a 3D connection puzzle\./);
  assert.doesNotMatch(html, /A Puzzle About Logic and Spatial Reasoning|Play Nodoku Online|Is Nodoku a number puzzle/);
  assert.equal((app.match(/<h1\b/g) || []).length, 1);
  assert.match(app, /<h1 id="home-title">3D Spatial Reasoning Puzzle<\/h1>/);
  assert.equal((statistics.match(/<h1\b/g) || []).length, 0);
});

test("robots and sitemap permit discovery of the canonical homepage", async () => {
  const [robots, sitemap] = await Promise.all([
    readRootFile("static/robots.txt"),
    readRootFile("static/sitemap.xml"),
  ]);

  assert.match(robots, /^User-agent: \*\nAllow: \/\n/m);
  assert.match(robots, /Sitemap: https:\/\/nodoku\.solokh\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/nodoku\.solokh\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/nodoku\.solokh\.com\/dots\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/nodoku\.solokh\.com\/groks\/<\/loc>/);
});

test("the geometric bot edition has its own canonical page and route", async () => {
  const [groks, redirects, vite] = await Promise.all([
    readRootFile("groks/index.html"), readRootFile("static/_redirects"),
    readRootFile("vite.config.mts"),
  ]);
  assert.match(groks, /name="theme-color" content="#0e0f10"/);
  assert.match(groks, /rel="canonical" href="https:\/\/nodoku\.solokh\.com\/groks\/"/);
  assert.match(groks, /src\/groks-favicon\.svg/);
  assert.match(redirects, /^\/groks \/groks\/ 308/m);
  assert.match(vite, /groks: new URL\("\.\/groks\/index\.html"/);
});

test("the character edition has its own canonical page and the root keeps classic branding", async () => {
  const [home, dots, app, redirects] = await Promise.all([
    readRootFile("index.html"), readRootFile("dots/index.html"),
    readRootFile("src/main.ts"), readRootFile("static/_redirects"),
  ]);
  assert.match(home, /name="theme-color" content="#eeedf6"/);
  assert.match(dots, /name="theme-color" content="#07070b"/);
  assert.match(dots, /rel="canonical" href="https:\/\/nodoku\.solokh\.com\/dots\/"/);
  assert.match(dots, /src\/dots-favicon\.svg/);
  assert.match(app, /g fill="#a9cbbd"/);
  assert.match(redirects, /^\/dots \/dots\/ 308/m);
});


test("homepage ships a motion-safe branded loading screen", async () => {
  const [html, app] = await Promise.all([readRootFile("index.html"), readRootFile("src/main.ts")]);
  assert.match(html, /id="app-loader"/);
  assert.match(html, /Preparing your puzzle/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /loader-progress/);
  assert.match(html, /startup-error-details/);
  assert.match(app, /function finishLoading\(\)/);
  assert.match(app, /fill="#68b9ff"/);
  assert.match(app, /fill="#f78cda"/);
  assert.match(app, /g fill="#a9cbbd"/);
  assert.match(app, /loadingScreen\.classList\.add\("is-ready"\)/);
});
