// Module models behind one loading interface.
//
// If a module definition has a "model" path, we load that .glb. Otherwise (or if loading fails) we build
// a grey-box from primitives. Either way the station view gets the same ModuleModel shape, so Blender art
// can drop in later without code changes.
import * as THREE from 'three';
import type { ModuleDef, Vec3 } from '../sim/types';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { handrails, openTruss, surfaceMaterials, tileUv } from './detail';
import { paneOrder, windowNode } from './lifeMath';
import { stationMaterials, type StationMaterials } from './stationMaterials';

export interface ModuleModel {
  root: THREE.Object3D;
  /** Where the status light sits. Recoloured by power status. */
  statusLight: THREE.Object3D;
  /** Solar arrays: the part that rotates to track the sun. */
  gimbal?: THREE.Object3D;
  /** Materials that glow while the module is powered (habitat windows, etc.). */
  glowMaterials: THREE.MeshStandardMaterial[];
  /** Guest modules: the window panes, in a scattered order, so drawing the first N lights N windows round the hull. */
  windows?: THREE.InstancedMesh[];
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

// Textured surfaces are drawn on first use (they need a canvas), then shared by every module.
let surfaceCache: ReturnType<typeof surfaceMaterials> | null = null;
function surf(): ReturnType<typeof surfaceMaterials> {
  return (surfaceCache ??= surfaceMaterials());
}
/** Handrails: the muted gold of anodised EVA rails. */
const railMaterial = new THREE.MeshStandardMaterial({ color: 0xc9a43a, roughness: 0.5, metalness: 0.35 });

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

/** A cylinder of plated hull: the panel texture keeps its size in metres whatever the radius and length. */
function platedAlong(radius: number, length: number, pos: Vec3, dir: Vec3, segments = 32, mat: THREE.Material = surf().plated): THREE.Mesh {
  const geo = tileUv(new THREE.CylinderGeometry(radius, radius, length, segments), 2 * Math.PI * radius, length);
  const m = mesh(geo, mat, pos);
  m.quaternion.setFromUnitVectors(UP, v3(dir).normalize());
  return m;
}

const collarRing = new THREE.TorusGeometry(0.8, 0.07, 8, 24);
const petal = new THREE.BoxGeometry(0.12, 0.34, 0.06);

/** Every port gets a collar, a docking ring and three guide petals, so ports read as ports. */
function addPortCollars(group: THREE.Group, def: ModuleDef): void {
  for (const p of def.ports) {
    const d = v3(p.direction).normalize();
    const centre = v3(p.position).addScaledVector(d, -0.15);
    group.add(cylinderAlong(0.85, 0.3, shared.slate, [centre.x, centre.y, centre.z], p.direction, 20));
    const face = new THREE.Group();
    face.position.copy(v3(p.position)).addScaledVector(d, -0.02);
    face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    face.add(mesh(collarRing, shared.hull));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const pt = mesh(petal, shared.slate, [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.12]);
      pt.rotation.z = a - Math.PI / 2;
      pt.rotation.x = 0.35;
      face.add(pt);
    }
    group.add(face);
  }
}

