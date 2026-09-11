import * as THREE from "three";

/** Four reusable endpoint-color combinations with an accent-colored core. */
export class ConnectionColors {
  private readonly geometries: THREE.CylinderGeometry[];

  constructor(base: THREE.CylinderGeometry) {
    this.geometries = Array.from({ length: 4 }, () => {
      const geometry = base.clone();
      const colors = new Float32Array(geometry.getAttribute("position").count * 3);
      colors.fill(1);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
  }

  configure(incomplete: THREE.Color, complete: THREE.Color, accent: THREE.Color): void {
    for (let state = 0; state < this.geometries.length; state++) {
      const geometry = this.geometries[state];
      const positions = geometry.getAttribute("position");
      const colors = geometry.getAttribute("color");
      const start = state & 2 ? complete : incomplete;
      const end = state & 1 ? complete : incomplete;
      for (let index = 0; index < positions.count; index++) {
        const t = THREE.MathUtils.clamp(positions.getY(index) + .5, 0, 1);
        // THREE.Color components are already in the renderer's linear space.
        const from = t <= .5 ? start : accent;
        const to = t <= .5 ? accent : end;
        const blend = t <= .5 ? t * 2 : (t - .5) * 2;
        colors.setXYZ(index,
          from.r + (to.r - from.r) * blend,
          from.g + (to.g - from.g) * blend,
          from.b + (to.b - from.b) * blend,
        );
      }
      colors.needsUpdate = true;
    }
  }

  geometry(startComplete: boolean, endComplete: boolean): THREE.CylinderGeometry {
    return this.geometries[(startComplete ? 2 : 0) | (endComplete ? 1 : 0)];
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
  }
}
