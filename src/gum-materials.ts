import * as THREE from "three";
import { DOTS_THEME } from "./dots-theme";
import { GROKS_THEME } from "./groks-theme";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { GameConfig } from "./config";
import { gumLinkProfileAt } from "./gum-profile";

type Surface = "node" | "rod";

// Match gumLinkProfileAt: a smooth neck meets each sphere with the sphere's own
// tangent, then tucks inside it. Visible surface, shadow and picking agree.
const profile = `
uniform float gumStretch;
uniform float gumNodeRadius;
uniform vec2 gumEndpointRadii;
vec2 gumRadii() {
  return vec2(gumEndpointRadii.x < 0.0 ? gumNodeRadius : gumEndpointRadii.x,
              gumEndpointRadii.y < 0.0 ? gumNodeRadius : gumEndpointRadii.y);
}
vec2 gumProfile(float y) {
  float neck = max(length(modelMatrix[0].xyz), 0.000001);
  float span = max(length(modelMatrix[1].xyz), 0.000001);
  vec2 radii = gumRadii();
  float share = radii.x == radii.y ? 0.5 : clamp(radii.x / max(0.000001, radii.x + radii.y), 0.00001, 0.99999);
  float u = y + 0.5;
  bool startSide = u < share;
  float nodeRadius = startSide ? radii.x : radii.y;
  float halfSpan = span * (startSide ? share : 1.0 - share);
  if (gumStretch <= 0.0 || nodeRadius <= 0.0 || span <= 0.00001 || halfSpan * 2.0 <= 0.00001) return vec2(1.0, 0.0);
  float desiredJoin = min(nodeRadius * 0.98, max(nodeRadius * 0.58, neck * 1.2));
  float joinDistance = min(sqrt(nodeRadius * nodeRadius - desiredJoin * desiredJoin), halfSpan * 0.9);
  float joinRadius = sqrt(nodeRadius * nodeRadius - joinDistance * joinDistance);
  float joinSlope = joinDistance / joinRadius;
  float slopeBudget = 2.0 * min(abs(joinRadius - neck), joinRadius);
  float width = max(0.000001, min(halfSpan - joinDistance,
    slopeBudget / max(joinSlope, 0.000001)) * (0.4 + 0.6 * gumStretch));
  float distance = startSide ? u * span : (1.0 - u) * span;
  float radius;
  float slope;
  if (distance < joinDistance) {
    float sphere = sqrt(max(0.000000000001, nodeRadius * nodeRadius - distance * distance));
    float inset = joinDistance - distance;
    radius = sphere - 0.35 * inset * inset / nodeRadius;
    slope = distance / sphere - 0.7 * inset / nodeRadius;
  } else {
    float t = clamp((joinDistance + width - distance) / width, 0.0, 1.0);
    float delta = joinRadius - neck;
    radius = neck + delta * t * t * (3.0 - 2.0 * t) + width * joinSlope * t * t * (t - 1.0);
    slope = 6.0 * delta * t * (1.0 - t) / width + joinSlope * (3.0 * t * t - 2.0 * t);
  }
  return vec2(radius / neck, (startSide ? -1.0 : 1.0) * slope * span / neck);
}
`;
const deform = `
#include <begin_vertex>
transformed.xz *= gumProfile(position.y).x;
`;

