import * as THREE from "three";
import type { Puzzle } from "./puzzle";
import type { GameConfig } from "./config";
import { DotAnimation } from "./dot-animation";
import { GumMaterials } from "./gum-materials";
import { ConnectionColors } from "./connection-colors";
import {
  CUBE_ORIENTATIONS,
  nearestOrientation,
  quarterTurn,
  type TurnDirection,
} from "./orientation";

type GestureCallbacks = {
  onDoubleTap?: (id: number) => void;
  onTapSettled?: () => void;
  // Returning false hands this drag back to camera rotation instead of drawing.
  onStrokeStart?: (id: number) => boolean | void;
  onStrokeEdge?: (a: number, b: number) => boolean;
  onStrokeEnd?: () => void;
  onRotate?: () => void;
  onViewChange?: () => void;
};

type ScreenNode = { id: number; x: number; y: number; radius: number; visible: boolean; pickable: boolean };
type PickFace = { axis: "x" | "y" | "z"; coordinate: number };
type NodeTap = {
  id: number;
  x: number;
  y: number;
  time: number;
  rollback?: () => void;
};
type Motion = {
  from: THREE.Quaternion;
  target: THREE.Quaternion;
  elapsed: number;
  duration: number;
};
type SceneConfig = GameConfig["scene"];
type Rod = { edge: [number, number]; mesh: THREE.Mesh; start: THREE.Vector3; end: THREE.Vector3; startNode: number; endNode: number; length: number };
type Growth = { elapsed: number; duration: number; easing: SceneConfig["connectionEasing"] };
type LinkEndpoints = { start: THREE.Vector3; end: THREE.Vector3; radius: number; progress: number };
type DragStrand = {
  nodeId: number; end: THREE.Vector3; desired: THREE.Vector3; pointerEnd: THREE.Vector3;
  recoil: THREE.Vector3; elapsed: number | null; duration: number;
};
type DragMagnet = { nodeId: number; strength: number; target: number };
type PipMeshes = Map<number, THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>;
type ShapeNode = {
  key: string; mesh: THREE.Mesh; group: THREE.Group; dots: DotAnimation; pips: PipMeshes;
  lattice: THREE.Vector3;
  material: THREE.MeshStandardMaterial; finalMaterial: THREE.Material;
  from: THREE.Vector3; to: THREE.Vector3; fromColor: THREE.Color; toColor: THREE.Color;
  fromScale: number; toScale: number; fromOpacity: number; toOpacity: number; nodeId: number | null;
};
type ShapeDecoration = { object: THREE.Mesh | THREE.LineSegments; material: THREE.Material; opacity: number; entering: boolean; fromOpacity?: number };
type MusicNoteParticle = {
  sprite: THREE.Sprite; material: THREE.SpriteMaterial; start: THREE.Vector3; target: THREE.Vector3;
  targetLocal: THREE.Vector3; elapsed: number; duration: number; slot: number;
};

type ShapeTransition = {
  fromSize: number; toSize: number; fromDepth: number; toDepth: number; elapsed: number; duration: number;
  nodes: Map<string, ShapeNode>; decorations: ShapeDecoration[];
  fromOrientation: THREE.Quaternion; toOrientation: THREE.Quaternion;
  fromDistance: number; toDistance: number;
  fromFog: [number, number]; toFog: [number, number]; fromFloor: number; toFloor: number;
};

const COLORS = {
  background: 0xeeedf6,
  porcelain: 0xfcfaf5,
  lilac: 0x8170c9,
  sage: 0xa9cbbd,
  ink: 0x302b48,
};
const RADIUS = 0.205;
const PREVIEW_TILT = { pitch: -.12, yaw: .18 };