function buildCore(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 8;
  const r = def.greybox.radius ?? 2;
  group.add(platedAlong(r, L - 0.6, [0, 0, 0], [1, 0, 0]));
  for (const x of [-(L / 2 - 0.3), L / 2 - 0.3]) group.add(cylinderAlong(r * 0.92, 0.6, shared.slate, [x, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.45, shared.stripe, [-1.2, 0, 0], [1, 0, 0], 32));
  group.add(handrails(-L / 2 + 0.9, L / 2 - 0.9, r, [0.55, Math.PI - 0.55, Math.PI + 0.55], railMaterial));
  // A comms mast and dish aft, and a pair of thruster quads on the nadir side.
  group.add(cylinderAlong(0.05, 1.4, shared.slate, [-L / 2 + 1.2, 0, -(r + 0.7)], [0, 0, 1], 8));
  group.add(cylinderAlong(0.55, 0.08, shared.hull, [-L / 2 + 1.2, 0, -(r + 1.45)], [0.3, 0, 1], 20));
  for (const x of [-L / 2 + 1.0, L / 2 - 1.0]) {
    group.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), shared.dark, [x, -(r + 0.1), 0]));
    group.add(cylinderAlong(0.09, 0.2, shared.slate, [x + 0.3, -(r + 0.1), 0], [1, 0, 0], 8));
    group.add(cylinderAlong(0.09, 0.2, shared.slate, [x - 0.3, -(r + 0.1), 0], [1, 0, 0], 8));
  }
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
  group.add(openTruss(L, 1, 0.8, shared.slate, shared.hull));
  group.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 0.9), shared.hull, [0, 0, 0.45]));
  // Power cable down the truss.
  group.add(mesh(new THREE.BoxGeometry(0.1, 0.1, L - 1), shared.dark, [0.25, 0.25, L / 2 + 0.3]));

  const gimbal = new THREE.Group();
  gimbal.name = 'gimbal';
  gimbal.position.set(0, 0, L);
  gimbal.add(cylinderAlong(0.6, 1.0, shared.slate, [0, 0, 0.5], [0, 0, 1]));
  gimbal.add(mesh(new THREE.BoxGeometry(0.25, wingL * 2 + 1.6, 0.25), shared.slate, [0, 0, 0.5]));
  const wingGeo = new THREE.BoxGeometry(0.06, wingL, wingW);
  const edge = new THREE.BoxGeometry(0.1, wingL, 0.1);
  for (const s of [1, -1]) {
    gimbal.add(mesh(wingGeo, getPanelMaterial(), [0, s * (0.8 + wingL / 2), 0.5]));
    // A frame along each long edge and a tension bar at the tip.
    for (const z of [0.5 + wingW / 2, 0.5 - wingW / 2]) gimbal.add(mesh(edge, shared.slate, [0, s * (0.8 + wingL / 2), z]));
    gimbal.add(mesh(new THREE.BoxGeometry(0.12, 0.16, wingW + 0.1), shared.slate, [0, s * (0.8 + wingL), 0.5]));
  }
  group.add(gimbal);
  return { gimbal };
}

