import * as THREE from "three";

/** Four reusable endpoint-color combinations with an accent-colored core. */
export class ConnectionColors {
  private readonly geometries: THREE.CylinderGeometry[];
  private readonly characterGeometries = new Map<string, THREE.CylinderGeometry>();
  private accent = new THREE.Color();

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
    this.accent.copy(accent);
    for (const geometry of this.characterGeometries.values()) geometry.dispose();
    this.characterGeometries.clear();
    for (let state = 0; state < this.geometries.length; state++) {
      const geometry = this.geometries[state];
      const start = state & 2 ? complete : incomplete;
      const end = state & 1 ? complete : incomplete;
      this.paint(geometry, start, end, accent);
    }
  }

  private paint(geometry: THREE.CylinderGeometry, start: THREE.Color, end: THREE.Color, accent: THREE.Color, hold = 0): void {
    const positions = geometry.getAttribute("position");
    const colors = geometry.getAttribute("color");
    for (let index = 0; index < positions.count; index++) {
      const t = THREE.MathUtils.clamp(positions.getY(index) + .5, 0, 1);
      // THREE.Color components are already in the renderer's linear space.
      const from = t <= .5 ? start : accent;
      const to = t <= .5 ? accent : end;
      const linear = t <= .5
        ? THREE.MathUtils.clamp((t - hold) / (.5 - hold), 0, 1)
        : THREE.MathUtils.clamp((t - .5) / (.5 - hold), 0, 1);
      const blend = linear * linear * (3 - 2 * linear);
      colors.setXYZ(index,
        from.r + (to.r - from.r) * blend,
        from.g + (to.g - from.g) * blend,
        from.b + (to.b - from.b) * blend,
      );
    }
    colors.needsUpdate = true;
  }

  geometry(startComplete: boolean, endComplete: boolean): THREE.CylinderGeometry {
    return this.geometries[(startComplete ? 2 : 0) | (endComplete ? 1 : 0)];
  }

  /** Share gradients for every pair of character colors on the board. */
  geometryBetween(start: THREE.Color, end: THREE.Color): THREE.CylinderGeometry {
    const key = `${start.getHexString()}:${end.getHexString()}`;
    let geometry = this.characterGeometries.get(key);
    if (!geometry) {
      geometry = this.geometries[0].clone();
      // The visible neck leaves a character about a quarter of the way along
      // a grid edge. Keep its own color through that join.
      this.paint(geometry, start, end, this.accent, .23);
      this.characterGeometries.set(key, geometry);
    }
    return geometry;
  }

  dispose(): void {
    for (const geometry of this.characterGeometries.values()) geometry.dispose();
    this.characterGeometries.clear();
    for (const geometry of this.geometries) geometry.dispose();
  }
}
