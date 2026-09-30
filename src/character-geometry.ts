import * as THREE from "three";

export const CHARACTER_COLORS = ["#0879e8", "#77c62c", "#eebc1f", "#df2ea9"] as const;

/** Keep the same character at lattice points shared by different grid sizes. */
export function characterForLattice(key: string): number {
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  // Mix the high bits back in: coordinate strings have correlated low bits.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) % CHARACTER_COLORS.length;
}

const bump = (angle: number, center: number, width: number): number => {
  const distance = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
  return Math.exp(-((distance / width) ** 2));
};

const roundedUnion = (angle: number, lobes: readonly [number, number, number][]): number => {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let edge = 0;
  for (const [x, y, radius] of lobes) {
    const along = x * dx + y * dy;
    const inside = along * along + radius * radius - x * x - y * y;
    if (inside <= 0) continue;
    const reach = along + Math.sqrt(inside);
    const overlap = Math.max(0, .09 - Math.abs(edge - reach)) / .09;
    edge = Math.max(edge, reach) + overlap * overlap * .09 * .25;
  }
  return edge;
};

const roundedTriangle = (angle: number): number => {
  const corner = Math.PI * 2 / 3;
  const radius = (offset: number) => {
    const wrapped = ((angle + offset - Math.PI / 6 + corner / 2) % corner + corner) % corner - corner / 2;
    return Math.cos(Math.PI / 3) / Math.cos(wrapped);
  };
  const weights = [1, 2, 3, 4, 5, 4, 3, 2, 1];
  return weights.reduce((sum, weight, index) => sum + weight * radius((index - 4) * .055), 0) / 25;
};

/** Sculpt the sphere's rim while leaving its front dome clear for puzzle dots. */
export function makeCharacterGeometries(radius: number): THREE.SphereGeometry[] {
  return CHARACTER_COLORS.map((_, character) => {
    const geometry = new THREE.SphereGeometry(radius, 64, 40);
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      let x = positions.getX(index);
      let y = positions.getY(index);
      const z = positions.getZ(index);
      const angle = Math.atan2(y, x);
      const rim = Math.pow(Math.max(0, 1 - Math.abs(z) / radius), .7);
      if (character === 0) {
        // Blue: four overlapping plush puffs, with three scallops along the right edge.
        const cloud = roundedUnion(angle, [
          [-.16, -.02, .84], [.47, .49, .46], [.52, -.04, .48],
          [.43, -.56, .47], [-.36, -.47, .51],
        ]);
        x *= cloud;
        y *= cloud;
      } else if (character === 1) {
        // Green: a round body with two distinct rounded eye stalks above it.
        const frog = roundedUnion(angle, [
          [0, -.12, .86], [-.31, -.32, .63], [.31, -.32, .63],
          [-.43, .64, .31], [.43, .64, .31],
        ]);
        x *= 1 + rim * (frog - 1);
        y *= 1 + rim * (frog - 1);
      } else if (character === 2) {
        // Yellow: a softened triangle with a high crown and a broad, stable base.
        const triangle = roundedTriangle(angle);
        x *= triangle * 1.17;
        y *= triangle * 1.17;
      } else {
        // Pink: two upper lobes, a small cleft, and a tapered lower point.
        const lobes = bump(angle, .67, .43) + bump(angle, 2.47, .43);
        const cleft = bump(angle, Math.PI / 2, .19);
        x *= 1 + rim * (.14 * lobes - .3 * Math.max(0, -y / radius));
        y *= 1 + rim * (.11 * lobes - .16 * cleft);
      }
      positions.setXYZ(index, x, y, z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  });
}
