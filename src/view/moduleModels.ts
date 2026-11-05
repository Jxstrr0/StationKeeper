// Module models behind one loading interface.
//
// If a module definition has a "model" path, we load that .glb. Otherwise (or if loading fails) we build
// a grey-box from primitives. Either way the station view gets the same ModuleModel shape, so Blender art
// can drop in later without code changes.
import * as THREE from 'three';
import type { ModuleDef, Vec3 } from '../sim/types';

export interface ModuleModel {
  root: THREE.Object3D;
  /** Where the status light sits. Recoloured by power status. */
  statusLight: THREE.Object3D;
  /** Solar arrays: the part that rotates to track the sun. */
  gimbal?: THREE.Object3D;
  /** Materials that glow while the module is powered (habitat windows, etc.). */
  glowMaterials: THREE.MeshStandardMaterial[];
}

export interface ModuleModelSource {
  load(def: ModuleDef): Promise<ModuleModel>;
}

const COLORS = {
  hull: 0xdedad1,
  slate: 0x3a3936,
  dark: 0x1f1e1b,
  purple: 0x7b3fc4,
  lilac: 0xb48ce8,
  foil: 0xb6955e,
  window: 0xffd9a0,
};

/** Materials shared by every grey-box module, so the GPU sees few distinct materials. */
const shared = {
  hull: new THREE.MeshStandardMaterial({ color: COLORS.hull, roughness: 0.55, metalness: 0.08 }),
  slate: new THREE.MeshStandardMaterial({ color: COLORS.slate, roughness: 0.6, metalness: 0.15 }),
  dark: new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.8, metalness: 0.2 }),
  stripe: new THREE.MeshStandardMaterial({ color: COLORS.purple, roughness: 0.45, metalness: 0.1 }),
  foil: new THREE.MeshStandardMaterial({ color: COLORS.foil, roughness: 0.4, metalness: 0.3 }),
};

let panelMaterial: THREE.MeshStandardMaterial | null = null;
function getPanelMaterial(): THREE.MeshStandardMaterial {
  if (panelMaterial) return panelMaterial;
  // A small canvas texture gives the wings their cell grid.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a3a6e';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#6a7cb8';
  g.lineWidth = 2;
  for (let y = 0; y <= c.height; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(c.width / 2, 0);
  g.lineTo(c.width / 2, c.height);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  panelMaterial = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.4,
    metalness: 0.15,
    emissive: 0x0c1226,
    side: THREE.DoubleSide,
  });
  return panelMaterial;
}

let radiatorMaterial: THREE.MeshStandardMaterial | null = null;
function getRadiatorMaterial(): THREE.MeshStandardMaterial {
  if (radiatorMaterial) return radiatorMaterial;
  // White panels with the ammonia flow tubes showing as fine grey lines.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ecebe6';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#b9b6ad';
  for (let x = 4; x < c.width; x += 8) g.fillRect(x, 0, 1.5, c.height);
  g.fillRect(0, 0, c.width, 2);
  g.fillRect(0, c.height - 2, c.width, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Edge-on to the Sun by design, so they only ever see earthshine; a touch of self-light keeps them reading as white.
  radiatorMaterial = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.7,
    metalness: 0.05,
    emissive: 0x57554e,
    side: THREE.DoubleSide,
  });
  return radiatorMaterial;
}

const UP = new THREE.Vector3(0, 1, 0);

function v3(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos?: Vec3): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/** A cylinder whose axis points along `dir`, centred at `pos`. */
function cylinderAlong(radius: number, length: number, mat: THREE.Material, pos: Vec3, dir: Vec3, segments = 24): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(radius, radius, length, segments), mat, pos);
  m.quaternion.setFromUnitVectors(UP, v3(dir).normalize());
  return m;
}