function buildBattery(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const [sx, sy, sz] = def.greybox.size ?? [2.6, 1.8, 2.6];
  const top = -0.45;
  group.add(cylinderAlong(0.6, 0.45, shared.slate, [0, -0.225, 0], [0, 1, 0]));
  group.add(mesh(new THREE.BoxGeometry(sx, sy, sz), surf().foil, [0, top - sy / 2, 0]));
  // Grapple fixture and a cable run on the face.
  group.add(cylinderAlong(0.18, 0.25, shared.slate, [0, top - sy - 0.12, 0], [0, 1, 0], 12));
  group.add(mesh(new THREE.BoxGeometry(0.08, sy * 0.8, 0.08), shared.dark, [sx / 2 + 0.04, top - sy / 2, 0.4]));
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

/**
 * Inflatable hulls: a quilted blanket on a lathe profile, lying along +X from the mount. The four kinds built on
 * it get their own silhouettes so they can be told apart at a glance:
 * - guest habitat: a ring of twelve lit windows;
 * - crew quarters: two rows of small portholes;
 * - galley: four windows and a vent stack with a hood;
 * - guest lounge: a wide panoramic window band.
 */
function buildHabitat(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 7;
  const r = def.greybox.radius ?? 2.4;
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
  // Lathe UVs run u round the hull and v along the profile, so they tile like a cylinder's.
  const hull = mesh(tileUv(new THREE.LatheGeometry(profile, 40), 2 * Math.PI * r, L), surf().quilted);
  hull.rotation.z = -Math.PI / 2;
  group.add(hull);
  group.add(cylinderAlong(r * 1.01, 0.35, shared.stripe, [1.25, 0, 0], [1, 0, 0], 40));
  group.add(cylinderAlong(r * 1.01, 0.35, shared.stripe, [L - 1.25, 0, 0], [1, 0, 0], 40));
  // Rigid end rings where the blanket meets the bulkheads.
  for (const x of [0.12, L - 0.12]) {
    const ring = mesh(new THREE.TorusGeometry(1.0, 0.09, 8, 28), shared.slate, [x, 0, 0]);
    ring.rotation.y = Math.PI / 2;
    group.add(ring);
  }

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x2a2620,
    emissive: COLORS.window,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const mid = L / 2;
  const obj = new THREE.Object3D();
  const rings: THREE.InstancedMesh[] = [];
  /** A ring of `count` windows at x, each w wide (along X) and h tall (round the hull), skipping a sector if asked. */
  const windowRing = (x: number, count: number, w: number, h: number, skipFrom = -1, skipTo = -1) => {
    const ring: number[] = [];
    for (let i = 0; i < count; i++) if (i < skipFrom || i > skipTo) ring.push(i);
    // Scattered, so lighting the first few (by occupancy) doesn't light one side only.
    const idx = paneOrder(ring, count);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.08, h), windowMat, idx.length);
    idx.forEach((i, k) => {
      const a = (i / count) * Math.PI * 2;
      obj.position.set(x, Math.cos(a) * (r * 1.02), Math.sin(a) * (r * 1.02));
      obj.rotation.set(a, 0, 0);
      obj.updateMatrix();
      inst.setMatrixAt(k, obj.matrix);
    });
    group.add(inst);
    rings.push(inst);
  };

  switch (def.kind) {
    case 'quarters': {
      // Bunks need portholes, not a view: two rows of small ones either side of a dark band.
      group.add(cylinderAlong(r * 1.005, 1.6, shared.dark, [mid, 0, 0], [1, 0, 0], 40));
      windowRing(mid - 0.4, 16, 0.32, 0.32);
      windowRing(mid + 0.4, 16, 0.32, 0.32);
      break;
    }
    case 'galley': {
      group.add(cylinderAlong(r * 1.005, 0.9, shared.dark, [mid, 0, 0], [1, 0, 0], 40));
      windowRing(mid, 8, 0.55, 0.5, 0, 0);
      // The extractor: a stack with a hood on top, and a filter box beside it.
      group.add(cylinderAlong(0.22, 0.9, shared.slate, [mid - 0.5, r + 0.4, 0], [0, 1, 0], 12));
      group.add(cylinderAlong(0.36, 0.12, shared.hull, [mid - 0.5, r + 0.88, 0], [0, 1, 0], 14));
      group.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.6), surf().foil, [mid + 0.5, r + 0.15, 0.4]));
      break;
    }
    case 'lounge': {
      // A panoramic band: fewer, much larger panes with slim mullions between them.
      group.add(cylinderAlong(r * 1.005, 1.9, shared.dark, [mid, 0, 0], [1, 0, 0], 40));
      windowRing(mid, 10, 1.6, 1.05);
      break;
    }
    default: {
      group.add(cylinderAlong(r * 1.005, 1.1, shared.dark, [mid, 0, 0], [1, 0, 0], 40));
      windowRing(mid, 12, 0.7, 0.55);
    }
  }
  group.add(handrails(1.7, L - 1.7, r, [Math.PI / 2, -Math.PI / 2], railMaterial));
  const guests = def.kind === 'habitat' || def.kind === 'lounge';
  return guests ? { glowMaterials: [windowMat], windows: rings } : { glowMaterials: [windowMat] };
}

