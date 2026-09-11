import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ConnectionColors } from "../src/connection-colors.ts";

const states = [[false, false], [false, true], [true, false], [true, true]] as const;
const incomplete = new THREE.Color("#fcfaf5");
const complete = new THREE.Color("#a9cbbd");
const accent = new THREE.Color("#8170c9");
function equalColor(actual: number[], expected: THREE.Color) {
  for (const [index, channel] of [expected.r, expected.g, expected.b].entries())
    assert.ok(Math.abs(actual[index] - channel) < 1e-7, `channel ${index}: ${actual[index]} != ${channel}`);
}
function colorAt(geometry: THREE.CylinderGeometry, index: number): number[] {
  const color = geometry.getAttribute("color");
  return [color.getX(index), color.getY(index), color.getZ(index)];
}

test("every connection carries its node colors into an accent-colored center", () => {
  const base = new THREE.CylinderGeometry(1, 1, 1, 8, 4);
  const colors = new ConnectionColors(base);
  colors.configure(incomplete, complete, accent);
  for (const [startDone, endDone] of states) {
    const geometry = colors.geometry(startDone, endDone);
    const positions = geometry.getAttribute("position");
    for (const [y, expected] of [[-.5, startDone ? complete : incomplete], [0, accent], [.5, endDone ? complete : incomplete]] as const) {
      const indices = Array.from({ length: positions.count }, (_, index) => index).filter(index => positions.getY(index) === y);
      assert.ok(indices.length > 0);
      for (const index of indices) equalColor(colorAt(geometry, index), expected);
    }
  }
  colors.dispose(); base.dispose();
});

test("the two halves blend smoothly through the accent in linear color space", () => {
  const base = new THREE.CylinderGeometry(1, 1, 1, 8, 4);
  const colors = new ConnectionColors(base);
  colors.configure(incomplete, complete, accent);
  for (const [startDone, endDone] of [[false, true], [true, false]] as const) {
    const geometry = colors.geometry(startDone, endDone);
    const positions = geometry.getAttribute("position");
    for (const y of [-.5, -.25, 0, .25, .5]) {
      const indices = Array.from({ length: positions.count }, (_, index) => index).filter(index => positions.getY(index) === y);
      assert.ok(indices.length > 0);
      const start = startDone ? complete : incomplete;
      const end = endDone ? complete : incomplete;
      const expected = y <= 0
        ? start.clone().lerp(accent, 2 * y + 1)
        : accent.clone().lerp(end, 2 * y);
      for (const index of indices) equalColor(colorAt(geometry, index), expected);
    }
  }
  // Configuration does not modify caller-owned colors.
  assert.equal(incomplete.getHexString(), "fcfaf5");
  assert.equal(complete.getHexString(), "a9cbbd");
  colors.dispose(); base.dispose();
});

test("variants retain copied cylinder data and configuration updates reuse all four geometries", () => {
  const base = new THREE.CylinderGeometry(1, 1, 1, 8, 4);
  const colors = new ConnectionColors(base);
  const variants = states.map(state => colors.geometry(...state));
  assert.equal(new Set(variants).size, 4);
  const attributes = variants.map(geometry => geometry.getAttribute("color"));
  for (const geometry of variants) {
    for (const name of ["position", "normal", "uv"]) {
      const original = base.getAttribute(name), copy = geometry.getAttribute(name);
      assert.notEqual(copy.array, original.array);
      assert.deepEqual(copy.array, original.array);
    }
    assert.notEqual(geometry.index!.array, base.index!.array);
    assert.deepEqual(geometry.index!.array, base.index!.array);
    assert.deepEqual(geometry.groups, base.groups);
  }
  assert.equal(base.getAttribute("color"), undefined);
  colors.configure(incomplete, complete, accent);
  const versions = attributes.map(attribute => (attribute as THREE.BufferAttribute).version);
  const nextIncomplete = new THREE.Color("#123456"), nextComplete = new THREE.Color("#abcdef");
  colors.configure(nextIncomplete, nextComplete, accent);
  states.forEach((state, index) => {
    const geometry = colors.geometry(...state);
    assert.equal(geometry, variants[index]);
    assert.equal(geometry.getAttribute("color"), attributes[index]);
    assert.equal((attributes[index] as THREE.BufferAttribute).version, versions[index] + 1);
    assert.deepEqual(geometry.getAttribute("position").array, base.getAttribute("position").array);
  });
  equalColor(colorAt(colors.geometry(false, false), 0), nextIncomplete);
  equalColor(colorAt(colors.geometry(true, true), 0), nextComplete);
  let disposed = 0, baseDisposed = 0;
  for (const geometry of variants) geometry.addEventListener("dispose", () => { disposed++; });
  base.addEventListener("dispose", () => { baseDisposed++; });
  colors.dispose();
  assert.equal(disposed, 4);
  assert.equal(baseDisposed, 0, "The caller still owns the base cylinder");
  base.dispose();
});
