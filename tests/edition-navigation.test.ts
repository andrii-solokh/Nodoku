import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { editionNavigation, EDITION_NAVIGATION_MARKER, prerenderEditionNavigation } from "../src/edition-navigation";

for (const [path, edition] of [["/", "nodoku"], ["/dots/index.html", "dots"], ["/groks/index.html", "groks"]] as const) {
  test(`${edition} renders the same accessible links before and after JavaScript`, () => {
    const nav = editionNavigation(edition);
    assert.match(nav, /<a[^>]+href="\/groks\/"/);
    assert.match(nav, /<a[^>]+href="\/dots\/"/);
    assert.equal(prerenderEditionNavigation(EDITION_NAVIGATION_MARKER, path), nav);
    const current = [...nav.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)];
    assert.equal(current.length, edition === "nodoku" ? 0 : 1);
    if (current.length) assert.ok(current[0][0].includes(`href="/${edition}/"`));
  });
}

test("every entry exposes the navigation and readable fallback without JavaScript", async () => {
  for (const path of ["index.html", "dots/index.html", "groks/index.html"]) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.ok(html.includes(EDITION_NAVIGATION_MARKER));
    assert.match(html, /<noscript><style>#app-loader \{ display: none; \}<\/style><\/noscript>/);
  }
});
