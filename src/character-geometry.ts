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
        // Blue: a soft, asymmetric three-lobed blob.
        const wave = 1 + rim * (.085 * Math.sin(3 * angle + .4) + .035 * Math.cos(5 * angle));
        x *= wave * 1.04;
        y *= wave * .94;
      } else if (character === 1) {
        // Green: the two raised eyes make the frog silhouette legible in profile.
        const eyes = bump(angle, .78, .24) + bump(angle, 2.36, .24);
        const wave = 1 + rim * (.23 * eyes - .035 * bump(angle, Math.PI / 2, .25));
        x *= wave;
        y *= wave;
      } else if (character === 2) {
        // Yellow: broad base and a gently narrowed, taller crown.
        x *= 1 - rim * (.06 + .23 * Math.max(0, y / radius));
        y *= 1 + rim * .095;
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