function addPortCollars(group: THREE.Group, def: ModuleDef): void {
  for (const p of def.ports) {
    const d = v3(p.direction);
    const centre = v3(p.position).addScaledVector(d, -0.15);
    group.add(cylinderAlong(0.85, 0.3, shared.slate, [centre.x, centre.y, centre.z], p.direction, 20));
  }
}

function buildCore(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 8;
  const r = def.greybox.radius ?? 2;
  group.add(cylinderAlong(r, L - 0.6, shared.hull, [0, 0, 0], [1, 0, 0], 32));
  for (const x of [-(L / 2 - 0.3), L / 2 - 0.3]) group.add(cylinderAlong(r * 0.92, 0.6, shared.slate, [x, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.45, shared.stripe, [-1.2, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.15, shared.stripe, [-0.6, 0, 0], [1, 0, 0], 32));
  // Small radiator panel on top for silhouette.
  group.add(mesh(new THREE.BoxGeometry(3.2, 0.08, 1.4), shared.hull, [1.6, r + 0.5, -0.8]));
  group.add(mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), shared.slate, [1.6, r + 0.25, -0.8]));
  return {};
}

function buildSolar(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 11;
  const wingL = def.greybox.wingLength ?? 12;
  const wingW = def.greybox.wingWidth ?? 3.6;
  // Truss: two rails and cross members, instanced.
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, L), shared.slate, 4);
  const m = new THREE.Matrix4();
  [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ].forEach(([x, y], i) => rails.setMatrixAt(i, m.makeTranslation(x!, y!, L / 2)));
  group.add(rails);
  const braceCount = Math.floor(L / 1.2);
  const braces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), shared.hull, braceCount);
  for (let i = 0; i < braceCount; i++) braces.setMatrixAt(i, m.makeTranslation(0, 0, 0.6 + i * 1.2));
  group.add(braces);
  group.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 0.9), shared.hull, [0, 0, 0.45]));

  const gimbal = new THREE.Group();
  gimbal.name = 'gimbal';
  gimbal.position.set(0, 0, L);
  gimbal.add(cylinderAlong(0.6, 1.0, shared.slate, [0, 0, 0.5], [0, 0, 1]));
  gimbal.add(mesh(new THREE.BoxGeometry(0.25, wingL * 2 + 1.6, 0.25), shared.slate, [0, 0, 0.5]));
  const wingGeo = new THREE.BoxGeometry(0.06, wingL, wingW);
  for (const s of [1, -1]) {
    gimbal.add(mesh(wingGeo, getPanelMaterial(), [0, s * (0.8 + wingL / 2), 0.5]));
  }
  group.add(gimbal);
  return { gimbal };
}

function buildBattery(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const [sx, sy, sz] = def.greybox.size ?? [2.6, 1.8, 2.6];
  const top = -0.45;
  group.add(cylinderAlong(0.6, 0.45, shared.slate, [0, -0.225, 0], [0, 1, 0]));
  group.add(mesh(new THREE.BoxGeometry(sx, sy, sz), shared.foil, [0, top - sy / 2, 0]));
  group.add(mesh(new THREE.BoxGeometry(sx + 0.06, 0.18, sz + 0.06), shared.stripe, [0, top - 0.25, 0]));
  // Radiator fins: one instanced mesh for all of them.
  const finCount = 7;
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, sy * 0.7, 0.5), shared.hull, finCount * 2);
  const m = new THREE.Matrix4();
  for (let i = 0; i < finCount; i++) {
    const x = -sx / 2 + 0.3 + (i * (sx - 0.6)) / (finCount - 1);
    fins.setMatrixAt(i, m.makeTranslation(x, top - sy / 2 - 0.1, sz / 2 + 0.25));
    fins.setMatrixAt(finCount + i, m.makeTranslation(x, top - sy / 2 - 0.1, -sz / 2 - 0.25));
  }
  group.add(fins);
  return {};
}

