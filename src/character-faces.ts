import * as THREE from "three";

type FaceMaterial = THREE.MeshPhysicalMaterial;

/** Shared, sculpted details. Instances clone only materials so each face can reveal independently. */
export function makeCharacterFaces(radius: number): THREE.Group[] {
  const scale = (value: number) => value * radius;
  const point = (x: number, y: number, z: number) => new THREE.Vector3(scale(x), scale(y), scale(z));
  const ballGeometry = new THREE.SphereGeometry(1, 24, 16);
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x19151e, roughness: .65, metalness: 0 });
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x19171d, roughness: .96, metalness: 0 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xfffdf6, roughness: .73, metalness: 0 });
  const frames = new THREE.MeshPhysicalMaterial({ color: 0x18151d, roughness: .42, metalness: .04 });
  const lenses = new THREE.MeshPhysicalMaterial({ color: 0x111016, roughness: .5, metalness: .02 });

  const ball = (group: THREE.Group, material: FaceMaterial, x: number, y: number, z: number,
    width: number, height: number, depth: number, rotation = 0) => {
    const mesh = new THREE.Mesh(ballGeometry, material);
    mesh.position.copy(point(x, y, z));
    mesh.scale.set(scale(width), scale(height), scale(depth));
    mesh.rotation.z = rotation;
    group.add(mesh);
    return mesh;
  };
  const tube = (group: THREE.Group, material: FaceMaterial, points: readonly [number, number, number][], thickness: number) => {
    const path = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => point(x, y, z)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 24, scale(thickness), 8, false), material);
    group.add(mesh);
  };

  const blue = new THREE.Group();
  ball(blue, velvet, -.10, .67, .57, 1.01, .26, .37, .12);
  ball(blue, velvet, -.31, .91, .56, .13, .13, .14);
  for (const x of [-.28, .28]) ball(blue, ink, x, -.08, .99, .068, .13, .073);

  const green = new THREE.Group();
  for (const x of [-.40, .40]) {
    ball(green, white, x, .52, .81, .26, .27, .24);
    ball(green, ink, x + (x < 0 ? .025 : -.025), .50, 1.035, .145, .16, .105);
  }

  const yellow = new THREE.Group();
  const ringGeometry = new THREE.TorusGeometry(scale(.35), scale(.048), 12, 56);
  for (const x of [-.39, .39]) {
    const ring = new THREE.Mesh(ringGeometry, frames);
    ring.position.copy(point(x, -.05, 1.16));
    yellow.add(ring);
    // Both eyes use one separate, raised smile. No shared canvas path crosses a lens.
    const lid: [number, number, number][] = [];
    for (let step = 0; step <= 12; step++) {
      const angle = Math.PI + step * Math.PI / 12;
      lid.push([x + Math.cos(angle) * .105, -.12 + Math.sin(angle) * .08, 1.215]);
    }
    tube(yellow, ink, lid, .027);
  }
  tube(yellow, frames, [[-.075, -.035, 1.17], [0, -.025, 1.19], [.075, -.035, 1.17]], .042);
  for (const side of [-1, 1])
    tube(yellow, frames, [[side * .74, -.06, 1.15], [side * .91, -.07, 1.06], [side * 1.03, -.045, .91]], .045);

  const pink = new THREE.Group();
  for (const side of [-1, 1]) {
    ball(pink, lenses, side * .41, -.055, 1.00, .32, .29, .15);
    tube(pink, frames, [[side * .72, -.035, 1.08], [side * .93, -.025, .99], [side * 1.03, -.02, .88]], .035);
  }
  tube(pink, frames, [[-.095, -.03, 1.12], [0, .005, 1.16], [.095, -.03, 1.12]], .035);

  return [blue, green, yellow, pink];
}

export function cloneCharacterFace(template: THREE.Group): THREE.Group {
  const face = template.clone(true);
  const materials = new Map<FaceMaterial, FaceMaterial>();
  face.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.material as FaceMaterial;
    let material = materials.get(source);
    if (!material) {
      material = source.clone();
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = 0;
      materials.set(source, material);
    }
    object.material = material;
  });
  face.userData.materials = [...materials.values()];
  return face;
}

export function setCharacterFaceOpacity(face: THREE.Group, opacity: number): void {
  for (const material of face.userData.materials as FaceMaterial[]) material.opacity = opacity;
}

export function disposeCharacterFace(face: THREE.Group): void {
  for (const material of face.userData.materials as FaceMaterial[]) material.dispose();
}

export function disposeCharacterFaceTemplates(templates: readonly THREE.Group[]): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<FaceMaterial>();
  for (const template of templates) template.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    materials.add(object.material as FaceMaterial);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
