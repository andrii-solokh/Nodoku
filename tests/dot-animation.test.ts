import assert from "node:assert/strict";
import test from "node:test";
import { DotAnimation, dotLayout, type DotAnimationStyle } from "../src/dot-animation.ts";

const styles: DotAnimationStyle[] = ["glide", "spring", "orbit", "fade"];
const options = (style: DotAnimationStyle = "glide", durationMs = 460) => ({ style, durationMs });
const positions = (dots: readonly { x: number; y: number }[]) => dots.map(({ x, y }) => [x, y]).sort();

test("new puzzles initialize every count directly in the canonical pip layout", () => {
  for (let count = 0; count <= 6; count++) {
    const animation = new DotAnimation(count);
    assert.equal(animation.active, false);
    assert.equal(animation.dots.length, count);
    assert.deepEqual(positions(animation.dots), positions(dotLayout(count)));
    assert.ok(animation.dots.every(dot => dot.scale === 1 && dot.opacity === 1));
  }
});

test("connecting animates departing dots and reflows survivors before settling exactly", () => {
  const animation = new DotAnimation(4);
  const before = structuredClone(animation.dots);
  animation.retarget(3, options());
  assert.deepEqual(animation.dots, before, "retargeting must not replace the visible layout");
  assert.equal(animation.snapshot().count, 3, "the logical count changes immediately");
  animation.advance(230);
  const middle = animation.snapshot();
  assert.equal(middle.dots.length, 4);
  assert.ok(middle.dots.some(dot => dot.exiting && dot.scale > 0 && dot.scale < 1 && dot.opacity < 1));
  assert.ok(middle.dots.some(dot => !dot.exiting && (dot.x !== before[dot.id].x || dot.y !== before[dot.id].y)));
  animation.advance(230);
  assert.equal(animation.active, false);
  assert.equal(animation.dots.length, 3);
  assert.deepEqual(positions(animation.dots), positions(dotLayout(3)));
  assert.ok(animation.dots.every(dot => dot.scale === 1 && dot.opacity === 1));
});

test("clearing and filling all connections animate dot entrance and complete disappearance", () => {
  for (const style of styles) {
    const animation = new DotAnimation(0);
    animation.retarget(6, options(style));
    assert.equal(animation.dots.length, 6);
    assert.ok(animation.dots.every(dot => dot.opacity === 0));
    animation.advance(230);
    assert.ok(animation.dots.every(dot => dot.opacity > 0 && dot.opacity < 1));
    animation.advance(230);
    assert.deepEqual(positions(animation.dots), positions(dotLayout(6)));
    animation.retarget(0, options(style));
    assert.equal(animation.dots.length, 6);
    animation.advance(230);
    assert.ok(animation.dots.every(dot => dot.opacity > 0 && dot.opacity < 1));
    animation.advance(230);
    assert.equal(animation.dots.length, 0);
    assert.equal(animation.active, false);
  }
});

test("rapid reversal preserves each live dot and never accumulates more than six meshes", () => {
  for (const style of styles) {
    const animation = new DotAnimation(6);
    for (const count of [3, 5, 0, 6, 1, 4, 2, 6]) {
      const before = structuredClone(animation.dots);
      animation.retarget(count, options(style));
      assert.ok(animation.dots.length <= 6);
      for (const dot of before) {
        assert.deepEqual(animation.dots.find(current => current.id === dot.id), dot,
          `${style}: a rapid count change starts at the current visible state`);
      }
      animation.advance(83);
      assert.ok(animation.dots.every(dot => Number.isFinite(dot.x) && Number.isFinite(dot.y)
        && dot.scale >= 0 && dot.opacity >= 0 && dot.opacity <= 1));
    }
    animation.advance(460);
    assert.equal(animation.dots.length, 6);
    assert.deepEqual(positions(animation.dots), positions(dotLayout(6)));
  }
});

test("style choices produce distinct motion while retaining identical end layouts", () => {
  const middles = new Set<string>();
  for (const style of styles) {
    const animation = new DotAnimation(1);
    animation.retarget(2, options(style));
    animation.advance(230);
    middles.add(JSON.stringify(animation.dots));
    animation.advance(230);
    assert.deepEqual(positions(animation.dots), positions(dotLayout(2)));
  }
  assert.equal(middles.size, styles.length);
});

test("same-count refresh and unrelated configuration do not restart animations", () => {
  const animation = new DotAnimation(4);
  animation.retarget(3, options("orbit"));
  animation.advance(200);
  const before = animation.snapshot();
  animation.retarget(3, options("fade", 1500));
  assert.deepEqual(animation.snapshot(), before);
  animation.advance(260);
  assert.equal(animation.active, false);
});

test("zero duration, reduced-motion policy, and explicit finish settle without an entrance", () => {
  for (const immediate of [{ ...options(), animate: false }, options("spring", 0)]) {
    const animation = new DotAnimation(6);
    animation.retarget(1, immediate);
    assert.equal(animation.active, false);
    assert.deepEqual(positions(animation.dots), positions(dotLayout(1)));
  }
  const animation = new DotAnimation(6);
  animation.retarget(2, options());
  animation.advance(100);
  animation.retarget(2, options("glide", 0));
  assert.equal(animation.active, false);
  assert.equal(animation.dots.length, 2);
  animation.retarget(0, options());
  animation.finish();
  assert.equal(animation.dots.length, 0);
});