/** Truss out along -Z from the base port, then a T of radiator panels that face the orbit normal (edge-on to the Sun). */
function buildRadiator(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 6;
  const wingL = def.greybox.wingLength ?? 7;
  const wingW = def.greybox.wingWidth ?? 2.2;
  const m = new THREE.Matrix4();
  group.add(openTruss(L, -1, 0.8, shared.slate, shared.hull));
  group.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 0.9), shared.hull, [0, 0, -0.45]));
  // Coolant lines, supply and return, down the truss.
  for (const x of [0.22, -0.22]) group.add(cylinderAlong(0.05, L - 0.8, shared.hull, [x, -0.25, -L / 2 - 0.2], [0, 0, 1], 8));

  // Pump box and manifold at the tip, then two wings of three panels each along ±X.
  group.add(mesh(new THREE.BoxGeometry(1.4, 1.0, 1.0), surf().foil, [0, 0, -L - 0.3]));
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
  group.add(platedAlong(r, L - 0.5, [mid, 0, 0], [1, 0, 0]));
  for (const x of [-0.25, -L + 0.25]) group.add(cylinderAlong(r * 0.9, 0.5, shared.slate, [x, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.3, shared.stripe, [mid + 0.7, 0, 0], [1, 0, 0], 32));
  group.add(handrails(-L + 0.7, -0.7, r, [-0.5], railMaterial));
  // Vent nozzle and a sample port on top.
  group.add(cylinderAlong(0.12, 0.5, shared.slate, [mid - 1.0, r + 0.2, -0.5], [0, 1, 0], 10));
  group.add(mesh(new THREE.BoxGeometry(0.45, 0.2, 0.35), shared.dark, [mid + 0.4, r + 0.05, -0.6]));
  // O2 spheres either side, a water tank underneath.
  const sphere = new THREE.SphereGeometry(0.62, 20, 14);
  for (const z of [1, -1]) {
    group.add(mesh(sphere, shared.hull, [mid - 0.6, 0.35, z * (r + 0.45)]));
    group.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.6), shared.slate, [mid - 0.6, 0.35, z * (r + 0.05)]));
  }
  group.add(cylinderAlong(0.55, 2.6, surf().foil, [mid, -r - 0.35, 0], [1, 0, 0], 20));
  for (const x of [mid - 0.9, mid + 0.9]) {
    const band = mesh(new THREE.TorusGeometry(0.57, 0.04, 6, 20), shared.slate, [x, -r - 0.35, 0]);
    band.rotation.y = Math.PI / 2;
    group.add(band);
  }
  group.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), shared.slate, [mid, -r - 0.05, 0]));
  return {};
}

/** A research can running aft along -X: lit rack windows on -Z, an exposed payload platform on +Z, antenna and sensor boom. */
/** A short pressurised junction: a hull along +X from the mount, with docking collars on the fore, zenith and nadir faces. */
function buildNode(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 3;
  const r = def.greybox.radius ?? 1.3;
  const mid = L / 2;
  group.add(platedAlong(r, L - 0.4, [mid, 0, 0], [1, 0, 0], 28));
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

/** A short collar off the aft port, then a six-sided frustum of windows that glows while the cupola is lit. */
function buildCupola(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 2.4;
  const r = def.greybox.radius ?? 1.5;
  const collar = 0.9;
  group.add(platedAlong(r, collar, [collar / 2, 0, 0], [1, 0, 0], 28));
  // Shutter petals folded back round the windows.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const sh = mesh(new THREE.BoxGeometry(0.6, 0.05, r * 0.7), shared.hull, [collar + 0.15, Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02]);
    sh.rotation.x = a;
    group.add(sh);
  }
  group.add(cylinderAlong(r * 1.015, 0.22, shared.stripe, [collar * 0.55, 0, 0], [1, 0, 0], 28));
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x2a2620,
    emissive: COLORS.window,
    emissiveIntensity: 1.4,
    roughness: 0.15,
  });
  const glass = new THREE.CylinderGeometry(r * 0.55, r * 0.92, L - collar, 6);
  const dome = mesh(glass, windowMat, [collar + (L - collar) / 2, 0, 0]);
  dome.quaternion.setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0));
  group.add(dome);
  // Window frames: the frustum's edges in slate.
  const frames = new THREE.LineSegments(new THREE.EdgesGeometry(glass), new THREE.LineBasicMaterial({ color: COLORS.slate }));
  frames.position.copy(dome.position);
  frames.quaternion.copy(dome.quaternion);
  frames.scale.setScalar(1.01);
  group.add(frames);
  return { glowMaterials: [windowMat] };
}

