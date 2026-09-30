import * as THREE from "three";
import { GROK_COLORS } from "./groks-theme";

/** Keep a Bot's identity stable at lattice points shared across board sizes. */
export function grokForLattice(key: string): number {
  let hash = 2166136261;
  for (const letter of key) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) % GROK_COLORS.length;
}

function polygonRadius(angle: number, sides: number, pointAt: number): number {
  const segment = Math.PI * 2 / sides;
  const normal = pointAt - segment / 2;
  const offset = ((angle - normal + segment / 2) % segment + segment) % segment - segment / 2;
  return Math.cos(Math.PI / sides) / Math.cos(offset);
}

function roundedPolygon(angle: number, sides: number, pointAt: number, softness: number): number {
  return ([1, 4, 6, 4, 1] as const).reduce((sum, weight, index) =>
    sum + weight * polygonRadius(angle + (index - 2) * softness, sides, pointAt), 0) / 16;
}

function squircleRadius(angle: number, power: number): number {
  return (Math.abs(Math.cos(angle)) ** power + Math.abs(Math.sin(angle)) ** power) ** (-1 / power);
}

function bump(angle: number, center: number, width: number): number {
  const distance = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
  return Math.exp(-((distance / width) ** 2));
}

/** Eight stable Bot silhouettes: hexagon, circle, pebble, square, capsule, triangle, cloud, drop. */
export function makeGrokGeometries(radius: number): THREE.SphereGeometry[] {
  return GROK_COLORS.map((_, variant) => {
    const geometry = new THREE.SphereGeometry(radius, 96, 64);
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      let x = positions.getX(index);
      let y = positions.getY(index);
      const z = positions.getZ(index);
      const angle = Math.atan2(y, x);
      let radial = 1;
      if (variant === 0) radial = .12 + .88 * roundedPolygon(angle, 6, Math.PI / 2, .075);
      if (variant === 2) radial = 1 + .075 * Math.sin(3 * angle + .5) + .035 * Math.cos(5 * angle);
      if (variant === 3) radial = .88 * squircleRadius(angle, 4.4);
      if (variant === 4) radial = .82 * squircleRadius(angle, 4);
      if (variant === 5) radial = .2 + .8 * roundedPolygon(angle, 3, Math.PI / 2, .15);
      if (variant === 6) radial = .93 + .16 * (
        bump(angle, .55, .32) + bump(angle, Math.PI / 2, .34) + bump(angle, 2.6, .32));
      x *= radial;
      y *= radial;
      if (variant === 4) { x *= .79; y *= 1.13; }
      if (variant === 7) { x *= 1 - .42 * Math.max(0, Math.sin(angle)); y *= 1.08; }
      positions.setXYZ(index, x, y, z * .95);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  });
}