function buildHabitat(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 7;
  const r = def.greybox.radius ?? 2.4;
  // Inflatable-looking hull from a lathe profile, revolved about Y then turned to lie along +X.
  const profile = [
    [0.95, 0],
    [1.5, 0.25],
    [r * 0.94, 0.9],
    [r, 1.6],
    [r, L - 1.6],
    [r * 0.94, L - 0.9],
    [1.5, L - 0.25],
    [0.95, L],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const hull = mesh(new THREE.LatheGeometry(profile, 40), shared.hull);
  hull.rotation.z = -Math.PI / 2;
  group.add(hull);
  group.add(cylinderAlong(r * 1.01, 0.35, shared.stripe, [1.25, 0, 0], [1, 0, 0], 40));
  group.add(cylinderAlong(r * 1.01, 0.35, shared.stripe, [L - 1.25, 0, 0], [1, 0, 0], 40));

  // Window band; the windows glow while the habitat is powered.
  const mid = L / 2;
  group.add(cylinderAlong(r * 1.005, 1.1, shared.dark, [mid, 0, 0], [1, 0, 0], 40));
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x2a2620,
    emissive: COLORS.window,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const count = 12;
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.08, 0.55), windowMat, count);
  const obj = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    obj.position.set(mid, Math.cos(a) * (r * 1.02), Math.sin(a) * (r * 1.02));
    obj.rotation.set(a, 0, 0);
    obj.updateMatrix();
    windows.setMatrixAt(i, obj.matrix);
  }
  group.add(windows);
  return { glowMaterials: [windowMat] };
}

/** Truss out along -Z from the base port, then a T of radiator panels that face the orbit normal (edge-on to the Sun). */
function buildRadiator(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 6;
  const wingL = def.greybox.wingLength ?? 7;
  const wingW = def.greybox.wingWidth ?? 2.2;
  const m = new THREE.Matrix4();
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, L), shared.slate, 4);
  [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ].forEach(([x, y], i) => rails.setMatrixAt(i, m.makeTranslation(x!, y!, -L / 2)));
  group.add(rails);
  const braceCount = Math.floor(L / 1.2);
  const braces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), shared.hull, braceCount);
  for (let i = 0; i < braceCount; i++) braces.setMatrixAt(i, m.makeTranslation(0, 0, -0.6 - i * 1.2));
  group.add(braces);
  group.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 0.9), shared.hull, [0, 0, -0.45]));

  // Pump box and manifold at the tip, then two wings of three panels each along ±X.
  group.add(mesh(new THREE.BoxGeometry(1.4, 1.0, 1.0), shared.foil, [0, 0, -L - 0.3]));
  group.add(mesh(new THREE.BoxGeometry(wingL * 2 + 1.6, 0.22, 0.22), shared.slate, [0, wingW / 2 + 0.15, -L - 0.3]));
  const segs = 3;
  const segL = (wingL - (segs - 1) * 0.15) / segs;
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(segL, wingW, 0.05), getRadiatorMaterial(), segs * 2);
  let k = 0;
  for (const side of [1, -1]) {
    for (let i = 0; i < segs; i++) {
      const x = side * (0.8 + segL / 2 + i * (segL + 0.15));
      panels.setMatrixAt(k++, m.makeTranslation(x, 0, -L - 0.3));
    }
  }
  group.add(panels);
  return {};
}

/** A short pressurised module running aft along -X, with O2 spheres and a water tank strapped to it. */
function buildLifeSupport(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 4.4;
  const r = def.greybox.radius ?? 1.7;
  const mid = -L / 2;
  group.add(cylinderAlong(r, L - 0.5, shared.hull, [mid, 0, 0], [1, 0, 0], 32));
  for (const x of [-0.25, -L + 0.25]) group.add(cylinderAlong(r * 0.9, 0.5, shared.slate, [x, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.3, shared.stripe, [mid + 0.7, 0, 0], [1, 0, 0], 32));
  // O2 spheres either side, a water tank underneath.
  const sphere = new THREE.SphereGeometry(0.62, 20, 14);
  for (const z of [1, -1]) {
    group.add(mesh(sphere, shared.hull, [mid - 0.6, 0.35, z * (r + 0.45)]));
    group.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.6), shared.slate, [mid - 0.6, 0.35, z * (r + 0.05)]));
  }
  group.add(cylinderAlong(0.55, 2.6, shared.dark, [mid, -r - 0.35, 0], [1, 0, 0], 20));
  group.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), shared.slate, [mid, -r - 0.05, 0]));
  return {};
}