/** The scene owns rendering and gestures; all game rules live in Puzzle. */
export class BoardScene {
  private renderer: THREE.WebGLRenderer;
  private gumMaterials: GumMaterials;
  private gumPulses = new Map<number, { elapsed: number; duration: number; strength?: number }>();
  private gumDegrees = new Map<number, number>();
  private scene = new THREE.Scene();
  private studio = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  private board = new THREE.Group();
  private rods = new THREE.Group();
  private rodMeshes = new Map<string, Rod>();
  private connectionGrowth = new Map<string, Growth>();
  private config: SceneConfig = {
    rotationMs: 320, connectionMs: 420, connectionEasing: "easeOut",
    dragMaxLength: 1.15, dragThickness: 1.15, dragMinThickness: .3, dragTipSize: .05,
    dragFollowMs: 90, dragMagnetRange: .45, dragMagnetStrength: .7, dragMagnetResponseMs: 120,
    dragReturnMs: 520, dragElasticity: .55,
    dotAnimation: "glide", dotAnimationMs: 460,
    shapeTransitionMs: 700, materialStyle: "gum", gooStretch: .65, gooGloss: .7,
    nodeFloatAmplitude: .025, nodeFloatPeriodMs: 6000,
    rodRadius: .047, nodeScale: 1, fogStrength: 1, shadowOpacity: .11,
    background: "#eeedf6", nodeColor: "#fcfaf5", connectionColor: "#8170c9", completedColor: "#a9cbbd",
  };
  private guides = new THREE.Group();
  private selectionPaths = new THREE.Group();
  private nodeMeshes = new Map<number, THREE.Mesh>();
  private pipGroups = new Map<number, THREE.Group>();
  private dotAnimations = new Map<number, DotAnimation>();
  private activeDotNodes = new Set<number>();
  private pipMeshes = new Map<number, PipMeshes>();
  private musicNotes = new THREE.Group();
  private musicScore = new THREE.Group();
  private musicScoreEnabled = false;
  private musicScoreLines = new THREE.LineSegments();
  private musicScoreLineMaterial = new THREE.LineBasicMaterial({ color: 0x302b48, transparent: true, opacity: .24, depthTest: false });
  private musicNoteMaterial = new THREE.MeshBasicMaterial({ color: 0x302b48, depthTest: false });
  private musicNoteLineMaterial = new THREE.LineBasicMaterial({ color: 0x302b48, depthTest: false });
  private musicNoteHead = new THREE.CircleGeometry(.072, 20);
  private musicNoteStem = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.052, 0, 0), new THREE.Vector3(.052, .36, 0)]);
  private noteDotTexture: THREE.CanvasTexture | null = null;
  private noteParticles: MusicNoteParticle[] = [];
  private scoreNotes = new Map<number, THREE.Group>();
  private scoreCursor = 0;
  private shapeTransition: ShapeTransition | null = null;
  private floatingPhase = 0;
  private floatingPhases = new Map<string, number>();
  private floatingOffset = new THREE.Vector3();
  private linkDirection = new THREE.Vector3();
  private linkUp = new THREE.Vector3(0, 1, 0);
  private pipNormal = new THREE.Vector3();
  private pipFacing = new THREE.Vector3(0, 0, 1);
  private positions = new Map<number, THREE.Vector3>();
  private sphere = new THREE.SphereGeometry(RADIUS, 32, 24);
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 16, 64);
  private connectionColors = new ConnectionColors(this.cylinder);
  private pip = new THREE.CircleGeometry(0.024, 16);
  private ring = new THREE.TorusGeometry(RADIUS * 1.28, 0.014, 8, 64);
  private white = new THREE.MeshPhysicalMaterial({
    color: COLORS.porcelain,
    roughness: 0.37,
    metalness: 0,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
  });
  private finished = new THREE.MeshPhysicalMaterial({
    color: COLORS.sage,
    roughness: 0.45,
    clearcoat: 0.12,
  });
  private highlightedNodeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe7b36c,
    roughness: 0.45,
    clearcoat: 0.12,
  });
  private inactive = new THREE.MeshStandardMaterial({
    color: 0xd9d7e4,
    roughness: 0.6,
  });
  private selected = new THREE.MeshPhysicalMaterial({
    color: 0xded5fb,
    roughness: 0.34,
    clearcoat: 0.2,
  });
  private neighborMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe7e0f7,
    roughness: 0.4,
  });
  private selectionPathMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.lilac,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  private rodMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.4,
    // Gum links overlap their endpoint spheres to create a continuous shape.
    // Keep that overlapping surface just behind the sphere to avoid visible
    // depth-fighting facets where the link leaves a node.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  private highlightedRodMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb77536,
    roughness: 0.4,
  });
  private dragRodMaterial = new THREE.MeshPhysicalMaterial({ color: COLORS.porcelain, roughness: .4 });
  private dragTipMaterial = new THREE.MeshPhysicalMaterial({ color: COLORS.porcelain, roughness: .37, clearcoat: .2 });
  private dragRod = new THREE.Mesh(this.cylinder, this.dragRodMaterial);
  private dragTip = new THREE.Mesh(this.sphere, this.dragTipMaterial);
  private dragStrand: DragStrand | null = null;
  private dragMagnet: DragMagnet | null = null;
  private magnetRodMaterial = new THREE.MeshPhysicalMaterial({ color: COLORS.porcelain, roughness: .4 });
  private magnetTipMaterial = new THREE.MeshPhysicalMaterial({ color: COLORS.porcelain, roughness: .37, clearcoat: .2 });
  private magnetRod = new THREE.Mesh(this.cylinder, this.magnetRodMaterial);
  private magnetTip = new THREE.Mesh(this.sphere, this.magnetTipMaterial);
  private dragPlane = new THREE.Plane();
  private dragNormal = new THREE.Vector3();
  private pipMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.ink,
    side: THREE.DoubleSide,
  });
  private guideMaterial = new THREE.LineBasicMaterial({
    color: 0xa29aaa,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  private ringMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.lilac,
    fog: false,
  });
  private selectionRing = new THREE.Mesh(this.ring, this.ringMaterial);
  private floor: THREE.Mesh;
  private shadowFadeHeight = { value: 1 };
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private puzzle: Puzzle | null = null;
  private highlightedGroup = new Set<number>();
  private selection: number | null = null;
  private previousSelection: number | null = null;
  private orientation = new THREE.Quaternion();
  private preview = false;
  private fitDistance = 8;
  private boardRadius = 2;
  private billboardMatrix = new THREE.Matrix4();
  private width = 1;
  private height = 1;
  private interactive = true;
  private interactionRevision = 0;
  private motion: Motion | null = null;
  private frame = 0;
  private lastFrame = 0;
  private disposed = false;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private resizeObserver: ResizeObserver;
  private pointers = new Map<number, { x: number; y: number }>();
  private gestureStart = { x: 0, y: 0 };
  private gestureOrientation = new THREE.Quaternion();
  private gestureNode: number | null = null;
  private gestureFace: PickFace | undefined;
  private strokeNode: number | null = null;
  private strokeActive = false;
  private pendingTap: NodeTap | null = null;
  private tapTimer: number | null = null;
  private moved = false;
  private rotated = false;
  private pinchGesture = false;
  private listeners = new AbortController();

  constructor(
    private container: HTMLElement,
    private onNode: (id: number) => (() => void) | void,
    private onBackground?: () => void,
    private gestures: GestureCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(COLORS.background, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gumMaterials = new GumMaterials(this.renderer);
    this.updateGumMaterials();
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "Three-dimensional puzzle board. Tap spheres or drag between neighbors to connect them. Drag empty space to rotate.",
    );
    canvas.style.cssText =
      "display:block;width:100%;height:100%;touch-action:none;";
    this.container.appendChild(canvas);
    this.scene.fog = new THREE.Fog(COLORS.background, 24, 43);
    this.scene.add(this.board, this.studio, this.musicScore);
    this.musicScore.visible = false;
    const staffPositions: number[] = [];
    for (const y of [-.16, -.08, 0, .08, .16]) staffPositions.push(-1, y, 0, 1, y, 0);
    const staffGeometry = new THREE.BufferGeometry();
    staffGeometry.setAttribute("position", new THREE.Float32BufferAttribute(staffPositions, 3));
    this.musicScoreLines = new THREE.LineSegments(staffGeometry, this.musicScoreLineMaterial);
    this.musicScoreLines.renderOrder = 8;
    this.musicScore.add(this.musicScoreLines);
    this.board.add(
      this.guides,
      this.rods,
      this.selectionPaths,
      this.selectionRing,
      this.dragRod,
      this.dragTip,
      this.magnetRod,
      this.magnetTip,
      this.musicNotes,
    );
    for (const mesh of [this.dragRod, this.dragTip, this.magnetRod, this.magnetTip]) {
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
    }
    this.selectionRing.visible = false;
    this.studio.add(new THREE.HemisphereLight(0xffffff, 0xcac4e1, 1.8));
    const key = new THREE.DirectionalLight(0xfffbf1, 3.35);
    key.position.set(0, 10, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -10;
    key.shadow.camera.right = key.shadow.camera.top = 10;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 4;
    this.studio.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xc8c0ff, 0.95);
    fill.position.set(6, 2, -5);
    this.studio.add(fill, fill.target);
    const shadowMaterial = new THREE.ShadowMaterial({
      color: 0x514665,
      opacity: 0.11,
      fog: false,
    });
    // Let the lowered floor's shadows fade offscreen instead of being cut off
    // by the toolbar. Only the floor fades; puzzle nodes stay crisp.
    shadowMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.shadowFadeHeight = this.shadowFadeHeight;
      shader.fragmentShader =
        "uniform float shadowFadeHeight;\n" +
        shader.fragmentShader.replace(
          "#include <premultiplied_alpha_fragment>",
          "gl_FragColor.a *= smoothstep(0.0, shadowFadeHeight, gl_FragCoord.y);\n#include <premultiplied_alpha_fragment>",
        );
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), shadowMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.studio.add(this.floor);
    this.installGestures();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { this.endStroke(); this.stopAnimationFrame(); }
      else { this.render(); this.ensureAnimationFrame(); }
    }, { signal: this.listeners.signal });
    window.addEventListener("pagehide", () => this.endStroke(), { signal: this.listeners.signal });
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
      this.reducedMotion = event.matches;
      if (this.reducedMotion) {
        this.gumPulses.clear();
        this.clearMusicNotes();
        if (this.dragStrand && this.dragStrand.elapsed !== null) this.clearDragStrand();
      }
      this.render();
      if (this.wantsFrames) this.ensureAnimationFrame(); else this.stopAnimationFrame();
    }, { signal: this.listeners.signal });
    this.resize();
  }

  setPuzzle(puzzle: Puzzle, preview = false, animateShape = false): void {
    this.gumPulses.clear();
    this.updateGumNodes();
    this.gumDegrees.clear();
    if (this.highlightedGroup.size) {
      this.highlightedGroup.clear();
      this.updateMaterials();
    }
    const oldPuzzle = this.puzzle;
    const morph = animateShape && preview && this.preview && !!oldPuzzle
      && (oldPuzzle.settings.size !== puzzle.settings.size || oldPuzzle.settings.depth !== puzzle.settings.depth)
      && !this.reducedMotion && this.config.shapeTransitionMs > 0;
    const fromOrientation = this.orientation.clone();
    const fromDistance = this.camera.position.length();
    const fog = this.scene.fog as THREE.Fog;
    const fromFog: [number, number] = [fog.near, fog.far];
    const fromFloor = this.floor.position.y;
    const shapeNodes = morph ? this.captureShapeNodes() : new Map<string, ShapeNode>();
    // Freeze the source pool before adding new visuals, so entering nodes never
    // chain through another newly created, still invisible node.
    const sources = [...shapeNodes.values()].filter(node => node.fromOpacity > .001);
    const decorations = morph ? this.captureShapeDecorations() : [];
    if (!morph) this.finishShapeTransition();
    this.shapeTransition = null;
    this.cancelTap();
    this.endStroke();
    const captures = [...this.pointers.keys()];
    this.pointers.clear();
    for (const id of captures) {
      if (this.renderer.domElement.hasPointerCapture(id))
        this.renderer.domElement.releasePointerCapture(id);
    }
    this.connectionGrowth.clear();
    this.clearMusicNotes();
    if (!morph) this.clearDots();
    else { this.dotAnimations.clear(); this.pipMeshes.clear(); this.activeDotNodes.clear(); }
    this.cancelMotion();
    this.rodMeshes.clear();
    this.previousSelection = null;
    this.puzzle = puzzle;
    this.preview = preview;
    this.selection = null;
    this.selectionRing.visible = false;
    if (!morph) {
      for (const mesh of this.nodeMeshes.values()) this.board.remove(mesh);
      for (const group of this.pipGroups.values()) this.board.remove(group);
    }
    this.nodeMeshes.clear();
    this.pipGroups.clear();
    this.positions.clear();
    if (!morph) this.clearGuides(); else this.guides.clear();
    this.rods.clear();
    const bounds = new THREE.Box3();
    for (const node of puzzle.nodes)
      bounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
    const center = bounds.getCenter(new THREE.Vector3());
    for (const visual of shapeNodes.values()) visual.nodeId = null;
    for (const node of puzzle.nodes) {
      const position = new THREE.Vector3(node.x, node.y, node.z).sub(center);
      this.positions.set(node.id, position);
      const span = puzzle.settings.size - 1;
      const lattice = new THREE.Vector3(node.x / span, node.y / span,
        puzzle.settings.depth === 1 ? 1 : node.z / (puzzle.settings.depth - 1));
      const key = lattice.toArray().join(":");
      let visual = shapeNodes.get(key);
      const mesh = visual?.mesh ?? new THREE.Mesh(this.sphere, this.white);
      if (!visual) {
        mesh.position.copy(position);
        mesh.userData.basePosition = position.clone();
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.nodeId = node.id;
      mesh.userData.nodeScaleFactor = node.required === 0 ? .52 : 1;
      mesh.userData.shapeKey = key;
      mesh.userData.lattice = lattice;
      if (!visual) mesh.scale.setScalar(this.config.nodeScale * (node.required === 0 ? .52 : 1));
      this.nodeMeshes.set(node.id, mesh);
      this.board.add(mesh);
      const group = visual?.group ?? new THREE.Group();
      if (!visual) group.position.copy(position);
      group.scale.setScalar(this.config.nodeScale);
      this.pipGroups.set(node.id, group);
      const dots = visual?.dots ?? new DotAnimation(morph ? 0 : puzzle.remaining(node.id), {
        style: this.config.dotAnimation, durationMs: this.config.dotAnimationMs,
      });
      const pips = visual?.pips ?? new Map();
      this.dotAnimations.set(node.id, dots);
      this.pipMeshes.set(node.id, pips);
      this.board.add(group);
      if (morph) {
        if (!visual) {
          const source = this.nearestShapeNode(lattice, sources);
          this.basePosition(mesh).copy(source ? source.from : position);
          mesh.position.copy(this.basePosition(mesh));
          group.position.copy(mesh.position);
          visual = this.makeShapeNode(key, mesh, group, dots, pips, 0);
          shapeNodes.set(key, visual);
        }
        visual.nodeId = node.id;
        visual.to.copy(position);
        visual.toScale = this.config.nodeScale * (node.required === 0 ? .52 : 1);
        visual.toOpacity = 1;
        dots.retarget(puzzle.remaining(node.id), { style: "fade", durationMs: this.config.shapeTransitionMs });
      } else this.syncDots(node.id);
    }
    const targets = [...shapeNodes.values()].filter(node => node.nodeId !== null);
    for (const visual of shapeNodes.values()) if (visual.nodeId === null) {
      const target = this.nearestShapeNode(visual.lattice, targets);
      if (target) visual.to.copy(target.to);
      visual.toOpacity = 0;
    }
    // Hairline neighbor guides provide depth without competing with the placed rods.
    const lines: number[] = [];
    const guideEndpoints: THREE.Vector3[] = [];
    for (const node of puzzle.nodes) {
      for (const neighbor of puzzle.neighbors(node.id)) {
        const otherId =
          typeof neighbor === "number"
            ? neighbor
            : (neighbor as { id: number }).id;
        if (node.id >= otherId) continue;
        const a = this.nodeMeshes.get(node.id)?.position,
          b = this.nodeMeshes.get(otherId)?.position;
        if (a && b) {
          lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
          guideEndpoints.push(a, b);
        }
      }
    }
    const topology = `${puzzle.settings.size}:${puzzle.settings.depth}`;
    const existingGuide = decorations.find(item => item.object instanceof THREE.LineSegments && item.object.userData.topology === topology);
    let guide: THREE.LineSegments;
    if (existingGuide) {
      guide = existingGuide.object as THREE.LineSegments;
      // Matching topology references the same normalized visual nodes. Rebind
      // their live endpoints and fade this guide back in from its current state.
      existingGuide.fromOpacity = existingGuide.material.opacity;
      existingGuide.opacity = this.guideMaterial.opacity;
      existingGuide.entering = true;
    } else {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
      guide = new THREE.LineSegments(geometry, this.guideMaterial);
      if (morph) {
        const material = this.guideMaterial.clone();
        guide.material = material;
        decorations.push({ object: guide, material, opacity: this.guideMaterial.opacity, entering: true });
        material.opacity = 0;
      }
    }
    guide.userData.topology = topology;
    guide.userData.endpoints = guideEndpoints;
    guide.frustumCulled = false;
    this.guides.add(guide);
    this.orientation.copy(this.restingOrientation());
    this.boardRadius =
      Math.max(
        ...[...this.positions.values()].map((position) => position.length()),
      ) + this.nodeRadius + this.config.nodeFloatAmplitude;
    this.updateCamera();
    this.fitCamera();
    if (morph) {
      this.shapeTransition = {
        fromSize: oldPuzzle!.settings.size, toSize: puzzle.settings.size,
        fromDepth: oldPuzzle!.settings.depth, toDepth: puzzle.settings.depth,
        elapsed: 0, duration: this.config.shapeTransitionMs, nodes: shapeNodes, decorations,
        fromOrientation, toOrientation: this.orientation.clone(), fromDistance, toDistance: this.camera.position.length(),
        fromFog, toFog: [fog.near, fog.far], fromFloor, toFloor: this.floor.position.y,
      };
      this.advanceShape(0);
    }
    this.refresh(morph);
  }

  private nearestShapeNode(lattice: THREE.Vector3, nodes: ShapeNode[]): ShapeNode | undefined {
    let nearest: ShapeNode | undefined, distance = Infinity;
    for (const node of nodes) {
      const candidate = lattice.distanceToSquared(node.lattice);
      if (candidate < distance) { nearest = node; distance = candidate; }
    }
    return nearest;
  }

  private makeShapeNode(key: string, mesh: THREE.Mesh, group: THREE.Group, dots: DotAnimation, pips: PipMeshes, opacity: number): ShapeNode {
    const finalMaterial = mesh.material as THREE.MeshStandardMaterial;
    const material = finalMaterial.clone();
    if (material instanceof THREE.MeshPhysicalMaterial) this.gumMaterials.apply(material, "node");
    material.transparent = true;
    material.depthWrite = opacity === 1;
    material.opacity = opacity;
    mesh.material = material;
    return {
      key, mesh, group, dots, pips, material, finalMaterial,
      lattice: (mesh.userData.lattice as THREE.Vector3).clone(),
      from: this.basePosition(mesh).clone(), to: this.basePosition(mesh).clone(), fromColor: material.color.clone(), toColor: material.color.clone(),
      fromScale: mesh.scale.x, toScale: mesh.scale.x, fromOpacity: opacity, toOpacity: opacity, nodeId: null,
    };
  }

  private captureShapeNodes(): Map<string, ShapeNode> {
    const nodes = this.shapeTransition?.nodes ?? new Map<string, ShapeNode>();
    if (!this.shapeTransition) for (const [id, mesh] of this.nodeMeshes) {
      const key = mesh.userData.shapeKey as string;
      nodes.set(key, this.makeShapeNode(key, mesh, this.pipGroups.get(id)!, this.dotAnimations.get(id)!, this.pipMeshes.get(id)!, 1));
    }
    for (const node of nodes.values()) {
      node.from.copy(this.basePosition(node.mesh));
      node.fromScale = node.mesh.scale.x;
      node.fromOpacity = node.material.opacity;
      node.fromColor.copy(node.material.color);
    }
    return nodes;
  }

  private captureShapeDecorations(): ShapeDecoration[] {
    const decorations = this.shapeTransition?.decorations ?? [];
    for (let index = decorations.length - 1; index >= 0; index--) {
      const item = decorations[index];
      if (item.material.opacity > .001) continue;
      item.object.removeFromParent();
      item.material.dispose();
      if (item.object instanceof THREE.LineSegments) item.object.geometry.dispose();
      decorations.splice(index, 1);
    }
    const existing = new Set(decorations.map(item => item.object));
    for (const item of decorations) {
      item.opacity = item.material.opacity;
      item.entering = false;
      item.fromOpacity = undefined;
      this.board.add(item.object);
    }
    for (const object of [...this.rods.children, ...this.guides.children] as (THREE.Mesh | THREE.LineSegments)[]) {
      if (existing.has(object)) continue;
      const material = (object.material as THREE.Material).clone();
      if (material instanceof THREE.MeshPhysicalMaterial) this.gumMaterials.apply(material, "rod");
      material.transparent = true;
      material.depthWrite = false;
      object.material = material;
      decorations.push({ object, material, opacity: material.opacity, entering: false });
      this.board.add(object);
    }
    return decorations;
  }

  setSelection(id: number | null): void {
    this.previousSelection = this.selection;
    this.selection = id;
    this.updateMaterials();
    const position = id === null ? null : this.nodeMeshes.get(id)?.position;
    this.selectionRing.visible = !!position;
    if (position) this.selectionRing.position.copy(position);
    this.render();
  }

  setConfig(config: GameConfig): void {
    this.config = { ...config.scene };
    this.updateGumMaterials();
    if (!this.gumMotionEnabled) this.gumPulses.clear();
    this.white.color.set(this.config.nodeColor);
    this.finished.color.set(this.config.completedColor);
    this.connectionColors.configure(this.white.color, this.finished.color, new THREE.Color(this.config.connectionColor));
    this.ringMaterial.color.set(this.config.connectionColor);
    this.selectionPathMaterial.color.set(this.config.connectionColor);
    this.selected.color.set(this.config.connectionColor).lerp(this.white.color, .75);
    this.neighborMaterial.color.set(this.config.connectionColor).lerp(this.white.color, .9);
    (this.scene.fog as THREE.Fog).color.set(this.config.background);
    this.renderer.setClearColor(this.config.background, 1);
    (this.floor.material as THREE.ShadowMaterial).opacity = this.config.shadowOpacity;
    for (const node of this.puzzle?.nodes ?? []) {
      const mesh = this.nodeMeshes.get(node.id)!;
      const scale = this.config.nodeScale * (node.required === 0 ? .52 : 1);
      const visual = this.shapeTransition?.nodes.get(mesh.userData.shapeKey);
      if (visual) visual.toScale = scale; else mesh.scale.setScalar(scale);
    }
    for (const group of this.pipGroups.values()) group.scale.setScalar(this.config.nodeScale);
    this.selectionRing.scale.setScalar(this.config.nodeScale);
    this.boardRadius = Math.max(0, ...[...this.positions.values()].map(position => position.length())) + this.nodeRadius + this.config.nodeFloatAmplitude;
    if (this.config.rotationMs === 0 && this.motion) { this.orientation.copy(this.motion.target); this.motion = null; }
    if (this.config.connectionMs === 0 || this.reducedMotion) this.connectionGrowth.clear();
    if ((this.config.dragReturnMs === 0 || this.reducedMotion) && this.dragStrand && this.dragStrand.elapsed !== null) this.clearDragStrand();
    if (this.config.dotAnimationMs === 0 || this.reducedMotion) {
      this.clearMusicNotes();
      for (const id of this.activeDotNodes) {
        this.dotAnimations.get(id)!.finish();
        this.syncDots(id);
      }
      this.activeDotNodes.clear();
    }
    for (const [key, rod] of this.rodMeshes) this.placeRod(rod, this.growthProgress(this.connectionGrowth.get(key)));
    this.updateMaterials();
    if (this.shapeTransition) {
      if (this.config.shapeTransitionMs === 0 || this.reducedMotion) this.finishShapeTransition();
    }
    this.fitCamera();
    this.render();
    if (this.wantsFrames) this.ensureAnimationFrame(); else this.stopAnimationFrame();
  }

  private get gumMotionEnabled(): boolean {
    return this.config.materialStyle === "gum" && this.config.gooStretch > 0
      && !this.reducedMotion && this.config.connectionMs > 0 && !this.shapeTransition;
  }

  private updateGumMaterials(): void {
    this.gumMaterials.configure(this.config);
    this.highlightedRodMaterial.color.set(this.config.materialStyle === "gum" ? 0xe7b36c : 0xb77536);
    for (const material of [this.white, this.finished, this.highlightedNodeMaterial, this.selected, this.neighborMaterial, this.dragTipMaterial, this.magnetTipMaterial])
      this.gumMaterials.apply(material, "node");
    for (const material of [this.rodMaterial, this.highlightedRodMaterial, this.dragRodMaterial, this.magnetRodMaterial])
      this.gumMaterials.apply(material, "rod");
    for (const node of this.shapeTransition?.nodes.values() ?? [])
      if (node.material instanceof THREE.MeshPhysicalMaterial) this.gumMaterials.apply(node.material, "node");
    for (const item of this.shapeTransition?.decorations ?? [])
      if (item.material instanceof THREE.MeshPhysicalMaterial) this.gumMaterials.apply(item.material, "rod");
  }

  private updateGumNodes(): void {
    if (this.shapeTransition) return;
    for (const [id, mesh] of this.nodeMeshes) {
      const group = this.pipGroups.get(id)!;
      const pulse = this.gumMotionEnabled ? this.gumPulses.get(id) : undefined;
      const t = pulse ? Math.min(1, pulse.elapsed / pulse.duration) : 1;
      const strain = this.config.gooStretch * (pulse?.strength ?? 1) * .22 * Math.sin(t * Math.PI * 3) * (1 - t) ** 2;
      const y = 1 + strain, x = 1 / Math.sqrt(y);
      const scale = this.config.nodeScale * mesh.userData.nodeScaleFactor;
      mesh.scale.set(scale * x, scale * y, scale * x);
      // Use the same frame for the sphere and its dots, keeping every clue
      // attached to the ellipsoid; raycasting and shadows use this real scale.
      mesh.quaternion.copy(group.quaternion);
      group.scale.copy(mesh.scale);
    }
  }

  getGumState() {
    return {
      style: this.config.materialStyle, stretch: this.config.gooStretch, gloss: this.config.gooGloss,
      nodeRoughness: this.white.roughness, rodRoughness: this.rodMaterial.roughness, nodeClearcoat: this.white.clearcoat,
      nodes: [...this.nodeMeshes].map(([id, mesh]) => ({ id, scale: mesh.scale.toArray() })),
      pulses: [...this.gumPulses].map(([id, pulse]) => ({ id, progress: Math.min(1, pulse.elapsed / pulse.duration) })),
      rods: [...this.rodMeshes.values()].map(rod => ({ edge: [...rod.edge], scale: rod.mesh.scale.toArray() })),
    };
  }

  private get dragAnimating(): boolean {
    return !!this.dragStrand && (this.dragStrand.elapsed !== null
      || this.dragStrand.end.distanceToSquared(this.dragStrand.desired) > 1e-8
      || !!this.dragMagnet && Math.abs(this.dragMagnet.strength - this.dragMagnet.target) > 1e-4);
  }

  get hasAnimations(): boolean { return this.dragAnimating || this.gumPulses.size > 0 || this.motion !== null || this.connectionGrowth.size > 0 || this.activeDotNodes.size > 0 || this.noteParticles.length > 0 || this.shapeTransition !== null; }

  get hasAmbientMotion(): boolean {
    return !this.disposed && !this.reducedMotion && !document.hidden && this.config.nodeFloatAmplitude > 0 && this.nodeMeshes.size > 0;
  }

  private get wantsFrames(): boolean { return !this.disposed && !document.hidden && (this.hasAnimations || this.hasAmbientMotion); }

  private basePosition(mesh: THREE.Mesh): THREE.Vector3 {
    return mesh.userData.basePosition as THREE.Vector3;
  }

  private floatOffset(key: string): THREE.Vector3 {
    let phase = this.floatingPhases.get(key);
    if (phase === undefined) {
      let hash = 2166136261;
      for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
      phase = (hash >>> 0) / 4294967296;
      this.floatingPhases.set(key, phase);
    }
    const angle = (this.floatingPhase + phase) * Math.PI * 2;
    const amount = this.reducedMotion ? 0 : this.config.nodeFloatAmplitude;
    return this.floatingOffset.set(
      amount * .15 * Math.sin(angle + 1.7),
      amount * .98 * Math.sin(angle),
      amount * .1 * Math.cos(angle + .8),
    );
  }

  private floatingNodes(): { nodeId: number | null; key: string; mesh: THREE.Mesh; group: THREE.Group }[] {
    if (this.shapeTransition) return [...this.shapeTransition.nodes.values()];
    return [...this.nodeMeshes].map(([nodeId, mesh]) => ({
      nodeId, key: mesh.userData.shapeKey as string, mesh, group: this.pipGroups.get(nodeId)!,
    }));
  }

  private attachedGuides(): THREE.LineSegments[] {
    return [...new Set([
      ...this.guides.children as THREE.LineSegments[],
      ...this.shapeTransition?.decorations.filter(item => item.object instanceof THREE.LineSegments).map(item => item.object as THREE.LineSegments) ?? [],
    ])];
  }

  private updateFloating(): void {
    for (const node of this.floatingNodes()) {
      node.mesh.position.copy(this.basePosition(node.mesh)).add(this.floatOffset(node.key));
      node.group.position.copy(node.mesh.position);
    }
    if (this.selection !== null) {
      const selected = this.nodeMeshes.get(this.selection);
      if (selected) this.selectionRing.position.copy(selected.position);
    }
    for (const [key, rod] of this.rodMeshes) this.placeRod(rod, this.growthProgress(this.connectionGrowth.get(key)));
    for (const mesh of this.selectionPaths.children as THREE.Mesh[]) {
      this.placeLink(mesh, mesh.userData.link as LinkEndpoints);
    }
    for (const item of this.shapeTransition?.decorations ?? []) {
      if (item.object instanceof THREE.Mesh && item.object.userData.link)
        this.placeLink(item.object, item.object.userData.link as LinkEndpoints);
    }
    for (const guide of this.attachedGuides()) {
      const positions = guide.geometry.getAttribute("position") as THREE.BufferAttribute;
      const endpoints = guide.userData.endpoints as THREE.Vector3[];
      endpoints.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
      positions.needsUpdate = true;
    }
  }

  getFloatingState() {
    let guideCount = 0, guideMaxError = 0;
    for (const guide of this.attachedGuides()) {
      const positions = guide.geometry.getAttribute("position") as THREE.BufferAttribute;
      const endpoints = guide.userData.endpoints as THREE.Vector3[];
      guideCount += endpoints.length / 2;
      endpoints.forEach((point, index) => {
        guideMaxError = Math.max(guideMaxError, Math.hypot(
          positions.getX(index) - point.x, positions.getY(index) - point.y, positions.getZ(index) - point.z,
        ));
      });
    }
    return {
      active: this.hasAmbientMotion, amplitude: this.config.nodeFloatAmplitude,
      periodMs: this.config.nodeFloatPeriodMs, phase: this.floatingPhase,
      nodes: this.floatingNodes().map(node => ({
        nodeId: node.nodeId, key: node.key, base: this.basePosition(node.mesh).toArray(), visual: node.mesh.position.toArray(),
        offset: node.mesh.position.clone().sub(this.basePosition(node.mesh)).toArray(), pips: node.group.position.toArray(),
      })),
      rods: [...this.rodMeshes.values()].map(rod => {
        const link = rod.mesh.userData.link as LinkEndpoints;
        return {
          edge: [...rod.edge], start: new THREE.Vector3(0, -.5, 0).applyMatrix4(rod.mesh.matrixWorld).toArray(),
          end: new THREE.Vector3(0, .5, 0).applyMatrix4(rod.mesh.matrixWorld).toArray(),
          targetStart: link.start.toArray(), targetEnd: link.start.clone().lerp(link.end, link.progress).toArray(), progress: link.progress,
        };
      }),
      selection: this.selection !== null && this.selectionRing.visible
        ? { nodeId: this.selection, position: this.selectionRing.position.toArray() } : null,
      guideCount, guideMaxError,
    };
  }

  getShapeTransitionState() {
    const shape = this.shapeTransition;
    if (!shape) return null;
    return {
      active: true, fromSize: shape.fromSize, toSize: shape.toSize, fromDepth: shape.fromDepth, toDepth: shape.toDepth,
      progress: Math.min(1, shape.elapsed / shape.duration), durationMs: shape.duration,
      cameraDistance: this.camera.position.length(),
      destinationDistance: shape.toDistance,
      fog: {
        near: (this.scene.fog as THREE.Fog).near, far: (this.scene.fog as THREE.Fog).far,
        destinationNear: shape.toFog[0], destinationFar: shape.toFog[1],
      },
      nodes: [...shape.nodes.values()].map(node => ({
        key: node.key, nodeId: node.nodeId, position: node.mesh.position.toArray(),
        target: node.to.toArray(), scale: node.mesh.scale.toArray(), opacity: node.material.opacity,
      })),
      decorations: shape.decorations.map(item => ({ entering: item.entering, opacity: item.material.opacity })),
    };
  }

  getDotAnimationState() {
    return [...this.dotAnimations].map(([nodeId, animation]) => ({ nodeId, ...animation.snapshot() }));
  }

  getMusicNoteState() {
    return this.noteParticles.map(note => ({
      kind: "dot", progress: Math.min(1, note.elapsed / note.duration), slot: note.slot,
      position: note.sprite.position.toArray(), target: note.target.toArray(), scale: note.sprite.scale.x,
    }));
  }

  getMusicScoreState() {
    return {
      enabled: this.musicScoreEnabled, visible: this.musicScore.visible, staffLines: 5,
      notes: [...this.scoreNotes].map(([slot, note]) => ({ slot, position: note.position.toArray() })),
    };
  }

  setMusicScoreEnabled(enabled: boolean): void {
    if (this.musicScoreEnabled === enabled) return;
    this.musicScoreEnabled = enabled;
    if (!enabled) this.clearMusicNotes();
    this.render();
  }

  setHighlightedGroup(ids: number[] | null): void {
    const requested = new Set(ids);
    const next = new Set(this.puzzle?.disconnected
      ? this.puzzle.nodes.filter(node => node.required > 0 && requested.has(node.id)).map(node => node.id)
      : []);
    if (next.size === this.highlightedGroup.size && [...next].every(id => this.highlightedGroup.has(id))) return;
    this.highlightedGroup = next;
    this.updateMaterials();
    this.render();
  }

  getNetworkHighlightState() {
    const rods = [...this.rodMeshes.values()].map(rod => ({
      edge: [...rod.edge] as [number, number],
      color: (rod.mesh.material as THREE.MeshStandardMaterial).color.getHexString(),
      highlighted: rod.mesh.material === this.highlightedRodMaterial,
    }));
    return {
      nodeIds: [...this.highlightedGroup],
      edges: rods.filter(rod => rod.highlighted).map(rod => rod.edge),
      guidesVisible: this.guides.visible,
      nodes: [...this.nodeMeshes].map(([id, mesh]) => ({
        id, color: (mesh.material as THREE.MeshStandardMaterial).color.getHexString(),
        highlighted: mesh.material === this.highlightedNodeMaterial,
      })),
      rods,
    };
  }

  getConnectionAnimationState(): { edge: [number, number]; progress: number; durationMs: number; easing: SceneConfig["connectionEasing"] }[] {
    return [...this.connectionGrowth].map(([key, growth]) => ({
      edge: [...this.rodMeshes.get(key)!.edge], progress: this.growthProgress(growth), durationMs: growth.duration, easing: growth.easing,
    }));
  }

  getConnectionColorState() {
    const positions = this.cylinder.getAttribute("position");
    let startIndex = 0, endIndex = 0, centerIndex = 0;
    for (let i = 1; i < positions.count; i++) {
      if (positions.getY(i) < positions.getY(startIndex)) startIndex = i;
      if (positions.getY(i) > positions.getY(endIndex)) endIndex = i;
      if (Math.abs(positions.getY(i)) < Math.abs(positions.getY(centerIndex))) centerIndex = i;
    }
    return [...this.rodMeshes.values()].map(rod => {
      const material = rod.mesh.material as THREE.MeshPhysicalMaterial;
      const colors = rod.mesh.geometry.getAttribute("color");
      const colorAt = (index: number) => material.vertexColors
        ? new THREE.Color().fromBufferAttribute(colors, index).multiply(material.color).getHexString()
        : material.color.getHexString();
      return {
        edge: [...rod.edge], startNode: rod.startNode, endNode: rod.endNode,
        startColor: colorAt(startIndex), centerColor: colorAt(centerIndex), endColor: colorAt(endIndex),
        highlighted: material === this.highlightedRodMaterial,
      };
    });
  }

  private get nodeRadius(): number { return RADIUS * this.config.nodeScale; }

  private growthProgress(growth?: Growth): number {
    if (!growth || growth.duration <= 0) return 1;
    const t = Math.min(1, Math.max(0, growth.elapsed / growth.duration));
    if (growth.easing === "linear") return t;
    if (growth.easing === "easeInOut") return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return 1 - Math.pow(1 - t, 3);
  }

  private placeRod(rod: Rod, progress: number): void {
    const link = rod.mesh.userData.link as LinkEndpoints;
    const growth = this.connectionGrowth.get(rod.edge.join(":"));
    const t = growth ? Math.min(1, growth.elapsed / growth.duration) : 1;
    const strain = this.gumMotionEnabled
      ? this.config.gooStretch * (-.38 * (1 - progress) + .22 * Math.sin(t * Math.PI * 3) * (1 - t)) : 0;
    const gum = this.config.materialStyle === "gum";
    link.radius = this.config.rodRadius * (1 + strain) * (gum ? .08 + .92 * progress : 1);
    // A gum strand stays anchored to both spheres, starting thin and relaxing
    // to its full thickness. This keeps the flared ends inside the nodes.
    link.progress = gum ? 1 : progress;
    rod.length = rod.start.distanceTo(rod.end);
    this.placeLink(rod.mesh, link);
    rod.mesh.visible = progress > 0;
  }

  private placeLink(mesh: THREE.Mesh, link: LinkEndpoints): void {
    this.linkDirection.subVectors(link.end, link.start);
    const length = this.linkDirection.length();
    mesh.position.copy(link.start).lerp(link.end, link.progress / 2);
    mesh.scale.set(link.radius, Math.max(.00001, length * link.progress), link.radius);
    if (length > .000001) mesh.quaternion.setFromUnitVectors(this.linkUp, this.linkDirection.divideScalar(length));
    if (mesh.material instanceof THREE.MeshPhysicalMaterial) this.gumMaterials.configureRod(mesh);
  }

  private connectionGeometry(rod: Rod): THREE.CylinderGeometry {
    return this.connectionColors.geometry(
      this.puzzle!.remaining(rod.startNode) === 0,
      this.puzzle!.remaining(rod.endNode) === 0,
    );
  }

  private refreshConnections(animate: boolean): void {
    if (!this.puzzle) return;
    const current = new Set<string>();
    for (const [a, b] of this.puzzle.edges) {
      const edge: [number, number] = a < b ? [a, b] : [b, a];
      const key = edge.join(":");
      const first = this.nodeMeshes.get(a)?.position, second = this.nodeMeshes.get(b)?.position;
      if (!first || !second) continue;
      current.add(key);
      if (this.rodMeshes.has(key)) continue;
      const source = this.previousSelection === a || this.previousSelection === b ? this.previousSelection : this.selection;
      const reverse = source === b;
      const start = reverse ? second : first, end = reverse ? first : second;
      const startNode = reverse ? b : a, endNode = reverse ? a : b;
      const delta = end.clone().sub(start);
      const mesh = new THREE.Mesh(this.connectionColors.geometry(
        this.puzzle.remaining(startNode) === 0, this.puzzle.remaining(endNode) === 0,
      ), this.rodMaterial);
      mesh.customDepthMaterial = this.gumMaterials.depth;
      mesh.raycast = (ray, hits) => this.gumMaterials.raycast(mesh, ray, hits);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.link = { start, end, radius: this.config.rodRadius, progress: 1 } satisfies LinkEndpoints;
      const rod = { edge, mesh, start, end, startNode, endNode, length: delta.length() };
      this.rodMeshes.set(key, rod);
      this.rods.add(mesh);
      if (animate && !this.reducedMotion && this.config.connectionMs > 0) this.connectionGrowth.set(key, {
        elapsed: 0, duration: this.config.connectionMs, easing: this.config.connectionEasing,
      });
      this.placeRod(rod, this.growthProgress(this.connectionGrowth.get(key)));
    }
    for (const [key, rod] of this.rodMeshes) if (!current.has(key)) {
      this.rods.remove(rod.mesh);
      this.rodMeshes.delete(key);
      this.connectionGrowth.delete(key);
    }
    if (this.wantsFrames) this.ensureAnimationFrame(); else this.stopAnimationFrame();
  }

  refresh(animateConnections = true): void {
    if (!this.puzzle) return;
    this.refreshConnections(animateConnections);
    for (const node of this.puzzle.nodes) {
      const remaining = this.puzzle.remaining(node.id);
      const previous = this.gumDegrees.get(node.id);
      if (previous !== undefined && previous !== remaining) {
        if (animateConnections && this.gumMotionEnabled)
          this.gumPulses.set(node.id, { elapsed: 0, duration: this.config.connectionMs });
      }
      this.gumDegrees.set(node.id, remaining);
      const animation = this.dotAnimations.get(node.id)!;
      const releasedDots = animation.retarget(remaining, {
        style: this.config.dotAnimation, durationMs: this.config.dotAnimationMs,
        animate: animateConnections && !this.reducedMotion,
      });
      if (animateConnections && !this.preview && !this.reducedMotion && this.config.dotAnimationMs > 0)
        this.releaseMusicNotes(node.id, releasedDots);
      if (animation.active) this.activeDotNodes.add(node.id); else this.activeDotNodes.delete(node.id);
      this.syncDots(node.id);
    }
    this.updateMaterials();
    this.render();
    if (this.wantsFrames) this.ensureAnimationFrame(); else this.stopAnimationFrame();
  }

  private syncDots(nodeId: number): void {
    const group = this.pipGroups.get(nodeId)!;
    const meshes = this.pipMeshes.get(nodeId)!;
    const dots = this.dotAnimations.get(nodeId)!.dots;
    const key = this.nodeMeshes.get(nodeId)?.userData.shapeKey;
    const opacity = this.shapeTransition?.nodes.get(key)?.material.opacity ?? 1;
    this.syncDotMeshes(group, meshes, dots, opacity);
  }

  private syncDotMeshes(group: THREE.Group, meshes: PipMeshes, dots: DotAnimation["dots"], opacity = 1): void {
    const ids = new Set(dots.map(dot => dot.id));
    for (const [id, mesh] of meshes) if (!ids.has(id)) {
      if (mesh.material !== this.pipMaterial) mesh.material.dispose();
      group.remove(mesh);
      meshes.delete(id);
    }
    for (const dot of dots) {
      let mesh = meshes.get(dot.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.pip, this.pipMaterial);
        meshes.set(dot.id, mesh);
        group.add(mesh);
      }
      // Settled dots share one material; only fading dots need independent
      // opacity uniforms, and those temporary materials are released on settle.
      const alpha = dot.opacity * opacity;
      if (alpha < 1) {
        if (mesh.material === this.pipMaterial) {
          mesh.material = this.pipMaterial.clone();
          mesh.material.transparent = true;
          mesh.material.depthWrite = false;
        }
        mesh.material.opacity = alpha;
      } else if (mesh.material !== this.pipMaterial) {
        mesh.material.dispose();
        mesh.material = this.pipMaterial;
      }
      const z = Math.sqrt(Math.max(0, RADIUS * RADIUS - dot.x * dot.x - dot.y * dot.y)) + .002;
      mesh.position.set(dot.x, dot.y, z);
      mesh.quaternion.setFromUnitVectors(this.pipFacing, this.pipNormal.copy(mesh.position).normalize());
      mesh.scale.setScalar(dot.scale);
      mesh.visible = dot.scale > 0 && alpha > 0;
    }
  }

  private noteDotMap(): THREE.CanvasTexture {
    if (this.noteDotTexture) return this.noteDotTexture;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#302b48";
    context.beginPath();
    context.arc(32, 32, 22, 0, Math.PI * 2);
    context.fill();
    this.noteDotTexture = new THREE.CanvasTexture(canvas);
    this.noteDotTexture.colorSpace = THREE.SRGBColorSpace;
    return this.noteDotTexture;
  }

  private updateMusicScoreLayout(): void {
    const depth = 2.2;
    const halfHeight = depth * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfWidth = halfHeight * this.camera.aspect;
    const localPosition = new THREE.Vector3(0, halfHeight * .84, -depth);
    this.camera.updateMatrixWorld();
    this.musicScore.position.copy(this.camera.localToWorld(localPosition));
    this.musicScore.quaternion.copy(this.camera.quaternion);
    this.musicScore.scale.setScalar(halfWidth * .46);
    this.musicScore.updateMatrixWorld();
  }

  private scoreTarget(slot: number): THREE.Vector3 {
    const x = -.78 + (slot % 10) * .173;
    const y = [-.08, .08, 0, .16, -.02, .08, -.08, .02, .12, -.05][slot % 10];
    return new THREE.Vector3(x, y, .025);
  }

  private releaseMusicNotes(nodeId: number, dots: readonly { id: number; x: number; y: number }[]): void {
    if (!this.musicScoreEnabled) return;
    const node = this.nodeMeshes.get(nodeId);
    if (!node || dots.length === 0) return;
    this.musicScore.visible = true;
    this.updateMusicScoreLayout();
    this.camera.updateMatrixWorld();
    const up = this.camera.up.clone().normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    const forward = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const origin = node.position.clone();
    for (const [index, dot] of dots.entries()) {
      if (this.noteParticles.length >= 20) this.removeMusicNote(this.noteParticles.shift()!);
      const slot = this.scoreCursor++ % 10;
      const targetLocal = this.scoreTarget(slot);
      const target = this.musicScore.localToWorld(targetLocal.clone());
      const material = new THREE.SpriteMaterial({
        map: this.noteDotMap(), transparent: true, opacity: 1, depthWrite: false, depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      const start = origin.clone()
        .addScaledVector(right, dot.x * 1.6 + (index - (dots.length - 1) / 2) * .025)
        .addScaledVector(up, dot.y * 1.6)
        .addScaledVector(forward, .03);
      sprite.position.copy(start);
      sprite.scale.setScalar(.07);
      sprite.renderOrder = 7;
      this.musicNotes.add(sprite);
      this.noteParticles.push({
        sprite, material, start, target, targetLocal,
        elapsed: 0, duration: 580 + index * 60, slot,
      });
    }
  }

  private placeScoreNote(note: MusicNoteParticle): void {
    const previous = this.scoreNotes.get(note.slot);
    if (previous) this.musicScore.remove(previous);
    const group = new THREE.Group();
    group.position.copy(note.targetLocal);
    const head = new THREE.Mesh(this.musicNoteHead, this.musicNoteMaterial);
    head.scale.y = .72;
    head.rotation.z = -.32;
    const stem = new THREE.Line(this.musicNoteStem, this.musicNoteLineMaterial);
    stem.renderOrder = 9;
    group.add(head, stem);
    group.renderOrder = 9;
    this.musicScore.add(group);
    this.scoreNotes.set(note.slot, group);
  }

  private removeMusicNote(note: MusicNoteParticle): void {
    this.musicNotes.remove(note.sprite);
    note.material.dispose();
  }

  private clearMusicNotes(): void {
    for (const note of this.noteParticles) this.removeMusicNote(note);
    this.noteParticles = [];
    for (const note of this.scoreNotes.values()) this.musicScore.remove(note);
    this.scoreNotes.clear();
    this.scoreCursor = 0;
    this.musicScore.visible = false;
  }

  private advanceMusicNotes(ms: number): void {
    this.camera.updateMatrixWorld();
    for (let index = this.noteParticles.length - 1; index >= 0; index--) {
      const note = this.noteParticles[index];
      note.elapsed += ms;
      const progress = Math.min(1, note.elapsed / note.duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      note.target.copy(this.musicScore.localToWorld(note.targetLocal.clone()));
      note.sprite.position.lerpVectors(note.start, note.target, eased);
      note.sprite.scale.setScalar(THREE.MathUtils.lerp(.07, .09, eased));
      if (progress === 1) {
        this.placeScoreNote(note);
        this.removeMusicNote(note);
        this.noteParticles.splice(index, 1);
      }
    }
  }

  private clearDots(): void {
    for (const meshes of this.pipMeshes.values()) for (const mesh of meshes.values()) {
      if (mesh.material !== this.pipMaterial) mesh.material.dispose();
    }
    this.pipMeshes.clear();
    this.dotAnimations.clear();
    this.activeDotNodes.clear();
  }

  private shapeProgress(): number {
    if (!this.shapeTransition) return 1;
    const t = Math.min(1, this.shapeTransition.elapsed / this.shapeTransition.duration);
    return t * t * (3 - 2 * t);
  }

  private advanceShape(ms: number): void {
    const shape = this.shapeTransition;
    if (!shape) return;
    shape.elapsed += ms;
    if (shape.elapsed >= shape.duration) { this.finishShapeTransition(); return; }
    const t = this.shapeProgress();
    for (const node of shape.nodes.values()) {
      this.basePosition(node.mesh).lerpVectors(node.from, node.to, t);
      node.mesh.position.copy(this.basePosition(node.mesh));
      node.group.position.copy(node.mesh.position);
      node.mesh.scale.setScalar(THREE.MathUtils.lerp(node.fromScale, node.toScale, t));
      node.material.opacity = THREE.MathUtils.lerp(node.fromOpacity, node.toOpacity, t);
      node.material.color.lerpColors(node.fromColor, node.toColor, t);
      node.material.depthWrite = node.material.opacity === 1;
      node.mesh.visible = node.material.opacity > .001;
      node.mesh.castShadow = node.material.opacity > .1;
      if (node.nodeId === null) node.dots.advance(ms);
      this.syncDotMeshes(node.group, node.pips, node.dots.dots, node.material.opacity);
    }
    for (const item of shape.decorations) {
      // Old links disappear before the layers meet; the new guide grid arrives
      // once the destination shape is recognizable.
      item.material.opacity = item.entering
        ? THREE.MathUtils.lerp(item.fromOpacity ?? 0, item.opacity, THREE.MathUtils.smoothstep(t, .3, 1))
        : item.opacity * (1 - THREE.MathUtils.smoothstep(t, 0, .55));
      item.object.visible = item.material.opacity > .001;
      if (item.object instanceof THREE.Mesh) item.object.castShadow = item.material.opacity > .1;
    }
    this.orientation.slerpQuaternions(shape.fromOrientation, shape.toOrientation, t);
    this.updateCamera();
  }

  private finishShapeTransition(): void {
    const shape = this.shapeTransition;
    if (!shape) return;
    this.shapeTransition = null;
    for (const node of shape.nodes.values()) {
      node.material.dispose();
      if (node.nodeId === null) {
        this.board.remove(node.mesh, node.group);
        for (const mesh of node.pips.values()) if (mesh.material !== this.pipMaterial) mesh.material.dispose();
      } else {
        this.basePosition(node.mesh).copy(node.to);
        node.mesh.position.copy(node.to);
        node.mesh.scale.setScalar(node.toScale);
        node.mesh.material = node.finalMaterial;
        node.mesh.visible = true;
        node.mesh.castShadow = true;
        node.group.position.copy(node.to);
        node.dots.finish();
        this.activeDotNodes.delete(node.nodeId);
        this.syncDots(node.nodeId);
      }
    }
    for (const item of shape.decorations) {
      item.material.dispose();
      if (item.entering) {
        (item.object as THREE.LineSegments).material = this.guideMaterial;
        item.object.visible = true;
      } else {
        item.object.removeFromParent();
        if (item.object instanceof THREE.LineSegments) item.object.geometry.dispose();
      }
    }
    this.orientation.copy(shape.toOrientation);
    this.updateCamera();
  }

  private updateMaterials(): void {
    if (!this.puzzle) return;
    if (this.highlightedGroup.size && !this.puzzle.disconnected) this.highlightedGroup.clear();
    this.guides.visible = this.highlightedGroup.size === 0;
    for (const rod of this.rodMeshes.values()) {
      rod.mesh.geometry = this.connectionGeometry(rod);
      rod.mesh.material = this.highlightedGroup.has(rod.edge[0]) && this.highlightedGroup.has(rod.edge[1])
        ? this.highlightedRodMaterial : this.rodMaterial;
    }
    this.selectionPaths.clear();
    const available = new Set<number>();
    if (this.selection !== null && this.puzzle.remaining(this.selection) > 0) {
      const start = this.nodeMeshes.get(this.selection)!.position;
      for (const id of this.puzzle.neighbors(this.selection)) {
        const connected = this.puzzle.edges.some(
          ([a, b]) =>
            (a === this.selection && b === id) ||
            (b === this.selection && a === id),
        );
        if (connected || this.puzzle.remaining(id) <= 0) continue;
        available.add(id);
        const end = this.nodeMeshes.get(id)!.position;
        const delta = end.clone().sub(start);
        const path = new THREE.Mesh(this.cylinder, this.selectionPathMaterial);
        path.position.copy(start).add(end).multiplyScalar(0.5);
        path.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          delta.clone().normalize(),
        );
        path.scale.set(0.012, delta.length(), 0.012);
        path.userData.link = { start, end, radius: .012, progress: 1 } satisfies LinkEndpoints;
        this.selectionPaths.add(path);
      }
    }
    for (const node of this.puzzle.nodes) {
      const mesh = this.nodeMeshes.get(node.id)!;
      const material =
        node.id === this.selection && this.config.materialStyle !== "gum"
          ? this.selected
          : node.required === 0
            ? this.inactive
            : this.highlightedGroup.has(node.id)
              ? this.highlightedNodeMaterial
              : this.puzzle.remaining(node.id) === 0
                ? this.finished
                : available.has(node.id) && this.config.materialStyle !== "gum"
                  ? this.neighborMaterial
                  : this.white;
      const visual = this.shapeTransition?.nodes.get(mesh.userData.shapeKey);
      if (visual) { visual.finalMaterial = material; visual.toColor.copy(material.color); }
      else mesh.material = material;
    }
  }

  rotate(direction: TurnDirection): void {
    if (this.shapeTransition || this.isFlat) return;
    this.interactionRevision++;
    // Use the destination of an active turn, so quick repeated taps accumulate.
    const from = this.motion?.target ?? this.orientation;
    this.animateTo(quarterTurn(from, direction, this.isFlat), true);
  }

  focusNode(id: number): void {
    if (this.shapeTransition) return;
    const position = this.positions.get(id);
    if (!position || !this.puzzle) return;
    if (this.isFlat) {
      this.animateTo(
        nearestOrientation(this.motion?.target ?? this.orientation, true)
          .quaternion,
        true,
      );
      return;
    }
    const half = (this.puzzle.settings.size - 1) / 2;
    // At edges and corners, choose the nearest actual containing face.
    const containing = CUBE_ORIENTATIONS.filter(
      (item) => Math.abs(position.dot(item.direction) - half) < 0.001,
    );
    const from = this.motion?.target ?? this.orientation;
    const best = containing.reduce((best, item) =>
      Math.abs(from.dot(item.quaternion)) > Math.abs(from.dot(best.quaternion))
        ? item
        : best,
    );
    this.animateTo(best.quaternion, true);
  }

  /** Present a surface edge without changing the gameplay focus behavior. */
  focusConnection(a: number, b: number, maxDurationMs?: number): void {
    if (this.shapeTransition) return;
    const start = this.positions.get(a), end = this.positions.get(b);
    if (!start || !end || !this.puzzle?.neighbors(a).includes(b)) return;
    if (this.isFlat) {
      this.animateTo(nearestOrientation(this.motion?.target ?? this.orientation, true).quaternion, false, maxDurationMs);
      return;
    }
    const half = (this.puzzle.settings.size - 1) / 2;
    const from = this.motion?.target ?? this.orientation;
    const faces = CUBE_ORIENTATIONS.filter(item =>
      Math.abs(start.dot(item.direction) - half) < .001 &&
      Math.abs(end.dot(item.direction) - half) < .001,
    ).sort((left, right) => Math.abs(from.dot(right.quaternion)) - Math.abs(from.dot(left.quaternion)));
    if (!faces.length) return;
    const face = faces[0].quaternion;
    const oblique = [-PREVIEW_TILT.yaw, PREVIEW_TILT.yaw].map(yaw => face.clone().multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(PREVIEW_TILT.pitch, yaw, 0, "YXZ")),
    )).sort((left, right) => Math.abs(from.dot(right)) - Math.abs(from.dot(left)));
    this.animateTo(oblique.find(candidate => this.connectionVisible(a, b, candidate)) ?? face, false, maxDurationMs);
  }

  private connectionVisible(a: number, b: number, orientation: THREE.Quaternion): boolean {
    const camera = this.camera.clone();
    camera.position.set(0, 0, this.camera.position.length()).applyQuaternion(orientation);
    camera.quaternion.copy(orientation);
    camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const start = this.nodeMeshes.get(a)!.position, end = this.nodeMeshes.get(b)!.position;
    for (const [id, point] of [[a, start], [b, end]] as const) {
      const projected = point.clone().project(camera);
      if (Math.abs(projected.x) > .96 || Math.abs(projected.y) > .96) return false;
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
      if (ray.intersectObjects([...this.nodeMeshes.values(), ...this.rods.children], false)[0]?.object.userData.nodeId !== id) return false;
    }
    const otherNodes = [...this.nodeMeshes].filter(([id]) => id !== a && id !== b).map(([, mesh]) => mesh);
    for (const fraction of [.3, .5, .7]) {
      const point = start.clone().lerp(end, fraction);
      const projected = point.clone().project(camera);
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
      ray.far = camera.position.distanceTo(point) - .01;
      if (ray.intersectObjects(otherNodes, false).length) return false;
    }
    return true;
  }

  isInteracting(): boolean { return this.pointers.size > 0; }

  /** Changes for manual input, never for programmatic connection/node focus. */
  getInteractionRevision(): number { return this.interactionRevision; }

  resetView(): void {
    if (this.shapeTransition) return;
    this.interactionRevision++;
    const target = this.restingOrientation();
    const rotationChanged = (this.motion?.target ?? this.orientation).angleTo(target) > 1e-6;
    this.animateTo(target, true);
    if (!rotationChanged) this.render();
  }

  serializeView(): { version: 1; orientation: [number, number, number, number] } {
    // Store the intended face when a turn has started but has not finished.
    const orientation = this.motion?.target ?? this.orientation;
    return { version: 1, orientation: [orientation.x, orientation.y, orientation.z, orientation.w] };
  }

  restoreView(value: unknown): boolean {
    if (!this.puzzle || !value || typeof value !== "object") return false;
    // Legacy saves can contain a zoom field; fixed framing deliberately ignores it.
    const view = value as { version?: unknown; orientation?: unknown };
    if (view.version !== 1 || !Array.isArray(view.orientation) || view.orientation.length !== 4 ||
      !view.orientation.every(component => typeof component === "number" && Number.isFinite(component))) return false;
    const [x, y, z, w] = view.orientation as number[];
    const length = Math.hypot(x, y, z, w);
    if (!Number.isFinite(length) || length < 1e-6 || length > 1e6) return false;
    const orientation = new THREE.Quaternion(x / length, y / length, z / length, w / length);
    // Flat puzzles always resume from their fixed, face-on view. Older saves
    // may contain an in-plane rotation from before Flat was view-locked.
    if (this.isFlat) orientation.identity();
    this.cancelMotion();
    this.orientation.copy(orientation);
    this.updateCamera();
    this.render();
    return true;
  }

  getViewState(): {
    projection: "perspective";
    direction: number[];
    up: number[];
    snapped: boolean;
    animating: boolean;
    face: string | null;
    distance: number;
    fog: { near: number; far: number };
  } {
    const nearest = nearestOrientation(this.orientation, this.isFlat);
    const snapped =
      Math.abs(this.orientation.dot(nearest.quaternion)) > 1 - 1e-8;
    const clean = (vector: THREE.Vector3) =>
      vector.toArray().map((value) => Math.round(value * 1e6) / 1e6);
    return {
      projection: "perspective",
      direction: clean(
        new THREE.Vector3(0, 0, 1).applyQuaternion(this.orientation),
      ),
      up: clean(new THREE.Vector3(0, 1, 0).applyQuaternion(this.orientation)),
      snapped,
      animating: this.motion !== null || this.shapeTransition !== null,
      face: snapped ? nearest.face : null,
      distance: this.camera.position.length(),
      fog: { near: (this.scene.fog as THREE.Fog).near, far: (this.scene.fog as THREE.Fog).far },
    };
  }

  private get isFlat(): boolean {
    return this.puzzle?.settings.depth === 1;
  }

  private restingOrientation(): THREE.Quaternion {
    if (!this.preview || this.isFlat) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(PREVIEW_TILT.pitch, -PREVIEW_TILT.yaw, 0, "YXZ"),
    );
  }

  setInteractive(enabled: boolean): void {
    this.interactive = enabled;
    if (!enabled) {
      this.cancelTap();
      this.endStroke();
      this.moved = true;
    }
    this.renderer.domElement.tabIndex = enabled ? 0 : -1;
    this.renderer.domElement.style.cursor = enabled ? "grab" : "default";
  }

  mount(container: HTMLElement): void {
    this.resizeObserver.unobserve(this.container);
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this.resizeObserver.observe(container);
    this.resize();
  }

  resize(): void {
    if (this.disposed) return;
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.shadowFadeHeight.value =
      Math.min(80, this.height * 0.14) * this.renderer.getPixelRatio();
    this.fitCamera();
    this.render();
  }

  private fitCamera(): void {
    this.camera.aspect = this.width / this.height;
    if (this.isFlat) {
      this.fitDistance = this.minimumDistance(this.restingOrientation()) * 1.13;
    } else {
      // Fit a sphere enclosing the cube once per resize, so turning a corner
      // toward the camera never changes the viewing distance.
      const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
      this.fitDistance =
        (this.boardRadius / Math.sin(Math.min(vertical, horizontal))) * 1.025;
    }
    if (this.shapeTransition) {
      const distance = Math.max(
        this.minimumDistance(this.shapeTransition.toOrientation),
        this.fitDistance,
      );
      // Haze distances are measured from the camera. Resize moves the fitted
      // destination camera, so its fog endpoints must move by the same amount.
      const shift = distance - this.shapeTransition.toDistance;
      this.shapeTransition.toFog[0] += shift;
      this.shapeTransition.toFog[1] += shift;
      this.shapeTransition.toDistance = distance;
    }
    this.updateCamera();
  }

  private minimumDistance(orientation: THREE.Quaternion): number {
    const inverse = orientation.clone().invert();
    const vertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const horizontal = vertical * this.camera.aspect;
    const margin = this.nodeRadius + 0.09 + this.config.nodeFloatAmplitude;
    let distance = 1;
    // Include a sphere-sized box around every node, not only its center.
    // This keeps the entire puzzle in frame through every turn and mid-transition.
    for (const position of this.positions.values()) {
      const local = position.clone().applyQuaternion(inverse);
      distance = Math.max(
        distance,
        local.z + margin + (Math.abs(local.x) + margin) / horizontal,
        local.z + margin + (Math.abs(local.y) + margin) / vertical,
      );
    }
    return distance * 1.025;
  }

  private updateCamera(): void {
    const distance = this.shapeTransition
      ? THREE.MathUtils.lerp(this.shapeTransition.fromDistance, this.shapeTransition.toDistance, this.shapeProgress())
      : Math.max(this.minimumDistance(this.orientation), this.fitDistance);
    this.camera.position.set(0, 0, distance).applyQuaternion(this.orientation);
    this.camera.quaternion.copy(this.orientation);
    this.camera.up.set(0, 1, 0).applyQuaternion(this.orientation);
    this.camera.far = distance + this.boardRadius + 20;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.updateDepthHaze(distance);
    this.updateStudio();
    this.updateBillboards();
    this.updateMusicScoreLayout();
  }

  private updateDepthHaze(distance: number): void {
    const fog = this.scene.fog as THREE.Fog;
    if (this.shapeTransition) {
      const shape = this.shapeTransition, t = this.shapeProgress();
      fog.near = THREE.MathUtils.lerp(shape.fromFog[0], shape.toFog[0], t);
      fog.far = THREE.MathUtils.lerp(shape.fromFog[1], shape.toFog[1], t);
      return;
    }
    let nearest = Infinity;
    let farthest = -Infinity;
    for (const position of this.positions.values()) {
      const depth = distance - position.dot(this.camera.position) / distance;
      nearest = Math.min(nearest, depth);
      farthest = Math.max(farthest, depth);
    }
    const depthSpan = farthest - nearest;
    if (this.isFlat || this.config.fogStrength <= 0 || !Number.isFinite(depthSpan) || depthSpan < 0.01) {
      // Flat puzzles have no rear layers to separate.
      fog.near = distance + this.boardRadius + 1;
      fog.far = fog.near + 10;
      return;
    }
    // Preserve the front face, then fade the rear nodes and their pips into
    // the lavender studio. Measure board depth so size changes do not change
    // the strength, and rotating smoothly brings the next face into clarity.
    fog.near = nearest + Math.min(0.2, depthSpan * 0.08);
    fog.far = fog.near + (nearest + depthSpan * 1.4 + this.nodeRadius - fog.near) / this.config.fogStrength;
  }

  private updateStudio(): void {
    // Keep the studio upright to the player while the puzzle presents each face.
    // Only orientation follows the camera; the studio keeps a stable composition.
    this.studio.quaternion.copy(this.orientation);
    if (this.shapeTransition) {
      this.floor.position.y = THREE.MathUtils.lerp(this.shapeTransition.fromFloor, this.shapeTransition.toFloor, this.shapeProgress());
      return;
    }
    let lowest = 0;
    for (const position of this.positions.values()) {
      lowest = Math.min(lowest, position.dot(this.camera.up));
    }
    this.floor.position.y = lowest - this.nodeRadius - 0.8;
  }

  private updateBillboards(): void {
    // Perspective rays diverge: orient each marking toward the camera from its
    // own sphere, preserving screen-up even when viewing the top or bottom.
    const groups = this.shapeTransition ? [...this.shapeTransition.nodes.values()].map(node => node.group) : this.pipGroups.values();
    for (const group of groups) {
      this.billboardMatrix.lookAt(
        this.camera.position,
        group.position,
        this.camera.up,
      );
      group.quaternion.setFromRotationMatrix(this.billboardMatrix);
    }
    this.billboardMatrix.lookAt(
      this.camera.position,
      this.selectionRing.position,
      this.camera.up,
    );
    this.selectionRing.quaternion.setFromRotationMatrix(this.billboardMatrix);
  }

  private animateTo(target: THREE.Quaternion, manual = false, maxDurationMs = this.config.rotationMs): void {
    const viewChanged = (this.motion?.target ?? this.orientation).angleTo(target) > 1e-6;
    if (manual && this.orientation.angleTo(target) > 1e-6)
      this.gestures.onRotate?.();
    this.cancelTap();
    if (this.pointers.size && this.gestureNode !== null) {
      // A new camera command ends drawing until this pointer is released.
      this.gestureNode = null;
      this.moved = true;
      this.pinchGesture = true;
    }
    this.endStroke();
    const destination = target.clone();
    this.cancelMotion();
    if (this.reducedMotion || this.config.rotationMs <= 0 || this.orientation.angleTo(destination) < 1e-6) {
      this.orientation.copy(destination);
      this.updateCamera();
      this.render();
    } else {
      this.motion = { from: this.orientation.clone(), target: destination, elapsed: 0, duration: Math.min(this.config.rotationMs, maxDurationMs) };
      this.ensureAnimationFrame();
    }
    // Install the target first so a persistence callback captures the final face.
    if (manual && viewChanged) this.gestures.onViewChange?.();
  }

  private ensureAnimationFrame(): void {
    if (this.disposed || this.frame || !this.wantsFrames) return;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.animationFrame);
  }

  private animationFrame = (time: number): void => {
    this.frame = 0;
    this.advanceTime(Math.min(100, Math.max(0, time - this.lastFrame)));
    if (this.wantsFrames && !this.disposed) {
      this.lastFrame = time;
      this.frame = requestAnimationFrame(this.animationFrame);
    }
  };

  private stopAnimationFrame(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  advanceTime(ms: number): void {
    const elapsed = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    if (this.hasAmbientMotion) this.floatingPhase = (this.floatingPhase + elapsed / this.config.nodeFloatPeriodMs) % 1;
    if (this.motion) {
      this.motion.elapsed += elapsed;
      const progress = Math.min(1, this.motion.elapsed / this.motion.duration);
      const t = 1 - Math.pow(1 - progress, 3);
      this.orientation.slerpQuaternions(this.motion.from, this.motion.target, t);
      if (progress === 1) { this.orientation.copy(this.motion.target); this.motion = null; }
      this.updateCamera();
    }
    for (const [key, growth] of this.connectionGrowth) {
      growth.elapsed += elapsed;
      this.placeRod(this.rodMeshes.get(key)!, this.growthProgress(growth));
      if (growth.elapsed >= growth.duration) this.connectionGrowth.delete(key);
    }
    for (const id of this.activeDotNodes) {
      const animation = this.dotAnimations.get(id)!;
      animation.advance(elapsed);
      this.syncDots(id);
      if (!animation.active) this.activeDotNodes.delete(id);
    }
    if (this.musicScoreEnabled) this.advanceMusicNotes(elapsed);
    for (const [id, pulse] of this.gumPulses) {
      pulse.elapsed += elapsed;
      if (pulse.elapsed >= pulse.duration) this.gumPulses.delete(id);
    }
    this.advanceShape(elapsed);
    this.render(elapsed);
    if (!this.wantsFrames) this.stopAnimationFrame();
  }

  private cancelMotion(): void {
    this.motion = null;
    if (!this.wantsFrames) this.stopAnimationFrame();
  }

  private frontFace(): PickFace | undefined {
    if (!this.puzzle || this.isFlat) return undefined;
    const direction = this.camera.position;
    let axis: PickFace["axis"] = "z";
    for (const candidate of ["x", "y"] as const)
      if (Math.abs(direction[candidate]) > Math.abs(direction[axis])) axis = candidate;
    return { axis, coordinate: Math.sign(direction[axis]) * (this.puzzle.settings.size - 1) / 2 };
  }

  private onFace(id: number, face: PickFace): boolean {
    const position = this.positions.get(id);
    return !!position && Math.abs(position[face.axis] - face.coordinate) < .001;
  }

  private hit(clientX: number, clientY: number, face = this.frontFace()): number | null {
    return this.rayHit(clientX, clientY, face);
  }

  private rayHit(clientX: number, clientY: number, face?: PickFace): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.scene.updateMatrixWorld(true);
    // Rear spheres can be visible through gaps, but cannot receive input.
    const nodes = [...this.nodeMeshes].filter(([id]) => !face || this.onFace(id, face)).map(([, mesh]) => mesh);
    const rods = [...this.rodMeshes.values()].filter(rod => rod.mesh.visible &&
      (!face || rod.edge.every(id => this.onFace(id, face)))).map(rod => rod.mesh);
    const hit = this.raycaster.intersectObjects([...nodes, ...rods], false)[0];
    return hit?.object.userData.nodeId ?? null;
  }

  getScreenNodes(): ScreenNode[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const face = this.frontFace();
    return [...this.positions].map(([id]) => {
      const position = this.nodeMeshes.get(id)!.position;
      const projected = position.clone().project(this.camera);
      const x = rect.left + ((projected.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - projected.y) / 2) * rect.height;
      const edge = position.clone().add(
        new THREE.Vector3(1, 0, 0)
          .applyQuaternion(this.camera.quaternion)
          .multiplyScalar(this.nodeRadius * this.nodeMeshes.get(id)!.scale.x),
      ).project(this.camera);
      const edgeX = rect.left + ((edge.x + 1) / 2) * rect.width;
      const edgeY = rect.top + ((1 - edge.y) / 2) * rect.height;
      const inView = Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
      const visible = inView && this.rayHit(x, y) === id;
      return {
        id,
        x,
        y,
        radius: Math.hypot(edgeX - x, edgeY - y),
        visible,
        pickable: face
          ? inView && this.onFace(id, face) && this.hit(x, y, face) === id
          : visible,
      };
    });
  }

  cancelPendingTap(): void {
    this.cancelTap();
  }

  get hasPendingTap(): boolean {
    return this.pendingTap !== null;
  }

  private cancelTap(): void {
    const hadTap = this.pendingTap !== null;
    if (this.tapTimer !== null) window.clearTimeout(this.tapTimer);
    this.tapTimer = null;
    this.pendingTap = null;
    // Let the current input (undo, a new tap, a dialog, etc.) finish before
    // checking completion. The first click itself has already taken effect.
    if (hadTap)
      queueMicrotask(() => {
        if (!this.disposed) this.gestures.onTapSettled?.();
      });
  }

  private tapNode(id: number, x: number, y: number): void {
    if (this.preview) return;
    const previous = this.pendingTap;
    const now = performance.now();
    if (
      this.gestures.onDoubleTap &&
      previous &&
      previous.id === id &&
      now - previous.time <= 280 &&
      Math.hypot(x - previous.x, y - previous.y) <= 20
    ) {
      this.cancelTap();
      previous.rollback?.();
      this.gestures.onDoubleTap?.(id);
      return;
    }
    this.cancelTap();
    const tap: NodeTap = { id, x, y, time: now };
    this.pendingTap = tap;
    tap.rollback = this.onNode(id) || undefined;
    if (this.pendingTap === tap)
      this.tapTimer = window.setTimeout(() => this.cancelTap(), 280);
  }

  private clearDragStrand(): void {
    this.dragStrand = null;
    this.clearDragMagnet();
    this.dragRod.visible = this.dragTip.visible = false;
  }

  private clearDragMagnet(): void {
    this.dragMagnet = null;
    this.magnetRod.visible = this.magnetTip.visible = false;
  }

  private followDragStrand(point: { x: number; y: number }): void {
    if (!this.strokeActive || this.strokeNode === null) return;
    // A full node may still begin a stroke to remove an existing edge, but it
    // must never create a new provisional connection in empty space.
    if (!this.puzzle || this.puzzle.remaining(this.strokeNode) <= 0) {
      if (this.dragStrand) {
        this.clearDragStrand();
        this.render();
      }
      return;
    }
    const start = this.nodeMeshes.get(this.strokeNode)?.position;
    if (!start) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((point.x - bounds.left) / bounds.width * 2 - 1, -(point.y - bounds.top) / bounds.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.camera.getWorldDirection(this.dragNormal);
    this.dragPlane.setFromNormalAndCoplanarPoint(this.dragNormal, start);
    const pointerEnd = this.raycaster.ray.intersectPlane(this.dragPlane, new THREE.Vector3());
    if (!pointerEnd) return;
    if (!this.dragStrand || this.dragStrand.nodeId !== this.strokeNode) {
      this.clearDragMagnet();
      this.dragStrand = {
        nodeId: this.strokeNode, end: start.clone(), desired: start.clone(), pointerEnd,
        recoil: new THREE.Vector3(), elapsed: null, duration: this.config.dragReturnMs,
      };
    } else this.dragStrand.pointerEnd.copy(pointerEnd);
    this.render();
    this.ensureAnimationFrame();
  }

  private capDragEnd(end: THREE.Vector3, start: THREE.Vector3): void {
    const length = end.distanceTo(start);
    if (length > this.config.dragMaxLength) end.sub(start).multiplyScalar(this.config.dragMaxLength / length).add(start);
  }

  private dragMagnetCandidate(strand: DragStrand): { nodeId: number; strength: number } | null {
    if (strand.elapsed !== null || !this.puzzle || this.puzzle.remaining(strand.nodeId) <= 0
      || this.config.dragMagnetRange === 0 || this.config.dragMagnetStrength === 0) return null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    let best: { nodeId: number; strength: number } | null = null;
    for (const id of this.puzzle.neighbors(strand.nodeId)) {
      if (this.puzzle.remaining(id) <= 0 || (this.gestureFace && !this.onFace(id, this.gestureFace))
        || this.puzzle.edges.some(([a, b]) => (a === strand.nodeId && b === id) || (b === strand.nodeId && a === id))) continue;
      const position = this.nodeMeshes.get(id)!.position;
      const gap = Math.max(0, position.distanceTo(strand.end) - this.nodeRadius);
      const proximity = 1 - THREE.MathUtils.clamp(gap / this.config.dragMagnetRange, 0, 1);
      const strength = proximity * proximity * (3 - 2 * proximity);
      if (strength <= 0 || (best && strength <= best.strength)) continue;
      const screen = position.clone().project(this.camera);
      if (Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1) continue;
      // Use the same front-face occlusion rules as input, including links.
      if (this.rayHit(bounds.left + (screen.x + 1) * bounds.width / 2,
        bounds.top + (1 - screen.y) * bounds.height / 2, this.gestureFace) !== id) continue;
      best = { nodeId: id, strength };
    }
    return best;
  }

  private advanceDrag(elapsed: number): void {
    const strand = this.dragStrand;
    if (!strand) return;
    if (!this.puzzle || this.puzzle.remaining(strand.nodeId) <= 0) {
      this.clearDragStrand();
      return;
    }
    const start = this.nodeMeshes.get(strand.nodeId)?.position;
    if (!start) { this.clearDragStrand(); return; }
    if (strand.elapsed !== null) {
      strand.elapsed += elapsed;
      if (strand.elapsed >= strand.duration) { this.clearDragStrand(); return; }
      const t = strand.elapsed / strand.duration;
      const elasticity = this.config.dragElasticity;
      // One soft recoil; zero bounce returns monotonically and every setting
      // reaches the anchor with zero velocity at the chosen duration.
      const spring = (1 - t) ** 2 * (1 - 3.3 * elasticity * Math.sin(Math.PI * t));
      strand.end.copy(start).addScaledVector(strand.recoil, spring);
    } else {
      strand.desired.copy(strand.pointerEnd);
      this.capDragEnd(strand.desired, start);
      const follow = this.reducedMotion || this.config.dragFollowMs === 0 ? 1 : -Math.expm1(-elapsed / this.config.dragFollowMs);
      strand.end.lerp(strand.desired, follow);
      if (strand.end.distanceToSquared(strand.desired) < 1e-8) strand.end.copy(strand.desired);
    }
    this.capDragEnd(strand.end, start);
    if (this.config.dragMagnetRange === 0 || this.config.dragMagnetStrength === 0) {
      this.clearDragMagnet();
      return;
    }
    const candidate = this.dragMagnetCandidate(strand);
    if (candidate && candidate.nodeId !== this.dragMagnet?.nodeId) {
      this.dragMagnet = { nodeId: candidate.nodeId, strength: 0, target: candidate.strength };
    }
    const magnet = this.dragMagnet;
    if (!magnet) return;
    magnet.target = candidate?.strength ?? 0;
    const response = this.reducedMotion || this.config.dragMagnetResponseMs === 0 ? 1 : -Math.expm1(-elapsed / this.config.dragMagnetResponseMs);
    magnet.strength = THREE.MathUtils.lerp(magnet.strength, magnet.target, response);
    if (Math.abs(magnet.strength - magnet.target) < 1e-4) magnet.strength = magnet.target;
    if (magnet.strength === 0 && magnet.target === 0) this.clearDragMagnet();
  }

  private renderDragStrand(): void {
    const strand = this.dragStrand;
    if (!strand) return;
    const source = this.nodeMeshes.get(strand.nodeId)!;
    const length = strand.end.distanceTo(source.position);
    // Thin throughout the visible stretch, beginning at the sphere surface.
    const stretch = THREE.MathUtils.clamp((length - this.nodeRadius) / (this.config.dragMaxLength - this.nodeRadius), 0, 1);
    const thickness = THREE.MathUtils.lerp(1, this.config.dragMinThickness, stretch);
    const radius = this.config.rodRadius * this.config.dragThickness * thickness;
    const tipRadius = this.config.dragTipSize * this.config.nodeScale * Math.sqrt(thickness);
    const color = (source.material as THREE.MeshStandardMaterial).color;
    this.dragRodMaterial.color.copy(color);
    this.dragTipMaterial.color.copy(color);
    this.placeLink(this.dragRod, { start: source.position, end: strand.end, radius, progress: 1 });
    this.gumMaterials.configureRod(this.dragRod, this.nodeRadius, tipRadius);
    this.dragTip.position.copy(strand.end);
    this.dragTip.scale.setScalar(tipRadius / RADIUS);
    this.dragRod.visible = this.dragTip.visible = length > this.nodeRadius * .85;
    this.renderDragMagnet(strand);
  }

  private renderDragMagnet(strand: DragStrand): void {
    const magnet = this.dragMagnet;
    this.magnetRod.visible = this.magnetTip.visible = !!magnet && magnet.strength > .001;
    if (!magnet || !this.magnetRod.visible) return;
    const source = this.nodeMeshes.get(magnet.nodeId)!;
    // Leave a visible gap until actual node contact commits the connection.
    // Strong pull settings cannot make two unconnected tips look fused.
    const freeRadius = this.dragTip.scale.x * RADIUS;
    const available = Math.max(0, source.position.distanceTo(strand.end) - this.nodeRadius - freeRadius - .018 * this.config.nodeScale);
    const fullExtension = this.nodeRadius * (this.config.dragMagnetStrength + .27 * .4);
    const strength = Math.min(magnet.strength, available / fullExtension);
    if (strength <= .001) { this.magnetRod.visible = this.magnetTip.visible = false; return; }
    const tipRadius = this.nodeRadius * .27 * strength;
    const length = this.nodeRadius * (1 + this.config.dragMagnetStrength * strength) - tipRadius * .6;
    const end = this.magnetTip.position.copy(strand.end).sub(source.position).normalize().multiplyScalar(length).add(source.position);
    const radius = Math.min(this.config.rodRadius * this.config.dragThickness, tipRadius * .8);
    const color = (source.material as THREE.MeshStandardMaterial).color;
    this.magnetRodMaterial.color.copy(color);
    this.magnetTipMaterial.color.copy(color);
    this.placeLink(this.magnetRod, { start: source.position, end, radius, progress: 1 });
    this.gumMaterials.configureRod(this.magnetRod, this.nodeRadius, tipRadius);
    this.magnetTip.scale.setScalar(tipRadius / RADIUS);
  }

  getDragConnectionState() {
    const strand = this.dragStrand;
    return strand ? {
      nodeId: strand.nodeId, returning: strand.elapsed !== null, visible: this.dragRod.visible,
      start: this.nodeMeshes.get(strand.nodeId)!.position.toArray(), end: strand.end.toArray(),
      desiredEnd: strand.desired.toArray(), length: strand.end.distanceTo(this.nodeMeshes.get(strand.nodeId)!.position),
      maxLength: this.config.dragMaxLength, radius: this.dragRod.scale.x, tipRadius: this.dragTip.scale.x * RADIUS,
      magnet: this.dragMagnet ? {
        nodeId: this.dragMagnet.nodeId, strength: this.dragMagnet.strength, visible: this.magnetRod.visible,
        extension: this.magnetRod.visible ? this.magnetTip.position.distanceTo(this.nodeMeshes.get(this.dragMagnet.nodeId)!.position)
          + this.magnetTip.scale.x * RADIUS - this.nodeRadius : 0,
        start: this.nodeMeshes.get(this.dragMagnet.nodeId)!.position.toArray(), end: this.magnetTip.position.toArray(),
      } : null,
      progress: strand.elapsed === null ? 0 : Math.min(1, strand.elapsed / strand.duration),
    } : null;
  }

  private endStroke(retract = false): void {
    if (retract && this.dragStrand && this.dragRod.visible && !this.reducedMotion && this.config.dragReturnMs > 0) {
      const strand = this.dragStrand;
      strand.recoil.subVectors(strand.end, this.nodeMeshes.get(strand.nodeId)!.position);
      strand.elapsed = 0;
      strand.duration = this.config.dragReturnMs;
      if (this.gumMotionEnabled && this.config.dragElasticity > 0) this.gumPulses.set(strand.nodeId, { elapsed: 0, duration: strand.duration, strength: this.config.dragElasticity });
      this.ensureAnimationFrame();
    } else this.clearDragStrand();
    if (!this.strokeActive) return;
    this.strokeActive = false;
    this.strokeNode = null;
    this.gestures.onStrokeEnd?.();
  }

  private sampleStroke(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void {
    // Dense screen-space sampling catches intermediate nodes even when the
    // browser coalesces a fast swipe into a single pointer event.
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4),
    );
    for (let step = 1; step <= steps; step++) {
      if (!this.strokeActive || !this.interactive || this.strokeNode === null)
        return;
      const id = this.hit(
        from.x + ((to.x - from.x) * step) / steps,
        from.y + ((to.y - from.y) * step) / steps,
        this.gestureFace,
      );
      if (
        id === null ||
        id === this.strokeNode ||
        !this.puzzle?.neighbors(this.strokeNode).includes(id)
      )
        continue;
      const accepted =
        this.gestures.onStrokeEdge?.(this.strokeNode, id) ?? false;
      // The callback can complete the puzzle and disable interaction mid-event.
      if (!this.strokeActive || !this.interactive) return;
      if (accepted) this.strokeNode = id;
    }
  }

  private settleGesture(
    end: { x: number; y: number },
    directional: boolean,
  ): void {
    let destination = nearestOrientation(
      this.orientation,
      this.isFlat,
    ).quaternion;
    const start = nearestOrientation(
      this.gestureOrientation,
      this.isFlat,
    ).quaternion;
    const dx = end.x - this.gestureStart.x;
    const dy = end.y - this.gestureStart.y;
    const clearSwipe =
      Math.max(Math.abs(dx), Math.abs(dy)) >= 30 &&
      Math.max(Math.abs(dx), Math.abs(dy)) >=
        Math.min(Math.abs(dx), Math.abs(dy)) * 1.35;
    if (
      directional &&
      clearSwipe &&
      Math.abs(start.dot(destination)) > 1 - 1e-8
    ) {
      const direction = this.isFlat
        ? dx - dy >= 0
          ? "left"
          : "right"
        : Math.abs(dx) >= Math.abs(dy)
          ? dx > 0
            ? "left"
            : "right"
          : dy > 0
            ? "up"
            : "down";
      destination = quarterTurn(start, direction, this.isFlat);
    }
    this.animateTo(destination);
  }

  private installGestures(): void {
    const canvas = this.renderer.domElement;
    const options = { signal: this.listeners.signal };
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !this.interactive || this.shapeTransition ||
          (event.pointerType === "mouse" && event.button !== 0)
        )
          return;
        this.interactionRevision++;
        if (this.dragStrand) { this.clearDragStrand(); this.render(); }
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (this.pointers.size === 1) {
          this.gestureStart = { x: event.clientX, y: event.clientY };
          this.gestureOrientation.copy(this.motion?.target ?? this.orientation);
          this.gestureFace = this.frontFace();
          this.gestureNode = this.preview
            ? null
            : this.hit(event.clientX, event.clientY, this.gestureFace);
          // Hold the view the player actually touched; never jump to a queued
          // turn's destination after the drag has already picked its first node.
          if (this.gestureNode !== null) this.cancelMotion();
          this.moved = false;
          this.rotated = false;
          this.pinchGesture = false;
        } else {
          this.cancelTap();
          this.endStroke();
          this.moved = true;
          this.pinchGesture = true;
        }
        canvas.style.cursor =
          this.gestureNode === null ? "grabbing" : "crosshair";
      },
      options,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.interactive || this.shapeTransition) return;
        const previous = this.pointers.get(event.pointerId);
        if (!previous) {
          canvas.style.cursor =
            !this.preview && this.hit(event.clientX, event.clientY) !== null
              ? "pointer"
              : "grab";
          return;
        }
        const next = { x: event.clientX, y: event.clientY };
        this.pointers.set(event.pointerId, next);
        // Multi-touch is kept neutral: it cannot rotate, connect, or change framing.
        if (this.pointers.size >= 2) return;
        if (this.pinchGesture) return;
        if (
          !this.moved &&
          Math.hypot(
            next.x - this.gestureStart.x,
            next.y - this.gestureStart.y,
          ) > 5
        ) {
          this.moved = true;
          this.cancelTap();
          if (this.gestureNode !== null) {
            this.strokeNode = this.gestureNode;
            this.strokeActive = true;
            if (this.gestures.onStrokeStart?.(this.gestureNode) === false) {
              this.gestureNode = null;
              this.strokeNode = null;
              this.strokeActive = false;
            }
          }
        }
        if (!this.moved) return;
        if (this.gestureNode !== null) {
          this.sampleStroke(previous, next);
          this.followDragStrand(next);
          return;
        }
        if (this.isFlat) return;
        this.cancelMotion();
        if (!this.rotated) this.gestures.onRotate?.();
        this.rotated = true;
        const dx = next.x - previous.x;
        const dy = next.y - previous.y;
        this.orientation.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            -dx * 0.007,
          ),
        );
        this.orientation.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            -dy * 0.007,
          ),
        );
        this.orientation.normalize();
        this.updateCamera();
        this.render();
      },
      options,
    );
    const finish = (event: PointerEvent) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      const end =
        event.type === "pointerup"
          ? { x: event.clientX, y: event.clientY }
          : previous;
      if (event.type === "pointerup" && this.strokeActive && !this.pinchGesture) {
        this.sampleStroke(previous, end);
        this.followDragStrand(end);
      }
      this.pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (this.pointers.size) return;
      this.endStroke(event.type === "pointerup");
      canvas.style.cursor = this.interactive ? "grab" : "default";
      // Preview rotation is deliberately freeform: snapping would add a camera
      // animation that briefly holds the landing auto-solver after release.
      if (this.rotated && !this.preview)
        this.settleGesture(
          end,
          event.type === "pointerup" && !this.pinchGesture,
        );
      if (this.rotated) this.gestures.onViewChange?.();
      if (event.type !== "pointerup") this.cancelTap();
      if (
        !this.moved &&
        event.type === "pointerup" &&
        this.interactive &&
        !this.preview
      ) {
        const id = this.hit(end.x, end.y);
        if (id !== null) this.tapNode(id, end.x, end.y);
        else {
          this.cancelTap();
          this.onBackground?.();
        }
      }
    };
    canvas.addEventListener("pointerup", finish, options);
    canvas.addEventListener("pointercancel", finish, options);
    canvas.addEventListener("lostpointercapture", finish, options);
  }

  private clearGuides(): void {
    this.guides.traverse((object) => {
      if (object instanceof THREE.LineSegments) object.geometry.dispose();
    });
    this.guides.clear();
  }

  private render(elapsed = 0): void {
    if (this.disposed) return;
    this.updateFloating();
    this.updateBillboards();
    this.updateGumNodes();
    this.advanceDrag(elapsed);
    this.renderDragStrand();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.cancelTap();
    this.endStroke();
    this.disposed = true;
    this.finishShapeTransition();
    this.connectionGrowth.clear();
    this.gumPulses.clear();
    this.gumDegrees.clear();
    this.gumMaterials.dispose();
    this.clearMusicNotes();
    this.scene.remove(this.musicScore);
    this.musicScoreLines.geometry.dispose();
    this.musicScoreLineMaterial.dispose();
    this.musicNoteMaterial.dispose();
    this.musicNoteLineMaterial.dispose();
    this.musicNoteHead.dispose();
    this.musicNoteStem.dispose();
    this.noteDotTexture?.dispose();
    this.clearDots();
    this.rodMeshes.clear();
    this.cancelMotion();
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.clearGuides();
    this.sphere.dispose();
    this.cylinder.dispose();
    this.connectionColors.dispose();
    this.pip.dispose();
    this.ring.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    for (const material of [
      this.white,
      this.finished,
      this.highlightedNodeMaterial,
      this.inactive,
      this.selected,
      this.neighborMaterial,
      this.selectionPathMaterial,
      this.rodMaterial,
      this.highlightedRodMaterial,
      this.dragRodMaterial,
      this.dragTipMaterial,
      this.magnetRodMaterial,
      this.magnetTipMaterial,
      this.pipMaterial,
      this.guideMaterial,
      this.ringMaterial,
    ])
      material.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