function buildLab(def: ModuleDef, group: THREE.Group): Partial<ModuleModel> {
  const L = def.greybox.length ?? 6.5;
  const r = def.greybox.radius ?? 1.6;
  const mid = -L / 2;
  group.add(platedAlong(r, L - 0.5, [mid, 0, 0], [1, 0, 0]));
  for (const x of [-0.25, -L + 0.25]) group.add(cylinderAlong(r * 0.9, 0.5, shared.slate, [x, 0, 0], [1, 0, 0], 32));
  group.add(cylinderAlong(r * 1.015, 0.3, shared.stripe, [-1.1, 0, 0], [1, 0, 0], 32));
  group.add(handrails(-L + 0.8, -0.8, r, [0.6, Math.PI - 0.6], railMaterial));
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
  cupola: buildCupola,
};

function addStatusLight(group: THREE.Object3D, at: Vec3): THREE.Object3D {
  const anchor = new THREE.Object3D();
  anchor.name = 'status_light';
  anchor.position.set(at[0], at[1], at[2]);
  group.add(anchor);
  return anchor;
}

/**
 * Bake every plain mesh under `parent` into one mesh per material, so a module costs a handful of draw calls
 * rather than dozens. Instanced meshes, lines and anything under `keep` (the solar gimbal, which turns) are left
 * as they are.
 */
function mergeStatic(parent: THREE.Object3D, keep: THREE.Object3D | null): void {
  parent.updateMatrixWorld(true);
  const toLocal = parent.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];
  const under = (o: THREE.Object3D, a: THREE.Object3D | null): boolean => {
    for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n === a) return true;
    return false;
  };
  parent.traverse((o) => {
    if (o === parent || !(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
    if (keep && under(o, keep)) return;
    const g = o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.index) return;
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld));
    const list = buckets.get(o.material) ?? [];
    list.push(g);
    buckets.set(o.material, list);
    merged.push(o);
  });
  const results: THREE.Mesh[] = [];
  for (const [mat, geos] of buckets) {
    if (geos.length < 2) continue;
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    results.push(new THREE.Mesh(geo, mat));
  }
  const done = new Set(results.map((r) => r.material as THREE.Material));
  for (const o of merged) if (done.has(o.material as THREE.Material)) o.removeFromParent();
  for (const r of results) parent.add(r);
}

export function buildGreybox(def: ModuleDef): ModuleModel {
  const group = new THREE.Group();
  group.name = `greybox:${def.id}`;
  const builder = BUILDERS[def.greybox.shape];
  const extra = builder ? builder(def, group) : {};
  if (!builder) group.add(mesh(new THREE.BoxGeometry(2, 2, 2), shared.hull)); // Unknown shape: a crate.
  addPortCollars(group, def);
  mergeStatic(group, extra.gimbal ?? null);
  if (extra.gimbal) mergeStatic(extra.gimbal, null);
  const model: ModuleModel = {
    root: group,
    statusLight: addStatusLight(group, def.greybox.light),
    glowMaterials: extra.glowMaterials ?? [],
  };
  if (extra.gimbal) model.gimbal = extra.gimbal;
  if (extra.windows) model.windows = extra.windows;
  return model;
}

/** One parsed .glb, ready to be cloned for each module that uses it. */
interface Template {
  scene: THREE.Object3D;
  /** Rings of window panes lit by occupancy: one pane's geometry and where each pane goes, in lighting order. */
  rings: { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[] }[];
  lib: StationMaterials;
}

