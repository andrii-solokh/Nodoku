import * as THREE from "three";

/** Four reusable endpoint-color combinations for the same unit cylinder. */
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

  configure(incomplete: THREE.Color, complete: THREE.Color): void {
    for (let state = 0; state < this.geometries.length; state++) {
      const geometry = this.geometries[state];
      const positions = geometry.getAttribute("position");
      const colors = geometry.getAttribute("color");
      const start = state & 2 ? complete : incomplete;
      const end = state & 1 ? complete : incomplete;
      for (let index = 0; index < positions.count; index++) {
        const t = THREE.MathUtils.clamp(positions.getY(index) + .5, 0, 1);
        // THREE.Color components are already in the renderer's linear space.
        colors.setXYZ(index,
          start.r + (end.r - start.r) * t,
          start.g + (end.g - start.g) * t,
          start.b + (end.b - start.b) * t,
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
