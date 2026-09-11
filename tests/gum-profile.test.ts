import assert from "node:assert/strict";
import test from "node:test";
import { gumLinkProfileAt, gumProfileAt } from "../src/gum-profile.ts";

test("gummy shoulders meet the node sphere continuously with the same tangent", () => {
  for (const [length, neck, radius, stretch] of [[1, .035, .2255, .95], [1.04, .047, .205, .65], [.7, .12, .13325, 1]]) {
    const joinRadius = Math.min(radius * .98, Math.max(radius * .58, neck * 1.2));
    const distance = Math.min(Math.sqrt(radius ** 2 - joinRadius ** 2), length * .45);
    const y = .5 - distance / length;
    const expectedRadius = Math.sqrt(radius ** 2 - distance ** 2);
    for (const direction of [-1, 1]) {
      const [actual, slope] = gumProfileAt(direction * y, length, neck, radius, stretch);
      assert.ok(Math.abs(actual - expectedRadius) < 1e-9);
      assert.ok(Math.abs(slope - direction * distance / expectedRadius) < 1e-9);
      const outside = gumProfileAt(direction * (y - 1e-7), length, neck, radius, stretch);
      const inside = gumProfileAt(direction * (y + 1e-7), length, neck, radius, stretch);
      assert.ok(Math.abs(outside[0] - inside[0]) < 1e-6, "no radius step at the sphere join");
      assert.ok(Math.abs(outside[1] - inside[1]) < 1e-4, "no lighting-normal step at the sphere join");
    }
    assert.ok(gumProfileAt(.5, length, neck, radius, stretch)[0] < radius, "the end cap is buried inside the node");
  }
});

test("normal slope agrees with the deformed surface along the exposed strand", () => {
  const length = 1, neck = .035, radius = .2255;
  for (let index = -49; index <= 49; index++) {
    const y = index / 100;
    const [r, slope] = gumProfileAt(y, length, neck, radius, .95);
    const epsilon = .000001;
    const left = gumProfileAt(y - epsilon, length, neck, radius, .95)[0];
    const right = gumProfileAt(y + epsilon, length, neck, radius, .95)[0];
    assert.ok(Math.abs(slope - (right - left) / (2 * epsilon * length)) < .00001);
    assert.ok(r >= neck - 1e-9, "the connecting neck never pinches inside out");
  }
});

test("short returning strands, tiny tips and extreme controls stay finite; Classic stays cylindrical", () => {
  for (const length of [.000001, .01, .1, 1, 2]) {
    for (const radius of [.055, .13325, .27675]) {
      for (const neck of [.001, .015, .12]) {
        for (let index = -32; index <= 32; index++) {
          const y = index / 64;
          const value = gumProfileAt(y, length, neck, radius, 1);
          assert.ok(value.every(Number.isFinite));
          assert.ok(value[0] > 0);
          assert.deepEqual(gumProfileAt(y, length, neck, radius, 0), [neck, 0]);
        }
      }
    }
  }
});

test("equal endpoints retain the original profile exactly", () => {
  for (const length of [.1, 1, 2]) for (const stretch of [0, .65, 1]) {
    for (let index = -64; index <= 64; index++) {
      const y = index / 128;
      assert.deepEqual(gumLinkProfileAt(y, length, .035, .2255, .2255, stretch),
        gumProfileAt(y, length, .035, .2255, stretch));
    }
  }
});

test("a short magnetic nub has a visible tangent shoulder on the large sphere", () => {
  const source = .2255, tip = source * .27, neck = .04;
  const length = source * 1.7 - tip * .6;
  const distance = Math.sqrt(source ** 2 - (source * .58) ** 2);
  const y = distance / length - .5;
  assert.ok(y > 0, "the large sphere's tangent lies beyond the old halfway split");
  const [radius, slope] = gumLinkProfileAt(y, length, neck, source, tip, .95);
  assert.ok(Math.abs(radius - source * .58) < 1e-9);
  assert.ok(Math.abs(slope + distance / radius) < 1e-9);
  const exposedY = source * 1.04 / length - .5;
  assert.ok(gumLinkProfileAt(exposedY, length, neck, source, tip, .95)[0] > neck * 1.3,
    "the bulging base continues outside the parent sphere instead of exposing a straight peg");
  for (let index = -49; index <= 49; index++) {
    const point = index / 100;
    const direct = gumLinkProfileAt(point, length, neck, source, tip, .95);
    const reversed = gumLinkProfileAt(-point, length, neck, tip, source, .95);
    assert.ok(Math.abs(direct[0] - reversed[0]) < 1e-9, "swapping endpoints mirrors the same surface");
    assert.ok(Math.abs(direct[1] + reversed[1]) < 1e-9);
    const epsilon = .000001;
    const before = gumLinkProfileAt(point - epsilon, length, neck, source, tip, .95)[0];
    const after = gumLinkProfileAt(point + epsilon, length, neck, source, tip, .95)[0];
    assert.ok(Math.abs(direct[1] - (after - before) / (2 * epsilon * length)) < .00002,
      "lighting normals use the actual span after asymmetric parameterization");
  }
});

