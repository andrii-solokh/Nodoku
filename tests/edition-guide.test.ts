import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EDITION_GUIDE_MARKER, editionGuide, prerenderEditionGuide } from "../src/edition-guide";
import type { Edition } from "../src/edition-navigation";

const words = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
const editions: [Edition, string, string][] = [
  ["nodoku", "Nodoku", "/"], ["dots", "Dots", "/dots/"], ["groks", "Groks", "/groks/"],
];

for (const [edition, name, href] of editions) {
  test(`${name} has a substantial, edition-specific guide that links to the other editions`, () => {
    const guide = editionGuide(edition);
    assert.match(guide, new RegExp(`<h2 id="edition-guide-title">How to play ${name}</h2>`));
    const count = words(guide);
    assert.ok(count >= 200 && count <= 400, `${name} guide has ${count} words`);
    assert.doesNotMatch(guide, /—/, "no em dashes in copy");
    assert.doesNotMatch(guide, /\shidden\b|display:\s*none/);
    for (const [, , other] of editions)
      assert.equal(guide.includes(`href="${other}"`), other !== href, `${name} link to ${other}`);
    assert.equal(prerenderEditionGuide(EDITION_GUIDE_MARKER, edition), guide);
  });
}

test("editions describe their own clue markers instead of sharing one block", () => {
  assert.match(editionGuide("dots"), /furry characters/);
  assert.match(editionGuide("groks"), /hexagonal sockets/);
  assert.notEqual(editionGuide("dots").replace(/Dots/g, ""), editionGuide("groks").replace(/Groks/g, ""));
});

test("every entry page places the guide after the game root", async () => {
  for (const path of ["index.html", "dots/index.html", "groks/index.html"]) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /<\/main>\s*<\/div>\s*<!-- edition-guide -->/);
  }
});
