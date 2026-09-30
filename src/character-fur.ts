import * as THREE from "three";

function randomSource(seed: number): () => number {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

/** One reusable woven surface for every character body. */
export function makeFurTextures(): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 512;
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = bumpCanvas.width = bumpCanvas.height = size;
  const color = colorCanvas.getContext("2d")!;
  const bump = bumpCanvas.getContext("2d")!;
  color.fillStyle = "#f4f4f4";
  bump.fillStyle = "#888888";
  color.fillRect(0, 0, size, size);
  bump.fillRect(0, 0, size, size);
  const random = randomSource(0x4e4f444f);
  for (let index = 0; index < 28000; index++) {
    const x = random() * size;
    const y = random() * size;
    const length = 2 + random() * 8;
    const tilt = (random() - .5) * 4;
    const light = random() > .5;
    color.strokeStyle = light ? "rgba(255,255,255,.33)" : "rgba(94,94,94,.12)";
    bump.strokeStyle = light ? "rgba(255,255,255,.58)" : "rgba(0,0,0,.42)";
    color.lineWidth = bump.lineWidth = .5 + random() * 1.2;
    for (const context of [color, bump]) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + tilt, y + length);
      context.stroke();
    }
  }
  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  for (const texture of [colorTexture, bumpTexture]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  return { color: colorTexture, bump: bumpTexture };
}

/** Fine shared strands break up the smooth silhouette without changing picking. */
export function makeFurFringes(bodies: readonly THREE.SphereGeometry[]): THREE.BufferGeometry[] {
  return bodies.map((body, character) => {
    const random = randomSource(0x46555200 + character);
    const bodyPositions = body.getAttribute("position");
    const normals = body.getAttribute("normal");
    const vertices: number[] = [];
    for (let index = 0; index < 900; index++) {
      const vertex = Math.floor(random() * bodyPositions.count);
      const x = bodyPositions.getX(vertex), y = bodyPositions.getY(vertex), z = bodyPositions.getZ(vertex);
      const nx = normals.getX(vertex), ny = normals.getY(vertex), nz = normals.getZ(vertex);
      const length = .004 + random() * .008;
      const lean = (random() - .5) * .006;
      vertices.push(x - nx * .001, y - ny * .001, z - nz * .001);
      vertices.push(x + nx * length + lean, y + ny * length, z + nz * length - lean);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingSphere();
    return geometry;
  });
}