test("asymmetric shoulder halves meet without a seam while a nub grows and recedes", () => {
  const source = .2255;
  for (const strength of [.001, .01, .1, .5, 1]) {
    const tip = source * .27 * strength;
    const neck = Math.min(.04, tip * .8);
    const length = source * (1 + .7 * strength) - tip * .6;
    const split = source / (source + tip) - .5;
    assert.ok(gumLinkProfileAt(.5, length, neck, source, tip, .95)[0] < tip,
      "even the first tiny emerging nub has its end cap inside the tip sphere");
    const left = gumLinkProfileAt(split - 1e-8, length, neck, source, tip, .95);
    const right = gumLinkProfileAt(split + 1e-8, length, neck, source, tip, .95);
    assert.ok(Math.abs(left[0] - right[0]) < 1e-7);
    assert.ok(Math.abs(left[1] - right[1]) < 1e-4);
    for (let index = -32; index <= 32; index++) {
      const value = gumLinkProfileAt(index / 64, length, neck, source, tip, .95);
      assert.ok(value.every(Number.isFinite) && value[0] > 0);
    }
  }
});

test("a wide strand tapers tangentially into a smaller droplet and buries its cap", () => {
  const source = .2255, tip = .0165, neck = .04025, length = .85;
  assert.ok(neck > tip, "the independent tip and thickness controls permit this case");
  const distance = Math.sqrt(tip ** 2 - (tip * .98) ** 2);
  const joinY = .5 - distance / length;
  const [radius, slope] = gumLinkProfileAt(joinY, length, neck, source, tip, .95);
  assert.ok(Math.abs(radius - tip * .98) < 1e-9);
  assert.ok(Math.abs(slope - distance / radius) < 1e-9);
  assert.ok(gumLinkProfileAt(.5, length, neck, source, tip, .95)[0] < tip,
    "the cylinder cap fits inside the smaller sphere");
  const split = source / (source + tip) - .5;
  for (let index = 1; index < 100; index++) {
    const y = split + (.5 - split) * index / 100;
    const [r, derivative] = gumLinkProfileAt(y, length, neck, source, tip, .95);
    assert.ok(r > 0 && r <= neck);
    const epsilon = 1e-7;
    const before = gumLinkProfileAt(y - epsilon, length, neck, source, tip, .95)[0];
    const after = gumLinkProfileAt(y + epsilon, length, neck, source, tip, .95)[0];
    assert.ok(Math.abs(derivative - (after - before) / (2 * epsilon * length)) < .00002);
  }
});

test("independent drag thickness and tiny-tip extremes stay positive and finite", () => {
  for (const length of [.05, .23, 1.15, 3]) {
    for (const source of [.205 * .65, .205 * 1.35]) {
      for (const tip of [.015 * .65 * Math.sqrt(.1), .015 * .65, .15 * 1.35]) {
        for (const neck of [.015 * .5 * .1, .035 * 1.15, .12 * 3]) {
          for (let index = -128; index <= 128; index++) {
            const y = index / 256;
            const value = gumLinkProfileAt(y, length, neck, source, tip, 1);
            assert.ok(value.every(Number.isFinite) && value[0] > 0);
            assert.deepEqual(gumLinkProfileAt(y, length, neck, source, tip, 0), [neck, 0]);
          }
          assert.ok(gumLinkProfileAt(-.5, length, neck, source, tip, 1)[0] < source);
          assert.ok(gumLinkProfileAt(.5, length, neck, source, tip, 1)[0] < tip);
        }
      }
    }
  }
});