/**
 * Turn a loaded glTF scene into a template: library materials in place of the file's own (matched by name), and
 * the `win_<ring>_<slot>` pane nodes gathered into rings and taken out of the scene.
 */
function makeTemplate(scene: THREE.Object3D, lib: StationMaterials): Template {
  const panes = new Map<string, { slot: number; slots: number; mesh: THREE.Mesh }[]>();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const name = Array.isArray(o.material) ? '' : (o.material as THREE.Material).name;
    const pane = windowNode(o.name);
    if (pane) {
      const list = panes.get(pane.ring) ?? [];
      const slots = (o.userData as { slots?: unknown }).slots;
      list.push({ slot: pane.slot, slots: typeof slots === 'number' ? slots : 0, mesh: o });
      panes.set(pane.ring, list);
    } else if (name === 'window') {
      o.material = lib.window;
    } else if (name in lib.byName) {
      o.material = lib.byName[name as keyof StationMaterials['byName']];
    }
  });
  const rings: Template['rings'] = [];
  for (const list of panes.values()) {
    const bySlot = new Map(list.map((p) => [p.slot, p]));
    const count = Math.max(list[0]!.slots, ...list.map((p) => p.slot + 1));
    const order = paneOrder([...bySlot.keys()].sort((a, b) => a - b), count);
    rings.push({ geometry: list[0]!.mesh.geometry, matrices: order.map((slot) => bySlot.get(slot)!.mesh.matrixWorld.clone()) });
    for (const p of list) p.mesh.removeFromParent();
  }
  return { scene, rings, lib };
}

/** A module's own copy of a template: shared geometry and hull materials, its own window glass. */
function instantiate(t: Template, def: ModuleDef): ModuleModel {
  const root = t.scene.clone(true);
  root.name = `model:${def.id}`;
  const glass = t.lib.window.clone();
  let glows = t.rings.length > 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === t.lib.window) {
      o.material = glass;
      glows = true;
    }
  });
  const windows = t.rings.map((ring) => {
    const inst = new THREE.InstancedMesh(ring.geometry, glass, ring.matrices.length);
    ring.matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    root.add(inst);
    return inst;
  });
  const model: ModuleModel = {
    root,
    statusLight: root.getObjectByName('status_light') ?? addStatusLight(root, def.greybox.light),
    glowMaterials: glows ? [glass] : [],
  };
  const gimbal = root.getObjectByName('gimbal');
  if (gimbal) model.gimbal = gimbal;
  if (windows.length) model.windows = windows;
  return model;
}

/** Loads .glb models when a module names one; falls back to grey-box. */
export class ModuleModelLoader implements ModuleModelSource {
  private gltfLoader: Promise<{ loadAsync(url: string): Promise<{ scene: THREE.Group }> }> | null = null;
  /** Each file is fetched and parsed once; every module of that type is a clone. */
  private readonly templates = new Map<string, Promise<Template | null>>();

  async load(def: ModuleDef): Promise<ModuleModel> {
    if (!def.model) return buildGreybox(def);
    let template = this.templates.get(def.model);
    if (!template) {
      template = this.fetch(def.model);
      this.templates.set(def.model, template);
    }
    const t = await template;
    return t ? instantiate(t, def) : buildGreybox(def);
  }

  private async fetch(path: string): Promise<Template | null> {
    try {
      // Only pull in the glTF loader once a module actually uses a model.
      this.gltfLoader ??= import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader());
      const [gltf, lib] = await Promise.all([(await this.gltfLoader).loadAsync(`${import.meta.env.BASE_URL}${path}`), stationMaterials()]);
      return makeTemplate(gltf.scene, lib);
    } catch (err) {
      console.warn(`Could not load ${path}; using grey-box instead.`, err);
      return null;
    }
  }
}