/** A research can running aft along -X: lit rack windows on -Z, an exposed payload platform on +Z, antenna and sensor boom. */
/** A short pressurised junction: a hull along +X from the mount, with docking collars on the fore, zenith and nadir faces. */
function buildNode(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 3;
  const r = def.greybox.radius ?? 1.3;
  const mid = L / 2;
  group.add(cylinderAlong(r, L - 0.4, shared.hull, [mid, 0, 0], [1, 0, 0], 28));
  for (const x of [0.15, L - 0.15]) group.add(cylinderAlong(r * 0.85, 0.3, shared.slate, [x, 0, 0], [1, 0, 0], 28));
  group.add(cylinderAlong(r * 1.015, 0.25, shared.stripe, [mid, 0, 0], [1, 0, 0], 28));
  // Radial collars: a stub of slate tube ending in a ring at each radial port.
  for (const y of [1, -1]) {
    group.add(cylinderAlong(0.85, 0.3, shared.slate, [mid, y * (r - 0.05), 0], [0, 1, 0], 24));
    const ring = mesh(new THREE.TorusGeometry(0.8, 0.07, 8, 24), shared.slate, [mid, y * (r + 0.08), 0]);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  const ring = mesh(new THREE.TorusGeometry(0.8, 0.07, 8, 24), shared.slate, [L - 0.05, 0, 0]);
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  // A few handrails along the +Z side.
  for (const x of [0.7, L - 0.7]) group.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), shared.slate, [x, 0.4, r + 0.15]));
  return {};
}

function buildLab(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 6.5;
  const r = def.greybox.radius ?? 1.6;
  const mid = -L / 2;
  group.add(cylinderAlong(r, L - 0.5, shared.hull, [mid, 0, 0], [1, 0, 0], 32));
  for (const x of [-0.25, -L + 0.25]) group.add(cylinderAlong(r * 0.9, 0.5, shared.slate, [x, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.3, shared.stripe, [-1.1, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.12, shared.stripe, [-1.55, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.3, shared.stripe, [-L + 1.1, 0, 0], [1, 0, 0], 32));

  // Docking rings flush with each end.
  const ring = new THREE.TorusGeometry(0.85, 0.07, 8, 24);
  for (const x of [-0.08, -L + 0.08]) {
    const m = mesh(ring, shared.slate, [x, 0, 0]);
    m.rotation.y = Math.PI / 2;
    group.add(m);
  }

  // Lit experiment-rack windows down the -Z side.
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x2a2620,
    emissive: COLORS.window,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const winCount = 5;
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.5, 0.08), windowMat, winCount);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < winCount; i++) windows.setMatrixAt(i, m4.makeTranslation(-1.9 - i * 0.85, 0, -(r + 0.01)));
  group.add(windows);
  group.add(mesh(new THREE.BoxGeometry(L - 3.2, 0.7, 0.05), shared.dark, [-1.9 - 1.7, 0, -(r - 0.01)]));

  // Exposed payload platform on +Z: two pylons, a plate, and a few boxed instruments.
  const pylon = new THREE.BoxGeometry(0.15, 0.9, 0.5);
  for (const x of [-1.9, -L + 1.9]) group.add(mesh(pylon, shared.slate, [x, 0, r + 0.2]));
  group.add(mesh(new THREE.BoxGeometry(L - 2.2, 1.0, 0.1), shared.slate, [mid, 0, r + 0.45]));
  group.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.45), shared.hull, [mid + 1.2, 0, r + 0.75]));
  group.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.4), shared.foil, [mid, 0.05, r + 0.72]));
  group.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.45), shared.dark, [mid - 1.2, 0, r + 0.75]));
  group.add(cylinderAlong(0.22, 0.4, shared.slate, [mid + 0.6, -0.25, r + 0.75], [0, 0, 1], 12));

  // Dish antenna on a mast on top, aft of the status light.
  group.add(cylinderAlong(0.04, 0.9, shared.slate, [-L + 1.4, r + 0.4, 0], [0, 1, 0], 8));
  group.add(cylinderAlong(0.32, 0.06, shared.hull, [-L + 1.4, r + 0.9, 0], [0.25, 1, 0], 16));
  // Sensor boom out along -Z, low on the hull, ending in a sensor ball.
  group.add(cylinderAlong(0.04, 0.8, shared.slate, [-1.0, -0.9, -(r + 0.2)], [0, 0, 1], 8));
  group.add(mesh(new THREE.SphereGeometry(0.13, 12, 8), shared.dark, [-1.0, -0.9, -(r + 0.65)]));
  return { glowMaterials: [windowMat] };
}