/** Shared shaders and one generated studio reflection map; no external assets. */
export class GumMaterials {
  private environment: THREE.WebGLRenderTarget;
  private stretch = { value: 0 };
  private nodeRadius = { value: .205 };
  private glow = { value: 0 };
  private installed = new WeakSet<THREE.Material>();
  private endpoints = new WeakMap<THREE.Material, { value: THREE.Vector2 }>();
  private endpointDepths = new Map<THREE.Material, THREE.MeshDepthMaterial>();
  private pickingBase = new THREE.CylinderGeometry(1, 1, 1, 16, 64);
  // These CPU-only geometries are never rendered/uploaded. Weak mesh ownership
  // releases old puzzle buffers, and repeated node rays share one update per rod.
  private picking = new WeakMap<THREE.Mesh, { geometry: THREE.CylinderGeometry; key: string }>();
  private config!: GameConfig["scene"];
  readonly depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });

  constructor(renderer: THREE.WebGLRenderer) {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.environment = pmrem.fromScene(room, .06);
    room.dispose();
    pmrem.dispose();
    this.applyDepth(this.depth, { value: new THREE.Vector2(-1, -1) });
  }

  private applyDepth(material: THREE.MeshDepthMaterial, endpoints: { value: THREE.Vector2 }): void {
    material.onBeforeCompile = shader => {
      shader.uniforms.gumStretch = this.stretch;
      shader.uniforms.gumNodeRadius = this.nodeRadius;
      shader.uniforms.gumEndpointRadii = endpoints;
      shader.vertexShader = profile + shader.vertexShader.replace("#include <begin_vertex>", deform);
    };
    material.customProgramCacheKey = () => "nodoku-gum-depth-v2";
  }

  private endpointUniform(material: THREE.Material): { value: THREE.Vector2 } {
    let uniform = this.endpoints.get(material);
    if (!uniform) {
      uniform = { value: new THREE.Vector2(-1, -1) };
      this.endpoints.set(material, uniform);
    }
    return uniform;
  }

  /** Explicit endpoint sizes require a dedicated material, as on the drag strand. */
  configureRod(mesh: THREE.Mesh, startRadius?: number, endRadius?: number): void {
    const material = mesh.material as THREE.Material;
    const endpoints = this.endpointUniform(material);
    endpoints.value.set(startRadius ?? -1, endRadius ?? -1);
    if (startRadius === undefined && endRadius === undefined) {
      mesh.customDepthMaterial = this.depth;
    } else {
      let depth = this.endpointDepths.get(material);
      if (!depth) {
        depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        this.applyDepth(depth, endpoints);
        this.endpointDepths.set(material, depth);
      }
      mesh.customDepthMaterial = depth;
    }
  }

  configure(config: GameConfig["scene"]): void {
    this.config = config;
    this.stretch.value = config.materialStyle === "gum" ? config.gooStretch : 0;
    // Grok Bots are sculpted shapes, so their links enter as narrow rods rather
    // than growing the round node profile used by the original and Dots boards.
    this.nodeRadius.value = GROKS_THEME ? 0 : .205 * config.nodeScale * (DOTS_THEME ? .8 : 1);
    this.glow.value = config.materialStyle === "gum" ? 1 : 0;
  }

  raycast(mesh: THREE.Mesh, ray: THREE.Raycaster, hits: THREE.Intersection[]): void {
    const endpoints = this.endpointUniform(mesh.material as THREE.Material).value;
    const start = endpoints.x < 0 ? this.nodeRadius.value : endpoints.x;
    const end = endpoints.y < 0 ? this.nodeRadius.value : endpoints.y;
    const neck = Math.max(.000001, mesh.scale.x), length = Math.max(.000001, mesh.scale.y);
    const key = `${this.stretch.value}:${neck}:${length}:${start}:${end}`;
    let cached = this.picking.get(mesh);
    if (!cached) {
      cached = { geometry: this.pickingBase.clone(), key: "" };
      this.picking.set(mesh, cached);
    }
    if (key !== cached.key) {
      cached.key = key;
      const positions = cached.geometry.getAttribute("position");
      const base = this.pickingBase.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        const radius = gumLinkProfileAt(y, length, neck, start, end, this.stretch.value)[0] / neck;
        positions.setX(i, base.getX(i) * radius);
        positions.setZ(i, base.getZ(i) * radius);
      }
      cached.geometry.computeBoundingBox();
      cached.geometry.computeBoundingSphere();
    }
    const geometry = mesh.geometry;
    // Match current thickness/length, growth and the dangling strand's tip.
    try {
      mesh.geometry = cached.geometry;
      THREE.Mesh.prototype.raycast.call(mesh, ray, hits);
    } finally { mesh.geometry = geometry; }
  }

  apply(material: THREE.MeshPhysicalMaterial, surface: Surface): void {
    // Material.clone() copies userData, but not onBeforeCompile. Keep the
    // original classic finish through temporary 3D/Flat transition materials.
    const base = material.userData.classicFinish ??= {
      roughness: material.roughness, clearcoat: material.clearcoat,
      clearcoatRoughness: material.clearcoatRoughness, ior: material.ior,
    };
    if (!this.installed.has(material)) {
      this.installed.add(material);
      material.onBeforeCompile = shader => {
        shader.uniforms.gumGlow = this.glow;
        shader.fragmentShader = "uniform float gumGlow;\n" + shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          // A small wrapped-light contribution gives the opaque gum a soft
          // body. Keep clues crisp and avoid transparent-layer sorting.
          `float gumRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);
           outgoingLight += gumGlow * diffuseColor.rgb * (0.015 + 0.055 * gumRim);
           #include <opaque_fragment>`,
        );
        if (surface === "rod") {
          shader.uniforms.gumStretch = this.stretch;
          shader.uniforms.gumNodeRadius = this.nodeRadius;
          shader.uniforms.gumEndpointRadii = this.endpointUniform(material);
          shader.vertexShader = profile + shader.vertexShader
            .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
              if (abs(normal.y) < 0.5) objectNormal = normalize(vec3(normal.x, -gumProfile(position.y).y, normal.z));`)
            .replace("#include <begin_vertex>", deform);
        }
      };
      material.customProgramCacheKey = () => `nodoku-gum-${surface}-v3`;
      material.needsUpdate = true;
    }
    const gum = this.config.materialStyle === "gum";
    const env = gum ? this.environment.texture : null;
    if (material.envMap !== env) { material.envMap = env; material.needsUpdate = true; }
    material.roughness = gum ? THREE.MathUtils.lerp(.46, .16, this.config.gooGloss) : base.roughness;
    material.clearcoat = gum ? this.config.gooGloss : base.clearcoat;
    material.clearcoatRoughness = gum ? .13 : base.clearcoatRoughness;
    material.ior = gum ? 1.42 : base.ior;
    material.envMapIntensity = gum ? .28 : 1;
  }

  dispose(): void {
    this.depth.dispose();
    for (const depth of this.endpointDepths.values()) depth.dispose();
    this.endpointDepths.clear();
    this.pickingBase.dispose();
    this.picking = new WeakMap();
    this.environment.dispose();
  }
}