const BUILDERS: Record<string, (def: ModuleDef, group: THREE.Group) => Partial<ModuleModel>> = {
  core: buildCore,
  solar: buildSolar,
  battery: buildBattery,
  habitat: buildHabitat,
  radiator: buildRadiator,
  lifesupport: buildLifeSupport,
  lab: buildLab,
  node: buildNode,
};

function addStatusLight(group: THREE.Group, at: Vec3): THREE.Object3D {
  const anchor = new THREE.Object3D();
  anchor.name = 'status_light';
  anchor.position.set(at[0], at[1], at[2]);
  group.add(anchor);
  return anchor;
}

export function buildGreybox(def: ModuleDef): ModuleModel {
  const group = new THREE.Group();
  group.name = `greybox:${def.id}`;
  const builder = BUILDERS[def.greybox.shape];
  const extra = builder ? builder(def, group) : {};
  if (!builder) group.add(mesh(new THREE.BoxGeometry(2, 2, 2), shared.hull)); // Unknown shape: a crate.
  addPortCollars(group, def);
  const model: ModuleModel = {
    root: group,
    statusLight: addStatusLight(group, def.greybox.light),
    glowMaterials: extra.glowMaterials ?? [],
  };
  if (extra.gimbal) model.gimbal = extra.gimbal;
  return model;
}

/** Loads .glb models when a module names one; falls back to grey-box. */
export class ModuleModelLoader implements ModuleModelSource {
  private gltfLoader: Promise<{ loadAsync(url: string): Promise<{ scene: THREE.Group }> }> | null = null;

  async load(def: ModuleDef): Promise<ModuleModel> {
    if (!def.model) return buildGreybox(def);
    try {
      // Only pull in the glTF loader once a module actually uses a model.
      this.gltfLoader ??= import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader());
      const gltf = await (await this.gltfLoader).loadAsync(`${import.meta.env.BASE_URL}${def.model}`);
      const root = gltf.scene;
      const glowMaterials: THREE.MeshStandardMaterial[] = [];
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.name.startsWith('glow')) {
          glowMaterials.push(o.material);
        }
      });
      const model: ModuleModel = {
        root,
        statusLight: root.getObjectByName('status_light') ?? addStatusLight(root, def.greybox.light),
        glowMaterials,
      };
      const gimbal = root.getObjectByName('gimbal');
      if (gimbal) model.gimbal = gimbal;
      return model;
    } catch (err) {
      console.warn(`Could not load ${def.model}; using grey-box instead.`, err);
      return buildGreybox(def);
    }
  }
}
